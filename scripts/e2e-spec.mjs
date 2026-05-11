// e2e-spec.mjs — 仕様駆動 e2e テスト（Spec-driven E2E）
//
// このファイルは docs/USER_SPEC.md のみを唯一の真実として書かれており、
// popup.js / popup.html / popup.css / background.js / lib/expense-utils.js は一切 Read していない。
//
// 設計方針:
//   - DOM 探索はユーザーが画面で見るラベル（ボタンテキスト・select の option 文言・input type）から行う。
//   - 実装由来の ID（#btn-save 等）には依存しない。表示文言が変わるリリースなら spec も変わるべき。
//   - 各テストは独立で、開始時に chrome.storage.local を clear する。
//
// 各テスト名の冒頭に USER_SPEC.md のセクション参照を付けてある。
//
// 実行（WSL2 + xvfb）:
//   wsl -u root -d Ubuntu -- bash -lc '
//     rsync -a --exclude=node_modules --exclude="*.zip" --exclude=_zip_tmp \
//       --exclude=screenshots --exclude=screenshots-spec \
//       "/mnt/c/Users/dgfuj/Documents/Chrome拡張機能/13.adjuster-expense-logger/" /root/ael/
//     cd /root/ael
//     [ -d node_modules ] || npm install --silent
//     xvfb-run --auto-servernum node scripts/e2e-spec.mjs
//   '
//
// 出力:
//   screenshots-spec/NN-spec-XX-name.png
//   screenshots-spec/downloads/        ← CSV/PDF/JSON ダウンロード受信先

import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = mkdtempSync(join(tmpdir(), 'ael-spec-'));

const shotDir = join(root, 'screenshots-spec');
const dlDir = join(shotDir, 'downloads');
if (existsSync(shotDir)) rmSync(shotDir, { recursive: true, force: true });
mkdirSync(shotDir, { recursive: true });
mkdirSync(dlDir, { recursive: true });

// ---------------- minimal runner ----------------
let shotCount = 0;
async function snap(page, label) {
  shotCount++;
  const num = String(shotCount).padStart(2, '0');
  const safe = label.replace(/[^a-z0-9.]+/gi, '-').toLowerCase();
  try { await page.screenshot({ path: join(shotDir, `${num}-${safe}.png`), fullPage: false }); }
  catch (_) {}
}

const results = [];
async function spec(id, title, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    results.push({ id, title, ok: true, ms });
    console.log(`  PASS  §${id}  ${title}  (${ms}ms)`);
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ id, title, ok: false, ms, error: e.message });
    console.log(`  FAIL  §${id}  ${title}  (${ms}ms)`);
    console.log(`        → ${e.message}`);
  }
}

function assert(c, m) { if (!c) throw new Error(m); }
function assertEq(a, b, m) { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ---------------- DOM helpers（ラベルベース）----------------
//
// 重要: 本実装の Add form の input は <label> で囲まれていない (aria-label/placeholder のみ)。
// 一方 modal 内 input は <label>テキスト <input></label> 構造。さらに modal は .hidden
// クラスで親要素を display:none にして閉じている状態のことがある。getComputedStyle は
// 親の display:none を子の computed style に反映しないため、子だけ見ると "visible" 扱いに
// なってしまう。よって helper では offsetParent !== null による真の可視性判定を使う。

// 要素が「ユーザーから見えて操作可能」かを判定。display:none / visibility:hidden / 親が
// display:none のいずれにも該当しないこと。
function isVisibleScript() {
  return `(el => {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    // offsetParent === null は親が display:none の典型シグナル (position:fixed の場合は別途要素自体を信用)
    if (el.offsetParent === null && cs.position !== 'fixed') return false;
    return true;
  })`;
}

// 表示テキストでボタンを探してクリック。可視要素のみを対象にする。
async function clickByText(page, text, opts = {}) {
  const { tag = 'button,a,[role="button"]', exact = false } = opts;
  const ok = await page.evaluate((sel, t, exactMatch, isVisSrc) => {
    const isVis = eval(isVisSrc);
    const els = Array.from(document.querySelectorAll(sel));
    const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const target = normalize(t);
    let found = null;
    for (const el of els) {
      const label = normalize(el.textContent) || normalize(el.getAttribute('aria-label')) || normalize(el.title);
      if (!label) continue;
      if (exactMatch ? label === target : label.includes(target)) {
        if (!isVis(el)) continue;
        found = el; break;
      }
    }
    if (!found) return false;
    found.scrollIntoView({ block: 'center' });
    found.click();
    return true;
  }, tag, text, exact, isVisibleScript());
  if (!ok) throw new Error(`No clickable element with text "${text}"`);
}

// input/select を「ラベル/aria-label/placeholder/name」から探して値をセットする。
// 必ず可視要素 (modal や form の閉じた要素を除く) のみを対象にする。
async function setFieldByLabel(page, labelText, value, opts = {}) {
  const { fieldKind = 'auto' } = opts;
  const done = await page.evaluate((label, val, kind, isVisSrc) => {
    const isVis = eval(isVisSrc);
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const target = norm(label);
    let el = null;

    // 戦略1: <label for> または <label> 包含構造で、かつ可視な input を探す
    const labels = Array.from(document.querySelectorAll('label'));
    for (const l of labels) {
      if (!norm(l.textContent).includes(target)) continue;
      if (!isVis(l)) continue; // modal が閉じていれば label も非表示
      const forId = l.getAttribute('for');
      let cand = null;
      if (forId) cand = document.getElementById(forId);
      if (!cand) cand = l.querySelector('input,select,textarea');
      if (cand && isVis(cand)) { el = cand; break; }
    }

    // 戦略2: aria-label / placeholder / name / title から可視 input を探す
    if (!el) {
      const candidates = Array.from(document.querySelectorAll('input,select,textarea'));
      for (const c of candidates) {
        if (!isVis(c)) continue;
        const aria = norm(c.getAttribute('aria-label'));
        const ph = norm(c.getAttribute('placeholder'));
        const nm = norm(c.getAttribute('name'));
        const ttl = norm(c.title);
        if (aria.includes(target) || ph.includes(target) || nm.includes(target) || ttl.includes(target)) {
          el = c; break;
        }
      }
    }

    // 戦略3: type 推定 (date / number) でラベル名と一致しなくても拾う
    if (!el && target === 'date') {
      const candidates = Array.from(document.querySelectorAll('input[type=date]'));
      for (const c of candidates) {
        if (isVis(c)) { el = c; break; }
      }
    }

    if (!el) return { ok: false, reason: 'not-found' };
    if (el.tagName === 'SELECT') {
      const want = norm(val);
      const opt = Array.from(el.options).find(o => norm(o.textContent) === want || norm(o.value) === want);
      if (!opt) return { ok: false, reason: `option "${val}" not found in [${Array.from(el.options).map(o=>o.textContent).join('|')}]` };
      el.value = opt.value;
    } else {
      el.value = String(val);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, tag: el.tagName.toLowerCase(), value: el.value };
  }, labelText, value, fieldKind, isVisibleScript());
  if (!done.ok) throw new Error(`setFieldByLabel("${labelText}", ${JSON.stringify(value)}): ${done.reason}`);
  return done;
}

// 「画面上にそのテキストが存在するか」を判定する。
// innerText だけでなく、可視 input の placeholder / aria-label / title も探索する。
// (本実装の Add form は label を使わず placeholder + aria-label でフィールドを露出している)
async function pageHasText(page, text) {
  return page.evaluate((t, isVisSrc) => {
    const isVis = eval(isVisSrc);
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const target = norm(t);
    if (!target) return true;
    if (norm(document.body.innerText).includes(target)) return true;
    // 可視 input/select の placeholder / aria-label / title / name を見る
    const ctrls = Array.from(document.querySelectorAll('input,select,textarea'));
    for (const c of ctrls) {
      if (!isVis(c)) continue;
      const blob = [
        c.getAttribute('placeholder'),
        c.getAttribute('aria-label'),
        c.title,
        c.name,
      ].map((x) => norm(x)).join(' ');
      if (blob.includes(target)) return true;
    }
    return false;
  }, text, isVisibleScript());
}

async function getVisibleText(page) {
  return page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim());
}

// 画面上で見えている Save/Cancel ボタン両方が存在するかの真偽を返す JS スニペット
// (modal が閉じている場合の Save/Cancel をカウントしないため isVisible 判定を使う)
const formOpenScript = () => `(() => {
  const isVis = ${isVisibleScript()};
  const btns = Array.from(document.querySelectorAll('button,a,[role="button"]')).filter(isVis);
  const labels = btns.map(b => (b.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase());
  return labels.includes('save') && labels.includes('cancel');
})()`;

// 「+ Add expense」ボタン展開 → フォーム要素出現待ち (可視 Save+Cancel の出現で判定)
async function openAddForm(page) {
  await clickByText(page, '+ Add expense');
  await page.waitForFunction(formOpenScript(), { timeout: 4000 });
}

// Mileage 入力欄が可視化されるのを待つ (category=Mileage の change イベント後)
async function waitForMilesVisible(page, ms = 2000) {
  return page.waitForFunction((isVisSrc) => {
    const isVis = eval(isVisSrc);
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.some(i => {
      const aria = (i.getAttribute('aria-label') || '').toLowerCase();
      const ph = (i.getAttribute('placeholder') || '').toLowerCase();
      return (aria.includes('mile') || ph.includes('mile')) && isVis(i);
    });
  }, { timeout: ms }, isVisibleScript()).catch(() => false);
}

// 1件分の入力→ Save。USER_SPEC §"Adding an expense" のフィールドに準拠。
async function addExpense(page, { date, category, amount, claim, memo, miles } = {}) {
  await openAddForm(page);
  if (date != null) await setFieldByLabel(page, 'date', date);
  if (category != null) {
    await setFieldByLabel(page, 'category', category);
    if (String(category).toLowerCase() === 'mileage') await waitForMilesVisible(page);
  }
  if (amount != null) await setFieldByLabel(page, 'amount', amount);
  if (claim != null) await setFieldByLabel(page, 'claim', claim);
  if (memo != null) await setFieldByLabel(page, 'memo', memo);
  if (miles != null) await setFieldByLabel(page, 'miles', miles);
  await clickByText(page, 'save', { exact: true });
  // 保存完了の検出: 可視な Save+Cancel ペアが消える
  await page.waitForFunction(`!(${formOpenScript()})`, { timeout: 4000 }).catch(() => {});
}

async function launchPage(browser, extensionId) {
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log(`    [pageerror] ${err.message}`));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
  await page.reload();
  // 何かしらのコンテンツが出るまで少し待つ
  await page.waitForFunction(() => document.body && document.body.innerText && document.body.innerText.length > 0, { timeout: 5000 });
  return page;
}

async function configureDownloads(page) {
  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dlDir,
  });
  return client;
}

// 一覧の行数を「× 削除ボタン」の個数で間接的に数える。
// 行は "left/middle/right" 構造で、× 削除ボタンが各行に必ずある（USER_SPEC §"The expense list"）。
// ただし cross-promo / モーダル close など、リスト外の × は除外したいので
// 「画面上に見える × ボタンのうち、aria-label='Delete' または title='Delete' のもの」を数える。
// (USER_SPEC §"The expense list": delete button (×))
async function countExpenseRows(page) {
  return page.evaluate((isVisSrc) => {
    const isVis = eval(isVisSrc);
    const btns = Array.from(document.querySelectorAll('button,a,[role="button"]'));
    return btns.filter(b => {
      const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^[×✕xX]$/.test(txt)) return false;
      if (!isVis(b)) return false;
      // delete アクションを示すラベル/title が付いた × のみカウント (cross-promo の close を除外)
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const ttl = (b.title || '').toLowerCase();
      return aria.includes('delete') || ttl.includes('delete');
    }).length;
  }, isVisibleScript());
}

// 一覧の合計金額（$1,234.50 のような表記）を totals bar から抽出
async function readTotalsAmount(page) {
  return page.evaluate(() => {
    const text = (document.body.innerText || '');
    // 先頭から最初に出現する "$<数値>" を totals とみなす（spec: totals bar が上部にあり、empty/header より下、list より上）
    const m = text.match(/\$[\d,]+(?:\.\d{1,2})?/);
    return m ? m[0] : null;
  });
}

async function readEntryCountText(page) {
  return page.evaluate(() => {
    const text = (document.body.innerText || '');
    // "1 entry" または "N entries" を抽出（spec §"Totals"）
    const m = text.match(/(\d+)\s+entr(?:y|ies)/i);
    return m ? { n: parseInt(m[1], 10), raw: m[0] } : null;
  });
}

// ---------------- ブラウザ起動 ----------------
console.log('\n=== Spec-driven E2E for Adjuster Expense Logger (USER_SPEC.md) ===\n');

const isLinux = process.platform === 'linux';
const headless = isLinux || process.env.E2E_HEADLESS === '1';

const browser = await puppeteer.launch({
  headless,
  userDataDir,
  protocolTimeout: 60000,
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ],
  defaultViewport: { width: 480, height: 720 },
});

// extension id
let extensionId;
const sw = await browser.waitForTarget(t => t.type() === 'service_worker', { timeout: 10000 }).catch(() => null);
if (sw) extensionId = sw.url().split('/')[2];
else {
  for (const t of browser.targets()) {
    if (t.url().startsWith('chrome-extension://')) { extensionId = t.url().split('/')[2]; break; }
  }
}
if (!extensionId) {
  console.error('FATAL: extension id not found');
  await browser.close();
  process.exit(1);
}
console.log(`Extension ID: ${extensionId}\n`);

// ====================================================================
// SPEC-01  §"Deployment information": 初期は "No deployment set"
// ====================================================================
await spec('01', 'Initial state shows "No deployment set"', async () => {
  const page = await launchPage(browser, extensionId);
  await snap(page, 'spec-01-initial');
  const ok = await pageHasText(page, 'No deployment set');
  assert(ok, 'popup should display "No deployment set" on first launch (USER_SPEC §Deployment information)');
  await page.close();
});

// ====================================================================
// SPEC-02  §"Deployment information": Edit → 保存 → ヘッダがイベント名+期間で更新
// ====================================================================
await spec('02', 'Deployment Edit saves adjuster/event/dates, header updates', async () => {
  const page = await launchPage(browser, extensionId);
  await clickByText(page, 'edit');
  // 4 つのフィールドを埋める
  await setFieldByLabel(page, 'adjuster', 'Jane Doe');
  // CAT / Event name を埋める。"CAT" もしくは "event" のいずれかにマッチさせる。
  try { await setFieldByLabel(page, 'event', 'Hurricane Alpha'); }
  catch { await setFieldByLabel(page, 'cat', 'Hurricane Alpha'); }
  await setFieldByLabel(page, 'start', '2026-05-01');
  await setFieldByLabel(page, 'end', '2026-05-15');
  await clickByText(page, 'save', { exact: true });
  // モーダルが閉じてヘッダに反映されるのを待つ
  await page.waitForFunction(() => {
    const t = (document.body.innerText || '').toLowerCase();
    return t.includes('hurricane alpha') && t.includes('2026-05-01') && t.includes('2026-05-15');
  }, { timeout: 4000 });
  await snap(page, 'spec-02-deployment-saved');
  // "No deployment set" は消えているはず
  const stillEmpty = await pageHasText(page, 'No deployment set');
  assert(!stillEmpty, '"No deployment set" should be replaced after Edit save');
  await page.close();
});

// ====================================================================
// SPEC-03  §"Adding an expense": +Add expense → フォーム要素 (date/category/amount/claim/memo)
// ====================================================================
await spec('03', '+ Add expense reveals all spec fields', async () => {
  const page = await launchPage(browser, extensionId);
  await openAddForm(page);
  await snap(page, 'spec-03-form-open');
  // type=date が少なくとも1つあること
  const hasDate = await page.$$eval('input[type=date]', els => els.some(el => {
    const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden';
  }));
  assert(hasDate, 'form must contain a visible date input');
  // category select（USER_SPEC で列挙される 8 種のうち最低 3 つを option に持つ）
  const catOptions = await page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('select'));
    for (const s of sels) {
      const opts = Array.from(s.options).map(o => (o.textContent || '').trim().toLowerCase());
      const required = ['per diem', 'hotel', 'mileage', 'meals', 'parking', 'supplies', 'phone', 'other'];
      const hits = required.filter(r => opts.includes(r)).length;
      if (hits >= 3) return { opts, hits };
    }
    return null;
  });
  assert(catOptions, 'form must contain a Category select with at least 3 of: Per diem, Hotel, Mileage, Meals, Parking, Supplies, Phone, Other');
  // amount (number)
  const hasAmount = await page.$$eval('input', els => els.some(el => /amount/i.test(el.name + ' ' + el.placeholder + ' ' + el.getAttribute('aria-label'))));
  assert(hasAmount || await pageHasText(page, 'amount'), 'form must expose an Amount field');
  // claim
  assert(await pageHasText(page, 'claim'), 'form must expose a Claim # field');
  // memo
  assert(await pageHasText(page, 'memo'), 'form must expose a Memo field');
  await page.close();
});

// ====================================================================
// SPEC-04  §"Adding an expense": Category=Mileage で Miles 欄が出現、他では隠れる
// ====================================================================
await spec('04', 'Miles input appears only when Category=Mileage', async () => {
  const page = await launchPage(browser, extensionId);
  await openAddForm(page);
  // まず Other を選ぶ→Miles が見えないこと
  await setFieldByLabel(page, 'category', 'Other');
  await new Promise(r => setTimeout(r, 150));
  const milesVisibleOther = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cands = Array.from(document.querySelectorAll('input,label'));
    return cands.some(el => {
      const text = norm(el.textContent) + ' ' + norm(el.getAttribute('aria-label')) + ' ' + norm(el.getAttribute('placeholder')) + ' ' + norm(el.name || '');
      if (!/\bmiles\b/.test(text)) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
    });
  });
  assert(!milesVisibleOther, 'Miles input must be hidden when Category != Mileage');
  // 切り替えて Mileage に
  await setFieldByLabel(page, 'category', 'Mileage');
  await new Promise(r => setTimeout(r, 200));
  const milesVisibleMileage = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cands = Array.from(document.querySelectorAll('input,label'));
    return cands.some(el => {
      const text = norm(el.textContent) + ' ' + norm(el.getAttribute('aria-label')) + ' ' + norm(el.getAttribute('placeholder')) + ' ' + norm(el.name || '');
      if (!/\bmiles\b/.test(text)) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
    });
  });
  await snap(page, 'spec-04-miles-toggle');
  assert(milesVisibleMileage, 'Miles input must be visible when Category=Mileage');
  await page.close();
});

// ====================================================================
// SPEC-05  §"Adding an expense" + §"Totals": Save 1件 → list 反映 + totals 更新 + フォーム閉じる
// ====================================================================
await spec('05', 'Saving one expense appends row, updates totals, closes form', async () => {
  const page = await launchPage(browser, extensionId);
  const totalsBefore = await readTotalsAmount(page);
  await addExpense(page, {
    date: '2026-05-10',
    category: 'Hotel',
    amount: '120.00',
    claim: 'CL-100',
    memo: 'Night 1',
  });
  await snap(page, 'spec-05-after-save');
  const rows = await countExpenseRows(page);
  assertEq(rows, 1, 'list should contain exactly 1 row after first save');
  // totals: $120.00（または $0.00 → $120.00 への変化）
  const totalsAfter = await readTotalsAmount(page);
  assert(totalsAfter, 'totals amount string should be present after save');
  // 数値抽出して比較
  const numAfter = parseFloat((totalsAfter || '').replace(/[$,]/g, ''));
  assert(numAfter >= 120, `totals should be >= 120 after adding $120 expense, got ${totalsAfter}`);
  // フォームが閉じていることを Save/Cancel の不在で確認 (可視判定のみ)
  const formStillOpen = await page.evaluate(formOpenScript());
  assert(!formStillOpen, 'form should be closed (no Save+Cancel) after successful save');
  // entry 数表示
  const ec = await readEntryCountText(page);
  if (ec) assertEq(ec.n, 1, 'count text should read "1 entry"');
  await page.close();
});

// ====================================================================
// SPEC-06  §"Adding an expense": Cancel でフォームが閉じて入力破棄
// ====================================================================
await spec('06', 'Cancel closes form and discards input', async () => {
  const page = await launchPage(browser, extensionId);
  await openAddForm(page);
  await setFieldByLabel(page, 'amount', '999.99');
  await setFieldByLabel(page, 'claim', 'WILL-BE-DISCARDED');
  await clickByText(page, 'cancel', { exact: true });
  await page.waitForFunction(`!(${formOpenScript()})`, { timeout: 2000 }).catch(() => {});
  await snap(page, 'spec-06-after-cancel');
  const formStillOpen = await page.evaluate(formOpenScript());
  assert(!formStillOpen, 'Cancel should close the form');
  // 再度開いたとき amount が空であること
  await openAddForm(page);
  const amountVal = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const cand = inputs.find(i => /amount/i.test((i.name||'') + ' ' + (i.placeholder||'') + ' ' + (i.getAttribute('aria-label')||'')));
    return cand ? cand.value : null;
  });
  assert(amountVal === '' || amountVal === null || amountVal === '0',
    `Cancel should discard input; amount on reopen should be empty, got "${amountVal}"`);
  const stillHasClaim = await pageHasText(page, 'WILL-BE-DISCARDED');
  assert(!stillHasClaim, 'discarded claim text should not appear after Cancel');
  await page.close();
});

// ====================================================================
// SPEC-07  §"The expense list": × ボタンで行が消えて totals 更新
// ====================================================================
await spec('07', 'Delete (×) removes row and updates totals', async () => {
  const page = await launchPage(browser, extensionId);
  await addExpense(page, { date: '2026-05-10', category: 'Hotel', amount: '120', claim: 'A', memo: 'a' });
  await addExpense(page, { date: '2026-05-11', category: 'Meals', amount: '30', claim: 'A', memo: 'b' });
  const rowsBefore = await countExpenseRows(page);
  assertEq(rowsBefore, 2, 'should have 2 rows before delete');
  const totalsBeforeRaw = await readTotalsAmount(page);
  // 1 件削除
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button,a,[role="button"]'));
    const x = btns.find(b => /^\s*[×✕xX]\s*$/.test(b.textContent || ''));
    if (x) x.click();
  });
  // 確認モーダルがあるかもしれない → "yes/delete/confirm/ok" を試す
  await new Promise(r => setTimeout(r, 250));
  const confirmText = await getVisibleText(page);
  if (/are you sure|confirm|delete\?/i.test(confirmText)) {
    try { await clickByText(page, 'delete'); }
    catch { try { await clickByText(page, 'yes'); } catch { await clickByText(page, 'ok'); } }
    await new Promise(r => setTimeout(r, 250));
  }
  await snap(page, 'spec-07-after-delete');
  const rowsAfter = await countExpenseRows(page);
  assertEq(rowsAfter, 1, 'should have 1 row after deleting one');
  const totalsAfterRaw = await readTotalsAmount(page);
  const beforeNum = parseFloat((totalsBeforeRaw || '0').replace(/[$,]/g, ''));
  const afterNum = parseFloat((totalsAfterRaw || '0').replace(/[$,]/g, ''));
  assert(afterNum < beforeNum, `totals should decrease after delete: before=${totalsBeforeRaw} after=${totalsAfterRaw}`);
  await page.close();
});

// ====================================================================
// SPEC-08  §"Filter": Apply で list/totals が絞られ、Clear で全件表示
// ====================================================================
await spec('08', 'Filter by claim# narrows list and totals; Clear restores all', async () => {
  const page = await launchPage(browser, extensionId);
  await addExpense(page, { date: '2026-05-10', category: 'Hotel', amount: '100', claim: 'AAA-1', memo: 'h' });
  await addExpense(page, { date: '2026-05-11', category: 'Meals', amount: '40', claim: 'BBB-2', memo: 'm' });
  await addExpense(page, { date: '2026-05-12', category: 'Parking', amount: '10', claim: 'AAA-1', memo: 'p' });
  const before = await countExpenseRows(page);
  assertEq(before, 3, 'baseline should have 3 rows');
  // Filter open
  await clickByText(page, 'filter');
  await new Promise(r => setTimeout(r, 200));
  // Claim # フィールドに "AAA-1" を入れる
  await setFieldByLabel(page, 'claim', 'AAA-1');
  await clickByText(page, 'apply');
  await new Promise(r => setTimeout(r, 300));
  await snap(page, 'spec-08-filtered');
  const filteredRows = await countExpenseRows(page);
  assertEq(filteredRows, 2, 'filtered rows should be 2 (AAA-1 x2)');
  const filteredTotals = await readTotalsAmount(page);
  const filteredNum = parseFloat((filteredTotals || '0').replace(/[$,]/g, ''));
  assertEq(filteredNum, 110, 'filtered totals should be $110 (100+10)');
  // Clear (Clear ボタンは Filter modal 内なので、再度モーダルを開いてから押す)
  await clickByText(page, 'filter');
  await new Promise(r => setTimeout(r, 200));
  await clickByText(page, 'clear');
  await new Promise(r => setTimeout(r, 300));
  const afterClear = await countExpenseRows(page);
  assertEq(afterClear, 3, 'after Clear all 3 rows must be visible');
  await page.close();
});

// ====================================================================
// SPEC-09  §"Filter": Claim # matching is case-insensitive
// ====================================================================
await spec('09', 'Filter claim# matching is case-insensitive', async () => {
  const page = await launchPage(browser, extensionId);
  await addExpense(page, { date: '2026-05-10', category: 'Hotel', amount: '100', claim: 'abc-9', memo: 'lower' });
  await addExpense(page, { date: '2026-05-11', category: 'Meals', amount: '50', claim: 'XYZ', memo: 'other' });
  await clickByText(page, 'filter');
  await new Promise(r => setTimeout(r, 200));
  // 大文字で検索しても小文字エントリにヒットすべし
  await setFieldByLabel(page, 'claim', 'ABC-9');
  await clickByText(page, 'apply');
  await new Promise(r => setTimeout(r, 300));
  await snap(page, 'spec-09-case-insensitive');
  const rows = await countExpenseRows(page);
  assertEq(rows, 1, 'case-insensitive filter should match the lowercase claim "abc-9" with query "ABC-9"');
  await page.close();
});

// ====================================================================
// SPEC-10  §"Mileage amount auto-calc": Amount 空 + Miles=100 → $72.50 (IRS rate 0.725)
// ====================================================================
await spec('10', 'Mileage auto-calc: Amount empty + Miles=100 stores $72.50', async () => {
  const page = await launchPage(browser, extensionId);
  await openAddForm(page);
  await setFieldByLabel(page, 'category', 'Mileage');
  await new Promise(r => setTimeout(r, 200));
  // Amount は空のまま、Miles=100
  await setFieldByLabel(page, 'miles', '100');
  await setFieldByLabel(page, 'claim', 'MIL-1');
  await clickByText(page, 'save', { exact: true });
  await new Promise(r => setTimeout(r, 500));
  await snap(page, 'spec-10-auto-calc');
  // totals に $72.50 が出る（USER_SPEC: default IRS rate 0.725 × 100 = 72.5）
  const totals = await readTotalsAmount(page);
  const num = parseFloat((totals || '0').replace(/[$,]/g, ''));
  assert(Math.abs(num - 72.5) < 0.01,
    `Mileage auto-calc should yield $72.50 for 100 miles at default rate 0.725, got totals="${totals}" (${num})`);
  // ストレージにも 72.5 が永続化されている
  const stored = await page.evaluate(() => new Promise(r => chrome.storage.local.get(null, r)));
  const flat = JSON.stringify(stored);
  assert(/72\.5/.test(flat),
    `stored expense should contain amount 72.5 (auto-calculated). storage flatten=${flat.substring(0, 400)}`);
  await page.close();
});

// ====================================================================
// SPEC-11  §"Free plan limit": 30 件保存後の 31 件目で Upgrade Modal、保存ブロック
// ====================================================================
await spec('11', 'Free cap: 31st Save opens Upgrade Modal and is not stored', async () => {
  const page = await launchPage(browser, extensionId);
  // 30 件を chrome.storage に直接注入できればテストが速いが、Read 禁止のためスキーマ不明。
  // → UI からの 30 件追加は時間がかかる。代替策: 30 件分のエントリを「複数候補スキーマ」で書き込み、
  //    UI に反映されるかリロードして確認。反映されなければ UI 経由で詰める。
  const seeded = await page.evaluate((n) => new Promise(r => {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        id: 'seed-' + i,
        date: '2026-05-10',
        category: 'Hotel',
        amount: 50,
        claim: 'SEED-' + i,
        memo: 's',
        miles: 0,
        createdAt: Date.now() + i,
        updatedAt: Date.now() + i,
      });
    }
    // 推測スキーマ候補を一括書き
    const obj = { expenses: arr, entries: arr, items: arr, records: arr };
    chrome.storage.local.set(obj, () => r(true));
  }), 30);
  await page.reload();
  await new Promise(r => setTimeout(r, 800));

  let rows = await countExpenseRows(page);
  if (rows < 30) {
    // 直接注入が効かなかった → UI 経由で残りを追加
    // 既に挿入された行を活かしつつ、最大 30 件になるまで Add する
    const remaining = 30 - rows;
    for (let i = 0; i < remaining; i++) {
      await addExpense(page, {
        date: '2026-05-10',
        category: 'Hotel',
        amount: '50',
        claim: 'UI-' + i,
        memo: 'ui',
      });
    }
    rows = await countExpenseRows(page);
  }
  await snap(page, 'spec-11-30-rows');
  assert(rows >= 30, `should have >=30 rows before 31st attempt, got ${rows}`);

  // 31 件目を試す。Upgrade modal が出るか、もしくは保存がブロックされるか。
  await clickByText(page, '+ Add expense').catch(() => {});
  await new Promise(r => setTimeout(r, 300));

  // Upgrade modal が +Add 押下時点で出る実装か、Save 押下後に出る実装かは未定義 → 両方対応
  let upgradeVisible = await pageHasText(page, 'Unlock Pro');
  if (!upgradeVisible) {
    // フォームが開いた → Save を試す
    try {
      await setFieldByLabel(page, 'category', 'Other');
      await setFieldByLabel(page, 'amount', '1');
      await setFieldByLabel(page, 'claim', 'OVER-31');
      await clickByText(page, 'save', { exact: true });
      await new Promise(r => setTimeout(r, 600));
    } catch (_) { /* form not open */ }
    upgradeVisible = await pageHasText(page, 'Unlock Pro');
  }
  await snap(page, 'spec-11-upgrade-modal');
  assert(upgradeVisible,
    'Upgrade modal "Unlock Pro" must appear when attempting 31st expense on Free plan (USER_SPEC §Free plan limit)');
  // 31 件目は保存されていない
  // モーダル閉じる試み（Maybe later）→ 行数チェック
  try { await clickByText(page, 'maybe later'); } catch (_) {}
  await new Promise(r => setTimeout(r, 300));
  const rowsAfter = await countExpenseRows(page);
  assert(rowsAfter <= 30, `31st entry must not be saved on Free; rows=${rowsAfter}`);
  await page.close();
});

// ====================================================================
// SPEC-12  §"Free / Pro quota indicator": Free のとき "Free · N/30"、N>=30 で赤色
// ====================================================================
await spec('12', 'Footer quota: "Free · N/30" and red at N>=30', async () => {
  const page = await launchPage(browser, extensionId);
  // 1 件のとき
  await addExpense(page, { date: '2026-05-10', category: 'Hotel', amount: '10', claim: 'Q-1', memo: '' });
  await snap(page, 'spec-12-quota-low');
  const lowText = await getVisibleText(page);
  assert(/free\s*[·\-•|]\s*1\s*\/\s*30/i.test(lowText),
    `footer should show "Free · 1/30" when 1 expense saved. Visible: ${lowText.substring(0, 300)}`);
  // 30 件まで埋める（直接注入を試してから UI フォールバック）
  await page.evaluate(() => new Promise(r => {
    const arr = [];
    for (let i = 0; i < 30; i++) {
      arr.push({ id: 'q-' + i, date: '2026-05-10', category: 'Hotel', amount: 10, claim: 'Q-' + i, memo: '', miles: 0, createdAt: Date.now()+i, updatedAt: Date.now()+i });
    }
    chrome.storage.local.set({ expenses: arr, entries: arr, items: arr, records: arr }, () => r(true));
  }));
  await page.reload();
  await new Promise(r => setTimeout(r, 800));
  let rows = await countExpenseRows(page);
  if (rows < 30) {
    const remaining = 30 - rows;
    for (let i = 0; i < remaining; i++) {
      await addExpense(page, { date: '2026-05-10', category: 'Other', amount: '1', claim: 'F-' + i, memo: '' });
    }
  }
  await snap(page, 'spec-12-quota-full');
  const fullText = await getVisibleText(page);
  assert(/free\s*[·\-•|]\s*30\s*\/\s*30/i.test(fullText),
    `footer should show "Free · 30/30" when 30 saved. Visible: ${fullText.substring(0, 400)}`);
  // 赤色判定: フッターの quota テキスト要素の color が赤系（R > G かつ R > B）であること、
  // または "over" / "danger" / "red" 系クラスがついていること
  const isRed = await page.evaluate(() => {
    const txts = Array.from(document.querySelectorAll('*')).filter(el => /free.*30\s*\/\s*30/i.test(el.textContent || '') && el.children.length === 0);
    if (txts.length === 0) return null;
    const el = txts[0];
    const cs = getComputedStyle(el);
    // クラス名から
    const cls = (el.className || '').toString().toLowerCase();
    const cs2 = cs.color.match(/\d+/g);
    const isClassRed = /(over|danger|red|warn|alert)/.test(cls);
    if (!cs2) return { isClassRed, color: cs.color };
    const [r, g, b] = cs2.map(Number);
    return { isClassRed, color: cs.color, isColorRed: r > 150 && r > g + 30 && r > b + 30 };
  });
  assert(isRed && (isRed.isClassRed || isRed.isColorRed),
    `quota text must turn red at 30/30 (class or color). Detected: ${JSON.stringify(isRed)}`);
  await page.close();
});

// ====================================================================
// SPEC-13  §"Settings": IRS rate を 0.67 に変更後、Mileage 自動計算で 0.67 が使われる
// ====================================================================
await spec('13', 'Settings IRS rate override is applied on next mileage calc', async () => {
  const page = await launchPage(browser, extensionId);
  // Settings を開く（gear icon）。aria-label / title / テキストで探す
  const opened = await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('button,a,[role="button"]'));
    const norm = (s) => (s || '').toLowerCase();
    const t = cands.find(c =>
      /settings|gear|⚙|preferences/.test(norm(c.getAttribute('aria-label')) + ' ' + norm(c.title) + ' ' + norm(c.textContent))
    );
    if (!t) return false;
    t.click(); return true;
  });
  assert(opened, 'Settings (gear) trigger should be reachable from header');
  await new Promise(r => setTimeout(r, 300));
  // IRS rate フィールドを 0.67 に
  await setFieldByLabel(page, 'irs', '0.67');
  // Save する。Settings モーダルの保存ボタンは Save / Apply / Done のどれか
  try { await clickByText(page, 'save', { exact: true }); }
  catch { try { await clickByText(page, 'apply'); } catch { await clickByText(page, 'done'); } }
  await new Promise(r => setTimeout(r, 400));
  await snap(page, 'spec-13-settings-saved');
  // 新しい Mileage 経費を追加（100 miles, amount empty）
  await openAddForm(page);
  await setFieldByLabel(page, 'category', 'Mileage');
  await new Promise(r => setTimeout(r, 200));
  await setFieldByLabel(page, 'miles', '100');
  await setFieldByLabel(page, 'claim', 'IRS-1');
  await clickByText(page, 'save', { exact: true });
  await new Promise(r => setTimeout(r, 500));
  const totals = await readTotalsAmount(page);
  const num = parseFloat((totals || '0').replace(/[$,]/g, ''));
  assert(Math.abs(num - 67) < 0.5,
    `With custom IRS rate 0.67, 100 miles must yield $67.00, got totals="${totals}" (${num})`);
  await page.close();
});

// ====================================================================
// SPEC-14  §"Export & Import": Export CSV → ヘッダ行 "date,claim,category,amount,miles,memo"
// ====================================================================
await spec('14', 'CSV export header is "date,claim,category,amount,miles,memo"', async () => {
  const page = await launchPage(browser, extensionId);
  const cdp = await configureDownloads(page);
  await addExpense(page, { date: '2026-05-10', category: 'Hotel', amount: '120', claim: 'CSV-1', memo: 'hi' });

  const before = new Set(readdirSync(dlDir));
  await clickByText(page, 'export csv');
  // 5 秒待ち
  let csvFile = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 100));
    const files = readdirSync(dlDir).filter(f => !before.has(f) && f.toLowerCase().endsWith('.csv'));
    if (files.length > 0) { csvFile = files[0]; break; }
  }
  assert(csvFile, 'CSV file must be downloaded after Export CSV click');
  const text = readFileSync(join(dlDir, csvFile), 'utf-8');
  await snap(page, 'spec-14-csv-export');
  // BOM 除去
  const body = text.replace(/^﻿/, '');
  const firstLine = body.split(/\r?\n/)[0].trim().toLowerCase();
  assertEq(firstLine, 'date,claim,category,amount,miles,memo',
    `CSV header must be exactly "date,claim,category,amount,miles,memo"`);
  // 内容に Hotel と 120 が含まれる
  assert(/hotel/i.test(body) && /120/.test(body),
    `CSV body should contain the saved expense data. Got: ${body.substring(0, 300)}`);
  await page.close();
});

// ====================================================================
// SPEC-15  §"Export & Import": Free で PDF Export 押下 → Upgrade Modal
// ====================================================================
await spec('15', 'Free: Export PDF opens Upgrade modal', async () => {
  const page = await launchPage(browser, extensionId);
  await addExpense(page, { date: '2026-05-10', category: 'Hotel', amount: '50', claim: 'P-1', memo: '' });
  await clickByText(page, 'export pdf');
  await new Promise(r => setTimeout(r, 600));
  await snap(page, 'spec-15-pdf-free');
  const shown = await pageHasText(page, 'Unlock Pro');
  assert(shown, 'Export PDF on Free plan must open the Unlock Pro upgrade modal');
  // 価格 $12.99 もモーダル内に出るはず（USER_SPEC §Pro upgrade）
  const priceShown = await pageHasText(page, '$12.99');
  assert(priceShown, 'Upgrade modal should display the $12.99 price');
  await page.close();
});

// ====================================================================
// SPEC-16  §"Pro upgrade" + §"Free plan limit": Pro 状態で 30 cap が外れる
// ====================================================================
await spec('16', 'Pro state: footer shows "Pro · Unlimited", Free cap does not apply', async () => {
  const page = await launchPage(browser, extensionId);
  // Pro フラグの候補をすべて立てる（実装未参照のため）
  await page.evaluate(() => new Promise(r => {
    chrome.storage.local.set({
      isPaid: true, paid: true, pro: true, isPro: true,
      plan: 'pro', extpay_paid: true,
    }, () => r(true));
  }));
  await page.reload();
  await new Promise(r => setTimeout(r, 600));
  await snap(page, 'spec-16-pro-state');
  const txt = await getVisibleText(page);
  assert(/pro\s*[·\-•|]\s*unlimited/i.test(txt),
    `Pro state should display "Pro · Unlimited" footer. Visible: ${txt.substring(0, 300)}`);
  // 30 cap が無いことの確認: 30 件を流し込んだ後でも +Add expense が Upgrade Modal を呼ばない
  await page.evaluate(() => new Promise(r => {
    const arr = [];
    for (let i = 0; i < 30; i++) {
      arr.push({ id: 'pro-' + i, date: '2026-05-10', category: 'Hotel', amount: 1, claim: 'P-' + i, memo: '', miles: 0, createdAt: Date.now()+i, updatedAt: Date.now()+i });
    }
    chrome.storage.local.set({ expenses: arr, entries: arr, items: arr, records: arr }, () => r(true));
  }));
  await page.reload();
  await new Promise(r => setTimeout(r, 600));
  await clickByText(page, '+ Add expense').catch(() => {});
  await new Promise(r => setTimeout(r, 300));
  const upgrade = await pageHasText(page, 'Unlock Pro');
  assert(!upgrade, 'Pro plan must NOT show Unlock Pro modal even with 30 entries (USER_SPEC §Free plan limit no longer applies)');
  await page.close();
});

// ====================================================================
// SPEC-17  §"Persistence": 1件追加 → リロード → 同じエントリが復元
// ====================================================================
await spec('17', 'Persistence: saved expense survives popup reload', async () => {
  const page = await launchPage(browser, extensionId);
  await addExpense(page, { date: '2026-05-10', category: 'Phone', amount: '37.42', claim: 'PERSIST-1', memo: 'survives' });
  const before = await countExpenseRows(page);
  assertEq(before, 1, '1 row expected before reload');
  await page.reload();
  await page.waitForFunction(() => document.body && document.body.innerText, { timeout: 4000 });
  await new Promise(r => setTimeout(r, 600));
  await snap(page, 'spec-17-after-reload');
  const after = await countExpenseRows(page);
  assertEq(after, 1, 'row count must persist across popup reload');
  // 金額表示も復元されている
  const hasAmt = await pageHasText(page, '37.42');
  assert(hasAmt, 'saved amount $37.42 should be visible after reload');
  const hasClaim = await pageHasText(page, 'PERSIST-1');
  assert(hasClaim, 'saved claim PERSIST-1 should be visible after reload');
  await page.close();
});

// ---------------- 集計 ----------------
await browser.close();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}

const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;

console.log('\n=== Summary ===');
console.log(`Total : ${results.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\n=== Failures ===');
  for (const r of results.filter(r => !r.ok)) {
    console.log(`  SPEC-${r.id} ${r.title}`);
    console.log(`    → ${r.error}`);
  }
}

console.log('\n=== Spec coverage (USER_SPEC.md) ===');
console.log('| id | title | result |');
console.log('| --- | --- | --- |');
for (const r of results) {
  console.log(`| SPEC-${r.id} | ${r.title} | ${r.ok ? 'PASS' : 'FAIL'} |`);
}

process.exit(failed > 0 ? 1 : 0);

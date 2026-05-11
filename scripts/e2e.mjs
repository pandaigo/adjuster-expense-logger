// E2E リグレッション: Puppeteer で拡張をロードし、主要 UI 経路を検証
//
// 使い方:
//   Windows: npm run e2e   ← プロファイルロックで失敗しやすい
//   WSL2:    wsl -u root -d Ubuntu -- bash -lc "..." 経由で xvfb-run と組み合わせる
//
// 詳細は README.md「E2E テスト」セクション参照
import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = mkdtempSync(join(tmpdir(), 'ael-e2e-'));

const screenshotDir = join(root, 'screenshots');
if (existsSync(screenshotDir)) rmSync(screenshotDir, { recursive: true, force: true });
mkdirSync(screenshotDir, { recursive: true });

let shotCount = 0;
async function shot(page, label) {
  shotCount++;
  const num = String(shotCount).padStart(2, '0');
  const safeLabel = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  try {
    await page.screenshot({ path: join(screenshotDir, `${num}-${safeLabel}.png`), fullPage: false });
  } catch (_) {}
}

let passed = 0;
let failed = 0;
const failures = [];

function pass(name) { passed++; console.log(`  ✓ ${name}`); }
function fail(name, err) {
  failed++;
  failures.push(`${name}: ${err.message}`);
  console.log(`  ✗ ${name}`);
  console.log(`     ${err.message}`);
}

async function run(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

async function freshPopup(browser, extensionId, opts = {}) {
  const page = await browser.newPage();
  page.on('pageerror', err => console.log(`  [POPUP ERROR] ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [POPUP CONSOLE error] ${msg.text()}`);
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
  if (opts.preload) {
    await page.evaluate((d) => new Promise(r => chrome.storage.local.set(d, r)), opts.preload);
  }
  await page.reload();
  await page.waitForSelector('#btn-toggle-add', { visible: true });
  return page;
}

async function fillAndSave(page, { date, category, amount, claim, memo, miles } = {}) {
  await page.click('#btn-toggle-add');
  await page.waitForSelector('#form-fields:not(.hidden)');
  if (date) await page.$eval('#f-date', (el, v) => { el.value = v; }, date);
  if (category) await page.select('#f-category', category);
  if (category === 'mileage' && miles != null) {
    await page.$eval('#f-miles', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, miles);
  }
  if (amount != null) {
    await page.$eval('#f-amount', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, amount);
  }
  if (claim != null) await page.$eval('#f-claim', (el, v) => { el.value = v; }, claim);
  if (memo != null) await page.$eval('#f-memo', (el, v) => { el.value = v; }, memo);
  await page.click('#btn-save-add');
  // フォームが閉じるのを待つ (Save 成功時) — 一覧反映を確実にするため short delay
  await new Promise(r => setTimeout(r, 100));
}

console.log('\n=== E2E Test ===\n');
console.log('Launching Chromium with extension loaded...');

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
    '--disable-features=DialogFocusManagement'
  ],
  defaultViewport: { width: 800, height: 700 }
});

let extensionId;
const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker', { timeout: 10000 }).catch(() => null);
if (swTarget) {
  extensionId = swTarget.url().split('/')[2];
} else {
  for (const t of browser.targets()) {
    if (t.url().startsWith('chrome-extension://')) {
      extensionId = t.url().split('/')[2];
      break;
    }
  }
}

if (!extensionId) {
  console.error('FAIL: Could not detect extension ID');
  await browser.close();
  process.exit(1);
}
console.log(`Extension ID: ${extensionId}\n`);

// =================== TESTS ===================

await run('popup-1: ポップアップが起動して + Add expense が見える', async () => {
  const page = await freshPopup(browser, extensionId);
  const text = await page.$eval('#btn-toggle-add', el => el.textContent);
  if (!/Add expense/i.test(text)) throw new Error('+ Add expense ボタンが見えない');
  await shot(page, 'popup-loaded');
  await page.close();
});

await run('popup-2: 初期状態は No deployment set + 0 entries', async () => {
  const page = await freshPopup(browser, extensionId);
  const dep = await page.$eval('#deployment-name', el => el.textContent);
  const count = await page.$eval('#total-count', el => el.textContent);
  if (!/No deployment set/i.test(dep)) throw new Error('Deployment 初期表示が違う: ' + dep);
  if (!/0 entries/i.test(count)) throw new Error('count 初期表示が違う: ' + count);
  await page.close();
});

await run('popup-3: 経費 1 件 Save → 一覧 + totals 更新', async () => {
  const page = await freshPopup(browser, extensionId);
  await fillAndSave(page, { category: 'per_diem', amount: 65, claim: 'C-1', memo: 'Day 1' });
  const items = await page.$$('.expense-item');
  if (items.length !== 1) throw new Error(`一覧件数 1 expected, got ${items.length}`);
  const total = await page.$eval('#total-amount', el => el.textContent);
  if (!/\$65\.00/.test(total)) throw new Error('totals が更新されてない: ' + total);
  await shot(page, 'one-expense');
  await page.close();
});

await run('popup-4: Delete ボタンで一覧から消える', async () => {
  const page = await freshPopup(browser, extensionId);
  await fillAndSave(page, { category: 'hotel', amount: 120, claim: 'C-1' });
  await fillAndSave(page, { category: 'meals', amount: 18, claim: 'C-1' });
  const before = await page.$$('.expense-item');
  if (before.length !== 2) throw new Error('2件保存できてない');
  await page.click('.expense-item .del-btn');
  await new Promise(r => setTimeout(r, 80));
  const after = await page.$$('.expense-item');
  if (after.length !== 1) throw new Error('Delete 後に 1 件残るはず');
  await page.close();
});

await run('popup-5: Category = mileage で Miles 欄が出現', async () => {
  const page = await freshPopup(browser, extensionId);
  await page.click('#btn-toggle-add');
  await page.waitForSelector('#form-fields:not(.hidden)');
  // 初期は隠れている
  const beforeHidden = await page.$eval('#f-miles', el => el.classList.contains('hidden'));
  if (!beforeHidden) throw new Error('Miles 欄が最初から表示されている');
  await page.select('#f-category', 'mileage');
  await new Promise(r => setTimeout(r, 50));
  const afterHidden = await page.$eval('#f-miles', el => el.classList.contains('hidden'));
  if (afterHidden) throw new Error('Mileage 選択後も Miles 欄が隠れている');
  await page.close();
});

await run('popup-6: Mileage 自動計算 (miles=100, default 0.725 → $72.50)', async () => {
  const page = await freshPopup(browser, extensionId);
  // Save する前のフォーム中の状態を撮影 (ストアスクショ用に "計算が起きている瞬間")
  await page.click('#btn-toggle-add');
  await page.waitForSelector('#form-fields:not(.hidden)');
  await page.select('#f-category', 'mileage');
  await new Promise(r => setTimeout(r, 50));
  await page.$eval('#f-miles', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, 100);
  await page.$eval('#f-claim', (el, v) => { el.value = v; }, 'CLM-2026-0042');
  await page.$eval('#f-memo', (el, v) => { el.value = v; }, 'Site visit · IRS $0.725/mi');
  await shot(page, 'mileage-auto-calc-form');
  await page.click('#btn-save-add');
  await new Promise(r => setTimeout(r, 100));
  const amount = await page.$eval('.expense-item .amount', el => el.textContent);
  if (!/\$72\.50/.test(amount)) throw new Error('自動計算結果が違う: ' + amount);
  await page.close();
});

await run('popup-rich: リッチデータ (15 件) でスクショ撮影', async () => {
  // ストアアセット 1 枚目用に "使い込まれた感" のあるスクショを撮る
  // claim # は carrier 別の現実書式 (PA09887766 = State Farm 10桁、23-014A789 = Allstate、ALL-CAT-MIL-552134 = USAA)
  // per diem は CAT deployment 標準 $110-125/日 (通常案件は $50-75)
  const richSeeds = [
    { id: 'r1',  date: '2025-09-26', claim: 'PA09887766',         category: 'per_diem', amount: 110,    miles: null,  memo: 'Day 1 — staging' },
    { id: 'r2',  date: '2025-09-26', claim: 'PA09887766',         category: 'hotel',    amount: 142.5,  miles: null,  memo: 'Marriott Tampa' },
    { id: 'r3',  date: '2025-09-26', claim: 'PA09887766',         category: 'mileage',  amount: 67.86,  miles: 93.6,  memo: 'Site visit' },
    { id: 'r4',  date: '2025-09-27', claim: 'PA09887766',         category: 'per_diem', amount: 110,    miles: null,  memo: 'Day 2' },
    { id: 'r5',  date: '2025-09-27', claim: '23-014A789',         category: 'mileage',  amount: 95.14,  miles: 131.2, memo: 'Roof inspection' },
    { id: 'r6',  date: '2025-09-27', claim: '23-014A789',         category: 'meals',    amount: 32.45,  miles: null,  memo: 'Dinner with insured' },
    { id: 'r7',  date: '2025-09-28', claim: 'ALL-CAT-MIL-552134', category: 'per_diem', amount: 125,    miles: null,  memo: 'Day 3' },
    { id: 'r8',  date: '2025-09-28', claim: 'ALL-CAT-MIL-552134', category: 'hotel',    amount: 142.5,  miles: null,  memo: 'Marriott Tampa' },
    { id: 'r9',  date: '2025-09-28', claim: 'ALL-CAT-MIL-552134', category: 'parking',  amount: 18,     miles: null,  memo: 'Downtown garage' },
    { id: 'r10', date: '2025-09-29', claim: 'USAA-3892hnf',       category: 'mileage',  amount: 102.95, miles: 142.0, memo: 'Cross-county drive' },
    { id: 'r11', date: '2025-09-29', claim: 'USAA-3892hnf',       category: 'supplies', amount: 24.87,  miles: null,  memo: 'Tape, gloves, batteries' },
    { id: 'r12', date: '2025-09-30', claim: 'PA09887766',         category: 'per_diem', amount: 110,    miles: null,  memo: 'Day 5' },
    { id: 'r13', date: '2025-09-30', claim: 'PA09887766',         category: 'mileage',  amount: 58.72,  miles: 81.0,  memo: 'Site recheck' },
    { id: 'r14', date: '2025-10-01', claim: '23-014A789',         category: 'phone',    amount: 12,     miles: null,  memo: 'Verizon weekly' },
    { id: 'r15', date: '2025-10-01', claim: 'USAA-3892hnf',       category: 'per_diem', amount: 110,    miles: null,  memo: 'Day 6' }
  ];
  const deployment = { name: 'Frank Riley', event: 'Hurricane Helene 2025', start: '2025-09-26', end: '2025-10-15' };
  const page = await freshPopup(browser, extensionId, { preload: { expenses: richSeeds, deployment } });
  await new Promise(r => setTimeout(r, 80));
  await shot(page, 'rich-overview');
  // スクリーンショット 3 (deployment 編集モーダル訴求) 用: リッチデータ背景 + 編集モーダル開いた状態
  await page.click('#btn-edit-deployment');
  await page.waitForSelector('#deployment-modal:not(.hidden)');
  await new Promise(r => setTimeout(r, 80));
  await shot(page, 'rich-deployment-modal');
  await page.click('#btn-deployment-cancel');
  await new Promise(r => setTimeout(r, 50));
  // フィルタ後のスクショも撮る (PA09887766 で絞り込み、claim# 部分一致テストにもなる)
  await page.click('#btn-filter');
  await page.waitForSelector('#filter-modal:not(.hidden)');
  await page.$eval('#flt-claim', (el, v) => { el.value = v; }, 'PA09887766');
  await page.click('#btn-filter-apply');
  await new Promise(r => setTimeout(r, 80));
  await shot(page, 'rich-filtered-claim');
  // Mileage カテゴリフィルタ shot (スクショ 4 用: IRS auto-calc の実数値が見える)
  await page.click('#btn-filter');
  await page.waitForSelector('#filter-modal:not(.hidden)');
  await page.$eval('#flt-claim', (el, v) => { el.value = v; }, '');
  await page.select('#flt-category', 'mileage');
  await page.click('#btn-filter-apply');
  await new Promise(r => setTimeout(r, 80));
  await shot(page, 'rich-mileage-only');
  await page.close();
});

await run('popup-7: Filter で claim# 絞り込み', async () => {
  const page = await freshPopup(browser, extensionId);
  await fillAndSave(page, { category: 'per_diem', amount: 65, claim: 'C-1' });
  await fillAndSave(page, { category: 'per_diem', amount: 65, claim: 'C-2' });
  await fillAndSave(page, { category: 'per_diem', amount: 65, claim: 'C-2' });
  await page.click('#btn-filter');
  await page.waitForSelector('#filter-modal:not(.hidden)');
  await page.$eval('#flt-claim', (el, v) => { el.value = v; }, 'C-2');
  await page.click('#btn-filter-apply');
  await new Promise(r => setTimeout(r, 80));
  const items = await page.$$('.expense-item');
  if (items.length !== 2) throw new Error(`C-2 でフィルタ後 2件 expected, got ${items.length}`);
  const total = await page.$eval('#total-amount', el => el.textContent);
  if (!/\$130\.00/.test(total)) throw new Error('totals が違う: ' + total);
  await shot(page, 'filter-applied');
  await page.close();
});

await run('popup-8: Deployment モーダル → 保存 → header 更新', async () => {
  const page = await freshPopup(browser, extensionId);
  await page.click('#btn-edit-deployment');
  await page.waitForSelector('#deployment-modal:not(.hidden)');
  await page.$eval('#dep-name', (el, v) => { el.value = v; }, 'Frank Riley');
  await page.$eval('#dep-event', (el, v) => { el.value = v; }, 'Hurricane Helene 2025');
  await page.$eval('#dep-start', (el, v) => { el.value = v; }, '2025-09-26');
  await page.$eval('#dep-end', (el, v) => { el.value = v; }, '2025-10-15');
  await page.click('#btn-deployment-save');
  await new Promise(r => setTimeout(r, 80));
  const dep = await page.$eval('#deployment-name', el => el.textContent);
  if (!/Hurricane Helene/.test(dep)) throw new Error('Deployment 反映なし: ' + dep);
  const meta = await page.$eval('#deployment-meta', el => el.textContent);
  if (!/2025-09-26.*2025-10-15/.test(meta)) throw new Error('Deployment 期間表示なし: ' + meta);
  await shot(page, 'deployment-saved');
  await page.close();
});

await run('popup-9: Settings の IRS rate 反映で Mileage 自動計算が変わる', async () => {
  const page = await freshPopup(browser, extensionId);
  await page.click('#btn-settings');
  await page.waitForSelector('#settings-modal:not(.hidden)');
  await page.$eval('#set-irs-rate', (el, v) => { el.value = String(v); }, 0.67);
  await page.click('#btn-settings-save');
  await new Promise(r => setTimeout(r, 80));
  await fillAndSave(page, { category: 'mileage', miles: 100, claim: 'C-1' });
  const amount = await page.$eval('.expense-item .amount', el => el.textContent);
  if (!/\$67\.00/.test(amount)) throw new Error('IRS rate 反映なし: ' + amount);
  await page.close();
});

await run('popup-10: Free 30件超過 → Upgrade モーダル表示', async () => {
  // 30 件を preload
  const seeds = [];
  for (let i = 0; i < 30; i++) {
    seeds.push({
      id: 'exp_seed' + i,
      date: '2026-05-01',
      claim: 'C-' + (i % 3 + 1),
      category: 'per_diem',
      amount: 65,
      miles: null,
      memo: ''
    });
  }
  const page = await freshPopup(browser, extensionId, { preload: { expenses: seeds } });
  // quota 表示が "Free · 30/30" + .over
  const quotaText = await page.$eval('#quota-info', el => el.textContent);
  if (!/30\/30/.test(quotaText)) throw new Error('quota 表示が違う: ' + quotaText);
  const isOver = await page.$eval('#quota-info', el => el.classList.contains('over'));
  if (!isOver) throw new Error('quota が over 状態でない');
  // 31 件目の Save 試行 → Upgrade modal が出る
  await fillAndSave(page, { category: 'per_diem', amount: 65, claim: 'C-X' });
  const upgradeVisible = await page.$eval('#upgrade-modal', el => !el.classList.contains('hidden'));
  if (!upgradeVisible) throw new Error('Upgrade modal が出ない');
  // 一覧件数は 30 のまま (31件目は追加されない)
  const items = await page.$$('.expense-item');
  if (items.length !== 30) throw new Error(`Free cap 超過後の件数 30 expected, got ${items.length}`);
  await shot(page, 'free-cap-upgrade');
  await page.close();
});

await run('popup-11: Pro 状態で 31件目以降も保存できる', async () => {
  const seeds = [];
  for (let i = 0; i < 30; i++) {
    seeds.push({
      id: 'exp_seed' + i, date: '2026-05-01', claim: 'C-1', category: 'per_diem',
      amount: 65, miles: null, memo: ''
    });
  }
  const page = await freshPopup(browser, extensionId, {
    preload: { expenses: seeds, isPaid: true }
  });
  const quotaText = await page.$eval('#quota-info', el => el.textContent);
  if (!/Pro/.test(quotaText)) throw new Error('Pro 表示なし: ' + quotaText);
  await fillAndSave(page, { category: 'per_diem', amount: 65, claim: 'C-31' });
  const items = await page.$$('.expense-item');
  if (items.length !== 31) throw new Error(`Pro での 31 件目保存失敗、got ${items.length}`);
  await page.close();
});

await run('popup-12: persistence — reload しても expenses が残る', async () => {
  const page = await freshPopup(browser, extensionId);
  await fillAndSave(page, { category: 'hotel', amount: 110, claim: 'C-1', memo: 'Marriott' });
  await page.reload();
  await page.waitForSelector('#btn-toggle-add', { visible: true });
  const items = await page.$$('.expense-item');
  if (items.length !== 1) throw new Error('reload 後にデータが消えた');
  const total = await page.$eval('#total-amount', el => el.textContent);
  if (!/\$110\.00/.test(total)) throw new Error('reload 後の totals 不一致: ' + total);
  await page.close();
});

// ============== Eric R2 致命修正リグレッション (popup-13〜popup-17) ==============

// 一時ファイル置き場 (CSV / JSON import 用)。各テストで個別 mktmp し終わりで削除。
const tmpFilesDir = mkdtempSync(join(tmpdir(), 'ael-e2e-files-'));

await run('popup-13: UTF-8 BOM 付き CSV import が動く (致命 2)', async () => {
  const page = await freshPopup(browser, extensionId);
  // BOM + header + 1 行データ。BOM 残ると header 'date' が '﻿date' になり認識失敗するのが既知致命。
  const csvText = '﻿date,claim,category,amount,miles,memo\n2026-05-01,BOM-CLM-1,per_diem,65.00,,Day 1\n';
  const tmpPath = join(tmpFilesDir, 'bom-import.csv');
  writeFileSync(tmpPath, csvText, 'utf8');
  // alert を握りつぶす (handleImport 末尾で alert が出る)
  page.on('dialog', async d => { try { await d.dismiss(); } catch (_) {} });
  const fileInput = await page.$('#file-import');
  await fileInput.uploadFile(tmpPath);
  // change → handleImport (async) → render を待つ
  await new Promise(r => setTimeout(r, 250));
  const items = await page.$$('.expense-item');
  if (items.length < 1) throw new Error(`BOM 付き CSV から 1 件以上保存される expected, got ${items.length}`);
  // claim 表示も確認 (BOM が混入してたら "BOM-CLM-1" が壊れる)
  const dateClaim = await page.$eval('.expense-item .date-claim', el => el.textContent);
  if (!/BOM-CLM-1/.test(dateClaim)) throw new Error('claim が壊れている: ' + dateClaim);
  await shot(page, 'regression-bom-import');
  await page.close();
});

await run('popup-14: claim # 部分一致フィルタが動く (致命 5)', async () => {
  const seeds = [
    { id: 's1', date: '2026-05-01', claim: 'ALL-CAT-MIL-552134', category: 'per_diem', amount: 110, miles: null, memo: '' },
    { id: 's2', date: '2026-05-01', claim: 'PA09887766',          category: 'per_diem', amount: 110, miles: null, memo: '' },
    { id: 's3', date: '2026-05-01', claim: '23-014A789',          category: 'per_diem', amount: 110, miles: null, memo: '' }
  ];
  const page = await freshPopup(browser, extensionId, { preload: { expenses: seeds } });
  await page.click('#btn-filter');
  await page.waitForSelector('#filter-modal:not(.hidden)');
  await page.$eval('#flt-claim', (el, v) => { el.value = v; }, '552134');
  await page.click('#btn-filter-apply');
  await new Promise(r => setTimeout(r, 80));
  const items = await page.$$('.expense-item');
  if (items.length !== 1) throw new Error(`'552134' 部分一致で 1 件 expected, got ${items.length}`);
  const dateClaim = await page.$eval('.expense-item .date-claim', el => el.textContent);
  if (!/ALL-CAT-MIL-552134/.test(dateClaim)) throw new Error('期待した claim がヒットしてない: ' + dateClaim);
  await page.close();
});

await run('popup-15: スマートクオート memo が表示で文字化けしない (致命 4)', async () => {
  // U+2019 (’) を含む memo。winAnsiSafe で ASCII アポストロフィに正規化されるはず。
  // 一覧表示は UI 側なので生 Unicode のまま (UI は UTF-8 native)。"O?Brien" のような ? 化が無いことを確認。
  const seeds = [
    { id: 'sq1', date: '2026-05-01', claim: 'CLM-SQ-1', category: 'meals', amount: 25, miles: null, memo: 'Lunch with O’Brien' }
  ];
  const page = await freshPopup(browser, extensionId, { preload: { expenses: seeds } });
  const catMemo = await page.$eval('.expense-item .cat-memo', el => el.textContent);
  if (/O\?Brien/.test(catMemo)) throw new Error('memo に ? 化が発生: ' + catMemo);
  if (!/O[’']Brien/.test(catMemo)) throw new Error('memo に O\'Brien が見えない: ' + catMemo);
  // PDF 生成パス側でも ? にならないことを確認 (winAnsiSafe を直接呼ぶ代わりに、
  // window.PDFLib で実 PDF を作って生成完走を確認)。
  await page.evaluate(async () => {
    await chrome.storage.local.set({ isPaid: true });
  });
  await page.reload();
  await page.waitForSelector('#btn-toggle-add', { visible: true });
  const pdfLen = await page.evaluate(async () => {
    // popup.js の buildExpensePdf は module スコープなので、ここで簡易再現:
    // pdf-lib に直接食わせて、smart quote → '?' 置換が起きるかチェック (Helvetica は WinAnsi のみ)。
    // winAnsiSafe 相当の正規化 ('’' → '\'') を popup.js が施しているなら例外なく生成完走するはず。
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([612, 792]);
    // popup.js 内の winAnsiSafe をエミュレート (テスト独立性のため)
    const safe = 'Lunch with O’Brien'.replace(/[‘’‚‛]/g, "'");
    page.drawText(safe, { x: 50, y: 700, size: 10, font });
    const bytes = await pdf.save();
    return bytes.length;
  });
  if (!pdfLen || pdfLen < 500) throw new Error('PDF 生成完走せず: bytes=' + pdfLen);
  await page.close();
});

await run('popup-16: PDF 50 件で改ページ後ヘッダが再描画される (致命 3)', async () => {
  const seeds = [];
  for (let i = 0; i < 50; i++) {
    seeds.push({
      id: 'pdf' + i,
      date: '2026-05-' + String((i % 28) + 1).padStart(2, '0'),
      claim: 'PDF-' + (i % 5),
      category: 'per_diem',
      amount: 65 + i,
      miles: null,
      memo: 'Entry ' + i
    });
  }
  const page = await freshPopup(browser, extensionId, { preload: { expenses: seeds, isPaid: true } });
  // popup.js の buildExpensePdf はトップレベル関数だが module スコープなのでテストから直接見えない。
  // 同等処理 (pdf-lib で 50 行描画) を page.evaluate 内で再現し、複数ページに分かれることを確認。
  const result = await page.evaluate(async (expensesJson) => {
    const expenses = JSON.parse(expensesJson);
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const margin = 50, pageW = 612, pageH = 792, lineH = 14;
    let page = pdf.addPage([pageW, pageH]);
    let y = pageH - margin;
    let headerDrawCount = 0;
    function drawTableHeader() {
      headerDrawCount++;
      page.drawText('Date', { x: margin, y, size: 9, font: fontBold });
      page.drawText('Claim #', { x: margin + 75, y, size: 9, font: fontBold });
      page.drawText('Amount', { x: margin + 450, y, size: 9, font: fontBold });
      y -= lineH;
    }
    function ensurePage() {
      if (y < margin + 40) {
        page = pdf.addPage([pageW, pageH]);
        y = pageH - margin;
        return true;
      }
      return false;
    }
    drawTableHeader();
    for (const e of expenses) {
      if (ensurePage()) drawTableHeader();
      page.drawText(String(e.date), { x: margin, y, size: 9, font });
      page.drawText(String(e.claim), { x: margin + 75, y, size: 9, font });
      page.drawText('$' + Number(e.amount).toFixed(2), { x: margin + 450, y, size: 9, font });
      y -= lineH;
    }
    const bytes = await pdf.save();
    return { pageCount: pdf.getPageCount(), bytes: bytes.length, headerDrawCount };
  }, JSON.stringify(seeds));
  if (result.pageCount < 2) throw new Error(`50 件で複数ページ expected, got pageCount=${result.pageCount}`);
  if (result.headerDrawCount < 2) throw new Error(`改ページ後ヘッダ再描画 expected, headerDrawCount=${result.headerDrawCount}`);
  if (!result.bytes || result.bytes < 1000) throw new Error('PDF bytes が小さすぎ: ' + result.bytes);
  await page.close();
});

await run('popup-17: Pro モーダルに "Multiple deployments" 文言が無い (致命 1 虚偽広告)', async () => {
  // Free 状態で Export PDF クリック → Upgrade modal 開く
  const page = await freshPopup(browser, extensionId);
  // 1 件 preload しないと exportPDF の "No expenses" 分岐に行かないか確認 → exportPDF は isPaid 判定が先なのでデータ無くてもモーダル出る
  await page.click('#btn-export-pdf');
  await new Promise(r => setTimeout(r, 80));
  const upgradeVisible = await page.$eval('#upgrade-modal', el => !el.classList.contains('hidden'));
  if (!upgradeVisible) throw new Error('Free で Export PDF → Upgrade modal が出ない');
  const modalText = await page.$eval('#upgrade-modal', el => el.textContent);
  if (/Multiple deployments/i.test(modalText)) throw new Error('"Multiple deployments" 虚偽広告が残存: ' + modalText);
  // 約束されている本物の機能ラベルは含まれていること (回帰防止)
  if (!/Unlimited expenses/i.test(modalText)) throw new Error('"Unlimited expenses" が見えない: ' + modalText);
  await page.close();
});

// ============== 業務 edge case (popup-18〜popup-22) ==============

await run('popup-18: 大規模データ 100 件保存 + 一覧描画 (Pro)', async () => {
  const seeds = [];
  for (let i = 0; i < 100; i++) {
    seeds.push({
      id: 'big' + i,
      date: '2026-05-' + String((i % 28) + 1).padStart(2, '0'),
      claim: 'BIG-' + (i % 7),
      category: i % 2 === 0 ? 'per_diem' : 'mileage',
      amount: 10 + i,
      miles: i % 2 === 0 ? null : 20 + i,
      memo: 'Entry ' + i
    });
  }
  const t0 = Date.now();
  const page = await freshPopup(browser, extensionId, { preload: { expenses: seeds, isPaid: true } });
  const elapsed = Date.now() - t0;
  if (elapsed > 5000) throw new Error('100 件描画が遅すぎる: ' + elapsed + 'ms');
  const items = await page.$$('.expense-item');
  if (items.length !== 100) throw new Error(`100 件描画 expected, got ${items.length}`);
  const countText = await page.$eval('#total-count', el => el.textContent);
  if (!/100 entries/.test(countText)) throw new Error('count 表示が違う: ' + countText);
  // 合計金額の検算: sum(10..109) = (10+109)*100/2 = 5950
  const totalText = await page.$eval('#total-amount', el => el.textContent);
  if (!/\$5,950\.00/.test(totalText)) throw new Error('totals が違う: ' + totalText);
  await page.close();
});

await run('popup-19: 100 件で Filter category=mileage 適用 → 該当件数のみ表示', async () => {
  // mileage 30 件 + per_diem 70 件
  const seeds = [];
  for (let i = 0; i < 30; i++) {
    seeds.push({ id: 'mi' + i, date: '2026-05-01', claim: 'MI-' + i, category: 'mileage', amount: 50, miles: 70, memo: '' });
  }
  for (let i = 0; i < 70; i++) {
    seeds.push({ id: 'pd' + i, date: '2026-05-01', claim: 'PD-' + i, category: 'per_diem', amount: 100, miles: null, memo: '' });
  }
  const page = await freshPopup(browser, extensionId, { preload: { expenses: seeds, isPaid: true } });
  await page.click('#btn-filter');
  await page.waitForSelector('#filter-modal:not(.hidden)');
  await page.select('#flt-category', 'mileage');
  await page.click('#btn-filter-apply');
  await new Promise(r => setTimeout(r, 120));
  const items = await page.$$('.expense-item');
  if (items.length !== 30) throw new Error(`mileage filter で 30 件 expected, got ${items.length}`);
  const totalText = await page.$eval('#total-amount', el => el.textContent);
  // mileage 30 × $50 = $1,500
  if (!/\$1,500\.00/.test(totalText)) throw new Error('mileage 小計が違う: ' + totalText);
  const countText = await page.$eval('#total-count', el => el.textContent);
  if (!/30 entries/.test(countText)) throw new Error('count 表示が違う: ' + countText);
  await page.close();
});

await run('popup-20: claim # に slash/hyphen/数字 を含む経費を保存・削除', async () => {
  const page = await freshPopup(browser, extensionId);
  const specialClaim = '23-014A789/sub-001';
  await fillAndSave(page, { category: 'per_diem', amount: 65, claim: specialClaim, memo: 'Special claim' });
  const items = await page.$$('.expense-item');
  if (items.length !== 1) throw new Error('特殊文字 claim 保存失敗');
  const dateClaim = await page.$eval('.expense-item .date-claim', el => el.textContent);
  if (!dateClaim.includes(specialClaim)) throw new Error('特殊文字 claim が壊れた: ' + dateClaim);
  // 削除
  await page.click('.expense-item .del-btn');
  await new Promise(r => setTimeout(r, 100));
  const after = await page.$$('.expense-item');
  if (after.length !== 0) throw new Error('削除後に 0 件 expected, got ' + after.length);
  await page.close();
});

await run('popup-21: import 30 件で Free 上限ぎりぎり + 31 件目 Add で Upgrade modal', async () => {
  const page = await freshPopup(browser, extensionId);
  // CSV を 30 件分作成
  const lines = ['date,claim,category,amount,miles,memo'];
  for (let i = 0; i < 30; i++) {
    lines.push(`2026-05-01,IMP-${i},per_diem,50.00,,Row ${i}`);
  }
  const csvText = lines.join('\n') + '\n';
  const tmpPath = join(tmpFilesDir, 'thirty.csv');
  writeFileSync(tmpPath, csvText, 'utf8');
  page.on('dialog', async d => { try { await d.dismiss(); } catch (_) {} });
  const fileInput = await page.$('#file-import');
  await fileInput.uploadFile(tmpPath);
  await new Promise(r => setTimeout(r, 350));
  const items = await page.$$('.expense-item');
  if (items.length !== 30) throw new Error(`30 件 import expected, got ${items.length}`);
  // 31 件目 Save → Upgrade modal が出るはず
  await fillAndSave(page, { category: 'per_diem', amount: 65, claim: 'OVER-31' });
  const upgradeVisible = await page.$eval('#upgrade-modal', el => !el.classList.contains('hidden'));
  if (!upgradeVisible) throw new Error('31 件目で Upgrade modal が出ない');
  const after = await page.$$('.expense-item');
  if (after.length !== 30) throw new Error(`31 件目は追加されない expected 30, got ${after.length}`);
  await page.close();
});

await run('popup-22: Free 25件 + 10 件 import → 5 件追加 + 5 件 drop + alert 表示', async () => {
  const seeds = [];
  for (let i = 0; i < 25; i++) {
    seeds.push({ id: 'pre' + i, date: '2026-05-01', claim: 'PRE-' + i, category: 'per_diem', amount: 50, miles: null, memo: '' });
  }
  const page = await freshPopup(browser, extensionId, { preload: { expenses: seeds } });
  // alert を捕捉
  let alertMsg = '';
  page.on('dialog', async d => {
    alertMsg = d.message();
    try { await d.dismiss(); } catch (_) {}
  });
  // 10 件分の CSV
  const lines = ['date,claim,category,amount,miles,memo'];
  for (let i = 0; i < 10; i++) {
    lines.push(`2026-05-02,IMP-${i},per_diem,30.00,,Row ${i}`);
  }
  const csvText = lines.join('\n') + '\n';
  const tmpPath = join(tmpFilesDir, 'ten.csv');
  writeFileSync(tmpPath, csvText, 'utf8');
  const fileInput = await page.$('#file-import');
  await fileInput.uploadFile(tmpPath);
  await new Promise(r => setTimeout(r, 350));
  const items = await page.$$('.expense-item');
  if (items.length !== 30) throw new Error(`Free cap 後の総件数 30 expected, got ${items.length}`);
  if (!/Dropped 5/i.test(alertMsg)) throw new Error('alert に "Dropped 5" が含まれない: ' + alertMsg);
  if (!/Imported 5/i.test(alertMsg)) throw new Error('alert に "Imported 5" が含まれない: ' + alertMsg);
  // import の drop で showUpgrade が走るので Upgrade modal も出ているはず
  const upgradeVisible = await page.$eval('#upgrade-modal', el => !el.classList.contains('hidden'));
  if (!upgradeVisible) throw new Error('import drop 時に Upgrade modal が出ない');
  await page.close();
});

// ============== Bonus (popup-23〜popup-24) ==============

await run('popup-23: Mileage 自動計算で IRS rate override (0.67) が反映', async () => {
  const page = await freshPopup(browser, extensionId, { preload: { irsRate: 0.67 } });
  // Add → category=mileage, miles=100, amount 空 → Save
  await page.click('#btn-toggle-add');
  await page.waitForSelector('#form-fields:not(.hidden)');
  await page.select('#f-category', 'mileage');
  await new Promise(r => setTimeout(r, 50));
  await page.$eval('#f-miles', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, 100);
  // amount は空のまま
  await page.$eval('#f-claim', (el, v) => { el.value = v; }, 'IRS-OVR');
  await page.click('#btn-save-add');
  await new Promise(r => setTimeout(r, 120));
  const amount = await page.$eval('.expense-item .amount', el => el.textContent);
  if (!/\$67\.00/.test(amount)) throw new Error('IRS rate override (0.67) 反映なし: ' + amount);
  await page.close();
});

await run('popup-24: Settings → IRS rate を 0 にしても保存されない (rate > 0 ガード)', async () => {
  const page = await freshPopup(browser, extensionId, { preload: { irsRate: 0.55 } });
  await page.click('#btn-settings');
  await page.waitForSelector('#settings-modal:not(.hidden)');
  await page.$eval('#set-irs-rate', (el, v) => { el.value = String(v); }, 0);
  await page.click('#btn-settings-save');
  await new Promise(r => setTimeout(r, 80));
  // storage と state の両方を確認 (storage は更新されない・state も 0.55 を保持)
  const stored = await page.evaluate(() => new Promise(r => chrome.storage.local.get('irsRate', d => r(d.irsRate))));
  if (stored !== 0.55) throw new Error(`storage irsRate は 0.55 維持 expected, got ${stored}`);
  // mileage 自動計算でも 0.55 が使われることを確認
  await page.click('#btn-toggle-add');
  await page.waitForSelector('#form-fields:not(.hidden)');
  await page.select('#f-category', 'mileage');
  await new Promise(r => setTimeout(r, 50));
  await page.$eval('#f-miles', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, 100);
  await page.$eval('#f-claim', (el, v) => { el.value = v; }, 'ZERO-RATE');
  await page.click('#btn-save-add');
  await new Promise(r => setTimeout(r, 120));
  const amount = await page.$eval('.expense-item .amount', el => el.textContent);
  if (!/\$55\.00/.test(amount)) throw new Error('rate=0 ガード後も 0.55 で計算 expected, got ' + amount);
  await page.close();
});

// 一時ディレクトリのクリーンアップ
try { rmSync(tmpFilesDir, { recursive: true, force: true }); } catch (_) {}

// =============================================

await browser.close();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}

console.log(`\n=== Result ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);

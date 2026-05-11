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
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'fs';
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

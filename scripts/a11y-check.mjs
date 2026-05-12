// アクセシビリティ静的監査 (axe-core)
//
// 対象: popup.html + 各モーダル (filter / deployment / settings / upgrade)
// 規則: WCAG 2.1 AA, best practice
//
// 実行 (WSL2):
//   wsl -u root -d Ubuntu -- bash -lc '...xvfb-run node scripts/a11y-check.mjs'
//
// 終了コード: critical/serious が 1 件でもあれば exit 1。minor/moderate は warn のみ。

import puppeteer from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = mkdtempSync(join(tmpdir(), 'ael-a11y-'));

const reportDir = join(root, 'a11y-report');
if (existsSync(reportDir)) rmSync(reportDir, { recursive: true, force: true });
mkdirSync(reportDir, { recursive: true });

console.log('\n=== Accessibility audit (axe-core) ===\n');

const isLinux = process.platform === 'linux';
const browser = await puppeteer.launch({
  headless: isLinux,
  userDataDir,
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ],
  defaultViewport: { width: 480, height: 720 },
});

const sw = await browser.waitForTarget((t) => t.type() === 'service_worker', { timeout: 10000 }).catch(() => null);
const extensionId = sw ? sw.url().split('/')[2] : null;
if (!extensionId) {
  console.error('FATAL: extension id not found');
  await browser.close();
  process.exit(1);
}
console.log(`Extension ID: ${extensionId}\n`);

let totalCritical = 0;
let totalSerious = 0;
let totalModerate = 0;
let totalMinor = 0;

async function audit(label, setup) {
  console.log(`--- ${label} ---`);
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(() => new Promise((r) => chrome.storage.local.clear(r)));
  if (setup) await setup(page);

  const results = await new AxePuppeteer(page)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();

  const byImpact = { critical: [], serious: [], moderate: [], minor: [] };
  for (const v of results.violations) {
    (byImpact[v.impact] || byImpact.minor).push(v);
  }

  for (const sev of ['critical', 'serious', 'moderate', 'minor']) {
    for (const v of byImpact[sev]) {
      console.log(`  [${sev.toUpperCase()}] ${v.id}: ${v.help}`);
      console.log(`           ${v.helpUrl}`);
      for (const n of v.nodes.slice(0, 2)) {
        console.log(`           → ${n.target.join(' ')}`);
        if (n.failureSummary) {
          console.log(`             ${n.failureSummary.replace(/\n/g, ' | ')}`);
        }
      }
    }
  }
  totalCritical += byImpact.critical.length;
  totalSerious += byImpact.serious.length;
  totalModerate += byImpact.moderate.length;
  totalMinor += byImpact.minor.length;

  // レポート JSON 保存
  const safe = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  writeFileSync(
    join(reportDir, `${safe}.json`),
    JSON.stringify({ url: results.url, violations: results.violations }, null, 2),
    'utf-8'
  );

  console.log(`  → critical=${byImpact.critical.length} serious=${byImpact.serious.length} moderate=${byImpact.moderate.length} minor=${byImpact.minor.length}\n`);
  await page.close();
}

// 1. 初期 popup
await audit('initial popup', null);

// 2. + Add expense 展開状態
await audit('add expense form open', async (page) => {
  await page.waitForSelector('#btn-toggle-add', { visible: true });
  await page.click('#btn-toggle-add');
  await page.waitForSelector('#form-fields:not(.hidden)');
});

// 3. Filter モーダル開いた状態
await audit('filter modal open', async (page) => {
  await page.waitForSelector('#btn-filter', { visible: true });
  await page.click('#btn-filter');
  await page.waitForSelector('#filter-modal:not(.hidden)');
});

// 4. Deployment モーダル開いた状態
await audit('deployment modal open', async (page) => {
  await page.waitForSelector('#btn-edit-deployment', { visible: true });
  await page.click('#btn-edit-deployment');
  await page.waitForSelector('#deployment-modal:not(.hidden)');
});

// 5. Settings モーダル開いた状態
await audit('settings modal open', async (page) => {
  await page.waitForSelector('#btn-settings', { visible: true });
  await page.click('#btn-settings');
  await page.waitForSelector('#settings-modal:not(.hidden)');
});

// 6. Upgrade モーダル開いた状態 (Export PDF on Free)
await audit('upgrade modal open', async (page) => {
  await page.evaluate(() => new Promise((r) => {
    chrome.storage.local.set({
      expenses: [{
        id: 'a', date: '2026-05-10', category: 'meals',
        amount: 10, claim: 'C-1', memo: '', miles: null, createdAt: Date.now()
      }]
    }, () => r());
  }));
  await page.reload();
  await page.waitForSelector('#btn-export-pdf', { visible: true });
  await page.click('#btn-export-pdf');
  await page.waitForSelector('#upgrade-modal:not(.hidden)');
});

await browser.close();
try { rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}

console.log('=== Summary ===');
console.log(`Critical: ${totalCritical}`);
console.log(`Serious:  ${totalSerious}`);
console.log(`Moderate: ${totalModerate}`);
console.log(`Minor:    ${totalMinor}`);
console.log(`\nReport JSON saved to: a11y-report/`);

if (totalCritical + totalSerious > 0) {
  console.log('\nFAIL: critical + serious violations detected. リリース前修正必須。');
  process.exit(1);
}
console.log('\nPASS: no critical/serious violations.');
process.exit(0);

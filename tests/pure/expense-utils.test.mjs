import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const U = require('../../lib/expense-utils.js');

// ---- normalizeExpense -----------------------------------------------------

test('normalizeExpense accepts a valid entry', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'per_diem', amount: 65 });
  assert.equal(e.date, '2026-05-10');
  assert.equal(e.category, 'per_diem');
  assert.equal(e.amount, 65);
  assert.ok(e.id.startsWith('exp_'));
});

test('normalizeExpense rejects missing date', () => {
  assert.equal(U.normalizeExpense({ category: 'meals', amount: 12 }), null);
});

test('normalizeExpense accepts ISO date with slashes (Excel default export)', () => {
  // 12.privilege-log 教訓: 過剰に厳しい仕様で実ユーザを弾く事故を防ぐ。
  // "2026/05/10" は Excel/Google Sheets の既定 export 形式、QuickBooks の一部 export でも採用。
  const e = U.normalizeExpense({ date: '2026/05/10', category: 'meals', amount: 12 });
  assert.equal(e.date, '2026-05-10');
});

test('normalizeExpense rejects truly malformed date (random string)', () => {
  assert.equal(U.normalizeExpense({ date: 'last Tuesday', category: 'meals', amount: 12 }), null);
});

test('normalizeExpense rejects invalid calendar date (Feb 30)', () => {
  assert.equal(U.normalizeExpense({ date: '2026-02-30', category: 'meals', amount: 12 }), null);
});

test('normalizeExpense rejects negative amount', () => {
  assert.equal(U.normalizeExpense({ date: '2026-05-10', category: 'meals', amount: -1 }), null);
});

test('normalizeExpense rejects non-numeric amount', () => {
  assert.equal(U.normalizeExpense({ date: '2026-05-10', category: 'meals', amount: 'abc' }), null);
});

test('normalizeExpense rounds amount to 2 decimals', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'mileage', amount: 12.345 });
  assert.equal(e.amount, 12.35);
});

test('normalizeExpense falls back to "other" for unknown category', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'rocket_fuel', amount: 5 });
  assert.equal(e.category, 'other');
});

test('normalizeExpense preserves miles when non-negative number', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'mileage', amount: 0, miles: 123.5 });
  assert.equal(e.miles, 123.5);
});

test('normalizeExpense drops negative miles', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'mileage', amount: 0, miles: -10 });
  assert.equal(e.miles, null);
});

test('normalizeExpense preserves id when provided', () => {
  const e = U.normalizeExpense({ id: 'exp_keepme', date: '2026-05-10', category: 'meals', amount: 5 });
  assert.equal(e.id, 'exp_keepme');
});

// ---- mileageAmount --------------------------------------------------------

test('mileageAmount uses default IRS rate when none provided', () => {
  assert.equal(U.mileageAmount(100), 72.5); // 100 * 0.725
});

test('mileageAmount uses custom rate', () => {
  assert.equal(U.mileageAmount(100, 0.67), 67);
});

test('mileageAmount returns 0 for non-positive miles', () => {
  assert.equal(U.mileageAmount(0), 0);
  assert.equal(U.mileageAmount(-5), 0);
});

test('mileageAmount rounds to 2 decimals', () => {
  assert.equal(U.mileageAmount(12.345, 0.725), 8.95); // 8.950125 -> 8.95
});

// ---- filterExpenses -------------------------------------------------------

const sample = [
  { id: 'a', date: '2026-05-01', claim: 'C-1', category: 'per_diem', amount: 65 },
  { id: 'b', date: '2026-05-05', claim: 'C-1', category: 'hotel', amount: 120 },
  { id: 'c', date: '2026-05-07', claim: 'C-2', category: 'mileage', amount: 50, miles: 69 },
  { id: 'd', date: '2026-05-10', claim: '',    category: 'meals', amount: 18 }
];

test('filterExpenses by claim', () => {
  const r = U.filterExpenses(sample, { claim: 'C-1' });
  assert.equal(r.length, 2);
  assert.ok(r.every((e) => e.claim === 'C-1'));
});

test('filterExpenses claim is case-insensitive', () => {
  const r = U.filterExpenses(sample, { claim: 'c-1' });
  assert.equal(r.length, 2);
});

test('filterExpenses by category', () => {
  const r = U.filterExpenses(sample, { category: 'hotel' });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'b');
});

test('filterExpenses by date range (inclusive)', () => {
  const r = U.filterExpenses(sample, { from: '2026-05-05', to: '2026-05-07' });
  assert.equal(r.length, 2);
});

test('filterExpenses returns [] for null input', () => {
  assert.deepEqual(U.filterExpenses(null, {}), []);
});

// ---- totals / subtotals ---------------------------------------------------

test('totals sums amount and counts entries', () => {
  const t = U.totals(sample);
  assert.equal(t.amount, 253);
  assert.equal(t.count, 4);
});

test('totals returns zeroes for empty input', () => {
  assert.deepEqual(U.totals([]), { amount: 0, count: 0 });
});

test('subtotalsByCategory yields zero for unused categories', () => {
  const r = U.subtotalsByCategory(sample);
  assert.equal(r.per_diem, 65);
  assert.equal(r.hotel, 120);
  assert.equal(r.mileage, 50);
  assert.equal(r.meals, 18);
  assert.equal(r.parking, 0);
  assert.equal(r.supplies, 0);
});

test('subtotalsByClaim groups empty claim under "(no claim)"', () => {
  const r = U.subtotalsByClaim(sample);
  assert.equal(r['C-1'], 185);
  assert.equal(r['C-2'], 50);
  assert.equal(r['(no claim)'], 18);
});

// ---- CSV round-trip -------------------------------------------------------

test('toCSV produces header + rows', () => {
  const csv = U.toCSV(sample);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'date,claim,category,amount,miles,memo');
  assert.equal(lines.length, sample.length + 1);
});

test('toCSV escapes quotes and commas', () => {
  const csv = U.toCSV([
    { id: 'x', date: '2026-05-10', claim: 'C, "1"', category: 'other', amount: 5, memo: 'a\nb' }
  ]);
  assert.match(csv, /"C, ""1"""/);
  assert.match(csv, /"a\nb"/);
});

test('parseCSV round-trip preserves data', () => {
  const csv = U.toCSV(sample);
  const back = U.parseCSV(csv);
  assert.equal(back.length, sample.length);
  assert.equal(back[0].claim, 'C-1');
  assert.equal(back[1].amount, 120);
  assert.equal(back[2].miles, 69);
});

test('parseCSV drops rows with invalid date', () => {
  const csv = 'date,claim,category,amount,miles,memo\n' +
              '2026-13-99,C-1,per_diem,10,,\n' +
              '2026-05-10,C-2,per_diem,15,,';
  const r = U.parseCSV(csv);
  assert.equal(r.length, 1);
  assert.equal(r[0].amount, 15);
});

test('parseCSV handles empty input', () => {
  assert.deepEqual(U.parseCSV(''), []);
  assert.deepEqual(U.parseCSV(null), []);
});

// ---- JSON backup ----------------------------------------------------------

test('toBackupJSON / parseBackupJSON round-trip', () => {
  const state = {
    deployment: { name: 'Frank', event: 'Helene 2025', start: '2025-09-26', end: '2025-10-15' },
    expenses: sample
  };
  const json = U.toBackupJSON(state);
  const back = U.parseBackupJSON(json);
  assert.equal(back.expenses.length, sample.length);
  assert.deepEqual(back.deployment, state.deployment);
});

test('parseBackupJSON returns empty for malformed JSON', () => {
  const r = U.parseBackupJSON('{not json}');
  assert.deepEqual(r, { expenses: [], deployment: null });
});

// ---- formatAmount ---------------------------------------------------------

test('formatAmount adds dollar sign and thousands separator', () => {
  assert.equal(U.formatAmount(1234.5), '$1,234.50');
});

test('formatAmount handles zero and negatives gracefully', () => {
  assert.equal(U.formatAmount(0), '$0.00');
  assert.equal(U.formatAmount(NaN), '$0.00');
});

// ---- Free limit constant ---------------------------------------------------

test('FREE_LIMIT is 30 (Phase 3 確定値)', () => {
  assert.equal(U.FREE_LIMIT, 30);
});

test('DEFAULT_IRS_RATE matches 2026 federal value', () => {
  assert.equal(U.DEFAULT_IRS_RATE, 0.725);
});

// ---- 反復ループで追加: アンチペルソナ R1 で発見した致命修正のリグレッション ----

test('normalizeExpense rejects amount over MAX_AMOUNT (typo guard)', () => {
  assert.equal(U.normalizeExpense({ date: '2026-05-10', category: 'meals', amount: 1_000_001 }), null);
});

test('normalizeExpense accepts MAX_AMOUNT exactly', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'hotel', amount: U.MAX_AMOUNT });
  assert.ok(e);
  assert.equal(e.amount, U.MAX_AMOUNT);
});

test('subtotalsByClaim case-insensitive aggregation (ABC-1 + abc-1 merge)', () => {
  const r = U.subtotalsByClaim([
    { id: 'a', date: '2026-05-01', claim: 'ABC-123', category: 'per_diem', amount: 100 },
    { id: 'b', date: '2026-05-02', claim: 'abc-123', category: 'meals', amount: 50 }
  ]);
  const keys = Object.keys(r);
  assert.equal(keys.length, 1, 'case-insensitive で 1 key にマージされるはず');
  assert.equal(r[keys[0]], 150);
});

test('subtotalsByClaim preserves first-seen display casing', () => {
  const r = U.subtotalsByClaim([
    { id: 'a', date: '2026-05-01', claim: 'ABC-1', category: 'meals', amount: 10 },
    { id: 'b', date: '2026-05-02', claim: 'abc-1', category: 'meals', amount: 20 }
  ]);
  assert.ok('ABC-1' in r, '最初に現れた表記が保持されるはず');
  assert.equal(r['ABC-1'], 30);
});

test('parseCSVDetailed reports skipped row count', () => {
  const csv = 'date,claim,category,amount,miles,memo\n' +
              ',C-1,per_diem,10,,\n' +
              '2026-05-10,C-2,per_diem,15,,\n' +
              '2026-05-11,C-3,per_diem,-5,,';
  const r = U.parseCSVDetailed(csv);
  assert.equal(r.expenses.length, 1, '有効 1 件');
  assert.equal(r.skipped, 2, 'date 欠落 + 負の amount = skipped 2');
  assert.equal(r.totalRows, 3);
});

test('parseCSVDetailed handles empty input safely', () => {
  assert.deepEqual(U.parseCSVDetailed(''), { expenses: [], skipped: 0, totalRows: 0 });
});

test('csvRows preserves CR inside quoted memo (Excel round-trip)', () => {
  const csv = 'date,claim,category,amount,miles,memo\n' +
              '2026-05-10,C-1,other,10,,"Line 1\r\nLine 2"';
  const expenses = U.parseCSV(csv);
  assert.equal(expenses.length, 1);
  // \r\n は cell 内に保持される
  assert.ok(/Line 1\r?\n?Line 2/.test(expenses[0].memo), 'memo の改行が保たれる: ' + JSON.stringify(expenses[0].memo));
});

test('mileageAmount with custom rate 0.67 matches 2025 federal value (regression)', () => {
  assert.equal(U.mileageAmount(100, 0.67), 67);
});

// ---- 「実ユーザ入力 fuzz」発見バグ修正 positive variant test -----------------
// 12.privilege-log の "Bates Range single doc 拒否" 教訓 (codify) を踏まえ、
// 仕様駆動 e2e/単体 PASS 後に実ユーザ入力で詰む事故をふさぐためのテスト群。

// --- sanitizeNumber (Amount / Miles 共通) ---------------------------------

test('sanitizeNumber strips $ prefix (Marriott 領収書コピペ)', () => {
  assert.equal(U.sanitizeNumber('$120.50'), 120.50);
});

test('sanitizeNumber strips thousands comma (QuickBooks export)', () => {
  assert.equal(U.sanitizeNumber('1,234.50'), 1234.50);
});

test('sanitizeNumber strips $ + comma combined ($1,234.50)', () => {
  assert.equal(U.sanitizeNumber('$1,234.50'), 1234.50);
});

test('sanitizeNumber strips trailing USD suffix', () => {
  assert.equal(U.sanitizeNumber('120.50 USD'), 120.50);
});

test('sanitizeNumber treats parenthesized amount as negative (会計記法)', () => {
  assert.equal(U.sanitizeNumber('(45.00)'), -45);
});

test('sanitizeNumber accepts full-width digits (IME 衝突対策)', () => {
  assert.equal(U.sanitizeNumber('１２０．５０'), 120.50);
});

test('sanitizeNumber handles plain numbers unchanged', () => {
  assert.equal(U.sanitizeNumber(42.3), 42.3);
  assert.equal(U.sanitizeNumber('42.3'), 42.3);
  assert.equal(U.sanitizeNumber('42'), 42);
});

test('sanitizeNumber returns NaN for empty / unparseable strings', () => {
  assert.ok(Number.isNaN(U.sanitizeNumber('')));
  assert.ok(Number.isNaN(U.sanitizeNumber('   ')));
  assert.ok(Number.isNaN(U.sanitizeNumber('abc')));
  assert.ok(Number.isNaN(U.sanitizeNumber(null)));
});

// --- normalizeExpense via sanitizeNumber for amount/miles ---------------

test('normalizeExpense accepts amount with $ and comma (receipt paste)', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'hotel', amount: '$1,234.50' });
  assert.ok(e);
  assert.equal(e.amount, 1234.50);
});

test('normalizeExpense accepts Miles with thousands comma (CAT 長距離)', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'mileage', amount: 0, miles: '2,103' });
  assert.ok(e);
  assert.equal(e.miles, 2103);
});

test('normalizeExpense rejects negative amount via parens (refund 仕様外)', () => {
  // 仕様は経費のみ。返金は管理対象外。
  assert.equal(U.normalizeExpense({ date: '2026-05-10', category: 'meals', amount: '(45.00)' }), null);
});

// --- parseDateFlexible (CSV import 実 SaaS export 互換) ---------------------

test('parseDateFlexible accepts US slash form M/D/YYYY (QuickBooks 既定)', () => {
  assert.equal(U.parseDateFlexible('5/12/2026'), '2026-05-12');
});

test('parseDateFlexible accepts US slash zero-padded MM/DD/YYYY', () => {
  assert.equal(U.parseDateFlexible('05/12/2026'), '2026-05-12');
});

test('parseDateFlexible accepts 2-digit year M/D/YY (Concur)', () => {
  assert.equal(U.parseDateFlexible('5/12/26'), '2026-05-12');
});

test('parseDateFlexible accepts D-MMM-YYYY (Crawford monthly statement)', () => {
  assert.equal(U.parseDateFlexible('11-May-2026'), '2026-05-11');
});

test('parseDateFlexible accepts ISO with single digit M/D (Excel no zero-pad)', () => {
  assert.equal(U.parseDateFlexible('2026-5-1'), '2026-05-01');
});

test('parseDateFlexible rejects bogus calendar date (Feb 31)', () => {
  assert.equal(U.parseDateFlexible('2026-02-31'), null);
});

test('parseDateFlexible rejects free text', () => {
  assert.equal(U.parseDateFlexible('last Tuesday'), null);
  assert.equal(U.parseDateFlexible('May 11, 2026'), null); // カンマ区切り text は対象外
});

test('parseDateFlexible rejects 5-digit year (UI typo guard)', () => {
  // <input type=date> は HTML5 仕様で year 0001-275760 まで受理する。
  // CSV import / 手入力で typo の "12026-05-10" / "99999-12-31" が来た時もここで止める。
  assert.equal(U.parseDateFlexible('12026-05-10'), null);
  assert.equal(U.parseDateFlexible('99999-12-31'), null);
});

test('parseDateFlexible rejects year < 1900 or > 2100 (sanity guard)', () => {
  assert.equal(U.parseDateFlexible('1850-05-10'), null);
  assert.equal(U.parseDateFlexible('2101-01-01'), null);
});

test('parseCSV accepts QuickBooks-style US date column', () => {
  const csv = 'date,claim,category,amount,miles,memo\n' +
              '5/12/2026,PA09887766,hotel,$120.00,,Marriott Tampa\n' +
              '5/13/2026,PA09887766,meals,"$45.50",,Cracker Barrel';
  const r = U.parseCSV(csv);
  assert.equal(r.length, 2);
  assert.equal(r[0].date, '2026-05-12');
  assert.equal(r[0].amount, 120);
  assert.equal(r[1].amount, 45.50);
  assert.equal(r[1].claim, 'PA09887766');
});

// --- normalizeClaimKey + filter robustness --------------------------------

test('normalizeClaimKey strips hyphens and spaces, lowercases', () => {
  assert.equal(U.normalizeClaimKey('12-345A-678'), '12345a678');
  assert.equal(U.normalizeClaimKey('123 456 789 0'), '1234567890');
  assert.equal(U.normalizeClaimKey('PA-09887766'), 'pa09887766');
});

test('filterExpenses matches claim regardless of hyphen/space style', () => {
  const data = [
    { id: 'a', date: '2026-05-01', claim: '12-345A-678', category: 'meals', amount: 10 },
    { id: 'b', date: '2026-05-02', claim: '123 456 789 0', category: 'meals', amount: 20 },
    { id: 'c', date: '2026-05-03', claim: 'PA09887766', category: 'meals', amount: 30 }
  ];
  assert.equal(U.filterExpenses(data, { claim: '12345A678' }).length, 1, 'ハイフン無視');
  assert.equal(U.filterExpenses(data, { claim: '1234567890' }).length, 1, 'スペース無視');
  assert.equal(U.filterExpenses(data, { claim: 'pa-09887766' }).length, 1, '小文字+ハイフン挿入で元データにヒット');
});

// --- 全角入力 fuzz (海外 IA・IME 残留) -------------------------------

test('normalizeExpense accepts full-width amount input', () => {
  const e = U.normalizeExpense({ date: '2026-05-10', category: 'hotel', amount: '＄１２０．５０' });
  assert.ok(e, '全角 $/数字/小数点もコピペ事故として救済');
  assert.equal(e.amount, 120.50);
});

// ---- CSV Injection 対策 (OWASP) ------------------------------------------
// memo / claim # に "=HYPERLINK(...)" を仕込まれて Excel で開いた瞬間に発火するのを防ぐ。
// 対策: 該当先頭文字に ' を prefix。Excel/Sheets/Numbers で式評価を抑止。

test('CSV export: memo starting with = is prefixed with apostrophe (OWASP)', () => {
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'other', amount: 10, memo: '=HYPERLINK("http://evil","click")' }
  ]);
  // Excel が = を式と解釈しないように先頭に ' が付く
  assert.ok(/'=HYPERLINK/.test(csv), '"=" 始まり memo は \' プレフィックス必須。CSV: ' + csv);
});

test('CSV export: memo starting with + is sanitized', () => {
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'other', amount: 10, memo: '+1234567890' }
  ]);
  assert.ok(/'\+1234567890/.test(csv), '"+" 始まりも危険 (Excel 式)。CSV: ' + csv);
});

test('CSV export: memo starting with - is sanitized', () => {
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'other', amount: 10, memo: '-cmd|calc' }
  ]);
  assert.ok(/'-cmd/.test(csv), '"-" 始まりも危険 (Excel DDE attack)。CSV: ' + csv);
});

test('CSV export: memo starting with @ is sanitized', () => {
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'other', amount: 10, memo: '@SUM(A1:A100)' }
  ]);
  assert.ok(/'@SUM/.test(csv), '"@" 始まりも Excel 式扱い');
});

test('CSV export: memo starting with TAB is sanitized', () => {
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'other', amount: 10, memo: '\t=evil()' }
  ]);
  assert.ok(/'\t=/.test(csv), 'TAB 始まりも sanitize 対象 (CSV 区切り誤認)');
});

test('CSV export: claim # starting with = is sanitized', () => {
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: '=cmd', category: 'other', amount: 10, memo: '' }
  ]);
  assert.ok(/'=cmd/.test(csv), 'claim# にも sanitize が効く');
});

test('CSV export: ordinary memo is NOT prefixed', () => {
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'other', amount: 10, memo: 'Marriott Tampa stay' }
  ]);
  // 通常 memo は ' が付かない
  assert.ok(/Marriott Tampa stay/.test(csv));
  assert.ok(!/'Marriott/.test(csv), '通常 memo に余計な \' が付いてはいけない');
});

// ---- Excel/Sheets 互換ラウンドトリップ (RFC 4180 + UTF-8 BOM) ---------------

test('toCSV produces RFC 4180-compliant lines (CRLF or LF acceptable)', () => {
  // Excel は LF/CRLF どちらも開けるが、ヘッダ + 行末は単一 \n でも 4180 解釈 OK
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'meals', amount: 12.34, memo: 'ok' }
  ]);
  assert.ok(/\n/.test(csv), '行区切りに LF が含まれる');
  assert.equal(csv.split('\n')[0], 'date,claim,category,amount,miles,memo');
});

test('parseCSV: BOM 付き UTF-8 CSV (Excel "Save as CSV" デフォルト) を読める', () => {
  const csvBom = '﻿' + 'date,claim,category,amount,miles,memo\n' +
                 '2026-05-10,C-1,meals,12.34,,Cracker Barrel';
  const r = U.parseCSV(csvBom);
  assert.equal(r.length, 1, 'BOM 付きでも header が認識されるはず');
  assert.equal(r[0].amount, 12.34);
});

test('parseCSV: CRLF 行末 (Windows Excel デフォルト) を扱える', () => {
  const csvCrlf = 'date,claim,category,amount,miles,memo\r\n' +
                  '2026-05-10,C-1,meals,12.34,,Cracker Barrel\r\n';
  const r = U.parseCSV(csvCrlf);
  assert.equal(r.length, 1, 'CRLF 行末でも正常パース');
  assert.equal(r[0].claim, 'C-1');
});

test('CSV round-trip: 改行 + カンマ + ダブルクオート入り memo を export → import で復元', () => {
  // Excel で memo セル内に「住所改行 + 引用句」を含む実 IA データを想定
  const original = [{
    id: 'a',
    date: '2026-05-10',
    claim: 'PA09887766',
    category: 'hotel',
    amount: 89.50,
    memo: 'Marriott Tampa\n1234 Main St, Apt 5B\n"Top floor" suite'
  }];
  const csv = U.toCSV(original);
  // CSV としては全体がクオートされて二重クオートで escape されている
  assert.ok(/"Marriott Tampa\n1234 Main St, Apt 5B\n""Top floor"" suite"/.test(csv),
    'memo は RFC 4180 で正しく escape: ' + csv);
  const back = U.parseCSV(csv);
  assert.equal(back.length, 1);
  // 改行・カンマ・引用句が全て復元される
  assert.equal(back[0].memo, original[0].memo, 'memo が往復で同一: ' + JSON.stringify(back[0].memo));
});

test('CSV round-trip: 100 件の random data で値が落ちない', () => {
  const cats = U.CATEGORIES;
  const original = [];
  for (let i = 0; i < 100; i++) {
    const c = cats[i % cats.length];
    original.push({
      id: 'r' + i,
      date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
      claim: 'CLM-' + i,
      category: c,
      amount: Math.round(Math.random() * 100000) / 100,
      miles: c === 'mileage' ? Math.round(Math.random() * 1000) / 10 : null,
      // memo は normalizeExpense で trim される仕様なので、末尾スペースを残さない
      memo: `Note ${i}${i % 3 === 0 ? ' with, comma' : ''}${i % 5 === 0 ? '\nnewline' : ''}`
    });
  }
  const csv = U.toCSV(original);
  const back = U.parseCSV(csv);
  assert.equal(back.length, 100, '100 件全部 round-trip');
  for (let i = 0; i < 100; i++) {
    assert.equal(back[i].amount, original[i].amount, `row ${i}: amount mismatch`);
    assert.equal(back[i].claim, original[i].claim, `row ${i}: claim mismatch`);
    assert.equal(back[i].memo, original[i].memo, `row ${i}: memo mismatch`);
  }
});

test('CSV round-trip: 浮動小数点 0.1+0.2 問題が toFixed で 0.30 に正規化される', () => {
  // 経費 0.10 + 0.20 = 0.30 ではなく 0.30000000004 になる JS 仕様の影響を避ける
  const csv = U.toCSV([
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'meals', amount: 0.1 + 0.2, memo: '' }
  ]);
  // toFixed(2) で 0.30 文字列化されているはず
  assert.ok(/0\.30/.test(csv), 'amount が "0.30" で出力されている: ' + csv);
  const back = U.parseCSV(csv);
  assert.equal(back[0].amount, 0.30);
});

test('CSV import: Excel "Save as CSV UTF-8" の典型 (BOM + CRLF + クオート escape)', () => {
  // 実際に Excel 365 で保存される CSV のフォーマット例
  const csv = '﻿date,claim,category,amount,miles,memo\r\n' +
              '2026-05-10,"PA-09887766",hotel,"1,234.50",,"Marriott ""Westshore"" Tampa"\r\n' +
              '2026-05-11,23-014A789,meals,45.50,,Cracker Barrel\r\n';
  const r = U.parseCSV(csv);
  assert.equal(r.length, 2);
  assert.equal(r[0].claim, 'PA-09887766');
  assert.equal(r[0].amount, 1234.50);
  assert.ok(/Marriott "Westshore" Tampa/.test(r[0].memo), 'クオート escape 復元: ' + r[0].memo);
  assert.equal(r[1].claim, '23-014A789');
});

test('CSV round-trip: export → re-parse preserves sanitized memo', () => {
  // export → 同じ拡張で import するシナリオ。export で sanitize された memo が
  // import で剥がれて再 export で誰かに渡って Excel で開かれる事故を防ぐ
  // ためには、import 後も ' プレフィックスを保持しておくのが安全側。
  const original = [
    { id: 'a', date: '2026-05-10', claim: 'C-1', category: 'other', amount: 10, memo: '=HYPERLINK(\"evil\")' }
  ];
  const csv = U.toCSV(original);
  const back = U.parseCSV(csv);
  assert.equal(back.length, 1);
  assert.ok(back[0].memo.startsWith("'"),
    '再 import 時も sanitize 済み memo の \' プレフィックスは保持される: ' + back[0].memo);
  // 再 export で二重 prefix にならないこと
  const csv2 = U.toCSV(back);
  assert.ok(!/''=/.test(csv2), '再 export 時に \'\' 二重 prefix にならないこと: ' + csv2);
});

// ---- 反復ループ R2 で追加: Eric が炙り出した致命修正のリグレッション ----

test('parseCSVDetailed strips UTF-8 BOM (Excel/Sheets save default)', () => {
  const csv = '﻿date,claim,category,amount,miles,memo\n' +
              '2026-05-10,PA09887766,per_diem,110,,Day 1';
  const r = U.parseCSVDetailed(csv);
  assert.equal(r.expenses.length, 1, 'BOM 付き CSV を 1 件取り込めるはず');
  assert.equal(r.expenses[0].claim, 'PA09887766');
  assert.equal(r.expenses[0].amount, 110);
});

test('filterExpenses claim# is now partial-match (substring case-insensitive)', () => {
  const sample = [
    { id: 'a', date: '2026-05-01', claim: 'ALL-CAT-MIL-552134', category: 'per_diem', amount: 110 },
    { id: 'b', date: '2026-05-02', claim: 'PA09887766',        category: 'per_diem', amount: 110 }
  ];
  // 部分一致: "552134" だけで ALL-CAT-MIL-552134 を引ける
  const r1 = U.filterExpenses(sample, { claim: '552134' });
  assert.equal(r1.length, 1);
  assert.equal(r1[0].id, 'a');
  // case-insensitive 維持
  const r2 = U.filterExpenses(sample, { claim: 'pa098' });
  assert.equal(r2.length, 1);
  assert.equal(r2[0].id, 'b');
});

test('filterExpenses claim# partial match works on carrier-style numbers (PA / 23- / ALL- / USAA-)', () => {
  const sample = [
    { id: 'a', date: '2026-05-01', claim: 'PA09887766',         category: 'per_diem', amount: 110 },
    { id: 'b', date: '2026-05-02', claim: '23-014A789',         category: 'mileage',  amount: 67 },
    { id: 'c', date: '2026-05-03', claim: 'ALL-CAT-MIL-552134', category: 'hotel',    amount: 142 },
    { id: 'd', date: '2026-05-04', claim: 'USAA-3892hnf',       category: 'meals',    amount: 32 }
  ];
  assert.equal(U.filterExpenses(sample, { claim: 'pa' }).length, 1);
  assert.equal(U.filterExpenses(sample, { claim: 'all-cat' }).length, 1);
  assert.equal(U.filterExpenses(sample, { claim: 'USAA' }).length, 1);
  assert.equal(U.filterExpenses(sample, { claim: '23-' }).length, 1);
});

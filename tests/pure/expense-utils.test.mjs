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

test('normalizeExpense rejects malformed date', () => {
  assert.equal(U.normalizeExpense({ date: '2026/05/10', category: 'meals', amount: 12 }), null);
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

// 経費データの純粋関数ユーティリティ。
// ブラウザ (popup.js) と Node テストの両方から使えるよう、
// 末尾で window/module.exports に同じシンボルを公開する。

'use strict';

const CATEGORIES = [
  'per_diem',
  'hotel',
  'mileage',
  'meals',
  'parking',
  'supplies',
  'phone',
  'other'
];

const CATEGORY_LABELS = {
  per_diem: 'Per diem',
  hotel: 'Hotel',
  mileage: 'Mileage',
  meals: 'Meals',
  parking: 'Parking',
  supplies: 'Supplies',
  phone: 'Phone',
  other: 'Other'
};

const FREE_LIMIT = 30;
const DEFAULT_IRS_RATE = 0.725; // 2026 IRS business standard mileage rate $/mi
const MAX_AMOUNT = 1_000_000; // 1 件あたりの上限 ($1M)、誤入力防御

// 経費 1 件を正規化（型・必須欠落・負数を弾く）。
function normalizeExpense(input) {
  if (!input || typeof input !== 'object') return null;
  const date = String(input.date || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const mo = +m[2];
  const dy = +m[3];
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
  const category = CATEGORIES.includes(input.category) ? input.category : 'other';
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return null;
  const miles = input.miles != null && input.miles !== '' ? Number(input.miles) : null;
  const milesSafe = miles != null && Number.isFinite(miles) && miles >= 0 ? miles : null;
  const claim = String(input.claim || '').trim();
  const memo = String(input.memo || '').trim();
  const id = String(input.id || generateId());
  return {
    id,
    date,
    category,
    amount: Math.round(amount * 100) / 100,
    miles: milesSafe,
    claim,
    memo,
    createdAt: Number(input.createdAt) || Date.now()
  };
}

function generateId() {
  return 'exp_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// 走行距離から金額を求める。amount が 0 / 未指定で miles > 0 のみ計算する。
function mileageAmount(miles, rate) {
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  const r = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_IRS_RATE;
  return Math.round(miles * r * 100) / 100;
}

// フィルタ条件に一致する経費を返す（純粋関数）。
function filterExpenses(expenses, filter) {
  if (!Array.isArray(expenses)) return [];
  const f = filter || {};
  return expenses.filter((e) => {
    if (!e) return false;
    if (f.claim && (e.claim || '').toLowerCase() !== String(f.claim).toLowerCase()) return false;
    if (f.category && e.category !== f.category) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    return true;
  });
}

// 合計金額と件数を返す。
function totals(expenses) {
  if (!Array.isArray(expenses)) return { amount: 0, count: 0 };
  let amount = 0;
  for (const e of expenses) {
    if (!e) continue;
    const n = Number(e.amount);
    if (Number.isFinite(n)) amount += n;
  }
  return {
    amount: Math.round(amount * 100) / 100,
    count: expenses.filter(Boolean).length
  };
}

// カテゴリ別小計（Pro レポート用）。
function subtotalsByCategory(expenses) {
  const result = {};
  for (const cat of CATEGORIES) result[cat] = 0;
  if (!Array.isArray(expenses)) return result;
  for (const e of expenses) {
    if (!e || !CATEGORIES.includes(e.category)) continue;
    const n = Number(e.amount);
    if (Number.isFinite(n)) result[e.category] += n;
  }
  for (const k of Object.keys(result)) result[k] = Math.round(result[k] * 100) / 100;
  return result;
}

// claim # 別小計。大文字小文字を無視して集計し、表示用には最初に現れた表記を保持する。
function subtotalsByClaim(expenses) {
  const result = {};
  if (!Array.isArray(expenses)) return result;
  const lowerToDisplay = {};
  const sums = {};
  for (const e of expenses) {
    if (!e) continue;
    const rawKey = e.claim || '(no claim)';
    const lowerKey = rawKey.toLowerCase();
    if (lowerToDisplay[lowerKey] == null) lowerToDisplay[lowerKey] = rawKey;
    if (sums[lowerKey] == null) sums[lowerKey] = 0;
    const n = Number(e.amount);
    if (Number.isFinite(n)) sums[lowerKey] += n;
  }
  for (const lk of Object.keys(sums)) {
    result[lowerToDisplay[lk]] = Math.round(sums[lk] * 100) / 100;
  }
  return result;
}

// CSV エクスポート (RFC 4180 準拠、quotes は二重化)。
function toCSV(expenses) {
  const header = ['date', 'claim', 'category', 'amount', 'miles', 'memo'];
  const rows = [header.join(',')];
  if (!Array.isArray(expenses)) return rows.join('\n');
  for (const e of expenses) {
    if (!e) continue;
    rows.push([
      e.date || '',
      csvEscape(e.claim || ''),
      e.category || '',
      Number(e.amount || 0).toFixed(2),
      e.miles != null ? String(e.miles) : '',
      csvEscape(e.memo || '')
    ].join(','));
  }
  return rows.join('\n');
}

function csvEscape(v) {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// CSV → expense 配列（最低限のパーサ。改行入りクオート対応）。
function parseCSV(text) {
  return parseCSVDetailed(text).expenses;
}

// 詳細版: 取り込み件数とスキップ件数を返す（UI で「20 行中 12 件取り込み・8 件スキップ」通知用）。
function parseCSVDetailed(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { expenses: [], skipped: 0, totalRows: 0 };
  }
  const rows = csvRows(text);
  if (!rows.length) return { expenses: [], skipped: 0, totalRows: 0 };
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const iDate = idx('date');
  const iClaim = idx('claim');
  const iCategory = idx('category');
  const iAmount = idx('amount');
  const iMiles = idx('miles');
  const iMemo = idx('memo');
  const out = [];
  let skipped = 0;
  let totalRows = 0;
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (!cols.length || (cols.length === 1 && cols[0] === '')) continue;
    totalRows++;
    const normalized = normalizeExpense({
      date: iDate >= 0 ? cols[iDate] : '',
      claim: iClaim >= 0 ? cols[iClaim] : '',
      category: iCategory >= 0 ? cols[iCategory] : 'other',
      amount: iAmount >= 0 ? cols[iAmount] : 0,
      miles: iMiles >= 0 ? cols[iMiles] : null,
      memo: iMemo >= 0 ? cols[iMemo] : ''
    });
    if (normalized) out.push(normalized);
    else skipped++;
  }
  return { expenses: out, skipped, totalRows };
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c; // quote 内では \r も \n も cell に保持 (Excel 編集後の往復で memo 改行を壊さない)
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { /* row 終端外の \r のみ skip */ }
      else cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// JSON バックアップフォーマット (将来の version 互換を想定)。
function toBackupJSON(state) {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    deployment: state.deployment || null,
    expenses: Array.isArray(state.expenses) ? state.expenses : []
  }, null, 2);
}

function parseBackupJSON(text) {
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') return { expenses: [], deployment: null };
    const expenses = Array.isArray(obj.expenses) ? obj.expenses.map(normalizeExpense).filter(Boolean) : [];
    return { expenses, deployment: obj.deployment || null };
  } catch (_) {
    return { expenses: [], deployment: null };
  }
}

// 表示用フォーマット。
function formatAmount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '$0.00';
  return '$' + x.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const API = {
  CATEGORIES,
  CATEGORY_LABELS,
  FREE_LIMIT,
  DEFAULT_IRS_RATE,
  MAX_AMOUNT,
  normalizeExpense,
  generateId,
  mileageAmount,
  filterExpenses,
  totals,
  subtotalsByCategory,
  subtotalsByClaim,
  toCSV,
  parseCSV,
  parseCSVDetailed,
  toBackupJSON,
  parseBackupJSON,
  formatAmount
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
if (typeof window !== 'undefined') {
  window.ExpenseUtils = API;
}

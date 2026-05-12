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

// 領収書・QuickBooks/Excel/Concur からのコピペ用に数値を sanitize する。
// "$1,234.50" / "$120" / "1,234.50" / " 120.50 " / "120.50 USD" / "(45.00)" 等を扱う。
// 全角数字 (IME 衝突) は半角化、括弧表記マイナスは負数、それ以外の非数値は NaN。
function sanitizeNumber(input) {
  if (input == null) return NaN;
  if (typeof input === 'number') return input;
  let s = String(input).trim();
  if (!s) return NaN;
  // 全角数字・記号 → 半角 (IME 衝突・コピペ事故対策)
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
       .replace(/．/g, '.')
       .replace(/，/g, ',')
       .replace(/＄/g, '$')
       .replace(/￥/g, '');
  // 会計の括弧表記マイナス "(45.00)" → "-45.00"
  let negative = false;
  const paren = /^\((.+)\)$/.exec(s);
  if (paren) { negative = true; s = paren[1]; }
  // 通貨記号・カンマ・末尾の "USD"/"$" や空白を除去
  s = s.replace(/[ \s]/g, '')
       .replace(/^[-+]?(\$|USD|usd)/, (_m) => _m.startsWith('-') ? '-' : (_m.startsWith('+') ? '+' : ''))
       .replace(/(USD|usd|\$)$/, '')
       .replace(/,/g, '');
  if (negative) s = '-' + s.replace(/^-/, '');
  const n = Number(s);
  return n;
}

// 入力日付を YYYY-MM-DD に正規化。
// HTML5 date input は常に ISO を返すが、CSV import では QuickBooks ("5/12/2026")、
// Excel ("05/12/2026")、Crawford 経費書 ("11-May-2026") など多様な形が来る。
// 認識できないものは null。閏年・月末等の妥当性も簡易チェック。
function parseDateFlexible(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  // 既に YYYY-MM-DD or YYYY-M-D
  let m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(s);
  if (m) return buildISODate(+m[1], +m[2], +m[3]);
  // US 形式 M/D/YYYY or M-D-YYYY (4桁年)
  m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(s);
  if (m) return buildISODate(+m[3], +m[1], +m[2]);
  // M/D/YY (2桁年; 50 未満は 20xx、それ以上は 19xx の慣例)
  m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/.exec(s);
  if (m) {
    const yy = +m[3];
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
    return buildISODate(yyyy, +m[1], +m[2]);
  }
  // D-MMM-YYYY / DD-MMM-YY (Crawford 等の monthly statement)
  const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,4})[-\s](\d{2,4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) {
    let yyyy = +m[3];
    if (yyyy < 100) yyyy = yyyy < 50 ? 2000 + yyyy : 1900 + yyyy;
    return buildISODate(yyyy, MONTHS[m[2].toLowerCase()], +m[1]);
  }
  return null;
}

function buildISODate(yyyy, mo, dy) {
  if (!Number.isFinite(yyyy) || yyyy < 1900 || yyyy > 2100) return null;
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  if (!Number.isFinite(dy) || dy < 1 || dy > 31) return null;
  // 月末・閏年チェック (UTC ベースで day overflow を検出)
  const d = new Date(Date.UTC(yyyy, mo - 1, dy));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== dy) return null;
  return `${yyyy}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
}

// claim # 検索・集計用に余分な区切り (ハイフン・スペース・全角ハイフン) を除去して小文字化。
// 例: "12-345A-678" と "12345A678" を同一視。
function normalizeClaimKey(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[\s\-‐-―−]/g, '');
}

// 経費 1 件を正規化（型・必須欠落・負数を弾く）。
function normalizeExpense(input) {
  if (!input || typeof input !== 'object') return null;
  const date = parseDateFlexible(input.date);
  if (!date) return null;
  const category = CATEGORIES.includes(input.category) ? input.category : 'other';
  const amount = sanitizeNumber(input.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return null;
  const milesRaw = input.miles;
  const miles = milesRaw != null && milesRaw !== '' ? sanitizeNumber(milesRaw) : null;
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
  const m = sanitizeNumber(miles);
  if (!Number.isFinite(m) || m <= 0) return 0;
  const r = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_IRS_RATE;
  return Math.round(m * r * 100) / 100;
}

// フィルタ条件に一致する経費を返す（純粋関数）。
// claim # 検索は normalizeClaimKey で「ハイフン・スペース・大小無視」した上で部分一致。
// → "12345A678" と打って "12-345A-678" / "12 345A 678" がヒットする。
function filterExpenses(expenses, filter) {
  if (!Array.isArray(expenses)) return [];
  const f = filter || {};
  const needleClaim = f.claim ? normalizeClaimKey(f.claim) : '';
  return expenses.filter((e) => {
    if (!e) return false;
    if (needleClaim && !normalizeClaimKey(e.claim || '').includes(needleClaim)) return false;
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

// OWASP CSV Injection 対策: =, +, -, @, TAB, CR で始まるセルは Excel/Sheets で式と解釈される。
// アタッカーが memo に "=HYPERLINK(""http://evil"",""click"")" を仕込むと IA が CSV を Excel で
// 開いた瞬間に悪意リンクをクリックしてしまう (2014 OWASP, Comma Separated Vulnerabilities)。
// 対策: 該当先頭文字の前にシングルクオート ' を付けて式評価を抑止。Excel/Sheets/Numbers 共通。
function csvSanitize(v) {
  const s = String(v);
  if (s.length === 0) return s;
  // \t, \r, =, +, -, @ で始まるセルに ' プレフィックスを付加
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

function csvEscape(v) {
  const s = csvSanitize(v);
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
  // UTF-8 BOM (Excel / Google Sheets 標準) を除去。BOM 残ると header 'date' が '﻿date' になり認識失敗。
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
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
  sanitizeNumber,
  parseDateFlexible,
  normalizeClaimKey,
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

const extpay = ExtPay('adjuster-expense-logger');
const U = window.ExpenseUtils;

let state = {
  expenses: [],
  deployment: { name: '', event: '', start: '', end: '' },
  isPaid: false,
  irsRate: U.DEFAULT_IRS_RATE,
  filter: {}
};

const $ = (s) => document.querySelector(s);
const SELF_PROMO_ID = 'adjuster-expense';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadData();
  setTodayInForm();
  render();
  bindEvents();
  bindStorageSync();
  if (typeof initCrossPromo === 'function') initCrossPromo(SELF_PROMO_ID);
}

// 別 popup や別タブからの変更を本 popup に反映 (二重起動 race 対策)。
function bindStorageSync() {
  if (!chrome.storage || !chrome.storage.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let touched = false;
    if (changes.expenses) {
      const v = changes.expenses.newValue;
      state.expenses = Array.isArray(v) ? v.map(U.normalizeExpense).filter(Boolean) : [];
      touched = true;
    }
    if (changes.deployment) {
      state.deployment = changes.deployment.newValue || { name: '', event: '', start: '', end: '' };
      touched = true;
    }
    if (changes.isPaid) {
      state.isPaid = !!changes.isPaid.newValue;
      touched = true;
    }
    if (changes.irsRate) {
      const r = Number(changes.irsRate.newValue);
      state.irsRate = Number.isFinite(r) && r > 0 ? r : U.DEFAULT_IRS_RATE;
    }
    if (touched) render();
  });
}

async function loadData() {
  const data = await chrome.storage.local.get(['expenses', 'deployment', 'isPaid', 'irsRate']);
  state.expenses = Array.isArray(data.expenses) ? data.expenses.map(U.normalizeExpense).filter(Boolean) : [];
  state.deployment = data.deployment || { name: '', event: '', start: '', end: '' };
  state.isPaid = !!data.isPaid;
  state.irsRate = Number.isFinite(Number(data.irsRate)) && Number(data.irsRate) > 0
    ? Number(data.irsRate)
    : U.DEFAULT_IRS_RATE;

  // ExtensionPay の onPaid 取りこぼし救済 (SW 再起動対応)。
  // - paid=true のみローカルに同期する (購入直後にネット越しで確認できた時)
  // - paid=false で storage を上書きしない: 既に課金済みのユーザーが extpay.com にアクセスできない
  //   時 (オフライン / DNS / 障害) に Pro 失効するのを防ぐ。これは ExtensionPay 系拡張の業界標準。
  try {
    const user = await extpay.getUser();
    if (user.paid && !state.isPaid) {
      state.isPaid = true;
      chrome.storage.local.set({ isPaid: true });
    }
  } catch (_) {}
}

function persistExpenses() {
  return chrome.storage.local.set({ expenses: state.expenses });
}

function setTodayInForm() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  $('#f-date').value = `${yyyy}-${mm}-${dd}`;
}

function render() {
  renderDeployment();
  renderTotals();
  renderList();
  renderQuota();
}

function renderDeployment() {
  const d = state.deployment || {};
  const hasAny = d.name || d.event || d.start || d.end;
  $('#deployment-name').textContent = hasAny ? (d.event || d.name || 'Deployment') : 'No deployment set';
  let meta = '';
  if (d.start || d.end) meta += (d.start || '?') + ' → ' + (d.end || '?');
  if (d.name && d.event) meta += (meta ? ' · ' : '') + d.name;
  $('#deployment-meta').textContent = meta;
}

function renderTotals() {
  const filtered = U.filterExpenses(state.expenses, state.filter);
  const t = U.totals(filtered);
  $('#total-amount').textContent = U.formatAmount(t.amount);
  $('#total-count').textContent = t.count === 1 ? '1 entry' : t.count + ' entries';
}

function renderList() {
  const filtered = U.filterExpenses(state.expenses, state.filter)
    .slice()
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const list = $('#expense-list');
  list.innerHTML = '';
  if (!filtered.length) {
    $('#list-empty').classList.remove('hidden');
    return;
  }
  $('#list-empty').classList.add('hidden');
  for (const e of filtered) {
    const li = document.createElement('li');
    li.className = 'expense-item';
    const left = document.createElement('div');
    left.className = 'left';
    const dateClaim = document.createElement('span');
    dateClaim.className = 'date-claim';
    dateClaim.textContent = e.date + (e.claim ? ' · #' + e.claim : '');
    const catMemo = document.createElement('span');
    catMemo.className = 'cat-memo';
    const label = U.CATEGORY_LABELS[e.category] || e.category;
    catMemo.textContent = e.memo ? `${label} — ${e.memo}` : label;
    catMemo.title = catMemo.textContent;
    left.appendChild(dateClaim);
    left.appendChild(catMemo);
    const amt = document.createElement('span');
    amt.className = 'amount';
    amt.textContent = U.formatAmount(e.amount);
    const del = document.createElement('button');
    del.className = 'del-btn';
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete');
    del.title = 'Delete';
    del.textContent = '×';
    del.addEventListener('click', () => handleDelete(e.id));
    li.appendChild(left);
    li.appendChild(amt);
    li.appendChild(del);
    list.appendChild(li);
  }
}

function renderQuota() {
  const info = $('#quota-info');
  if (state.isPaid) {
    info.textContent = 'Pro · Unlimited';
    info.classList.remove('over');
    $('#btn-export-pdf').textContent = 'Export PDF';
  } else {
    const n = state.expenses.length;
    info.textContent = `Free · ${n}/${U.FREE_LIMIT}`;
    info.classList.toggle('over', n >= U.FREE_LIMIT);
    $('#btn-export-pdf').textContent = 'Export PDF (Pro)';
  }
}

function bindEvents() {
  // Add expense flow
  $('#btn-toggle-add').addEventListener('click', () => {
    $('#form-fields').classList.toggle('hidden');
    $('#btn-toggle-add').classList.toggle('hidden');
  });
  $('#btn-cancel-add').addEventListener('click', cancelAdd);
  $('#btn-save-add').addEventListener('click', handleSaveExpense);
  $('#f-category').addEventListener('change', () => {
    const isMileage = $('#f-category').value === 'mileage';
    $('#f-miles').classList.toggle('hidden', !isMileage);
  });

  // Filter
  $('#btn-filter').addEventListener('click', openFilter);
  $('#btn-filter-apply').addEventListener('click', applyFilter);
  $('#btn-filter-clear').addEventListener('click', clearFilter);

  // Deployment
  $('#btn-edit-deployment').addEventListener('click', openDeployment);
  $('#btn-deployment-save').addEventListener('click', saveDeployment);
  $('#btn-deployment-cancel').addEventListener('click', () => closeModal('#deployment-modal'));

  // Settings
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-settings-save').addEventListener('click', saveSettings);
  $('#btn-settings-close').addEventListener('click', () => closeModal('#settings-modal'));

  // Export / Import
  $('#btn-export-csv').addEventListener('click', exportCSV);
  $('#btn-export-pdf').addEventListener('click', exportPDF);
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', handleImport);

  // Upgrade modal
  $('#btn-upgrade').addEventListener('click', () => extpay.openPaymentPage());
  $('#btn-upgrade-close').addEventListener('click', closeUpgrade);

  extpay.onPaid.addListener(() => {
    state.isPaid = true;
    chrome.storage.local.set({ isPaid: true });
    closeUpgrade();
    render();
  });
}

function cancelAdd() {
  $('#form-fields').classList.add('hidden');
  $('#btn-toggle-add').classList.remove('hidden');
  clearFormFields();
}

function clearFormFields() {
  $('#f-amount').value = '';
  $('#f-miles').value = '';
  $('#f-claim').value = '';
  $('#f-memo').value = '';
  $('#f-category').value = 'per_diem';
  $('#f-miles').classList.add('hidden');
  setTodayInForm();
}

async function handleSaveExpense() {
  if (!state.isPaid && state.expenses.length >= U.FREE_LIMIT) {
    showUpgrade();
    return;
  }
  const date = $('#f-date').value;
  const category = $('#f-category').value;
  let amount = Number($('#f-amount').value);
  const miles = $('#f-miles').value === '' ? null : Number($('#f-miles').value);
  const claim = $('#f-claim').value.trim();
  const memo = $('#f-memo').value.trim();

  // mileage カテゴリで amount 未入力なら miles × rate を充当
  if (category === 'mileage' && (!Number.isFinite(amount) || amount <= 0) && miles != null && miles > 0) {
    amount = U.mileageAmount(miles, state.irsRate);
  }

  const normalized = U.normalizeExpense({ date, category, amount, miles, claim, memo });
  if (!normalized) {
    flash($('#f-amount'));
    return;
  }
  state.expenses.push(normalized);
  await persistExpenses();
  cancelAdd();
  render();
}

async function handleDelete(id) {
  const idx = state.expenses.findIndex((e) => e.id === id);
  if (idx < 0) return;
  state.expenses.splice(idx, 1);
  await persistExpenses();
  render();
}

function openFilter() {
  $('#flt-claim').value = state.filter.claim || '';
  $('#flt-category').value = state.filter.category || '';
  $('#flt-from').value = state.filter.from || '';
  $('#flt-to').value = state.filter.to || '';
  $('#filter-modal').classList.remove('hidden');
}

function applyFilter() {
  state.filter = {
    claim: $('#flt-claim').value.trim(),
    category: $('#flt-category').value,
    from: $('#flt-from').value,
    to: $('#flt-to').value
  };
  closeModal('#filter-modal');
  render();
}

function clearFilter() {
  state.filter = {};
  $('#flt-claim').value = '';
  $('#flt-category').value = '';
  $('#flt-from').value = '';
  $('#flt-to').value = '';
  closeModal('#filter-modal');
  render();
}

function openDeployment() {
  const d = state.deployment || {};
  $('#dep-name').value = d.name || '';
  $('#dep-event').value = d.event || '';
  $('#dep-start').value = d.start || '';
  $('#dep-end').value = d.end || '';
  $('#deployment-modal').classList.remove('hidden');
}

async function saveDeployment() {
  state.deployment = {
    name: $('#dep-name').value.trim(),
    event: $('#dep-event').value.trim(),
    start: $('#dep-start').value,
    end: $('#dep-end').value
  };
  await chrome.storage.local.set({ deployment: state.deployment });
  closeModal('#deployment-modal');
  render();
}

function openSettings() {
  $('#set-irs-rate').value = state.irsRate;
  $('#settings-paid-status').textContent = state.isPaid ? 'Pro plan: unlocked.' : 'Free plan.';
  $('#settings-modal').classList.remove('hidden');
}

async function saveSettings() {
  const rate = Number($('#set-irs-rate').value);
  if (Number.isFinite(rate) && rate > 0) {
    state.irsRate = rate;
    await chrome.storage.local.set({ irsRate: rate });
  }
  closeModal('#settings-modal');
}

function closeModal(sel) {
  $(sel).classList.add('hidden');
}

function showUpgrade() {
  $('#upgrade-modal').classList.remove('hidden');
}

function closeUpgrade() {
  $('#upgrade-modal').classList.add('hidden');
}

function exportCSV() {
  const filtered = U.filterExpenses(state.expenses, state.filter);
  const csv = U.toCSV(filtered);
  downloadBlob(csv, filename('csv'), 'text/csv;charset=utf-8');
}

async function exportPDF() {
  if (!state.isPaid) {
    showUpgrade();
    return;
  }
  const filtered = U.filterExpenses(state.expenses, state.filter);
  if (!filtered.length) {
    alert('No expenses match the current filter.');
    return;
  }
  const bytes = await buildExpensePdf({
    deployment: state.deployment,
    expenses: filtered.slice().sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id))
  });
  downloadBlob(bytes, filename('pdf'), 'application/pdf');
}

// WinAnsi (Latin-1) 範囲外を ? に置換。pdf-lib StandardFonts.Helvetica は WinAnsi 限定。
// スマートクオート (Word/Outlook 自動補正) は ASCII に正規化してから ? 置換にかける。
function winAnsiSafe(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[Ā-￿]/g, '?');
}

async function buildExpensePdf({ deployment, expenses }) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const pageW = 612;
  const pageH = 792;
  const lineH = 14;

  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  function drawText(text, opts = {}) {
    page.drawText(winAnsiSafe(text), {
      x: opts.x != null ? opts.x : margin,
      y,
      size: opts.size || 10,
      font: opts.bold ? fontBold : font,
      color: opts.color || rgb(0.1, 0.15, 0.25)
    });
  }

  function newLine(h) { y -= (h || lineH); ensurePage(); }
  // ページ追加が起きたら true を返す (改ページ直後にテーブルヘッダを再描画するため)。
  function ensurePage() {
    if (y < margin + 40) {
      page = pdf.addPage([pageW, pageH]);
      y = pageH - margin;
      return true;
    }
    return false;
  }
  function drawTableHeader() {
    drawText('Date', { x: cols.date.x, size: 9, bold: true });
    drawText('Claim #', { x: cols.claim.x, size: 9, bold: true });
    drawText('Category', { x: cols.category.x, size: 9, bold: true });
    drawText('Description', { x: cols.memo.x, size: 9, bold: true });
    drawText('Amount', { x: cols.amount.x, size: 9, bold: true });
    page.drawLine({
      start: { x: margin, y: y - 4 },
      end: { x: pageW - margin, y: y - 4 },
      thickness: 0.5,
      color: rgb(0.7, 0.75, 0.8)
    });
    y -= lineH;
  }

  // ----- Header
  drawText('Adjuster Expense Report', { size: 18, bold: true });
  newLine(22);
  const d = deployment || {};
  if (d.name) { drawText('Adjuster: ' + d.name, { size: 10 }); newLine(); }
  if (d.event) { drawText('Event: ' + d.event, { size: 10 }); newLine(); }
  if (d.start || d.end) {
    drawText('Period: ' + (d.start || '?') + ' to ' + (d.end || '?'), { size: 10 });
    newLine();
  }
  drawText('Generated: ' + new Date().toISOString().slice(0, 10), { size: 9, color: rgb(0.45, 0.5, 0.55) });
  newLine(20);

  // ----- Table header
  const cols = {
    date: { x: margin, w: 70 },
    claim: { x: margin + 75, w: 80 },
    category: { x: margin + 160, w: 80 },
    memo: { x: margin + 245, w: 200 },
    amount: { x: margin + 450, w: 60 }
  };
  drawTableHeader();

  // ----- Table rows
  for (const e of expenses) {
    // 改ページが起きたらヘッダを再描画 (致命修正)
    if (ensurePage()) drawTableHeader();
    drawText(e.date, { x: cols.date.x, size: 9 });
    drawText(truncate(e.claim, 14), { x: cols.claim.x, size: 9 });
    drawText(U.CATEGORY_LABELS[e.category] || e.category, { x: cols.category.x, size: 9 });
    let desc = e.memo || '';
    if (e.category === 'mileage' && e.miles != null) {
      desc = (e.memo ? e.memo + ' · ' : '') + e.miles + ' mi';
    }
    drawText(truncate(desc, 36), { x: cols.memo.x, size: 9 });
    drawText('$' + Number(e.amount).toFixed(2), { x: cols.amount.x, size: 9 });
    newLine();
  }

  newLine(8);
  page.drawLine({
    start: { x: margin, y: y + 8 },
    end: { x: pageW - margin, y: y + 8 },
    thickness: 0.5,
    color: rgb(0.7, 0.75, 0.8)
  });
  newLine(4);

  // ----- Subtotals by category
  drawText('Subtotals by category', { size: 11, bold: true });
  newLine();
  const catSub = U.subtotalsByCategory(expenses);
  for (const cat of U.CATEGORIES) {
    if (catSub[cat] <= 0) continue;
    ensurePage();
    drawText(U.CATEGORY_LABELS[cat], { x: margin + 12, size: 9 });
    drawText('$' + catSub[cat].toFixed(2), { x: cols.amount.x, size: 9 });
    newLine();
  }

  newLine(6);
  drawText('Subtotals by claim #', { size: 11, bold: true });
  newLine();
  const claimSub = U.subtotalsByClaim(expenses);
  for (const k of Object.keys(claimSub).sort()) {
    ensurePage();
    drawText(k, { x: margin + 12, size: 9 });
    drawText('$' + claimSub[k].toFixed(2), { x: cols.amount.x, size: 9 });
    newLine();
  }

  newLine(10);
  const totals = U.totals(expenses);
  drawText('TOTAL', { size: 12, bold: true });
  drawText('$' + totals.amount.toFixed(2), { x: cols.amount.x, size: 12, bold: true });
  newLine(20);

  // Footer disclaimer (Lawrence 強化版: TurboTax 水準の責任限定)
  drawText(
    'Generated by Adjuster Expense Logger. Personal expense summary; not tax or legal advice. No warranty. Verify with your CPA, IA company, and IRS rules before submitting.',
    { size: 7, color: rgb(0.55, 0.6, 0.65) }
  );

  return await pdf.save();
}

function truncate(s, max) {
  const str = String(s == null ? '' : s);
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

async function handleImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  e.target.value = '';
  let imported = [];
  let skipped = 0;
  let totalRows = 0;
  if (file.name.toLowerCase().endsWith('.json')) {
    const parsed = U.parseBackupJSON(text);
    imported = parsed.expenses;
    if (parsed.deployment && !state.deployment.event) {
      state.deployment = parsed.deployment;
      await chrome.storage.local.set({ deployment: state.deployment });
    }
  } else {
    const detailed = U.parseCSVDetailed(text);
    imported = detailed.expenses;
    skipped = detailed.skipped;
    totalRows = detailed.totalRows;
  }
  if (!imported.length) {
    alert(totalRows
      ? `No usable expenses found. ${totalRows} rows scanned, all rejected (missing date or invalid amount).`
      : 'No expenses found in file.');
    return;
  }

  // Free プランの上限を import 経由で迂回されないようにする (致命 3)。
  const room = state.isPaid ? Infinity : Math.max(0, U.FREE_LIMIT - state.expenses.length);
  let droppedDueToCap = 0;
  if (imported.length > room) {
    droppedDueToCap = imported.length - room;
    imported = imported.slice(0, room);
  }

  const existingIds = new Set(state.expenses.map((x) => x.id));
  for (const exp of imported) {
    if (existingIds.has(exp.id)) exp.id = U.generateId();
    state.expenses.push(exp);
  }
  await persistExpenses();
  render();

  // 取り込み結果サマリ (致命 6: 部分失敗の無音 drop 防御)。
  const notes = [`Imported ${imported.length}.`];
  if (skipped > 0) notes.push(`Skipped ${skipped} row${skipped === 1 ? '' : 's'} (missing date or invalid amount).`);
  if (droppedDueToCap > 0) {
    notes.push(`Dropped ${droppedDueToCap} extra row${droppedDueToCap === 1 ? '' : 's'}: Free plan caps at ${U.FREE_LIMIT}. Upgrade to import everything.`);
  }
  alert(notes.join('\n'));
  if (droppedDueToCap > 0 && !state.isPaid) showUpgrade();
}

function downloadBlob(content, name, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function filename(ext) {
  const d = state.deployment || {};
  const slug = (d.event || 'expenses').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
  const today = new Date().toISOString().slice(0, 10);
  return `adjuster-expenses_${slug}_${today}.${ext}`;
}

function flash(el) {
  el.style.outline = '2px solid #dc2626';
  setTimeout(() => { el.style.outline = ''; }, 800);
}

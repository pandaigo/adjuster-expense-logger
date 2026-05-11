// クロスプロモbanner: popup下部に他拡張を表示し、CWSへ送客する
// 使い方: popup.html で <script src="cross-promo.js"></script> を読み込み、
//         <div id="cross-promo"></div> を footer の直前に置く
// 各拡張の popup.js で initCrossPromo('quickreply') のように selfId を渡して呼ぶ

const CROSS_PROMO_DISMISS_HOURS = 24;
const CROSS_PROMO_DISMISS_KEY = 'crossPromoDismissUntil';

async function initCrossPromo(selfId) {
  const container = document.getElementById('cross-promo');
  if (!container) return;

  const dismissed = await isCrossPromoDismissed();
  if (dismissed) return;

  const data = await loadCrossPromoData();
  if (!data) return;

  const target = pickPromoTarget(data, selfId);
  if (!target) return;

  renderCrossPromo(container, target);
}

async function isCrossPromoDismissed() {
  const stored = await chrome.storage.local.get([CROSS_PROMO_DISMISS_KEY]);
  const until = stored[CROSS_PROMO_DISMISS_KEY] || 0;
  return Date.now() < until;
}

async function loadCrossPromoData() {
  try {
    const url = chrome.runtime.getURL('promo-data.json');
    const res = await fetch(url);
    return await res.json();
  } catch (_) {
    return null;
  }
}

function pickPromoTarget(data, selfId) {
  const all = (data.promotions || []).filter((p) => p.id !== selfId);
  if (all.length === 0) return null;

  const affinityIds = (data.affinity && data.affinity[selfId]) || [];
  const affinity = all.filter((p) => affinityIds.includes(p.id));
  const pool = affinity.length > 0 ? affinity : all;

  return pool[Math.floor(Math.random() * pool.length)];
}

function renderCrossPromo(container, target) {
  container.innerHTML = '';
  container.classList.remove('hidden');

  const banner = document.createElement('div');
  banner.className = 'cross-promo-banner';

  const icon = document.createElement('span');
  icon.className = 'cross-promo-icon';
  icon.textContent = target.icon || '⭐';

  const text = document.createElement('div');
  text.className = 'cross-promo-text';
  const name = document.createElement('div');
  name.className = 'cross-promo-name';
  name.textContent = target.name;
  const tagline = document.createElement('div');
  tagline.className = 'cross-promo-tagline';
  tagline.textContent = target.tagline;
  text.appendChild(name);
  text.appendChild(tagline);

  const tryBtn = document.createElement('button');
  tryBtn.className = 'cross-promo-try';
  tryBtn.textContent = 'Try it';
  tryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.tabs.create({ url: target.cwsUrl });
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'cross-promo-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissCrossPromo(container);
  });

  banner.appendChild(icon);
  banner.appendChild(text);
  banner.appendChild(tryBtn);
  banner.appendChild(closeBtn);
  container.appendChild(banner);
}

async function dismissCrossPromo(container) {
  const until = Date.now() + CROSS_PROMO_DISMISS_HOURS * 60 * 60 * 1000;
  await chrome.storage.local.set({ [CROSS_PROMO_DISMISS_KEY]: until });
  container.classList.add('hidden');
  container.innerHTML = '';
}

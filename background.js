importScripts('ExtPay.js');
const extpay = ExtPay('adjuster-expense-logger');
extpay.startBackground();

// 決済直後の onPaid 取りこぼし救済 (Service Worker 再起動対策)
extpay.onPaid.addListener(() => {
  chrome.storage.local.set({ isPaid: true });
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    const user = await extpay.getUser();
    if (user.paid) await chrome.storage.local.set({ isPaid: true });
  } catch (_) {}
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const user = await extpay.getUser();
    if (user.paid) await chrome.storage.local.set({ isPaid: true });
  } catch (_) {}
});

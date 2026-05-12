// i18n 静的検査スクリプト
//
// 検査項目:
//   1. 全ロケールが en (default_locale) と同じキーセットを持つか
//   2. JSON parse できるか
//   3. CWS 制限文字数 (extName <= 75, extDescription <= 132) を満たすか
//   4. message プレースホルダ ($X$ や __MSG_*__) の残留がないか
//   5. 翻訳漏れ (en と同じテキスト = 未翻訳) を warn 通知
//
// 実行: node scripts/i18n-check.mjs

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, '_locales');

// 1. default_locale を manifest から取得
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8'));
const defaultLocale = manifest.default_locale || 'en';

// CWS 制限 (2026-05 時点)
const LIMITS = {
  extName: 75,           // Extension name max
  extDescription: 132    // Short description max
};

const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); console.log(`  ERROR ${msg}`); }
function warn(msg) { warnings.push(msg); console.log(`  WARN  ${msg}`); }
function ok(msg) { console.log(`  OK    ${msg}`); }

// 2. 全ロケール読み込み
const locales = readdirSync(localesDir).filter((d) => {
  try { return existsSync(join(localesDir, d, 'messages.json')); }
  catch (_) { return false; }
});

console.log(`\n=== i18n check (${locales.length} locales) ===\n`);
console.log(`default_locale: ${defaultLocale}\n`);

const parsed = {};
for (const loc of locales) {
  const path = join(localesDir, loc, 'messages.json');
  try {
    parsed[loc] = JSON.parse(readFileSync(path, 'utf-8'));
    ok(`${loc}: JSON parse OK`);
  } catch (e) {
    err(`${loc}: JSON parse failed — ${e.message}`);
    parsed[loc] = null;
  }
}
console.log('');

if (!parsed[defaultLocale]) {
  err(`default_locale (${defaultLocale}) が読めない、これ以上検査できない`);
  process.exit(1);
}

const defaultKeys = Object.keys(parsed[defaultLocale]);
console.log(`default_locale keys (${defaultKeys.length}): ${defaultKeys.join(', ')}\n`);

// 3. 各ロケールでキー欠落・余剰・文字数・プレースホルダ・未翻訳をチェック
for (const loc of locales) {
  const m = parsed[loc];
  if (!m) continue;
  const keys = Object.keys(m);

  // キー欠落
  const missing = defaultKeys.filter((k) => !keys.includes(k));
  if (missing.length) err(`${loc}: 欠落キー [${missing.join(', ')}]`);

  // 余剰キー
  const extra = keys.filter((k) => !defaultKeys.includes(k));
  if (extra.length) warn(`${loc}: 未使用キー [${extra.join(', ')}]`);

  // 各キーごとに検査
  for (const k of defaultKeys) {
    if (!m[k]) continue;
    const msg = m[k].message;
    if (typeof msg !== 'string') {
      err(`${loc}.${k}: message が string でない (${typeof msg})`);
      continue;
    }

    // CWS 制限文字数
    if (LIMITS[k] && msg.length > LIMITS[k]) {
      err(`${loc}.${k}: ${msg.length} 字 > 上限 ${LIMITS[k]} 字 — CWS リジェクト確実\n           "${msg}"`);
    }

    // __MSG_*__ プレースホルダ残留 (翻訳漏れの一種)
    if (/__MSG_\w+__/.test(msg)) {
      err(`${loc}.${k}: __MSG_*__ プレースホルダ残留 — "${msg}"`);
    }

    // $X$ 形式の name placeholder (使ってないので残留は警告)
    if (/\$\w+\$/.test(msg) && !m[k].placeholders) {
      warn(`${loc}.${k}: "$name$" 形式の placeholder があるが placeholders 定義なし`);
    }

    // 未翻訳 (en と同じテキストが他言語に残っている)
    if (loc !== defaultLocale) {
      const enMsg = parsed[defaultLocale][k] && parsed[defaultLocale][k].message;
      if (enMsg && msg === enMsg && msg.length > 20) {
        // 20字未満は固有名詞/商標扱いでスルー (e.g., "Pro")
        warn(`${loc}.${k}: en と同一テキスト (未翻訳の可能性) — "${msg.substring(0, 50)}..."`);
      }
    }
  }
}

console.log('');
console.log('=== Summary ===');
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);

if (errors.length) {
  console.log('\n=== Errors ===');
  errors.forEach((e) => console.log('  - ' + e));
  process.exit(1);
}
process.exit(0);

// 軽量スモークテスト: 拡張機能の整合性を機械的に検査
// HTML/JS の ID 整合性、CSP適合、manifest妥当性、CommonJS で完結
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function ok(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { errors.push(msg); console.log(`  ✗ ${msg}`); }

console.log('\n=== Smoke Test ===\n');

// 1. manifest.json 妥当性
console.log('[1] manifest.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8'));
  ok('JSON parse OK');
  if (manifest.manifest_version !== 3) fail('manifest_version is not 3');
  else ok('manifest_version: 3');
  if (!manifest.name || !manifest.version || !manifest.description) fail('name/version/description missing');
  else ok('name / version / description present');
  if (manifest.description.length > 132) fail(`description too long: ${manifest.description.length} chars (max 132)`);
  else ok(`description length: ${manifest.description.length} chars`);
  const hostPerms = manifest.host_permissions;
  if (hostPerms && hostPerms.includes('<all_urls>')) fail('host_permissions contains <all_urls>');
  else ok('no <all_urls> in host_permissions');
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.matches) && cs.matches.includes('<all_urls>')) {
        fail(`content_scripts matches contains <all_urls>`);
      }
    }
    ok('no <all_urls> in content_scripts');
  }
} catch (e) {
  fail(`manifest.json parse error: ${e.message}`);
}

// 2. HTML/JS の ID 整合性（popup.html と popup.js）
console.log('\n[2] popup.html <-> popup.js ID 整合性');
const html = readFileSync(join(root, 'popup.html'), 'utf-8');
const js = readFileSync(join(root, 'popup.js'), 'utf-8');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const jsRefs = new Set([...js.matchAll(/\$\(['"]#([^'"\s]+)['"]\)/g)].map(m => m[1]));
[...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].forEach(m => jsRefs.add(m[1]));
const missing = [...jsRefs].filter(id => !htmlIds.has(id));
if (missing.length > 0) fail(`JSが参照しているがHTMLに存在しないID: ${missing.join(', ')}`);
else ok(`JS参照IDすべてHTMLに存在 (${jsRefs.size}件)`);

// 3. CSP 違反検出
console.log('\n[3] CSP適合チェック');
const htmlFiles = ['popup.html'];
if (existsSync(join(root, 'welcome.html'))) htmlFiles.push('welcome.html');
for (const file of htmlFiles) {
  const content = readFileSync(join(root, file), 'utf-8');
  const inlineScripts = [...content.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .filter(m => m[1].trim().length > 0);
  if (inlineScripts.length > 0) fail(`${file}: inline script (CSP違反)`);
  else ok(`${file}: no inline scripts`);
  const inlineHandlers = [...content.matchAll(/\son(click|change|input|submit|load|error|focus|blur)=/gi)];
  if (inlineHandlers.length > 0) fail(`${file}: inline event handler (CSP違反)`);
  else ok(`${file}: no inline event handlers`);
  if (/javascript:/i.test(content)) fail(`${file}: javascript: URL`);
  else ok(`${file}: no javascript: URLs`);
}

// 4. JS 文法チェック
console.log('\n[4] JS 文法チェック');
const jsFiles = ['popup.js', 'background.js'];
if (existsSync(join(root, 'welcome.js'))) jsFiles.push('welcome.js');
for (const file of jsFiles) {
  const content = readFileSync(join(root, file), 'utf-8');
  try {
    new Function(content);
    ok(`${file}: 文法OK`);
  } catch (e) {
    if (e instanceof SyntaxError) fail(`${file}: SyntaxError: ${e.message}`);
    else ok(`${file}: 文法OK (実行時例外は無視)`);
  }
}

// 5. 必須ファイル存在
console.log('\n[5] 必須ファイル存在');
const required = [
  'manifest.json', 'background.js', 'ExtPay.js',
  'popup.html', 'popup.css', 'popup.js',
  'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png',
  'store/description.txt', 'store/privacy-policy.html'
];
for (const f of required) {
  if (existsSync(join(root, f))) ok(f);
  else fail(`MISSING: ${f}`);
}

console.log(`\n=== Result ===`);
console.log(`OK: ${errors.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) {
  errors.forEach(e => console.log(`  - ${e}`));
  process.exit(1);
}
process.exit(0);

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, unlinkSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const name = 'adjuster-expense-logger';
const outZip = join(root, `${name}.zip`);
const tmp = join(root, '_zip_tmp');

if (existsSync(outZip)) unlinkSync(outZip);

const include = [
  'manifest.json',
  'background.js',
  'ExtPay.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'cross-promo.js',
  'cross-promo.css',
  'promo-data.json',
  '_locales/en/messages.json',
  '_locales/ja/messages.json',
  '_locales/es/messages.json',
  '_locales/pt_BR/messages.json',
  '_locales/de/messages.json',
  '_locales/fr/messages.json',
  '_locales/it/messages.json',
  '_locales/ko/messages.json',
  '_locales/zh_CN/messages.json',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

// オプショナル: 存在すれば自動で同梱
const optional = [
  'welcome.html',
  'welcome.js',
  'lib/csv-utils.js',
  'lib/expense-utils.js',
  'libs/pdf-lib.min.js'
];
for (const file of optional) {
  if (existsSync(join(root, file))) include.push(file);
}

if (existsSync(tmp)) execSync(`cmd /c "rmdir /s /q ${tmp}"`, { stdio: 'ignore' });

for (const file of include) {
  const src = join(root, file);
  const dest = join(tmp, file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

execSync(
  `powershell -Command "Compress-Archive -Path '${join(tmp, '*')}' -DestinationPath '${outZip}' -Force"`,
  { stdio: 'inherit' }
);

execSync(`cmd /c "rmdir /s /q ${tmp}"`, { stdio: 'ignore' });

console.log(`\nCreated: ${outZip}`);

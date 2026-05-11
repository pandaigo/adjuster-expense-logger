// e2e / spec-e2e のスクリーンショットをエビデンス配下にコピー
//
// 使い方: node scripts/save-screenshots.mjs
// e2e 実行後（screenshots/ や screenshots-spec/ が生成された後）に走らせる

import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dstBase = join(root, 'store', 'test-evidence', 'screenshots');
if (existsSync(dstBase)) rmSync(dstBase, { recursive: true, force: true });
mkdirSync(dstBase, { recursive: true });

const targets = [
  { src: join(root, 'screenshots'), dst: join(dstBase, 'e2e') },
  { src: join(root, 'screenshots-spec'), dst: join(dstBase, 'spec') },
];

for (const t of targets) {
  if (!existsSync(t.src)) {
    console.log(`[SKIP] ${t.src} not found`);
    continue;
  }
  mkdirSync(t.dst, { recursive: true });
  const files = readdirSync(t.src).filter(f => f.toLowerCase().endsWith('.png'));
  for (const f of files) {
    copyFileSync(join(t.src, f), join(t.dst, f));
  }
  console.log(`[OK] ${t.dst} (${files.length} files)`);
}

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'icons');
mkdirSync(outDir, { recursive: true });

// 経費帳: $ + 横線3本の ledger 風アイコン
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1E3A5F"/>
      <stop offset="100%" style="stop-color:#0F2540"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="120" height="120" rx="24" fill="url(#bg)"/>
  <text x="64" y="80" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="800" fill="#FFFFFF">$</text>
  <rect x="28" y="96" width="72" height="4" rx="2" fill="#93C5FD"/>
  <rect x="36" y="108" width="56" height="4" rx="2" fill="#93C5FD" opacity="0.7"/>
</svg>`;

for (const size of [16, 48, 128]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon${size}.png`));
  console.log(`Generated icon${size}.png`);
}

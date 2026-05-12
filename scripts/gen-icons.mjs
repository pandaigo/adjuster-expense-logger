import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'icons');
mkdirSync(outDir, { recursive: true });

// IA 経費トラッカーのアイコン (3 ペルソナレビュー 2026-05-12 反映):
// - $ 単体だと 16px で潰れ「IA / 経費」を喚起しない → クリップボード枠 + $ + 道路点線で複合化
// - 上端のクリップで「書類記録」シルエット、下半分の点線で「マイレージ」喚起
// - 16px でも要素が識別できるよう各 stroke は太め
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1E3A5F"/>
      <stop offset="100%" style="stop-color:#0F2540"/>
    </linearGradient>
  </defs>
  <!-- 背景: 角丸 squircle (信頼色の青系グラデ) -->
  <rect x="4" y="4" width="120" height="120" rx="24" fill="url(#bg)"/>

  <!-- クリップボードのクリップ部 (上端、書類記録の喚起) -->
  <rect x="50" y="14" width="28" height="14" rx="3" fill="#FCD34D"/>
  <rect x="54" y="10" width="20" height="8" rx="2" fill="#FCD34D"/>

  <!-- クリップボードのページ本体 (白い書類) -->
  <rect x="24" y="26" width="80" height="88" rx="6" fill="#F8FAFC"/>

  <!-- $ 記号 (中央上半) -->
  <text x="64" y="74" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="900" fill="#1E3A5F">$</text>

  <!-- 道路点線 (下半、マイレージ喚起) -->
  <line x1="32" y1="92" x2="96" y2="92" stroke="#1E3A5F" stroke-width="3" stroke-dasharray="7 5" stroke-linecap="round"/>
  <line x1="32" y1="104" x2="80" y2="104" stroke="#93C5FD" stroke-width="3" stroke-dasharray="7 5" stroke-linecap="round" opacity="0.8"/>
</svg>`;

for (const size of [16, 48, 128]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon${size}.png`));
  console.log(`Generated icon${size}.png`);
}

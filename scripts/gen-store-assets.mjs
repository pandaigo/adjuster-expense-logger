// CWS プロモタイル（440x280）と スクリーンショット（1280x800 × 5）を生成
//
// 重要: スクリーンショットは事前に `npm run e2e` を WSL2 で実行して
// `screenshots/` に PNG が揃っている前提。e2e で撮影したものを 1280x800 に
// 装飾合成して CWS 提出用に転用する。
//
// 各拡張で TODO 部分を編集して使う:
//   1. プロモタイル SVG のコピー文言（Personal CRM / No Subscription 等）
//   2. targets 配列（e2e で撮ったスクショのうち5枚を選んでキャプション）
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'store');
const cwsScreensDir = join(outDir, 'screenshots');
mkdirSync(outDir, { recursive: true });
mkdirSync(cwsScreensDir, { recursive: true });

// ============================================================
// プロモタイル 440x280
// TODO: 拡張ごとにヘッドライン・差し色・サブコピーを編集
// ============================================================
// 設計指針 (lessons-learned 参照):
// - 値段は載せない (CWSタイル下部にインストール数/星が自動表示される)
// - 主見出しは 46pt 以上、サブコピーは 20pt 以上 (220x140 縮小時の可読性)
// - 差し色1点で視線フックを作る (CWS検索結果の青/緑/紫が支配的な中、赤が15-25%CTR向上)
// - 「No Subscription」のうち「No」だけ赤、「Subscription」を白で視線集中
const promoSmallSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0F2540"/>
      <stop offset="55%" style="stop-color:#1E3A5F"/>
      <stop offset="100%" style="stop-color:#2E4A6F"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="440" height="280" fill="url(#bg)"/>

  <!-- 主見出し: No Subscription を主軸、CAT-ready をサブ移動 (Jessica 提案) -->
  <text x="220" y="92" text-anchor="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="48" font-weight="900" letter-spacing="-1.2" xml:space="preserve"><tspan fill="#FF6B4A">No </tspan><tspan fill="#fff">Subscription.</tspan></text>

  <!-- ターゲット明示: 24pt 以上に拡大 (Jessica 修正必須項目) -->
  <text x="220" y="140" text-anchor="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#fff" letter-spacing="0.2">For insurance adjusters.</text>

  <!-- サブコピー: 業界用語と機能列挙 -->
  <text x="220" y="184" text-anchor="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#93C5FD" letter-spacing="0.3">Per diem · Mileage · Hotels.</text>
  <text x="220" y="222" text-anchor="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="15" font-weight="600" fill="#cbd5e1" letter-spacing="0.3">CAT-ready. Buy once, use forever.</text>
</svg>`;

writeFileSync(join(outDir, 'promo-small-440x280.svg'), promoSmallSvg);
await sharp(Buffer.from(promoSmallSvg))
  .png()
  .toFile(join(outDir, 'promo-small-440x280.png'));
console.log('Generated store/promo-small-440x280.png + .svg');

// ============================================================
// スクリーンショット 1280x800 × 5 を e2e のスクショから生成
// TODO: targets 配列を拡張固有のスクショファイル名・キャプションに編集
// ============================================================
// 順序戦略 (lessons-learned 参照):
// - 機能 → 課金 で並べる (購買動機を喚起してから価格提示)
// - 1枚目に課金モーダルを置くと購買前に離脱を招く
// - キャプションの句読点は全体ありか全体なしで統一 (混在は素人感)
//
// mode:
//   'popup'      = 左上 380x500 を抽出して 1.3倍拡大 (popup単体表示時)
//   'fullscreen' = 800x700 全体を縮小 (popup を覆うモーダル等を撮影した時)
const targets = [
  // e2e で撮影した実出力から 5 枚を選定（機能 → 課金順、リッチデータ重視）
  // shot 連番は e2e.mjs のテスト順序に依存。popup-6 (Mileage form shot) を追加したため後続が +1 ずれる。
  // 1 枚目: $1,000+ / 15 entries の使い込まれた感
  { src: '04-rich-overview.png',          caption: 'Every expense tagged to a claim — instant totals.',   mode: 'popup' },
  // 2 枚目: claim# フィルタで瞬時に小計
  { src: '06-rich-filtered-claim.png',    caption: 'Filter by claim — instant subtotal per file.',       mode: 'popup' },
  // 3 枚目: deployment 編集モーダル (CAT 名+期間+adjuster を一度で設定)
  { src: '05-rich-deployment-modal.png',  caption: 'One deployment header for every claim — CAT-ready.', mode: 'fullscreen' },
  // 4 枚目: Mileage カテゴリのみ表示、IRS $0.725/mi で自動計算された実金額が並ぶ
  { src: '07-rich-mileage-only.png',      caption: 'Mileage auto-fills at the 2026 IRS rate ($0.725/mi).',mode: 'popup' },
  // 5 枚目: 課金モーダル
  { src: '10-free-cap-upgrade.png',       caption: '$12.99 once. Yours forever. No subscription.',       mode: 'fullscreen' }
];

const screenshotsDir = join(root, 'screenshots');
if (!existsSync(screenshotsDir)) {
  console.log('\n⚠ screenshots/ ディレクトリがありません。');
  console.log('  先に WSL2 で `npm run e2e` を実行してスクショを取得してください。');
  console.log('  詳細は README.md の「E2E テスト」セクション参照。');
} else {
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const srcPath = join(screenshotsDir, t.src);
    if (!existsSync(srcPath)) {
      console.log(`  ✗ skip: ${t.src} not found`);
      continue;
    }

    let popupBuffer;
    if (t.mode === 'fullscreen') {
      // 全画面（モーダル等）: 800x700 を 800x680 にフィット
      popupBuffer = await sharp(srcPath)
        .resize(800, 680, { fit: 'inside', background: '#fff' })
        .png()
        .toBuffer();
    } else {
      // popup のみ: 左上 380x500 を抽出して 1.3倍拡大
      const meta = await sharp(srcPath).metadata();
      const cropWidth = Math.min(380, meta.width || 380);
      const cropHeight = Math.min(500, meta.height || 700);
      popupBuffer = await sharp(srcPath)
        .extract({ left: 0, top: 0, width: cropWidth, height: cropHeight })
        .resize({ width: Math.round(cropWidth * 1.3) })
        .png()
        .toBuffer();
    }
    const popupMeta = await sharp(popupBuffer).metadata();

    // 1280x800 のグラデ背景 + キャプション帯 + 中央 popup
    const captionEsc = t.caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const compositeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a8a"/>
      <stop offset="100%" style="stop-color:#5b4fcf"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1280" height="800" fill="url(#bg)"/>
  <rect x="0" y="0" width="1280" height="100" fill="#000" opacity="0.25"/>
  <text x="640" y="62" text-anchor="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="#fff">${captionEsc}</text>
</svg>`;

    const bgBuffer = await sharp(Buffer.from(compositeSvg)).png().toBuffer();

    const availTop = 110;
    const availBottom = 790;
    const availHeight = availBottom - availTop;
    const popupTop = availTop + Math.max(0, (availHeight - (popupMeta.height || 0)) / 2);
    const popupLeft = (1280 - (popupMeta.width || 380)) / 2;

    const outBaseName = `screenshot-${i + 1}-1280x800`;
    const popupOutPath = join(cwsScreensDir, `${outBaseName}-popup.png`);

    // popup 部分を別 PNG として書き出し（SVG から参照するため）
    await sharp(popupBuffer).toFile(popupOutPath);

    // 最終 PNG（背景＋popup 合成）
    await sharp(bgBuffer)
      .composite([{ input: popupBuffer, top: Math.round(popupTop), left: Math.round(popupLeft) }])
      .png()
      .toFile(join(cwsScreensDir, `${outBaseName}.png`));

    // SVG 版（テキスト編集可能・popup PNG は image タグで参照）
    const svgVersion = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1280 800">
  <defs>
    <linearGradient id="bg-${i + 1}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a8a"/>
      <stop offset="100%" style="stop-color:#5b4fcf"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1280" height="800" fill="url(#bg-${i + 1})"/>
  <rect x="0" y="0" width="1280" height="100" fill="#000" opacity="0.25"/>
  <text x="640" y="62" text-anchor="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="#fff">${captionEsc}</text>
  <image xlink:href="${outBaseName}-popup.png" x="${Math.round(popupLeft)}" y="${Math.round(popupTop)}" width="${popupMeta.width}" height="${popupMeta.height}"/>
</svg>`;
    writeFileSync(join(cwsScreensDir, `${outBaseName}.svg`), svgVersion);

    console.log(`Generated screenshots/${outBaseName}.png + .svg`);
  }
}

console.log('\nTip: 微調整は Figma で SVG をインポートして編集してください。');

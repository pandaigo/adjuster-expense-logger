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
// 設計指針 (3 ペルソナレビュー 2026-05-12 反映):
// - 左寄せ + 右 30% に製品アイコン配置 (右側余白を埋める)
// - 価格 $12.99 をタイルに出す (買切訴求はサブスク疲れ層に一撃)
// - "forever" 表現は CWS Deceptive Behavior リスク → "$12.99 one-time" に置換
// - フォント階層: 主見出し 48 → ターゲット 28 → 機能 18 → 補足 14 で差別化
// - letter-spacing は -0.8 (-1.2 は強すぎて N/o がくっつく)
const PROMO_ICON_B64 = readFileSync(join(root, 'icons', 'icon128.png')).toString('base64');
const promoSmallSvg = `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0F2540"/>
      <stop offset="55%" style="stop-color:#1E3A5F"/>
      <stop offset="100%" style="stop-color:#2E4A6F"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="440" height="280" fill="url(#bg)"/>

  <!-- 右側に製品アイコンを配置して文字だけタイルから脱却 -->
  <image xlink:href="data:image/png;base64,${PROMO_ICON_B64}" x="295" y="76" width="128" height="128" opacity="0.96"/>

  <!-- 主見出し: No Subscription -->
  <text x="24" y="84" font-family="Inter, Arial, Helvetica, sans-serif" font-size="44" font-weight="900" letter-spacing="-0.8" xml:space="preserve"><tspan fill="#FF6B4A">No </tspan><tspan fill="#fff">Subscription.</tspan></text>

  <!-- ターゲット明示 -->
  <text x="24" y="124" font-family="Inter, Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="#fff" letter-spacing="0.2">For insurance adjusters.</text>

  <!-- 機能列挙 -->
  <text x="24" y="170" font-family="Inter, Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#93C5FD" letter-spacing="0.3">Per diem · Mileage · Hotels</text>

  <!-- 価格 + 一回購入訴求 (forever 表現 → one-time 置換で CWS 安全) -->
  <text x="24" y="212" font-family="Inter, Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="#fff" letter-spacing="-0.2"><tspan fill="#FCD34D">$12.99</tspan> one-time</text>
  <text x="24" y="240" font-family="Inter, Arial, Helvetica, sans-serif" font-size="14" font-weight="600" fill="#cbd5e1" letter-spacing="0.2">CAT-ready · No recurring fees</text>
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
//   'asis'       = 1280x800 として既に撮影されている画像をそのまま採用 (CSV/PDF プレビュー等)
// ストーリー (5 枚): Why/What → Filter → CSV 出力 → PDF 出力 (Pro) → Buy
// ペルソナレビュー指摘: 出力物 (CSV/PDF) が 0 枚で description の訴求を裏付けられていなかった。
// 3, 4 を出力物に振り替え、Deployment と Mileage 自動計算は description bullet に降格。
const targets = [
  // 1 枚目: 15件入った使い込み popup (claim 別タグ + 即合計)
  { src: '04-rich-overview.png',          caption: 'Every expense tagged to a claim — instant totals.',   mode: 'popup' },
  // 2 枚目: Filter モーダルを「開いた状態」(active filter chip 風) — 1 枚目と差別化
  { src: '06-rich-filter-modal-open.png', caption: 'Filter by claim or category — subtotals on the fly.', mode: 'fullscreen' },
  // 3 枚目: 実 CSV を Excel/Sheets 風テーブルとして 1280x800 で表示 (実出力)
  { src: 'rich-csv-preview.png',          caption: '',                                                    mode: 'asis' },
  // 4 枚目: 実 PDF (Pro) を Chromium PDF viewer で表示 (実出力)
  { src: 'rich-pdf-preview.png',          caption: '',                                                    mode: 'asis' },
  // 5 枚目: 課金モーダル
  { src: '10-free-cap-upgrade.png',       caption: '$12.99 once. One purchase covers every CAT deployment.', mode: 'fullscreen' }
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

    // 'asis' は既に 1280x800 として撮影されている画像 (CSV/PDF プレビュー)。
    // caption は画像内に焼き込み済みなので SVG 合成しない。
    if (t.mode === 'asis') {
      const outBaseName = `screenshot-${i + 1}-1280x800`;
      await sharp(srcPath).resize(1280, 800, { fit: 'cover' }).png()
        .toFile(join(cwsScreensDir, `${outBaseName}.png`));
      // SVG 版は <image> 1 個だけのシンプル構造で
      const svgVersion = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1280 800">
  <image xlink:href="${outBaseName}.png" x="0" y="0" width="1280" height="800"/>
</svg>`;
      writeFileSync(join(cwsScreensDir, `${outBaseName}.svg`), svgVersion);
      console.log(`Generated screenshots/${outBaseName}.png + .svg (asis)`);
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

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
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
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
// 設計指針 (ユーザー指摘 2026-05-12 反映):
// - 価格はタイルに載せない (CWS は検索結果に価格を別途表示する。タイルは機能訴求に集中)
// - 一番大きい文字は「機能名・機能説明」(製品名は CWS が下に併記するので冗長)
// - "Per diem · Mileage · Hotel" を最大級フォントで主役に
// - "For independent insurance adjusters" を副題で「誰のため」を明示
// - "No subscription" は控えめに置く (差別化要素として最下部)
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

  <!-- 右側に製品アイコン -->
  <image xlink:href="data:image/png;base64,${PROMO_ICON_B64}" x="290" y="80" width="128" height="128" opacity="0.96"/>

  <!-- 主見出し: 機能訴求 (タイル内で最大文字、2 行に分割して密度を稼ぐ) -->
  <text x="24" y="78" font-family="Inter, Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#fff" letter-spacing="-0.8">Per Diem.</text>
  <text x="24" y="118" font-family="Inter, Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#fff" letter-spacing="-0.8">Mileage. Hotel.</text>

  <!-- ターゲット明示 (副題) -->
  <text x="24" y="164" font-family="Inter, Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#93C5FD" letter-spacing="0.2">For independent insurance adjusters</text>

  <!-- ベネフィット帯 (機能の中身を1行で説明) -->
  <text x="24" y="206" font-family="Inter, Arial, Helvetica, sans-serif" font-size="15" font-weight="600" fill="#cbd5e1" letter-spacing="0.1">Log by claim # · Export CSV / PDF · IRS rate auto-calc</text>

  <!-- 差別化要素 (差し色オレンジ、controlled emphasis) -->
  <text x="24" y="244" font-family="Inter, Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="0.4"><tspan fill="#FF6B4A">CAT-ready</tspan><tspan fill="#cbd5e1"> · No subscription</tspan></text>
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
//   'fullscreen' = 撮影元 PNG を 800x680 にフィットさせて 1280x800 中央配置
// ユーザー指摘: 1/2/5 で popup の見た目サイズが不揃いだったため、全 5 枚を fullscreen 統一。
// CSV/PDF プレビューも 800x680 で撮影しているので同じパスを通す。
// ストーリー (5 枚): Why/What → Filter → CSV 出力 → PDF 出力 (Pro) → Buy
const targets = [
  // 1 枚目: 15件入った使い込み popup (claim 別タグ + 即合計)
  { src: '04-rich-overview.png',          caption: 'Every expense tagged to a claim — instant totals.',          mode: 'fullscreen' },
  // 2 枚目: Filter モーダルを「開いた状態」
  { src: '06-rich-filter-modal-open.png', caption: 'Filter by claim or category — subtotals on the fly.',        mode: 'fullscreen' },
  // 3 枚目: 実 CSV を Chrome 組み込み plain-text viewer で表示 (実出力、UI 装飾ゼロ)
  { src: 'rich-csv-preview.png',          caption: 'Export CSV — opens in Excel, Google Sheets, or any reader.', mode: 'fullscreen' },
  // 4 枚目: 実 PDF (Pro) を Chromium PDF viewer で表示 (実出力)
  { src: 'rich-pdf-preview.png',          caption: 'Pro PDF report — subtotals by category and claim #.',        mode: 'fullscreen' },
  // 5 枚目: 課金モーダル (撮影連番はシナリオ追加で変動するため、ワイルドカード相当の suffix で探す)
  { src: 'free-cap-upgrade.png',          caption: '$12.99 once. One purchase covers every CAT deployment.',     mode: 'fullscreen' }
];

const screenshotsDir = join(root, 'screenshots');
if (!existsSync(screenshotsDir)) {
  console.log('\n⚠ screenshots/ ディレクトリがありません。');
  console.log('  先に WSL2 で `npm run e2e` を実行してスクショを取得してください。');
  console.log('  詳細は README.md の「E2E テスト」セクション参照。');
} else {
  // 撮影連番はシナリオ追加で前後にずれるため、suffix マッチで探す。
  // 例: '04-rich-overview.png' でも 'NN-rich-overview.png' のどれでも拾える。
  const allShots = readdirSync(screenshotsDir);
  const findShot = (name) => {
    if (existsSync(join(screenshotsDir, name))) return name;
    const base = name.replace(/^\d+-/, '');
    const candidates = allShots.filter((f) => f.endsWith(base) || f === base);
    return candidates.sort().pop() || null;
  };
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const resolved = findShot(t.src);
    if (!resolved) {
      console.log(`  ✗ skip: ${t.src} not found (and no suffix match)`);
      continue;
    }
    const srcPath = join(screenshotsDir, resolved);

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

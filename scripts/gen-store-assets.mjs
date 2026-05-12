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
// 設計指針 (v7: 黄色廃止 + 落ち着いた navy ベース、2026-05-13 ユーザー指摘反映):
// v6 の情報構造 (製品名→機能→集計軸→数値→ターゲット) は維持。配色だけ変更。
// - 背景: 暗 navy 単色 (専門業務向けの信頼カラー、CWS 一覧でも視認できる暗色)
// - 機能訴求: 白文字 32pt + アクセント (per diem などのキーワードに黄色)
// - 補足: 薄グレー、CTA バッジは黄背景で focal point
const promoSmallSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0B1F3A"/>
      <stop offset="100%" style="stop-color:#1E3A5F"/>
    </linearGradient>
  </defs>
  <rect width="440" height="280" fill="url(#bg)"/>

  <!-- 上端: 製品名 -->
  <text x="32" y="40" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" fill="#FCD34D" letter-spacing="2.5">ADJUSTER EXPENSE LOG</text>

  <!-- ヒーロー: 機能訴求 2 行で「何の拡張か」即理解 -->
  <text x="32" y="86" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="900" fill="#fff" letter-spacing="-0.8">Per diem. Mileage.</text>
  <text x="32" y="120" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="900" fill="#fff" letter-spacing="-0.8">Hotel. Meals.</text>

  <!-- 副題: 集計軸を明示 (アクセント色で claim # 強調) -->
  <text x="32" y="156" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="700" fill="#93C5FD" letter-spacing="0.2" xml:space="preserve">All tagged by <tspan fill="#FCD34D" font-weight="800">claim #</tspan> · Auto-totaled</text>

  <!-- 補足: 数値具体性 -->
  <text x="32" y="184" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="600" fill="#cbd5e1" letter-spacing="0.1">IRS $0.725/mi auto-calc · CSV / PDF export</text>

  <!-- CTA バッジ: ターゲット明示 + focal point (黄背景 + 黒文字でコントラスト最大) -->
  <rect x="32" y="208" width="376" height="34" rx="6" fill="#FCD34D"/>
  <text x="220" y="231" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="900" fill="#0A0A0A" letter-spacing="1.5">FOR INDEPENDENT INSURANCE ADJUSTERS</text>

  <!-- 下端: 差別化文言 (オレンジアクセント) -->
  <text x="220" y="266" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" xml:space="preserve"><tspan fill="#FF6B4A">CAT-READY</tspan><tspan fill="#cbd5e1"> · NO SUBSCRIPTION</tspan></text>
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
//   'fullscreen'    = 撮影元 PNG を 800x680 にフィットさせて 1280x800 中央配置 (中身が画面全体に広がる CSV/PDF preview 用)
//   'popup-callout' = 左に popup を縦長で配置 + 右半分にベネフィット 3 行のコールアウト (右余白を埋める)
// ユーザー指摘: 1/2/5 が popup を中央配置すると右半分が単色背景の余白になり「見栄え悪い」。
// popup を左、右半分に機能ベネフィットを置くマーケ定番レイアウトに変更。
const targets = [
  // 1 枚目: 15件入った使い込み popup (claim 別タグ + 即合計)
  {
    src: '04-rich-overview.png',
    caption: 'Every expense tagged to a claim — instant totals.',
    mode: 'popup-callout',
    callout: [
      { title: 'Tagged by claim #', body: 'Per diem, hotel, mileage, meals — all linked to the IA company\'s case ID' },
      { title: 'Instant subtotals', body: 'Total per claim or per category in one tap' },
      { title: '8 categories built-in', body: 'Per diem · Hotel · Mileage · Meals · Parking · Supplies · Phone · Other' }
    ]
  },
  // 2 枚目: Filter モーダルを「開いた状態」
  {
    src: '06-rich-filter-modal-open.png',
    caption: 'Filter by claim or category — subtotals on the fly.',
    mode: 'popup-callout',
    callout: [
      { title: 'Find any claim fast', body: 'Hyphen / space / case-insensitive — type "PA0988" to find "PA-09887766"' },
      { title: 'Category × claim × date', body: 'Combine filters to bill one carrier for one week of work' },
      { title: 'Totals follow the filter', body: 'The dollar figure at the top reflects exactly what you see' }
    ]
  },
  // 3 枚目: 実 CSV を Chrome 組み込み plain-text viewer で表示 (実出力、UI 装飾ゼロ)
  { src: 'rich-csv-preview.png',          caption: 'Export CSV — opens in Excel, Google Sheets, or any reader.', mode: 'fullscreen' },
  // 4 枚目: 実 PDF (Pro) を Chromium PDF viewer で表示 (実出力)
  { src: 'rich-pdf-preview.png',          caption: 'Pro PDF report — subtotals by category and claim #.',        mode: 'fullscreen' },
  // 5 枚目: 課金モーダル
  {
    src: 'free-cap-upgrade.png',
    caption: '$12.99 once. One purchase covers every CAT deployment.',
    mode: 'popup-callout',
    callout: [
      { title: 'No subscription', body: 'One $12.99 charge via ExtensionPay. No renewal, no auto-billing.' },
      { title: 'Yours on every device', body: 'Sign-in-free. JSON backup moves your data to a new laptop in seconds.' },
      { title: 'Five Pro features', body: 'Unlimited entries · PDF report · Claim # summary · Custom IRS rate · Dark mode' }
    ]
  }
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

    // 'popup-callout': 左に popup を縦長で配置 + 右半分にベネフィットコールアウト
    if (t.mode === 'popup-callout') {
      // 元画像 800x700 のうち、popup body は left 380px だが modal は viewport 中央
      // (left 240..560 = 320px wide) に表示されるため、crop は 600px 確保して
      // modal の右端まで含める。popup body と modal の両方が収まる横幅。
      const meta = await sharp(srcPath).metadata();
      const cw = Math.min(600, meta.width || 600);
      const ch = Math.min(700, meta.height || 700);
      // popup を 600px 幅にリサイズ (CWS 縮小表示でも内部テキストが読めるサイズに拡大)
      const popupBuf = await sharp(srcPath)
        .extract({ left: 0, top: 0, width: cw, height: ch })
        .resize({ width: 600 })
        .png()
        .toBuffer();
      const popupMeta = await sharp(popupBuf).metadata();
      const popupX = 30;
      const popupY = 110 + Math.max(0, (660 - (popupMeta.height || 0)) / 2);
      const captionEsc = t.caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const callouts = t.callout || [];
      // 右半分 (x=660..1240、520px 幅) にコールアウト 3 つ。文字サイズを拡大して
      // CWS 詳細ページの 640x400 縮小表示でも読めるよう設計 (title 30pt, body 19pt)。
      const calloutSvg = callouts.map((c, idx) => {
        const cy = 210 + idx * 180;
        const titleEsc = c.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const bodyEsc = c.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // body を ~40 文字で折り返し (拡大フォントに合わせて行幅を縮小)
        const words = bodyEsc.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
          if ((line + ' ' + w).trim().length > 40) { lines.push(line.trim()); line = w; }
          else { line += ' ' + w; }
        }
        if (line.trim()) lines.push(line.trim());
        return `
  <circle cx="680" cy="${cy - 8}" r="8" fill="#FCD34D"/>
  <text x="710" y="${cy}" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="900" fill="#fff" letter-spacing="-0.3">${titleEsc}</text>
  ${lines.map((l, li) => `<text x="710" y="${cy + 40 + li * 32}" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="500" fill="#cbd5e1" letter-spacing="0.1">${l}</text>`).join('\n  ')}`;
      }).join('\n');
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
  <text x="640" y="66" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="800" fill="#fff">${captionEsc}</text>
  ${calloutSvg}
</svg>`;
      const bgBuffer = await sharp(Buffer.from(compositeSvg)).png().toBuffer();
      const outBaseName = `screenshot-${i + 1}-1280x800`;
      const popupOutPath = join(cwsScreensDir, `${outBaseName}-popup.png`);
      await sharp(popupBuf).toFile(popupOutPath);
      await sharp(bgBuffer)
        .composite([{ input: popupBuf, top: Math.round(popupY), left: popupX }])
        .png()
        .toFile(join(cwsScreensDir, `${outBaseName}.png`));
      // SVG 版 (再編集用)
      const svgVersion = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1280 800">
  <defs><linearGradient id="bg-${i + 1}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#1e3a8a"/><stop offset="100%" style="stop-color:#5b4fcf"/></linearGradient></defs>
  <rect x="0" y="0" width="1280" height="800" fill="url(#bg-${i + 1})"/>
  <rect x="0" y="0" width="1280" height="100" fill="#000" opacity="0.25"/>
  <text x="640" y="62" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800" fill="#fff">${captionEsc}</text>
  <image xlink:href="${outBaseName}-popup.png" x="${popupX}" y="${Math.round(popupY)}" width="${popupMeta.width}" height="${popupMeta.height}"/>
  ${calloutSvg}
</svg>`;
      writeFileSync(join(cwsScreensDir, `${outBaseName}.svg`), svgVersion);
      console.log(`Generated screenshots/${outBaseName}.png + .svg (popup-callout)`);
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
  <text x="640" y="66" text-anchor="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="38" font-weight="800" fill="#fff">${captionEsc}</text>
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
  <text x="640" y="66" text-anchor="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="38" font-weight="800" fill="#fff">${captionEsc}</text>
  <image xlink:href="${outBaseName}-popup.png" x="${Math.round(popupLeft)}" y="${Math.round(popupTop)}" width="${popupMeta.width}" height="${popupMeta.height}"/>
</svg>`;
    writeFileSync(join(cwsScreensDir, `${outBaseName}.svg`), svgVersion);

    console.log(`Generated screenshots/${outBaseName}.png + .svg`);
  }
}

console.log('\nTip: 微調整は Figma で SVG をインポートして編集してください。');

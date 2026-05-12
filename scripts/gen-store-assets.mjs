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
// 設計指針 (3 ペルソナレビュー 2026-05-13 採用案 = 黄色ハイビズ警告サイン):
// - CWS 検索結果一覧で青系競合 (Hurdlr / TripLog / Stride / MileIQ) と完全に異質な配色で視線奪取
// - 黄黒コントラスト比 19:1 で focal point を $0.725/mile (IRS 標準レート) に集中
// - 上下の黒帯 = 工事現場テープ / ハリケーン被害区域マーカー = IA 現場の業界記号
// - "BUILT FOR CAT DEPLOYMENT" で「業界の人が作った」と Brenda が 0.5 秒で判断
const promoSmallSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280">
  <rect width="440" height="280" fill="#FFD60A"/>

  <!-- 上下の黒ストライプ (工事現場テープ風) -->
  <rect x="0" y="0" width="440" height="26" fill="#0A0A0A"/>
  <rect x="0" y="254" width="440" height="26" fill="#0A0A0A"/>
  <text x="22" y="18" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="900" fill="#FFD60A" letter-spacing="2.5">ADJUSTER EXPENSE LOG</text>
  <text x="22" y="272" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#FFD60A" letter-spacing="1.2">BUILT FOR CAT DEPLOYMENT · NO SUBSCRIPTION</text>

  <!-- 巨大数字 (IRS rate ヒーロー、focal point) -->
  <text x="22" y="120" font-family="Inter, Arial, sans-serif" font-size="78" font-weight="900" fill="#0A0A0A" letter-spacing="-3">$0.725</text>
  <text x="22" y="148" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" fill="#0A0A0A" letter-spacing="0.5">/ mile · auto-calc</text>

  <!-- 警告三角 (CAT 業界メタファー) -->
  <polygon points="370,68 410,68 390,34" fill="#0A0A0A"/>
  <text x="390" y="62" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFD60A" text-anchor="middle">!</text>

  <!-- カテゴリチップ (黒バー + 黄文字) -->
  <g font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" fill="#FFD60A">
    <rect x="22" y="180" width="86" height="26" fill="#0A0A0A" rx="3"/><text x="65" y="198" text-anchor="middle">PER DIEM</text>
    <rect x="116" y="180" width="62" height="26" fill="#0A0A0A" rx="3"/><text x="147" y="198" text-anchor="middle">HOTEL</text>
    <rect x="186" y="180" width="80" height="26" fill="#0A0A0A" rx="3"/><text x="226" y="198" text-anchor="middle">MILEAGE</text>
    <rect x="22" y="214" width="76" height="26" fill="#0A0A0A" rx="3"/><text x="60" y="232" text-anchor="middle">MEALS</text>
    <rect x="106" y="214" width="160" height="26" fill="#0A0A0A" rx="3"/><text x="186" y="232" text-anchor="middle">CLAIM # TAGGED</text>
  </g>

  <!-- 右側: claim# スタンプ風 (CAT 派遣感を強化) -->
  <g transform="translate(310,166) rotate(-8)">
    <rect x="0" y="0" width="120" height="68" fill="none" stroke="#0A0A0A" stroke-width="3" rx="4"/>
    <text x="60" y="26" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="#0A0A0A" text-anchor="middle" letter-spacing="1.5">CLAIM #</text>
    <text x="60" y="52" font-family="Courier New, monospace" font-size="20" font-weight="900" fill="#0A0A0A" text-anchor="middle">CAT-2026</text>
  </g>
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
      // 元画像 800x680 のうち popup 本体は左上 ~480x680。右側の空白を切り捨てる。
      const meta = await sharp(srcPath).metadata();
      const cw = Math.min(480, meta.width || 480);
      const ch = Math.min(680, meta.height || 680);
      const popupBuf = await sharp(srcPath)
        .extract({ left: 0, top: 0, width: cw, height: ch })
        .resize({ width: 460 })
        .png()
        .toBuffer();
      const popupMeta = await sharp(popupBuf).metadata();
      const popupX = 80;
      const popupY = 110 + Math.max(0, (660 - (popupMeta.height || 0)) / 2);
      const captionEsc = t.caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const callouts = t.callout || [];
      // 右半分 (x=620..1240) に コールアウト 3 つを縦に並べる
      const calloutSvg = callouts.map((c, idx) => {
        const cy = 200 + idx * 180;
        const titleEsc = c.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const bodyEsc = c.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // body を 50 文字程度で折り返し (簡易、句読点で改行)
        const words = bodyEsc.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
          if ((line + ' ' + w).trim().length > 48) { lines.push(line.trim()); line = w; }
          else { line += ' ' + w; }
        }
        if (line.trim()) lines.push(line.trim());
        return `
  <circle cx="640" cy="${cy - 6}" r="6" fill="#FCD34D"/>
  <text x="660" y="${cy}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" fill="#fff" letter-spacing="-0.2">${titleEsc}</text>
  ${lines.map((l, li) => `<text x="660" y="${cy + 32 + li * 28}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="500" fill="#cbd5e1" letter-spacing="0.1">${l}</text>`).join('\n  ')}`;
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
  <text x="640" y="62" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800" fill="#fff">${captionEsc}</text>
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

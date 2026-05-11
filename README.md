# Chrome拡張テンプレート

新しい拡張を作るときにこのフォルダをコピーして使う。

## セットアップ手順

1. `_template` フォルダをコピーして拡張名にリネーム
2. 全ファイルの `EXTENSION_NAME` `EXTENSION_ID` `TODO` `TEMPLATE_SELF_ID` を置換
3. `npm install`
4. `npm run icons` でアイコン生成（SVGを先に編集）
5. ExtensionPay で拡張を登録し、IDを `background.js` と `popup.js` に設定
6. **ローカライズ**: `_locales/<lang>/messages.json` の各言語タイトル・短い説明を埋める（詳細は `docs/PLAYBOOK.md §B.2 ローカライズ` 参照）
7. **ストア説明文翻訳**: `store/description.txt` の英語版を書いた後、`store/i18n/description_<日本語名>.txt` 8言語をAI翻訳で埋める
8. `npm run build` で確認
9. `npm run zip` で提出用ZIP作成

## 置換が必要なプレースホルダー

| プレースホルダー | 説明 | 例 |
|----------------|------|-----|
| EXTENSION_NAME | 表示名（_locales/*/messages.json の extName で各言語に翻訳） | QuickReply Templates |
| EXTENSION_ID | ExtensionPay登録ID・パッケージ名 | quickreply-templates |
| TEMPLATE_SELF_ID | popup.js 内 cross-promo の自分自身ID（promo-data.json の id と一致） | quickreply |
| TODO | 拡張固有の内容 | — |
| YYYY-MM-DD | 日付 | 2026-05-03 |
| TODO_DESCRIPTION | 拡張の説明（プライバシーポリシー用） | — |
| TODO_TAGLINE | キャッチコピー（LP用） | — |

## ローカライズ構造（CWS要件）

CWS Dashboard で言語別ストア情報を入力するには `_locales/` の存在が必須。テンプレには 9言語の雛形が入っている:

```
_locales/
├── en/messages.json        ← default_locale (manifest.json で指定)
├── ja/messages.json        ← 日本語
├── es/messages.json        ← スペイン語
├── pt_BR/messages.json     ← ブラジルポルトガル語
├── de/messages.json        ← ドイツ語
├── fr/messages.json        ← フランス語
├── it/messages.json        ← イタリア語
├── ko/messages.json        ← 韓国語
└── zh_CN/messages.json     ← 中国語簡体字
```

manifest.json の `name` と `description` は `__MSG_extName__` / `__MSG_extDescription__` 形式で参照。各 messages.json で実値を定義。

ストア説明文の本文は `store/i18n/description_<日本語名>.txt` 8件にAI翻訳で記入し、CWS Dashboard の各言語タブにそのままコピペで使う（フラット構造、ヘッダーなし）。

## GitHub Pages（プライバシーポリシー・LP公開）

1. GitHubリポジトリを **public** で作成（GitHub Pages無料利用に必要）
   ```
   gh repo create pandaigo/EXTENSION_ID --public --source=. --push
   ```
2. GitHub Pagesを有効化（masterブランチ、ルート）
   ```
   gh api repos/pandaigo/EXTENSION_ID/pages -X POST -f "build_type=legacy" -f "source[branch]=master" -f "source[path]=/"
   ```
3. 公開URL:
   - LP: `https://pandaigo.github.io/EXTENSION_ID/`
   - プライバシーポリシー: `https://pandaigo.github.io/EXTENSION_ID/store/privacy-policy.html`
4. CWS提出時・ExtensionPay登録時にこのURLを使う

## 特商法ページ

全拡張共通で `https://microforge-hq.pages.dev/tokushoho.html` を使用。
拡張ごとに個別作成は不要。Stripe審査で必要。

## CWSストアアセット

### 推奨ワークフロー（自動化）

1. **e2e でスクショを取得** ← `npm run e2e` を WSL2 で実行（後述「自動テスト」セクション参照）
   - `screenshots/` に PNG が13-16枚保存される（CRUD・モーダル・ダーク等）
2. **`scripts/gen-store-assets.mjs` の `targets` を編集** ← e2e で撮ったスクショから掲載5枚を選んでキャプションを書く
3. **`npm run store-assets` を実行** ← 以下が自動生成される:
   - プロモタイル: `store/promo-small-440x280.png` + `.svg`
   - スクショ: `store/screenshots/screenshot-1〜5-1280x800.png` + `.svg`
4. **微調整は SVG を Figma で開いて編集** → PNG 再エクスポート

### 設計指針（lessons-learned 参照）

**プロモタイル**:
- **値段は載せない**（CWSタイル下部にインストール数/星が自動表示される、値上げ時の差し替え回避）
- **主見出し 46pt 以上、サブコピー 20pt 以上**（220x140 縮小時の可読性）
- **差し色1点で視線フック**（「No Subscription」のうち「No」だけ赤、CTR +15-25%）

**スクリーンショット**:
- **順序は 機能 → 課金**（購買動機を喚起してから価格提示、1枚目に課金モーダルを置くと離脱）
- **キャプションは句読点を全体ありか全体なしで統一**（混在は素人感）
- **mode 指定**: popup単体は `'popup'`（左上 380x500 抽出して 1.3倍）、モーダルは `'fullscreen'`（800x700 全体縮小）

### 出力先

- `store/promo-small-440x280.svg` + `.png`（プロモタイル）
- `store/screenshots/screenshot-1〜5-1280x800.svg` + `.png`（スクショ）

## 含まれるもの

- ExtensionPay統合済み（background.js, popup.js）
- Freemiumゲート（アップグレードモーダル）
- ビルド・ZIP・アイコン生成スクリプト
- CWSストア提出用テンプレート（description.txt）
- プライバシーポリシー・LP（GitHub Pages用）
- 自動テストスクリプト（smoke / e2e）
- .gitignore

## UI形態の選択（popup vs Standalone Window）

このテンプレは **popup デフォルト**。長時間バッチ処理を伴う業務系拡張だけ Standalone Window 化する。

### Window化を検討すべき AND 3条件

3つすべて満たす拡張だけ Window 化する（いずれか1つでも欠けたら popup のまま）。

1. **価格帯**: $12.99 以上（専門職向けに「業務ツール感」が必要）
2. **タスク時間**: 1バッチ 5分以上（処理中の閉じ事故リスクが現実化）
3. **中断耐性**: バッチ処理で中断＝損失（番号飛び・データ破損）

該当例: PDF Bates Numbering（弁護士向け$39.99、5〜15分バッチ、番号飛び＝法廷影響）。
非該当例: QuickReply / Watermark / Contact Notes / Custom Order Notes（短時間 or 楽観更新で耐性あり）。

### Window化の実装パターン (Bates Numbering 流用)

該当する場合は `11.bates-numbering/` から以下を流用すれば 2-3時間で実装可能:

- `manifest.json`: `action.default_popup` 削除 + `commands.open-bates-window` (例: `Ctrl+Shift+Y` — Alt+Shift+B / Ctrl+Shift+B / Cmd+Shift+B は Chromium 予約のため避ける)
- `background.js`: `chrome.action.onClicked` + `chrome.commands.onCommand` で `chrome.windows.create({type:'popup', width:600, height:800})` + 500ms デバウンス
- `popup.js`: `init()` に focus/visibilitychange リスナーで `refreshPaidStatus(force=false)` (30秒スロットル)、`runStamp` で `document.title` + `body.classList.add('is-processing')`
- `popup.css`: `min-width: 380px; min-height: 600px` + `body.is-processing::before` オーバーレイ（赤背景点滅 "do NOT close" 警告）

### 既存拡張の遡及更新

既存リリース済み拡張は popup閉じ事故クレームが出るまで触らない（推測駆動の改修禁止、量産路線「保守ゼロ」原則）。CWS レビュー★1〜★3 で「lost work」系が2件出たら遡及検討する。

## 自動テスト

### smoke（必須・軽量）

`npm run smoke` で以下を機械的に検査:

- manifest.json の妥当性（MV3、description長、`<all_urls>`なし）
- popup.html ↔ popup.js の ID 整合性
- CSP適合（インラインscript・onclick・javascript:URL なし）
- JS 文法チェック
- 必須ファイル存在確認

数秒で完了。出荷前に必ず通すこと。

### e2e（推奨・拡張固有のロジック検証）

Puppeteer で実際の Chrome 拡張をロードして popup を操作する。

**Windows ローカル実行は注意**:
プロファイルロックで失敗するケース多数。WSL2(Ubuntu) + xvfb で実行するのが推奨。

**WSL2 での初期セットアップ**（一度だけ）:
```bash
wsl -u root -d Ubuntu -- bash -lc '
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libxshmfence1 \
  fonts-liberation rsync curl ca-certificates xvfb
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
'
```

**E2E 実行**:
```bash
wsl -u root -d Ubuntu -- bash -lc '
rsync -a --exclude=node_modules --exclude="*.zip" --exclude=_zip_tmp --exclude=screenshots \
  "/mnt/c/Users/dgfuj/Documents/Chrome拡張機能/EXTENSION_ID/" /root/qcn/
cd /root/qcn
[ -d node_modules ] || npm install --silent
xvfb-run --auto-servernum npm run e2e
mkdir -p "/mnt/c/Users/dgfuj/Documents/Chrome拡張機能/EXTENSION_ID/screenshots"
rsync -a --delete /root/qcn/screenshots/ "/mnt/c/Users/dgfuj/Documents/Chrome拡張機能/EXTENSION_ID/screenshots/"
'
```

スクリーンショットは `screenshots/` に保存される。

**E2E でカバーできない（手動テスト必須）**:
- 右クリック→ contextMenu からの保存
- グローバルキーボードショートカット起動
- `chrome.alarms` の通知（時刻待ち必要）
- ExtensionPay の実決済フロー
- Edge 互換性

これらは Chrome に手動インストールして 5-10 分で確認する。

### テスト→エージェントレビュー→修正の反復ループ（必須）

「全テスト PASS = OK」は不十分。**実装の致命バグはテストが書いていない領域に潜む**。テスト完了後は必ず外部視点でレビューを通し、**バグが出なくなるまで反復する**。

**手順**:

1. 全自動テスト PASS を確認
2. **2 体並列でエージェント監査**を起動（同一メッセージ内で 2 つの Agent ツール呼び出し）
   - **構造監査**: 件数バランス・カバレッジ漏れ・仕様駆動の独立性（実装ファイル Read 0 件か grep）
   - **アンチペルソナ**: 業務ドメインの重さで「実戦で落ちる場面・返金請求になる境界条件」を炙り出す
3. アンチペルソナが致命的抜け穴を指摘 → **実装修正 + テスト追加** で塞ぐ
4. 再テスト → 再レビュー → **アンチペルソナが `SUFFICIENT` 判定するまでループ**
5. テスト件数だけ誇示せず「実装変更前なら必ず落ちるテスト」になっているかをレビューに見させる（偽 PASS 防止）

**Bates Numbering 実例（3ラウンド監査で計7致命発見）**: 216件全PASS後にアンチペルソナがR1で3致命（ZIP同名衝突 / 桁あふれガード / Pro→Free巻き戻し）→ Standalone Window化 → R2で追加3致命（並列バッチ / focus同期 / レース）→ R3で5ペルソナ会議が第7致命（WinAnsi範囲外プレフィックスでバッチ全停止）を発見。すべて修正後 **251件全PASS**。**1ラウンドで終わらせず最低2-3ラウンド回す** ことが確立された。

詳細は `docs/PLAYBOOK.md` §B.6「テスト→レビュー→修正の反復ループ」参照。

### テストエビデンスを `store/test-evidence/` に残す（必須）

自動テストが「手動テスト免除の根拠」になる以上、再現可能な記録を残す。

| ファイル | 内容 |
|---|---|
| `store/test-evidence/AUTOMATED_TEST_COVERAGE.md` | 件数サマリ・カバーマップ・手動免除対照表・再現手順・監査履歴 |
| `store/test-evidence/test-pure.log` | 純粋関数テスト実行ログ（UTF-8） |
| `store/test-evidence/test-bates.log` | バッチ連続性テスト実行ログ |
| `store/test-evidence/smoke.log` | smoke テスト実行ログ |
| `store/test-evidence/e2e.log` | e2e（WSL2 + xvfb）実行ログ |
| `store/test-evidence/test-spec.log` | 仕様駆動 e2e 実行ログ |
| `store/test-evidence/screenshots/e2e/*.png` | e2e の主要画面 PNG |
| `store/test-evidence/screenshots/spec/*.png` | 仕様駆動 e2e の主要画面 PNG |

**ヘルパスクリプト**（テンプレートに含める / 既存拡張からコピーで OK）:
- `scripts/save-test-logs.mjs` — `npm run test:pure / test:bates / smoke` を実行して UTF-8 でログ書き出し（Windows PowerShell の文字化けを Node 経由で回避）
- `scripts/save-screenshots.mjs` — `screenshots/` `screenshots-spec/` を `store/test-evidence/screenshots/` にコピー

**エビデンスを根拠に手動テストを圧縮**: 自動カバー済みの項目は手動チェックリストから外す。Bates Numbering は 90+ 項目 → 48 項目に圧縮した（`AUTOMATED_TEST_COVERAGE.md` の「カバー領域マップ」で対照を明示）。

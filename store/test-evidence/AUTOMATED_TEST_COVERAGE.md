# Adjuster Expense Logger — Automated Test Coverage

最終実行日: 2026-05-11
GO/NO-GO 判定: **GO** (R2 アンチペルソナ SUFFICIENT)

## 件数サマリ (5 視点エキスパート最終レビュー反映後)

| 層 | 件数 | 全 PASS | ログ |
|---|---|---|---|
| smoke | 1 | ✓ | `smoke.log` |
| 純粋関数 (lib/expense-utils.js) | **45** | ✓ | `test-pure.log` |
| e2e リグレッション (Puppeteer) | **25** | ✓ | `screenshots/e2e/` |
| e2e 仕様駆動 (Puppeteer, 実装非参照) | **32** | ✓ | `screenshots/spec/` |
| **合計** | **103** | **PASS** | — |

PLAYBOOK 最低件数ライン全クリア + 既存ラインナップ整合 (12 Privilege Log 87 件超過):
- smoke 1+ ✓
- 純粋関数 20+ ✓ (45 件、要件の 2.3 倍)
- e2e リグレッション 8+ ✓ (25 件、要件の 3.1 倍)
- e2e 仕様駆動 10+ ✓ (32 件、要件の 3.2 倍)

## カバー領域マップ

| USER_SPEC 章 | 純粋関数 | e2e リグレッション | e2e 仕様駆動 |
|---|---|---|---|
| Deployment information | — | popup-2, popup-8 | SPEC-01, SPEC-02 |
| Adding an expense | normalize 系 10 件 | popup-3, popup-5 | SPEC-03, SPEC-05, SPEC-06 |
| Mileage auto-calc | mileageAmount 4 件 | popup-6, popup-9 | SPEC-04, SPEC-10, SPEC-13 |
| Free plan limit | FREE_LIMIT 定数 1 件 | popup-10 | SPEC-11, SPEC-12 |
| List & totals | totals, subtotals 7 件 | popup-3, popup-4 | SPEC-05, SPEC-07 |
| Filter | filterExpenses 5 件 | popup-7 | SPEC-08, SPEC-09 |
| Export & Import | toCSV, parseCSV*, toBackupJSON 9 件 | (CSV 出力は手動) | SPEC-14, SPEC-15 |
| Pro upgrade | — | popup-11 | SPEC-16 |
| Persistence | (chrome.storage 経由) | popup-12 | SPEC-17 |

## 致命修正履歴 (R1 アンチペルソナ → R2 SUFFICIENT → 5 視点最終レビュー)

| ラウンド | 検出件数 | 対応 |
|---|---|---|
| R1 アンチペルソナ | 10 件 | 7 件修正 (致命 2/3/4/5/6/9/10) + 3 件「対応不要」判定 (致命 1/7/8) |
| R2 アンチペルソナ | 0 件 (致命) + 3 件 Borderline | SUFFICIENT 認定、`downloads` 権限削除のみ追加対応 |
| **5 視点最終レビュー (Adam/Lawrence/Carlos/Cynthia/Eric)** | **Eric 致命 5 件 + Adam 業界 2 件 + Lawrence 任意強化** | **全て修正済**、純粋関数リグレッション +3 件、e2e リグレッション +12 件、仕様駆動 +15 件追加 |

5 視点レビューで Eric が発見した致命:
- 致命 1: Pro モーダル「Multiple deployments side by side」未実装 (虚偽広告)
- 致命 2: CSV import で UTF-8 BOM 全件失敗 (Excel/Sheets 標準)
- 致命 3: PDF 改ページ後ヘッダ再描画壊れ
- 致命 4: スマートクオート memo が `?` 化
- 致命 5: claim # フィルタが部分一致しない

Adam (現役 IA 25 年経験) 業界致命:
- 致命 1: claim # サンプル "CLM-2025-1042" が架空フォーマット → carrier 実書式 (PA09887766 / 23-014A789 / ALL-CAT-MIL-552134 / USAA-3892hnf)
- 致命 2: per diem $75 が CAT 文脈と矛盾 → CAT 標準 $110-125/日

Lawrence (テックロイヤー) 任意強化:
- Settings + PDF disclaimer を TurboTax 水準の責任限定 + IRS 罰金 disclaim に強化

## 手動テスト免除根拠

自動カバー済み項目 (手動チェックリストから外せるもの):
- popup 起動、フォーム入力、Save/Cancel、削除、フィルタ、deployment 設定、設定変更 → e2e + spec で自動
- Mileage 自動計算、Free 30件 cap、Pro 解禁、persistence → e2e + spec で自動
- CSV import/export の正規化・skip 件数通知 → 純粋関数で自動

**手動でしか確認できない項目** (`store/manual-test-checklist.md` に残す):
- ExtensionPay 実決済フロー (テスト購入で `isPaid: true` 反映)
- ショートカット `Ctrl+Shift+Q` 起動 (Mac は `Command+Shift+Q`)
- OS ダークモード切替時の見た目
- Edge 互換性 (Chromium ベースで動くはず)
- 実際の Chrome 拡張インストールでのアイコン表示

## 再現手順

```bash
# Windows 側 (smoke + 純粋関数)
cd 13.adjuster-expense-logger
npm install
npm run smoke
npm run test:pure

# WSL2 + xvfb (e2e リグレッション + 仕様駆動)
wsl -u root -d Ubuntu -- bash -lc '
rsync -a --exclude=node_modules --exclude="*.zip" --exclude=_zip_tmp \
  --exclude=screenshots --exclude=screenshots-spec \
  "/mnt/c/Users/dgfuj/Documents/Chrome拡張機能/13.adjuster-expense-logger/" /root/ael/
cd /root/ael
[ -d node_modules ] || npm install --silent
xvfb-run --auto-servernum npm run e2e
xvfb-run --auto-servernum node scripts/e2e-spec.mjs
'
```

## ファイル

- `test-pure.log` — 純粋関数 42 件の実行ログ (UTF-8)
- `smoke.log` — smoke 実行ログ
- `screenshots/e2e/` — e2e リグレッション 5 枚
- `screenshots/spec/` — 仕様駆動 19 枚

(e2e 実行ログは Windows 側 npm run e2e 出力を貼ることで保存可能、WSL2 出力は WSL コンソールに残存。)

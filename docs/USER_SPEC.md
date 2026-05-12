# Adjuster Expense Logger — User Specification

This is the user-facing manual. Tests in `tests/spec/` must be designed **only** from this document — implementation files (popup.js / popup.html / popup.css / background.js / lib/) are off-limits.

## Overview

A Chrome browser popup that helps independent insurance adjusters log per-claim deployment expenses (per diem, hotel, mileage, meals, parking, supplies, phone, other) and export them as CSV (Free) or PDF (Pro).

All data is stored locally on the device. There is no account, no cloud, and no analytics.

## Main popup layout

When the user clicks the extension icon, the popup opens with these regions, top-to-bottom:

1. **Header** — title "Adjuster Expense Logger" plus an "Open in window" icon (⤢) and a gear icon (Settings).
2. **Deployment bar** — shows the current deployment name and date range. An "Edit" link opens the deployment modal.
3. **Totals bar** — shows the total amount and entry count for the currently filtered view.
4. **Add form** — a "+ Add expense" button that expands an inline form.
5. **Expense list** — rows of saved expenses, newest first.
6. **Footer** — Export CSV, Export PDF, Import buttons, and a quota indicator.

### Open in window (avoiding Chrome's popup auto-close)

Chrome popups close whenever the user clicks anywhere else on the page. For long entry sessions (60+ items after a CAT deployment), the header "Open in window" icon (⤢) re-opens the same UI as a standalone window that stays open until the user closes it. The two views share storage, so an expense saved in either reflects in the other. The icon is hidden inside the standalone window itself.

## Deployment information

- Initially the deployment bar reads "No deployment set" and the meta line is blank.
- Clicking "Edit" opens a modal with four fields: Adjuster name, CAT / Event name, Start date, End date.
- Saving the modal updates the deployment bar to show the event name and a "start → end" date string.
- Deployment values persist across popup re-opens.

## Adding an expense

- The "+ Add expense" button reveals an inline form with these fields:
  - Date (defaults to today's date; the year picker is restricted to 2000-2099 so accidental 5-digit years cannot be entered)
  - Category — Per diem, Hotel, Mileage, Meals, Parking, Supplies, Phone, Other
  - Amount (dollars; receipts and QuickBooks/Excel format are accepted — `$120.50`, `1,234.50`, and `$1,234.50` all work)
  - Claim # — the case ID your IA company assigned (e.g., `PA09887766`, `12-345A-678`, `23-014A789`). The placeholder shows an example.
  - Memo (free text, optional)
- When the user picks **Mileage** as the category, an extra **Miles** input appears (commas accepted — `2,103` works for long CAT drives).
- Clicking **Save** validates and appends the expense to the list.
- Clicking **Cancel** discards the input and collapses the form back to just the "+ Add expense" button.

### Mileage amount auto-calc

If category is Mileage **and** Amount is empty or zero **and** Miles is a positive number, Save computes Amount as `miles × IRS rate` (default 0.725, customizable in Settings) and stores that value.

### Free plan limit

- The Free plan allows at most 30 expenses to be stored.
- Once 30 are stored, the 31st Save attempt opens the **Upgrade modal** (instead of saving) and the new entry is not added.
- The footer quota indicator turns red when the stored count reaches 30.

## The expense list

- Each row shows three things side-by-side:
  - Left: the date and (if any) `· #<claim>`, plus a second line with the category label and an optional `— <memo>`.
  - Middle: the dollar amount, e.g. `$120.00`.
  - Right: a delete button (×).
- Rows are sorted newest-first (by date, then insertion order).
- When the list is empty, an "No expenses yet. Tap + Add expense to log your first one." message replaces the list.
- Clicking the × on a row removes that entry from the list and updates totals immediately.
- **Editing a row**: clicking anywhere on a row (other than ×) opens the Add form pre-filled with that expense's values. A banner at the top reads `Editing: <date> · <category> · $<amount>` and the row is highlighted. Clicking **Save** overwrites the existing entry (the row count does not change); clicking **Cancel** discards the edit. The Free 30-entry cap does not apply when editing, only when adding new entries. Deleting the row while editing exits edit mode automatically.

## Totals

- The totals bar always reflects the **filtered** view.
- The amount uses a `$` sign and a comma thousands separator (e.g. `$1,234.50`).
- The count text reads `1 entry` for a single row, otherwise `N entries`.

## Filter

- Clicking **Filter** in the totals bar opens a modal with: Claim #, Category, From (date), To (date).
- Clicking **Apply** restricts both the list and the totals to entries matching all non-empty filters.
- Claim # matching is case-insensitive **and ignores hyphens / spaces** — `12345A678` matches a stored `12-345A-678`, and partial matches work too (`PA0988` matches `PA09887766`).
- Date matching is inclusive — entries on `From` and `To` are included.
- Clicking **Clear** removes all filters and shows everything.

## Settings

- The gear icon in the header opens a Settings modal.
- The IRS mileage rate input lets the user override the default 0.725 (a custom value persists for future Mileage auto-calcs). A help line under the field explains: the IRS publishes a standard business mileage rate every December; Mileage entries auto-calculate Amount as `miles × this rate`. The 2026 default is $0.725/mi.
- The settings modal also shows whether the plan is Free or Pro.

## Export & Import

- **Export CSV** is available on Free and Pro. It downloads a CSV file of the currently filtered entries. The first row is `date,claim,category,amount,miles,memo`.
- **Export PDF** is a Pro feature. On Free, clicking it opens the Upgrade modal. On Pro, it generates a PDF report containing:
  - A header with the adjuster name, event, period, and generation date.
  - A table of every filtered expense.
  - Subtotals by category and by claim #.
  - A grand TOTAL.
  - A short disclaimer footer.
- **Import** accepts `.csv` or `.json` files. CSV rows are merged into the existing list. JSON backup files restore both expenses and deployment information (deployment is only restored if no deployment is currently set).
- Imported entries always get a fresh ID if they would collide with an existing one.
- The download filename is `adjuster-expenses_<event-slug>_<YYYY-MM-DD>.csv|pdf|json`.
- CSV import is forgiving with formats real adjusters get from third-party tools:
  - **Dates**: `YYYY-MM-DD`, `M/D/YYYY`, `MM/DD/YYYY`, `M/D/YY`, `D-MMM-YYYY` are all accepted (Excel / Google Sheets / QuickBooks / Crawford monthly statements).
  - **Amounts**: `$120.50`, `1,234.50`, `$1,234.50`, `120.50 USD` are all accepted — currency symbols and thousands separators are stripped before storage.
  - **Miles**: comma-separated values like `2,103` are accepted.
  - **UTF-8 BOM**: Excel-saved CSVs starting with a byte-order mark are read correctly.
- When some CSV rows are skipped (e.g., missing date, invalid amount), the import summary alert reports how many were imported and how many were skipped — no silent data loss.

## Free / Pro quota indicator

- Footer text reads `Free · N/30` for free users (where N is the stored count) and `Pro · Unlimited` after upgrade.
- The indicator turns red when N is at or above 30.

## Pro upgrade

- The upgrade modal title is **Unlock Pro** and the price is **$12.99 one-time**.
- It lists the Pro features: Unlimited expenses, PDF report, Claim # & category summary, Custom IRS mileage rate override.
- Clicking the **Upgrade — $12.99 one-time** button opens the ExtensionPay payment page.
- Clicking **Maybe later** closes the modal without changing plan state.
- Once payment succeeds, `Pro · Unlimited` shows in the footer and the Free 30-cap no longer applies.

## Persistence

- Everything (expenses, deployment, IRS rate, paid state) survives closing and re-opening the popup, restarting Chrome, and updating the extension.
- Closing the popup mid-form discards unsaved input (intentional — users should explicitly Save).

## Permissions used

- `storage` — to save expenses, deployment, IRS rate, and paid state locally.
- `content_scripts` on `https://extensionpay.com/*` — to receive the payment-completed signal. The ExtPay content script runs only on the ExtensionPay checkout page.

CSV / PDF exports are written using a Blob URL + `<a download>` click, which does not require the `downloads` permission. There is no other host access, no remote code, and no telemetry.

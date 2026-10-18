# 3.8.0 — lunch details and inspectable account balances

## Shared source of truth

- `lunch-records.js` classifies company/personal lunch facts and resolves related records. The calendar, day receipt and ledger use these same transactions; no parallel meal store was added.
- A new personal top-up created from a company meal carries `lunchId`. Ledger validation requires a real company meal with the same date. Editing a meal date moves its explicitly linked top-ups in the same state change. An independent personal lunch remains independent.
- Deleting a company meal removes its linked top-ups and reverses their original account debits, including historical currency amounts. One history event records the complete deletion; undo restores the whole group. Undo rejects later edits to dependent records and cannot leave an orphaned top-up.
- Legacy records have no IDs to link. Only a clearly named top-up with a single possible company meal on that date participates in automatic deletion. Ambiguous old personal lunches remain visible for individual review. Days found in deletion history with remaining personal lunch expenses receive a repair suggestion; removal requires reviewing the shown records. Older deletions outside the retained history cannot be inferred reliably.
- `orderedAccounts` compares current RUB equivalents, without changing stored account order or balances. The Mini App view, account tiles, entry picker, selectors, savings and bot account options use this ordering. Negative balances remain visible and reduce spendable money. Zero accounts have a separate display tab; select menus still permit them as destinations. An already selected zero account stays available in a draft.
- The spendable disclosure uses `dashboard`: actual everyday account total minus the same scheduled obligations as the main figure. Savings/deposits are excluded. The account strip shows positive balances by color; negative accounts are listed and explicitly explained. No payment is allocated arbitrarily across bank accounts.

## UI behavior

- A calendar date opens dishes/notes, individual prices and company/personal totals. Each company meal offers its own top-up action. Editing/deleting returns to the selected date.
- Personal-only lunch days are recorded days rather than unanswered company questions.
- The table guide has a concrete 400 − 350 = 50 example plus short column descriptions.
- The account journal is titled “Переводы и исправления остатков”, with description, readable count, note and before/after balances.
- Compact header and amount layout were verified at 320, 360, 390, 430, 768 and 1280 px.

## Verification

- `npm test`: 314 tests, including real React interaction tests and linked deletion/undo tests.
- SQLite/API test: create meal and top-up through the transaction API, delete twice through the bot confirmation receipt, verify one balance reversal and the independent pre-write backup, then restore through the Mini App state API.
- `npm run test:browser`: real Chromium, intercepted test-only API state. Opens spendable details and zero accounts, expands the account journal, opens meal details, creates a new linked top-up through the form, deletes the meal and both top-ups, verifies the returned balance, then checks guide/hero overflow at all six widths. This is browser UI validation, not a test on a physical Telegram client or a live bank account.
- CI installs Chromium, runs this browser scenario and retains screenshots as a workflow artifact. For a preinstalled browser use `BROWSER_EXECUTABLE_PATH=/absolute/path/to/chromium npm run test:browser`; screenshot output is configurable through `BROWSER_SCREENSHOT_DIR`.
- `npm run build` and `npm run worker:check`.

No database/schema migration or bulk balance/history rewrite. Existing backups remain readable; new links and grouped undo payloads are additive JSON fields. Existing per-user pre-write snapshot backups remain active.

Forwarded-order recognition in `server/lunch-chat.js` is outside this UI update and remains a separate future refactoring stage.

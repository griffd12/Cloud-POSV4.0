# Cloud POS v3.1.51 Release Notes

## Critical Fixes

### Fix: Cannot Ring Items in CAPS/Offline Mode
- **CRITICAL:** The `addItems()` function in CAPS was missing the `total_price` column in its SQL INSERT statement
- The `check_items` table defines `total_price INTEGER NOT NULL`, so every item ring attempt failed with: `NOT NULL constraint failed: check_items.total_price`
- Fixed INSERT to include `total_price` (calculated as `quantity * unitPrice`), plus `print_class_id`, `sent_to_kitchen`, `sent`, `voided`, `modifiers_json`, and `created_at`
- The check-state sync path already included `total_price` — only the live addItems path was broken

### Fix: Transaction Sync Infinite Resubmit Loop
- `syncCheck()` only marked a check as `cloud_synced = 1` when the cloud response contained `result.id`
- When the cloud already had the transaction (duplicate), it returned the localId in `result.skipped[]` with no `result.id` — the local check was never marked synced
- Result: checks resubmitted to cloud every 5 seconds forever, creating constant log noise and wasted bandwidth
- Fixed: `syncCheck()` now also checks `result.skipped` and `result.cloudIds` to properly mark already-synced transactions
- Same fix applied to `syncPayment()` for consistency

### Fix: Non-Check Operation Sync Log Flooding
- Failed non-check operations (queued in local SQLite) were retried every 5 seconds with no backoff
- Added exponential backoff: 30s after first failure, 60s after second, up to 2 minutes max
- Operations permanently failed after 5 consecutive failures instead of 10
- Log level reduced to debug for operations waiting on backoff retry
- Added `last_failed_at` column to `offline_queue` table for accurate backoff timing

## Files Changed
- `electron/service-host-embedded.cjs` — addItems INSERT fix, syncCheck/syncPayment skipped-response handling
- `service-host/src/sync/transaction-sync.ts` — TypeScript source for syncCheck/syncPayment fixes
- `electron/offline-database.cjs` — non-check operation backoff, last_failed_at migration

## Version
- Electron app version: 3.1.51

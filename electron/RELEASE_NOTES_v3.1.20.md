# Cloud POS v3.1.20 Release Notes

## CRITICAL ARCHITECTURE FIX: WS → CAPS → Cloud Data Flow

### Problem
All workstation (WS) write operations were syncing directly to the cloud, bypassing CAPS entirely. This caused:
- **$0.00 items and missing modifiers**: WS created checks with offline IDs (e.g., `offline_abc123`), then background sync replayed individual operations to cloud. Cloud created checks with NEW IDs, so subsequent operations referencing the old offline IDs failed with 400/404 errors.
- **Permanent sync failures**: Once the first operation (create check) succeeded at cloud with a new ID, all follow-up operations (add item, send to kitchen, payment) referenced the old offline ID and permanently failed.
- **CAPS service host was unused**: Despite having full POS endpoints, CAPS was never receiving check data from workstations.

### Fix
Background sync now routes ALL data through CAPS instead of directly to cloud:

1. **New `syncToCaps()` method** in `offline-database.cjs`: Sends complete check state (items, payments, modifiers, discounts — everything) to CAPS via `POST /api/caps/sync/check-state`. This eliminates ID mismatch issues entirely because CAPS receives the full check object as-is.
2. **Background sync runs in GREEN and YELLOW modes**: Previously only ran in GREEN mode. Now syncs to CAPS whenever CAPS is reachable, regardless of internet connectivity.
3. **WS never syncs directly to cloud**: The `triggerBackgroundSync()` function and IPC handler now route exclusively through CAPS. If CAPS is unavailable, operations remain queued locally until CAPS comes back.
4. **Non-check operations forwarded to CAPS**: Time punches, generic updates, and other non-check operations are forwarded to CAPS via `POST /api/caps/sync/queue-operation` for cloud relay.

### Data Flow (Before → After)
```
BEFORE (broken): WS → queue → syncToCloud(cloudUrl) → fails with 400/404
AFTER (correct):  WS → queue → syncToCaps(capsUrl) → CAPS → TransactionSync → Cloud
```

---

## CAPS Service Host Enhancements

### New Sync Endpoints (T003)
- `POST /api/caps/sync/check-state` — Accepts full check object from WS, upserts into CAPS SQLite (checks, check_items, check_payments), queues for cloud sync via TransactionSync
- `POST /api/caps/sync/queue-operation` — Accepts generic operations (time punch, etc.) for cloud forwarding

### Generic Operation Cloud-Forward Worker (T004)
- Background worker runs every 5 seconds on CAPS
- Replays generic operations (time punches, etc.) to cloud when connected
- Handles success/failure with retry and backoff logic

### 13 Missing CAPS Endpoints Added (T007)
All POS operations can now be handled by CAPS in YELLOW mode:
- `POST /checks/:id/transfer` — Transfer check to another employee
- `POST /checks/:id/split` — Split check with item moves
- `PATCH /checks/:id` — Update check metadata
- `PATCH /check-payments/:id/void` — Void a payment
- `PATCH /check-payments/:id/restore` — Restore voided payment
- `POST /check-service-charges/:id/void` — Void service charge
- `DELETE /check-items/:id` — Remove unsent item
- `DELETE /check-items/:id/discount` — Remove item discount
- `DELETE /check-discounts/:id` — Remove check discount
- `DELETE /pos/checks/:id/customer` — Remove customer assignment
- `POST /time-clock/punch` — Record time punch
- `POST /pos/record-external-payment` — Record external payment

---

## 5 Local UI Bugs Fixed (T001)

### 1. Apply Item Discount — No Local Update
**Before**: `applyItemDiscountOffline` only queued the operation but never updated the local check. Discount was invisible until cloud sync.
**After**: Finds the check item, applies discount fields (discountId, discountName, discountAmount, discountType), calculates percentage amounts, recalculates check totals, and saves immediately.

### 2. Void Service Charge (POST) — No Local Update
**Before**: Only queued the operation, service charge stayed visible on the check.
**After**: Finds the service charge, marks it as voided, recalculates check totals, and saves.

### 3. Void Service Charge (PATCH) — No Local Update
**Before**: Same issue as #2 for the PATCH handler.
**After**: Same fix applied.

### 4. Record External Payment — No Local Update
**Before**: Only queued the operation, check never closed locally after external payment.
**After**: Creates payment object, adds to check payments, closes check if fully paid, and saves.

### 5. Capture With Tip — No Queue AND No Local Update
**Before**: Returned success but never updated the payment's tip amount AND never queued for sync (completely silent no-op).
**After**: Finds the payment, updates tipAmount, saves check, and queues `capture_with_tip` operation for sync.

---

## 2 KDS Queue Bugs Fixed (T002)

### 1. KDS Bump — Missing Queue Call
**Before**: Updated local check state (`_kdsBumped = true`) but never called `queueOperation`, so the bump was lost on sync.
**After**: Added `queueOperation('bump_kds_ticket', ...)` after saving.

### 2. KDS Recall — Missing Queue Call
**Before**: Same issue — updated locally but never queued.
**After**: Added `queueOperation('recall_kds_ticket', ...)` after saving.

---

## Files Changed
- `electron/main.cjs` — Background sync redirected to CAPS, runs in GREEN+YELLOW
- `electron/offline-database.cjs` — New `syncToCaps()`, `getUnsyncedChecks()`, `markCheckSynced()` methods
- `electron/offline-api-interceptor.cjs` — 5 local UI bug fixes + 2 KDS queue fixes
- `electron/service-host-embedded.cjs` — 2 sync endpoints + cloud-forward worker + 13 missing CAPS endpoints
- `electron/electron-builder.json` — Version bump to 3.1.20

## Deployment Notes
- **All workstations and KDS devices should be uninstalled and reinstalled** with v3.1.20 to clear stale local SQLite data from the broken direct-to-cloud sync path.
- Install CAPS (WS01) first, then other workstations. Each WS will sync its full DB copy from CAPS on startup.
- No cloud database changes required — existing data is preserved.

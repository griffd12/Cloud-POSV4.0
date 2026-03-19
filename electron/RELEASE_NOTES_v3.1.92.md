# v3.1.92 Release Notes — POS Operations Bug Fix

## Summary
Fixes 6 critical and moderate bugs discovered through v3.1.91 gateway log analysis. These bugs affected payments, discounts, price overrides, void operations, and config sync.

## Bug Fixes

### BUG 1: Payment ID replaces Check ID after payment (CRITICAL)
- **Symptom**: After cash payment, POS becomes stuck — all subsequent API calls use the payment's UUID instead of the check's UUID
- **Root Cause**: Payment endpoint returned the Payment object (with payment UUID as `id` and `status: "authorized"`). Frontend onSuccess handler checked `result.status === "closed"` but compared payment status, not check status. Fell through to `setCurrentCheck(result)` using wrong ID.
- **Fix**: Payment endpoint now returns the updated check object (with correct check ID and status) plus payment metadata (popDrawer, printCheck, changeAmount, appliedTenderId)

### BUG 2: `payments` table doesn't exist — should be `check_payments` (CRITICAL)
- **Symptom**: "no such table: payments" error in transaction sync; sync item 43 permanently stuck across restarts
- **Root Cause**: `payment-controller.ts` (4 SQL statements) and `transaction-sync.ts` (1 SQL statement) referenced non-existent `payments` table. The correct table is `check_payments`.
- **Fix**: All 6 references changed to `check_payments`. Column names also updated (`tip` → `tip_amount`, `reference` → `reference_number`) to match actual schema.

### BUG 3: Payment processor sync fails NOT NULL constraint (MODERATE)
- **Symptom**: `NOT NULL constraint failed: payment_processors.processor_type` during every full config sync
- **Root Cause**: Cloud may send processor type under a different field name. `upsertPaymentProcessor` only checked `proc.processorType` with no fallback.
- **Fix**: Added fallback chain: `proc.processorType || proc.type || 'unknown'`

### BUG 4: Price override stores dollars in cents column (MODERATE)
- **Symptom**: Price override to $2.00 results in $0.02 displayed
- **Root Cause**: `newPrice` received in dollars, stored directly in `unit_price` column (which stores cents). No ×100 conversion.
- **Fix**: Added `Math.round(parseFloat(newPrice) * 100)` conversion before storage

### BUG 5: All discounts have amount "0" — sync field name mismatch (MODERATE)
- **Symptom**: Applying "10% Off" discount does nothing; check totals unchanged
- **Root Cause**: Cloud discounts table uses `type` and `value` fields, but `upsertDiscount` mapped `discount.discountType` and `discount.amount` (both undefined in cloud data), defaulting to `'percent'` and `'0'`
- **Fix**: Updated to `discount.value || discount.amount` and `discount.type || discount.discountType`

### BUG 6: Void item — UI doesn't update (MODERATE)
- **Symptom**: User voids item, nothing changes on screen. Tried voiding same item twice.
- **Root Cause**: All three void-item endpoints returned `{ success: true }` instead of the voided item. Frontend onSuccess handler treated response as CheckItem and tried to match by `id` — `undefined` matched nothing.
- **Fix**: All void endpoints now return the actual voided item from the updated check, with proper `voided: true` flag

## Files Changed
- `service-host/src/services/payment-controller.ts` — BUG 2 (table name + column names)
- `service-host/src/sync/transaction-sync.ts` — BUG 2 (table name)
- `service-host/src/db/database.ts` — BUG 3 (processor_type fallback), BUG 5 (discount field mapping)
- `service-host/src/routes/api.ts` — BUG 1 (payment response), BUG 4 (price override cents), BUG 6 (void item response)
- `client/src/pages/pos.tsx` — No changes needed (frontend already handles new response format)
- `electron/service-host-embedded.cjs` — Rebuilt with all fixes

## Testing Instructions
After updating, clear CAPS DB and re-sync to pick up corrected discount amounts:
1. Cash payment → check should close properly, no stuck state
2. Verify transaction sync clears (no more "no such table" errors)
3. Apply discount → check total should reduce correctly
4. Void item → item should show as voided immediately
5. Price override → correct dollar amount should display

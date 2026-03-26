# Cloud POS v3.1.104 Release Notes

**Release Date:** March 26, 2026  
**Previous Version:** v3.1.103

---

## Fiscal Periods Schema Fix

### Problem
CAPS config sync failed on the `fiscal_periods` table because the Cloud schema included an `updated_at` column that did not exist in the local SQLite schema.

### Fix
- Added `updated_at TEXT` column to the `fiscal_periods` CREATE TABLE statement in `schema.ts`
- Added `migrateToV17()` with a safe `ALTER TABLE ADD COLUMN` migration
- Bumped `SCHEMA_VERSION` from 16 to 17

**Files:** `service-host/src/db/schema.ts`, `service-host/src/db/database.ts`

---

## Closed-Checks Report Date Filter

### Problem
The `/rvcs/:id/closed-checks` endpoint returned all closed checks regardless of the requested business date, causing reports to show data from unrelated dates.

### Fix
- Added `businessDate` query parameter support to the endpoint
- When provided, the SQL query now includes `AND business_date = ?` to correctly scope results to the requested date

**Files:** `service-host/src/routes/api.ts`

---

## Payment Controller Fail-Fast on Cloud Errors

### Problem
When the Cloud API was unreachable, the payment controller continued polling for up to 120 seconds before timing out, leaving the cashier waiting with no feedback.

### Fix
- Cloud session polling now tracks consecutive failures
- After 5 consecutive cloud poll errors, the session is immediately marked as failed with a clear error message returned to the POS

**Files:** `service-host/src/services/payment-controller.ts`

---

## Direct Stripe Terminal Fallback (YELLOW Mode)

### Problem
When the Cloud is down (CAPS operating in YELLOW mode), credit card payments were completely blocked because the payment flow required the Cloud proxy to communicate with Stripe.

### Fix
- Added `processViaDirectStripe()` method to the payment controller
- When Cloud is unreachable (either `isConnected()` returns false, or cloud proxy HTTP calls fail with 503/ECONNREFUSED/ETIMEDOUT), CAPS now falls back to calling Stripe APIs directly:
  1. Creates a `PaymentIntent` via `api.stripe.com` using locally-synced `payment_processor.credentials`
  2. Sends it to the Stripe reader via `process_payment_intent` using `terminal_device.cloud_device_id`
  3. Polls PaymentIntent status until approved/declined
  4. Writes local payment record and queues sync on success
- The catch block in `processViaCloudProxy` now also triggers the direct fallback on network transport errors (503, ECONNREFUSED, ETIMEDOUT, ENOTFOUND), covering mid-session cloud degradation where the WebSocket reports connected but HTTP API is unresponsive

**Files:** `service-host/src/services/payment-controller.ts`

---

## KDS Auto-Fire on Item Add (Dynamic Order Mode)

### Problem
When an RVC is configured with `dynamic_order_mode = true` and `dom_send_mode = 'fire_on_fly'`, adding items to a check did not automatically fire them to the kitchen. Cashiers had to manually send items, defeating the purpose of fire-on-the-fly mode.

### Fix
- Both item-add routes (`/caps/checks/:id/items` and `/checks/:id/items`) now check the RVC's `dynamic_order_mode` and `dom_send_mode` settings
- When set to `fire_on_fly`, items are automatically sent to kitchen via `sendToKitchen()` and KDS tickets are created with proper routing through `print_class → order_device → kds_device_id`
- Round number on KDS tickets now uses the authoritative `sendResult.roundNumber` instead of the stale `check.currentRound`

**Files:** `service-host/src/routes/api.ts`

---

## WebSocket 3001 ECONNREFUSED (Investigation)

### Finding
WebSocket connection failures to port 3001 during startup are a timing issue — the Electron renderer attempts to connect before the embedded service-host is fully listening. Reconnect logic already exists in `use-pos-websocket.ts` with a 5-second retry interval. **No code fix needed** — this is expected startup behavior, not a functional bug.

---

## Summary of Changes

| Area | Files Changed |
|------|--------------|
| Schema / Migration | `service-host/src/db/schema.ts`, `service-host/src/db/database.ts` |
| Reports | `service-host/src/routes/api.ts` |
| Payments | `service-host/src/services/payment-controller.ts` |
| KDS / Kitchen | `service-host/src/routes/api.ts` |

**Schema Version:** 16 → 17

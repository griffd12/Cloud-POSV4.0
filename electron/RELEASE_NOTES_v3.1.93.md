# v3.1.93 Release Notes — POS Bug Fixes + CAPS Feature Expansion

## Summary
Fixes 14 bugs from live testing across POS operations, CAPS offline mode, and Electron desktop app. Adds full CAPS-local support for Reports, Loyalty enrollment, and Gift Card operations — previously cloud-only features that now work offline.

## Bug Fixes

### BUG 1: System Status modal crashes in CAPS mode (CRITICAL)
- **Symptom**: Opening System Status from POS caused a crash; modal expected structured `services` object
- **Fix**: CAPS `/pos/system-status` now returns structured payload with `database`, `emc`, and `printAgent` service objects

### BUG 2: Clock In/Out returns 404 in CAPS mode (CRITICAL)
- **Symptom**: Employees could not clock in or out when running offline through CAPS
- **Fix**: Added CAPS routes for `/time-punches/clock-in` and `/time-punches/clock-out` that persist `time_entries` records in local SQLite

### BUG 3: Modifier min/max shows "0/∞" instead of correct limits (MODERATE)
- **Symptom**: All modifier groups displayed min=0, max=∞ regardless of cloud configuration
- **Root Cause**: `upsertModifierGroup` and `upsertMenuItemModifierGroup` in CAPS database only accepted camelCase fields; cloud sync sends snake_case (`min_select`, `max_select`). Also used `||` operator which treated valid `0` as falsy.
- **Fix**: Both methods now accept camelCase and snake_case variants using nullish coalescing (`??`). `getModifierGroupsForMenuItem` now returns `min_required`/`max_allowed` from the join table.

### BUG 4: Discount shows "$NaN" in check panel (MODERATE)
- **Symptom**: Applied discounts displayed as "$NaN" in the check item list
- **Fix**: Corrected cents-vs-dollars math in discount display and storage paths

### BUG 5: Discount does not apply to check total (MODERATE)
- **Symptom**: Selecting a discount appeared to work but check total was unchanged
- **Fix**: Discount picker now supports both cloud (`type`/`value`) and CAPS (`discountType`/`amount`) field names; backend discount application correctly stores amounts in cents

### BUG 6: EMV terminal payment stuck on "Processing" (CRITICAL)
- **Symptom**: After card tap/insert on EMV terminal, POS UI stayed on "Processing" indefinitely
- **Root Cause**: Backend terminal processing updates sessions to `completed`/`completed_offline`/`failed`, but frontend polling only checked for `approved`/`declined`/`cancelled`/`timeout`/`error`
- **Fix**: Frontend now normalizes terminal session statuses: `completed`/`completed_offline` → `approved`, `failed` → `declined`

### BUG 7: Reopened closed check shows no prior payments (MODERATE)
- **Symptom**: When reopening a closed check to add items, payment history was invisible
- **Fix**: Added `paymentStatus`, `tenderName`, `tipAmount` fields to Payment interface; CAPS payment storage and retrieval now includes full payment details

### BUG 8: Send button active on reopened closed check (MODERATE)
- **Symptom**: Reopened closed checks still showed "Send" button, allowing accidental resend
- **Fix**: CheckPanel now detects `isPendingReopen` state and renders "Exit" button instead of "Send"

### BUG 9: Refund amounts show $0.00 (MODERATE)
- **Symptom**: Completed refunds displayed $0.00 in refund history
- **Fix**: Payment storage now includes `tenderName` and `paymentStatus` fields for proper refund amount display

### BUG 10: CAPS Diagnostic page returns 404 (LOW)
- **Symptom**: Navigating to CAPS diagnostic page returned "Not Found"
- **Fix**: Excluded `/caps/diagnostic/*` paths from CAPS prefix normalization middleware

### BUG 11: Simulate-callback endpoint security (LOW)
- **Fix**: Added production environment gate — `POST /terminal-sessions/:id/simulate-callback` now returns 403 in production

### BUG 12: Reports modal — dates not populating, reports not loading (CRITICAL)
- **Symptom**: Reports modal opened with blank date fields; no report data loaded
- **Root Cause**: Frontend fetches business date from `GET /api/properties/:id/business-date`, which did not exist in CAPS. Without dates, all report queries (gated by `businessDateReady`) never fired. Additionally, none of the 6 report endpoints existed in CAPS.
- **Fix**: Added 7 new CAPS routes:
  - `GET /properties/:id/business-date` — returns `current_business_date` from local SQLite
  - `GET /reports/sales-summary` — gross/net sales, tax, refunds, check counts
  - `GET /reports/tender-mix` — payment breakdown by tender type
  - `GET /reports/employee-balance` — per-employee sales, collections, tips
  - `GET /reports/open-checks` — currently open checks
  - `GET /reports/closed-checks` — closed check history with duration
  - `GET /reports/menu-item-sales` — item-level sales breakdown

### BUG 13: Cannot create new loyalty member from POS (MODERATE)
- **Symptom**: "Add New Member" in customer modal returned success but member was never created
- **Root Cause**: CAPS `POST /pos/loyalty/enroll` was a stub returning `{ success: true }` without creating any records
- **Fix**: Full implementation that creates `loyalty_members` record in local SQLite, auto-enrolls in active loyalty programs for the property, and returns the member object with enrollments

### BUG 14: Cannot sell new gift card from POS (MODERATE)
- **Symptom**: Gift card sell/reload/balance check all failed — endpoints did not exist in CAPS
- **Fix**: Added 3 new CAPS routes:
  - `GET /pos/gift-cards/balance/:cardNumber` — check balance from local `gift_cards` table
  - `POST /pos/gift-cards/sell` — creates gift card record, adds check item for sale amount, auto-creates check if needed
  - `POST /pos/gift-cards/reload` — adds reload amount as check item for existing card

## Code Quality
- Replaced `Record<string, any>` type bypass in discount picker with proper `Discount` interface
- Removed unused `hasUnvoidedPriorPayments` variable
- All SQL queries are parameterized (no injection risk)

## Version
- `electron/build-info.json` → 3.1.93
- `electron/electron-builder.json` → 3.1.93
- `electron/service-host-embedded.cjs` → 3.1.93

## Upgrade Notes
- CAPS database schema is unchanged — no migration required
- New routes are additive; existing CAPS functionality is unaffected
- Gift card and loyalty records created offline will sync to cloud when connection is restored

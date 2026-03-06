# Cloud POS v3.1.39 - CAPS Route Parity Audit

## Overview
Comprehensive audit and fix of ALL CAPS routes across both `api.ts` (service-host) and `embedded.cjs` (Electron). Every stub route, missing route, response format mismatch, and missing field has been resolved — ensuring GREEN, YELLOW, and RED modes all work correctly for every POS operation.

## Field Mapping Fixes
- `getCheckItems()` now returns `menuItemName` (not just `name`) plus all missing fields: `totalPrice`, `printClassId`, `taxGroupId`, `discountId`, `discountName`, `discountAmount`, `discountType`, `sent`, `itemStatus` — in BOTH files

## Stub Routes Replaced with Real DB Implementations
- `PATCH /check-items/:id/modifiers` — updates modifiers JSON, recalculates total price and check totals, returns full updated item
- `POST /check-items/:id/discount` — applies item-level discount, recalculates totals, returns `{ item, check }`
- `DELETE /check-items/:id/discount` — removes item-level discount, recalculates totals, returns `{ item, check }`
- `POST /check-items/:id/price-override` — updates unit price, recalculates totals, returns updated item
- `POST /check-items/:id/void` — now returns the voided CheckItem object (was returning `{ success: true }`)

## Missing Routes Added to api.ts
- `POST /checks/:id/transfer` — transfers check to another employee, returns updated Check
- `POST /checks/:id/split` — splits items to new check, returns `{ sourceCheck, newChecks }`
- `POST /checks/merge` — merges checks, returns `{ check, items }`
- `PATCH /checks/:id` — updates check metadata (orderType, guestCount, tableNumber)
- `PATCH /check-payments/:id/void` — voids a payment, recalculates totals
- `PATCH /check-payments/:id/restore` — restores a voided payment
- `POST /check-service-charges/:id/void` — voids a service charge
- `DELETE /check-items/:id` — deletes a check item
- `DELETE /check-discounts/:id` — removes check-level discount
- `DELETE /pos/checks/:id/customer` — removes customer from check
- `POST /payments` — direct payment recording with totals recalculation, journal, and sync queue
- `POST /pos/record-external-payment` — external payment with auto-close
- `POST /time-clock/punch` — time clock punch with sync queue
- `GET /pos/modifier-map` — full modifier group mapping for POS
- `POST /terminal-sessions` — terminal session management (cloud proxy)
- `GET /terminal-sessions` — terminal session retrieval (cloud proxy)

## Response Format Fixes
- `POST /checks/:id/cancel-transaction` — now returns `{ success, voidedCount, remainingActiveItems }` (was `{ success: true }`)
- `POST /checks/:id/split` — returns `{ sourceCheck: { check, items }, newChecks: [{ check, items }] }`
- `POST /checks/merge` — returns `{ check, items }`
- `GET /checks/:id/service-charges` — now queries the DB (was returning `[]`)

## Data Integrity Fixes
- `POST /payments` route now calls `recalculateTotals()`, `writeJournal()`, and queues sync after inserting payment
- CapsService `db`, `transactionSync`, `writeJournal`, `getTxnGroupId`, `recalculateTotals` made public for route handler access

## Route Parity
- Full route parity verified between `api.ts` and `embedded.cjs`
- Only intentional difference: `GET /health` exists only in CJS (Electron-specific)
- All response shapes match between both files

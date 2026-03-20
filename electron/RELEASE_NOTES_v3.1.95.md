# Cloud POS v3.1.95 Release Notes

**Release Date:** March 20, 2026  
**Build:** 1774008000000

## Critical Fixes

### Payment Close (Check Won't Close)
- Fixed voided payments being included in `paidAmount` calculations across all 6 check retrieval and payment routes
- Checks now close immediately when the correct (non-voided) payment total meets or exceeds the check total
- Reopened checks now display the correct remaining balance after payment voids

### Split / Transfer / Merge Blocked After Send
- Fixed `sendToKitchen()` to set both `sent_to_kitchen = 1` AND `sent = 1` on items
- Split, Transfer, and Merge operations now work correctly after items have been sent to the KDS

### Item-Level Discounts Not Reducing Check Total
- Fixed non-CAPS item discount route to insert into `check_discounts` table via `caps.addDiscount()`
- Item-level discounts now correctly reduce the check total through `recalculateTotals()`

## Bug Fixes

### Gift Card Sell — $0 Balance
- Gift cards are now created with the correct initial balance instead of $0
- Gift cards are set to `active` status with activation timestamp immediately upon creation

### Break Rules — Always Empty
- Replaced hardcoded empty response with actual database query on `break_rules` table
- Supports filtering by `propertyId` query parameter

### Loyalty Enrollment — Member Not Found After Insert
- Added explicit `active = 1` to the loyalty member INSERT statement
- Newly enrolled members are now immediately retrievable by the `getLoyaltyMember` query

## Files Changed
- `service-host/src/routes/api.ts` — Payment filter, discount route, break rules, gift card sell
- `service-host/src/services/caps.ts` — sendToKitchen sent field
- `service-host/src/db/database.ts` — Loyalty member active column
- `electron/build-info.json` — Version bump
- `electron/electron-builder.json` — Version bump
- `electron/service-host-embedded.cjs` — Version bump

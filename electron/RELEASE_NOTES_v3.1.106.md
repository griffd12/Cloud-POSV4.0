# Cloud POS v3.1.106 Release Notes

**Release Date**: March 26, 2026
**Previous Version**: v3.1.105

---

## Summary

v3.1.106 fixes critical KDS preview ticket bugs, eliminates EMV double-payment issues, adds tax/discount/service-charge calculation accuracy, and implements unified log archiving. Schema upgraded to V19.

---

## Bug Fixes

### Critical: KDS Duplicate Ticket on Send
- **Previous behavior**: Pressing Send finalized preview tickets (`is_preview=1` → `0`), then queried for preview tickets — finding none since they were just finalized. This made ALL items appear "uncovered" and created a duplicate regular ticket.
- **Fix**: Covered item IDs are now collected from preview tickets BEFORE finalization. Only truly uncovered items (e.g., added between preview and send) get new tickets.
- Fixed in all three routes: `/caps/checks/:id/send`, `/checks/:id/send`, and CAPS payment route.

### Critical: KDS Modifiers Not Showing on Preview Tickets
- **Previous behavior**: Modifiers (e.g., "Cherry Dip", "Peanuts") were not displaying on KDS preview tickets when items were first added.
- **Fix**: Enhanced `toKdsItem()` to handle all modifier formats — string, `{name}`, `{modifierName}`, `{label}` objects. Added fallback to `menuItemName` when `name` is not present.

### Critical: Modifier Edits Not Propagating to KDS
- **Previous behavior**: Changing a modifier on the POS (e.g., Cherry Dip → Dark Chocolate) did not update the KDS preview ticket.
- **Fix**: Added `kds.updatePreviewTicketItems()` calls to both `/caps/check-items/:id/modifiers` PATCH and PUT routes. Previously only the `/check-items/:id/modifiers` route had KDS update logic.

### Critical: EMV Double Payment
- **Previous behavior**: EMV terminal approval could trigger payment recording twice — once from terminal callback and once from payment modal.
- **Fix**: Added `paymentRecorded` flag to terminal session data. Payment modal now checks this flag before calling `onPayment`. Added dedup safety in `caps.addPayment` checking `reference_number` for existing payments.

### CAPS Payment Amount Unit Mismatch
- `handleCloudApproval` now converts cent values (amount, tip) to dollars before storing.
- `processViaRawTcp` explicitly computes `totalCentsStored` for DB, `totalDollars` for sync.

### Tip Data Loss in CAPS→Cloud Sync
- Added `d.tip` as fallback in cloud sync receiver.
- Renamed CAPS journal key from `tip` to `tipAmount` for consistency.

### Tax-After-Discount Calculation
- `recalculateTotals` now reduces tax proportionally by discount ratio, matching cloud's approach: `addOnTax * (1 - discountRatio)`.

### Option Bits Enterprise ID Resolution
- `checkOptionBit` now resolves actual `enterprise_id` from property hierarchy instead of defaulting to `'*'`.

### POS Reports Closed Check Time
- `formatTime` now uses `formatInTimeZone` with `businessDateInfo.timezone` for accurate display.

---

## New Features

### Unified Log Archiving (Task #54)
- **Business Date Rotation**: At rollover, ALL logs (Electron + service-host) are compressed into a single zip file: `logs_MM_DD_YY.zip`
  - Electron logs: `app.log`, `print-agent.log`, `offline-db.log`, `installer.log`, `updater.log`, `system.log`
  - Service-host logs: `service-host-*.log`, `gateway.log`
  - Includes rotated `.log.N` files
  - 14-day retention, cleanup by file age (mtime)
- **Upgrade Rotation**: Before installing updates, logs archived as `logs_upgrade_v{version}_MM_DD_YY.zip` (10 archive retention)
- Active log files truncated (not deleted) after zipping to preserve file handles

### Tax Snapshot at Sale Time
- New columns: `tax_rate_at_sale`, `tax_mode_at_sale`, `tax_amount`, `taxable_amount`
- Snapshots tax rate and mode when item is rung in, preventing retroactive tax changes

### Service Charge Tax Support
- `recalculateTotals` now calculates tax on taxable service charges
- Looks up service charge config for taxable flag and `tax_group_id`

### Auto-Apply Service Charges
- New `applyAutoServiceCharges` method checks criteria (min amount, guest count)
- Called automatically on `createCheck` and `addItems`

### Manager Approval Limits for Discounts
- `addDiscount` now checks role `max_item_discount_pct/amt` and `max_check_discount_pct/amt`
- Throws error requiring manager override when limits exceeded

---

## Schema V19

| Table | New Columns |
|-------|-------------|
| `check_items` | `tax_rate_at_sale`, `tax_mode_at_sale`, `tax_amount`, `taxable_amount` |
| `roles` | `max_item_discount_pct`, `max_item_discount_amt`, `max_check_discount_pct`, `max_check_discount_amt` |

---

## Dependencies Added
- `adm-zip` — lightweight zip library for log archiving

---

## Migration Notes
- **Automatic**: Schema migration from V18 to V19 runs automatically on CAPS startup. No manual intervention required.
- **Non-destructive**: All new columns have safe defaults. Existing data is unaffected.

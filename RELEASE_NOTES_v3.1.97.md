# Cloud POS v3.1.97 Release Notes — EMC Terminal Fix + Diagnostic Improvements + Discount Fix

## EMC Terminal Device Update Fix (Task #45)
- **Root cause**: When editing a terminal device in the EMC (e.g., changing IP address, port, model), clicking "Update" silently did nothing. The form validation schema requires `propertyId` (inherited from `insertTerminalDeviceSchema` where `property_id` is NOT NULL), but `openEditForm()` never populated `propertyId` in the form reset data. The Zod resolver silently failed validation, preventing `onSubmit` from ever firing.
- **Fix**: Added `propertyId: device.propertyId` to the `form.reset()` call in `openEditForm()`. Terminal device edits now save correctly.

## CAPS Diagnostic Table — Full Column Visibility
- **Problem**: The CAPS Diagnostic Tool's synced table viewer was limited to showing only the first 8 columns, and cell values were truncated at 200px. This made it impossible to verify full IP addresses, UUIDs, serial numbers, and other critical device data after a config sync.
- **Fix**: 
  - Removed the 8-column limit — all columns are now displayed.
  - Removed the `max-w-[200px] truncate` constraint — full values are visible.
  - Changed table layout to `min-w-max` with `overflow-x-auto` — the table expands to fit all data and supports horizontal scrolling.
  - Users can now scroll right to see every field including `network_address`, `port`, `terminal_id`, `cloud_device_id`, `capabilities`, etc.

## Item Discount Fix (Task #44 — Merged)
- **Root cause**: After applying or removing a discount on a check item, the check-level state (which drives the displayed total and payment Amount Due) was stale. The `applyDiscountMutation.onSuccess` and `removeDiscountMutation.onSuccess` handlers in the POS page were updating `checkItems` state but not calling `setCurrentCheck(data.check)` to refresh the check totals.
- **Fix**: Added `setCurrentCheck(data.check)` to both discount mutation success handlers so the displayed total and Amount Due update immediately after discount operations.

## Files Changed
- `client/src/pages/admin/terminal-devices.tsx` — Added `propertyId` to edit form reset
- `client/src/components/pos/caps-diagnostic-modal.tsx` — Full column display with horizontal scroll
- `client/src/pages/pos.tsx` — Discount mutation success handlers refresh check state (Task #44 merge)
- `electron/electron-builder.json` — Version bump to 3.1.97
- `electron/build-info.json` — Version bump to 3.1.97

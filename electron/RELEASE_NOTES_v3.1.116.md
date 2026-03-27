# v3.1.116 Release Notes — KDS TypeScript Source Fixes

## Summary
Ports all v3.1.115 KDS fixes into the TypeScript source (`service-host/src/`) so they survive the CI/CD build pipeline. The previous v3.1.115 fixes were applied directly to the compiled CJS file, which gets overwritten during the GitHub Actions build (`node electron/build-service-host.cjs`). This release ensures the production binary contains all KDS corrections.

## Bug Fixes

### 1. `local_now()` SQLite Function (KDS Timer Fix)
- Registered `local_now()` custom SQLite function in the Database constructor
- Returns timestamps in the property's configured timezone instead of UTC
- Replaced all 282 `datetime('now')` calls across 7 TypeScript source files:
  - `service-host/src/db/schema.ts` (118 replacements)
  - `service-host/src/db/database.ts` (138 replacements)
  - `service-host/src/routes/api.ts` (5 replacements)
  - `service-host/src/services/kds-controller.ts` (1 replacement)
  - `service-host/src/services/caps.ts` (2 replacements)
  - `service-host/src/services/payment-controller.ts` (17 replacements)
  - `service-host/src/sync/config-sync.ts` (1 replacement)
- KDS ticket timers now show correct elapsed time based on property timezone

### 2. Paid/Voided KDS Ticket Status
- Added `markCheckPaid()` method to KDS controller — bumps all active tickets for the check and broadcasts `kds_check_paid` via WebSocket
- Added `markCheckVoided()` method to KDS controller — bumps active tickets and removes preview tickets, broadcasts `kds_check_voided` via WebSocket
- Wired into all 8 pay/close/void/cancel-transaction routes (both CAPS-prefixed and non-prefixed handlers)
- Paid/voided checks now disappear from the active KDS display

### 3. Modifier Format Mismatch Fix
- Changed `toKdsItem()` to return modifiers as `{ name: string }[]` objects instead of `string[]`
- KDS frontend expects `modifier.name` — previously received raw strings causing modifiers not to render
- Updated `updatePreviewTicketItems()` to convert modifier strings to objects when storing
- Updated `KdsItem` interface to accept both formats for backward compatibility

### 4. Send/Pay Unsent-Item Filter Harmonization
- CAPS-prefixed send route filter changed from `!i.sentToKitchen` to `!i.voided && !i.sent && !i.sentToKitchen` (consistent with pay handler)
- Non-prefixed send route filter similarly harmonized
- Preview ticket capture + finalize now happens BEFORE `sendToKitchen()` to prevent race condition where items get marked sent before coverage check

### 5. Duplicate Ticket Prevention
- Both send routes now: (1) capture preview tickets, (2) build coveredIds set, (3) finalize previews, (4) call sendToKitchen, (5) create tickets only for uncovered items
- Ordering change ensures `getPreviewTicketsForCheck` runs while tickets are still active (before finalize)
- Single-item fire_on_fly + immediate pay scenario correctly finalizes the preview ticket without creating a duplicate

## Files Changed
- `service-host/src/db/database.ts` — `registerLocalNow()` + datetime replacements
- `service-host/src/db/schema.ts` — All DEFAULT datetime replacements
- `service-host/src/services/kds-controller.ts` — `markCheckPaid()`, `markCheckVoided()`, modifier format
- `service-host/src/routes/api.ts` — Route wiring, filter harmonization, toKdsItem format
- `service-host/src/services/caps.ts` — datetime replacements
- `service-host/src/services/payment-controller.ts` — datetime replacements
- `service-host/src/sync/config-sync.ts` — datetime replacements

## Schema Version
No schema version change (remains SCHEMA_VERSION=22).

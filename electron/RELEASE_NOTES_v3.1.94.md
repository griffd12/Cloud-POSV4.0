# v3.1.94 Release Notes — Config Sync Field Mismatch Fixes

## Summary
Fixes 4 field-name mismatches between the Cloud schema and CAPS SQLite upsert functions that caused sync failures. Adds resilient per-item and per-category error handling so one bad record or category never kills the entire config sync.

## Root Cause
The Cloud backend (PostgreSQL/Drizzle ORM) returns data with camelCase field names that differ from what the CAPS upsert functions expected. For example, Cloud sends `sourceName` but CAPS read `source.name` — resulting in `NULL` for a NOT NULL column.

## Bug Fixes

### BUG 15: `online_order_sources` sync crash (CRITICAL)
- **Symptom**: `Full sync failed: NOT NULL constraint failed: online_order_sources.name` — 4 entity types after this point were also skipped
- **Root Cause**: Cloud sends `sourceName`, CAPS read `source.name` (undefined). Also `defaultPrepMinutes` vs `defaultPrepTime`.
- **Fix**: Accept `sourceName`/`name`/`source_name` with nullish coalescing fallback. Same for `apiKeyPrefix`/`apiKey`, `defaultPrepMinutes`/`defaultPrepTime`.

### BUG 16: `fiscal_periods` sync crash potential (MODERATE)
- **Symptom**: Would crash with NOT NULL on `period_type` and `start_time` columns
- **Root Cause**: Cloud sends `openedAt`/`closedAt`/`closedById` but CAPS expected `startTime`/`endTime`/`openedByEmployeeId`/`closedByEmployeeId`. Cloud also has no `periodType` field.
- **Fix**: Accept both field name variants with fallback defaults (`periodType` defaults to `'business_day'`, `startTime` falls back to `openedAt`).

### BUG 17: `gift_cards` sync data loss (LOW)
- **Symptom**: Gift card balance syncs as 0, customer info missing
- **Root Cause**: Cloud sends `currentBalance`/`activatedById`/`purchaserName`/`recipientEmail`; CAPS read `balance`/`activatedByEmployeeId`/`customerName`/`customerEmail`
- **Fix**: Accept all cloud and CAPS field name variants with nullish coalescing.

### BUG 18: `item_availability` sync data loss (LOW)
- **Symptom**: Available quantity not synced, 86'd items not marked unavailable
- **Root Cause**: Cloud sends `currentQuantity`/`eightySixedById`; CAPS read `availableQuantity`/`updatedByEmployeeId`. Cloud `is86ed` flag was ignored.
- **Fix**: Accept both field variants, honor `is86ed` flag to set `is_available = 0`.

## Resilience Improvements

### Per-category isolation
Each sync category (hierarchy, menu, employees, devices, operations, POS layouts, payments, loyalty, labor, misc) is now wrapped in its own try/catch. A failure in one category logs an error but does not prevent remaining categories from syncing.

### Per-item isolation (loyalty + misc)
Within `syncLoyalty` and `syncMisc`, each individual record is now wrapped in try/catch. A single bad record logs an error with the item ID but does not prevent the remaining records in that group from syncing. Log output now shows `Synced X/Y label` format.

## Version
- `electron/build-info.json` → 3.1.94
- `electron/electron-builder.json` → 3.1.94
- `electron/service-host-embedded.cjs` → 3.1.94

## Upgrade Notes
- No schema migration required
- Fully backwards compatible — existing CAPS databases unaffected
- On next sync after upgrade, all 4 previously-failing entity types will sync correctly

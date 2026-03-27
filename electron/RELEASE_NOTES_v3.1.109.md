# Cloud POS v3.1.109 Release Notes

**Release Date**: March 27, 2026
**Previous Version**: v3.1.108

---

## Summary

v3.1.109 implements CAPS-Cloud database table parity (Phases 1-4). This release adds 6 new tables to the CAPS local database, full diagnostic tooling for table parity monitoring, and a design document for the remaining 7 complex stateful tables. SCHEMA_VERSION remains at 20 (bumped in a prior commit within v3.1.108 development).

---

## New Features

### CAPS Table Parity Diagnostics (Phase 1)
- New "Table Parity" tab in the CAPS Diagnostic modal showing:
  - Progress bar with parity percentage
  - Missing tables that should be in CAPS
  - Planned (not-yet-implemented) tables with rationale
  - Cloud-only tables that intentionally stay server-side
- `/caps/diagnostic/summary` endpoint now includes `tableParity` section with expected/present/missing/cloudOnly/notYetImplemented classifications

### COM / Pizza Config Tables (Phase 2)
- **`ingredient_prefixes`** — synced from Cloud via config-sync delta pipeline; supports COM panel ingredient prefix display
- **`menu_item_recipe_ingredients`** — synced from Cloud; supports recipe ingredient lookups per menu item
- New CAPS API routes:
  - `GET /api/ingredient-prefixes?enterpriseId=X` — returns active ingredient prefixes
  - `GET /api/menu-items/:id/recipe-ingredients` — returns recipe ingredients for a menu item
- Both tables included in Cloud full-sync and delta-sync payloads

### Operational / Labor Tables (Phase 3)
- **`timecards`** — CAPS-owned; employees clock in/out locally, syncs up to Cloud
- **`break_attestations`** — CAPS-owned; break compliance attestation records
- **`break_violations`** — CAPS-owned; break rule violation tracking
- New CAPS API routes for all three tables (GET/POST/PATCH)
- All tables use `cloud_synced` flag for reliable sync-up queue

### Phase 4 Design Document
- Created `docs/phase4-complex-tables-design.md` covering 7 remaining complex tables:
  - Tip pooling: `tip_allocations`, `tip_pool_runs`
  - Inventory: `inventory_stock`, `inventory_transactions`
  - Timecard extensions: `timecard_edits`, `timecard_exceptions`, `time_off_requests`
- Defines ownership model (Cloud-owned vs CAPS-owned vs dual-write) per table
- Documents 3 conflict resolution patterns and implementation priority order

---

## Bug Fixes

### Removed Duplicate Terminal Session Routes
- Legacy terminal-session route handlers (payment terminal flow) were registered before V20 handlers, causing the V20 handlers to be shadowed (dead code)
- Removed the unreachable V20 terminal-session routes to eliminate confusion
- Legacy payment terminal session flow continues to work as before

### Diagnostic Drill-Down Tables
- Added 6 new tables to `getTableRows()` allowlist so drill-down inspection works in the diagnostic modal
- Added 6 new tables to `getTableRecordCounts()` for accurate record count reporting

---

## Database Changes

### Schema Version: 20 (unchanged from prior commit)
- V20 migration creates 6 new tables with indexes:
  - `ingredient_prefixes` (enterprise_id index)
  - `menu_item_recipe_ingredients` (menu_item_id index)
  - `timecards` (property_id + business_date composite index)
  - `terminal_sessions` (terminal_device_id index)
  - `break_attestations` (timecard_id index)
  - `break_violations` (property_id + business_date composite index)

### Migration Notes
- **Automatic**: V20 migration runs on CAPS startup if current schema < 20
- **Non-destructive**: All new tables use `CREATE TABLE IF NOT EXISTS`
- **Verification**: Check CAPS startup logs for `[DB] Running v20 migration`

---

## Files Changed

| File | Changes |
|------|---------|
| `service-host/src/db/schema.ts` | SCHEMA_VERSION = 20 |
| `service-host/src/db/database.ts` | V20 migration, CRUD methods for 6 tables, diagnostic updates |
| `service-host/src/sync/config-sync.ts` | Sync handlers for ingredient_prefixes + recipe_ingredients |
| `service-host/src/routes/api.ts` | New route handlers, diagnostic parity endpoint, removed duplicate routes |
| `server/routes.ts` | Cloud full-sync payload additions |
| `electron/offline-api-interceptor.cjs` | New intercept patterns for labor/recipe endpoints |
| `client/src/components/pos/caps-diagnostic-modal.tsx` | Table Parity tab + TableParityView component |
| `docs/phase4-complex-tables-design.md` | Design document for 7 remaining tables |

---

## Remaining Table Parity Work

| Category | Count | Status |
|----------|-------|--------|
| CAPS tables (implemented) | ~60 | Complete |
| Cloud-only (intentionally excluded) | 25 | N/A |
| Not-yet-implemented (config prereqs) | 8 | Pending Phase 2 follow-up |
| Not-yet-implemented (complex/stateful) | 7 | Design doc complete, code pending |

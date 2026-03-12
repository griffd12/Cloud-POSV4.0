# v3.1.49 Release Notes

## Bug Fixes

### POS Layouts Available Offline / YELLOW / Standalone Mode
- **Cloud full config sync now includes posLayouts, posLayoutCells, and posLayoutRvcAssignments** — previously these were completely omitted from `/api/sync/config/full`, meaning CAPS SQLite never received layout data and returned 404 when the POS requested layouts
- **CAPS SQLite `pos_layouts` schema updated** to match cloud schema: added `enterprise_id`, `property_id`, `rvc_id`, `mode`, `grid_rows`, `grid_cols`, `font_size`, `is_default` columns (replacing old `description`, `layout_type`, `rows`, `columns`, `cell_width`, `cell_height`)
- **CAPS SQLite `pos_layout_cells` schema updated** to match cloud schema: added `row_span`, `col_span`, `background_color`, `text_color`, `display_label` columns (replacing old `slu_id`, `label`, `color`, `icon`, `action`, `action_data`, `span_rows`, `span_cols`)
- **`getPosLayoutForRvc` route handler fixed** — was calling with missing `propertyId` parameter; now correctly resolves property from CAPS config and falls back to direct rvc_id match or default layout
- **Offline database layout sync expanded** — now caches layouts for ALL RVCs (not just one default), and syncs cells for each unique layout

### Modifier Map Query Fix
- **Fixed `mimg.sort_order` column not found error** — CAPS `menu_item_modifier_groups` table only had `display_order`; added `sort_order`, `min_required`, `max_allowed` columns to the table and query now falls back to `display_order` when `sort_order` is not populated

### Schema Migration
- **Added v9 schema migration** for existing CAPS SQLite databases — automatically adds new columns to `pos_layouts`, `pos_layout_cells`, and `menu_item_modifier_groups` tables on first connect after update
- Added indexes on `pos_layouts(rvc_id)` and `pos_layouts(property_id)` for efficient layout lookups

## Files Changed
- `server/routes.ts` — added posLayouts/cells/assignments to full config sync response
- `electron/service-host-embedded.cjs` — schema, upserts, migration, route handlers, modifier-map query
- `electron/offline-database.cjs` — expanded layout sync to cover all RVCs
- `service-host/src/db/schema.ts` — TS source schema updated to match
- `service-host/src/db/database.ts` — TS source upserts, migration, getPosLayoutForRvc updated
- `service-host/src/routes/api.ts` — TS source route handlers and modifier-map query updated

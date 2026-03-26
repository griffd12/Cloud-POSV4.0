# Cloud POS v3.1.107 Release Notes

**Release Date**: March 26, 2026
**Previous Version**: v3.1.106

---

## Summary

v3.1.107 is a critical hotfix that activates the Schema V19 database migration. The migration code was shipped in v3.1.106 but the schema version constant was not bumped, preventing the migration from running on CAPS startup. This fix resolves two blocking issues: inability to create transactions and employee/role config sync failures.

---

## Bug Fixes

### Critical: Schema V19 Migration Never Executed
- **Previous behavior**: `SCHEMA_VERSION` was still set to `18` even though v3.1.106 added V19 migration code. The migration system compares the stored DB version against `SCHEMA_VERSION` — since both were `18`, the V19 migration never triggered.
- **Fix**: Bumped `SCHEMA_VERSION` from `18` to `19` in `service-host/src/db/schema.ts`. On next CAPS startup, the migration runs automatically.

### Critical: Cannot Create Transactions
- **Previous behavior**: Creating a check failed with `400: {"error":"no such column: tax_rate_at_sale"}` because the `check_items` table was missing V19 tax snapshot columns.
- **Fix**: V19 migration now runs and adds `tax_rate_at_sale`, `tax_mode_at_sale`, `tax_amount`, `taxable_amount` to `check_items`.

### Critical: Employee/Role Config Sync Failure
- **Previous behavior**: Cloud config sync failed with `table roles has no column named max_item_discount_pct`, preventing employee and role data from syncing to CAPS.
- **Fix**: V19 migration now runs and adds `max_item_discount_pct`, `max_check_discount_pct`, `max_item_discount_amt`, `max_check_discount_amt` to `roles`.

---

## Migration Notes
- **Automatic**: Schema migration from V18 to V19 runs automatically on CAPS startup. No manual intervention required.
- **Non-destructive**: All new columns have safe defaults. Existing data is unaffected.
- **Verification**: Check CAPS startup logs for `[DB] Schema migration needed: 18 → 19` followed by `Running v19 migration` to confirm successful migration.

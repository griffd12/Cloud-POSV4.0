# Cloud POS v3.1.21 Release Notes

## Critical CAPS Sync Fix
This release fixes the core WS-to-CAPS synchronization pipeline that was broken in v3.1.20.

### CAPS Sync Route Fix (HTTP 404)
- **Root Cause**: The `/api/caps/sync/check-state` and `/api/caps/sync/queue-operation` endpoints were registered on `this.app.post()` but Express was routing all `/api/*` requests through the `app.use("/api", ...)` mount, which uses a separate Router that didn't contain these routes.
- **Fix**: Moved both sync endpoints into the `createApiRoutes()` Router function so they are mounted on the same Express Router as all other CAPS endpoints.
- Both endpoints now appear in the "Available endpoints" log at CAPS startup.

### CAPS Auth Fix (HTTP 401)
- **Root Cause**: LAN workstations (non-localhost) were rejected by the CAPS auth middleware when syncing. The `syncToCaps()` method sent no authentication headers, and the auth middleware required a token for any non-localhost connection.
- **Fix**: Exempted `/caps/sync/*` paths from auth middleware, matching the pattern used for `/health`. These are internal CAPS-only endpoints used for workstation-to-CAPS data replication.

### CAPS Schema Fix (SQL Errors)
- **Root Cause**: The check-state sync handler referenced `customer_id` and `customer_name` columns that didn't exist in the CAPS SQLite `checks` table schema.
- **Fix**: Added `customer_id TEXT` and `customer_name TEXT` columns to the `checks` CREATE TABLE definition. Added schema migration (v5 -> v6) for existing databases.

### CAPS Foreign Key Fix
- **Root Cause**: The `checks` table had foreign key constraints on `rvc_id` and `employee_id`, but the CAPS config sync was returning 0 records, leaving the reference tables empty. Any check INSERT would fail with FK violation.
- **Fix**: Wrapped check-state sync INSERTs in `PRAGMA foreign_keys = OFF/ON` block so sync operations succeed regardless of reference table state.

### CAPS Config Sync Logging
- Added detailed debug logging to `syncFull()` showing raw data keys, array sizes, and mapped entity counts. This will help diagnose the "0 records" config sync issue in the field.

## Windows Firewall Rules
- **New**: Installer now adds Windows Firewall inbound rules for CAPS service (TCP port 3001) on private and domain network profiles.
- **New**: Installer adds program-level firewall exception for the Cloud POS executable.
- Both rules are automatically removed on uninstall.
- This eliminates the need to manually disable Windows Firewall for LAN workstation-to-CAPS communication.

## GitHub Actions Improvement
- Added `run-name` to the build workflow so manual dispatches show "Cloud POS v3.1.21" instead of the generic workflow name.
- Added optional `version` input to `workflow_dispatch` for build labeling.

## Summary of Fixes
| Issue | Device | Error | Fix |
|-------|--------|-------|-----|
| Sync route not matched | WS01 (localhost) | HTTP 404 | Moved to correct Express Router |
| Sync auth rejected | Derek-Laptop (LAN) | HTTP 401 | Exempted sync paths from auth |
| Missing schema columns | All CAPS hosts | SQL error | Added customer_id/customer_name |
| FK constraint failure | All CAPS hosts | FK violation | Disabled FK for sync inserts |
| Firewall blocks port 3001 | LAN workstations | Connection refused | Installer adds firewall rules |

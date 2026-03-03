# Cloud POS v3.1.22 Release Notes

## Version Bump for Auto-Update Delivery
v3.1.22 is a rebuild of v3.1.21 to deliver the correct service-host code via auto-update. The original v3.1.21 build had an empty `service-host-embedded.cjs` file due to a GitHub API upload issue, so none of the v3.1.21 fixes were active on installed devices. This version contains the identical fixes — only the version number has changed to trigger the auto-updater.

## Fixes Included (from v3.1.21)

### CAPS Sync Route Fix (HTTP 404)
- Moved `/api/caps/sync/check-state` and `/api/caps/sync/queue-operation` endpoints into the `createApiRoutes()` Router so they are mounted correctly on the Express Router alongside all other CAPS endpoints.

### CAPS Auth Fix (HTTP 401)
- Exempted `/caps/sync/*` paths from auth middleware so LAN workstations (e.g., Derek-Laptop) can sync to CAPS without authentication tokens.

### CAPS Config Sync Fix (0 Records)
- Fixed data unwrapping in `syncFull()` — the cloud endpoint returns data inside a `data` wrapper object. The old code read from the wrong level, resulting in 0 records synced. Now correctly reads `rawResponse.data` and maps singular keys (`enterprise` → `enterprises` array).
- Added detailed debug logging showing raw data keys, array sizes, and mapped entity counts.

### CAPS Schema Fix (SQL Errors)
- Added `customer_id TEXT` and `customer_name TEXT` columns to the CAPS SQLite `checks` table.
- Schema migration v5 → v6 for existing databases.

### CAPS Foreign Key Fix
- Wrapped check-state sync INSERTs in `PRAGMA foreign_keys = OFF/ON` to prevent FK violations when reference tables are empty.

### Windows Firewall Rules
- Installer adds inbound firewall rules for CAPS port 3001 (TCP, private/domain profiles).
- Program-level firewall exception for Cloud POS executable.
- Rules removed on uninstall.

## Summary
| Issue | Device | Error | Fix |
|-------|--------|-------|-----|
| Sync route not matched | WS01 (localhost) | HTTP 404 | Moved to correct Express Router |
| Sync auth rejected | Derek-Laptop (LAN) | HTTP 401 | Exempted sync paths from auth |
| Config sync empty | All CAPS hosts | 0 records | Fixed data unwrapping from cloud response |
| Missing schema columns | All CAPS hosts | SQL error | Added customer_id/customer_name |
| FK constraint failure | All CAPS hosts | FK violation | Disabled FK for sync inserts |
| Firewall blocks port 3001 | LAN workstations | Connection refused | Installer adds firewall rules |

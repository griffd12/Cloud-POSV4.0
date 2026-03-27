# Cloud POS v3.1.111 Release Notes

**Release Date**: March 27, 2026
**Previous Version**: v3.1.110
**Schema Version**: 22 (up from 21)

---

## Summary

v3.1.111 closes the remaining EMC-to-CAPS configuration sync gaps by adding full support for shift scheduling data (shift templates and shifts) and employee date-of-birth synchronization. SCHEMA_VERSION is upgraded from 21 to 22 with automatic migration for existing CAPS databases.

---

## New Features

### Shift Templates Sync — Cloud → CAPS (Task #53)
- New `shift_templates` table on CAPS local SQLite with full schema parity to Cloud PostgreSQL
- Columns: `id`, `property_id`, `rvc_id`, `name`, `job_code_id`, `start_time`, `end_time`, `break_minutes`, `color`, `notes`, `active`, `created_at`
- Indexed on `property_id` for fast lookups
- Full sync: templates pulled via `/api/sync/config/full` and ingested during `syncLabor()` phase
- Delta sync: `shiftTemplate` entity type handled in `applyChange()` with hard-delete semantics

### Shifts Sync — Cloud → CAPS (Task #53)
- New `shifts` table on CAPS local SQLite with full schema parity to Cloud PostgreSQL
- Columns: `id`, `property_id`, `rvc_id`, `employee_id`, `job_code_id`, `template_id`, `shift_date`, `start_time`, `end_time`, `scheduled_break_minutes`, `status`, `notes`, `published_at`, `published_by_id`, `acknowledged_at`, `created_at`, `updated_at`
- Indexed on `property_id`, `employee_id`, and `shift_date` for scheduling queries
- Full sync: shifts pulled via `/api/sync/config/full` and ingested during `syncLabor()` phase
- Delta sync: `shift` entity type handled in `applyChange()` with hard-delete semantics

### Employee Date of Birth Sync (Task #53)
- Added `date_of_birth TEXT` column to `employees` table in CAPS local schema
- `upsertEmployee()` now persists `dateOfBirth` from Cloud during full and delta sync
- Enables CAPS-side minor labor rule enforcement with employee age verification

---

## Schema Changes

### SCHEMA_VERSION 21 → 22

**New Tables:**
| Table | Description |
|-------|-------------|
| `shift_templates` | Scheduling templates with time ranges, job codes, and break settings |
| `shifts` | Individual shift assignments linking employees, templates, and dates |

**New Columns:**
| Table | Column | Type | Default |
|-------|--------|------|---------|
| `employees` | `date_of_birth` | TEXT | NULL |

**New Indexes:**
| Index | Table | Column |
|-------|-------|--------|
| `idx_shift_templates_property` | `shift_templates` | `property_id` |
| `idx_shifts_property` | `shifts` | `property_id` |
| `idx_shifts_employee` | `shifts` | `employee_id` |
| `idx_shifts_date` | `shifts` | `shift_date` |

**Migration:** Automatic via `migrateToV22()` — existing CAPS databases upgrade on next startup. Uses `ALTER TABLE ... ADD COLUMN` for DOB (safe for existing data) and `CREATE TABLE IF NOT EXISTS` for new tables.

---

## Cloud Sync Pipeline Changes

### Full Config Sync (`/api/sync/config/full`)
- Cloud endpoint now includes `shiftTemplates` and `shifts` arrays in the response payload
- CAPS `syncLabor()` processes both arrays during full sync alongside overtime/break/tip/minor-labor rules

### Delta Config Sync
- `applyChange()` switch now handles `shiftTemplate` and `shift` entity types for create/update operations
- `deleteEntity()` maps both to hard-delete (DELETE FROM) — consistent with Cloud-side deletion semantics

### Diagnostics
- `shift_templates` and `shifts` added to `getTableRecordCounts()` for sync parity monitoring
- `shift_templates` and `shifts` added to `getTableRows()` allowlist for CAPS diagnostic API

---

## Files Changed

| File | Changes |
|------|---------|
| `service-host/src/db/schema.ts` | SCHEMA_VERSION 22, `shift_templates` + `shifts` DDL, `employees.date_of_birth` |
| `service-host/src/db/database.ts` | `migrateToV22()`, `upsertShiftTemplate()`, `upsertShift()`, updated `upsertEmployee()`, diagnostic lists |
| `service-host/src/sync/config-sync.ts` | `FullConfigResponse` interface, `syncFull()` mapping, `syncLabor()`, `applyChange()`, `deleteEntity()` |
| `server/routes.ts` | Full config endpoint fetches + returns `shiftTemplates` and `shifts` |
| `electron/build-info.json` | Version 3.1.111 |
| `electron/electron-builder.json` | Version 3.1.111 |
| `electron/service-host-embedded.cjs` | CAPS_VERSION 3.1.111 |

---

## Upgrade Notes

- **Automatic migration**: CAPS databases at SCHEMA_VERSION ≤ 21 will auto-migrate to V22 on next startup
- **No data loss**: Migration is additive only (new column + new tables)
- **No breaking changes**: Existing sync flows are unaffected; new shift data is additive
- **Cloud requirement**: Cloud must be at or ahead of this version to serve shift template/shift data in the full config response

---

## Known Issues (Pre-existing)

1. Double `/unlock` UI double-fire post-payment (cosmetic — workstation unlock fires twice)
2. Workstation backoff timer not resetting on mode change
3. Heartbeat `offline:true` when CAPS is reachable (cosmetic status mismatch)
4. Stripe `processorType:"unknown"` on certain gateway configs
5. ANSI color codes leaking into system log output (cosmetic)

# Cloud POS v3.1.110 Release Notes

**Release Date**: March 27, 2026
**Previous Version**: v3.1.109
**Schema Version**: 21 (up from 20)

---

## Summary

v3.1.110 completes the CAPS-Cloud database parity initiative with full end-to-end sync pipelines for all operational tables, fixes two production logging/connectivity bugs, and delivers a design roadmap for Phase 4 complex stateful tables. This release brings CAPS to 100% table parity with Cloud for all config and operational data.

---

## New Features

### Phase 3: Operational Tables — Full CAPS→Cloud Sync Pipeline (Task #60)
- **Timecards**: Full CRUD on CAPS with automatic sync-queue insertion on create/update. Cloud ingest endpoint with action-aware upsert preserving CAPS UUIDs.
- **Terminal Sessions**: PATCH operations now queue update sync items. Cloud ingest with update-first/create-fallback pattern.
- **Break Attestations**: POST creates attestation locally and queues for cloud sync. Cloud ingest with UUID preservation.
- **Break Violations**: POST creates violation record locally and queues for cloud sync. Cloud ingest with UUID preservation.
- All 4 sync methods validate per-record success (checks `cloudIds` contains entity ID before marking `cloud_synced=1`; throws on `failedIds` or unacknowledged records).
- Unknown sync types now throw instead of silently dropping.
- Offline API interceptor updated with write patterns for timecards, break-attestations, and break-violations.

### Phase 4: Complex Stateful Tables — Design Document (Task #61)
- Design document created at `docs/phase4-complex-tables-design.md` covering 7 remaining complex tables:
  - Tip pooling: `tip_allocations`, `tip_pool_runs`
  - Inventory: `inventory_stock`, `inventory_transactions`
  - Timecard extensions: `timecard_edits`, `timecard_exceptions`, `time_off_requests`
- Defines ownership model (Cloud-owned vs CAPS-owned vs dual-write) per table
- Documents 3 conflict resolution patterns and implementation priority order

---

## Bug Fixes

### Gateway Log Formatter — Lines Writing "undefined" (Task #62)
- **Root Cause**: `writeGatewayEntry()` expected `{line: string}` but received structured objects `{ts, device, method, url, status, ms, ...}`. Since no `.line` property existed, every gateway log line was literally `undefined`.
- **Fix**: `writeGatewayEntry()` now accepts both `GatewayFileEntry` (legacy `{line: string}`) and `GatewayStructuredEntry` (the actual object format). Uses duck-typing: if entry has a string `.line` property, uses it directly; otherwise `JSON.stringify` the whole object.
- Fixed in both `service-host/src/gateway-logger.ts` and `electron/service-host-embedded.cjs`.

### Renderer WebSocket Reconnect Loop — 2-3s Error Spam (Task #62)
- **Root Cause**: After login, the renderer's direct WebSocket to CAPS entered a connect/error/close cycle with a fixed 3-second retry, flooding logs with ERROR lines and causing rapid connect/disconnect churn.
- **Fix**: Replaced fixed 3s retry with exponential backoff (3s base, 1.5x multiplier, 30s cap, jitter). Added connection ID tracking (`connIdRef`) to prevent stale socket handlers from firing on superseded connections. Error logging reduced to first error + first 3 reconnect attempts only.

### Structured Logging in CAPS Routes
- Replaced bare `console.log`/`console.error` calls in CAPS API routes with structured `capsLog` logging for all 4 operational entity types.

---

## Database Changes

### Schema Version: 20 → 21
- **V21 Migration**: Adds `cloud_synced` column (INTEGER DEFAULT 0) to all 4 operational tables:
  - `timecards`
  - `terminal_sessions`
  - `break_attestations`
  - `break_violations`
- Migration runs automatically on CAPS startup if current schema < 21.

### Cloud Ingest Endpoints (New)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sync/timecards` | POST | Receive timecard records from CAPS |
| `/api/sync/terminal-sessions` | POST | Receive terminal session records from CAPS |
| `/api/sync/break-attestations` | POST | Receive break attestation records from CAPS |
| `/api/sync/break-violations` | POST | Receive break violation records from CAPS |

All endpoints return `{ success, processed, cloudIds, failedIds }` where `success=false` when any record fails (no silent data loss).

---

## Files Changed

| File | Changes |
|------|---------|
| `electron/electron-builder.json` | Version 3.1.109 → 3.1.110 |
| `electron/service-host-embedded.cjs` | CAPS_VERSION → 3.1.110, writeGatewayEntry fix |
| `service-host/src/db/schema.ts` | SCHEMA_VERSION 20 → 21 |
| `service-host/src/db/database.ts` | V21 migration (cloud_synced columns) |
| `service-host/src/routes/api.ts` | Sync queue insertion for all 4 entity types, structured logging |
| `service-host/src/sync/transaction-sync.ts` | 4 new sync methods with per-record validation |
| `service-host/src/gateway-logger.ts` | Union type for structured + legacy entry formats |
| `server/routes.ts` | 4 new Cloud ingest endpoints with action-aware upsert |
| `electron/offline-api-interceptor.cjs` | Write patterns for timecards, breaks |
| `client/src/hooks/use-pos-websocket.ts` | Exponential backoff, connection ID guard |
| `client/src/components/pos/caps-diagnostic-modal.tsx` | Table parity view improvements |

---

## CAPS-Cloud Parity Status

| Category | Count | Status |
|----------|-------|--------|
| Config tables (Cloud→CAPS sync) | 57 | 100% Complete |
| Operational tables (CAPS→Cloud sync) | 10 | 100% Complete |
| Cloud-only tables (intentional) | 25+ | N/A |
| Complex stateful tables (Phase 4) | 7 | Design complete, code pending |

---

## Migration Notes

- **Automatic**: V21 migration runs on CAPS startup if current schema < 21
- **Non-destructive**: Uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- **Verification**: Check CAPS startup logs for `[DB] Running v21 migration`
- **Electron Build**: New Windows installer build requested — run `npx electron-builder --config electron/electron-builder.json --win` on a Windows build machine

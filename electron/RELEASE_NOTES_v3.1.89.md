# Cloud POS v3.1.89 Release Notes

**Release Date:** March 19, 2026
**Previous Version:** 3.1.88

---

## Summary

v3.1.89 consolidates three major feature areas: gateway diagnostic logging, full EMC configuration sync completeness with a CAPS diagnostic tool, and boot contract enforcement ensuring the POS and KDS never render with stale or missing data.

---

## Changes

### Gateway File Logging (Task #35)
- Added persistent gateway log (`gateway.log`) capturing every CAPS API request and response
- 5MB file rotation with 3 backup files for disk safety
- JSON-lines format for easy parsing and search
- Sensitive fields (PIN, card numbers, passwords) redacted before writing
- Request/response body summaries extended to 500 characters for better diagnostics
- Diagnostic endpoints excluded from logging to reduce noise
- In-memory ring buffer (500 entries) preserved for real-time UI access

### EMC Full Sync Completeness & CAPS Diagnostic Tool (Task #36)
- Extended `config-sync.ts` with mappings for all EMC entity types (loyalty rewards, payment gateway config, etc.)
- Fixed cross-tenant data exposure: loyalty rewards now filtered by program IDs
- Built CAPS diagnostic API with sensitive field redaction:
  - `GET /api/caps/diagnostic/summary` — sync health + table record counts
  - `GET /api/caps/diagnostic/table/:tableName` — row viewer with field redaction
  - `GET /api/caps/diagnostic/employee/:id/privileges` — privilege chain resolver
- Added sensitive field redaction for employees, print agents, payment processors, and payment gateway config tables
- Enforced max 200 row limit on table diagnostic endpoint
- Built diagnostic UI modal with sync dashboard, expandable table sections, drill-down table viewer, and employee privilege inspector with provenance
- Enhanced `resolveEmployeePrivilegeChain` to resolve roles through both `employee.role_id` and assignments, with per-privilege provenance tracking
- Extended `upsertPaymentGatewayConfig` to include receipt/debug columns for full schema parity
- Wired CAPS Diagnostic button into Functions modal under System section

### Boot Contract Enforcement (Task #32)
- Auto-reload on CAPS ready: when `capsBootStage` transitions to `ready`, all React Query caches are invalidated automatically
- Ensures any queries that failed during boot (race with protocol interceptor setup, ~900ms gap) reload without user action
- Cache invalidation placed in `useCapsBootGate` (App.tsx) — the active, mounted boot gate code path
- Existing boot overlay (full-screen blocking during `starting`/`connecting`/`loading-config`) continues to prevent partial rendering
- Existing retry mechanism (30-second timeout with explicit retry button) unchanged

---

## Bug Fixes from v3.1.88
- Privileges sync: employee privilege chain resolution fixed for role-based and assignment-based privileges
- Price double-conversion: `Math.round()` used consistently to prevent floating-point drift in cent-based calculations
- Check counter: retry + UPSERT recovery prevents check number collisions under concurrent workstation load

---

## Technical Notes
- **Build process:** `npm run build` → `node electron/build-service-host.cjs` → `npx electron-builder`
- **Gateway log location:** `{dataDir}/logs/gateway.log` (alongside existing CAPS data directory)
- **Price invariant:** DB stores prices in CENTS, API responses return DOLLARS
- **Boot contract:** `retry: false` on React Query means failed queries stay failed — the CAPS-ready invalidation is the safety net

# Release Notes — v3.1.81

## CAPS Runtime Authority Remediation — Stop Split-Brain Reads, Normalize Routes, Enforce Privileges

Three-phase fix for behavioral blockers in the POS CAPS system that could cause data inconsistency, route shadowing, and missing privilege enforcement.

---

## Phase 1 — Stop Split-Brain Reads

Eliminated all paths where a workstation could silently read from cloud when CAPS returned a non-2xx status, causing the UI to display cloud-sourced data that diverged from the store-authoritative CAPS data.

### Changes

- **CAPS-FIRST block** (`electron/main.cjs`): Now returns the CAPS response for ALL statuses — never falls through to the cloud path. Previously, 401/404 responses from CAPS leaked through to cloud reads in GREEN mode.
- **Hard-fail 503**: When `capsUrl` is absent, both CAPS transaction routes and CAPS auth routes immediately return 503 instead of silently falling through to the cloud write path.
- **GREEN-FALLTHROUGH guard**: CAPS transaction and auth routes are explicitly blocked from the fallthrough path in GREEN mode.
- **Frontend `handleFailure`** (`client/src/lib/api-client.ts`): Throws for CAPS-only routes instead of silently degrading to stale cache data.

---

## Phase 2 — Normalize CAPS Route Authority

Eliminated route duplication and path-shadowing bugs across the CAPS API layer.

### Changes

- **Named RequestHandler functions**: Converted 18 inline route handlers to named functions (`handleCreateCheck`, `handleGetOpenChecks`, `handleSend`, `handleAddItems`, `handleVoidItem`, `handleApplyDiscount`, etc.).
- **Dual-path registration**: Each handler is registered on both the non-prefixed path (`/checks/:id`) and the `/caps/`-prefixed path (`/caps/checks/:id`), sharing the same handler function — zero code duplication.
- **Static-before-parameterized ordering**: Static paths (e.g., `/caps/checks/orders`, `/caps/checks/locks`) are registered before parameterized paths (e.g., `/caps/checks/:id`) to prevent Express from greedily capturing them.
- **Payments rewrite fix** (`electron/main.cjs`): Fixed the Electron protocol interceptor to correctly rewrite payment routes to `/api/caps/payments`.

---

## Phase 3 — Enforce Privileges in CAPS

Added server-side privilege enforcement on CAPS for all privilege-gated POS operations. Previously, privilege checks only existed on the frontend — any direct API call could bypass them.

### `checkPrivilege()` Helper

- Resolves employee privileges via the full resolution chain (employee → role → employee_assignments → defaults)
- `admin_access` privilege bypasses all checks
- Supports `managerPin` override: if the employee lacks the privilege, a manager PIN in the request body can authorize the operation
- Returns 403 with structured response: `{ error, requiredPrivilege, employeeId }`

### Privilege-Gated Operations

| Operation | Required Privilege |
|-----------|-------------------|
| Void unsent item | `void_unsent` |
| Void sent item | `void_sent` |
| Apply discount | `apply_discount` |
| Transfer check | `transfer_check` |
| Split check | `split_check` |
| Merge checks | `merge_checks` |
| Reopen check | `reopen_check` |
| Price override | `modify_price` |
| Send to kitchen | `send_to_kitchen` |

---

## Files Changed

| File | Description |
|------|-------------|
| `electron/main.cjs` | CAPS-FIRST return-all-statuses, 503 hard-fail, GREEN-FALLTHROUGH guard, payments rewrite fix |
| `service-host/src/routes/api.ts` | 18 named handlers, dual-path registration, checkPrivilege() enforcement |
| `client/src/lib/api-client.ts` | handleFailure throws for CAPS-only routes |
| `electron/service-host-embedded.cjs` | Rebuilt bundle with all changes |
| `electron/electron-builder.json` | Version bump 3.1.80 → 3.1.81 |
| `electron/build-info.json` | Updated build metadata |

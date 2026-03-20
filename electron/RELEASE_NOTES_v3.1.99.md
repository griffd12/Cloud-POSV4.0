# Cloud POS v3.1.99 Release Notes

**Release Date:** March 20, 2026  
**Previous Version:** v3.1.98

---

## KDS Device Authentication Fix (Critical)

### Problem
KDS devices (Station1-Expo and all non-CAPS workstations) crashed immediately on launch with:
```
Failed to construct 'WebSocket': An insecure WebSocket connection may not be initiated from a page loaded over HTTPS.
```
Additionally, all KDS API calls returned **401 Unauthorized**, preventing the KDS from loading any data.

### Root Causes

**1. Missing Service Host Token for KDS Devices**
The cloud `/api/workstations/:id/activation-config` endpoint returned `serviceHostToken: null` for KDS devices, while POS workstations correctly received `primaryServiceHost.registrationToken`. Without this token, every KDS request to CAPS was rejected by the auth middleware with 401.

- **File:** `server/routes.ts` — KDS branch of activation-config
- **Fix:** Changed `serviceHostToken: null` to `serviceHostToken: kdsPrimaryServiceHost?.registrationToken || null`

**2. WebSocket Mixed-Content Crash (KDS)**
The KDS page loads via Electron's HTTPS protocol interceptor (`https://...`), but the KDS WebSocket in `kds.tsx` constructed `ws://192.168.1.4:3001/ws` (insecure) from the CAPS service host URL. Chromium blocks insecure WebSocket connections from HTTPS pages. Unlike the POS WebSocket (`use-pos-websocket.ts`) which wraps `new WebSocket()` in try/catch, the KDS had no error handling — the thrown error propagated to the ErrorBoundary and crashed the entire screen.

- **File:** `client/src/pages/kds.tsx`
- **Fix:** Wrapped `new WebSocket(wsUrl)` in try/catch with graceful retry on failure

**3. Config Sync WebSocket Routing (KDS)**
The `use-config-sync.ts` hook used `window.location.host` (the Replit dev URL) for its WebSocket instead of the CAPS service host URL. This meant config sync WebSocket connections went to the wrong server.

- **File:** `client/src/hooks/use-config-sync.ts`
- **Fix:** Added `serviceHostUrl` lookup from localStorage, matching the pattern used by `kds.tsx` and `use-pos-websocket.ts`

**4. CAPS Auth Middleware LAN Device Support**
The CAPS auth middleware only allowed: localhost bypass, or exact token match. Devices on the LAN with no token (or during token propagation delay) were rejected. Added private network IP recognition (10.x.x.x, 172.16-31.x.x, 192.168.x.x) as a safety net for LAN-connected store devices.

- **File:** `service-host/src/middleware/auth.ts`
- **Fix:** Added `isPrivateNetworkIp()` check — LAN devices without a token are allowed through; LAN devices with a wrong token are still rejected

---

## Transaction Sync Integrity Fix

### Problem
Checks synced from CAPS to Cloud showed $0.00 totals and "open" status because the Cloud dedup logic treated check updates (items added, payments applied, status changed to closed) as duplicates and skipped them.

### Root Cause
The Cloud `/api/sync/transactions` endpoint checked if a `localId` already existed in `serviceHostTransactions` and skipped the entire payload if found. This meant the initial check creation was stored, but all subsequent updates (adding items, applying payments, closing) were silently discarded.

### Fix
- Added `isCheckUpdate` detection: when `action === 'update'` or `status === 'closed'`, the existing row is updated in-place instead of skipped
- Payment sync made idempotent using `ON CONFLICT (id) DO UPDATE` upsert
- Added `checkPayments` to schema imports for the upsert
- Structured logging added for update vs create vs skip decisions

**File:** `server/routes.ts` — `/api/sync/transactions` endpoint

---

## Check Number Reset on Clear Totals

### Problem
After clearing sales data (clear totals), check numbers continued from the last used number instead of resetting to the configured start.

### Fix
- `clearTransactionalData()` in `database.ts` now resets `workstation_config.current_check_number` back to `check_number_start`
- `CapsService.resetCheckNumberSequence()` added and wired into the `SALES_DATA_CLEARED` WebSocket handler in `index.ts`

**Files:** `service-host/src/db/database.ts`, `service-host/src/services/caps.ts`, `service-host/src/index.ts`

---

## Enterprise Effective Config Resolution

### Problem
Enterprise configuration used flat `property_id` filtering with no RVC-level inheritance. The `LocalEffectiveConfig` class existed but was dead code — never wired into any operational path.

### Fix
Implemented runtime config resolution with enterprise → property → RVC hierarchy:

- **`resolveEffective()`** private method in `database.ts` builds a merged Map keyed by `code || name || id` — enterprise rows first, property rows override, RVC rows override last. Each row gets a `_scope_level` annotation.
- **Five accessor methods** added: `getEffectiveTenders()`, `getEffectiveDiscounts()`, `getEffectiveTaxGroups()`, `getEffectiveServiceCharges()`, `getEffectiveRoles()`
- **ConfigSync wired:** `activeRvcId` field added to `ConfigSync` with `setActiveRvcId()`/`getActiveRvcId()` methods. Getter methods (`getTenders()`, `getDiscounts()`, etc.) now call effective resolvers.
- **Active RVC set at startup:** After config sync, the first active RVC is auto-set on ConfigSync in `index.ts`

**Files:** `service-host/src/db/database.ts`, `service-host/src/sync/config-sync.ts`, `service-host/src/index.ts`

---

## RVC-Scoped Employee Privilege Resolution

### Problem
`resolveEmployeePrivileges()` used the employee's primary role assignment regardless of which RVC they were operating in. An employee with different role assignments per RVC would always get their primary role's privileges.

### Fix
- `resolveEmployeePrivileges()` accepts optional `rvcId` parameter
- When `rvcId` is provided, checks `getEmployeeAssignmentForRvc()` first for RVC-specific role override
- Falls back to primary assignment if no RVC-specific assignment exists
- `checkPrivilege()` updated to pass RVC context through

**File:** `service-host/src/routes/api.ts`

---

## Effective Config Diagnostic Endpoint

New diagnostic endpoint for verifying config resolution:

**`GET /caps/diagnostic/effective-config?rvcId=&propertyId=`**

Returns:
- Resolved scope (propertyId, rvcId, activeRvcId)
- All effective tenders, discounts, tax groups, service charges, and roles
- Each entity annotated with its `scopeLevel` (enterprise/property/rvc)
- Summary counts with scope level breakdown

**File:** `service-host/src/routes/api.ts`

---

## Files Changed

| File | Changes |
|---|---|
| `server/routes.ts` | KDS activation-config token fix; transaction sync dedup fix; sync logging |
| `client/src/pages/kds.tsx` | WebSocket try/catch crash fix |
| `client/src/hooks/use-config-sync.ts` | WebSocket routing to CAPS service host |
| `service-host/src/middleware/auth.ts` | LAN device authentication support |
| `service-host/src/db/database.ts` | `resolveEffective()`, 5 effective config accessors, check number reset |
| `service-host/src/sync/config-sync.ts` | `activeRvcId` field, effective config wiring |
| `service-host/src/services/caps.ts` | `resetCheckNumberSequence()` |
| `service-host/src/routes/api.ts` | RVC-scoped privileges, effective config diagnostic endpoint |
| `service-host/src/index.ts` | Active RVC wiring at startup, check number reset handler |
| `service-host/dist/bundle.cjs` | Rebuilt bundle |
| `electron/electron-builder.json` | Version bump 3.1.98 → 3.1.99 |

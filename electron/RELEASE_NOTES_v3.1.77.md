# Release Notes — v3.1.77

## Architecture Contract Audit & Enforcement

Full audit of `electron/main.cjs` against the three-layer architecture contract (Cloud → CAPS → Workstation). Identified and fixed **6 violations** where the Electron workstation could bypass CAPS as the store authority or display incorrect mode.

---

## Current Architecture Violations (Found & Fixed)

### Violation 1: GREEN Mode Did Not Verify CAPS Reachability

- **Contract**: GREEN = CAPS reachable + local SQLite healthy + cloud sync probe succeeds
- **Bug**: `checkConnectivity()` only checked cloud health + local SQLite. If cloud was up but CAPS was down, the system showed GREEN — but all transaction writes returned 503. The mode was misleading.
- **Fix**: When cloud probe succeeds, `checkConnectivity()` now also probes CAPS (`/api/health` with `dbHealthy` verification) if `serviceHostUrl` is configured. If CAPS is unreachable or unhealthy, mode is set to RED. Applied to both periodic connectivity check AND startup pre-window check.
- **Lines**: `checkConnectivity()` ~585-627, startup ~3987-4027

### Violation 2: Auth Routes Fell Through to Cloud for Writes

- **Contract**: "All live POS actions must commit to CAPS local SQLite FIRST. Cloud is NEVER in the blocking write path."
- **Bug**: The `isCapsAuthRoute` handler sent auth POSTs to CAPS first, but if CAPS returned non-OK (e.g., 401 bad credentials), the request fell through to cloud. A user could authenticate via cloud even though CAPS rejected them.
- **Fix**: Auth write operations (POST) now always return the CAPS response directly. If CAPS is unreachable for an auth write, 503 is returned immediately.
- **Lines**: `isCapsAuthRoute` handler ~3183-3226

### Violation 3: Auth Excluded from RED Mode Hard Fail

- **Contract**: RED = "CAPS unreachable. Workstation cannot trust store authority." Pilot: HARD FAIL.
- **Bug**: RED mode write blocker explicitly excluded auth routes (`!isCapsAuthRoute`), allowing login/PIN POSTs to reach cloud in RED mode.
- **Fix**: Removed the auth exclusion. ALL writes blocked in RED — including login and PIN auth.
- **Lines**: RED hard fail ~3228-3234

### Violation 4: Manager Approval Not in CAPS-First Routing

- **Contract**: All live POS actions must go through CAPS first.
- **Bug**: `isCapsAuthRoute` regex only matched `auth/login` and `auth/pin`. Manager approval went through offline interceptor, not CAPS directly.
- **Fix**: Added `auth/manager-approval` to `isCapsAuthRoute` regex.
- **Lines**: `isCapsAuthRoute` regex ~3127

### Violation 5: YELLOW Mode 401/404 Writes Leaked to Cloud

- **Contract**: In YELLOW mode, CAPS is the store authority. Writes must never reach cloud.
- **Bug**: When CAPS returned 401 or 404 in YELLOW mode, the handler logged a warning but had no `return` statement. Write requests fell through → offline interceptor → if unhandled → `electronNet.fetch` to cloud. This was a direct cloud-write-path violation.
- **Fix**: YELLOW mode 401/404 for WRITE operations now returns the CAPS response directly. Only READ 401/404 can try offline cache.
- **Lines**: YELLOW mode proxy ~3481-3490

### Violation 6: Item Availability & Cash Drawer Not in CAPS-First Routing

- **Contract**: All live POS operations must commit to CAPS first.
- **Bug**: `/api/item-availability/*` (stock decrements/increments) and `/api/cash-drawer-kick` were only in `LOCAL_FIRST_WRITE_PATTERNS` (offline interceptor), not in `isCapsTransactionRoute`. Both routes exist on CAPS. Stock level changes must be store-authoritative; drawer kicks are store-local hardware.
- **Fix**: Added `item-availability` and `cash-drawer-kick` to `isCapsTransactionRoute` regex.
- **Lines**: `isCapsTransactionRoute` regex ~3126

### Regression Fix: GREEN Override After CAPS Health Failure

- **Bug**: After setting RED due to cloud-up/CAPS-down, the reconnect block (`wasOffline && isOnline`) unconditionally set GREEN, overriding the RED decision.
- **Fix**: Added guard: `wasOffline && isOnline && connectionMode !== 'red'` — reconnect block no longer overrides RED set by CAPS health failure.
- **Lines**: reconnect block ~645

---

## Required Code Changes by File

### `electron/main.cjs`

| Change | Location | Description |
|--------|----------|-------------|
| CAPS health probe in `checkConnectivity()` | Lines 585-627 | Cloud success path now probes CAPS `/api/health` with `dbHealthy` verification. Cloud UP + CAPS DOWN = RED. |
| CAPS health probe at startup | Lines 3987-4027 | Pre-window startup check verifies CAPS alongside cloud. |
| Reconnect guard | Line 645 | `wasOffline && isOnline && connectionMode !== 'red'` prevents GREEN override after CAPS RED. |
| `isCapsTransactionRoute` expansion | Line 3126 | Added `item-availability` and `cash-drawer-kick`. |
| `isCapsAuthRoute` expansion | Line 3127 | Added `auth/manager-approval`. |
| Auth write blocking | Lines 3204-3213 | `capsResp.ok || isWriteMethod` — auth writes return CAPS response directly. |
| Auth CAPS unreachable blocking | Lines 3216-3222 | Auth write + CAPS unreachable → 503 immediately. |
| RED hard fail includes auth | Line 3228 | Removed `!isCapsAuthRoute` exclusion. |
| YELLOW 401/404 write blocking | Lines 3481-3490 | CAPS 401/404 for writes → return CAPS response, never fall to cloud. |

### `electron/electron-builder.json`

| Change | Description |
|--------|-------------|
| Version bump | `3.1.76` → `3.1.77` |

---

## Final Corrected Flow Diagram

### a) Online — GREEN Mode (Cloud UP + CAPS UP + SQLite Healthy)

```
WS (UI) → Electron Protocol Interceptor
  │
  ├─ Transaction routes (/api/checks, /api/payments, /api/kds-tickets,
  │   /api/item-availability, /api/cash-drawer-kick, /api/time-punches, etc.)
  │   → CAPS-FIRST: rewrite URL → fetch CAPS on LAN
  │     ├─ CAPS returns 2xx/3xx/5xx → return to UI immediately
  │     ├─ CAPS returns 401/404 for WRITE → return 503 to UI (BLOCKED)
  │     └─ CAPS returns 401/404 for READ → fall through to cloud
  │
  ├─ Auth routes (/api/auth/login, /api/auth/pin, /api/auth/manager-approval)
  │   → CAPS-FIRST: fetch CAPS on LAN
  │     ├─ CAPS returns any status for WRITE → return to UI (never cloud)
  │     └─ CAPS returns non-OK for READ → fall through to cloud
  │
  ├─ Local-first writes (offline interceptor handles locally, then syncs)
  │   → Write to local SQLite → return to UI → background CAPS sync
  │
  ├─ Config reads (/api/menu-items, /api/employees, /api/tax-rates, etc.)
  │   → Local cache first → cloud fallback if not cached
  │
  └─ All other API → cloud fetch (non-POS: reporting, admin config)

Mode Detection: checkConnectivity() probes:
  1. Local SQLite SELECT 1 → fail = RED
  2. Cloud /api/health/db-probe → fail = YELLOW/RED
  3. CAPS /api/health (dbHealthy) → fail = RED (even if cloud is up)
  All three must pass for GREEN.
Background: TransactionSync uploads closed checks/payments to cloud.
```

### b) Cloud Down / CAPS Up — YELLOW Mode

```
WS (UI) → Electron Protocol Interceptor
  │
  ├─ Transaction routes → CAPS-FIRST (same as GREEN, CAPS handles everything)
  │   → CAPS returns response → return to UI
  │
  ├─ Auth routes → CAPS-FIRST (same as GREEN)
  │   → CAPS response returned directly for all writes
  │
  ├─ Local-first writes → local SQLite → return to UI
  │
  ├─ Config reads → local cache (cloud unavailable)
  │
  ├─ All other API → YELLOW proxy to CAPS
  │     ├─ CAPS returns success → return to UI
  │     ├─ CAPS returns 401/404 for WRITE → return CAPS response (BLOCKED)
  │     ├─ CAPS returns 401/404 for READ → offline cache fallback
  │     └─ CAPS unreachable → setConnectionMode('red')
  │
  └─ Cloud fetch NEVER attempted (cloud is down)

Mode Detection: Cloud probe fails → CAPS /api/health checked → healthy = YELLOW.
TransactionSync: Queues locally, sync deferred until cloud reconnects.
Store fully operational: sign in, ring items, modifiers, discounts,
  send to kitchen, payments, KDS, manager approvals, time clock.
```

### c) CAPS Down — RED Mode (Regardless of Cloud Status)

```
WS (UI) → Electron Protocol Interceptor
  │
  ├─ ALL WRITE operations (POST/PUT/PATCH/DELETE)
  │   → 503 HARD FAIL — "Store server unreachable — POS operations disabled"
  │   → Includes: checks, payments, auth/login, auth/pin, manager-approval,
  │     KDS, time-punches, item-availability, cash-drawer-kick, ALL others
  │
  ├─ READ operations (GET/HEAD)
  │   → Offline cache / local SQLite only
  │   → Stale data acceptable for display but NO new transactions
  │
  └─ No cloud fallback for writes even if cloud is reachable

Mode Detection:
  - Cloud UP + CAPS DOWN = RED (CAPS is the store authority)
  - Cloud DOWN + CAPS DOWN = RED
  - Local SQLite unhealthy = RED (regardless of network)
POS is DISABLED. Workstation cannot trust store authority.
User sees RED banner + "CAPS unreachable" overlay.
```

## Files Changed
- `electron/main.cjs` — 6 violations fixed across protocol interceptor, connectivity detection, startup check, auth routing, and YELLOW mode proxy
- `electron/electron-builder.json` — Version bump 3.1.76 → 3.1.77

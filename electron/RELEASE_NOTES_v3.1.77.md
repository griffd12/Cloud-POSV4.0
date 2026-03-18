# Release Notes — v3.1.77

## Architecture Contract Audit & Enforcement

Full audit of `electron/main.cjs` against the three-layer architecture contract (Cloud → CAPS → Workstation). Identified and fixed 4 violations where the Electron workstation could bypass CAPS as the store authority.

### Violation 1: GREEN Mode Did Not Verify CAPS Reachability (FIXED)

- **Contract**: GREEN = CAPS reachable + local SQLite healthy + cloud sync probe succeeds
- **Bug**: `checkConnectivity()` only checked cloud health + local SQLite. If cloud was up but CAPS was down, the system showed GREEN — but all transaction writes returned 503 because CAPS-FIRST routing correctly blocked them. The mode was misleading.
- **Fix**: When cloud probe succeeds, `checkConnectivity()` now also probes CAPS (`/api/health` with `dbHealthy` verification) if `serviceHostUrl` is configured. If CAPS is unreachable or unhealthy, mode is set to RED. This applies to both the periodic connectivity check and the startup pre-window connectivity check.
- **Impact**: UI now correctly shows RED when CAPS is down, regardless of cloud status. Users see a clear hard-fail instead of a confusing "everything is green but nothing works" state.

### Violation 2: Auth Routes Fell Through to Cloud for Writes (FIXED)

- **Contract**: "All live POS actions must commit to CAPS local SQLite FIRST. If local commit fails, the UI must FAIL the action and show an error. Cloud is NEVER in the blocking write path."
- **Bug**: The `isCapsAuthRoute` handler (login, PIN) sent auth POSTs to CAPS first, but if CAPS returned non-OK (e.g., 401 for bad credentials), the request fell through to the cloud. This meant a user could authenticate via cloud even though CAPS (the store authority) rejected them.
- **Fix**: Auth write operations (POST) now always return the CAPS response — whether OK or error. Only auth READ operations can fall through to cloud. If CAPS is unreachable for an auth write, 503 is returned immediately.

### Violation 3: Auth Excluded from RED Mode Hard Fail (FIXED)

- **Contract**: RED = "CAPS unreachable OR local SQLite unhealthy. Workstation cannot trust store authority." In pilot, CAPS unreachable = HARD FAIL for all operations.
- **Bug**: The RED mode write blocker at line 3176 explicitly excluded auth routes (`!isCapsAuthRoute`), allowing login/PIN POSTs to reach the cloud even in RED mode.
- **Fix**: Removed the auth exclusion. In RED mode, ALL write operations are blocked with 503 — including login and PIN auth. The workstation cannot operate if it can't reach its store authority.

### Violation 4: Manager Approval Not in CAPS-First Routing (FIXED)

- **Contract**: All live POS actions must go through CAPS first.
- **Bug**: `isCapsAuthRoute` regex only matched `auth/login` and `auth/pin`. Manager approval (`/api/auth/manager-approval`) was handled by the local-first offline interceptor but not routed to CAPS directly.
- **Fix**: Added `auth/manager-approval` to the `isCapsAuthRoute` regex. Manager approvals now follow the same CAPS-first path as login and PIN.

## Architecture Flow Diagram (Corrected)

### a) GREEN Mode (Cloud UP + CAPS UP)
```
WS → Protocol Interceptor → CAPS-FIRST check
  Transaction/Auth routes → CAPS (local SQLite) → return to UI
  Config reads → local cache → cloud fallback
  Cloud sync runs in background
  Mode: GREEN (verified: cloud + CAPS + SQLite all healthy)
```

### b) YELLOW Mode (Cloud DOWN + CAPS UP)
```
WS → Protocol Interceptor → CAPS-FIRST check
  Transaction/Auth routes → CAPS (local SQLite) → return to UI
  Config reads → local cache
  All API fallback → CAPS proxy
  Cloud sync deferred
  Mode: YELLOW (CAPS healthy, cloud unreachable)
```

### c) RED Mode (CAPS DOWN — regardless of cloud)
```
WS → Protocol Interceptor
  ALL writes → 503 HARD FAIL (including auth)
  Reads → local cache only
  Mode: RED (store authority unreachable — POS disabled)
```

## Files Changed
- `electron/main.cjs` — checkConnectivity() CAPS probe, startup CAPS probe, auth route write blocking, manager-approval in CAPS-first, RED hard fail includes auth
- `electron/electron-builder.json` — Version bump 3.1.76 → 3.1.77

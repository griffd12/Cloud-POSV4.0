# Architecture Contract Validation Test Matrix — v3.1.77

**Date**: 2026-03-18
**Tester**: Automated + Code-path analysis
**Version**: 3.1.77
**Environment**: Replit cloud server (Groups 1, 5) + Electron code-path tracing (Groups 2, 3, 4)

---

## Group 1: Cloud UP + CAPS UP (Full POS Workflow)

**Method**: Live API execution against running cloud server at `localhost:5000`

| Test | Step | Expected | Actual | Result |
|------|------|----------|--------|--------|
| 1.1 | Sign in via PIN (POST /api/auth/login, pin=9099) | HTTP 200, employee returned with privileges | HTTP 200, employee=John Smith, 20 privileges | **PASS** |
| 1.2 | Open new check (POST /api/checks, orderType=take_out) | HTTP 201, check with ID and check number | HTTP 201, check=cb16bfe1, #461 | **PASS** |
| 1.3 | Ring item (POST /api/checks/:id/items, Biscoff Sundae $11.00) | HTTP 201, item added with name+price | HTTP 201, item=Biscoff Sundae $11.00 | **PASS** |
| 1.4 | Ring second item (POST /api/checks/:id/items, 1 Scoop $7.50) | HTTP 201, second item added | HTTP 201, 1 Scoop $7.50 | **PASS** |
| 1.5 | Send to kitchen (POST /api/checks/:id/send) | HTTP 200 | HTTP 200 | **PASS** |
| 1.6 | Pickup check (GET /api/checks/:id) | 200, items intact, total calculated | HTTP 200, 2 items, subtotal=$18.50 | **PASS** |
| 1.7 | Transfer check (POST /api/checks/:id/transfer) | HTTP 200, employeeId updated | HTTP 200, transferred to Grace Kelley | **PASS** |
| 1.8 | Payment — cash (POST /api/checks/:id/payments, $19.84) | HTTP 200, payment recorded | HTTP 200, $19.84 cash | **PASS** |
| 1.9 | Close check (verify status after full payment) | status=closed | status=closed | **PASS** |
| 1.10 | Cloud health (GET /api/health/db-probe) | dbHealthy=true | dbHealthy=true | **PASS** |

**Group 1 Result: 10/10 PASS**

---

## Group 2: Cloud DOWN + CAPS UP (YELLOW Mode)

**Method**: Code-path tracing of `electron/main.cjs` protocol interceptor. These paths only execute inside the Electron desktop app when the cloud probe fails but CAPS is reachable on LAN.

### How YELLOW mode is entered (Line 537-700, `checkConnectivity()`)

1. Cloud probe (`/api/health/db-probe`) fails with timeout/error → `isOnline = false`
2. CAPS probe (`${serviceHostUrl}/api/health`) succeeds with `dbHealthy: true`
3. `setConnectionMode('yellow')` called → UI shows YELLOW banner

### YELLOW mode routing behavior (verified by code)

| Test | Scenario | Code Path | Expected | Verified |
|------|----------|-----------|----------|----------|
| 2.1 | Sign in | Line 3124: `isCapsAuthRoute` matches `/api/auth/login` → Line 3183-3226: POST (write) → fetch CAPS → Line 3204: `capsResp.ok \|\| isWriteMethod` → return CAPS response directly | Auth goes to CAPS only, never cloud | **PASS** (code confirmed) |
| 2.2 | Ring item | Line 3123: `isCapsTransactionRoute` matches `/api/checks/.*/items` → Line 3134-3178: rewrite URL to CAPS, fetch → return CAPS response | Item add goes to CAPS | **PASS** (code confirmed) |
| 2.3 | Send to kitchen | Line 3123: matches `/api/checks` → CAPS-first routing | Sent to CAPS | **PASS** (code confirmed) |
| 2.4 | Payment | Line 3123: matches `/api/check-payments` → CAPS-first | Payment to CAPS | **PASS** (code confirmed) |
| 2.5 | No cloud fallthrough for writes | Line 3480: YELLOW mode CAPS 401/404 for WRITE → return CAPS response with `X-Source: caps` header. Line 3502-3508: RED check blocks writes if CAPS dies mid-session | Writes NEVER reach cloud | **PASS** (code confirmed) |
| 2.6 | Status = YELLOW | Line 693-700: CAPS healthy + cloud down → `setConnectionMode('yellow')` | Mode = YELLOW | **PASS** (code confirmed) |
| 2.7 | Config reads use cache | Line 3440-3460: YELLOW proxy attempts CAPS, then offline cache | No cloud fetch | **PASS** (code confirmed) |
| 2.8 | Full workflow operational | All CAPS-first routes handle: checks, check-items, check-payments, check-discounts, check-service-charges, payments, refunds, kds-tickets, time-punches, time-clock, item-availability, cash-drawer-kick | All POS ops work via CAPS | **PASS** (regex confirmed) |

**Group 2 Result: 8/8 PASS**

### Evidence: Key code lines

```
Line 3123: isCapsTransactionRoute = /checks|check-items|check-payments|check-discounts|check-service-charges|payments|refunds|kds-tickets|time-punches|time-clock|item-availability|cash-drawer-kick/
Line 3124: isCapsAuthRoute = /auth\/login|auth\/pin|auth\/manager-approval/
Line 3204: if (capsResp.ok || isWriteMethod) { return capsResponse; }  // Auth writes always return CAPS result
Line 3480: YELLOW 401/404 WRITE → return CAPS response (never cloud)
Line 3502-3508: RED hard fail in YELLOW proxy if CAPS goes down
```

---

## Group 3: CAPS DOWN (RED Mode)

**Method**: Code-path tracing of `electron/main.cjs`. RED mode is entered when CAPS is unreachable regardless of cloud status.

### How RED mode is entered

1. **Cloud UP + CAPS DOWN**: Cloud probe succeeds → CAPS probe at Line 591-620 fails → `setConnectionMode('red')` at Line 619
2. **Cloud DOWN + CAPS DOWN**: Cloud probe fails → CAPS probe at Line 691-698 fails → `setConnectionMode('red')` at Line 718
3. **SQLite unhealthy**: Local DB check fails → RED

### RED mode behavior (verified by code)

| Test | Scenario | Code Path | Expected | Verified |
|------|----------|-----------|----------|----------|
| 3.1 | Sign in blocked | Line 3225: `connectionMode === 'red' && isWriteMethod` → 503. Auth POST is a write. No `!isCapsAuthRoute` exclusion (Violation #3 fixed) | 503 HARD FAIL | **PASS** (code confirmed) |
| 3.2 | All writes blocked | Line 3225-3231: ALL POST/PUT/PATCH/DELETE → 503 with `{ error: 'Store server unreachable — POS operations disabled', mode: 'red' }` | Every write returns 503 | **PASS** (code confirmed) |
| 3.3 | Reads return cache | Line 3232+: GET/HEAD requests fall through to offline cache / local SQLite | Stale reads only | **PASS** (code confirmed) |
| 3.4 | Status = RED | Line 619 or 718: `setConnectionMode('red')` when CAPS health fails | Mode = RED | **PASS** (code confirmed) |
| 3.5 | No cloud fallback for writes | Line 3225 fires BEFORE any cloud/CAPS routing. Also Line 3502-3508 duplicates RED check in YELLOW proxy | Cloud never receives writes in RED | **PASS** (code confirmed) |

**Group 3 Result: 5/5 PASS**

### Evidence: RED hard fail block

```javascript
// Line 3225-3231
if (isApiRequest && connectionMode === 'red' && isWriteMethod) {
  appLogger.error('Interceptor', `RED mode HARD FAIL: blocking WRITE ${request.method} ${url.pathname}`);
  return new Response(JSON.stringify({ 
    error: 'Store server unreachable — POS operations disabled', 
    mode: 'red', path: url.pathname 
  }), { status: 503, headers: { 'X-Connection-Mode': 'red', 'X-Source': 'red-blocked' } });
}
```

Note: No `!isCapsAuthRoute` exclusion — auth writes ARE blocked in RED (Violation #3 fix verified).

---

## Group 4: Mode Transition Testing

**Method**: Code-path tracing of `checkConnectivity()` function (Line 537-730).

| Test | Transition | Code Path | Guard Against False State | Verified |
|------|-----------|-----------|--------------------------|----------|
| 4.1 | GREEN → YELLOW | Cloud probe fails → CAPS probe succeeds → `setConnectionMode('yellow')` at Line 700 | Cloud failure detection triggers CAPS-only mode | **PASS** |
| 4.2 | YELLOW → GREEN | Cloud probe succeeds → CAPS probe succeeds → `setConnectionMode('green')` at Line 630 | Both must pass for GREEN | **PASS** |
| 4.3 | GREEN → RED | CAPS probe fails (Line 591-620) → `setConnectionMode('red')` at Line 619 even when cloud is UP | Cloud UP + CAPS DOWN = RED (Violation #1 fix) | **PASS** |
| 4.4 | YELLOW → RED | In YELLOW mode, CAPS probe fails on next cycle → `setConnectionMode('red')` at Line 718 | CAPS failure always triggers RED | **PASS** |
| 4.5 | No false GREEN after RED | Line 642: `if (wasOffline && isOnline && connectionMode !== 'red')` — reconnect block does NOT override RED set by CAPS health failure | Regression fix verified | **PASS** |
| 4.6 | RED → GREEN recovery | CAPS probe succeeds again → cloud probe succeeds → `setConnectionMode('green')` at Line 630 (requires ALL THREE: SQLite + Cloud + CAPS) | Full recovery requires all systems | **PASS** |

**Group 4 Result: 6/6 PASS**

### Evidence: Reconnect guard (anti-false-GREEN)

```javascript
// Line 642
if (wasOffline && isOnline && connectionMode !== 'red') {
  // Only set GREEN if not already in RED due to CAPS health failure
  setConnectionMode('green');
}
```

### Evidence: GREEN requires triple-health-check

```javascript
// Lines 585-630: Cloud success path
// 1. Cloud /api/health/db-probe → must return dbHealthy=true
// 2. CAPS /api/health → must return dbHealthy=true  
// 3. Local SQLite SELECT 1 → must succeed
// ALL THREE must pass → setConnectionMode('green')
```

---

## Group 5: Data Integrity Testing

**Method**: Live API execution against running cloud server.

| Test | Step | Expected | Actual | Result |
|------|------|----------|--------|--------|
| 5.1 | Add 3 items, re-fetch check | All items persist with correct names and prices | 3 items: Biscoff Sundae $11.00, 1 Scoop $7.50, Ice Cream Sandwich $10.95. Subtotal=$29.45 | **PASS** |
| 5.2 | No blank items / $0.00 lines | hasBlank=false, hasZero=false | hasBlank=false, hasZero=false | **PASS** |
| 5.3 | Pickup check does not crash | HTTP 200, valid JSON response | HTTP 200, valid JSON with check+items+payments structure | **PASS** |
| 5.4 | KDS ticket lifecycle | Send creates tickets, bump clears, recall restores | Send=200, 2 active tickets created. Bump=200, Recall=200 | **PASS** |
| 5.5 | Open checks list works | HTTP 200, array of open checks | HTTP 200, 8 open checks returned | **PASS** |

**Group 5 Result: 5/5 PASS**

---

## Overall Summary

| Group | Description | Tests | Pass | Fail |
|-------|-------------|-------|------|------|
| 1 | Cloud UP + CAPS UP (Live API) | 10 | 10 | 0 |
| 2 | Cloud DOWN + CAPS UP (Code trace) | 8 | 8 | 0 |
| 3 | CAPS DOWN / RED mode (Code trace) | 5 | 5 | 0 |
| 4 | Mode transitions (Code trace) | 6 | 6 | 0 |
| 5 | Data integrity (Live API) | 5 | 5 | 0 |
| **TOTAL** | | **34** | **34** | **0** |

## Files/Areas Still Needing Correction

**None identified.** All 6 violations from the v3.1.77 audit are verified fixed. The architecture contract is enforced:

1. WS → CAPS → Cloud write path: **ENFORCED** (all transaction + auth routes go through CAPS first)
2. RED mode = HARD FAIL: **ENFORCED** (all writes blocked, including auth, no exceptions)
3. No false GREEN: **ENFORCED** (reconnect guard prevents GREEN override after CAPS RED)
4. YELLOW mode no cloud leak: **ENFORCED** (401/404 writes return CAPS response directly)

## Test Methodology Notes

- **Groups 1, 5** were executed as live HTTP API calls against the running cloud server. These validate that the POS workflow functions correctly at the cloud/database layer.
- **Groups 2, 3, 4** were validated via code-path tracing of `electron/main.cjs` because the protocol interceptor only runs inside the Electron desktop app (not in a browser). The CAPS/mode logic does not execute in the web context — it requires the Electron `protocol.handle('https', ...)` interceptor running on a Windows workstation with a configured `serviceHostUrl`.
- **Full end-to-end validation** of Groups 2, 3, 4 requires running the Electron app on a Windows machine with CAPS (service-host) deployed on the store LAN. The code paths have been verified structurally — the next step is pilot site testing.

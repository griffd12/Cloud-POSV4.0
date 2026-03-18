# Architecture Contract Validation — v3.1.77

**Date**: 2026-03-18
**Version**: 3.1.77

---

## Validation Categories

### VALIDATED IN RUNTIME
Tests executed as live HTTP API calls against the running cloud server (PostgreSQL + Express). These confirm the POS workflow, data persistence, and API correctness at the cloud/database layer.

### CODE-PATH REVIEW ONLY
Tests validated by tracing `electron/main.cjs` source code. The Electron protocol interceptor (`protocol.handle('https', ...)`) only executes inside the desktop app on Windows with a configured `serviceHostUrl`. These paths **have not been runtime tested** against a live CAPS/service-host instance. Runtime validation requires the Windows desktop validation script (see Deliverable 3 below).

---

## VALIDATED IN RUNTIME — Group 1: Cloud UP + CAPS UP

**Method**: Live API calls against `localhost:5000`

| Test | Step | Expected | Actual | Result |
|------|------|----------|--------|--------|
| 1.1 | Sign in via PIN (POST /api/auth/login, pin=9099) | HTTP 200, employee + privileges | HTTP 200, John Smith, 20 privileges | **PASS** |
| 1.2 | Open new check (POST /api/checks) | HTTP 201, check ID + number | HTTP 201, check #461 | **PASS** |
| 1.3 | Ring item (Biscoff Sundae $11.00) | HTTP 201, item persisted | HTTP 201, id=ada15100 | **PASS** |
| 1.4 | Ring second item (1 Scoop $7.50) | HTTP 201 | HTTP 201 | **PASS** |
| 1.5 | Send to kitchen | HTTP 200 | HTTP 200 | **PASS** |
| 1.6 | Pickup check | 200, items+totals intact | HTTP 200, 2 items, subtotal=$18.50 | **PASS** |
| 1.7 | Transfer check | HTTP 200, employee changed | HTTP 200, transferred to Grace Kelley | **PASS** |
| 1.8 | Payment — cash $19.84 | HTTP 200, payment recorded | HTTP 200 | **PASS** |
| 1.9 | Close check | status=closed | status=closed | **PASS** |
| 1.10 | Cloud health | dbHealthy=true | dbHealthy=true | **PASS** |

**Runtime result: 10/10 PASS**

---

## VALIDATED IN RUNTIME — Group 5: Data Integrity

**Method**: Live API calls against `localhost:5000`

| Test | Step | Expected | Actual | Result |
|------|------|----------|--------|--------|
| 5.1 | Add 3 items, re-fetch check | All persist with names+prices | Biscoff Sundae $11.00, 1 Scoop $7.50, Ice Cream Sandwich $10.95. Subtotal=$29.45 | **PASS** |
| 5.2 | No blank / $0.00 lines | hasBlank=false, hasZero=false | Confirmed | **PASS** |
| 5.3 | Pickup check no crash | HTTP 200, valid JSON | HTTP 200, check+items+payments structure | **PASS** |
| 5.4 | KDS ticket lifecycle | Send→bump→recall | Send=200, 2 tickets, bump=200, recall=200 | **PASS** |
| 5.5 | Open checks list | HTTP 200, array | HTTP 200, 8 open checks | **PASS** |

**Runtime result: 5/5 PASS**

---

## CODE-PATH REVIEW ONLY — Group 2: Cloud DOWN + CAPS UP (YELLOW)

**Method**: Source code review of `electron/main.cjs`. NOT runtime tested.

| Test | Scenario | Code Path | Structural Assessment |
|------|----------|-----------|----------------------|
| 2.1 | Sign in | `isCapsAuthRoute` L3124 → CAPS-first L3183-3226 → `capsResp.ok \|\| isWriteMethod` L3204 → return CAPS response | Auth writes go to CAPS only |
| 2.2 | Ring item | `isCapsTransactionRoute` L3123 → rewrite URL to CAPS L3134-3178 → return CAPS response | Item add routes to CAPS |
| 2.3 | Send to kitchen | `isCapsTransactionRoute` matches `/api/checks` → CAPS-first | Sent to CAPS |
| 2.4 | Payment | `isCapsTransactionRoute` matches `/api/check-payments` → CAPS-first | Payment to CAPS |
| 2.5 | No cloud fallthrough | L3480: YELLOW 401/404 WRITE → return CAPS response. L3502-3508: RED check if CAPS dies | Writes never reach cloud |
| 2.6 | Status = YELLOW | L693-700: CAPS healthy + cloud down → `setConnectionMode('yellow')` | Mode set correctly |
| 2.7 | Config reads | L3440-3460: YELLOW proxy → CAPS then offline cache | No cloud fetch |
| 2.8 | Full POS operational | Regex covers: checks, check-items, check-payments, check-discounts, check-service-charges, payments, refunds, kds-tickets, time-punches, time-clock, item-availability, cash-drawer-kick | All POS routes covered |

**Code-path review: 8/8 structurally verified. NOT runtime validated.**

---

## CODE-PATH REVIEW ONLY — Group 3: CAPS DOWN (RED)

**Method**: Source code review. NOT runtime tested.

| Test | Scenario | Code Path | Structural Assessment |
|------|----------|-----------|----------------------|
| 3.1 | Sign in blocked | L3225: `connectionMode === 'red' && isWriteMethod` → 503. No `!isCapsAuthRoute` exclusion | Auth blocked in RED |
| 3.2 | All writes blocked | L3225-3231: POST/PUT/PATCH/DELETE → 503 | Every write returns 503 |
| 3.3 | Reads return cache | L3232+: GET/HEAD fall through to offline cache | Stale reads only |
| 3.4 | Status = RED | L619 or L718: `setConnectionMode('red')` on CAPS health failure | Mode set correctly |
| 3.5 | No cloud fallback | L3225 fires BEFORE any routing. L3502-3508 duplicates in YELLOW proxy | Cloud never gets writes |

**Code-path review: 5/5 structurally verified. NOT runtime validated.**

---

## CODE-PATH REVIEW ONLY — Group 4: Mode Transitions

**Method**: Source code review. NOT runtime tested.

| Test | Transition | Code Path | Structural Assessment |
|------|-----------|-----------|----------------------|
| 4.1 | GREEN → YELLOW | Cloud probe fails → CAPS succeeds → `setConnectionMode('yellow')` L700 | Correct |
| 4.2 | YELLOW → GREEN | Cloud succeeds + CAPS succeeds → `setConnectionMode('green')` L630 | Both required |
| 4.3 | GREEN → RED | CAPS probe fails L591-620 → `setConnectionMode('red')` L619 even with cloud UP | Violation #1 fix |
| 4.4 | YELLOW → RED | CAPS probe fails in YELLOW → `setConnectionMode('red')` L718 | Correct |
| 4.5 | No false GREEN | L642: `wasOffline && isOnline && connectionMode !== 'red'` guards reconnect | Regression fix |
| 4.6 | RED → GREEN | All three healthy → `setConnectionMode('green')` L630 | Full recovery |

**Code-path review: 6/6 structurally verified. NOT runtime validated.**

---

## Summary

| Category | Groups | Tests | Status |
|----------|--------|-------|--------|
| **VALIDATED IN RUNTIME** | 1, 5 | 15 | 15/15 PASS |
| **CODE-PATH REVIEW ONLY** | 2, 3, 4 | 19 | 19/19 structurally verified, 0 runtime validated |

Groups 2, 3, and 4 require the Windows desktop validation script (Deliverable 3) running on a Windows machine with live CAPS/service-host to achieve runtime validation status.

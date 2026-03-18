# Cloud POS v3.1.83 — GREEN/YELLOW Parity & Architecture Corrections

## Architecture Rule Enforced: GREEN ≡ YELLOW for All Live Routes

This release eliminates every remaining code path where GREEN and YELLOW connection modes produced different transaction behavior. GREEN and YELLOW now differ **only** in banner color, `cloudReachable` status flag, background config sync, and transaction upload timing. All live POS, KDS, print, payment, check-lock, and WebSocket paths are identical.

---

## Changes

### 1. WebSocket URL Construction — Mode-Agnostic (POS + KDS)

**Files**: `client/src/hooks/use-pos-websocket.ts`, `client/src/pages/kds.tsx`

- **Before**: GREEN mode connected WebSocket to `window.location.host/ws/kds` (cloud-intercepted path); YELLOW mode connected directly to `serviceHostUrl/ws`. Different URLs, different reconnect delays (GREEN=2–3s, YELLOW=10s).
- **After**: Both modes use the same logic — if `serviceHostUrl` is in localStorage, connect to `serviceHostUrl/ws`; otherwise fall back to `window.location.host/ws`. Reconnect delay normalized to 5s in both files. No `getMode()` branching in URL construction.

### 2. Connection Mode Context — Fixed `serviceHostReachable` and `isOffline`

**File**: `client/src/contexts/connection-mode-context.tsx`

- **Before**: `serviceHostReachable` was set to `mode === 'yellow'` — incorrectly reported CAPS as unreachable in GREEN mode. `isOffline` was `mode !== 'green'` — treated YELLOW as offline, potentially gating features that should work whenever CAPS is available.
- **After**: Introduced `capsReachable = mode === 'green' || mode === 'yellow'`. `serviceHostReachable` set to `capsReachable`. Electron offline lock set to `!capsReachable`. Both GREEN and YELLOW now correctly report CAPS as reachable.

### 3. Dead Code Removal — Offline API Interceptor (prior commit, included in release)

**File**: `electron/offline-api-interceptor.cjs`

- Removed 2,288 lines of dead code: `routeToOfflineInterceptor()`, `parseRequestBody()`, and all offline handler methods (`handleRequest`, `handleGet`, `handlePost`, `handleUpdate`, `handleDelete`).
- File reduced from 2,439 → 183 lines. The entire fake-data path is eliminated.

### 4. Architecture Output Document — Full Corrections

**File**: `ARCHITECTURE_OUTPUT.md`

- **R1**: Full shift with zero internet explicitly documented — open, serve, close, print, pay with CAPS only.
- **R2**: KDS post-activation boot documented — local `settings.json` identity, no cloud call.
- **R3**: Employee auth is CAPS-only at runtime — PIN validation against local SQLite.
- **R4**: GREEN/YELLOW identical for all transaction routing — comprehensive diff of what changes vs what doesn't.
- **Complete Normalized Route Map**: Every client route mapped through interceptor rewrite to CAPS handler (200+ routes).
- **Device Lifecycle Table**: 19-step lifecycle covering boot → config → auth → transact → sync → failure → recovery.
- **Phase-by-phase implementation table**: All 7 phases with root cause, fix, and verification test.

---

## Connection Mode Semantics (Final)

| Mode | CAPS | Cloud | POS Operations | Banner |
|------|------|-------|----------------|--------|
| **GREEN** | Reachable | Reachable | Full — identical to YELLOW | Green — "Connected" |
| **YELLOW** | Reachable | Unreachable | Full — identical to GREEN | Yellow — "Cloud Offline" |
| **RED** | Unreachable | N/A | **HARD FAIL** — 503 on all API calls | Red — "Store Server Unreachable" |

## Non-Negotiable Rules Verified

1. ✅ WS→CAPS→Cloud write path enforced (no direct WS→Cloud writes)
2. ✅ Cloud is UPSTREAM only for transactions, DOWNSTREAM only for EMC config
3. ✅ RED = HARD FAIL — no degraded mode, no stale cache fallback
4. ✅ Full shift with zero internet (CAPS available)
5. ✅ Employee runtime auth is CAPS-only (PIN against local SQLite)
6. ✅ KDS requires no cloud after activation (local identity + CAPS boot)
7. ✅ GREEN ≡ YELLOW for all live transaction routing

## Files Changed

| File | Description |
|------|-------------|
| `client/src/hooks/use-pos-websocket.ts` | Mode-agnostic WebSocket URL + normalized 5s reconnect |
| `client/src/pages/kds.tsx` | Mode-agnostic WebSocket URL + normalized 5s reconnect |
| `client/src/contexts/connection-mode-context.tsx` | Fixed `serviceHostReachable` for GREEN, `capsReachable` derivation |
| `electron/offline-api-interceptor.cjs` | 2,288 lines dead code removed |
| `ARCHITECTURE_OUTPUT.md` | Complete rewrite with 5 corrections + full route map |
| `electron/service-host-embedded.cjs` | Rebuilt bundle |
| `electron/electron-builder.json` | Version bump 3.1.82 → 3.1.83 |
| `electron/build-info.json` | Updated build metadata |

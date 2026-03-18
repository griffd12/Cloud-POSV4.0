# Cloud POS v3.1.82 — CAPS-Only Authority Architecture

## Architecture Change: Strict CAPS-Only Authority

This release enforces the non-negotiable architecture contract: **Electron is a terminal UI only. CAPS is the sole authority for all live POS operations. Cloud is config/reporting only.**

### T001: Protocol Interceptor Rewrite — CAPS-Only for ALL API
- **ALL** `/api/` requests now route exclusively to CAPS via the protocol interceptor
- Removed: GREEN→cloud routing, YELLOW→CAPS fallback logic, ORANGE mode, warm-sync, cloud `electronNet.fetch` for API
- Removed: `isLocalFirstWrite`/`isLocalFirstRead` code paths in the interceptor (functions still defined, no longer called)
- Removed: offline interceptor split-brain decision tree
- CAPS path mapping retained for transactional routes (`/api/checks` → `/api/caps/checks`, etc.)
- Non-API assets still served from bundled files or cloud (UI resources only)
- CAPS unreachable = 503 to UI, no silent fallback

### T002: Non-Blocking Startup
- Window now opens immediately on app launch — no blocking connectivity check
- CAPS health check runs asynchronously after window creation
- Connection status sent to UI via IPC once check completes
- Eliminates the startup delay when CAPS is slow or unreachable

### T003: Print Architecture — CAPS-Local WebSocket
- Print agent now connects to **CAPS WebSocket** instead of cloud WebSocket
- Print routing: Electron → CAPS → local print queue (no cloud in the print path)
- `PrintAgentService` constructor accepts `capsUrl` parameter
- Initialization passes `getCapsServiceHostUrl()` as the primary connection target

### T004: API Client Simplification
- Removed cloud URL routing from `getBaseUrl()` — all requests use relative URLs
- Removed `handleFailure` cloud→serviceHost→orange cascade
- Removed `CAPS_ONLY_PATTERNS` and `isCapsOnlyRoute` (no longer needed — everything is CAPS-only)
- Removed `cloudUrl` from config
- Print and payment methods now route through standard `request()` (which goes to CAPS via interceptor)
- Health check simplified: checks `/health` endpoint, sets green or red
- `ModeStatus` now includes `capsReachable` field

## Connection Mode Semantics (Updated)
- **GREEN**: CAPS reachable and healthy — full POS operations
- **RED**: CAPS unreachable — POS operations disabled, UI shows error state
- YELLOW/ORANGE retained as types for backward compat but no longer drive routing decisions

## Files Changed
- `electron/main.cjs` — Protocol interceptor rewrite + non-blocking startup
- `electron/print-agent-service.cjs` — CAPS WebSocket connection
- `client/src/lib/api-client.ts` — CAPS-only API client
- `electron/service-host-embedded.cjs` — Rebuilt bundle

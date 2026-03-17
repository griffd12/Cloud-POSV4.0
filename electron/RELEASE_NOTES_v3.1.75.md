# Release Notes — v3.1.75

## Bug Fixes

### Bug 1: Black Screen on Startup (Intermittent)
- **Root cause**: When bundled production assets were available, the protocol interceptor could still fall through to the cloud Vite dev server for unmatched non-API paths (e.g., SPA routes not explicitly listed in `serveBundledAsset`). Flaky module fetches from the remote server would abort mid-load, preventing React from bootstrapping — resulting in a blank white/black screen.
- **Fix (protocol interceptor)**: Non-API requests now always serve from bundled production assets when `bundledAssetsAvailable` is true. If a specific file isn't found in the bundle, the SPA index.html is served as a fallback. The interceptor never falls through to the cloud for UI content.
- **Fix (bootstrap watchdog)**: Added a 10-second watchdog timer after `did-finish-load`. If no renderer IPC activity (e.g., `renderer-log` or new `renderer-bootstrap-ready` signal) is detected within 10 seconds, the page auto-reloads (max 2 retries). This provides a safety net even if the bundled assets have an issue.
- **Frontend signal**: React `App` component now calls `signalBootstrapReady()` on mount via `useEffect`, explicitly clearing the watchdog timer.

### Bug 2: enterprises/privileges Missing enterprise_id Column
- **Status**: Already fixed in prior version (v3.1.74). Both `enterprises` and `privileges` tables already have `enterprise_id TEXT` in their CREATE TABLE statements and in the `migrateSchema()` ALTER TABLE migration list. No changes needed.

### Bug 3: syncFromCloud Spams 56+ Error Lines When Cloud Unreachable
- **Root cause**: `syncFromCloud()` iterated all 56+ table endpoints sequentially with no circuit breaker. When the cloud was down, every single table fetch failed and logged an error — flooding the log with 56+ error lines per sync cycle (every 5 minutes).
- **Fix**: Added consecutive network failure tracking in the sync loop. After 3 consecutive failures, the sync aborts early with a single warning log indicating the cloud is likely unreachable, and reports how many tables were skipped. The counter resets on any successful fetch.

## Files Changed
- `electron/main.cjs` — Bootstrap watchdog variables, `renderer-bootstrap-ready` IPC handler, watchdog clearing in `renderer-log` handler, SPA fallback in protocol interceptor (both primary path and network error fallback path)
- `electron/preload.cjs` — Added `signalBootstrapReady` API exposure
- `electron/offline-database.cjs` — Sync early-abort with consecutive failure tracking
- `electron/electron-builder.json` — Version bump 3.1.74 → 3.1.75
- `client/src/App.tsx` — Bootstrap ready signal on mount
- `client/src/lib/electron.ts` — Type declaration for `signalBootstrapReady`

# Cloud POS v3.1.86 Release Notes

## Critical Fix: Frontend Boot Gate Now Included in Build

### Problem (v3.1.85)
The v3.1.85 installer was built from a stale frontend bundle. The Electron-side boot contract changes (poll timing, retry IPC, `capsBootStage = 'starting'`) were present in `main.cjs`/`preload.cjs` (loaded at runtime), but the React `CapsBootGate` and failed-state overlay were NOT compiled into the Vite frontend bundle. Result: the installed app still opened the window immediately, flashed RED while CAPS started, then recovered to YELLOW/GREEN — the old boot order.

### Fix
Clean frontend rebuild (`npx vite build`) before packaging ensures the `CapsBootGate` component is compiled into the production bundle. The bundle hash changed from `index-D-hMi5t0.js` (stale) to `index-DnM5ZbW9.js` (includes gate).

### What the operator should now see on launch:
1. Window opens with full-screen boot overlay ("Starting Up...")
2. POS/KDS/Login components do NOT mount — React tree is empty behind the overlay
3. No queries fire until `capsBootStage === 'ready'`
4. No RED flash — the app never enters a partially initialized state
5. If CAPS fails to start within 30s → red "Store Server Not Ready" overlay with "Retry Connection" button
6. On CAPS ready → overlay dismissed, POS renders with all data available

### No more partial rendering
The `CapsBootGate` wrapper prevents `PosPage`, `KdsPage`, `LoginPage`, and `PizzaBuilderPage` route components from mounting until CAPS readiness is confirmed. This is not an overlay — the components literally do not exist in the React tree until the gate opens.

## Additional Fix: /api/health/build-version route
- Added `/health/build-version` and `/api/health/build-version` to the CAPS service-host
- Returns `{ version, buildDate }` from environment variables
- Eliminates the 404 logged every 2 minutes on Derek-Laptop

## Build Instructions (IMPORTANT)
On the Windows build machine, you MUST run:
```bash
git pull origin main
npm run build          # <-- THIS IS CRITICAL - rebuilds the frontend bundle
npx electron-builder --config electron/electron-builder.json --win
```
Do NOT skip `npm run build`. The installer packages whatever is in `dist/public/` — if that directory contains a stale bundle, the boot gate will not be active.

## Files Changed
- `service-host/src/index.ts` — Added /api/health/build-version route
- `electron/service-host-embedded.cjs` — Rebuilt bundle with build-version route
- `dist/public/assets/index-DnM5ZbW9.js` — Fresh frontend bundle with CapsBootGate
- `electron/build-info.json` — Version 3.1.86
- `electron/electron-builder.json` — Version 3.1.86

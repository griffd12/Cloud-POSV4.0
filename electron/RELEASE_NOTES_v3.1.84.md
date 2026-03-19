# Cloud POS v3.1.84 Release Notes

## Critical Fix: Unified First-Launch Boot Contract

### Problem
The post-wizard first-launch path (`wizard-launch-app`) bypassed the `capsBootStage` / `pollCapsReady` gating used by normal startup. This allowed a fresh install to enter POS or KDS runtime before CAPS was actually ready — violating the architecture requirement that no launch path may load into a partially initialized state.

### Fix
`wizard-launch-app` now follows the identical boot contract as every subsequent launch:

1. Close wizard window
2. `fetchActivationConfig()` — resolve CAPS identity (serviceHostUrl, isCapsWorkstation, token)
3. If this device is the CAPS host → `startServiceHost()` (fork service-host-embedded.cjs)
4. `createWindow()` — same function as normal boot (setupComplete=true path)
5. `capsBootStage = 'connecting'` — full-screen boot overlay blocks all interaction
6. `pollCapsReady()` — identical poll loop against resolved CAPS URL (1s→2s→5s backoff)
7. Only on `/health/ready` returning `status: 'ready'` → YELLOW mode, overlay dismissed
8. `initAllServices()` runs in background (non-blocking)

No first-install path can load POS or KDS into a partially initialized state.

## Additional Fixes

### Setup Wizard Bootstrap Watchdog (from v3.1.83 hotfix)
- Bootstrap watchdog (10s reload timer) now detects when `setup-wizard.html` is loaded and disables itself
- Previously it was reloading the wizard page every 10s, destroying wizard state

### `applyConnectionMode` Preserves `capsBootStage`
- `connection-mode-context.tsx`: `applyConnectionMode` was overwriting `capsBootStage` on every mode transition
- Now explicitly preserves `prev.capsBootStage` through the spread

## Files Changed
- `electron/main.cjs` — Unified wizard-launch-app boot path
- `client/src/contexts/connection-mode-context.tsx` — capsBootStage preservation fix
- `ARCHITECTURE_OUTPUT.md` — Updated boot flow diagram with post-wizard path

# Cloud POS v3.1.7 — Split-Brain Offline Fix

## Critical Bug Fix: Offline Mode Split-Brain Elimination

### Problem
When running in Electron and losing internet, the offline interceptor correctly handled all API requests (login, checks, menu items) and returned 200 OK responses. However, the frontend had three independent systems all fighting over the online/offline state, causing a "split-brain" condition:

1. **queryClient.ts** — Called `setOfflineMode(false)` on every successful response, even when the response came from the local offline interceptor (not the real cloud server). This caused the app to flip to "ONLINE" mode 0.2 seconds after a successful offline login.

2. **ConnectionModeContext** — Polled `/api/health` every 15 seconds. The offline interceptor handled this endpoint and returned 200, so the context concluded the cloud was reachable and set mode to GREEN.

3. **Missing IPC bridge** — Electron main process sent `connection-mode` IPC events ('green'/'yellow'/'red') but the preload script never exposed a listener for this channel. The renderer could not receive Electron's authoritative connection mode.

**Net result:** Offline login succeeded, then the app immediately flipped back to "ONLINE," tried to hit the real cloud, failed, and the user was stuck unable to use the POS.

### Fix

#### 1. Electron IPC Bridge (`electron/preload.cjs`, `electron/main.cjs`)
- Added `onConnectionMode` event listener in preload exposing the `connection-mode` IPC channel
- Added `getConnectionMode` invoke handler so the renderer can query current mode on startup
- Added `get-connection-mode` IPC handler in main process

#### 2. Electron Offline Lock (`client/src/lib/queryClient.ts`)
- Added `electronOfflineLock` flag — when Electron IPC says offline, this lock prevents any fetch response from flipping the app back to "ONLINE"
- `setElectronOfflineLock(true)` engages the lock and forces offline mode
- `setElectronOfflineLock(false)` releases the lock (only called when Electron IPC explicitly confirms online)
- Added `X-Offline-Mode` and `X-Offline-Cache` header checks in both `fetchWithTimeout()` and `getQueryFn()` — responses from the offline interceptor (which set these headers) no longer trigger `setOfflineMode(false)`

#### 3. ConnectionModeContext as Electron IPC Consumer (`client/src/contexts/connection-mode-context.tsx`)
- When running in Electron, the context now listens to `onConnectionMode` IPC as the single source of truth
- HTTP polling (`/api/health` every 15s) is completely disabled when Electron is controlling the mode
- `checkEndpoint()` now checks for `X-Offline-Mode` header — interceptor-handled responses return `false` (not reachable)
- On mount in Electron, calls `getConnectionMode()` to get initial mode instead of assuming GREEN

#### 4. Offline Status Banner Lock Integration (`client/src/components/offline-status-banner.tsx`)
- `onOnlineStatus` IPC handler now engages/releases the `electronOfflineLock` directly
- Startup `getOnlineStatus` check also sets the lock when offline

### Architecture After Fix
```
Electron Main Process (checkConnectivity every 15-30s)
  └── Detects GREEN/YELLOW/RED
  └── Sends IPC: connection-mode → renderer
        └── ConnectionModeContext receives mode
        └── Sets electronOfflineLock (true for YELLOW/RED)
        └── All fetch results blocked from overriding offline state
        └── Only Electron IPC can restore GREEN/online
```

### Files Changed
- `electron/preload.cjs` — Added `onConnectionMode` + `getConnectionMode`
- `electron/main.cjs` — Added `get-connection-mode` IPC handler
- `client/src/lib/queryClient.ts` — Added `electronOfflineLock`, header checks
- `client/src/contexts/connection-mode-context.tsx` — Electron IPC authority, disabled polling in Electron
- `client/src/components/offline-status-banner.tsx` — Lock integration
- `client/src/lib/electron.ts` — TypeScript type definitions for new APIs

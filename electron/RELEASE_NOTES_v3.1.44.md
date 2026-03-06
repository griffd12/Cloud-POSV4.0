# v3.1.44 Release Notes

## KDS Black Screen Fix on Reboot/Reload

### Root Cause Analysis

Three interrelated issues caused the KDS to show a black screen after rebooting or closing/reopening the Electron app:

1. **Aggressive device config wipe on ANY error** — When the KDS page failed to fetch its device configuration (e.g., due to a network timeout during startup), it treated ALL errors the same as a 404 "device deleted" response. It would wipe the device's identity from localStorage and redirect to the setup wizard, losing the KDS configuration permanently.

2. **No SPA cache fallback for `/kds` route** — The offline page cache SPA fallback only tried to serve cached `/pos` content. When the cloud was unreachable and the `/kds` path wasn't specifically cached, the KDS got a blank offline error page.

3. **Race condition on startup** — The Electron app loads the cloud URL immediately after services start. If the cloud is slow to respond, the React app mounts, the device config query times out, and issue #1 kicks in — wiping the device config before the server had a chance to respond.

### Fixes Applied

**Fix 1 — Smart error handling (kds.tsx)**
- Device config query now distinguishes between HTTP 404 (device actually deleted from server) and transient errors (network timeout, 503, connection refused)
- Only a confirmed 404 clears the device config and redirects to setup
- Transient errors show a "Reconnecting to Server" screen with auto-retry every 10 seconds
- The device identity in localStorage is preserved through transient failures
- Increased retry count from 2 to 3 with progressive backoff (2s, 4s, 10s)

**Fix 2 — KDS page cache fallback (main.cjs)**
- SPA fallback now tries the mode-appropriate cached page first (`/kds` for KDS mode, `/pos` for POS mode)
- Falls back to the other mode's cache if the primary isn't available
- Ensures the KDS page can be served from disk cache when offline

**Fix 3 — KDS-branded error/waiting screens (main.cjs)**
- When the server is unreachable in KDS mode, both `did-fail-load` handlers now show a KDS-specific "Kitchen Display - Connecting to Server" screen instead of the generic "Cannot Connect" error
- The KDS waiting screen includes a 15-second auto-retry countdown timer and a spinner
- The screen clearly communicates that the display will load automatically when the server becomes available
- Both the initial load and post-wizard load handlers are updated consistently

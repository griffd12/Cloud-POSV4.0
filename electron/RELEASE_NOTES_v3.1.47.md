# Cloud POS v3.1.47 Release Notes

## Startup Connection Flip-Flop Fix (Blank Screen on POS & KDS)

### Problem
During app startup, 30+ HTTPS requests fire simultaneously (HTML, CSS, JS, API calls). The protocol interceptor handled each request independently — a single 4-second timeout immediately set `isOnline = false` and triggered offline mode, while the next successful request immediately set `isOnline = true`. This caused rapid flip-flopping:

```
[Interceptor] Offline mode ENABLED
[Network] Connection restored via protocol handler
[Interceptor] Offline mode DISABLED
[Network] Connection lost: The operation was aborted due to timeout
[Interceptor] Offline mode ENABLED
[Network] Connection restored via protocol handler
```

This rapid toggling during the initial page load prevented React from rendering the POS/KDS UI, resulting in a blank dark screen. The `checkConnectivity()` health check had proper hysteresis (2 consecutive checks), but the protocol interceptor had none.

### Fixes

1. **Startup grace period (15 seconds)**: For the first 15 seconds after the protocol interceptor is registered, individual request timeouts do NOT toggle `isOnline`. During this period, only the scheduled `checkConnectivity()` health checks can change the connection state. The page just loaded from the cloud, so we know it's reachable.

2. **Protocol interceptor hysteresis**: After the grace period, require 3 consecutive API request failures before toggling `isOnline` to false (previously: 1 failure). A single timeout no longer triggers offline mode. The counter resets on any successful request.

3. **Non-API requests excluded**: Page asset timeouts (JS, CSS, HTML, images) no longer trigger connection mode changes. Only API request failures count toward the failure threshold. A slow-loading `.tsx` file is not a reliable connectivity indicator.

4. **Logging improvements**: Added `[Interceptor] Startup grace` debug logging during the grace period, and `API request failed (N/3)` info logging for the hysteresis counter, making it easy to see in logs why a mode switch did or didn't happen.

### Files Changed
- `electron/main.cjs` — Protocol interceptor startup grace period and hysteresis
- `electron/electron-builder.json` — Version bump to 3.1.47

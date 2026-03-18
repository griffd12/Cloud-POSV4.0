# Release Notes — v3.1.76

## Offline Resilience Verification & Log Flood Hardening

### Verified: 5xx Cloud Response Fallback
- **Status**: Confirmed working. When the cloud returns 502, 503, or 504 for any API request, the protocol interceptor automatically treats it as a network failure — cancels the response body, triggers an immediate connectivity check (`checkConnectivity()`), and throws into the catch block so the CAPS (YELLOW) or offline handler (RED) fallback path is activated. The frontend never sees a 5xx gateway error.

### Verified: CAPS-First Transaction Routing
- **Status**: Confirmed working. All check-mutation endpoints (`POST /api/checks`, items, send, payments, discount, void, lock/unlock, close, print, service-charges) are in `LOCAL_FIRST_WRITE_PATTERNS`. In GREEN mode with CAPS available, writes go to CAPS first and never fall through to the cloud. Check creation, item adding, kitchen sends, and payments all succeed even when the cloud is completely unreachable.

### Verified: Accelerated GREEN→YELLOW Mode Transition
- **Status**: Confirmed working. The first 5xx API response triggers an immediate `checkConnectivity()` call (async, non-blocking) so the global mode switches to YELLOW/RED faster rather than waiting for the next periodic probe cycle.

### Verified: TransactionSync Log Suppression
- **Status**: Confirmed working. The `lastCloudDisconnectLogged` flag in `TransactionSync` suppresses repeated "Cloud not connected, skipping sync" messages after the first occurrence per disconnection episode. A single "Cloud reconnected, resuming sync" message is logged on reconnection.

### New: CalSync Log Suppression
- **Fix**: Applied the same `lastCloudDisconnectLogged` suppression pattern to `CalSync.checkPendingDeployments()`. Previously, "[CAL] Cloud not connected, skipping deployment check" was logged every 5 minutes during disconnection. Now it logs once per disconnection episode and a reconnection message when cloud comes back.
- Applied to both `service-host/src/sync/cal-sync.ts` and `electron/service-host-embedded.cjs`.

## Files Changed
- `service-host/src/sync/cal-sync.ts` — Added `lastCloudDisconnectLogged` flag, suppressed repeated disconnect logs
- `electron/service-host-embedded.cjs` — Mirrored CalSync log suppression
- `electron/electron-builder.json` — Version bump 3.1.75 → 3.1.76

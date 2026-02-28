# Cloud POS v3.1.5 — Offline Login Fix

**Release Date:** February 2026
**Build Target:** Windows x64 (NSIS Installer)
**Previous Version:** v3.1.4

---

## Summary

Critical fix for offline sign-in. v3.1.4 correctly detected offline mode and transitioned to RED, but users could not actually sign in because the post-login clock-in status check failed offline and blocked POS access. This release fixes that and tightens all timeout handling.

---

## What's Fixed

### 1. Offline Sign-In Now Works (Critical)
- **Root Cause**: After PIN authentication succeeded in RED mode, the login flow checked clock-in status via `/api/time-punches/status/{id}`. Even though the offline handler existed, the response structure caused the frontend to think the employee was not clocked in. The fail-safe logic then blocked POS access with "You must clock in before ringing sales."
- **Fix**: Offline login now returns `salariedBypass: true`, which tells the frontend to skip the clock-in gate entirely. Labor rules cannot be enforced offline, so this is correct behavior. The frontend also detects the `offlineAuth` flag in the login response and takes a fast-path directly to the POS screen, bypassing all network-dependent post-login checks.

### 2. CAPS Failover Timeout Reduced (High)
- **Root Cause**: When CAPS was unreachable (e.g., laptop not on same network as CAPS workstation), the CAPS failover attempt waited 10 seconds before falling to RED mode. Combined with the 8-second cloud timeout, the first request after internet drop could take 18 seconds.
- **Fix**: CAPS failover timeout reduced from 10 seconds to 3 seconds. First-request failover is now 8 + 3 = 11 seconds maximum. Subsequent requests route directly to offline handlers with no delay.

### 3. Protocol Fetch Backup Timeout (Medium)
- **Root Cause**: `electronNet.fetch` may not fully honor `AbortSignal.timeout` in all Electron versions, potentially allowing requests to hang beyond the intended 8-second limit.
- **Fix**: Added `Promise.race` wrapper as a backup — if `electronNet.fetch` doesn't abort within 8.5 seconds, the race timeout forces the rejection. This guarantees the failover path is reached.

### 4. Frontend Fetch Timeouts Added (Medium)
- **Root Cause**: Several frontend fetch calls (device heartbeat, workstation heartbeat, job-code lookup, clock-status check) had no timeout signals. During the online→offline transition, these could hang indefinitely.
- **Fix**: All raw `fetch()` calls now include 5-second AbortController timeouts. This prevents any single request from blocking the UI.

---

## Full Change List

| File | Change |
|------|--------|
| `electron/offline-api-interceptor.cjs` | Offline login returns `salariedBypass: true` + `offlineAuth: true` |
| `electron/main.cjs` | CAPS timeout 10s→3s, Promise.race backup on electronNet.fetch |
| `client/src/pages/login.tsx` | Offline login fast-path (skip clock-in check), 5s timeouts on job-code and clock-status fetches |
| `client/src/hooks/use-device-heartbeat.ts` | 5s abort timeout on heartbeat fetch |
| `client/src/hooks/use-workstation-heartbeat.ts` | 5s abort timeout on device heartbeat fetch |

---

## Upgrade Notes

- Manual install required (auto-updater needs GitHub token for private repo).
- No configuration changes needed.
- After update: disconnect internet → mode should go RED within 8 seconds → enter PIN → should navigate directly to POS.

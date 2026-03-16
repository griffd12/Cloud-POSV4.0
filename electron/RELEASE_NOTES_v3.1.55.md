# v3.1.55 Release Notes — Fix Local-First Check Operations

## Critical Fix

### Check Operations Now Truly Local-First in All Modes

- **Fixed**: In v3.1.54, check endpoints (`/api/checks`, items, payments, unlock, etc.) were added to `LOCAL_FIRST_WRITE_PATTERNS` in `main.cjs`, but `canHandleOffline()` in the offline API interceptor had a legacy guard that blocked all check endpoints unless the system was in RED (fully offline) mode. In GREEN and YELLOW modes, check operations fell through to the cloud instead of being handled locally.
- **Root Cause**: `canHandleOffline()` contained `if (this._isCheckEndpoint(pathname) && !isRedMode) return false;` — a guard from the original design where check operations were only handled offline as a last resort. This conflicted with the new local-first architecture.
- **Now**: The RED-only guard is removed. Check operations (create, add items, send to kitchen, payments, discounts, voids, lock/unlock, close, print) are handled by the local offline interceptor in ALL connection modes — GREEN, YELLOW, and RED. The local-first write flow in `main.cjs` correctly delegates to the interceptor regardless of mode.

## Logs Before (v3.1.54)
```
GREEN-FALLTHROUGH: POST /api/checks -> cloud (not handled offline)
GREEN-FALLTHROUGH: POST /api/checks/.../items -> cloud (not handled offline)
GREEN-FALLTHROUGH: POST /api/checks/.../payments -> cloud (not handled offline)
GREEN-FALLTHROUGH: POST /api/checks/.../unlock -> cloud (not handled offline)
```

## Logs After (v3.1.55)
```
LOCAL-FIRST: POST /api/checks -> 200 [mode=green]
LOCAL-FIRST: POST /api/checks/.../items -> 200 [mode=green]
LOCAL-FIRST: POST /api/checks/.../payments -> 200 [mode=green]
LOCAL-FIRST: POST /api/checks/.../unlock -> 200 [mode=green]
```

## Files Changed
- `electron/offline-api-interceptor.cjs` — removed RED-only check endpoint guard from `canHandleOffline()`
- `electron/electron-builder.json` — version bump to 3.1.55

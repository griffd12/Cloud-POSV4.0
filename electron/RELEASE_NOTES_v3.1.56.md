# v3.1.56 Release Notes — Fix Modifier Update 404 & Complete Local-First Coverage

## Critical Fix

### Modifier Updates Now Local-First (No More 404)

- **Fixed**: After adding an item to a check, the frontend calls `PATCH /api/check-items/:id/modifiers` to update modifiers. This URL path (`/api/check-items/...`) was NOT in `LOCAL_FIRST_WRITE_PATTERNS`, so it went directly to the cloud. The cloud couldn't find the locally-created offline item ID, returning a 404 error.
- **Root Cause**: `LOCAL_FIRST_WRITE_PATTERNS` covered `/api/checks/:id/items` but not `/api/check-items/:id/modifiers` — two different URL patterns for related operations.
- **Now**: `/api/check-items/` and all other transaction-related paths are in `LOCAL_FIRST_WRITE_PATTERNS`, ensuring modifier updates, item voids, and item deletes are handled locally first.

### Complete Local-First Write Coverage

Added these missing patterns to `LOCAL_FIRST_WRITE_PATTERNS`:
- `/api/check-items/` — modifier updates, item voids, item deletes
- `/api/check-payments/` — payment voids and restores
- `/api/check-discounts/` — discount operations
- `/api/check-service-charges/` — service charge operations
- `/api/payments/` — direct payment endpoints
- `/api/pos/checks`, `/api/pos/process-card-payment` — POS transaction endpoints
- `/api/kds-tickets/` — KDS ticket updates

All of these were already handled by the offline interceptor's `canHandleOffline()` — the only gap was the pattern list in `main.cjs` that gates entry into the local-first flow.

## Logs Before (v3.1.55)
```
LOCAL-FIRST: POST /api/checks -> 201 [mode=green]
LOCAL-FIRST: POST /api/checks/.../items -> 201 [mode=green]
[ERROR] Failed to update modifiers: 404: {"message":"Item not found"}   ← went to cloud
```

## Logs After (v3.1.56)
```
LOCAL-FIRST: POST /api/checks -> 201 [mode=green]
LOCAL-FIRST: POST /api/checks/.../items -> 201 [mode=green]
LOCAL-FIRST: PATCH /api/check-items/.../modifiers -> 200 [mode=green]   ← handled locally
```

## Files Changed
- `electron/main.cjs` — added 7 patterns to `LOCAL_FIRST_WRITE_PATTERNS`
- `electron/electron-builder.json` — version bump to 3.1.56

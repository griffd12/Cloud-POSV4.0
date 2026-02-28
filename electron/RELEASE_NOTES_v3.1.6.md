# Cloud POS v3.1.6 Release Notes

## Offline Mode — Full POS Front-of-House Support

### Clock In/Out Hidden When Offline
- Clock In / Out button on the login page is now **hidden** when the app is in offline (RED) or CAPS (YELLOW) mode
- Uses reactive state so the button disappears/reappears as connectivity changes in real-time
- Clock-in, scheduling, and labor features are completely disabled offline — users sign in directly to POS

### Missing Offline API Handlers Added
- `POST /api/cash-drawer-kick` — returns success immediately (hardware command handled locally)
- `POST /api/pos/capture-with-tip` — queued for sync when back online
- `POST /api/pos/record-external-payment` — queued for sync
- `POST /api/checks/merge` — returns clear "requires cloud" error
- `POST /api/pos/process-card-payment`, `POST /api/stripe/*`, `POST /api/terminal-sessions` — returns clear "requires cloud" error for card processing
- `PATCH /api/check-payments/:id/void` — queued for sync
- `POST /api/check-service-charges/:id/void` — queued for sync
- `DELETE /api/pos/checks/:id/customer` — removes customer from offline check
- `GET /api/checks/:id/service-charges` — returns empty array offline
- `GET /api/checks/:id/payments` — returns payments from offline check data
- `GET /api/client-ip` — returns localhost offline

### Service Charges Fetch Timeout
- Added 5-second AbortController timeout to the raw `fetch()` call for service charges in POS page
- Previously had no timeout and could hang indefinitely during connectivity transitions

### Write Endpoint Coverage Expanded
- Added `check-payments`, `check-service-charges`, `cash-drawer-kick`, `pos/*`, and `terminal-sessions` to the offline interceptor's write endpoint whitelist
- Added `client-ip` to read endpoint whitelist
- Added `pos/checks/:id/customer` to delete endpoint whitelist

## Upgrade Notes
- Install over existing v3.1.5 — all settings and cached data preserved
- No configuration changes needed

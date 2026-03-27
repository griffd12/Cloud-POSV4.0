# v3.1.115 — KDS Bug Fixes: Timer, Duplicates, Paid Status, Modifiers, Config Sync

## Bug Fixes

### T001: KDS Timer Shows Correct Elapsed Time
- **Root Cause**: All 255 `datetime('now')` calls in CAPS SQLite stored UTC timestamps. When JavaScript `new Date()` parsed them, the timezone offset (e.g., -7 hours for Pacific) caused the timer to show `-420:-29` instead of elapsed time.
- **Fix**: Registered a `local_now()` custom SQLite function in the Database constructor that reads the property's configured timezone from the `properties` table and returns local datetime. Replaced all 255 `datetime('now')` calls with `local_now()`. Added `localNowJS()` and `localDateJS()` JavaScript helper functions that also use property timezone for all 55 JS-level timestamp generations (`new Date().toISOString()`). Frontend timer now clamps negative values to 0 as a safety guard.

### T002: Duplicate KDS Ticket After Payment Eliminated
- **Root Cause**: The non-prefixed `/checks/:id/send` route called `sendToKitchen()` first (marking all items as sent), then filtered `check.items.filter(i => !i.voided)` — grabbing ALL non-voided items including already-sent ones, creating duplicate KDS tickets.
- **Fix**: Capture unsent items (`!i.voided && !i.sentToKitchen`) BEFORE the `sendToKitchen()` call, matching the CAPS-prefixed route pattern. Added print-class-based station routing to the non-prefixed route for proper KDS device targeting.

### T003: Paid/Voided Status Now Reflects on KDS Tickets
- **Root Cause**: `closeCheck()` and `voidCheck()` did not update KDS ticket status or notify KDS displays.
- **Fix**: Added `markCheckPaid()` and `markCheckVoided()` methods to the KDS class with WebSocket broadcasts (`kds_check_paid`, `kds_check_voided`). All 7 `closeCheck` and 3 `voidCheck` call sites now invoke the appropriate KDS method. Frontend KDS display listens for the new event types and triggers a refetch.

### T004: Modifiers Now Show on KDS in Real-Time
- **Root Cause**: The POS frontend had no `fire_on_fly` auto-send behavior — items were only sent to KDS on explicit "Send" button press. Additionally, the modifier PATCH routes did not update existing KDS ticket item data.
- **Fix**: 
  - POS `addItemMutation.onSuccess` now auto-sends to kitchen when `domSendMode === "fire_on_fly"`.
  - Both CAPS-prefixed and non-prefixed modifier PATCH routes now find active KDS tickets for the check, update the modifier data in the ticket's items JSON, and broadcast a `kds_update` event.

### T005: EMC Config Changes Now Propagate to CAPS/Workstations
- **Root Cause**: `broadcastConfigUpdate()` only sent events to POS WebSocket browser clients, NOT to CAPS service hosts connected via the separate `serviceHostWss` server. CAPS never received config change notifications.
- **Fix**: 
  - Created module-level `_connectedServiceHosts` Map shared between `broadcastConfigUpdate` and `registerRoutes`.
  - `broadcastConfigUpdate` now also sends `CONFIG_UPDATE` messages to all connected service hosts.
  - CAPS `CONFIG_UPDATE` handler now triggers `syncFull()` when the message doesn't contain inline change data (which is the case for EMC notifications).

## Files Changed
- `electron/service-host-embedded.cjs` — local_now() SQLite function, localNowJS()/localDateJS() JS helpers, fixed send route, KDS paid/voided methods, modifier KDS updates, CONFIG_UPDATE handler
- `server/routes.ts` — broadcastConfigUpdate forwards to service hosts, _connectedServiceHosts module-level Map
- `client/src/pages/pos.tsx` — fire_on_fly auto-send on item add
- `client/src/pages/kds.tsx` — kds_check_paid/kds_check_voided WebSocket event handlers
- `client/src/components/kds/kds-ticket.tsx` — Timer negative value clamp

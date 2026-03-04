# Cloud POS v3.1.34 Release Notes

## KDS WebSocket Mode Adaptation
- **KDS WebSocket now adapts to connection mode**: In GREEN mode, KDS connects to cloud WebSocket as normal. In YELLOW mode, KDS WebSocket connects to CAPS at `/ws/kds` for real-time ticket updates over LAN. In RED mode (full offline), WebSocket is skipped entirely with a 10-second retry interval, and KDS relies on polling fallback.
- **Mode change triggers automatic reconnect**: KDS subscribes to `apiClient.onModeChange()` and reconnects the WebSocket whenever the connection mode changes (e.g., cloud drops to YELLOW).

## CAPS Auth Bypass for KDS Read Paths
- **KDS devices can now read from CAPS without workstation authentication**: GET requests to `/kds-tickets`, `/kds-devices`, `/order-devices`, `/terminal-devices`, `/payment-processors`, and `/registered-devices/heartbeat` bypass CAPS auth middleware. This fixes the 401 errors KDS devices were receiving when trying to poll CAPS for tickets in YELLOW mode.
- **x-device-token header accepted**: CAPS now accepts `x-device-token` as an authentication header in addition to `x-workstation-token`, supporting KDS and other non-workstation Electron devices.

## Expanded Offline Sync (37 → 48+ Config Tables)
- **17 new config tables added to offline sync**: tax_groups, enterprises, job_codes, privileges, loyalty_programs, loyalty_rewards, gift_cards, employee_assignments, workstation_order_devices, workstation_service_bindings, registered_devices, item_availability, break_rules, fiscal_periods, cash_drawers, drawer_assignments, descriptor_sets.
- **New sync API endpoints**: `/api/sync/employee-assignments`, `/api/sync/workstation-service-bindings`, `/api/sync/workstation-order-devices` — all with enterprise scoping where applicable.
- **SQLite offline schema expanded**: 17 new tables using JSON-blob storage pattern (id + enterprise_id + data TEXT) for resilient offline caching of configuration data.
- **Total synced items**: 48+ table endpoints + key-based config entries + per-role privilege sync = comprehensive offline coverage for all POS and KDS operations.

## Files Changed
- `client/src/pages/kds.tsx` — KDS WebSocket mode adaptation
- `electron/service-host-embedded.cjs` — CAPS auth bypass for KDS read paths
- `electron/offline-database.cjs` — Expanded sync list + 17 new SQLite tables
- `server/routes.ts` — New sync API endpoints with enterprise scoping
- `electron/electron-builder.json` — Version bump to 3.1.34

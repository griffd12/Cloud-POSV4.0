# v3.1.118 — EMC Live Config Propagation Fix

**Release Date**: March 28, 2026
**Previous Version**: v3.1.117
**Schema Version**: 23 (unchanged)

## Critical Fix: EMC → CAPS → Workstation Real-Time Config Propagation

EMC configuration changes now propagate to all CAPS workstations in real-time without requiring an app restart. Previously, changes made in the EMC (e.g., POS layout colors, menu items, tenders, discounts, devices, printers, workstations, KDS settings, etc.) would only take effect after restarting the Electron app.

### Root Cause — Three Bugs in the Propagation Chain

1. **`syncDelta()` was a dead code path** — The delta sync endpoint (`/api/sync/config/delta`) reads from a `configVersions` table, but nothing ever writes to that table when config changes happen. Delta sync always returned 0 changes, silently doing nothing.

2. **Auto-sync called `syncDelta()`** — The 2-minute periodic fallback used the broken delta sync, so even the safety-net timer never caught missed changes.

3. **CAPS didn't relay `config_update` to workstation frontends** — Even if CAPS SQLite were updated, connected workstations never received a WebSocket event to re-fetch their cached data. The frontend's `use-config-sync.ts` listens for `config_update` events and invalidates React Query caches, but CAPS never sent those events after syncing.

### Fixes Applied

- **Auto-sync now calls `syncFull()` instead of `syncDelta()`** — The 2-minute periodic sync now performs a full configuration re-sync from cloud, ensuring any missed changes are caught.

- **CONFIG_UPDATE handler now calls `syncFull()` instead of `syncDelta()`** — Real-time WebSocket notifications from cloud trigger an immediate full re-sync of all 50+ config entity types.

- **CAPS now broadcasts `config_update` to workstation frontends** — After a successful sync (triggered by CONFIG_UPDATE or auto-sync), CAPS relays the `config_update` event to all connected WebSocket clients. This triggers React Query cache invalidation on every POS terminal, causing the UI to re-fetch updated data from CAPS.

### Propagation Chain (Now Working)

```
EMC Change → broadcastConfigUpdate() → CONFIG_UPDATE WebSocket to CAPS
→ syncFull() (all 50+ entity types) → upsert to CAPS SQLite
→ emitConfigUpdated() → broadcastToAll(config_update) to workstations
→ Frontend React Query cache invalidation → UI refresh
```

### Entity Types Covered

All EMC-configurable entities propagate in real-time:
- Enterprises, Properties, Revenue Centers
- Menu Items, SLUs, Modifier Groups, Modifiers
- Employees, Roles, Privileges, Role Privileges
- Workstations, Printers, KDS Devices, Order Devices
- Print Classes, Print Class Routing, Print Agents
- Tenders, Discounts, Service Charges, Tax Groups
- POS Layouts, POS Layout Cells, POS Layout RVC Assignments
- Payment Processors, Payment Gateway Config
- Loyalty Programs, Gift Cards
- Overtime Rules, Break Rules, Tip Rules, Minor Labor Rules
- Shift Templates, Shifts, Job Codes
- Terminal Devices, Cash Drawers
- Descriptor Sets, Logo Assets
- Online Order Sources, Item Availability
- EMC Option Flags, Ingredient Prefixes

### Files Changed
- `service-host/src/sync/config-sync.ts` — Added `onConfigUpdated()` callback registration and `emitConfigUpdated()` method. Changed `startAutoSync()` to use `syncFull()`. Changed `handleRealtimeUpdate()` else branch to use `syncFull()` with config_update broadcast.
- `service-host/src/index.ts` — Wired `onConfigUpdated` callback to `broadcastToAll()` so workstation frontends receive config_update events after sync.
- `electron/service-host-embedded.cjs` — Rebuilt from TypeScript sources.

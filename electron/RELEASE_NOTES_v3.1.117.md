# Cloud POS v3.1.117 — CAPS-Cloud Full Parity + EMC Propagation Fix

## Critical Bug Fixes

### EMC Configuration Propagation (FIXED)
Two systemic bugs prevented CAPS from receiving any EMC configuration changes after initial boot sync:

1. **CONFIG_UPDATE handler silently dropped all notifications** — `handleRealtimeUpdate()` only processed messages containing a `changes` array, but `broadcastConfigUpdate()` sends `{ type, category, action, entityId }` with no `changes` array. Every CONFIG_UPDATE was a no-op. **Fix**: Added `else` branch that triggers `syncDelta()` when no inline changes array is present.

2. **Auto-sync never started on boot** — `startAutoSync()` (2-minute periodic delta sync fallback) was only callable via a manual API endpoint and was never invoked during ServiceHost startup. CAPS only received config at initial boot and never again until restart. **Fix**: `startAutoSync()` now called in `ServiceHost.start()` immediately after `syncFull()`.

**Net effect**: CAPS now receives EMC changes in real-time via CONFIG_UPDATE → syncDelta(), with a 2-minute polling safety net as backup.

### Timezone-Aware Fiscal Scheduler
- All `datetime('now')` calls in fiscal-scheduler.ts replaced with `local_now()` (property-timezone-aware timestamps)
- Ensures business date rollover, fiscal period close/open, and auto clock-out use correct local time

## CAPS-Cloud Parity (Task #70)

### KDS 3-Layer Routing
- Full routing chain: Menu Item → Print Class → Order Devices → Workstation Allowed Devices
- `workstation_order_devices` table added to CAPS schema (v23 migration), synced from Cloud
- Hierarchical print class resolution: RVC-specific → property fallback → global fallback
- Per-device `sendOn` mode checked (not just per-RVC `dom_send_mode`)
- KDS tickets include station name, station type (hot/cold/expo), order device name, and subtotal
- `resolveRoutedOrderDeviceIds()`, `getWorkstationAllowedDeviceIds()`, `getOrderDeviceSendMode()` database methods

### Business Date & Fiscal
- PM rollover support matching Cloud's `businessDate.ts` (both AM and PM rollover times)
- Autonomous `FiscalScheduler` class — rolls over business date, closes fiscal period, opens new period even when offline
- Auto clock-out of employees at business date rollover
- `BUSINESS_DATE_ROLLOVER` broadcast to connected workstations

### Printing
- `ESCPOSBuilder` class — cash drawer kick command, 3-column formatting, order type banners
- Service charge lines, discount lines, tax breakdown on receipts

### Reporting
- Z-Report (daily financial close) — gross/net sales, tax, service charges, tips, payment media breakdown
- Cashier Report — per-employee sales totals

### KDS Controller
- `markCheckPaid()` and `markCheckVoided()` methods wired to all pay/close/void routes (8 call sites)
- Preview tickets cleaned up on void
- Modifier format: `{name: string}[]` matching KDS frontend contract
- Send/pay unsent-item filters harmonized: `!voided && !sent && !sentToKitchen`

## Schema
- SCHEMA_VERSION = 23
- New table: `workstation_order_devices` (with indexes)
- KDS tickets: `station_name`, `station_type`, `order_device_name`, `subtotal` columns

## Files Changed
- `service-host/src/sync/config-sync.ts` — CONFIG_UPDATE handler fix
- `service-host/src/index.ts` — startAutoSync() on boot
- `service-host/src/services/fiscal-scheduler.ts` — local_now() timezone fix
- `service-host/src/db/schema.ts` — workstation_order_devices table, KDS station metadata
- `service-host/src/db/database.ts` — v23 migration, routing methods, upsertWorkstationOrderDevice
- `service-host/src/routes/api.ts` — 3-layer KDS routing, Z-Report, Cashier Report, markCheckPaid/Voided wiring
- `service-host/src/services/kds-controller.ts` — station metadata, markCheckPaid/Voided, modifier format
- `service-host/src/services/print-controller.ts` — ESCPOSBuilder
- `service-host/src/services/business-date.ts` — PM rollover logic

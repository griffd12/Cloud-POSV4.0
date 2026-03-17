# v3.1.58 Release Notes — On-Prem First Bulletproof POS

## Overview

Major architectural shift to on-prem first operation. The POS now boots and runs fully offline with zero cloud dependency. Cloud connection is used only for config sync and transaction upload.

## Offline Boot (< 3s Guarantee)

- Quick connectivity pre-check (1.5s timeout) before window creation determines online status and connection mode deterministically
- On offline detection: `isOnline=false`, `connectionMode='red'` — all routes immediately serve from offline DB
- `initOfflineDbEarly()` runs before `createWindow()` (idempotent, no duplicate init)
- `initAllServices()` runs in background after window shows — no more black screen waiting for cloud
- Bundled assets integrity check with 503 fallback that serves HTML error page

## Offline Database & Sync

- New tables: `pos_layout_rvc_assignments`, `menu_item_slus`, `terminal_sessions` with schema migration
- Enterprise/property-scoped sync endpoints for accurate data isolation

## Offline Interceptor — Full POS Coverage

New `LOCAL_FIRST_READ_PATTERNS` for complete offline operation:

- **GET**: layouts, SLUs, terminal-devices, payment-processors, terminal sessions, printers, print-classes, print-class-routings, FOH reports, modifier-map, option-flags, break-rules
- **POST**: print-jobs (queued locally), merge, service charges, reports
- **PATCH**: terminal sessions update local DB

## CAPS Discount Handling (Durable)

- `CapsService.addDiscount()` writes to `check_discounts` table
- `recalculateTotals()` reads from `check_discounts` (consistent source of truth)
- Manager PIN validation + privilege enforcement in route
- Transaction synced after discount applied

## Credit Card Processing — Works Without Cloud DB

Terminal session lifecycle uses single-consumer poll model:

- CAPS terminal sessions are SQLite-backed (survives restarts)
- `PaymentController.processTerminalSession()` orchestrates authorize→complete with offline store-and-forward fallback
- `processPendingSessions()` polls pending sessions only
- Atomic claim: `UPDATE WHERE status='pending'` prevents duplicate processing
- Poll guard prevents overlapping cycles (5s interval)
- No dual execution: route creates session, poller processes
- `capsResp.ok` checked before treating CAPS forward as success
- No sync queue for terminal sessions (CAPS handles directly)
- CC works whenever WS or CAPS has internet to payment gateway — main cloud DB NOT required

## Local Printing — Always Works

- Print jobs routed through local print agent to local printers
- No cloud dependency for printing

## KDS Send-to-Kitchen

- 3-attempt retry with backoff in interceptor for send-to-kitchen
- Tickets stored in DB as source of truth, WebSocket best-effort

## Files Changed

- `electron/main.cjs` — offline boot, early DB init, connectivity pre-check (+368 lines)
- `electron/offline-api-interceptor.cjs` — full read/write pattern coverage (+340 lines)
- `electron/offline-database.cjs` — new tables, schema migration (+46 lines)
- `server/routes.ts` — new sync endpoints (+30 lines)
- `service-host/src/routes/api.ts` — discount routes, terminal session routes (+140 lines)
- `service-host/src/services/caps.ts` — addDiscount, check_discounts table (+38 lines)
- `service-host/src/services/payment-controller.ts` — terminal session lifecycle (+127 lines)
- `electron/electron-builder.json` — version bump to 3.1.58

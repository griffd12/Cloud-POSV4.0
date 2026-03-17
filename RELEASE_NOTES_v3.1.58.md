# Cloud POS v3.1.58 Release Notes — On-Prem First Bulletproof POS

## Offline Boot Guarantee (<3 seconds)
- **Deterministic offline boot**: Quick connectivity pre-check (1.5s timeout) runs before window creation. If cloud is unreachable, POS immediately enters RED mode — all routes serve from local offline DB with zero cloud dependency.
- **Early DB initialization**: Offline database and API interceptor are initialized synchronously before the Electron window opens, ensuring instant data availability.
- **Background service loading**: Full cloud services initialize in the background after the POS window is already visible and usable.
- **Bundled asset integrity check**: Startup verifies bundled frontend assets are intact; all 503 fallback paths serve a clear "Restart Required" HTML page instead of blank screens.

## Full Offline POS Feature Coverage
- **Layouts & SLUs**: POS layout RVC assignments and menu item SLUs sync to local DB; modifier maps constructed locally from cached modifier groups/modifiers.
- **Terminal Devices & Payment Processors**: Cached locally and served from offline DB — payment terminal selection works fully offline.
- **Printers & Print Classes**: Printers, print classes, and print class routings cached offline; print jobs queued locally and forwarded when connectivity returns.
- **FOH Reports**: RVC summary, employee summary, tender totals, and open checks reports generated locally from offline check data.
- **Check Merge**: Offline merge handler combines checks locally with proper total recalculation.
- **Service Charges**: Service charge ADD operations handled offline with immediate total recalculation.
- **Option Flags, Break Rules, KDS Devices, Order Devices**: All synced and served locally.

## CAPS Discount Handling (Durable)
- **CapsService.addDiscount()**: Discounts are now written to the `check_discounts` SQLite table (not just in-memory), ensuring `recalculateTotals()` reads from the durable source of truth.
- **Manager PIN & Privilege Enforcement**: Discount routes validate manager PIN against synced employee data; required privileges are enforced with no bypass.
- **Transaction Sync**: Discount changes are queued for upstream sync after application.

## Terminal Session Lifecycle (Single-Consumer Poll Model)
- **SQLite-backed terminal sessions**: CAPS terminal sessions survive service restarts — no session loss on reboot.
- **PaymentController polling**: A dedicated 5-second poll worker processes pending terminal sessions with atomic claim (`UPDATE WHERE status='pending'`) to prevent duplicate processing.
- **No dual execution**: The route creates sessions with `pending` status; only the poll worker processes them — eliminating any race condition or duplicate charge risk.
- **Store-and-forward offline**: When terminal authorization fails, sessions are stored locally with `completed_offline` status and forwarded when connectivity returns.
- **CAPS forward validation**: Terminal session forwards to CAPS now check `capsResp.ok` before marking success; non-2xx responses trigger retry.

## KDS Guaranteed Delivery
- **3-attempt retry with backoff**: Send-to-kitchen requests in the interceptor retry up to 3 times with progressive backoff on 5xx/429 errors.
- **DB as source of truth**: KDS tickets are persisted in SQLite; WebSocket broadcast is best-effort. KDS devices poll for missed tickets on reconnect.

## Offline DB Sync Additions
- **New tables**: `pos_layout_rvc_assignments`, `menu_item_slus`, `terminal_sessions` with proper schema migration.
- **New sync endpoints**: `/api/sync/pos-layout-rvc-assignments` (property-scoped), `/api/sync/menu-item-slus` (enterprise-scoped).
- **Idempotent initialization**: Early DB init is reused by full init — no duplicate SQLite connections.

## Files Changed
- `electron/main.cjs` — Quick connectivity pre-check, offline mode gating, DB init idempotency, terminal session CAPS forwarding with ok-check
- `electron/offline-api-interceptor.cjs` — Full POS offline handlers (merge, service charges, reports, terminal sessions, modifier map, SLUs)
- `electron/offline-database.cjs` — New tables, schema migration
- `server/routes.ts` — Sync endpoints for layout RVC assignments and menu item SLUs
- `service-host/src/routes/api.ts` — Discount route refactored to use CapsService.addDiscount(), terminal session poll-based processing
- `service-host/src/services/caps.ts` — addDiscount() method with durable DB persistence
- `service-host/src/services/payment-controller.ts` — processTerminalSession(), processPendingSessions(), poll worker with atomic claiming
- `electron/electron-builder.json` — Version bump to 3.1.58

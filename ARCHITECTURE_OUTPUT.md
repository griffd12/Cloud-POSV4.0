# Cloud POS v3.1 — Architecture Verification Output (CORRECTED)
**Generated from codebase analysis — not theoretical**

---

## FUNDAMENTAL REQUIREMENTS

**R1: The store must be able to run a full shift with zero internet as long as CAPS is available.**
All employee authentication, check operations, item management, payments, KDS ticket flow, and printing operate exclusively through the local CAPS service host. Cloud connectivity is only required for: (a) initial device activation/setup, (b) EMC configuration sync (background, non-blocking), and (c) transaction upload to corporate (background, queued). A store can open, serve customers for an entire shift, close checks, print receipts, and process payments with zero internet — as long as the CAPS SQLite database is healthy.

**R2: After initial setup/activation, KDS must not require cloud to boot or operate. It must load device identity locally and run from CAPS only.**
KDS device identity (deviceId, deviceName, mode=kds) is persisted in local `settings.json` after first activation. On every subsequent boot, `loadConfig()` reads identity locally with no cloud call. The `pollCapsReady()` loop targets the local/LAN CAPS service host — never the cloud. `fetchActivationConfig()` runs in the background and falls back to cached settings.json on failure. KDS boots to functional YELLOW state from CAPS alone.

**R3: Employee sign-in during store operations is CAPS/local only.**
Cloud login exists only for setup, admin, and device activation. During store operations, employees authenticate via `POST /auth/pin` on CAPS, which validates against the local SQLite employees table (synced from cloud during config sync). No cloud call is made during runtime employee authentication. The response includes `offlineAuth: true`.

**R4: GREEN and YELLOW are identical for all live POS/KDS routes.**
GREEN (cloud + CAPS reachable) and YELLOW (CAPS only, cloud down) differ ONLY in:
- Connection banner color/text
- `cloudReachable` status flag
- Background config sync (cloud→CAPS pull disabled in YELLOW)
- Transaction upload to cloud (queued, retried when cloud returns)

They are IDENTICAL for: transaction routing, check authority, payment processing, KDS ticket flow, WebSocket connections, check locking, employee auth, menu data access, option-bit enforcement, and all POS operations.

---

## 1) BOOT FLOW DIAGRAMS

### A. CAPS Host Workstation Boot
```
app.whenReady()
    │
    ├─ ensureDirectories()              — Create log/data dirs
    ├─ parseArgs()                      — --mode=pos, --kiosk, etc.
    ├─ loadConfig()                     — Read settings.json (LOCAL, no cloud)
    ├─ setupIpcHandlers()               — Electron ↔ Renderer IPC channels
    ├─ registerProtocolInterceptor()    — ALL https:// /api/ → CAPS. No cloud fallback.
    │
    ├─ [setupComplete?]
    │   ├── YES ─┐
    │   │        ├─ createWindow()          — Launch browser window immediately
    │   │        ├─ initOfflineDbEarly()     — Local SQLite cache
    │   │        │
    │   │        ├─ capsBootStage = 'connecting'
    │   │        │   └── UI: Full-screen "Starting Up" overlay (z-9998, blocks all interaction)
    │   │        │
    │   │        ├─ startServiceHost()       — fork(service-host-embedded.cjs)
    │   │        │   ├── Spawns child process on port 3001
    │   │        │   └── Service-Host internally:
    │   │        │       ├── Opens SQLite (service-host.db)
    │   │        │       ├── ConfigSync.syncFull() from cloud (background, non-blocking on failure)
    │   │        │       ├── Starts TransactionSync worker
    │   │        │       ├── Starts WebSocket server (/ws)
    │   │        │       └── /health/ready → status: 'ready'
    │   │        │
    │   │        ├─ pollCapsReady()          — Loop: GET http://127.0.0.1:3001/health/ready
    │   │        │   ├── 'loading-config' → capsBootStage = 'loading-config'
    │   │        │   ├── 'ready' → RESOLVE
    │   │        │   └── Fail → retry (1s → 2s → 5s backoff)
    │   │        │
    │   │        ├─ [CAPS ready] ─────────────────────────────────┐
    │   │        │   ├─ capsBootStage = 'ready'                   │
    │   │        │   ├─ setConnectionMode('yellow')    ◄──────────┘
    │   │        │   │   UI: Boot overlay DISMISSED — POS is usable
    │   │        │   │
    │   │        │   ├─ checkConnectivity()  — Background cloud probe
    │   │        │   │   ├── Cloud healthy → YELLOW → GREEN (banner only, no routing change)
    │   │        │   │   └── Cloud down → stays YELLOW (POS fully operational)
    │   │        │   │
    │   │        │   └─ initAllServices() (background)
    │   │        │       ├── initPrintAgent()
    │   │        │       ├── scheduleConnectivityCheck() (15s/8s)
    │   │        │       ├── startBackgroundSyncWorker() (5s)
    │   │        │       └── fetchActivationConfig() (non-blocking, falls back to cache)
    │   │        │
    │   │        └─ *** POS READY — employee enters PIN against CAPS, starts transacting ***
    │   │
    │   └── NO ──── Show Setup Wizard (CAL enrollment — cloud required ONE TIME ONLY)
    │
    └─ Bootstrap Watchdog: 10s timer
        └── If React doesn't signal ready → auto-reload (max 2x)
```

### B. Non-CAPS Workstation Boot (Remote Terminal)
```
app.whenReady()
    │
    ├─ loadConfig()                     — Read settings.json (LOCAL — has remote serviceHostUrl)
    ├─ registerProtocolInterceptor()    — ALL /api/ → remote CAPS (e.g. 192.168.1.50:3001)
    ├─ createWindow()                   — Launch UI immediately
    ├─ initOfflineDbEarly()             — Local cache DB only
    │
    ├─ capsBootStage = 'connecting'
    │   └── UI: "Starting Up" overlay
    │
    ├─ pollCapsReady()                  — GET http://<LAN-IP>:3001/health/ready (NO CLOUD)
    │
    ├─ [CAPS ready]
    │   ├─ setConnectionMode('yellow') — POS usable immediately
    │   ├─ checkConnectivity()          — Background cloud probe (GREEN = banner change only)
    │   └─ initAllServices()
    │       ├── startServiceHost() → SKIPPED (isCapsWorkstation = false)
    │       └── Everything else same as CAPS host
    │
    └─ *** POS READY — identical capabilities, remote CAPS authority ***

    KEY DIFFERENCE: Does NOT fork service-host-embedded.cjs.
    All API calls go to remote CAPS over LAN.
    Identical POS behavior in GREEN and YELLOW.
```

### C. KDS Device Boot
```
app.whenReady()
    │
    ├─ parseArgs()                      — --mode=kds detected
    ├─ appMode = 'kds'
    ├─ loadConfig()                     — Read settings.json (LOCAL — deviceId, mode, serviceHostUrl)
    │   └── NO CLOUD CALL. Identity fully resolved from local file.
    ├─ registerProtocolInterceptor()    — ALL /api/ → CAPS
    ├─ createWindow()
    │   ├── Window title: "Cloud POS - Kitchen Display"
    │   └── startPath = '/kds'
    │
    ├─ pollCapsReady()                  — GET CAPS /health/ready (NO CLOUD)
    │
    ├─ [CAPS ready]
    │   ├─ setConnectionMode('yellow') — KDS usable immediately
    │   ├─ WebSocket connect to CAPS /ws
    │   │   └── Subscribes to: KDS_TICKET_CREATE, KDS_TICKET_UPDATE, KDS_BUMP
    │   └─ GET /kds-tickets → load active tickets from CAPS
    │
    └─ *** KDS READY — displays kitchen tickets, no cloud required ***

    REQUIREMENTS MET:
    ✓ Device identity loaded from local settings.json (no cloud)
    ✓ Boot targets CAPS only (no cloud endpoint in boot path)
    ✓ fetchActivationConfig is background + fallback to cache
    ✓ All ticket operations go through CAPS
    ✓ GREEN/YELLOW identical for KDS operations
```

---

## 2) NORMALIZED ROUTE MAP

Every client API call goes through the Electron protocol interceptor, which rewrites certain paths and forwards ALL requests to CAPS. No request reaches the cloud during runtime.

### Interceptor Rewrite Rules
```
/api/check-items/*           → /api/caps/check-items/*
/api/check-payments/*        → /api/caps/check-payments/*
/api/check-discounts/*       → /api/caps/check-discounts/*
/api/check-service-charges/* → /api/caps/check-service-charges/*
/api/checks/*                → /api/caps/checks/*
/api/payments/*              → /api/caps/payments/*
/api/refunds/*               → /api/caps/refunds/*
All other /api/* paths       → passed through unchanged to CAPS
```

### Complete Route Map

| CLIENT ROUTE | INTERCEPTOR TARGET | CAPS HANDLER |
|---|---|---|
| **CHECK LIFECYCLE** | | |
| `POST /api/checks` | `/api/caps/checks` | `CapsService.createCheck()` |
| `GET /api/checks` | `/api/caps/checks` | `CapsService.getChecks()` |
| `GET /api/checks/orders` | `/api/caps/checks/orders` | `CapsService.getOpenChecks()` by RVC |
| `GET /api/checks/open` | `/api/caps/checks/open` → shared handler | Open checks query |
| `GET /api/checks/:id` | `/api/caps/checks/:id` | `CapsService.getCheck()` with items/payments |
| `GET /api/checks/:id/full-details` | `/api/caps/checks/:id/full-details` | Full check with all relations |
| `POST /api/checks/:id/items` | `/api/caps/checks/:id/items` | `CapsService.addItems()` |
| `POST /api/checks/:id/send` | `/api/caps/checks/:id/send` | `CapsService.sendToKitchen()` + KDS tickets |
| `POST /api/checks/:id/pay` | `/api/caps/checks/:id/pay` | `CapsService.addPayment()` + auto-close |
| `POST /api/checks/:id/payments` | `/api/caps/checks/:id/payments` | Same as pay |
| `POST /api/checks/:id/close` | `/api/caps/checks/:id/close` | `CapsService.closeCheck()` |
| `POST /api/checks/:id/void` | `/api/caps/checks/:id/void` | `checkOptionBit('allow_voids')` + void |
| `POST /api/checks/:id/reopen` | `/api/caps/checks/:id/reopen` → shared handler | `checkOptionBit('allow_reopen')` |
| `POST /api/checks/:id/transfer` | `/api/caps/checks/:id/transfer` → shared handler | `checkOptionBit('allow_transfer')` |
| `POST /api/checks/:id/split` | `/api/caps/checks/:id/split` → shared handler | `checkOptionBit('allow_split')` |
| `POST /api/checks/merge` | `/api/caps/checks/merge` → shared handler | `checkOptionBit('allow_merge')` |
| `POST /api/checks/:id/cancel-transaction` | `/api/caps/checks/:id/cancel-transaction` | Cancel in-progress txn |
| `POST /api/checks/:id/discount` | `/api/caps/checks/:id/discount` → shared handler | `checkOptionBit('allow_discounts')` |
| `POST /api/checks/:id/print` | `/api/caps/checks/:id/print` → shared handler | Route to print agent |
| `PATCH /api/checks/:id` | `/api/caps/checks/:id` | Update check metadata |
| **CHECK LOCKING** | | |
| `POST /api/checks/:id/lock` | `/api/caps/checks/:id/lock` | Acquire concurrency lock |
| `GET /api/checks/:id/lock` | `/api/caps/checks/:id/lock` | Check lock status |
| `POST /api/checks/:id/unlock` | `/api/caps/checks/:id/unlock` | Release lock |
| `POST /api/checks/:id/lock/refresh` | `/api/caps/checks/:id/lock/refresh` | Extend lock TTL |
| `GET /api/checks/locks` | `/api/caps/checks/locks` | List all active locks |
| **ITEM OPERATIONS** | | |
| `POST /api/check-items/:id/void` | `/api/caps/check-items/:id/void` | `checkOptionBit('allow_voids')` + `checkPrivilege` |
| `POST /api/check-items/:id/discount` | `/api/caps/check-items/:id/discount` | `checkOptionBit('allow_discounts')` |
| `POST /api/check-items/:id/price-override` | `/api/caps/check-items/:id/price-override` → shared handler | `checkOptionBit('allow_price_override')` |
| `PATCH /api/check-items/:id/modifiers` | `/api/caps/check-items/:id/modifiers` | Update modifiers on item |
| `DELETE /api/check-items/:id` | `/api/caps/check-items/:id` | Remove unsent item |
| `DELETE /api/check-items/:id/discount` | `/api/caps/check-items/:id/discount` → shared handler | Remove item discount |
| **PAYMENT OPERATIONS** | | |
| `POST /api/payments` | `/api/caps/payments` | Record payment |
| `GET /api/payments/:checkId` | `/api/caps/payments/:checkId` | List payments for check |
| `PATCH /api/check-payments/:id/void` | `/api/caps/check-payments/:id/void` | `checkOptionBit('allow_voids')` |
| `PATCH /api/check-payments/:id/restore` | `/api/caps/check-payments/:id/restore` | Restore voided payment |
| **SERVICE CHARGES** | | |
| `GET /api/checks/:id/service-charges` | `/api/caps/checks/:id/service-charges` | List check service charges |
| `POST /api/checks/:id/service-charges` | `/api/caps/checks/:id/service-charges` | Add service charge |
| `POST /api/check-service-charges/:id/void` | `/api/check-service-charges/:id/void` | Void service charge |
| **DISCOUNTS** | | |
| `GET /api/checks/:id/discounts` | `/api/caps/checks/:id/discounts` | List check discounts |
| `DELETE /api/check-discounts/:id` | `/api/caps/check-discounts/:id` | Remove check discount |
| **REFUNDS** | | |
| `POST /api/refunds` | `/api/caps/refunds` | `checkOptionBit('allow_refunds')` |
| `GET /api/refunds/:id` | `/api/caps/refunds/:id` | Get refund details |
| `GET /api/rvcs/:id/closed-checks` | `/api/rvcs/:id/closed-checks` | Closed checks for refund lookup |
| `GET /api/rvcs/:id/refunds` | `/api/rvcs/:id/refunds` | Refund history |
| **KDS** | | |
| `GET /api/kds-tickets` | `/api/kds-tickets` | Active KDS tickets |
| `GET /api/kds-tickets/bumped` | `/api/kds-tickets/bumped` | Recalled bumped tickets |
| `GET /api/kds-tickets/:id` | `/api/kds-tickets/:id` | Single ticket |
| `POST /api/kds-tickets/:id/bump` | `/api/kds-tickets/:id/bump` | Bump ticket |
| `POST /api/kds-tickets/:id/recall` | `/api/kds-tickets/:id/recall` | Recall bumped ticket |
| `POST /api/kds-tickets/bump-all` | `/api/kds-tickets/bump-all` | Bump all tickets |
| `GET /api/kds/tickets` | `/api/kds/tickets` | Alt KDS ticket endpoint |
| `POST /api/kds/tickets/:id/bump` | `/api/kds/tickets/:id/bump` | Alt bump endpoint |
| `GET /api/kds-devices` | `/api/kds-devices` | List KDS devices |
| `GET /api/kds-devices/active` | `/api/kds-devices/active` | Active KDS devices |
| `GET /api/kds-devices/:id` | `/api/kds-devices/:id` | Single KDS device |
| **PRINTING** | | |
| `POST /api/print-jobs` | `/api/print-jobs` | Submit print job |
| `POST /api/print/jobs` | `/api/print/jobs` | Alt print endpoint |
| `GET /api/print/jobs/:id` | `/api/print/jobs/:id` | Print job status |
| **EMPLOYEE AUTH (CAPS-ONLY AT RUNTIME)** | | |
| `POST /api/auth/pin` | `/api/auth/pin` | Local SQLite employee PIN validation |
| `POST /api/auth/login` | `/api/auth/login` | Local SQLite employee validation |
| `GET /api/auth/offline-employees` | `/api/auth/offline-employees` | Cached employee list |
| `POST /api/auth/manager-approval` | `/api/auth/manager-approval` | Manager privilege check (local) |
| **MENU & CONFIG (local cache from EMC sync)** | | |
| `GET /api/menu-items` | `/api/menu-items` | Local cached menu |
| `GET /api/menu-items/:id` | `/api/menu-items/:id` | Single menu item |
| `GET /api/slus` | `/api/slus` | Screen lookup units |
| `GET /api/slus/:id/items` | `/api/slus/:id/items` | SLU items |
| `GET /api/modifier-groups` | `/api/modifier-groups` | Modifier groups |
| `GET /api/modifiers` | `/api/modifiers` | Modifiers |
| `GET /api/tenders` | `/api/tenders` | Tender types |
| `GET /api/tender-types` | `/api/tender-types` | Alt tender endpoint |
| `GET /api/discounts` | `/api/discounts` | Discount definitions |
| `GET /api/service-charges` | `/api/service-charges` | Service charge defs |
| `GET /api/tax-rates` | `/api/tax-rates` | Tax rates |
| `GET /api/tax-groups` | `/api/tax-groups` | Tax groups |
| `GET /api/order-types` | `/api/order-types` | Order types |
| `GET /api/major-groups` | `/api/major-groups` | Major groups |
| `GET /api/family-groups` | `/api/family-groups` | Family groups |
| `GET /api/print-classes` | `/api/print-classes` | Print classes |
| `GET /api/roles` | `/api/roles` | Employee roles |
| `GET /api/job-codes` | `/api/job-codes` | Job codes |
| `GET /api/break-rules` | `/api/break-rules` | Break rules |
| `GET /api/option-flags` | `/api/option-flags` | Option bit flags |
| `GET /api/properties` | `/api/properties` | Properties |
| `GET /api/rvcs` | `/api/rvcs` | Revenue centers |
| `GET /api/rvcs/:id` | `/api/rvcs/:id` | Single RVC |
| `GET /api/revenue-centers` | `/api/revenue-centers` | Alt RVC endpoint |
| `GET /api/employees` | `/api/employees` | Employee list |
| `GET /api/employees/:id` | `/api/employees/:id` | Single employee |
| `GET /api/workstations` | `/api/workstations` | Workstation list |
| `GET /api/workstations/:id/context` | `/api/workstations/:id/context` | WS context (RVC, property, layout) |
| `GET /api/printers` | `/api/printers` | Printer list |
| `GET /api/order-devices` | `/api/order-devices` | Order devices |
| `GET /api/terminal-devices` | `/api/terminal-devices` | Terminal devices |
| `GET /api/pos-layouts/default/:rvcId` | `/api/pos-layouts/default/:rvcId` | Default POS layout |
| `GET /api/pos-layouts/:id/cells` | `/api/pos-layouts/:id/cells` | Layout cells |
| `GET /api/item-availability` | `/api/item-availability` | Item availability (86'd) |
| `POST /api/item-availability/decrement` | `/api/item-availability/decrement` | Decrement count |
| `POST /api/item-availability/increment` | `/api/item-availability/increment` | Increment count |
| **OPTION-BIT & PRIVILEGE CONFIG** | | |
| `GET /api/config/workstation-options` | `/api/config/workstation-options` | Option bits for UI gating |
| **POS OPERATIONS** | | |
| `POST /api/pos/checks/:id/customer` | `/api/pos/checks/:id/customer` | Attach customer to check |
| `DELETE /api/pos/checks/:id/customer` | `/api/pos/checks/:id/customer` | Remove customer |
| `POST /api/pos/capture-with-tip` | `/api/pos/capture-with-tip` | Tip capture |
| `POST /api/pos/process-card-payment` | `/api/pos/process-card-payment` | Card payment |
| `POST /api/pos/gift-cards/redeem` | `/api/pos/gift-cards/redeem` | Gift card redemption |
| `GET /api/pos/customers/search` | `/api/pos/customers/search` | Customer search |
| `GET /api/pos/customers/:id` | `/api/pos/customers/:id` | Customer details |
| `POST /api/pos/customers/:id/add-points` | `/api/pos/customers/:id/add-points` | Add loyalty points |
| `POST /api/pos/loyalty/earn` | `/api/pos/loyalty/earn` | Earn loyalty |
| `POST /api/pos/loyalty/enroll` | `/api/pos/loyalty/enroll` | Enroll in loyalty |
| `GET /api/pos/checks/:id/reorder/:custId` | `/api/pos/checks/:id/reorder/:custId` | Reorder from history |
| `GET /api/pos/system-status` | `/api/pos/system-status` | System status |
| `GET /api/pos/reports/:reportType` | `/api/pos/reports/:reportType` | Local reports |
| **LOYALTY** | | |
| `GET /api/loyalty-members/phone/:phone` | `/api/loyalty-members/phone/:phone` | Lookup by phone |
| `GET /api/loyalty-members/:id` | `/api/loyalty-members/:id` | Member details |
| `GET /api/loyalty/programs` | `/api/loyalty/programs` | Program list |
| `GET /api/loyalty/programs/:id` | `/api/loyalty/programs/:id` | Program details |
| **PAYMENT GATEWAY** | | |
| `POST /api/payment/authorize` | `/api/payment/authorize` | Authorize payment |
| `POST /api/payment/:id/capture` | `/api/payment/:id/capture` | Capture authorized |
| `POST /api/payment/:id/void` | `/api/payment/:id/void` | Void payment |
| `POST /api/payment/:id/refund` | `/api/payment/:id/refund` | Refund payment |
| `GET /api/payment/:id` | `/api/payment/:id` | Payment status |
| `GET /api/payment-processors` | `/api/payment-processors` | Processor list |
| `GET /api/payment-processors/:id` | `/api/payment-processors/:id` | Processor details |
| **LABOR** | | |
| `GET /api/time-punches/status` | `/api/time-punches/status` | Clock-in status |
| `GET /api/time-punches/status/:id` | `/api/time-punches/status/:id` | Employee clock status |
| **SYSTEM** | | |
| `GET /api/system-status` | `/api/system-status` | System status |
| `POST /api/system-status/workstation/heartbeat` | `/api/system-status/workstation/heartbeat` | WS heartbeat |
| `POST /api/registered-devices/heartbeat` | `/api/registered-devices/heartbeat` | Device heartbeat |
| `POST /api/cash-drawer-kick` | `/api/cash-drawer-kick` | Cash drawer kick |
| `GET /api/client-ip` | `/api/client-ip` | Client IP |
| **SYNC (background only, no runtime dependency)** | | |
| `GET /api/sync/status` | `/api/sync/status` | Config + txn sync health |
| `GET /api/sync/journal-stats` | `/api/sync/journal-stats` | Journal stats |
| `POST /api/sync/full` | `/api/sync/full` | Trigger full config re-sync |
| `POST /api/sync/delta` | `/api/sync/delta` | Trigger incremental sync |
| `POST /api/sync/auto/start` | `/api/sync/auto/start` | Start auto-sync timer |
| `POST /api/sync/auto/stop` | `/api/sync/auto/stop` | Stop auto-sync timer |
| **SYNC-NOTIFICATION STUBS** | | |
| `GET /api/sync-notifications` | `/api/sync-notifications` | Returns [] (stub) |
| `GET /api/sync-notifications/unread-count` | `/api/sync-notifications/unread-count` | Returns {count:0} |
| `POST /api/sync-notifications/:id/read` | `/api/sync-notifications/:id/read` | Returns success |
| `POST /api/sync-notifications/mark-all-read` | `/api/sync-notifications/mark-all-read` | Returns success |
| `DELETE /api/sync-notifications/:id` | `/api/sync-notifications/:id` | Returns success |
| `DELETE /api/sync-notifications` | `/api/sync-notifications` | Returns success |
| **HEALTH (CAPS probes only, cloud probe is background)** | | |
| `GET /api/health` | `/api/health` | CAPS health |
| `GET /health/ready` | `/health/ready` | CAPS readiness (db+config+ws+devices) |
| **FISCAL** | | |
| `GET /api/fiscal/periods` | `/api/fiscal/periods` | Fiscal period list |
| `GET /api/fiscal/periods/active` | `/api/fiscal/periods/active` | Active period |
| `GET /api/fiscal/periods/:id` | `/api/fiscal/periods/:id` | Single period |
| **REPORTS** | | |
| `GET /api/caps/reports/daily-summary` | `/api/caps/reports/daily-summary` | Local daily summary |

---

## 3) DEVICE LIFECYCLE TABLE

| STEP | WS (POS) BEHAVIOR | KDS BEHAVIOR | CAPS RESPONSIBILITY | CLOUD RESPONSIBILITY |
|------|-------------------|--------------|---------------------|---------------------|
| **1. First Boot** | Shows Setup Wizard (CAL enrollment) | Shows Setup Wizard (KDS mode) | Not yet running | Validates activation token, links device — ONE TIME ONLY |
| **2. Config Saved** | Saves deviceId, deviceName, serviceHostUrl, setupComplete=true to settings.json | Same — saves with mode=kds | Not involved | Not involved |
| **3. Subsequent Boot** | loadConfig() from LOCAL settings.json — cloud NOT needed | Same — LOCAL identity, --mode=kds | Not yet running | NOT REQUIRED |
| **4. Service Host Spawn** | If isCapsWorkstation: fork(service-host-embedded.cjs). If not: SKIP | Always SKIP (connects to remote CAPS) | Initializes SQLite, Express + WebSocket | Not involved |
| **5. Config Sync** | Waits for CAPS /health/ready | Waits for CAPS /health/ready | ConfigSync.syncFull() pulls config from cloud if available. Runs on cached data if cloud is down | Serves /sync/config/full and /delta if reachable |
| **6. CAPS Ready** | capsBootStage='ready', mode→YELLOW, overlay dismissed | Same — overlay dismissed, /kds loads | Reports status:'ready' on /health/ready | Not involved |
| **7. Cloud Probe** | Background: if cloud healthy → YELLOW→GREEN (banner change ONLY) | Same — banner change ONLY | Not involved | Responds to /api/health/db-probe |
| **8. Employee Auth** | PIN → POST /auth/pin → CAPS validates against LOCAL employees table. offlineAuth:true | No auth needed (auto-display) | Validates PIN locally. Returns employee + privileges. NO CLOUD CALL | Employee data synced during config sync (background) |
| **9. Check Creation** | POST /caps/checks → CAPS creates check in SQLite, assigns check_number | Not involved | Creates check, assigns txn_group_id, writes journal | NOT INVOLVED |
| **10. Add Items** | POST /caps/checks/:id/items → CAPS SQLite | Not involved | Validates item, calculates price/tax, writes journal | NOT INVOLVED |
| **11. Send to Kitchen** | POST /caps/checks/:id/send → KDS ticket creation | WebSocket receives KDS_TICKET_CREATE | Creates kds_ticket, broadcasts via WebSocket | NOT INVOLVED |
| **12. KDS Bump** | Not involved | POST /kds/tickets/:id/bump | Updates ticket, broadcasts KDS_BUMP | NOT INVOLVED |
| **13. Payment** | POST /caps/checks/:id/pay → payment recorded, auto-close if balanced | Not involved | Creates check_payment, writes journal, queues for sync | NOT INVOLVED in real-time |
| **14. Check Close** | UI updates — check moves to closed list | Not involved | Marks closed, final journal entry, enqueues TransactionSync | NOT INVOLVED in real-time |
| **15. Transaction Sync** | Shows pending sync count in banner | Not involved | TransactionSync worker (5s) batches → POST /sync/transactions to cloud. Circuit breaker: 5 failures → 60s cooldown | Receives batch, returns acknowledged/skipped. CAPS marks synced |
| **16. Cloud Down** | YELLOW — full POS operation continues. "Cloud Offline" banner only | YELLOW — KDS fully functional | Queues all transactions locally. No data loss | Unavailable — transactions queue at CAPS |
| **17. Cloud Restore** | YELLOW → GREEN (banner change only). Pending sync drains | Same — GREEN banner | TransactionSync drains queue. Dedupes via UUID eventIds | Receives backlog, dedupes, acknowledges |
| **18. CAPS Down** | RED. Full-screen "Store Server Unreachable" overlay. ALL API calls return 503. HARD FAIL | Same — RED overlay. HARD FAIL | UNAVAILABLE | Irrelevant — WS/KDS cannot operate without CAPS |
| **19. CAPS Restore** | RED → YELLOW on first successful CAPS response. Cloud probe → GREEN if healthy | Same — overlay dismissed | Resumes. SQLite intact, no data loss | Resumes receiving synced transactions |

---

## 4) PHASE-BY-PHASE IMPLEMENTATION PLAN

| PHASE | FILES | ROOT CAUSE | FIX | TEST TO PROVE |
|-------|-------|-----------|-----|---------------|
| **Phase 1: Auth/Bootstrap** | `service-host/src/index.ts`, `electron/main.cjs`, `client/src/contexts/connection-mode-context.tsx`, `client/src/components/connection-mode-banner.tsx` | Startup race: UI loaded before CAPS ready. Missing auth headers on LAN requests (401s). No readiness signal from service-host | `/health/ready` with 4 readiness flags. `pollCapsReady()` loop. Protocol interceptor injects x-workstation-token + Authorization headers. Blue boot overlay blocks UI until CAPS ready | Boot app → overlay blocks until CAPS ready. No 401s. POS screen appears only after CAPS reports ready |
| **Phase 2: Menu/Config** | `service-host/src/routes/api.ts`, `service-host/src/db/database.ts` | Broken modifier loading (`sort_order` vs `display_order`). Missing KDS device routes. Incomplete workstation context (RVC/property/layout) | Fixed SQL column. Added KDS device routes. Enriched /workstations/:id/context with full property, enterprise, layout from SQLite | Modifiers load correctly. KDS devices populate. Workstation context returns RVC name, property, layout |
| **Phase 3: Core POS** | `electron/main.cjs`, `service-host/src/routes/api.ts`, `client/src/contexts/connection-mode-context.tsx` | Split-brain: WS fell back to cloud on CAPS 404. Check operations not consistently routed through CAPS. capsBootStage dropped by applyConnectionMode | ALL /api/ → CAPS exclusively. Hard 503 on CAPS unreachable. 18 POS handlers added. Fixed state spread for capsBootStage. GREEN/YELLOW identical for all routing | Disconnect cloud → all check ops work. No cloud URLs in network tab. GREEN↔YELLOW has zero routing difference |
| **Phase 4: KDS Runtime** | `client/src/pages/kds.tsx`, `client/src/hooks/use-pos-websocket.ts`, `service-host/src/services/kds-controller.ts`, `service-host/src/routes/api.ts` | WebSocket path mismatch (/ws/kds vs /ws). Duplicate KDS tickets on re-send. NOT NULL violations on check_number | Standardized WebSocket to /ws. Fixed send to capture only unsent items. Null-safety for check_number/round_number. /kds-tickets/bumped for recall | Send → single KDS ticket (no dupes). Bump → disappears. Recall → bumped tickets visible. WebSocket reconnects cleanly |
| **Phase 5: Print/Devices** | `electron/print-agent-service.cjs`, `service-host/src/index.ts`, `print-agent/print-agent.js` | Print agent WebSocket path mismatch. CAPS lacked print agent protocol handlers (HELLO/HEARTBEAT/JOB_RESULT) | Aligned print agent WebSocket to /ws. Added printAgentClients Map. HELLO→AUTH_OK handshake. HEARTBEAT keepalive. Print job routing through CAPS | Send to printer → job routes through CAPS → receipt prints. Agent reconnects after disconnect |
| **Phase 6: Privileges/Option-Bits** | `service-host/src/routes/api.ts`, `client/src/pages/pos.tsx` | Privilege checks UI-only (API bypass possible). Option-bits not enforced by CAPS. checkOptionBit() calls had undefined scope | `checkOptionBit()` with resolveCheckScope/resolveItemScope/resolvePaymentScope. `checkPrivilege()` for employee auth. /config/workstation-options. Fail-closed defaults | Void without privilege → 403 from CAPS. Disable allow_voids → API rejects AND UI hides. Manager PIN override works |
| **Phase 7: Sync/Cloud** | `service-host/src/routes/api.ts`, `electron/main.cjs`, `electron/offline-api-interceptor.cjs`, `client/src/hooks/use-pos-websocket.ts`, `client/src/hooks/use-check-lock.ts`, `client/src/contexts/connection-mode-context.tsx` | Sync-notification 404 spam. False GREEN during cloud outage. Sync queue bloat from duplicate check-state. GREEN/YELLOW had different WebSocket reconnect timing and check-lock routing. Dead offline handler code (2288 lines) | Sync-notification stubs. CAPS success → YELLOW only (cloud probe for GREEN). Sync queue deduplication. Normalized WebSocket/check-lock to be mode-agnostic. Removed dead offline handlers. Fixed serviceHostReachable flag for GREEN+YELLOW | Cloud down → YELLOW (not GREEN). No 404 spam. Replay check-state 5x → single queue entry. WebSocket reconnect identical in GREEN/YELLOW. Check locks route same path regardless of mode |

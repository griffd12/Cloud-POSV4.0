# Cloud POS v3.1 — Architecture Verification Output
**Generated from codebase analysis — not theoretical**

---

## 1) BOOT FLOW DIAGRAMS

### A. CAPS Host Workstation Boot
```
app.whenReady()
    │
    ├─ ensureDirectories()              — Create log/data dirs
    ├─ parseArgs()                      — --mode=pos, --kiosk, etc.
    ├─ loadConfig()                     — Read settings.json (local, no cloud)
    ├─ setupIpcHandlers()               — Electron ↔ Renderer IPC channels
    ├─ registerProtocolInterceptor()    — Intercept ALL https:// → route to CAPS
    │
    ├─ [setupComplete?]
    │   ├── YES ─┐
    │   │        ├─ createWindow()          — Launch browser window immediately
    │   │        ├─ initOfflineDbEarly()     — Local SQLite + OfflineApiInterceptor
    │   │        │
    │   │        ├─ capsBootStage = 'connecting'
    │   │        │   └── UI: Full-screen "Starting Up" overlay (z-9998)
    │   │        │
    │   │        ├─ startServiceHost()       — fork(service-host-embedded.cjs)
    │   │        │   ├── Spawns child process on port 3001
    │   │        │   ├── Env: SERVICE_HOST_PORT, DATA_DIR, TOKEN
    │   │        │   └── Service-Host internally:
    │   │        │       ├── Opens SQLite (service-host.db)
    │   │        │       ├── ConfigSync.syncFull() from cloud
    │   │        │       ├── Starts TransactionSync worker
    │   │        │       ├── Starts WebSocket server (/ws)
    │   │        │       └── /health/ready → status: 'ready'
    │   │        │
    │   │        ├─ pollCapsReady()          — Loop: GET /health/ready
    │   │        │   ├── 'loading-config' → capsBootStage = 'loading-config'
    │   │        │   ├── 'ready' → RESOLVE
    │   │        │   └── Fail → retry (1s/2s/5s backoff)
    │   │        │
    │   │        ├─ [CAPS ready] ─────────────────────────────────┐
    │   │        │   ├─ capsBootStage = 'ready'                   │
    │   │        │   ├─ setConnectionMode('yellow')    ◄──────────┘
    │   │        │   │   UI: Boot overlay DISMISSED
    │   │        │   │
    │   │        │   ├─ checkConnectivity()  — Probe cloud /api/health/db-probe
    │   │        │   │   ├── Cloud healthy + CAPS healthy → GREEN
    │   │        │   │   ├── Cloud down + CAPS healthy → YELLOW (POS works)
    │   │        │   │   └── Cloud healthy + CAPS down → RED (hard fail)
    │   │        │   │
    │   │        │   └─ initAllServices()
    │   │        │       ├── initPrintAgent()
    │   │        │       ├── scheduleConnectivityCheck() (15s/8s)
    │   │        │       ├── startBackgroundSyncWorker() (5s)
    │   │        │       └── fetchActivationConfig()
    │   │        │
    │   │        └─ *** POS READY — user can transact ***
    │   │
    │   └── NO ──── Show Setup Wizard (CAL enrollment)
    │
    └─ Bootstrap Watchdog: 10s timer
        └── If React doesn't signal ready → auto-reload (max 2x)
```

### B. Non-CAPS Workstation Boot (Remote Terminal)
```
app.whenReady()
    │
    ├─ loadConfig()                     — Read settings.json (has remote serviceHostUrl)
    ├─ registerProtocolInterceptor()    — ALL /api/ → remote CAPS (e.g. 192.168.1.50:3001)
    ├─ createWindow()                   — Launch UI immediately
    ├─ initOfflineDbEarly()             — Local cache DB only
    │
    ├─ capsBootStage = 'connecting'
    │   └── UI: "Starting Up" overlay
    │
    ├─ pollCapsReady()                  — GET ${remoteServiceHostUrl}/health/ready
    │   └── Same loop as CAPS host, but targeting REMOTE IP
    │
    ├─ [CAPS ready]
    │   ├─ setConnectionMode('yellow')
    │   ├─ checkConnectivity()          — Probe cloud for GREEN
    │   └─ initAllServices()
    │       ├── startServiceHost() → SKIPPED (isCapsWorkstation = false)
    │       └── Everything else same as CAPS host
    │
    └─ *** POS READY — same capabilities, remote CAPS authority ***

    KEY DIFFERENCE: Does NOT fork service-host-embedded.cjs.
    All API calls go to remote CAPS over LAN.
```

### C. KDS Device Boot
```
app.whenReady()
    │
    ├─ parseArgs()                      — --mode=kds detected
    ├─ appMode = 'kds'
    ├─ loadConfig()                     — Read settings.json
    ├─ registerProtocolInterceptor()    — ALL /api/ → CAPS
    ├─ createWindow()
    │   ├── Window title: "Cloud POS - Kitchen Display"
    │   └── startPath = '/kds' (not '/')
    │
    ├─ pollCapsReady()                  — Same CAPS readiness poll
    │
    ├─ [CAPS ready]
    │   ├─ setConnectionMode('yellow')
    │   ├─ WebSocket connect to CAPS /ws
    │   │   └── Subscribes to: KDS_TICKET_CREATE, KDS_TICKET_UPDATE, KDS_BUMP
    │   └─ GET /api/kds-tickets → load active tickets from CAPS
    │
    └─ *** KDS READY — displays kitchen tickets ***

    KEY DIFFERENCES:
    - Registers as kds-device (not workstation) with cloud
    - Auto-start with --mode=kds flag
    - No check creation — read-only + bump operations
    - WebSocket-driven real-time ticket updates
```

---

## 2) ROUTE OWNERSHIP TABLE

| ROUTE | OWNER | PURPOSE | STATUS |
|-------|-------|---------|--------|
| **CHECK OPERATIONS** | | | |
| `POST /caps/checks` | CAPS | Create new check | ENFORCED |
| `GET /caps/checks/orders` | CAPS | List open checks for RVC | ENFORCED |
| `GET /caps/checks/:id` | CAPS | Get single check with items/payments | ENFORCED |
| `POST /caps/checks/:id/items` | CAPS | Add items to check | ENFORCED |
| `POST /caps/checks/:id/send` | CAPS | Fire items to KDS/kitchen | ENFORCED |
| `POST /caps/checks/:id/pay` | CAPS | Apply payment, auto-close if balanced | ENFORCED |
| `POST /caps/checks/:id/void` | CAPS | Void entire check (option-bit gated) | ENFORCED |
| `POST /caps/checks/:id/lock` | CAPS | Concurrency lock for multi-WS | ENFORCED |
| `DELETE /caps/checks/:id/lock` | CAPS | Release check lock | ENFORCED |
| `POST /caps/checks/:id/reopen` | CAPS | Reopen closed check (option-bit gated) | ENFORCED |
| `POST /caps/checks/:id/transfer` | CAPS | Transfer check to employee (option-bit gated) | ENFORCED |
| `POST /caps/checks/:id/split` | CAPS | Split check (option-bit gated) | ENFORCED |
| `POST /caps/checks/merge` | CAPS | Merge checks (option-bit gated) | ENFORCED |
| **ITEM OPERATIONS** | | | |
| `POST /caps/check-items/:id/void` | CAPS | Void single item (option-bit + privilege) | ENFORCED |
| `POST /caps/check-items/:id/discount` | CAPS | Apply item discount (option-bit gated) | ENFORCED |
| `POST /caps/check-items/:id/price-override` | CAPS | Override price (option-bit gated) | ENFORCED |
| `DELETE /caps/check-items/:id` | CAPS | Remove unsent item | ENFORCED |
| **PAYMENT OPERATIONS** | | | |
| `POST /caps/payments` | CAPS | Record payment | ENFORCED |
| `POST /caps/payments/:id/void` | CAPS | Void payment (option-bit gated) | ENFORCED |
| `GET /caps/payments/:checkId` | CAPS | List payments for check | ENFORCED |
| **KDS** | | | |
| `GET /kds/tickets` | CAPS | Get active KDS tickets | ENFORCED |
| `POST /kds/tickets/:id/bump` | CAPS | Bump ticket (mark done) | ENFORCED |
| `GET /kds-tickets/bumped` | CAPS | Recall bumped tickets | ENFORCED |
| `GET /kds-devices/active` | CAPS | List active KDS devices | ENFORCED |
| **PRINTING** | | | |
| `POST /print/jobs` | CAPS | Submit print job to local agent | ENFORCED |
| `GET /print/jobs/:id` | CAPS | Check print job status | ENFORCED |
| **AUTH** | | | |
| `POST /auth/pin` | CAPS | Employee PIN auth (local SQLite) | ENFORCED |
| `GET /auth/offline-employees` | CAPS | Cached employee list for PIN auth | ENFORCED |
| `POST /auth/manager-approval` | CAPS | Manager override (local privilege check) | ENFORCED |
| `POST /api/auth/login` | CLOUD | Session creation (cloud accounts) | ENFORCED |
| **CONFIG (downstream from EMC)** | | | |
| `GET /config/menu-items` | CAPS | Local cached menu items | ENFORCED |
| `GET /config/employees` | CAPS | Local cached employees | ENFORCED |
| `GET /config/pos-layout` | CAPS | Local cached POS layout | ENFORCED |
| `GET /config/workstation-options` | CAPS | Option-bit flags for UI gating | ENFORCED |
| `GET /config/tender-types` | CAPS | Local cached tender types | ENFORCED |
| `GET /api/menu-items` | CLOUD | Master menu (EMC source of truth) | ENFORCED |
| `GET /api/enterprises/*` | CLOUD | Enterprise hierarchy (EMC) | ENFORCED |
| **SYNC** | | | |
| `GET /sync/status` | CAPS | Config + transaction sync health | ENFORCED |
| `GET /sync/journal-stats` | CAPS | Journal entry counts, queue depth | ENFORCED |
| `POST /sync/full` | CAPS | Trigger full config re-sync from cloud | ENFORCED |
| `POST /sync/delta` | CAPS | Trigger incremental config sync | ENFORCED |
| `GET /api/sync/config/full` | CLOUD | Serve full config snapshot | ENFORCED |
| `GET /api/sync/config/delta` | CLOUD | Serve config changes since version N | ENFORCED |
| `POST /api/sync/transactions` | CLOUD | Receive transaction uploads from CAPS | ENFORCED |
| **SYNC-NOTIFICATION STUBS** | | | |
| `GET /sync-notifications` | CAPS | Returns [] (stub, prevents 404) | ENFORCED |
| `GET /sync-notifications/unread-count` | CAPS | Returns {count:0} (stub) | ENFORCED |
| `POST /sync-notifications/:id/read` | CAPS | Returns {success:true} (stub) | ENFORCED |
| `POST /sync-notifications/mark-all-read` | CAPS | Returns {success:true} (stub) | ENFORCED |
| `DELETE /sync-notifications/:id` | CAPS | Returns {success:true} (stub) | ENFORCED |
| `DELETE /sync-notifications` | CAPS | Returns {success:true} (stub) | ENFORCED |
| **REFUNDS** | | | |
| `POST /caps/refunds` | CAPS | Create refund check (option-bit gated) | ENFORCED |
| `GET /rvcs/:id/closed-checks` | CAPS | Closed checks for refund lookup | ENFORCED |
| `GET /rvcs/:id/refunds` | CAPS | Refund history for RVC | ENFORCED |
| **HEALTH** | | | |
| `/health/ready` | CAPS | Readiness probe (db+config+ws+devices) | ENFORCED |
| `/api/health` | CAPS | Basic health check | ENFORCED |
| `/api/health/db-probe` | CLOUD | Cloud DB connectivity probe | ENFORCED |
| **REPORTING** | | | |
| `GET /pos/reports/*` | CAPS | Local sales/labor reports | ENFORCED |
| `GET /api/reporting/*` | CLOUD | Enterprise-wide reporting | ENFORCED |

---

## 3) DEVICE LIFECYCLE TABLE

| STEP | WS (POS) BEHAVIOR | KDS BEHAVIOR | CAPS RESPONSIBILITY | CLOUD RESPONSIBILITY |
|------|-------------------|--------------|---------------------|---------------------|
| **1. First Boot** | Shows Setup Wizard (CAL enrollment) | Shows Setup Wizard (KDS mode) | Not yet running | Not involved until enrollment |
| **2. Device Registration** | Sends device_token + property_id to cloud | Registers as kds-device (not workstation) | Not involved (cloud-direct) | Validates token, links to configured WS/KDS entity, returns device_id |
| **3. Config Saved** | Saves deviceId, deviceName, serviceHostUrl, setupComplete=true to settings.json | Same — saves with mode=kds | Not involved | Not involved |
| **4. Subsequent Boot** | loadConfig() from local settings.json — no cloud needed | Same — plus --mode=kds flag | Not yet running | Not needed |
| **5. Service Host Spawn** | If isCapsWorkstation: fork(service-host-embedded.cjs) on port 3001. If not: SKIP | Always SKIP (connects to remote CAPS) | Initializes SQLite, starts Express + WebSocket server | Not involved |
| **6. Config Sync** | Waits for CAPS /health/ready | Waits for CAPS /health/ready | ConfigSync.syncFull() pulls all entities from cloud → local SQLite. Then delta sync every 120s | Serves /api/sync/config/full and /delta endpoints |
| **7. CAPS Ready** | capsBootStage='ready', mode→YELLOW, boot overlay dismissed | Same — overlay dismissed, loads /kds route | Reports status:'ready' on /health/ready | Not involved |
| **8. Cloud Probe** | checkConnectivity() → if cloud healthy: YELLOW→GREEN | Same — GREEN means full connectivity | Not involved | Responds to /api/health/db-probe |
| **9. Employee Auth** | Employee enters PIN → POST /auth/pin → CAPS validates against local employees table | No auth needed (auto-display mode) | Validates PIN against synced employee records in SQLite. Returns employee + privileges | Original employee data synced during config sync |
| **10. Check Creation** | POST /caps/checks → CAPS creates check in SQLite, assigns check_number from WS-specific range | Not involved | Creates check record, assigns txn_group_id, writes journal entry | Not involved — no cloud call |
| **11. Add Items** | POST /caps/checks/:id/items → items added to check in CAPS SQLite | Not involved | Validates menu item, calculates prices/tax, writes journal | Not involved |
| **12. Send to Kitchen** | POST /caps/checks/:id/send → triggers KDS ticket creation | WebSocket receives KDS_TICKET_CREATE, displays ticket on screen | Creates kds_ticket records, broadcasts via WebSocket to all KDS clients | Not involved |
| **13. KDS Bump** | Not involved | Staff taps "bump" → POST /kds/tickets/:id/bump | Updates ticket status, broadcasts KDS_BUMP via WebSocket | Not involved |
| **14. Payment** | POST /caps/checks/:id/pay → CAPS records payment, recalculates totals | Not involved | Creates check_payment record, auto-closes if balance=0, writes journal, queues for cloud sync | Not involved in real-time |
| **15. Check Close** | UI updates — check moves to closed list | Not involved | Marks check closed, writes final journal entry, enqueues TransactionSync | Not involved in real-time |
| **16. Transaction Sync** | Shows pending sync count in status bar | Not involved | TransactionSync worker (5s interval) batches unsent journals → POST /api/sync/transactions to cloud. Circuit breaker: 5 failures → 60s cooldown | Receives batch, returns acknowledged/skipped arrays. CAPS marks synced |
| **17. Cloud Down** | Mode stays YELLOW — full POS operation continues. Shows "Cloud Offline" banner | Same — KDS fully functional | Queues all transactions locally. Retries with exponential backoff + jitter. No data loss | Unavailable — transactions queue at CAPS |
| **18. Cloud Restore** | checkConnectivity() succeeds → YELLOW→GREEN. Pending sync drains | Same — GREEN restored | TransactionSync drains queue. Duplicate protection via UUID eventIds — cloud returns 'skipped' for already-synced | Receives backlog, dedupes via eventId, acknowledges |
| **19. CAPS Down** | Mode→RED. Full-screen "Store Server Unreachable" overlay. ALL API calls return 503 | Same — RED overlay, no ticket display | UNAVAILABLE | Still running but irrelevant — WS/KDS cannot operate |
| **20. CAPS Restore** | First successful CAPS response: RED→YELLOW. Cloud probe → GREEN if cloud healthy | Same — overlay dismissed, tickets reload | Resumes normal operation. SQLite intact, no data loss | Resumes receiving synced transactions |

---

## 4) PHASE-BY-PHASE IMPLEMENTATION PLAN

| PHASE | FILES | ROOT CAUSE | FIX | TEST TO PROVE |
|-------|-------|-----------|-----|---------------|
| **Phase 1: Auth/Bootstrap** | `service-host/src/index.ts`, `electron/main.cjs`, `client/src/contexts/connection-mode-context.tsx`, `client/src/components/connection-mode-banner.tsx` | Startup race: Electron loaded UI before CAPS was ready. Missing auth headers on LAN requests caused 401s. No readiness signal from service-host | Implemented `/health/ready` with 4 readiness flags (db, config, ws, deviceRegistry). Added pollCapsReady() loop in Electron. Protocol interceptor injects x-workstation-token + Authorization headers. Blue boot overlay blocks UI until CAPS ready | Boot app → blue "Starting Up" overlay visible until CAPS reports ready. No 401 errors in CAPS logs. POS screen only appears after overlay dismisses |
| **Phase 2: Menu/Config** | `service-host/src/routes/api.ts`, `service-host/src/db/database.ts` | Broken modifier loading: SQL used `mgm.sort_order` but column is `mgm.display_order`. Missing KDS device routes on CAPS. Workstation context endpoint returned incomplete RVC/property/layout data | Fixed SQL column name in modifier query. Added GET /kds-devices/active and GET /kds-devices/:id to CAPS. Enriched /workstations/:id/context to return full property, enterprise, layout from local SQLite | Open POS → modifier buttons load correctly on menu items. KDS device list populates. Workstation context includes RVC name, property, and layout assignment |
| **Phase 3: Core POS** | `electron/main.cjs`, `service-host/src/routes/api.ts`, `client/src/contexts/connection-mode-context.tsx` | Split-brain reads: WS silently fell back to cloud data on CAPS 404. Check operations (void, discount, send) not consistently routed through CAPS. applyConnectionMode dropped capsBootStage by not spreading prev state | Rewrote protocol interceptor: ALL /api/ → CAPS exclusively. Hard 503 on CAPS unreachable, zero cloud fallback. Added 18 POS route handlers to CAPS. Fixed state spread in applyConnectionMode to preserve capsBootStage | Disconnect cloud → all check operations still work via CAPS. No cloud URLs in network tab. capsBootStage persists through mode changes |
| **Phase 4: KDS Runtime** | `client/src/pages/kds.tsx`, `client/src/hooks/use-pos-websocket.ts`, `service-host/src/services/kds-controller.ts`, `service-host/src/routes/api.ts` | WebSocket path mismatch: KDS connected to /ws/kds but CAPS only listened on /ws. Duplicate KDS tickets on re-send. NOT NULL violations on check_number in ticket creation | Standardized WebSocket to /ws for POS and KDS. Fixed send logic to capture only unsent items before triggering KDS. Added null-safety for check_number/round_number in ticket creation. Added /kds-tickets/bumped for recall | Send items → single KDS ticket appears (no duplicates). Bump ticket → disappears. Recall → bumped tickets visible. WebSocket reconnects cleanly |
| **Phase 5: Print/Devices** | `electron/print-agent-service.cjs`, `service-host/src/index.ts`, `print-agent/print-agent.js` | Print agent WebSocket path mismatch (/ws/print-agents vs /ws). CAPS lacked print agent protocol handlers (HELLO/HEARTBEAT/JOB_RESULT) | Aligned print agent WebSocket to /ws. Added printAgentClients Map in CAPS WebSocket server. Implemented HELLO→AUTH_OK handshake and HEARTBEAT keepalive. Print job routing through CAPS to local agent | Send check to printer → print job created in CAPS → routed to print agent via WebSocket → receipt prints. Print agent reconnects after disconnect |
| **Phase 6: Privileges/Option-Bits** | `service-host/src/routes/api.ts`, `client/src/pages/pos.tsx` | Privilege checks were UI-only — API calls could bypass. Option-bits (allow_voids, allow_discounts) not enforced by CAPS. All 14+ checkOptionBit() calls passed undefined scope (RVC/property) | Implemented checkOptionBit() with resolveCheckScope/resolveItemScope/resolvePaymentScope helpers for proper RVC→Property→Enterprise hierarchy. Added checkPrivilege() for employee-level auth. Added /config/workstation-options endpoint. Fail-closed DEFAULT_PRIVILEGES | Try void without privilege → 403 from CAPS (not just UI block). Disable allow_voids option bit → void button hidden AND API rejects. Manager PIN override works for privileged operations |
| **Phase 7: Sync/Cloud** | `service-host/src/routes/api.ts`, `electron/main.cjs`, `electron/offline-api-interceptor.cjs` | Sync-notification 404 spam when client polled CAPS for cloud-only endpoints. False GREEN during cloud outage (CAPS success incorrectly set isOnline=true). Sync queue bloat from duplicate check-state replay entries. Dead offline handler code (2288 lines) could theoretically re-enable fake partial operation | Added 6 sync-notification stub routes to CAPS. Fixed connection mode: CAPS success → RED→YELLOW only, cloud probe required for GREEN. Added sync_queue deduplication (update existing vs insert duplicate). Removed 2288 lines of dead offline handler code. Enhanced /sync/status and /sync/journal-stats endpoints | Disconnect cloud → mode stays YELLOW (not GREEN). Sync notifications stop producing 404s. Replay check-state 5x → single queue entry (not 5). Reconnect cloud → pending transactions drain. /sync/status shows accurate config + transaction stats |

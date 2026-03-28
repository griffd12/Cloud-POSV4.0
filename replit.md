# Cloud POS System

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system designed for high-volume Quick Service Restaurants (QSRs). It provides a scalable solution with comprehensive administrative configuration and real-time operational features. Key capabilities include multi-property hierarchy support, KDS integration, fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. It features a Simphony-class design for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. The system supports both web and native applications (Android & Windows).

## User Preferences
Preferred communication style: Simple, everyday language.

### MANDATORY: Read This File First
Every session, before ANY work begins, read this ENTIRE file top to bottom. No exceptions. Do not start planning, coding, or responding to tasks until you have read and internalized every rule here.

### MANDATORY: Task Completion Pipeline
After EVERY completed task with code changes, perform ALL of the following steps as ONE atomic workflow. Do NOT wait to be asked. Do NOT skip any step. This is NON-NEGOTIABLE:
1. `git add -A && git commit` with a descriptive message
2. `git push origin main`
3. Bump version in ALL 3 files: `electron/build-info.json`, `electron/electron-builder.json`, `electron/service-host-embedded.cjs` (use `sed` for the .cjs file — NEVER read/write tools on that file)
4. Create `electron/RELEASE_NOTES_v{version}.md` with full details of all changes
5. Update `replit.md` with a version entry under Key Features
6. If schema changed, update `DATABASE_SCHEMA.md`
7. Commit and push the version bump + release notes
8. Create GitHub Release: `gh release create v{version} --title "v{version} — {summary}" --notes-file electron/RELEASE_NOTES_v{version}.md --target main`

These are NOT separate requests. This is how EVERY task ends. Period.

- **Database Schema Documentation**: The file `DATABASE_SCHEMA.md` in the project root is a living reference document that must be kept up to date whenever any database schema changes are made (new tables, columns, constraints, indexes, or relationship changes).
- **MANDATORY: System-Wide Thinking**: Every change, bug fix, or feature MUST be evaluated for its impact across the ENTIRE system — not just the immediate component. Before making any change, always ask and answer:
  1. **All device types**: Does this affect WS (POS terminals), KDS (kitchen displays), and any future device types?
  2. **All connection modes**: Does this work in GREEN (cloud), YELLOW (CAPS/service host), and RED (full offline) modes?
  3. **Multi-workstation**: Does this work when multiple workstations are connected? What about WS02+ connecting to CAPS over LAN?
  4. **All POS functions**: Beyond the immediate fix, what other operations could break? Check: login, ring items, modifiers, discounts, payments, voids, cancels, reopens, splits, merges, transfers, send-to-kitchen, KDS bump/recall, print, gift cards, loyalty, manager approvals, reports.
  5. **Logging**: Can we see what happened in the logs when something goes wrong? Every offline request must be logged with method, path, and response status.
  6. **Data sync**: When connectivity restores, will offline operations sync correctly to the cloud? Are they queued properly?
  7. **Error recovery**: What happens if this operation fails? Does the user see a clear error, or does the UI freeze/break silently?
Never fix a single symptom in isolation. Always trace the full impact chain.

## System Architecture

### ARCHITECTURE CONTRACT (NON-NEGOTIABLE)

**HYBRID POS with three layers: CLOUD → CAPS → WORKSTATION**

#### Layer Definitions:
1. **CLOUD** — Central master for configuration, reporting, and sync ingestion. Cloud is NOT the live runtime engine for ringing a sale.
2. **CAPS / SERVICE-HOST** — The LOCAL STORE CONTROLLER and STORE AUTHORITY. Owns the local SQLite operational database. Exposes local APIs for POS and KDS. Processes all live store operations locally. Journals all events locally. Syncs up to cloud when available. Syncs config down from cloud when available.
3. **WORKSTATIONS (WS)** — CLIENTS of CAPS. Talk to CAPS first, never directly to cloud for live FOH/KDS operations. Render UI only and send commands to CAPS. Do not own the store truth if CAPS is alive.

#### Non-Negotiable Rules:

**A) LOCAL-FIRST COMMIT** — All live POS and KDS actions must commit to CAPS local SQLite FIRST. Only after local commit succeeds can background sync happen.
**B) CLOUD NEVER IN BLOCKING WRITE PATH** — Correct: WS → CAPS → local SQLite commit → success returned to UI → background sync to cloud. NEVER: WS → cloud → maybe local later.
**C) MODE DEFINITIONS** — Based on REAL operational health, not just a ping:
- **GREEN**: CAPS reachable + local SQLite healthy + cloud sync probe succeeds
- **YELLOW**: CAPS reachable + local SQLite healthy + cloud sync unavailable/degraded. Store still fully operates locally.
- **RED**: CAPS unreachable OR local SQLite unhealthy. Workstation cannot trust store authority.
**D) PILOT FEATURE MATRIX** — When cloud is unavailable but CAPS is alive, these MUST still work: sign in, menu ordering, modifiers, check functions, payments, KDS, offline daily reporting.

#### CRITICAL PILOT DESIGN DECISION:
For pilot, CAPS is the store authority. If a workstation cannot reach CAPS, the workstation should HARD FAIL and not continue normal operation.

#### Data Flow (ALWAYS follow this order):
1. **WS → CAPS (local network)**: ALL transaction data goes to CAPS first via LAN. CAPS is the on-prem authority.
2. **CAPS → Cloud (internet)**: CAPS syncs data upstream to the cloud when internet is available. This is background/async.
3. **Cloud → CAPS → WS (config only)**: Configuration changes flow DOWN from cloud through CAPS to workstations.

#### Connectivity Status:
- **GREEN**: WS can reach CAPS AND CAPS can reach Cloud. Full connectivity.
- **YELLOW**: WS can reach CAPS but CAPS cannot reach Cloud. Store operates normally — cloud sync is deferred.
- **RED**: WS cannot reach CAPS. HARD FAIL — workstation cannot operate (pilot).

#### Device Online/Offline Status:
- A device (WS or KDS) is **ONLINE** if it can communicate with CAPS on the local network.
- A device is **OFFLINE** if CAPS cannot reach it (or it cannot reach CAPS).
- This is a LOCAL NETWORK status — it has NOTHING to do with cloud connectivity.
- The CAPS service host tracks which devices are connected to it via WebSocket/heartbeat on the LAN.

#### CAPS-Only API Routing:
- **ALL** `/api/` requests route exclusively to CAPS. No cloud fallback for any API call.
- Electron is a terminal UI only — it does not make routing decisions or fall back to cloud.
- CAPS unreachable = 503 returned to UI, no silent fallback.
- Print agent connects to CAPS WebSocket (not cloud) for print jobs.

- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS and CAPS synchronization.
- **Local-First Architecture**: All POS write operations commit to local SQLite first, with background cloud sync.
- **Offline Resilience**: On-premise CAPS with local SQLite for offline operations, ensuring an immutable `transaction_journal`.
- **Non-Destructive Changes**: New features default to OFF/NULL/false to prevent impact on existing enterprises.
- **Context Help**: Every configuration field requires help text.

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, React Context, shadcn/ui, Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, RESTful JSON API with WebSocket.
- **Database**: PostgreSQL with Drizzle ORM.
- **Offline Storage**: Browser IndexedDB (client-side), SQLite/SQLCipher (native apps).
- **Native Applications**: Capacitor (Android), Electron (Windows).

### Key Features
- **Device Configuration**: Hierarchical setup for Workstations, Printers, KDS.
- **KDS Order Flow**: "Standard Mode" and "Dynamic Order Mode" with real-time updates and EMC-driven routing.
- **Authentication**: PIN-based employee authentication with role-based access control.
- **Payment Processing**: PCI-compliant, gateway-agnostic, semi-integrated, with offline capabilities.
- **Printing System**: Database-backed print queue and standalone Print Agent System.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty, Online Ordering, Inventory, Forecasting.
- **Pizza Builder Module**: Visual, full-page customization.
- **Multi-Enterprise Architecture**: Server-side data isolation.
- **Native Application Capabilities (Windows Electron)**: Embedded print agent, SQLite/SQLCipher, local reporting, store-and-forward, EMV terminal communication (real TCP via service-host EMVTerminalService), auto-launch, kiosk mode, terminal setup wizard.
- **Configuration Inheritance & Override**: Items inherit with override capabilities via OptionBits system.
- **CAPS Terminal Payment Cloud Proxy (v3.1.100)**: All CAPS terminal payments (Stripe, Heartland, North, Square) now proxy through Cloud's existing payment adapters instead of using raw TCP. CAPS creates a local terminal_session, POSTs to Cloud `/api/terminal-sessions`, and polls for completion. Raw TCP path preserved for legacy/generic terminals only. Schema v16 adds `cloud_device_id`, `terminal_id`, `connection_type` to `terminal_devices`. FK constraint crash fixed in `authorizeOffline` — resolves actual card tender UUID instead of hardcoded `'card'` string. `handleTerminalFailure` no longer silently falls back to offline auth for card payments.
- **Concurrency-Safe Check Numbering**: Atomic, unique, sequential check numbers with configurable per-workstation offline check number ranges.
- **CAPS Connectivity Diagnostics**: System Diagnostics page shows real-time CAPS/Service Host status including online/offline, connected workstations, pending sync, last heartbeat, and version.
- **Reporting**: Canonical Data Access Layer with 7 query functions.
- **Customer Onboarding**: Excel-based bulk data import.
- **Offline Mode Resilience**: Protocol interceptors, cached assets, robust transaction handling, CAPS auto-discovery, Yellow Mode failover, immutable transaction journal.
- **CAPS-Cloud Parity (v3.1.117)**: Hierarchical KDS routing (RVC→property→global fallback with workstation device filtering), per-device send mode, station metadata on KDS tickets (stationName/stationType/orderDeviceName/subtotal), PM rollover business date logic, autonomous fiscal scheduler (auto-close/rollover/clock-out), ESCPOSBuilder (cash drawer kick, 3-column formatting, service charge/discount lines, RVC header/trailer), Z-Report and Cashier Report offline endpoints, workstation_order_devices config sync. **EMC Propagation Fix**: CONFIG_UPDATE handler now triggers delta sync when no inline changes array is present (fixes silent drop of all real-time EMC notifications). Auto-sync (2-min periodic delta fallback) now starts on boot after initial syncFull — previously was never called, so CAPS never received config updates after startup. `datetime('now')` fully replaced with timezone-aware `local_now()` in fiscal-scheduler.
- **Send-to-Kitchen Architecture**: Local interceptor, pre-sync to CAPS, retry logic.
- **CAPS Column Fixups**: `ALTER TABLE` DDL via `db.exec()`.
- **Workstation Identity and RVC Switching**: Locked Workstation ID, interactive RVC selection.
- **Device Tracker**: Unified tracking for WS and KDS Electron devices.
- **CAPS Service Host Resilience**: Ensures critical tables and token management.
- **Real-time Sync Push Notifications**: Critical sync events trigger WebSocket notifications and UI updates.
- **Bundled Asset Priority**: Protocol interceptor always serves bundled production assets for non-API requests when available.
- **CAPS Response Key Normalization**: Global `mapKeys()` middleware converts all `res.json()` responses from SQLite snake_case to frontend camelCase.
- **Sync Early-Abort**: `syncFromCloud()` aborts after 3 consecutive network failures.
- **Auth Write Blocking**: Auth POSTs (login, PIN, manager-approval) always return CAPS response, never fall through to cloud.
- **Manager Approval CAPS-First**: `/api/auth/manager-approval` added to `isCapsAuthRoute` for direct CAPS routing.
- **CAPS-Only Authority**: Complete architecture rewrite – ALL API routes go to CAPS exclusively.
- **v3.1.116 Release**: KDS TypeScript source fixes — ports all v3.1.115 CJS-only fixes into `service-host/src/` so they survive CI/CD build pipeline. (1) `local_now()` SQLite function registered in Database constructor with 282 `datetime('now')` replacements across 7 files, (2) `markCheckPaid()`/`markCheckVoided()` added to KDS controller + wired to all 8 pay/close/void routes, (3) modifier format changed from `string[]` to `{name}[]` matching KDS frontend contract, (4) send/pay unsent-item filters harmonized to `!voided && !sent && !sentToKitchen`, (5) preview ticket capture moved before `sendToKitchen()` to prevent race-condition duplicates.
- **v3.1.115 Release**: KDS bug fixes — local_now() SQLite function replaces all 255 datetime('now') with property-timezone-local timestamps (fixes -420:-29 timer), duplicate ticket fix (capture unsent items before send), paid/voided KDS ticket status with WebSocket broadcasts, fire_on_fly auto-send + real-time modifier KDS updates, EMC config changes now forward to CAPS service hosts via CONFIG_UPDATE.
- **v3.1.114 Release**: Human-readable server logs — all Cloud, CAPS, and Electron log output now shows property names, RVC names, device names, and employee names instead of raw UUIDs. clearSalesData uses `[PropertyName]` prefix, Service Host WS shows host name, KDS logs resolve device names from SQLite, auth fallback shows employee first name, check sync shows check numbers.
- **v3.1.113 Release**: DOM modifier real-time KDS fix — modifiers now fire to KDS immediately as they're selected (buffer + flush for pendingItemId race). Smart timeout warning dialog — 30-second countdown with "Need More Time" button before auto-logout instead of silent cancellation.
- **v3.1.112 Release**: Clear Totals orphan bug fix — detects orphaned RVC IDs from deleted/recreated RVCs and includes them in delete scope. EMC scope visibility — Properties, Utilities, Onboarding hidden at RVC scope. Dead code removal — deleted old admin layout shell and sidebar, /admin routes redirect to /emc.
- **v3.1.111 Release**: Schema V21→V22 migration adds `shift_templates` table, `shifts` table, and `employees.date_of_birth` column. Full end-to-end sync pipeline (Cloud→CAPS) for scheduling data. Closes all deferred EMC→CAPS sync gaps.
- **v3.1.110 Release**: Complete CAPS-Cloud table parity (57 config tables + 10 operational tables at 100%). Schema V20→V21 migration adds cloud_synced columns to 4 operational tables. Gateway log formatter fix (undefined→JSON). WebSocket reconnect exponential backoff. 4 new Cloud ingest endpoints for CAPS→Cloud sync.
- **Schema v14 Migration**: Adds `employee_assignments.role_id` column + 18 missing tables (terminal_devices, cash_drawers, drawer_assignments, cash_transactions, safe_counts, job_codes, employee_job_codes, fiscal_periods, online_order_sources, overtime_rules, break_rules, tip_rules, tip_rule_job_percentages, minor_labor_rules, payment_gateway_config, descriptor_sets, descriptor_logo_assets, print_agents). Fixes cascade sync failure from v13.
- **Enterprise Employee Privilege Resolution**: `getEmployeesByProperty()` includes `OR property_id IS NULL` to resolve privileges for enterprise-level employees.
- **Price Unit Consistency**: `addItems()` response returns `unitPrice`/`totalPrice` in DOLLARS (matching `getCheckItems()`). DB stores CENTS internally.
- **Transaction Sync Integrity**: Cloud dedup logic allows check updates through (items, payments, status, totals) instead of skipping them. Payments use upsert for idempotency. Fixes ghost checks showing $0/open on Cloud.
- **Check Number Reset on Clear Totals**: `clearTransactionalData()` resets `workstation_config.current_check_number` back to `check_number_start` and resets in-memory `checkNumberSequence` to 1.
- **Enterprise Effective Config Resolution**: Runtime config (tenders, discounts, tax groups, service charges, roles) resolves using enterprise→property→RVC hierarchy with RVC override > Property override > Enterprise default precedence. `resolveEffective()` in database.ts handles the merge. `ConfigSync` accessors wired to use effective resolution.
- **RVC-Scoped Employee Privileges**: `resolveEmployeePrivileges()` accepts `rvcId` and resolves employee's role assignment for the active RVC first, then falls back to primary assignment. `checkPrivilege()` passes RVC context through.
- **Effective Config Diagnostic**: `/caps/diagnostic/effective-config` endpoint shows resolved config for a workstation/RVC with scope level attribution (enterprise/property/RVC) for each entity.

---

## Enforcement Addendum — OnPoint POS Mandatory Implementation Rules

These rules are mandatory. Any implementation that violates these rules is considered incomplete and must be corrected before proceeding.

### Rule 1: Feature Path Completion
A feature is NOT considered complete because tables, routes, or UI pages exist. Every feature MUST be validated through the full feature path:

**schema → sync → CAPS storage → runtime API → response contract → frontend state → user flow → reporting/sync side effects**

Do not mark a feature complete until the full path is proven end-to-end with runtime validation.

### Rule 2: System of Record & Data Ownership
Every table/entity MUST explicitly define:
- **System of record** (Cloud or CAPS)
- **Sync direction** (Cloud → CAPS, CAPS → Cloud, Bidirectional)
- **Scope level** (Enterprise, Property, RVC, Workstation)
- **Category** (Config, Operational, Derived)

No table should be implemented without this definition. Ambiguity in ownership leads to data inconsistency and broken features.

### Rule 3: Runtime Response Contract
CAPS runtime responses MUST match the cloud response contract exactly from the frontend perspective. This includes:
- Key naming (camelCase)
- Boolean values (true/false, not 1/0)
- JSON fields parsed as objects/arrays
- Timestamps in ISO format
- Nested object structures

The frontend must not need to know whether data came from CAPS or Cloud.

### Rule 4: Feature Validation Output
For every feature or task, output MUST include:

**Features:**
`FEATURE | TABLES | CAPS ROUTES | CLOUD ROUTES | SYSTEM OF RECORD | TEST RUN | RESULT | REMAINING GAPS`

**Bugs:**
`FLOW | USER ACTION | API CALL | RESPONSE | UI STATE RESULT | ROOT CAUSE | FIX`

Do not provide high-level summaries without concrete validation output.

### Rule 5: No False Parity Claims
Do NOT claim "100% complete", "full parity", "fully working", or "production ready" unless runtime validation proves the feature path works. Table parity, route parity, and UI existence are NOT proof of operational correctness.

### Rule 6: Feature-First Implementation
Development MUST follow feature paths, not structural layers. Do not:
- Add tables without runtime usage
- Add routes without frontend integration
- Add UI without validated backend behavior

Each feature must be built and validated as a complete vertical slice.

### Rule 7: Sync Integrity
For every synced entity:
- Define authoritative source
- Define idempotency behavior
- Define conflict resolution
- Ensure no partial sync states (e.g., check header without items)

All sync flows must be verifiable and consistent across CAPS and Cloud.

### Rule 8: CAPS Authority
CAPS is the authoritative runtime system for store operations. All POS/KDS actions MUST:
- Execute locally on CAPS first
- Persist in CAPS SQLite
- Sync to Cloud asynchronously

Cloud must NEVER be in the blocking execution path of live POS operations.

### Rule 9: Cloud Responsibility
Cloud is responsible for:
- Configuration (EMC)
- Enterprise hierarchy
- Reporting
- Cross-store coordination
- Catering/CRM workflows
- Transaction ingestion

Cloud does NOT execute live POS operations.

### Rule 10: Diagnostics & Observability
Every major system must expose diagnostics including:
- Table parity (Cloud vs CAPS)
- Sync status and queue depth
- Last sync timestamps
- Error logs per subsystem

Diagnostics must detect missing data, not just system uptime.

### Rule 11: Incremental Feature Rollout
New features must:
- Sync data down to CAPS
- Remain disabled by default
- Be enabled only via EMC option flags

This prevents breaking live environments.

### Rule 12: Strict Boot Contract
No POS or KDS UI may render until CAPS is fully ready. CAPS readiness requires:
- Database initialized
- Config fully loaded
- WebSocket ready
- Device registered

No partial rendering. No early queries.

### Rule 13: Enforcement
These rules are mandatory. Any implementation that violates:
- Feature path completion
- System of record definition
- Response contract consistency

is considered incomplete and must be corrected before proceeding.

---

## External Dependencies

### Database
- PostgreSQL

### UI Libraries
- Radix UI
- Embla Carousel
- cmdk
- react-day-picker
- react-hook-form
- Recharts

### Payment Gateways
- Stripe (direct_with_terminal)
- Elavon Converge (semi_integrated)
- Elavon Fusebox (semi_integrated)
- Heartland / Global Payments (semi_integrated)
- North / Ingenico SI (semi_integrated)
- Shift4 (semi_integrated)
- FreedomPay (semi_integrated)
- Eigen (semi_integrated)

### Delivery Platform Integration APIs
- Uber Eats
- DoorDash
- Grubhub
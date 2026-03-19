# Cloud POS System

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system designed for high-volume Quick Service Restaurants (QSRs). It provides a scalable solution with comprehensive administrative configuration and real-time operational features. Key capabilities include multi-property hierarchy support, KDS integration, fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. It features a Simphony-class design for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. The system supports both web and native applications (Android & Windows).

## User Preferences
Preferred communication style: Simple, everyday language.
- **Release Notes Requirement**: Whenever a new Electron installer version is created (version bump in `electron/electron-builder.json`), always generate release notes summarizing all changes included in that version. Format them for use as GitHub Release descriptions.
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

**A) LOCAL-FIRST COMMIT** — All live POS and KDS actions must commit to CAPS local SQLite FIRST. Only after local commit succeeds can background sync happen. This includes: sign in, open check, add item, modifiers, discounts, send to kitchen, pickup check, transfer check, reopen closed check, payments, close check, KDS create/bump/recall/priority. If local commit fails, the UI must FAIL the action and show an error. Do not fake success. Do not require cloud to complete a sale.

**B) CLOUD NEVER IN BLOCKING WRITE PATH** — Correct: WS → CAPS → local SQLite commit → success returned to UI → background sync to cloud. NEVER: WS → cloud → maybe local later.

**C) MODE DEFINITIONS** — Based on REAL operational health, not just a ping:
- **GREEN**: CAPS reachable + local SQLite healthy + cloud sync probe succeeds
- **YELLOW**: CAPS reachable + local SQLite healthy + cloud sync unavailable/degraded. Store still fully operates locally.
- **RED**: CAPS unreachable OR local SQLite unhealthy. Workstation cannot trust store authority.
- Do NOT show GREEN just because /health returns 200. Mode detection must verify real read/write capability.

**D) PILOT FEATURE MATRIX** — When cloud is unavailable but CAPS is alive, these MUST still work: sign in, menu ordering, modifiers, check functions, payments, KDS, offline daily reporting. Gift/loyalty can remain online-only for pilot.

#### CRITICAL PILOT DESIGN DECISION:
**For pilot, CAPS is the store authority. If a workstation cannot reach CAPS, the workstation should HARD FAIL and not continue normal operation.** Do NOT build true standalone-per-workstation databases right now unless explicitly asked. We are not doing split-brain WS databases for pilot.

#### Data Flow (ALWAYS follow this order):
1. **WS → CAPS (local network)**: ALL transaction data goes to CAPS first via LAN. CAPS is the on-prem authority.
2. **CAPS → Cloud (internet)**: CAPS syncs data upstream to the cloud when internet is available. This is background/async.
3. **Cloud → CAPS → WS (config only)**: Configuration changes flow DOWN from cloud through CAPS to workstations.

#### Connectivity Status (what the colors mean):
- **GREEN**: WS can reach CAPS AND CAPS can reach Cloud. Full connectivity.
- **YELLOW**: WS can reach CAPS but CAPS cannot reach Cloud. Store operates normally — cloud sync is deferred.
- **RED**: WS cannot reach CAPS. HARD FAIL — workstation cannot operate (pilot).

#### Device Online/Offline Status:
- A device (WS or KDS) is **ONLINE** if it can communicate with CAPS on the local network.
- A device is **OFFLINE** if CAPS cannot reach it (or it cannot reach CAPS).
- This is a LOCAL NETWORK status — it has NOTHING to do with cloud connectivity.
- The CAPS service host tracks which devices are connected to it via WebSocket/heartbeat on the LAN.
- The cloud DB is updated when CAPS syncs upstream, but the source of truth for device status is CAPS, not the cloud.

#### CAPS-Only API Routing (v3.1.82+ — electron/main.cjs interceptor):
- **ALL** `/api/` requests route exclusively to CAPS. No cloud fallback for any API call.
- Electron is a terminal UI only — it does not make routing decisions or fall back to cloud.
- Path mapping for CAPS:
  - `/api/checks/*` → `/api/caps/checks/*`
  - `/api/check-items/*` → `/api/caps/check-items/*`
  - `/api/check-payments/*` → `/api/caps/check-payments/*`
  - `/api/check-discounts/*` → `/api/caps/check-discounts/*`
  - `/api/check-service-charges/*` → `/api/caps/check-service-charges/*`
  - `/api/payments/*` → `/api/caps/payments/*`
  - `/api/refunds/*` → `/api/caps/refunds/*`
  - All other `/api/*` routes pass through to CAPS at the same path
- CAPS unreachable = 503 returned to UI, no silent fallback
- Print agent connects to CAPS WebSocket (not cloud) for print jobs
- Non-API assets (HTML/JS/CSS) served from bundled files or cloud (UI resources only)

#### When building ANY feature, ask in this order:
1. **Does CAPS handle this operation?** (CAPS is the authority)
2. **How does it work with CAPS on the LAN?** (YELLOW mode — store still operates)
3. **How does it work when cloud is also available?** (GREEN mode — adds sync)
4. **What happens if CAPS is unreachable?** (RED mode — HARD FAIL for pilot)
5. NEVER build cloud-first and retrofit offline. ALWAYS build CAPS-first.

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
- **Native Application Capabilities (Windows Electron)**: Embedded print agent, SQLite/SQLCipher, local reporting, store-and-forward, EMV terminal communication, auto-launch, kiosk mode, terminal setup wizard.
- **Configuration Inheritance & Override**: Items inherit with override capabilities via OptionBits system.
- **Concurrency-Safe Check Numbering**: Atomic, unique, sequential check numbers with configurable per-workstation offline check number ranges (EMC → WS config → Electron offline DB).
- **CAPS Connectivity Diagnostics**: System Diagnostics page shows real-time CAPS/Service Host status including online/offline, connected workstations, pending sync, last heartbeat, and version.
- **Reporting**: Canonical Data Access Layer with 7 query functions.
- **Customer Onboarding**: Excel-based bulk data import.
- **Offline Mode Resilience**: Protocol interceptors, cached assets, robust transaction handling, CAPS auto-discovery, Yellow Mode failover, immutable transaction journal.
- **Send-to-Kitchen Architecture**: Local interceptor, pre-sync to CAPS, retry logic.
- **CAPS Column Fixups**: `ALTER TABLE` DDL via `db.exec()`.
- **Workstation Identity and RVC Switching**: Locked Workstation ID, interactive RVC selection.
- **Device Tracker**: Unified tracking for WS and KDS Electron devices.
- **CAPS Service Host Resilience**: Ensures critical tables and token management.
- **Real-time Sync Push Notifications**: Critical sync events trigger WebSocket notifications and UI updates.
- **Bootstrap Watchdog (v3.1.75)**: 10s timer after page load auto-reloads if renderer doesn't signal React bootstrap (max 2 retries). Cleared by `renderer-log` or `renderer-bootstrap-ready` IPC.
- **Bundled Asset Priority (v3.1.75)**: Protocol interceptor always serves bundled production assets for non-API requests when available — never falls through to cloud Vite dev server for UI content.
- **CAPS Response Key Normalization (v3.1.87)**: Global `mapKeys()` middleware in `service-host/src/routes/api.ts` converts all `res.json()` responses from SQLite snake_case to frontend camelCase. Exception: `/config/workstation-options` keys preserved as snake_case (semantic option-bit IDs). `build-service-host.cjs` stamps `CAPS_VERSION` from `build-info.json` into the bundle — verify via `/health/build-version`.
- **Sync Early-Abort (v3.1.75)**: `syncFromCloud()` aborts after 3 consecutive network failures instead of attempting all 56+ table endpoints.
- **5xx Cloud Fallback (v3.1.76)**: Protocol interceptor treats 502/503/504 as network failures — triggers CAPS/offline fallback + immediate `checkConnectivity()`. All check-mutation endpoints in `LOCAL_FIRST_WRITE_PATTERNS`.
- **CalSync Log Suppression (v3.1.76)**: `CalSync.checkPendingDeployments()` uses `lastCloudDisconnectLogged` flag to suppress repeated disconnect logs (matches TransactionSync pattern).
- **CAPS-Required GREEN Mode (v3.1.77)**: `checkConnectivity()` and startup probe now verify CAPS health alongside cloud — GREEN requires CAPS reachable + healthy when configured. Cloud UP + CAPS DOWN = RED.
- **Auth Write Blocking (v3.1.77)**: Auth POSTs (login, PIN, manager-approval) always return CAPS response, never fall through to cloud. Auth excluded from RED mode exception — ALL writes blocked in RED.
- **Manager Approval CAPS-First (v3.1.77)**: `/api/auth/manager-approval` added to `isCapsAuthRoute` for direct CAPS routing.
- **CAPS-Only Authority (v3.1.82)**: Complete architecture rewrite — ALL API routes go to CAPS exclusively. Removed: cloud fallback routing, warm-sync, split-brain offline interceptor, GREEN→cloud paths, YELLOW→CAPS failover cascades. Non-blocking startup (window opens immediately, CAPS check async). Print agent connects to CAPS WebSocket (not cloud). API client simplified — uses relative URLs, no cloud URL routing.

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
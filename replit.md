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

#### CAPS-First API Path Mapping (electron/main.cjs interceptor):
- Cloud `/api/checks/*` → CAPS `/api/caps/checks/*` (checks have `/caps/` prefix on CAPS)
- Cloud `/api/check-items/*` → CAPS `/api/check-items/*` (same path)
- Cloud `/api/check-payments/*` → CAPS `/api/check-payments/*` (same path)
- Cloud `/api/check-discounts/*` → CAPS `/api/check-discounts/*` (same path)
- Cloud `/api/check-service-charges/*` → CAPS `/api/check-service-charges/*` (same path)
- Cloud `/api/payments/*` → CAPS `/api/payment/*` (singular on CAPS)
- Cloud `/api/refunds/*` → CAPS `/api/payment/*` (handled by payment controller on CAPS)
- Cloud `/api/auth/login`, `/api/auth/pin`, `/api/employees/*/authenticate` → CAPS (same paths)
- Cloud `/api/kds-tickets/*` → CAPS `/api/kds-tickets/*` (same path)
- Cloud `/api/time-punches/*`, `/api/time-clock/*` → CAPS (same paths)
- Config reads (menu-items, slus, modifiers, etc.) are served by CAPS at same paths

#### CAPS-First Write Protection (v3.1.70+):
- All WRITE operations (POST/PUT/PATCH/DELETE) to CAPS-first routes that fail at CAPS return 503 to the UI — they NEVER fall through to cloud
- Only READ operations (GET/HEAD) may fall through to cloud as a fallback
- In RED mode, ALL writes across the entire API return 503 with hard-fail error
- YELLOW mode health probe uses `/api/health` and checks `dbHealthy` field — not just a ping

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
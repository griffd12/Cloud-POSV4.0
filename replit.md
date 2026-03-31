# Cloud POS System

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system for high-volume Quick Service Restaurants (QSRs). It's a pure cloud web POS with a React frontend and Express/PostgreSQL backend, accessed via web browsers. Key capabilities include multi-property hierarchy, KDS integration, fiscal close, cash management, gift cards, loyalty, inventory, forecasting, and online ordering integration. It supports Simphony-class configuration inheritance and is designed for high-availability with a robust Local Failover Server (LFS) architecture for offline operations and payment processing. The system aims to provide a comprehensive, resilient, and scalable POS solution for QSRs.

## User Preferences
Preferred communication style: Simple, everyday language.

### MANDATORY: Read This File First
Every session, before ANY work begins, read this ENTIRE file top to bottom. No exceptions. Do not start planning, coding, or responding to tasks until you have read and internalized every rule here.

### MANDATORY: Task Completion Pipeline
After EVERY completed task with code changes, verify the app starts cleanly via `npm run dev`, then commit changes.

- **Database Schema Documentation**: Keep `shared/schema.ts` as the source of truth for the database schema.
- **MANDATORY: System-Wide Thinking**: Every change, bug fix, or feature MUST be evaluated for its impact across the ENTIRE system — not just the immediate component. Before making any change, always ask and answer:
  1. **All device types**: Does this affect WS (POS terminals), KDS (kitchen displays), and any future device types?
  2. **Multi-workstation**: Does this work when multiple workstations are connected?
  3. **All POS functions**: Beyond the immediate fix, what other operations could break? Check: login, ring items, modifiers, discounts, payments, voids, cancels, reopens, splits, merges, transfers, send-to-kitchen, KDS bump/recall, print, gift cards, loyalty, manager approvals, reports.
  4. **Error recovery**: What happens if this operation fails? Does the user see a clear error, or does the UI freeze/break silently?
Never fix a single symptom in isolation. Always trace the full impact chain.

## System Architecture

### ARCHITECTURE: Pure Cloud Web POS
All POS operations go directly to the cloud Express server and commit to PostgreSQL. There is no offline/local-first layer, no CAPS, no service-host, no Electron.

- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS updates and config push.
- **Local Printing**: Browser print API for receipt printers and cash drawer kicks, with a future lightweight localhost print relay.
- **Payment Terminals**: Cloud gateway APIs (Stripe Terminal, etc.) for EMV/card reader integration.
- **Non-Destructive Changes**: New features default to OFF/NULL/false.
- **Context Help**: Every configuration field requires help text.

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, React Context, shadcn/ui, Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, RESTful JSON API with WebSocket.
- **Database**: PostgreSQL with Drizzle ORM (both cloud and local failover — unified store).

### Local Failover Server (LFS) Architecture
The same Express codebase runs against local PostgreSQL (LFS) or cloud PostgreSQL based on `DB_MODE`. SQLite has been eliminated — both modes use PostgreSQL as a unified store. LFS handles offline operations, syncing configuration and transactions between local PostgreSQL and the cloud PostgreSQL.

- **DB Modes**: `DB_MODE=local` uses local PostgreSQL via `LFS_DATABASE_URL` (falls back to `DATABASE_URL`); unset/cloud uses cloud PostgreSQL.
- **Unified Storage**: `DatabaseStorage` is always used (no SQLite branch). `server/storage-sqlite.ts` and `server/sqlite-init.ts` are deprecated dead code.
- **Config Sync**: Background service (`server/config-sync.ts`) pulls config from cloud to local PostgreSQL (all 56 tables at Enterprise/Property/RVC levels) and pushes transactions up. Uses Drizzle ORM and `lfs_sync_status`/`lfs_offline_sequence` tables.
- **Transaction Journal**: All LFS writes use write-through journaling: journal entry is persisted first (via `journalWrite()` which throws on failure), then business write executes. For creates, entity IDs are pre-generated (`crypto.randomUUID()`) so the journal can reference them before the entity exists. Entries are idempotent (deduped by `event_id`). Journal failures abort the request — no silent swallowing.
- **Cloud Sync**: `server/cloud-sync.ts` runs an async background process that pushes pending journal entries to the cloud endpoint in dependency order.
- **EffectiveConfig**: `server/effective-config.ts` provides centralized config resolution with RVC override → Property override → Enterprise default priority. Integrated into runtime paths (tax group lookup during item creation) and exposed via `/api/effective-config/{tax-groups,tenders,service-charges,option-flag}` endpoints.
- **Storage Enforcement**: All route handlers use the `IStorage` interface — no direct `db.select()`/`db.insert()` in route files.
- **Mode Indicator**: `GET /api/lfs/mode` returns Green/Yellow/Red status reflecting internet availability, cloud reachability, and journal sync state. Client component `LfsModeBar` displays this in the offline banner.
- **EMC Access**: EMC user management routes are disabled on LFS (cloud-only feature, returns 403).
- **LFS-Only Runtime Model**: When deployed as LFS, the local server is the sole runtime endpoint for POS/KDS devices. There is no proxy mode — all reads and writes go through LFS → Local PostgreSQL. The LFS URL is configured per-device via the "Service Host URL" field in EMC on both Workstation and KDS Device edit forms (Network Settings section). For workstations, it's read at login; for KDS, it's set during KDS device selection.
- **PIN Auth Parity**: Both cloud and LFS use direct string equality for PIN verification (NOT bcrypt). PINs are stored as plain text in `pin_hash` column and compared directly.
- **Connect-to-Server Protocol Detection**: The server setup page auto-detects private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, localhost) and defaults to `http://`. For public URLs without protocol, tries `https://` first, falls back to `http://`.
- **Offline Payments (Store-and-Forward)**: LFS processes payments locally for SAF-capable terminals, recording them as `pending_settlement`. Payments are later reconciled with the cloud via server-to-server calls.
- **Transaction Journal Coverage**: Refunds, time punches, cash transactions, inventory transactions, and audit logs are journaled in the `transaction_journal` PostgreSQL table for cloud sync on reconnection. Cloud-side `syncEntity()` handles all journaled entity types.
- **LFS Reporting**: In local mode, all reporting queries run against the local PostgreSQL database using standard Drizzle ORM — no compatibility layer needed.
- **React Query networkMode**: Set to `'always'` (not `'online'`) so requests to LFS work even when browser detects no internet.
- **KDS WebSocket Failover**: KDS WebSocket URL uses `connectionManager.getWsUrl()` to route to LFS when offline.
- **LFS Packaging & Admin**: Includes build scripts for self-contained distributions, Windows installer as a service, system tray indicator, admin dashboard for status/config/logs, and auto-update mechanism. Admin dashboard path resolution uses `path.resolve(__dirname, '..')` as `LFS_BASE_DIR` for correct path lookup in bundled builds.
- **LFS Management in EMC**: Per-property API key generation/rotation/revocation for LFS authentication, connection status monitoring, sync history logging, and first-run setup instructions. EMC route: `/emc/lfs-management` (property-only, Hierarchy nav group). DB tables: `lfs_configurations`, `lfs_sync_logs`. API routes protected by EMC session auth with enterprise/property scope enforcement.
- **LFS Auto-Config Injection**: `GET /api/lfs/device-config` returns enterprise/property/cloud config from `.env`. Frontend `DeviceProvider` auto-detects LFS via this endpoint, populates `localStorage`, and skips the "Connect to Server" page. `isLfsConfigLoading` state prevents premature redirect during detection.
- **LFS First-Run Setup Wizard**: When LFS is unconfigured (`isLfsUnconfigured` flag), the frontend redirects to `/lfs-first-run` — a 4-step wizard (cloud URL → admin auth → property select → save). API endpoints: `/api/lfs/first-run/{validate-cloud,auth,properties,save}`. The save endpoint is guarded (rejects if `LFS_API_KEY` already set), generates API keys server-side via `crypto.randomBytes`, and triggers `restartConfigSync()` to immediately sync all config data (workstations, employees, menu items) from the cloud. Frontend polls `/api/workstations` to confirm sync completion before redirecting to POS. Page: `client/src/pages/lfs-first-run.tsx`.
- **LFS Base Dir Resolution**: `LFS_BASE_DIR` uses smart detection: checks `__dirname` for `lfs-admin/` or `.env`, then parent dir, then `process.cwd()`. This handles both bundled (`server.cjs` at package root) and dev (`server/` subdirectory) layouts.

### Property Timezone Display
- **Timezone Utility**: `client/src/lib/timezone.ts` provides centralized timezone-aware formatting functions used throughout the POS and KDS UIs.
- **POS/KDS Header Clocks**: Display date/time in the property's configured timezone (from `properties.timezone` field) instead of browser-local time.
- **Server-Side**: `printService.ts` and `businessDate.ts` already use property timezone for receipt formatting and business date calculations.
- **Admin Pages**: Timecards, fiscal close, daily operations, and POS modals (refund, transaction lookup, reopen check, edit closed check) all use property timezone.

### Key Features
- **Device Configuration**: Hierarchical setup for Workstations, Printers, KDS.
- **KDS Order Flow**: Standard and Dynamic Order Modes with real-time updates.
- **Authentication**: PIN-based employee authentication with role-based access control.
- **Payment Processing**: PCI-compliant, gateway-agnostic, semi-integrated.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty, Online Ordering, Inventory, Forecasting.
- **Pizza Builder Module**: Visual, full-page customization.
- **Multi-Enterprise Architecture**: Server-side data isolation.
- **Configuration Inheritance**: Items inherit with override capabilities via OptionBits.
- **Concurrency-Safe Check Numbering**: Atomic, unique, sequential check numbers.
- **Reporting**: Canonical Data Access Layer with 7 query functions.
- **Customer Onboarding**: Excel-based bulk data import.
- **Workstation Identity and RVC Switching**: Locked Workstation ID, interactive RVC selection.
- **Enterprise Employee Privilege Resolution**: Resolves privileges for enterprise-level employees.
- **Price Unit Consistency**: Frontend uses dollars, backend stores cents.
- **Tips in Tender/Payment Totals**: `tip_amount` included in all tender/payment totals across reports.
- **Enterprise Effective Config Resolution**: Runtime config resolves using enterprise→property→RVC hierarchy.
- **RVC-Scoped Employee Privileges**: Resolves employee's role assignment for active RVC.

### Implementation Rules
- **Feature Path Completion**: Features are not complete until schema → API route → response contract → frontend state → user flow is validated end-to-end.
- **Feature-First Implementation**: Development must follow feature paths, building and validating complete vertical slices.
- **Incremental Feature Rollout**: New features must remain disabled by default and enabled only via EMC option flags.

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

## GitHub & CI/CD
- **Repository**: `griffd12/Cloud-POSV4.0` (main branch)
- **Version**: 4.0.0 (`package.json`)
- **GitHub Actions**: `.github/workflows/build-lfs.yml` — builds LFS packages (Windows/Linux) on manual dispatch or tagged releases
- **Release**: v4.0.0 tag with comprehensive release notes covering all features (Tasks #1–#82) plus CI/CD setup (#83)
- **LFS Deployment Docs**: `lfs/docs/newport-beach-deployment.md` — Derek-Laptop setup guide for Newport Beach test location
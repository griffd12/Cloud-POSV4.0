# Cloud POS System

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system designed for high-volume Quick Service Restaurants (QSRs). It is a pure cloud web POS — React frontend + Express/PostgreSQL backend, accessed via web browsers on Windows PCs/workstations. Key capabilities include multi-property hierarchy support, KDS integration, fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. It features a Simphony-class design for configuration inheritance with override capabilities. Local printing (receipt printers, cash drawer kicks) uses the browser print API initially, with a future lightweight local print relay. Payment terminals (EMV/card readers) are handled via cloud gateway APIs (Stripe Terminal, etc.).

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

**Browser → Cloud API → PostgreSQL**

All POS operations go directly to the cloud Express server and commit to PostgreSQL. There is no offline/local-first layer, no CAPS, no service-host, no Electron.

- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS updates and config push.
- **Local Printing**: Browser print API for receipt printers and cash drawer kicks. Future: lightweight localhost print relay (reference code in `print-agent/`).
- **Payment Terminals**: Cloud gateway APIs (Stripe Terminal, etc.) for EMV/card reader integration.
- **Non-Destructive Changes**: New features default to OFF/NULL/false to prevent impact on existing enterprises.
- **Context Help**: Every configuration field requires help text.

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, React Context, shadcn/ui, Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, RESTful JSON API with WebSocket.
- **Database**: PostgreSQL with Drizzle ORM (cloud), SQLite via better-sqlite3 (local failover).

### Local Failover Server (LFS) Architecture
The same Express codebase runs against either PostgreSQL (cloud) or SQLite (local) based on `DB_MODE` env var.

- **DB_MODE=local**: Server uses SQLite (better-sqlite3) via `SqliteDatabaseStorage`. Single LFS per property serves all workstations on LAN.
- **DB_MODE unset/cloud**: Normal cloud PostgreSQL mode via `DatabaseStorage` with Drizzle ORM.
- **Key Files**:
  - `server/db.ts` — DB factory: conditionally initializes PG pool or SQLite connection
  - `server/sqlite-init.ts` — Auto-generates SQLite schema from PG Drizzle table definitions (no manual SQL)
  - `server/storage-sqlite.ts` — Full `IStorage` implementation using raw SQL against SQLite
  - `server/config-sync.ts` — Background service that pulls config from cloud API to local SQLite
- **Schema-Driven Column Filtering**: `insertOne()` and `updateOne()` automatically filter out keys that don't exist as columns on the target SQLite table, so passing extra fields (e.g. `propertyId` on a table without that column) is safely ignored.
- **Offline Check Numbering**: Each workstation has configurable offline check number ranges (`lfs_offline_sequence` table) to prevent collisions between workstations.
- **Transaction Journal**: `lfs_transaction_journal` table tracks all write operations for later sync-up to cloud. Columns: `operation_type`, `entity_type`, `entity_id`, `http_method`, `endpoint`, `payload`, `offline_transaction_id`, `workstation_id`, `created_at`, `synced`, `synced_at`.
- **Config Sync**: Runs on configurable interval (default 60s). Syncs config DOWN first (menu, employees, tax, tenders, discounts), then transactions UP.
- **Health Endpoint**: `GET /api/health` returns mode, database type, and sync status.
- **Auto-Failover Detection**: Browser-side `ConnectionManager` singleton (`client/src/lib/connection-manager.ts`) pings cloud `/health` every 5s. After 3 consecutive failures, routes API/WS traffic to LFS URL (stored in localStorage `lfs_local_server_url`). States: `cloud-online`, `cloud-degraded`, `cloud-offline`, `reconnecting`. When cloud comes back online, runs reconnection sync: config-down first, then transactions-up from LFS journal.
- **Dual-URL API Routing**: `queryClient.ts` and `api-client.ts` route through `connectionManager.getBaseUrl()`. WebSocket hooks (`use-pos-websocket.ts`, `use-config-sync.ts`) use `connectionManager.getWsUrl()`. All routing is transparent to callers.
- **Offline UI Banner**: `OfflineBanner` component shows amber bar "RUNNING LOCALLY" when offline, with pending sync count and reconnection progress bar.
- **Sync-Back Routes**: `server/lfs-sync-routes.ts` — LFS mode exposes `/api/lfs/journal/pending`, `/api/lfs/journal/:id/synced`; Cloud mode exposes `/api/lfs/sync/transaction-up` and `/api/lfs/sync/batch-up` with idempotent deduplication via `offlineTransactionId`.
- **Deduplication**: `checks`, `check_items`, `check_payments` have `offlineTransactionId` column. Sync-up checks for duplicates before inserting.
- **Env Vars for LFS**: `DB_MODE=local`, `SQLITE_PATH`, `LFS_CLOUD_URL`, `LFS_API_KEY`, `LFS_PROPERTY_ID`, `LFS_SYNC_INTERVAL_MS`.
- **Offline Payments (Full Feature Parity)**:
  - **Credential Fallback**: `getPaymentAdapter` resolves credentials from `payment_gateway_config` DB table when env vars are missing (LFS mode). `resolveCredentials` accepts optional `dbFallbackCredentials` parameter.
  - **Store-and-Forward (SAF)**: Terminal devices have `supportsStoreAndForward` flag. When cloud is down, SAF-capable terminals process payments locally; payments recorded as `pending_settlement` status. Non-SAF scenarios fall back to cash-only.
  - **LFS Capabilities**: `/api/lfs/capabilities` reports available features (payments, KDS, printing) and internet status. `/api/lfs/payment-status` reports card payment mode (online vs store_and_forward).
  - **SAF Payment Recording**: `/api/lfs/record-saf-payment` endpoint creates payments with `pending_settlement` status on LFS, recording to transaction journal for sync-back.
  - **Settlement Reconciliation**: Cloud-side `/api/lfs/sync/pending-settlements` queries unresolved SAF payments (supports `propertyId` filter for multi-property scoping). `/api/lfs/sync/settle-payment` marks them as settled or failed using `paymentTransactionId` field.
  - **Config Sync Additions**: `terminal_devices`, `print_agents`, `cash_drawers` tables added to config sync for LFS.
  - **KDS Failover**: KDS display component uses `failoverFetch` for all API calls (bumped tickets, item availability).
  - **Payment Modal Offline Banner**: Shows "Running Locally" with SAF/offline context when connection manager reports offline state.

### Key Features
- **Device Configuration**: Hierarchical setup for Workstations, Printers, KDS.
- **KDS Order Flow**: "Standard Mode" and "Dynamic Order Mode" with real-time updates and EMC-driven routing.
- **Authentication**: PIN-based employee authentication with role-based access control.
- **Payment Processing**: PCI-compliant, gateway-agnostic, semi-integrated via cloud gateway APIs.
- **Printing System**: Browser print API with future local print relay support.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty, Online Ordering, Inventory, Forecasting.
- **Pizza Builder Module**: Visual, full-page customization.
- **Multi-Enterprise Architecture**: Server-side data isolation.
- **Configuration Inheritance & Override**: Items inherit with override capabilities via OptionBits system.
- **Concurrency-Safe Check Numbering**: Atomic, unique, sequential check numbers.
- **Reporting**: Canonical Data Access Layer with 7 query functions.
- **Customer Onboarding**: Excel-based bulk data import.
- **Workstation Identity and RVC Switching**: Locked Workstation ID, interactive RVC selection.
- **Enterprise Employee Privilege Resolution**: `getEmployeesByProperty()` includes `OR property_id IS NULL` to resolve privileges for enterprise-level employees.
- **Price Unit Consistency**: `addItems()` response returns `unitPrice`/`totalPrice` in DOLLARS (matching `getCheckItems()`). DB stores CENTS internally.
- **Tips in Tender/Payment Totals**: `tip_amount` is stored separately in `check_payments` but MUST be included in all tender/payment totals across reports (Z-Report, Daily Sales, Cashier, Validation, sales-summary, tender-mix, tender-detail, employee-balance). Tips are added AFTER the over-tender ratio capping logic. Reconciliation compares `netCollected` against `customerTotal` (which includes card tips), not raw `checkTotals`.
- **Enterprise Effective Config Resolution**: Runtime config (tenders, discounts, tax groups, service charges, roles) resolves using enterprise→property→RVC hierarchy with RVC override > Property override > Enterprise default precedence.
- **RVC-Scoped Employee Privileges**: `resolveEmployeePrivileges()` accepts `rvcId` and resolves employee's role assignment for the active RVC first, then falls back to primary assignment.

---

## Implementation Rules

### Rule 1: Feature Path Completion
A feature is NOT considered complete because tables, routes, or UI pages exist. Every feature MUST be validated through the full feature path:

**schema → API route → response contract → frontend state → user flow**

Do not mark a feature complete until the full path is proven end-to-end with runtime validation.

### Rule 2: Feature-First Implementation
Development MUST follow feature paths, not structural layers. Do not:
- Add tables without runtime usage
- Add routes without frontend integration
- Add UI without validated backend behavior

Each feature must be built and validated as a complete vertical slice.

### Rule 3: Incremental Feature Rollout
New features must:
- Remain disabled by default
- Be enabled only via EMC option flags

This prevents breaking live environments.

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
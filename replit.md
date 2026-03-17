# Cloud POS System

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system designed for high-volume Quick Service Restaurants (QSRs). It offers a scalable solution with comprehensive administrative configuration and real-time operational features. The system supports a multi-property hierarchy, integrates with kitchen display systems (KDS), and provides advanced enterprise functionalities including fiscal close, cash management, gift cards, loyalty programs, inventory management, forecasting, and online ordering integration. It features a Simphony-class design for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience, ensuring continuous service even when offline. The system supports both web and native applications (Android & Windows).

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

### Core Design Principles
- **Multi-Property Hierarchy**: Supports Enterprise → Property → Revenue Center for scalable management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming optimized for POS terminals.
- **Real-time Operations**: Utilizes WebSocket communication for KDS updates and CAPS synchronization.
- **Local-First Architecture**: All POS write operations commit to local SQLite first, regardless of connection mode, with background cloud sync.
- **Offline Resilience**: Optional on-premise CAPS with local SQLite for offline operations and cloud synchronization, ensuring an immutable `transaction_journal` for audit trails and exactly-once sync semantics.
- **Non-Destructive Changes**: System modifications are additive, with new features defaulting to OFF/NULL/false to prevent impact on existing enterprises.
- **Context Help Requirement**: Every configuration field in EMC panels requires a corresponding entry in the config help text registry for functional descriptions.
- **WS→CAPS→Cloud Architecture**: All transaction data flows from Workstation (WS) to Central Application Processing Service (CAPS) and then to the Cloud. Cloud sends only configuration data down.

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, React Context, shadcn/ui, Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, RESTful JSON API with WebSocket support.
- **Database**: PostgreSQL with Drizzle ORM.
- **Offline Storage**: Browser IndexedDB for client-side offline resilience, SQLite/SQLCipher for native applications.
- **Native Applications**: Capacitor (Android) and Electron (Windows) wrappers.

### Key Features and Implementations
- **Device Configuration**: Hierarchical setup for Workstations, Printers, and KDS Devices.
- **KDS Order Flow**: Supports "Standard Mode" and "Dynamic Order Mode" with real-time updates and EMC-driven routing.
- **Authentication**: PIN-based employee authentication with role-based access control.
- **Payment Processing**: PCI-compliant, gateway-agnostic framework with semi-integrated architecture and offline capabilities.
- **Printing System**: Database-backed print queue and standalone Print Agent System.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty, Online Ordering, Inventory, Forecasting.
- **Pizza Builder Module**: Visual, full-page interface for pizza customization.
- **Multi-Enterprise Architecture**: Server-side data isolation with distinct access levels.
- **Native Application Capabilities (Windows Electron)**: Embedded print agent, SQLite/SQLCipher for offline data, local reporting, store-and-forward for offline transactions, EMV terminal communication, auto-launch, kiosk mode, and terminal setup wizard.
- **Configuration Inheritance & Override**: Items inherit down the hierarchy with override capabilities tracked via a generic OptionBits system.
- **Concurrency-Safe Check Numbering**: Atomic check number generation ensuring unique, sequential numbers.
- **Reporting**: Canonical Data Access Layer with 7 query functions for FOH/BOH reports.
- **Customer Onboarding Data Import**: Excel-based bulk data import system.
- **Offline Mode Resilience**: Protocol interceptors, cached HTML/JS/CSS, robust handling of offline transactions and manager approvals, CAPS auto-discovery, Yellow Mode for seamless failover, and immutable transaction journal for data integrity. Includes fixes for offline payment, check, and item handling. v3.1.33: Frontend uses Electron IPC (`onConnectionMode`) for connection state instead of own health checks; Vite HMR/WebSocket blocked when offline; TanStack Query configured with `staleTime: Infinity` and `networkMode: 'always'` in Electron; connectivity hysteresis (2 consecutive checks) prevents mode flip-flopping; `/health` returns 503 when offline (never served from page cache); terminal-devices and payment-processors have offline handlers (EMV terminals always visible in all modes). v3.1.34: KDS WebSocket adapts to connection mode (GREEN=cloud, YELLOW=CAPS `/ws/kds`, RED=skip with 10s retry); CAPS auth bypassed for GET KDS read paths (`/kds-tickets`, `/kds-devices`, `/terminal-devices`, `/payment-processors`, etc.) and accepts `x-device-token` header; offline sync expanded from ~37 to 48+ config tables including tax_groups, enterprises, job_codes, privileges, loyalty_programs, loyalty_rewards, gift_cards, employee_assignments, workstation_order_devices, workstation_service_bindings, registered_devices, item_availability, break_rules, fiscal_periods, cash_drawers, drawer_assignments, descriptor_sets; new sync API endpoints for employee-assignments, workstation-service-bindings, workstation-order-devices; SQLite offline schema expanded with 17 new config tables using JSON-blob storage pattern.
- **Send-to-Kitchen Architecture**: Interceptor handles Send locally first, then pre-syncs the check to CAPS before forwarding the send-to-kitchen request. CAPS handler has retry logic (3x, 500ms) if check hasn't arrived yet. `sendToKitchen()` uses EMC routing (menu item → print class → order device → KDS device) and creates KDS tickets internally.
- **CAPS Column Fixups**: `ensureColumnFixups()` uses `db.exec()` for ALTER TABLE DDL with error logging and post-fixup verification via PRAGMA table_info.
- **Workstation Identity and RVC Switching**: Workstation ID is locked after setup, and the login screen allows interactive Revenue Center selection.
- **Device Tracker**: Unified device tracking for both WS and KDS Electron devices.
- **CAPS Service Host Resilience**: Ensures critical database tables exist and robust token management.
- **Real-time Sync Push Notifications**: Critical sync events (transaction success/failure, CAPS connect/disconnect) trigger push notifications via WebSocket and a notification center UI. Server deduplicates CAPS connection notifications (10-min window). Notification panel has visible read/unread dots, Clear All button, auto-mark-read on open, and plain-language messages.

## Bug Fixes Applied
- **Currency Precision**: Service-host `recalculateTotals` now uses integer cents math via `toCents`/`fromCents` helpers to eliminate floating-point rounding errors in check totals.
- **Service Charge Totals**: Service charge add/void routes now use centralized `recalculateCheckTotals()` which includes service charge amounts and tax in the check total calculation.
- **Item Availability Rollback**: Failed add-item operations now call `/api/item-availability/increment` to revert the optimistic quantity decrement, with a corresponding new storage method and API route.
- **Void Idempotency**: `voidItem` in CAPS service returns early if an item is already voided, preventing duplicate journal entries.
- **Check Lock Cleanup**: POS page now releases check locks on `beforeunload` (via `sendBeacon`) and component unmount to prevent lock leaks on navigation.
- **Inactivity Logout Guard**: Inactivity logout timer is paused when the payment modal is open to avoid logging out during active transactions.
- **Order Device Routing Guard**: Workstation form prevents saving before order device routing data has loaded, avoiding accidental wipe of existing routing assignments.
- **Offline Sync Retry Storm (v3.1.53)**: Legacy `syncOfflineData()` in `main.cjs` is now gated behind `!enhancedOfflineDb` to prevent duplicate sync paths. HTTP 400/404/422 responses are treated as permanent failures (no retry). Stale operations (>24h) are auto-expired on first sync cycle. Backoff log spam is suppressed to only emit on count change. `/api/item-availability/increment` added to `LOCAL_FIRST_WRITE_PATTERNS`. CAPS `queue-operation` endpoint derives `type` from endpoint when missing.
- **Full Offline POS Operation (v3.1.54)**: Guarantees 100% offline operation from cold boot. (1) Startup race fixed: `checkConnectivity()` is now awaited before window creation so `isOnline` is correctly set before the protocol interceptor handles any requests — cold boot with no cloud loads POS from bundled assets immediately. (2) HTTP 502/503/504 from cloud treated as network failures: response body is cancelled and the request falls through to CAPS/offline handler — frontend never sees a 5xx. (3) All check/transaction mutation endpoints added to `LOCAL_FIRST_WRITE_PATTERNS`: checks, items, send, payments, discount, void, lock, unlock, close, print, service-charges, capture-with-tip, record-external-payment, loyalty-earn — transactions always write locally first. (4) Labor module returns real offline data: break-rules, job-codes/details, time-punch-status, and item-availability now query the local SQLite instead of returning stubs. (5) TransactionSync log flood suppressed: "Cloud not connected" logs once per disconnect episode.
- **Always-Local Frontend (v3.1.59)**: Protocol interceptor ALWAYS serves bundled assets for non-API requests, regardless of online/offline status. The cloud URL is only used for API routing — never for loading frontend HTML/JS/CSS. Eliminates black screen caused by cloud Replit server being slow/sleeping. `createWindow()` simplified to always load via protocol interceptor without online/offline branching. Vite dev-mode requests unconditionally blocked. SPA route fallback expanded to cover all client routes.
- **Check Pickup After Sync (v3.1.60)**: Cloud sync endpoint now preserves the WS/CAPS-assigned check ID instead of generating a new UUID. Check creation flow: WS asks CAPS for next check number → WS creates check with that number + locally-generated ID → syncs to CAPS → CAPS syncs to Cloud with same ID. The cloud `createCheck` now passes `id: wsCheckId` when the sync data includes the originating ID. Also added `GET /api/checks/:id` and `GET /api/checks/offline_*` to `LOCAL_FIRST_READ_PATTERNS` so individual check fetch routes through the local SQLite interceptor first, enabling check pickup in all connection modes.
- **Complete CAPS-First Audit (v3.1.61)**: All check operations now route through local CAPS database first. (1) Offline discount $0.00 fixed: `applyItemDiscountOffline` looks up discount record from local SQLite and calculates correct amount (percentage or fixed). (2) `_recalcCheckTotals` and `_recalcCheckTotalsWithServiceCharges` both sum item-level `discountAmount` into `check.discountTotal`; taxes calculated on post-discount subtotal. (3) Duplicate modifiers eliminated: Set-based deduplication in modifier-map builder for both modifiers-per-group and groups-per-item. (4) Closed checks handler: `GET /api/rvcs/:rvcId/closed-checks` served from local CAPS SQLite with employee names, item/payment counts. (5) Fulfillment handler: `PATCH /api/checks/:id/fulfillment` works offline for KDS bump operations. (6) Refund handlers: `POST /api/refunds`, `GET /api/refunds/:id`, `GET /api/rvcs/:rvcId/refunds` all create/read locally and queue for cloud sync. (7) Edit closed check UI: "Cancel Edit" replaces Send button, "Change Tender" label on Pay button, amber banner, all item actions disabled — only tender void + new tender allowed. (8) Payment query now filters voided payments and returns `balanceDue`.

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
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
- **CAPS-First Architecture**: Check/transaction data flows through CAPS (YELLOW) or cloud (GREEN). Local SQLite is RED-mode emergency fallback only. Removed from LOCAL_FIRST patterns.
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
- **GREEN→CAPS Warm Sync**: In GREEN mode, after every successful check mutation (POST/PUT/PATCH/DELETE on `/api/checks/*`), the Electron interceptor fetches the full check state from cloud and pushes it to CAPS via `/api/caps/sync/check-state` (fire-and-forget). This keeps CAPS warm so checks are visible immediately when switching to YELLOW mode. Gated to GREEN mode only, with content-type guard.
- **CAPS Column Fixups**: `ensureColumnFixups()` uses `db.exec()` for ALTER TABLE DDL with error logging and post-fixup verification via PRAGMA table_info.
- **v3.1.38 YELLOW Mode Comprehensive Fix**: Fixed all CAPS response format mismatches (GET/POST checks/:id, items, send, payments, reopen, split) to match cloud API shape. Fixed upsertModifier (removed non-existent `code` column, added `rvc_id`), upsertPrintClass (added `rvc_id`), service_charges schema (added 5 missing columns). Added reopenCheck to CAPS engine (actually writes to DB). Added POST /checks/:id/service-charges route. Schema v8 migration for print_classes.display_order and service_charges columns.
- **v3.1.39 CAPS Route Parity Audit**: Comprehensive fix of ALL 19 broken/stub CAPS routes across BOTH `api.ts` AND `embedded.cjs`. Key fixes: (1) `getCheckItems()` returns `menuItemName` + all missing fields (totalPrice, printClassId, taxGroupId, discount fields, sent, itemStatus) in both files. (2) Replaced all stub routes with real DB implementations: PATCH modifiers, POST/DELETE item discount, price-override, void item (returns voided item object). (3) Added missing routes to api.ts: transfer, split, merge, check update, payment void/restore, service charge void, delete item, delete discount, remove customer, direct payments, external payments, time-clock punch, modifier-map, terminal-sessions. (4) Fixed response format mismatches: cancel-transaction returns `{success,voidedCount,remainingActiveItems}`, split returns `{sourceCheck,newChecks}`, merge returns `{check,items}`. (5) Made CapsService `db`, `transactionSync`, `writeJournal`, `getTxnGroupId`, `recalculateTotals` public for route handler access. (6) Full route parity verified between api.ts and embedded.cjs (only CJS-specific `GET /health` differs).
- **Workstation Identity and RVC Switching**: Workstation ID is locked after setup, and the login screen allows interactive Revenue Center selection.
- **Device Tracker**: Unified device tracking for both WS and KDS Electron devices.
- **CAPS Service Host Resilience**: Ensures critical database tables exist and robust token management.
- **Real-time Sync Push Notifications**: Critical sync events (transaction success/failure, CAPS connect/disconnect) trigger push notifications via WebSocket and a notification center UI. Server deduplicates CAPS connection notifications (10-min window). Notification panel has visible read/unread dots, Clear All button, auto-mark-read on open, and plain-language messages.
- **Instant EMC Config Propagation (v3.1.42)**: ALL EMC config mutation routes now call `broadcastConfigUpdate(category, action, entityId, enterpriseId)` to push WebSocket notifications instantly to connected POS/KDS devices. 73+ routes added across: pos_layouts, modifiers, modifier_groups, menu items (delete/import/SLU), major_groups, family_groups, tax_groups, print_classes, order_devices, kds_devices, print_routing, workstations, roles, employees, properties, enterprises, devices, ingredients. Frontend `useConfigSync` hook in `client/src/hooks/use-config-sync.ts` maps 26 categories to specific React Query cache invalidation targets so POS pages refetch instantly without page reload.
- **Config Sync Enterprise Data Isolation (v3.1.43)**: Fixed `/api/sync/config/full` which was returning ALL menu items, modifiers, tax groups, tenders, discounts, service charges, print classes, SLUs, job codes from every enterprise. Now filters by `enterpriseId` (menu items, modifiers, modifier groups, SLUs, tax groups, tenders, discounts, service charges, print classes, job codes) and `propertyId` (order devices). Junction tables (modifier-group-modifiers, menu-item-modifier-groups, order-device-printers, order-device-KDS, print-class-routing) filtered by parent entity IDs. Six standalone sync endpoints (`/api/sync/modifier-group-modifiers`, `/api/sync/menu-item-modifier-groups`, `/api/sync/order-device-printers`, `/api/sync/order-device-kds`, `/api/sync/menu-item-recipe-ingredients`, `/api/sync/workstation-order-devices`) now accept optional `propertyId` for scoped results; invalid `propertyId` returns 404 (not unfiltered data). Service-host sync logging shows enterprise name and property name.

## Clear Sales Data Propagation
- **Cloud**: `clearSalesData` API clears PostgreSQL, then broadcasts `SALES_DATA_CLEARED` to connected service hosts and `sales_data_cleared` POS event to all browser/Electron clients.
- **CAPS Service Host**: Handles `SALES_DATA_CLEARED` WebSocket message by calling `db.clearTransactionalData()` which purges checks, payments, rounds, KDS tickets, transaction journal, fiscal periods, cash transactions, drawer assignments, audit logs, time punches, refunds, gift card transactions, loyalty transactions, item availability, online orders, and sync queue from local SQLite.
- **Electron**: Frontend WebSocket handler forwards `sales_data_cleared` event via IPC (`clear-offline-sales-data`) to main process, which clears both `offlineDb` (offline_queue, offline_payments, offline_checks) and `enhancedOfflineDb` (failed operations + SQLite tables). Also invalidates TanStack Query cache for checks, reports, sales-summary, fiscal, and KDS queries.

## Transaction Data Flow by Connection Mode
| Mode | Check Operations | Print | KDS | Payments |
|---|---|---|---|---|
| GREEN (Cloud reachable) | Cloud API directly | Cloud → Print Agent WS | Cloud WebSocket | Cloud API + EMV |
| YELLOW (CAPS reachable) | CAPS proxy `/api/checks/*` | CAPS PrintController TCP | CAPS `/ws/kds` | CAPS + EMV |
| RED (Emergency offline) | Local SQLite fallback | Local queue → Print Agent | Unavailable | Cash only |

Key files: `electron/main.cjs` (LOCAL_FIRST patterns, CAPS proxy), `electron/offline-api-interceptor.cjs` (RED-mode gating), `service-host/src/routes/api.ts` (cloud-compatible CAPS routes including `/checks/orders`).

## Bug Fixes Applied
- **Currency Precision**: Service-host `recalculateTotals` now uses integer cents math via `toCents`/`fromCents` helpers to eliminate floating-point rounding errors in check totals.
- **Service Charge Totals**: Service charge add/void routes now use centralized `recalculateCheckTotals()` which includes service charge amounts and tax in the check total calculation.
- **Item Availability Rollback**: Failed add-item operations now call `/api/item-availability/increment` to revert the optimistic quantity decrement, with a corresponding new storage method and API route.
- **Void Idempotency**: `voidItem` in CAPS service returns early if an item is already voided, preventing duplicate journal entries.
- **Check Lock Cleanup**: POS page now releases check locks on `beforeunload` (via `sendBeacon`) and component unmount to prevent lock leaks on navigation.
- **Inactivity Logout Guard**: Inactivity logout timer is paused when the payment modal is open to avoid logging out during active transactions.
- **Order Device Routing Guard**: Workstation form prevents saving before order device routing data has loaded, avoiding accidental wipe of existing routing assignments.

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
# Cloud POS System — V3.1.8

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system for Quick Service Restaurants (QSRs) in high-volume environments. It provides a scalable solution with extensive administrative configuration and real-time operational features, supporting a multi-property hierarchy, KDS integration, and enterprise functionalities like fiscal close, cash management, gift cards, loyalty, inventory, forecasting, and online ordering integration. The system uses a Simphony-class design for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. Its vision is to be a highly flexible and reliable POS system for various QSR operations, ensuring continuous service even offline, and supporting both web and native applications (Android & Windows).

## User Preferences
Preferred communication style: Simple, everyday language.
- **Release Notes Requirement**: Whenever a new Electron installer version is created (version bump in `electron/electron-builder.json`), always generate release notes summarizing all changes included in that version. Format them for use as GitHub Release descriptions.
- **Database Schema Documentation**: The file `DATABASE_SCHEMA.md` in the project root is a living reference document that must be kept up to date whenever any database schema changes are made (new tables, columns, constraints, indexes, or relationship changes).

## System Architecture

### Core Design Principles
- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center for scalable management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming optimized for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS updates and CAPS synchronization.
- **Offline Resilience**: Optional on-premise CAPS with local SQLite for offline operations and cloud synchronization, featuring an immutable `transaction_journal` for an audit trail and exactly-once sync semantics.
- **Non-Destructive Changes**: All system modifications must be additive, with new features defaulting to OFF/NULL/false to avoid impacting existing enterprises.
- **Context Help Requirement**: Every option bit or configuration field in EMC panels must have a corresponding entry in the config help text registry (`client/src/lib/config-help-registry.ts`) describing its function.

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, React Context, shadcn/ui, Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, RESTful JSON API with WebSocket support.
- **Database**: PostgreSQL with Drizzle ORM.
- **Offline Storage**: Browser IndexedDB for client-side offline resilience.
- **Native Applications**: Capacitor (Android) and Electron (Windows) wrappers for web app deployment with 100% feature parity.

### Key Features and Implementations
- **Device Configuration**: Hierarchical setup for Workstations, Printers, and KDS Devices.
- **KDS Order Flow**: Supports "Standard Mode" and "Dynamic Order Mode" with real-time updates.
- **Authentication**: PIN-based employee authentication with role-based access control.
- **Time & Attendance**: Time clock, timecards, scheduling, and labor analytics.
- **Payment Processing**: PCI-compliant, gateway-agnostic framework with semi-integrated architecture for card-present transactions.
- **Printing System**: Database-backed print queue and standalone Print Agent System supporting network, serial, and Windows Print Spooler.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty Programs, Online Ordering, Inventory, Sales & Labor Forecasting.
- **Pizza Builder Module**: Visual, full-page interface for pizza customization.
- **Multi-Enterprise Architecture**: Server-side data isolation with distinct access levels (`system_admin`, `enterprise_admin`, `property_admin`).
- **Native Application Capabilities (Windows Electron)**: Embedded print agent, SQLite/SQLCipher for offline data caching, local reporting, store-and-forward for offline transactions, EMV terminal communication, auto-launch, kiosk mode, and terminal setup wizard.
- **Configuration Inheritance & Override**: Items inherit down the hierarchy, with override capabilities tracked, using a generic OptionBits system for extensible key-value configuration flags with scope-based inheritance.
- **Concurrency-Safe Check Numbering**: Atomic check number generation ensuring unique, sequential numbers.
- **Stress Test Infrastructure**: API-driven and visual POS stress testing for performance evaluation.
- **Reporting**: Canonical Data Access Layer with 7 query functions for FOH/BOH reports (e.g., Z Report, Cash Drawer, Daily Sales Summary), including report validation.
- **Customer Onboarding Data Import**: Excel-based bulk data import system.
- **Delivery Platform Integration APIs**: Direct API integrations with Uber Eats, DoorDash, and Grubhub.
- **Workstation Order Device Routing**: Per-workstation control over which order devices can receive orders.
- **Payment Gateway Configuration**: Hierarchical payment gateway configuration system with dynamic UI driven by gateway type.
- **Service-Host Schema Verification CLI**: Tool to verify the integrity and structure of the live SQLite database in read-only mode.
- **Auditor Role Option Matrix**: 31 privilege codes across 4 flag groups with per-role threshold limits, enforced in discount and price override endpoints.
- **LocalEffectiveConfig**: Provides scope-based OptionBits resolution from local SQLite with precedence.
- **Immutable Transaction Journal**: `transaction_journal` table in service-host SQLite for all CAPS and KDS mutations, ensuring append-only entries and exactly-once sync.
- **Config-Driven Tax & Tender**: `recalculateTotals()` uses per-item `tax_group_id` for flexible tax calculations; `addPayment()` enforces tender behavior flags.
- **Offline Reporting**: `GET /api/caps/reports/daily-summary` returns key metrics from local SQLite.
- **Proof Mode**: Automated 8-phase verification for schema init, config seeding, offline POS/KDS operations, tender/close, journal integrity, persistence, and idempotency.
- **Property-Level CAPS Designation**: CAPS server is designated at the Property level via `capsWorkstationId` column — a dropdown in the Property EMC form selects which workstation serves as the local check processing hub. The `activation-config` endpoint resolves the CAPS workstation's IP for all other workstations in the property. CAPS badge shown on workstation list.
- **CAPS Auto-Discovery & Yellow Mode (v3.1)**: Electron main process calls `activation-config` on startup, discovers CAPS workstation, caches `serviceHostUrl`. When internet drops: CAPS workstation auto-starts embedded service-host on port 3001; other workstations proxy API calls to CAPS (Yellow mode) before falling to local SQLite (Red mode). Connection mode (green/yellow/red) is sent to renderer via IPC.
- **Embedded Service-Host Bundle**: `service-host/src/` is compiled via esbuild into `electron/service-host-embedded.cjs` and bundled in the Electron app. CAPS workstation auto-starts it as a child process on port 3001 with auto-restart on crash.
- **Offline Mode Resilience (v3.1.4)**: Protocol interceptor has 8-second fetch timeout (with AbortSignal.timeout fallback) preventing app freeze on internet drop. Known-offline state serves cached HTML/JS/CSS from disk instantly. Offline check totals correctly calculated with tax from cached rates. Item deletion recalculates totals. Heartbeat endpoint handled offline. Connectivity check interval adapts: 30s when green, 15s when yellow/red for faster recovery detection.

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

### Offline Mode (v3.1.5)
- Offline login returns `salariedBypass: true` to bypass clock-in gate (labor rules can't be enforced offline)
- Frontend detects `offlineAuth` flag and fast-paths directly to POS screen
- CAPS failover timeout: 3 seconds (was 10s)
- `Promise.race` backup on `electronNet.fetch` in case `AbortSignal.timeout` is ignored
- All frontend raw `fetch()` calls have 5-second AbortController timeouts
- Offline handlers exist for: auth/login, time-punches/status, employees/job-codes, heartbeat, checks, payments, workstation context, break-rules, health

### Offline Mode (v3.1.6) — Full POS FOH Support
- Clock In/Out button reactively hidden when offline (uses `onOfflineModeChange` listener)
- Clock-in, scheduling, and labor features completely disabled in offline/standalone mode
- New offline handlers: cash-drawer-kick, capture-with-tip, check-payments void, service-charge void, customer removal, service charges GET, client-ip GET
- Card processing / Stripe / terminal sessions return clear "requires cloud" error offline
- Check merge / loyalty earn return clear "requires cloud" error offline
- External payment recording queued for sync when back online
- Service charges fetch has 5-second timeout with try/catch fallback to empty array
- Expanded write/delete endpoint whitelists to cover all POS operations

### Offline Mode (v3.1.7) — Split-Brain Fix
- **Root cause fixed:** Frontend had three independent systems (queryClient, ConnectionModeContext, offline-status-banner) all competing to determine online/offline state, with none listening to Electron's authoritative IPC
- `electron/preload.cjs`: Added `onConnectionMode` IPC listener and `getConnectionMode` invoke handler — renderer can now receive Electron's connection-mode events ('green'/'yellow'/'red')
- `electron/main.cjs`: Added `get-connection-mode` IPC handler returning current `connectionMode`
- `client/src/lib/queryClient.ts`: Added `electronOfflineLock` flag — when Electron says offline, fetch responses cannot override back to online. Added `X-Offline-Mode` and `X-Offline-Cache` header checks so interceptor-originated 200 responses don't trigger `setOfflineMode(false)`
- `client/src/contexts/connection-mode-context.tsx`: When running in Electron, uses `onConnectionMode` IPC as single source of truth; HTTP polling completely disabled in Electron mode. `checkEndpoint()` checks for `X-Offline-Mode` header
- `client/src/components/offline-status-banner.tsx`: `onOnlineStatus` IPC handler engages/releases `electronOfflineLock` directly
- Architecture: Electron main → IPC `connection-mode` → ConnectionModeContext → `setElectronOfflineLock()` → queryClient locked — no split-brain possible

### Device Monitoring (v3.1.8) — Unified Heartbeat & Visibility
- **Heartbeat token guard:** `useWorkstationHeartbeat` now checks `X-Device-Token` before sending registered-device heartbeat — eliminates 400 errors from unregistered devices
- **Unified status-summary:** `/api/registered-devices/status-summary` checks BOTH `registered_devices.lastAccessAt` AND `workstations.lastSeenAt` — device shows "connected" if either heartbeat is recent (5 min window)
- **Cross-update:** Workstation heartbeat endpoint (`/api/system-status/workstation/heartbeat`) now also updates linked `registered_devices.lastAccessAt` — ensures devices appear connected even without device token
- **Enriched status response:** Status summary now returns `lastHeartbeatAge`, `connectionMode`, `ipAddress`, `osInfo`, `workstationId`, `workstationName` for each device
- **Server device logging:** `[DeviceTracker]` structured logs on every heartbeat (WS and device). Periodic 60-second summary: `[DeviceTracker] Online: WS01(green), EXPO1(green) | Disconnected: EXPO2`
- **CAPS device tracking:** `service-host/src/index.ts` has `CapsDeviceTracker` class tracking devices proxying through CAPS. `GET /api/caps/connected-devices` endpoint. Periodic 60-second CAPS status log
- **Electron enhanced logging:** `checkConnectivity()` logs mode transitions with detail. 60-second periodic status summary. Offline interceptor tracks request counts per period
- **Feature Availability Matrix:** `POS_Feature_Availability_Matrix.csv` documents ~120 features across GREEN/YELLOW/RED modes
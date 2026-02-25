# Cloud POS System — V3.0

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system specifically designed for Quick Service Restaurants (QSRs) operating in high-volume environments. It delivers a scalable and robust solution with extensive administrative configuration capabilities and real-time operational features. The system supports a multi-property hierarchy, integrates with Kitchen Display Systems (KDS), and includes comprehensive enterprise functionalities such as fiscal close, cash management, gift cards, loyalty programs, inventory, forecasting, and online ordering integration. It employs a Simphony-class design for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. The vision is to provide a highly flexible and reliable POS system deployable across various QSR operations, ensuring continuous service even in offline conditions, and supporting both web and native application environments (Android & Windows).

## Current Version
- **Cloud POS**: V3.0.0 (configuration-driven architecture)
- **Electron Desktop**: v3.0.0 (electron-builder.json)
- **Service-Host Schema**: V4 (tenders behavior/media, RVC print, emc_option_flags)

## GitHub Repository
- **URL**: https://github.com/griffd12/Cloud-PosV3.0
- All Cloud POS V3.0 files are uploaded and stored in this repository.

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
- **Offline Resilience**: Optional on-premise CAPS with local SQLite for offline operations and cloud synchronization. Service-host SQLite schema (v4) mirrors cloud schema for tenders (behavior + media flags), RVCs (print flags), and `emc_option_flags` (OptionBits with scope resolution).
- **Non-Destructive Changes**: All system modifications must be additive and not alter existing enterprise configurations. New features must be optional and default to OFF/NULL/false for existing enterprises. Specifically:
  - All new boolean option bits / feature flags in any schema table MUST default to `false` (never `true`).
  - New text/integer config fields MUST default to `null` (no value) unless there is an explicit reason.
  - This ensures existing running enterprises are never impacted by newly added features.
- **Context Help Requirement**: Every option bit or configuration field added to EMC panels MUST have a corresponding entry in the config help text registry (`client/src/lib/config-help-registry.ts`). The help text must describe in plain English what the option does and what happens when it is enabled. The `ContextHelpWrapper` component renders a help icon (?) next to each field label that shows this description on click.

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
- **Payment Processing**: PCI-compliant, gateway-agnostic framework.
- **Printing System**: Database-backed print queue and standalone Print Agent System supporting three connection types: network (TCP/IP), serial (COM port), and Windows Print Spooler (USB printers via PowerShell raw port access). Printer discovery via `DISCOVER_PRINTERS` WebSocket message enumerates Windows printers through `Get-WmiObject Win32_Printer`.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty Programs, Online Ordering, Inventory, Sales & Labor Forecasting.
- **Pizza Builder Module**: Visual, full-page interface for pizza customization.
- **Multi-Enterprise Architecture**: Server-side data isolation enforced via `getEnforcedEnterpriseId()` helper; `system_admin`, `enterprise_admin`, `property_admin` access levels.
- **Native Application Capabilities (Windows Electron)**: Embedded print agent, SQLite/SQLCipher for offline data caching, local reporting, store-and-forward for offline transactions, EMV terminal communication, auto-launch, kiosk mode, and a terminal setup wizard.
- **Offline Database Sync**: Critical POS tables synced from cloud to offline database.
- **Electron Protocol Interceptor**: Routes API calls to local SQLite when offline and serves cached static assets.
- **Offline-Aware Fetch**: `fetchWithTimeout()` and `getQueryFn` cache GET responses to IndexedDB and serve cached data transparently when offline.
- **Orders Screen Redesign**: Card-based orders view with order type tabs and filters, displaying order details and quick-action buttons for lifecycle management.
- **Customer Member Enrollment**: Allows member creation from POS with auto-enrollment in active loyalty programs.
- **EMC Simphony-Style MDI Layout**: Three-panel layout (hierarchy tree, category navigation, configuration panels) with inline rendering.
- **Configuration Inheritance & Override**: Items inherit down the hierarchy, with override capabilities tracked via `config_overrides` table. A generic OptionBits system (`emc_option_flags` table) provides extensible key-value configuration flags with scope-based inheritance (enterprise → property → RVC → workstation). Runtime uses batch loading via `server/config/optionBits.ts` with 60-second in-memory cache and `EffectiveConfig` accessor class in `server/config/resolveEffectiveConfig.ts`. EMC UI uses `client/src/components/admin/option-bits-panel.tsx` reusable component with inherited value display, override toggle, and reset. API routes: GET/PUT/DELETE `/api/option-flags`. Reporting logic uses tender media flag columns (`is_cash_media`, `is_card_media`, `is_gift_media`), not tender type strings. Electron offline SQLite includes `emc_option_flags` table with scope-aware resolution and syncs flags during `syncFromCloud()`.
- **Concurrency-Safe Check Numbering**: Atomic check number generation using `rvc_counters` table and `createCheckAtomic()` method to ensure unique, sequential numbers without gaps.
- **Stress Test Infrastructure**: API-driven and visual POS stress testing for performance evaluation, generating realistic transactions with configurable parameters and automatic data cleanup.
- **Display Font Scaling**: Per-workstation and per-KDS-device font size control using root font-size scaling.
- **Auto-Startup on Boot (Windows)**: Registers POS or KDS for auto-launch using Electron's `setLoginItemSettings`.
- **Service Charge Ledger System**: `check_service_charges` transactional table with configuration fields on `service_charges`, supporting application API, manual override, and voiding.
- **Canonical Reporting DAL**: 7 query functions (`v_sales_lines`, `v_check_discounts`, etc.) parameterized by `propertyId` + `businessDate`.
- **FOH/BOH Reports**: 6 report endpoints including Z Report, Cash Drawer Report, Cashier Report, Daily Sales Summary, Labor Summary, and Tip Pool Summary.
- **Report Validation**: `/api/reports/validate` runs 4 invariant checks for reconciliation and data integrity.
- **Cash Drawer Enforcement**: Cash tenders require `drawerAssignmentId`; `cash_transactions` rows are auto-created for sales/refunds.
- **Customer Onboarding Data Import**: Excel-based bulk data import system covering all database entities with dependency ordering and cross-sheet validation.
- **Delivery Platform Integration APIs**: Direct API integrations with Uber Eats, DoorDash, and Grubhub for order parsing, acceptance, menu sync, and store status management.
- **Workstation Order Device Routing**: Per-workstation control over which order devices can receive orders, via `workstation_order_devices` junction table. When configured, the KDS routing engine intersects the menu item's Print Class devices with the workstation's allowed devices. Defaults to all devices when no assignments exist (backward compatible).
- **Payment Gateway Configuration**: Hierarchical payment gateway configuration system (`payment_gateway_config` table) with Simphony-style inheritance (Enterprise → Property → Workstation). EMC configuration panel shows inherited values with badges and override toggles. API routes support CRUD and merged config resolution via `getMergedPaymentGatewayConfig()`. Gateway-aware UI: selecting a gateway type (Heartland, Elavon, Stripe, Shift4, etc.) dynamically shows only supported fields with processor-specific labels, descriptions, and connection field names. "Apply Defaults" button pre-fills recommended settings per processor. Driven by `client/src/lib/gateway-field-registry.ts`.
- **Semi-Integrated Payment Architecture**: Card-present payment processing uses a semi-integrated model where the POS sends high-level commands (sale, void, refund) to physical payment terminals, and the terminals handle card reading, EMV chip processing, and processor communication. This eliminates PCI scope for card data and shifts certification responsibility to terminal vendors. Integration model classification: `direct` (POS talks to processor API), `direct_with_terminal` (Stripe — uses own SDK for both online and terminal), `semi_integrated` (Heartland Pay App, Elavon Fusebox, Ingenico, Shift4, FreedomPay, Eigen). Interface defined in `server/payments/semi-integrated-types.ts`, Heartland adapter in `server/payments/adapters/heartland-semi-integrated.ts`.
- **Service-Host Schema Verification CLI**: `verify-schema` subcommand runs against the live SQLite DB in read-only mode and prints a deterministic PASS/FAIL report covering: (A) tenders behavior+media columns, (B) RVC print columns, (C) emc_option_flags table+columns, (D) index proof with UNIQUE composite verification, (E) backfill counts, (F) duplicate CREATE TABLE rvcs guard. Run via `node dist/index.js verify-schema --data-dir <path>` on Windows or `npm run verify-schema` in dev. No cloud connection required.
- **Auditor Role Option Matrix**: 31 privilege codes across 4 flag groups (`pricing_flags`, `check_ops_flags`, `tender_flags`, `admin_flags`) with per-role threshold limits via `role_rules` table. 7 standard roles (Clock In Only, Cashier, Server, Bartender, Manager, System Admin, Enterprise Admin) seeded with privilege assignments and threshold values from auditor's Excel specification. Role-based enforcement in discount and price override endpoints: exceeding limits triggers 403 with `requiresManagerApproval` flag. OptionBitsPanel displays flags grouped by category with collapsible accordion sections. EMC "Role Rules" tab provides threshold configuration and option permissions per role. Price override recalculates existing discounts and caps them at new price; `recalculateCheckTotals()` floors net subtotal at $0.

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
- Stripe (direct_with_terminal — card-not-present / online + Stripe Terminal SDK for card-present)
- Elavon Converge (semi_integrated — EMV terminal)
- Elavon Fusebox (semi_integrated — EMV terminal with multi-processor support)
- Heartland / Global Payments (semi_integrated — Heartland Pay App on terminal)
- North / Ingenico SI (semi_integrated — Cloud WebSocket API to Ingenico terminals)
- Shift4 (semi_integrated — UTG gateway to terminal)
- FreedomPay (semi_integrated — FreedomPay API to terminal)
- Eigen (semi_integrated — terminal integration)
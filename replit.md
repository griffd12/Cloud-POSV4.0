# Cloud POS System

## Overview
This project is an enterprise cloud-based Point of Sale (POS) system designed for high-volume Quick Service Restaurants (QSRs). It provides a scalable solution with comprehensive administrative configuration and real-time operational features, supporting a multi-property hierarchy and integration with kitchen display systems (KDS). The system includes enterprise functionalities such as fiscal close, cash management, gift cards, loyalty programs, inventory management, forecasting, and online ordering integration. It employs a Simphony-class design for configuration inheritance with override capabilities and offers an optional Central Application Processing Service (CAPS) for hybrid cloud/on-premise offline resilience. The system aims to be a flexible and reliable POS for various QSR operations, ensuring continuous service even offline, and supporting both web and native applications (Android & Windows).

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
- **Local-First Architecture (v3.1.16+)**: ALL POS write operations (checks, items, payments, voids, discounts, transfers, reopens) commit to local SQLite FIRST, regardless of connection mode. Cloud sync is background-only and never blocks the UI. Mode detection uses real DB probes (`/api/health/db-probe` with actual SELECT query), not just health pings. Status bar shows truth: mode + pending sync count + local DB health.
- **Offline Resilience**: Features an optional on-premise CAPS with local SQLite for offline operations and cloud synchronization, ensuring an immutable `transaction_journal` for audit trails and exactly-once sync semantics.
- **Non-Destructive Changes**: System modifications are additive, with new features defaulting to OFF/NULL/false to prevent impact on existing enterprises.
- **Context Help Requirement**: Every configuration field in EMC panels requires a corresponding entry in the config help text registry for functional descriptions.

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, React Context, shadcn/ui, Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, RESTful JSON API with WebSocket support.
- **Database**: PostgreSQL with Drizzle ORM.
- **Offline Storage**: Browser IndexedDB for client-side offline resilience.
- **Native Applications**: Capacitor (Android) and Electron (Windows) wrappers for web app deployment with full feature parity.

### Key Features and Implementations
- **Device Configuration**: Hierarchical setup for Workstations, Printers, and KDS Devices.
- **KDS Order Flow**: Supports "Standard Mode" and "Dynamic Order Mode" with real-time updates.
- **Authentication**: PIN-based employee authentication with role-based access control.
- **Payment Processing**: PCI-compliant, gateway-agnostic framework with semi-integrated architecture.
- **Printing System**: Database-backed print queue and standalone Print Agent System.
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty, Online Ordering, Inventory, Forecasting.
- **Pizza Builder Module**: Visual, full-page interface for pizza customization.
- **Multi-Enterprise Architecture**: Server-side data isolation with distinct access levels.
- **Native Application Capabilities (Windows Electron)**: Includes embedded print agent, SQLite/SQLCipher for offline data, local reporting, store-and-forward for offline transactions, EMV terminal communication, auto-launch, kiosk mode, and terminal setup wizard.
- **Configuration Inheritance & Override**: Items inherit down the hierarchy with override capabilities tracked via a generic OptionBits system.
- **Concurrency-Safe Check Numbering**: Atomic check number generation ensuring unique, sequential numbers.
- **Reporting**: Canonical Data Access Layer with 7 query functions for FOH/BOH reports (e.g., Z Report, Cash Drawer, Daily Sales Summary).
- **Customer Onboarding Data Import**: Excel-based bulk data import system.
- **Delivery Platform Integration APIs**: Direct API integrations with Uber Eats, DoorDash, and Grubhub.
- **Offline Mode Resilience**: Features protocol interceptors, cached HTML/JS/CSS, and robust handling of offline transactions and manager approvals. CAPS auto-discovery and Yellow Mode provide seamless failover, while an immutable transaction journal ensures data integrity during synchronization.
- **Workstation Identity and RVC Switching**: Workstation ID is locked after setup, and the login screen allows interactive Revenue Center selection.
- **Device Tracker**: Unified device tracking for both WS and KDS Electron devices. KDS devices automatically tracked via ticket polling (kdsDeviceId fallback), WS devices tracked from login screen heartbeat. DeviceTracker summary shows device type (WS/KDS) and connection mode. Throttled DB writes (30s) to avoid excessive updates from 2s KDS polling.
- **CAPS Service Host Resilience**: Service host SQLite schema creation uses `ensureCriticalTables()` fallback to individually create essential tables (schema_version, sync_metadata, config_cache, sync_queue) if the main schema exec partially fails. Critical tables are also ensured in the Database constructor (not just `initialize()`) so they exist before ConfigSync or other constructors query them. Missing token triggers exit code 2 with patient 60-second retry instead of 5-second crash loop. Token is fetched fresh from cloud on each startup if missing from local config. Service host logger resolves log directory from `SERVICE_HOST_DATA_DIR` env var to avoid EPERM errors when running from Program Files.

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
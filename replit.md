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

### Core Design Principles
- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center management.
- **Simphony-Class Configuration**: Configuration inheritance with override capabilities.
- **Touch-First UI**: High-contrast theming for POS terminals.
- **Real-time Operations**: WebSocket communication for KDS and CAPS synchronization.
- **Local-First Architecture**: All POS write operations commit to local SQLite first, with background cloud sync.
- **Offline Resilience**: On-premise CAPS with local SQLite for offline operations, ensuring an immutable `transaction_journal`.
- **Non-Destructive Changes**: New features default to OFF/NULL/false to prevent impact on existing enterprises.
- **Context Help**: Every configuration field requires help text.
- **WS→CAPS→Cloud Architecture**: Transaction data flows from Workstation (WS) to CAPS then to Cloud; Cloud sends configuration down.

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
- **Concurrency-Safe Check Numbering**: Atomic, unique, sequential check numbers.
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
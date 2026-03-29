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
- **Database**: PostgreSQL with Drizzle ORM (cloud), SQLite via better-sqlite3 (local failover).

### Local Failover Server (LFS) Architecture
The same Express codebase runs against either PostgreSQL (cloud) or SQLite (local) based on `DB_MODE`. LFS handles offline operations, syncing configuration and transactions between local SQLite and the cloud PostgreSQL.

- **DB Modes**: `DB_MODE=local` uses SQLite; unset/cloud uses PostgreSQL.
- **Schema Management**: `sqlite-init.ts` auto-generates SQLite schema from PostgreSQL Drizzle definitions.
- **Config Sync**: Background service pulls config from cloud to local SQLite and pushes transactions up.
- **Auto-Failover**: Browser-side `ConnectionManager` detects cloud connectivity and transparently routes API/WebSocket traffic to LFS URL on failure, and back to cloud upon recovery. The LFS URL is configured per-device via the "Service Host URL" field in EMC on both Workstation and KDS Device edit forms (Network Settings section). For workstations, `ConnectionManager.initFromWorkstation()` reads it at login; for KDS, it's set during KDS device selection.
- **PIN Auth Parity**: Both cloud and LFS use direct string equality for PIN verification (NOT bcrypt). PINs are stored as plain text in `pin_hash` column and compared directly.
- **Connect-to-Server Protocol Detection**: The server setup page auto-detects private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, localhost) and defaults to `http://`. For public URLs without protocol, tries `https://` first, falls back to `http://`.
- **Offline Payments (Store-and-Forward)**: LFS processes payments locally for SAF-capable terminals, recording them as `pending_settlement`. Payments are later reconciled with the cloud via server-to-server calls.
- **LFS Packaging & Admin**: Includes build scripts for self-contained distributions, Windows installer as a service, system tray indicator, admin dashboard for status/config/logs, and auto-update mechanism.
- **LFS Management in EMC**: Per-property API key generation/rotation/revocation for LFS authentication, connection status monitoring, sync history logging, and first-run setup instructions. EMC route: `/emc/lfs-management` (property-only, Hierarchy nav group). DB tables: `lfs_configurations`, `lfs_sync_logs`. API routes protected by EMC session auth with enterprise/property scope enforcement.

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
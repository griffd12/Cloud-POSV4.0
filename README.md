# Cloud POS V3.0

Enterprise cloud-based Point of Sale system for Quick Service Restaurants (QSRs), delivering a scalable, configuration-driven platform with offline resilience and multi-property management.

## What's New in V3.0

Version 3.0 represents a fundamental architectural shift from hardcoded POS logic to a **fully configuration-driven platform** built on Simphony-class design principles:

- **Behavioral Configuration**: Tender behavior (drawer kicks, tips, over-tendering, receipt printing, manager approval) controlled via database flags instead of hardcoded type checks
- **Media Classification**: Reporting queries use flag columns (`is_cash_media`, `is_card_media`, `is_gift_media`) instead of string matching
- **OptionBits System**: Generic key-value configuration flags with scope-based inheritance (Enterprise → Property → Revenue Center → Workstation)
- **RVC Print Configuration**: Granular per-RVC control over receipt modes, kitchen printing, void slips, and guest count requirements
- **Full Offline Parity**: Service-host SQLite schema V4 mirrors cloud PostgreSQL for all configuration-driven features
- **Schema Verification CLI**: Production SQLite validation with 6-section PASS/FAIL reporting

## Key Features

- **Multi-Property Hierarchy**: Enterprise → Property → Revenue Center management structure
- **Configuration Inheritance**: Simphony-class override system — settings cascade down the hierarchy with per-level overrides
- **Touch-First POS**: High-contrast UI optimized for POS terminals with configurable font scaling
- **Kitchen Display System (KDS)**: Real-time order routing with Standard Mode and Dynamic Order Mode
- **Offline Resilience**: Browser IndexedDB caching, Electron SQLite database, and optional CAPS service-host for hybrid cloud/on-premise operation
- **PIN-Based Authentication**: Employee login with role-based access control
- **Payment Processing**: PCI-compliant, gateway-agnostic framework supporting semi-integrated EMV terminals (Heartland, Elavon, Shift4, FreedomPay, Ingenico, Eigen) and direct integrations (Stripe)
- **Printing System**: Database-backed print queue with network, serial, and Windows Print Spooler support
- **Enterprise Features**: Fiscal Close, Cash Management, Gift Cards, Loyalty Programs, Inventory, Sales & Labor Forecasting
- **Delivery Integration**: Direct APIs for Uber Eats, DoorDash, and Grubhub
- **Comprehensive Reporting**: Z Report, Cash Drawer, Cashier, Daily Sales, Labor Summary, Tip Pool reports with reconciliation validation
- **Data Import**: Excel-based bulk onboarding with dependency ordering and cross-sheet validation
- **Pizza Builder**: Visual full-page interface for pizza customization
- **Time & Attendance**: Time clock, timecards, scheduling, and labor analytics

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express, TypeScript, RESTful API + WebSocket |
| Database | PostgreSQL with Drizzle ORM |
| Desktop | Electron (Windows) with SQLite/SQLCipher |
| Mobile | Capacitor (Android) |
| State | TanStack React Query, React Context |
| Routing | Wouter (frontend), Express Router (backend) |
| Offline | Browser IndexedDB, Electron SQLite, CAPS service-host |

## Project Structure

```
cloud-pos-v3.0/
├── client/                  # React frontend application
│   └── src/
│       ├── components/      # UI components (admin, POS, KDS, shared)
│       ├── contexts/        # React context providers
│       ├── hooks/           # Custom React hooks
│       ├── lib/             # Utilities, config registries, query client
│       └── pages/           # Page components (POS, KDS, Admin, etc.)
├── server/                  # Express backend
│   ├── config/              # OptionBits, effective config resolution
│   ├── payments/            # Payment gateway adapters
│   ├── integrations/        # Delivery platform integrations
│   ├── routes.ts            # API route definitions
│   ├── storage.ts           # Storage interface (Drizzle ORM)
│   └── reporting-*.ts       # Canonical reporting DAL and routes
├── shared/                  # Shared types and schemas
│   └── schema.ts            # Drizzle schema definitions
├── electron/                # Windows desktop wrapper
│   ├── main.cjs             # Electron main process
│   ├── preload.cjs          # Context bridge
│   ├── offline-database.cjs # Local SQLite for offline ops
│   ├── electron-builder.json# Build configuration
│   └── assets/              # Icons and branding
├── service-host/            # CAPS on-premise service
│   └── src/
│       ├── db/              # SQLite schema and database manager
│       ├── sync/            # Cloud-to-local config sync
│       ├── services/        # CAPS, payment controller
│       ├── routes/          # Local API endpoints
│       └── verify-schema.ts # Schema verification CLI
├── print-agent/             # Windows print agent
├── android/                 # Capacitor Android wrapper
├── migrations/              # PostgreSQL migration files
├── .github/workflows/       # CI/CD (Electron build)
└── docs/                    # Additional documentation
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- npm

### Development Setup

```bash
# Install dependencies
npm install

# Start development server (frontend + backend)
npm run dev
```

The development server starts both the Vite frontend dev server and the Express backend on the same port.

### Environment Variables

The application requires a PostgreSQL `DATABASE_URL` connection string. Additional configuration for payment gateways, delivery platforms, and other integrations can be set through environment variables.

## Current Version

**v3.1.111** | Schema Version 22 | March 27, 2026

Latest changes: Shift scheduling sync (shift_templates + shifts), employee date-of-birth sync. See `electron/RELEASE_NOTES_v3.1.111.md` for full details.

## Building the Windows Desktop App

The Electron build produces a Windows installer (`.exe`) that packages the React frontend, Express backend, and CAPS service-host engine into a single desktop application.

### Quick Build

```bash
node electron/bump-version.cjs patch && npm run build && npx electron-builder --config electron/electron-builder.json --win
```

### Step-by-Step Build

```bash
# 1. Bump version (updates build-info.json, electron-builder.json, service-host-embedded.cjs)
node electron/bump-version.cjs patch   # 3.1.110 → 3.1.111

# 2. Build the web application (React frontend + Express backend → dist/)
npm run build

# 3. Build the Electron installer
npx electron-builder --config electron/electron-builder.json --win
```

The installer will be output to `electron-dist/Cloud POS-{version}-Setup.exe`.

### CI/CD Build

The repository includes a GitHub Actions workflow (`.github/workflows/electron-build.yml`) that builds the Windows installer on `windows-latest` and uploads it to GitHub Releases. It can be triggered manually via workflow_dispatch or automatically on release publication.

See `electron/BUILD.md` for the complete build guide including architecture diagrams, native dependencies, troubleshooting, and the three-layer runtime architecture.

## Service-Host (CAPS)

The service-host provides on-premise offline resilience with local SQLite storage that syncs with the cloud:

```bash
# Start service-host
node dist/index.js --cloud <url> --token <token> --service-host-id <id> --data-dir <path>

# Verify schema (no cloud connection required)
node dist/index.js verify-schema --data-dir C:\POS\data
```

## Architecture Notes

### Configuration Inheritance

Settings cascade through the hierarchy with override capabilities:

```
Enterprise (global defaults)
  └── Property (property-level overrides)
       └── Revenue Center (RVC-level overrides)
            └── Workstation (device-level overrides)
```

The `config_overrides` table tracks which settings have been explicitly overridden at each level. The `emc_option_flags` table provides the OptionBits system for generic key-value flags with the same inheritance model.

### Non-Destructive Changes

All system modifications follow strict additive rules:
- New boolean flags default to `false`
- New text/integer fields default to `null`
- Existing enterprise configurations are never impacted by new features

### Offline Operation

The system supports three levels of offline resilience:
1. **Browser IndexedDB**: Cached GET responses served transparently when offline
2. **Electron SQLite**: Critical POS tables synced locally with store-and-forward for transactions
3. **CAPS Service-Host**: Full on-premise processing with cloud synchronization

## Documentation

- `DATABASE_SCHEMA.md` — Complete database schema reference
- `electron/BUILD.md` — Detailed Electron build guide with architecture diagrams and process flow
- `electron/RELEASE_NOTES_v3.1.111.md` — Latest release notes (v3.1.111)
- `electron/TEST_SCRIPT_v3.1.110.md` — QA test script (29 test cases)
- `docs/phase4-complex-tables-design.md` — Phase 4 complex tables design document

## License

Copyright 2026. All rights reserved.

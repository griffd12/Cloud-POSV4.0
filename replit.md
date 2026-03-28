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
- **Database**: PostgreSQL with Drizzle ORM.

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
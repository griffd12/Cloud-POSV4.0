# Cloud POS Desktop v3.0.0

## Release Date: February 28, 2026

## Overview

Version 3.0.0 is the first major release of Cloud POS V3 — a complete architectural transformation from a hardcoded POS system to a **fully configuration-driven platform** built on Simphony-class design principles. Every behavioral aspect of the POS — from cash drawer kicks to receipt printing to tip prompts — is now controlled through database configuration flags rather than hardcoded logic. This release also delivers full offline parity between the cloud PostgreSQL database and the on-premise SQLite databases, an immutable transaction journal with exactly-once cloud sync, config-driven financial rules, KDS offline operation, and property-level CAPS server designation.

---

## Architecture: Configuration-Driven POS

### The Shift
Previously, POS behavior was determined by checking tender type strings in application code (e.g., `if (tender.type === 'cash') { openDrawer() }`). In V3.0, the application code reads **behavioral flags** from the database configuration. The `type` field is retained solely for display and labeling purposes.

### Design Principles
- All new boolean flags default to `false` — existing enterprises are never impacted by new features
- New text/integer config fields default to `null`
- Changes are strictly additive and non-destructive
- Configuration inheritance flows Enterprise → Property → Revenue Center → Workstation

---

## Tender Behavior Configuration

Tenders are no longer driven by hardcoded type strings. Seven new database columns provide per-tender behavioral control:

| Flag | Purpose |
|------|---------|
| `pop_drawer` | Triggers cash drawer kick on payment |
| `allow_tips` | Enables tip prompt for this tender |
| `allow_over_tender` | Enables change-due logic (overpayment) |
| `print_check_on_payment` | Controls automatic receipt printing on payment |
| `require_manager_approval` | Gates payment behind manager PIN authorization |
| `requires_payment_processor` | Indicates tender requires gateway communication |
| `display_order` | Controls tender button ordering on POS screen |

### Tender Media Classification

Three new flag columns replace string-based tender type matching in all reporting queries:

| Flag | Purpose |
|------|---------|
| `is_cash_media` | Identifies cash-type tenders for reporting |
| `is_card_media` | Identifies card-type tenders for reporting |
| `is_gift_media` | Identifies gift card tenders for reporting |

Canonical reporting DAL queries, Z Reports, Cash Drawer Reports, and Cashier Reports now join on these flag columns instead of matching `tender.type` strings.

---

## Config-Driven Tax & Tender (CAPS Offline)

### Tax Calculation
- `recalculateTotals()` now uses per-item `tax_group_id` to look up the correct tax rate and mode from the local SQLite `tax_groups` table
- Supports both **add-on** (tax added on top of price) and **inclusive** (tax embedded in price) modes
- Items without a `tax_group_id` are treated as tax-exempt ($0 tax)
- No hardcoded tax rates anywhere in the system

### Tender Enforcement
- `addPayment()` enforces tender behavior flags from the local database:
  - `allow_tips=false` + tip > 0 → rejected
  - `allow_over_tender=false` + payment exceeds balance → capped at remaining balance
  - `allow_over_tender=true` + cash overpayment → `change_amount` calculated and returned
  - `require_manager_approval=true` → requires `managerPin` parameter
  - Returns `pop_drawer` and `print_check_on_payment` flags in response
- `getTotalPayments()` uses `SUM(amount - change_amount)` for accurate net tendered calculation
- Voided discounts and service charges filtered by `voided=0` in totals queries

---

## Immutable Transaction Journal

A new `transaction_journal` table in the service-host SQLite database provides a complete, append-only audit trail for all CAPS and KDS mutations:

### Schema
| Column | Purpose |
|--------|---------|
| `event_id` | UUID primary key per individual event |
| `txn_group_id` | UUID per check lifecycle (all events for one check share this) |
| `device_id` | Workstation that generated the event |
| `rvc_id` | Revenue Center context |
| `business_date` | Business date for the event |
| `check_id` | Associated check |
| `event_type` | Type of mutation |
| `payload_json` | Full event payload (immutable once written) |
| `config_version` | Config version at time of event |
| `sync_state` | pending / synced / failed |
| `sync_attempts` | Number of sync attempts |

### Journaled Events
- **CAPS**: `check_opened`, `item_added`, `item_voided`, `round_sent`, `discount_applied`, `service_charge_applied`, `payment_added`, `check_closed`, `check_voided`, `check_reopened`
- **KDS**: `kds_ticket_created`, `kds_ticket_completed`, `kds_item_recalled`

### Integrity Rules
- Append-only: INSERT only, never UPDATE payload or DELETE
- Every financial and KDS mutation produces exactly one journal row
- `txn_group_id` links all events in a check's lifecycle for audit tracing

---

## Exactly-Once Cloud Sync

### Outbound (Service-Host → Cloud)
- `syncJournalEntries()` reads pending entries via `getUnsyncedJournalEntries(limit)`
- Sends batches to cloud: `POST /api/sync/transactions`
- Cloud returns `{ processed, acknowledged: [event_ids], skipped: [event_ids] }`
- Acknowledged entries marked as synced; skipped = already received (idempotent)
- Failed entries increment `sync_attempts` for retry

### Cloud Idempotency
- Cloud endpoint checks for existing `localId + serviceHostId` combination before processing
- Duplicate entries are skipped and reported in the `skipped` array
- No double-counting of transactions regardless of network retries

---

## Offline Reporting

New `GET /api/caps/reports/daily-summary` endpoint returns key metrics from local SQLite:
- Net sales, tax total, discount total
- Payments by tender media (cash/card/gift) via JOIN with tenders
- Open/closed/voided check counts
- Journal entry counts by event type and sync state
- Works fully offline and persists across restarts

---

## LocalEffectiveConfig

New `service-host/src/config/effective-config.ts` provides scope-based OptionBits resolution from local SQLite:
- Constructor takes scope: `{ enterpriseId, propertyId?, rvcId?, workstationId? }` + `db`
- Resolves with precedence: workstation(4) > rvc(3) > property(2) > enterprise(1)
- Methods: `getBool()`, `getText()`, `getInt()`, `getAllForEntity()`

---

## Property-Level CAPS Server Designation

CAPS server is now designated at the **Property level** instead of the separate "Service Hosts" EMC section:
- New `caps_workstation_id` column on the `properties` table
- **Property EMC Form**: Dropdown to select which workstation serves as the CAPS server
- **Workstation List**: "CAPS" badge displayed on the designated workstation
- **Activation Config**: `GET /api/workstations/:id/activation-config` resolves the CAPS workstation's IP address for all other workstations in the property
- **Server Validation**: Cross-property validation prevents assigning a workstation from another property
- **Config Help**: Full context help registered for the CAPS Workstation field

### How It Works
1. Admin selects a workstation (e.g., WS01) in the Property CAPS Workstation dropdown
2. All Electron workstations call `activation-config` at startup and receive `serviceHostUrl` built from WS01's IP
3. When cloud is unreachable, Electron automatically reroutes all API calls to the CAPS workstation on the LAN
4. CAPS processes checks locally and syncs to cloud when connectivity returns

---

## Proof Mode

New automated verification script (`npm run proof-mode` in service-host) validates the complete offline stack:

| Phase | Validates |
|-------|-----------|
| 1 — Schema Init | Database creation, table existence, config sync tables |
| 2 — Config Seeding | Employee, menu, tender, tax group, discount, KDS device sync |
| 3 — Offline POS | Check creation, item addition, send-to-kitchen, KDS ticket creation |
| 4 — Tender & Close | Discount application, cash + card payments, tax calculation, check close |
| 5 — Journal Integrity | Event count, event types, txn_group_id consistency, payload content |
| 6 — Persistence | DB close/reopen, data survives restart |
| 7 — Daily Summary | Offline reporting accuracy |
| 8 — Idempotency | Re-sync produces no duplicates |

Outputs structured PASS/FAIL per assertion with timestamps, suitable for auditor review.

---

## OptionBits Infrastructure (emc_option_flags)

A generic key-value configuration system provides extensible behavioral flags with **scope-based inheritance**:

- **Table**: `emc_option_flags` with columns for enterprise_id, entity_type, entity_id, option_key, value_text, scope_level, scope_id
- **Inheritance**: Enterprise → Property → RVC → Workstation (most specific scope wins)
- **Runtime**: Batch loading via `server/config/optionBits.ts` with 60-second in-memory cache and `EffectiveConfig` accessor class
- **EMC UI**: Reusable `option-bits-panel.tsx` component with inherited value display, override toggle, and reset capability
- **API**: GET/PUT/DELETE `/api/option-flags` endpoints
- **Unique index**: Composite key on (enterprise_id, entity_type, entity_id, option_key, scope_level, scope_id)

---

## Service-Host Offline Parity (Schema V4)

The on-premise CAPS service-host SQLite schema has been upgraded to V4, achieving full parity with the cloud PostgreSQL database for configuration-driven features:

### Schema Changes
- **Tenders table**: 11 new columns (7 behavior + 1 display_order + 3 media flags)
- **RVCs table**: 5 new columns (print modes, copies, guest count)
- **emc_option_flags table**: New table with 3 indexes for scope-based resolution
- **check_payments table**: Corrected columns (`tip_amount`, `change_amount`, `reference_number`, `voided`)
- **transaction_journal table**: New immutable journal with 5 indexes

### Migration Logic
- Automatic `ALTER TABLE` migration when V4 schema is detected
- **Backfill logic**: Existing tenders are automatically classified based on their type field:
  - Cash tenders: `is_cash_media=true`, `pop_drawer=true`, `allow_over_tender=true`
  - Card tenders: `is_card_media=true`, `allow_tips=true`
  - Gift tenders: `is_gift_media=true`

### Config Sync
- Cloud-to-local sync now includes `emcOptionFlags` in the full config response
- `syncMisc()` method processes and upserts option flags during sync
- New getter methods: `getTenders()`, `getRvcs()`, `getOptionFlags()`

---

## RVC Printing Configuration

Revenue Centers now support granular printing rules through five new columns:

| Flag | Purpose |
|------|---------|
| `receipt_print_mode` | `auto_on_close`, `auto_on_payment`, or `manual_only` |
| `receipt_copies` | Number of receipt copies to print |
| `kitchen_print_mode` | Supports `manual_only` for KDS-only sites |
| `void_receipt_print` | Toggle for automatic void slip printing |
| `require_guest_count` | Require guest count entry when opening checks |

---

## Schema Verification CLI

A `verify-schema` subcommand validates on-premise SQLite databases against the expected V4 schema:

```
node dist\index.js verify-schema --data-dir C:\POS\data
```

Produces a 6-section PASS/FAIL report covering tenders, RVCs, option flags, indexes, backfill counts, and duplicate guards. Runs in read-only mode against the live database.

---

## Cash Drawer Reliability

- **Dual kick strategy**: Embedded ESC/POS kick bytes in receipt data + standalone DRAWER_KICK WebSocket message as backup
- **ESC/POS command ordering**: Drawer kick fires BEFORE paper cut
- **Robust command sequence**: ESC @ (initialize) + BEL (Star Line Mode native) + ESC p (standard ESC/POS)
- Reliable on Star TSP100 printers in both Star Line Mode and ESC/POS emulation
- **Multiple cash drawer support**: Two drawer outputs (pin2 and pin5) per workstation

---

## Receipt Layout Improvements

- Bold double-height store name header
- Centered bold order type banner (e.g., TAKE OUT)
- Bold item names with indented modifiers
- Bold double-height total line
- Clean visual separators between sections
- Service charge and tip totals when applicable

---

## Upgrade Instructions

**Cloud Application**: No action required — changes deploy automatically.

**Windows Desktop (Electron)**:
1. Download `Cloud-POS-3.0.0-Setup.exe` from the GitHub Releases page
2. Run the installer — it will replace the existing installation automatically
3. The service-host database will auto-migrate to schema V4 on first launch
4. Run `verify-schema` to confirm migration: `node dist\index.js verify-schema --data-dir C:\POS\data`

**CAPS Service-Host**:
1. Deploy updated service-host binary
2. Database migration runs automatically on startup
3. Verify with: `node dist\index.js verify-schema --data-dir <data-dir>`

**Property Configuration**:
1. In EMC → Properties, select the CAPS Workstation for each property
2. Ensure the selected workstation has an IP address configured
3. All Electron workstations will discover the CAPS server automatically via activation-config

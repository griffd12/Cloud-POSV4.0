# v3.1.119 — Fix Fresh Install White Screen (Schema.ts Column Gaps)

## Critical Bug Fix

On **fresh install**, `checkSchemaVersion()` inserts SCHEMA_VERSION=23 immediately and **NO migrations run**. All tables are built ONLY from `schema.ts` CREATE TABLE definitions. Several columns that were added via `ALTER TABLE` in migrations v4–v23 were never backported into `schema.ts`, causing three critical failures on any new deployment.

## Changes

### 1. `roles` Table — 4 Missing Discount-Limit Columns (CRITICAL)
**Root Cause**: v19 migration added `max_item_discount_pct`, `max_check_discount_pct`, `max_item_discount_amt`, `max_check_discount_amt` via ALTER TABLE, but schema.ts CREATE TABLE never included them.

**Impact**: `upsertRole()` tries to INSERT into these columns → fails → entire employee category sync fails → no employees in CAPS → login impossible → **white screen on fresh install**.

**Fix**: Added all 4 columns to the `roles` CREATE TABLE in schema.ts.

### 2. `terminal_sessions` Table — Wrong Definition (CRITICAL)
**Root Cause**: schema.ts defined `terminal_sessions` with `amount INTEGER NOT NULL`, `terminal_device_id TEXT NOT NULL REFERENCES terminal_devices(id)`, and was missing `data TEXT`, `created_at`, `updated_at`, `cloud_session_id`, `transaction_type`. The `api.ts` had a correct CREATE TABLE IF NOT EXISTS, but it was a no-op since schema.ts already created the table.

**Impact**: PaymentController crashes every 5 seconds with "no such column: data". FK constraint on `terminal_device_id` blocks inserts when terminal_devices is empty.

**Fix**: Rewrote `terminal_sessions` in schema.ts to match what api.ts and payment-controller.ts actually use:
- Added: `data TEXT`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`, `cloud_session_id TEXT`, `transaction_type TEXT DEFAULT 'sale'`
- Changed: `amount` from INTEGER to TEXT, `tip_amount` from INTEGER to TEXT DEFAULT '0.00'
- Removed: NOT NULL and REFERENCES constraints from `terminal_device_id` (prevents FK failures on fresh install)
- Kept: All other columns from original definition (they don't hurt)

### 3. `check_items` Table — 3 Missing Tax Snapshot Columns (HIGH)
**Root Cause**: v19 migration added `tax_rate_at_sale REAL`, `tax_mode_at_sale TEXT`, `taxable_amount INTEGER DEFAULT 0` via ALTER TABLE, but schema.ts never included them.

**Impact**: Tax snapshot recording fails during order processing.

**Fix**: Added all 3 columns to the `check_items` CREATE TABLE in schema.ts.

## Upgrade Notes
- Existing (upgraded) installs are NOT affected — migrations still exist as safety net.
- Fresh installs will now create all tables with every column the code needs.
- No behavioral changes — this is purely a schema definition fix.

## Files Changed
- `service-host/src/db/schema.ts` — roles, check_items, terminal_sessions CREATE TABLE definitions
- `DATABASE_SCHEMA.md` — Updated roles, terminal_sessions documentation

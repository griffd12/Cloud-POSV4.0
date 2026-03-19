# Cloud POS v3.1.90 — Critical Hotfix

## What This Fixes

### Bug 1: Config Sync Cascade Failure (ROOT CAUSE)
v3.1.88 bumped SCHEMA_VERSION 12→13 but never wrote the migration function.
Missing `employee_assignments.role_id` column caused INSERT crash during employee sync.
Cascade failure killed sync for ALL remaining entities: tenders, tax groups, discounts,
terminal devices, order devices, KDS, printers, payment processors, POS layouts,
cash drawers, job codes, and more.

**Fix:** SCHEMA_VERSION=14, `migrateToV14()` adds the column + creates all 18 missing tables.

### Bug 2: Price Display ($300 instead of $3)
`addItems()` response returned `unitPrice` and `totalPrice` in raw CENTS.
Client displayed 300 as $300.00 instead of converting to $3.00.

**Fix:** Response now converts cents to dollars matching `getCheckItems()` format.

### Bug 3: "Permission Denied" for All Check Operations
`checkPrivilege()` called `getEmployeesByProperty(propertyId)` which filters `WHERE property_id = ?`.
Enterprise-level employees have `property_id = NULL` and were not found.
Result: user could ring items and send to kitchen but could NOT void, discount, transfer,
split, merge, reopen, modify price, or process refunds.

**Fix:** Query now includes `OR property_id IS NULL` to find enterprise-level employees.

### Bug 4: No Cash Tender Buttons on Payment Screen
Direct consequence of Bug 1 — zero tenders in local DB. Payment modal showed bare
"Cash" / "Card/Other" text with no actual tender buttons.

**Fix:** Restored by full config sync (Bug 1 fix).

### Bug 5: Send to Kitchen Does Nothing
Direct consequence of Bug 1 — order devices, KDS devices, print class routing never synced.
No routing existed to deliver orders to kitchen.

**Fix:** Restored by full config sync (Bug 1 fix).

## Migration Details
- Schema version: 13 → 14
- 1 ALTER TABLE: `employee_assignments.role_id`
- 18 CREATE TABLE IF NOT EXISTS: terminal_devices, cash_drawers, drawer_assignments,
  cash_transactions, safe_counts, job_codes, employee_job_codes, fiscal_periods,
  online_order_sources, overtime_rules, break_rules, tip_rules,
  tip_rule_job_percentages, minor_labor_rules, payment_gateway_config,
  descriptor_sets, descriptor_logo_assets, print_agents
- 23 indexes created

## After Update
1. Service host will auto-migrate on startup (v13→v14)
2. Full config sync will run — ALL entity types will populate
3. Restart the POS client to pick up the new data

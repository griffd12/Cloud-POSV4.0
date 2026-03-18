# v3.1.79 — Complete CAPS Route Audit: Fix 22 Broken Routes

Full audit of every CAPS route discovered a systemic issue: the Electron interceptor rewrites transaction URLs to add `/caps/` prefix, but 22 Cloud-Compatible Route Alias handlers only existed WITHOUT the prefix. All 22 routes silently 404'd and fell through to cloud, breaking the WS→CAPS→Cloud write contract.

## Root Cause & Fix

### CAPS Prefix Normalization Middleware
- **Problem**: Electron interceptor rewrites `/api/checks/orders` → `/api/caps/checks/orders`, but the alias handler is registered as just `/checks/orders` (no `/caps/` prefix). The prefixed request doesn't match → 404 → cloud fallthrough.
- **Fix**: Added middleware after all original CAPS handlers that strips the `/caps/` prefix for unmatched requests, allowing them to fall through to the alias handlers that work correctly.
- **Excludes**: `/caps/sync/`, `/caps/reports/`, `/caps/workstation/` (these have dedicated CAPS handlers and must keep the prefix).

## Bugs Fixed

### Bug A: Discount SQL Column Mismatch
- **Root Cause**: Discount lookup queried `SELECT value, rate FROM discounts` but the SQLite `discounts` table uses `amount` and `discount_type` columns.
- **Impact**: Every discount operation failed with SQL error.
- **Fix**: Changed to `SELECT name, discount_type, amount FROM discounts WHERE id = ?` and updated all field references.

### Bug B: Payment tender_type Not Resolved
- **Root Cause**: Frontend sends `tenderId` (UUID) but not `tenderType`. Both payment handlers assumed `tenderType` was in the body — it wasn't.
- **Impact**: Every payment recorded with NULL tender type.
- **Fix**: Both `payHandler` and alias payment handler now look up the tender from the `tenders` table using `tenderId` and extract the `type` column. Also maps `tipAmount` → `tip` and parses string amounts to numbers. Falls back to `'cash'` if lookup fails.

### Bug C: Terminal Sessions Route Missing from Interceptor
- **Root Cause**: `terminal-sessions` was not in the `isCapsTransactionRoute` regex in `electron/main.cjs`.
- **Impact**: EMV terminal session creation went directly to cloud instead of CAPS.
- **Fix**: Added `terminal-sessions` to the interceptor regex.

## Routes Now Working Through CAPS (22 Total)

| Method | Route | Operation |
|--------|-------|-----------|
| GET | `/checks/open` | List open checks |
| GET | `/checks/orders` | List orders |
| GET | `/checks/locks` | List check locks |
| GET | `/checks/:id/full-details` | Full check details |
| GET | `/checks/:id/payments` | Check payments |
| GET | `/checks/:id/discounts` | Check discounts |
| GET | `/checks/:id/service-charges` | Check service charges |
| POST | `/checks/:id/service-charges` | Add service charge |
| POST | `/checks/:id/reopen` | Reopen closed check |
| POST | `/checks/:id/discount` | Apply check discount |
| POST | `/checks/:id/print` | Print check |
| POST | `/checks/:id/transfer` | Transfer check |
| POST | `/checks/:id/split` | Split check |
| POST | `/checks/merge` | Merge checks |
| PATCH | `/checks/:id` | Update check |
| PATCH | `/check-payments/:id/void` | Void payment |
| PATCH | `/check-payments/:id/restore` | Restore payment |
| POST | `/check-service-charges/:id/void` | Void service charge |
| DELETE | `/check-items/:id` | Delete item |
| DELETE | `/check-items/:id/discount` | Remove item discount |
| POST | `/check-items/:id/price-override` | Change item price |
| DELETE | `/check-discounts/:id` | Remove check discount |

## Files Changed
- `service-host/src/routes/api.ts` — Prefix normalization middleware, discount SQL fix, payment tender_type resolution
- `electron/main.cjs` — Added terminal-sessions to interceptor regex
- `electron/service-host-embedded.cjs` — Rebuilt bundle with all fixes

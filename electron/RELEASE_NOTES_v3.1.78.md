# v3.1.78 — Fix 5 Critical CAPS Bugs Blocking All POS Operations

Analyzed real production logs from Derek-Laptop (v3.1.77) and found 5 bugs that made the system completely non-functional after sign-in. CAPS starts, config syncs, and sign-in works, but every transaction operation fails.

## Bugs Fixed

### Bug 1: Add-Item Response Format Mismatch (Cascading Failure)
- **Root Cause**: CAPS `POST /caps/checks/:id/items` returned `{ items: [...] }` but the frontend expects the item object directly (matching cloud API format which returns `res.status(201).json(item)`).
- **Impact**: Frontend received `undefined` for item ID → every subsequent modifier, void, and discount operation hit `/api/check-items/undefined/...` → CAPS returned 404 → completely blocked.
- **Fix**: Changed response to `res.status(201).json(items[0])` matching cloud format.
- **Files**: `service-host/src/routes/api.ts`

### Bug 2: Payment Endpoint URL Mismatch
- **Root Cause**: Interceptor rewrites `/api/checks/:id/payments` → `/api/caps/checks/:id/payments` but CAPS only registered `/api/caps/checks/:id/pay` (no `/payments` route).
- **Impact**: Every payment attempt returned 404. 6 payment attempts failed in the test session.
- **Fix**: Added `/caps/checks/:id/payments` as alias route pointing to same handler as `/pay`.
- **Files**: `service-host/src/routes/api.ts`

### Bug 3: Send-to-Kitchen KDS round_number Constraint Error
- **Root Cause**: `kds_tickets` table has `round_number INTEGER NOT NULL DEFAULT 0` but the `createTicket()` INSERT statement omitted the column entirely. SQLite's NOT NULL constraint fired before DEFAULT could apply.
- **Impact**: Every send-to-kitchen attempt failed with `NOT NULL constraint failed: kds_tickets.round_number`.
- **Fix**: Added `round_number` to INSERT statement and `CreateTicketParams` interface, passed from send route handler.
- **Files**: `service-host/src/services/kds-controller.ts`, `service-host/src/routes/api.ts`

### Bug 4: Missing Cancel-Transaction Endpoint
- **Root Cause**: CAPS had no `/caps/checks/:id/cancel-transaction` route at all. The frontend hit this endpoint 15+ times in rapid succession (retry loop), all returning 404.
- **Impact**: Could not cancel any transaction.
- **Fix**: Added route that voids all unsent items and closes the check if no previously-sent items remain.
- **Files**: `service-host/src/routes/api.ts`

### Bug 5: Journal Sync to Cloud Returns 400 Bad Request
- **Root Cause**: CAPS sent `{ batch: true, transactions: [...] }` to `/api/sync/transactions` WITHOUT `serviceHostId` or `propertyId`. The cloud endpoint requires these fields to identify the sending service host. CAPS was essentially sending anonymous data.
- **Impact**: Every journal sync permanently failed. Transactions marked as failed and lost — nothing synced to cloud.
- **Fix**: Added `serviceHostId` and `propertyId` to `TransactionSync` constructor, included in every sync payload alongside `businessDate`.
- **Files**: `service-host/src/sync/transaction-sync.ts`, `service-host/src/index.ts`

## Additional Fixes

### Interceptor URL Rewrite Gaps
- **Problem**: The interceptor regex matched `/api/check-items`, `/api/check-payments`, `/api/check-discounts`, `/api/check-service-charges` as CAPS transaction routes but had NO rewrite rules for them. They went to CAPS with cloud-format URLs and 404'd.
- **Fix**: Added rewrite rules: `/api/check-items` → `/api/caps/check-items`, `/api/check-payments` → `/api/caps/check-payments`, etc. Order matters — these are checked BEFORE the `/api/checks` rule to prevent false prefix matching.
- **Files**: `electron/main.cjs`

### New CAPS Routes for Check-Item Operations
Added flat-URL routes matching the cloud API pattern so the interceptor-rewritten paths resolve:
- `PATCH /caps/check-items/:id/modifiers` — update item modifiers
- `PUT /caps/check-items/:id/modifiers` — update item modifiers (PUT variant)
- `POST /caps/check-items/:id/void` — void item by item ID
- `POST /caps/check-items/:id/discount` — apply discount to item by item ID
- **Files**: `service-host/src/routes/api.ts`

## Files Changed
- `electron/main.cjs` — Interceptor URL rewrite rules
- `electron/service-host-embedded.cjs` — Rebuilt bundle with all fixes
- `service-host/src/routes/api.ts` — Response format, alias routes, new endpoints
- `service-host/src/services/kds-controller.ts` — round_number in INSERT
- `service-host/src/sync/transaction-sync.ts` — serviceHostId/propertyId in sync
- `service-host/src/index.ts` — Pass IDs to TransactionSync constructor

# Release Notes — v3.1.80

## Critical Bug Fixes + Gateway Log Feature

Four production-blocking bugs fixed from v3.1.79 post-release testing, plus a new Gateway Log feature for CAPS traffic visibility.

---

## Bug Fixes

### Fix 1: Open Checks Invisible Cross-Workstation (404 on `/caps/checks/orders`)

- **Symptom**: Checks created on WS02 did not appear on other workstations' open checks screen. `GET /api/caps/checks/orders` and `GET /api/caps/checks/locks` returned 404 from CAPS.
- **Root Cause**: Express parameterized route `GET /caps/checks/:id` (defined at line 57) greedily captured `/caps/checks/orders` and `/caps/checks/locks`, interpreting `orders`/`locks` as the `:id` parameter and returning "Check not found" before the actual handlers could execute.
- **Fix**: Added explicit `GET /caps/checks/orders` and `GET /caps/checks/locks` routes **before** the parameterized `GET /caps/checks/:id` route. Express matches routes in declaration order, so the explicit routes now intercept correctly.
- **File**: `service-host/src/routes/api.ts` lines 59–121

### Fix 2: Discount Application Crashes Frontend

- **Symptom**: Applying a discount to a check item via the POS UI returned 200 from CAPS but the frontend crashed with `Cannot read properties of undefined (reading 'id')`.
- **Root Cause**: The CAPS discount handler at `POST /caps/check-items/:id/discount` returned `{ id, amount }` (the raw insert result from `caps.addDiscount()`), but the frontend expected `{ item: {...}, check: {...} }` — the format used by the alias handler at `POST /check-items/:id/discount`.
- **Fix**: Updated the handler to fetch the updated check and item after applying the discount, returning `{ item: updatedItem, check: updatedCheck }` matching the alias handler's response shape.
- **File**: `service-host/src/routes/api.ts` lines 412–423

### Fix 3: KDS Tickets Not Appearing After Send-to-Kitchen

- **Symptom**: After pressing "Send" on a check, the POS returned success but KDS stations never displayed the ticket. KDS stations polled `GET /api/kds-tickets` every ~2 seconds with zero results.
- **Root Cause**: `check.checkNumber` could be undefined when passed to `kds.createTicket()`, violating the `NOT NULL` constraint on `kds_tickets.check_number`. The resulting SQLite error was caught by the outer `try/catch` block which had already computed the `sendToKitchen()` result, so the handler returned 200 (send success) while the KDS ticket silently failed to insert.
- **Fix**: Added null-safety (`checkNumber || 0`, `roundNumber || 0`) and wrapped `kds.createTicket()` in its own isolated `try/catch` with explicit error logging. KDS failures no longer silently swallow. Applied to **both** the `/caps/checks/:id/send` route and the `/checks/:id/send` alias route.
- **File**: `service-host/src/routes/api.ts` lines 157–178, 1571–1592

### Fix 4: Check Control Functions Locked for All Employees (Padlock Icons)

- **Symptom**: The Functions modal displayed padlock icons on Transfer Check, Split Check, Merge Checks, Reopen Check, Edit Closed Check, and Price Override — blocking all employees from using these features regardless of their configured role.
- **Root Cause**: The CAPS `POST /auth/login` handler fell back to a hardcoded privilege list when `employee.privileges` and `employee.rolePrivileges` were undefined (which is always the case for SQLite employee rows). The fallback list was missing: `transfer_check`, `split_check`, `merge_checks`, `reopen_check`, `modify_price`, and other check control codes.
- **Fix**: Created `resolveEmployeePrivileges()` helper with a complete resolution chain:
  1. `employee.privileges` (if present from cloud sync)
  2. `employee.rolePrivileges` (if present)
  3. `db.getRolePrivileges(roleId)` — looks up from `role_privileges` table using employee's direct `role_id`
  4. `db.getEmployeeAssignments(employeeId)` → primary assignment's `role_id` → `db.getRolePrivileges()` — resolves via `employee_assignments` table
  5. Expanded default fallback (13 privilege codes) with console warning when used
- Applied to `/auth/login`, `/auth/pin`, **and** `/auth/manager-approval` handlers.
- **File**: `service-host/src/routes/api.ts` lines 2341–2380

---

## New Feature: Gateway Log

Comprehensive request/response logging for all CAPS traffic, providing visibility into what every connected device (workstations, KDS stations) is sending and receiving.

### What It Logs
- Device name (from `X-Device-Name`, `X-Workstation-Id`, or `X-Device-Token` headers)
- HTTP method and URL
- Request body summary (first 200 chars, **credentials redacted**)
- Response status code
- Response body summary (first 200 chars, **credentials redacted**)
- Duration in milliseconds
- Error messages (if any)
- Timestamp

### Security
- Sensitive fields are automatically redacted from both request and response logs: `pin`, `managerPin`, `pinHash`, `pin_hash`, `posPin`, `pos_pin`, `password`, `token`, `cardNumber`, `cvv`, `expiryDate`
- Nested employee objects in responses are also redacted

### API Endpoint
```
GET /api/caps/gateway-log?limit=100&device=WS02&method=POST&errorsOnly=true
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 100 | Number of entries to return (max 500 buffer) |
| `device` | — | Filter by device name (case-insensitive partial match) |
| `method` | — | Filter by HTTP method (GET, POST, etc.) |
| `errorsOnly` | false | Only show entries with errors or 4xx/5xx status |

- **File**: `service-host/src/routes/api.ts` lines 34–133

---

## Files Changed

| File | Description |
|------|-------------|
| `service-host/src/routes/api.ts` | All 4 bug fixes + gateway log middleware/endpoint |
| `electron/service-host-embedded.cjs` | Rebuilt bundle with all changes |
| `electron/electron-builder.json` | Version bump 3.1.79 → 3.1.80 |
| `electron/build-info.json` | Updated build metadata |

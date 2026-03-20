# Cloud POS v3.1.98 Release Notes

**Release Date:** March 20, 2026  
**Build:** 1774015200000

## CAPS Response Contract Normalization

### Problem
SQLite (used by CAPS) returns different data types than PostgreSQL (used by Cloud):
- **Booleans**: SQLite returns `1`/`0` integers, but the frontend checks `=== true`/`=== false`
- **JSONB columns**: SQLite returns JSON as strings (`"[1,5,10]"`), but the frontend expects parsed arrays/objects

This caused multiple UI features to silently fail on Electron/CAPS while working perfectly on Cloud.

### Solution
Enhanced `mapKeys()` in `service-host/src/routes/api.ts` with **schema-driven normalization registries** extracted from `shared/schema.ts`:

- **BOOLEAN_SNAKE**: 140+ column names from every `boolean()` definition — converts `1`→`true`, `0`→`false`
- **JSONB_SNAKE**: 24 column names from every `jsonb()` definition — parses JSON strings to objects/arrays
- Both registries have pre-computed camelCase mirrors for already-converted keys
- Cloud (PostgreSQL) path is a pure identity — `true` stays `true`, parsed objects stay parsed

### UI Features Fixed on CAPS

| Endpoint | Field | Raw SQLite | Normalized | Feature |
|---|---|---|---|---|
| GET /api/tenders | isCashMedia | `1` | `true` | Cash tender buttons now appear |
| GET /api/tenders | popDrawer | `1` | `true` | Cash drawer opens on cash tender |
| GET /api/tenders | denominations | `"[1,5,10,20]"` | `[1,5,10,20]` | Quick cash buttons render |
| GET /api/terminal-devices | capabilities | `"{...}"` | `{chip:true,...}` | Terminal capabilities display |
| GET /api/workstations | fastTransactionEnabled | `1` | `true` | Fast transaction mode works |
| GET /api/workstations | cashDrawerEnabled | `1` | `true` | Drawer feature recognized |
| GET /api/payment-processors | supportsEmv | `1` | `true` | EMV feature gate passes |
| GET /api/descriptors | headerLines | `"[...]"` | `[...]` | Receipt header renders |
| GET /api/kds-devices | expoMode | `1` | `true` | Expo mode activates on KDS |
| GET /api/rvcs/:id | dynamicOrderMode | `1` | `true` | DOM send mode activates |
| GET /api/break-rules | enableMealBreakEnforcement | `1` | `true` | Break enforcement works |

### Implementation Details
- **Schema-driven, not heuristic**: Column names extracted directly from Drizzle schema `boolean()` and `jsonb()` definitions
- **JSON parsing selective**: Only known JSONB columns are parsed, not arbitrary strings starting with `{` or `[`
- **Existing manual conversions preserved**: `caps.ts` manual `=== 1` conversions left untouched for safety
- **`_skipCamelConvert` flag**: Still bypasses all normalization as before
- **Diagnostic endpoint added**: `/caps/diagnostic/normalization-proof` shows raw vs normalized diffs at runtime

### Files Changed
- `service-host/src/routes/api.ts` — schema-driven normalization in `mapKeys()` + proof endpoint

# Cloud POS v3.1.87 Release Notes

## CAPS Response Key Normalization — Fix Empty POS, Locked Functions, Missing Logo

### Root Cause
Every API response from the CAPS service-host returned SQLite column names in `snake_case` (`menu_item_id`, `display_order`, `sign_in_logo_url`, `row_index`, etc.) but the frontend React app expects `camelCase` (`menuItemId`, `displayOrder`, `signInLogoUrl`, `rowIndex`). Config data was fully synced and present in CAPS SQLite — the POS appeared broken purely because the frontend couldn't find expected keys.

### Symptoms (all caused by same root issue)
- No POS layout rendered (custom grid cells had `row_index` but frontend checks `rowIndex`)
- No property logo on login screen (`sign_in_logo_url` vs `signInLogoUrl`)
- All check functions locked (role privileges resolved correctly server-side but option bits were being converted when they shouldn't be)
- Stress test couldn't start (no valid workstation/menu context)
- Reports inaccessible

### Fix Applied
1. **Global `mapKeys()` middleware** in `service-host/src/routes/api.ts` — intercepts every `res.json()` call and recursively converts all object keys from `snake_case` to `camelCase` at the response boundary. Internal DB queries remain snake_case.

2. **Critical exception: `/config/workstation-options`** — This endpoint's keys (`allow_refunds`, `allow_voids`, etc.) are semantic option-bit identifiers used as literal lookup keys by the frontend's `checkOptionAllowed()` function. These are **excluded** from camelCase conversion via `_skipCamelConvert` flag to prevent breaking function lock/unlock logic.

3. **Recursive conversion** — Handles nested objects (workstation context → property → layout → cells), arrays, null/undefined, Date objects, and primitive values correctly.

4. **No double-conversion** — Endpoints that already manually construct camelCase responses (`/auth/login`, `/auth/pin`, `/auth/offline-employees`) pass through the middleware without mangling since `snakeToCamel()` is a no-op on strings without underscores.

5. **KDS WebSocket unaffected** — KDS ticket data already uses `mapTicketRow()` for camelCase mapping. WebSocket payloads bypass the HTTP middleware entirely (use `ws.send()` directly).

### Endpoints Fixed
| Endpoint | Key Example | UI Feature Unblocked |
|---|---|---|
| `/workstations/:id/context` | `sign_in_logo_url` → `signInLogoUrl` | Logo, branding, workstation config |
| `/menu-items` | `short_name` → `shortName` | POS menu item grid |
| `/pos-layouts/default/:rvcId` | `grid_rows` → `gridRows` | Custom POS layout rendering |
| `/pos-layouts/:id/cells` | `row_index` → `rowIndex` | Layout cell positioning |
| `/slus` | `display_order` → `displayOrder` | SLU navigation tabs |
| `/properties` | `sign_in_logo_url` → `signInLogoUrl` | Login screen logo |
| `/employees` | `first_name` → `firstName` | Employee data |
| `/kds-devices` | `station_type` → `stationType` | KDS device configuration |

### Files Changed
- `service-host/src/routes/api.ts` — `snakeToCamel()`, `mapKeys()` utilities + gateway middleware integration + `_skipCamelConvert` for workstation-options
- `electron/build-info.json` — Version 3.1.87
- `electron/electron-builder.json` — Version 3.1.87
- `electron/service-host-embedded.cjs` — Rebuilt bundle
- `CAPS_KEY_NORMALIZATION_PROOF.md` — Full before/after proof table

### Build Instructions
```
git pull origin main
npm run build
node electron/build-service-host.cjs
npx electron-builder --config electron/electron-builder.json --win
```

# CAPS Response Key Normalization — v3.1.87 Proof

## Root Cause
CAPS service-host returns SQLite column names in `snake_case` from `SELECT *` queries.
Frontend React app expects `camelCase` keys. Data was present but invisible to UI due to key mismatch.

## Fix
Global `mapKeys()` middleware in `service-host/src/routes/api.ts` intercepts every `res.json()` call
and recursively converts all object keys from `snake_case` to `camelCase`.

Exception: `/config/workstation-options` is excluded because its keys (`allow_refunds`, `allow_voids`, etc.)
are semantic option-bit identifiers used as literal lookup keys by the frontend — not object properties.

## Before / After Proof Table

| ENDPOINT | BEFORE KEYS (snake_case from SQLite) | AFTER KEYS (camelCase from middleware) | UI FEATURE UNBLOCKED |
|---|---|---|---|
| `/workstations/:id/context` → property | `enterprise_id, sign_in_logo_url, business_date_rollover_time, current_business_date, auto_clock_out_enabled` | `enterpriseId, signInLogoUrl, businessDateRolloverTime, currentBusinessDate, autoClockOutEnabled` | Login logo, branding, workstation config |
| `/workstations/:id/context` → workstation | `property_id, rvc_id, device_type, default_order_type, fast_transaction_enabled, require_begin_check, allow_pickup_check` | `propertyId, rvcId, deviceType, defaultOrderType, fastTransactionEnabled, requireBeginCheck, allowPickupCheck` | Workstation binding, order type |
| `/workstations/:id/context` → defaultLayout | `grid_rows, grid_cols, font_size, is_default, enterprise_id, property_id, rvc_id` | `gridRows, gridCols, fontSize, isDefault, enterpriseId, propertyId, rvcId` | Custom POS layout rendering |
| `/workstations/:id/context` → defaultLayout.cells[] | `layout_id, row_index, col_index, row_span, col_span, menu_item_id, background_color, text_color, display_label` | `layoutId, rowIndex, colIndex, rowSpan, colSpan, menuItemId, backgroundColor, textColor, displayLabel` | Layout cell positioning + item binding |
| `/menu-items` | `enterprise_id, property_id, rvc_id, short_name, tax_group_id, print_class_id, major_group_id, family_group_id` | `enterpriseId, propertyId, rvcId, shortName, taxGroupId, printClassId, majorGroupId, familyGroupId` | POS menu item grid |
| `/pos-layouts/default/:rvcId` | `enterprise_id, property_id, rvc_id, grid_rows, grid_cols, font_size, is_default` | `enterpriseId, propertyId, rvcId, gridRows, gridCols, fontSize, isDefault` | Custom POS layout rendering |
| `/pos-layouts/:id/cells` | `layout_id, row_index, col_index, row_span, col_span, menu_item_id, background_color, text_color, display_label` | `layoutId, rowIndex, colIndex, rowSpan, colSpan, menuItemId, backgroundColor, textColor, displayLabel` | Layout cell positioning |
| `/slus` | `enterprise_id, property_id, rvc_id, button_label, display_order` | `enterpriseId, propertyId, rvcId, buttonLabel, displayOrder` | SLU navigation tabs |
| `/properties` | `enterprise_id, sign_in_logo_url, business_date_rollover_time, current_business_date, auto_clock_out_enabled` | `enterpriseId, signInLogoUrl, businessDateRolloverTime, currentBusinessDate, autoClockOutEnabled` | Login screen logo |
| `/employees` | `enterprise_id, property_id, employee_number, first_name, last_name, pin_hash, role_id` | `enterpriseId, propertyId, employeeNumber, firstName, lastName, pinHash, roleId` | Employee data |
| `/rvcs` | `property_id, fast_transaction_default, default_order_type, order_type_default, dynamic_order_mode, dom_send_mode, receipt_print_mode` | `propertyId, fastTransactionDefault, defaultOrderType, orderTypeDefault, dynamicOrderMode, domSendMode, receiptPrintMode` | RVC selection |
| `/kds-devices` | `property_id, station_type, show_draft_items, show_sent_items_only, group_by, allow_bump, allow_recall, expo_mode, new_order_sound, new_order_blink_seconds` | `propertyId, stationType, showDraftItems, showSentItemsOnly, groupBy, allowBump, allowRecall, expoMode, newOrderSound, newOrderBlinkSeconds` | KDS device configuration |
| `/kds/tickets` (HTTP) | Already mapped via `mapTicketRow()` + middleware is harmless no-op on camelCase | `checkId, checkNumber, roundNumber, stationId, createdAt, bumpedAt` | KDS ticket display |
| `/kds/tickets` (WebSocket) | Already mapped via `mapTicketRow()`, bypasses HTTP middleware entirely | N/A (WebSocket direct) | KDS real-time updates |

## No-Breakage Verification

| ENDPOINT | KEY FORMAT | RESULT |
|---|---|---|
| `/auth/login` | Already camelCase (manually constructed) | PASS — no mangling, `firstName` stays `firstName` |
| `/auth/pin` | Already camelCase (manually constructed) | PASS — no double-conversion |
| `/auth/offline-employees` | Already camelCase (manually constructed) | PASS — keys unchanged |
| `/config/workstation-options` | snake_case option-bit names (semantic IDs) | PASS — **excluded from conversion** via `_skipCamelConvert` flag |
| Privilege arrays `["admin_access", "void_sent"]` | String array values | PASS — `mapKeys` on string array returns strings unchanged |
| Nested objects (auth/login → employee) | Already camelCase nested object | PASS — camelCase input passes through unchanged |
| `configSummary` (manually constructed) | Already camelCase | PASS — keys like `menuItems`, `taxGroups` unchanged |
| Gateway log entries | Already camelCase, skips middleware entirely | PASS — `caps/gateway-log` URL excluded from middleware |

## Implementation Details
- `snakeToCamel()`: Regex `/_([a-z0-9])/g` handles letters and digits after underscores
- `mapKeys()`: Recursive — handles nested objects, arrays, null, undefined, Date, primitives
- Middleware location: Gateway log `router.use()` middleware intercepts `res.json()` at response boundary
- Internal DB queries still return snake_case — conversion is response-only
- `resolveEmployeePrivileges()` operates on raw DB data (snake_case) before response — unaffected

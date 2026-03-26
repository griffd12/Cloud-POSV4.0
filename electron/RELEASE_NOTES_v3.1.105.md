# Cloud POS v3.1.105 Release Notes

**Release Date**: March 26, 2026
**Previous Version**: v3.1.104

---

## Summary

v3.1.105 closes all identified EMC-to-CAPS configuration sync gaps, fixes the critical Dynamic Order Mode (DOM) KDS behavior, and implements the remaining DOM send modes (`fire_on_next`, `fire_on_tender`). Schema upgraded to V18.

---

## Bug Fixes

### Critical: DOM fire_on_fly No Longer Marks Items as Sent Immediately
- **Previous behavior**: Adding an item in DOM `fire_on_fly` mode called `sendToKitchen()`, which immediately set `sent=1` on all items. This prevented further modifications, voiding unsent items, and broke the expected DOM workflow.
- **Fix**: Items are now added to KDS as **preview tickets** (`is_preview=1`). Preview tickets display on KDS screens but do NOT mark items as sent. Items are only marked `sent=1` when the cashier explicitly presses Send or initiates payment.

### Business Date Calculation (from v3.1.104 hotfix)
- CAPS now correctly calculates business date using property timezone and rollover hour.

### Cloud Payment Sync (from v3.1.104 hotfix)
- `tenderName` and `paymentStatus` fields now properly populated before cloud sync.

### KDS Cloud Sync (from v3.1.104 hotfix)
- `kds_ticket_created` journal events now sync to cloud correctly.

---

## New Features

### DOM Send Modes — All Three Now Fully Implemented
| Mode | Behavior |
|------|----------|
| `fire_on_fly` | Each item appears on KDS as a preview ticket immediately when added. Finalized on Send or Pay. |
| `fire_on_next` | Previous unsent items fire as preview tickets when the next item is added. Current item waits. |
| `fire_on_tender` | No items appear on KDS until payment is initiated. All unsent items fire at once on Pay. |

### Preview Ticket Lifecycle
- **Preview tickets** (`is_preview=1`) appear on KDS with a distinct status — visible but not bumpable.
- On **Send**: All preview tickets are finalized (converted to regular active tickets). Any items not already on a preview ticket get new regular tickets.
- On **Pay**: Same finalization behavior. For `fire_on_tender` mode, all unsent items are sent to kitchen and appear as regular tickets.
- **Modifier changes** on unsent items automatically update the corresponding preview ticket on KDS in real time.
- **Voiding** an unsent item removes it from its preview ticket. If the ticket becomes empty, it is deleted from KDS entirely.

---

## EMC-to-CAPS Config Sync Gaps Closed

### Schema V18 — 22 New Columns Across 7 Tables

| Table | New Columns |
|-------|-------------|
| `properties` | `caps_workstation_id` |
| `rvcs` | `conversational_ordering` |
| `menu_items` | `menu_build_enabled` |
| `workstations` | `font_scale`, `com_port`, `com_baud_rate`, `com_data_bits`, `com_stop_bits`, `com_parity`, `com_flow_control`, `cash_drawer_enabled`, `cash_drawer_printer_id`, `cash_drawer_kick_pin`, `cash_drawer_pulse_duration`, `cash_drawer_auto_open_on_cash`, `cash_drawer_auto_open_on_drop` |
| `printers` | `host_workstation_id`, `com_port`, `baud_rate`, `windows_printer_name` |
| `kds_devices` | `font_scale` |
| `kds_tickets` | `is_preview` |

### Upsert Functions Updated
All upsert functions (`upsertProperty`, `upsertRvc`, `upsertMenuItem`, `upsertWorkstation`, `upsertPrinter`, `upsertKdsDevice`) now persist the new fields from EMC config sync.

---

## Code Quality

- Extracted shared DOM helpers (`resolveKdsStations`, `toKdsItem`, `handleDomAutoFire`) to eliminate duplicated logic between `/caps/` and `/checks/` route sets.
- All new logging uses `getLogger()` — no bare `console.log` in service-host.
- KDS Controller: 6 new methods for preview ticket lifecycle management.

---

## Known Deferred Items (Task #53)
- Shift / Shift Template sync from EMC (offline scheduling reference)
- Employee Date of Birth field sync (non-critical)

---

## Migration Notes
- **Automatic**: Schema migration from V17 to V18 runs automatically on CAPS startup. No manual intervention required.
- **Non-destructive**: All new columns have safe defaults (`NULL`, `0`, or sensible fallbacks). Existing data is unaffected.

# v3.1.43 Release Notes

## Config Sync: Enterprise Data Isolation Fix

### Critical Fix — Config Sync Was Downloading ALL Enterprise Data

The `/api/sync/config/full` endpoint was returning menu items, modifiers, tax groups, tenders, discounts, service charges, print classes, SLUs, job codes, and all related junction tables from **every enterprise in the database** — not just the enterprise/property the device belongs to. This caused:

- Bloated sync payloads (e.g., 152 menu items when the property only has ~30)
- Data leakage across enterprise boundaries
- Unnecessary storage consumption on service hosts

**Fixed**: All entities are now filtered by `enterpriseId` (menu items, modifiers, modifier groups, SLUs, tax groups, tenders, discounts, service charges, print classes, job codes) or `propertyId` (order devices). Junction tables (modifier-group-modifiers, menu-item-modifier-groups, order-device-printers, order-device-KDS, print-class-routing) are filtered by their parent entity IDs.

### Standalone Sync Endpoints Also Fixed

Six standalone sync endpoints that were returning unfiltered data now accept an optional `propertyId` query parameter for scoped results:
- `/api/sync/modifier-group-modifiers`
- `/api/sync/menu-item-modifier-groups`
- `/api/sync/order-device-printers`
- `/api/sync/order-device-kds`
- `/api/sync/menu-item-recipe-ingredients`
- `/api/sync/workstation-order-devices`

### Improved Sync Logging

Service host config sync now logs the enterprise name and property name at the start of every sync, making it immediately clear which enterprise/property data is being downloaded:

```
[ConfigSync] Enterprise: BOM Sugar N Spice (uuid)
[ConfigSync] Property: Sugar N Spice Main (uuid)
```

Server-side also logs filtered vs. unfiltered counts for transparency:

```
[ConfigSync] Filtered for enterprise BOM Sugar N Spice: menuItems=32 (was 152), modifiers=24 (was 90)
```

### v3.1.42 Broadcast Fixes (included)

- Removed wrong broadcasts from GET `/api/pos-layouts/:id/cells` and POST `/api/devices/:id/heartbeat`
- Added missing broadcasts to DELETE pos-layouts, DELETE properties, PUT/DELETE workstations, PUT workstation order-devices, DELETE devices
- Fixed `data.id` → `device.id` bug on device create broadcast
- Expanded frontend cache invalidation: pos_layouts now includes `/default`, kds_devices includes `/active`, devices includes `/device-enrollment-tokens`

# Release Notes - v3.1.42

## Instant EMC Config Propagation to All Workstations

### What Changed
All EMC (Enterprise Management Console) configuration changes now push instantly to every connected POS workstation and KDS device via WebSocket. Previously, only a handful of config categories (menu items, employees, RVCs, tenders, discounts, service charges, printers) sent real-time update notifications. 73 config mutation routes were missing broadcast calls, so changes to layouts, modifiers, tax groups, roles, and many others required a manual page reload or a 2-minute polling cycle to take effect.

### Routes Added (73 total)
- **POS Layouts**: Create, update, delete, save cells/buttons, RVC assignments, set default
- **Modifiers & Modifier Groups**: Create, update, delete, add/remove members, menu item links
- **Menu Items**: Delete, bulk import, SLU link/unlink
- **Major Groups & Family Groups**: Create, update, delete
- **Tax Groups**: Create, update, delete
- **Print Classes**: Create, update, delete
- **Order Devices**: Create, update, delete, printer/KDS links
- **KDS Devices**: Create, update, delete
- **Print Class Routing**: Create, delete
- **Roles & Privileges**: Create, update, delete, privilege assignments, rule changes
- **Employees**: Assignment changes, job codes, EMC access, availability
- **Properties**: Create, update, business date increment/advance
- **Enterprises**: Create, update, delete
- **Devices**: Create, update, delete, enrollment tokens, enroll, bulk import
- **Workstations**: Create
- **Ingredient Prefixes & Recipe Ingredients**: Create, update, delete

### Frontend Cache Invalidation
Added 14 new category mappings to the `useConfigSync` hook so the POS frontend knows exactly which query caches to invalidate when each config category changes:
- `pos_layouts`, `major_groups`, `family_groups`, `tax_groups`, `print_classes`, `order_devices`, `kds_devices`, `print_routing`, `workstations`, `roles`, `enterprises`, `devices`, `ingredients`, `job_codes`

### Impact
- Any change made in EMC is now reflected on all connected workstations within seconds
- No page reload required
- Works in GREEN mode (cloud direct) and YELLOW mode (via CAPS WebSocket relay)

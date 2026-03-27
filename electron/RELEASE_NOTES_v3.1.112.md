# Release Notes — v3.1.112

**Date**: 2026-03-27
**Previous Version**: v3.1.111

---

## Bug Fixes

### Clear Totals Orphan Bug (Task #65)
- **Problem**: `clearSalesData()` only looked up current RVC IDs for the property. If an RVC was deleted and recreated with a new ID, checks tied to the old RVC became orphans that Clear Totals could never reach, leaving stale transactional data in the Cloud database.
- **Fix**: Clear Totals now queries for orphaned `rvc_id` values in the checks table that no longer exist in the `rvcs` table, and includes those orphan RVC IDs in the delete scope. This applies to checks, audit logs, KDS tickets, offline queue, and RVC counters.

### EMC Scope Visibility (Task #65)
- **Properties** link hidden from EMC Configuration grid at RVC scope (property-level config only).
- **Utilities** link hidden from EMC Configuration grid at RVC scope (Clear Totals is a property-level operation).
- **Onboarding Checklist** link hidden from EMC Configuration grid at RVC scope (enterprise/property only).
- Direct URL navigation to these pages at RVC scope redirects to `/emc`.

## Cleanup

### Dead Code Removal (Task #66)
- Deleted `client/src/pages/admin/index.tsx` (old sidebar-based admin layout shell).
- Deleted `client/src/components/admin/admin-sidebar.tsx` (old admin sidebar component).
- `/admin` routes now redirect to `/emc` instead of `/login`.
- Individual page components in `pages/admin/` are retained — the new EMC layout imports and renders them.

---

## Files Changed
- `server/storage.ts` — clearSalesData orphan RVC detection
- `client/src/pages/emc/admin-layout.tsx` — propertyOnly flags on Properties, Utilities, Onboarding
- `client/src/App.tsx` — /admin redirect target changed to /emc
- `client/src/pages/admin/index.tsx` — DELETED
- `client/src/components/admin/admin-sidebar.tsx` — DELETED

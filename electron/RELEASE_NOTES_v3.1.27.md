# Cloud POS v3.1.27 Release Notes

**Release Date**: March 3, 2026  
**Build**: Electron Windows Installer  
**Commit**: 5fe15759072ba2ec631f56ffb9d1614edf9e160c

---

## Architecture Enforcement — WS→CAPS→Cloud

This release enforces the mandatory data flow architecture:

- **Transaction data flows ONE WAY**: WS → CAPS → Cloud
- **Configuration data flows DOWN**: Cloud → WS (menus, employees, tax rates, discounts, etc.)
- **Cloud NEVER sends transaction data back to WS**

### Changes:
- **Removed `syncFromCloud()` open checks download** — The sync function was downloading open checks FROM cloud back to the workstation every 5 minutes and on startup. This violated the architecture and was the **root cause of checks disappearing** from the open check screen. The UNIQUE index on `(rvc_id, check_number)` caused `INSERT OR REPLACE` to silently overwrite the original local check rows with cloud copies that had different IDs.
- **Disabled `syncToCloud()` dead code** — This method directly replayed WS queue operations to cloud, bypassing CAPS. While not actively called (disabled in v3.1.18), it was still exposed via preload IPC. Now replaced with a stub that logs a warning.

---

## Bug Fixes (8)

### Bug 1: Credit Card Payment 503 Error
- **Symptom**: Credit card payments failed with 503 "Service unavailable offline"
- **Root Cause**: `/api/terminal-sessions` was listed in `LOCAL_FIRST_WRITE_PATTERNS` and the interceptor's write endpoints, causing it to be blocked as a local-only operation
- **Fix**: Removed `terminal-sessions` from `LOCAL_FIRST_WRITE_PATTERNS` in `main.cjs`, `writeEndpoints` in interceptor, and the explicit 503 block. Terminal session requests now pass through directly to cloud in GREEN mode.
- **Files**: `electron/main.cjs`, `electron/offline-api-interceptor.cjs`

### Bug 2: "No such table: roles" Error
- **Symptom**: Offline authentication failed with SQLite error about missing `roles` table
- **Root Cause**: The `roles` and `role_privileges` tables were never created in the offline SQLite database initialization
- **Fix**: Added `CREATE TABLE IF NOT EXISTS` for both `roles` and `role_privileges` tables in the `createTables()` method
- **Files**: `electron/offline-database.cjs`

### Bug 3: CAPS Send-to-Kitchen 400 Error
- **Symptom**: Send-to-kitchen requests to CAPS returned 400 due to missing columns
- **Root Cause**: CAPS SQLite schema was missing columns on `check_items` (`sent_to_kitchen`, `sent`, `discount_id`, `discount_name`, `discount_amount`, `discount_type`, `modifiers_json`) and `modifier_groups` (`code`)
- **Fix**: Added v7 schema migration with ALTER TABLE statements for all missing columns, wrapped in try/catch. Added error logging before 400 responses in send-to-kitchen handlers.
- **Files**: `electron/service-host-embedded.cjs`

### Bug 4: KDS Black Screen
- **Symptom**: KDS display showed a blank/black screen with no tickets
- **Root Cause**: `configuredKdsDevice?.propertyId` was undefined when the KDS device API hadn't loaded yet, blocking all queries
- **Fix**: Added fallback to `devicePropertyId` from device context (stored in localStorage during enrollment). Added diagnostic `useEffect` for KDS init state logging. Added empty state guard with informative "KDS Not Configured" message and reconfigure/retry buttons.
- **Files**: `client/src/pages/kds.tsx`

### Bug 5: Merge Checks 503 Error
- **Symptom**: Merging checks failed with 503 in GREEN mode
- **Root Cause**: Explicit 503 block in interceptor prevented merge requests from reaching cloud
- **Fix**: Added GREEN mode check — when in GREEN mode, merge requests now fall through to cloud instead of returning 503
- **Files**: `electron/offline-api-interceptor.cjs`

### Bug 6: Check 404 on Reopen/Edit
- **Symptom**: Reopening or editing closed checks returned 404 "Check not found (offline)"
- **Root Cause**: Interceptor returned 404 for checks not found in local SQLite, even when cloud was available in GREEN mode
- **Fix**: Added `if (this._connectionMode === 'green') return null;` before all 6 "Check not found" 404 returns, allowing requests to fall through to cloud when online
- **Files**: `electron/offline-api-interceptor.cjs`

### Bug 7: Checks Disappearing from Open Check Screen
- **Symptom**: Open checks disappeared after sync cycles, breaking POS operations
- **Root Cause**: Architecture violation — `syncFromCloud()` downloaded open checks FROM cloud, creating ID collisions via UNIQUE index on `(rvc_id, check_number)` that silently overwrote local check rows
- **Fix**: Removed the entire open checks download block from `syncFromCloud()`. WS local SQLite is now authoritative for its own checks. Transaction data only flows WS → CAPS → Cloud.
- **Files**: `electron/offline-database.cjs`

### Bug 8: Split Check Single-Item Selection
- **Symptom**: Could only select one item at a time when splitting checks, requiring multiple taps to move items
- **Root Cause**: State used `selectedItemId: string | null` (single selection)
- **Fix**: Replaced with `selectedItemIds: Set<string>` for multi-select. Items toggle in/out of selection on tap. All selected items move to target check in one action. Share mode only enabled when exactly 1 item selected.
- **Files**: `client/src/components/pos/advanced-split-check-modal.tsx`

---

## Files Modified
- `electron/electron-builder.json` — Version bump 3.1.26 → 3.1.27
- `electron/main.cjs` — Removed terminal-sessions from LOCAL_FIRST_WRITE_PATTERNS
- `electron/offline-api-interceptor.cjs` — Removed terminal-sessions blocks, added GREEN mode fallthrough for merge and 6x check 404 locations
- `electron/offline-database.cjs` — Added roles/role_privileges tables, removed open checks download, disabled syncToCloud
- `electron/service-host-embedded.cjs` — CAPS v7 schema migration for check_items and modifier_groups columns
- `client/src/pages/kds.tsx` — propertyId fallback, diagnostic logging, empty state guard
- `client/src/components/pos/advanced-split-check-modal.tsx` — Multi-select item splitting

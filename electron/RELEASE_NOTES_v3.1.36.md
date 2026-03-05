# Cloud POS v3.1.36 — CAPS Single Source of Truth

## Architecture Change: CAPS-First Transaction Data Flow

This release implements a core architectural fix to how workstations handle check/transaction data. CAPS is now the single source of truth for all transactional data, eliminating the issue where each workstation maintained its own isolated copy of checks in local SQLite.

### What Changed

**Data Flow (Before)**
- All modes: Check reads/writes intercepted by LOCAL_FIRST patterns → local SQLite first → background sync
- Each workstation was an isolated island of check data
- Clear Sales Data cleared cloud + CAPS but workstations kept showing old checks from local SQLite

**Data Flow (After)**
- GREEN mode: Check reads/writes go directly to cloud API
- YELLOW mode: Check reads/writes proxy to CAPS over LAN (CAPS is single source of truth)
- RED mode (emergency only): Local SQLite used as last-resort fallback when both CAPS and cloud are unreachable

### Changes

- **Removed checks from LOCAL_FIRST patterns** — `/api/checks`, `/api/check-items`, `/api/check-discounts`, `/api/check-service-charges` no longer intercepted by local SQLite in GREEN or YELLOW modes
- **RED-mode-only offline check handling** — The offline interceptor now gates check endpoint handling to RED mode only via `setConnectionMode()`. Config, print, KDS, and auth endpoints continue to work in all modes as before
- **Added `/checks/orders` route to CAPS** — Critical missing endpoint that the Orders screen uses. Returns enriched check list with employee names, item counts, unsent counts, and proper field mapping (`openedAt` instead of `createdAt`)
- **Enriched `/checks/open` on CAPS** — Now returns the same enriched format as the cloud API with employee names, item counts, and round info
- **Fixed duplicate `setConnectionMode`** — Removed redundant method definition in offline interceptor; kept the version with logging

### Unaffected Systems

- **Printing**: Works the same across all modes (no path translation needed)
- **KDS**: Adapts per mode as before (cloud WebSocket in GREEN, CAPS WebSocket in YELLOW)
- **Payments**: Work correctly across all modes (EMV terminal communication is direct TCP)
- **Cash drawer kick**: Unchanged
- **Clear Sales Data**: Now works correctly — workstations see empty data immediately because they read from CAPS/cloud, not local copies

### Operation Matrix

| Operation | GREEN | YELLOW | RED |
|---|---|---|---|
| Open/View Checks | Cloud API | CAPS `/api/checks` | Local SQLite |
| Add Items | Cloud API | CAPS `/api/checks/:id/items` | Local SQLite |
| Send to Kitchen | Cloud API | CAPS `/api/checks/:id/send` | Local queue |
| Payment (cash) | Cloud API | CAPS `/api/checks/:id/pay` | Local SQLite |
| Payment (card) | Cloud + EMV | CAPS + EMV | Not supported |
| Print Receipt | Cloud → Print Agent | CAPS → TCP | Local queue |
| KDS | Cloud WebSocket | CAPS WebSocket | Unavailable |

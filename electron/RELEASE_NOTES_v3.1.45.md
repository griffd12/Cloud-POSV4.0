# v3.1.45 Release Notes

## Critical Fix: Service Host Crash Loop

### Root Cause

The embedded CAPS service host (the local server that handles POS transactions and KDS connectivity) had an unhandled promise rejection in its transaction sync worker. When the cloud was temporarily unreachable (network outage, Replit sleep, DNS failure) or returned an error response (400 Bad Request for malformed journal entries), the error propagated up through `syncJournalEntries()` into `processQueue()` which only had a `try/finally` block — no `catch`. The uncaught error became an unhandled promise rejection, which Node.js treats as a fatal error, killing the entire service host process.

The main Electron process would detect the crash and restart the service host, but the same pending journal entries would immediately trigger the same error, creating an infinite crash loop (22+ crashes observed in production logs within 3 minutes).

This crash loop also caused the KDS displays to show "cannot access device connector" errors, because the KDS connects to the service host for kitchen tickets — with the service host crashing every 7 seconds, the KDS could never maintain a stable connection.

### Fixes Applied

**Fix 1 — Catch journal sync errors in processQueue()**
- Wrapped `syncJournalEntries()` call inside `processQueue()` with its own `try/catch` block
- Journal sync failures are now logged as warnings and the sync worker continues to process other pending items
- The error is absorbed — it never escapes as an unhandled promise rejection
- Added `.catch()` safety handlers on all `processQueue()` invocations in `startWorker()` (both the initial call and the setInterval callback) as a defense-in-depth measure

**Fix 2 — Poison-pill journal entry handling**
- Journal entries that fail with permanent HTTP errors (400, 404, 409, 422) are now marked as permanently failed via `markJournalFailed()` so they stop being retried
- Previously, bad journal entries (e.g., malformed data from a previous session) would be retried indefinitely on every sync cycle, triggering the crash each time
- Transient errors (network failures, 5xx responses) still allow retry on the next cycle without marking entries as failed

### Impact
- Service host no longer crashes when cloud is unreachable or returns error responses
- KDS displays maintain stable connection to service host during cloud outages
- Poisoned journal entries from previous sessions are cleared automatically instead of crash-looping forever
- POS continues operating normally through cloud connectivity interruptions

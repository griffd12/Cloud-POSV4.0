# Release Notes - v3.1.40

## KDS Bump & Clear-All Fix (GREEN Mode)

### Bug Fix
- **KDS bump and clear-all not working in GREEN mode**: The offline interceptor was catching all KDS ticket write requests (bump, recall, bump-all) locally and returning a fake 200 response — even when the device had a live cloud connection. The cloud database never received the bump, so tickets reappeared on the next poll cycle.

### Root Cause
- `/api/kds-tickets` was listed in `LOCAL_FIRST_WRITE_PATTERNS` in `main.cjs`, causing ALL KDS POST requests to be handled by the offline interceptor regardless of connection mode. The interceptor returned `{ success: true, offline: true }` immediately without forwarding to cloud.

### Changes
- **electron/main.cjs**: Removed `/api/kds-tickets` from `LOCAL_FIRST_WRITE_PATTERNS`. In GREEN mode, KDS bump/recall/bump-all requests now go directly to the cloud server. In RED mode (fully offline), the offline interceptor still handles these requests and queues them for sync.
- **service-host/src/routes/api.ts**: Added missing `POST /kds-tickets/bump-all` route to CAPS service for YELLOW mode fallback.
- **electron/service-host-embedded.cjs**: Added matching `POST /kds-tickets/bump-all` route to embedded CAPS.

### Affected Flows
- KDS single ticket bump (`POST /api/kds-tickets/:id/bump`)
- KDS ticket recall (`POST /api/kds-tickets/:id/recall`)
- KDS clear all (`POST /api/kds-tickets/bump-all`)
- All three now correctly reach cloud in GREEN mode

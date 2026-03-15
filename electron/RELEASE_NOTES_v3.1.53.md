# v3.1.53 Release Notes

## Bug Fixes

### Offline Sync Retry Storm (Critical)
- **Fixed infinite retry loop**: Legacy `syncOfflineData()` path in `main.cjs` was running alongside the enhanced sync path, bypassing backoff logic and retrying stuck operations every 5 seconds indefinitely. Legacy path is now gated behind `!enhancedOfflineDb` so it only runs when the enhanced system is unavailable.
- **HTTP 4xx now treated as permanent failure**: When CAPS returns HTTP 400, 404, or 422, the operation is immediately marked as permanently failed instead of being retried. These status codes indicate malformed requests that will never succeed.
- **Stale operation auto-cleanup**: On first sync cycle after startup, any pending operations older than 24 hours are automatically expired and marked as permanently failed with reason "expired". This prevents stale operations from accumulating indefinitely.
- **Backoff log spam suppressed**: The "waiting for backoff retry" debug log now only emits when the count of waiting operations changes, eliminating ~1,400 redundant log lines per hour.

### Protocol Interceptor
- **Added `/api/item-availability/increment` to LOCAL_FIRST_WRITE_PATTERNS**: The interceptor already handled `decrement` locally but not `increment`, causing increment requests to fail when cloud is unreachable and get queued with potentially malformed payloads.

### CAPS Queue Operation Endpoint
- **More lenient `type` field validation**: If `type` is missing but `endpoint` is present, the type is now derived from the endpoint path instead of returning HTTP 400. This prevents operations queued without an explicit type from being permanently rejected.

## Files Changed
- `electron/main.cjs` - Legacy sync gating, interceptor pattern addition
- `electron/offline-database.cjs` - Permanent failure classification, stale cleanup, log suppression
- `electron/service-host-embedded.cjs` - Queue-operation type leniency
- `service-host/src/routes/api.ts` - Queue-operation method default
- `electron/electron-builder.json` - Version bump to 3.1.53

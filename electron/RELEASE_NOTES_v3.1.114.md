# v3.1.114 — Human-Readable Server Logs

## Summary
Replace raw UUIDs with human-readable names (property names, RVC names, device names, employee names) across all server log output in Cloud, CAPS, and Electron layers. Logs are now actionable for operators without needing to cross-reference UUID lookups.

## Changes

### Cloud Server (storage.ts)
- **clearSalesData**: Resolves property name and RVC names at function entry, uses `[clearSalesData] [PropertyName]` prefix on all 12+ log statements instead of raw property/RVC UUIDs
- Log lines now show: `[clearSalesData] [SNS-Newport Beach] Starting transaction — RVCs: [SNS-001 Shop], orphanedRvcIds: 0`

### Cloud Server (routes.ts)
- **Service Host WebSocket**: Connect, disconnect, and transaction upload logs show service host name (e.g., `Service Host "SNS-001 CAPS-CC" connected`) instead of UUID
- Both primary and secondary WS handlers updated consistently

### CAPS / Electron (service-host-embedded.cjs)
- **Startup banner**: After config sync, logs property name and service host name: `[CAPS] Property: SNS-Newport Beach | Service Host: CAPS`
- **KDS client**: Connect/disconnect logs resolve KDS device name from local SQLite: `[KDS] Client connected: Kitchen Display 1`
- **Cloud WebSocket**: All connection lifecycle logs prefixed with `[Cloud WS]` for consistency
- **ConfigSync**: Full sync, delta sync, and real-time update logs prefixed with `[ConfigSync]`
- **Auth**: Employee privilege fallback shows first name instead of UUID
- **Check sync**: Shows check number (`check #1001`) instead of check UUID
- **Workstation WS**: Prefixed with `[WS]` for consistency
- **Entity operations**: Soft-delete/hard-delete logs prefixed with `[ConfigSync]`
- **Version banner**: Updated to v3.1.114

## Impact
- No schema changes
- No API changes
- No frontend changes
- Logging-only improvement across all three system layers

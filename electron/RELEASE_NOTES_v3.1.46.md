# Cloud POS v3.1.46 Release Notes

## Config Sync Reliability Fix

### Problem
Real-time config updates from EMC (price changes, menu edits, etc.) sometimes failed to reach the POS. When the WebSocket connection briefly dropped, any broadcasts during the disconnection gap were permanently lost — the POS would show stale data until manually reloaded.

### Fixes

1. **Reconnect catch-up invalidation**: When the WebSocket reconnects after a drop, ALL config-related queries are automatically invalidated and refetched. This ensures the POS catches up on any missed updates during the disconnection window.

2. **Faster reconnect**: Reduced WebSocket reconnect delay from 5 seconds to 2 seconds, minimizing the window where updates can be missed.

3. **Broader menu invalidation**: Menu item changes now also invalidate POS layout queries (`/api/pos-layouts`, `/api/pos-layouts/default`), ensuring custom grid layouts refresh alongside menu item data.

4. **Config sync logging**: Added `[ConfigSync]` prefixed logging for connect, disconnect, reconnect, and config_update events to aid debugging.

### Files Changed
- `client/src/hooks/use-config-sync.ts`

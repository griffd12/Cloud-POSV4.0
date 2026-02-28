# Cloud POS v3.1.0 — CAPS Offline Architecture

**Release Date:** February 2026  
**Build Target:** Windows x64 (NSIS Installer)  
**Previous Version:** v3.0.0

---

## Summary

V3.1.0 fixes the critical offline failure discovered during live testing at SNS-001 Newport Beach (Sugar and Spice). In v3.0.0, when internet connectivity dropped, all workstations immediately fell to RED mode (local SQLite only) — no workstation could authenticate users, and the CAPS server (WS01) never started the service-host process.

V3.1.0 implements proper CAPS (Check And Posting Service) auto-discovery and Yellow mode, enabling LAN-based offline operations through the designated CAPS workstation.

---

## What's Fixed

### CAPS Auto-Discovery (activation-config)
- On startup, each workstation now calls `GET /api/workstations/{deviceId}/activation-config` to discover its CAPS configuration
- The response identifies the CAPS workstation, its LAN IP, and the `serviceHostUrl` (e.g., `http://192.168.1.16:3001`)
- Configuration is cached locally so it persists across restarts even if cloud is unreachable

### Service-Host Auto-Start on CAPS Workstation
- When a workstation detects it IS the designated CAPS server (`isCapsWorkstation === true`), it automatically starts the service-host process on port 3001
- The service-host is bundled as `service-host-embedded.cjs` inside the Electron app
- Health check polling confirms the service-host is ready before marking it operational
- Auto-restart on crash with 5-second backoff

### Yellow Mode (LAN-Based CAPS)
- **Green mode** (cloud reachable): All requests go to cloud — normal operation
- **Yellow mode** (cloud down, CAPS up): API requests proxy to the CAPS workstation on the LAN
- **Red mode** (cloud down, CAPS down): Falls back to local SQLite — last resort
- The protocol interceptor now tries CAPS before falling to local SQLite
- Connection mode is sent to the frontend renderer via IPC and localStorage
- The frontend connection banner updates to show Yellow/Red status

### Offline Sign-In Fix
- Fixed the authentication freeze that occurred when internet dropped on non-CAPS workstations
- The offline interceptor now handles `POST /api/auth/login` immediately without waiting for cloud timeout
- Connectivity checks now probe CAPS availability when cloud is unreachable, enabling faster mode transitions

### Frontend Integration
- `serviceHostUrl` is injected into the renderer's `localStorage` on page load
- `connectionMode` is sent via IPC (`connection-mode` event) for real-time banner updates
- The `get-app-info` IPC handler now returns CAPS-related fields: `connectionMode`, `serviceHostUrl`, `capsWorkstationId`, `capsWorkstationName`, `isCapsWorkstation`

---

## Architecture

```
Internet Available (GREEN):
  [All Workstations] ──HTTPS──> [Cloud Server]

Internet Down (YELLOW):
  [WS02, Derek-Laptop] ──HTTP──> [WS01:3001 CAPS] ──(queued)──> [Cloud when restored]
  [WS01] ──(local service-host)──> [WS01:3001 CAPS]

Internet + LAN Down (RED):
  [Each Workstation] ──> [Local SQLite]
```

---

## Build Changes

- `electron/build-service-host.cjs` — New esbuild script that compiles `service-host/src/` to a single CJS bundle
- `electron/service-host-embedded.cjs` — Generated bundle included in the Electron app (built during CI)
- `.github/workflows/electron-build.yml` — Added service-host build step before electron-builder
- `electron/electron-builder.json` — Added service-host bundle to files list; version bumped to 3.1.0

---

## Configuration

No new EMC configuration required. The existing CAPS workstation designation (Property → capsWorkstationId) is used automatically. Ensure:

1. CAPS workstation is designated in EMC (Property form → CAPS Workstation dropdown)
2. All workstations have correct LAN IPs configured
3. Port 3001 is accessible on the CAPS workstation's LAN

---

## POS UI Fixes

### COM Panel on Custom POS Layouts
- The Conversational Ordering Module (COM / Menu Build) panel now renders correctly on **both** custom grid layouts and standard SLU layouts
- Previously, tapping a menu-build-enabled item on a custom grid layout did nothing — the COM panel was only wired to the standard SLU branch
- Pizza Builder navigation also verified working from both layout modes

### EMC Menu Build Multi-Select
- The "Add Ingredient from Modifiers" UI in the Menu Items EMC form now uses **multi-select checkboxes** instead of a single-select dropdown
- Modifiers are grouped by their modifier group (e.g., "Ice Cream Flavor", "Toppings", "Drizzles") with section headers
- Check/uncheck multiple ingredients at once — no more picking one at a time

### CI/CD Fix
- GitHub Actions workflow updated to use the built-in `GITHUB_TOKEN` instead of a personal access token for the release step
- Eliminates "Bad credentials" failures when the personal token expires

---

## Known Limitations

- Service-host embedded bundle requires `better-sqlite3` native module (already included in Electron build)
- Yellow mode requires LAN connectivity between workstations
- First boot requires internet to fetch activation-config (cached thereafter)

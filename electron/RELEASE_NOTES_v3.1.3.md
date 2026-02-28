# Cloud POS v3.1.3 — CAPS Service-Host Complete Fix

**Release Date:** February 2026
**Build Target:** Windows x64 (NSIS Installer)
**Previous Version:** v3.1.2

---

## Summary

Comprehensive fix for the CAPS service-host system. After thorough code review of the entire flow (Electron startup, activation-config, service-host launch, cloud sync, WebSocket auth, offline mode), five issues were identified and fixed in this single release.

---

## What's Fixed

### 1. Service-Host Token Not Provided (Critical)
- **Root Cause**: The activation-config endpoint did not return the service-host's registration token. The Electron app never saved it to the local config. So `SERVICE_HOST_TOKEN` was always empty, causing `"Service Host token is required"` crash on startup.
- **Fix**: The activation-config endpoint now returns `serviceHostToken` in `connectionConfig` when the requesting workstation is the CAPS workstation. The Electron app extracts and saves it to the local config file.

### 2. WebSocket Auth Used Non-Existent Field (Critical)
- **Root Cause**: The cloud server's WebSocket handler for service-host connections checked `serviceHost.authToken` — a field that does not exist in the database schema. This meant the service-host's WebSocket connection to the cloud would always be rejected, even with a valid token.
- **Fix**: Changed to `serviceHost.registrationToken`, which is the actual schema field.

### 3. CAL Setup Used Non-Existent Field (High)
- **Root Cause**: The CAL setup device registration endpoint referenced `existingHost.token` and `updateServiceHost(id, { token: ... })` — but the schema field is `registrationToken`, not `token`. This caused the setup flow to never find or update existing service-host tokens.
- **Fix**: Changed all references to use `registrationToken`.

### 4. Token Storage Inconsistency (Medium)
- **Root Cause**: The POST `/api/service-hosts` endpoint stored the raw token, but the CAL wizard provisioning stored a SHA-256 hash. The sync authentication endpoints compare the header value directly against the stored `registrationToken`. Tokens created via one path would fail authentication via the other.
- **Fix**: Standardized on storing raw tokens everywhere. Both creation paths now store the raw token.

---

## Impact

- CAPS workstation (WS01) service-host will start successfully on port 3001
- Cloud WebSocket sync connection will authenticate correctly
- Yellow mode (LAN-based offline via CAPS) will function when internet drops
- Future CAL wizard device provisioning will correctly handle service-host tokens

---

## Upgrade Notes

- Auto-update from v3.1.2 will apply automatically.
- No manual configuration changes needed.
- After update, WS01 will fetch the service-host token on first startup and persist it locally.
- Verify service-host startup in logs: look for "Service Host listening on http://0.0.0.0:3001".

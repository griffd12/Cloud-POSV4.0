# Cloud POS v3.1.2 — Service-Host Hotfix 2

**Release Date:** February 2026
**Build Target:** Windows x64 (NSIS Installer)
**Previous Version:** v3.1.1

---

## Summary

Second hotfix for the CAPS service-host startup crash on WS01. V3.1.1 fixed the shebang syntax error but exposed a second issue: `fileURLToPath(__filename)` throws `ERR_INVALID_URL_SCHEME` because esbuild's ESM-to-CJS conversion produces code that passes a plain filesystem path to a function expecting a `file://` URL.

---

## What's Fixed

### fileURLToPath ERR_INVALID_URL_SCHEME (Critical)
- **Root Cause**: The service-host source uses the standard ESM `__dirname` shim: `path.dirname(fileURLToPath(import.meta.url))`. The esbuild bundler replaces `import.meta.url` with `__filename` (via `--define`), producing `fileURLToPath(__filename)`. But `__filename` in CJS is a plain path (`C:\Program Files\...`), not a `file://` URL, so Node's `fileURLToPath()` throws `TypeError [ERR_INVALID_URL_SCHEME]`.
- **Fix**: Build script now post-processes the bundle to replace `path.dirname(fileURLToPath(__filename))` with `__dirname` and `fileURLToPath(__filename)` with `__filename`, since these are already valid CJS path values.
- **Impact**: CAPS workstation service-host will start successfully, enabling Yellow mode for LAN-based offline operations.

---

## Upgrade Notes

- Auto-update from v3.1.1 will apply automatically on all workstations.
- No configuration changes needed.
- After update, WS01 should successfully start the service-host on port 3001 (verify in logs — look for "Service Host listening on http://0.0.0.0:3001").

# Cloud POS v3.1.100 — CAPS Terminal Payment Cloud Proxy

**Release Date:** March 20, 2026  
**Previous Version:** v3.1.99

---

## Summary

All CAPS terminal credit/debit card payments now route through the Cloud's existing payment processor adapters instead of using raw TCP sockets. This fixes terminal payments for **all** configured payment processors — Stripe, Heartland, North/Ingenico, and Square — when running in the Electron desktop app.

---

## What's New

### CAPS Terminal Payment Cloud Proxy
- **All terminal payments proxy through Cloud** — CAPS creates a local terminal session, POSTs to Cloud `/api/terminal-sessions`, and polls for completion. Cloud handles all processor-specific communication (Stripe Terminal SDK, Heartland PayApp HTTP, North XML, Square Terminal API).
- **Cloud-eligible terminal detection** — Automatically routes Stripe (S700, M2, WisePOS E), PAX, Verifone, and Ingenico terminals through Cloud. Raw TCP path preserved only for generic/legacy terminals.
- **Cloud-unreachable handling** — If Cloud is not connected when a card payment is attempted, CAPS returns an immediate, clear error message instead of hanging or crashing.

### FK Constraint Crash Fix
- **Resolved `FOREIGN KEY constraint failed` crash** — `authorizeOffline` and `authorize` previously inserted `tender_id = 'card'` (a hardcoded string) into `check_payments`, which violated the foreign key constraint to the `tenders` table. Now uses `resolveCardTenderId()` to look up the actual credit/debit tender UUID.
- **Missing tender protection** — If no card tender is configured in EMC, returns a clear error message instead of crashing.

### Terminal Failure Handling
- **No more silent offline fallback for card payments** — `handleTerminalFailure` previously called `authorizeOffline()` which generated a fake auth code. Now returns a clean error so the cashier knows the payment did not process.

### Schema v16 Migration
- **New `terminal_devices` columns** — `cloud_device_id`, `terminal_id`, `connection_type` added to CAPS SQLite schema. These are populated from Cloud config sync so CAPS can identify which Cloud reader ID corresponds to each physical terminal.
- **`terminal_sessions.cloud_session_id`** — New column tracks the Cloud session ID for proxied terminal payments.

### Config Sync
- **Terminal device fields synced** — `upsertTerminalDevice()` now persists `cloudDeviceId`, `terminalId`, and `connectionType` from Cloud config sync responses.

---

## Payment Processor Coverage

| Processor | Terminal Models | Cloud Adapter | CAPS Path |
|---|---|---|---|
| Stripe | S700, M2, WisePOS E, BBPOS Chipper | Stripe Terminal SDK | Cloud proxy |
| Heartland | PAX A35/A77, Verifone T650c/T650p/P630, Ingenico iPP350/iSC Touch 250 | Semi-integrated HTTP | Cloud proxy |
| North (EPX) | Ingenico Lane 3000/5000 | HTTP/WebSocket XML | Cloud proxy |
| Square | (via Square Terminal API) | Square Payments API | Cloud proxy |
| Elavon | (no terminal — gateway only) | Converge REST API | N/A |
| Generic | Custom raw TCP | N/A | Raw TCP (legacy) |

---

## Files Changed

### Service Host
- `service-host/src/services/payment-controller.ts` — Complete rewrite: Cloud proxy path, raw TCP path, `resolveCardTenderId()`, no silent offline fallback
- `service-host/src/db/schema.ts` — Schema v16, new `terminal_devices` columns
- `service-host/src/db/database.ts` — v16 migration, `upsertTerminalDevice` updated, `getDefaultCardTender()` added
- `service-host/src/index.ts` — Pass `cloudConnection` to `PaymentController` constructor
- `service-host/src/routes/api.ts` — `terminal_sessions.cloud_session_id` column

### Electron
- `electron/service-host-embedded.cjs` — Rebuilt CJS bundle
- `electron/build-info.json` — Version 3.1.100
- `electron/electron-builder.json` — Version 3.1.100

---

## Breaking Changes
None. All changes are backward-compatible. Raw TCP terminal path still works for generic terminals. Schema migration is automatic.

## Known Limitations
- True offline store-and-forward for credit card payments is not yet implemented. Card payments require Cloud connectivity (GREEN mode).
- Elavon terminals are not supported (Elavon Converge is gateway-only with no terminal SDK).

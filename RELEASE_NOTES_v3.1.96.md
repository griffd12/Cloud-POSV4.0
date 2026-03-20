# Cloud POS v3.1.96 Release Notes — EMV Terminal Wiring + Discount Fix + Smart Cash

## Real EMV Terminal Communication (Service-Host TCP)
- **EMVTerminalService**: New `service-host/src/services/emv-terminal.ts` implements pure Node.js TCP socket communication to physical EMV terminals. Mirrors the Electron `emv-terminal.cjs` logic but runs directly in the service-host process, eliminating the need for Electron IPC bridging.
- **PaymentController rewrite**: `processTerminalSession()` now performs real terminal communication:
  1. Looks up `terminal_devices` table by `terminalDeviceId` to get IP address and port
  2. Opens TCP connection to the physical terminal (default port 9100)
  3. Sends JSON payment payload with amount, currency, and transaction type
  4. Waits for terminal response (approved/declined with auth code, card data, entry method)
  5. Creates `check_payment` record with real terminal response data
  6. Updates `terminal_session` status through full lifecycle: `pending` → `waiting_for_card` → `processing` → `approved`/`declined`
- **Offline store-and-forward**: If terminal device is unreachable (TCP connection fails), payment is stored locally with `completed_offline` status and an offline auth code for later forwarding when connectivity restores.
- **Structured logging**: All PaymentController logging now uses `getLogger('Payment')` writing to CAPS local log files. No bare `console.log`.

## Demo Mode Buttons Hidden in Production
- **Simulate Approve/Decline buttons**: Wrapped in `import.meta.env.DEV` guard — only visible during development. Production Electron builds show only the real terminal waiting screen.
- **Simulate endpoint**: `/api/terminal-sessions/:id/simulate` already returns `403 Forbidden` when `NODE_ENV !== 'development'`.

## CAPS Discount Route Fix
- **Root cause**: CAPS route `/caps/check-items/:id/discount` was missing `UPDATE check_items SET discount_id, discount_name, discount_amount, discount_type` — discounts were being calculated but never persisted to the check item, so they never reduced the check total.
- **Fix**: Added the missing UPDATE statement to write discount fields back to the check_items row after calculation.
- **Discount tracing**: Both CAPS and non-CAPS discount routes now use `getLogger('Discount')` for structured logging to CAPS local log files, making discount application fully traceable.

## Smart Quick Cash Tender Buttons
- **Dynamic calculation**: Quick cash buttons now compute smart amounts based on the remaining balance instead of showing static $1/$5/$10/$20/$50/$100.
- **Algorithm**: Generates the next logical round dollar amounts above the check total. For example:
  - $4.29 check → $5, $6, $10, $20, $50, $100
  - $17.42 check → $18, $20, $50, $100
  - $63.15 check → $64, $70, $100
- **Maximum 6 buttons**: Always shows up to 6 options, sorted ascending. The existing "Exact" button continues to handle exact-amount cash tenders.

## Human-Readable System Logs (Task #42)
- All service-host logs now use `getLogger(category)` from `service-host/src/utils/logger.ts` producing clean, human-readable output with timestamps and categories.
- Eliminates raw JSON log dumps and bare `console.log` statements throughout the service-host codebase.

## EMV Payment Process Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EMV PAYMENT PROCESS FLOW                        │
│                   (WS → CAPS → Terminal)                           │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────┐       ┌──────────┐       ┌──────────────┐       ┌──────────┐
  │ Workstation│      │   CAPS    │      │ PaymentController│    │ EMV Terminal│
  │  (UI)     │       │(Service Host)│   │  (Poll Worker) │    │ (S700/etc) │
  └─────┬────┘       └─────┬─────┘      └──────┬────────┘     └─────┬─────┘
        │                   │                    │                    │
  1. Cashier taps          │                    │                    │
     "Credit Card"         │                    │                    │
        │                   │                    │                    │
  2. ───POST /api/terminal-sessions──────►      │                    │
        │  { checkId, amount,           │       │                    │
        │    tenderId, terminalDeviceId }│       │                    │
        │                   │                    │                    │
  3.    │    ◄──── 201 { sessionId,     │       │                    │
        │         status: "pending" } ──┤       │                    │
        │                   │                    │                    │
  4. UI shows              │                    │                    │
     "Connecting           │                    │                    │
      to terminal..."      │                    │                    │
        │                   │            ┌───────┴───────┐           │
  5.    │                   │            │ Poll worker    │           │
        │                   │            │ picks up       │           │
        │                   │            │ pending session│           │
        │                   │            └───────┬───────┘           │
        │                   │                    │                    │
  6.    │                   │  UPDATE status =   │                    │
        │                   │  "waiting_for_card"│                    │
        │                   │◄───────────────────┤                    │
        │                   │                    │                    │
  7. ──GET /api/terminal-sessions/:id──►        │                    │
        │    ◄──── { status:             │       │                    │
        │    "waiting_for_card" } ───────┤       │                    │
        │                   │                    │                    │
  8. UI shows              │                    │                    │
     "Present card         │                    │                    │
      or tap to pay"       │                    │                    │
        │                   │                    │                    │
  9.    │                   │            ┌───────┴───────┐           │
        │                   │            │ Look up        │           │
        │                   │            │ terminal_devices│          │
        │                   │            │ → ip_address,  │           │
        │                   │            │    port        │           │
        │                   │            └───────┬───────┘           │
        │                   │                    │                    │
 10.    │                   │                    │──TCP connect──────►│
        │                   │                    │  ip:port (9100)    │
        │                   │                    │                    │
 11.    │                   │                    │──JSON payload─────►│
        │                   │                    │  { amount, currency,│
        │                   │                    │    transactionType }│
        │                   │                    │                    │
 12.    │                   │                    │                    │
        │                   │                    │  ◄─── Card tap/    │
        │                   │                    │       insert/swipe │
        │                   │                    │                    │
 13.    │                   │                    │◄──JSON response────│
        │                   │                    │  { approved: true, │
        │                   │                    │    authCode: "A123",│
        │                   │                    │    cardLast4: "4242",│
        │                   │                    │    entryMethod }   │
        │                   │                    │                    │
 14.    │                   │  UPDATE status =   │                    │
        │                   │  "approved"        │                    │
        │                   │  INSERT check_     │                    │
        │                   │  payment record    │                    │
        │                   │◄───────────────────┤                    │
        │                   │                    │                    │
 15. ──GET /api/terminal-sessions/:id──►        │                    │
        │    ◄──── { status:             │       │                    │
        │    "approved",                 │       │                    │
        │     authCode, cardLast4 } ─────┤       │                    │
        │                   │                    │                    │
 16. UI shows              │                    │                    │
     "Payment Approved"    │                    │                    │
     Check closes          │                    │                    │
        │                   │                    │                    │

  ═══════════════════════════════════════════════════════════════════
  OFFLINE FALLBACK (Terminal unreachable at step 10):
  ═══════════════════════════════════════════════════════════════════

 10a.   │                   │            TCP connect fails            │
        │                   │            (timeout/refused)            │
        │                   │                    │                    │
 11a.   │                   │  UPDATE status =   │                    │
        │                   │  "completed_offline"│                   │
        │                   │  INSERT check_     │                    │
        │                   │  payment with      │                    │
        │                   │  offline auth code │                    │
        │                   │◄───────────────────┤                    │
        │                   │                    │                    │
 12a. UI shows             │                    │                    │
      "Payment stored      │                    │                    │
       offline — will      │                    │                    │
       forward when        │                    │                    │
       terminal available" │                    │                    │
```

## Files Changed
- `client/src/components/pos/payment-modal.tsx` — Smart quick cash amounts, demo buttons hidden in production
- `service-host/src/services/emv-terminal.ts` — NEW: TCP socket communication to EMV terminals
- `service-host/src/services/payment-controller.ts` — Real terminal session processing with TCP, offline fallback
- `service-host/src/routes/api.ts` — Discount route CAPS fix, structured logging
- `electron/electron-builder.json` — Version bump to 3.1.96
- `electron/build-info.json` — Version bump to 3.1.96

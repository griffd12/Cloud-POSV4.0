# Release Notes — v3.1.113

**Date**: 2026-03-27
**Previous Version**: v3.1.112

---

## Bug Fixes

### DOM Modifier Real-Time KDS Updates
- **Problem**: In Dynamic Order Mode (fire-on-fly), when selecting a menu item with required modifiers, the main item would appear on the KDS immediately, but modifiers selected on the modifier screen would NOT appear on the KDS until "Add to Check" was pressed. This was because the pending item POST (which creates the KDS preview ticket) hadn't resolved yet when the modifier modal opened. Any modifier selections made during that window were silently skipped — the `pendingItemId` was undefined, so the live update function returned early.
- **Fix**: Modifier selections are now buffered when `pendingItemId` is not yet available. As soon as the pending item POST resolves and the ID arrives, any buffered modifier selections are flushed to the server immediately. The modifier modal still opens instantly with no delay to the cashier workflow.
- **Result**: Modifiers (dip choices, toppings, etc.) now appear on the KDS in real-time as the cashier taps them, matching the main item's behavior.

### Smart Workstation Timeout Warning Dialog
- **Problem**: When the POS inactivity timer expired, the system silently cancelled the transaction and signed out the employee. If the cashier had items on the screen (even a full order), everything was voided/closed without warning. This caused lost work — e.g., Check #6 was closed and items removed because the cashier stepped away briefly.
- **Fix**: Added a 30-second countdown warning dialog ("Session Expiring") that appears before the timeout fires. The dialog shows the remaining seconds and offers a "Need More Time" button that resets the inactivity timer. If the cashier doesn't respond within the countdown, the system proceeds with the existing cancel-transaction logic (void unsent items, keep check open if it has previously sent items).
- **Behavior**:
  - Warning appears 30 seconds before timeout
  - "Need More Time" button resets the timer completely
  - Countdown updates every second for accurate display
  - Any user interaction (mouse, keyboard, touch) also dismisses the warning and resets the timer
  - Payment modal still pauses the timeout entirely (no interruption during payment)

---

## Files Changed
- `client/src/components/pos/modifier-modal.tsx` — Buffer + flush logic for DOM modifier live updates
- `client/src/hooks/use-inactivity-logout.ts` — Warning phase with countdown, dismissWarning callback
- `client/src/pages/pos.tsx` — Timeout warning dialog UI, destructured new hook returns

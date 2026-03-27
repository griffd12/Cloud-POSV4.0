# Cloud POS v3.1.110 — Comprehensive Test Script

**Version**: v3.1.110 | **Schema**: V21 | **Date**: ___________  
**Tester**: ___________ | **Workstation**: ___________  
**Property**: SNS-Newport Beach | **RVC**: SNS-001 Shop  
**Enterprise**: 587bd7b1-db7e-487c-b1f7-2315ab093502  
**Property ID**: b0c038b1-5c55-4c63-85fe-5ea9dc64a767

---

## Test Environment Checklist

Before starting, confirm:

- [ ] Windows machine with Electron app installed (v3.1.110)
- [ ] Internet connectivity (Cloud reachable)
- [ ] CAPS SQLite database on local machine
- [ ] At least one configured workstation
- [ ] At least one employee with Manager role (PIN: 9099 — John Smith)
- [ ] At least one employee with Crew role (PIN: 9898 — Grace Kelley)
- [ ] At least one menu item configured (e.g., Frozen Banana $7.50)
- [ ] At least one modifier configured (e.g., Birthday Cake)
- [ ] Cash and Credit Card tenders configured
- [ ] Stripe terminal device configured (if testing CC)
- [ ] KDS device configured
- [ ] Print agent running on the workstation

---

## How To Use This Script

1. Execute each test case (TC) in order — some depend on checks created in prior TCs
2. For each step, mark the result: **PASS** or **FAIL**
3. If FAIL, note the actual behavior in the **Notes** column
4. After each TC, check logs in `%APPDATA%/ops-pos/logs/` for unexpected errors
5. After the full run, complete the Cloud Parity section (TC-24) to verify sync

**Log files to monitor:**
- `app_*.log` — Main app events
- `system_*.log` — Unified log
- `gateway_*.log` — All CAPS API request/response pairs (JSON)
- `service-host-*.log` — Service host internals
- `print-agent_*.log` — Print agent connection

---

## TC-01: App Launch & Boot Sequence

**Preconditions**: App is not running. Previous CAPS SQLite DB exists on disk.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Launch the Electron app | Splash screen appears | | |
| 2 | Observe the system tray / title bar | Version shows **3.1.110** | | |
| 3 | Check `system_*.log` | `OPS-POS v3.1.110` appears near top | | |
| 4 | Watch connection mode indicator | Mode starts at **RED** | | |
| 5 | Wait for CAPS startup | Mode transitions RED → **YELLOW** within ~5s | | |
| 6 | Check logs for schema migration | If first run on V21: `[DB] Running v21 migration` appears. If already V21: `Schema is current (version 21)` | | |
| 7 | Wait for config sync | `Full sync complete: 831 records, version 1` in logs | | |
| 8 | Wait for GREEN | Mode transitions YELLOW → **GREEN** within ~10s of launch | | |
| 9 | Check service host | `Service Host listening on http://0.0.0.0:3001` in logs | | |
| 10 | Verify transaction sync worker | `Starting transaction sync worker... | interval=5000` in logs | | |
| 11 | Verify cloud heartbeat | `Cloud heartbeat started (every 60s)` in logs | | |
| 12 | Check gateway log file | `gateway_*.log` exists and first entries are valid JSON lines | | |

**Total boot time target**: < 15 seconds to GREEN

---

## TC-02: Employee Login

**Preconditions**: App is at login screen, mode is GREEN or YELLOW.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Enter Manager PIN: **9099** | Login succeeds, POS screen loads | | |
| 2 | Verify employee name | "John Smith" displayed | | |
| 3 | Check gateway log | `POST /api/auth/login` with status 200 | | |
| 4 | Verify heartbeat fires | `POST /api/system-status/workstation/heartbeat` in gateway log | | |
| 5 | Verify config loads post-login | GET requests for: `/api/slus`, `/api/tenders`, `/api/tax-groups`, `/api/menu-items`, `/api/discounts`, `/api/pos-layouts/...` — all 200 | | |

---

## TC-03: Create Check & Add Items

**Preconditions**: Logged in as John Smith.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Tap "New Check" / Begin Check button | New check is created | | |
| 2 | Verify check number | Check number increments from previous | | |
| 3 | Check gateway log | `POST /api/caps/checks` returns 200 | | |
| 4 | Check service-host log | `Queued check for sync: <checkId> | action=create` | | |
| 5 | Tap a menu item (e.g., Frozen Banana) | Item appears on check with name and price | | |
| 6 | Verify subtotal | Subtotal = item price (e.g., $7.50) | | |
| 7 | Verify tax | Tax calculated correctly (e.g., 7.25% = $0.54 on $7.50) | | |
| 8 | Verify total | Total = subtotal + tax (e.g., $8.04) | | |
| 9 | Check gateway log | `POST /api/caps/checks/<id>/items` returns 201 | | |
| 10 | Add a second item | Both items appear, totals updated correctly | | |
| 11 | Verify item count | Check shows 2 items | | |

**Record for later**: Check ID = ___________, Check # = ___________

---

## TC-04: Modify Items

**Preconditions**: Open check from TC-03 with at least one item.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Tap on first item to select it | Item is highlighted/selected | | |
| 2 | Tap "Modify" or modifier button | Modifier selection screen appears | | |
| 3 | Select a modifier (e.g., Birthday Cake) | Modifier added under the item | | |
| 4 | Verify modifier name | Modifier name displayed correctly | | |
| 5 | Verify price update | If modifier has a price delta, total adjusts | | |
| 6 | Check gateway log | `PATCH /api/caps/check-items/<itemId>/modifiers` returns 200 | | |
| 7 | Check service-host log | Sync queued for check update | | |

---

## TC-05: Send to Kitchen / Fire on Fly

**Preconditions**: Open check from TC-03/04 with items. DOM mode is `fire_on_fly`.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Observe KDS before send | If fire_on_fly: items may already be on KDS as preview tickets | | |
| 2 | Check service-host log | `DOM auto-fire: mode=fire_on_fly, check=<id>, newItems=X` | | |
| 3 | Tap "Send" button | Items marked as sent, round number increments | | |
| 4 | Check gateway log | `POST /api/caps/checks/<id>/send` returns 200 | | |
| 5 | Verify items marked as sent | Items show "sent" indicator on check panel | | |
| 6 | Verify round counter | `currentRound` incremented by 1 | | |

---

## TC-06: KDS Operations

**Preconditions**: Items from TC-05 were sent to KDS.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Open KDS view (or switch to KDS device) | Ticket appears with items from TC-05 | | |
| 2 | Verify ticket content | Correct check number, item names, modifiers shown | | |
| 3 | Verify timer | Ticket timer is counting up | | |
| 4 | Tap "Bump" on the ticket | Ticket disappears from active view | | |
| 5 | Check gateway log | `POST /api/kds/tickets/<id>/bump` returns 200 | | |
| 6 | View bumped tickets list | Bumped ticket appears in completed/bumped list | | |
| 7 | Tap "Recall" on the bumped ticket | Ticket reappears on active KDS | | |
| 8 | Check gateway log | `POST /api/kds/tickets/<id>/recall` returns 200 | | |
| 9 | Tap "Priority" on an active ticket | Ticket moves to front / shows priority indicator | | |
| 10 | Bump the ticket again to clear it | Ticket bumped successfully | | |

---

## TC-07: Cash Payment

**Preconditions**: Open check with items (use check from TC-03 or create new).

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Tap "Pay" / Payment button | Payment screen appears | | |
| 2 | Select "Cash" tender | Cash tender highlighted | | |
| 3 | Enter exact amount (e.g., $8.04) | Amount field shows $8.04 | | |
| 4 | Submit payment | Payment processes, check closes | | |
| 5 | Verify status | Check status = "closed" | | |
| 6 | Verify change due | Change due = $0.00 | | |
| 7 | Check gateway log | `POST /api/caps/checks/<id>/payments` returns 200, body contains `"status":"closed"` | | |
| 8 | Check service-host log | `Queued payment for sync: <paymentId>` and `Queued check for sync: <checkId> | action=update` | | |
| 9 | **Over-tender test**: Create new check, add $7.50 item | New check created | | |
| 10 | Pay with $20.00 cash | Payment accepted | | |
| 11 | Verify change calculation | Change due = $20.00 - total (e.g., $11.96) | | |
| 12 | Check gateway log response | `changeDue` field in response is correct | | |

**Record for later**: Closed check ID = ___________, Payment ID = ___________

---

## TC-08: Credit Card Payment

**Preconditions**: Stripe terminal device configured and connected. Open check with items.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Create a new check and add item(s) | Check created with correct total | | |
| 2 | Tap "Pay" / Payment button | Payment screen appears | | |
| 3 | Select "Credit Card" tender | Card tender selected | | |
| 4 | Verify terminal device selection | Terminal device picker shows configured device | | |
| 5 | Select terminal and submit | Terminal session created, "Waiting for card" displayed | | |
| 6 | Check gateway log | `POST /api/payment/authorize` or terminal session request | | |
| 7 | Present card on terminal | Terminal reads card | | |
| 8 | Wait for approval | "Approved" displayed, check closes | | |
| 9 | Verify payment details | Card last 4, brand, auth code displayed | | |
| 10 | Check service-host log | Payment synced to cloud | | |
| 11 | If cloud unavailable, verify fallback | System attempts direct Stripe Terminal (YELLOW mode) or offline auth | | |

---

## TC-09: Void Item

**Preconditions**: Open check with at least 2 items (create new if needed).

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Create new check, add 2 items | Check shows 2 items with correct total | | |
| 2 | Select item to void | Item highlighted | | |
| 3 | Tap "Void" | Void reason prompt appears (if configured) | | |
| 4 | Enter void reason | Reason accepted | | |
| 5 | If privilege check required | Manager PIN prompt appears if crew doesn't have void privilege | | |
| 6 | Enter manager PIN if needed | Authorization accepted | | |
| 7 | Verify item voided | Item shows as voided (strikethrough or indicator) | | |
| 8 | Verify totals recalculate | Total reduced by voided item's price + tax | | |
| 9 | Check gateway log | `POST /api/caps/checks/<id>/items/<itemId>/void` returns 200 | | |
| 10 | Verify remaining item still correct | Non-voided item unchanged | | |

---

## TC-10: Void Payment

**Preconditions**: Closed check with a payment (from TC-07 or TC-08).

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Find the closed check (order history) | Closed check visible | | |
| 2 | Open the check details | Payment(s) displayed | | |
| 3 | Select payment and tap "Void Payment" | Void confirmation appears | | |
| 4 | Confirm void | Payment status changes to "voided" | | |
| 5 | Verify check status | Check reopens (status back to "open") or amount due updated | | |
| 6 | Check gateway log | `PATCH /api/caps/check-payments/<id>/void` returns 200 | | |
| 7 | Verify cloud sync | Payment void synced to cloud | | |

---

## TC-11: Reopen Closed Check

**Preconditions**: A closed check exists (from TC-07).

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to order history | Closed checks listed | | |
| 2 | Find the closed check from TC-07 | Check visible with "closed" status | | |
| 3 | Tap "Reopen" | Reopen confirmation appears | | |
| 4 | Confirm reopen | Check status changes to "open" | | |
| 5 | Check gateway log | `POST /api/caps/checks/<id>/reopen` returns 200 | | |
| 6 | Verify check is editable | Can add items to reopened check | | |
| 7 | Add a new item | Item added, totals updated | | |
| 8 | Pay and close the check again | Check closes with new total | | |
| 9 | Check service-host log | Both reopen and close actions queued for sync | | |

---

## TC-12: Split Check

**Preconditions**: Open check with at least 3 items.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Create new check, add 3 different items | Check shows 3 items | | |
| 2 | Tap "Split Check" | Split interface appears | | |
| 3 | Select 1-2 items to move to new check | Items highlighted for split | | |
| 4 | Confirm split | Two checks now exist | | |
| 5 | Check gateway log | `POST /api/caps/checks/<id>/split` returns 200 | | |
| 6 | Verify original check | Has remaining items, correct totals | | |
| 7 | Verify new check | Has split items, correct totals | | |
| 8 | Verify combined totals | Sum of both checks = original total | | |
| 9 | Close both checks with payment | Both close successfully | | |

**Record**: Original check = ___________, Split check = ___________

---

## TC-13: Add / Remove Discount

**Preconditions**: Open check with items.

### TC-13A: Percentage Discount

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Create new check, add item ($7.50) | Check total correct | | |
| 2 | Select item, tap "Discount" | Discount selection appears | | |
| 3 | Select a percentage discount (e.g., 10%) | Discount applied | | |
| 4 | Verify discount amount | $0.75 discount on $7.50 item | | |
| 5 | Verify new subtotal | Subtotal reduced by $0.75 | | |
| 6 | Verify tax recalculates | Tax on reduced amount | | |
| 7 | Check gateway log | `POST /api/caps/check-items/<id>/discount` returns 200 | | |

### TC-13B: Fixed Amount Discount

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | On same or new check, apply fixed $ discount | Discount applied | | |
| 2 | Verify discount capped at item price | Discount does not exceed item total | | |

### TC-13C: Remove Discount

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Select discounted item | Item shows discount indicator | | |
| 2 | Remove the discount | Discount removed | | |
| 3 | Verify totals restore | Subtotal and total back to pre-discount values | | |
| 4 | Check gateway log | `DELETE /api/caps/check-items/<id>/discount` returns 200 | | |

---

## TC-14: Price Override

**Preconditions**: Open check with items.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Create new check, add item (e.g., Frozen Banana $7.50) | Normal price shown | | |
| 2 | Select item, enter new price (e.g., $5.00) | Price overridden | | |
| 3 | Verify subtotal | Subtotal reflects new price ($5.00) | | |
| 4 | Verify tax | Tax recalculates on new price | | |
| 5 | Verify total | Total = new subtotal + tax | | |

---

## TC-15: Item Availability (86)

**Preconditions**: At least one menu item exists. Know which item to 86.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Note current item availability status | Item is available / shows on POS layout | | |
| 2 | Set item as unavailable (86'd) | Item marked unavailable | | |
| 3 | Check gateway log | `POST /api/item-availability/decrement` or update to 86'd | | |
| 4 | Verify on POS layout | Item shows as 86'd / grayed out / not selectable | | |
| 5 | Try to add 86'd item to check | Should be blocked or show warning | | |
| 6 | Set item as available again | Item restored | | |
| 7 | Check gateway log | `POST /api/item-availability/increment` or update from 86'd | | |
| 8 | Verify on POS layout | Item is selectable again | | |
| 9 | Add the restored item to a check | Item adds successfully | | |

---

## TC-16: Print Agent

**Preconditions**: Print agent process is running on the workstation.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Check print-agent log | `[Connect] WebSocket connected, authenticating` | | |
| 2 | Verify authentication | `[Auth] Authenticated as: Print Agent (<id>)` in log | | |
| 3 | Close a check (from TC-07) to trigger receipt | Receipt print job sent | | |
| 4 | Check gateway log | Print job routed correctly (if receipt printing configured) | | |
| 5 | Verify physical output | Receipt prints with correct items, totals, tender info | | |
| 6 | Kill print agent process | `Workstation disconnected` in service-host log | | |
| 7 | Restart print agent | Reconnects with exponential backoff (1s, 2s, 4s) in print-agent log | | |

---

## TC-17: Transaction Sync Verification

**Preconditions**: All TCs 03-14 completed. Wait at least 10 seconds after last transaction.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Check service-host log | `Syncing X journal entries` messages appear every 5s (when pending) | | |
| 2 | Verify journal sync results | `Journal sync complete: X acknowledged, Y skipped` — Y should be 0 or only legitimate dups | | |
| 3 | Verify sync queue items | `Processing X sync items` → `Check synced: <id>` / `Payment synced: <id>` | | |
| 4 | Check circuit breaker state | No `Circuit breaker OPEN` messages | | |
| 5 | Verify no permanent failures | No `permanently failed` or `Max sync attempts exceeded` messages | | |
| 6 | Check diagnostic endpoint | `GET /api/caps/diagnostic/summary` returns healthy status | | |
| 7 | Count total checks created in testing | Record: ___________ checks | | |
| 8 | Count total payments processed | Record: ___________ payments | | |

---

## TC-18: Reports — Z-Report (Daily Financial Close)

**Preconditions**: Multiple checks closed today (cash + CC if possible).

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Reports → Z-Report | Report loads for today's business date | | |
| 2 | Verify Gross Sales | Sum of all item prices (before discounts) matches manual total | | |
| 3 | Verify Discounts | Total discounts match TC-13 discount amounts | | |
| 4 | Verify Net Sales | Gross Sales - Discounts | | |
| 5 | Verify Tax | Correct tax rate applied, total tax matches sum of individual check taxes | | |
| 6 | Verify Tender Breakdown | Cash total matches TC-07 payments, Card total matches TC-08 payments | | |
| 7 | Verify Reconciliation | `balanced: true` (delta <= $0.02) | | |
| 8 | Verify void count/amount | Matches TC-09 void activity | | |
| 9 | Verify check count | Matches number of closed checks from testing | | |

---

## TC-19: Reports — Product Mix

**Preconditions**: Checks closed with identifiable menu items.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Reports → Product Mix | Report loads | | |
| 2 | Find Frozen Banana (or test item) | Quantity matches number of times rung | | |
| 3 | Verify revenue per item | Revenue = qty x price (minus voids) | | |
| 4 | Verify voided items excluded | Voided items not counted in P-Mix quantities | | |

---

## TC-20: Reports — Cashier Report

**Preconditions**: At least one employee has closed checks.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Reports → Cashier Report | Report loads | | |
| 2 | Find John Smith's record | Shows checks opened, net sales | | |
| 3 | Verify void count | Matches TC-09 voids (if John performed them) | | |
| 4 | Verify card tips | If CC payments had tips, amount matches | | |
| 5 | Verify total collected | Cash + card collected matches payment totals | | |

---

## TC-21: Reports — Business Day Activity

**Preconditions**: Testing completed for the day.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Reports → Business Day Activity | Report loads | | |
| 2 | Verify Checks Started | Count matches TC-17 total checks created | | |
| 3 | Verify Checks Closed | Count matches closed checks from testing | | |
| 4 | Verify Checks Outstanding | Any open checks still remaining | | |
| 5 | Verify Carried-In | Checks from prior business dates still open | | |

---

## TC-22: Reports — Cash Drawer

**Preconditions**: Cash drawer assigned to workstation with drawer activity.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Reports → Cash Drawer | Report loads for current drawer assignment | | |
| 2 | Verify opening amount | Matches configured opening bank | | |
| 3 | Verify cash sales | Matches sum of cash payments from testing | | |
| 4 | Verify expected cash | Opening + Sales + Paid-In - Paid-Out - Tips Paid - Drops | | |
| 5 | If closed: verify variance | Actual - Expected (should be $0.00 if no drops/pickups) | | |

---

## TC-23: Employee Time Clock

**Preconditions**: Logged in as manager or employee with clock-in privilege.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to time clock screen | Time clock interface appears | | |
| 2 | Clock in (enter employee PIN) | Clock-in recorded, timestamp shown | | |
| 3 | Check gateway log | `POST /api/time-punches/clock-in` or `POST /api/time-clock/punch` returns 200 | | |
| 4 | Verify timecard status | Employee shows as "clocked in" | | |
| 5 | Wait a few seconds, then clock out | Clock-out recorded | | |
| 6 | Check gateway log | `POST /api/time-punches/clock-out` returns 200 | | |
| 7 | Verify timecard | Shows clock-in time, clock-out time, total hours | | |
| 8 | Check service-host log | Timecard synced to cloud (if applicable) | | |

---

## TC-24: Cloud Parity Check

**Preconditions**: All TCs completed. Waited at least 30 seconds since last transaction for sync to complete.

| # | Verification | POS Value | Cloud Value | Match? | Notes |
|---|-------------|-----------|-------------|--------|-------|
| 1 | Total open checks (count) | | | | |
| 2 | Total closed checks today (count) | | | | |
| 3 | Net Sales total | | | | |
| 4 | Tax total | | | | |
| 5 | Cash payments total | | | | |
| 6 | Card payments total | | | | |
| 7 | Void count | | | | |
| 8 | Employee list (count) | | | | |
| 9 | Journal entries pending (should be 0) | | | | |
| 10 | Sync queue size (should be 0) | | | | |

**How to verify on Cloud:**
- Use EMC Dashboard for sales totals
- Use `/api/sync/verify?serviceHostId=<id>&businessDate=<date>` for detailed sync status
- Compare `checksDetail` from sync/verify with local check list

---

## TC-25: Loyalty Program

**Preconditions**: Loyalty programs configured (3 programs synced per config). At least one loyalty member.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Search for loyalty member by phone or name | Member found | | |
| 2 | View member details | Points balance, enrollment(s) displayed | | |
| 3 | Apply loyalty member to a check | Member associated with check | | |
| 4 | Close the check | Points awarded (if auto-award configured) | | |
| 5 | Verify points updated | Member's balance incremented | | |

---

## TC-26: Double-Unlock Bug Regression

**Preconditions**: This tests a known bug from v3.1.110 logs (double POST /unlock calls).

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Create new check, add item | Check open | | |
| 2 | Pay with cash and close | Check closes | | |
| 3 | **Immediately** check gateway log | Count `POST /api/caps/checks/<id>/unlock` calls | | |
| 4 | Verify unlock count | Should be **exactly 1** unlock call. If **2**, bug is present | | |
| 5 | Record timestamps of unlock calls | Timestamp 1: _____ Timestamp 2 (if any): _____ | | |

**Known issue**: v3.1.110 logs showed 2 unlock calls at 03:15:40.796 and 03:15:40.855 (59ms apart). This appears to be a UI double-fire.

---

## TC-27: WebSocket Reconnect Behavior

**Preconditions**: Just logged in, can observe app log or system log.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | After login, watch for `[R:RENDERER:Connecting to ws://...]` in logs | Connection attempts visible | | |
| 2 | On first error: `[R:RENDERER:WebSocket error, closing connect]` | Only 1 error log before first reconnect | | |
| 3 | Measure time between reconnect attempts | Should increase: ~3s, ~4.5s, ~6.75s, ~10s (1.5x backoff) | | |
| 4 | After 3 reconnects, check if logging quiets down | Error logging should suppress after 3 attempts | | |
| 5 | Verify no functional impact | All POS operations (create check, add items, pay) work despite WS errors | | |
| 6 | Record reconnect intervals | 1→2: ___s, 2→3: ___s, 3→4: ___s, 4→5: ___s | | |

**Known behavior**: The renderer's direct WebSocket to `ws://127.0.0.1:3001` may fail if the CAPS WS endpoint doesn't accept the renderer's subscription format. This is cosmetic — all data flows through HTTP API.

---

## TC-28: Heartbeat Verification

**Preconditions**: App running in GREEN mode.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Wait for heartbeat (every 12s from workstation) | `POST /api/system-status/workstation/heartbeat` in gateway log | | |
| 2 | Verify request body | Contains `workstationId`, `connectionMode: "green"`, `pendingSyncCount`, `checkCount` | | |
| 3 | Verify response | Status 200 | | |
| 4 | Check for `offline: true` in response | If present, investigate — should be `false` when Cloud is reachable | | |
| 5 | Wait for cloud heartbeat (every 60s) | `Cloud heartbeat sent — X connected devices` in service-host log | | |

**Known issue**: v3.1.110 logs showed heartbeat response with `"offline":true` even though Cloud was reachable. This may be a Cloud-side workstation registration issue.

---

## TC-29: Auto-Updater

**Preconditions**: App running.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Check updater log | `[Init] Auto-updater initialized (v3.1.110)` | | |
| 2 | Verify update check | `[Check] Checking for updates...` | | |
| 3 | Verify result | `[Check] App is up to date (v3.1.110)` | | |
| 4 | Check for GitHub token warning | `No GitHub token found` — expected for private repo without token | | |

---

## Test Summary

| TC | Test Case | Pass | Fail | Skip | Notes |
|----|-----------|:----:|:----:|:----:|-------|
| 01 | App Launch & Boot | | | | |
| 02 | Employee Login | | | | |
| 03 | Create Check & Add Items | | | | |
| 04 | Modify Items | | | | |
| 05 | Send to Kitchen / Fire on Fly | | | | |
| 06 | KDS Operations | | | | |
| 07 | Cash Payment | | | | |
| 08 | Credit Card Payment | | | | |
| 09 | Void Item | | | | |
| 10 | Void Payment | | | | |
| 11 | Reopen Closed Check | | | | |
| 12 | Split Check | | | | |
| 13 | Add / Remove Discount | | | | |
| 14 | Price Override | | | | |
| 15 | Item Availability (86) | | | | |
| 16 | Print Agent | | | | |
| 17 | Transaction Sync Verification | | | | |
| 18 | Z-Report | | | | |
| 19 | Product Mix | | | | |
| 20 | Cashier Report | | | | |
| 21 | Business Day Activity | | | | |
| 22 | Cash Drawer | | | | |
| 23 | Employee Time Clock | | | | |
| 24 | Cloud Parity Check | | | | |
| 25 | Loyalty Program | | | | |
| 26 | Double-Unlock Regression | | | | |
| 27 | WebSocket Reconnect | | | | |
| 28 | Heartbeat Verification | | | | |
| 29 | Auto-Updater | | | | |

**Total**: ___/29 Pass | ___/29 Fail | ___/29 Skip

---

## Issues Found During Testing

| # | TC | Severity | Description | Expected | Actual |
|---|-----|----------|-------------|----------|--------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

**Severity Guide**: Critical (blocks operation) | High (workaround exists) | Medium (cosmetic/log noise) | Low (minor)

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tester | | | |
| Developer | | | |
| QA Lead | | | |

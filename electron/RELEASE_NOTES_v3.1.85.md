# Cloud POS v3.1.85 Release Notes

## Boot Contract Enforcement — No Partial Rendering

### Problem
After the wizard completes first-launch setup, `createWindow()` runs ~900ms before `fetchActivationConfig()` resolves the CAPS URL. React queries fire against the interceptor with no CAPS URL configured, return 503, and `retry: false` means they permanently fail. The POS layout renders empty — data IS synced (menu items, layout cells, modifiers) but the frontend never fetched it.

### Fix: CapsBootGate
POS, KDS, Login, and Pizza Builder routes are now wrapped in a `CapsBootGate` component that **prevents the component tree from mounting** until `capsBootStage === 'ready'`. This is not just an overlay — the React components and their queries literally do not exist until CAPS confirms readiness.

Boot stages are now: `starting` → `connecting` → `loading-config` → `ready` (or `failed`).

### Failed State with Retry
If CAPS does not become ready within 30 seconds:
- `capsBootStage` transitions to `'failed'`
- Full-screen red overlay displays "Store Server Not Ready" with a **Retry Connection** button
- Retry triggers `retryCapsBoot` IPC which resets the poll cycle
- No silent infinite loading — explicit failure with actionable recovery

### Electron Changes
- `capsBootStage` initializes to `'starting'` (not null) — ensures gate blocks from first frame
- `pollCapsReady`: 500ms poll interval, 30s timeout, emits `'failed'` on timeout
- `retry-caps-boot` IPC handler: resets stage to `'connecting'` and restarts poll
- `retryCapsBoot` exposed in preload bridge

### CAPS Service-Host Routes Verified
All POS transaction routes confirmed present and functional:
- `/pos/checks/:id/customer` POST — attach customer to check
- `/pos/capture-with-tip` POST — tip capture with amount update
- `/pos/process-card-payment` POST — card payment with auto-close
- `/pos/gift-cards/redeem` POST — gift card redemption
- `/pos/customers/search` GET, `/pos/customers/:id` GET
- `/pos/customers/:id/add-points` POST
- `/pos/loyalty/earn` POST, `/pos/loyalty/enroll` POST
- `/pos/checks/:id/reorder/:customerId` GET
- `/pos/system-status` GET
- `/pos/reports/:reportType` GET (daily-summary with real data)

## Files Changed
- `electron/main.cjs` — capsBootStage='starting', 500ms/30s poll, retry-caps-boot IPC
- `electron/preload.cjs` — retryCapsBoot bridge method
- `client/src/App.tsx` — CapsBootGate component, useCapsBootGate hook, route wrapping
- `client/src/components/connection-mode-banner.tsx` — Failed overlay with retry button, starting stage
- `client/src/contexts/connection-mode-context.tsx` — 'starting' and 'failed' type additions
- `electron/service-host-embedded.cjs` — Rebuilt bundle

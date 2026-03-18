# Root-Cause Analysis: Add-Item Payload Requirements

## 1. The Behavior

`POST /api/checks/:id/items` requires `menuItemName` and `unitPrice` in the request body. It also accepts `menuItemId` and fetches the menu item from the database, but uses that record **only for tax group lookup** — not for name or price resolution.

```typescript
// server/routes.ts, line 5259-5313
const { menuItemId, menuItemName, unitPrice, modifiers, quantity } = req.body;

const [check, menuItem, taxGroups] = await Promise.all([
  storage.getCheck(checkId),
  storage.getMenuItem(menuItemId),  // fetched but NOT used for name/price
  storage.getTaxGroups(),
]);

// Tax calculation uses unitPrice from body, not menuItem.price:
const taxableAmount = (parseFloat(unitPrice || "0") + modifierTotal) * itemQuantity;

// Item creation uses body fields directly:
const item = await storage.createCheckItem({
  menuItemName,   // from body — NOT from menuItem.name
  unitPrice,      // from body — NOT from menuItem.price
  ...
});
```

The `check_items` schema requires both fields to be non-null:
```typescript
// shared/schema.ts, line 1023
menuItemName: text("menu_item_name").notNull(),
unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
```

If the caller omits `menuItemName` or `unitPrice`, the item insert fails with a database constraint error (surfaced as "Failed to add item").

## 2. Why It's Designed This Way

### A. POS Price-At-Sale Snapshotting (Industry Standard)

POS systems snapshot the item name and price **at the moment of sale**, not at the moment of retrieval. If a menu item's price changes between when the customer orders and when the check closes, the check must reflect the price the customer was shown. The client resolves the current name/price from its loaded menu data and sends it with the transaction.

The POS frontend does this correctly:
```typescript
// client/src/pages/pos.tsx, line 620
const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/items", {
  menuItemId: data.menuItem.id,
  menuItemName: data.menuItem.name,  // resolved from in-memory menu
  unitPrice: data.menuItem.price,    // resolved from in-memory menu
  modifiers: data.modifiers,
  quantity: 1,
});
```

### B. Open-Priced and Override Items

The POS supports:
- **Open-priced items** (market-price fish, custom items) where the cashier enters the price
- **Manager price overrides** where the price differs from the menu item's configured price
- **Custom/special items** that may not have a `menuItemId` at all

By accepting price from the body, one endpoint handles all three cases without separate routing.

### C. Offline Resilience

In offline mode, the `offline-api-interceptor.cjs` handles add-item locally. The body-data pattern means the offline handler doesn't need to resolve menu items from a local database — the client already did the resolution. This keeps the offline write path simple and fast.

## 3. Should CAPS/Service-Host Resolve These from Local Menu Data Instead?

### Current State

In the CAPS-first architecture, when the Electron interceptor routes `POST /api/checks/:id/items` to CAPS, the request body travels intact — including `menuItemName` and `unitPrice` from the workstation client. CAPS inserts the item using the body data, same as the cloud handler.

### Analysis

| Approach | Pros | Cons |
|----------|------|------|
| **Client resolves (current)** | Simple. Works offline. Supports price overrides. Industry standard. | Client could send stale/wrong data if menu data isn't refreshed. |
| **CAPS resolves from local DB** | Single source of truth for price. Catches stale client data. | Requires CAPS to maintain a complete, synced menu_items table. Breaks open-priced items. Adds latency to every item add. Requires separate endpoint for price overrides. |

### Recommendation for Production Design

**Keep the current pattern: client resolves and sends name+price.** This is the correct production design for a POS system because:

1. **Industry standard**: Micros, Aloha, NCR Aloha, Toast, Square — all snapshot at time of sale from the client.
2. **Price override support**: Manager-approved price changes are a core POS requirement. The client-sends-price model handles this natively.
3. **Offline simplicity**: No CAPS menu lookup needed during writes — the client already has the data.
4. **Performance**: No additional database read per item add on CAPS.

### What CAPS Should Add (Enhancement, Not Architecture Change)

CAPS should add **server-side validation** (not resolution) as a guard:

```
On receive POST /checks/:id/items:
  1. Accept menuItemName and unitPrice from body (current behavior)
  2. If menuItemId is provided AND the item exists in CAPS local menu:
     - Compare body unitPrice vs menu unitPrice
     - If they differ AND no price-override flag is set:
       → Log a warning (don't reject — could be a legitimate in-flight change)
     - If menuItemName is blank, fill from menu (defensive backfill only)
  3. Insert the item using body data (current behavior)
```

This adds a safety net without breaking the client-sends-price contract. It also means the "Failed to add item" error from our testing (where we sent `menuItemId` but omitted `menuItemName`/`unitPrice`) would be caught and backfilled instead of failing.

### Cloud API Enhancement (Non-Breaking)

The cloud `POST /api/checks/:id/items` handler should add a **fallback resolution** — if the caller sends `menuItemId` but omits `menuItemName` or `unitPrice`, resolve them from `storage.getMenuItem()` which is already fetched:

```typescript
// After line 5268 (menuItem is already fetched):
const resolvedName = menuItemName || menuItem?.name || 'Unknown Item';
const resolvedPrice = unitPrice || menuItem?.price || '0.00';
```

This maintains backward compatibility (body data takes priority) while preventing the "Failed to add item" error when name/price are omitted. This is a backfill, not a source-of-truth change.

# Root-Cause Analysis: Check Number Duplicate/Counter Collision

## 1. What Happened

When calling `POST /api/checks` on the cloud server, the request failed with:
```
duplicate key value violates unique constraint "idx_checks_rvc_check_number"
```

The `rvc_counters` table row for this RVC did not exist in the cloud PostgreSQL database. The cloud's `createCheckAtomic()` used `INSERT ... ON CONFLICT ... RETURNING next_check_number - 1` which starts at 1 when no row exists. But the `checks` table already contained checks with numbers 1 through 458 (created by offline workstations or previous CAPS-synced operations).

## 2. Exact Code Path Responsible

### Cloud-side (`server/storage.ts`, line 2106-2119):

```typescript
async createCheckAtomic(rvcId, data) {
  return await db.transaction(async (tx) => {
    const counterResult = await tx.execute(sql`
      INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at)
      VALUES (${rvcId}, 2, NOW())
      ON CONFLICT (rvc_id) DO UPDATE
        SET next_check_number = rvc_counters.next_check_number + 1
      RETURNING next_check_number - 1 AS reserved_number
    `);
    const checkNumber = counterResult.rows[0].reserved_number;
    // ← checkNumber = 1 (first call) or increments from there
    // PROBLEM: checks table already has numbers 1-458 from sync
    const [result] = await tx.insert(checks).values({ ...data, checkNumber, rvcId }).returning();
    return result;
  });
}
```

### Why the counter was empty

Checks #1-458 were created by **offline workstations** (via `offline-api-interceptor.cjs`) and synced to the cloud via the `/api/sync/transactions` endpoint (`server/routes.ts`, line 25094). That sync endpoint inserts checks with their **pre-assigned check numbers** directly into the `checks` table (line 25216-25219):

```typescript
const [result] = await db.insert(checks).values({
  ...(wsCheckId ? { id: wsCheckId } : {}),
  checkNumber, rvcId, ...checkFields,  // ← uses the offline-assigned number
}).returning();
```

This direct insert **does not touch `rvc_counters`**. So the cloud `rvc_counters` table stays empty while the `checks` table accumulates records with numbers 1-458.

### The collision sequence

1. Workstations create checks offline with numbers 1-458 (managed by local `rvc_counters` in SQLite)
2. CAPS syncs those checks to cloud via `/api/sync/transactions` (inserts into `checks` with the numbers, never touches cloud `rvc_counters`)
3. Cloud's `rvc_counters` has no row for this RVC — thinks next number is 1
4. Any direct `POST /api/checks` on cloud (e.g., a test, or a second store server, or any non-Electron client) starts at check number 1
5. `INSERT INTO checks` fails: `idx_checks_rvc_check_number` unique constraint violated

## 3. Why the Offline Side Doesn't Have This Problem

The offline `createCheckAtomic()` (`electron/offline-database.cjs`, line 1494-1555) is more defensive:

```javascript
// When no counter row exists, it calculates from table max + cloud max:
const cloudMax = this.getCachedConfig(`last_check_number_${rvcId}`) || 0;
checkNumber = Math.max(cloudMax, tableMax) + 1;
```

And `updateCheckCountersAfterSync()` (line 1433-1456) runs after sync to realign the local counter:
```javascript
// Sets counter to MAX(check_number) + 1 after importing cloud data
```

The cloud side lacks both of these safeguards.

## 4. Permanent Fix

The cloud's `createCheckAtomic()` must handle the case where `rvc_counters` has no row but `checks` already contains records for that RVC. Two changes needed:

### Fix A: Initialize counter from MAX(check_number) on first use

Replace the initial insert value `2` with a subquery that reads the current max:

```typescript
async createCheckAtomic(rvcId, data) {
  return await db.transaction(async (tx) => {
    // Check if counter exists
    const [existing] = await tx.execute(sql`
      SELECT next_check_number FROM rvc_counters WHERE rvc_id = ${rvcId}
    `);
    
    let checkNumber;
    if (existing?.rows?.length > 0) {
      // Counter exists — increment normally
      const result = await tx.execute(sql`
        UPDATE rvc_counters 
        SET next_check_number = next_check_number + 1, updated_at = NOW()
        WHERE rvc_id = ${rvcId}
        RETURNING next_check_number - 1 AS reserved_number
      `);
      checkNumber = result.rows[0].reserved_number;
    } else {
      // Counter doesn't exist — initialize from MAX(check_number) in checks table
      const maxResult = await tx.execute(sql`
        SELECT COALESCE(MAX(check_number), 0) AS max_num 
        FROM checks WHERE rvc_id = ${rvcId}
      `);
      const maxExisting = maxResult.rows[0].max_num;
      checkNumber = maxExisting + 1;
      await tx.execute(sql`
        INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at)
        VALUES (${rvcId}, ${checkNumber + 1}, NOW())
      `);
    }
    
    const [result] = await tx.insert(checks).values(
      sanitizeDates({ ...data, checkNumber, rvcId })
    ).returning();
    return result;
  });
}
```

### Fix B: Sync endpoint must update `rvc_counters` when inserting checks

In the `/api/sync/transactions` handler (`server/routes.ts`, line 25216), after inserting a new check, update the counter:

```typescript
// After line 25220:
if (cloudCheck && checkNumber > 0) {
  await db.execute(sql`
    INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at)
    VALUES (${rvcId}, ${checkNumber + 1}, NOW())
    ON CONFLICT (rvc_id) DO UPDATE
      SET next_check_number = GREATEST(rvc_counters.next_check_number, ${checkNumber + 1}),
          updated_at = NOW()
  `);
}
```

### Fix C: Add retry with MAX fallback (defense-in-depth)

Mirror the offline pattern — if `createCheckAtomic()` hits a unique constraint violation, retry once using `MAX(check_number) + 1`:

```typescript
// Wrap the transaction in a retry:
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    return await db.transaction(async (tx) => { /* ... */ });
  } catch (err) {
    if (err.code === '23505' && attempt < 2) {
      // Re-sync counter from MAX(check_number)
      await db.execute(sql`
        INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at)
        VALUES (${rvcId}, (SELECT COALESCE(MAX(check_number), 0) + 2 FROM checks WHERE rvc_id = ${rvcId}), NOW())
        ON CONFLICT (rvc_id) DO UPDATE
          SET next_check_number = (SELECT COALESCE(MAX(check_number), 0) + 2 FROM checks WHERE rvc_id = ${rvcId}),
              updated_at = NOW()
      `);
      continue;
    }
    throw err;
  }
}
```

## 5. Prevention in Pilot/Production

| Layer | Prevention |
|-------|-----------|
| **Cloud `createCheckAtomic()`** | Initialize counter from `MAX(check_number) + 1` on first use, not from literal `2` |
| **Cloud sync endpoint** | Update `rvc_counters` with `GREATEST()` whenever a check is inserted via sync |
| **Cloud retry** | 3-attempt retry loop with MAX-based re-sync on unique constraint failure |
| **CAPS** | Already has `updateCheckCountersAfterSync()` — this pattern should also exist on cloud side |
| **Unique constraint** | Keep `idx_checks_rvc_check_number` — it's the safety net that prevents duplicate check numbers in the database. The fix is in the counter, not removing the constraint. |
| **Monitoring** | Log a WARNING when a check number collision is retried so ops can detect counter drift early |

import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { checks, checkItems, checkPayments } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { getConfigSyncService } from "./config-sync";

const isLocalMode = process.env.DB_MODE === "local";

function requireLfsApiKey(req: Request, res: Response, next: NextFunction) {
  const expectedKey = process.env.LFS_API_KEY;
  if (!expectedKey && !isLocalMode) {
    return res.status(500).json({ error: "LFS_API_KEY not configured on cloud server" });
  }
  if (!expectedKey && isLocalMode) {
    return next();
  }
  const provided = req.headers["x-lfs-api-key"] as string | undefined
    || (req.headers["authorization"] as string | undefined)?.replace("Bearer ", "");
  if (provided !== expectedKey) {
    return res.status(403).json({ error: "Invalid or missing LFS API key" });
  }
  next();
}

export function registerLfsSyncRoutes(app: Express) {
  if (isLocalMode) {
    registerLfsLocalRoutes(app);
  } else {
    registerLfsCloudRoutes(app);
  }
}

interface JournalCapableStorage {
  getPendingTransactions(): unknown[];
  getPendingTransactionCount(): number;
  markTransactionSynced(id: string): void;
}

function hasJournalMethods(s: unknown): s is JournalCapableStorage {
  const obj = s as Record<string, unknown>;
  return typeof obj.getPendingTransactions === "function"
    && typeof obj.getPendingTransactionCount === "function"
    && typeof obj.markTransactionSynced === "function";
}

const ENTITY_SYNC_ORDER: Record<string, number> = {
  check: 0,
  check_item: 1,
  round: 2,
  check_payment: 3,
  check_discount: 4,
  check_service_charge: 5,
};

function sortByDependency(entries: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...entries].sort((a, b) => {
    const aOp = a.operation_type as string || "create";
    const bOp = b.operation_type as string || "create";
    const isADelete = aOp === "delete";
    const isBDelete = bOp === "delete";
    if (isADelete && !isBDelete) return 1;
    if (!isADelete && isBDelete) return -1;
    if (isADelete && isBDelete) {
      const aEnt = ENTITY_SYNC_ORDER[a.entity_type as string || ""] ?? 99;
      const bEnt = ENTITY_SYNC_ORDER[b.entity_type as string || ""] ?? 99;
      return bEnt - aEnt;
    }
    const aEnt = ENTITY_SYNC_ORDER[a.entity_type as string || ""] ?? 99;
    const bEnt = ENTITY_SYNC_ORDER[b.entity_type as string || ""] ?? 99;
    return aEnt - bEnt;
  });
}

function registerLfsLocalRoutes(app: Express) {
  if (!hasJournalMethods(storage)) {
    console.error("[LFS Sync] Storage does not support journal methods");
    return;
  }
  const journalStorage = storage;
  const sqliteDb = (storage as Record<string, unknown>).db as import("better-sqlite3").Database | undefined;

  app.get("/api/lfs/journal/count", async (_req: Request, res: Response) => {
    try {
      const count = journalStorage.getPendingTransactionCount();
      res.json({ count });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/config-down", async (_req: Request, res: Response) => {
    try {
      const syncService = getConfigSyncService();
      if (syncService) {
        await syncService.runInitialSync();
        const status = syncService.getStatus();
        if (status.lastSyncError) {
          res.json({ ok: false, message: `Config sync failed: ${status.lastSyncError}` });
        } else {
          res.json({ ok: true, message: "Config sync completed" });
        }
      } else {
        res.json({ ok: false, message: "Config sync service not available" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/push-to-cloud", async (req: Request, res: Response) => {
    const cloudUrl = process.env.LFS_CLOUD_URL || "";
    if (!cloudUrl) {
      return res.status(400).json({ error: "LFS_CLOUD_URL env must be configured on LFS" });
    }
    const apiKey = process.env.LFS_API_KEY || "";

    try {
      const entries = journalStorage.getPendingTransactions() as Array<Record<string, unknown>>;
      if (!entries.length) {
        return res.json({ ok: true, synced: 0, remaining: 0 });
      }

      const sorted = sortByDependency(entries);
      let synced = 0;
      let lastError: string | null = null;

      for (const entry of sorted) {
        try {
          const uploadRes = await fetch(`${cloudUrl}/api/lfs/sync/transaction-up`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { "X-LFS-API-Key": apiKey } : {}),
            },
            body: JSON.stringify(entry),
            signal: AbortSignal.timeout(15000),
          });

          if (uploadRes.ok) {
            const result = await uploadRes.json();
            if (result.remapId && entry.entity_id) {
              storeLocalRemap(sqliteDb, entry.entity_id as string, result.remapId);
            }
            journalStorage.markTransactionSynced(entry.id as string);
            synced++;
          } else {
            const errBody = await uploadRes.text().catch(() => "");
            lastError = `HTTP ${uploadRes.status}: ${errBody}`;
            break;
          }
        } catch (e: unknown) {
          lastError = e instanceof Error ? e.message : "Upload failed";
          break;
        }
      }

      const remaining = journalStorage.getPendingTransactionCount();
      res.json({ ok: synced > 0, synced, remaining, lastError });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });
}

function storeLocalRemap(sqliteDb: import("better-sqlite3").Database | undefined, localId: string, cloudId: string): void {
  if (!sqliteDb) return;
  try {
    sqliteDb.prepare(
      `INSERT OR REPLACE INTO "lfs_id_remap" (local_id, cloud_id, created_at) VALUES (?, ?, ?)`
    ).run(localId, cloudId, new Date().toISOString());
  } catch { /* table may not exist yet */ }
}

function getLocalRemap(sqliteDb: import("better-sqlite3").Database | undefined, localId: string): string | null {
  if (!sqliteDb) return null;
  try {
    const row = sqliteDb.prepare(
      `SELECT cloud_id FROM "lfs_id_remap" WHERE local_id = ?`
    ).get(localId) as { cloud_id: string } | undefined;
    return row?.cloud_id || null;
  } catch { return null; }
}

const idRemapCache = new Map<string, string>();

async function ensureCloudRemapTable(): Promise<void> {
  if (!db) return;
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS "lfs_id_remap" (
      "local_id" VARCHAR PRIMARY KEY,
      "cloud_id" VARCHAR NOT NULL,
      "created_at" TIMESTAMP DEFAULT NOW()
    )`);
  } catch (e: unknown) {
    console.error("[LFS Sync] Failed to create remap table:", e instanceof Error ? e.message : e);
  }
}

let remapTableReady = false;

function registerLfsCloudRoutes(app: Express) {
  ensureCloudRemapTable().then(() => { remapTableReady = true; }).catch(() => {});
  app.post("/api/lfs/sync/transaction-up", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const entry = req.body;
      if (!entry || !(entry.entity_type || entry.entityType) || !entry.payload) {
        return res.status(400).json({ error: "Missing required fields: entity_type and payload" });
      }

      const entityType = entry.entity_type || entry.entityType;
      const operationType = entry.operation_type || entry.operationType;
      const payload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
      const offlineTransactionId = entry.offline_transaction_id || entry.offlineTransactionId;

      if (offlineTransactionId && operationType === "create") {
        const existing = await checkDuplicate(entityType, offlineTransactionId);
        if (existing) {
          if (payload.id) {
            idRemapCache.set(payload.id as string, existing);
            await storeDurableRemap(payload.id as string, existing);
          }
          return res.json({ ok: true, deduplicated: true, cloudId: existing, remapId: existing });
        }
      }

      const result = await syncEntity(entityType, operationType, payload, offlineTransactionId);
      const remapId = result && typeof result === "object" && "id" in (result as Record<string, unknown>)
        ? (result as Record<string, unknown>).id as string
        : undefined;
      res.json({ ok: true, result, remapId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("[LFS Sync] Transaction upload error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/batch-up", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        return res.status(400).json({ error: "entries must be an array" });
      }

      const sorted = sortByDependency(entries);
      const results = [];
      for (const entry of sorted) {
        try {
          const entityType = entry.entity_type || entry.entityType;
          const operationType = entry.operation_type || entry.operationType;
          const payload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
          const offlineTransactionId = entry.offline_transaction_id || entry.offlineTransactionId;

          if (offlineTransactionId && operationType === "create") {
            const existing = await checkDuplicate(entityType as string, offlineTransactionId as string);
            if (existing) {
              if (payload.id) {
                idRemapCache.set(payload.id as string, existing);
                await storeDurableRemap(payload.id as string, existing);
              }
              results.push({ id: entry.id, ok: true, deduplicated: true, cloudId: existing });
              continue;
            }
          }

          const result = await syncEntity(entityType as string, operationType as string, payload, offlineTransactionId as string);
          results.push({ id: entry.id, ok: true, result });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          results.push({ id: entry.id, ok: false, error: msg });
        }
      }

      res.json({ ok: true, results });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/clear-remap-cache", requireLfsApiKey, async (_req: Request, res: Response) => {
    idRemapCache.clear();
    res.json({ ok: true });
  });
}

async function storeDurableRemap(localId: string, cloudId: string): Promise<void> {
  if (!db || !remapTableReady) return;
  try {
    await db.execute(sql`INSERT INTO "lfs_id_remap" (local_id, cloud_id, created_at) VALUES (${localId}, ${cloudId}, NOW()) ON CONFLICT (local_id) DO UPDATE SET cloud_id = EXCLUDED.cloud_id`);
  } catch { /* table may not exist, non-critical */ }
}

async function loadDurableRemap(localId: string): Promise<string | null> {
  if (!db || !remapTableReady) return null;
  try {
    const rows = await db.execute(sql`SELECT cloud_id FROM "lfs_id_remap" WHERE local_id = ${localId}`);
    if (rows.rows && rows.rows.length > 0) {
      return (rows.rows[0] as Record<string, unknown>).cloud_id as string;
    }
  } catch { /* table may not exist */ }
  return null;
}

async function resolveCloudId(localId: string): Promise<string> {
  if (idRemapCache.has(localId)) {
    return idRemapCache.get(localId)!;
  }
  const durable = await loadDurableRemap(localId);
  if (durable) {
    idRemapCache.set(localId, durable);
    return durable;
  }
  return localId;
}

async function checkDuplicate(entityType: string, offlineTransactionId: string): Promise<string | null> {
  if (!db) return null;

  try {
    switch (entityType) {
      case "check": {
        const rows = await db.select({ id: checks.id })
          .from(checks)
          .where(eq(checks.offlineTransactionId, offlineTransactionId))
          .limit(1);
        return rows.length > 0 ? rows[0].id : null;
      }
      case "check_item": {
        const rows = await db.select({ id: checkItems.id })
          .from(checkItems)
          .where(eq(checkItems.offlineTransactionId, offlineTransactionId))
          .limit(1);
        return rows.length > 0 ? rows[0].id : null;
      }
      case "check_payment": {
        const rows = await db.select({ id: checkPayments.id })
          .from(checkPayments)
          .where(eq(checkPayments.offlineTransactionId, offlineTransactionId))
          .limit(1);
        return rows.length > 0 ? rows[0].id : null;
      }
      default:
        return null;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[LFS Sync] Dedup check failed for ${entityType}/${offlineTransactionId}: ${msg}`);
    return null;
  }
}

function remapCheckId(payload: Record<string, unknown>): Record<string, unknown> {
  const checkId = payload.checkId || payload.check_id;
  if (typeof checkId === "string" && idRemapCache.has(checkId)) {
    return {
      ...payload,
      checkId: idRemapCache.get(checkId),
      check_id: idRemapCache.get(checkId),
    };
  }
  return payload;
}

async function remapCheckIdAsync(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const checkId = payload.checkId || payload.check_id;
  if (typeof checkId === "string") {
    const cloudCheckId = await resolveCloudId(checkId);
    if (cloudCheckId !== checkId) {
      return {
        ...payload,
        checkId: cloudCheckId,
        check_id: cloudCheckId,
      };
    }
  }
  return payload;
}

async function syncEntity(
  entityType: string,
  operationType: string,
  payload: Record<string, unknown>,
  offlineTransactionId?: string,
): Promise<unknown> {
  const dataWithOfflineId = offlineTransactionId
    ? { ...payload, offlineTransactionId }
    : payload;

  switch (entityType) {
    case "check": {
      if (operationType === "create") {
        const { id: localId, checkNumber: _offlineCheckNum, ...insertData } = dataWithOfflineId;
        const created = await storage.createCheck(insertData as Parameters<typeof storage.createCheck>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const id = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(id);
        const { id: _id, offlineTransactionId: _otxn, ...updateData } = dataWithOfflineId;
        return await storage.updateCheck(cloudId, updateData as Parameters<typeof storage.updateCheck>[1]);
      } else if (operationType === "delete") {
        const id = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(id);
        return await storage.deleteCheck(cloudId);
      }
      throw new Error(`Unsupported operation for check: ${operationType}`);
    }
    case "check_item": {
      const remapped = await remapCheckIdAsync(dataWithOfflineId);
      if (operationType === "create") {
        const { id: localId, ...insertData } = remapped;
        const created = await storage.createCheckItem(insertData as Parameters<typeof storage.createCheckItem>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const rawId = remapped.id as string;
        const cloudId = await resolveCloudId(rawId);
        const { id: _id, offlineTransactionId: _otxn, ...updateData } = remapped;
        return await storage.updateCheckItem(cloudId, updateData as Parameters<typeof storage.updateCheckItem>[1]);
      } else if (operationType === "delete") {
        const rawId = remapped.id as string;
        const cloudId = await resolveCloudId(rawId);
        return await storage.deleteCheckItem(cloudId);
      }
      throw new Error(`Unsupported operation for check_item: ${operationType}`);
    }
    case "check_payment": {
      const remapped = await remapCheckIdAsync(dataWithOfflineId);
      if (operationType === "create") {
        const { id: localId, ...insertData } = remapped;
        const created = await storage.createPayment(insertData as Parameters<typeof storage.createPayment>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const id = remapped.id as string;
        const cloudId = await resolveCloudId(id);
        const { id: _id, offlineTransactionId: _otxn, ...updateData } = remapped;
        return await storage.updateCheckPayment(cloudId, updateData as Parameters<typeof storage.updateCheckPayment>[1]);
      } else if (operationType === "delete") {
        const id = remapped.id as string;
        const cloudId = await resolveCloudId(id);
        return await storage.deleteCheckPayment(cloudId);
      }
      throw new Error(`Unsupported operation for check_payment: ${operationType}`);
    }
    case "round": {
      const remapped = await remapCheckIdAsync(dataWithOfflineId);
      if (operationType === "create") {
        const { id: localId, ...insertData } = remapped;
        const created = await storage.createRound(insertData as Parameters<typeof storage.createRound>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      }
      throw new Error(`Unsupported operation for round: ${operationType}`);
    }
    case "check_discount": {
      const remapped = await remapCheckIdAsync(dataWithOfflineId);
      if (operationType === "create") {
        const { id: localId, ...insertData } = remapped;
        const created = await storage.createCheckDiscount(insertData as Parameters<typeof storage.createCheckDiscount>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "delete") {
        const rawId = remapped.id as string;
        const cloudId = await resolveCloudId(rawId);
        return await storage.deleteCheckDiscount(cloudId);
      }
      throw new Error(`Unsupported operation for check_discount: ${operationType}`);
    }
    case "check_service_charge": {
      const remapped = await remapCheckIdAsync(dataWithOfflineId);
      if (operationType === "create") {
        const { id: localId, ...insertData } = remapped;
        const created = await storage.createCheckServiceCharge(insertData as Parameters<typeof storage.createCheckServiceCharge>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const rawId = remapped.id as string;
        const cloudId = await resolveCloudId(rawId);
        return await storage.voidCheckServiceCharge(
          cloudId,
          (dataWithOfflineId as Record<string, unknown>).voidedByEmployeeId as string || "",
          (dataWithOfflineId as Record<string, unknown>).voidReason as string | undefined,
        );
      }
      throw new Error(`Unsupported operation for check_service_charge: ${operationType}`);
    }
    default:
      throw new Error(`Unknown entity type for sync: ${entityType}`);
  }
}

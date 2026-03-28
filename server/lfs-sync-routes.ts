import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { checks, checkItems, checkPayments } from "@shared/schema";
import { eq } from "drizzle-orm";
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

function registerLfsLocalRoutes(app: Express) {
  if (!hasJournalMethods(storage)) {
    console.error("[LFS Sync] Storage does not support journal methods");
    return;
  }
  const journalStorage = storage;

  app.get("/api/lfs/journal/pending", async (_req: Request, res: Response) => {
    try {
      const entries = journalStorage.getPendingTransactions();
      const count = journalStorage.getPendingTransactionCount();
      res.json({ entries, count });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/journal/count", async (_req: Request, res: Response) => {
    try {
      const count = journalStorage.getPendingTransactionCount();
      res.json({ count });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/journal/:id/synced", async (req: Request, res: Response) => {
    try {
      journalStorage.markTransactionSynced(req.params.id);
      res.json({ ok: true });
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
        res.json({ ok: true, message: "Config sync completed" });
      } else {
        res.json({ ok: false, message: "Config sync service not available" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });
}

const idRemapCache = new Map<string, string>();

function registerLfsCloudRoutes(app: Express) {
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

      if (offlineTransactionId) {
        const existing = await checkDuplicate(entityType, offlineTransactionId);
        if (existing) {
          if (entityType === "check" && payload.id) {
            idRemapCache.set(payload.id, existing);
          }
          return res.json({ ok: true, deduplicated: true, cloudId: existing });
        }
      }

      const result = await syncEntity(entityType, operationType, payload, offlineTransactionId);
      res.json({ ok: true, result });
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

      const results = [];
      for (const entry of entries) {
        try {
          const entityType = entry.entity_type || entry.entityType;
          const operationType = entry.operation_type || entry.operationType;
          const payload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
          const offlineTransactionId = entry.offline_transaction_id || entry.offlineTransactionId;

          if (offlineTransactionId) {
            const existing = await checkDuplicate(entityType, offlineTransactionId);
            if (existing) {
              if (entityType === "check" && payload.id) {
                idRemapCache.set(payload.id, existing);
              }
              results.push({ id: entry.id, ok: true, deduplicated: true, cloudId: existing });
              continue;
            }
          }

          const result = await syncEntity(entityType, operationType, payload, offlineTransactionId);
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
        const { id: localId, ...insertData } = dataWithOfflineId;
        const created = await storage.createCheck(insertData as Parameters<typeof storage.createCheck>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const id = dataWithOfflineId.id as string;
        const cloudId = idRemapCache.get(id) || id;
        const { id: _id, offlineTransactionId: _otxn, ...updateData } = dataWithOfflineId;
        return await storage.updateCheck(cloudId, updateData as Parameters<typeof storage.updateCheck>[1]);
      } else if (operationType === "delete") {
        const id = dataWithOfflineId.id as string;
        const cloudId = idRemapCache.get(id) || id;
        return await storage.deleteCheck(cloudId);
      }
      throw new Error(`Unsupported operation for check: ${operationType}`);
    }
    case "check_item": {
      const remapped = remapCheckId(dataWithOfflineId);
      if (operationType === "create") {
        const { id: _localId, ...insertData } = remapped;
        return await storage.createCheckItem(insertData as Parameters<typeof storage.createCheckItem>[0]);
      } else if (operationType === "update") {
        const id = remapped.id as string;
        const { id: _id, offlineTransactionId: _otxn, ...updateData } = remapped;
        return await storage.updateCheckItem(id, updateData as Parameters<typeof storage.updateCheckItem>[1]);
      } else if (operationType === "delete") {
        const id = remapped.id as string;
        return await storage.deleteCheckItem(id);
      }
      throw new Error(`Unsupported operation for check_item: ${operationType}`);
    }
    case "check_payment": {
      const remapped = remapCheckId(dataWithOfflineId);
      if (operationType === "create") {
        const { id: _localId, ...insertData } = remapped;
        return await storage.createPayment(insertData as Parameters<typeof storage.createPayment>[0]);
      }
      throw new Error(`Unsupported operation for check_payment: ${operationType}`);
    }
    case "round": {
      const remapped = remapCheckId(dataWithOfflineId);
      if (operationType === "create") {
        const { id: _localId, ...insertData } = remapped;
        return await storage.createRound(insertData as Parameters<typeof storage.createRound>[0]);
      }
      throw new Error(`Unsupported operation for round: ${operationType}`);
    }
    case "check_discount": {
      const remapped = remapCheckId(dataWithOfflineId);
      if (operationType === "create") {
        const { id: _localId, ...insertData } = remapped;
        return await storage.createCheckDiscount(insertData as Parameters<typeof storage.createCheckDiscount>[0]);
      } else if (operationType === "delete") {
        const id = remapped.id as string;
        return await storage.deleteCheckDiscount(id);
      }
      throw new Error(`Unsupported operation for check_discount: ${operationType}`);
    }
    case "check_service_charge": {
      const remapped = remapCheckId(dataWithOfflineId);
      if (operationType === "create") {
        const { id: _localId, ...insertData } = remapped;
        return await storage.createCheckServiceCharge(insertData as Parameters<typeof storage.createCheckServiceCharge>[0]);
      } else if (operationType === "update") {
        const id = remapped.id as string;
        const { id: _id, offlineTransactionId: _otxn, ...updateData } = remapped;
        return await storage.voidCheckServiceCharge(
          id,
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

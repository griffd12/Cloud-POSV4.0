import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { checks, checkItems, checkPayments, checkDiscounts, checkServiceCharges, rounds } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const isLocalMode = process.env.DB_MODE === "local";

function requireLfsApiKey(req: Request, res: Response, next: NextFunction) {
  const expectedKey = process.env.LFS_API_KEY;
  if (!expectedKey) {
    return next();
  }
  const provided = req.headers["x-lfs-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
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

function registerLfsLocalRoutes(app: Express) {
  const sqliteStorage = storage as any;

  app.get("/api/lfs/journal/pending", async (_req: Request, res: Response) => {
    try {
      const entries = sqliteStorage.getPendingTransactions();
      const count = sqliteStorage.getPendingTransactionCount();
      res.json({ entries, count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/lfs/journal/count", async (_req: Request, res: Response) => {
    try {
      const count = sqliteStorage.getPendingTransactionCount();
      res.json({ count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/lfs/journal/:id/synced", async (req: Request, res: Response) => {
    try {
      sqliteStorage.markTransactionSynced(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/lfs/sync/config-down", async (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, message: "Config sync triggered on LFS" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

function registerLfsCloudRoutes(app: Express) {
  app.post("/api/lfs/sync/transaction-up", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const entry = req.body;
      if (!entry || !entry.entity_type || !entry.payload) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const payload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
      const offlineTransactionId = entry.offline_transaction_id || entry.offlineTransactionId;

      if (offlineTransactionId) {
        const existing = await checkDuplicate(entry.entity_type, offlineTransactionId);
        if (existing) {
          return res.json({ ok: true, deduplicated: true, cloudId: existing });
        }
      }

      const result = await syncEntity(entry.entity_type, entry.operation_type || entry.operationType, payload, offlineTransactionId);
      res.json({ ok: true, result });
    } catch (e: any) {
      console.error("[LFS Sync] Transaction upload error:", e.message);
      res.status(500).json({ error: e.message });
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
          const payload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
          const offlineTransactionId = entry.offline_transaction_id || entry.offlineTransactionId;

          if (offlineTransactionId) {
            const existing = await checkDuplicate(entry.entity_type || entry.entityType, offlineTransactionId);
            if (existing) {
              results.push({ id: entry.id, ok: true, deduplicated: true, cloudId: existing });
              continue;
            }
          }

          const result = await syncEntity(
            entry.entity_type || entry.entityType,
            entry.operation_type || entry.operationType,
            payload,
            offlineTransactionId
          );
          results.push({ id: entry.id, ok: true, result });
        } catch (e: any) {
          results.push({ id: entry.id, ok: false, error: e.message });
        }
      }

      res.json({ ok: true, results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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
  } catch {
    return null;
  }
}

async function syncEntity(
  entityType: string,
  operationType: string,
  payload: any,
  offlineTransactionId?: string,
): Promise<any> {
  const dataWithOfflineId = offlineTransactionId
    ? { ...payload, offlineTransactionId }
    : payload;

  switch (entityType) {
    case "check": {
      if (operationType === "create") {
        const { id: _localId, ...insertData } = dataWithOfflineId;
        return await storage.createCheck(insertData);
      } else if (operationType === "update") {
        const { id, ...updateData } = dataWithOfflineId;
        return await storage.updateCheck(id, updateData);
      }
      break;
    }
    case "check_item": {
      if (operationType === "create") {
        const { id: _localId, ...insertData } = dataWithOfflineId;
        return await storage.createCheckItem(insertData);
      }
      break;
    }
    case "check_payment": {
      if (operationType === "create") {
        const { id: _localId, ...insertData } = dataWithOfflineId;
        return await storage.createCheckPayment(insertData);
      }
      break;
    }
    case "round": {
      if (operationType === "create") {
        const { id: _localId, ...insertData } = dataWithOfflineId;
        return await storage.createRound(insertData);
      }
      break;
    }
    case "check_discount": {
      if (operationType === "create") {
        const { id: _localId, ...insertData } = dataWithOfflineId;
        return await storage.createCheckDiscount(insertData);
      }
      break;
    }
    case "check_service_charge": {
      if (operationType === "create") {
        const { id: _localId, ...insertData } = dataWithOfflineId;
        return await storage.createCheckServiceCharge(insertData);
      }
      break;
    }
    default:
      throw new Error(`Unknown entity type for sync: ${entityType}`);
  }
}

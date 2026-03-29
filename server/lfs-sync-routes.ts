import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { checks, checkItems, checkPayments, tenders, paymentGatewayConfig } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
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

function requireLfsLocalAuth(req: Request, res: Response, next: Function) {
  const apiKey = process.env.LFS_API_KEY;
  if (!apiKey) {
    res.status(401).json({ error: "Unauthorized: LFS_API_KEY not configured" });
    return;
  }

  const provided = req.headers["x-lfs-admin-key"] || req.headers["x-lfs-api-key"];
  if (provided === apiKey) return next();

  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.match(/lfs_admin_session=([^;]+)/);
    if (match) {
      const crypto = require("crypto");
      const expectedToken = crypto.createHmac("sha256", apiKey).update("lfs-admin-session").digest("hex");
      if (match[1] === expectedToken) return next();
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}

function registerLfsLocalRoutes(app: Express) {
  if (!hasJournalMethods(storage)) {
    console.error("[LFS Sync] Storage does not support journal methods");
    return;
  }
  const journalStorage = storage;
  const sqliteDb = (storage as Record<string, unknown>).db as import("better-sqlite3").Database | undefined;

  app.get("/api/lfs/capabilities", async (_req: Request, res: Response) => {
    try {
      const cloudUrl = process.env.LFS_CLOUD_URL || "";
      let cloudReachable = false;
      let internetAvailable = false;

      const internetProbe = async () => {
        try {
          await fetch("https://dns.google/resolve?name=example.com", {
            signal: AbortSignal.timeout(3000),
          });
          return true;
        } catch {
          try {
            await fetch("https://1.1.1.1/dns-query?name=example.com&type=A", {
              headers: { accept: "application/dns-json" },
              signal: AbortSignal.timeout(3000),
            });
            return true;
          } catch {
            return false;
          }
        }
      };

      const cloudProbe = async () => {
        if (!cloudUrl) return false;
        try {
          await fetch(`${cloudUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
          return true;
        } catch {
          return false;
        }
      };

      [internetAvailable, cloudReachable] = await Promise.all([internetProbe(), cloudProbe()]);

      res.json({
        mode: "local",
        features: {
          payments: true,
          kds: true,
          printing: true,
          onlineOrdering: false,
          reporting: false,
        },
        internetAvailable,
        cloudReachable,
        cloudUrl: cloudUrl || null,
        propertyId: process.env.LFS_PROPERTY_ID || null,
        paymentCapabilities: {
          cashPayments: true,
          semiIntegratedTerminals: true,
          cloudGatewayPayments: internetAvailable,
          storeAndForward: true,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/payment-status", async (_req: Request, res: Response) => {
    try {
      const cloudUrl = process.env.LFS_CLOUD_URL || "";
      let cloudReachable = false;
      let internetAvailable = false;

      const checks = await Promise.allSettled([
        cloudUrl ? fetch(`${cloudUrl}/api/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.ok) : Promise.resolve(false),
        fetch("https://dns.google/resolve?name=example.com", { signal: AbortSignal.timeout(3000) }).then(() => true).catch(() => false),
      ]);
      cloudReachable = checks[0].status === "fulfilled" && checks[0].value === true;
      internetAvailable = checks[1].status === "fulfilled" && checks[1].value === true;

      res.json({
        localMode: true,
        cloudReachable,
        internetAvailable,
        cashAvailable: true,
        cardAvailable: true,
        cardMode: internetAvailable ? "online" : "store_and_forward",
        message: internetAvailable
          ? (cloudReachable
              ? "Processing payments normally via cloud"
              : "Cloud unavailable but internet up — processing card payments directly via processor")
          : "Internet down — card payments handled by terminal store-and-forward. Settlements will sync when connectivity restores.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/record-saf-payment", async (req: Request, res: Response) => {
    try {
      const { checkId, tenderId, tenderName, amount, employeeId, businessDate, paymentTransactionId } = req.body;
      if (!checkId || !tenderId || !tenderName || !amount) {
        return res.status(400).json({ error: "checkId, tenderId, tenderName, and amount are required" });
      }

      const payment = await storage.createPayment({
        checkId,
        tenderId,
        tenderName,
        amount: amount.toString(),
        paymentStatus: "pending_settlement",
        paymentTransactionId: paymentTransactionId || undefined,
        employeeId: employeeId || undefined,
        businessDate: businessDate || undefined,
      } as Parameters<typeof storage.createPayment>[0]);

      if (typeof (storage as Record<string, unknown>).recordTransaction === "function") {
        (storage as Record<string, Function>).recordTransaction({
          operationType: "create",
          entityType: "check_payment",
          entityId: payment.id,
          httpMethod: "POST",
          endpoint: "/api/check-payments",
          payload: payment,
          offlineTransactionId: payment.offlineTransactionId || undefined,
        });
      }

      res.json({ ok: true, payment });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/reconcile-saf", requireLfsLocalAuth, async (_req: Request, res: Response) => {
    try {
      const allPayments = await storage.getAllPayments();
      const pendingPayments = allPayments.filter(p => p.paymentStatus === "pending_settlement");

      if (pendingPayments.length === 0) {
        return res.json({ ok: true, total: 0, settled: 0, failed: 0, results: [] });
      }

      const cloudUrl = process.env.LFS_CLOUD_URL;
      const apiKey = process.env.LFS_API_KEY;

      if (!cloudUrl) {
        return res.json({
          ok: false,
          error: "LFS_CLOUD_URL not configured — cannot reconcile with cloud",
          total: pendingPayments.length,
          settled: 0,
          failed: 0,
        });
      }

      const results: Array<{ paymentId: string; status: string; error?: string }> = [];

      for (const payment of pendingPayments) {
        try {
          let settlementStatus: "confirmed" | "failed" | "pending" = "pending";
          let settlementTransactionId = payment.paymentTransactionId;

          if (payment.paymentTransactionId) {
            try {
              const verifyRes = await fetch(`${cloudUrl}/api/lfs/sync/verify-processor-settlement`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(apiKey ? { "x-lfs-api-key": apiKey } : {}),
                },
                body: JSON.stringify({
                  transactionId: payment.paymentTransactionId,
                  amount: payment.amount,
                  tenderId: payment.tenderId,
                }),
                signal: AbortSignal.timeout(10000),
              });
              if (verifyRes.ok) {
                const verifyData = await verifyRes.json();
                if (verifyData.verified) {
                  settlementStatus = "confirmed";
                  settlementTransactionId = verifyData.transactionId || payment.paymentTransactionId;
                } else if (verifyData.declined) {
                  settlementStatus = "failed";
                }
              }
            } catch {
              settlementStatus = "pending";
            }
          }

          const settleRes = await fetch(`${cloudUrl}/api/lfs/sync/settle-payment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { "x-lfs-api-key": apiKey } : {}),
            },
            body: JSON.stringify({
              paymentId: payment.id,
              offlineTransactionId: payment.offlineTransactionId,
              settlementTransactionId,
              settlementStatus,
              amount: payment.amount,
              checkId: payment.checkId,
              tenderId: payment.tenderId,
            }),
            signal: AbortSignal.timeout(10000),
          });

          if (settleRes.ok) {
            const settleData = await settleRes.json();
            const newStatus = settleData.newStatus;
            if (!newStatus || newStatus === "pending_settlement") {
              results.push({ paymentId: payment.id, status: "pending_settlement", error: "Cloud has not confirmed settlement yet — will retry" });
            } else if (newStatus === "settlement_failed") {
              await storage.updateCheckPayment(payment.id, {
                paymentStatus: "settlement_failed",
              } as Parameters<typeof storage.updateCheckPayment>[1]);
              results.push({ paymentId: payment.id, status: "settlement_failed", error: settleData.reason || "cloud rejected" });
            } else if (newStatus === "completed") {
              await storage.updateCheckPayment(payment.id, {
                paymentStatus: "completed",
              } as Parameters<typeof storage.updateCheckPayment>[1]);
              results.push({ paymentId: payment.id, status: "completed" });
            } else {
              results.push({ paymentId: payment.id, status: "pending_settlement", error: `Unexpected status: ${newStatus} — will retry` });
            }
          } else {
            const errText = await settleRes.text().catch(() => "Unknown");
            results.push({ paymentId: payment.id, status: "pending_settlement", error: `Cloud returned ${settleRes.status}: ${errText} — will retry` });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          results.push({ paymentId: payment.id, status: "pending_settlement", error: `${msg} — will retry` });
        }
      }

      const settled = results.filter(r => r.status === "completed").length;
      const failed = results.filter(r => r.status === "settlement_failed").length;
      res.json({ ok: true, total: pendingPayments.length, settled, failed, results });
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

const ALLOWED_CONFIG_TABLES = new Set([
  "enterprises", "properties", "rvcs", "roles", "role_privileges", "role_rules",
  "privileges", "employees", "employee_assignments", "major_groups", "family_groups",
  "slus", "menu_item_slus", "tax_groups", "print_classes", "workstations", "printers",
  "kds_devices", "order_devices", "order_device_printers", "order_device_kds",
  "workstation_order_devices", "print_class_routing", "menu_items", "modifier_groups",
  "modifiers", "modifier_group_modifiers", "menu_item_modifier_groups",
  "ingredient_prefixes", "menu_item_recipe_ingredients", "tenders", "discounts",
  "service_charges", "pos_layouts", "pos_layout_cells", "pos_layout_rvc_assignments",
  "job_codes", "employee_job_codes", "descriptor_sets", "descriptor_logo_assets",
  "payment_processors", "payment_gateway_config", "overtime_rules", "break_rules",
  "minor_labor_rules", "tip_pool_policies", "tip_rules", "tip_rule_job_percentages",
  "loyalty_programs", "loyalty_rewards", "emc_option_flags",
  "terminal_devices", "print_agents", "cash_drawers",
]);

function registerLfsCloudRoutes(app: Express) {
  ensureCloudRemapTable().then(() => { remapTableReady = true; }).catch(() => {});

  app.get("/api/lfs/sync/:tableName", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const tableName = req.params.tableName;
      if (!ALLOWED_CONFIG_TABLES.has(tableName)) {
        return res.status(400).json({ error: `Table '${tableName}' is not allowed for config sync` });
      }
      const propertyId = req.query.propertyId as string | undefined;
      const since = req.query.since as string | undefined;

      const colsResult = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${tableName}`);
      const allCols = new Set((colsResult.rows || []).map((r: any) => r.column_name as string));
      const hasPropertyId = allCols.has("property_id");
      const hasUpdatedAt = allCols.has("updated_at");

      let incremental = false;
      let result;
      if (since && hasUpdatedAt) {
        incremental = true;
        if (propertyId && hasPropertyId) {
          result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE "property_id" = ${propertyId} AND "updated_at" > ${since}`);
        } else {
          result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE "updated_at" > ${since}`);
        }
      } else {
        if (propertyId && hasPropertyId) {
          result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE "property_id" = ${propertyId}`);
        } else {
          result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)}`);
        }
      }
      const rows = result.rows || [];
      const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];
      res.json({ rows, columns, incremental });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[LFS Sync] Config export error:`, msg);
      res.status(500).json({ error: msg });
    }
  });

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

  app.get("/api/lfs/sync/pending-settlements", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const propertyId = req.query.propertyId as string | undefined;
      let pendingPayments;
      if (propertyId) {
        pendingPayments = await db.select()
          .from(checkPayments)
          .innerJoin(checks, eq(checks.id, checkPayments.checkId))
          .where(and(
            eq(checkPayments.paymentStatus, "pending_settlement"),
            sql`EXISTS (SELECT 1 FROM rvcs WHERE rvcs.id = ${checks.rvcId} AND rvcs.property_id = ${propertyId})`
          ));
        const payments = pendingPayments.map(r => r.check_payments);
        res.json({ count: payments.length, payments });
      } else {
        pendingPayments = await db.select()
          .from(checkPayments)
          .where(eq(checkPayments.paymentStatus, "pending_settlement"));
        res.json({ count: pendingPayments.length, payments: pendingPayments });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/verify-processor-settlement", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const { transactionId, amount, tenderId } = req.body;
      if (!transactionId) {
        return res.status(400).json({ error: "transactionId is required" });
      }

      try {
        const { createPaymentAdapter, resolveCredentials, getRequiredCredentialKeys } = await import("./payments/registry");

        if (tenderId && db) {
          const tenderRows = await db.select().from(tenders).where(eq(tenders.id, tenderId)).limit(1);
          const tender = tenderRows[0];
          if (tender?.gatewayType) {
            const configConditions = [eq(paymentGatewayConfig.gatewayType, tender.gatewayType)];
            if (tender.propertyId) {
              configConditions.push(eq(paymentGatewayConfig.propertyId, tender.propertyId));
            }
            const configRows = await db.select().from(paymentGatewayConfig)
              .where(and(...configConditions)).limit(1);
            let config = configRows[0];
            if (!config && tender.propertyId) {
              const fallbackRows = await db.select().from(paymentGatewayConfig)
                .where(eq(paymentGatewayConfig.gatewayType, tender.gatewayType)).limit(1);
              config = fallbackRows[0];
            }

            const requiredKeys = getRequiredCredentialKeys(tender.gatewayType);
            const prefix = config?.envKeyPrefix || tender.gatewayType.toUpperCase();
            const dbCreds = config?.encryptedCredentials ? JSON.parse(config.encryptedCredentials) : {};
            const credentials = resolveCredentials(prefix, requiredKeys, dbCreds);
            const environment = config?.environment === "production" ? "production" : "sandbox";

            const adapter = createPaymentAdapter(tender.gatewayType, credentials, {}, environment);
            if (adapter && typeof (adapter as Record<string, unknown>).verifyTransaction === "function") {
              const verification = await (adapter as unknown as { verifyTransaction: (id: string, amt: string) => Promise<{ settled?: boolean; declined?: boolean; transactionId?: string; message?: string }> }).verifyTransaction(transactionId, amount);
              return res.json({
                verified: verification.settled === true,
                declined: verification.declined === true,
                transactionId: verification.transactionId || transactionId,
                processorResponse: verification.message,
              });
            }
          }
        }
      } catch (adapterErr) {
        console.warn(`[SAF Verify] Adapter lookup/verification failed for tender ${tenderId}: ${adapterErr}`);
      }

      return res.json({
        verified: false,
        declined: false,
        transactionId,
        message: "No processor adapter available for verification — payment stays pending",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/settle-payment", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const { paymentId, offlineTransactionId, settlementTransactionId, settlementStatus, amount, checkId, tenderId } = req.body;
      if (!paymentId && !offlineTransactionId) {
        return res.status(400).json({ error: "paymentId or offlineTransactionId is required" });
      }

      let payment;
      if (offlineTransactionId) {
        const results = await db.select().from(checkPayments)
          .where(eq(checkPayments.offlineTransactionId, offlineTransactionId)).limit(1);
        payment = results[0];
      }
      if (!payment && paymentId) {
        const results = await db.select().from(checkPayments)
          .where(eq(checkPayments.id, paymentId)).limit(1);
        payment = results[0];
      }
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      if (payment.paymentStatus !== "pending_settlement") {
        return res.json({ ok: true, message: "Payment already settled", status: payment.paymentStatus, newStatus: payment.paymentStatus });
      }

      if (!amount) {
        return res.status(400).json({ error: "amount is required for settlement verification" });
      }

      if (payment.amount && Math.abs(parseFloat(amount) - parseFloat(payment.amount)) > 0.01) {
        const newStatus = "settlement_failed";
        await storage.updateCheckPayment(payment.id, {
          paymentStatus: newStatus,
        } as Parameters<typeof storage.updateCheckPayment>[1]);
        console.warn(`[SAF Settlement] Amount mismatch for ${payment.id}: expected ${payment.amount}, got ${amount}`);
        return res.json({ ok: true, paymentId: payment.id, newStatus, reason: "amount_mismatch" });
      }

      if (!settlementStatus) {
        return res.status(400).json({ error: "settlementStatus is required (confirmed, failed, or pending)" });
      }

      if (settlementStatus === "failed") {
        await storage.updateCheckPayment(payment.id, {
          paymentStatus: "settlement_failed",
        } as Parameters<typeof storage.updateCheckPayment>[1]);
        console.warn(`[SAF Settlement] Payment ${payment.id} marked settlement_failed — requires manager review`);
        return res.json({ ok: true, paymentId: payment.id, newStatus: "settlement_failed", requiresManagerReview: true });
      }

      if (settlementStatus === "pending") {
        return res.json({ ok: true, paymentId: payment.id, newStatus: "pending_settlement", message: "Awaiting processor confirmation" });
      }

      if (settlementStatus !== "confirmed") {
        return res.status(400).json({ error: `Invalid settlementStatus: ${settlementStatus}. Must be confirmed, failed, or pending.` });
      }

      if (!settlementTransactionId) {
        return res.status(400).json({ error: "settlementTransactionId is required when settlementStatus is confirmed" });
      }

      await storage.updateCheckPayment(payment.id, {
        paymentStatus: "completed",
        paymentTransactionId: settlementTransactionId,
      } as Parameters<typeof storage.updateCheckPayment>[1]);

      res.json({ ok: true, paymentId: payment.id, newStatus: "completed" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/sync/failed-settlements", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const propertyId = req.query.propertyId as string | undefined;
      let failedPayments;
      if (propertyId) {
        const joined = await db.select()
          .from(checkPayments)
          .innerJoin(checks, eq(checks.id, checkPayments.checkId))
          .where(and(
            eq(checkPayments.paymentStatus, "settlement_failed"),
            sql`EXISTS (SELECT 1 FROM rvcs WHERE rvcs.id = ${checks.rvcId} AND rvcs.property_id = ${propertyId})`
          ));
        failedPayments = joined.map(r => r.check_payments);
      } else {
        failedPayments = await db.select()
          .from(checkPayments)
          .where(eq(checkPayments.paymentStatus, "settlement_failed"));
      }
      res.json({
        count: failedPayments.length,
        payments: failedPayments,
        requiresManagerReview: failedPayments.length > 0,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/reconcile-saf-batch", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const { propertyId, settlements } = req.body;

      if (!settlements || !Array.isArray(settlements)) {
        return res.status(400).json({ error: "settlements array is required with paymentId, amount, and settlementTransactionId per entry" });
      }

      const results: Array<{ paymentId: string; status: string; error?: string }> = [];

      for (const entry of settlements) {
        const { paymentId, amount, settlementTransactionId } = entry;
        if (!paymentId) {
          results.push({ paymentId: "unknown", status: "skipped", error: "Missing paymentId" });
          continue;
        }

        try {
          const [payment] = await db.select().from(checkPayments)
            .where(eq(checkPayments.id, paymentId)).limit(1);

          if (!payment) {
            results.push({ paymentId, status: "skipped", error: "Payment not found" });
            continue;
          }

          if (payment.paymentStatus !== "pending_settlement") {
            results.push({ paymentId, status: payment.paymentStatus || "unknown", error: "Already processed" });
            continue;
          }

          if (amount && payment.amount && Math.abs(parseFloat(amount) - parseFloat(payment.amount)) > 0.01) {
            await storage.updateCheckPayment(paymentId, {
              paymentStatus: "settlement_failed",
            } as Parameters<typeof storage.updateCheckPayment>[1]);
            results.push({ paymentId, status: "settlement_failed", error: "Amount mismatch — requires manager review" });
            continue;
          }

          await storage.updateCheckPayment(paymentId, {
            paymentStatus: "completed",
            paymentTransactionId: settlementTransactionId || payment.paymentTransactionId,
          } as Parameters<typeof storage.updateCheckPayment>[1]);
          results.push({ paymentId, status: "completed" });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          results.push({ paymentId, status: "error", error: msg });
        }
      }

      const settled = results.filter(r => r.status === "completed").length;
      const failed = results.filter(r => r.status === "settlement_failed").length;
      res.json({ ok: true, total: settlements.length, settled, failed, results });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
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
        const rvcId = insertData.rvcId as string;
        const createFn = typeof (storage as Record<string, unknown>).createCheckAtomic === "function"
          ? (storage as Record<string, Function>).createCheckAtomic.bind(storage)
          : null;
        const created = createFn && rvcId
          ? await createFn(rvcId, insertData)
          : await storage.createCheck(insertData as Parameters<typeof storage.createCheck>[0]);
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
      } else if (operationType === "delete" || operationType === "void") {
        const id = remapped.id as string;
        const cloudId = await resolveCloudId(id);
        return await storage.updateCheckPayment(cloudId, { paymentStatus: "voided" } as Parameters<typeof storage.updateCheckPayment>[1]);
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

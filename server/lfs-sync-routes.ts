import type { Express, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "./storage";
import { getConfigSyncService } from "./config-sync";
import { getPendingJournalEntries, getPendingJournalCount, markJournalEntrySynced, recordJournalEntry, getJournalStats, atomicJournalWrite } from "./transaction-journal";
import { getCloudSyncStatus } from "./cloud-sync";

const isLocalMode = process.env.DB_MODE === "local";

let lfsCommandTableReady = false;

async function ensureLfsCommandTable(): Promise<void> {
  if (lfsCommandTableReady) return;
  try {
    const { db: dbRef } = await import("./db");
    const { sql: sqlDrizzle } = await import("drizzle-orm");
    await dbRef.execute(sqlDrizzle`
      CREATE TABLE IF NOT EXISTS lfs_pending_commands (
        id SERIAL PRIMARY KEY,
        command TEXT NOT NULL,
        property_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        executed BOOLEAN DEFAULT FALSE
      )
    `);
    lfsCommandTableReady = true;
  } catch (e) {
    console.error("[LFS] Failed to create lfs_pending_commands table:", e);
  }
}

export async function queueLfsCommand(command: string, propertyId: string) {
  await ensureLfsCommandTable();
  try {
    const { db: dbRef } = await import("./db");
    const { sql: sqlDrizzle } = await import("drizzle-orm");
    await dbRef.execute(
      sqlDrizzle`INSERT INTO lfs_pending_commands (command, property_id) VALUES (${command}, ${propertyId})`
    );
  } catch (e) {
    console.error("[LFS] Failed to queue command:", e);
  }
}

export async function fetchPendingLfsCommands(propertyId: string): Promise<Array<{ id: number; command: string; propertyId: string }>> {
  await ensureLfsCommandTable();
  try {
    const { db: dbRef } = await import("./db");
    const { sql: sqlDrizzle } = await import("drizzle-orm");
    const result = await dbRef.execute(
      sqlDrizzle`SELECT id, command, property_id FROM lfs_pending_commands WHERE property_id = ${propertyId} AND executed = FALSE ORDER BY id`
    );
    return (result.rows || []).map((r: Record<string, unknown>) => ({
      id: r.id as number,
      command: r.command as string,
      propertyId: r.property_id as string,
    }));
  } catch (e) {
    console.error("[LFS] Failed to fetch pending commands:", e);
    return [];
  }
}

export async function ackLfsCommands(commandIds: number[], propertyId: string): Promise<void> {
  if (commandIds.length === 0) return;
  await ensureLfsCommandTable();
  try {
    const { db: dbRef } = await import("./db");
    const { sql: sqlDrizzle } = await import("drizzle-orm");
    await dbRef.execute(
      sqlDrizzle`UPDATE lfs_pending_commands SET executed = TRUE WHERE id = ANY(${commandIds}) AND property_id = ${propertyId}`
    );
  } catch (e) {
    console.error("[LFS] Failed to ack commands:", e);
  }
}

interface LfsAuthenticatedRequest extends Request {
  lfsPropertyId?: string;
  lfsConfigId?: string;
}

async function requireLfsApiKey(req: Request, res: Response, next: NextFunction) {
  if (isLocalMode) {
    return next();
  }

  const provided = req.headers["x-lfs-api-key"] as string | undefined
    || (req.headers["authorization"] as string | undefined)?.replace("Bearer ", "");
  const propertyIdHeader = req.headers["x-lfs-property-id"] as string | undefined;

  if (!provided) {
    return res.status(403).json({ error: "Invalid or missing LFS API key" });
  }

  const hashedProvided = crypto.createHash("sha256").update(provided).digest("hex");

  if (propertyIdHeader) {
    const configByProperty = await storage.getLfsConfiguration(propertyIdHeader);
    if (configByProperty && configByProperty.apiKey === hashedProvided) {
      (req as LfsAuthenticatedRequest).lfsPropertyId = configByProperty.propertyId;
      (req as LfsAuthenticatedRequest).lfsConfigId = configByProperty.id;
      return next();
    }

    const envKey = process.env.LFS_API_KEY;
    if (envKey && provided === envKey) {
      (req as LfsAuthenticatedRequest).lfsPropertyId = propertyIdHeader;
      return next();
    }

    return res.status(403).json({ error: "API key does not match the specified property" });
  }

  const dbConfig = await storage.getLfsConfigurationByApiKey(hashedProvided);
  if (dbConfig) {
    (req as LfsAuthenticatedRequest).lfsPropertyId = dbConfig.propertyId;
    (req as LfsAuthenticatedRequest).lfsConfigId = dbConfig.id;
    return next();
  }

  const envKey = process.env.LFS_API_KEY;
  if (envKey && provided === envKey) {
    return next();
  }

  return res.status(403).json({ error: "Invalid or missing LFS API key" });
}

function enforceLfsPropertyScope(req: Request, res: Response): string | null {
  const lfsReq = req as LfsAuthenticatedRequest;
  const lfsPropertyId = lfsReq.lfsPropertyId;
  const queryPropertyId = req.query.propertyId as string || req.body?.propertyId as string;
  if (lfsPropertyId && queryPropertyId && queryPropertyId !== lfsPropertyId) {
    res.status(403).json({ error: "API key is not authorized for this property" });
    return null;
  }
  return lfsPropertyId || queryPropertyId || null;
}

export function registerLfsSyncRoutes(app: Express) {
  if (isLocalMode) {
    registerLfsLocalRoutes(app);
  } else {
    registerLfsCloudRoutes(app);
  }
}


const ENTITY_SYNC_ORDER: Record<string, number> = {
  check: 0,
  round: 1,
  check_item: 2,
  kds_ticket: 3,
  kds_ticket_item: 4,
  kds_item: 5,
  check_payment: 6,
  check_discount: 7,
  check_service_charge: 8,
  check_lock: 9,
  refund: 10,
  payment_transaction: 11,
  item_availability: 12,
  time_punch: 15,
  cash_transaction: 16,
  inventory_transaction: 17,
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
      try {
        const { isValidAdminSession } = require("./lfs-admin-routes");
        if (isValidAdminSession(match[1])) return next();
      } catch {}
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}

function registerLfsLocalRoutes(app: Express) {

  app.get("/api/lfs/db-status", async (_req: Request, res: Response) => {
    try {
      const dbStatus = await storage.getDatabaseStatus();
      res.json({
        status: "connected",
        database: dbStatus.db,
        version: dbStatus.version,
        serverTime: dbStatus.serverTime,
        lfsMode: true,
        databaseUrl: process.env.LFS_DATABASE_URL ? "[configured]" : "[missing]",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(503).json({
        status: "error",
        message: `LFS database connection failed: ${msg}`,
        databaseUrl: process.env.LFS_DATABASE_URL ? "[configured]" : "[missing]",
        setupRequired: !process.env.LFS_DATABASE_URL,
        instructions: !process.env.LFS_DATABASE_URL
          ? "Set LFS_DATABASE_URL environment variable to your local PostgreSQL connection string"
          : "Verify PostgreSQL is running and accessible at the configured LFS_DATABASE_URL",
      });
    }
  });

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

      const paymentId = crypto.randomUUID();

      const { result: payment } = await atomicJournalWrite(
        {
          operationType: "create",
          entityType: "check_payment",
          entityId: paymentId,
          httpMethod: "POST",
          endpoint: "/api/lfs/record-saf-payment",
          payload: { checkId, tenderId, tenderName, amount, employeeId, businessDate, paymentTransactionId },
          idempotencyKey: paymentTransactionId || `saf-payment:${checkId}:${tenderId}:${amount}`,
        },
        () => storage.createPayment({
          id: paymentId, checkId, tenderId, tenderName,
          amount: amount.toString(), paymentStatus: "pending_settlement",
          paymentTransactionId: paymentTransactionId || undefined,
          employeeId: employeeId || undefined, businessDate: businessDate || undefined,
        } as Parameters<typeof storage.createPayment>[0])
      );

      res.json({ ok: true, payment });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/sync/pending-settlements", requireLfsLocalAuth, async (_req: Request, res: Response) => {
    try {
      const allPayments = await storage.getAllPayments();
      const pendingPayments = allPayments.filter(p => p.paymentStatus === "pending_settlement");
      res.json({ count: pendingPayments.length, payments: pendingPayments });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/reconcile-saf", (req: Request, res: Response, next: Function) => {
    const apiKey = process.env.LFS_API_KEY;
    if (!apiKey) return next();

    const provided = req.headers["x-lfs-admin-key"] || req.headers["x-lfs-api-key"];
    if (provided === apiKey) return next();

    const cookie = req.headers.cookie;
    if (cookie) {
      const match = cookie.match(/lfs_admin_session=([^;]+)/);
      if (match) {
        try {
          const { isValidAdminSession } = require("./lfs-admin-routes");
          if (isValidAdminSession(match[1])) return next();
        } catch {}
      }
    }

    const ip = req.ip || req.socket.remoteAddress || "";
    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" ||
      ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("::ffff:192.168.") || ip.startsWith("::ffff:10.");
    if (isLocal) return next();

    res.status(401).json({ error: "Unauthorized" });
  }, async (_req: Request, res: Response) => {
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
      const count = await getPendingJournalCount();
      res.json({ count });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/journal/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await getJournalStats();
      const cloudSync = getCloudSyncStatus();
      res.json({ ...stats, cloudSync });
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
      const entries = await getPendingJournalEntries(100);
      if (!entries.length) {
        return res.json({ ok: true, synced: 0, remaining: 0 });
      }

      const sorted = sortByDependency(entries.map(e => ({
        id: e.id,
        operation_type: e.operationType,
        entity_type: e.entityType,
        entity_id: e.entityId,
        http_method: e.httpMethod,
        endpoint: e.endpoint,
        payload: e.payload,
        offline_transaction_id: e.offlineTransactionId,
        workstation_id: e.workstationId,
        created_at: e.createdAt,
      })));

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
            await markJournalEntrySynced(entry.id as string);
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

      const remaining = await getPendingJournalCount();
      res.json({ ok: synced > 0, synced, remaining, lastError });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/mode", async (_req: Request, res: Response) => {
    try {
      const cloudUrl = process.env.LFS_CLOUD_URL || "";
      let internetAvailable = false;
      let cloudReachable = false;

      const [internetCheck, cloudCheck] = await Promise.allSettled([
        fetch("https://dns.google/resolve?name=example.com", { signal: AbortSignal.timeout(3000) }).then(() => true).catch(() => false),
        cloudUrl ? fetch(`${cloudUrl}/api/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.ok).catch(() => false) : Promise.resolve(false),
      ]);

      internetAvailable = internetCheck.status === "fulfilled" && internetCheck.value === true;
      cloudReachable = cloudCheck.status === "fulfilled" && cloudCheck.value === true;

      const syncService = getConfigSyncService();
      const syncStatus = syncService?.getStatus();
      const cloudSync = getCloudSyncStatus();
      const pendingCount = await getPendingJournalCount();

      let mode: "green" | "yellow" | "red";
      let meaning: string;

      if (!internetAvailable) {
        mode = "red";
        meaning = "No internet — cash only, all operations local, journal accumulating";
      } else if (!cloudReachable || pendingCount > 0 || cloudSync.lastSyncError) {
        mode = "yellow";
        meaning = "Internet available (credit cards work) but cloud sync is delayed or cloud unreachable";
      } else {
        mode = "green";
        meaning = "Everything healthy — config synced, transactions flowing to cloud, credit cards work";
      }

      res.json({
        mode,
        meaning,
        internetAvailable,
        cloudReachable,
        pendingJournalEntries: pendingCount,
        configSync: syncStatus || null,
        cloudSync,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/clear-sales-data", async (req: Request, res: Response) => {
    try {
      const propertyId = req.body?.propertyId || process.env.LFS_PROPERTY_ID;
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId is required" });
      }
      const apiKey = req.headers["x-lfs-api-key"] || req.headers["x-lfs-admin-key"];
      const expectedKey = process.env.LFS_API_KEY;
      const pin = req.body?.pin;
      if (pin) {
        const employee = await storage.getEmployeeByPin(pin);
        if (!employee) {
          return res.status(401).json({ error: "Invalid PIN" });
        }
        if (employee.roleId) {
          const privileges = await storage.getRolePrivileges(employee.roleId);
          if (!privileges.includes("admin_access")) {
            return res.status(403).json({ error: "You do not have admin access privileges" });
          }
        } else {
          return res.status(403).json({ error: "Employee has no assigned role" });
        }
      } else if (expectedKey && apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await storage.clearSalesData(propertyId);
      const { db: dbRef } = await import("./db");
      const { sql: sqlDrizzle } = await import("drizzle-orm");
      try {
        await dbRef.execute(
          sqlDrizzle`DELETE FROM transaction_journal WHERE property_id = ${propertyId}`
        );
      } catch (journalErr) {
        console.error("[LFS-Local] Failed to purge journal entries:", journalErr);
      }
      console.log(`[LFS-Local] clear-sales-data completed for property ${propertyId}: ${result.deleted} records deleted`);
      res.json({ ok: true, deleted: result.deleted, propertyId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("[LFS-Local] clear-sales-data failed:", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/sync/clear-status", async (req: Request, res: Response) => {
    try {
      const propertyId = (req.query.propertyId as string) || process.env.LFS_PROPERTY_ID;
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId is required" });
      }
      const cloudUrl = process.env.CLOUD_URL || process.env.LFS_CLOUD_URL;
      const apiKey = process.env.LFS_API_KEY;
      if (cloudUrl && apiKey) {
        try {
          const resp = await fetch(`${cloudUrl}/api/lfs/sync/clear-status?propertyId=${propertyId}`, {
            headers: { "x-lfs-api-key": apiKey },
            signal: AbortSignal.timeout(5000),
          });
          if (resp.ok) {
            const data = await resp.json();
            return res.json(data);
          }
        } catch (_proxyErr) {}
      }
      res.json({ ok: true, status: null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });
}

const idRemapCache = new Map<string, string>();

async function ensureCloudRemapTable(): Promise<void> {
  try {
    await storage.ensureLfsRemapTable();
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
  "terminal_devices", "print_agents", "cash_drawers", "rvc_counters",
  "online_order_sources",
]);

async function recordLfsSyncActivity(req: Request, syncType: string, direction: string, recordCount: number, status: string, errorMessage?: string) {
  try {
    const propertyId = (req as LfsAuthenticatedRequest).lfsPropertyId || req.query.propertyId as string || req.body?.propertyId;
    if (!propertyId) return;

    const lfsIp = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "";
    const lfsVersion = req.headers["x-lfs-version"] as string || undefined;

    await storage.createLfsSyncLog({
      propertyId,
      syncType,
      direction,
      recordCount,
      status,
      errorMessage: errorMessage || null,
      lfsIp: lfsIp.split(",")[0].trim(),
      lfsVersion: lfsVersion || null,
    });

    await storage.updateLfsConfiguration(propertyId, {
      lastSyncAt: new Date(),
      lastSyncIp: lfsIp.split(",")[0].trim(),
      lfsVersion: lfsVersion || null,
      syncStatus: status === "success" ? "connected" : "error",
    });
  } catch (e) {
    console.error("[LFS] Failed to record sync activity:", e);
  }
}

const salesClearFence = new Map<string, string>();

async function ensureSalesClearFenceTable(): Promise<void> {
  try {
    const { db: dbRef } = await import("./db");
    const { sql: sqlDrizzle } = await import("drizzle-orm");
    await dbRef.execute(sqlDrizzle`
      CREATE TABLE IF NOT EXISTS sales_clear_fence (
        property_id TEXT PRIMARY KEY,
        cleared_at TIMESTAMP NOT NULL DEFAULT NOW(),
        cleared_by TEXT,
        lfs_acknowledged BOOLEAN DEFAULT FALSE,
        lfs_ack_at TIMESTAMP
      )
    `);
    const rows = await dbRef.execute(sqlDrizzle`SELECT property_id, cleared_at FROM sales_clear_fence`);
    for (const row of (rows.rows || []) as Record<string, unknown>[]) {
      salesClearFence.set(row.property_id as string, (row.cleared_at as Date).toISOString());
    }
  } catch (e) {
    console.error("[LFS] Failed to create sales_clear_fence table:", e);
  }
}

export async function recordSalesClear(propertyId: string, clearedBy?: string): Promise<void> {
  try {
    const { db: dbRef } = await import("./db");
    const { sql: sqlDrizzle } = await import("drizzle-orm");
    await ensureSalesClearFenceTable();
    const now = new Date().toISOString();
    await dbRef.execute(
      sqlDrizzle`INSERT INTO sales_clear_fence (property_id, cleared_at, cleared_by, lfs_acknowledged)
        VALUES (${propertyId}, NOW(), ${clearedBy || null}, FALSE)
        ON CONFLICT (property_id) DO UPDATE SET cleared_at = NOW(), cleared_by = ${clearedBy || null}, lfs_acknowledged = FALSE, lfs_ack_at = NULL`
    );
    salesClearFence.set(propertyId, now);
  } catch (e) {
    console.error("[LFS] Failed to record sales clear fence:", e);
  }
}

export async function ackSalesClear(propertyId: string): Promise<void> {
  try {
    const { db: dbRef } = await import("./db");
    const { sql: sqlDrizzle } = await import("drizzle-orm");
    await dbRef.execute(
      sqlDrizzle`UPDATE sales_clear_fence SET lfs_acknowledged = TRUE, lfs_ack_at = NOW() WHERE property_id = ${propertyId}`
    );
  } catch (e) {
    console.error("[LFS] Failed to ack sales clear:", e);
  }
}

export async function getSalesClearStatus(propertyId: string): Promise<{ clearedAt: string | null; lfsAcknowledged: boolean; lfsAckAt: string | null } | null> {
  try {
    const { db: dbRef } = await import("./db");
    const { sql: sqlDrizzle } = await import("drizzle-orm");
    await ensureSalesClearFenceTable();
    const result = await dbRef.execute(
      sqlDrizzle`SELECT cleared_at, lfs_acknowledged, lfs_ack_at FROM sales_clear_fence WHERE property_id = ${propertyId}`
    );
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as Record<string, unknown>;
      return {
        clearedAt: row.cleared_at ? (row.cleared_at as Date).toISOString() : null,
        lfsAcknowledged: row.lfs_acknowledged as boolean,
        lfsAckAt: row.lfs_ack_at ? (row.lfs_ack_at as Date).toISOString() : null,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function isTransactionBeforeClearFence(propertyId: string | undefined, createdAt: string | undefined): boolean {
  if (!propertyId || !createdAt) return false;
  const fenceTime = salesClearFence.get(propertyId);
  if (!fenceTime) return false;
  try {
    return new Date(createdAt).getTime() < new Date(fenceTime).getTime();
  } catch {
    return false;
  }
}

function registerLfsCloudRoutes(app: Express) {
  ensureCloudRemapTable().then(() => { remapTableReady = true; console.log("[LFS Sync] lfs_id_remap table ready"); }).catch((e) => { console.error("[LFS Sync] Failed to ensure remap table:", e); });
  ensureSalesClearFenceTable().catch(() => {});

  app.get("/api/lfs/sync/pending-commands", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const propertyId = scopedPropertyId || (req.query.propertyId as string);
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId is required" });
      }
      const commands = await fetchPendingLfsCommands(propertyId);
      res.json({ ok: true, commands });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/ack-commands", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const propertyId = scopedPropertyId || req.body?.propertyId;
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId is required" });
      }
      const commandIds = req.body?.commandIds as number[] | undefined;
      if (!commandIds || !Array.isArray(commandIds) || commandIds.length === 0) {
        return res.status(400).json({ error: "commandIds array is required" });
      }
      await ackLfsCommands(commandIds, propertyId);
      res.json({ ok: true, acknowledged: commandIds.length });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/ack-clear-sales", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const propertyId = scopedPropertyId || req.body?.propertyId;
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId is required" });
      }
      await ackSalesClear(propertyId);
      res.json({ ok: true, acknowledged: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/sync/clear-status", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const propertyId = scopedPropertyId || (req.query.propertyId as string);
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId is required" });
      }
      const status = await getSalesClearStatus(propertyId);
      res.json({ ok: true, status });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/sync/latest-version", requireLfsApiKey, async (_req: Request, res: Response) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
      const version = pkg.version || "1.0.0";
      const updateUrl = process.env.LFS_UPDATE_DOWNLOAD_URL || null;
      const checksum = process.env.LFS_UPDATE_CHECKSUM || null;
      const releaseNotes = process.env.LFS_UPDATE_RELEASE_NOTES || null;
      res.json({ version, downloadUrl: updateUrl, checksum, releaseNotes });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/sync/pending-settlements", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const propertyId = scopedPropertyId;
      const payments = await storage.getPaymentsByStatus("pending_settlement", propertyId || undefined);
      res.json({ count: payments.length, payments });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/sync/:tableName", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const tableName = req.params.tableName;
      if (!ALLOWED_CONFIG_TABLES.has(tableName)) {
        return res.status(400).json({ error: `Table '${tableName}' is not allowed for config sync` });
      }
      const propertyId = enforceLfsPropertyScope(req, res);
      if (propertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const since = req.query.since as string | undefined;

      const data = await storage.getConfigTableData(tableName, propertyId || undefined, undefined, since);
      res.json(data);
      recordLfsSyncActivity(req, `config-download:${tableName}`, "down", data.rows.length, "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[LFS Sync] Config export error:`, msg);
      recordLfsSyncActivity(req, "config-download", "down", 0, "error", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/transaction-up", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;

      const entry = req.body;
      if (!entry || !(entry.entity_type || entry.entityType) || !entry.payload) {
        return res.status(400).json({ error: "Missing required fields: entity_type and payload" });
      }

      const txCreatedAt = entry.created_at || entry.createdAt;
      if (isTransactionBeforeClearFence(scopedPropertyId || undefined, txCreatedAt)) {
        return res.json({ ok: true, result: { skipped: true, reason: "transaction predates sales clear — discarded" } });
      }

      const entityType = entry.entity_type || entry.entityType;
      const operationType = entry.operation_type || entry.operationType;
      const rawPayload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
      const offlineTransactionId = entry.offline_transaction_id || entry.offlineTransactionId;
      const entityId = entry.entity_id || entry.entityId;

      const payload = (operationType === "update" || operationType === "delete") && entityId && !rawPayload.id
        ? { ...rawPayload, id: entityId }
        : rawPayload;

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
      recordLfsSyncActivity(req, `transaction-up:${entityType}`, "up", 1, "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("[LFS Sync] Transaction upload error:", msg);
      recordLfsSyncActivity(req, "transaction-up", "up", 0, "error", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/batch-up", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;

      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        return res.status(400).json({ error: "entries must be an array" });
      }

      const sorted = sortByDependency(entries);
      const results = [];
      for (const entry of sorted) {
        try {
          const txCreatedAt = entry.created_at || entry.createdAt;
          if (isTransactionBeforeClearFence(scopedPropertyId || undefined, txCreatedAt)) {
            results.push({ id: entry.id, ok: true, result: { skipped: true, reason: "transaction predates sales clear" } });
            continue;
          }

          const entityType = entry.entity_type || entry.entityType;
          const operationType = entry.operation_type || entry.operationType;
          const rawPayload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
          const offlineTransactionId = entry.offline_transaction_id || entry.offlineTransactionId;
          const entityId = entry.entity_id || entry.entityId;

          const payload = (operationType === "update" || operationType === "delete") && entityId && !rawPayload.id
            ? { ...rawPayload, id: entityId }
            : rawPayload;

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

      const successes = results.filter(r => r.ok).length;
      const failures = results.filter(r => !r.ok).length;
      res.json({ ok: true, results });
      recordLfsSyncActivity(req, "batch-up", "up", successes, failures > 0 ? "error" : "success", failures > 0 ? `${failures} of ${results.length} entries failed` : undefined);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      recordLfsSyncActivity(req, "batch-up", "up", 0, "error", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/sync/clear-remap-cache", requireLfsApiKey, async (_req: Request, res: Response) => {
    idRemapCache.clear();
    res.json({ ok: true });
  });


  app.post("/api/lfs/sync/verify-processor-settlement", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;

      const { transactionId, amount, tenderId } = req.body;
      if (!transactionId) {
        return res.status(400).json({ error: "transactionId is required" });
      }

      try {
        const { createPaymentAdapter, resolveCredentials, getRequiredCredentialKeys } = await import("./payments/registry");

        if (tenderId) {
          const tenderData = await storage.getTenderWithGateway(tenderId);
          if (tenderData?.tender?.gatewayType) {
            const { tender, gatewayConfig: config } = tenderData;

            const requiredKeys = getRequiredCredentialKeys(tender.gatewayType);
            const prefix = config?.envKeyPrefix || tender.gatewayType.toUpperCase();
            const dbCreds = config?.encryptedCredentials ? JSON.parse(config.encryptedCredentials) : {};
            const credentials = resolveCredentials(prefix, requiredKeys, dbCreds);
            const environment = config?.environment === "production" ? "production" : "sandbox";

            const adapter = createPaymentAdapter(tender.gatewayType, credentials, {}, environment);
            if (adapter && typeof (adapter as unknown as Record<string, unknown>).verifyTransaction === "function") {
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
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;

      const { paymentId, offlineTransactionId, settlementTransactionId, settlementStatus, amount, checkId, tenderId } = req.body;
      if (!paymentId && !offlineTransactionId) {
        return res.status(400).json({ error: "paymentId or offlineTransactionId is required" });
      }

      let payment;
      if (offlineTransactionId) {
        const foundId = await storage.findEntityByOfflineTransactionId("check_payment", offlineTransactionId);
        if (foundId) payment = await storage.getPaymentById(foundId);
      }
      if (!payment && paymentId) {
        payment = await storage.getPaymentById(paymentId);
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
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const propertyId = scopedPropertyId;
      const failedPayments = await storage.getPaymentsByStatus("settlement_failed", propertyId || undefined);
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
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const { settlements } = req.body;
      const propertyId = scopedPropertyId || req.body.propertyId;

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
          const payment = await storage.getPaymentById(paymentId);

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

  app.post("/api/lfs/sync/clear-sales-data", requireLfsApiKey, async (req: Request, res: Response) => {
    try {
      const scopedPropertyId = enforceLfsPropertyScope(req, res);
      if (scopedPropertyId === null && (req as LfsAuthenticatedRequest).lfsPropertyId) return;
      const propertyId = scopedPropertyId || req.body.propertyId;
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId is required" });
      }
      const result = await storage.clearSalesData(propertyId);
      const { db: dbRef } = await import("./db");
      const { sql: sqlDrizzle } = await import("drizzle-orm");
      try {
        await dbRef.execute(
          sqlDrizzle`DELETE FROM transaction_journal WHERE property_id = ${propertyId}`
        );
      } catch (journalErr) {
        console.error("[LFS] Failed to purge journal entries:", journalErr);
      }
      await ackSalesClear(propertyId);
      recordLfsSyncActivity(req, "clear-sales-data", "down", 1, "success");
      res.json({ ok: true, deleted: result.deleted, propertyId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      recordLfsSyncActivity(req, "clear-sales-data", "down", 0, "error", msg);
      res.status(500).json({ error: msg });
    }
  });

}

async function storeDurableRemap(localId: string, cloudId: string): Promise<void> {
  if (!remapTableReady) return;
  try {
    await storage.storeLfsIdRemap(localId, cloudId);
  } catch { /* table may not exist, non-critical */ }
}

async function loadDurableRemap(localId: string): Promise<string | null> {
  if (!remapTableReady) return null;
  try {
    return await storage.loadLfsIdRemap(localId);
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
  try {
    return await storage.findEntityByOfflineTransactionId(entityType, offlineTransactionId);
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

async function remapSyncedForeignKeys(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = { ...payload };
  const fkFields = ["roundId", "round_id", "checkPaymentId", "check_payment_id", "paymentTransactionId", "payment_transaction_id", "originalCheckId", "original_check_id"];
  for (const field of fkFields) {
    const val = result[field];
    if (typeof val === "string" && val.length > 0) {
      const cloudId = await resolveCloudId(val);
      if (cloudId !== val) {
        result[field] = cloudId;
      }
    }
  }
  return result;
}

const IMMUTABLE_SYNC_FIELDS = new Set([
  "id", "offlineTransactionId", "createdAt", "updatedAt",
]);

function cleanUpdatePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (IMMUTABLE_SYNC_FIELDS.has(k)) continue;
    result[k] = v;
  }
  return result;
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
        if (!insertData.status) insertData.status = "open";
        if (!insertData.subtotal) insertData.subtotal = "0";
        if (!insertData.taxTotal) insertData.taxTotal = "0";
        if (!insertData.total) insertData.total = "0";
        const created = await storage.createCheck(insertData as Parameters<typeof storage.createCheck>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const id = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(id);
        const updateData = cleanUpdatePayload(dataWithOfflineId);
        if (Object.keys(updateData).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updateCheck(cloudId, updateData as Parameters<typeof storage.updateCheck>[1]);
      } else if (operationType === "delete") {
        const id = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(id);
        return await storage.deleteCheck(cloudId);
      }
      throw new Error(`Unsupported operation for check: ${operationType}`);
    }
    case "check_item": {
      let remapped = await remapCheckIdAsync(dataWithOfflineId);
      remapped = await remapSyncedForeignKeys(remapped);
      if (operationType === "create") {
        const { id: localId, ...insertData } = remapped;
        if (!insertData.menuItemName && insertData.menuItemId) {
          try {
            const menuItem = await storage.getMenuItem(insertData.menuItemId as string);
            if (menuItem) insertData.menuItemName = menuItem.name;
          } catch (_e) { /* best effort */ }
        }
        if (!insertData.menuItemName) insertData.menuItemName = "Unknown Item";
        if (!insertData.itemStatus) insertData.itemStatus = "ordered";
        if (insertData.quantity === undefined) insertData.quantity = 1;
        const created = await storage.createCheckItem(insertData as Parameters<typeof storage.createCheckItem>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const rawId = remapped.id as string;
        const cloudId = await resolveCloudId(rawId);
        const updateData = cleanUpdatePayload(remapped);
        const remappedUpdate = await remapSyncedForeignKeys(updateData);
        if (Object.keys(remappedUpdate).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updateCheckItem(cloudId, remappedUpdate as Parameters<typeof storage.updateCheckItem>[1]);
      } else if (operationType === "delete") {
        const rawId = remapped.id as string;
        const cloudId = await resolveCloudId(rawId);
        return await storage.deleteCheckItem(cloudId);
      }
      throw new Error(`Unsupported operation for check_item: ${operationType}`);
    }
    case "check_payment": {
      let remapped = await remapCheckIdAsync(dataWithOfflineId);
      remapped = await remapSyncedForeignKeys(remapped);
      if (operationType === "create") {
        const { id: localId, ...insertData } = remapped;
        if (!insertData.tenderName && insertData.tenderId) {
          try {
            const tender = await storage.getTender(insertData.tenderId as string);
            if (tender) insertData.tenderName = tender.name;
          } catch (_e) { /* best effort */ }
        }
        if (!insertData.tenderName) insertData.tenderName = "Unknown";
        if (!insertData.paymentStatus) insertData.paymentStatus = "completed";
        const created = await storage.createPayment(insertData as Parameters<typeof storage.createPayment>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const id = remapped.id as string;
        const cloudId = await resolveCloudId(id);
        const updateData = cleanUpdatePayload(remapped);
        if (Object.keys(updateData).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
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
        if (!insertData.discountName && insertData.discountId) {
          try {
            const discount = await storage.getDiscount(insertData.discountId as string);
            if (discount) insertData.discountName = discount.name;
          } catch (_e) { /* best effort */ }
        }
        if (!insertData.discountName) insertData.discountName = "Unknown Discount";
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
        if (!insertData.nameAtSale && insertData.serviceChargeId) {
          try {
            const sc = await storage.getServiceCharge(insertData.serviceChargeId as string);
            if (sc) insertData.nameAtSale = sc.name;
          } catch (_e) { /* best effort */ }
        }
        if (!insertData.nameAtSale) insertData.nameAtSale = "Unknown Service Charge";
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
    case "refund": {
      if (operationType === "create") {
        const refundPayload = dataWithOfflineId.refund as Record<string, unknown> | undefined;
        const itemsPayload = (dataWithOfflineId.items || []) as Array<Record<string, unknown>>;
        const paymentsPayload = (dataWithOfflineId.payments || []) as Array<Record<string, unknown>>;
        const refundData = refundPayload || dataWithOfflineId;
        const { id: localId, ...insertData } = refundData;
        const remappedRefund = await remapCheckIdAsync(insertData as Record<string, unknown>);
        if (remappedRefund.originalCheckId) {
          const cloudCheckId = await resolveCloudId(remappedRefund.originalCheckId as string);
          remappedRefund.originalCheckId = cloudCheckId;
        }
        const remappedItems = [];
        for (const item of itemsPayload) {
          const { id: _itemId, refundId: _refundId, ...itemData } = item;
          remappedItems.push(itemData);
        }
        const remappedPayments = [];
        for (const payment of paymentsPayload) {
          const { id: _paymentId, refundId: _refundId, ...paymentData } = payment;
          remappedPayments.push(paymentData);
        }
        const created = await storage.createRefund(
          remappedRefund as Parameters<typeof storage.createRefund>[0],
          remappedItems as Parameters<typeof storage.createRefund>[1],
          remappedPayments as Parameters<typeof storage.createRefund>[2],
        );
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      }
      throw new Error(`Unsupported operation for refund: ${operationType}`);
    }
    case "time_punch": {
      if (operationType === "create") {
        const { id: localId, ...insertData } = dataWithOfflineId;
        if (!insertData.source) insertData.source = "pos";
        if (!insertData.actualTimestamp) insertData.actualTimestamp = new Date();
        const created = await storage.createTimePunch(insertData as Parameters<typeof storage.createTimePunch>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const id = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(id);
        const updateData = cleanUpdatePayload(dataWithOfflineId);
        if (Object.keys(updateData).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updateTimePunch(cloudId, updateData as Parameters<typeof storage.updateTimePunch>[1]);
      }
      throw new Error(`Unsupported operation for time_punch: ${operationType}`);
    }
    case "cash_transaction": {
      if (operationType === "create") {
        let remapped = await remapCheckIdAsync(dataWithOfflineId);
        remapped = await remapSyncedForeignKeys(remapped);
        const { id: localId, ...insertData } = remapped;
        const created = await storage.createCashTransaction(insertData as Parameters<typeof storage.createCashTransaction>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      }
      throw new Error(`Unsupported operation for cash_transaction: ${operationType}`);
    }
    case "inventory_transaction": {
      if (operationType === "create") {
        const { id: localId, ...insertData } = dataWithOfflineId;
        const created = await storage.createInventoryTransaction(insertData as Parameters<typeof storage.createInventoryTransaction>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      }
      throw new Error(`Unsupported operation for inventory_transaction: ${operationType}`);
    }
    case "kds_ticket": {
      let remapped = await remapCheckIdAsync(dataWithOfflineId);
      remapped = await remapSyncedForeignKeys(remapped);
      if (operationType === "create") {
        const { id: localId, ...insertData } = remapped;
        if (!insertData.status) insertData.status = "active";
        const created = await storage.createKdsTicket(insertData as Parameters<typeof storage.createKdsTicket>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const rawId = remapped.id as string;
        const cloudId = await resolveCloudId(rawId);
        const updateData = cleanUpdatePayload(remapped);
        if (Object.keys(updateData).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updateKdsTicket(cloudId, updateData as Parameters<typeof storage.updateKdsTicket>[1]);
      }
      throw new Error(`Unsupported operation for kds_ticket: ${operationType}`);
    }
    case "kds_ticket_item": {
      const kdsTicketId = await resolveCloudId(dataWithOfflineId.kdsTicketId as string);
      const checkItemId = await resolveCloudId(dataWithOfflineId.checkItemId as string);
      if (operationType === "create") {
        await storage.createKdsTicketItem(kdsTicketId, checkItemId);
        return { kdsTicketId, checkItemId };
      } else if (operationType === "update") {
        return { kdsTicketId, checkItemId, skipped: true, reason: "kds_ticket_item has no updatable fields" };
      } else if (operationType === "delete") {
        await storage.removeKdsTicketItem(kdsTicketId, checkItemId);
        return { kdsTicketId, checkItemId, deleted: true };
      }
      throw new Error(`Unsupported operation for kds_ticket_item: ${operationType}`);
    }
    case "kds_item": {
      if (operationType === "update") {
        const rawId = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(rawId);
        const action = dataWithOfflineId.action as string;
        if (action === "ready") {
          await storage.markKdsItemReady(cloudId);
        } else if (action === "unready") {
          await storage.unmarkKdsItemReady(cloudId);
        }
        return { id: cloudId, action };
      }
      throw new Error(`Unsupported operation for kds_item: ${operationType}`);
    }
    case "check_lock": {
      if (operationType === "create") {
        return { skipped: true, reason: "check_lock is local-only state" };
      } else if (operationType === "delete") {
        return { skipped: true, reason: "check_lock is local-only state" };
      }
      return { skipped: true, reason: "check_lock is local-only state" };
    }
    case "payment_transaction": {
      if (operationType === "create") {
        const { id: localId, ...insertData } = dataWithOfflineId;
        const created = await storage.createPaymentTransaction(insertData as Parameters<typeof storage.createPaymentTransaction>[0]);
        if (typeof localId === "string") {
          idRemapCache.set(localId, created.id);
          await storeDurableRemap(localId, created.id);
        }
        return created;
      } else if (operationType === "update") {
        const rawId = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(rawId);
        const updateData = cleanUpdatePayload(dataWithOfflineId);
        const remappedUpdate = await remapSyncedForeignKeys(updateData);
        if (Object.keys(remappedUpdate).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updatePaymentTransaction(cloudId, remappedUpdate as Parameters<typeof storage.updatePaymentTransaction>[1]);
      }
      throw new Error(`Unsupported operation for payment_transaction: ${operationType}`);
    }
    case "item_availability": {
      if (operationType === "update") {
        const menuItemId = dataWithOfflineId.menuItemId as string;
        const propId = dataWithOfflineId.propertyId as string;
        const quantity = (dataWithOfflineId.quantity as number) || 1;
        const action = dataWithOfflineId.action as string;
        if (action === "restore") {
          await storage.restoreItemAvailability(menuItemId, propId, quantity);
        }
        return { menuItemId, propertyId: propId, action, quantity };
      }
      throw new Error(`Unsupported operation for item_availability: ${operationType}`);
    }
    case "gift_card": {
      if (operationType === "update") {
        const rawId = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(rawId);
        const updateData = cleanUpdatePayload(dataWithOfflineId);
        if (Object.keys(updateData).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updateGiftCard(cloudId, updateData);
      }
      throw new Error(`Unsupported operation for gift_card: ${operationType}`);
    }
    case "loyalty_member": {
      if (operationType === "update") {
        const rawId = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(rawId);
        const updateData = cleanUpdatePayload(dataWithOfflineId);
        if (Object.keys(updateData).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updateLoyaltyMember(cloudId, updateData);
      }
      throw new Error(`Unsupported operation for loyalty_member: ${operationType}`);
    }
    case "loyalty_enrollment": {
      if (operationType === "update") {
        const rawId = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(rawId);
        const updateData = cleanUpdatePayload(dataWithOfflineId);
        if (Object.keys(updateData).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updateLoyaltyMember(cloudId, updateData);
      }
      throw new Error(`Unsupported operation for loyalty_enrollment: ${operationType}`);
    }
    case "online_order": {
      if (operationType === "update") {
        const rawId = dataWithOfflineId.id as string;
        const cloudId = await resolveCloudId(rawId);
        const updateData = cleanUpdatePayload(dataWithOfflineId);
        if (Object.keys(updateData).length === 0) {
          return { id: cloudId, skipped: true, reason: "empty update payload" };
        }
        return await storage.updateOnlineOrder(cloudId, updateData);
      }
      throw new Error(`Unsupported operation for online_order: ${operationType}`);
    }
    case "offline_order_queue": {
      if (operationType === "create") {
        return { skipped: true, reason: "offline_order_queue synced via dedicated mechanism" };
      }
      return { skipped: true, reason: "offline_order_queue synced via dedicated mechanism" };
    }
    case "check_merge":
    case "check_split": {
      return { skipped: true, reason: "compound container - child entries carry actual mutations" };
    }
    default:
      throw new Error(`Unknown entity type for sync: ${entityType}`);
  }
}

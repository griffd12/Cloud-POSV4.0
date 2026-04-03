import type { Express, Request, Response } from "express";
import express from "express";
import { isLocalMode } from "./db";
import { getConfigSyncService, restartConfigSync } from "./config-sync";
import { getCloudSyncStatus } from "./cloud-sync";
import { getJournalStats } from "./transaction-journal";
import path from "path";
import fs from "fs";

function resolveLfsBaseDir(): string {
  if (typeof __dirname === 'undefined') return process.cwd();
  if (fs.existsSync(path.join(__dirname, "lfs-admin")) || fs.existsSync(path.join(__dirname, ".env"))) {
    return __dirname;
  }
  const parent = path.resolve(__dirname, "..");
  if (fs.existsSync(path.join(parent, "lfs-admin")) || fs.existsSync(path.join(parent, ".env"))) {
    return parent;
  }
  return process.cwd();
}
const LFS_BASE_DIR = resolveLfsBaseDir();

function getLfsVersion(): string {
  try {
    const pkgPath = require.resolve("../package.json");
    const pkg = JSON.parse(require("fs").readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    try {
      const localPkg = path.resolve(LFS_BASE_DIR, "package.json");
      if (fs.existsSync(localPkg)) {
        const pkg = JSON.parse(fs.readFileSync(localPkg, "utf8"));
        return pkg.version || "0.0.0";
      }
    } catch {}
  }
  return "0.0.0";
}

const LFS_VERSION = getLfsVersion();

let serverLogBuffer: string[] = [];
const MAX_LOG_LINES = 500;

export function captureLog(message: string) {
  const ts = new Date().toISOString();
  serverLogBuffer.push(`${ts} ${message}`);
  if (serverLogBuffer.length > MAX_LOG_LINES) {
    serverLogBuffer = serverLogBuffer.slice(-MAX_LOG_LINES);
  }
}

const activeSessions = new Set<string>();

function createSessionToken(): string {
  const crypto = require("crypto");
  const token = crypto.randomBytes(32).toString("hex");
  activeSessions.add(token);
  return token;
}

function invalidateSession(token: string): void {
  activeSessions.delete(token);
}

export function isValidAdminSession(token: string): boolean {
  return activeSessions.has(token);
}

function buildCookieHeader(token: string): string {
  const parts = [
    `lfs_admin_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=86400",
  ];
  return parts.join("; ");
}

function lfsAdminAuth(req: Request, res: Response, next: Function) {
  const apiKey = process.env.LFS_API_KEY;
  if (!apiKey) {
    res.status(401).json({ error: "Unauthorized: LFS_API_KEY not configured" });
    return;
  }

  const provided = req.headers["x-lfs-admin-key"];
  if (provided === apiKey) return next();

  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.match(/lfs_admin_session=([^;]+)/);
    if (match && activeSessions.has(match[1])) return next();
  }

  res.status(401).json({ error: "Unauthorized" });
}

export function registerLfsAdminRoutes(app: Express) {
  if (!isLocalMode) return;

  app.get("/api/lfs/admin/setup-status", (_req: Request, res: Response) => {
    const hasApiKey = !!process.env.LFS_API_KEY;
    const hasCloudUrl = !!process.env.LFS_CLOUD_URL;
    res.json({ configured: hasApiKey, hasCloudUrl, needsSetup: !hasApiKey });
  });

  app.get("/api/lfs/sync-status", (_req: Request, res: Response) => {
    const syncService = getConfigSyncService();
    if (!syncService) {
      res.json({ syncing: false, syncCount: 0, lastSyncAt: null, lastSyncError: null, ready: false });
      return;
    }
    const status = syncService.getStatus();
    res.json({
      syncing: status.isSyncing,
      syncCount: status.syncCount,
      lastSyncAt: status.lastSyncAt,
      lastSyncError: status.lastSyncError,
      ready: status.syncCount > 0 && !status.isSyncing && !status.lastSyncError,
    });
  });

  app.get("/api/lfs/device-config", async (_req: Request, res: Response) => {
    const cloudUrl = process.env.LFS_CLOUD_URL || "";
    const propertyId = process.env.LFS_PROPERTY_ID || "";
    const configured = !!(process.env.LFS_API_KEY && cloudUrl && propertyId);

    if (!configured) {
      res.json({ isLfs: true, configured: false });
      return;
    }

    try {
      const { storage } = await import("./storage");
      const allEnterprises = await storage.getEnterprises();
      const enterprise = allEnterprises[0];
      const allProperties = await storage.getProperties();
      const property = allProperties.find((p: { id: string }) => p.id === propertyId) || allProperties[0];

      res.json({
        isLfs: true,
        configured: true,
        cloudUrl,
        propertyId,
        enterpriseId: enterprise?.id || "",
        enterpriseCode: enterprise?.code || "",
        enterpriseName: enterprise?.name || "",
        propertyName: property?.name || "",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.json({ isLfs: true, configured: true, cloudUrl, propertyId, error: msg });
    }
  });

  app.post("/api/lfs/first-run/validate-cloud", async (req: Request, res: Response) => {
    const { cloudUrl, enterpriseCode } = req.body;
    if (!cloudUrl || !enterpriseCode) {
      res.status(400).json({ error: "cloudUrl and enterpriseCode are required" });
      return;
    }
    try {
      const response = await fetch(`${cloudUrl}/api/enterprises/by-code/${enterpriseCode.toUpperCase()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        if (response.status === 404) {
          res.json({ ok: false, error: `Enterprise "${enterpriseCode}" not found` });
        } else {
          res.json({ ok: false, error: `Server returned ${response.status}` });
        }
        return;
      }
      const enterprise = await response.json();
      res.json({ ok: true, enterprise });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      res.json({ ok: false, error: msg });
    }
  });

  app.post("/api/lfs/first-run/auth", async (req: Request, res: Response) => {
    const { cloudUrl, email, password } = req.body;
    if (!cloudUrl || !email || !password) {
      res.status(400).json({ error: "cloudUrl, email, and password are required" });
      return;
    }
    try {
      const response = await fetch(`${cloudUrl}/api/emc/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        res.json({ ok: false, error: (data as { message?: string }).message || "Authentication failed" });
        return;
      }
      const data = await response.json();
      res.json({ ok: true, user: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      res.json({ ok: false, error: msg });
    }
  });

  app.post("/api/lfs/first-run/properties", async (req: Request, res: Response) => {
    const { cloudUrl, enterpriseId } = req.body;
    if (!cloudUrl || !enterpriseId) {
      res.status(400).json({ error: "cloudUrl and enterpriseId are required" });
      return;
    }
    try {
      const response = await fetch(`${cloudUrl}/api/properties`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        res.json({ ok: false, error: `Failed to fetch properties: ${response.status}` });
        return;
      }
      const properties = await response.json();
      const filtered = (properties as Array<{ enterpriseId?: string }>).filter(
        (p) => p.enterpriseId === enterpriseId
      );
      res.json({ ok: true, properties: filtered });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      res.json({ ok: false, error: msg });
    }
  });

  app.post("/api/lfs/first-run/save", async (req: Request, res: Response) => {
    if (process.env.LFS_API_KEY) {
      res.status(403).json({ error: "Already configured. Use admin dashboard instead." });
      return;
    }
    const { cloudUrl, propertyId, sessionToken } = req.body;
    if (!cloudUrl || !propertyId) {
      res.status(400).json({ error: "cloudUrl and propertyId are required" });
      return;
    }
    if (!sessionToken) {
      res.status(400).json({ error: "sessionToken is required. Please re-authenticate with the cloud." });
      return;
    }
    try {
      const keyRes = await fetch(`${cloudUrl}/api/emc/lfs-config/${propertyId}/generate-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-emc-session": sessionToken,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!keyRes.ok) {
        const errData = await keyRes.json().catch(() => ({}));
        const errMsg = (errData as { message?: string }).message || `Cloud returned ${keyRes.status}`;
        captureLog(`[admin] Failed to register API key with cloud: ${errMsg}`);
        if (keyRes.status === 401) {
          res.status(401).json({ error: "Session expired. Please go back and re-authenticate." });
        } else {
          res.status(500).json({ error: `Failed to register API key with cloud: ${errMsg}` });
        }
        return;
      }
      const keyData = await keyRes.json() as { rawKey?: string };
      if (!keyData.rawKey) {
        res.status(500).json({ error: "Cloud did not return an API key" });
        return;
      }
      const apiKey = keyData.rawKey;
      captureLog(`[admin] API key registered with cloud for property ${propertyId}`);

      const envPath = path.join(LFS_BASE_DIR, ".env");
      let envContent = "";
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf8");
      }

      const updates: Record<string, string> = {
        LFS_CLOUD_URL: cloudUrl,
        LFS_PROPERTY_ID: propertyId,
        LFS_API_KEY: apiKey,
        DB_MODE: "local",
        PORT: process.env.PORT || "3001",
        LFS_ADMIN_PORT: process.env.LFS_ADMIN_PORT || "3002",
      };

      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, "m");
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
        process.env[key] = value;
      }

      fs.writeFileSync(envPath, envContent.trim() + "\n", "utf8");
      captureLog(`[admin] First-run setup completed: ${cloudUrl} / property ${propertyId}`);

      res.json({ ok: true, apiKey, message: "Configuration saved. Syncing data from cloud..." });

      restartConfigSync().then(async () => {
        captureLog(`[admin] Initial config sync completed after first-run setup`);
        try {
          const { startCloudSyncProcess } = await import("./cloud-sync");
          startCloudSyncProcess();
          captureLog(`[admin] Cloud sync process started after first-run setup`);
        } catch (csErr: unknown) {
          const csMsg = csErr instanceof Error ? csErr.message : "Unknown error";
          captureLog(`[admin] Failed to start cloud sync after first-run: ${csMsg}`);
        }
      }).catch((err: unknown) => {
        const syncErr = err instanceof Error ? err.message : "Unknown sync error";
        captureLog(`[admin] Config sync failed after first-run: ${syncErr}`);
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/admin/setup", (req: Request, res: Response) => {
    if (process.env.LFS_API_KEY) {
      res.status(403).json({ error: "Already configured. Use login instead." });
      return;
    }

    const { apiKey, cloudUrl, propertyId } = req.body;
    if (!apiKey || apiKey.length < 16) {
      res.status(400).json({ error: "API key must be at least 16 characters" });
      return;
    }

    try {
      const envPath = path.join(LFS_BASE_DIR, ".env");
      let envContent = "";
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf8");
      }

      const updates: Record<string, string> = { LFS_API_KEY: apiKey };
      if (cloudUrl) updates.LFS_CLOUD_URL = cloudUrl;
      if (propertyId) updates.LFS_PROPERTY_ID = propertyId;

      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, "m");
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
        process.env[key] = value;
      }

      fs.writeFileSync(envPath, envContent.trim() + "\n", "utf8");
      captureLog(`[admin] Initial setup completed`);

      const token = createSessionToken();
      res.setHeader("Set-Cookie", buildCookieHeader(token));
      res.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/admin/login", async (req: Request, res: Response) => {
    const { apiKey, email, password } = req.body;
    const expected = process.env.LFS_API_KEY;
    if (!expected) {
      res.status(401).json({ error: "LFS_API_KEY not configured. Use /api/lfs/admin/setup first.", needsSetup: true });
      return;
    }

    if (apiKey && apiKey === expected) {
      const token = createSessionToken();
      res.setHeader("Set-Cookie", buildCookieHeader(token));
      res.json({ ok: true });
      return;
    }

    if (email && password) {
      const cloudUrl = process.env.LFS_CLOUD_URL;
      if (!cloudUrl) {
        res.status(401).json({ error: "Cloud URL not configured" });
        return;
      }
      try {
        const authRes = await fetch(`${cloudUrl}/api/emc/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          signal: AbortSignal.timeout(8000),
        });
        if (authRes.ok) {
          const data = await authRes.json() as { user?: { accessLevel?: string; enterpriseId?: string; propertyId?: string } };
          const level = data.user?.accessLevel || "";
          if (level === "system_admin" || level === "enterprise_admin" || level === "property_admin" || level === "property_manager") {
            if (level === "system_admin") {
              const token = createSessionToken();
              res.setHeader("Set-Cookie", buildCookieHeader(token));
              captureLog(`[admin] EMC credential login by ${email} (${level} — full access)`);
              res.json({ ok: true });
              return;
            }

            const lfsPropertyId = process.env.LFS_PROPERTY_ID || "";
            const userEnterpriseId = data.user?.enterpriseId || "";
            const userPropertyId = data.user?.propertyId || "";

            if (!lfsPropertyId) {
              res.status(403).json({ error: "LFS property not configured. Cannot verify scope." });
              return;
            }

            if (level === "enterprise_admin") {
              if (!userEnterpriseId) {
                res.status(403).json({ error: "Your account has no enterprise assignment." });
                return;
              }
              let lfsEnterpriseId = "";
              try {
                const { storage } = await import("./storage");
                const props = await storage.getProperties();
                const lfsProp = props.find((p: { id: string }) => p.id === lfsPropertyId);
                lfsEnterpriseId = (lfsProp as { enterpriseId?: string })?.enterpriseId || "";
              } catch (lookupErr: unknown) {
                captureLog(`[admin] Enterprise lookup failed: ${lookupErr instanceof Error ? lookupErr.message : "unknown"}`);
              }
              if (!lfsEnterpriseId && cloudUrl) {
                try {
                  const propRes = await fetch(`${cloudUrl}/api/properties/${lfsPropertyId}`, {
                    signal: AbortSignal.timeout(8000),
                  });
                  if (propRes.ok) {
                    const propData = await propRes.json() as { enterpriseId?: string };
                    lfsEnterpriseId = propData.enterpriseId || "";
                    captureLog(`[admin] Enterprise scope resolved via cloud fallback: ${lfsEnterpriseId}`);
                  }
                } catch (cloudErr: unknown) {
                  captureLog(`[admin] Cloud fallback lookup failed: ${cloudErr instanceof Error ? cloudErr.message : "unknown"}`);
                }
              }
              if (!lfsEnterpriseId) {
                res.status(403).json({ error: "Cannot verify enterprise scope. Data not yet synced and cloud unreachable." });
                return;
              }
              if (userEnterpriseId !== lfsEnterpriseId) {
                res.status(403).json({ error: "Your enterprise does not match this LFS property." });
                return;
              }
            } else {
              if (!userPropertyId) {
                res.status(403).json({ error: "Your account has no property assignment." });
                return;
              }
              if (userPropertyId !== lfsPropertyId) {
                res.status(403).json({ error: "Your property assignment does not match this LFS." });
                return;
              }
            }

            const token = createSessionToken();
            res.setHeader("Set-Cookie", buildCookieHeader(token));
            captureLog(`[admin] EMC credential login by ${email} (${level})`);
            res.json({ ok: true });
            return;
          }
          res.status(401).json({ error: "Insufficient access level. Admin or manager role required." });
          return;
        }
        const errData = await authRes.json().catch(() => ({}));
        res.status(401).json({ error: (errData as { message?: string }).message || "Invalid credentials" });
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Connection failed";
        res.status(401).json({ error: `Cloud authentication failed: ${msg}` });
        return;
      }
    }

    res.status(401).json({ error: "Invalid API key" });
  });

  app.use("/api/lfs/admin", lfsAdminAuth);

  app.get("/api/lfs/admin/config", (_req: Request, res: Response) => {
    res.json({
      cloudUrl: process.env.LFS_CLOUD_URL || "",
      propertyId: process.env.LFS_PROPERTY_ID || "",
      syncIntervalMs: parseInt(process.env.LFS_SYNC_INTERVAL_MS || "60000", 10),
      autoUpdate: process.env.LFS_AUTO_UPDATE !== "false",
      version: LFS_VERSION,
    });
  });

  app.post("/api/lfs/admin/config", async (req: Request, res: Response) => {
    try {
      const { cloudUrl, propertyId, apiKey, syncIntervalMs } = req.body;

      const envPath = path.resolve(LFS_BASE_DIR, ".env");
      let envContent = "";
      try {
        envContent = fs.readFileSync(envPath, "utf8");
      } catch {}

      const updates: Record<string, string> = {};
      if (cloudUrl !== undefined) updates["LFS_CLOUD_URL"] = cloudUrl;
      if (propertyId !== undefined) updates["LFS_PROPERTY_ID"] = propertyId;
      if (apiKey) updates["LFS_API_KEY"] = apiKey;
      if (syncIntervalMs) updates["LFS_SYNC_INTERVAL_MS"] = String(syncIntervalMs);

      for (const [key, val] of Object.entries(updates)) {
        process.env[key] = val;
        const regex = new RegExp(`^${key}=.*$`, "m");
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${val}`);
        } else {
          envContent += `\n${key}=${val}`;
        }
      }

      fs.writeFileSync(envPath, envContent.trim() + "\n", "utf8");
      captureLog(`[admin] Configuration updated: ${Object.keys(updates).join(", ")}`);

      if (updates["LFS_CLOUD_URL"] || updates["LFS_API_KEY"] || updates["LFS_PROPERTY_ID"] || updates["LFS_SYNC_INTERVAL_MS"]) {
        try {
          const { restartConfigSync } = await import("./config-sync");
          if (typeof restartConfigSync === "function") {
            await restartConfigSync();
            captureLog("[admin] Config sync service reloaded with new settings");
          }
        } catch (syncErr) {
          captureLog(`[admin] Config sync restart failed: ${syncErr instanceof Error ? syncErr.message : "unknown"}`);
        }
      }

      res.json({ ok: true, requiresRestart: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/admin/test-connection", async (_req: Request, res: Response) => {
    try {
      const cloudUrl = process.env.LFS_CLOUD_URL;
      if (!cloudUrl) {
        return res.json({ ok: false, error: "LFS_CLOUD_URL not configured" });
      }

      const response = await fetch(`${cloudUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        captureLog(`[admin] Connection test successful: ${cloudUrl}`);
        return res.json({ ok: true, cloudStatus: data });
      } else {
        return res.json({ ok: false, error: `Cloud returned HTTP ${response.status}` });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return res.json({ ok: false, error: msg });
    }
  });

  app.post("/api/lfs/admin/trigger-sync", async (_req: Request, res: Response) => {
    try {
      const syncService = getConfigSyncService();
      if (!syncService) {
        return res.json({ ok: false, error: "Config sync service not available" });
      }

      captureLog("[admin] Manual sync triggered");
      await syncService.runInitialSync();
      captureLog("[admin] Manual sync completed");
      res.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      captureLog(`[admin] Manual sync failed: ${msg}`);
      res.json({ ok: false, error: msg });
    }
  });

  app.get("/api/lfs/admin/logs", (_req: Request, res: Response) => {
    const logDir = path.resolve(LFS_BASE_DIR, "logs");
    let fileLines: string[] = [];

    try {
      if (fs.existsSync(logDir)) {
        const files = fs.readdirSync(logDir)
          .filter(f => f.startsWith("lfs-") && f.endsWith(".log"))
          .sort()
          .reverse();

        if (files.length > 0) {
          const latest = path.join(logDir, files[0]);
          const content = fs.readFileSync(latest, "utf8");
          fileLines = content.split("\n").filter(Boolean).slice(-200);
        }
      }
    } catch {}

    const combined = [...fileLines, ...serverLogBuffer].slice(-MAX_LOG_LINES);
    res.json({ logs: combined });
  });

  app.post("/api/lfs/admin/clear-sales-data", async (req: Request, res: Response) => {
    try {
      const propertyId = req.body?.propertyId || process.env.LFS_PROPERTY_ID;
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId is required" });
      }
      const { storage } = await import("./storage");
      const result = await storage.clearSalesData(propertyId);
      const { db: dbRef } = await import("./db");
      const { sql: sqlDrizzle } = await import("drizzle-orm");
      try {
        await dbRef.execute(
          sqlDrizzle`DELETE FROM transaction_journal WHERE synced = true AND property_id = ${propertyId}`
        );
      } catch (journalErr) {
        console.error("[LFS-Admin] Failed to purge synced journal entries:", journalErr);
      }
      res.json({ ok: true, deleted: result.deleted, propertyId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/lfs/admin/check-update", async (_req: Request, res: Response) => {
    try {
      const { getUpdateState } = await import("./lfs-auto-update");
      const state = getUpdateState();

      const cloudUrl = process.env.LFS_CLOUD_URL;
      if (!cloudUrl) {
        return res.json({
          ...state,
          updateAvailable: false,
          error: "No cloud URL configured",
        });
      }

      try {
        const response = await fetch(`${cloudUrl}/api/lfs/sync/latest-version`, {
          headers: {
            ...(process.env.LFS_API_KEY ? { "x-lfs-api-key": process.env.LFS_API_KEY } : {}),
          },
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json();
          const updateAvailable = data.version && data.version !== LFS_VERSION;
          captureLog(`[admin] Update check: current=${LFS_VERSION}, latest=${data.version}, available=${updateAvailable}`);
          return res.json({
            ...state,
            updateAvailable,
            latestVersion: data.version,
            downloadUrl: data.downloadUrl,
            releaseNotes: data.releaseNotes,
            lastCheckAt: new Date().toISOString(),
          });
        }
      } catch {}

      res.json({ ...state, latestVersion: LFS_VERSION });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/lfs/sync/latest-version", (_req: Request, res: Response) => {
    res.json({
      version: LFS_VERSION,
      downloadUrl: null,
      releaseNotes: null,
    });
  });

  app.get("/api/lfs/admin/devices", async (_req: Request, res: Response) => {
    try {
      const { storage } = await import("./storage");
      const devices = await storage.getRegisteredDevices?.() ?? [];
      res.json({ devices });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.json({ devices: [], error: msg });
    }
  });

  app.get("/api/lfs/admin/journal/pending", async (_req: Request, res: Response) => {
    try {
      const { getPendingJournalEntries, getPendingJournalCount } = await import("./transaction-journal");
      const count = await getPendingJournalCount();
      const entries = await getPendingJournalEntries(50);
      res.json({ entries, count });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ entries: [], count: 0, error: msg });
    }
  });
}

export function startLfsAdminServer(_mainApp: Express) {
  if (!isLocalMode) return;

  const adminDir = path.resolve(LFS_BASE_DIR, "lfs", "admin");
  const distAdminDir = path.resolve(LFS_BASE_DIR, "lfs-admin");

  let servePath = "";
  if (fs.existsSync(adminDir)) {
    servePath = adminDir;
  } else if (fs.existsSync(distAdminDir)) {
    servePath = distAdminDir;
  }

  if (!servePath) {
    console.log("[lfs-admin] Admin dashboard directory not found, skipping admin server");
    return;
  }

  const adminApp = express();
  const apiPort = parseInt(process.env.PORT || "3001", 10);
  const adminPort = parseInt(process.env.LFS_ADMIN_PORT || "3002", 10);

  adminApp.use(express.json());

  adminApp.use((_req, res, next) => {
    const origin = _req.headers.origin || "";
    const isLocal = !origin || /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/i.test(origin);
    const allowedOrigin = isLocal ? (origin || `http://localhost:${adminPort}`) : `http://localhost:${adminPort}`;
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-lfs-admin-key");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  adminApp.use(express.static(servePath));

  adminApp.get("/", (_req: Request, res: Response) => {
    res.sendFile(path.join(servePath, "index.html"));
  });

  const proxyToApi = (method: "get" | "post") => (routePath: string) => {
    adminApp[method](routePath, async (req: Request, res: Response) => {
      try {
        const url = `http://localhost:${apiPort}${routePath}`;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (req.headers["x-lfs-admin-key"]) {
          headers["x-lfs-admin-key"] = req.headers["x-lfs-admin-key"] as string;
        }
        if (req.headers.cookie) {
          headers["cookie"] = req.headers.cookie;
        }
        const options: RequestInit = {
          method: method.toUpperCase(),
          headers,
          signal: AbortSignal.timeout(10000),
        };
        if (method === "post" && req.body) {
          options.body = JSON.stringify(req.body);
        }
        const response = await fetch(url, options);
        const setCookieHeader = response.headers.get("set-cookie");
        if (setCookieHeader) {
          res.setHeader("Set-Cookie", setCookieHeader);
        }
        const data = await response.json();
        res.status(response.status).json(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Proxy error";
        res.status(502).json({ error: msg });
      }
    });
  };

  const proxyGet = proxyToApi("get");
  const proxyPost = proxyToApi("post");

  proxyGet("/api/lfs/admin/setup-status");
  proxyPost("/api/lfs/admin/setup");
  proxyPost("/api/lfs/admin/login");
  proxyGet("/api/lfs/admin/config");
  proxyPost("/api/lfs/admin/config");
  proxyPost("/api/lfs/admin/test-connection");
  proxyPost("/api/lfs/admin/trigger-sync");
  proxyGet("/api/lfs/admin/logs");
  proxyPost("/api/lfs/admin/check-update");
  proxyGet("/api/lfs/admin/devices");
  proxyGet("/api/lfs/admin/journal/pending");
  proxyGet("/api/health");
  proxyGet("/api/lfs/sync/status");
  proxyGet("/api/lfs/sync/latest-version");
  proxyGet("/api/lfs/sync/pending-settlements");
  proxyGet("/api/lfs/payment-status");
  proxyGet("/api/lfs/capabilities");
  proxyPost("/api/lfs/reconcile-saf");

  proxyPost("/api/lfs/first-run/validate-cloud");
  proxyPost("/api/lfs/first-run/auth");
  proxyPost("/api/lfs/first-run/properties");
  proxyPost("/api/lfs/first-run/save");

  adminApp.listen(adminPort, "0.0.0.0", () => {
    console.log(`[lfs-admin] Admin dashboard available at http://localhost:${adminPort}`);
    captureLog(`[admin] Admin dashboard started on port ${adminPort}`);
  });
}

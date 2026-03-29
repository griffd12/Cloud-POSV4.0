import type { Express, Request, Response } from "express";
import express from "express";
import { isLocalMode } from "./db";
import { getConfigSyncService } from "./config-sync";
import path from "path";
import fs from "fs";

function getLfsVersion(): string {
  try {
    const pkgPath = require.resolve("../package.json");
    const pkg = JSON.parse(require("fs").readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    try {
      const localPkg = path.resolve(process.cwd(), "package.json");
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

function lfsAdminAuth(req: Request, res: Response, next: Function) {
  const apiKey = process.env.LFS_API_KEY;
  if (!apiKey) return next();

  const provided = req.headers["x-lfs-admin-key"];
  if (provided === apiKey) return next();

  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.match(/lfs_admin_session=([^;]+)/);
    if (match && match[1] === apiKey) return next();
  }

  res.status(401).json({ error: "Unauthorized" });
}

export function registerLfsAdminRoutes(app: Express) {
  if (!isLocalMode) return;

  app.post("/api/lfs/admin/login", (req: Request, res: Response) => {
    const { apiKey } = req.body;
    const expected = process.env.LFS_API_KEY;
    if (!expected || apiKey === expected) {
      res.setHeader("Set-Cookie", `lfs_admin_session=${expected || "open"}; Path=/; HttpOnly; SameSite=Strict`);
      res.json({ ok: true });
    } else {
      res.status(401).json({ error: "Invalid API key" });
    }
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

      const envPath = path.resolve(process.cwd(), ".env");
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
            restartConfigSync();
            captureLog("[admin] Config sync service reloaded with new settings");
          }
        } catch {}
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
    const logDir = path.resolve(process.cwd(), "logs");
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

  app.post("/api/lfs/admin/check-update", async (_req: Request, res: Response) => {
    try {
      const cloudUrl = process.env.LFS_CLOUD_URL;
      if (!cloudUrl) {
        return res.json({ updateAvailable: false, currentVersion: LFS_VERSION, error: "No cloud URL configured" });
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
            updateAvailable,
            currentVersion: LFS_VERSION,
            latestVersion: data.version,
            downloadUrl: data.downloadUrl,
            releaseNotes: data.releaseNotes,
          });
        }
      } catch {}

      res.json({ updateAvailable: false, currentVersion: LFS_VERSION, latestVersion: LFS_VERSION });
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
      const { storage } = await import("./storage");
      const s = storage as {
        getPendingTransactions?: () => unknown[];
        getPendingTransactionCount?: () => number;
      };
      if (s.getPendingTransactions) {
        const entries = s.getPendingTransactions();
        res.json({ entries, count: entries.length });
      } else if (s.getPendingTransactionCount) {
        const count = s.getPendingTransactionCount();
        res.json({ entries: [], count });
      } else {
        res.json({ entries: [], count: 0 });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ entries: [], count: 0, error: msg });
    }
  });
}

export function startLfsAdminServer(_mainApp: Express) {
  if (!isLocalMode) return;

  const adminDir = path.resolve(process.cwd(), "lfs", "admin");
  const distAdminDir = path.resolve(process.cwd(), "lfs-admin");

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
    res.setHeader("Access-Control-Allow-Origin", `http://localhost:${adminPort}`);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-lfs-admin-key");
    res.setHeader("Access-Control-Allow-Credentials", "true");
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

  adminApp.listen(adminPort, "0.0.0.0", () => {
    console.log(`[lfs-admin] Admin dashboard available at http://localhost:${adminPort}`);
    captureLog(`[admin] Admin dashboard started on port ${adminPort}`);
  });
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startFiscalScheduler } from "./fiscalScheduler";
import { startAlertEngine } from "./alertEngine";
import { storage } from "./storage";
import { isLocalMode, sqliteDb } from "./db";
import { startConfigSync, getConfigSyncService } from "./config-sync";
import { registerLfsAdminRoutes, startLfsAdminServer, captureLog } from "./lfs-admin-routes";
import { startAutoUpdateChecker } from "./lfs-auto-update";
import path from "path";
import fs from "fs";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '10mb', // Allow larger payloads for image uploads (base64 encoded)
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }));
app.use(express.raw({ type: ['application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], limit: '10mb' }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const serverStartTime = Date.now();

function getHealthPayload() {
  const syncService = getConfigSyncService();
  const uptimeMs = Date.now() - serverStartTime;
  const base: Record<string, any> = {
    status: "ok",
    mode: isLocalMode ? "local" : "cloud",
    database: isLocalMode ? "sqlite" : "postgresql",
    uptimeSeconds: Math.floor(uptimeMs / 1000),
    timestamp: new Date().toISOString(),
  };

  if (isLocalMode) {
    const sqlitePath = process.env.SQLITE_PATH || "./data/pos-local.db";
    try {
      const stats = fs.statSync(sqlitePath);
      base.sqliteFileSizeBytes = stats.size;
    } catch {}

    if (syncService) {
      const syncStatus = syncService.getStatus();
      base.sync = syncStatus;
      if (syncStatus.lastSyncAt) {
        base.syncAgeSeconds = Math.floor((Date.now() - new Date(syncStatus.lastSyncAt).getTime()) / 1000);
      }
    }
  }

  return base;
}

app.get("/api/health", async (_req, res) => {
  res.json(await getHealthPayload());
});

app.get("/health", async (_req, res) => {
  res.json(await getHealthPayload());
});

(async () => {
  if (isLocalMode) {
    log("Starting in LOCAL FAILOVER SERVER mode (SQLite)", "lfs");
  } else {
    log("Starting in CLOUD mode (PostgreSQL)", "cloud");
  }

  await registerRoutes(httpServer, app);
  registerLfsAdminRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  if (isLocalMode && sqliteDb) {
    const syncService = startConfigSync(sqliteDb);
    if (syncService) {
      await syncService.runInitialSync();
      syncService.start();
    }
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      if (isLocalMode) {
        log("Local Failover Server ready", "lfs");
        captureLog("[startup] LFS server started on port " + port);
        startLfsAdminServer(app);
        startAutoUpdateChecker();
      } else {
        startFiscalScheduler();
        startAlertEngine(storage);
      }
    },
  );
})();

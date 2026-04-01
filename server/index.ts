import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startFiscalScheduler } from "./fiscalScheduler";
import { startAlertEngine } from "./alertEngine";
import { storage } from "./storage";
import { isLocalMode } from "./db";
import { startConfigSync, getConfigSyncService } from "./config-sync";
import { registerLfsAdminRoutes, startLfsAdminServer, captureLog } from "./lfs-admin-routes";
import { startAutoUpdateChecker } from "./lfs-auto-update";
import { startCloudSyncProcess } from "./cloud-sync";
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
    limit: '10mb',
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
    database: "postgresql",
    uptimeSeconds: Math.floor(uptimeMs / 1000),
    timestamp: new Date().toISOString(),
  };

  if (isLocalMode) {
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
    log("Starting in LOCAL FAILOVER SERVER mode (PostgreSQL)", "lfs");

    try {
      const { pool } = await import("./db");
      await pool.query("SELECT 1");
      log("PostgreSQL connection verified", "lfs");
    } catch (pgErr: unknown) {
      const pgMsg = pgErr instanceof Error ? pgErr.message : "Unknown error";
      log(`FATAL: Cannot connect to PostgreSQL — ${pgMsg}`, "lfs");
      log("Verify LFS_DATABASE_URL is correct and PostgreSQL is running.", "lfs");
      process.exit(1);
    }

    try {
      const { pool } = await import("./db");
      const tableCheck = await pool.query(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
      );
      const tableCount = parseInt(tableCheck.rows[0]?.count || "0", 10);
      const EXPECTED_TABLE_COUNT = 147;
      if (tableCount < EXPECTED_TABLE_COUNT) {
        log(`Database has ${tableCount}/${EXPECTED_TABLE_COUNT} tables — running schema migration...`, "lfs");
        const { migrate } = await import("./lfs-schema-init");
        await migrate(pool);
        const recheck = await pool.query(
          "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        );
        const newCount = parseInt(recheck.rows[0]?.count || "0", 10);
        log(`Schema migration complete — ${newCount} tables now present`, "lfs");
      } else {
        log(`Database has ${tableCount} tables — schema up to date`, "lfs");
      }
    } catch (initErr: unknown) {
      const initMsg = initErr instanceof Error ? initErr.message : "Unknown error";
      log(`WARNING: Schema check failed — ${initMsg}`, "lfs");
    }
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

  if (process.env.NODE_ENV === "production") {
    serveStatic(app, isLocalMode);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  if (isLocalMode) {
    const syncService = startConfigSync();
    if (syncService) {
      await syncService.runInitialSync();
      syncService.start();
    }
    startCloudSyncProcess();
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

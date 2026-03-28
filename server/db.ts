import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { createRequire } from "node:module";
import path from "path";
import fs from "fs";
import * as schema from "@shared/schema";

export const isLocalMode = process.env.DB_MODE === "local";

let _sqliteDb: any = null;

if (isLocalMode) {
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3");

  const dbPath = process.env.SQLITE_PATH || "./data/pos-local.db";
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  _sqliteDb = new Database(dbPath);
  _sqliteDb.pragma("journal_mode = WAL");
  _sqliteDb.pragma("foreign_keys = ON");
  _sqliteDb.pragma("busy_timeout = 5000");
}

if (!isLocalMode && !process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const { Pool } = pg;

export const pool = isLocalMode
  ? (null as unknown as pg.Pool)
  : new Pool({ connectionString: process.env.DATABASE_URL });

export const db = isLocalMode
  ? (null as unknown as ReturnType<typeof drizzle>)
  : drizzle(pool, { schema });

export const sqliteDb = _sqliteDb;

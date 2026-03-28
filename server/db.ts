import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { createRequire } from "node:module";
import path from "path";
import fs from "fs";
import * as schema from "@shared/schema";

export const isLocalMode = process.env.DB_MODE === "local";

let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let sqliteDb: any = null;

if (isLocalMode) {
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3");

  const dbPath = process.env.SQLITE_PATH || "./data/pos-local.db";
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  sqliteDb = new Database(dbPath);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");
  sqliteDb.pragma("busy_timeout = 5000");
} else {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}

export { pool, db, sqliteDb };

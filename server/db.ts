import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

export const isLocalMode = process.env.DB_MODE === "local";

function getConnectionString(): string {
  if (isLocalMode) {
    const localDbUrl = process.env.LFS_DATABASE_URL;
    if (!localDbUrl) {
      throw new Error(
        "LFS_DATABASE_URL must be set when DB_MODE=local. LFS runtime requires a dedicated local PostgreSQL instance."
      );
    }
    return localDbUrl;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  return process.env.DATABASE_URL;
}

const { Pool } = pg;

export const pool = new Pool({ connectionString: getConnectionString() });

export const db = drizzle(pool, { schema });


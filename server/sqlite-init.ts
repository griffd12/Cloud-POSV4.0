import { getTableConfig } from "drizzle-orm/pg-core";
import type Database from "better-sqlite3";
import * as schema from "@shared/schema";

function pgTypeToSqlite(columnType: string, dataType: string): string {
  switch (columnType) {
    case "PgVarchar":
    case "PgText":
      return "TEXT";
    case "PgInteger":
      return "INTEGER";
    case "PgSerial":
      return "INTEGER";
    case "PgBoolean":
      return "INTEGER";
    case "PgDecimal":
    case "PgNumeric":
      return "TEXT";
    case "PgTimestamp":
      return "TEXT";
    case "PgJsonb":
      return "TEXT";
    case "PgReal":
      return "REAL";
    default:
      return "TEXT";
  }
}

function isDefaultNow(col: any): boolean {
  if (!col.hasDefault) return false;
  const dv = col.default;
  if (dv && typeof dv === "object" && "queryChunks" in dv) return true;
  if (typeof dv === "string" && dv.toLowerCase().includes("now")) return true;
  return false;
}

function generateCreateTable(table: any): string {
  const config = getTableConfig(table);
  const cols: string[] = [];

  for (const col of config.columns) {
    const isSerial = col.columnType === "PgSerial";
    let sqlType = pgTypeToSqlite(col.columnType, col.dataType);
    let def = `"${col.name}" ${sqlType}`;

    if (col.primary) {
      if (isSerial) {
        def += " PRIMARY KEY AUTOINCREMENT";
      } else {
        def += " PRIMARY KEY";
      }
    }
    if (col.notNull && !col.primary) {
      def += " NOT NULL";
    }
    if (col.hasDefault && !col.primary) {
      if (col.columnType === "PgBoolean") {
        const dv = col.default;
        def += dv === true ? " DEFAULT 1" : " DEFAULT 0";
      } else if (col.columnType === "PgInteger") {
        const dv = col.default;
        if (typeof dv === "number") def += ` DEFAULT ${dv}`;
        else def += " DEFAULT 0";
      } else if (col.columnType === "PgReal") {
        const dv = col.default;
        if (typeof dv === "number") def += ` DEFAULT ${dv}`;
      } else if (col.columnType === "PgDecimal" || col.columnType === "PgNumeric") {
        const dv = col.default;
        if (typeof dv === "string") def += ` DEFAULT '${dv}'`;
        else def += " DEFAULT '0'";
      } else if (col.columnType === "PgTimestamp") {
        if (isDefaultNow(col)) {
          def += " DEFAULT CURRENT_TIMESTAMP";
        }
      } else if (col.columnType === "PgJsonb") {
        const dv = col.default;
        if (Array.isArray(dv)) def += ` DEFAULT '${JSON.stringify(dv)}'`;
        else if (typeof dv === "object" && dv !== null) def += ` DEFAULT '${JSON.stringify(dv)}'`;
        else if (typeof dv === "string") def += ` DEFAULT '${dv.replace(/'/g, "''")}'`;
        else def += " DEFAULT NULL";
      } else if (col.columnType === "PgVarchar" || col.columnType === "PgText") {
        const dv = col.default;
        if (typeof dv === "string") def += ` DEFAULT '${dv.replace(/'/g, "''")}'`;
      }
    }

    cols.push(def);
  }

  const uniqueConstraints: string[] = [];
  if (config.uniqueConstraints) {
    for (const uc of config.uniqueConstraints) {
      if (uc.columns) {
        const colNames = uc.columns.map((c: any) => `"${c.name}"`).join(", ");
        uniqueConstraints.push(`UNIQUE (${colNames})`);
      }
    }
  }

  const allParts = [...cols, ...uniqueConstraints];
  return `CREATE TABLE IF NOT EXISTS "${config.name}" (${allParts.join(", ")})`;
}

function generateIndexes(table: any): string[] {
  const config = getTableConfig(table);
  const stmts: string[] = [];

  if (config.indexes) {
    for (const idx of config.indexes as any[]) {
      const cols = idx.config?.columns;
      if (cols && Array.isArray(cols)) {
        const colNames = cols.map((c: any) => {
          if (typeof c === "object" && c.name) return `"${c.name}"`;
          return `"${c}"`;
        }).join(", ");
        const unique = idx.config?.unique ? "UNIQUE " : "";
        const idxName = idx.config?.name || `idx_${config.name}_auto`;
        stmts.push(`CREATE ${unique}INDEX IF NOT EXISTS "${idxName}" ON "${config.name}" (${colNames})`);
      }
    }
  }

  return stmts;
}

export interface ColumnMeta {
  columnType: string;
  dataType: string;
  isArray: boolean;
}

export type TableColumnMap = Map<string, Map<string, ColumnMeta>>;

let globalColumnMap: TableColumnMap | null = null;

export function getColumnMap(): TableColumnMap {
  if (globalColumnMap) return globalColumnMap;
  globalColumnMap = buildColumnMap();
  return globalColumnMap;
}

function buildColumnMap(): TableColumnMap {
  const map: TableColumnMap = new Map();

  for (const [key, value] of Object.entries(schema)) {
    if (!value || typeof value !== "object") continue;
    try {
      const config = getTableConfig(value as any);
      if (!config || !config.name || !config.columns) continue;
      const colMap = new Map<string, ColumnMeta>();
      for (const col of config.columns) {
        const isArr = col.columnType === "PgArray" || (col as any).baseColumn !== undefined;
        colMap.set(col.name, {
          columnType: col.columnType,
          dataType: col.dataType,
          isArray: isArr,
        });
      }
      map.set(config.name, colMap);
    } catch {}
  }

  return map;
}

export function initSqliteSchema(db: Database.Database): void {
  const tables: any[] = [];

  for (const [key, value] of Object.entries(schema)) {
    if (value && typeof value === "object") {
      try {
        const config = getTableConfig(value as any);
        if (config && config.name && config.columns) {
          tables.push(value);
        }
      } catch {
      }
    }
  }

  db.exec("BEGIN TRANSACTION");
  try {
    for (const table of tables) {
      const createSql = generateCreateTable(table);
      db.exec(createSql);
      const indexStmts = generateIndexes(table);
      for (const idx of indexStmts) {
        try { db.exec(idx); } catch {}
      }
    }

    db.exec(`CREATE TABLE IF NOT EXISTS "lfs_sync_status" (
      "table_name" TEXT PRIMARY KEY,
      "last_synced_at" TEXT,
      "record_count" INTEGER DEFAULT 0
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS "lfs_offline_sequence" (
      "workstation_id" TEXT PRIMARY KEY,
      "current_number" INTEGER NOT NULL,
      "range_start" INTEGER NOT NULL,
      "range_end" INTEGER NOT NULL
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS "lfs_transaction_journal" (
      "id" TEXT PRIMARY KEY,
      "timestamp" TEXT NOT NULL,
      "operation" TEXT NOT NULL,
      "method" TEXT NOT NULL,
      "path" TEXT NOT NULL,
      "body" TEXT,
      "synced" INTEGER DEFAULT 0,
      "synced_at" TEXT,
      "cloud_response" TEXT
    )`);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  console.log(`[LFS] SQLite schema initialized with ${tables.length} tables`);
}

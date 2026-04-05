import { db } from "./db";
import { lfsSyncStatus, lfsOfflineSequence } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { log } from "./index";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";

interface SyncConfig {
  cloudBaseUrl: string;
  apiKey: string;
  propertyId: string;
  intervalMs: number;
}

const CONFIG_TABLES = [
  "enterprises",
  "properties",
  "rvcs",
  "roles",
  "role_privileges",
  "role_rules",
  "privileges",
  "employees",
  "employee_assignments",
  "major_groups",
  "family_groups",
  "slus",
  "menu_item_slus",
  "tax_groups",
  "print_classes",
  "workstations",
  "printers",
  "kds_devices",
  "order_devices",
  "order_device_printers",
  "order_device_kds",
  "workstation_order_devices",
  "print_class_routing",
  "menu_items",
  "modifier_groups",
  "modifiers",
  "modifier_group_modifiers",
  "menu_item_modifier_groups",
  "ingredient_prefixes",
  "menu_item_recipe_ingredients",
  "tenders",
  "discounts",
  "service_charges",
  "pos_layouts",
  "pos_layout_cells",
  "pos_layout_rvc_assignments",
  "job_codes",
  "employee_job_codes",
  "descriptor_sets",
  "descriptor_logo_assets",
  "payment_processors",
  "payment_gateway_config",
  "overtime_rules",
  "break_rules",
  "minor_labor_rules",
  "tip_pool_policies",
  "tip_rules",
  "tip_rule_job_percentages",
  "loyalty_programs",
  "loyalty_rewards",
  "emc_option_flags",
  "terminal_devices",
  "print_agents",
  "cash_drawers",
  "rvc_counters",
  "online_order_sources",
];

function getSchemaTable(tableName: string): any {
  for (const [, value] of Object.entries(schema)) {
    if (value && typeof value === "object") {
      try {
        const config = getTableConfig(value as any);
        if (config && config.name === tableName) {
          return value;
        }
      } catch {}
    }
  }
  return null;
}

function getTableColumns(tableName: string): string[] {
  const table = getSchemaTable(tableName);
  if (!table) return [];
  try {
    const config = getTableConfig(table);
    return config.columns.map((c) => c.name);
  } catch {
    return [];
  }
}

const ARRAY_COLUMNS: Record<string, Set<string>> = {
  workstations: new Set(["allowed_role_ids", "service_bindings", "installed_services"]),
  service_charges: new Set(["order_types"]),
  tip_pool_policies: new Set(["excluded_job_code_ids"]),
};

function getArrayColumns(tableName: string): Set<string> {
  return ARRAY_COLUMNS[tableName] || new Set();
}

function toPostgresArrayLiteral(arr: any[]): string {
  if (arr.length === 0) return "{}";
  const escaped = arr.map((item) => {
    if (item === null || item === undefined) return "NULL";
    const str = String(item);
    if (str === "" || /[{},"\\\s]/.test(str) || str.toUpperCase() === "NULL") {
      return '"' + str.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }
    return str;
  });
  return "{" + escaped.join(",") + "}";
}

export class ConfigSyncService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private lastSyncAt: string | null = null;
  private lastSyncError: string | null = null;
  private syncCount = 0;

  constructor(private config: SyncConfig) {}

  async runInitialSync(): Promise<void> {
    log(`Running blocking initial config sync from ${this.config.cloudBaseUrl}...`, "lfs-sync");
    try {
      await this.sync();
      log(`Initial config sync completed successfully`, "lfs-sync");
    } catch (e: unknown) {
      const err = e as { message?: string };
      log(`Initial config sync failed (will retry on interval): ${err.message}`, "lfs-sync");
    }
  }

  start(): void {
    if (this.intervalHandle) return;
    log(`Config sync starting (interval: ${this.config.intervalMs}ms, cloud: ${this.config.cloudBaseUrl})`, "lfs-sync");
    this.intervalHandle = setInterval(() => {
      this.sync().catch((e) => log(`Sync failed: ${e.message}`, "lfs-sync"));
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  getStatus(): { lastSyncAt: string | null; lastSyncError: string | null; syncCount: number; isSyncing: boolean } {
    return {
      lastSyncAt: this.lastSyncAt,
      lastSyncError: this.lastSyncError,
      syncCount: this.syncCount,
      isSyncing: this.isSyncing,
    };
  }

  private async sync(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      await this.pollPendingCommands();
      const failedTables: string[] = [];
      for (const table of CONFIG_TABLES) {
        try {
          await this.syncTable(table);
        } catch (e: unknown) {
          const err = e as { message?: string };
          failedTables.push(table);
          log(`Table sync failed for ${table}: ${err.message}`, "lfs-sync");
        }
      }
      await this.initOfflineCheckRangesFromWorkstations();
      this.lastSyncAt = new Date().toISOString();
      this.syncCount++;
      if (failedTables.length > 0) {
        this.lastSyncError = `${failedTables.length} tables failed: ${failedTables.join(", ")}`;
        log(`Config sync completed with errors (#${this.syncCount}): ${this.lastSyncError}`, "lfs-sync");
      } else {
        this.lastSyncError = null;
        log(`Config sync completed (#${this.syncCount})`, "lfs-sync");
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.lastSyncError = err.message || "unknown error";
      log(`Config sync error: ${err.message}`, "lfs-sync");
    } finally {
      this.isSyncing = false;
    }
  }

  private async initOfflineCheckRangesFromWorkstations(): Promise<void> {
    try {
      const workstations = await db.execute(sql`SELECT * FROM "workstations"`);
      const rows = workstations.rows || [];
      for (const ws of rows as Record<string, unknown>[]) {
        const wsId = ws.id as string;
        const wsName = ws.name as string | undefined;
        const rangeStart = ws.offline_check_number_start as number | null;
        const rangeEnd = ws.offline_check_number_end as number | null;
        if (rangeStart != null && rangeEnd != null && rangeStart < rangeEnd) {
          const existing = await db
            .select()
            .from(lfsOfflineSequence)
            .where(eq(lfsOfflineSequence.workstationId, wsId));

          if (existing.length === 0) {
            await db.insert(lfsOfflineSequence).values({
              workstationId: wsId,
              currentNumber: rangeStart,
              rangeStart,
              rangeEnd,
            });
            log(`Initialized offline check range for workstation ${wsName || wsId}: ${rangeStart}-${rangeEnd}`, "lfs-sync");
          } else if (existing[0].rangeStart !== rangeStart || existing[0].rangeEnd !== rangeEnd) {
            await db
              .update(lfsOfflineSequence)
              .set({ rangeStart, rangeEnd })
              .where(eq(lfsOfflineSequence.workstationId, wsId));
            log(`Updated offline check range for workstation ${ws.name || ws.id}: ${rangeStart}-${rangeEnd}`, "lfs-sync");
          }
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      log(`Failed to initialize offline check ranges: ${err.message}`, "lfs-sync");
    }
  }

  private async pollPendingCommands(): Promise<void> {
    try {
      const url = `${this.config.cloudBaseUrl}/api/lfs/sync/pending-commands?propertyId=${this.config.propertyId}`;
      const resp = await fetch(url, {
        headers: { "x-lfs-api-key": this.config.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return;
      const data = await resp.json() as { ok: boolean; commands: Array<{ id: number; command: string; propertyId: string }> };
      if (!data.ok || !data.commands?.length) return;

      const succeededIds: number[] = [];
      const clearedPropertyIds = new Set<string>();
      for (const cmd of data.commands) {
        log(`Executing pending command: ${cmd.command} for property ${cmd.propertyId}`, "lfs-sync");
        if (cmd.command === "clear-sales-data") {
          try {
            const { storage } = await import("./storage");
            await storage.clearSalesData(cmd.propertyId);
            try {
              await db.execute(
                sql`DELETE FROM transaction_journal WHERE property_id = ${cmd.propertyId}`
              );
            } catch (_journalErr) {
              log(`clear-sales-data: journal purge failed (non-critical)`, "lfs-sync");
            }
            succeededIds.push(cmd.id);
            clearedPropertyIds.add(cmd.propertyId);
            log(`clear-sales-data completed for property ${cmd.propertyId}`, "lfs-sync");
          } catch (cmdErr: unknown) {
            const ce = cmdErr as { message?: string };
            log(`clear-sales-data failed, will retry next sync: ${ce.message}`, "lfs-sync");
          }
        }
      }

      if (succeededIds.length > 0) {
        try {
          const ackUrl = `${this.config.cloudBaseUrl}/api/lfs/sync/ack-commands`;
          await fetch(ackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-lfs-api-key": this.config.apiKey },
            body: JSON.stringify({ commandIds: succeededIds, propertyId: this.config.propertyId }),
            signal: AbortSignal.timeout(10000),
          });
        } catch (_ackErr) {
          log(`Failed to ACK commands on cloud (will re-execute next sync)`, "lfs-sync");
        }
      }

      for (const propId of clearedPropertyIds) {
        try {
          const clearAckUrl = `${this.config.cloudBaseUrl}/api/lfs/sync/ack-clear-sales`;
          await fetch(clearAckUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-lfs-api-key": this.config.apiKey },
            body: JSON.stringify({ propertyId: propId }),
            signal: AbortSignal.timeout(10000),
          });
          log(`Notified cloud of LFS clear completion for property ${propId}`, "lfs-sync");
        } catch (_clearAckErr) {
          log(`Failed to notify cloud of LFS clear ack (non-critical, status will update on next sync)`, "lfs-sync");
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      log(`Pending commands poll failed: ${err.message}`, "lfs-sync");
    }
  }

  private async syncTable(tableName: string): Promise<void> {
    const syncStatusRows = await db
      .select()
      .from(lfsSyncStatus)
      .where(eq(lfsSyncStatus.tableName, tableName));

    const lastSyncedAt = syncStatusRows.length > 0 ? syncStatusRows[0].lastSyncedAt?.toISOString() : null;

    let url = `${this.config.cloudBaseUrl}/api/lfs/sync/${tableName}?propertyId=${this.config.propertyId}`;
    if (lastSyncedAt) {
      url += `&since=${encodeURIComponent(lastSyncedAt)}`;
    }

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync ${tableName}: ${response.status} ${response.statusText}`);
    }

    const { rows, columns, incremental } = await response.json() as { rows: any[]; columns: string[]; incremental?: boolean };

    const validColumns = getTableColumns(tableName);
    const filteredColumns = columns.filter((c) => validColumns.includes(c));
    const arrayCols = getArrayColumns(tableName);

    if (!rows || !rows.length) {
      if (!incremental) {
        await db.transaction(async (tx) => {
          await tx.execute(sql.raw(`DELETE FROM "${tableName}"`));
        });
      }
      await db
        .insert(lfsSyncStatus)
        .values({ tableName, lastSyncedAt: new Date(), recordCount: 0 })
        .onConflictDoUpdate({
          target: lfsSyncStatus.tableName,
          set: { lastSyncedAt: new Date(), recordCount: 0 },
        });
      return;
    }

    let failedRows = 0;

    if (!incremental) {
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`DELETE FROM "${tableName}"`));
        for (const row of rows) {
          const values: Record<string, unknown> = {};
          for (const col of filteredColumns) {
            values[col] = row[col] ?? null;
          }
          try {
            await tx.execute(sql.raw(`SAVEPOINT row_sp`));
            await this.insertRowTx(tx, tableName, filteredColumns, values, arrayCols);
            await tx.execute(sql.raw(`RELEASE SAVEPOINT row_sp`));
          } catch (e: unknown) {
            failedRows++;
            try {
              await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT row_sp`));
              await tx.execute(sql.raw(`RELEASE SAVEPOINT row_sp`));
            } catch {}
            const err = e as { message?: string };
            log(`Failed to sync row in ${tableName} (id=${values.id}): ${err.message}`, "lfs-sync");
          }
        }
      });
      if (failedRows > 0) {
        log(`${tableName}: ${failedRows}/${rows.length} rows failed during full sync (will retry next cycle)`, "lfs-sync");
      }
    } else {
      for (const row of rows) {
        const values: Record<string, unknown> = {};
        for (const col of filteredColumns) {
          values[col] = row[col] ?? null;
        }
        try {
          if (values.id) {
            await this.upsertRow(tableName, filteredColumns, values, arrayCols);
          } else {
            await this.insertRow(tableName, filteredColumns, values, arrayCols);
          }
        } catch (e: unknown) {
          failedRows++;
          const err = e as { message?: string };
          log(`Failed to sync row in ${tableName} (id=${values.id}): ${err.message}`, "lfs-sync");
        }
      }
    }

    const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM "${tableName}"`));
    const newCount = Number((countResult.rows?.[0] as Record<string, unknown>)?.cnt || rows.length);

    if (failedRows > 0) {
      const preservedSyncTime = syncStatusRows.length > 0 ? syncStatusRows[0].lastSyncedAt : null;
      if (preservedSyncTime) {
        await db
          .insert(lfsSyncStatus)
          .values({ tableName, lastSyncedAt: preservedSyncTime, recordCount: newCount })
          .onConflictDoUpdate({
            target: lfsSyncStatus.tableName,
            set: { recordCount: newCount },
          });
      } else {
        await db
          .insert(lfsSyncStatus)
          .values({ tableName, recordCount: newCount })
          .onConflictDoUpdate({
            target: lfsSyncStatus.tableName,
            set: { recordCount: newCount },
          });
      }
    } else {
      await db
        .insert(lfsSyncStatus)
        .values({ tableName, lastSyncedAt: new Date(), recordCount: newCount })
        .onConflictDoUpdate({
          target: lfsSyncStatus.tableName,
          set: { lastSyncedAt: new Date(), recordCount: newCount },
        });
    }
  }

  private toSqlValue(v: any, isArrayCol: boolean = false): any {
    if (v === null || v === undefined) return null;
    if (isArrayCol) {
      if (Array.isArray(v)) {
        return toPostgresArrayLiteral(v);
      }
      if (typeof v === "string") {
        if (v.startsWith("{")) return v;
        if (v.startsWith("[")) {
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed)) return toPostgresArrayLiteral(parsed);
          } catch {}
        }
      }
      return v;
    }
    if (typeof v === "object") return JSON.stringify(v);
    return v;
  }

  private async upsertRow(tableName: string, columns: string[], values: Record<string, unknown>, arrayCols: Set<string>): Promise<void> {
    const setClauses = columns
      .filter((c) => c !== "id")
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(", ");
    const colNames = columns.map((c) => `"${c}"`).join(", ");

    const chunks = [];
    for (const c of columns) {
      chunks.push(sql`${this.toSqlValue(values[c], arrayCols.has(c))}`);
    }

    const valueSql = sql.join(chunks, sql`, `);
    await db.execute(
      sql`INSERT INTO ${sql.raw(`"${tableName}"`)} (${sql.raw(colNames)}) VALUES (${valueSql}) ON CONFLICT ("id") DO UPDATE SET ${sql.raw(setClauses)}`
    );
  }

  private async insertRow(tableName: string, columns: string[], values: Record<string, unknown>, arrayCols: Set<string>): Promise<void> {
    const colNames = columns.map((c) => `"${c}"`).join(", ");

    const chunks = [];
    for (const c of columns) {
      chunks.push(sql`${this.toSqlValue(values[c], arrayCols.has(c))}`);
    }

    const valueSql = sql.join(chunks, sql`, `);
    await db.execute(
      sql`INSERT INTO ${sql.raw(`"${tableName}"`)} (${sql.raw(colNames)}) VALUES (${valueSql})`
    );
  }

  private async insertRowTx(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], tableName: string, columns: string[], values: Record<string, unknown>, arrayCols: Set<string>): Promise<void> {
    const colNames = columns.map((c) => `"${c}"`).join(", ");

    const chunks = [];
    for (const c of columns) {
      chunks.push(sql`${this.toSqlValue(values[c], arrayCols.has(c))}`);
    }

    const valueSql = sql.join(chunks, sql`, `);
    await tx.execute(
      sql`INSERT INTO ${sql.raw(`"${tableName}"`)} (${sql.raw(colNames)}) VALUES (${valueSql})`
    );
  }
}

let syncService: ConfigSyncService | null = null;

export function startConfigSync(): ConfigSyncService | null {
  const cloudUrl = process.env.LFS_CLOUD_URL;
  const apiKey = process.env.LFS_API_KEY;
  const propertyId = process.env.LFS_PROPERTY_ID;

  if (!cloudUrl || !apiKey || !propertyId) {
    log("Config sync not started: missing LFS_CLOUD_URL, LFS_API_KEY, or LFS_PROPERTY_ID", "lfs-sync");
    return null;
  }

  const intervalMs = parseInt(process.env.LFS_SYNC_INTERVAL_MS || "60000", 10);

  syncService = new ConfigSyncService({
    cloudBaseUrl: cloudUrl,
    apiKey,
    propertyId,
    intervalMs,
  });

  return syncService;
}

export function getConfigSyncService(): ConfigSyncService | null {
  return syncService;
}

export async function restartConfigSync(): Promise<void> {
  if (syncService) {
    syncService.stop();
    syncService = null;
  }

  const cloudUrl = process.env.LFS_CLOUD_URL;
  const apiKey = process.env.LFS_API_KEY;
  const propertyId = process.env.LFS_PROPERTY_ID;

  if (!cloudUrl || !apiKey || !propertyId) {
    log("Config sync not restarted: missing required env vars", "lfs-sync");
    return;
  }

  const intervalMs = parseInt(process.env.LFS_SYNC_INTERVAL_MS || "60000", 10);
  syncService = new ConfigSyncService({
    cloudBaseUrl: cloudUrl,
    apiKey,
    propertyId,
    intervalMs,
  });

  await syncService.runInitialSync();
  syncService.start();

  log("Config sync restarted with updated settings", "lfs-sync");
}

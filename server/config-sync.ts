import type Database from "better-sqlite3";
import { log } from "./index";

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
];

export class ConfigSyncService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private lastSyncAt: string | null = null;
  private lastSyncError: string | null = null;
  private syncCount = 0;

  constructor(
    private db: Database.Database,
    private config: SyncConfig,
  ) {}

  async runInitialSync(): Promise<void> {
    log(`Running blocking initial config sync from ${this.config.cloudBaseUrl}...`, "lfs-sync");
    try {
      await this.sync();
      log(`Initial config sync completed successfully`, "lfs-sync");
    } catch (e: any) {
      log(`Initial config sync failed (will retry on interval): ${e.message}`, "lfs-sync");
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
      for (const table of CONFIG_TABLES) {
        await this.syncTable(table);
      }
      this.initOfflineCheckRangesFromWorkstations();
      this.lastSyncAt = new Date().toISOString();
      this.lastSyncError = null;
      this.syncCount++;
      log(`Config sync completed (#${this.syncCount})`, "lfs-sync");
    } catch (e: any) {
      this.lastSyncError = e.message;
      log(`Config sync error: ${e.message}`, "lfs-sync");
    } finally {
      this.isSyncing = false;
    }
  }

  private initOfflineCheckRangesFromWorkstations(): void {
    try {
      const workstations = this.db.prepare(`SELECT * FROM "workstations"`).all() as any[];
      for (const ws of workstations) {
        const rangeStart = ws.offline_check_number_start;
        const rangeEnd = ws.offline_check_number_end;
        if (rangeStart != null && rangeEnd != null && rangeStart < rangeEnd) {
          const existing = this.db.prepare(`SELECT * FROM "lfs_offline_sequence" WHERE workstation_id = ?`).get(ws.id) as any;
          if (!existing) {
            this.db.prepare(
              `INSERT INTO "lfs_offline_sequence" (workstation_id, current_number, range_start, range_end) VALUES (?, ?, ?, ?)`,
            ).run(ws.id, rangeStart, rangeStart, rangeEnd);
            log(`Initialized offline check range for workstation ${ws.name || ws.id}: ${rangeStart}-${rangeEnd}`, "lfs-sync");
          } else if (existing.range_start !== rangeStart || existing.range_end !== rangeEnd) {
            this.db.prepare(
              `UPDATE "lfs_offline_sequence" SET range_start = ?, range_end = ? WHERE workstation_id = ?`,
            ).run(rangeStart, rangeEnd, ws.id);
            log(`Updated offline check range for workstation ${ws.name || ws.id}: ${rangeStart}-${rangeEnd}`, "lfs-sync");
          }
        }
      }
    } catch (e: any) {
      log(`Failed to initialize offline check ranges: ${e.message}`, "lfs-sync");
    }
  }

  private async syncTable(tableName: string): Promise<void> {
    const syncStatus = this.db.prepare(
      `SELECT last_synced_at, record_count FROM "lfs_sync_status" WHERE table_name = ?`
    ).get(tableName) as { last_synced_at: string; record_count: number } | undefined;

    const lastSyncedAt = syncStatus?.last_synced_at || null;

    let url = `${this.config.cloudBaseUrl}/api/lfs/sync/${tableName}?propertyId=${this.config.propertyId}`;
    if (lastSyncedAt) {
      url += `&since=${encodeURIComponent(lastSyncedAt)}`;
    }

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to sync ${tableName}: ${response.status} ${response.statusText}`);
    }

    const { rows, columns, incremental } = await response.json() as { rows: any[]; columns: string[]; incremental?: boolean };

    this.db.exec("BEGIN TRANSACTION");
    try {
      if (!incremental) {
        this.db.prepare(`DELETE FROM "${tableName}"`).run();
      }

      if (!rows || !rows.length) {
        if (!incremental) {
          this.db.prepare(
            `INSERT OR REPLACE INTO "lfs_sync_status" (table_name, last_synced_at, record_count) VALUES (?, ?, ?)`,
          ).run(tableName, new Date().toISOString(), 0);
        }
        this.db.exec("COMMIT");
        return;
      }

      const placeholders = columns.map(() => "?").join(", ");
      const quotedCols = columns.map((c) => `"${c}"`).join(", ");

      if (incremental) {
        const idCol = columns.includes("id") ? "id" : null;
        if (idCol) {
          const upsertConflict = `ON CONFLICT ("${idCol}") DO UPDATE SET ${columns.filter(c => c !== idCol).map(c => `"${c}" = excluded."${c}"`).join(", ")}`;
          const stmt = this.db.prepare(`INSERT INTO "${tableName}" (${quotedCols}) VALUES (${placeholders}) ${upsertConflict}`);
          for (const row of rows) {
            stmt.run(...this.rowToValues(row, columns));
          }
        } else {
          const stmt = this.db.prepare(`INSERT OR REPLACE INTO "${tableName}" (${quotedCols}) VALUES (${placeholders})`);
          for (const row of rows) {
            stmt.run(...this.rowToValues(row, columns));
          }
        }
      } else {
        const stmt = this.db.prepare(`INSERT INTO "${tableName}" (${quotedCols}) VALUES (${placeholders})`);
        for (const row of rows) {
          stmt.run(...this.rowToValues(row, columns));
        }
      }

      const newCount = incremental
        ? (this.db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get() as any)?.cnt || rows.length
        : rows.length;
      this.db.prepare(
        `INSERT OR REPLACE INTO "lfs_sync_status" (table_name, last_synced_at, record_count) VALUES (?, ?, ?)`,
      ).run(tableName, new Date().toISOString(), newCount);

      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  private rowToValues(row: any, columns: string[]): unknown[] {
    return columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return null;
      if (typeof val === "boolean") return val ? 1 : 0;
      if (typeof val === "object") return JSON.stringify(val);
      return val;
    });
  }
}

let syncService: ConfigSyncService | null = null;

export function startConfigSync(db: Database.Database): ConfigSyncService | null {
  const cloudUrl = process.env.LFS_CLOUD_URL;
  const apiKey = process.env.LFS_API_KEY;
  const propertyId = process.env.LFS_PROPERTY_ID;

  if (!cloudUrl || !apiKey || !propertyId) {
    log("Config sync not started: missing LFS_CLOUD_URL, LFS_API_KEY, or LFS_PROPERTY_ID", "lfs-sync");
    return null;
  }

  const intervalMs = parseInt(process.env.LFS_SYNC_INTERVAL_MS || "60000", 10);

  syncService = new ConfigSyncService(db, {
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

  const { sqliteDb } = require("./db");
  if (!sqliteDb) {
    log("Config sync not restarted: no local database available", "lfs-sync");
    return;
  }
  const db = sqliteDb;

  const intervalMs = parseInt(process.env.LFS_SYNC_INTERVAL_MS || "60000", 10);
  syncService = new ConfigSyncService(db, {
    cloudBaseUrl: cloudUrl,
    apiKey,
    propertyId,
    intervalMs,
  });

  await syncService.runInitialSync();
  syncService.start();

  log("Config sync restarted with updated settings", "lfs-sync");
}

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

  start(): void {
    if (this.intervalHandle) return;
    log(`Config sync starting (interval: ${this.config.intervalMs}ms, cloud: ${this.config.cloudBaseUrl})`, "lfs-sync");
    this.sync().catch((e) => log(`Initial sync failed: ${e.message}`, "lfs-sync"));
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

  private async syncTable(tableName: string): Promise<void> {
    const url = `${this.config.cloudBaseUrl}/api/lfs/sync/${tableName}?propertyId=${this.config.propertyId}`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to sync ${tableName}: ${response.status} ${response.statusText}`);
    }

    const { rows, columns } = await response.json() as { rows: any[]; columns: string[] };

    this.db.exec("BEGIN TRANSACTION");
    try {
      this.db.prepare(`DELETE FROM "${tableName}"`).run();

      if (!rows || !rows.length) {
        this.db.prepare(
          `INSERT OR REPLACE INTO "lfs_sync_status" (table_name, last_synced_at, record_count) VALUES (?, ?, ?)`,
        ).run(tableName, new Date().toISOString(), 0);
        this.db.exec("COMMIT");
        return;
      }

      const placeholders = columns.map(() => "?").join(", ");
      const quotedCols = columns.map((c) => `"${c}"`).join(", ");
      const stmt = this.db.prepare(`INSERT INTO "${tableName}" (${quotedCols}) VALUES (${placeholders})`);

      for (const row of rows) {
        const values = columns.map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return null;
          if (typeof val === "boolean") return val ? 1 : 0;
          if (typeof val === "object") return JSON.stringify(val);
          return val;
        });
        stmt.run(...values);
      }

      this.db.prepare(
        `INSERT OR REPLACE INTO "lfs_sync_status" (table_name, last_synced_at, record_count) VALUES (?, ?, ?)`,
      ).run(tableName, new Date().toISOString(), rows.length);

      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
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

  syncService.start();
  return syncService;
}

export function getConfigSyncService(): ConfigSyncService | null {
  return syncService;
}

/**
 * SQLite Database for Service Host
 * 
 * Provides local storage for:
 * - Configuration cache (synced from cloud)
 * - Active checks and transactions
 * - Print queue
 * - Sync queue (pending uploads to cloud)
 */

import { CREATE_SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import { randomUUID } from 'crypto';

const BetterSqlite3 = require('better-sqlite3');

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SyncQueueItem {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface CheckLock {
  checkId: string;
  workstationId: string;
  employeeId: string;
  lockType: string;
  lockedAt: string;
  expiresAt: string;
}

export interface WorkstationConfig {
  workstationId: string;
  checkNumberStart: number;
  checkNumberEnd: number;
  currentCheckNumber: number;
  offlineModeEnabled: boolean;
  lastSyncAt: string | null;
  lastSeenAt: string;
}

export class Database {
  private db: any;
  private dbPath: string;
  
  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.createSchema();
    this.ensureCriticalTables();
    this.checkSchemaVersion();
  }
  
  async initialize(): Promise<void> {
    console.log('[DB] Database already initialized in constructor');
  }

  getDb(): any {
    return this.db;
  }
  
  private createSchema(): void {
    try {
      this.db.exec(CREATE_SCHEMA_SQL);
    } catch (e: any) {
      console.warn(`[DB] Schema exec partially failed: ${e.message}. Will ensure critical tables exist individually.`);
    }
  }

  private ensureCriticalTables(): void {
    const criticalTables = [
      `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS config_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        version INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 10,
        last_attempt_at TEXT,
        next_attempt_at TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
    ];
    for (const sql of criticalTables) {
      try {
        this.db.exec(sql);
      } catch (e: any) {
        console.error(`[DB] Failed to ensure critical table: ${e.message}`);
      }
    }
  }
  
  private checkSchemaVersion(): void {
    const row = this.get<{ version: number }>('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
    
    if (!row) {
      this.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION]);
    } else if (row.version < SCHEMA_VERSION) {
      console.log(`[DB] Schema migration needed: ${row.version} → ${SCHEMA_VERSION}`);
      this.migrateSchema(row.version, SCHEMA_VERSION);
    }
  }
  
  private migrateSchema(fromVersion: number, toVersion: number): void {
    console.log(`[DB] Migrating schema from v${fromVersion} to v${toVersion}`);
    
    if (fromVersion < 4) {
      this.migrateToV4();
    }
    
    if (fromVersion < 5) {
      this.migrateToV5();
    }
    
    if (fromVersion < 6) {
      this.migrateToV6();
    }
    
    if (fromVersion < 7) {
      this.migrateToV7();
    }
    
    if (fromVersion < 8) {
      this.migrateToV8();
    }
    
    if (fromVersion < 9) {
      this.migrateToV9();
    }
    
    if (fromVersion < 10) {
      this.migrateToV10();
    }
    
    if (fromVersion < 11) {
      this.migrateToV11();
    }
    
    if (fromVersion < 12) {
      this.migrateToV12();
    }
    
    if (fromVersion < 14) {
      this.migrateToV14();
    }
    
    if (fromVersion < 15) {
      this.migrateToV15();
    }
    
    if (fromVersion < 16) {
      this.migrateToV16();
    }
    
    this.run('INSERT INTO schema_version (version) VALUES (?)', [toVersion]);
  }
  
  private migrateToV4(): void {
    console.log('[DB] Running v4 migration: tender flags, RVC print flags, emc_option_flags');
    
    const tenderColumns = [
      { name: 'is_system', def: 'INTEGER DEFAULT 0' },
      { name: 'pop_drawer', def: 'INTEGER DEFAULT 0' },
      { name: 'allow_tips', def: 'INTEGER DEFAULT 0' },
      { name: 'allow_over_tender', def: 'INTEGER DEFAULT 0' },
      { name: 'print_check_on_payment', def: 'INTEGER DEFAULT 1' },
      { name: 'require_manager_approval', def: 'INTEGER DEFAULT 0' },
      { name: 'requires_payment_processor', def: 'INTEGER DEFAULT 0' },
      { name: 'display_order', def: 'INTEGER DEFAULT 0' },
      { name: 'is_cash_media', def: 'INTEGER DEFAULT 0' },
      { name: 'is_card_media', def: 'INTEGER DEFAULT 0' },
      { name: 'is_gift_media', def: 'INTEGER DEFAULT 0' },
    ];
    
    for (const col of tenderColumns) {
      try {
        this.run(`ALTER TABLE tenders ADD COLUMN ${col.name} ${col.def}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) throw e;
      }
    }
    
    const rvcColumns = [
      { name: 'receipt_print_mode', def: "TEXT DEFAULT 'auto_on_close'" },
      { name: 'receipt_copies', def: 'INTEGER DEFAULT 1' },
      { name: 'kitchen_print_mode', def: "TEXT DEFAULT 'auto_on_send'" },
      { name: 'void_receipt_print', def: 'INTEGER DEFAULT 1' },
      { name: 'require_guest_count', def: 'INTEGER DEFAULT 0' },
    ];
    
    for (const col of rvcColumns) {
      try {
        this.run(`ALTER TABLE rvcs ADD COLUMN ${col.name} ${col.def}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) throw e;
      }
    }
    
    this.run(`
      CREATE TABLE IF NOT EXISTS emc_option_flags (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        option_key TEXT NOT NULL,
        value_text TEXT,
        scope_level TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    this.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_emc_option_flags_unique ON emc_option_flags (enterprise_id, entity_type, entity_id, option_key, scope_level, scope_id)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_emc_option_flags_entity ON emc_option_flags (enterprise_id, entity_type, entity_id)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_emc_option_flags_key ON emc_option_flags (enterprise_id, option_key)`);
    
    this.run(`UPDATE tenders SET is_cash_media = 1 WHERE type = 'cash' AND is_cash_media = 0`);
    this.run(`UPDATE tenders SET is_card_media = 1 WHERE type IN ('credit', 'debit') AND is_card_media = 0`);
    this.run(`UPDATE tenders SET is_gift_media = 1 WHERE type = 'gift' AND is_gift_media = 0`);
    this.run(`UPDATE tenders SET pop_drawer = 1, allow_over_tender = 1 WHERE type = 'cash' AND pop_drawer = 0`);
    this.run(`UPDATE tenders SET allow_tips = 1 WHERE type IN ('credit', 'debit') AND allow_tips = 0`);
    
    console.log('[DB] v4 migration complete');
  }
  
  private migrateToV5(): void {
    console.log('[DB] Running v5 migration: transaction_journal, checks.txn_group_id');
    
    try {
      this.run(`ALTER TABLE checks ADD COLUMN txn_group_id TEXT`);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) throw e;
    }
    
    this.run(`
      CREATE TABLE IF NOT EXISTS transaction_journal (
        event_id TEXT PRIMARY KEY,
        txn_group_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        rvc_id TEXT NOT NULL,
        business_date TEXT NOT NULL,
        check_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        config_version TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        sync_state TEXT NOT NULL DEFAULT 'pending',
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT
      )
    `);
    this.run(`CREATE INDEX IF NOT EXISTS idx_journal_sync_state ON transaction_journal(sync_state)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_journal_check ON transaction_journal(check_id)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_journal_business_date ON transaction_journal(business_date)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_journal_txn_group ON transaction_journal(txn_group_id)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_journal_device ON transaction_journal(device_id)`);
    
    console.log('[DB] v5 migration complete');
  }
  
  private migrateToV6(): void {
    console.log('[DB] Running v6 migration: checks.customer_id, checks.customer_name');
    
    try {
      this.run('ALTER TABLE checks ADD COLUMN customer_id TEXT');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) throw e;
    }
    
    try {
      this.run('ALTER TABLE checks ADD COLUMN customer_name TEXT');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) throw e;
    }
    
    try {
      this.run('ALTER TABLE modifier_groups ADD COLUMN code TEXT');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) throw e;
    }
    
    console.log('[DB] v6 migration complete');
  }
  
  private migrateToV7(): void {
    console.log('[DB] Running v7 migration: check_items columns + modifier_groups.code');
    const checkItemCols = [
      { name: 'sent_to_kitchen', def: 'INTEGER DEFAULT 0' },
      { name: 'sent', def: 'INTEGER DEFAULT 0' },
      { name: 'discount_id', def: 'TEXT' },
      { name: 'discount_name', def: 'TEXT' },
      { name: 'discount_amount', def: 'INTEGER DEFAULT 0' },
      { name: 'discount_type', def: 'TEXT' },
      { name: 'modifiers_json', def: 'TEXT' },
    ];
    for (const col of checkItemCols) {
      try {
        this.run(`ALTER TABLE check_items ADD COLUMN ${col.name} ${col.def}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) console.log(`[DB] v7 check_items.${col.name}: ${e.message}`);
      }
    }
    try {
      this.run('ALTER TABLE modifier_groups ADD COLUMN code TEXT');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) console.log(`[DB] v7 modifier_groups.code: ${e.message}`);
    }
    console.log('[DB] v7 migration complete');
  }
  
  private migrateToV8(): void {
    console.log('[DB] Running v8 migration: print_classes.display_order, service_charges columns');
    try {
      this.run('ALTER TABLE print_classes ADD COLUMN display_order INTEGER DEFAULT 0');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) console.log(`[DB] v8 print_classes.display_order: ${e.message}`);
    }
    const scCols = [
      { name: 'apply_to_subtotal', def: 'INTEGER DEFAULT 1' },
      { name: 'apply_to_discounted', def: 'INTEGER DEFAULT 1' },
      { name: 'taxable', def: 'INTEGER DEFAULT 0' },
      { name: 'tax_group_id', def: 'TEXT' },
      { name: 'auto_apply_guest_count', def: 'INTEGER' },
    ];
    for (const col of scCols) {
      try {
        this.run(`ALTER TABLE service_charges ADD COLUMN ${col.name} ${col.def}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) console.log(`[DB] v8 service_charges.${col.name}: ${e.message}`);
      }
    }
    console.log('[DB] v8 migration complete');
  }
  
  private migrateToV9(): void {
    console.log('[DB] Running v9 migration: pos_layouts schema update, menu_item_modifier_groups columns');
    const posLayoutCols = [
      { name: 'enterprise_id', def: 'TEXT' },
      { name: 'property_id', def: 'TEXT' },
      { name: 'rvc_id', def: 'TEXT' },
      { name: 'mode', def: "TEXT DEFAULT 'slu_tabs'" },
      { name: 'grid_rows', def: 'INTEGER DEFAULT 4' },
      { name: 'grid_cols', def: 'INTEGER DEFAULT 6' },
      { name: 'font_size', def: "TEXT DEFAULT 'medium'" },
      { name: 'is_default', def: 'INTEGER DEFAULT 0' },
    ];
    for (const col of posLayoutCols) {
      try {
        this.run(`ALTER TABLE pos_layouts ADD COLUMN ${col.name} ${col.def}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) console.log(`[DB] v9 pos_layouts.${col.name}: ${e.message}`);
      }
    }
    const posLayoutCellCols = [
      { name: 'row_span', def: 'INTEGER DEFAULT 1' },
      { name: 'col_span', def: 'INTEGER DEFAULT 1' },
      { name: 'background_color', def: "TEXT DEFAULT '#3B82F6'" },
      { name: 'text_color', def: "TEXT DEFAULT '#FFFFFF'" },
      { name: 'display_label', def: 'TEXT' },
    ];
    for (const col of posLayoutCellCols) {
      try {
        this.run(`ALTER TABLE pos_layout_cells ADD COLUMN ${col.name} ${col.def}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) console.log(`[DB] v9 pos_layout_cells.${col.name}: ${e.message}`);
      }
    }
    const mimgCols = [
      { name: 'sort_order', def: 'INTEGER DEFAULT 0' },
      { name: 'min_required', def: 'INTEGER DEFAULT 0' },
      { name: 'max_allowed', def: 'INTEGER DEFAULT 0' },
    ];
    for (const col of mimgCols) {
      try {
        this.run(`ALTER TABLE menu_item_modifier_groups ADD COLUMN ${col.name} ${col.def}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) console.log(`[DB] v9 menu_item_modifier_groups.${col.name}: ${e.message}`);
      }
    }
    try {
      this.run('CREATE INDEX IF NOT EXISTS idx_pos_layouts_rvc ON pos_layouts(rvc_id)');
      this.run('CREATE INDEX IF NOT EXISTS idx_pos_layouts_property ON pos_layouts(property_id)');
    } catch (e) { /* indexes may already exist */ }
    console.log('[DB] v9 migration complete');
  }
  
  private migrateToV10(): void {
    console.log('[DB] Running v10 migration: check_service_charges.voided column');
    try {
      this.run('ALTER TABLE check_service_charges ADD COLUMN voided INTEGER DEFAULT 0');
      console.log('[DB] Added check_service_charges.voided column');
    } catch (e) {
      // Column may already exist
    }
    console.log('[DB] v10 migration complete');
  }
  
  private migrateToV11(): void {
    console.log('[DB] Running v11 migration: workstation offline check number range');
    const cols = [
      { name: 'offline_check_number_start', def: 'INTEGER' },
      { name: 'offline_check_number_end', def: 'INTEGER' },
    ];
    for (const col of cols) {
      try {
        this.run(`ALTER TABLE workstations ADD COLUMN ${col.name} ${col.def}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) throw e;
      }
    }
    console.log('[DB] v11 migration complete');
  }
  
  private migrateToV12(): void {
    console.log('[DB] Running v12 migration: check_items extra columns, kds_tickets.station_id, check_discounts.voided, operation_queue, time_entries punch columns');
    
    const checkItemCols = [
      { name: 'sent_to_kitchen', def: 'INTEGER DEFAULT 0' },
      { name: 'sent', def: 'INTEGER DEFAULT 0' },
      { name: 'modifiers_json', def: 'TEXT' },
      { name: 'discount_id', def: 'TEXT' },
      { name: 'discount_name', def: 'TEXT' },
      { name: 'discount_amount', def: 'INTEGER DEFAULT 0' },
      { name: 'discount_type', def: 'TEXT' },
      { name: 'voided', def: 'INTEGER DEFAULT 0' },
      { name: 'void_reason', def: 'TEXT' },
      { name: 'void_employee_id', def: 'TEXT' },
    ];
    for (const col of checkItemCols) {
      try {
        this.run(`ALTER TABLE check_items ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[DB] Added check_items.${col.name}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) console.log(`[DB] check_items.${col.name} skipped: ${e.message}`);
      }
    }
    
    try {
      this.run('ALTER TABLE kds_tickets ADD COLUMN station_id TEXT');
      console.log('[DB] Added kds_tickets.station_id');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) console.log(`[DB] kds_tickets.station_id skipped: ${e.message}`);
    }
    
    try {
      this.run('ALTER TABLE check_discounts ADD COLUMN voided INTEGER DEFAULT 0');
      console.log('[DB] Added check_discounts.voided');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) console.log(`[DB] check_discounts.voided skipped: ${e.message}`);
    }
    
    const timeEntryCols = [
      { name: 'punch_type', def: 'TEXT' },
      { name: 'job_code_id', def: 'TEXT' },
      { name: 'punch_time', def: 'TEXT' },
    ];
    for (const col of timeEntryCols) {
      try {
        this.run(`ALTER TABLE time_entries ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[DB] Added time_entries.${col.name}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) console.log(`[DB] time_entries.${col.name} skipped: ${e.message}`);
      }
    }
    
    this.run(`
      CREATE TABLE IF NOT EXISTS operation_queue (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'POST',
        path TEXT NOT NULL,
        body TEXT,
        headers TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    console.log('[DB] operation_queue table ensured');
    
    console.log('[DB] v12 migration complete');
  }
  
  private migrateToV14(): void {
    console.log('[DB] Running v14 migration: employee_assignments.role_id + 18 missing tables');
    
    try {
      this.run('ALTER TABLE employee_assignments ADD COLUMN role_id TEXT REFERENCES roles(id)');
      console.log('[DB] Added employee_assignments.role_id');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) console.log(`[DB] employee_assignments.role_id skipped: ${e.message}`);
    }
    
    this.run(`CREATE TABLE IF NOT EXISTS terminal_devices (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      name TEXT NOT NULL,
      device_type TEXT NOT NULL,
      serial_number TEXT,
      ip_address TEXT,
      port INTEGER,
      payment_processor_id TEXT REFERENCES payment_processors(id),
      is_online INTEGER DEFAULT 0,
      last_seen_at TEXT,
      firmware_version TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS cash_drawers (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      name TEXT NOT NULL,
      workstation_id TEXT REFERENCES workstations(id),
      starting_balance INTEGER DEFAULT 0,
      current_balance INTEGER DEFAULT 0,
      status TEXT DEFAULT 'closed',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS drawer_assignments (
      id TEXT PRIMARY KEY,
      cash_drawer_id TEXT NOT NULL REFERENCES cash_drawers(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      workstation_id TEXT REFERENCES workstations(id),
      assigned_at TEXT DEFAULT (datetime('now')),
      unassigned_at TEXT,
      opening_balance INTEGER NOT NULL,
      closing_balance INTEGER,
      expected_balance INTEGER,
      over_short INTEGER,
      status TEXT DEFAULT 'open',
      business_date TEXT,
      manager_employee_id TEXT REFERENCES employees(id),
      cloud_synced INTEGER DEFAULT 0
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS cash_transactions (
      id TEXT PRIMARY KEY,
      cash_drawer_id TEXT NOT NULL REFERENCES cash_drawers(id),
      drawer_assignment_id TEXT REFERENCES drawer_assignments(id),
      transaction_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      check_id TEXT REFERENCES checks(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      manager_employee_id TEXT REFERENCES employees(id),
      reason TEXT,
      notes TEXT,
      reference_number TEXT,
      cloud_synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS safe_counts (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      count_type TEXT NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id),
      manager_employee_id TEXT REFERENCES employees(id),
      business_date TEXT NOT NULL,
      expected_amount INTEGER,
      actual_amount INTEGER NOT NULL,
      variance INTEGER,
      denominations TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      cloud_synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS job_codes (
      id TEXT PRIMARY KEY,
      enterprise_id TEXT REFERENCES enterprises(id),
      property_id TEXT REFERENCES properties(id),
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      hourly_rate TEXT,
      overtime_eligible INTEGER DEFAULT 1,
      tipped INTEGER DEFAULT 0,
      default_tip_rate TEXT,
      color TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS employee_job_codes (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id),
      job_code_id TEXT NOT NULL REFERENCES job_codes(id),
      hourly_rate_override TEXT,
      is_primary INTEGER DEFAULT 0,
      effective_from TEXT,
      effective_until TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS fiscal_periods (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      period_type TEXT NOT NULL,
      business_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      opened_by_employee_id TEXT REFERENCES employees(id),
      closed_by_employee_id TEXT REFERENCES employees(id),
      gross_sales INTEGER DEFAULT 0,
      net_sales INTEGER DEFAULT 0,
      tax_collected INTEGER DEFAULT 0,
      discounts_given INTEGER DEFAULT 0,
      refunds_given INTEGER DEFAULT 0,
      check_count INTEGER DEFAULT 0,
      guest_count INTEGER DEFAULT 0,
      void_count INTEGER DEFAULT 0,
      void_amount INTEGER DEFAULT 0,
      cash_over_short INTEGER DEFAULT 0,
      notes TEXT,
      cloud_synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS online_order_sources (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      api_key TEXT,
      webhook_url TEXT,
      auto_accept INTEGER DEFAULT 0,
      default_prep_time INTEGER DEFAULT 15,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS overtime_rules (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      name TEXT NOT NULL,
      description TEXT,
      daily_regular_hours TEXT DEFAULT '8.00',
      daily_overtime_threshold TEXT DEFAULT '8.00',
      daily_double_time_threshold TEXT,
      weekly_overtime_threshold TEXT DEFAULT '40.00',
      weekly_double_time_threshold TEXT,
      overtime_multiplier TEXT DEFAULT '1.50',
      double_time_multiplier TEXT DEFAULT '2.00',
      enable_daily_overtime INTEGER DEFAULT 1,
      enable_daily_double_time INTEGER DEFAULT 0,
      enable_weekly_overtime INTEGER DEFAULT 1,
      enable_weekly_double_time INTEGER DEFAULT 0,
      week_start_day INTEGER DEFAULT 0,
      effective_date TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS break_rules (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      name TEXT NOT NULL DEFAULT 'California Break Rules',
      state_code TEXT NOT NULL DEFAULT 'CA',
      enable_meal_break_enforcement INTEGER DEFAULT 1,
      meal_break_minutes INTEGER DEFAULT 30,
      meal_break_threshold_hours TEXT DEFAULT '5.00',
      second_meal_break_threshold_hours TEXT DEFAULT '10.00',
      allow_meal_break_waiver INTEGER DEFAULT 1,
      meal_waiver_max_shift_hours TEXT DEFAULT '6.00',
      enable_rest_break_enforcement INTEGER DEFAULT 1,
      rest_break_minutes INTEGER DEFAULT 10,
      rest_break_interval_hours TEXT DEFAULT '4.00',
      rest_break_is_paid INTEGER DEFAULT 1,
      enable_premium_pay INTEGER DEFAULT 1,
      meal_break_premium_hours TEXT DEFAULT '1.00',
      rest_break_premium_hours TEXT DEFAULT '1.00',
      require_clock_out_attestation INTEGER DEFAULT 1,
      attestation_message TEXT,
      enable_break_alerts INTEGER DEFAULT 1,
      alert_minutes_before_deadline INTEGER DEFAULT 15,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS tip_rules (
      id TEXT PRIMARY KEY,
      enterprise_id TEXT REFERENCES enterprises(id),
      property_id TEXT REFERENCES properties(id),
      rvc_id TEXT REFERENCES rvcs(id),
      name TEXT NOT NULL DEFAULT 'Default Tip Rules',
      distribution_method TEXT NOT NULL DEFAULT 'tip_directly',
      timeframe TEXT DEFAULT 'daily',
      applies_to_all_locations INTEGER DEFAULT 0,
      declare_cash_tips INTEGER DEFAULT 0,
      declare_cash_tips_all_locations INTEGER DEFAULT 0,
      exclude_managers INTEGER DEFAULT 1,
      minimum_hours_for_pool TEXT DEFAULT '0',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS tip_rule_job_percentages (
      id TEXT PRIMARY KEY,
      tip_rule_id TEXT NOT NULL REFERENCES tip_rules(id),
      job_code_id TEXT NOT NULL REFERENCES job_codes(id),
      percentage TEXT NOT NULL DEFAULT '0',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS minor_labor_rules (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      state_code TEXT NOT NULL DEFAULT 'CA',
      minor_age_threshold INTEGER DEFAULT 18,
      young_minor_age_threshold INTEGER DEFAULT 16,
      school_day_max_hours TEXT DEFAULT '4.00',
      school_week_max_hours TEXT DEFAULT '18.00',
      school_day_start_time TEXT DEFAULT '07:00',
      school_day_end_time TEXT DEFAULT '19:00',
      non_school_day_max_hours TEXT DEFAULT '8.00',
      non_school_week_max_hours TEXT DEFAULT '40.00',
      non_school_day_start_time TEXT DEFAULT '07:00',
      non_school_day_end_time TEXT DEFAULT '21:00',
      require_work_permit INTEGER DEFAULT 1,
      work_permit_expiration_alert_days INTEGER DEFAULT 30,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS payment_gateway_config (
      id TEXT PRIMARY KEY,
      config_level TEXT NOT NULL,
      enterprise_id TEXT REFERENCES enterprises(id),
      property_id TEXT REFERENCES properties(id),
      workstation_id TEXT,
      gateway_type TEXT,
      integration_model TEXT,
      environment TEXT,
      credential_key_prefix TEXT,
      merchant_id TEXT,
      terminal_id TEXT,
      site_id TEXT,
      device_id TEXT,
      license_id TEXT,
      terminal_ip_address TEXT,
      terminal_port TEXT,
      terminal_connection_type TEXT,
      enable_sale INTEGER DEFAULT 0,
      enable_void INTEGER DEFAULT 0,
      enable_refund INTEGER DEFAULT 0,
      enable_auth_capture INTEGER DEFAULT 0,
      enable_manual_entry INTEGER DEFAULT 0,
      enable_debit INTEGER DEFAULT 0,
      enable_ebt INTEGER DEFAULT 0,
      enable_healthcare INTEGER DEFAULT 0,
      enable_contactless INTEGER DEFAULT 0,
      enable_emv INTEGER DEFAULT 0,
      enable_msr INTEGER DEFAULT 0,
      enable_partial_approval INTEGER DEFAULT 0,
      enable_tokenization INTEGER DEFAULT 0,
      enable_store_and_forward INTEGER DEFAULT 0,
      enable_surcharge INTEGER DEFAULT 0,
      enable_tip_adjust INTEGER DEFAULT 0,
      enable_incremental_auth INTEGER DEFAULT 0,
      enable_cashback INTEGER DEFAULT 0,
      surcharge_percent TEXT,
      saf_floor_limit TEXT,
      saf_max_transactions INTEGER,
      auth_hold_minutes INTEGER,
      enable_auto_batch_close INTEGER DEFAULT 0,
      batch_close_time TEXT,
      enable_manual_batch_close INTEGER DEFAULT 0,
      receipt_show_emv_fields INTEGER DEFAULT 0,
      receipt_show_aid INTEGER DEFAULT 0,
      receipt_show_tvr INTEGER DEFAULT 0,
      receipt_show_tsi INTEGER DEFAULT 0,
      receipt_show_app_label INTEGER DEFAULT 0,
      receipt_show_entry_method INTEGER DEFAULT 0,
      receipt_print_merchant_copy INTEGER DEFAULT 0,
      receipt_print_customer_copy INTEGER DEFAULT 0,
      enable_debug_logging INTEGER DEFAULT 0,
      log_raw_requests INTEGER DEFAULT 0,
      log_raw_responses INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS descriptor_sets (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      enterprise_id TEXT NOT NULL REFERENCES enterprises(id),
      header_lines TEXT DEFAULT '[]',
      trailer_lines TEXT DEFAULT '[]',
      logo_enabled INTEGER DEFAULT 0,
      logo_asset_id TEXT REFERENCES descriptor_logo_assets(id),
      override_header INTEGER DEFAULT 0,
      override_trailer INTEGER DEFAULT 0,
      override_logo INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by_id TEXT
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS descriptor_logo_assets (
      id TEXT PRIMARY KEY,
      enterprise_id TEXT NOT NULL REFERENCES enterprises(id),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      checksum TEXT,
      escpos_data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      created_by_id TEXT
    )`);
    
    this.run(`CREATE TABLE IF NOT EXISTS print_agents (
      id TEXT PRIMARY KEY,
      property_id TEXT REFERENCES properties(id),
      workstation_id TEXT REFERENCES workstations(id),
      name TEXT NOT NULL,
      description TEXT,
      agent_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      last_heartbeat TEXT,
      last_connected_at TEXT,
      last_disconnected_at TEXT,
      agent_version TEXT,
      hostname TEXT,
      ip_address TEXT,
      os_info TEXT,
      auto_reconnect INTEGER DEFAULT 1,
      heartbeat_interval_ms INTEGER DEFAULT 30000,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    
    const newIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_terminal_devices_property ON terminal_devices(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_cash_drawers_property ON cash_drawers(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_drawer_assignments_drawer ON drawer_assignments(cash_drawer_id)',
      'CREATE INDEX IF NOT EXISTS idx_drawer_assignments_employee ON drawer_assignments(employee_id)',
      'CREATE INDEX IF NOT EXISTS idx_drawer_assignments_date ON drawer_assignments(business_date)',
      'CREATE INDEX IF NOT EXISTS idx_cash_transactions_drawer ON cash_transactions(cash_drawer_id)',
      'CREATE INDEX IF NOT EXISTS idx_safe_counts_property ON safe_counts(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_safe_counts_date ON safe_counts(business_date)',
      'CREATE INDEX IF NOT EXISTS idx_job_codes_property ON job_codes(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_employee_job_codes_employee ON employee_job_codes(employee_id)',
      'CREATE INDEX IF NOT EXISTS idx_fiscal_periods_property ON fiscal_periods(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_fiscal_periods_date ON fiscal_periods(business_date)',
      'CREATE INDEX IF NOT EXISTS idx_fiscal_periods_status ON fiscal_periods(status)',
      'CREATE INDEX IF NOT EXISTS idx_overtime_rules_property ON overtime_rules(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_break_rules_property ON break_rules(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_tip_rules_property ON tip_rules(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_tip_rule_job_pct_rule ON tip_rule_job_percentages(tip_rule_id)',
      'CREATE INDEX IF NOT EXISTS idx_minor_labor_rules_property ON minor_labor_rules(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_payment_gateway_config_enterprise ON payment_gateway_config(enterprise_id)',
      'CREATE INDEX IF NOT EXISTS idx_payment_gateway_config_property ON payment_gateway_config(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_descriptor_sets_enterprise ON descriptor_sets(enterprise_id)',
      'CREATE INDEX IF NOT EXISTS idx_descriptor_logo_assets_enterprise ON descriptor_logo_assets(enterprise_id)',
      'CREATE INDEX IF NOT EXISTS idx_print_agents_property ON print_agents(property_id)',
    ];
    for (const idx of newIndexes) {
      try { this.run(idx); } catch (e) { /* index may already exist */ }
    }
    
    console.log('[DB] v14 migration complete — employee_assignments.role_id added, 18 tables created');
  }
  
  private migrateToV15(): void {
    console.log('[DB] Running v15 migration: loyalty_members.active column');
    try {
      this.run('ALTER TABLE loyalty_members ADD COLUMN active INTEGER DEFAULT 1');
      console.log('[DB] Added loyalty_members.active');
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) console.log(`[DB] loyalty_members.active skipped: ${e.message}`);
    }
    console.log('[DB] v15 migration complete');
  }
  
  private migrateToV16(): void {
    console.log('[DB] Running v16 migration: terminal_devices cloud fields');
    const cols = [
      { name: 'cloud_device_id', def: 'TEXT' },
      { name: 'terminal_id', def: 'TEXT' },
      { name: 'connection_type', def: "TEXT DEFAULT 'ethernet'" },
    ];
    for (const col of cols) {
      try {
        this.run(`ALTER TABLE terminal_devices ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[DB] Added terminal_devices.${col.name}`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) console.log(`[DB] terminal_devices.${col.name} skipped: ${e.message}`);
      }
    }
    console.log('[DB] v16 migration complete');
  }
  
  // ==========================================================================
  // Generic query methods
  // ==========================================================================
  
  run(sql: string, params: any[] = []): RunResult {
    return this.db.prepare(sql).run(...params);
  }
  
  get<T = any>(sql: string, params: any[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  
  all<T = any>(sql: string, params: any[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
  
  // ==========================================================================
  // Currency Helpers (avoid floating point issues)
  // ==========================================================================
  
  toCents(amount: any): number {
    if (amount === null || amount === undefined) return 0;
    if (typeof amount === 'number') {
      return Math.round(amount * 100);
    }
    if (typeof amount === 'string') {
      const parsed = parseFloat(amount);
      return isNaN(parsed) ? 0 : Math.round(parsed * 100);
    }
    return 0;
  }
  
  fromCents(cents: number): string {
    return (cents / 100).toFixed(2);
  }
  
  // ==========================================================================
  // Sync Metadata
  // ==========================================================================
  
  getSyncMetadata(key: string): { lastSyncAt: string | null; lastVersion: number; recordCount: number } | null {
    const row = this.get<{ value: string }>('SELECT value FROM sync_metadata WHERE key = ?', [key]);
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }
  
  setSyncMetadata(key: string, value: string): void {
    this.run(
      `INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, value]
    );
  }
  
  updateSyncMetadata(key: string, lastSyncAt: string, lastVersion: number, recordCount: number = 0): void {
    const value = JSON.stringify({ lastSyncAt, lastVersion, recordCount });
    this.run(
      `INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, value]
    );
  }
  
  // ==========================================================================
  // Config Cache
  // ==========================================================================
  
  setConfig(key: string, value: any, entityType?: string, entityId?: string): void {
    const json = JSON.stringify(value);
    this.run(
      `INSERT OR REPLACE INTO config_cache (key, value, entity_type, entity_id, updated_at) 
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [key, json, entityType || null, entityId || null]
    );
  }
  
  getConfig<T = any>(key: string): T | null {
    const row = this.get<{ value: string }>('SELECT value FROM config_cache WHERE key = ?', [key]);
    return row ? JSON.parse(row.value) : null;
  }
  
  deleteConfig(key: string): void {
    this.run('DELETE FROM config_cache WHERE key = ?', [key]);
  }
  
  clearConfigByType(entityType: string): void {
    this.run('DELETE FROM config_cache WHERE entity_type = ?', [entityType]);
  }
  
  // ==========================================================================
  // Enterprise Hierarchy
  // ==========================================================================
  
  upsertEnterprise(enterprise: any): void {
    this.run(
      `INSERT OR REPLACE INTO enterprises (id, name, code, active, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [enterprise.id, enterprise.name, enterprise.code, enterprise.active ? 1 : 0]
    );
  }
  
  getEnterprise(id: string): any | null {
    return this.get('SELECT * FROM enterprises WHERE id = ? AND active = 1', [id]);
  }
  
  upsertProperty(property: any): void {
    this.run(
      `INSERT OR REPLACE INTO properties (
        id, enterprise_id, name, code, address, timezone,
        business_date_rollover_time, business_date_mode, current_business_date,
        sign_in_logo_url, auto_clock_out_enabled, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        property.id, property.enterpriseId, property.name, property.code,
        property.address, property.timezone || 'America/New_York',
        property.businessDateRolloverTime || '04:00',
        property.businessDateMode || 'auto',
        property.currentBusinessDate,
        property.signInLogoUrl,
        property.autoClockOutEnabled ? 1 : 0,
        property.active !== false ? 1 : 0,
      ]
    );
  }
  
  getProperty(id: string): any | null {
    return this.get('SELECT * FROM properties WHERE id = ? AND active = 1', [id]);
  }
  
  upsertRvc(rvc: any): void {
    this.run(
      `INSERT OR REPLACE INTO rvcs (
        id, property_id, name, code, fast_transaction_default,
        default_order_type, order_type_default, dynamic_order_mode, dom_send_mode,
        active, receipt_print_mode, receipt_copies, kitchen_print_mode,
        void_receipt_print, require_guest_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        rvc.id, rvc.propertyId, rvc.name, rvc.code,
        rvc.fastTransactionDefault ? 1 : 0,
        rvc.defaultOrderType || 'dine_in',
        rvc.orderTypeDefault || 'dine_in',
        rvc.dynamicOrderMode ? 1 : 0,
        rvc.domSendMode || 'fire_on_fly',
        rvc.active !== false ? 1 : 0,
        rvc.receiptPrintMode || 'auto_on_close',
        rvc.receiptCopies ?? 1,
        rvc.kitchenPrintMode || 'auto_on_send',
        rvc.voidReceiptPrint !== false ? 1 : 0,
        rvc.requireGuestCount ? 1 : 0,
      ]
    );
  }
  
  getRvc(id: string): any | null {
    return this.get('SELECT * FROM rvcs WHERE id = ? AND active = 1', [id]);
  }
  
  getRvcsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM rvcs WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Major Groups & Family Groups
  // ==========================================================================
  
  upsertMajorGroup(mg: any): void {
    this.run(
      `INSERT OR REPLACE INTO major_groups (id, enterprise_id, property_id, name, code, display_order, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [mg.id, mg.enterpriseId, mg.propertyId, mg.name, mg.code, mg.displayOrder || 0, mg.active !== false ? 1 : 0]
    );
  }
  
  getMajorGroup(id: string): any | null {
    return this.get('SELECT * FROM major_groups WHERE id = ? AND active = 1', [id]);
  }
  
  getMajorGroupsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM major_groups WHERE property_id = ? AND active = 1 ORDER BY display_order', [propertyId]);
  }
  
  upsertFamilyGroup(fg: any): void {
    this.run(
      `INSERT OR REPLACE INTO family_groups (id, enterprise_id, property_id, major_group_id, name, code, display_order, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [fg.id, fg.enterpriseId, fg.propertyId, fg.majorGroupId, fg.name, fg.code, fg.displayOrder || 0, fg.active !== false ? 1 : 0]
    );
  }
  
  getFamilyGroup(id: string): any | null {
    return this.get('SELECT * FROM family_groups WHERE id = ? AND active = 1', [id]);
  }
  
  getFamilyGroupsByMajorGroup(majorGroupId: string): any[] {
    return this.all('SELECT * FROM family_groups WHERE major_group_id = ? AND active = 1 ORDER BY display_order', [majorGroupId]);
  }
  
  // ==========================================================================
  // Employees
  // ==========================================================================
  
  upsertEmployee(emp: any): void {
    this.run(
      `INSERT OR REPLACE INTO employees (
        id, enterprise_id, property_id, employee_number, first_name, last_name,
        pin_hash, role_id, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        emp.id, emp.enterpriseId, emp.propertyId, emp.employeeNumber,
        emp.firstName, emp.lastName, emp.pinHash, emp.roleId,
        emp.active !== false ? 1 : 0,
      ]
    );
  }
  
  getEmployee(id: string): any | null {
    return this.get('SELECT * FROM employees WHERE id = ? AND active = 1', [id]);
  }
  
  getEmployeeByNumber(empNumber: string): any | null {
    return this.get('SELECT * FROM employees WHERE employee_number = ? AND active = 1', [empNumber]);
  }
  
  getEmployeesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM employees WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }
  
  getEmployeeByPin(pinHash: string): any | null {
    return this.get('SELECT * FROM employees WHERE pin_hash = ? AND active = 1', [pinHash]);
  }
  
  upsertEmployeeAssignment(assign: any): void {
    this.run(
      `INSERT OR REPLACE INTO employee_assignments (id, employee_id, property_id, rvc_id, role_id, is_primary, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [assign.id, assign.employeeId, assign.propertyId, assign.rvcId, assign.roleId, assign.isPrimary ? 1 : 0]
    );
  }
  
  getEmployeeAssignments(employeeId: string): any[] {
    return this.all('SELECT * FROM employee_assignments WHERE employee_id = ?', [employeeId]);
  }
  
  // ==========================================================================
  // Roles & Privileges
  // ==========================================================================
  
  upsertRole(role: any): void {
    this.run(
      `INSERT OR REPLACE INTO roles (
        id, enterprise_id, property_id, rvc_id, name, code, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        role.id, role.enterpriseId, role.propertyId, role.rvcId,
        role.name, role.code, role.active !== false ? 1 : 0,
      ]
    );
  }
  
  getRole(id: string): any | null {
    return this.get('SELECT * FROM roles WHERE id = ? AND active = 1', [id]);
  }
  
  upsertPrivilege(priv: any): void {
    this.run(
      `INSERT OR REPLACE INTO privileges (id, code, name, domain, description, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [priv.id, priv.code, priv.name, priv.domain, priv.description]
    );
  }
  
  upsertRolePrivilege(rp: any): void {
    this.run(
      `INSERT OR REPLACE INTO role_privileges (id, role_id, privilege_code, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [rp.id, rp.roleId, rp.privilegeCode]
    );
  }
  
  getRolePrivileges(roleId: string): string[] {
    const rows = this.all<{ privilege_code: string }>(
      'SELECT privilege_code FROM role_privileges WHERE role_id = ?',
      [roleId]
    );
    return rows.map(r => r.privilege_code);
  }
  
  getRolesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM roles WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Print Classes
  // ==========================================================================
  
  upsertPrintClass(pc: any): void {
    this.run(
      `INSERT OR REPLACE INTO print_classes (id, enterprise_id, property_id, rvc_id, name, code, display_order, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [pc.id, pc.enterpriseId, pc.propertyId, pc.rvcId || pc.rvc_id || null, pc.name, pc.code, pc.displayOrder || 0, pc.active !== false ? 1 : 0]
    );
  }
  
  getPrintClass(id: string): any | null {
    return this.get('SELECT * FROM print_classes WHERE id = ? AND active = 1', [id]);
  }
  
  getPrintClassesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM print_classes WHERE property_id = ? AND active = 1 ORDER BY display_order', [propertyId]);
  }
  
  // ==========================================================================
  // Menu Items
  // ==========================================================================
  
  upsertMenuItem(item: any): void {
    const priceInCents = this.toCents(item.price);
    this.run(
      `INSERT OR REPLACE INTO menu_items (
        id, enterprise_id, property_id, rvc_id, name, short_name, price,
        tax_group_id, print_class_id, major_group_id, family_group_id, color, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        item.id, item.enterpriseId, item.propertyId, item.rvcId,
        item.name, item.shortName, priceInCents,
        item.taxGroupId, item.printClassId, item.majorGroupId, item.familyGroupId,
        item.color || '#3B82F6', item.active !== false ? 1 : 0,
      ]
    );
  }
  
  getMenuItem(id: string): any | null {
    return this.get('SELECT * FROM menu_items WHERE id = ? AND active = 1', [id]);
  }
  
  getAllMenuItems(): any[] {
    return this.all('SELECT * FROM menu_items WHERE active = 1', []);
  }
  
  getMenuItemsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM menu_items WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  getMenuItemWithModifiers(menuItemId: string): any | null {
    return this.getFullMenuItemWithModifiers(menuItemId);
  }
  
  getMenuItemsBySlu(sluId: string): any[] {
    return this.all(
      `SELECT mi.* FROM menu_items mi
       JOIN menu_item_slus mis ON mi.id = mis.menu_item_id
       WHERE mis.slu_id = ? AND mi.active = 1
       ORDER BY mis.display_order`,
      [sluId]
    );
  }
  
  // ==========================================================================
  // SLUs (Screen Lookup Units)
  // ==========================================================================
  
  upsertSlu(slu: any): void {
    this.run(
      `INSERT OR REPLACE INTO slus (
        id, enterprise_id, property_id, rvc_id, name, button_label,
        display_order, color, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        slu.id, slu.enterpriseId, slu.propertyId, slu.rvcId,
        slu.name, slu.buttonLabel, slu.displayOrder || 0,
        slu.color || '#3B82F6', slu.active !== false ? 1 : 0,
      ]
    );
  }
  
  getSlusByRvc(rvcId: string): any[] {
    return this.all(
      'SELECT * FROM slus WHERE rvc_id = ? AND active = 1 ORDER BY display_order',
      [rvcId]
    );
  }
  
  getSlusByProperty(propertyId: string): any[] {
    return this.all(
      'SELECT * FROM slus WHERE (property_id = ? OR property_id IS NULL) AND active = 1 ORDER BY display_order',
      [propertyId]
    );
  }
  
  // ==========================================================================
  // Menu Item SLU Links
  // ==========================================================================
  
  upsertMenuItemSlu(link: any): void {
    this.run(
      `INSERT OR REPLACE INTO menu_item_slus (id, menu_item_id, slu_id, display_order, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [link.id, link.menuItemId, link.sluId, link.displayOrder || 0]
    );
  }
  
  // ==========================================================================
  // Modifier Groups
  // ==========================================================================
  
  upsertModifierGroup(mg: any): void {
    this.run(
      `INSERT OR REPLACE INTO modifier_groups (
        id, enterprise_id, property_id, name, code, required,
        min_select, max_select, display_order, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        mg.id, mg.enterpriseId ?? mg.enterprise_id, mg.propertyId ?? mg.property_id, mg.name, mg.code,
        mg.required ? 1 : 0, mg.minSelect ?? mg.min_select ?? mg.minSelections ?? mg.min_selections ?? 0, mg.maxSelect ?? mg.max_select ?? mg.maxSelections ?? mg.max_selections ?? 99,
        mg.displayOrder ?? mg.display_order ?? 0, mg.active !== false ? 1 : 0
      ]
    );
  }
  
  getModifierGroup(id: string): any | null {
    return this.get('SELECT * FROM modifier_groups WHERE id = ? AND active = 1', [id]);
  }
  
  getModifierGroupsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM modifier_groups WHERE (property_id = ? OR property_id IS NULL) AND active = 1 ORDER BY display_order', [propertyId]);
  }
  
  // ==========================================================================
  // Modifiers
  // ==========================================================================
  
  upsertModifier(mod: any): void {
    this.run(
      `INSERT OR REPLACE INTO modifiers (
        id, enterprise_id, property_id, rvc_id, name, price_delta, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        mod.id, mod.enterpriseId, mod.propertyId, mod.rvcId || mod.rvc_id || null,
        mod.name, mod.priceDelta || 0, mod.active !== false ? 1 : 0
      ]
    );
  }
  
  getModifier(id: string): any | null {
    return this.get('SELECT * FROM modifiers WHERE id = ? AND active = 1', [id]);
  }
  
  getModifiersByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM modifiers WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Modifier Group Modifiers (which modifiers belong to which groups)
  // ==========================================================================
  
  upsertModifierGroupModifier(link: any): void {
    this.run(
      `INSERT OR REPLACE INTO modifier_group_modifiers (
        id, modifier_group_id, modifier_id, is_default, display_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [link.id, link.modifierGroupId, link.modifierId, link.isDefault ? 1 : 0, link.displayOrder || 0]
    );
  }
  
  getModifiersForGroup(modifierGroupId: string): any[] {
    return this.all(
      `SELECT m.*, mgm.is_default, mgm.display_order 
       FROM modifiers m
       JOIN modifier_group_modifiers mgm ON m.id = mgm.modifier_id
       WHERE mgm.modifier_group_id = ? AND m.active = 1
       ORDER BY mgm.display_order`,
      [modifierGroupId]
    );
  }
  
  // ==========================================================================
  // Menu Item Modifier Groups (which modifier groups are assigned to which items)
  // ==========================================================================
  
  upsertMenuItemModifierGroup(link: any): void {
    this.run(
      `INSERT OR REPLACE INTO menu_item_modifier_groups (
        id, menu_item_id, modifier_group_id, display_order, sort_order, min_required, max_allowed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [link.id, link.menuItemId ?? link.menu_item_id, link.modifierGroupId ?? link.modifier_group_id, link.displayOrder ?? link.display_order ?? 0, link.sortOrder ?? link.sort_order ?? link.displayOrder ?? link.display_order ?? 0, link.minRequired ?? link.min_required ?? 0, link.maxAllowed ?? link.max_allowed ?? 0]
    );
  }
  
  getModifierGroupsForMenuItem(menuItemId: string): any[] {
    return this.all(
      `SELECT mg.*, mimg.display_order as assignment_order,
              mimg.min_required, mimg.max_allowed
       FROM modifier_groups mg
       JOIN menu_item_modifier_groups mimg ON mg.id = mimg.modifier_group_id
       WHERE mimg.menu_item_id = ? AND mg.active = 1
       ORDER BY mimg.display_order`,
      [menuItemId]
    );
  }
  
  getFullMenuItemWithModifiers(menuItemId: string): any | null {
    const item = this.get('SELECT * FROM menu_items WHERE id = ?', [menuItemId]);
    if (!item) return null;
    
    const modifierGroups = this.getModifierGroupsForMenuItem(menuItemId);
    for (const group of modifierGroups) {
      group.modifiers = this.getModifiersForGroup(group.id);
    }
    
    return { ...item, modifierGroups };
  }
  
  // ==========================================================================
  // Tax Groups
  // ==========================================================================
  
  upsertTaxGroup(tg: any): void {
    const rateStr = String(tg.rate || '0');
    this.run(
      `INSERT OR REPLACE INTO tax_groups (
        id, enterprise_id, property_id, rvc_id, name, rate, tax_mode, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        tg.id, tg.enterpriseId, tg.propertyId, tg.rvcId,
        tg.name, rateStr, tg.taxMode || 'add_on',
        tg.active !== false ? 1 : 0,
      ]
    );
  }
  
  getTaxGroup(id: string): any | null {
    return this.get('SELECT * FROM tax_groups WHERE id = ? AND active = 1', [id]);
  }
  
  getTaxGroupsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM tax_groups WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }
  
  getTaxGroupsByRvc(rvcId: string): any[] {
    return this.all('SELECT * FROM tax_groups WHERE rvc_id = ? AND active = 1', [rvcId]);
  }
  
  // ==========================================================================
  // Tenders
  // ==========================================================================
  
  upsertTender(tender: any): void {
    this.run(
      `INSERT OR REPLACE INTO tenders (
        id, enterprise_id, property_id, rvc_id, name, code, type,
        payment_processor_id, is_system, pop_drawer, allow_tips,
        allow_over_tender, print_check_on_payment, require_manager_approval,
        requires_payment_processor, display_order,
        is_cash_media, is_card_media, is_gift_media,
        active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        tender.id, tender.enterpriseId, tender.propertyId, tender.rvcId,
        tender.name, tender.code, tender.type, tender.paymentProcessorId,
        tender.isSystem ? 1 : 0,
        tender.popDrawer ? 1 : 0,
        tender.allowTips ? 1 : 0,
        tender.allowOverTender ? 1 : 0,
        tender.printCheckOnPayment !== false ? 1 : 0,
        tender.requireManagerApproval ? 1 : 0,
        tender.requiresPaymentProcessor ? 1 : 0,
        tender.displayOrder || 0,
        tender.isCashMedia ? 1 : 0,
        tender.isCardMedia ? 1 : 0,
        tender.isGiftMedia ? 1 : 0,
        tender.active !== false ? 1 : 0,
      ]
    );
  }
  
  getTender(id: string): any | null {
    return this.get('SELECT * FROM tenders WHERE id = ? AND active = 1', [id]);
  }
  
  getTendersByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM tenders WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }
  
  getTendersByRvc(rvcId: string): any[] {
    return this.all('SELECT * FROM tenders WHERE rvc_id = ? AND active = 1', [rvcId]);
  }
  
  getTendersByType(propertyId: string, type: string): any[] {
    return this.all('SELECT * FROM tenders WHERE property_id = ? AND type = ? AND active = 1', [propertyId, type]);
  }
  
  getTendersByCashMedia(propertyId: string): any[] {
    return this.all('SELECT * FROM tenders WHERE property_id = ? AND is_cash_media = 1 AND active = 1', [propertyId]);
  }
  
  getTendersByCardMedia(propertyId: string): any[] {
    return this.all('SELECT * FROM tenders WHERE property_id = ? AND is_card_media = 1 AND active = 1', [propertyId]);
  }
  
  getDefaultCardTender(propertyId?: string): any | null {
    if (propertyId) {
      const t = this.get('SELECT * FROM tenders WHERE property_id = ? AND is_card_media = 1 AND active = 1 ORDER BY display_order ASC LIMIT 1', [propertyId]);
      if (t) return t;
    }
    return this.get("SELECT * FROM tenders WHERE is_card_media = 1 AND active = 1 ORDER BY display_order ASC LIMIT 1");
  }
  
  // ==========================================================================
  // EMC Option Flags
  // ==========================================================================
  
  upsertOptionFlag(flag: any): void {
    this.run(
      `INSERT OR REPLACE INTO emc_option_flags (
        id, enterprise_id, entity_type, entity_id, option_key, value_text,
        scope_level, scope_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        flag.id, flag.enterpriseId, flag.entityType, flag.entityId,
        flag.optionKey, flag.valueText,
        flag.scopeLevel, flag.scopeId,
        flag.createdAt || new Date().toISOString(),
      ]
    );
  }
  
  getOptionFlags(enterpriseId?: string): any[] {
    if (enterpriseId) {
      return this.all('SELECT * FROM emc_option_flags WHERE enterprise_id = ?', [enterpriseId]);
    }
    return this.all('SELECT * FROM emc_option_flags');
  }
  
  resolveOptionFlag(
    entityType: string,
    entityId: string,
    optionKey: string,
    scopeChain: { level: string; id: string }[]
  ): string | null {
    for (const scope of scopeChain) {
      const row = this.get<{ value_text: string }>(
        `SELECT value_text FROM emc_option_flags
         WHERE entity_type = ? AND entity_id = ? AND option_key = ? AND scope_level = ? AND scope_id = ?`,
        [entityType, entityId, optionKey, scope.level, scope.id]
      );
      if (row) return row.value_text;
    }
    return null;
  }
  
  deleteOptionFlag(id: string): void {
    this.run('DELETE FROM emc_option_flags WHERE id = ?', [id]);
  }
  
  // ==========================================================================
  // Discounts
  // ==========================================================================
  
  upsertDiscount(discount: any): void {
    const amountStr = String(discount.value || discount.amount || '0');
    this.run(
      `INSERT OR REPLACE INTO discounts (
        id, enterprise_id, property_id, rvc_id, name, code,
        discount_type, amount, requires_manager_approval, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        discount.id, discount.enterpriseId, discount.propertyId, discount.rvcId,
        discount.name, discount.code, discount.type || discount.discountType || 'percent',
        amountStr, discount.requiresManagerApproval ? 1 : 0,
        discount.active !== false ? 1 : 0,
      ]
    );
  }
  
  getDiscount(id: string): any | null {
    return this.get('SELECT * FROM discounts WHERE id = ? AND active = 1', [id]);
  }
  
  getDiscountsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM discounts WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }
  
  getDiscountsByRvc(rvcId: string): any[] {
    return this.all('SELECT * FROM discounts WHERE rvc_id = ? AND active = 1', [rvcId]);
  }
  
  // ==========================================================================
  // Service Charges
  // ==========================================================================
  
  upsertServiceCharge(sc: any): void {
    const amountStr = String(sc.amount || '0');
    this.run(
      `INSERT OR REPLACE INTO service_charges (
        id, enterprise_id, property_id, rvc_id, name, code,
        charge_type, amount, apply_to_subtotal, apply_to_discounted,
        taxable, tax_group_id, auto_apply, auto_apply_guest_count, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        sc.id, sc.enterpriseId, sc.propertyId, sc.rvcId,
        sc.name, sc.code, sc.chargeType || 'percent', amountStr,
        sc.applyToSubtotal !== false ? 1 : 0, sc.applyToDiscounted !== false ? 1 : 0,
        sc.taxable ? 1 : 0, sc.taxGroupId, sc.autoApply ? 1 : 0,
        sc.autoApplyGuestCount, sc.active !== false ? 1 : 0,
      ]
    );
  }
  
  getServiceCharge(id: string): any | null {
    return this.get('SELECT * FROM service_charges WHERE id = ? AND active = 1', [id]);
  }
  
  getServiceChargesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM service_charges WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }
  
  getServiceChargesByRvc(rvcId: string): any[] {
    return this.all('SELECT * FROM service_charges WHERE rvc_id = ? AND active = 1', [rvcId]);
  }
  
  getAutoApplyServiceCharges(propertyId: string, guestCount?: number): any[] {
    if (guestCount) {
      return this.all(
        `SELECT * FROM service_charges 
         WHERE property_id = ? AND active = 1 AND auto_apply = 1 
         AND (auto_apply_guest_count IS NULL OR auto_apply_guest_count <= ?)`,
        [propertyId, guestCount]
      );
    }
    return this.all(
      'SELECT * FROM service_charges WHERE property_id = ? AND active = 1 AND auto_apply = 1',
      [propertyId]
    );
  }
  
  // ==========================================================================
  // Effective Config Resolution (Enterprise → Property → RVC)
  // ==========================================================================

  private resolveEffective(tableName: string, propertyId: string, rvcId?: string): any[] {
    const enterpriseRows = this.all(
      `SELECT *, 'enterprise' as _scope_level FROM ${tableName} WHERE property_id IS NULL AND rvc_id IS NULL AND active = 1`
    );
    const propertyRows = this.all(
      `SELECT *, 'property' as _scope_level FROM ${tableName} WHERE property_id = ? AND (rvc_id IS NULL OR rvc_id = '') AND active = 1`,
      [propertyId]
    );
    const rvcRows = rvcId ? this.all(
      `SELECT *, 'rvc' as _scope_level FROM ${tableName} WHERE rvc_id = ? AND active = 1`,
      [rvcId]
    ) : [];

    const resolved = new Map<string, any>();

    for (const row of enterpriseRows) {
      const key = row.code || row.name || row.id;
      resolved.set(key, row);
    }
    for (const row of propertyRows) {
      const key = row.code || row.name || row.id;
      resolved.set(key, row);
    }
    for (const row of rvcRows) {
      const key = row.code || row.name || row.id;
      resolved.set(key, row);
    }

    return Array.from(resolved.values());
  }

  getEffectiveTenders(propertyId: string, rvcId?: string): any[] {
    return this.resolveEffective('tenders', propertyId, rvcId);
  }

  getEffectiveDiscounts(propertyId: string, rvcId?: string): any[] {
    return this.resolveEffective('discounts', propertyId, rvcId);
  }

  getEffectiveTaxGroups(propertyId: string, rvcId?: string): any[] {
    return this.resolveEffective('tax_groups', propertyId, rvcId);
  }

  getEffectiveServiceCharges(propertyId: string, rvcId?: string): any[] {
    return this.resolveEffective('service_charges', propertyId, rvcId);
  }

  getEffectiveRoles(propertyId: string, rvcId?: string): any[] {
    return this.resolveEffective('roles', propertyId, rvcId);
  }

  getEmployeeAssignmentForRvc(employeeId: string, rvcId: string): any | null {
    const rvcAssignment = this.get(
      'SELECT * FROM employee_assignments WHERE employee_id = ? AND rvc_id = ?',
      [employeeId, rvcId]
    );
    if (rvcAssignment) return rvcAssignment;

    const primaryAssignment = this.get(
      'SELECT * FROM employee_assignments WHERE employee_id = ? AND (is_primary = 1 OR is_primary IS NULL) ORDER BY is_primary DESC LIMIT 1',
      [employeeId]
    );
    return primaryAssignment || null;
  }

  // ==========================================================================
  // Device Configuration
  // ==========================================================================
  
  upsertWorkstation(ws: any): void {
    this.run(
      `INSERT OR REPLACE INTO workstations (
        id, property_id, rvc_id, name, device_type, default_order_type,
        fast_transaction_enabled, require_begin_check, allow_pickup_check,
        allow_reopen_closed_checks, allow_offline_operation,
        offline_check_number_start, offline_check_number_end,
        allowed_role_ids,
        manager_approval_device, clock_in_allowed,
        default_receipt_printer_id, backup_receipt_printer_id,
        report_printer_id, backup_report_printer_id,
        void_printer_id, backup_void_printer_id,
        default_order_device_id, default_kds_expo_id,
        ip_address, hostname, is_online, last_seen_at,
        auto_logout_minutes, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        ws.id, ws.propertyId, ws.rvcId, ws.name,
        ws.deviceType || 'pos_terminal', ws.defaultOrderType || 'dine_in',
        ws.fastTransactionEnabled ? 1 : 0, ws.requireBeginCheck !== false ? 1 : 0,
        ws.allowPickupCheck !== false ? 1 : 0, ws.allowReopenClosedChecks ? 1 : 0,
        ws.allowOfflineOperation ? 1 : 0,
        ws.offlineCheckNumberStart || null, ws.offlineCheckNumberEnd || null,
        ws.allowedRoleIds ? JSON.stringify(ws.allowedRoleIds) : null,
        ws.managerApprovalDevice ? 1 : 0, ws.clockInAllowed !== false ? 1 : 0,
        ws.defaultReceiptPrinterId, ws.backupReceiptPrinterId,
        ws.reportPrinterId, ws.backupReportPrinterId,
        ws.voidPrinterId, ws.backupVoidPrinterId,
        ws.defaultOrderDeviceId, ws.defaultKdsExpoId,
        ws.ipAddress, ws.hostname, ws.isOnline ? 1 : 0, ws.lastSeenAt,
        ws.autoLogoutMinutes, ws.active !== false ? 1 : 0,
      ]
    );
    if (ws.offlineCheckNumberStart && ws.offlineCheckNumberEnd) {
      this.setWorkstationConfig(ws.id, ws.offlineCheckNumberStart, ws.offlineCheckNumberEnd);
    } else {
      this.clearWorkstationConfig(ws.id);
    }
  }
  
  getWorkstation(id: string): any | null {
    return this.get('SELECT * FROM workstations WHERE id = ? AND active = 1', [id]);
  }
  
  getWorkstationsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM workstations WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  upsertPrinter(printer: any): void {
    this.run(
      `INSERT OR REPLACE INTO printers (
        id, property_id, name, printer_type, connection_type,
        ip_address, subnet_mask, port, driver_protocol, model, character_width,
        auto_cut, print_logo, print_order_header, print_order_footer,
        print_voids, print_reprints, retry_attempts, failure_handling_mode,
        is_online, last_seen_at, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        printer.id, printer.propertyId, printer.name,
        printer.printerType || 'kitchen', printer.connectionType || 'network',
        printer.ipAddress, printer.subnetMask || '255.255.255.0',
        printer.port || 9100, printer.driverProtocol || 'epson',
        printer.model, printer.characterWidth || 42,
        printer.autoCut !== false ? 1 : 0, printer.printLogo ? 1 : 0,
        printer.printOrderHeader !== false ? 1 : 0, printer.printOrderFooter !== false ? 1 : 0,
        printer.printVoids !== false ? 1 : 0, printer.printReprints !== false ? 1 : 0,
        printer.retryAttempts || 3, printer.failureHandlingMode || 'alert_cashier',
        printer.isOnline ? 1 : 0, printer.lastSeenAt,
        printer.active !== false ? 1 : 0,
      ]
    );
  }
  
  getPrinter(id: string): any | null {
    return this.get('SELECT * FROM printers WHERE id = ? AND active = 1', [id]);
  }
  
  getPrintersByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM printers WHERE property_id = ? AND active = 1', [propertyId]);
  }

  // ==========================================================================
  // Print Queue - Lease Management
  // ==========================================================================

  claimPrintJob(agentId: string): any | null {
    const now = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + 30000).toISOString(); // 30 second lease
    const leaseId = randomUUID();

    // Find and claim the oldest pending job without an active lease
    const job = this.get<any>(
      `SELECT * FROM print_queue 
       WHERE status = 'pending' 
       AND (lease_expires_at IS NULL OR lease_expires_at < ?)
       ORDER BY priority DESC, created_at ASC 
       LIMIT 1`,
      [now]
    );

    if (!job) return null;

    // Claim the job with a lease
    this.run(
      `UPDATE print_queue 
       SET lease_id = ?, lease_expires_at = ?, status = 'claimed'
       WHERE id = ?`,
      [leaseId, leaseExpiresAt, job.id]
    );

    return { ...job, leaseId, leaseExpiresAt };
  }

  ackPrintJob(jobId: string, success: boolean, error?: string): void {
    if (success) {
      this.run(
        `UPDATE print_queue 
         SET status = 'completed', completed_at = datetime('now'), lease_id = NULL, lease_expires_at = NULL
         WHERE id = ?`,
        [jobId]
      );
    } else {
      this.run(
        `UPDATE print_queue 
         SET status = 'pending', error_message = ?, lease_id = NULL, lease_expires_at = NULL, attempts = attempts + 1
         WHERE id = ?`,
        [error || 'Unknown error', jobId]
      );
    }
  }

  recoverExpiredLeases(): number {
    const now = new Date().toISOString();
    
    // Reset jobs with expired leases back to pending
    const result = this.run(
      `UPDATE print_queue 
       SET status = 'pending', lease_id = NULL, lease_expires_at = NULL
       WHERE status = 'claimed' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?`,
      [now]
    );

    return result.changes;
  }
  
  upsertKdsDevice(kds: any): void {
    this.run(
      `INSERT OR REPLACE INTO kds_devices (
        id, property_id, name, station_type,
        show_draft_items, show_sent_items_only, group_by, show_timers, auto_sort_by,
        allow_bump, allow_recall, allow_void_display, expo_mode,
        new_order_sound, new_order_blink_seconds,
        color_alert_1_enabled, color_alert_1_seconds, color_alert_1_color,
        color_alert_2_enabled, color_alert_2_seconds, color_alert_2_color,
        color_alert_3_enabled, color_alert_3_seconds, color_alert_3_color,
        ws_channel, ip_address, is_online, last_seen_at, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        kds.id, kds.propertyId, kds.name, kds.stationType || 'hot',
        kds.showDraftItems ? 1 : 0, kds.showSentItemsOnly !== false ? 1 : 0,
        kds.groupBy || 'order', kds.showTimers !== false ? 1 : 0, kds.autoSortBy || 'time',
        kds.allowBump !== false ? 1 : 0, kds.allowRecall !== false ? 1 : 0,
        kds.allowVoidDisplay !== false ? 1 : 0, kds.expoMode ? 1 : 0,
        kds.newOrderSound !== false ? 1 : 0, kds.newOrderBlinkSeconds ?? 5,
        kds.colorAlert1Enabled !== false ? 1 : 0, kds.colorAlert1Seconds ?? 60, kds.colorAlert1Color || 'yellow',
        kds.colorAlert2Enabled !== false ? 1 : 0, kds.colorAlert2Seconds ?? 180, kds.colorAlert2Color || 'orange',
        kds.colorAlert3Enabled !== false ? 1 : 0, kds.colorAlert3Seconds ?? 300, kds.colorAlert3Color || 'red',
        kds.wsChannel, kds.ipAddress, kds.isOnline ? 1 : 0, kds.lastSeenAt,
        kds.active !== false ? 1 : 0,
      ]
    );
  }
  
  getKdsDevice(id: string): any | null {
    return this.get('SELECT * FROM kds_devices WHERE id = ? AND active = 1', [id]);
  }
  
  getKdsDevicesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM kds_devices WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Order Devices & Routing
  // ==========================================================================
  
  upsertOrderDevice(od: any): void {
    this.run(
      `INSERT OR REPLACE INTO order_devices (
        id, property_id, name, code, kds_device_id, send_on, send_voids, send_reprints, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        od.id, od.propertyId, od.name, od.code, od.kdsDeviceId,
        od.sendOn || 'send_button', od.sendVoids !== false ? 1 : 0, od.sendReprints !== false ? 1 : 0,
        od.active !== false ? 1 : 0,
      ]
    );
  }
  
  getOrderDevice(id: string): any | null {
    return this.get('SELECT * FROM order_devices WHERE id = ? AND active = 1', [id]);
  }
  
  upsertOrderDevicePrinter(odp: any): void {
    this.run(
      `INSERT OR REPLACE INTO order_device_printers (id, order_device_id, printer_id, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [odp.id, odp.orderDeviceId, odp.printerId]
    );
  }
  
  getOrderDevicePrinters(orderDeviceId: string): any[] {
    return this.all('SELECT * FROM order_device_printers WHERE order_device_id = ?', [orderDeviceId]);
  }
  
  upsertOrderDeviceKds(odk: any): void {
    this.run(
      `INSERT OR REPLACE INTO order_device_kds (id, order_device_id, kds_device_id, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [odk.id, odk.orderDeviceId, odk.kdsDeviceId]
    );
  }
  
  getOrderDeviceKds(orderDeviceId: string): any[] {
    return this.all('SELECT * FROM order_device_kds WHERE order_device_id = ?', [orderDeviceId]);
  }
  
  getOrderDevicesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM order_devices WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  upsertPrintClassRouting(pcr: any): void {
    this.run(
      `INSERT OR REPLACE INTO print_class_routing (id, print_class_id, order_device_id, property_id, rvc_id, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [pcr.id, pcr.printClassId, pcr.orderDeviceId, pcr.propertyId, pcr.rvcId]
    );
  }
  
  getOrderDevicesForPrintClass(printClassId: string, propertyId?: string, rvcId?: string): any[] {
    let sql = `
      SELECT od.* FROM order_devices od
      JOIN print_class_routing pcr ON od.id = pcr.order_device_id
      WHERE pcr.print_class_id = ? AND od.active = 1
    `;
    const params: any[] = [printClassId];
    
    if (rvcId) {
      sql += ' AND (pcr.rvc_id = ? OR pcr.rvc_id IS NULL)';
      params.push(rvcId);
    }
    if (propertyId) {
      sql += ' AND (pcr.property_id = ? OR pcr.property_id IS NULL)';
      params.push(propertyId);
    }
    
    return this.all(sql, params);
  }
  
  // ==========================================================================
  // Transaction Journal (Immutable — append-only, never update payload or delete)
  // ==========================================================================
  
  writeJournalEntry(entry: {
    eventId: string;
    txnGroupId: string;
    deviceId: string;
    rvcId: string;
    businessDate: string;
    checkId: string;
    eventType: string;
    payloadJson: string;
    configVersion?: string;
  }): void {
    this.run(
      `INSERT INTO transaction_journal (event_id, txn_group_id, device_id, rvc_id, business_date, check_id, event_type, payload_json, config_version, sync_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        entry.eventId, entry.txnGroupId, entry.deviceId, entry.rvcId,
        entry.businessDate, entry.checkId, entry.eventType, entry.payloadJson,
        entry.configVersion || null,
      ]
    );
  }
  
  getUnsyncedJournalEntries(limit: number = 10): JournalEntry[] {
    return this.all<JournalEntry>(
      `SELECT * FROM transaction_journal 
       WHERE sync_state = 'pending' 
       ORDER BY created_at ASC 
       LIMIT ?`,
      [limit]
    );
  }
  
  markJournalSynced(eventId: string): void {
    this.run(
      `UPDATE transaction_journal SET sync_state = 'synced', synced_at = datetime('now') WHERE event_id = ?`,
      [eventId]
    );
  }
  
  markJournalFailed(eventId: string): void {
    this.run(
      `UPDATE transaction_journal SET sync_state = 'failed', sync_attempts = sync_attempts + 1 WHERE event_id = ?`,
      [eventId]
    );
  }
  
  getJournalByCheck(checkId: string): JournalEntry[] {
    return this.all<JournalEntry>(
      `SELECT * FROM transaction_journal WHERE check_id = ? ORDER BY created_at ASC`,
      [checkId]
    );
  }
  
  getJournalByTxnGroup(txnGroupId: string): JournalEntry[] {
    return this.all<JournalEntry>(
      `SELECT * FROM transaction_journal WHERE txn_group_id = ? ORDER BY created_at ASC`,
      [txnGroupId]
    );
  }
  
  getJournalStats(businessDate: string): { total: number; pending: number; synced: number; failed: number; byEventType: Record<string, number> } {
    const counts = this.all<{ sync_state: string; cnt: number }>(
      `SELECT sync_state, COUNT(*) as cnt FROM transaction_journal WHERE business_date = ? GROUP BY sync_state`,
      [businessDate]
    );
    
    const byEventType: Record<string, number> = {};
    const eventCounts = this.all<{ event_type: string; cnt: number }>(
      `SELECT event_type, COUNT(*) as cnt FROM transaction_journal WHERE business_date = ? GROUP BY event_type`,
      [businessDate]
    );
    for (const row of eventCounts) {
      byEventType[row.event_type] = row.cnt;
    }
    
    let total = 0, pending = 0, synced = 0, failed = 0;
    for (const row of counts) {
      total += row.cnt;
      if (row.sync_state === 'pending') pending = row.cnt;
      else if (row.sync_state === 'synced') synced = row.cnt;
      else if (row.sync_state === 'failed') failed = row.cnt;
    }
    
    return { total, pending, synced, failed, byEventType };
  }
  
  getJournalEntryCount(): number {
    const row = this.get<{ count: number }>('SELECT COUNT(*) as count FROM transaction_journal');
    return row?.count ?? 0;
  }
  
  // ==========================================================================
  // Sync Queue
  // ==========================================================================
  
  addToSyncQueue(entityType: string, entityId: string, action: string, payload: any, priority: number = 0): void {
    this.run(
      `INSERT INTO sync_queue (entity_type, entity_id, action, payload, priority, next_attempt_at) 
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [entityType, entityId, action, JSON.stringify(payload), priority]
    );
  }
  
  getPendingSyncItems(limit: number = 100): SyncQueueItem[] {
    return this.all<SyncQueueItem>(
      `SELECT * FROM sync_queue 
       WHERE attempts < max_attempts 
         AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
       ORDER BY priority DESC, created_at ASC 
       LIMIT ?`,
      [limit]
    );
  }
  
  markSyncAttempt(id: number, error?: string): void {
    const backoffSeconds = 60; // Simple backoff
    this.run(
      `UPDATE sync_queue 
       SET attempts = attempts + 1, 
           last_attempt_at = datetime('now'), 
           next_attempt_at = datetime('now', '+' || (attempts * ?) || ' seconds'),
           error_message = ? 
       WHERE id = ?`,
      [backoffSeconds, error || null, id]
    );
  }
  
  removeSyncItem(id: number): void {
    this.run('DELETE FROM sync_queue WHERE id = ?', [id]);
  }
  
  getSyncQueueCount(): number {
    const row = this.get<{ count: number }>('SELECT COUNT(*) as count FROM sync_queue WHERE attempts < max_attempts');
    return row?.count ?? 0;
  }
  
  // ==========================================================================
  // Check Locking
  // ==========================================================================
  
  acquireLock(checkId: string, workstationId: string, employeeId: string, durationSeconds: number = 300): boolean {
    this.run(`DELETE FROM check_locks WHERE expires_at < datetime('now')`);
    
    const existing = this.get<{ workstation_id: string }>(
      'SELECT workstation_id FROM check_locks WHERE check_id = ?',
      [checkId]
    );
    
    if (existing && existing.workstation_id !== workstationId) {
      return false;
    }
    
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    this.run(
      `INSERT OR REPLACE INTO check_locks (check_id, workstation_id, employee_id, lock_type, locked_at, expires_at)
       VALUES (?, ?, ?, 'active', datetime('now'), ?)`,
      [checkId, workstationId, employeeId, expiresAt]
    );
    
    return true;
  }
  
  releaseLock(checkId: string, workstationId: string): void {
    this.run(
      'DELETE FROM check_locks WHERE check_id = ? AND workstation_id = ?',
      [checkId, workstationId]
    );
  }
  
  getLock(checkId: string): CheckLock | null {
    const row = this.get<any>(
      `SELECT check_id, workstation_id, employee_id, lock_type, locked_at, expires_at 
       FROM check_locks WHERE check_id = ? AND expires_at > datetime('now')`,
      [checkId]
    );
    
    if (!row) return null;
    
    return {
      checkId: row.check_id,
      workstationId: row.workstation_id,
      employeeId: row.employee_id,
      lockType: row.lock_type,
      lockedAt: row.locked_at,
      expiresAt: row.expires_at,
    };
  }
  
  releaseAllLocks(workstationId: string): void {
    this.run('DELETE FROM check_locks WHERE workstation_id = ?', [workstationId]);
  }
  
  // ==========================================================================
  // Workstation Config (Check Number Ranges)
  // ==========================================================================
  
  getWorkstationConfig(workstationId: string): WorkstationConfig | null {
    const row = this.get<any>(
      'SELECT * FROM workstation_config WHERE workstation_id = ?',
      [workstationId]
    );
    
    if (!row) return null;
    
    return {
      workstationId: row.workstation_id,
      checkNumberStart: row.check_number_start,
      checkNumberEnd: row.check_number_end,
      currentCheckNumber: row.current_check_number,
      offlineModeEnabled: row.offline_mode_enabled === 1,
      lastSyncAt: row.last_sync_at,
      lastSeenAt: row.last_seen_at,
    };
  }
  
  clearWorkstationConfig(workstationId: string): void {
    try {
      this.run('DELETE FROM workstation_config WHERE workstation_id = ?', [workstationId]);
    } catch {
    }
  }

  setWorkstationConfig(workstationId: string, start: number, end: number, current?: number): void {
    const existing = this.getWorkstationConfig(workstationId);
    if (existing && existing.checkNumberStart === start && existing.checkNumberEnd === end) {
      this.run(
        `UPDATE workstation_config SET last_seen_at = datetime('now') WHERE workstation_id = ?`,
        [workstationId]
      );
      return;
    }
    const currentNumber = current || (existing && existing.checkNumberStart === start ? existing.currentCheckNumber : start);
    this.run(
      `INSERT OR REPLACE INTO workstation_config 
       (workstation_id, check_number_start, check_number_end, current_check_number, last_seen_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [workstationId, start, end, currentNumber]
    );
  }
  
  getNextCheckNumber(workstationId: string): number | null {
    const config = this.getWorkstationConfig(workstationId);
    if (!config) return null;
    
    if (config.currentCheckNumber > config.checkNumberEnd) {
      return null; // Range exhausted
    }
    
    const checkNumber = config.currentCheckNumber;
    
    this.run(
      `UPDATE workstation_config 
       SET current_check_number = current_check_number + 1, last_seen_at = datetime('now') 
       WHERE workstation_id = ?`,
      [workstationId]
    );
    
    return checkNumber;
  }
  
  // ==========================================================================
  // Print Queue
  // ==========================================================================
  
  addPrintJob(printerId: string, printerIp: string, printerPort: number, jobType: string, content: Buffer, priority: number = 0): string {
    const id = crypto.randomUUID();
    this.run(
      `INSERT INTO print_queue (id, printer_id, printer_ip, printer_port, job_type, content, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, printerId, printerIp, printerPort, jobType, content, priority]
    );
    return id;
  }
  
  getPendingPrintJobs(limit: number = 10): any[] {
    return this.all(
      `SELECT * FROM print_queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT ?`,
      [limit]
    );
  }
  
  updatePrintJobStatus(id: string, status: string, error?: string): void {
    this.run(
      `UPDATE print_queue SET status = ?, error_message = ?, 
       completed_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE completed_at END,
       attempts = CASE WHEN ? = 'failed' THEN attempts + 1 ELSE attempts END
       WHERE id = ?`,
      [status, error || null, status, status, id]
    );
  }
  
  retryPrintJob(id: string): void {
    this.run(
      `UPDATE print_queue SET status = 'pending', error_message = NULL WHERE id = ? AND attempts < 5`,
      [id]
    );
  }
  
  // ==========================================================================
  // Payment Processors
  // ==========================================================================
  
  upsertPaymentProcessor(proc: any): void {
    const configStr = proc.config ? JSON.stringify(proc.config) : null;
    const credentialsStr = proc.credentials ? JSON.stringify(proc.credentials) : null;
    this.run(
      `INSERT OR REPLACE INTO payment_processors (
        id, property_id, name, processor_type, is_primary, config, config_version,
        credentials, settlement_cutoff_time, supports_tip_adjust, supports_void, supports_refund,
        gateway_mode, max_retry_attempts, timeout_seconds, created_by, updated_by,
        active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM payment_processors WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        proc.id, proc.propertyId, proc.name, proc.processorType || proc.type || 'unknown',
        proc.isPrimary ? 1 : 0, configStr, proc.configVersion || 1,
        credentialsStr, proc.settlementCutoffTime,
        proc.supportsTipAdjust !== false ? 1 : 0,
        proc.supportsVoid !== false ? 1 : 0,
        proc.supportsRefund !== false ? 1 : 0,
        proc.gatewayMode || 'production', proc.maxRetryAttempts || 3, proc.timeoutSeconds || 30,
        proc.createdBy, proc.updatedBy,
        proc.active !== false ? 1 : 0, proc.id
      ]
    );
  }
  
  getPaymentProcessor(id: string): any | null {
    return this.get('SELECT * FROM payment_processors WHERE id = ? AND active = 1', [id]);
  }
  
  getPaymentProcessorsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM payment_processors WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Payment Gateway Config
  // ==========================================================================

  upsertPaymentGatewayConfig(cfg: any): void {
    this.run(
      `INSERT OR REPLACE INTO payment_gateway_config (
        id, config_level, enterprise_id, property_id, workstation_id,
        gateway_type, integration_model, environment, credential_key_prefix,
        merchant_id, terminal_id, site_id, device_id, license_id,
        terminal_ip_address, terminal_port, terminal_connection_type,
        enable_sale, enable_void, enable_refund, enable_auth_capture,
        enable_manual_entry, enable_debit, enable_ebt, enable_healthcare,
        enable_contactless, enable_emv, enable_msr,
        enable_partial_approval, enable_tokenization, enable_store_and_forward,
        enable_surcharge, enable_tip_adjust, enable_incremental_auth, enable_cashback,
        surcharge_percent, saf_floor_limit, saf_max_transactions, auth_hold_minutes,
        enable_auto_batch_close, batch_close_time, enable_manual_batch_close,
        receipt_show_emv_fields, receipt_show_aid, receipt_show_tvr, receipt_show_tsi,
        receipt_show_app_label, receipt_show_entry_method,
        receipt_print_merchant_copy, receipt_print_customer_copy,
        enable_debug_logging, log_raw_requests, log_raw_responses,
        active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        cfg.id, cfg.configLevel, cfg.enterpriseId, cfg.propertyId, cfg.workstationId,
        cfg.gatewayType, cfg.integrationModel, cfg.environment, cfg.credentialKeyPrefix,
        cfg.merchantId, cfg.terminalId, cfg.siteId, cfg.deviceId, cfg.licenseId,
        cfg.terminalIpAddress, cfg.terminalPort, cfg.terminalConnectionType,
        cfg.enableSale ? 1 : 0, cfg.enableVoid ? 1 : 0, cfg.enableRefund ? 1 : 0, cfg.enableAuthCapture ? 1 : 0,
        cfg.enableManualEntry ? 1 : 0, cfg.enableDebit ? 1 : 0, cfg.enableEbt ? 1 : 0, cfg.enableHealthcare ? 1 : 0,
        cfg.enableContactless ? 1 : 0, cfg.enableEmv ? 1 : 0, cfg.enableMsr ? 1 : 0,
        cfg.enablePartialApproval ? 1 : 0, cfg.enableTokenization ? 1 : 0, cfg.enableStoreAndForward ? 1 : 0,
        cfg.enableSurcharge ? 1 : 0, cfg.enableTipAdjust ? 1 : 0, cfg.enableIncrementalAuth ? 1 : 0, cfg.enableCashback ? 1 : 0,
        cfg.surchargePercent, cfg.safFloorLimit, cfg.safMaxTransactions, cfg.authHoldMinutes,
        cfg.enableAutoBatchClose ? 1 : 0, cfg.batchCloseTime, cfg.enableManualBatchClose ? 1 : 0,
        cfg.receiptShowEmvFields ? 1 : 0, cfg.receiptShowAid ? 1 : 0, cfg.receiptShowTvr ? 1 : 0, cfg.receiptShowTsi ? 1 : 0,
        cfg.receiptShowAppLabel ? 1 : 0, cfg.receiptShowEntryMethod ? 1 : 0,
        cfg.receiptPrintMerchantCopy ? 1 : 0, cfg.receiptPrintCustomerCopy ? 1 : 0,
        cfg.enableDebugLogging ? 1 : 0, cfg.logRawRequests ? 1 : 0, cfg.logRawResponses ? 1 : 0,
        cfg.active !== false ? 1 : 0,
      ]
    );
  }

  getPaymentGatewayConfigByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM payment_gateway_config WHERE property_id = ? AND active = 1', [propertyId]);
  }

  // ==========================================================================
  // Descriptor Sets & Logo Assets
  // ==========================================================================

  upsertDescriptorSet(ds: any): void {
    const headerLines = typeof ds.headerLines === 'string' ? ds.headerLines : JSON.stringify(ds.headerLines || []);
    const trailerLines = typeof ds.trailerLines === 'string' ? ds.trailerLines : JSON.stringify(ds.trailerLines || []);
    this.run(
      `INSERT OR REPLACE INTO descriptor_sets (
        id, scope_type, scope_id, enterprise_id, header_lines, trailer_lines,
        logo_enabled, logo_asset_id, override_header, override_trailer, override_logo,
        updated_at, updated_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
      [
        ds.id, ds.scopeType, ds.scopeId, ds.enterpriseId, headerLines, trailerLines,
        ds.logoEnabled ? 1 : 0, ds.logoAssetId,
        ds.overrideHeader ? 1 : 0, ds.overrideTrailer ? 1 : 0, ds.overrideLogo ? 1 : 0,
        ds.updatedById,
      ]
    );
  }

  getDescriptorSetsByEnterprise(enterpriseId: string): any[] {
    return this.all('SELECT * FROM descriptor_sets WHERE enterprise_id = ?', [enterpriseId]);
  }

  upsertDescriptorLogoAsset(asset: any): void {
    this.run(
      `INSERT OR REPLACE INTO descriptor_logo_assets (
        id, enterprise_id, filename, mime_type, size_bytes, storage_path,
        checksum, escpos_data, created_at, created_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM descriptor_logo_assets WHERE id = ?), datetime('now')), ?)`,
      [
        asset.id, asset.enterpriseId, asset.filename, asset.mimeType, asset.sizeBytes,
        asset.storagePath, asset.checksum, asset.escposData, asset.id, asset.createdById,
      ]
    );
  }

  getDescriptorLogoAssetsByEnterprise(enterpriseId: string): any[] {
    return this.all('SELECT * FROM descriptor_logo_assets WHERE enterprise_id = ?', [enterpriseId]);
  }

  // ==========================================================================
  // Print Agents
  // ==========================================================================

  upsertPrintAgent(agent: any): void {
    this.run(
      `INSERT OR REPLACE INTO print_agents (
        id, property_id, workstation_id, name, description, agent_token,
        status, last_heartbeat, last_connected_at, last_disconnected_at,
        agent_version, hostname, ip_address, os_info,
        auto_reconnect, heartbeat_interval_ms, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM print_agents WHERE id = ?), datetime('now')))`,
      [
        agent.id, agent.propertyId, agent.workstationId, agent.name, agent.description,
        agent.agentToken, agent.status || 'offline',
        agent.lastHeartbeat, agent.lastConnectedAt, agent.lastDisconnectedAt,
        agent.agentVersion, agent.hostname, agent.ipAddress, agent.osInfo,
        agent.autoReconnect !== false ? 1 : 0, agent.heartbeatIntervalMs || 30000,
        agent.active !== false ? 1 : 0, agent.id,
      ]
    );
  }

  getPrintAgentsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM print_agents WHERE property_id = ? AND active = 1', [propertyId]);
  }

  // ==========================================================================
  // Overtime Rules
  // ==========================================================================

  upsertOvertimeRule(rule: any): void {
    this.run(
      `INSERT OR REPLACE INTO overtime_rules (
        id, property_id, name, description,
        daily_regular_hours, daily_overtime_threshold, daily_double_time_threshold,
        weekly_overtime_threshold, weekly_double_time_threshold,
        overtime_multiplier, double_time_multiplier,
        enable_daily_overtime, enable_daily_double_time,
        enable_weekly_overtime, enable_weekly_double_time,
        week_start_day, effective_date, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        rule.id, rule.propertyId, rule.name, rule.description,
        rule.dailyRegularHours || '8.00', rule.dailyOvertimeThreshold || '8.00', rule.dailyDoubleTimeThreshold,
        rule.weeklyOvertimeThreshold || '40.00', rule.weeklyDoubleTimeThreshold,
        rule.overtimeMultiplier || '1.50', rule.doubleTimeMultiplier || '2.00',
        rule.enableDailyOvertime !== false ? 1 : 0, rule.enableDailyDoubleTime ? 1 : 0,
        rule.enableWeeklyOvertime !== false ? 1 : 0, rule.enableWeeklyDoubleTime ? 1 : 0,
        rule.weekStartDay || 0, rule.effectiveDate, rule.active !== false ? 1 : 0,
      ]
    );
  }

  getOvertimeRulesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM overtime_rules WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }

  // ==========================================================================
  // Break Rules
  // ==========================================================================

  upsertBreakRule(rule: any): void {
    this.run(
      `INSERT OR REPLACE INTO break_rules (
        id, property_id, name, state_code,
        enable_meal_break_enforcement, meal_break_minutes, meal_break_threshold_hours,
        second_meal_break_threshold_hours, allow_meal_break_waiver, meal_waiver_max_shift_hours,
        enable_rest_break_enforcement, rest_break_minutes, rest_break_interval_hours, rest_break_is_paid,
        enable_premium_pay, meal_break_premium_hours, rest_break_premium_hours,
        require_clock_out_attestation, attestation_message,
        enable_break_alerts, alert_minutes_before_deadline,
        active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        rule.id, rule.propertyId, rule.name || 'California Break Rules', rule.stateCode || 'CA',
        rule.enableMealBreakEnforcement !== false ? 1 : 0, rule.mealBreakMinutes || 30, rule.mealBreakThresholdHours || '5.00',
        rule.secondMealBreakThresholdHours || '10.00', rule.allowMealBreakWaiver !== false ? 1 : 0, rule.mealWaiverMaxShiftHours || '6.00',
        rule.enableRestBreakEnforcement !== false ? 1 : 0, rule.restBreakMinutes || 10, rule.restBreakIntervalHours || '4.00',
        rule.restBreakIsPaid !== false ? 1 : 0,
        rule.enablePremiumPay !== false ? 1 : 0, rule.mealBreakPremiumHours || '1.00', rule.restBreakPremiumHours || '1.00',
        rule.requireClockOutAttestation !== false ? 1 : 0, rule.attestationMessage,
        rule.enableBreakAlerts !== false ? 1 : 0, rule.alertMinutesBeforeDeadline || 15,
        rule.active !== false ? 1 : 0,
      ]
    );
  }

  getBreakRulesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM break_rules WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }

  // ==========================================================================
  // Tip Rules
  // ==========================================================================

  upsertTipRule(rule: any): void {
    this.run(
      `INSERT OR REPLACE INTO tip_rules (
        id, enterprise_id, property_id, rvc_id, name, distribution_method,
        timeframe, applies_to_all_locations, declare_cash_tips,
        declare_cash_tips_all_locations, exclude_managers,
        minimum_hours_for_pool, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        rule.id, rule.enterpriseId, rule.propertyId, rule.rvcId,
        rule.name || 'Default Tip Rules', rule.distributionMethod || 'tip_directly',
        rule.timeframe || 'daily', rule.appliesToAllLocations ? 1 : 0, rule.declareCashTips ? 1 : 0,
        rule.declareCashTipsAllLocations ? 1 : 0, rule.excludeManagers !== false ? 1 : 0,
        rule.minimumHoursForPool || '0', rule.active !== false ? 1 : 0,
      ]
    );
  }

  getTipRulesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM tip_rules WHERE property_id = ? AND active = 1', [propertyId]);
  }

  upsertTipRuleJobPercentage(trjp: any): void {
    this.run(
      `INSERT OR REPLACE INTO tip_rule_job_percentages (id, tip_rule_id, job_code_id, percentage, created_at)
       VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM tip_rule_job_percentages WHERE id = ?), datetime('now')))`,
      [trjp.id, trjp.tipRuleId, trjp.jobCodeId, trjp.percentage || '0', trjp.id]
    );
  }

  getTipRuleJobPercentagesByRule(tipRuleId: string): any[] {
    return this.all('SELECT * FROM tip_rule_job_percentages WHERE tip_rule_id = ?', [tipRuleId]);
  }

  // ==========================================================================
  // Minor Labor Rules
  // ==========================================================================

  upsertMinorLaborRule(rule: any): void {
    this.run(
      `INSERT OR REPLACE INTO minor_labor_rules (
        id, property_id, state_code, minor_age_threshold, young_minor_age_threshold,
        school_day_max_hours, school_week_max_hours, school_day_start_time, school_day_end_time,
        non_school_day_max_hours, non_school_week_max_hours, non_school_day_start_time, non_school_day_end_time,
        require_work_permit, work_permit_expiration_alert_days,
        active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        rule.id, rule.propertyId, rule.stateCode || 'CA',
        rule.minorAgeThreshold || 18, rule.youngMinorAgeThreshold || 16,
        rule.schoolDayMaxHours || '4.00', rule.schoolWeekMaxHours || '18.00',
        rule.schoolDayStartTime || '07:00', rule.schoolDayEndTime || '19:00',
        rule.nonSchoolDayMaxHours || '8.00', rule.nonSchoolWeekMaxHours || '40.00',
        rule.nonSchoolDayStartTime || '07:00', rule.nonSchoolDayEndTime || '21:00',
        rule.requireWorkPermit !== false ? 1 : 0, rule.workPermitExpirationAlertDays || 30,
        rule.active !== false ? 1 : 0,
      ]
    );
  }

  getMinorLaborRulesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM minor_labor_rules WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }

  // ==========================================================================
  // Diagnostic Queries (record counts for all synced tables)
  // ==========================================================================

  getTableRecordCounts(): Record<string, number> {
    const tables = [
      'enterprises', 'properties', 'rvcs',
      'roles', 'privileges', 'role_privileges',
      'employees', 'employee_assignments', 'employee_job_codes',
      'major_groups', 'family_groups',
      'slus', 'menu_items', 'menu_item_slus',
      'modifier_groups', 'modifiers', 'modifier_group_modifiers', 'menu_item_modifier_groups',
      'print_classes', 'print_class_routing',
      'tax_groups', 'tenders', 'discounts', 'service_charges',
      'workstations', 'printers', 'kds_devices',
      'order_devices', 'order_device_printers', 'order_device_kds',
      'terminal_devices', 'print_agents',
      'pos_layouts', 'pos_layout_cells', 'pos_layout_rvc_assignments',
      'payment_processors', 'payment_gateway_config',
      'descriptor_sets', 'descriptor_logo_assets',
      'gift_cards', 'loyalty_programs', 'loyalty_members', 'loyalty_member_enrollments', 'loyalty_rewards',
      'overtime_rules', 'break_rules', 'tip_rules', 'tip_rule_job_percentages', 'minor_labor_rules',
      'fiscal_periods', 'cash_drawers', 'online_order_sources',
      'item_availability', 'emc_option_flags',
      'job_codes',
    ];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      try {
        const row = this.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM ${table}`, []);
        counts[table] = row?.cnt || 0;
      } catch {
        counts[table] = -1;
      }
    }
    return counts;
  }

  getTableRows(tableName: string, limit: number = 100): any[] {
    const allowedTables = new Set([
      'enterprises', 'properties', 'rvcs',
      'roles', 'privileges', 'role_privileges',
      'employees', 'employee_assignments', 'employee_job_codes',
      'major_groups', 'family_groups',
      'slus', 'menu_items', 'menu_item_slus',
      'modifier_groups', 'modifiers', 'modifier_group_modifiers', 'menu_item_modifier_groups',
      'print_classes', 'print_class_routing',
      'tax_groups', 'tenders', 'discounts', 'service_charges',
      'workstations', 'printers', 'kds_devices',
      'order_devices', 'order_device_printers', 'order_device_kds',
      'terminal_devices', 'print_agents',
      'pos_layouts', 'pos_layout_cells', 'pos_layout_rvc_assignments',
      'payment_processors', 'payment_gateway_config',
      'descriptor_sets', 'descriptor_logo_assets',
      'gift_cards', 'loyalty_programs', 'loyalty_members', 'loyalty_member_enrollments', 'loyalty_rewards',
      'overtime_rules', 'break_rules', 'tip_rules', 'tip_rule_job_percentages', 'minor_labor_rules',
      'fiscal_periods', 'cash_drawers', 'online_order_sources',
      'item_availability', 'emc_option_flags',
      'job_codes', 'checks', 'check_items', 'check_payments',
    ]);
    if (!allowedTables.has(tableName)) {
      return [];
    }

    const sensitiveFields: Record<string, Set<string>> = {
      employees: new Set(['pin_hash', 'password_hash', 'pin', 'password', 'secret', 'token']),
      print_agents: new Set(['agent_token', 'auth_token', 'secret', 'api_key']),
      payment_processors: new Set(['api_key', 'api_secret', 'secret_key', 'merchant_key', 'password', 'token', 'credentials', 'credential_key_prefix']),
      payment_gateway_config: new Set(['api_key', 'api_secret', 'secret_key', 'merchant_key', 'password', 'token', 'credentials', 'credential_key_prefix']),
    };

    const sensitivePatterns = /key|secret|token|password|credential|hash|pin/i;

    const maxLimit = Math.min(limit, 200);
    const rows = this.all(`SELECT * FROM ${tableName} LIMIT ?`, [maxLimit]);

    const explicitRedactSet = sensitiveFields[tableName];
    return rows.map((row: any) => {
      const sanitized = { ...row };
      for (const key of Object.keys(sanitized)) {
        if (sanitized[key] == null) continue;
        const shouldRedact = (explicitRedactSet && explicitRedactSet.has(key)) || sensitivePatterns.test(key);
        if (shouldRedact) {
          sanitized[key] = '***REDACTED***';
        }
      }
      return sanitized;
    });
  }

  resolveEmployeePrivilegeChain(employeeId: string): any {
    const rawEmployee = this.get('SELECT * FROM employees WHERE id = ?', [employeeId]);
    if (!rawEmployee) return null;

    const emp = { ...(rawEmployee as any) };
    delete emp.pin_hash;
    delete emp.password_hash;
    delete emp.pin;
    delete emp.password;
    delete emp.secret;
    delete emp.token;
    const employee = emp;

    const assignments = this.all('SELECT * FROM employee_assignments WHERE employee_id = ?', [employeeId]);

    const directRoleId = (employee as any).role_id;
    const directRole = directRoleId ? this.get('SELECT * FROM roles WHERE id = ?', [directRoleId]) : null;

    const assignmentRoles: any[] = [];
    const allRoleIds = new Set<string>();
    if (directRoleId) allRoleIds.add(directRoleId);

    for (const assignment of assignments) {
      const a = assignment as any;
      if (a.role_id && !allRoleIds.has(a.role_id)) {
        allRoleIds.add(a.role_id);
        const assignmentRole = this.get('SELECT * FROM roles WHERE id = ?', [a.role_id]);
        if (assignmentRole) {
          assignmentRoles.push({
            assignmentId: a.id,
            propertyId: a.property_id,
            rvcId: a.rvc_id,
            isPrimary: a.is_primary,
            role: assignmentRole,
            source: 'assignment',
          });
        }
      }
    }

    const allPrivs: any[] = [];
    const seenCodes = new Set<string>();
    const privilegeProvenance: any[] = [];

    for (const roleId of allRoleIds) {
      const role = roleId === directRoleId ? directRole : assignmentRoles.find(ar => (ar.role as any)?.id === roleId)?.role;
      const roleName = (role as any)?.name || 'unknown';
      const roleSource = roleId === directRoleId ? 'employee.role_id' : 'assignment';

      const rolePrivs = this.all(
        `SELECT rp.*, p.name as privilege_name, p.domain as privilege_domain
         FROM role_privileges rp
         JOIN privileges p ON rp.privilege_code = p.code
         WHERE rp.role_id = ?`,
        [roleId]
      );

      for (const rp of rolePrivs) {
        const code = (rp as any).privilege_code;
        allPrivs.push(rp);
        if (!seenCodes.has(code)) {
          seenCodes.add(code);
          privilegeProvenance.push({
            privilegeCode: code,
            privilegeName: (rp as any).privilege_name,
            privilegeDomain: (rp as any).privilege_domain,
            grantedViaRoleId: roleId,
            grantedViaRoleName: roleName,
            roleSource,
          });
        }
      }
    }

    return {
      employee,
      assignments,
      role: directRole,
      assignmentRoles,
      rolePrivileges: allPrivs,
      resolvedPrivilegeCodes: [...seenCodes],
      privilegeProvenance,
    };
  }

  // ==========================================================================
  // Loyalty Programs
  // ==========================================================================
  
  upsertLoyaltyProgram(prog: any): void {
    this.run(
      `INSERT OR REPLACE INTO loyalty_programs (
        id, enterprise_id, property_id, name, program_type,
        points_per_dollar, minimum_redeem_points, points_value,
        visit_threshold, spend_threshold, tier_thresholds,
        active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM loyalty_programs WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        prog.id, prog.enterpriseId, prog.propertyId, prog.name,
        prog.programType || 'points',
        String(prog.pointsPerDollar || '1'),
        prog.minimumRedeemPoints || 100,
        String(prog.pointsValue || '0.01'),
        prog.visitThreshold, String(prog.spendThreshold || ''),
        prog.tierThresholds ? JSON.stringify(prog.tierThresholds) : null,
        prog.active !== false ? 1 : 0, prog.id
      ]
    );
  }
  
  getLoyaltyProgram(id: string): any | null {
    return this.get('SELECT * FROM loyalty_programs WHERE id = ? AND active = 1', [id]);
  }
  
  getLoyaltyProgramsByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM loyalty_programs WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  upsertLoyaltyMember(member: any): void {
    this.run(
      `INSERT OR REPLACE INTO loyalty_members (
        id, enterprise_id, property_id, phone, email, first_name, last_name, external_id,
        birthday, notes, sms_opt_in, email_opt_in, marketing_opt_in, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, COALESCE((SELECT created_at FROM loyalty_members WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        member.id, member.enterpriseId, member.propertyId, member.phone, member.email,
        member.firstName, member.lastName, member.externalId,
        member.birthday, member.notes, member.smsOptIn ? 1 : 0,
        member.emailOptIn ? 1 : 0, member.marketingOptIn ? 1 : 0, member.id
      ]
    );
  }
  
  getLoyaltyMember(id: string): any | null {
    return this.get('SELECT * FROM loyalty_members WHERE id = ? AND active = 1', [id]);
  }
  
  getLoyaltyMemberByPhone(phone: string): any | null {
    return this.get('SELECT * FROM loyalty_members WHERE phone = ? AND active = 1', [phone]);
  }
  
  getLoyaltyMemberByEmail(email: string): any | null {
    return this.get('SELECT * FROM loyalty_members WHERE email = ? AND active = 1', [email]);
  }
  
  upsertLoyaltyMemberEnrollment(enrollment: any): void {
    this.run(
      `INSERT OR REPLACE INTO loyalty_member_enrollments (
        id, member_id, program_id, points_balance, lifetime_points,
        visit_count, total_spend, current_tier, enrolled_at, last_activity_at, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT enrolled_at FROM loyalty_member_enrollments WHERE id = ?), datetime('now')), ?, ?)`,
      [
        enrollment.id, enrollment.memberId, enrollment.programId,
        enrollment.pointsBalance || 0, enrollment.lifetimePoints || 0,
        enrollment.visitCount || 0, String(enrollment.totalSpend || '0'),
        enrollment.currentTier, enrollment.id, enrollment.lastActivityAt,
        enrollment.active !== false ? 1 : 0
      ]
    );
  }
  
  getMemberEnrollments(memberId: string): any[] {
    return this.all('SELECT * FROM loyalty_member_enrollments WHERE member_id = ? AND active = 1', [memberId]);
  }
  
  upsertLoyaltyReward(reward: any): void {
    this.run(
      `INSERT OR REPLACE INTO loyalty_rewards (
        id, program_id, name, description, reward_type, points_required,
        menu_item_id, discount_id, fixed_value, percent_off, max_uses,
        valid_from, valid_until, min_check_amount, max_discount_amount, usage_limit_per_member,
        active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM loyalty_rewards WHERE id = ?), datetime('now')))`,
      [
        reward.id, reward.programId, reward.name, reward.description,
        reward.rewardType, reward.pointsRequired,
        reward.menuItemId, reward.discountId,
        reward.fixedValue ? String(reward.fixedValue) : null,
        reward.percentOff ? String(reward.percentOff) : null,
        reward.maxUses, reward.validFrom, reward.validUntil,
        reward.minCheckAmount ? String(reward.minCheckAmount) : null,
        reward.maxDiscountAmount ? String(reward.maxDiscountAmount) : null,
        reward.usageLimitPerMember, reward.active !== false ? 1 : 0, reward.id
      ]
    );
  }
  
  getLoyaltyRewardsByProgram(programId: string): any[] {
    return this.all('SELECT * FROM loyalty_rewards WHERE program_id = ? AND active = 1', [programId]);
  }
  
  // ==========================================================================
  // Loyalty Transactions & Redemptions
  // ==========================================================================
  
  insertLoyaltyTransaction(tx: any): void {
    this.run(
      `INSERT INTO loyalty_transactions (
        id, member_id, program_id, enrollment_id, property_id, transaction_type,
        points, points_before, points_after, visit_increment, visits_before, visits_after,
        check_id, check_total, employee_id, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        tx.id, tx.memberId, tx.programId, tx.enrollmentId, tx.propertyId,
        tx.transactionType, tx.points || 0, tx.pointsBefore || 0, tx.pointsAfter || 0,
        tx.visitIncrement || 0, tx.visitsBefore || 0, tx.visitsAfter || 0,
        tx.checkId, tx.checkTotal ? String(tx.checkTotal) : null,
        tx.employeeId, tx.reason
      ]
    );
  }
  
  getLoyaltyTransactionsByMember(memberId: string, limit: number = 50): any[] {
    return this.all(
      'SELECT * FROM loyalty_transactions WHERE member_id = ? ORDER BY created_at DESC LIMIT ?',
      [memberId, limit]
    );
  }
  
  getLoyaltyTransactionsByCheck(checkId: string): any[] {
    return this.all('SELECT * FROM loyalty_transactions WHERE check_id = ?', [checkId]);
  }
  
  insertLoyaltyRedemption(redemption: any): void {
    this.run(
      `INSERT INTO loyalty_redemptions (
        id, member_id, reward_id, check_id, points_used, redeemed_at, employee_id
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
      [
        redemption.id, redemption.memberId, redemption.rewardId,
        redemption.checkId, redemption.pointsUsed, redemption.employeeId
      ]
    );
  }
  
  getRedemptionsByCheck(checkId: string): any[] {
    return this.all('SELECT * FROM loyalty_redemptions WHERE check_id = ?', [checkId]);
  }
  
  getRedemptionsByMember(memberId: string, limit: number = 50): any[] {
    return this.all(
      'SELECT * FROM loyalty_redemptions WHERE member_id = ? ORDER BY redeemed_at DESC LIMIT ?',
      [memberId, limit]
    );
  }
  
  // ==========================================================================
  // Item Availability
  // ==========================================================================
  
  upsertItemAvailability(avail: any): void {
    const quantity = avail.availableQuantity ?? avail.available_quantity ?? avail.currentQuantity ?? avail.current_quantity;
    const reason = avail.unavailableReason ?? avail.unavailable_reason;
    const until = avail.unavailableUntil ?? avail.unavailable_until;
    const updatedBy = avail.updatedByEmployeeId ?? avail.updated_by_employee_id ?? avail.eightySixedById ?? avail.eighty_sixed_by_id;
    const isAvailable = avail.is86ed ? 0 : (avail.isAvailable !== false ? 1 : 0);
    this.run(
      `INSERT OR REPLACE INTO item_availability (
        id, property_id, rvc_id, menu_item_id, is_available,
        available_quantity, unavailable_reason, unavailable_until,
        updated_at, updated_by_employee_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
      [
        avail.id, avail.propertyId ?? avail.property_id,
        avail.rvcId ?? avail.rvc_id, avail.menuItemId ?? avail.menu_item_id,
        isAvailable, quantity,
        reason, until, updatedBy
      ]
    );
  }
  
  getItemAvailability(menuItemId: string, propertyId: string, rvcId?: string): any | null {
    if (rvcId) {
      return this.get(
        'SELECT * FROM item_availability WHERE menu_item_id = ? AND property_id = ? AND rvc_id = ?',
        [menuItemId, propertyId, rvcId]
      );
    }
    return this.get(
      'SELECT * FROM item_availability WHERE menu_item_id = ? AND property_id = ? AND rvc_id IS NULL',
      [menuItemId, propertyId]
    );
  }
  
  getUnavailableItems(propertyId: string, rvcId?: string): any[] {
    if (rvcId) {
      return this.all(
        'SELECT * FROM item_availability WHERE property_id = ? AND (rvc_id = ? OR rvc_id IS NULL) AND is_available = 0',
        [propertyId, rvcId]
      );
    }
    return this.all('SELECT * FROM item_availability WHERE property_id = ? AND is_available = 0', [propertyId]);
  }
  
  // ==========================================================================
  // POS Layouts
  // ==========================================================================
  
  upsertPosLayout(layout: any): void {
    this.run(
      `INSERT OR REPLACE INTO pos_layouts (
        id, enterprise_id, property_id, rvc_id, name, mode, grid_rows, grid_cols, font_size, is_default, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM pos_layouts WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        layout.id,
        layout.enterpriseId || layout.enterprise_id || null,
        layout.propertyId || layout.property_id || null,
        layout.rvcId || layout.rvc_id || null,
        layout.name,
        layout.mode || 'slu_tabs',
        layout.gridRows || layout.grid_rows || 4,
        layout.gridCols || layout.grid_cols || 6,
        layout.fontSize || layout.font_size || 'medium',
        layout.isDefault || layout.is_default ? 1 : 0,
        layout.active !== false ? 1 : 0,
        layout.id
      ]
    );
  }
  
  upsertPosLayoutCell(cell: any): void {
    this.run(
      `INSERT OR REPLACE INTO pos_layout_cells (
        id, layout_id, row_index, col_index, row_span, col_span, menu_item_id,
        background_color, text_color, display_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cell.id,
        cell.layoutId || cell.layout_id,
        cell.rowIndex ?? cell.row_index ?? 0,
        cell.colIndex ?? cell.col_index ?? 0,
        cell.rowSpan || cell.row_span || 1,
        cell.colSpan || cell.col_span || 1,
        cell.menuItemId || cell.menu_item_id || null,
        cell.backgroundColor || cell.background_color || '#3B82F6',
        cell.textColor || cell.text_color || '#FFFFFF',
        cell.displayLabel || cell.display_label || null
      ]
    );
  }
  
  upsertPosLayoutRvcAssignment(assign: any): void {
    this.run(
      `INSERT OR REPLACE INTO pos_layout_rvc_assignments (
        id, layout_id, property_id, rvc_id, is_default, order_type, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [assign.id, assign.layoutId, assign.propertyId, assign.rvcId, assign.isDefault ? 1 : 0, assign.orderType]
    );
  }
  
  getPosLayout(id: string): any | null {
    return this.get('SELECT * FROM pos_layouts WHERE id = ? AND active = 1', [id]);
  }
  
  getPosLayoutForRvc(rvcId: string, propertyId?: string, orderType?: string): any | null {
    if (propertyId) {
      let sql = `
        SELECT pl.* FROM pos_layouts pl
        JOIN pos_layout_rvc_assignments pla ON pl.id = pla.layout_id
        WHERE pla.property_id = ? AND (pla.rvc_id = ? OR pla.rvc_id IS NULL) AND pl.active = 1
      `;
      const params: any[] = [propertyId, rvcId];
      if (orderType) {
        sql += ' AND (pla.order_type = ? OR pla.order_type IS NULL)';
        params.push(orderType);
      }
      sql += ' ORDER BY pla.rvc_id DESC, pla.is_default DESC LIMIT 1';
      const result = this.get(sql, params);
      if (result) return result;
    }
    const directLayout = this.get(
      'SELECT * FROM pos_layouts WHERE rvc_id = ? AND active = 1 ORDER BY is_default DESC LIMIT 1',
      [rvcId]
    );
    if (directLayout) return directLayout;
    return this.get(
      'SELECT * FROM pos_layouts WHERE is_default = 1 AND active = 1 LIMIT 1'
    );
  }
  
  getPosLayoutCells(layoutId: string): any[] {
    return this.all('SELECT * FROM pos_layout_cells WHERE layout_id = ? ORDER BY row_index, col_index', [layoutId]);
  }
  
  // ==========================================================================
  // Gift Cards
  // ==========================================================================
  
  upsertGiftCard(card: any): void {
    const balance = card.balance ?? card.currentBalance ?? card.current_balance ?? 0;
    const initialBalance = card.initialBalance ?? card.initial_balance ?? balance ?? 0;
    const activatedBy = card.activatedByEmployeeId ?? card.activated_by_employee_id ?? card.activatedById ?? card.activated_by_id;
    const customerName = card.customerName ?? card.purchaserName ?? card.recipientName ?? card.customer_name;
    const customerEmail = card.customerEmail ?? card.recipientEmail ?? card.customer_email;
    this.run(
      `INSERT OR REPLACE INTO gift_cards (
        id, property_id, card_number, pin, balance, initial_balance, status,
        activated_at, activated_by_employee_id, expires_at, last_used_at,
        customer_name, customer_phone, customer_email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM gift_cards WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        card.id, card.propertyId ?? card.property_id,
        card.cardNumber ?? card.card_number, card.pin,
        balance, initialBalance,
        card.status || 'active', card.activatedAt ?? card.activated_at, activatedBy,
        card.expiresAt ?? card.expires_at, card.lastUsedAt ?? card.last_used_at,
        customerName, card.customerPhone ?? card.customer_phone, customerEmail, card.id
      ]
    );
  }
  
  getGiftCardByNumber(cardNumber: string): any | null {
    return this.get('SELECT * FROM gift_cards WHERE card_number = ?', [cardNumber]);
  }
  
  getGiftCard(id: string): any | null {
    return this.get('SELECT * FROM gift_cards WHERE id = ?', [id]);
  }
  
  insertGiftCardTransaction(tx: any): void {
    this.run(
      `INSERT INTO gift_card_transactions (
        id, gift_card_id, check_id, transaction_type, amount, balance_before, balance_after,
        employee_id, workstation_id, notes, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        tx.id, tx.giftCardId, tx.checkId, tx.transactionType,
        tx.amount, tx.balanceBefore, tx.balanceAfter,
        tx.employeeId, tx.workstationId, tx.notes
      ]
    );
  }
  
  getGiftCardTransactions(giftCardId: string): any[] {
    return this.all('SELECT * FROM gift_card_transactions WHERE gift_card_id = ? ORDER BY created_at DESC', [giftCardId]);
  }
  
  // ==========================================================================
  // Audit Logs
  // ==========================================================================
  
  insertAuditLog(log: any): void {
    this.run(
      `INSERT INTO audit_logs (
        id, entity_type, entity_id, action, previous_value, new_value,
        employee_id, workstation_id, ip_address, reason, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        log.id, log.entityType, log.entityId, log.action,
        log.previousValue ? JSON.stringify(log.previousValue) : null,
        log.newValue ? JSON.stringify(log.newValue) : null,
        log.employeeId, log.workstationId, log.ipAddress, log.reason
      ]
    );
  }
  
  getAuditLogsForEntity(entityType: string, entityId: string): any[] {
    return this.all(
      'SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
      [entityType, entityId]
    );
  }
  
  // ==========================================================================
  // Refunds
  // ==========================================================================
  
  insertRefund(refund: any): void {
    this.run(
      `INSERT INTO refunds (
        id, original_check_id, rvc_id, refund_number, employee_id, manager_employee_id,
        workstation_id, refund_type, subtotal, tax, total, reason, status, business_date,
        cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        refund.id, refund.originalCheckId, refund.rvcId, refund.refundNumber,
        refund.employeeId, refund.managerEmployeeId, refund.workstationId,
        refund.refundType || 'full', refund.subtotal || 0, refund.tax || 0, refund.total || 0,
        refund.reason, refund.status || 'pending', refund.businessDate
      ]
    );
  }
  
  getRefund(id: string): any | null {
    return this.get('SELECT * FROM refunds WHERE id = ?', [id]);
  }
  
  getRefundsByCheck(originalCheckId: string): any[] {
    return this.all('SELECT * FROM refunds WHERE original_check_id = ?', [originalCheckId]);
  }
  
  insertRefundItem(item: any): void {
    this.run(
      `INSERT INTO refund_items (
        id, refund_id, original_item_id, menu_item_id, name, quantity, unit_price, total_price, tax_amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        item.id, item.refundId, item.originalItemId, item.menuItemId,
        item.name, item.quantity || 1, item.unitPrice, item.totalPrice, item.taxAmount || 0
      ]
    );
  }
  
  insertRefundPayment(payment: any): void {
    this.run(
      `INSERT INTO refund_payments (
        id, refund_id, original_payment_id, tender_id, amount, refund_method, reference_number, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        payment.id, payment.refundId, payment.originalPaymentId, payment.tenderId,
        payment.amount, payment.refundMethod, payment.referenceNumber, payment.status || 'pending'
      ]
    );
  }
  
  // ==========================================================================
  // Payment Transactions
  // ==========================================================================
  
  insertPaymentTransaction(txn: any): void {
    this.run(
      `INSERT INTO payment_transactions (
        id, property_id, check_id, check_payment_id, payment_processor_id, tender_id,
        transaction_type, amount, tip_amount, auth_code, reference_number,
        card_type, card_last4, card_holder_name, entry_mode,
        response_code, response_message, avs_result, cvv_result,
        status, gateway_transaction_id, gateway_response,
        employee_id, workstation_id, terminal_device_id, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        txn.id, txn.propertyId, txn.checkId, txn.checkPaymentId, txn.paymentProcessorId, txn.tenderId,
        txn.transactionType, txn.amount, txn.tipAmount || 0, txn.authCode, txn.referenceNumber,
        txn.cardType, txn.cardLast4, txn.cardHolderName, txn.entryMode,
        txn.responseCode, txn.responseMessage, txn.avsResult, txn.cvvResult,
        txn.status || 'pending', txn.gatewayTransactionId, txn.gatewayResponse,
        txn.employeeId, txn.workstationId, txn.terminalDeviceId
      ]
    );
  }
  
  getPaymentTransaction(id: string): any | null {
    return this.get('SELECT * FROM payment_transactions WHERE id = ?', [id]);
  }
  
  getPaymentTransactionsByCheck(checkId: string): any[] {
    return this.all('SELECT * FROM payment_transactions WHERE check_id = ? ORDER BY created_at', [checkId]);
  }
  
  updatePaymentTransactionStatus(id: string, status: string, responseData?: any): void {
    this.run(
      `UPDATE payment_transactions SET status = ?, response_code = ?, response_message = ?, gateway_response = ? WHERE id = ?`,
      [status, responseData?.responseCode, responseData?.responseMessage, JSON.stringify(responseData), id]
    );
  }
  
  // ==========================================================================
  // Terminal Devices
  // ==========================================================================
  
  upsertTerminalDevice(device: any): void {
    this.run(
      `INSERT OR REPLACE INTO terminal_devices (
        id, property_id, name, device_type, serial_number, ip_address, port,
        payment_processor_id, cloud_device_id, terminal_id, connection_type,
        is_online, last_seen_at, firmware_version, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        device.id, device.propertyId, device.name, device.model || device.deviceType || 'unknown', device.serialNumber,
        device.ipAddress || device.networkAddress, device.port, device.paymentProcessorId,
        device.cloudDeviceId || null, device.terminalId || null,
        device.connectionType || 'ethernet',
        device.isOnline ? 1 : 0, device.lastSeenAt, device.firmwareVersion,
        device.active !== false ? 1 : 0
      ]
    );
  }
  
  getTerminalDevice(id: string): any | null {
    return this.get('SELECT * FROM terminal_devices WHERE id = ?', [id]);
  }
  
  getTerminalDevicesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM terminal_devices WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Cash Drawers
  // ==========================================================================
  
  upsertCashDrawer(drawer: any): void {
    this.run(
      `INSERT OR REPLACE INTO cash_drawers (
        id, property_id, name, workstation_id, starting_balance, current_balance, status, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        drawer.id, drawer.propertyId, drawer.name, drawer.workstationId,
        drawer.startingBalance || 0, drawer.currentBalance || 0,
        drawer.status || 'closed', drawer.active !== false ? 1 : 0
      ]
    );
  }
  
  getCashDrawer(id: string): any | null {
    return this.get('SELECT * FROM cash_drawers WHERE id = ?', [id]);
  }
  
  getCashDrawersByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM cash_drawers WHERE property_id = ? AND active = 1', [propertyId]);
  }
  
  getCashDrawerByWorkstation(workstationId: string): any | null {
    return this.get('SELECT * FROM cash_drawers WHERE workstation_id = ? AND active = 1', [workstationId]);
  }
  
  // ==========================================================================
  // Drawer Assignments
  // ==========================================================================
  
  insertDrawerAssignment(assignment: any): void {
    this.run(
      `INSERT INTO drawer_assignments (
        id, cash_drawer_id, employee_id, workstation_id, assigned_at, opening_balance,
        status, business_date, manager_employee_id, cloud_synced
      ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, 0)`,
      [
        assignment.id, assignment.cashDrawerId, assignment.employeeId, assignment.workstationId,
        assignment.openingBalance, assignment.status || 'open', assignment.businessDate, assignment.managerEmployeeId
      ]
    );
  }
  
  getDrawerAssignment(id: string): any | null {
    return this.get('SELECT * FROM drawer_assignments WHERE id = ?', [id]);
  }
  
  getActiveDrawerAssignment(employeeId: string): any | null {
    return this.get(
      'SELECT * FROM drawer_assignments WHERE employee_id = ? AND status = ? ORDER BY assigned_at DESC LIMIT 1',
      [employeeId, 'open']
    );
  }
  
  closeDrawerAssignment(id: string, closingBalance: number, expectedBalance: number): void {
    const overShort = closingBalance - expectedBalance;
    this.run(
      `UPDATE drawer_assignments SET 
        status = 'closed', closing_balance = ?, expected_balance = ?, over_short = ?, unassigned_at = datetime('now')
       WHERE id = ?`,
      [closingBalance, expectedBalance, overShort, id]
    );
  }
  
  // ==========================================================================
  // Cash Transactions
  // ==========================================================================
  
  insertCashTransaction(txn: any): void {
    this.run(
      `INSERT INTO cash_transactions (
        id, cash_drawer_id, drawer_assignment_id, transaction_type, amount,
        balance_before, balance_after, check_id, employee_id, manager_employee_id,
        reason, notes, reference_number, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        txn.id, txn.cashDrawerId, txn.drawerAssignmentId, txn.transactionType, txn.amount,
        txn.balanceBefore, txn.balanceAfter, txn.checkId, txn.employeeId, txn.managerEmployeeId,
        txn.reason, txn.notes, txn.referenceNumber
      ]
    );
  }
  
  getCashTransactionsByDrawer(cashDrawerId: string): any[] {
    return this.all('SELECT * FROM cash_transactions WHERE cash_drawer_id = ? ORDER BY created_at', [cashDrawerId]);
  }
  
  getCashTransactionsByAssignment(drawerAssignmentId: string): any[] {
    return this.all('SELECT * FROM cash_transactions WHERE drawer_assignment_id = ? ORDER BY created_at', [drawerAssignmentId]);
  }
  
  // ==========================================================================
  // Safe Counts
  // ==========================================================================
  
  insertSafeCount(count: any): void {
    this.run(
      `INSERT INTO safe_counts (
        id, property_id, count_type, employee_id, manager_employee_id, business_date,
        expected_amount, actual_amount, variance, denominations, notes, status, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        count.id, count.propertyId, count.countType, count.employeeId, count.managerEmployeeId,
        count.businessDate, count.expectedAmount, count.actualAmount, count.variance,
        count.denominations ? JSON.stringify(count.denominations) : null,
        count.notes, count.status || 'pending'
      ]
    );
  }
  
  getSafeCountsByDate(propertyId: string, businessDate: string): any[] {
    return this.all(
      'SELECT * FROM safe_counts WHERE property_id = ? AND business_date = ? ORDER BY created_at',
      [propertyId, businessDate]
    );
  }
  
  // ==========================================================================
  // Job Codes
  // ==========================================================================
  
  upsertJobCode(job: any): void {
    this.run(
      `INSERT OR REPLACE INTO job_codes (
        id, enterprise_id, property_id, name, code, hourly_rate,
        overtime_eligible, tipped, default_tip_rate, color, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        job.id, job.enterpriseId, job.propertyId, job.name, job.code, job.hourlyRate,
        job.overtimeEligible !== false ? 1 : 0, job.tipped ? 1 : 0, job.defaultTipRate,
        job.color, job.active !== false ? 1 : 0
      ]
    );
  }
  
  getJobCode(id: string): any | null {
    return this.get('SELECT * FROM job_codes WHERE id = ? AND active = 1', [id]);
  }
  
  getJobCodesByProperty(propertyId: string): any[] {
    return this.all('SELECT * FROM job_codes WHERE (property_id = ? OR property_id IS NULL) AND active = 1', [propertyId]);
  }
  
  // ==========================================================================
  // Employee Job Codes
  // ==========================================================================
  
  upsertEmployeeJobCode(ejc: any): void {
    this.run(
      `INSERT OR REPLACE INTO employee_job_codes (
        id, employee_id, job_code_id, hourly_rate_override, is_primary, effective_from, effective_until, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ejc.id, ejc.employeeId, ejc.jobCodeId, ejc.hourlyRateOverride,
        ejc.isPrimary ? 1 : 0, ejc.effectiveFrom, ejc.effectiveUntil, ejc.active !== false ? 1 : 0
      ]
    );
  }
  
  getEmployeeJobCodes(employeeId: string): any[] {
    return this.all(
      `SELECT ejc.*, jc.name as job_name, jc.code as job_code 
       FROM employee_job_codes ejc 
       JOIN job_codes jc ON ejc.job_code_id = jc.id 
       WHERE ejc.employee_id = ? AND ejc.active = 1`,
      [employeeId]
    );
  }
  
  getPrimaryJobCode(employeeId: string): any | null {
    return this.get(
      `SELECT jc.* FROM job_codes jc
       JOIN employee_job_codes ejc ON jc.id = ejc.job_code_id
       WHERE ejc.employee_id = ? AND ejc.is_primary = 1 AND ejc.active = 1`,
      [employeeId]
    );
  }
  
  // ==========================================================================
  // Time Punches
  // ==========================================================================
  
  insertTimePunch(punch: any): void {
    this.run(
      `INSERT INTO time_punches (
        id, employee_id, job_code_id, workstation_id, punch_type, punch_time,
        original_punch_time, business_date, ip_address, geo_location, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        punch.id, punch.employeeId, punch.jobCodeId, punch.workstationId,
        punch.punchType, punch.punchTime, punch.punchTime, punch.businessDate,
        punch.ipAddress, punch.geoLocation
      ]
    );
  }
  
  getTimePunch(id: string): any | null {
    return this.get('SELECT * FROM time_punches WHERE id = ?', [id]);
  }
  
  getTimePunchesByEmployee(employeeId: string, businessDate?: string): any[] {
    if (businessDate) {
      return this.all(
        'SELECT * FROM time_punches WHERE employee_id = ? AND business_date = ? ORDER BY punch_time',
        [employeeId, businessDate]
      );
    }
    return this.all('SELECT * FROM time_punches WHERE employee_id = ? ORDER BY punch_time DESC LIMIT 50', [employeeId]);
  }
  
  getLastPunch(employeeId: string): any | null {
    return this.get(
      'SELECT * FROM time_punches WHERE employee_id = ? ORDER BY punch_time DESC LIMIT 1',
      [employeeId]
    );
  }
  
  editTimePunch(id: string, newTime: string, editedBy: string, reason: string): void {
    this.run(
      `UPDATE time_punches SET punch_time = ?, edited = 1, edited_by_employee_id = ?, edit_reason = ? WHERE id = ?`,
      [newTime, editedBy, reason, id]
    );
  }
  
  // ==========================================================================
  // Break Sessions
  // ==========================================================================
  
  insertBreakSession(breakSession: any): void {
    this.run(
      `INSERT INTO break_sessions (
        id, employee_id, time_entry_id, break_type, start_time, paid, workstation_id, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        breakSession.id, breakSession.employeeId, breakSession.timeEntryId,
        breakSession.breakType || 'unpaid', breakSession.startTime, breakSession.paid ? 1 : 0,
        breakSession.workstationId
      ]
    );
  }
  
  endBreakSession(id: string): void {
    const endTime = new Date().toISOString();
    const breakSession = this.get<{ start_time: string }>('SELECT start_time FROM break_sessions WHERE id = ?', [id]);
    let durationMinutes = 0;
    if (breakSession) {
      durationMinutes = Math.round((new Date(endTime).getTime() - new Date(breakSession.start_time).getTime()) / 60000);
    }
    this.run(
      'UPDATE break_sessions SET end_time = ?, duration_minutes = ? WHERE id = ?',
      [endTime, durationMinutes, id]
    );
  }
  
  getActiveBreakSession(employeeId: string): any | null {
    return this.get('SELECT * FROM break_sessions WHERE employee_id = ? AND end_time IS NULL', [employeeId]);
  }
  
  // ==========================================================================
  // Fiscal Periods
  // ==========================================================================
  
  insertFiscalPeriod(period: any): void {
    this.run(
      `INSERT INTO fiscal_periods (
        id, property_id, period_type, business_date, start_time, status,
        opened_by_employee_id, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        period.id, period.propertyId, period.periodType, period.businessDate,
        period.startTime, period.status || 'open', period.openedByEmployeeId
      ]
    );
  }
  
  upsertFiscalPeriod(period: any): void {
    const periodType = period.periodType ?? period.period_type ?? 'business_day';
    const startTime = period.startTime ?? period.start_time ?? period.openedAt ?? period.opened_at ?? new Date().toISOString();
    const endTime = period.endTime ?? period.end_time ?? period.closedAt ?? period.closed_at;
    const openedBy = period.openedByEmployeeId ?? period.opened_by_employee_id ?? period.reopenedById ?? period.reopened_by_id;
    const closedBy = period.closedByEmployeeId ?? period.closed_by_employee_id ?? period.closedById ?? period.closed_by_id;
    this.run(
      `INSERT OR REPLACE INTO fiscal_periods (
        id, property_id, period_type, business_date, start_time, end_time, status,
        opened_by_employee_id, closed_by_employee_id, cloud_synced, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM fiscal_periods WHERE id = ?), datetime('now')), datetime('now'))`,
      [
        period.id, period.propertyId ?? period.property_id, periodType,
        period.businessDate ?? period.business_date,
        startTime, endTime, period.status || 'open',
        openedBy, closedBy,
        period.cloudSynced ? 1 : 0, period.id
      ]
    );
  }
  
  getFiscalPeriod(id: string): any | null {
    return this.get('SELECT * FROM fiscal_periods WHERE id = ?', [id]);
  }
  
  getActiveFiscalPeriod(propertyId: string): any | null {
    return this.get(
      'SELECT * FROM fiscal_periods WHERE property_id = ? AND status = ? ORDER BY start_time DESC LIMIT 1',
      [propertyId, 'open']
    );
  }
  
  getFiscalPeriodsByProperty(propertyId: string, limit: number = 30): any[] {
    return this.all(
      'SELECT * FROM fiscal_periods WHERE property_id = ? ORDER BY business_date DESC LIMIT ?',
      [propertyId, limit]
    );
  }
  
  closeFiscalPeriod(id: string, closedByEmployeeId: string, totals: any): void {
    this.run(
      `UPDATE fiscal_periods SET 
        status = 'closed', end_time = datetime('now'), closed_by_employee_id = ?,
        gross_sales = ?, net_sales = ?, tax_collected = ?, discounts_given = ?,
        refunds_given = ?, check_count = ?, guest_count = ?, void_count = ?, void_amount = ?,
        cash_over_short = ?, closed_at = datetime('now')
       WHERE id = ?`,
      [
        closedByEmployeeId, totals.grossSales || 0, totals.netSales || 0, totals.taxCollected || 0,
        totals.discountsGiven || 0, totals.refundsGiven || 0, totals.checkCount || 0,
        totals.guestCount || 0, totals.voidCount || 0, totals.voidAmount || 0, totals.cashOverShort || 0, id
      ]
    );
  }
  
  // ==========================================================================
  // KDS Ticket Items
  // ==========================================================================
  
  insertKdsTicketItem(item: any): void {
    this.run(
      `INSERT INTO kds_ticket_items (
        id, kds_ticket_id, check_item_id, menu_item_id, name, short_name, quantity,
        modifiers, seat_number, course_number, special_instructions, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        item.id, item.kdsTicketId, item.checkItemId, item.menuItemId, item.name, item.shortName,
        item.quantity || 1, item.modifiers ? JSON.stringify(item.modifiers) : null,
        item.seatNumber, item.courseNumber || 1, item.specialInstructions, item.status || 'active'
      ]
    );
  }
  
  getKdsTicketItems(kdsTicketId: string): any[] {
    return this.all('SELECT * FROM kds_ticket_items WHERE kds_ticket_id = ? ORDER BY created_at', [kdsTicketId]);
  }
  
  bumpKdsTicketItem(id: string): void {
    this.run(
      'UPDATE kds_ticket_items SET status = ?, bumped_at = datetime(\'now\') WHERE id = ?',
      ['bumped', id]
    );
  }
  
  // ==========================================================================
  // Offline Order Queue
  // ==========================================================================
  
  insertOfflineOrder(order: any): void {
    this.run(
      `INSERT INTO offline_order_queue (
        id, rvc_id, order_type, order_source, table_number, guest_count, items, payments,
        customer_name, customer_phone, customer_email, special_instructions, scheduled_time,
        priority, status, employee_id, workstation_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        order.id, order.rvcId, order.orderType, order.orderSource || 'pos',
        order.tableNumber, order.guestCount || 1,
        JSON.stringify(order.items), order.payments ? JSON.stringify(order.payments) : null,
        order.customerName, order.customerPhone, order.customerEmail,
        order.specialInstructions, order.scheduledTime, order.priority || 0,
        order.status || 'queued', order.employeeId, order.workstationId
      ]
    );
  }
  
  getOfflineOrder(id: string): any | null {
    return this.get('SELECT * FROM offline_order_queue WHERE id = ?', [id]);
  }
  
  getPendingOfflineOrders(): any[] {
    return this.all(
      'SELECT * FROM offline_order_queue WHERE status = ? ORDER BY priority DESC, created_at ASC',
      ['queued']
    );
  }
  
  updateOfflineOrderStatus(id: string, status: string, cloudCheckId?: string, errorMessage?: string): void {
    this.run(
      `UPDATE offline_order_queue SET status = ?, cloud_check_id = ?, error_message = ?, 
       processed_at = CASE WHEN ? = 'synced' THEN datetime('now') ELSE processed_at END,
       retry_count = CASE WHEN ? = 'failed' THEN retry_count + 1 ELSE retry_count END
       WHERE id = ?`,
      [status, cloudCheckId, errorMessage, status, status, id]
    );
  }
  
  // ==========================================================================
  // Online Orders
  // ==========================================================================
  
  upsertOnlineOrderSource(source: any): void {
    const name = source.sourceName ?? source.name ?? source.source_name ?? 'Unknown';
    const sourceType = source.sourceType ?? source.source_type ?? 'other';
    const prepTime = source.defaultPrepMinutes ?? source.defaultPrepTime ?? source.default_prep_minutes ?? source.default_prep_time ?? 15;
    this.run(
      `INSERT OR REPLACE INTO online_order_sources (
        id, property_id, name, source_type, api_key, webhook_url, auto_accept, default_prep_time, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        source.id, source.propertyId ?? source.property_id, name, sourceType,
        source.apiKeyPrefix ?? source.apiKey ?? source.api_key,
        source.webhookUrl ?? source.webhook_url,
        (source.autoAccept ?? source.auto_accept) ? 1 : 0,
        prepTime, source.active !== false ? 1 : 0
      ]
    );
  }
  
  insertOnlineOrder(order: any): void {
    this.run(
      `INSERT INTO online_orders (
        id, property_id, rvc_id, source_id, external_order_id, order_type, status,
        customer_name, customer_phone, customer_email, delivery_address, special_instructions,
        items, subtotal, tax, delivery_fee, tip, total, payment_status, payment_method,
        scheduled_time, estimated_ready_time, employee_id, cloud_synced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        order.id, order.propertyId, order.rvcId, order.sourceId, order.externalOrderId,
        order.orderType, order.status || 'received', order.customerName, order.customerPhone,
        order.customerEmail, order.deliveryAddress, order.specialInstructions,
        JSON.stringify(order.items), order.subtotal || 0, order.tax || 0,
        order.deliveryFee || 0, order.tip || 0, order.total || 0,
        order.paymentStatus || 'unpaid', order.paymentMethod, order.scheduledTime,
        order.estimatedReadyTime, order.employeeId
      ]
    );
  }
  
  getOnlineOrder(id: string): any | null {
    return this.get('SELECT * FROM online_orders WHERE id = ?', [id]);
  }
  
  getOnlineOrdersByStatus(propertyId: string, status: string): any[] {
    return this.all(
      'SELECT * FROM online_orders WHERE property_id = ? AND status = ? ORDER BY created_at DESC',
      [propertyId, status]
    );
  }
  
  updateOnlineOrderStatus(id: string, status: string): void {
    this.run('UPDATE online_orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
  }
  
  // ==========================================================================
  // Bulk Operations
  // ==========================================================================
  
  clearTable(tableName: string): void {
    const allowedTables = [
      'employees', 'menu_items', 'slus', 'menu_item_slus', 'tax_groups',
      'tenders', 'discounts', 'service_charges', 'workstations', 'printers', 'kds_devices',
      'order_devices', 'print_class_routing', 'modifier_groups', 'modifiers',
      'modifier_group_modifiers', 'menu_item_modifier_groups', 'roles',
      'privileges', 'role_privileges', 'print_classes', 'major_groups', 'family_groups',
      'payment_processors', 'loyalty_programs', 'loyalty_members', 'loyalty_member_enrollments',
      'loyalty_transactions', 'loyalty_rewards', 'loyalty_redemptions', 'item_availability',
      'pos_layouts', 'pos_layout_cells', 'pos_layout_rvc_assignments',
      'gift_cards', 'gift_card_transactions', 'audit_logs', 'refunds', 'refund_items', 'refund_payments',
      'payment_transactions', 'terminal_devices', 'cash_drawers', 'drawer_assignments', 'cash_transactions', 'safe_counts',
      'job_codes', 'employee_job_codes', 'time_punches', 'break_sessions', 'fiscal_periods',
      'kds_ticket_items', 'offline_order_queue', 'online_order_sources', 'online_orders',
    ];
    
    if (!allowedTables.includes(tableName)) {
      throw new Error(`Cannot clear table: ${tableName}`);
    }
    
    this.run(`DELETE FROM ${tableName}`);
  }
  
  clearTransactionalData(): { tablesCleared: string[]; errors: string[] } {
    const transactionalTables = [
      'kds_ticket_items',
      'kds_tickets',
      'check_payments',
      'check_discounts',
      'check_service_charges',
      'check_items',
      'rounds',
      'refund_payments',
      'refund_items',
      'refunds',
      'payment_transactions',
      'terminal_sessions',
      'checks',
      'transaction_journal',
      'fiscal_periods',
      'cash_transactions',
      'drawer_assignments',
      'safe_counts',
      'audit_logs',
      'time_punches',
      'break_sessions',
      'gift_card_transactions',
      'gift_cards',
      'loyalty_transactions',
      'loyalty_redemptions',
      'item_availability',
      'online_orders',
      'offline_order_queue',
      'sync_queue',
    ];

    const tablesCleared: string[] = [];
    const errors: string[] = [];

    for (const table of transactionalTables) {
      try {
        this.run(`DELETE FROM ${table}`);
        tablesCleared.push(table);
      } catch (e: any) {
        if (!e.message?.includes('no such table')) {
          errors.push(`${table}: ${e.message}`);
        }
      }
    }

    try {
      this.run(
        `UPDATE workstation_config SET current_check_number = check_number_start WHERE check_number_start IS NOT NULL`
      );
      console.log('[DB] Reset workstation check number counters to start values');
    } catch (e: any) {
      if (!e.message?.includes('no such table') && !e.message?.includes('no such column')) {
        errors.push(`workstation_config reset: ${e.message}`);
      }
    }

    return { tablesCleared, errors };
  }

  getTableRowCount(tableName: string): number {
    const row = this.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`);
    return row?.count ?? 0;
  }
  
  // ==========================================================================
  // Database Management
  // ==========================================================================
  
  vacuum(): void {
    this.db.exec('VACUUM');
  }
  
  checkpoint(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)');
  }
  
  getOfflineDailySummary(businessDate: string): any {
    const salesRow = this.get<{ subtotal: number; tax: number; discount_total: number; total: number; count: number }>(
      `SELECT COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax), 0) as tax, 
              COALESCE(SUM(discount_total), 0) as discount_total, COALESCE(SUM(total), 0) as total,
              COUNT(*) as count
       FROM checks WHERE status = 'closed' AND business_date = ?`,
      [businessDate]
    );

    const openChecks = this.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM checks WHERE status = 'open' AND business_date = ?`,
      [businessDate]
    );

    const voidedChecks = this.get<{ count: number; total: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM checks WHERE status = 'voided' AND business_date = ?`,
      [businessDate]
    );

    const cashPayments = this.get<{ count: number; total: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(cp.amount), 0) as total 
       FROM check_payments cp JOIN tenders t ON cp.tender_id = t.id 
       WHERE t.is_cash_media = 1 AND cp.business_date = ? AND cp.voided = 0`,
      [businessDate]
    );

    const cardPayments = this.get<{ count: number; total: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(cp.amount), 0) as total 
       FROM check_payments cp JOIN tenders t ON cp.tender_id = t.id 
       WHERE t.is_card_media = 1 AND cp.business_date = ? AND cp.voided = 0`,
      [businessDate]
    );

    const giftPayments = this.get<{ count: number; total: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(cp.amount), 0) as total 
       FROM check_payments cp JOIN tenders t ON cp.tender_id = t.id 
       WHERE t.is_gift_media = 1 AND cp.business_date = ? AND cp.voided = 0`,
      [businessDate]
    );

    const journalStats = this.getJournalStats(businessDate);

    const kdsActive = this.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM kds_tickets WHERE status = 'active'`
    );

    const kdsBumped = this.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM kds_tickets WHERE status = 'bumped'`
    );

    const kdsAvgTime = this.get<{ avg_seconds: number }>(
      `SELECT COALESCE(AVG(
        CAST((julianday(bumped_at) - julianday(created_at)) * 86400 AS INTEGER)
       ), 0) as avg_seconds
       FROM kds_tickets WHERE status = 'bumped' AND bumped_at IS NOT NULL`
    );

    return {
      businessDate,
      generatedAt: new Date().toISOString(),
      sales: {
        netSales: salesRow?.subtotal || 0,
        taxTotal: salesRow?.tax || 0,
        discountTotal: salesRow?.discount_total || 0,
        grandTotal: salesRow?.total || 0,
        closedCheckCount: salesRow?.count || 0,
      },
      checks: {
        open: openChecks?.count || 0,
        closed: salesRow?.count || 0,
        voided: voidedChecks?.count || 0,
        voidedTotal: voidedChecks?.total || 0,
      },
      payments: {
        cash: { count: cashPayments?.count || 0, total: cashPayments?.total || 0 },
        card: { count: cardPayments?.count || 0, total: cardPayments?.total || 0 },
        gift: { count: giftPayments?.count || 0, total: giftPayments?.total || 0 },
      },
      kds: {
        activeTickets: kdsActive?.count || 0,
        bumpedTickets: kdsBumped?.count || 0,
        avgTicketSeconds: Math.round(kdsAvgTime?.avg_seconds || 0),
      },
      journal: journalStats,
    };
  }
  
  close(): void {
    this.db.close();
  }
}

export interface JournalEntry {
  event_id: string;
  txn_group_id: string;
  device_id: string;
  rvc_id: string;
  business_date: string;
  check_id: string;
  event_type: string;
  payload_json: string;
  config_version: string | null;
  created_at: string;
  sync_state: string;
  sync_attempts: number;
  synced_at: string | null;
}

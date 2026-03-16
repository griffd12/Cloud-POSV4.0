const { offlineDbLogger } = require('./logger.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class OfflineDatabase {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(require('os').homedir(), '.cloudpos', 'data');
    this.dbPath = path.join(this.dataDir, 'offline.db');
    this.db = null;
    this.usingSqlite = false;
    this.useEncryption = options.useEncryption !== false;
    this.cacheDir = path.join(this.dataDir, 'cache');
    this.lastSyncTime = null;
    this.syncInProgress = false;
    this._lastBackoffLogCount = -1;
    this._staleCleanupDone = false;

    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.dataDir, this.cacheDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async getEncryptionKey() {
    try {
      const keytar = require('keytar');
      const existing = await keytar.getPassword('CloudPOS', 'offline-db-key');
      if (existing) return existing;
      const newKey = crypto.randomBytes(32).toString('hex');
      await keytar.setPassword('CloudPOS', 'offline-db-key', newKey);
      offlineDbLogger.info('Encryption', 'Generated and stored new encryption key in Windows Credential Manager');
      return newKey;
    } catch (e) {
      offlineDbLogger.warn('Encryption', 'keytar not available for Credential Manager, using file-based key', e.message);
      return this.getFileBasedKey();
    }
  }

  getFileBasedKey() {
    const keyPath = path.join(this.dataDir, '.db_key');
    try {
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf-8').trim();
      }
      const newKey = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
      return newKey;
    } catch (e) {
      offlineDbLogger.error('Encryption', 'Key management error', e.message);
      return crypto.createHash('sha256').update(require('os').hostname() + this.dataDir).digest('hex');
    }
  }

  async initialize() {
    try {
      let Database;
      try {
        Database = require('better-sqlite3');
        offlineDbLogger.info('Init', 'better-sqlite3 native module loaded successfully');
      } catch (e) {
        offlineDbLogger.warn('Init', `better-sqlite3 not available: ${e.message}`);
        offlineDbLogger.warn('Init', 'Falling back to JSON file storage');
        return this.initJsonStorage();
      }

      this.db = new Database(this.dbPath);

      if (this.useEncryption) {
        const key = await this.getEncryptionKey();
        try {
          this.db.pragma(`key = "${key}"`);
          const testResult = this.db.pragma('cipher_version');
          if (testResult && testResult.length > 0) {
            this.db.pragma('cipher_page_size = 4096');
            this.encryptionActive = true;
            offlineDbLogger.info('Encryption', `SQLCipher encryption enabled (${testResult[0].cipher_version})`);
          } else {
            offlineDbLogger.warn('Encryption', 'better-sqlite3 not compiled with SQLCipher. To enable encryption, rebuild with: npm rebuild better-sqlite3 --build-from-source --sqlite3=sqlcipher');
            this.encryptionActive = false;
          }
        } catch (encErr) {
          offlineDbLogger.warn('Encryption', 'Encryption not available (better-sqlite3 built without SQLCipher)', encErr.message);
          this.encryptionActive = false;
          this.db.close();
          this.db = new Database(this.dbPath);
        }
      }

      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.usingSqlite = true;

      this.createTables();
      this.migrateSchema();
      offlineDbLogger.info('Init', 'SQLite database initialized', this.dbPath);
      offlineDbLogger.info('Init', `Encryption: ${this.encryptionActive ? 'ENABLED (AES-256-CBC)' : 'DISABLED (build with SQLCipher to enable)'}`);
      return true;
    } catch (e) {
      offlineDbLogger.error('Init', 'SQLite init failed', e.message);
      return this.initJsonStorage();
    }
  }

  createTables() {
    this.db.exec(`
      -- Offline operation queue (for sync back to cloud)
      CREATE TABLE IF NOT EXISTS offline_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT DEFAULT 'POST',
        body TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0,
        synced_at TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 5
      );

      -- POS configuration cache
      CREATE TABLE IF NOT EXISTS config_cache (
        cache_key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        enterprise_id TEXT,
        property_id TEXT,
        rvc_id TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT,
        version INTEGER DEFAULT 1
      );

      -- Menu items cache
      CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Modifier groups cache
      CREATE TABLE IF NOT EXISTS modifier_groups (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Condiment groups cache
      CREATE TABLE IF NOT EXISTS condiment_groups (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Combo meals cache
      CREATE TABLE IF NOT EXISTS combo_meals (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Employees cache (PIN + roles for auth)
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Tax rates cache
      CREATE TABLE IF NOT EXISTS tax_rates (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Discounts cache
      CREATE TABLE IF NOT EXISTS discounts (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Tender types cache
      CREATE TABLE IF NOT EXISTS tender_types (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Order types cache
      CREATE TABLE IF NOT EXISTS order_types (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Service charges cache
      CREATE TABLE IF NOT EXISTS service_charges (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Revenue centers cache
      CREATE TABLE IF NOT EXISTS revenue_centers (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        property_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Properties cache
      CREATE TABLE IF NOT EXISTS properties (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Printers cache
      CREATE TABLE IF NOT EXISTS printers (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        property_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Workstations cache
      CREATE TABLE IF NOT EXISTS workstations (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        property_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Menu item availability cache
      CREATE TABLE IF NOT EXISTS menu_item_availability (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Major groups cache
      CREATE TABLE IF NOT EXISTS major_groups (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Family groups cache
      CREATE TABLE IF NOT EXISTS family_groups (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Menu item classes cache
      CREATE TABLE IF NOT EXISTS menu_item_classes (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Standalone modifiers cache
      CREATE TABLE IF NOT EXISTS modifiers (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Modifier group to modifier linkage cache
      CREATE TABLE IF NOT EXISTS modifier_group_modifiers (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        modifier_group_id TEXT,
        modifier_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Menu item to modifier group linkage cache
      CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        menu_item_id TEXT,
        modifier_group_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- KDS devices cache
      CREATE TABLE IF NOT EXISTS kds_devices (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        property_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Order devices cache
      CREATE TABLE IF NOT EXISTS order_devices (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Order device to printer linkage cache
      CREATE TABLE IF NOT EXISTS order_device_printers (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        order_device_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Order device to KDS linkage cache
      CREATE TABLE IF NOT EXISTS order_device_kds (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        order_device_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Print classes cache
      CREATE TABLE IF NOT EXISTS print_classes (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Print class routing cache
      CREATE TABLE IF NOT EXISTS print_class_routings (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Ingredient prefixes cache (conversational ordering)
      CREATE TABLE IF NOT EXISTS ingredient_prefixes (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Menu item recipe ingredients cache (conversational ordering)
      CREATE TABLE IF NOT EXISTS menu_item_recipe_ingredients (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        menu_item_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Payment terminals cache
      CREATE TABLE IF NOT EXISTS payment_terminals (
        id TEXT PRIMARY KEY,
        property_id TEXT,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Payment processors cache
      CREATE TABLE IF NOT EXISTS payment_processors (
        id TEXT PRIMARY KEY,
        property_id TEXT,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Offline checks (local orders)
      CREATE TABLE IF NOT EXISTS offline_checks (
        id TEXT PRIMARY KEY,
        check_number INTEGER,
        rvc_id TEXT,
        employee_id TEXT,
        order_type TEXT,
        status TEXT DEFAULT 'open',
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0,
        synced_at TEXT,
        cloud_id TEXT
      );

      -- Offline check items
      CREATE TABLE IF NOT EXISTS offline_check_items (
        id TEXT PRIMARY KEY,
        check_id TEXT NOT NULL,
        menu_item_id TEXT,
        menu_item_name TEXT,
        quantity INTEGER DEFAULT 1,
        unit_price TEXT,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0
      );

      -- Offline payments
      CREATE TABLE IF NOT EXISTS offline_payments (
        id TEXT PRIMARY KEY,
        check_id TEXT,
        tender_id TEXT,
        tender_name TEXT,
        amount TEXT,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0,
        synced_at TEXT
      );

      -- Offline time punches
      CREATE TABLE IF NOT EXISTS offline_time_punches (
        id TEXT PRIMARY KEY,
        employee_id TEXT,
        punch_type TEXT,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0
      );

      -- Offline print jobs
      CREATE TABLE IF NOT EXISTS offline_print_jobs (
        id TEXT PRIMARY KEY,
        printer_id TEXT,
        printer_ip TEXT,
        printer_port INTEGER DEFAULT 9100,
        job_type TEXT,
        data TEXT NOT NULL,
        escpos_data TEXT,
        status TEXT DEFAULT 'pending',
        leased_by TEXT,
        leased_until TEXT,
        dedupe_key TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        printed_at TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_print_dedupe ON offline_print_jobs (dedupe_key) WHERE dedupe_key IS NOT NULL;

      -- RVC check number counters (concurrency-safe, replaces MAX()+1)
      CREATE TABLE IF NOT EXISTS rvc_counters (
        rvc_id TEXT PRIMARY KEY,
        next_check_number INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Idempotency keys for exactly-once operations (INSERT-first pattern)
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT NOT NULL,
        workstation_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing',
        request_hash TEXT,
        response_status INTEGER,
        response_body TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT,
        UNIQUE (enterprise_id, workstation_id, operation, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_offline_idempotency_expires ON idempotency_keys (expires_at);

      -- Sync metadata
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Local reports data
      CREATE TABLE IF NOT EXISTS local_sales_data (
        id TEXT PRIMARY KEY,
        business_date TEXT,
        rvc_id TEXT,
        employee_id TEXT,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Roles cache
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT,
        updated_at TEXT
      );

      -- Role privileges cache
      CREATE TABLE IF NOT EXISTS role_privileges (
        id TEXT PRIMARY KEY,
        role_id TEXT,
        enterprise_id TEXT,
        data TEXT,
        updated_at TEXT
      );

      -- EMC option flags cache
      CREATE TABLE IF NOT EXISTS emc_option_flags (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        entity_type TEXT,
        entity_id TEXT,
        option_key TEXT,
        value_text TEXT,
        scope_level TEXT,
        scope_id TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_emc_option_flags_unique
        ON emc_option_flags (enterprise_id, entity_type, entity_id, option_key, scope_level, scope_id);

      -- Additional config tables for expanded sync (v3.1.34)
      CREATE TABLE IF NOT EXISTS tax_groups (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS enterprises (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS job_codes (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS privileges (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS loyalty_programs (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS loyalty_rewards (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS gift_cards (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS employee_assignments (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS workstation_order_devices (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS workstation_service_bindings (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS registered_devices (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS item_availability (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS break_rules (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS fiscal_periods (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS cash_drawers (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS drawer_assignments (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS descriptor_sets (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- POS layout RVC assignments cache
      CREATE TABLE IF NOT EXISTS pos_layout_rvc_assignments (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Menu item SLU assignments cache
      CREATE TABLE IF NOT EXISTS menu_item_slus (
        id TEXT PRIMARY KEY,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Terminal sessions (local management for offline card processing)
      CREATE TABLE IF NOT EXISTS terminal_sessions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  migrateSchema() {
    const enterpriseIdTables = [
      'modifier_group_modifiers',
      'menu_item_modifier_groups',
      'menu_item_recipe_ingredients',
      'printers',
      'workstations',
      'kds_devices',
      'order_device_printers',
      'order_device_kds',
      'enterprises',
      'privileges',
    ];

    for (const table of enterpriseIdTables) {
      try {
        const columns = this.db.pragma(`table_info(${table})`);
        const hasEnterpriseId = columns.some(col => col.name === 'enterprise_id');
        if (!hasEnterpriseId) {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN enterprise_id TEXT`);
          offlineDbLogger.info('Migration', `Added enterprise_id column to ${table}`);
        }
      } catch (e) {
        offlineDbLogger.warn('Migration', `Migration skipped for ${table}: ${e.message}`);
      }
    }

    const additionalMigrations = [
      { table: 'offline_checks', column: 'check_number', type: 'INTEGER' },
      { table: 'offline_checks', column: 'rvc_id', type: 'TEXT' },
      { table: 'offline_checks', column: 'employee_id', type: 'TEXT' },
      { table: 'offline_checks', column: 'order_type', type: 'TEXT' },
      { table: 'offline_checks', column: 'status', type: "TEXT DEFAULT 'open'" },
      { table: 'offline_checks', column: 'updated_at', type: 'TEXT' },
      { table: 'offline_checks', column: 'synced', type: 'INTEGER DEFAULT 0' },
      { table: 'offline_checks', column: 'synced_at', type: 'TEXT' },
      { table: 'offline_checks', column: 'cloud_id', type: 'TEXT' },
      { table: 'offline_checks', column: 'data', type: 'TEXT' },
      { table: 'offline_check_items', column: 'data', type: 'TEXT' },
      { table: 'offline_queue', column: 'priority', type: 'INTEGER DEFAULT 5' },
      { table: 'offline_queue', column: 'retry_count', type: 'INTEGER DEFAULT 0' },
      { table: 'offline_queue', column: 'error', type: 'TEXT' },
      { table: 'offline_queue', column: 'last_failed_at', type: 'TEXT' },
      { table: 'offline_payments', column: 'data', type: 'TEXT' },
      { table: 'offline_payments', column: 'tender_id', type: 'TEXT' },
      { table: 'offline_payments', column: 'tender_name', type: 'TEXT' },
      { table: 'offline_payments', column: 'amount', type: 'TEXT' },
      { table: 'offline_payments', column: 'check_id', type: 'TEXT' },
      { table: 'offline_payments', column: 'synced', type: 'INTEGER DEFAULT 0' },
      { table: 'offline_payments', column: 'synced_at', type: 'TEXT' },
    ];

    for (const { table, column, type } of additionalMigrations) {
      try {
        const columns = this.db.pragma(`table_info(${table})`);
        const hasColumn = columns.some(col => col.name === column);
        if (!hasColumn) {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
          offlineDbLogger.info('Migration', `Added ${column} column to ${table}`);
        }
      } catch (e) {
        offlineDbLogger.warn('Migration', `Migration skipped for ${table}.${column}: ${e.message}`);
      }
    }

    try {
      this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_checks_rvc_check_number ON offline_checks (rvc_id, check_number)`);
    } catch (e) {
      offlineDbLogger.warn('Migration', `Index idx_offline_checks_rvc_check_number skipped: ${e.message}`);
    }

    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS payment_processors (
        id TEXT PRIMARY KEY,
        property_id TEXT,
        enterprise_id TEXT,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
    } catch (e) {
      offlineDbLogger.warn('Migration', `payment_processors table creation: ${e.message}`);
    }

    for (const tbl of ['payment_terminals', 'payment_processors']) {
      try {
        const columns = this.db.pragma(`table_info(${tbl})`);
        if (!columns.some(col => col.name === 'enterprise_id')) {
          this.db.exec(`ALTER TABLE ${tbl} ADD COLUMN enterprise_id TEXT`);
          offlineDbLogger.info('Migration', `Added enterprise_id column to ${tbl}`);
        }
      } catch (e) {
        offlineDbLogger.warn('Migration', `Migration skipped for ${tbl}: ${e.message}`);
      }
    }

    for (const tbl of ['pos_layout_rvc_assignments', 'menu_item_slus', 'terminal_sessions']) {
      try {
        this.db.exec(`CREATE TABLE IF NOT EXISTS ${tbl} (
          id TEXT PRIMARY KEY,
          ${tbl === 'terminal_sessions' ? '' : 'enterprise_id TEXT,'}
          data TEXT NOT NULL,
          ${tbl === 'terminal_sessions' ? "status TEXT DEFAULT 'pending'," : ''}
          ${tbl === 'terminal_sessions' ? "created_at TEXT DEFAULT (datetime('now'))," : ''}
          updated_at TEXT DEFAULT (datetime('now'))
        )`);
      } catch (e) {
        offlineDbLogger.warn('Migration', `${tbl} table migration: ${e.message}`);
      }
    }

    this.updateCheckCountersAfterSync();
  }

  initJsonStorage() {
    this.usingSqlite = false;
    const files = {
      'offline_queue.json': '[]',
      'config_cache.json': '{}',
      'offline_checks.json': '[]',
      'offline_payments.json': '[]',
      'sync_metadata.json': '{}',
    };
    Object.entries(files).forEach(([file, defaultContent]) => {
      const filePath = path.join(this.dataDir, file);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, defaultContent);
      }
    });
    offlineDbLogger.info('Init', 'JSON file storage initialized', this.dataDir);
    return true;
  }

  cacheConfigData(key, data, enterpriseId, propertyId, rvcId) {
    try {
      if (this.usingSqlite) {
        this.db.prepare(`
          INSERT OR REPLACE INTO config_cache (cache_key, data, enterprise_id, property_id, rvc_id, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(key, JSON.stringify(data), enterpriseId || null, propertyId || null, rvcId || null);
      } else {
        const cachePath = path.join(this.dataDir, 'config_cache.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        cache[key] = { data, enterpriseId, propertyId, rvcId, updatedAt: new Date().toISOString() };
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      }
    } catch (e) {
      offlineDbLogger.error('Cache', 'Cache config error', e.message);
    }
  }

  getCachedConfig(key) {
    try {
      if (this.usingSqlite) {
        const row = this.db.prepare('SELECT data FROM config_cache WHERE cache_key = ?').get(key);
        return row ? JSON.parse(row.data) : null;
      } else {
        const cachePath = path.join(this.dataDir, 'config_cache.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        return cache[key]?.data || null;
      }
    } catch (e) {
      return null;
    }
  }

  cacheEntityList(tableName, items, enterpriseId) {
    if (!this.usingSqlite) {
      this.cacheConfigData(tableName, items, enterpriseId);
      return;
    }

    try {
      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO ${tableName} (id, enterprise_id, data, updated_at)
        VALUES (?, ?, ?, datetime('now'))
      `);

      const tx = this.db.transaction((rows) => {
        for (const item of rows) {
          insert.run(item.id, enterpriseId || null, JSON.stringify(item));
        }
      });

      tx(items);
    } catch (e) {
      offlineDbLogger.error('Cache', `Cache ${tableName} error`, e.message);
      this.cacheConfigData(tableName, items, enterpriseId);
    }
  }

  getEntityList(tableName, enterpriseId) {
    if (!this.usingSqlite) {
      return this.getCachedConfig(tableName) || [];
    }

    try {
      let rows;
      if (enterpriseId) {
        rows = this.db.prepare(`SELECT data FROM ${tableName} WHERE enterprise_id = ?`).all(enterpriseId);
      } else {
        rows = this.db.prepare(`SELECT data FROM ${tableName}`).all();
      }
      return rows.map(r => JSON.parse(r.data));
    } catch (e) {
      return this.getCachedConfig(tableName) || [];
    }
  }

  getRolePrivileges(roleId) {
    if (!roleId) return [];
    try {
      const cached = this.getCachedConfig(`role_privileges_${roleId}`);
      if (cached && Array.isArray(cached)) return cached;
      return [];
    } catch (e) {
      return [];
    }
  }

  getEntity(tableName, id) {
    if (!this.usingSqlite) {
      const all = this.getCachedConfig(tableName) || [];
      return all.find(item => item.id === id) || null;
    }

    try {
      const row = this.db.prepare(`SELECT data FROM ${tableName} WHERE id = ?`).get(id);
      return row ? JSON.parse(row.data) : null;
    } catch (e) {
      return null;
    }
  }

  async syncFromCloud(serverUrl, enterpriseId, propertyId, rvcId) {
    if (this.syncInProgress) return { success: false, reason: 'sync already in progress' };
    this.syncInProgress = true;

    offlineDbLogger.info('Sync', 'Starting full sync from cloud...');
    const results = { success: true, errors: [], synced: [] };

    const endpoints = [
      { table: 'menu_items', url: `/api/menu-items?enterpriseId=${enterpriseId}` },
      { table: 'modifier_groups', url: `/api/modifier-groups?enterpriseId=${enterpriseId}` },
      { table: 'modifiers', url: `/api/modifiers?enterpriseId=${enterpriseId}` },
      { table: 'condiment_groups', url: `/api/condiment-groups?enterpriseId=${enterpriseId}` },
      { table: 'combo_meals', url: `/api/combo-meals?enterpriseId=${enterpriseId}` },
      { table: 'employees', url: `/api/employees?enterpriseId=${enterpriseId}` },
      { table: 'roles', url: `/api/roles?enterpriseId=${enterpriseId}` },
      { table: 'tax_rates', url: `/api/tax-rates?enterpriseId=${enterpriseId}` },
      { table: 'discounts', url: `/api/discounts?enterpriseId=${enterpriseId}` },
      { table: 'tender_types', url: `/api/tender-types?enterpriseId=${enterpriseId}` },
      { table: 'order_types', url: `/api/order-types?enterpriseId=${enterpriseId}` },
      { table: 'service_charges', url: `/api/service-charges?enterpriseId=${enterpriseId}` },
      { table: 'major_groups', url: `/api/major-groups?enterpriseId=${enterpriseId}` },
      { table: 'family_groups', url: `/api/family-groups?enterpriseId=${enterpriseId}` },
      { table: 'menu_item_classes', url: `/api/menu-item-classes?enterpriseId=${enterpriseId}` },
      { table: 'print_classes', url: `/api/print-classes?enterpriseId=${enterpriseId}` },
      { table: 'print_class_routings', url: `/api/print-class-routings` },
      { table: 'ingredient_prefixes', url: `/api/ingredient-prefixes?enterpriseId=${enterpriseId}` },
      { table: 'modifier_group_modifiers', url: `/api/sync/modifier-group-modifiers` },
      { table: 'menu_item_modifier_groups', url: `/api/sync/menu-item-modifier-groups` },
      { table: 'menu_item_recipe_ingredients', url: `/api/sync/menu-item-recipe-ingredients` },
      { table: 'emc_option_flags', url: `/api/option-flags?enterpriseId=${enterpriseId}` },
      { table: 'tax_groups', url: `/api/tax-groups?enterpriseId=${enterpriseId}` },
      { table: 'enterprises', url: `/api/enterprises` },
      { table: 'job_codes', url: `/api/job-codes?enterpriseId=${enterpriseId}` },
      { table: 'privileges', url: `/api/privileges` },
      { table: 'loyalty_programs', url: `/api/loyalty-programs?enterpriseId=${enterpriseId}` },
      { table: 'loyalty_rewards', url: `/api/loyalty-rewards?enterpriseId=${enterpriseId}` },
      { table: 'gift_cards', url: `/api/gift-cards?enterpriseId=${enterpriseId}` },
      { table: 'employee_assignments', url: `/api/sync/employee-assignments` },
      { table: 'workstation_order_devices', url: `/api/sync/workstation-order-devices` },
      { table: 'workstation_service_bindings', url: `/api/sync/workstation-service-bindings` },
      { table: 'pos_layout_rvc_assignments', url: `/api/sync/pos-layout-rvc-assignments` },
      { table: 'menu_item_slus', url: `/api/sync/menu-item-slus` },
    ];

    if (propertyId) {
      endpoints.push(
        { table: 'revenue_centers', url: `/api/rvcs?propertyId=${propertyId}` },
        { table: 'printers', url: `/api/printers?propertyId=${propertyId}` },
        { table: 'workstations', url: `/api/workstations?propertyId=${propertyId}` },
        { table: 'properties', url: `/api/properties?enterpriseId=${enterpriseId}` },
        { table: 'kds_devices', url: `/api/kds-devices?propertyId=${propertyId}` },
        { table: 'order_devices', url: `/api/order-devices?propertyId=${propertyId}` },
        { table: 'order_device_printers', url: `/api/sync/order-device-printers` },
        { table: 'order_device_kds', url: `/api/sync/order-device-kds` },
        { table: 'payment_terminals', url: `/api/terminal-devices?propertyId=${propertyId}` },
        { table: 'payment_processors', url: `/api/payment-processors?propertyId=${propertyId}` },
        { table: 'registered_devices', url: `/api/registered-devices?propertyId=${propertyId}` },
        { table: 'item_availability', url: `/api/item-availability?propertyId=${propertyId}` },
        { table: 'break_rules', url: `/api/break-rules?propertyId=${propertyId}` },
        { table: 'fiscal_periods', url: `/api/fiscal-periods?propertyId=${propertyId}` },
        { table: 'cash_drawers', url: `/api/cash-drawers?propertyId=${propertyId}` },
        { table: 'drawer_assignments', url: `/api/drawer-assignments?propertyId=${propertyId}` },
        { table: 'descriptor_sets', url: `/api/descriptors?enterpriseId=${enterpriseId}` },
      );
    }

    if (rvcId) {
      endpoints.push(
        { key: `rvc_config_${rvcId}`, url: `/api/rvcs/${rvcId}` },
        { key: `slus_${rvcId}`, url: `/api/slus?rvcId=${rvcId}` },
        { key: `posLayout_default_${rvcId}`, url: `/api/pos-layouts/default/${rvcId}` },
      );
    }

    const allRvcs = this.getEntityList('revenue_centers', enterpriseId) || [];
    for (const rvc of allRvcs) {
      if (rvc.id && rvc.id !== rvcId) {
        endpoints.push(
          { key: `posLayout_default_${rvc.id}`, url: `/api/pos-layouts/default/${rvc.id}` },
        );
      }
    }

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${serverUrl}${ep.url}`, {
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          if (ep.table) {
            const items = Array.isArray(data) ? data : [data];
            if (ep.table === 'emc_option_flags') {
              this.cacheOptionFlags(items, enterpriseId);
            } else {
              this.cacheEntityList(ep.table, items, enterpriseId);
            }
            results.synced.push({ table: ep.table, count: items.length });
          } else if (ep.key) {
            this.cacheConfigData(ep.key, data, enterpriseId, propertyId, rvcId);
            results.synced.push({ key: ep.key });
          }
        } else {
          results.errors.push({ endpoint: ep.url, status: response.status });
        }
      } catch (e) {
        results.errors.push({ endpoint: ep.url, error: e.message });
      }
    }

    const rvcIdsToSync = rvcId ? [rvcId] : [];
    for (const rvc of allRvcs) {
      if (rvc.id && !rvcIdsToSync.includes(rvc.id)) rvcIdsToSync.push(rvc.id);
    }
    const syncedLayoutIds = new Set();
    for (const syncRvcId of rvcIdsToSync) {
      try {
        const layoutData = this.getCachedConfig(`posLayout_default_${syncRvcId}`);
        if (layoutData && layoutData.id && !syncedLayoutIds.has(layoutData.id)) {
          syncedLayoutIds.add(layoutData.id);
          const layoutId = layoutData.id;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const cellsResponse = await fetch(`${serverUrl}/api/pos-layouts/${layoutId}/cells`, {
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
          });
          clearTimeout(timeout);
          if (cellsResponse.ok) {
            const cellsData = await cellsResponse.json();
            this.cacheConfigData(`posLayoutCells_${layoutId}`, cellsData, enterpriseId, propertyId, syncRvcId);
            results.synced.push({ key: `posLayoutCells_${layoutId}` });
          }
        }
      } catch (e) {
        results.errors.push({ endpoint: `pos-layout-cells-${syncRvcId}`, error: e.message });
      }
    }

    try {
      const employees = this.getEntityList('employees', enterpriseId);
      const uniqueRoleIds = [...new Set(employees.map(e => e.roleId).filter(Boolean))];
      for (const roleId of uniqueRoleIds) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const privResponse = await fetch(`${serverUrl}/api/roles/${roleId}/privileges`, {
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
          });
          clearTimeout(timeout);
          if (privResponse.ok) {
            const privData = await privResponse.json();
            const privileges = Array.isArray(privData) ? privData.map(p => p.privilegeCode || p.code || p) : [];
            this.cacheConfigData(`role_privileges_${roleId}`, privileges, enterpriseId);
            results.synced.push({ key: `role_privileges_${roleId}`, count: privileges.length });
          }
        } catch (e) {
          results.errors.push({ endpoint: `roles/${roleId}/privileges`, error: e.message });
        }
      }
    } catch (e) {
      offlineDbLogger.warn('Sync', `Role privilege sync error: ${e.message}`);
    }

    const syncTimestamp = new Date().toISOString();
    this.setSyncMetadata('lastFullSync', syncTimestamp);
    this.setSyncMetadata('lastSyncTimestamp', syncTimestamp);
    this.setSyncMetadata('enterpriseId', enterpriseId);
    this.setSyncMetadata('propertyId', propertyId || '');
    this.setSyncMetadata('rvcId', rvcId || '');
    this.lastSyncTime = new Date();
    this.syncInProgress = false;

    offlineDbLogger.info('Sync', `Sync complete. ${results.synced.length} tables synced, ${results.errors.length} errors`);
    if (results.errors.length > 0) {
      results.errors.forEach((err, i) => {
        const detail = err.status ? `HTTP ${err.status}` : err.error || 'unknown';
        offlineDbLogger.warn('Sync', `  Error ${i + 1}: ${err.endpoint} - ${detail}`);
      });
    }
    return results;
  }

  queueOperation(type, endpoint, method, body, priority) {
    try {
      if (this.usingSqlite) {
        this.db.prepare(`
          INSERT INTO offline_queue (type, endpoint, method, body, priority)
          VALUES (?, ?, ?, ?, ?)
        `).run(type, endpoint, method || 'POST', JSON.stringify(body), priority || 5);
      } else {
        const queuePath = path.join(this.dataDir, 'offline_queue.json');
        const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
        queue.push({
          id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type, endpoint, method: method || 'POST',
          body: JSON.stringify(body),
          created_at: new Date().toISOString(),
          synced: false,
          priority: priority || 5,
        });
        fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
      }
    } catch (e) {
      offlineDbLogger.error('Queue', 'Queue operation error', e.message);
    }
  }

  getPendingOperations() {
    try {
      if (this.usingSqlite) {
        return this.db.prepare('SELECT * FROM offline_queue WHERE synced = 0 AND retry_count < 10 ORDER BY priority ASC, created_at ASC').all();
      } else {
        const queuePath = path.join(this.dataDir, 'offline_queue.json');
        const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
        return queue.filter(op => !op.synced && (op.retry_count || 0) < 10);
      }
    } catch (e) {
      return [];
    }
  }

  getFailedOperations() {
    try {
      if (this.usingSqlite) {
        return this.db.prepare('SELECT * FROM offline_queue WHERE synced = 0 AND retry_count >= 10 ORDER BY created_at DESC').all();
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  getFailedOperationCount() {
    try {
      if (this.usingSqlite) {
        return this.db.prepare('SELECT COUNT(*) as c FROM offline_queue WHERE synced = 0 AND retry_count >= 10').get().c;
      }
      return 0;
    } catch (e) {
      return 0;
    }
  }

  clearFailedOperations() {
    try {
      if (this.usingSqlite) {
        const count = this.db.prepare('SELECT COUNT(*) as c FROM offline_queue WHERE synced = 0 AND retry_count >= 10').get().c;
        this.db.prepare("UPDATE offline_queue SET synced = 2, synced_at = datetime('now') WHERE synced = 0 AND retry_count >= 10").run();
        offlineDbLogger.info('Sync', `Cleared ${count} permanently failed operations`);
        return count;
      }
      return 0;
    } catch (e) {
      offlineDbLogger.error('Sync', 'Clear failed ops error', e.message);
      return 0;
    }
  }

  markOperationSynced(id) {
    try {
      if (this.usingSqlite) {
        this.db.prepare("UPDATE offline_queue SET synced = 1, synced_at = datetime('now') WHERE id = ?").run(id);
      } else {
        const queuePath = path.join(this.dataDir, 'offline_queue.json');
        const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
        const op = queue.find(o => o.id === id);
        if (op) { op.synced = true; op.synced_at = new Date().toISOString(); }
        fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
      }
    } catch (e) {
      offlineDbLogger.error('Sync', 'Mark synced error', e.message);
    }
  }

  markOperationFailed(id, error) {
    try {
      if (this.usingSqlite) {
        this.db.prepare("UPDATE offline_queue SET retry_count = retry_count + 1, error = ?, last_failed_at = datetime('now') WHERE id = ?").run(error, id);
      }
    } catch (e) {}
  }

  markOperationPermanentlyFailed(id, error) {
    try {
      if (this.usingSqlite) {
        this.db.prepare("UPDATE offline_queue SET retry_count = 10, error = ? WHERE id = ?").run(error, id);
        offlineDbLogger.warn('Sync', `Operation ${id} permanently failed: ${error}`);
      }
    } catch (e) {}
  }

  cleanupStaleOperations() {
    try {
      if (!this.usingSqlite || this._staleCleanupDone) return;
      this._staleCleanupDone = true;
      const stale = this.db.prepare(
        "SELECT id, type, endpoint, created_at FROM offline_queue WHERE synced = 0 AND retry_count < 10 AND datetime(created_at) < datetime('now', '-24 hours')"
      ).all();
      if (stale.length > 0) {
        offlineDbLogger.warn('Sync', `Cleaning up ${stale.length} stale operation(s) older than 24h`);
        const stmt = this.db.prepare("UPDATE offline_queue SET retry_count = 10, error = 'expired: stale operation older than 24h' WHERE id = ?");
        for (const op of stale) {
          stmt.run(op.id);
          offlineDbLogger.info('Sync', `Expired stale op ${op.id}: ${op.type} -> ${op.endpoint} (created ${op.created_at})`);
        }
      }
    } catch (e) {
      offlineDbLogger.error('Sync', `Stale cleanup error: ${e.message}`);
    }
  }

  saveOfflineCheck(check) {
    try {
      if (this.usingSqlite) {
        this.db.prepare(`
          INSERT OR REPLACE INTO offline_checks (id, check_number, rvc_id, employee_id, order_type, status, data, updated_at, synced, cloud_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
        `).run(check.id, check.checkNumber, check.rvcId, check.employeeId, check.orderType, check.status || 'open', JSON.stringify(check), check.synced || 0, check.cloud_id || null);
      } else {
        const checksPath = path.join(this.dataDir, 'offline_checks.json');
        const checks = JSON.parse(fs.readFileSync(checksPath, 'utf-8'));
        const idx = checks.findIndex(c => c.id === check.id);
        if (idx >= 0) checks[idx] = check;
        else checks.push(check);
        fs.writeFileSync(checksPath, JSON.stringify(checks, null, 2));
      }
    } catch (e) {
      offlineDbLogger.error('Check', 'Save check error', e.message);
    }
  }

  getOfflineChecks(rvcId, status) {
    try {
      if (this.usingSqlite) {
        let query = 'SELECT data FROM offline_checks WHERE 1=1';
        const params = [];
        if (rvcId) { query += ' AND rvc_id = ?'; params.push(rvcId); }
        if (status) { query += ' AND status = ?'; params.push(status); }
        query += ' ORDER BY created_at DESC';
        return this.db.prepare(query).all(...params).map(r => {
          const check = JSON.parse(r.data);
          check.items = check.items || [];
          check.payments = check.payments || [];
          check.serviceCharges = check.serviceCharges || [];
          check.discounts = check.discounts || [];
          return check;
        });
      } else {
        const checksPath = path.join(this.dataDir, 'offline_checks.json');
        let checks = JSON.parse(fs.readFileSync(checksPath, 'utf-8'));
        if (rvcId) checks = checks.filter(c => c.rvcId === rvcId);
        if (status) checks = checks.filter(c => c.status === status);
        return checks;
      }
    } catch (e) {
      return [];
    }
  }

  getOfflineCheck(id) {
    try {
      if (this.usingSqlite) {
        let row = this.db.prepare('SELECT data FROM offline_checks WHERE id = ?').get(id);
        if (!row) {
          row = this.db.prepare('SELECT data FROM offline_checks WHERE cloud_id = ?').get(id);
        }
        if (row) {
          const check = JSON.parse(row.data);
          check.items = check.items || [];
          check.payments = check.payments || [];
          check.serviceCharges = check.serviceCharges || [];
          check.discounts = check.discounts || [];
          return check;
        }
        return null;
      } else {
        const checksPath = path.join(this.dataDir, 'offline_checks.json');
        const checks = JSON.parse(fs.readFileSync(checksPath, 'utf-8'));
        const check = checks.find(c => c.id === id || c.cloud_id === id) || null;
        if (check) {
          check.items = check.items || [];
          check.payments = check.payments || [];
          check.serviceCharges = check.serviceCharges || [];
          check.discounts = check.discounts || [];
        }
        return check;
      }
    } catch (e) {
      return null;
    }
  }

  getAllOfflineChecks() {
    try {
      if (this.usingSqlite) {
        const rows = this.db.prepare('SELECT data FROM offline_checks ORDER BY created_at DESC').all();
        return rows.map(r => {
          const check = JSON.parse(r.data);
          check.items = check.items || [];
          check.payments = check.payments || [];
          check.serviceCharges = check.serviceCharges || [];
          check.discounts = check.discounts || [];
          return check;
        });
      } else {
        const checksPath = path.join(this.dataDir, 'offline_checks.json');
        if (!fs.existsSync(checksPath)) return [];
        return JSON.parse(fs.readFileSync(checksPath, 'utf-8'));
      }
    } catch (e) {
      return [];
    }
  }

  saveOfflinePayment(payment) {
    try {
      if (this.usingSqlite) {
        this.db.prepare(`
          INSERT OR REPLACE INTO offline_payments (id, check_id, tender_id, tender_name, amount, data, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(payment.id, payment.checkId, payment.tenderId, payment.tenderName, payment.amount, JSON.stringify(payment));
      } else {
        const paymentsPath = path.join(this.dataDir, 'offline_payments.json');
        const payments = JSON.parse(fs.readFileSync(paymentsPath, 'utf-8'));
        payments.push(payment);
        fs.writeFileSync(paymentsPath, JSON.stringify(payments, null, 2));
      }
    } catch (e) {
      offlineDbLogger.error('Payment', 'Save payment error', e.message);
    }
  }

  getOfflineTimePunches(employeeId) {
    try {
      if (this.usingSqlite) {
        let query = 'SELECT data FROM offline_time_punches WHERE 1=1';
        const params = [];
        if (employeeId) { query += ' AND employee_id = ?'; params.push(employeeId); }
        query += ' ORDER BY created_at DESC LIMIT 10';
        return this.db.prepare(query).all(...params).map(r => JSON.parse(r.data));
      }
      return [];
    } catch (e) {
      offlineDbLogger.error('TimePunch', 'Get time punches error', e.message);
      return [];
    }
  }

  saveOfflineTimePunch(punch) {
    try {
      if (this.usingSqlite) {
        this.db.prepare(`
          INSERT INTO offline_time_punches (id, employee_id, punch_type, data)
          VALUES (?, ?, ?, ?)
        `).run(punch.id, punch.employeeId, punch.punchType, JSON.stringify(punch));
      }
    } catch (e) {
      offlineDbLogger.error('TimePunch', 'Save time punch error', e.message);
    }
  }

  updateCheckCountersAfterSync() {
    try {
      if (!this.usingSqlite) return;
      const rvcRows = this.db.prepare(
        'SELECT DISTINCT rvc_id, MAX(check_number) as maxNum FROM offline_checks WHERE rvc_id IS NOT NULL GROUP BY rvc_id'
      ).all();
      for (const row of rvcRows) {
        if (!row.rvc_id || !row.maxNum) continue;
        const needed = row.maxNum + 1;
        const existing = this.db.prepare('SELECT next_check_number FROM rvc_counters WHERE rvc_id = ?').get(row.rvc_id);
        if (existing) {
          if (existing.next_check_number < needed) {
            this.db.prepare('UPDATE rvc_counters SET next_check_number = ?, updated_at = datetime(\'now\') WHERE rvc_id = ?').run(needed, row.rvc_id);
            offlineDbLogger.info('Sync', `Updated rvc_counters for ${row.rvc_id}: ${existing.next_check_number} -> ${needed}`);
          }
        } else {
          this.db.prepare('INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at) VALUES (?, ?, datetime(\'now\'))').run(row.rvc_id, needed);
          offlineDbLogger.info('Sync', `Initialized rvc_counters for ${row.rvc_id} at ${needed}`);
        }
      }
    } catch (e) {
      offlineDbLogger.warn('Sync', `updateCheckCountersAfterSync error: ${e.message}`);
    }
  }

  getNextCheckNumber(rvcId) {
    try {
      if (this.usingSqlite) {
        const reserved = this.db.transaction(() => {
          const existing = this.db.prepare(
            'SELECT next_check_number FROM rvc_counters WHERE rvc_id = ?'
          ).get(rvcId);
          
          if (existing) {
            const num = existing.next_check_number;
            this.db.prepare(
              'UPDATE rvc_counters SET next_check_number = next_check_number + 1, updated_at = datetime(\'now\') WHERE rvc_id = ?'
            ).run(rvcId);
            return num;
          } else {
            const row = this.db.prepare(
              'SELECT MAX(check_number) as maxNum FROM offline_checks WHERE rvc_id = ?'
            ).get(rvcId);
            const cloudMax = this.getCachedConfig(`last_check_number_${rvcId}`) || 0;
            const localMax = row?.maxNum || 0;
            const startNum = Math.max(cloudMax, localMax) + 1;
            this.db.prepare(
              'INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at) VALUES (?, ?, datetime(\'now\'))'
            ).run(rvcId, startNum + 1);
            return startNum;
          }
        })();
        return reserved;
      }
      return Date.now() % 100000;
    } catch (e) {
      offlineDbLogger.error('Check', 'getNextCheckNumber error', e.message);
      return Date.now() % 100000;
    }
  }

  createCheckAtomic(rvcId, checkData) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (this.usingSqlite) {
          return this.db.transaction(() => {
            const maxRow = this.db.prepare(
              'SELECT MAX(check_number) as maxNum FROM offline_checks WHERE rvc_id = ?'
            ).get(rvcId);
            const tableMax = maxRow?.maxNum || 0;

            const existing = this.db.prepare(
              'SELECT next_check_number FROM rvc_counters WHERE rvc_id = ?'
            ).get(rvcId);

            let checkNumber;
            if (existing) {
              checkNumber = Math.max(existing.next_check_number, tableMax + 1);
              this.db.prepare(
                'UPDATE rvc_counters SET next_check_number = ?, updated_at = datetime(\'now\') WHERE rvc_id = ?'
              ).run(checkNumber + 1, rvcId);
            } else {
              const cloudMax = this.getCachedConfig(`last_check_number_${rvcId}`) || 0;
              checkNumber = Math.max(cloudMax, tableMax) + 1;
              this.db.prepare(
                'INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at) VALUES (?, ?, datetime(\'now\'))'
              ).run(rvcId, checkNumber + 1);
            }

            const check = { ...checkData, checkNumber, rvcId };
            const id = check.id || `offline_${require('crypto').randomUUID()}`;
            this.db.prepare(`
              INSERT INTO offline_checks (id, check_number, rvc_id, employee_id, order_type, status, data, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(id, checkNumber, rvcId, check.employeeId, check.orderType || 'dine_in', check.status || 'open', JSON.stringify(check));

            return { ...check, id, checkNumber };
          })();
        }
        return null;
      } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint failed') && attempt < 2) {
          offlineDbLogger.warn('Check', `Check number collision on attempt ${attempt + 1}, retrying...`);
          continue;
        }
        offlineDbLogger.error('Check', 'createCheckAtomic error', e.message);
        return null;
      }
    }
    return null;
  }

  acquireIdempotencyLock(enterpriseId, workstationId, operation, key, requestHash) {
    try {
      if (this.usingSqlite) {
        const id = require('crypto').randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        try {
          this.db.prepare(`
            INSERT INTO idempotency_keys (id, enterprise_id, workstation_id, operation, idempotency_key, status, request_hash, expires_at)
            VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)
          `).run(id, enterpriseId, workstationId, operation, key, requestHash, expiresAt);
          return { acquired: true };
        } catch (insertErr) {
          if (insertErr.code === 'SQLITE_CONSTRAINT_UNIQUE' || (insertErr.message && insertErr.message.includes('UNIQUE'))) {
            const existing = this.db.prepare(
              'SELECT status, request_hash, response_status, response_body FROM idempotency_keys WHERE enterprise_id = ? AND workstation_id = ? AND operation = ? AND idempotency_key = ?'
            ).get(enterpriseId, workstationId, operation, key);
            if (!existing) return { acquired: false, status: 'failed' };
            return {
              acquired: false,
              status: existing.status,
              requestHash: existing.request_hash || undefined,
              responseStatus: existing.response_status || undefined,
              responseBody: existing.response_body || undefined,
            };
          }
          throw insertErr;
        }
      }
      return { acquired: true };
    } catch (e) {
      offlineDbLogger.error('Idempotency', 'Acquire lock error', e.message);
      return { acquired: true };
    }
  }

  completeIdempotencyKey(enterpriseId, workstationId, operation, key, responseStatus, responseBody) {
    try {
      if (this.usingSqlite) {
        this.db.prepare(`
          UPDATE idempotency_keys SET status = 'completed', response_status = ?, response_body = ?
          WHERE enterprise_id = ? AND workstation_id = ? AND operation = ? AND idempotency_key = ?
        `).run(responseStatus, responseBody, enterpriseId, workstationId, operation, key);
      }
    } catch (e) {
      offlineDbLogger.error('Idempotency', 'Complete key error', e.message);
    }
  }

  failIdempotencyKey(enterpriseId, workstationId, operation, key) {
    try {
      if (this.usingSqlite) {
        this.db.prepare(`
          UPDATE idempotency_keys SET status = 'failed'
          WHERE enterprise_id = ? AND workstation_id = ? AND operation = ? AND idempotency_key = ?
        `).run(enterpriseId, workstationId, operation, key);
      }
    } catch (e) {
      offlineDbLogger.error('Idempotency', 'Fail key error', e.message);
    }
  }

  cleanupExpiredIdempotencyKeys() {
    try {
      if (this.usingSqlite) {
        const result = this.db.prepare(
          "DELETE FROM idempotency_keys WHERE expires_at IS NOT NULL AND expires_at < datetime('now')"
        ).run();
        return result.changes || 0;
      }
      return 0;
    } catch (e) {
      offlineDbLogger.error('Idempotency', 'Cleanup error', e.message);
      return 0;
    }
  }

  savePrintJob(job) {
    try {
      if (this.usingSqlite) {
        this.db.prepare(`
          INSERT OR REPLACE INTO offline_print_jobs (id, printer_id, printer_ip, printer_port, job_type, data, escpos_data, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(job.id, job.printerId, job.printerIp, job.printerPort || 9100, job.jobType, JSON.stringify(job), job.escposData, job.status || 'pending');
      }
    } catch (e) {
      offlineDbLogger.error('Print', 'Save print job error', e.message);
    }
  }

  getPendingPrintJobs() {
    try {
      if (this.usingSqlite) {
        return this.db.prepare("SELECT * FROM offline_print_jobs WHERE status = 'pending' ORDER BY created_at ASC").all();
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  setSyncMetadata(key, value) {
    try {
      if (this.usingSqlite) {
        this.db.prepare("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value);
      } else {
        const metaPath = path.join(this.dataDir, 'sync_metadata.json');
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        meta[key] = value;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch (e) {}
  }

  getSyncMetadata(key) {
    try {
      if (this.usingSqlite) {
        const row = this.db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(key);
        return row?.value || null;
      } else {
        const metaPath = path.join(this.dataDir, 'sync_metadata.json');
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        return meta[key] || null;
      }
    } catch (e) {
      return null;
    }
  }

  cacheOptionFlags(items, enterpriseId) {
    if (!this.usingSqlite) {
      this.cacheConfigData('emc_option_flags', items, enterpriseId);
      return;
    }

    try {
      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO emc_option_flags (id, enterprise_id, entity_type, entity_id, option_key, value_text, scope_level, scope_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const tx = this.db.transaction((rows) => {
        for (const item of rows) {
          insert.run(
            item.id,
            item.enterpriseId || enterpriseId || null,
            item.entityType || null,
            item.entityId || null,
            item.optionKey || null,
            item.valueText != null ? String(item.valueText) : null,
            item.scopeLevel || null,
            item.scopeId || null,
            item.createdAt || null,
            item.updatedAt || null
          );
        }
      });

      tx(items);
    } catch (e) {
      offlineDbLogger.error('Cache', 'Cache emc_option_flags error', e.message);
      this.cacheConfigData('emc_option_flags', items, enterpriseId);
    }
  }

  getOptionFlags(enterpriseId) {
    if (!this.usingSqlite) {
      return this.getCachedConfig('emc_option_flags') || [];
    }

    try {
      let rows;
      if (enterpriseId) {
        rows = this.db.prepare('SELECT * FROM emc_option_flags WHERE enterprise_id = ?').all(enterpriseId);
      } else {
        rows = this.db.prepare('SELECT * FROM emc_option_flags').all();
      }
      return rows.map(r => ({
        id: r.id,
        enterpriseId: r.enterprise_id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        optionKey: r.option_key,
        valueText: r.value_text,
        scopeLevel: r.scope_level,
        scopeId: r.scope_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (e) {
      offlineDbLogger.error('OptionFlags', 'Get option flags error', e.message);
      return this.getCachedConfig('emc_option_flags') || [];
    }
  }

  resolveOptionFlag(entityType, entityId, optionKey, scopeChain) {
    const SCOPE_PRIORITY = ['workstation', 'rvc', 'property', 'enterprise'];

    try {
      const allFlags = this.getOptionFlags();
      const matching = allFlags.filter(f =>
        f.entityType === entityType &&
        f.entityId === entityId &&
        f.optionKey === optionKey
      );

      if (matching.length === 0) return null;

      for (const scopeLevel of SCOPE_PRIORITY) {
        const scopeId = scopeChain && scopeChain[scopeLevel];
        if (!scopeId) continue;

        const flag = matching.find(f => f.scopeLevel === scopeLevel && f.scopeId === scopeId);
        if (flag) return flag.valueText;
      }

      const enterpriseFlag = matching.find(f => f.scopeLevel === 'enterprise');
      if (enterpriseFlag) return enterpriseFlag.valueText;

      return matching[0].valueText;
    } catch (e) {
      offlineDbLogger.error('OptionFlags', 'Resolve option flag error', e.message);
      return null;
    }
  }

  getLocalSalesData(businessDate, rvcId) {
    try {
      if (this.usingSqlite) {
        let query = 'SELECT data FROM offline_checks WHERE synced = 0';
        const params = [];
        if (businessDate) { query += ' AND created_at LIKE ?'; params.push(`${businessDate}%`); }
        if (rvcId) { query += ' AND rvc_id = ?'; params.push(rvcId); }

        const checks = this.db.prepare(query).all(...params).map(r => JSON.parse(r.data));

        let totalSales = 0;
        let totalTax = 0;
        let totalDiscounts = 0;
        let checkCount = checks.length;
        let itemCount = 0;

        checks.forEach(check => {
          totalSales += parseFloat(check.subtotal || 0);
          totalTax += parseFloat(check.taxTotal || 0);
          totalDiscounts += parseFloat(check.discountTotal || 0);
          if (check.items) itemCount += check.items.length;
        });

        const payments = this.db.prepare(
          'SELECT data FROM offline_payments WHERE synced = 0' + (businessDate ? " AND created_at LIKE ?" : '')
        ).all(...(businessDate ? [`${businessDate}%`] : [])).map(r => JSON.parse(r.data));

        const tenders = this.getEntityList('tender_types', null);
        const tenderMap = {};
        for (const t of tenders) {
          tenderMap[t.id] = t;
        }

        const paymentsByTender = {};
        let cashTotal = 0;
        let cardTotal = 0;
        payments.forEach(p => {
          const name = p.tenderName || 'Unknown';
          if (!paymentsByTender[name]) paymentsByTender[name] = { count: 0, total: 0 };
          paymentsByTender[name].count++;
          const amt = parseFloat(p.amount || 0);
          paymentsByTender[name].total += amt;

          const tender = p.tenderId ? tenderMap[p.tenderId] : null;
          if (tender) {
            if (tender.isCashMedia) cashTotal += amt;
            if (tender.isCardMedia) cardTotal += amt;
          }
        });

        return {
          businessDate: businessDate || new Date().toISOString().split('T')[0],
          totalSales: totalSales.toFixed(2),
          totalTax: totalTax.toFixed(2),
          totalDiscounts: totalDiscounts.toFixed(2),
          totalNet: (totalSales + totalTax - totalDiscounts).toFixed(2),
          checkCount,
          itemCount,
          paymentsByTender,
          cashTotal: cashTotal.toFixed(2),
          cardTotal: cardTotal.toFixed(2),
          isOfflineData: true,
        };
      }
      return null;
    } catch (e) {
      offlineDbLogger.error('Report', 'Get sales data error', e.message);
      return null;
    }
  }

  async syncToCaps(capsUrl) {
    if (this.syncInProgress) return { synced: 0, failed: 0, reason: 'sync already in progress' };
    this.syncInProgress = true;

    this.cleanupStaleOperations();

    let synced = 0;
    let failed = 0;

    try {
      const dirtyChecks = this.getUnsyncedChecks();
      if (dirtyChecks.length > 0) {
        offlineDbLogger.info('Sync', `Syncing ${dirtyChecks.length} check(s) to CAPS at ${capsUrl}...`);
      }

      for (const check of dirtyChecks) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const syncHeaders = { 'Content-Type': 'application/json' };
          if (this.config && this.config.deviceId) syncHeaders['x-workstation-id'] = this.config.deviceId;
          if (this.config && this.config.deviceName) syncHeaders['x-device-name'] = this.config.deviceName;
          const response = await fetch(`${capsUrl}/api/caps/sync/check-state`, {
            method: 'POST',
            headers: syncHeaders,
            body: JSON.stringify(check),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (response.ok) {
            this.markCheckSynced(check.id);
            synced++;
            offlineDbLogger.info('Sync', `CAPS check synced: ${check.id} (check #${check.checkNumber || '?'})`);
          } else {
            offlineDbLogger.warn('Sync', `CAPS check sync failed: ${check.id} -> HTTP ${response.status}`);
            failed++;
          }
        } catch (e) {
          failed++;
          offlineDbLogger.warn('Sync', `CAPS check sync error: ${check.id} -> ${e.message}`);
          if (e.name === 'AbortError' || e.message.includes('network') || e.message.includes('ECONNREFUSED')) {
            offlineDbLogger.warn('Sync', 'CAPS unreachable, stopping sync...');
            break;
          }
        }
      }

      const pending = this.getPendingOperations();
      const nonCheckOps = pending.filter(op => !this.isCheckRelatedOperation(op.type));
      const eligibleOps = nonCheckOps.filter(op => {
        const retryCount = op.retry_count || 0;
        if (retryCount === 0) return true;
        if (retryCount >= 5) {
          this.markOperationPermanentlyFailed(op.id, 'Max retries exceeded');
          return false;
        }
        const backoffMs = Math.min(retryCount * 30000, 120000);
        const lastAttempt = op.last_failed_at || op.updated_at;
        if (lastAttempt) {
          const elapsed = Date.now() - new Date(lastAttempt).getTime();
          if (elapsed < backoffMs) return false;
        }
        return true;
      });
      if (nonCheckOps.length === 0) {
        this._lastBackoffLogCount = -1;
      } else if (eligibleOps.length > 0) {
        offlineDbLogger.info('Sync', `Forwarding ${eligibleOps.length} non-check operation(s) to CAPS...`);
        this._lastBackoffLogCount = -1;
      } else if (nonCheckOps.length !== this._lastBackoffLogCount) {
        offlineDbLogger.debug('Sync', `${nonCheckOps.length} non-check op(s) waiting for backoff retry`);
        this._lastBackoffLogCount = nonCheckOps.length;
      }

      const maxBatchSize = 50;
      const batchOps = eligibleOps.slice(0, maxBatchSize);

      for (const op of batchOps) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const queueHeaders = { 'Content-Type': 'application/json' };
          if (this.config && this.config.deviceId) queueHeaders['x-workstation-id'] = this.config.deviceId;
          if (this.config && this.config.deviceName) queueHeaders['x-device-name'] = this.config.deviceName;
          const response = await fetch(`${capsUrl}/api/caps/sync/queue-operation`, {
            method: 'POST',
            headers: queueHeaders,
            body: JSON.stringify({
              type: op.type,
              endpoint: op.endpoint,
              method: op.method || 'POST',
              body: op.body,
              priority: op.priority || 5,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (response.ok) {
            this.markOperationSynced(op.id);
            synced++;
            offlineDbLogger.info('Sync', `CAPS op synced: ${op.type} -> ${op.endpoint}`);
          } else if (response.status === 400 || response.status === 404 || response.status === 422) {
            this.markOperationPermanentlyFailed(op.id, `CAPS HTTP ${response.status} (permanent)`);
            failed++;
          } else {
            this.markOperationFailed(op.id, `CAPS HTTP ${response.status}`);
            failed++;
          }
        } catch (e) {
          this.markOperationFailed(op.id, e.message);
          failed++;
          if (e.name === 'AbortError' || e.message.includes('network') || e.message.includes('ECONNREFUSED')) {
            break;
          }
        }
      }

      const checkRelatedOps = pending.filter(op => this.isCheckRelatedOperation(op.type));
      for (const op of checkRelatedOps) {
        this.markOperationSynced(op.id);
      }
    } catch (e) {
      offlineDbLogger.error('Sync', `CAPS sync error: ${e.message}`);
    }

    this.syncInProgress = false;
    const remaining = this.getPendingOperations().length;
    if (synced > 0 || failed > 0) {
      offlineDbLogger.info('Sync', `CAPS sync results: ${synced} synced, ${failed} failed, ${remaining} pending`);
    }
    return { synced, failed, remaining };
  }

  isCheckRelatedOperation(type) {
    const checkOps = [
      'create_check', 'add_check_item', 'send_check', 'update_check',
      'transfer_check', 'cancel_transaction', 'reopen_check', 'void_check',
      'void_check_item', 'item_discount', 'check_discount', 'price_override',
      'split_check', 'update_modifiers', 'delete_check_item',
      'remove_item_discount', 'remove_check_discount', 'remove_customer',
      'void_payment', 'restore_payment', 'void_service_charge',
      'create_payment', 'external_payment', 'capture_with_tip',
      'print_check', 'offline_update', 'offline_delete',
    ];
    return checkOps.includes(type);
  }

  getUnsyncedChecks() {
    try {
      if (this.usingSqlite) {
        const rows = this.db.prepare('SELECT data FROM offline_checks WHERE synced = 0 ORDER BY created_at ASC LIMIT 50').all();
        return rows.map(r => {
          const check = JSON.parse(r.data);
          check.items = check.items || [];
          check.payments = check.payments || [];
          check.serviceCharges = check.serviceCharges || [];
          check.discounts = check.discounts || [];
          return check;
        });
      }
      return [];
    } catch (e) {
      offlineDbLogger.error('Sync', 'Get unsynced checks error', e.message);
      return [];
    }
  }

  markCheckSynced(checkId) {
    try {
      if (this.usingSqlite) {
        this.db.prepare("UPDATE offline_checks SET synced = 1, synced_at = datetime('now') WHERE id = ?").run(checkId);
      }
    } catch (e) {
      offlineDbLogger.error('Sync', 'Mark check synced error', e.message);
    }
  }

  async syncToCloud(serverUrl) {
    offlineDbLogger.warn('Sync', 'syncToCloud() is disabled. WS must sync to CAPS, not directly to cloud. Use syncToCaps() instead.');
    return { synced: 0, failed: 0, reason: 'disabled - WS must sync via CAPS, not directly to cloud' };
  }

  getStats() {
    const stats = {
      usingSqlite: this.usingSqlite,
      encryptionActive: this.encryptionActive || false,
      lastSync: this.getSyncMetadata('lastFullSync'),
      enterpriseId: this.getSyncMetadata('enterpriseId'),
      propertyId: this.getSyncMetadata('propertyId'),
    };

    if (this.usingSqlite) {
      try {
        stats.pendingOperations = this.db.prepare('SELECT COUNT(*) as c FROM offline_queue WHERE synced = 0').get().c;
        stats.offlineChecks = this.db.prepare('SELECT COUNT(*) as c FROM offline_checks WHERE synced = 0').get().c;
        stats.offlinePayments = this.db.prepare('SELECT COUNT(*) as c FROM offline_payments WHERE synced = 0').get().c;
        stats.cachedMenuItems = this.db.prepare('SELECT COUNT(*) as c FROM menu_items').get().c;
        stats.cachedEmployees = this.db.prepare('SELECT COUNT(*) as c FROM employees').get().c;
      } catch (e) {}
    }

    return stats;
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch (e) {}
      this.db = null;
    }
  }
}

module.exports = { OfflineDatabase };

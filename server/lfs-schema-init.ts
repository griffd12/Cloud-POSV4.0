import type pg from "pg";

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS enterprises (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      code VARCHAR NOT NULL,
      address TEXT,
      city VARCHAR,
      state VARCHAR,
      zip VARCHAR,
      country VARCHAR DEFAULT 'US',
      phone VARCHAR,
      email VARCHAR,
      website VARCHAR,
      logo_url TEXT,
      timezone VARCHAR DEFAULT 'America/Los_Angeles',
      currency VARCHAR DEFAULT 'USD',
      fiscal_year_start_month INTEGER DEFAULT 1,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS properties (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR REFERENCES enterprises(id),
      name VARCHAR NOT NULL,
      code VARCHAR NOT NULL,
      address TEXT,
      city VARCHAR,
      state VARCHAR,
      zip VARCHAR,
      country VARCHAR DEFAULT 'US',
      phone VARCHAR,
      email VARCHAR,
      timezone VARCHAR DEFAULT 'America/Los_Angeles',
      currency VARCHAR DEFAULT 'USD',
      tax_id VARCHAR,
      business_date_rollover_time TEXT DEFAULT '04:00',
      business_date_mode TEXT DEFAULT 'auto',
      current_business_date TEXT,
      sign_in_logo_url TEXT,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rvcs (
      id VARCHAR PRIMARY KEY,
      property_id VARCHAR REFERENCES properties(id),
      name VARCHAR NOT NULL,
      code VARCHAR NOT NULL,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS roles (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR REFERENCES enterprises(id),
      name VARCHAR NOT NULL,
      description TEXT,
      scope VARCHAR DEFAULT 'property',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR REFERENCES enterprises(id),
      property_id VARCHAR,
      first_name VARCHAR NOT NULL,
      last_name VARCHAR NOT NULL,
      employee_number VARCHAR,
      pin_hash VARCHAR,
      role_id VARCHAR,
      email VARCHAR,
      phone VARCHAR,
      status VARCHAR DEFAULT 'active',
      hire_date TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employee_assignments (
      id VARCHAR PRIMARY KEY,
      employee_id VARCHAR REFERENCES employees(id),
      property_id VARCHAR REFERENCES properties(id),
      rvc_id VARCHAR,
      role_id VARCHAR,
      is_primary BOOLEAN DEFAULT FALSE,
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS major_groups (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      name VARCHAR NOT NULL,
      display_order INTEGER DEFAULT 0,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS family_groups (
      id VARCHAR PRIMARY KEY,
      major_group_id VARCHAR,
      enterprise_id VARCHAR,
      name VARCHAR NOT NULL,
      display_order INTEGER DEFAULT 0,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      family_group_id VARCHAR,
      name VARCHAR NOT NULL,
      display_name VARCHAR,
      description TEXT,
      base_price NUMERIC(10,2) DEFAULT 0,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS slus (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      rvc_id VARCHAR,
      name VARCHAR NOT NULL,
      display_order INTEGER DEFAULT 0,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS menu_item_slus (
      id VARCHAR PRIMARY KEY,
      menu_item_id VARCHAR,
      slu_id VARCHAR,
      price_override NUMERIC(10,2),
      display_order INTEGER DEFAULT 0,
      button_color VARCHAR,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS modifier_groups (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      name VARCHAR NOT NULL,
      min_selections INTEGER DEFAULT 0,
      max_selections INTEGER DEFAULT 99,
      required BOOLEAN DEFAULT FALSE,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS modifiers (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      name VARCHAR NOT NULL,
      price NUMERIC(10,2) DEFAULT 0,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tax_groups (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      name VARCHAR NOT NULL,
      rate NUMERIC(6,4) DEFAULT 0,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenders (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      name VARCHAR NOT NULL,
      type VARCHAR DEFAULT 'cash',
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workstations (
      id VARCHAR PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name VARCHAR NOT NULL,
      ws_number INTEGER,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS terminal_devices (
      id VARCHAR PRIMARY KEY,
      property_id VARCHAR,
      workstation_id VARCHAR,
      device_name VARCHAR NOT NULL,
      device_type VARCHAR DEFAULT 'terminal',
      status VARCHAR DEFAULT 'active',
      last_heartbeat TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS terminal_sessions (
      id VARCHAR PRIMARY KEY,
      terminal_device_id VARCHAR,
      employee_id VARCHAR,
      session_token VARCHAR,
      started_at TIMESTAMP DEFAULT NOW(),
      ended_at TIMESTAMP,
      status VARCHAR DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS registered_devices (
      id VARCHAR PRIMARY KEY,
      property_id VARCHAR,
      device_name VARCHAR,
      device_type VARCHAR DEFAULT 'service_host',
      api_key_hash VARCHAR,
      status VARCHAR DEFAULT 'active',
      last_seen TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS discounts (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      name VARCHAR NOT NULL,
      type VARCHAR DEFAULT 'percentage',
      value NUMERIC(10,2) DEFAULT 0,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS service_charges (
      id VARCHAR PRIMARY KEY,
      enterprise_id VARCHAR,
      name VARCHAR NOT NULL,
      type VARCHAR DEFAULT 'percentage',
      value NUMERIC(10,2) DEFAULT 0,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lfs_sync_status (
      table_name TEXT PRIMARY KEY,
      last_synced_at TIMESTAMP,
      record_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS lfs_offline_sequence (
      id SERIAL PRIMARY KEY,
      sequence_name VARCHAR NOT NULL UNIQUE,
      current_value INTEGER NOT NULL DEFAULT 0,
      prefix VARCHAR,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lfs_transaction_journal (
      id SERIAL PRIMARY KEY,
      operation_type VARCHAR NOT NULL,
      entity_type VARCHAR NOT NULL,
      entity_id VARCHAR,
      http_method VARCHAR,
      endpoint VARCHAR,
      request_body TEXT,
      response_body TEXT,
      synced BOOLEAN DEFAULT FALSE,
      sync_attempts INTEGER DEFAULT 0,
      last_sync_error TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      synced_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lfs_config_cache (
      id SERIAL PRIMARY KEY,
      config_key VARCHAR NOT NULL UNIQUE,
      config_value TEXT,
      config_level VARCHAR DEFAULT 'enterprise',
      source_id VARCHAR,
      cached_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lfs_sync_queue (
      id SERIAL PRIMARY KEY,
      operation VARCHAR NOT NULL,
      table_name VARCHAR NOT NULL,
      record_id VARCHAR,
      payload TEXT,
      priority INTEGER DEFAULT 0,
      status VARCHAR DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lfs_schema_version (
      id SERIAL PRIMARY KEY,
      version INTEGER NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW(),
      description TEXT
    );

    INSERT INTO lfs_schema_version (version, description)
    SELECT 1, 'Initial LFS schema creation'
    WHERE NOT EXISTS (SELECT 1 FROM lfs_schema_version WHERE version = 1);
  `);
}

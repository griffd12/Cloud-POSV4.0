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

    CREATE TABLE IF NOT EXISTS lfs_sync_status (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR NOT NULL UNIQUE,
      last_sync_at TIMESTAMP,
      record_count INTEGER DEFAULT 0,
      sync_hash VARCHAR,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
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
  `);
}

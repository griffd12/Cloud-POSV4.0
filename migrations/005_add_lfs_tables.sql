CREATE TABLE IF NOT EXISTS "lfs_configurations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" varchar NOT NULL UNIQUE REFERENCES "properties"("id"),
  "api_key" varchar NOT NULL,
  "api_key_masked" varchar NOT NULL,
  "sync_status" varchar DEFAULT 'never_connected',
  "last_sync_at" timestamp,
  "lfs_version" varchar,
  "last_sync_ip" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "lfs_sync_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" varchar NOT NULL REFERENCES "properties"("id"),
  "sync_type" varchar NOT NULL,
  "direction" varchar NOT NULL,
  "status" varchar NOT NULL,
  "record_count" integer DEFAULT 0,
  "error_message" text,
  "lfs_ip" varchar,
  "lfs_version" varchar,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_lfs_sync_logs_property" ON "lfs_sync_logs" ("property_id");
CREATE INDEX IF NOT EXISTS "idx_lfs_sync_logs_created" ON "lfs_sync_logs" ("created_at");

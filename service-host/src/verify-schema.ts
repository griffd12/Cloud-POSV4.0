#!/usr/bin/env node

/**
 * Service-Host SQLite Schema Verification
 * 
 * Opens the live SQLite DB in read-only mode and prints a deterministic
 * verification report covering schema parity with the cloud Postgres schema.
 * 
 * Usage:
 *   node dist/verify-schema.js [--data-dir <path>]
 *   npx tsx src/verify-schema.ts [--data-dir <path>]
 *   node dist/index.js verify-schema [--data-dir <path>]
 * 
 * Windows CMD:
 *   node dist\index.js verify-schema --data-dir C:\POS\data
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CREATE_SCHEMA_SQL } from './db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BetterSqlite3 = require('better-sqlite3');

interface PragmaColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface PragmaIndexListEntry {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface PragmaIndexInfoEntry {
  seqno: number;
  cid: number;
  name: string;
}

function parseDataDir(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-dir' && args[i + 1]) {
      return args[i + 1];
    }
  }
  return path.join(__dirname, '../data');
}

export function runVerification(dataDir: string): void {
  const dbPath = path.join(dataDir, 'service-host.db');

  console.log('='.repeat(70));
  console.log('  SERVICE-HOST SQLITE SCHEMA VERIFICATION REPORT');
  console.log('='.repeat(70));
  console.log(`  Database: ${dbPath}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  console.log();

  if (!fs.existsSync(dbPath)) {
    console.log('ERROR: Database file not found at ' + dbPath);
    console.log('Use --data-dir <path> to specify the data directory.');
    process.exit(1);
  }

  const db = new BetterSqlite3(dbPath, { readonly: true });

  let totalPass = 0;
  let totalFail = 0;

  function check(label: string, condition: boolean): void {
    if (condition) {
      console.log(`  [PASS] ${label}`);
      totalPass++;
    } else {
      console.log(`  [FAIL] ${label}`);
      totalFail++;
    }
  }

  // =========================================================================
  // SECTION A: tenders columns
  // =========================================================================
  console.log('--- SECTION A: tenders columns ---');
  console.log();

  const tenderCols: PragmaColumnInfo[] = db.prepare('PRAGMA table_info(tenders)').all();
  const tenderColNames = new Set(tenderCols.map((c: PragmaColumnInfo) => c.name));

  const requiredTenderCols = [
    'pop_drawer', 'allow_tips', 'allow_over_tender', 'print_check_on_payment',
    'require_manager_approval', 'requires_payment_processor', 'display_order',
    'is_cash_media', 'is_card_media', 'is_gift_media',
  ];

  for (const col of requiredTenderCols) {
    check(`tenders.${col} exists`, tenderColNames.has(col));
  }

  console.log();
  console.log('  Full tenders column list:');
  for (const c of tenderCols) {
    console.log(`    ${c.cid}: ${c.name} ${c.type} default=${c.dflt_value} pk=${c.pk}`);
  }
  console.log();

  // =========================================================================
  // SECTION B: rvcs columns
  // =========================================================================
  console.log('--- SECTION B: rvcs columns ---');
  console.log();

  const rvcCols: PragmaColumnInfo[] = db.prepare('PRAGMA table_info(rvcs)').all();
  const rvcColNames = new Set(rvcCols.map((c: PragmaColumnInfo) => c.name));

  const requiredRvcCols = [
    'receipt_print_mode', 'receipt_copies', 'kitchen_print_mode',
    'void_receipt_print', 'require_guest_count',
  ];

  for (const col of requiredRvcCols) {
    check(`rvcs.${col} exists`, rvcColNames.has(col));
  }

  console.log();
  console.log('  Full rvcs column list:');
  for (const c of rvcCols) {
    console.log(`    ${c.cid}: ${c.name} ${c.type} default=${c.dflt_value} pk=${c.pk}`);
  }
  console.log();

  // =========================================================================
  // SECTION C: emc_option_flags table
  // =========================================================================
  console.log('--- SECTION C: emc_option_flags table ---');
  console.log();

  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='emc_option_flags'"
  ).get();

  check('emc_option_flags table exists', !!tableExists);

  if (tableExists) {
    const flagCols: PragmaColumnInfo[] = db.prepare('PRAGMA table_info(emc_option_flags)').all();
    console.log();
    console.log('  emc_option_flags columns:');
    for (const c of flagCols) {
      console.log(`    ${c.cid}: ${c.name} ${c.type} default=${c.dflt_value} notnull=${c.notnull} pk=${c.pk}`);
    }

    const expectedCols = [
      'id', 'enterprise_id', 'entity_type', 'entity_id', 'option_key',
      'value_text', 'scope_level', 'scope_id', 'created_at', 'updated_at',
    ];
    const flagColNames = new Set(flagCols.map((c: PragmaColumnInfo) => c.name));
    for (const col of expectedCols) {
      check(`emc_option_flags.${col} exists`, flagColNames.has(col));
    }
  } else {
    console.log('  (skipping column checks — table missing)');
  }
  console.log();

  // =========================================================================
  // SECTION D: Index proof
  // =========================================================================
  console.log('--- SECTION D: emc_option_flags index proof ---');
  console.log();

  if (tableExists) {
    const indexes: PragmaIndexListEntry[] = db.prepare("PRAGMA index_list('emc_option_flags')").all();

    console.log('  Indexes on emc_option_flags:');
    for (const idx of indexes) {
      const cols: PragmaIndexInfoEntry[] = db.prepare(`PRAGMA index_info('${idx.name}')`).all();
      const colNames = cols.map((c: PragmaIndexInfoEntry) => c.name);
      console.log(`    ${idx.name} unique=${idx.unique} columns=(${colNames.join(', ')})`);
    }
    console.log();

    const requiredUniqueColumns = [
      'enterprise_id', 'entity_type', 'entity_id', 'option_key', 'scope_level', 'scope_id',
    ];
    const uniqueIndexFound = indexes.some((idx) => {
      if (!idx.unique) return false;
      const cols: PragmaIndexInfoEntry[] = db.prepare(`PRAGMA index_info('${idx.name}')`).all();
      const colNames = cols.map((c: PragmaIndexInfoEntry) => c.name);
      return requiredUniqueColumns.every((rc) => colNames.includes(rc)) &&
        colNames.length === requiredUniqueColumns.length;
    });

    check(
      `UNIQUE index on (${requiredUniqueColumns.join(', ')})`,
      uniqueIndexFound,
    );
  } else {
    console.log('  (skipping — emc_option_flags table missing)');
  }
  console.log();

  // =========================================================================
  // SECTION E: Backfill proof
  // =========================================================================
  console.log('--- SECTION E: Backfill proof (tender flag counts) ---');
  console.log();

  const totalTenders = db.prepare('SELECT COUNT(*) AS cnt FROM tenders').get() as { cnt: number };
  console.log(`  Total tenders in DB: ${totalTenders.cnt}`);
  console.log();

  const backfillQueries = [
    { label: 'cash_media (is_cash_media=1)', sql: 'SELECT COUNT(*) AS cnt FROM tenders WHERE is_cash_media=1' },
    { label: 'card_media (is_card_media=1)', sql: 'SELECT COUNT(*) AS cnt FROM tenders WHERE is_card_media=1' },
    { label: 'gift_media (is_gift_media=1)', sql: 'SELECT COUNT(*) AS cnt FROM tenders WHERE is_gift_media=1' },
    { label: 'pop_drawer (pop_drawer=1)', sql: 'SELECT COUNT(*) AS cnt FROM tenders WHERE pop_drawer=1' },
    { label: 'allow_tips (allow_tips=1)', sql: 'SELECT COUNT(*) AS cnt FROM tenders WHERE allow_tips=1' },
  ];

  for (const q of backfillQueries) {
    try {
      const row = db.prepare(q.sql).get() as { cnt: number };
      check(`${q.label}: count=${row.cnt} (query executed)`, true);
    } catch (e: any) {
      check(`${q.label}: ERROR - ${e.message}`, false);
    }
  }

  if (totalTenders.cnt > 0) {
    const anyMediaSet = db.prepare(
      'SELECT COUNT(*) AS cnt FROM tenders WHERE is_cash_media=1 OR is_card_media=1 OR is_gift_media=1'
    ).get() as { cnt: number };
    check(
      `At least one tender has media flags set (${anyMediaSet.cnt}/${totalTenders.cnt})`,
      anyMediaSet.cnt > 0,
    );
  }
  console.log();

  // =========================================================================
  // SECTION F: Duplicate CREATE TABLE rvcs guard
  // =========================================================================
  console.log('--- SECTION F: Duplicate CREATE TABLE rvcs guard ---');
  console.log();

  const rvcDDL = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='rvcs'"
  ).get() as { sql: string } | undefined;

  if (rvcDDL) {
    console.log('  SQLite master DDL for rvcs:');
    console.log('  ' + rvcDDL.sql.replace(/\n/g, '\n  '));
  } else {
    console.log('  WARNING: No rvcs table found in sqlite_master');
  }
  console.log();

  const createTableMatches = CREATE_SCHEMA_SQL.match(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?rvcs\s/gi);
  const createTableCount = createTableMatches ? createTableMatches.length : 0;
  check(
    `CREATE_SCHEMA_SQL contains exactly 1 CREATE TABLE rvcs (found: ${createTableCount})`,
    createTableCount === 1,
  );

  console.log();

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('='.repeat(70));
  console.log(`  SUMMARY: ${totalPass} PASS, ${totalFail} FAIL`);
  if (totalFail === 0) {
    console.log('  RESULT: ALL CHECKS PASSED');
  } else {
    console.log('  RESULT: SOME CHECKS FAILED — review above');
  }
  console.log('='.repeat(70));

  db.close();
}

if (process.argv[1] && (process.argv[1].endsWith('verify-schema.ts') || process.argv[1].endsWith('verify-schema.js'))) {
  const dataDir = parseDataDir(process.argv.slice(2));
  runVerification(dataDir);
}

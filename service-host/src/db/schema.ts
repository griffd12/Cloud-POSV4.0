/**
 * SQLite Schema for Service Host
 * 
 * Mirrors the cloud PostgreSQL schema with SQLite-compatible types.
 * Type mappings:
 * - uuid/varchar → text
 * - timestamp → text (ISO 8601 format)
 * - jsonb → text (JSON string)
 * - decimal → real
 * - boolean → integer (0/1)
 */

// =============================================================================
// CONFIGURATION TABLES (Synced from cloud)
// =============================================================================

export const SCHEMA_VERSION = 9;

export const CREATE_SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- ENTERPRISE HIERARCHY
-- =============================================================================

CREATE TABLE IF NOT EXISTS enterprises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  business_date_rollover_time TEXT DEFAULT '04:00',
  business_date_mode TEXT DEFAULT 'auto',
  current_business_date TEXT,
  sign_in_logo_url TEXT,
  auto_clock_out_enabled INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rvcs (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  fast_transaction_default INTEGER DEFAULT 0,
  default_order_type TEXT DEFAULT 'dine_in',
  order_type_default TEXT DEFAULT 'dine_in',
  dynamic_order_mode INTEGER DEFAULT 0,
  dom_send_mode TEXT DEFAULT 'fire_on_fly',
  active INTEGER DEFAULT 1,
  receipt_print_mode TEXT DEFAULT 'auto_on_close',
  receipt_copies INTEGER DEFAULT 1,
  kitchen_print_mode TEXT DEFAULT 'auto_on_send',
  void_receipt_print INTEGER DEFAULT 1,
  require_guest_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- ROLES & PRIVILEGES
-- =============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS privileges (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT,
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_privileges (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id),
  privilege_code TEXT NOT NULL REFERENCES privileges(code),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- EMPLOYEES
-- =============================================================================

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  employee_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role_id TEXT REFERENCES roles(id),
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employee_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  is_primary INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- REPORTING GROUPS
-- =============================================================================

CREATE TABLE IF NOT EXISTS major_groups (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS family_groups (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  major_group_id TEXT REFERENCES major_groups(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- MENU STRUCTURE
-- =============================================================================

CREATE TABLE IF NOT EXISTS slus (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  button_label TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  color TEXT DEFAULT '#3B82F6',
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tax_groups (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  rate TEXT NOT NULL,
  tax_mode TEXT NOT NULL DEFAULT 'add_on',
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS print_classes (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- DEVICE CONFIGURATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS workstations (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'pos_terminal',
  default_order_type TEXT DEFAULT 'dine_in',
  fast_transaction_enabled INTEGER DEFAULT 0,
  require_begin_check INTEGER DEFAULT 1,
  allow_pickup_check INTEGER DEFAULT 1,
  allow_reopen_closed_checks INTEGER DEFAULT 0,
  allow_offline_operation INTEGER DEFAULT 0,
  allowed_role_ids TEXT,
  manager_approval_device INTEGER DEFAULT 0,
  clock_in_allowed INTEGER DEFAULT 1,
  default_receipt_printer_id TEXT,
  backup_receipt_printer_id TEXT,
  report_printer_id TEXT,
  backup_report_printer_id TEXT,
  void_printer_id TEXT,
  backup_void_printer_id TEXT,
  default_order_device_id TEXT,
  default_kds_expo_id TEXT,
  ip_address TEXT,
  hostname TEXT,
  is_online INTEGER DEFAULT 0,
  last_seen_at TEXT,
  auto_logout_minutes INTEGER,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS printers (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  printer_type TEXT NOT NULL DEFAULT 'kitchen',
  connection_type TEXT NOT NULL DEFAULT 'network',
  ip_address TEXT,
  subnet_mask TEXT DEFAULT '255.255.255.0',
  port INTEGER DEFAULT 9100,
  driver_protocol TEXT DEFAULT 'epson',
  model TEXT,
  character_width INTEGER DEFAULT 42,
  auto_cut INTEGER DEFAULT 1,
  print_logo INTEGER DEFAULT 0,
  print_order_header INTEGER DEFAULT 1,
  print_order_footer INTEGER DEFAULT 1,
  print_voids INTEGER DEFAULT 1,
  print_reprints INTEGER DEFAULT 1,
  retry_attempts INTEGER DEFAULT 3,
  failure_handling_mode TEXT DEFAULT 'alert_cashier',
  is_online INTEGER DEFAULT 0,
  last_seen_at TEXT,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kds_devices (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  station_type TEXT NOT NULL DEFAULT 'hot',
  show_draft_items INTEGER DEFAULT 0,
  show_sent_items_only INTEGER DEFAULT 1,
  group_by TEXT DEFAULT 'order',
  show_timers INTEGER DEFAULT 1,
  auto_sort_by TEXT DEFAULT 'time',
  allow_bump INTEGER DEFAULT 1,
  allow_recall INTEGER DEFAULT 1,
  allow_void_display INTEGER DEFAULT 1,
  expo_mode INTEGER DEFAULT 0,
  new_order_sound INTEGER DEFAULT 1,
  new_order_blink_seconds INTEGER DEFAULT 5,
  color_alert_1_enabled INTEGER DEFAULT 1,
  color_alert_1_seconds INTEGER DEFAULT 60,
  color_alert_1_color TEXT DEFAULT 'yellow',
  color_alert_2_enabled INTEGER DEFAULT 1,
  color_alert_2_seconds INTEGER DEFAULT 180,
  color_alert_2_color TEXT DEFAULT 'orange',
  color_alert_3_enabled INTEGER DEFAULT 1,
  color_alert_3_seconds INTEGER DEFAULT 300,
  color_alert_3_color TEXT DEFAULT 'red',
  ws_channel TEXT,
  ip_address TEXT,
  is_online INTEGER DEFAULT 0,
  last_seen_at TEXT,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_devices (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  kds_device_id TEXT REFERENCES kds_devices(id),
  send_on TEXT DEFAULT 'send_button',
  send_voids INTEGER DEFAULT 1,
  send_reprints INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_device_printers (
  id TEXT PRIMARY KEY,
  order_device_id TEXT NOT NULL REFERENCES order_devices(id),
  printer_id TEXT NOT NULL REFERENCES printers(id),
  display_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_device_kds (
  id TEXT PRIMARY KEY,
  order_device_id TEXT NOT NULL REFERENCES order_devices(id),
  kds_device_id TEXT NOT NULL REFERENCES kds_devices(id),
  display_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS print_class_routing (
  id TEXT PRIMARY KEY,
  print_class_id TEXT NOT NULL REFERENCES print_classes(id),
  order_device_id TEXT NOT NULL REFERENCES order_devices(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- MENU ITEMS & MODIFIERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  short_name TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  tax_group_id TEXT REFERENCES tax_groups(id),
  print_class_id TEXT REFERENCES print_classes(id),
  major_group_id TEXT REFERENCES major_groups(id),
  family_group_id TEXT REFERENCES family_groups(id),
  color TEXT DEFAULT '#3B82F6',
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_item_slus (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  slu_id TEXT NOT NULL REFERENCES slus(id),
  display_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  code TEXT,
  required INTEGER DEFAULT 0,
  min_select INTEGER DEFAULT 0,
  max_select INTEGER DEFAULT 99,
  display_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modifiers (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  price_delta INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modifier_group_modifiers (
  id TEXT PRIMARY KEY,
  modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id),
  modifier_id TEXT NOT NULL REFERENCES modifiers(id),
  is_default INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id),
  display_order INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  min_required INTEGER DEFAULT 0,
  max_allowed INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- TENDERS & DISCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenders (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL,
  payment_processor_id TEXT,
  is_system INTEGER DEFAULT 0,
  pop_drawer INTEGER DEFAULT 0,
  allow_tips INTEGER DEFAULT 0,
  allow_over_tender INTEGER DEFAULT 0,
  print_check_on_payment INTEGER DEFAULT 1,
  require_manager_approval INTEGER DEFAULT 0,
  requires_payment_processor INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_cash_media INTEGER DEFAULT 0,
  is_card_media INTEGER DEFAULT 0,
  is_gift_media INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discounts (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  amount TEXT NOT NULL,
  requires_manager_approval INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_charges (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  charge_type TEXT NOT NULL DEFAULT 'percent',
  amount TEXT NOT NULL,
  apply_to_subtotal INTEGER DEFAULT 1,
  apply_to_discounted INTEGER DEFAULT 1,
  taxable INTEGER DEFAULT 0,
  tax_group_id TEXT,
  auto_apply INTEGER DEFAULT 0,
  auto_apply_guest_count INTEGER,
  min_check_amount INTEGER,
  min_guest_count INTEGER,
  active INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- TRANSACTION JOURNAL (Immutable audit trail — append-only, never update/delete)
-- =============================================================================

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
);

CREATE INDEX IF NOT EXISTS idx_journal_sync_state ON transaction_journal(sync_state);
CREATE INDEX IF NOT EXISTS idx_journal_check ON transaction_journal(check_id);
CREATE INDEX IF NOT EXISTS idx_journal_business_date ON transaction_journal(business_date);
CREATE INDEX IF NOT EXISTS idx_journal_txn_group ON transaction_journal(txn_group_id);
CREATE INDEX IF NOT EXISTS idx_journal_device ON transaction_journal(device_id);

-- =============================================================================
-- TRANSACTIONAL TABLES (Local state, syncs to cloud)
-- =============================================================================

CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY,
  cloud_id TEXT,
  txn_group_id TEXT,
  check_number INTEGER NOT NULL,
  rvc_id TEXT NOT NULL REFERENCES rvcs(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  workstation_id TEXT REFERENCES workstations(id),
  order_type TEXT DEFAULT 'dine_in',
  table_number TEXT,
  guest_count INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  subtotal INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  discount_total INTEGER DEFAULT 0,
  service_charge_total INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  amount_due INTEGER DEFAULT 0,
  current_round INTEGER DEFAULT 1,
  business_date TEXT,
  opened_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT,
  voided_at TEXT,
  void_reason TEXT,
  void_employee_id TEXT,
  customer_id TEXT,
  customer_name TEXT,
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES checks(id),
  round_number INTEGER NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  workstation_id TEXT REFERENCES workstations(id),
  sent_at TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS check_items (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES checks(id),
  round_id TEXT REFERENCES rounds(id),
  round_number INTEGER NOT NULL,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  short_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  tax_amount INTEGER DEFAULT 0,
  tax_group_id TEXT,
  print_class_id TEXT,
  modifiers TEXT,
  seat_number INTEGER,
  course_number INTEGER DEFAULT 1,
  sent_at TEXT,
  kds_status TEXT DEFAULT 'pending',
  bumped_at TEXT,
  voided INTEGER DEFAULT 0,
  void_reason TEXT,
  void_employee_id TEXT,
  parent_item_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS check_payments (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES checks(id),
  tender_id TEXT NOT NULL REFERENCES tenders(id),
  tender_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  tip_amount INTEGER DEFAULT 0,
  change_amount INTEGER DEFAULT 0,
  card_last4 TEXT,
  card_brand TEXT,
  auth_code TEXT,
  reference_number TEXT,
  status TEXT NOT NULL DEFAULT 'authorized',
  voided INTEGER DEFAULT 0,
  void_reason TEXT,
  void_employee_id TEXT,
  business_date TEXT,
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS check_discounts (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES checks(id),
  check_item_id TEXT REFERENCES check_items(id),
  discount_id TEXT NOT NULL REFERENCES discounts(id),
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  employee_id TEXT,
  manager_employee_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS check_service_charges (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES checks(id),
  service_charge_id TEXT NOT NULL REFERENCES service_charges(id),
  name TEXT NOT NULL,
  charge_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  auto_applied INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- KDS TICKETS
-- =============================================================================

CREATE TABLE IF NOT EXISTS kds_tickets (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES checks(id),
  check_number INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  kds_device_id TEXT REFERENCES kds_devices(id),
  order_device_id TEXT REFERENCES order_devices(id),
  order_type TEXT,
  table_number TEXT,
  items TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  bumped_at TEXT,
  bumped_by_employee_id TEXT,
  recalled_at TEXT
);

-- =============================================================================
-- TIME & ATTENDANCE
-- =============================================================================

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  workstation_id TEXT REFERENCES workstations(id),
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  job_code TEXT,
  break_minutes INTEGER DEFAULT 0,
  business_date TEXT,
  tips_declared INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- POS LAYOUTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS pos_layouts (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  name TEXT NOT NULL,
  mode TEXT DEFAULT 'slu_tabs',
  grid_rows INTEGER DEFAULT 4,
  grid_cols INTEGER DEFAULT 6,
  font_size TEXT DEFAULT 'medium',
  is_default INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pos_layout_cells (
  id TEXT PRIMARY KEY,
  layout_id TEXT NOT NULL REFERENCES pos_layouts(id),
  row_index INTEGER NOT NULL,
  col_index INTEGER NOT NULL,
  row_span INTEGER DEFAULT 1,
  col_span INTEGER DEFAULT 1,
  menu_item_id TEXT REFERENCES menu_items(id),
  background_color TEXT DEFAULT '#3B82F6',
  text_color TEXT DEFAULT '#FFFFFF',
  display_label TEXT
);

CREATE TABLE IF NOT EXISTS pos_layout_rvc_assignments (
  id TEXT PRIMARY KEY,
  layout_id TEXT NOT NULL REFERENCES pos_layouts(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  is_default INTEGER DEFAULT 0,
  order_type TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- GIFT CARDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gift_cards (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  card_number TEXT NOT NULL UNIQUE,
  pin TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  initial_balance INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  activated_at TEXT,
  activated_by_employee_id TEXT REFERENCES employees(id),
  expires_at TEXT,
  last_used_at TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id TEXT PRIMARY KEY,
  gift_card_id TEXT NOT NULL REFERENCES gift_cards(id),
  check_id TEXT REFERENCES checks(id),
  transaction_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  employee_id TEXT REFERENCES employees(id),
  workstation_id TEXT REFERENCES workstations(id),
  notes TEXT,
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- AUDIT LOGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  employee_id TEXT REFERENCES employees(id),
  workstation_id TEXT REFERENCES workstations(id),
  ip_address TEXT,
  reason TEXT,
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- REFUNDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  original_check_id TEXT NOT NULL REFERENCES checks(id),
  rvc_id TEXT NOT NULL REFERENCES rvcs(id),
  refund_number INTEGER NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  manager_employee_id TEXT REFERENCES employees(id),
  workstation_id TEXT REFERENCES workstations(id),
  refund_type TEXT NOT NULL DEFAULT 'full',
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  business_date TEXT,
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS refund_items (
  id TEXT PRIMARY KEY,
  refund_id TEXT NOT NULL REFERENCES refunds(id),
  original_item_id TEXT REFERENCES check_items(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  tax_amount INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refund_payments (
  id TEXT PRIMARY KEY,
  refund_id TEXT NOT NULL REFERENCES refunds(id),
  original_payment_id TEXT REFERENCES check_payments(id),
  tender_id TEXT NOT NULL REFERENCES tenders(id),
  amount INTEGER NOT NULL,
  refund_method TEXT NOT NULL,
  reference_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- PAYMENT PROCESSORS
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_processors (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  processor_type TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  config TEXT,
  config_version INTEGER DEFAULT 1,
  credentials TEXT,
  settlement_cutoff_time TEXT,
  supports_tip_adjust INTEGER DEFAULT 1,
  supports_void INTEGER DEFAULT 1,
  supports_refund INTEGER DEFAULT 1,
  gateway_mode TEXT DEFAULT 'production',
  max_retry_attempts INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  created_by TEXT REFERENCES employees(id),
  updated_by TEXT REFERENCES employees(id),
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- LOYALTY PROGRAM
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_programs (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  name TEXT NOT NULL,
  program_type TEXT NOT NULL DEFAULT 'points',
  points_per_dollar TEXT DEFAULT '1',
  minimum_redeem_points INTEGER DEFAULT 100,
  points_value TEXT DEFAULT '0.01',
  visit_threshold INTEGER,
  spend_threshold TEXT,
  tier_thresholds TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loyalty_members (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT REFERENCES enterprises(id),
  property_id TEXT REFERENCES properties(id),
  phone TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  external_id TEXT,
  birthday TEXT,
  notes TEXT,
  sms_opt_in INTEGER DEFAULT 0,
  email_opt_in INTEGER DEFAULT 0,
  marketing_opt_in INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loyalty_member_enrollments (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES loyalty_members(id),
  program_id TEXT NOT NULL REFERENCES loyalty_programs(id),
  points_balance INTEGER DEFAULT 0,
  lifetime_points INTEGER DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  total_spend TEXT DEFAULT '0',
  current_tier TEXT,
  enrolled_at TEXT DEFAULT (datetime('now')),
  last_activity_at TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES loyalty_members(id),
  program_id TEXT NOT NULL REFERENCES loyalty_programs(id),
  enrollment_id TEXT REFERENCES loyalty_member_enrollments(id),
  property_id TEXT REFERENCES properties(id),
  transaction_type TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  points_before INTEGER DEFAULT 0,
  points_after INTEGER DEFAULT 0,
  visit_increment INTEGER DEFAULT 0,
  visits_before INTEGER DEFAULT 0,
  visits_after INTEGER DEFAULT 0,
  check_id TEXT REFERENCES checks(id),
  check_total TEXT,
  employee_id TEXT REFERENCES employees(id),
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES loyalty_programs(id),
  name TEXT NOT NULL,
  description TEXT,
  reward_type TEXT NOT NULL,
  points_required INTEGER NOT NULL,
  menu_item_id TEXT REFERENCES menu_items(id),
  discount_id TEXT REFERENCES discounts(id),
  fixed_value TEXT,
  percent_off TEXT,
  max_uses INTEGER,
  valid_from TEXT,
  valid_until TEXT,
  min_check_amount TEXT,
  max_discount_amount TEXT,
  usage_limit_per_member INTEGER,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES loyalty_members(id),
  reward_id TEXT NOT NULL REFERENCES loyalty_rewards(id),
  check_id TEXT REFERENCES checks(id),
  points_used INTEGER NOT NULL,
  redeemed_at TEXT DEFAULT (datetime('now')),
  employee_id TEXT REFERENCES employees(id)
);

-- =============================================================================
-- ITEM AVAILABILITY
-- =============================================================================

CREATE TABLE IF NOT EXISTS item_availability (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  is_available INTEGER DEFAULT 1,
  available_quantity INTEGER,
  unavailable_reason TEXT,
  unavailable_until TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by_employee_id TEXT REFERENCES employees(id)
);

-- =============================================================================
-- PAYMENT TRANSACTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  check_id TEXT REFERENCES checks(id),
  check_payment_id TEXT REFERENCES check_payments(id),
  payment_processor_id TEXT REFERENCES payment_processors(id),
  tender_id TEXT REFERENCES tenders(id),
  transaction_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  tip_amount INTEGER DEFAULT 0,
  auth_code TEXT,
  reference_number TEXT,
  card_type TEXT,
  card_last4 TEXT,
  card_holder_name TEXT,
  entry_mode TEXT,
  response_code TEXT,
  response_message TEXT,
  avs_result TEXT,
  cvv_result TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  settled INTEGER DEFAULT 0,
  settled_at TEXT,
  voided INTEGER DEFAULT 0,
  voided_at TEXT,
  void_reason TEXT,
  refunded INTEGER DEFAULT 0,
  refunded_at TEXT,
  refund_amount INTEGER DEFAULT 0,
  gateway_transaction_id TEXT,
  gateway_response TEXT,
  employee_id TEXT REFERENCES employees(id),
  workstation_id TEXT REFERENCES workstations(id),
  terminal_device_id TEXT REFERENCES terminal_devices(id),
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS terminal_devices (
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
);

-- =============================================================================
-- CASH MANAGEMENT
-- =============================================================================

CREATE TABLE IF NOT EXISTS cash_drawers (
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
);

CREATE TABLE IF NOT EXISTS drawer_assignments (
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
);

CREATE TABLE IF NOT EXISTS cash_transactions (
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
);

CREATE TABLE IF NOT EXISTS safe_counts (
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
);

-- =============================================================================
-- JOB CODES & TIME PUNCHES
-- =============================================================================

CREATE TABLE IF NOT EXISTS job_codes (
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
);

CREATE TABLE IF NOT EXISTS employee_job_codes (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  job_code_id TEXT NOT NULL REFERENCES job_codes(id),
  hourly_rate_override TEXT,
  is_primary INTEGER DEFAULT 0,
  effective_from TEXT,
  effective_until TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_punches (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  job_code_id TEXT REFERENCES job_codes(id),
  workstation_id TEXT REFERENCES workstations(id),
  punch_type TEXT NOT NULL,
  punch_time TEXT NOT NULL,
  original_punch_time TEXT,
  edited INTEGER DEFAULT 0,
  edited_by_employee_id TEXT REFERENCES employees(id),
  edit_reason TEXT,
  business_date TEXT,
  ip_address TEXT,
  geo_location TEXT,
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS break_sessions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  time_entry_id TEXT,
  break_type TEXT NOT NULL DEFAULT 'unpaid',
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_minutes INTEGER,
  paid INTEGER DEFAULT 0,
  workstation_id TEXT REFERENCES workstations(id),
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- FISCAL PERIODS
-- =============================================================================

CREATE TABLE IF NOT EXISTS fiscal_periods (
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
);

-- =============================================================================
-- KDS TICKET ITEMS
-- =============================================================================

CREATE TABLE IF NOT EXISTS kds_ticket_items (
  id TEXT PRIMARY KEY,
  kds_ticket_id TEXT NOT NULL REFERENCES kds_tickets(id),
  check_item_id TEXT REFERENCES check_items(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  short_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  modifiers TEXT,
  seat_number INTEGER,
  course_number INTEGER DEFAULT 1,
  special_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  bumped_at TEXT,
  started_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- OFFLINE ORDER QUEUE
-- =============================================================================

CREATE TABLE IF NOT EXISTS offline_order_queue (
  id TEXT PRIMARY KEY,
  rvc_id TEXT NOT NULL REFERENCES rvcs(id),
  order_type TEXT NOT NULL,
  order_source TEXT DEFAULT 'pos',
  table_number TEXT,
  guest_count INTEGER DEFAULT 1,
  items TEXT NOT NULL,
  payments TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  special_instructions TEXT,
  scheduled_time TEXT,
  priority INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  employee_id TEXT REFERENCES employees(id),
  workstation_id TEXT REFERENCES workstations(id),
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  cloud_check_id TEXT
);

-- =============================================================================
-- ONLINE ORDERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS online_order_sources (
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
);

CREATE TABLE IF NOT EXISTS online_orders (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  rvc_id TEXT REFERENCES rvcs(id),
  source_id TEXT REFERENCES online_order_sources(id),
  external_order_id TEXT,
  order_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  delivery_address TEXT,
  special_instructions TEXT,
  items TEXT NOT NULL,
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER DEFAULT 0,
  tip INTEGER DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid',
  payment_method TEXT,
  scheduled_time TEXT,
  estimated_ready_time TEXT,
  actual_ready_time TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  check_id TEXT REFERENCES checks(id),
  employee_id TEXT REFERENCES employees(id),
  cloud_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- LOCAL-ONLY TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS sync_queue (
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
);

CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS check_locks (
  check_id TEXT PRIMARY KEY REFERENCES checks(id),
  workstation_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  lock_type TEXT DEFAULT 'active',
  locked_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS print_queue (
  id TEXT PRIMARY KEY,
  printer_id TEXT NOT NULL REFERENCES printers(id),
  printer_ip TEXT,
  printer_port INTEGER DEFAULT 9100,
  job_type TEXT NOT NULL,
  content BLOB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  lease_id TEXT,
  lease_expires_at TEXT,
  dedupe_key TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS workstation_config (
  workstation_id TEXT PRIMARY KEY,
  check_number_start INTEGER NOT NULL,
  check_number_end INTEGER NOT NULL,
  current_check_number INTEGER NOT NULL,
  offline_mode_enabled INTEGER DEFAULT 0,
  last_sync_at TEXT,
  last_seen_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- EMC OPTION FLAGS (OptionBits)
-- =============================================================================

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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_emc_option_flags_unique
  ON emc_option_flags (enterprise_id, entity_type, entity_id, option_key, scope_level, scope_id);
CREATE INDEX IF NOT EXISTS idx_emc_option_flags_entity
  ON emc_option_flags (enterprise_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_emc_option_flags_key
  ON emc_option_flags (enterprise_id, option_key);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_employees_property ON employees(property_id);
CREATE INDEX IF NOT EXISTS idx_employees_number ON employees(employee_number);
CREATE INDEX IF NOT EXISTS idx_menu_items_property ON menu_items(property_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_slu ON menu_item_slus(slu_id);
CREATE INDEX IF NOT EXISTS idx_slus_property ON slus(property_id);
CREATE INDEX IF NOT EXISTS idx_slus_rvc ON slus(rvc_id);

CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);
CREATE INDEX IF NOT EXISTS idx_checks_employee ON checks(employee_id);
CREATE INDEX IF NOT EXISTS idx_checks_rvc ON checks(rvc_id);
CREATE INDEX IF NOT EXISTS idx_checks_business_date ON checks(business_date);
CREATE INDEX IF NOT EXISTS idx_checks_cloud_synced ON checks(cloud_synced);

CREATE INDEX IF NOT EXISTS idx_check_items_check ON check_items(check_id);
CREATE INDEX IF NOT EXISTS idx_check_items_round ON check_items(round_id);
CREATE INDEX IF NOT EXISTS idx_check_items_kds_status ON check_items(kds_status);

CREATE INDEX IF NOT EXISTS idx_check_payments_check ON check_payments(check_id);
CREATE INDEX IF NOT EXISTS idx_check_payments_status ON check_payments(status);
CREATE INDEX IF NOT EXISTS idx_check_payments_cloud_synced ON check_payments(cloud_synced);

CREATE INDEX IF NOT EXISTS idx_rounds_check ON rounds(check_id);

CREATE INDEX IF NOT EXISTS idx_kds_tickets_check ON kds_tickets(check_id);
CREATE INDEX IF NOT EXISTS idx_kds_tickets_status ON kds_tickets(status);
CREATE INDEX IF NOT EXISTS idx_kds_tickets_device ON kds_tickets(kds_device_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(business_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_cloud_synced ON time_entries(cloud_synced);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(attempts, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
CREATE INDEX IF NOT EXISTS idx_print_queue_printer ON print_queue(printer_id);

CREATE INDEX IF NOT EXISTS idx_check_locks_expires ON check_locks(expires_at);

CREATE INDEX IF NOT EXISTS idx_printers_property ON printers(property_id);
CREATE INDEX IF NOT EXISTS idx_workstations_property ON workstations(property_id);
CREATE INDEX IF NOT EXISTS idx_kds_devices_property ON kds_devices(property_id);
CREATE INDEX IF NOT EXISTS idx_order_devices_property ON order_devices(property_id);

CREATE INDEX IF NOT EXISTS idx_config_cache_entity ON config_cache(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_payment_processors_property ON payment_processors(property_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_property ON loyalty_programs(property_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_members_phone ON loyalty_members(phone);
CREATE INDEX IF NOT EXISTS idx_loyalty_members_email ON loyalty_members(email);
CREATE INDEX IF NOT EXISTS idx_loyalty_enrollments_member ON loyalty_member_enrollments(member_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_enrollments_program ON loyalty_member_enrollments(program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_member ON loyalty_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_check ON loyalty_transactions(check_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_program ON loyalty_rewards(program_id);
CREATE INDEX IF NOT EXISTS idx_item_availability_item ON item_availability(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_item_availability_property ON item_availability(property_id);

CREATE INDEX IF NOT EXISTS idx_pos_layouts_active ON pos_layouts(active);
CREATE INDEX IF NOT EXISTS idx_pos_layouts_rvc ON pos_layouts(rvc_id);
CREATE INDEX IF NOT EXISTS idx_pos_layouts_property ON pos_layouts(property_id);
CREATE INDEX IF NOT EXISTS idx_pos_layout_cells_layout ON pos_layout_cells(layout_id);
CREATE INDEX IF NOT EXISTS idx_pos_layout_rvc_property ON pos_layout_rvc_assignments(property_id);
CREATE INDEX IF NOT EXISTS idx_pos_layout_rvc_rvc ON pos_layout_rvc_assignments(rvc_id);

CREATE INDEX IF NOT EXISTS idx_gift_cards_number ON gift_cards(card_number);
CREATE INDEX IF NOT EXISTS idx_gift_cards_property ON gift_cards(property_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status);
CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_card ON gift_card_transactions(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_check ON gift_card_transactions(check_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_employee ON audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_refunds_original_check ON refunds(original_check_id);
CREATE INDEX IF NOT EXISTS idx_refunds_date ON refunds(business_date);
CREATE INDEX IF NOT EXISTS idx_refund_items_refund ON refund_items(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_payments_refund ON refund_payments(refund_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_check ON payment_transactions(check_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_property ON payment_transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_terminal_devices_property ON terminal_devices(property_id);

CREATE INDEX IF NOT EXISTS idx_cash_drawers_property ON cash_drawers(property_id);
CREATE INDEX IF NOT EXISTS idx_drawer_assignments_drawer ON drawer_assignments(cash_drawer_id);
CREATE INDEX IF NOT EXISTS idx_drawer_assignments_employee ON drawer_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_drawer_assignments_date ON drawer_assignments(business_date);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_drawer ON cash_transactions(cash_drawer_id);
CREATE INDEX IF NOT EXISTS idx_safe_counts_property ON safe_counts(property_id);
CREATE INDEX IF NOT EXISTS idx_safe_counts_date ON safe_counts(business_date);

CREATE INDEX IF NOT EXISTS idx_job_codes_property ON job_codes(property_id);
CREATE INDEX IF NOT EXISTS idx_employee_job_codes_employee ON employee_job_codes(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_punches_employee ON time_punches(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_punches_date ON time_punches(business_date);
CREATE INDEX IF NOT EXISTS idx_break_sessions_employee ON break_sessions(employee_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_property ON fiscal_periods(property_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_date ON fiscal_periods(business_date);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_status ON fiscal_periods(status);

CREATE INDEX IF NOT EXISTS idx_kds_ticket_items_ticket ON kds_ticket_items(kds_ticket_id);
CREATE INDEX IF NOT EXISTS idx_kds_ticket_items_status ON kds_ticket_items(status);

CREATE INDEX IF NOT EXISTS idx_offline_order_queue_status ON offline_order_queue(status);
CREATE INDEX IF NOT EXISTS idx_offline_order_queue_rvc ON offline_order_queue(rvc_id);

CREATE INDEX IF NOT EXISTS idx_online_orders_property ON online_orders(property_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_status ON online_orders(status);
CREATE INDEX IF NOT EXISTS idx_online_orders_external ON online_orders(external_order_id);
`;

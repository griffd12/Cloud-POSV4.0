import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, decimal, timestamp, jsonb, serial, real, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// ENTERPRISE HIERARCHY
// ============================================================================

export const enterprises = pgTable("enterprises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  active: boolean("active").default(true),
});

export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  address: text("address"),
  timezone: text("timezone").default("America/New_York"),
  // Business Date Settings - when does the business day roll over to the next day
  businessDateRolloverTime: text("business_date_rollover_time").default("04:00"), // HH:MM format, e.g., "04:00" for 4 AM
  businessDateMode: text("business_date_mode").default("auto"), // 'auto' or 'manual'
  currentBusinessDate: text("current_business_date"), // YYYY-MM-DD format, used for manual mode
  // Branding - custom sign-in logo for the property
  signInLogoUrl: text("sign_in_logo_url"),
  // Auto clock-out settings - automatically clock out employees when business date changes
  autoClockOutEnabled: boolean("auto_clock_out_enabled").default(false),
  capsWorkstationId: varchar("caps_workstation_id"),
  active: boolean("active").default(true),
});

// DOM Send Modes for KDS
export const DOM_SEND_MODES = ["fire_on_fly", "fire_on_next", "fire_on_tender"] as const;
export type DomSendMode = (typeof DOM_SEND_MODES)[number];

export const rvcs = pgTable("rvcs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  fastTransactionDefault: boolean("fast_transaction_default").default(false),
  defaultOrderType: text("default_order_type").default("dine_in"),
  orderTypeDefault: text("order_type_default").default("dine_in"),
  dynamicOrderMode: boolean("dynamic_order_mode").default(false),
  domSendMode: text("dom_send_mode").default("fire_on_fly"), // 'fire_on_fly', 'fire_on_next', 'fire_on_tender'
  conversationalOrderingEnabled: boolean("conversational_ordering_enabled").default(false), // Enable MICROS RES 3700-style conversational ordering
  active: boolean("active").default(true),
  receiptPrintMode: text("receipt_print_mode").default("auto_on_close"),
  receiptCopies: integer("receipt_copies").default(1),
  kitchenPrintMode: text("kitchen_print_mode").default("auto_on_send"),
  voidReceiptPrint: boolean("void_receipt_print").default(true),
  requireGuestCount: boolean("require_guest_count").default(false),
});

// Hierarchy relations
export const enterprisesRelations = relations(enterprises, ({ many }) => ({
  properties: many(properties),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  enterprise: one(enterprises, { fields: [properties.enterpriseId], references: [enterprises.id] }),
  rvcs: many(rvcs),
}));

export const rvcsRelations = relations(rvcs, ({ one }) => ({
  property: one(properties, { fields: [rvcs.propertyId], references: [properties.id] }),
}));

// ============================================================================
// ROLES & PRIVILEGES
// ============================================================================

export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  active: boolean("active").default(true),
});

export const privileges = pgTable("privileges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain"), // e.g., 'check_control', 'item_control', 'payment_control', 'manager_override', 'reporting'
  description: text("description"),
});

export const rolePrivileges = pgTable("role_privileges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => roles.id),
  privilegeCode: text("privilege_code").notNull(),
});

export const roleRules = pgTable("role_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => roles.id),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  maxItemDiscountPct: integer("max_item_discount_pct").notNull().default(0),
  maxCheckDiscountPct: integer("max_check_discount_pct").notNull().default(0),
  maxItemDiscountAmt: decimal("max_item_discount_amt", { precision: 10, scale: 2 }).notNull().default("0"),
  maxCheckDiscountAmt: decimal("max_check_discount_amt", { precision: 10, scale: 2 }).notNull().default("0"),
  maxPriceOverridePctDown: integer("max_price_override_pct_down").notNull().default(0),
  maxPriceOverrideAmtDown: decimal("max_price_override_amt_down", { precision: 10, scale: 2 }).notNull().default("0"),
  reopenWindowMinutes: integer("reopen_window_minutes").notNull().default(0),
  editClosedWindowMinutes: integer("edit_closed_window_minutes").notNull().default(0),
  refundWindowMinutes: integer("refund_window_minutes").notNull().default(0),
  bypassWindowsAllowed: boolean("bypass_windows_allowed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// EMPLOYEES
// ============================================================================

export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  employeeNumber: text("employee_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth"),
  pinHash: text("pin_hash").notNull(),
  roleId: varchar("role_id").references(() => roles.id),
  active: boolean("active").default(true),
});

export const employeesRelations = relations(employees, ({ one, many }) => ({
  role: one(roles, { fields: [employees.roleId], references: [roles.id] }),
  assignments: many(employeeAssignments),
}));

// Employee multi-property/RVC assignments
export const employeeAssignments = pgTable("employee_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  isPrimary: boolean("is_primary").default(false),
});

export const employeeAssignmentsRelations = relations(employeeAssignments, ({ one }) => ({
  employee: one(employees, { fields: [employeeAssignments.employeeId], references: [employees.id] }),
  enterprise: one(enterprises, { fields: [employeeAssignments.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [employeeAssignments.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [employeeAssignments.rvcId], references: [rvcs.id] }),
}));

// ============================================================================
// REPORTING GROUPS (for Major/Family Group reporting)
// ============================================================================

export const majorGroups = pgTable("major_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

export const familyGroups = pgTable("family_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  majorGroupId: varchar("major_group_id").references(() => majorGroups.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

export const majorGroupsRelations = relations(majorGroups, ({ many }) => ({
  familyGroups: many(familyGroups),
}));

export const familyGroupsRelations = relations(familyGroups, ({ one }) => ({
  majorGroup: one(majorGroups, { fields: [familyGroups.majorGroupId], references: [majorGroups.id] }),
}));

// ============================================================================
// MENU STRUCTURE
// ============================================================================

// Screen Lookup Units (category buttons)
export const slus = pgTable("slus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  buttonLabel: text("button_label").notNull(),
  displayOrder: integer("display_order").default(0),
  color: text("color").default("#3B82F6"),
  active: boolean("active").default(true),
});

// Tax Groups
export const taxGroups = pgTable("tax_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  rate: decimal("rate", { precision: 5, scale: 4 }).notNull(),
  taxMode: text("tax_mode").notNull().default("add_on"), // 'add_on' or 'inclusive'
  active: boolean("active").default(true),
});

// Print Classes (logical routing category - decouples menu items from physical devices)
export const printClasses = pgTable("print_classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  active: boolean("active").default(true),
});

// ============================================================================
// DEVICE CONFIGURATION (Simphony-style)
// ============================================================================

// Workstations (FOH Terminals)
export const workstations = pgTable("workstations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  deviceType: text("device_type").notNull().default("pos_terminal"), // pos_terminal, kiosk, manager_station
  // Functional Behavior
  defaultOrderType: text("default_order_type").default("dine_in"),
  fastTransactionEnabled: boolean("fast_transaction_enabled").default(false),
  requireBeginCheck: boolean("require_begin_check").default(true),
  allowPickupCheck: boolean("allow_pickup_check").default(true),
  allowReopenClosedChecks: boolean("allow_reopen_closed_checks").default(false),
  allowOfflineOperation: boolean("allow_offline_operation").default(false),
  offlineCheckNumberStart: integer("offline_check_number_start"),
  offlineCheckNumberEnd: integer("offline_check_number_end"),
  // Employee Interaction
  allowedRoleIds: text("allowed_role_ids").array(),
  managerApprovalDevice: boolean("manager_approval_device").default(false),
  clockInAllowed: boolean("clock_in_allowed").default(true),
  // Routing & Printing - Receipt Printing
  defaultReceiptPrinterId: varchar("default_receipt_printer_id"),
  backupReceiptPrinterId: varchar("backup_receipt_printer_id"),
  // Routing & Printing - Report Printing
  reportPrinterId: varchar("report_printer_id"),
  backupReportPrinterId: varchar("backup_report_printer_id"),
  // Routing & Printing - Void Printing
  voidPrinterId: varchar("void_printer_id"),
  backupVoidPrinterId: varchar("backup_void_printer_id"),
  // Order Routing
  defaultOrderDeviceId: varchar("default_order_device_id"),
  defaultKdsExpoId: varchar("default_kds_expo_id"),
  // Network / System
  ipAddress: text("ip_address"),
  hostname: text("hostname"),
  isOnline: boolean("is_online").default(false),
  lastSeenAt: timestamp("last_seen_at"),
  // Service Host (Hybrid Mode)
  serviceHostUrl: text("service_host_url"), // URL to local Service Host for hybrid/offline mode (e.g., http://192.168.1.100:3001)
  // Auto-Logout Settings
  autoLogoutMinutes: integer("auto_logout_minutes"), // null or 0 = disabled
  active: boolean("active").default(true),
  // Service Bindings (what services should run on this workstation)
  serviceBindings: text("service_bindings").array(), // ['caps', 'print_controller', 'kds_controller', 'payment_controller']
  // CAL Setup Status
  setupStatus: text("setup_status").default("pending"), // pending, in_progress, completed, failed
  lastSetupAt: timestamp("last_setup_at"),
  lastSetupBy: varchar("last_setup_by"), // Employee ID who ran the wizard
  installedServices: text("installed_services").array(), // Services successfully installed
  deviceToken: text("device_token"), // Hashed token for device authentication
  registeredDeviceId: varchar("registered_device_id"), // Hardware ID of registered device
  fontScale: integer("font_scale").default(100), // Display font scale percentage: 85=Small, 100=Medium, 120=Large, 140=Extra Large
  // Serial COM Port Settings (for serial printers connected to workstation COM ports)
  comPort: text("com_port"), // COM1, COM2, COM3, COM4
  comBaudRate: integer("com_baud_rate").default(9600), // 2400, 4800, 9600, 19200, 38400, 57600, 115200
  comDataBits: integer("com_data_bits").default(8), // 7, 8
  comStopBits: text("com_stop_bits").default("1"), // 1, 1.5, 2
  comParity: text("com_parity").default("none"), // none, even, odd, mark, space
  comFlowControl: text("com_flow_control").default("none"), // none, xon_xoff, rts_cts, dtr_dsr
  // Cash Drawer Settings
  cashDrawerEnabled: boolean("cash_drawer_enabled").default(false),
  cashDrawerPrinterId: varchar("cash_drawer_printer_id"),
  cashDrawerKickPin: text("cash_drawer_kick_pin").default("pin2"), // pin2 or pin5
  cashDrawerPulseDuration: integer("cash_drawer_pulse_duration").default(100), // milliseconds
  cashDrawerAutoOpenOnCash: boolean("cash_drawer_auto_open_on_cash").default(true),
  cashDrawerAutoOpenOnDrop: boolean("cash_drawer_auto_open_on_drop").default(true),
});

// Printers (Physical print devices)
export const printers = pgTable("printers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  hostWorkstationId: varchar("host_workstation_id").references(() => workstations.id), // Workstation physically connected to this printer (for serial/USB routing)
  name: text("name").notNull(),
  printerType: text("printer_type").notNull().default("kitchen"), // receipt, kitchen, bar, prep, report
  // Connection
  connectionType: text("connection_type").notNull().default("network"), // network, usb, serial, windows_printer
  ipAddress: text("ip_address"),
  subnetMask: text("subnet_mask").default("255.255.255.0"),
  port: integer("port").default(9100),
  comPort: text("com_port"), // e.g., COM1, COM2, COM3 (for serial connection_type)
  baudRate: integer("baud_rate").default(9600), // 9600, 19200, 38400, 57600, 115200
  windowsPrinterName: text("windows_printer_name"), // Windows spooler printer name for USB printers (e.g., "Star TSP100 CUTTER (TSP143)")
  driverProtocol: text("driver_protocol").default("epson"), // epson, star
  model: text("model"), // e.g., TM-T88V, TM-T20III, TSP143IV, mC-Print3
  characterWidth: integer("character_width").default(42), // 42, 48, 56
  // Behavior
  autoCut: boolean("auto_cut").default(true),
  printLogo: boolean("print_logo").default(false),
  printOrderHeader: boolean("print_order_header").default(true),
  printOrderFooter: boolean("print_order_footer").default(true),
  printVoids: boolean("print_voids").default(true),
  printReprints: boolean("print_reprints").default(true),
  // Failover
  retryAttempts: integer("retry_attempts").default(3),
  failureHandlingMode: text("failure_handling_mode").default("alert_cashier"), // fail_silently, alert_cashier
  // Status
  isOnline: boolean("is_online").default(false),
  lastSeenAt: timestamp("last_seen_at"),
  active: boolean("active").default(true),
});

// KDS Devices (Kitchen Display Screens)
export const kdsDevices = pgTable("kds_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  stationType: text("station_type").notNull().default("hot"), // hot, cold, prep, expo, bar
  // Display Rules
  showDraftItems: boolean("show_draft_items").default(false),
  showSentItemsOnly: boolean("show_sent_items_only").default(true),
  groupBy: text("group_by").default("order"), // order, item, course
  showTimers: boolean("show_timers").default(true),
  autoSortBy: text("auto_sort_by").default("time"), // priority, time
  // Interaction
  allowBump: boolean("allow_bump").default(true),
  allowRecall: boolean("allow_recall").default(true),
  allowVoidDisplay: boolean("allow_void_display").default(true),
  expoMode: boolean("expo_mode").default(false),
  // New Order Notification Settings
  newOrderSound: boolean("new_order_sound").default(true),
  newOrderBlinkSeconds: integer("new_order_blink_seconds").default(5), // 0 = no blink
  // Color Alert Settings (time-based color changes)
  colorAlert1Enabled: boolean("color_alert_1_enabled").default(true),
  colorAlert1Seconds: integer("color_alert_1_seconds").default(60), // After 1 minute
  colorAlert1Color: text("color_alert_1_color").default("yellow"),
  colorAlert2Enabled: boolean("color_alert_2_enabled").default(true),
  colorAlert2Seconds: integer("color_alert_2_seconds").default(180), // After 3 minutes
  colorAlert2Color: text("color_alert_2_color").default("orange"),
  colorAlert3Enabled: boolean("color_alert_3_enabled").default(true),
  colorAlert3Seconds: integer("color_alert_3_seconds").default(300), // After 5 minutes
  colorAlert3Color: text("color_alert_3_color").default("red"),
  // Display
  fontScale: integer("font_scale").default(100),
  // Network
  wsChannel: text("ws_channel"),
  ipAddress: text("ip_address"),
  serviceHostUrl: text("service_host_url"),
  isOnline: boolean("is_online").default(false),
  lastSeenAt: timestamp("last_seen_at"),
  active: boolean("active").default(true),
});

// Order Devices (Logical routing containers - links to printers and KDS)
export const orderDevices = pgTable("order_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  // Controller KDS Device - the KDS that controls this order device's behavior
  kdsDeviceId: varchar("kds_device_id").references(() => kdsDevices.id),
  // Behavior
  sendOn: text("send_on").default("send_button"), // send_button, dynamic
  sendVoids: boolean("send_voids").default(true),
  sendReprints: boolean("send_reprints").default(true),
  active: boolean("active").default(true),
});

// Order Device to Printer linkage
export const orderDevicePrinters = pgTable("order_device_printers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderDeviceId: varchar("order_device_id").notNull().references(() => orderDevices.id),
  printerId: varchar("printer_id").notNull().references(() => printers.id),
  displayOrder: integer("display_order").default(0),
});

// Order Device to KDS linkage
export const orderDeviceKds = pgTable("order_device_kds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderDeviceId: varchar("order_device_id").notNull().references(() => orderDevices.id),
  kdsDeviceId: varchar("kds_device_id").notNull().references(() => kdsDevices.id),
  displayOrder: integer("display_order").default(0),
});

// Workstation to Order Device routing filter
// Controls which Order Devices a workstation is allowed to send to.
// If no rows exist for a workstation, it defaults to sending to ALL order devices (backward compatible).
export const workstationOrderDevices = pgTable("workstation_order_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workstationId: varchar("workstation_id").notNull().references(() => workstations.id),
  orderDeviceId: varchar("order_device_id").notNull().references(() => orderDevices.id),
});

// Print Class to Order Device routing (resolved per Property/RVC)
export const printClassRouting = pgTable("print_class_routing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  printClassId: varchar("print_class_id").notNull().references(() => printClasses.id),
  orderDeviceId: varchar("order_device_id").notNull().references(() => orderDevices.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
});

// Menu Items
export const menuItems = pgTable("menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  shortName: text("short_name"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  taxGroupId: varchar("tax_group_id").references(() => taxGroups.id),
  printClassId: varchar("print_class_id").references(() => printClasses.id),
  majorGroupId: varchar("major_group_id").references(() => majorGroups.id),
  familyGroupId: varchar("family_group_id").references(() => familyGroups.id),
  color: text("color").default("#3B82F6"),
  menuBuildEnabled: boolean("menu_build_enabled").default(false), // Enable recipe/ingredient configuration for conversational ordering
  active: boolean("active").default(true),
});

// Menu Item to SLU linkage
export const menuItemSlus = pgTable("menu_item_slus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  sluId: varchar("slu_id").notNull().references(() => slus.id),
  displayOrder: integer("display_order").default(0),
});

// ============================================================================
// MODIFIER SYSTEM
// ============================================================================

// Modifier Groups - categories like "Meat Temps", "Bread Choice", "Toppings", "Dips"
export const modifierGroups = pgTable("modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  required: boolean("required").default(false),
  minSelect: integer("min_select").default(0),
  maxSelect: integer("max_select").default(99),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

// Standalone Modifiers - items like "Medium", "Well Done", "Rye", "Wheat", "Peanuts", "Almonds"
// Can belong to multiple groups
export const modifiers = pgTable("modifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  priceDelta: decimal("price_delta", { precision: 10, scale: 2 }).default("0"),
  active: boolean("active").default(true),
});

// Many-to-many: Modifier to Modifier Group linkage
// A modifier can belong to multiple groups
export const modifierGroupModifiers = pgTable("modifier_group_modifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modifierGroupId: varchar("modifier_group_id").notNull().references(() => modifierGroups.id),
  modifierId: varchar("modifier_id").notNull().references(() => modifiers.id),
  isDefault: boolean("is_default").default(false),
  displayOrder: integer("display_order").default(0),
});

// Many-to-many: Menu Item to Modifier Group linkage (Required Modifiers)
// A menu item can have multiple required modifier groups
export const menuItemModifierGroups = pgTable("menu_item_modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  modifierGroupId: varchar("modifier_group_id").notNull().references(() => modifierGroups.id),
  displayOrder: integer("display_order").default(0),
});

// ============================================================================
// MENU BUILD / RECIPE SYSTEM (Conversational Ordering)
// ============================================================================

// Ingredient Prefixes - configurable prefixes like "No", "Extra", "Sub", "Light", "Add"
export const ingredientPrefixes = pgTable("ingredient_prefixes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(), // Display name: "No", "Extra", "Sub", "Light", "Add"
  code: text("code").notNull(), // Internal code: "NO", "EXTRA", "SUB", "LIGHT", "ADD"
  printName: text("print_name"), // What prints on kitchen ticket: "NO", "X-TRA", "SUB"
  priceFactor: decimal("price_factor", { precision: 5, scale: 2 }).default("1.00"), // Price multiplier: 0 for No, 2 for Extra, etc.
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

// Menu Item Recipe Ingredients - default ingredients for menu build
// When menuBuildEnabled=true on a menu item, these are the default ingredients shown
export const menuItemRecipeIngredients = pgTable("menu_item_recipe_ingredients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  ingredientName: text("ingredient_name").notNull(), // e.g., "Lettuce", "Tomato", "Pickles", "Onion"
  ingredientCategory: text("ingredient_category"), // e.g., "Vegetables", "Proteins", "Sauces", "Cheese"
  defaultQuantity: integer("default_quantity").default(1), // Default amount (1x, 2x, etc.)
  isDefault: boolean("is_default").default(true), // Is this ingredient included by default?
  pricePerUnit: decimal("price_per_unit", { precision: 10, scale: 2 }).default("0.00"), // Price for extras
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
  // Conversational Ordering fields (optional - for modifier-based recipe linking)
  modifierId: varchar("modifier_id").references(() => modifiers.id), // Link to modifier as ingredient
  defaultPrefixId: varchar("default_prefix_id").references(() => ingredientPrefixes.id), // Default prefix (No, Extra, Sub, etc.)
  sortOrder: integer("sort_order").default(0), // Display order for conversational ordering
});

export const ingredientPrefixesRelations = relations(ingredientPrefixes, ({ one }) => ({
  enterprise: one(enterprises, { fields: [ingredientPrefixes.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [ingredientPrefixes.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [ingredientPrefixes.rvcId], references: [rvcs.id] }),
}));

export const menuItemRecipeIngredientsRelations = relations(menuItemRecipeIngredients, ({ one }) => ({
  menuItem: one(menuItems, { fields: [menuItemRecipeIngredients.menuItemId], references: [menuItems.id] }),
  modifier: one(modifiers, { fields: [menuItemRecipeIngredients.modifierId], references: [modifiers.id] }),
  defaultPrefix: one(ingredientPrefixes, { fields: [menuItemRecipeIngredients.defaultPrefixId], references: [ingredientPrefixes.id] }),
}));

// ============================================================================
// PAYMENT PROCESSING - Gateway-agnostic payment processor configuration
// ============================================================================

// Supported payment gateway types
export const PAYMENT_GATEWAY_TYPES = [
  "stripe",
  "elavon_converge",
  "elavon_fusebox",  // Elavon Fusebox EMV gateway
  "shift4",
  "heartland",
  "freedompay",
  "eigen",
] as const;
export type PaymentGatewayType = (typeof PAYMENT_GATEWAY_TYPES)[number];

// Payment transaction statuses
export const PAYMENT_TRANSACTION_STATUSES = [
  "pending",        // Transaction initiated
  "authorized",     // Auth approved, awaiting capture
  "captured",       // Funds captured/settled
  "voided",         // Transaction voided before settlement
  "refunded",       // Full refund processed
  "partial_refund", // Partial refund processed
  "declined",       // Authorization declined
  "failed",         // Technical failure
] as const;
export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];

// Payment Processors - configured per property (credentials stored as secrets)
export const paymentProcessors = pgTable("payment_processors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(), // Display name, e.g., "Main Credit Card Processor"
  gatewayType: text("gateway_type").notNull(), // 'stripe', 'elavon_converge', etc.
  // Environment settings
  environment: text("environment").default("sandbox"), // 'sandbox' or 'production'
  // Credential references - NOT the actual credentials, just the secret key names
  // Actual credentials stored in Replit Secrets (e.g., STRIPE_API_KEY, ELAVON_MERCHANT_ID)
  credentialKeyPrefix: text("credential_key_prefix").notNull(), // e.g., "STRIPE" or "ELAVON_MAIN"
  // Gateway-specific settings (JSON) - endpoint URLs, merchant IDs, terminal IDs, etc.
  gatewaySettings: jsonb("gateway_settings"), 
  // Feature flags
  supportsTokenization: boolean("supports_tokenization").default(true),
  supportsTipAdjust: boolean("supports_tip_adjust").default(true),
  supportsPartialAuth: boolean("supports_partial_auth").default(false),
  supportsEmv: boolean("supports_emv").default(true),
  supportsContactless: boolean("supports_contactless").default(true),
  // Timing settings
  authHoldMinutes: integer("auth_hold_minutes").default(1440), // How long auth is valid (24 hours default)
  settlementTime: text("settlement_time").default("02:00"), // When batch closes (HH:MM)
  // Status
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// TENDERS, DISCOUNTS, SERVICE CHARGES
// ============================================================================

export const tenders = pgTable("tenders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(), // 'cash', 'credit', 'gift', 'other'
  paymentProcessorId: varchar("payment_processor_id").references(() => paymentProcessors.id),
  active: boolean("active").default(true),
  isSystem: boolean("is_system").default(false),
  popDrawer: boolean("pop_drawer").default(false),
  allowTips: boolean("allow_tips").default(false),
  allowOverTender: boolean("allow_over_tender").default(false),
  printCheckOnPayment: boolean("print_check_on_payment").default(true),
  requireManagerApproval: boolean("require_manager_approval").default(false),
  requiresPaymentProcessor: boolean("requires_payment_processor").default(false),
  displayOrder: integer("display_order").default(0),
  isCashMedia: boolean("is_cash_media").default(false),
  isCardMedia: boolean("is_card_media").default(false),
  isGiftMedia: boolean("is_gift_media").default(false),
});

// Payment Transactions - tracks all gateway communications (NO card data stored)
export const paymentTransactions = pgTable("payment_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkPaymentId: varchar("check_payment_id").references(() => checkPayments.id), // Links to POS payment
  paymentProcessorId: varchar("payment_processor_id").notNull().references(() => paymentProcessors.id),
  // Transaction identifiers from gateway
  gatewayTransactionId: text("gateway_transaction_id"), // Transaction ID from processor
  authCode: text("auth_code"), // Authorization code
  referenceNumber: text("reference_number"), // Gateway reference number
  // Safe card display info only (PCI compliant)
  cardBrand: text("card_brand"), // 'visa', 'mastercard', 'amex', 'discover', etc.
  cardLast4: text("card_last4"), // Last 4 digits only
  cardExpiryMonth: integer("card_expiry_month"), // 1-12
  cardExpiryYear: integer("card_expiry_year"), // e.g., 2025
  entryMode: text("entry_mode"), // 'chip', 'contactless', 'swipe', 'manual', 'token'
  // Amounts (in cents to avoid floating point issues)
  authAmount: integer("auth_amount").notNull(), // Original authorized amount in cents
  captureAmount: integer("capture_amount"), // Amount actually captured (may differ for tips)
  tipAmount: integer("tip_amount").default(0), // Tip added after auth
  // Transaction state
  status: text("status").notNull().default("pending"), // See PAYMENT_TRANSACTION_STATUSES
  transactionType: text("transaction_type").notNull(), // 'sale', 'auth', 'capture', 'void', 'refund'
  // Gateway response details
  responseCode: text("response_code"), // Gateway response code
  responseMessage: text("response_message"), // Human-readable response
  avsResult: text("avs_result"), // Address verification result
  cvvResult: text("cvv_result"), // CVV verification result
  // Timestamps
  initiatedAt: timestamp("initiated_at").defaultNow(),
  authorizedAt: timestamp("authorized_at"),
  capturedAt: timestamp("captured_at"),
  settledAt: timestamp("settled_at"),
  // Terminal/device info
  terminalId: text("terminal_id"), // Physical terminal identifier
  workstationId: varchar("workstation_id").references(() => workstations.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  // Refund tracking
  originalTransactionId: varchar("original_transaction_id"), // For refunds/voids, links to original
  refundedAmount: integer("refunded_amount").default(0), // Total refunded so far
  // Batch/settlement info
  batchId: text("batch_id"), // Settlement batch identifier
  businessDate: text("business_date"), // YYYY-MM-DD
});

// Relations
export const paymentProcessorsRelations = relations(paymentProcessors, ({ one, many }) => ({
  property: one(properties, { fields: [paymentProcessors.propertyId], references: [properties.id] }),
  transactions: many(paymentTransactions),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  checkPayment: one(checkPayments, { fields: [paymentTransactions.checkPaymentId], references: [checkPayments.id] }),
  paymentProcessor: one(paymentProcessors, { fields: [paymentTransactions.paymentProcessorId], references: [paymentProcessors.id] }),
  workstation: one(workstations, { fields: [paymentTransactions.workstationId], references: [workstations.id] }),
  employee: one(employees, { fields: [paymentTransactions.employeeId], references: [employees.id] }),
}));

// ============================================================================
// PAYMENT TERMINAL DEVICES (External EMV Card Readers)
// ============================================================================

// Terminal device statuses
export const TERMINAL_DEVICE_STATUSES = ["online", "offline", "busy", "error", "maintenance"] as const;
export type TerminalDeviceStatus = (typeof TERMINAL_DEVICE_STATUSES)[number];

// Terminal session statuses
export const TERMINAL_SESSION_STATUSES = ["pending", "processing", "awaiting_card", "card_inserted", "pin_entry", "approved", "declined", "cancelled", "timeout", "error"] as const;
export type TerminalSessionStatus = (typeof TERMINAL_SESSION_STATUSES)[number];

// Terminal device models (common EMV terminals)
// ADDITIVE: Added Heartland Pay App compatible devices (Verifone Trinity T650c, T650p, P630, PAX A35, A77)
export const TERMINAL_MODELS = [
  // Existing PAX models
  "pax_a920", "pax_s300",
  // Heartland Pay App PAX models (new)
  "pax_a35", "pax_a77",
  // Existing Verifone models
  "verifone_vx520", "verifone_vx820", "verifone_p400",
  // Heartland Pay App Verifone Trinity models (new)
  "verifone_t650c", "verifone_t650p", "verifone_p630",
  // Existing Ingenico models
  "ingenico_lane_3000", "ingenico_lane_5000",
  // North Ingenico SI terminals (ADDITIVE)
  "ingenico_lane_7000", "ingenico_move_5000", "ingenico_desk_2600", "ingenico_link_2500",
  // Heartland OPI Ingenico models (new)
  "ingenico_ipp350", "ingenico_isc_touch_250",
  // Existing Stripe/other models
  "stripe_s700", "stripe_m2", "stripe_wisepos_e", "bbpos_chipper",
  // Generic fallback
  "generic"
] as const;
export type TerminalModel = (typeof TERMINAL_MODELS)[number];

// Connection types for terminals
export const TERMINAL_CONNECTION_TYPES = ["ethernet", "wifi", "usb", "bluetooth", "cloud"] as const;
export type TerminalConnectionType = (typeof TERMINAL_CONNECTION_TYPES)[number];

// Terminal Devices - Physical EMV card readers
export const terminalDevices = pgTable("terminal_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  paymentProcessorId: varchar("payment_processor_id").references(() => paymentProcessors.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  name: text("name").notNull(),
  model: text("model").notNull(), // See TERMINAL_MODELS
  serialNumber: text("serial_number"),
  terminalId: text("terminal_id"), // Processor-assigned terminal ID
  connectionType: text("connection_type").default("ethernet"), // See TERMINAL_CONNECTION_TYPES
  networkAddress: text("network_address"), // IP address or hostname for network terminals
  port: integer("port"), // Network port if applicable
  cloudDeviceId: text("cloud_device_id"), // For cloud-connected terminals (e.g., Stripe Terminal device ID)
  status: text("status").default("offline"), // See TERMINAL_DEVICE_STATUSES
  lastHeartbeat: timestamp("last_heartbeat"),
  capabilities: jsonb("capabilities"), // Supported features: {contactless, chip, swipe, pinDebit, cashback}
  supportsStoreAndForward: boolean("supports_store_and_forward").default(false),
  firmwareVersion: text("firmware_version"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Terminal Sessions - Active payment sessions on terminals
export const terminalSessions = pgTable("terminal_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  terminalDeviceId: varchar("terminal_device_id").notNull().references(() => terminalDevices.id),
  checkId: varchar("check_id").references(() => checks.id),
  tenderId: varchar("tender_id").references(() => tenders.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  amount: integer("amount").notNull(), // Amount in cents
  tipAmount: integer("tip_amount").default(0), // Pre-set tip if any
  currency: text("currency").default("usd"),
  status: text("status").default("pending"), // See TERMINAL_SESSION_STATUSES
  statusMessage: text("status_message"), // Human-readable status message
  processorReference: text("processor_reference"), // Reference ID from processor SDK
  paymentTransactionId: varchar("payment_transaction_id").references(() => paymentTransactions.id),
  initiatedAt: timestamp("initiated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"), // Session timeout
  metadata: jsonb("metadata"), // Additional processor-specific data
});

// Relations
export const terminalDevicesRelations = relations(terminalDevices, ({ one, many }) => ({
  property: one(properties, { fields: [terminalDevices.propertyId], references: [properties.id] }),
  paymentProcessor: one(paymentProcessors, { fields: [terminalDevices.paymentProcessorId], references: [paymentProcessors.id] }),
  workstation: one(workstations, { fields: [terminalDevices.workstationId], references: [workstations.id] }),
  sessions: many(terminalSessions),
}));

export const terminalSessionsRelations = relations(terminalSessions, ({ one }) => ({
  terminalDevice: one(terminalDevices, { fields: [terminalSessions.terminalDeviceId], references: [terminalDevices.id] }),
  check: one(checks, { fields: [terminalSessions.checkId], references: [checks.id] }),
  tender: one(tenders, { fields: [terminalSessions.tenderId], references: [tenders.id] }),
  employee: one(employees, { fields: [terminalSessions.employeeId], references: [employees.id] }),
  workstation: one(workstations, { fields: [terminalSessions.workstationId], references: [workstations.id] }),
  paymentTransaction: one(paymentTransactions, { fields: [terminalSessions.paymentTransactionId], references: [paymentTransactions.id] }),
}));

// ============================================================================
// REGISTERED DEVICES - Security enrollment for POS/KDS access
// ============================================================================

// Device types for registration
export const REGISTERED_DEVICE_TYPES = ["pos_workstation", "kds_display"] as const;
export const REGISTERED_DEVICE_STATUSES = ["pending", "enrolled", "disabled", "revoked"] as const;

// Registered Devices - Physical devices authorized to access POS/KDS
export const registeredDevices = pgTable("registered_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  // What this device is linked to
  deviceType: text("device_type").notNull(), // 'pos_workstation' or 'kds_display'
  workstationId: varchar("workstation_id").references(() => workstations.id), // For POS workstation type
  kdsDeviceId: varchar("kds_device_id").references(() => kdsDevices.id), // For KDS display type
  // Device identification
  name: text("name").notNull(), // Friendly name for this registration (e.g., "Front Counter PC")
  // Enrollment
  enrollmentCode: text("enrollment_code"), // One-time code for device enrollment (cleared after use)
  enrollmentCodeExpiresAt: timestamp("enrollment_code_expires_at"),
  deviceToken: text("device_token"), // Secure token issued after enrollment (stored in browser)
  deviceTokenHash: text("device_token_hash"), // Hash of the device token for server-side validation
  status: text("status").notNull().default("pending"), // pending, enrolled, disabled, revoked
  enrolledAt: timestamp("enrolled_at"),
  lastAccessAt: timestamp("last_access_at"),
  // Optional hardware metadata (manually entered or auto-detected where possible)
  osInfo: text("os_info"), // e.g., "Windows 11", "Chrome OS"
  browserInfo: text("browser_info"), // e.g., "Chrome 120"
  screenResolution: text("screen_resolution"), // e.g., "1920x1080"
  serialNumber: text("serial_number"), // Manually entered by admin
  assetTag: text("asset_tag"), // Internal tracking number
  macAddress: text("mac_address"), // Manually entered
  ipAddress: text("ip_address"), // Last known IP (informational only)
  notes: text("notes"), // Admin notes
  // Audit
  createdAt: timestamp("created_at").defaultNow(),
  createdByEmployeeId: varchar("created_by_employee_id").references(() => employees.id),
  disabledAt: timestamp("disabled_at"),
  disabledByEmployeeId: varchar("disabled_by_employee_id").references(() => employees.id),
  disabledReason: text("disabled_reason"),
});

export const registeredDevicesRelations = relations(registeredDevices, ({ one }) => ({
  property: one(properties, { fields: [registeredDevices.propertyId], references: [properties.id] }),
  workstation: one(workstations, { fields: [registeredDevices.workstationId], references: [workstations.id] }),
  kdsDevice: one(kdsDevices, { fields: [registeredDevices.kdsDeviceId], references: [kdsDevices.id] }),
  createdByEmployee: one(employees, { fields: [registeredDevices.createdByEmployeeId], references: [employees.id] }),
  disabledByEmployee: one(employees, { fields: [registeredDevices.disabledByEmployeeId], references: [employees.id] }),
}));

// ============================================================================
// EMC (ENTERPRISE MANAGEMENT CONSOLE) USERS
// ============================================================================
// Separate from employees - these are admin users who access the system from any browser
// using email/password authentication (not PIN-based like POS employees)

export const emcUsers = pgTable("emc_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  // Access level
  accessLevel: text("access_level").notNull().default("property_admin"), // system_admin, enterprise_admin, property_admin
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id), // null for super_admin
  propertyId: varchar("property_id").references(() => properties.id), // null for enterprise_admin and above
  employeeId: varchar("employee_id").references(() => employees.id),
  // Status
  active: boolean("active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  // Audit
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emcUsersRelations = relations(emcUsers, ({ one }) => ({
  enterprise: one(enterprises, { fields: [emcUsers.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [emcUsers.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [emcUsers.employeeId], references: [employees.id] }),
}));

// EMC Sessions for server-side session management
export const emcSessions = pgTable("emc_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => emcUsers.id),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emcSessionsRelations = relations(emcSessions, ({ one }) => ({
  user: one(emcUsers, { fields: [emcSessions.userId], references: [emcUsers.id] }),
}));

export const discounts = pgTable("discounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(), // 'percent', 'amount'
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  requiresManagerApproval: boolean("requires_manager_approval").default(false),
  active: boolean("active").default(true),
});

export const serviceCharges = pgTable("service_charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(), // 'percent', 'amount'
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  autoApply: boolean("auto_apply").default(false),
  orderTypes: text("order_types").array(),
  active: boolean("active").default(true),
  isTaxable: boolean("is_taxable").notNull().default(false),
  taxGroupId: varchar("tax_group_id").references(() => taxGroups.id),
  revenueCategory: text("revenue_category").notNull().default("revenue"), // 'revenue' | 'non_revenue'
  postToTipPool: boolean("post_to_tip_pool").notNull().default(false),
  tipEligible: boolean("tip_eligible").notNull().default(false),
});

export const checkServiceCharges = pgTable("check_service_charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull(),
  propertyId: varchar("property_id").notNull(),
  rvcId: varchar("rvc_id").notNull(),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  serviceChargeId: varchar("service_charge_id").notNull().references(() => serviceCharges.id),
  nameAtSale: text("name_at_sale").notNull(),
  codeAtSale: text("code_at_sale"),
  isTaxableAtSale: boolean("is_taxable_at_sale").notNull().default(false),
  taxRateAtSale: decimal("tax_rate_at_sale", { precision: 8, scale: 5 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  taxableAmount: decimal("taxable_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  autoApplied: boolean("auto_applied").notNull().default(false),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  appliedByEmployeeId: varchar("applied_by_employee_id").references(() => employees.id),
  businessDate: text("business_date").notNull(),
  originDeviceId: text("origin_device_id"),
  voided: boolean("voided").notNull().default(false),
  voidedAt: timestamp("voided_at"),
  voidedByEmployeeId: varchar("voided_by_employee_id").references(() => employees.id),
  voidReason: text("void_reason"),
}, (table) => [
  index("idx_check_service_charges_business_date").on(table.businessDate, table.propertyId, table.rvcId),
  index("idx_check_service_charges_check_id").on(table.checkId),
  index("idx_check_service_charges_sc_id").on(table.serviceChargeId),
]);

// ============================================================================
// RVC COUNTERS (Concurrency-safe check number sequences)
// ============================================================================

export const rvcCounters = pgTable("rvc_counters", {
  rvcId: varchar("rvc_id").primaryKey().references(() => rvcs.id),
  nextCheckNumber: integer("next_check_number").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type RvcCounter = typeof rvcCounters.$inferSelect;
export type InsertRvcCounter = typeof rvcCounters.$inferInsert;

// ============================================================================
// CHECK LIFECYCLE
// ============================================================================

export const checks = pgTable("checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkNumber: integer("check_number").notNull(),
  rvcId: varchar("rvc_id").notNull().references(() => rvcs.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  customerId: varchar("customer_id"),
  orderType: text("order_type").notNull(),
  status: text("status").notNull().default("open"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).default("0"),
  discountTotal: decimal("discount_total", { precision: 10, scale: 2 }).default("0"),
  serviceChargeTotal: decimal("service_charge_total", { precision: 10, scale: 2 }).default("0"),
  tipTotal: decimal("tip_total", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  guestCount: integer("guest_count").default(1),
  tableNumber: text("table_number"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  originBusinessDate: text("origin_business_date"),
  businessDate: text("business_date"),
  loyaltyPointsEarned: integer("loyalty_points_earned"),
  loyaltyPointsRedeemed: integer("loyalty_points_redeemed"),
  testMode: boolean("test_mode").default(false),
  fulfillmentStatus: text("fulfillment_status"),
  onlineOrderId: varchar("online_order_id"),
  customerName: text("customer_name"),
  platformSource: text("platform_source"),
  originDeviceId: varchar("origin_device_id"),
  originCreatedAt: timestamp("origin_created_at"),
  offlineTransactionId: varchar("offline_transaction_id"),
}, (table) => [
  uniqueIndex("idx_checks_rvc_check_number").on(table.rvcId, table.checkNumber),
]);

// Rounds (each send creates a round)
export const rounds = pgTable("rounds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  roundNumber: integer("round_number").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  sentByEmployeeId: varchar("sent_by_employee_id").references(() => employees.id),
});

// Check Locks (for multi-workstation operation)
export const checkLocks = pgTable("check_locks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id).unique(),
  workstationId: varchar("workstation_id").notNull().references(() => workstations.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  lockMode: text("lock_mode").notNull().default("green"), // 'green', 'yellow', 'red' - connection mode when lock acquired
  acquiredAt: timestamp("acquired_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertCheckLockSchema = createInsertSchema(checkLocks).omit({ id: true, acquiredAt: true });
export type InsertCheckLock = z.infer<typeof insertCheckLockSchema>;

// Check Items (line items on a check)
export const checkItems = pgTable("check_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  roundId: varchar("round_id").references(() => rounds.id),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id), // Nullable for special items like gift cards
  menuItemName: text("menu_item_name").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  modifiers: jsonb("modifiers").$type<{ name: string; priceDelta: string; prefix?: string }[]>(),
  itemStatus: text("item_status").notNull().default("active"), // 'pending' = awaiting modifiers, 'active' = ready
  sent: boolean("sent").default(false),
  voided: boolean("voided").default(false),
  voidReason: text("void_reason"),
  voidedByEmployeeId: varchar("voided_by_employee_id").references(() => employees.id),
  voidedAt: timestamp("voided_at"),
  addedAt: timestamp("added_at").defaultNow(),
  businessDate: text("business_date"), // YYYY-MM-DD format, the operating day this item was rung in
  // Tax snapshot at ring-in time - IMMUTABLE once set
  // These values capture tax settings at the moment item was rung, preventing retroactive tax changes
  taxGroupIdAtSale: varchar("tax_group_id_at_sale"), // Tax group ID at ring-in time
  taxModeAtSale: text("tax_mode_at_sale"), // 'inclusive' or 'add_on' at ring-in time
  taxRateAtSale: decimal("tax_rate_at_sale", { precision: 10, scale: 6 }), // Tax rate at ring-in (e.g., 0.0725 for 7.25%)
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }), // Calculated add-on tax for this item (locked at ring-in)
  taxableAmount: decimal("taxable_amount", { precision: 10, scale: 2 }), // Item total (base for add-on tax calculation)
  // Item-level discount fields
  discountId: varchar("discount_id").references(() => discounts.id), // Applied discount
  discountName: text("discount_name"), // Discount name at time of application
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }), // Calculated discount amount
  discountAppliedBy: varchar("discount_applied_by").references(() => employees.id), // Who applied the discount
  discountApprovedBy: varchar("discount_approved_by").references(() => employees.id), // Manager who approved (if required)
  // Non-revenue flag for items that should not count toward sales (e.g., gift card sales/reloads)
  // Gift card sales are liabilities, not revenue - revenue is recognized when redeemed
  isNonRevenue: boolean("is_non_revenue").default(false),
  nonRevenueType: text("non_revenue_type"),
  offlineTransactionId: varchar("offline_transaction_id"),
});

// Check Payments
export const checkPayments = pgTable("check_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  tenderId: varchar("tender_id").notNull().references(() => tenders.id),
  tenderName: text("tender_name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at").defaultNow(),
  employeeId: varchar("employee_id").references(() => employees.id),
  businessDate: text("business_date"),
  paymentTransactionId: varchar("payment_transaction_id"),
  paymentStatus: text("payment_status").default("completed"),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }),
  originDeviceId: varchar("origin_device_id"),
  paymentAttemptId: varchar("payment_attempt_id"),
  offlineTransactionId: varchar("offline_transaction_id"),
}, (table) => [
  uniqueIndex("idx_check_payments_attempt_id").on(table.paymentAttemptId),
]);

// Check Discounts Applied
export const checkDiscounts = pgTable("check_discounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  discountId: varchar("discount_id").notNull().references(() => discounts.id),
  discountName: text("discount_name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  appliedAt: timestamp("applied_at").defaultNow(),
  employeeId: varchar("employee_id").references(() => employees.id),
  managerApprovalId: varchar("manager_approval_id").references(() => employees.id),
});

// ============================================================================
// REFUNDS
// ============================================================================

export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  refundNumber: integer("refund_number").notNull(),
  rvcId: varchar("rvc_id").notNull().references(() => rvcs.id),
  originalCheckId: varchar("original_check_id").notNull().references(() => checks.id),
  originalCheckNumber: integer("original_check_number").notNull(),
  refundType: text("refund_type").notNull(), // 'full' or 'partial'
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  processedByEmployeeId: varchar("processed_by_employee_id").notNull().references(() => employees.id),
  managerApprovalId: varchar("manager_approval_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
  businessDate: text("business_date"), // YYYY-MM-DD format
});

// Refund Items (tracks which items from the original check were refunded)
export const refundItems = pgTable("refund_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  refundId: varchar("refund_id").notNull().references(() => refunds.id),
  originalCheckItemId: varchar("original_check_item_id").notNull().references(() => checkItems.id),
  menuItemName: text("menu_item_name").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  modifiers: jsonb("modifiers").$type<{ name: string; priceDelta: string; prefix?: string }[]>(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).notNull(),
});

// Refund Payments (tracks how refunds were applied back to original payment methods)
export const refundPayments = pgTable("refund_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  refundId: varchar("refund_id").notNull().references(() => refunds.id),
  originalPaymentId: varchar("original_payment_id").notNull().references(() => checkPayments.id),
  tenderId: varchar("tender_id").notNull().references(() => tenders.id),
  tenderName: text("tender_name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  gatewayRefundId: text("gateway_refund_id"),
  gatewayStatus: text("gateway_status"),
  gatewayMessage: text("gateway_message"),
  refundMethod: text("refund_method").default("manual"),
});

export const refundsRelations = relations(refunds, ({ one, many }) => ({
  rvc: one(rvcs, { fields: [refunds.rvcId], references: [rvcs.id] }),
  originalCheck: one(checks, { fields: [refunds.originalCheckId], references: [checks.id] }),
  processedBy: one(employees, { fields: [refunds.processedByEmployeeId], references: [employees.id] }),
  managerApproval: one(employees, { fields: [refunds.managerApprovalId], references: [employees.id] }),
  items: many(refundItems),
  payments: many(refundPayments),
}));

export const refundItemsRelations = relations(refundItems, ({ one }) => ({
  refund: one(refunds, { fields: [refundItems.refundId], references: [refunds.id] }),
  originalCheckItem: one(checkItems, { fields: [refundItems.originalCheckItemId], references: [checkItems.id] }),
}));

export const refundPaymentsRelations = relations(refundPayments, ({ one }) => ({
  refund: one(refunds, { fields: [refundPayments.refundId], references: [refunds.id] }),
  originalPayment: one(checkPayments, { fields: [refundPayments.originalPaymentId], references: [checkPayments.id] }),
  tender: one(tenders, { fields: [refundPayments.tenderId], references: [tenders.id] }),
}));

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  action: text("action").notNull(), // 'void_unsent', 'void_sent', 'reopen_check', 'transfer_check', etc.
  targetType: text("target_type").notNull(), // 'check', 'check_item', 'employee'
  targetId: varchar("target_id").notNull(),
  details: jsonb("details"),
  reasonCode: text("reason_code"),
  managerApprovalId: varchar("manager_approval_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// KDS QUEUE
// ============================================================================

export const kdsTickets = pgTable("kds_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkId: varchar("check_id").notNull().references(() => checks.id),
  roundId: varchar("round_id").references(() => rounds.id),
  orderDeviceId: varchar("order_device_id").references(() => orderDevices.id),
  kdsDeviceId: varchar("kds_device_id").references(() => kdsDevices.id),
  stationType: text("station_type"), // cached from KDS device for fast filtering
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  status: text("status").notNull().default("draft"), // 'draft', 'active', 'bumped'
  isPreview: boolean("is_preview").default(false), // True for Dynamic Order Mode preview tickets
  paid: boolean("paid").default(false), // True when the check has been fully paid
  isRecalled: boolean("is_recalled").default(false), // True when ticket has been recalled from bumped
  recalledAt: timestamp("recalled_at"),
  bumpedAt: timestamp("bumped_at"),
  bumpedByEmployeeId: varchar("bumped_by_employee_id").references(() => employees.id),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }), // DOM: display subtotal on ticket
  originDeviceId: varchar("origin_device_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const kdsTicketItems = pgTable("kds_ticket_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kdsTicketId: varchar("kds_ticket_id").notNull().references(() => kdsTickets.id),
  checkItemId: varchar("check_item_id").notNull().references(() => checkItems.id),
  status: text("status").notNull().default("pending"), // 'pending', 'bumped', 'voided'
  isReady: boolean("is_ready").default(false), // True when item is marked as ready/made
  readyAt: timestamp("ready_at"),
  isModified: boolean("is_modified").default(false), // DOM: item was modified after initial send
  modifiedAt: timestamp("modified_at"), // DOM: when item was last modified
  sortPriority: integer("sort_priority").default(0), // DOM: for priority sorting (modified items higher)
});

// ============================================================================
// PRINT AGENTS (Local network print relay agents - like Oracle Simphony Controllers)
// ============================================================================

export const PRINT_AGENT_STATUSES = ["online", "offline", "disconnected"] as const;
export type PrintAgentStatus = (typeof PRINT_AGENT_STATUSES)[number];

export const printAgents = pgTable("print_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id), // Optional - null means global (all properties)
  workstationId: varchar("workstation_id").references(() => workstations.id), // Links agent to its host workstation for print routing
  name: text("name").notNull(),
  description: text("description"),
  // Authentication
  agentToken: text("agent_token").notNull().unique(), // Token for agent authentication
  // Status
  status: text("status").notNull().default("offline"), // online, offline, disconnected
  lastHeartbeat: timestamp("last_heartbeat"),
  lastConnectedAt: timestamp("last_connected_at"),
  lastDisconnectedAt: timestamp("last_disconnected_at"),
  // Agent info (reported by agent)
  agentVersion: text("agent_version"),
  hostname: text("hostname"),
  ipAddress: text("ip_address"),
  osInfo: text("os_info"),
  // Configuration
  autoReconnect: boolean("auto_reconnect").default(true),
  heartbeatIntervalMs: integer("heartbeat_interval_ms").default(30000),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// PRINT JOBS (Queue for network/local printing)
// ============================================================================

export const PRINT_JOB_TYPES = ["check_receipt", "kitchen_ticket", "sales_report", "employee_report", "end_of_day", "cash_drawer"] as const;
export type PrintJobType = (typeof PRINT_JOB_TYPES)[number];

export const PRINT_JOB_STATUSES = ["pending", "printing", "completed", "failed", "cancelled"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

export const printJobs = pgTable("print_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  printAgentId: varchar("print_agent_id").references(() => printAgents.id), // Agent that will handle this job
  printerId: varchar("printer_id").references(() => printers.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  jobType: text("job_type").notNull(), // check_receipt, kitchen_ticket, sales_report, employee_report, end_of_day
  status: text("status").notNull().default("pending"), // pending, printing, completed, failed, cancelled
  priority: integer("priority").default(5), // 1-10, lower = higher priority
  // Reference data
  checkId: varchar("check_id").references(() => checks.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  businessDate: text("business_date"),
  // Print content
  escPosData: text("esc_pos_data"), // Base64 encoded ESC/POS commands
  plainTextData: text("plain_text_data"), // Plain text fallback for debugging
  // Printer destination info (for agent)
  printerIp: text("printer_ip"),
  printerPort: integer("printer_port").default(9100),
  printerName: text("printer_name"),
  connectionType: text("connection_type").default("network"),
  comPort: text("com_port"),
  baudRate: integer("baud_rate"),
  windowsPrinterName: text("windows_printer_name"),
  // Retry handling
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastError: text("last_error"),
  // Lease-based exactly-once delivery
  leasedBy: varchar("leased_by"),
  leasedUntil: timestamp("leased_until"),
  dedupeKey: varchar("dedupe_key"),
  // Origin metadata for sync compatibility
  originDeviceId: varchar("origin_device_id"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  sentToAgentAt: timestamp("sent_to_agent_at"),
  printedAt: timestamp("printed_at"),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  uniqueIndex("idx_print_jobs_dedupe").on(table.dedupeKey),
]);

// ============================================================================
// INSERT SCHEMAS & TYPES
// ============================================================================

export const insertEnterpriseSchema = createInsertSchema(enterprises).omit({ id: true });
export const insertPropertySchema = createInsertSchema(properties).omit({ id: true });
export const insertRvcSchema = createInsertSchema(rvcs).omit({ id: true });
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true });
export const insertRoleRulesSchema = createInsertSchema(roleRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPrivilegeSchema = createInsertSchema(privileges).omit({ id: true });
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true });
export const insertEmployeeAssignmentSchema = createInsertSchema(employeeAssignments).omit({ id: true });
export const insertMajorGroupSchema = createInsertSchema(majorGroups).omit({ id: true });
export const insertFamilyGroupSchema = createInsertSchema(familyGroups).omit({ id: true });
export const insertSluSchema = createInsertSchema(slus).omit({ id: true });
export const insertTaxGroupSchema = createInsertSchema(taxGroups).omit({ id: true }).extend({
  rate: z.coerce.string(),
});
export const insertPrintClassSchema = createInsertSchema(printClasses).omit({ id: true });
export const insertWorkstationSchema = createInsertSchema(workstations).omit({ id: true });
export const insertPrinterSchema = createInsertSchema(printers).omit({ id: true }).extend({
  port: z.coerce.number().optional().default(9100),
  characterWidth: z.coerce.number().optional().default(42),
  retryAttempts: z.coerce.number().optional().default(3),
});
export const insertKdsDeviceSchema = createInsertSchema(kdsDevices).omit({ id: true });
export const insertOrderDeviceSchema = createInsertSchema(orderDevices).omit({ id: true });
export const insertOrderDevicePrinterSchema = createInsertSchema(orderDevicePrinters).omit({ id: true });
export const insertOrderDeviceKdsSchema = createInsertSchema(orderDeviceKds).omit({ id: true });
export const insertWorkstationOrderDeviceSchema = createInsertSchema(workstationOrderDevices).omit({ id: true });
export const insertPrintClassRoutingSchema = createInsertSchema(printClassRouting).omit({ id: true });
export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true });
export const insertModifierGroupSchema = createInsertSchema(modifierGroups).omit({ id: true });
export const insertModifierSchema = createInsertSchema(modifiers).omit({ id: true });
export const insertModifierGroupModifierSchema = createInsertSchema(modifierGroupModifiers).omit({ id: true });
export const insertMenuItemModifierGroupSchema = createInsertSchema(menuItemModifierGroups).omit({ id: true });
export const insertIngredientPrefixSchema = createInsertSchema(ingredientPrefixes).omit({ id: true });
export const insertMenuItemRecipeIngredientSchema = createInsertSchema(menuItemRecipeIngredients).omit({ id: true });
export const insertPaymentProcessorSchema = createInsertSchema(paymentProcessors).omit({ id: true, createdAt: true });
export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({ id: true, initiatedAt: true });
export const insertTerminalDeviceSchema = createInsertSchema(terminalDevices).omit({ id: true, createdAt: true }).extend({
  port: z.coerce.number().optional(),
});
export const insertTerminalSessionSchema = createInsertSchema(terminalSessions).omit({ id: true, initiatedAt: true }).extend({
  amount: z.coerce.number(),
  tipAmount: z.coerce.number().optional(),
});
export const insertRegisteredDeviceSchema = createInsertSchema(registeredDevices).omit({ id: true, createdAt: true });
export const insertEmcUserSchema = createInsertSchema(emcUsers).omit({ id: true, createdAt: true, updatedAt: true, failedLoginAttempts: true, lockedUntil: true, lastLoginAt: true });
export const insertEmcSessionSchema = createInsertSchema(emcSessions).omit({ id: true, createdAt: true });
export const insertTenderSchema = createInsertSchema(tenders).omit({ id: true });
export const insertDiscountSchema = createInsertSchema(discounts).omit({ id: true });
export const insertServiceChargeSchema = createInsertSchema(serviceCharges).omit({ id: true });
export const insertCheckServiceChargeSchema = createInsertSchema(checkServiceCharges).omit({ id: true, appliedAt: true });
export const insertCheckSchema = createInsertSchema(checks).omit({ id: true });
export const insertRoundSchema = createInsertSchema(rounds).omit({ id: true });
export const insertCheckItemSchema = createInsertSchema(checkItems).omit({ id: true });
export const insertCheckPaymentSchema = createInsertSchema(checkPayments).omit({ id: true });
export const insertCheckDiscountSchema = createInsertSchema(checkDiscounts).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true });
export const insertKdsTicketSchema = createInsertSchema(kdsTickets).omit({ id: true });
export const insertRefundSchema = createInsertSchema(refunds).omit({ id: true });
export const insertRefundItemSchema = createInsertSchema(refundItems).omit({ id: true });
export const insertRefundPaymentSchema = createInsertSchema(refundPayments).omit({ id: true });
export const insertPrintAgentSchema = createInsertSchema(printAgents).omit({ 
  id: true, 
  createdAt: true, 
  lastHeartbeat: true, 
  lastConnectedAt: true, 
  lastDisconnectedAt: true, 
  status: true, 
  agentVersion: true, 
  hostname: true, 
  ipAddress: true,
  agentToken: true,  // Generated by backend
  osInfo: true,      // Reported by agent
}).extend({
  propertyId: z.string().optional().nullable(),
});
export const insertPrintJobSchema = createInsertSchema(printJobs).omit({ id: true, createdAt: true, sentToAgentAt: true, printedAt: true });

// Types
export type Enterprise = typeof enterprises.$inferSelect;
export type InsertEnterprise = z.infer<typeof insertEnterpriseSchema>;
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Rvc = typeof rvcs.$inferSelect;
export type InsertRvc = z.infer<typeof insertRvcSchema>;
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type RoleRules = typeof roleRules.$inferSelect;
export type InsertRoleRules = z.infer<typeof insertRoleRulesSchema>;
export type Privilege = typeof privileges.$inferSelect;
export type InsertPrivilege = z.infer<typeof insertPrivilegeSchema>;
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type EmployeeAssignment = typeof employeeAssignments.$inferSelect;
export type InsertEmployeeAssignment = z.infer<typeof insertEmployeeAssignmentSchema>;
export type MajorGroup = typeof majorGroups.$inferSelect;
export type InsertMajorGroup = z.infer<typeof insertMajorGroupSchema>;
export type FamilyGroup = typeof familyGroups.$inferSelect;
export type InsertFamilyGroup = z.infer<typeof insertFamilyGroupSchema>;
export type Slu = typeof slus.$inferSelect;
export type InsertSlu = z.infer<typeof insertSluSchema>;
export type TaxGroup = typeof taxGroups.$inferSelect;
export type InsertTaxGroup = z.infer<typeof insertTaxGroupSchema>;
export type PrintClass = typeof printClasses.$inferSelect;
export type InsertPrintClass = z.infer<typeof insertPrintClassSchema>;
export type Workstation = typeof workstations.$inferSelect;
export type InsertWorkstation = z.infer<typeof insertWorkstationSchema>;
export type Printer = typeof printers.$inferSelect;
export type InsertPrinter = z.infer<typeof insertPrinterSchema>;
export type KdsDevice = typeof kdsDevices.$inferSelect;
export type InsertKdsDevice = z.infer<typeof insertKdsDeviceSchema>;
export type OrderDevice = typeof orderDevices.$inferSelect;
export type InsertOrderDevice = z.infer<typeof insertOrderDeviceSchema>;
export type OrderDevicePrinter = typeof orderDevicePrinters.$inferSelect;
export type InsertOrderDevicePrinter = z.infer<typeof insertOrderDevicePrinterSchema>;
export type OrderDeviceKds = typeof orderDeviceKds.$inferSelect;
export type InsertOrderDeviceKds = z.infer<typeof insertOrderDeviceKdsSchema>;
export type WorkstationOrderDevice = typeof workstationOrderDevices.$inferSelect;
export type InsertWorkstationOrderDevice = z.infer<typeof insertWorkstationOrderDeviceSchema>;
export type PrintClassRouting = typeof printClassRouting.$inferSelect;
export type InsertPrintClassRouting = z.infer<typeof insertPrintClassRoutingSchema>;
export type MenuItemSlu = typeof menuItemSlus.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type InsertModifierGroup = z.infer<typeof insertModifierGroupSchema>;
export type Modifier = typeof modifiers.$inferSelect;
export type InsertModifier = z.infer<typeof insertModifierSchema>;
export type ModifierGroupModifier = typeof modifierGroupModifiers.$inferSelect;
export type InsertModifierGroupModifier = z.infer<typeof insertModifierGroupModifierSchema>;
export type MenuItemModifierGroup = typeof menuItemModifierGroups.$inferSelect;
export type InsertMenuItemModifierGroup = z.infer<typeof insertMenuItemModifierGroupSchema>;
export type IngredientPrefix = typeof ingredientPrefixes.$inferSelect;
export type InsertIngredientPrefix = z.infer<typeof insertIngredientPrefixSchema>;
export type MenuItemRecipeIngredient = typeof menuItemRecipeIngredients.$inferSelect;
export type InsertMenuItemRecipeIngredient = z.infer<typeof insertMenuItemRecipeIngredientSchema>;
export type PaymentProcessor = typeof paymentProcessors.$inferSelect;
export type InsertPaymentProcessor = z.infer<typeof insertPaymentProcessorSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type TerminalDevice = typeof terminalDevices.$inferSelect;
export type InsertTerminalDevice = z.infer<typeof insertTerminalDeviceSchema>;
export type TerminalSession = typeof terminalSessions.$inferSelect;
export type InsertTerminalSession = z.infer<typeof insertTerminalSessionSchema>;
export type RegisteredDevice = typeof registeredDevices.$inferSelect;
export type InsertRegisteredDevice = z.infer<typeof insertRegisteredDeviceSchema>;
export type EmcUser = typeof emcUsers.$inferSelect;
export type InsertEmcUser = z.infer<typeof insertEmcUserSchema>;
export type EmcSession = typeof emcSessions.$inferSelect;
export type InsertEmcSession = z.infer<typeof insertEmcSessionSchema>;
export type Tender = typeof tenders.$inferSelect;
export type InsertTender = z.infer<typeof insertTenderSchema>;
export type Discount = typeof discounts.$inferSelect;
export type InsertDiscount = z.infer<typeof insertDiscountSchema>;
export type ServiceCharge = typeof serviceCharges.$inferSelect;
export type InsertServiceCharge = z.infer<typeof insertServiceChargeSchema>;
export type CheckServiceCharge = typeof checkServiceCharges.$inferSelect;
export type InsertCheckServiceCharge = z.infer<typeof insertCheckServiceChargeSchema>;
export type Check = typeof checks.$inferSelect;
export type InsertCheck = z.infer<typeof insertCheckSchema>;
export type Round = typeof rounds.$inferSelect;
export type InsertRound = z.infer<typeof insertRoundSchema>;
export type CheckLock = typeof checkLocks.$inferSelect;
export type CheckItem = typeof checkItems.$inferSelect;
export type InsertCheckItem = z.infer<typeof insertCheckItemSchema>;
export type CheckPayment = typeof checkPayments.$inferSelect;
export type InsertCheckPayment = z.infer<typeof insertCheckPaymentSchema>;
export type CheckDiscount = typeof checkDiscounts.$inferSelect;
export type InsertCheckDiscount = z.infer<typeof insertCheckDiscountSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type KdsTicket = typeof kdsTickets.$inferSelect;
export type InsertKdsTicket = z.infer<typeof insertKdsTicketSchema>;
export type KdsTicketItem = typeof kdsTicketItems.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type RefundItem = typeof refundItems.$inferSelect;
export type InsertRefundItem = z.infer<typeof insertRefundItemSchema>;
export type RefundPayment = typeof refundPayments.$inferSelect;
export type InsertRefundPayment = z.infer<typeof insertRefundPaymentSchema>;
export type PrintAgent = typeof printAgents.$inferSelect;
export type InsertPrintAgent = z.infer<typeof insertPrintAgentSchema>;
export type PrintJob = typeof printJobs.$inferSelect;
export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;

// Privilege codes as constants
export const PRIVILEGE_CODES = {
  FAST_TRANSACTION: "fast_transaction",
  BEGIN_CHECK_BYPASS: "begin_check_bypass",
  SEND_TO_KITCHEN: "send_to_kitchen",
  VOID_UNSENT: "void_unsent",
  VOID_SENT: "void_sent",
  REOPEN_CHECK: "reopen_check",
  TRANSFER_CHECK: "transfer_check",
  SPLIT_CHECK: "split_check",
  MERGE_CHECK: "merge_check",
  APPLY_DISCOUNT: "apply_discount",
  PRICE_OVERRIDE: "price_override",
  MANAGER_APPROVAL: "manager_approval",
  ADMIN_ACCESS: "admin_access",
  KDS_ACCESS: "kds_access",
  PROCESS_REFUNDS: "process_refunds",
} as const;

export const ORDER_TYPES = ["dine_in", "take_out", "delivery", "pickup"] as const;
export type OrderType = typeof ORDER_TYPES[number];

// ============================================================================
// POS LAYOUTS (SCREEN DESIGNER)
// ============================================================================

export const posLayouts = pgTable("pos_layouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("slu_tabs"), // 'slu_tabs' or 'custom_grid'
  gridRows: integer("grid_rows").default(4),
  gridCols: integer("grid_cols").default(6),
  fontSize: text("font_size").default("medium"), // 'small', 'medium', 'large', 'xlarge'
  isDefault: boolean("is_default").default(false),
  active: boolean("active").default(true),
});

export const posLayoutCells = pgTable("pos_layout_cells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  layoutId: varchar("layout_id").notNull().references(() => posLayouts.id),
  rowIndex: integer("row_index").notNull(),
  colIndex: integer("col_index").notNull(),
  rowSpan: integer("row_span").default(1),
  colSpan: integer("col_span").default(1),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id),
  backgroundColor: text("background_color").default("#3B82F6"),
  textColor: text("text_color").default("#FFFFFF"),
  displayLabel: text("display_label"), // Optional override for button text
});

export const posLayoutCellsRelations = relations(posLayoutCells, ({ one }) => ({
  layout: one(posLayouts, { fields: [posLayoutCells.layoutId], references: [posLayouts.id] }),
  menuItem: one(menuItems, { fields: [posLayoutCells.menuItemId], references: [menuItems.id] }),
}));

// Join table for assigning layouts to multiple RVCs across properties
export const posLayoutRvcAssignments = pgTable("pos_layout_rvc_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  layoutId: varchar("layout_id").notNull().references(() => posLayouts.id, { onDelete: "cascade" }),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").notNull().references(() => rvcs.id),
  isDefault: boolean("is_default").default(false),
});

export const posLayoutsRelations = relations(posLayouts, ({ many }) => ({
  cells: many(posLayoutCells),
  rvcAssignments: many(posLayoutRvcAssignments),
}));

export const posLayoutRvcAssignmentsRelations = relations(posLayoutRvcAssignments, ({ one }) => ({
  layout: one(posLayouts, { fields: [posLayoutRvcAssignments.layoutId], references: [posLayouts.id] }),
  property: one(properties, { fields: [posLayoutRvcAssignments.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [posLayoutRvcAssignments.rvcId], references: [rvcs.id] }),
}));

export const insertPosLayoutSchema = createInsertSchema(posLayouts).omit({ id: true });
export const insertPosLayoutCellSchema = createInsertSchema(posLayoutCells).omit({ id: true });
export const insertPosLayoutRvcAssignmentSchema = createInsertSchema(posLayoutRvcAssignments).omit({ id: true });

export type PosLayout = typeof posLayouts.$inferSelect;
export type InsertPosLayout = z.infer<typeof insertPosLayoutSchema>;
export type PosLayoutCell = typeof posLayoutCells.$inferSelect;
export type InsertPosLayoutCell = z.infer<typeof insertPosLayoutCellSchema>;
export type PosLayoutRvcAssignment = typeof posLayoutRvcAssignments.$inferSelect;
export type InsertPosLayoutRvcAssignment = z.infer<typeof insertPosLayoutRvcAssignmentSchema>;

// Void reason codes
export const VOID_REASONS = [
  { code: "customer_request", label: "Customer Request" },
  { code: "wrong_item", label: "Wrong Item Ordered" },
  { code: "quality_issue", label: "Quality Issue" },
  { code: "out_of_stock", label: "Out of Stock" },
  { code: "duplicate_entry", label: "Duplicate Entry" },
  { code: "manager_comp", label: "Manager Comp" },
  { code: "other", label: "Other" },
] as const;

// ============================================================================
// DEVICE REGISTRY (CAL - Client Application Loader)
// ============================================================================

export const DEVICE_TYPES = ["pos_workstation", "kds_display", "kds_controller", "service_host", "back_office"] as const;
export type DeviceType = typeof DEVICE_TYPES[number];

export const DEVICE_OS_TYPES = ["windows", "android", "linux", "ios"] as const;
export type DeviceOsType = typeof DEVICE_OS_TYPES[number];

export const DEVICE_STATUSES = ["pending", "active", "offline", "maintenance", "decommissioned"] as const;
export type DeviceStatus = typeof DEVICE_STATUSES[number];

export const devices = pgTable("devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  
  // Device identity
  deviceId: text("device_id").notNull().unique(), // UUID from device itself
  name: text("name").notNull(),
  deviceType: text("device_type").notNull(), // pos_workstation, kds_display, kds_controller, service_host, back_office
  
  // Hardware/OS info
  osType: text("os_type"), // windows, android, linux
  osVersion: text("os_version"),
  hardwareModel: text("hardware_model"),
  serialNumber: text("serial_number"),
  ipAddress: text("ip_address"),
  macAddress: text("mac_address"),
  
  // Software version tracking
  currentAppVersion: text("current_app_version"),
  targetAppVersion: text("target_app_version"), // Version it should be updated to
  
  // Status tracking
  status: text("status").notNull().default("pending"), // pending, active, offline, maintenance, decommissioned
  lastSeenAt: timestamp("last_seen_at"),
  enrolledAt: timestamp("enrolled_at"),
  
  // Configuration
  autoUpdate: boolean("auto_update").default(true),
  environment: text("environment").default("production"), // production, staging, lab
  
  // Source configuration tracking (for devices imported from workstations/kds config)
  sourceConfigType: text("source_config_type"), // workstation, kds_device
  sourceConfigId: varchar("source_config_id"),
  
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const devicesRelations = relations(devices, ({ one }) => ({
  enterprise: one(enterprises, { fields: [devices.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [devices.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [devices.rvcId], references: [rvcs.id] }),
}));

// Enrollment tokens for registering new devices
export const deviceEnrollmentTokens = pgTable("device_enrollment_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  
  name: text("name").notNull(), // Descriptive name for the token
  token: text("token").notNull().unique(),
  deviceType: text("device_type"), // Optional: restrict to specific device type
  maxUses: integer("max_uses").default(1),
  usedCount: integer("used_count").default(0),
  expiresAt: timestamp("expires_at"),
  
  createdById: varchar("created_by_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
  active: boolean("active").default(true),
});

export const deviceEnrollmentTokensRelations = relations(deviceEnrollmentTokens, ({ one }) => ({
  enterprise: one(enterprises, { fields: [deviceEnrollmentTokens.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [deviceEnrollmentTokens.propertyId], references: [properties.id] }),
  createdBy: one(employees, { fields: [deviceEnrollmentTokens.createdById], references: [employees.id] }),
}));

// Device activity/heartbeat log
export const deviceHeartbeats = pgTable("device_heartbeats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id").notNull().references(() => devices.id),
  
  appVersion: text("app_version"),
  osVersion: text("os_version"),
  ipAddress: text("ip_address"),
  cpuUsage: decimal("cpu_usage", { precision: 5, scale: 2 }),
  memoryUsage: decimal("memory_usage", { precision: 5, scale: 2 }),
  diskUsage: decimal("disk_usage", { precision: 5, scale: 2 }),
  
  timestamp: timestamp("timestamp").defaultNow(),
});

export const deviceHeartbeatsRelations = relations(deviceHeartbeats, ({ one }) => ({
  device: one(devices, { fields: [deviceHeartbeats.deviceId], references: [devices.id] }),
}));

// Insert schemas
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true, createdAt: true });
export const insertDeviceEnrollmentTokenSchema = createInsertSchema(deviceEnrollmentTokens).omit({ id: true, createdAt: true, usedCount: true });
export const insertDeviceHeartbeatSchema = createInsertSchema(deviceHeartbeats).omit({ id: true, timestamp: true });

// Types
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type DeviceEnrollmentToken = typeof deviceEnrollmentTokens.$inferSelect;
export type InsertDeviceEnrollmentToken = z.infer<typeof insertDeviceEnrollmentTokenSchema>;
export type DeviceHeartbeat = typeof deviceHeartbeats.$inferSelect;
export type InsertDeviceHeartbeat = z.infer<typeof insertDeviceHeartbeatSchema>;

// ============================================================================
// TIME & ATTENDANCE - JOB CODES
// ============================================================================

export const JOB_CODE_TIP_MODES = ["not_eligible", "pooled", "direct", "both"] as const;
export type JobCodeTipMode = typeof JOB_CODE_TIP_MODES[number];

export const COMPENSATION_TYPES = ["hourly", "salaried"] as const;
export type CompensationType = typeof COMPENSATION_TYPES[number];

export const SALARY_PERIODS = ["weekly", "biweekly", "monthly", "annual"] as const;
export type SalaryPeriod = typeof SALARY_PERIODS[number];

export const jobCodes = pgTable("job_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  roleId: varchar("role_id").references(() => roles.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  compensationType: text("compensation_type").default("hourly"), // "hourly" or "salaried"
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  salaryAmount: decimal("salary_amount", { precision: 12, scale: 2 }), // amount per salaryPeriod
  salaryPeriod: text("salary_period"), // "weekly", "biweekly", "monthly", "annual"
  tipMode: text("tip_mode").default("not_eligible"),
  tipPoolWeight: decimal("tip_pool_weight", { precision: 5, scale: 2 }).default("1.00"),
  color: text("color").default("#3B82F6"),
  displayOrder: integer("display_order").default(0),
  active: boolean("active").default(true),
});

export const employeeJobCodes = pgTable("employee_job_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  jobCodeId: varchar("job_code_id").notNull().references(() => jobCodes.id),
  payRate: decimal("pay_rate", { precision: 10, scale: 2 }),
  isPrimary: boolean("is_primary").default(false),
  bypassClockIn: boolean("bypass_clock_in").default(false), // salaried employees can skip clock-in
});

export const jobCodesRelations = relations(jobCodes, ({ one, many }) => ({
  enterprise: one(enterprises, { fields: [jobCodes.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [jobCodes.propertyId], references: [properties.id] }),
  role: one(roles, { fields: [jobCodes.roleId], references: [roles.id] }),
  employeeJobCodes: many(employeeJobCodes),
}));

export const employeeJobCodesRelations = relations(employeeJobCodes, ({ one }) => ({
  employee: one(employees, { fields: [employeeJobCodes.employeeId], references: [employees.id] }),
  jobCode: one(jobCodes, { fields: [employeeJobCodes.jobCodeId], references: [jobCodes.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - PAY PERIODS
// ============================================================================

export const PAY_PERIOD_STATUSES = ["open", "pending_review", "locked", "exported"] as const;
export type PayPeriodStatus = typeof PAY_PERIOD_STATUSES[number];

export const payPeriods = pgTable("pay_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").default("open"),
  lockedAt: timestamp("locked_at"),
  lockedById: varchar("locked_by_id").references(() => employees.id),
  exportedAt: timestamp("exported_at"),
  exportedById: varchar("exported_by_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payPeriodsRelations = relations(payPeriods, ({ one }) => ({
  property: one(properties, { fields: [payPeriods.propertyId], references: [properties.id] }),
  lockedBy: one(employees, { fields: [payPeriods.lockedById], references: [employees.id] }),
  exportedBy: one(employees, { fields: [payPeriods.exportedById], references: [employees.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - TIME PUNCHES
// ============================================================================

export const PUNCH_TYPES = ["clock_in", "clock_out", "break_start", "break_end"] as const;
export type PunchType = typeof PUNCH_TYPES[number];

export const PUNCH_SOURCES = ["pos", "web", "mobile", "manager_edit", "system"] as const;
export type PunchSource = typeof PUNCH_SOURCES[number];

export const timePunches = pgTable("time_punches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  punchType: text("punch_type").notNull(),
  actualTimestamp: timestamp("actual_timestamp").notNull(),
  roundedTimestamp: timestamp("rounded_timestamp"),
  businessDate: text("business_date").notNull(),
  source: text("source").default("pos"),
  notes: text("notes"),
  isEdited: boolean("is_edited").default(false),
  originalTimestamp: timestamp("original_timestamp"),
  editedById: varchar("edited_by_id").references(() => employees.id),
  editedAt: timestamp("edited_at"),
  editReason: text("edit_reason"),
  voided: boolean("voided").default(false),
  voidedById: varchar("voided_by_id").references(() => employees.id),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timePunchesRelations = relations(timePunches, ({ one }) => ({
  property: one(properties, { fields: [timePunches.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [timePunches.employeeId], references: [employees.id] }),
  jobCode: one(jobCodes, { fields: [timePunches.jobCodeId], references: [jobCodes.id] }),
  editedBy: one(employees, { fields: [timePunches.editedById], references: [employees.id] }),
  voidedBy: one(employees, { fields: [timePunches.voidedById], references: [employees.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - BREAK SESSIONS
// ============================================================================

export const BREAK_TYPES = ["paid", "unpaid", "meal", "rest"] as const;
export type BreakType = typeof BREAK_TYPES[number];

export const breakSessions = pgTable("break_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  businessDate: text("business_date").notNull(),
  breakType: text("break_type").default("unpaid"),
  startPunchId: varchar("start_punch_id").references(() => timePunches.id),
  endPunchId: varchar("end_punch_id").references(() => timePunches.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  scheduledMinutes: integer("scheduled_minutes"),
  actualMinutes: integer("actual_minutes"),
  isPaid: boolean("is_paid").default(false),
  isViolation: boolean("is_violation").default(false),
  violationNotes: text("violation_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const breakSessionsRelations = relations(breakSessions, ({ one }) => ({
  property: one(properties, { fields: [breakSessions.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [breakSessions.employeeId], references: [employees.id] }),
  startPunch: one(timePunches, { fields: [breakSessions.startPunchId], references: [timePunches.id] }),
  endPunch: one(timePunches, { fields: [breakSessions.endPunchId], references: [timePunches.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - TIMECARDS
// ============================================================================

export const timecards = pgTable("timecards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  payPeriodId: varchar("pay_period_id").references(() => payPeriods.id),
  businessDate: text("business_date").notNull(),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  payRate: decimal("pay_rate", { precision: 10, scale: 2 }),
  clockInTime: timestamp("clock_in_time"),
  clockOutTime: timestamp("clock_out_time"),
  regularHours: decimal("regular_hours", { precision: 6, scale: 2 }).default("0"),
  overtimeHours: decimal("overtime_hours", { precision: 6, scale: 2 }).default("0"),
  doubleTimeHours: decimal("double_time_hours", { precision: 6, scale: 2 }).default("0"),
  breakMinutes: integer("break_minutes").default(0),
  paidBreakMinutes: integer("paid_break_minutes").default(0),
  unpaidBreakMinutes: integer("unpaid_break_minutes").default(0),
  totalHours: decimal("total_hours", { precision: 6, scale: 2 }).default("0"),
  regularPay: decimal("regular_pay", { precision: 10, scale: 2 }).default("0"),
  overtimePay: decimal("overtime_pay", { precision: 10, scale: 2 }).default("0"),
  totalPay: decimal("total_pay", { precision: 10, scale: 2 }).default("0"),
  tips: decimal("tips", { precision: 10, scale: 2 }).default("0"),
  status: text("status").default("open"),
  approvedById: varchar("approved_by_id").references(() => employees.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timecardsRelations = relations(timecards, ({ one }) => ({
  property: one(properties, { fields: [timecards.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [timecards.employeeId], references: [employees.id] }),
  payPeriod: one(payPeriods, { fields: [timecards.payPeriodId], references: [payPeriods.id] }),
  jobCode: one(jobCodes, { fields: [timecards.jobCodeId], references: [jobCodes.id] }),
  approvedBy: one(employees, { fields: [timecards.approvedById], references: [employees.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - EXCEPTIONS
// ============================================================================

export const EXCEPTION_TYPES = [
  "missed_punch", "late_clock_in", "early_clock_out", "no_show",
  "break_violation", "overtime_risk", "overtime_exceeded", "schedule_deviation"
] as const;
export type ExceptionType = typeof EXCEPTION_TYPES[number];

export const EXCEPTION_STATUSES = ["pending", "acknowledged", "resolved", "dismissed"] as const;
export type ExceptionStatus = typeof EXCEPTION_STATUSES[number];

export const timecardExceptions = pgTable("timecard_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  timecardId: varchar("timecard_id").references(() => timecards.id),
  timePunchId: varchar("time_punch_id").references(() => timePunches.id),
  exceptionType: text("exception_type").notNull(),
  businessDate: text("business_date").notNull(),
  description: text("description"),
  severity: text("severity").default("warning"),
  status: text("status").default("pending"),
  resolvedById: varchar("resolved_by_id").references(() => employees.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timecardExceptionsRelations = relations(timecardExceptions, ({ one }) => ({
  property: one(properties, { fields: [timecardExceptions.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [timecardExceptions.employeeId], references: [employees.id] }),
  timecard: one(timecards, { fields: [timecardExceptions.timecardId], references: [timecards.id] }),
  timePunch: one(timePunches, { fields: [timecardExceptions.timePunchId], references: [timePunches.id] }),
  resolvedBy: one(employees, { fields: [timecardExceptions.resolvedById], references: [employees.id] }),
}));

// ============================================================================
// TIME & ATTENDANCE - AUDIT LOG FOR EDITS
// ============================================================================

export const timecardEdits = pgTable("timecard_edits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  targetType: text("target_type").notNull(),
  targetId: varchar("target_id").notNull(),
  editType: text("edit_type").notNull(),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  reasonCode: text("reason_code"),
  notes: text("notes"),
  // Either employee or EMC user made the edit (one must be set)
  editedById: varchar("edited_by_id").references(() => employees.id),
  editedByEmcUserId: varchar("edited_by_emc_user_id").references(() => emcUsers.id),
  // For audit display purposes (immutable name at time of edit)
  editedByDisplayName: text("edited_by_display_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timecardEditsRelations = relations(timecardEdits, ({ one }) => ({
  property: one(properties, { fields: [timecardEdits.propertyId], references: [properties.id] }),
  editedBy: one(employees, { fields: [timecardEdits.editedById], references: [employees.id] }),
  editedByEmcUser: one(emcUsers, { fields: [timecardEdits.editedByEmcUserId], references: [emcUsers.id] }),
}));

// ============================================================================
// SCHEDULING - AVAILABILITY
// ============================================================================

export const AVAILABILITY_TYPES = ["available", "preferred", "unavailable"] as const;
export type AvailabilityType = typeof AVAILABILITY_TYPES[number];

export const employeeAvailability = pgTable("employee_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  propertyId: varchar("property_id").references(() => properties.id),
  dayOfWeek: integer("day_of_week"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  availabilityType: text("availability_type").default("available"),
  effectiveFrom: text("effective_from"),
  effectiveTo: text("effective_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const availabilityExceptions = pgTable("availability_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  propertyId: varchar("property_id").references(() => properties.id),
  exceptionDate: text("exception_date").notNull(),
  isAvailable: boolean("is_available").default(false),
  startTime: text("start_time"),
  endTime: text("end_time"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const employeeAvailabilityRelations = relations(employeeAvailability, ({ one }) => ({
  employee: one(employees, { fields: [employeeAvailability.employeeId], references: [employees.id] }),
  property: one(properties, { fields: [employeeAvailability.propertyId], references: [properties.id] }),
}));

export const availabilityExceptionsRelations = relations(availabilityExceptions, ({ one }) => ({
  employee: one(employees, { fields: [availabilityExceptions.employeeId], references: [employees.id] }),
  property: one(properties, { fields: [availabilityExceptions.propertyId], references: [properties.id] }),
}));

// ============================================================================
// SCHEDULING - TIME OFF REQUESTS
// ============================================================================

export const TIME_OFF_STATUSES = ["submitted", "approved", "denied", "cancelled"] as const;
export type TimeOffStatus = typeof TIME_OFF_STATUSES[number];

export const timeOffRequests = pgTable("time_off_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  propertyId: varchar("property_id").references(() => properties.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  requestType: text("request_type").default("pto"),
  reasonCode: text("reason_code"),
  notes: text("notes"),
  status: text("status").default("submitted"),
  reviewedById: varchar("reviewed_by_id").references(() => employees.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timeOffRequestsRelations = relations(timeOffRequests, ({ one }) => ({
  employee: one(employees, { fields: [timeOffRequests.employeeId], references: [employees.id] }),
  property: one(properties, { fields: [timeOffRequests.propertyId], references: [properties.id] }),
  reviewedBy: one(employees, { fields: [timeOffRequests.reviewedById], references: [employees.id] }),
}));

// ============================================================================
// SCHEDULING - SHIFTS
// ============================================================================

export const SHIFT_STATUSES = ["draft", "published", "acknowledged", "completed", "cancelled"] as const;
export type ShiftStatus = typeof SHIFT_STATUSES[number];

export const shiftTemplates = pgTable("shift_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  breakMinutes: integer("break_minutes").default(0),
  color: text("color"),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shifts = pgTable("shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  templateId: varchar("template_id").references(() => shiftTemplates.id),
  shiftDate: text("shift_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  scheduledBreakMinutes: integer("scheduled_break_minutes").default(0),
  status: text("status").default("draft"),
  notes: text("notes"),
  publishedAt: timestamp("published_at"),
  publishedById: varchar("published_by_id").references(() => employees.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shiftsRelations = relations(shifts, ({ one }) => ({
  property: one(properties, { fields: [shifts.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [shifts.rvcId], references: [rvcs.id] }),
  employee: one(employees, { fields: [shifts.employeeId], references: [employees.id] }),
  jobCode: one(jobCodes, { fields: [shifts.jobCodeId], references: [jobCodes.id] }),
  template: one(shiftTemplates, { fields: [shifts.templateId], references: [shiftTemplates.id] }),
  publishedBy: one(employees, { fields: [shifts.publishedById], references: [employees.id] }),
}));

export const shiftTemplatesRelations = relations(shiftTemplates, ({ one, many }) => ({
  property: one(properties, { fields: [shiftTemplates.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [shiftTemplates.rvcId], references: [rvcs.id] }),
  jobCode: one(jobCodes, { fields: [shiftTemplates.jobCodeId], references: [jobCodes.id] }),
  shifts: many(shifts),
}));

// ============================================================================
// SCHEDULING - SHIFT COVER/SWAP REQUESTS
// ============================================================================

export const COVER_REQUEST_STATUSES = ["open", "offered", "pending_approval", "approved", "denied", "cancelled", "expired"] as const;
export type CoverRequestStatus = typeof COVER_REQUEST_STATUSES[number];

export const shiftCoverRequests = pgTable("shift_cover_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id),
  requesterId: varchar("requester_id").notNull().references(() => employees.id),
  reason: text("reason"),
  status: text("status").default("open"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shiftCoverOffers = pgTable("shift_cover_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coverRequestId: varchar("cover_request_id").notNull().references(() => shiftCoverRequests.id),
  offererId: varchar("offerer_id").notNull().references(() => employees.id),
  notes: text("notes"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shiftCoverApprovals = pgTable("shift_cover_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coverRequestId: varchar("cover_request_id").notNull().references(() => shiftCoverRequests.id),
  offerId: varchar("offer_id").references(() => shiftCoverOffers.id),
  approvedById: varchar("approved_by_id").notNull().references(() => employees.id),
  approved: boolean("approved").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shiftCoverRequestsRelations = relations(shiftCoverRequests, ({ one, many }) => ({
  shift: one(shifts, { fields: [shiftCoverRequests.shiftId], references: [shifts.id] }),
  requester: one(employees, { fields: [shiftCoverRequests.requesterId], references: [employees.id] }),
  offers: many(shiftCoverOffers),
  approvals: many(shiftCoverApprovals),
}));

export const shiftCoverOffersRelations = relations(shiftCoverOffers, ({ one }) => ({
  coverRequest: one(shiftCoverRequests, { fields: [shiftCoverOffers.coverRequestId], references: [shiftCoverRequests.id] }),
  offerer: one(employees, { fields: [shiftCoverOffers.offererId], references: [employees.id] }),
}));

export const shiftCoverApprovalsRelations = relations(shiftCoverApprovals, ({ one }) => ({
  coverRequest: one(shiftCoverRequests, { fields: [shiftCoverApprovals.coverRequestId], references: [shiftCoverRequests.id] }),
  offer: one(shiftCoverOffers, { fields: [shiftCoverApprovals.offerId], references: [shiftCoverOffers.id] }),
  approvedBy: one(employees, { fields: [shiftCoverApprovals.approvedById], references: [employees.id] }),
}));

// ============================================================================
// TIP POOLING
// ============================================================================

export const TIP_POOL_CALC_METHODS = ["hours_worked", "points", "equal", "custom"] as const;
export type TipPoolCalcMethod = typeof TIP_POOL_CALC_METHODS[number];

export const tipPoolPolicies = pgTable("tip_pool_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull(),
  calculationMethod: text("calculation_method").default("hours_worked"),
  roleWeights: jsonb("role_weights"),
  excludedJobCodeIds: text("excluded_job_code_ids").array(),
  excludeManagers: boolean("exclude_managers").default(true),
  excludeTraining: boolean("exclude_training").default(true),
  minimumHoursRequired: decimal("minimum_hours_required", { precision: 4, scale: 2 }).default("0"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tipPoolRuns = pgTable("tip_pool_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  policyId: varchar("policy_id").references(() => tipPoolPolicies.id),
  businessDate: text("business_date").notNull(),
  totalTips: decimal("total_tips", { precision: 10, scale: 2 }).default("0"),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }).default("0"),
  participantCount: integer("participant_count").default(0),
  status: text("status").default("pending"),
  runById: varchar("run_by_id").references(() => employees.id),
  runAt: timestamp("run_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tipAllocations = pgTable("tip_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tipPoolRunId: varchar("tip_pool_run_id").notNull().references(() => tipPoolRuns.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  hoursWorked: decimal("hours_worked", { precision: 6, scale: 2 }).default("0"),
  pointsEarned: decimal("points_earned", { precision: 6, scale: 2 }).default("0"),
  sharePercentage: decimal("share_percentage", { precision: 5, scale: 2 }).default("0"),
  allocatedAmount: decimal("allocated_amount", { precision: 10, scale: 2 }).default("0"),
  directTips: decimal("direct_tips", { precision: 10, scale: 2 }).default("0"),
  totalTips: decimal("total_tips", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tipPoolPoliciesRelations = relations(tipPoolPolicies, ({ one, many }) => ({
  property: one(properties, { fields: [tipPoolPolicies.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [tipPoolPolicies.rvcId], references: [rvcs.id] }),
  runs: many(tipPoolRuns),
}));

export const tipPoolRunsRelations = relations(tipPoolRuns, ({ one, many }) => ({
  property: one(properties, { fields: [tipPoolRuns.propertyId], references: [properties.id] }),
  policy: one(tipPoolPolicies, { fields: [tipPoolRuns.policyId], references: [tipPoolPolicies.id] }),
  runBy: one(employees, { fields: [tipPoolRuns.runById], references: [employees.id] }),
  allocations: many(tipAllocations),
}));

export const tipAllocationsRelations = relations(tipAllocations, ({ one }) => ({
  tipPoolRun: one(tipPoolRuns, { fields: [tipAllocations.tipPoolRunId], references: [tipPoolRuns.id] }),
  employee: one(employees, { fields: [tipAllocations.employeeId], references: [employees.id] }),
}));

// ============================================================================
// TIP RULES - Square-style tip distribution configuration
// ============================================================================

export const TIP_DISTRIBUTION_METHODS = [
  "tip_directly",           // Tips go to the employee who collected them
  "pool_per_transaction",   // Split equally among clocked-in employees at time of transaction
  "pool_by_hours_worked",   // Split based on hours worked in day/week
  "pool_by_percentages",    // Split by job code percentages
] as const;
export type TipDistributionMethod = typeof TIP_DISTRIBUTION_METHODS[number];

export const TIP_TIMEFRAMES = ["daily", "weekly"] as const;
export type TipTimeframe = typeof TIP_TIMEFRAMES[number];

export const tipRules = pgTable("tip_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  name: text("name").notNull().default("Default Tip Rules"),
  distributionMethod: text("distribution_method").notNull().default("tip_directly"),
  timeframe: text("timeframe").default("daily"), // daily = 24-hour workday, weekly = 7-day workweek
  appliesToAllLocations: boolean("applies_to_all_locations").default(false),
  declareCashTips: boolean("declare_cash_tips").default(false),
  declareCashTipsAllLocations: boolean("declare_cash_tips_all_locations").default(false),
  excludeManagers: boolean("exclude_managers").default(true),
  minimumHoursForPool: decimal("minimum_hours_for_pool", { precision: 4, scale: 2 }).default("0"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tipRuleJobPercentages = pgTable("tip_rule_job_percentages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tipRuleId: varchar("tip_rule_id").notNull().references(() => tipRules.id, { onDelete: "cascade" }),
  jobCodeId: varchar("job_code_id").notNull().references(() => jobCodes.id),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tipRulesRelations = relations(tipRules, ({ one, many }) => ({
  enterprise: one(enterprises, { fields: [tipRules.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [tipRules.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [tipRules.rvcId], references: [rvcs.id] }),
  jobPercentages: many(tipRuleJobPercentages),
}));

export const tipRuleJobPercentagesRelations = relations(tipRuleJobPercentages, ({ one }) => ({
  tipRule: one(tipRules, { fields: [tipRuleJobPercentages.tipRuleId], references: [tipRules.id] }),
  jobCode: one(jobCodes, { fields: [tipRuleJobPercentages.jobCodeId], references: [jobCodes.id] }),
}));

// ============================================================================
// LABOR VS SALES ANALYTICS
// ============================================================================

export const laborSnapshots = pgTable("labor_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  businessDate: text("business_date").notNull(),
  hour: integer("hour"),
  daypart: text("daypart"),
  totalSales: decimal("total_sales", { precision: 12, scale: 2 }).default("0"),
  laborHours: decimal("labor_hours", { precision: 8, scale: 2 }).default("0"),
  laborCost: decimal("labor_cost", { precision: 10, scale: 2 }).default("0"),
  laborPercentage: decimal("labor_percentage", { precision: 5, scale: 2 }).default("0"),
  salesPerLaborHour: decimal("sales_per_labor_hour", { precision: 10, scale: 2 }).default("0"),
  headcount: integer("headcount").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const laborSnapshotsRelations = relations(laborSnapshots, ({ one }) => ({
  property: one(properties, { fields: [laborSnapshots.propertyId], references: [properties.id] }),
  rvc: one(rvcs, { fields: [laborSnapshots.rvcId], references: [rvcs.id] }),
}));

// ============================================================================
// OVERTIME RULES - Property-specific labor law configuration
// ============================================================================

export const overtimeRules = pgTable("overtime_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  description: text("description"),
  dailyRegularHours: decimal("daily_regular_hours", { precision: 4, scale: 2 }).default("8.00"),
  dailyOvertimeThreshold: decimal("daily_overtime_threshold", { precision: 4, scale: 2 }).default("8.00"),
  dailyDoubleTimeThreshold: decimal("daily_double_time_threshold", { precision: 4, scale: 2 }),
  weeklyOvertimeThreshold: decimal("weekly_overtime_threshold", { precision: 4, scale: 2 }).default("40.00"),
  weeklyDoubleTimeThreshold: decimal("weekly_double_time_threshold", { precision: 4, scale: 2 }),
  overtimeMultiplier: decimal("overtime_multiplier", { precision: 3, scale: 2 }).default("1.50"),
  doubleTimeMultiplier: decimal("double_time_multiplier", { precision: 3, scale: 2 }).default("2.00"),
  enableDailyOvertime: boolean("enable_daily_overtime").default(true),
  enableDailyDoubleTime: boolean("enable_daily_double_time").default(false),
  enableWeeklyOvertime: boolean("enable_weekly_overtime").default(true),
  enableWeeklyDoubleTime: boolean("enable_weekly_double_time").default(false),
  weekStartDay: integer("week_start_day").default(0),
  effectiveDate: text("effective_date"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const overtimeRulesRelations = relations(overtimeRules, ({ one }) => ({
  property: one(properties, { fields: [overtimeRules.propertyId], references: [properties.id] }),
}));

// ============================================================================
// CALIFORNIA LABOR COMPLIANCE - Break Rules & Attestations
// ============================================================================

export const breakRules = pgTable("break_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull().default("California Break Rules"),
  stateCode: text("state_code").notNull().default("CA"),
  
  // Meal Break Settings (California: 30-min meal before 5th hour)
  enableMealBreakEnforcement: boolean("enable_meal_break_enforcement").default(true),
  mealBreakMinutes: integer("meal_break_minutes").default(30),
  mealBreakThresholdHours: decimal("meal_break_threshold_hours", { precision: 4, scale: 2 }).default("5.00"),
  secondMealBreakThresholdHours: decimal("second_meal_break_threshold_hours", { precision: 4, scale: 2 }).default("10.00"),
  allowMealBreakWaiver: boolean("allow_meal_break_waiver").default(true),
  mealWaiverMaxShiftHours: decimal("meal_waiver_max_shift_hours", { precision: 4, scale: 2 }).default("6.00"),
  
  // Rest Break Settings (California: 10-min paid rest per 4 hours)
  enableRestBreakEnforcement: boolean("enable_rest_break_enforcement").default(true),
  restBreakMinutes: integer("rest_break_minutes").default(10),
  restBreakIntervalHours: decimal("rest_break_interval_hours", { precision: 4, scale: 2 }).default("4.00"),
  restBreakIsPaid: boolean("rest_break_is_paid").default(true),
  
  // Premium Pay Settings (1 hour pay for each missed break)
  enablePremiumPay: boolean("enable_premium_pay").default(true),
  mealBreakPremiumHours: decimal("meal_break_premium_hours", { precision: 4, scale: 2 }).default("1.00"),
  restBreakPremiumHours: decimal("rest_break_premium_hours", { precision: 4, scale: 2 }).default("1.00"),
  
  // Attestation Settings
  requireClockOutAttestation: boolean("require_clock_out_attestation").default(true),
  attestationMessage: text("attestation_message").default("I confirm that I was provided with all required meal and rest breaks during my shift."),
  
  // Alert Settings
  enableBreakAlerts: boolean("enable_break_alerts").default(true),
  alertMinutesBeforeDeadline: integer("alert_minutes_before_deadline").default(15),
  
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const breakRulesRelations = relations(breakRules, ({ one }) => ({
  property: one(properties, { fields: [breakRules.propertyId], references: [properties.id] }),
}));

export const breakAttestations = pgTable("break_attestations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  timecardId: varchar("timecard_id").references(() => timecards.id),
  businessDate: text("business_date").notNull(),
  
  // Attestation Details
  attestationType: text("attestation_type").notNull().default("clock_out"),
  breaksProvided: boolean("breaks_provided").notNull(),
  missedMealBreak: boolean("missed_meal_break").default(false),
  missedRestBreak: boolean("missed_rest_break").default(false),
  missedBreakReason: text("missed_break_reason"),
  employeeSignature: text("employee_signature"),
  
  // Timestamps
  attestedAt: timestamp("attested_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const breakAttestationsRelations = relations(breakAttestations, ({ one }) => ({
  property: one(properties, { fields: [breakAttestations.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [breakAttestations.employeeId], references: [employees.id] }),
  timecard: one(timecards, { fields: [breakAttestations.timecardId], references: [timecards.id] }),
}));

export const breakViolations = pgTable("break_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  timecardId: varchar("timecard_id").references(() => timecards.id),
  breakSessionId: varchar("break_session_id").references(() => breakSessions.id),
  businessDate: text("business_date").notNull(),
  
  // Violation Details
  violationType: text("violation_type").notNull(),
  violationReason: text("violation_reason"),
  shiftStartTime: timestamp("shift_start_time"),
  shiftEndTime: timestamp("shift_end_time"),
  hoursWorked: decimal("hours_worked", { precision: 6, scale: 2 }),
  breakDeadlineTime: timestamp("break_deadline_time"),
  
  // Premium Pay Calculation
  premiumPayHours: decimal("premium_pay_hours", { precision: 4, scale: 2 }).default("1.00"),
  premiumPayRate: decimal("premium_pay_rate", { precision: 8, scale: 2 }),
  premiumPayAmount: decimal("premium_pay_amount", { precision: 10, scale: 2 }),
  
  // Status
  status: text("status").default("pending"),
  acknowledgedById: varchar("acknowledged_by_id").references(() => employees.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  paidInPayrollDate: text("paid_in_payroll_date"),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const breakViolationsRelations = relations(breakViolations, ({ one }) => ({
  property: one(properties, { fields: [breakViolations.propertyId], references: [properties.id] }),
  employee: one(employees, { fields: [breakViolations.employeeId], references: [employees.id] }),
  timecard: one(timecards, { fields: [breakViolations.timecardId], references: [timecards.id] }),
  breakSession: one(breakSessions, { fields: [breakViolations.breakSessionId], references: [breakSessions.id] }),
  acknowledgedBy: one(employees, { fields: [breakViolations.acknowledgedById], references: [employees.id] }),
}));

export const minorLaborRules = pgTable("minor_labor_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  stateCode: text("state_code").notNull().default("CA"),
  
  // Age Groups
  minorAgeThreshold: integer("minor_age_threshold").default(18),
  youngMinorAgeThreshold: integer("young_minor_age_threshold").default(16),
  
  // Work Hour Restrictions (School in Session)
  schoolDayMaxHours: decimal("school_day_max_hours", { precision: 4, scale: 2 }).default("4.00"),
  schoolWeekMaxHours: decimal("school_week_max_hours", { precision: 4, scale: 2 }).default("18.00"),
  schoolDayStartTime: text("school_day_start_time").default("07:00"),
  schoolDayEndTime: text("school_day_end_time").default("19:00"),
  
  // Work Hour Restrictions (School Not in Session)
  nonSchoolDayMaxHours: decimal("non_school_day_max_hours", { precision: 4, scale: 2 }).default("8.00"),
  nonSchoolWeekMaxHours: decimal("non_school_week_max_hours", { precision: 4, scale: 2 }).default("40.00"),
  nonSchoolDayStartTime: text("non_school_day_start_time").default("07:00"),
  nonSchoolDayEndTime: text("non_school_day_end_time").default("21:00"),
  
  // Work Permit Requirements
  requireWorkPermit: boolean("require_work_permit").default(true),
  workPermitExpirationAlertDays: integer("work_permit_expiration_alert_days").default(30),
  
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const minorLaborRulesRelations = relations(minorLaborRules, ({ one }) => ({
  property: one(properties, { fields: [minorLaborRules.propertyId], references: [properties.id] }),
}));

export const employeeMinorStatus = pgTable("employee_minor_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  dateOfBirth: text("date_of_birth").notNull(),
  isMinor: boolean("is_minor").default(false),
  ageCategory: text("age_category"),
  
  // Work Permit Info
  workPermitNumber: text("work_permit_number"),
  workPermitIssueDate: text("work_permit_issue_date"),
  workPermitExpirationDate: text("work_permit_expiration_date"),
  workPermitDocumentUrl: text("work_permit_document_url"),
  
  // School Info
  currentlyInSchool: boolean("currently_in_school").default(true),
  schoolName: text("school_name"),
  schoolEndDate: text("school_end_date"),
  
  // Restrictions
  maxDailyHours: decimal("max_daily_hours", { precision: 4, scale: 2 }),
  maxWeeklyHours: decimal("max_weekly_hours", { precision: 4, scale: 2 }),
  earliestStartTime: text("earliest_start_time"),
  latestEndTime: text("latest_end_time"),
  
  verifiedById: varchar("verified_by_id").references(() => employees.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const employeeMinorStatusRelations = relations(employeeMinorStatus, ({ one }) => ({
  employee: one(employees, { fields: [employeeMinorStatus.employeeId], references: [employees.id] }),
  verifiedBy: one(employees, { fields: [employeeMinorStatus.verifiedById], references: [employees.id] }),
}));

// ============================================================================
// T&A INSERT SCHEMAS AND TYPES
// ============================================================================

export const insertJobCodeSchema = createInsertSchema(jobCodes).omit({ id: true });
export const insertEmployeeJobCodeSchema = createInsertSchema(employeeJobCodes).omit({ id: true });
export const insertPayPeriodSchema = createInsertSchema(payPeriods).omit({ id: true, createdAt: true });
export const insertTimePunchSchema = createInsertSchema(timePunches).omit({ id: true, createdAt: true });
export const insertBreakSessionSchema = createInsertSchema(breakSessions).omit({ id: true, createdAt: true });
export const insertTimecardSchema = createInsertSchema(timecards).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimecardExceptionSchema = createInsertSchema(timecardExceptions).omit({ id: true, createdAt: true });
export const insertTimecardEditSchema = createInsertSchema(timecardEdits).omit({ id: true, createdAt: true });
export const insertEmployeeAvailabilitySchema = createInsertSchema(employeeAvailability).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAvailabilityExceptionSchema = createInsertSchema(availabilityExceptions).omit({ id: true, createdAt: true });
export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShiftTemplateSchema = createInsertSchema(shiftTemplates).omit({ id: true, createdAt: true });
export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShiftCoverRequestSchema = createInsertSchema(shiftCoverRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShiftCoverOfferSchema = createInsertSchema(shiftCoverOffers).omit({ id: true, createdAt: true });
export const insertShiftCoverApprovalSchema = createInsertSchema(shiftCoverApprovals).omit({ id: true, createdAt: true });
export const insertTipPoolPolicySchema = createInsertSchema(tipPoolPolicies).omit({ id: true, createdAt: true });
export const insertTipPoolRunSchema = createInsertSchema(tipPoolRuns).omit({ id: true, createdAt: true });
export const insertTipAllocationSchema = createInsertSchema(tipAllocations).omit({ id: true, createdAt: true });
export const insertTipRuleSchema = createInsertSchema(tipRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTipRuleJobPercentageSchema = createInsertSchema(tipRuleJobPercentages).omit({ id: true, createdAt: true });
export const insertLaborSnapshotSchema = createInsertSchema(laborSnapshots).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOvertimeRuleSchema = createInsertSchema(overtimeRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBreakRuleSchema = createInsertSchema(breakRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBreakAttestationSchema = createInsertSchema(breakAttestations).omit({ id: true, createdAt: true });
export const insertBreakViolationSchema = createInsertSchema(breakViolations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMinorLaborRuleSchema = createInsertSchema(minorLaborRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeMinorStatusSchema = createInsertSchema(employeeMinorStatus).omit({ id: true, createdAt: true, updatedAt: true });

export type JobCode = typeof jobCodes.$inferSelect;
export type InsertJobCode = z.infer<typeof insertJobCodeSchema>;
export type EmployeeJobCode = typeof employeeJobCodes.$inferSelect;
export type InsertEmployeeJobCode = z.infer<typeof insertEmployeeJobCodeSchema>;
export type PayPeriod = typeof payPeriods.$inferSelect;
export type InsertPayPeriod = z.infer<typeof insertPayPeriodSchema>;
export type TimePunch = typeof timePunches.$inferSelect;
export type InsertTimePunch = z.infer<typeof insertTimePunchSchema>;
export type BreakSession = typeof breakSessions.$inferSelect;
export type InsertBreakSession = z.infer<typeof insertBreakSessionSchema>;
export type Timecard = typeof timecards.$inferSelect;
export type InsertTimecard = z.infer<typeof insertTimecardSchema>;
export type TimecardException = typeof timecardExceptions.$inferSelect;
export type InsertTimecardException = z.infer<typeof insertTimecardExceptionSchema>;
export type TimecardEdit = typeof timecardEdits.$inferSelect;
export type InsertTimecardEdit = z.infer<typeof insertTimecardEditSchema>;
export type EmployeeAvailability = typeof employeeAvailability.$inferSelect;
export type InsertEmployeeAvailability = z.infer<typeof insertEmployeeAvailabilitySchema>;
export type AvailabilityException = typeof availabilityExceptions.$inferSelect;
export type InsertAvailabilityException = z.infer<typeof insertAvailabilityExceptionSchema>;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type InsertShiftTemplate = z.infer<typeof insertShiftTemplateSchema>;
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type ShiftCoverRequest = typeof shiftCoverRequests.$inferSelect;
export type InsertShiftCoverRequest = z.infer<typeof insertShiftCoverRequestSchema>;
export type ShiftCoverOffer = typeof shiftCoverOffers.$inferSelect;
export type InsertShiftCoverOffer = z.infer<typeof insertShiftCoverOfferSchema>;
export type ShiftCoverApproval = typeof shiftCoverApprovals.$inferSelect;
export type InsertShiftCoverApproval = z.infer<typeof insertShiftCoverApprovalSchema>;
export type TipPoolPolicy = typeof tipPoolPolicies.$inferSelect;
export type InsertTipPoolPolicy = z.infer<typeof insertTipPoolPolicySchema>;
export type TipPoolRun = typeof tipPoolRuns.$inferSelect;
export type InsertTipPoolRun = z.infer<typeof insertTipPoolRunSchema>;
export type TipAllocation = typeof tipAllocations.$inferSelect;
export type InsertTipAllocation = z.infer<typeof insertTipAllocationSchema>;
export type TipRule = typeof tipRules.$inferSelect;
export type InsertTipRule = z.infer<typeof insertTipRuleSchema>;
export type TipRuleJobPercentage = typeof tipRuleJobPercentages.$inferSelect;
export type InsertTipRuleJobPercentage = z.infer<typeof insertTipRuleJobPercentageSchema>;
export type LaborSnapshot = typeof laborSnapshots.$inferSelect;
export type InsertLaborSnapshot = z.infer<typeof insertLaborSnapshotSchema>;
export type OvertimeRule = typeof overtimeRules.$inferSelect;
export type InsertOvertimeRule = z.infer<typeof insertOvertimeRuleSchema>;
export type BreakRule = typeof breakRules.$inferSelect;
export type InsertBreakRule = z.infer<typeof insertBreakRuleSchema>;
export type BreakAttestation = typeof breakAttestations.$inferSelect;
export type InsertBreakAttestation = z.infer<typeof insertBreakAttestationSchema>;
export type BreakViolation = typeof breakViolations.$inferSelect;
export type InsertBreakViolation = z.infer<typeof insertBreakViolationSchema>;
export type MinorLaborRule = typeof minorLaborRules.$inferSelect;
export type InsertMinorLaborRule = z.infer<typeof insertMinorLaborRuleSchema>;
export type EmployeeMinorStatus = typeof employeeMinorStatus.$inferSelect;
export type InsertEmployeeMinorStatus = z.infer<typeof insertEmployeeMinorStatusSchema>;

// ============================================================================
// PHASE 1: OFFLINE ORDER QUEUE
// ============================================================================

export const OFFLINE_ORDER_STATUSES = ["pending", "syncing", "synced", "failed", "conflict"] as const;
export type OfflineOrderStatus = typeof OFFLINE_ORDER_STATUSES[number];

export const offlineOrderQueue = pgTable("offline_order_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  localId: text("local_id").notNull(), // Client-generated UUID for deduplication
  orderData: jsonb("order_data").notNull(), // Full check/items payload
  status: text("status").default("pending"),
  syncAttempts: integer("sync_attempts").default(0),
  lastSyncAttempt: timestamp("last_sync_attempt"),
  syncedCheckId: varchar("synced_check_id"), // After successful sync
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  syncedAt: timestamp("synced_at"),
});

export const insertOfflineOrderQueueSchema = createInsertSchema(offlineOrderQueue).omit({ id: true, createdAt: true, syncedAt: true });
export type OfflineOrderQueue = typeof offlineOrderQueue.$inferSelect;
export type InsertOfflineOrderQueue = z.infer<typeof insertOfflineOrderQueueSchema>;

// ============================================================================
// PHASE 2: FISCAL CLOSE / END-OF-DAY
// ============================================================================

export const FISCAL_PERIOD_STATUSES = ["open", "closing", "closed", "reopened"] as const;
export type FiscalPeriodStatus = typeof FISCAL_PERIOD_STATUSES[number];

export const fiscalPeriods = pgTable("fiscal_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  businessDate: text("business_date").notNull(), // YYYY-MM-DD
  status: text("status").default("open"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  closedById: varchar("closed_by_id").references(() => employees.id),
  reopenedAt: timestamp("reopened_at"),
  reopenedById: varchar("reopened_by_id").references(() => employees.id),
  reopenReason: text("reopen_reason"),
  // Financial Totals
  grossSales: decimal("gross_sales", { precision: 12, scale: 2 }).default("0"),
  netSales: decimal("net_sales", { precision: 12, scale: 2 }).default("0"),
  taxCollected: decimal("tax_collected", { precision: 12, scale: 2 }).default("0"),
  discountsTotal: decimal("discounts_total", { precision: 12, scale: 2 }).default("0"),
  refundsTotal: decimal("refunds_total", { precision: 12, scale: 2 }).default("0"),
  tipsTotal: decimal("tips_total", { precision: 12, scale: 2 }).default("0"),
  serviceChargesTotal: decimal("service_charges_total", { precision: 12, scale: 2 }).default("0"),
  checkCount: integer("check_count").default(0),
  guestCount: integer("guest_count").default(0),
  // Cash Reconciliation
  cashExpected: decimal("cash_expected", { precision: 12, scale: 2 }).default("0"),
  cashActual: decimal("cash_actual", { precision: 12, scale: 2 }),
  cashVariance: decimal("cash_variance", { precision: 12, scale: 2 }),
  // Card Totals
  cardTotal: decimal("card_total", { precision: 12, scale: 2 }).default("0"),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const fiscalPeriodsRelations = relations(fiscalPeriods, ({ one }) => ({
  property: one(properties, { fields: [fiscalPeriods.propertyId], references: [properties.id] }),
  closedBy: one(employees, { fields: [fiscalPeriods.closedById], references: [employees.id] }),
  reopenedBy: one(employees, { fields: [fiscalPeriods.reopenedById], references: [employees.id] }),
}));

export const insertFiscalPeriodSchema = createInsertSchema(fiscalPeriods).omit({ id: true, createdAt: true });
export type FiscalPeriod = typeof fiscalPeriods.$inferSelect;
export type InsertFiscalPeriod = z.infer<typeof insertFiscalPeriodSchema>;

// ============================================================================
// PHASE 2: CASH MANAGEMENT
// ============================================================================

export const DRAWER_STATUSES = ["assigned", "active", "counting", "closed"] as const;
export type DrawerStatus = typeof DRAWER_STATUSES[number];

export const cashDrawers = pgTable("cash_drawers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  workstationId: varchar("workstation_id").references(() => workstations.id),
  name: text("name").notNull(),
  active: boolean("active").default(true),
});

export const drawerAssignments = pgTable("drawer_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  drawerId: varchar("drawer_id").notNull().references(() => cashDrawers.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  businessDate: text("business_date").notNull(),
  status: text("status").default("assigned"),
  openingAmount: decimal("opening_amount", { precision: 12, scale: 2 }).notNull(),
  expectedAmount: decimal("expected_amount", { precision: 12, scale: 2 }).default("0"),
  actualAmount: decimal("actual_amount", { precision: 12, scale: 2 }),
  variance: decimal("variance", { precision: 12, scale: 2 }),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  closedById: varchar("closed_by_id").references(() => employees.id),
  notes: text("notes"),
});

export const CASH_TRANSACTION_TYPES = ["sale", "refund", "paid_in", "paid_out", "drop", "pickup"] as const;
export type CashTransactionType = typeof CASH_TRANSACTION_TYPES[number];

export const cashTransactions = pgTable("cash_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  drawerId: varchar("drawer_id").references(() => cashDrawers.id),
  assignmentId: varchar("assignment_id").references(() => drawerAssignments.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  transactionType: text("transaction_type").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  businessDate: text("business_date").notNull(),
  checkId: varchar("check_id").references(() => checks.id),
  reason: text("reason"),
  managerApprovalId: varchar("manager_approval_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const safeCounts = pgTable("safe_counts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  businessDate: text("business_date").notNull(),
  countType: text("count_type").notNull().default("daily"), // opening, mid_day, closing, daily
  expectedAmount: decimal("expected_amount", { precision: 12, scale: 2 }),
  actualAmount: decimal("actual_amount", { precision: 12, scale: 2 }).notNull(),
  variance: decimal("variance", { precision: 12, scale: 2 }),
  // Denomination breakdown
  denominations: jsonb("denominations"), // { "100": 5, "50": 10, ... }
  notes: text("notes"),
  verifiedById: varchar("verified_by_id").references(() => employees.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCashDrawerSchema = createInsertSchema(cashDrawers).omit({ id: true });
export const insertDrawerAssignmentSchema = createInsertSchema(drawerAssignments).omit({ id: true, openedAt: true });
export const insertCashTransactionSchema = createInsertSchema(cashTransactions).omit({ id: true, createdAt: true });
export const insertSafeCountSchema = createInsertSchema(safeCounts).omit({ id: true, createdAt: true });

export type CashDrawer = typeof cashDrawers.$inferSelect;
export type InsertCashDrawer = z.infer<typeof insertCashDrawerSchema>;
export type DrawerAssignment = typeof drawerAssignments.$inferSelect;
export type InsertDrawerAssignment = z.infer<typeof insertDrawerAssignmentSchema>;
export type CashTransaction = typeof cashTransactions.$inferSelect;
export type InsertCashTransaction = z.infer<typeof insertCashTransactionSchema>;
export type SafeCount = typeof safeCounts.$inferSelect;
export type InsertSafeCount = z.infer<typeof insertSafeCountSchema>;

// ============================================================================
// PHASE 2: GIFT CARDS
// ============================================================================

export const GIFT_CARD_STATUSES = ["active", "redeemed", "expired", "cancelled", "suspended"] as const;
export type GiftCardStatus = typeof GIFT_CARD_STATUSES[number];

export const giftCards = pgTable("gift_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  cardNumber: text("card_number").notNull().unique(),
  pin: text("pin"), // Optional PIN for verification
  initialBalance: decimal("initial_balance", { precision: 12, scale: 2 }).notNull(),
  currentBalance: decimal("current_balance", { precision: 12, scale: 2 }).notNull(),
  status: text("status").default("active"),
  activatedAt: timestamp("activated_at"),
  activatedById: varchar("activated_by_id").references(() => employees.id),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  purchaserName: text("purchaser_name"),
  recipientName: text("recipient_name"),
  recipientEmail: text("recipient_email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const GIFT_CARD_TRANSACTION_TYPES = ["activation", "reload", "redemption", "refund", "adjustment", "expiration"] as const;
export type GiftCardTransactionType = typeof GIFT_CARD_TRANSACTION_TYPES[number];

export const giftCardTransactions = pgTable("gift_card_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  giftCardId: varchar("gift_card_id").notNull().references(() => giftCards.id),
  propertyId: varchar("property_id").references(() => properties.id),
  transactionType: text("transaction_type").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 2 }).notNull(),
  checkId: varchar("check_id").references(() => checks.id),
  checkPaymentId: varchar("check_payment_id").references(() => checkPayments.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGiftCardSchema = createInsertSchema(giftCards).omit({ id: true, createdAt: true });
export const insertGiftCardTransactionSchema = createInsertSchema(giftCardTransactions).omit({ id: true, createdAt: true });

export type GiftCard = typeof giftCards.$inferSelect;
export type InsertGiftCard = z.infer<typeof insertGiftCardSchema>;
export type GiftCardTransaction = typeof giftCardTransactions.$inferSelect;
export type InsertGiftCardTransaction = z.infer<typeof insertGiftCardTransactionSchema>;

// ============================================================================
// PHASE 2: ACCOUNTING EXPORT
// ============================================================================

export const EXPORT_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type ExportStatus = typeof EXPORT_STATUSES[number];

export const glMappings = pgTable("gl_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  sourceType: text("source_type").notNull(), // revenue, tax, tender, discount, service_charge, labor
  sourceId: varchar("source_id"), // ID of the source entity (tender, tax group, etc.)
  glAccountCode: text("gl_account_code").notNull(),
  glAccountName: text("gl_account_name"),
  debitCredit: text("debit_credit").default("credit"), // debit or credit
  description: text("description"),
  active: boolean("active").default(true),
});

export const accountingExports = pgTable("accounting_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  exportType: text("export_type").notNull().default("daily"), // daily, weekly, monthly, custom
  formatType: text("format_type").notNull().default("csv"), // csv, qbo, iif, json
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").default("pending"),
  generatedAt: timestamp("generated_at"),
  generatedById: varchar("generated_by_id").references(() => employees.id),
  downloadUrl: text("download_url"),
  errorMessage: text("error_message"),
  // Summary data
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }),
  totalTax: decimal("total_tax", { precision: 12, scale: 2 }),
  totalLabor: decimal("total_labor", { precision: 12, scale: 2 }),
  rowCount: integer("row_count"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGlMappingSchema = createInsertSchema(glMappings).omit({ id: true });
export const insertAccountingExportSchema = createInsertSchema(accountingExports).omit({ id: true, createdAt: true });

export type GlMapping = typeof glMappings.$inferSelect;
export type InsertGlMapping = z.infer<typeof insertGlMappingSchema>;
export type AccountingExport = typeof accountingExports.$inferSelect;
export type InsertAccountingExport = z.infer<typeof insertAccountingExportSchema>;

// ============================================================================
// PHASE 3: LOYALTY PROGRAM
// ============================================================================

export const LOYALTY_PROGRAM_TYPES = ["points", "visits", "spend", "tiered"] as const;
export type LoyaltyProgramType = typeof LOYALTY_PROGRAM_TYPES[number];

export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  name: text("name").notNull(),
  programType: text("program_type").notNull().default("points"),
  // Points earning rules
  pointsPerDollar: decimal("points_per_dollar", { precision: 5, scale: 2 }).default("1"),
  minimumPointsRedeem: integer("minimum_points_redeem").default(100),
  pointsRedemptionValue: decimal("points_redemption_value", { precision: 10, scale: 4 }).default("0.01"), // $ per point
  // Visit-based rules
  visitsForReward: integer("visits_for_reward").default(10),
  // Tier configuration
  tierConfig: jsonb("tier_config"), // { tiers: [{ name: "Gold", threshold: 1000, multiplier: 1.5 }] }
  // Expiration
  pointsExpirationDays: integer("points_expiration_days"), // null = never expires
  // Status
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const MEMBER_STATUSES = ["active", "inactive", "suspended"] as const;
export type MemberStatus = typeof MEMBER_STATUSES[number];

// Customer profile - can be enrolled in multiple loyalty programs
export const loyaltyMembers = pgTable("loyalty_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  memberNumber: text("member_number").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  birthDate: text("birth_date"), // MM-DD format for birthday rewards
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  notes: text("notes"),
});

// Junction table - links members to programs with per-program metrics
export const ENROLLMENT_STATUSES = ["active", "inactive", "suspended"] as const;
export type EnrollmentStatus = typeof ENROLLMENT_STATUSES[number];

export const loyaltyMemberEnrollments = pgTable("loyalty_member_enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => loyaltyMembers.id),
  programId: varchar("program_id").notNull().references(() => loyaltyPrograms.id),
  // Per-program metrics
  currentPoints: integer("current_points").default(0),
  lifetimePoints: integer("lifetime_points").default(0),
  currentTier: text("current_tier").default("standard"),
  visitCount: integer("visit_count").default(0),
  lifetimeSpend: decimal("lifetime_spend", { precision: 12, scale: 2 }).default("0"),
  // Status and dates
  status: text("status").default("active"),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  lastActivityAt: timestamp("last_activity_at"),
  pointsExpirationDate: timestamp("points_expiration_date"),
});

export const LOYALTY_TRANSACTION_TYPES = ["earn", "redeem", "adjust", "expire", "transfer"] as const;
export type LoyaltyTransactionType = typeof LOYALTY_TRANSACTION_TYPES[number];

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => loyaltyMembers.id),
  programId: varchar("program_id").notNull().references(() => loyaltyPrograms.id),
  enrollmentId: varchar("enrollment_id").references(() => loyaltyMemberEnrollments.id),
  propertyId: varchar("property_id").references(() => properties.id),
  transactionType: text("transaction_type").notNull(),
  // For points-based programs
  points: integer("points").default(0), // Positive for earn, negative for redeem
  pointsBefore: integer("points_before").default(0),
  pointsAfter: integer("points_after").default(0),
  // For visit-based programs
  visitIncrement: integer("visit_increment").default(0),
  visitsBefore: integer("visits_before").default(0),
  visitsAfter: integer("visits_after").default(0),
  // Transaction context
  checkId: varchar("check_id").references(() => checks.id),
  checkTotal: decimal("check_total", { precision: 12, scale: 2 }),
  employeeId: varchar("employee_id").references(() => employees.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programId: varchar("program_id").notNull().references(() => loyaltyPrograms.id),
  propertyId: varchar("property_id").references(() => properties.id),
  name: text("name").notNull(),
  description: text("description"),
  rewardType: text("reward_type").notNull().default("discount"), // discount, free_item, points_multiplier
  pointsCost: integer("points_cost").default(0),
  autoAwardAtPoints: integer("auto_award_at_points"), // If set, auto-award when member reaches this threshold
  autoAwardOnce: boolean("auto_award_once").default(true), // Only auto-award once per member
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  freeMenuItemId: varchar("free_menu_item_id").references(() => menuItems.id),
  giftCardAmount: decimal("gift_card_amount", { precision: 10, scale: 2 }), // For gift_card reward type
  minPurchase: decimal("min_purchase", { precision: 10, scale: 2 }),
  maxRedemptions: integer("max_redemptions"), // null = unlimited
  redemptionCount: integer("redemption_count").default(0),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  tierRequired: text("tier_required"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Loyalty Redemptions - tracks when rewards are redeemed at POS
export const loyaltyRedemptions = pgTable("loyalty_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => loyaltyMembers.id),
  rewardId: varchar("reward_id").notNull().references(() => loyaltyRewards.id),
  checkId: varchar("check_id").references(() => checks.id),
  propertyId: varchar("property_id").references(() => properties.id),
  pointsUsed: integer("points_used").default(0),
  discountApplied: decimal("discount_applied", { precision: 10, scale: 2 }),
  status: text("status").default("applied"), // 'applied', 'voided'
  employeeId: varchar("employee_id").references(() => employees.id),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
});

export const insertLoyaltyProgramSchema = createInsertSchema(loyaltyPrograms).omit({ id: true, createdAt: true });
export const insertLoyaltyMemberSchema = createInsertSchema(loyaltyMembers).omit({ id: true, createdAt: true });
export const insertLoyaltyMemberEnrollmentSchema = createInsertSchema(loyaltyMemberEnrollments).omit({ id: true, enrolledAt: true });
export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions).omit({ id: true, createdAt: true });
export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards).omit({ id: true, createdAt: true });
export const insertLoyaltyRedemptionSchema = createInsertSchema(loyaltyRedemptions).omit({ id: true, redeemedAt: true });

export type LoyaltyProgram = typeof loyaltyPrograms.$inferSelect;
export type InsertLoyaltyProgram = z.infer<typeof insertLoyaltyProgramSchema>;
export type LoyaltyMember = typeof loyaltyMembers.$inferSelect;
export type InsertLoyaltyMember = z.infer<typeof insertLoyaltyMemberSchema>;
export type LoyaltyMemberEnrollment = typeof loyaltyMemberEnrollments.$inferSelect;
export type InsertLoyaltyMemberEnrollment = z.infer<typeof insertLoyaltyMemberEnrollmentSchema>;
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type InsertLoyaltyTransaction = z.infer<typeof insertLoyaltyTransactionSchema>;
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;
export type LoyaltyRedemption = typeof loyaltyRedemptions.$inferSelect;
export type InsertLoyaltyRedemption = z.infer<typeof insertLoyaltyRedemptionSchema>;

// Extended type for member with all their enrollments
export type LoyaltyMemberWithEnrollments = LoyaltyMember & {
  enrollments: (LoyaltyMemberEnrollment & { program?: LoyaltyProgram })[];
};

// ============================================================================
// PHASE 3: ONLINE ORDERING INTEGRATION
// ============================================================================

export const ORDER_SOURCES = ["pos", "web", "mobile_app", "doordash", "ubereats", "grubhub", "phone", "catering"] as const;
export type OrderSource = typeof ORDER_SOURCES[number];

export const ONLINE_ORDER_STATUSES = ["received", "confirmed", "preparing", "ready", "picked_up", "delivered", "cancelled", "refunded"] as const;
export type OnlineOrderStatus = typeof ONLINE_ORDER_STATUSES[number];

export const DELIVERY_PLATFORMS = ["ubereats", "grubhub", "doordash", "direct", "other"] as const;
export type DeliveryPlatform = typeof DELIVERY_PLATFORMS[number];

export const MENU_SYNC_STATUSES = ["not_synced", "syncing", "synced", "error"] as const;
export type MenuSyncStatus = typeof MENU_SYNC_STATUSES[number];

export const onlineOrderSources = pgTable("online_order_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull(),
  platform: text("platform").notNull().default("other"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  merchantStoreId: text("merchant_store_id"),
  webhookSecret: text("webhook_secret"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  apiKeyPrefix: text("api_key_prefix"),
  webhookUrl: text("webhook_url"),
  autoAccept: boolean("auto_accept").default(false),
  autoInject: boolean("auto_inject").default(false),
  autoConfirmMinutes: integer("auto_confirm_minutes").default(5),
  defaultPrepMinutes: integer("default_prep_minutes").default(15),
  defaultRvcId: varchar("default_rvc_id").references(() => rvcs.id),
  defaultOrderType: text("default_order_type").default("delivery"),
  menuMappings: jsonb("menu_mappings"),
  menuSyncStatus: text("menu_sync_status").default("not_synced"),
  lastMenuSyncAt: timestamp("last_menu_sync_at"),
  menuSyncError: text("menu_sync_error"),
  commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }),
  connectionStatus: text("connection_status").default("disconnected"),
  lastConnectionTest: timestamp("last_connection_test"),
  soundEnabled: boolean("sound_enabled").default(true),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deliveryPlatformItemMappings = pgTable("delivery_platform_item_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").notNull().references(() => onlineOrderSources.id),
  externalItemId: text("external_item_id").notNull(),
  externalItemName: text("external_item_name"),
  localMenuItemId: varchar("local_menu_item_id").references(() => menuItems.id),
  localMenuItemName: text("local_menu_item_name"),
  externalModifierGroupId: text("external_modifier_group_id"),
  localModifierGroupId: varchar("local_modifier_group_id"),
  externalModifierId: text("external_modifier_id"),
  localModifierId: varchar("local_modifier_id"),
  mappingType: text("mapping_type").notNull().default("menu_item"),
  priceOverride: decimal("price_override", { precision: 10, scale: 2 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const onlineOrders = pgTable("online_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  sourceId: varchar("source_id").references(() => onlineOrderSources.id),
  externalOrderId: text("external_order_id").notNull(), // Order ID from the external system
  status: text("status").default("received"),
  orderType: text("order_type").default("pickup"), // pickup, delivery
  // Customer info
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  deliveryAddress: text("delivery_address"),
  deliveryInstructions: text("delivery_instructions"),
  // Timing
  scheduledTime: timestamp("scheduled_time"), // When customer wants it
  estimatedPrepMinutes: integer("estimated_prep_minutes"),
  confirmedAt: timestamp("confirmed_at"),
  readyAt: timestamp("ready_at"),
  pickedUpAt: timestamp("picked_up_at"),
  deliveredAt: timestamp("delivered_at"),
  // Financials
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  taxTotal: decimal("tax_total", { precision: 12, scale: 2 }).default("0"),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).default("0"),
  serviceFee: decimal("service_fee", { precision: 10, scale: 2 }).default("0"),
  tip: decimal("tip", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  commission: decimal("commission", { precision: 10, scale: 2 }).default("0"),
  // Items as JSON (may differ from local menu structure)
  items: jsonb("items").notNull(),
  // Link to POS check when injected
  checkId: varchar("check_id").references(() => checks.id),
  injectedAt: timestamp("injected_at"),
  injectedById: varchar("injected_by_id").references(() => employees.id),
  // Raw data for debugging
  rawPayload: jsonb("raw_payload"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOnlineOrderSourceSchema = createInsertSchema(onlineOrderSources).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOnlineOrderSchema = createInsertSchema(onlineOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDeliveryPlatformItemMappingSchema = createInsertSchema(deliveryPlatformItemMappings).omit({ id: true, createdAt: true });

export type OnlineOrderSource = typeof onlineOrderSources.$inferSelect;
export type InsertOnlineOrderSource = z.infer<typeof insertOnlineOrderSourceSchema>;
export type OnlineOrder = typeof onlineOrders.$inferSelect;
export type InsertOnlineOrder = z.infer<typeof insertOnlineOrderSchema>;
export type DeliveryPlatformItemMapping = typeof deliveryPlatformItemMappings.$inferSelect;
export type InsertDeliveryPlatformItemMapping = z.infer<typeof insertDeliveryPlatformItemMappingSchema>;

// ============================================================================
// PHASE 3: INVENTORY MANAGEMENT
// ============================================================================

export const INVENTORY_UNIT_TYPES = ["each", "oz", "lb", "kg", "g", "ml", "l", "gal", "qt", "pt", "cup", "tbsp", "tsp"] as const;
export type InventoryUnitType = typeof INVENTORY_UNIT_TYPES[number];

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id), // Link to source menu item if imported
  name: text("name").notNull(),
  sku: text("sku"),
  category: text("category"),
  unitType: text("unit_type").default("each"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 4 }),
  parLevel: decimal("par_level", { precision: 10, scale: 2 }), // Ideal stock level
  reorderPoint: decimal("reorder_point", { precision: 10, scale: 2 }), // When to reorder
  reorderQuantity: decimal("reorder_quantity", { precision: 10, scale: 2 }),
  vendorId: varchar("vendor_id"),
  vendorSku: text("vendor_sku"),
  shelfLifeDays: integer("shelf_life_days"),
  storageLocation: text("storage_location"),
  trackInventory: boolean("track_inventory").default(true),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const inventoryStock = pgTable("inventory_stock", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: varchar("inventory_item_id").notNull().references(() => inventoryItems.id),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  currentQuantity: decimal("current_quantity", { precision: 12, scale: 4 }).default("0"),
  lastCountDate: text("last_count_date"),
  lastCountQuantity: decimal("last_count_quantity", { precision: 12, scale: 4 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const INVENTORY_TRANSACTION_TYPES = ["receive", "sale", "waste", "transfer", "adjustment", "count"] as const;
export type InventoryTransactionType = typeof INVENTORY_TRANSACTION_TYPES[number];

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: varchar("inventory_item_id").notNull().references(() => inventoryItems.id),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  transactionType: text("transaction_type").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(), // Positive for add, negative for remove
  quantityBefore: decimal("quantity_before", { precision: 12, scale: 4 }),
  quantityAfter: decimal("quantity_after", { precision: 12, scale: 4 }),
  unitCost: decimal("unit_cost", { precision: 10, scale: 4 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  businessDate: text("business_date"),
  checkId: varchar("check_id").references(() => checks.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  reason: text("reason"),
  referenceNumber: text("reference_number"), // PO number, invoice number, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Recipe linking (menu item to ingredients)
export const recipes = pgTable("recipes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  inventoryItemId: varchar("inventory_item_id").notNull().references(() => inventoryItems.id),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(), // Amount used per menu item
  unitType: text("unit_type"),
  wastePercent: decimal("waste_percent", { precision: 5, scale: 2 }).default("0"), // Account for prep waste
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true });
export const insertInventoryStockSchema = createInsertSchema(inventoryStock).omit({ id: true, updatedAt: true });
export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions).omit({ id: true, createdAt: true });
export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true });

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryStock = typeof inventoryStock.$inferSelect;
export type InsertInventoryStock = z.infer<typeof insertInventoryStockSchema>;
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;

// ============================================================================
// PHASE 3: LABOR FORECASTING
// ============================================================================

export const salesForecasts = pgTable("sales_forecasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  forecastDate: text("forecast_date").notNull(), // YYYY-MM-DD
  dayOfWeek: integer("day_of_week"), // 0-6
  // Hourly projections
  hourlyProjections: jsonb("hourly_projections"), // { "11": 500, "12": 1200, ... }
  projectedSales: decimal("projected_sales", { precision: 12, scale: 2 }),
  projectedGuests: integer("projected_guests"),
  projectedChecks: integer("projected_checks"),
  // Actual values (filled after day completes)
  actualSales: decimal("actual_sales", { precision: 12, scale: 2 }),
  actualGuests: integer("actual_guests"),
  actualChecks: integer("actual_checks"),
  // Model info
  modelVersion: text("model_version"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const laborForecasts = pgTable("labor_forecasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  forecastDate: text("forecast_date").notNull(),
  jobCodeId: varchar("job_code_id").references(() => jobCodes.id),
  // Hourly labor needs
  hourlyNeeds: jsonb("hourly_needs"), // { "11": 2, "12": 4, ... } (employees needed per hour)
  totalHoursNeeded: decimal("total_hours_needed", { precision: 8, scale: 2 }),
  projectedLaborCost: decimal("projected_labor_cost", { precision: 12, scale: 2 }),
  targetLaborPercent: decimal("target_labor_percent", { precision: 5, scale: 2 }).default("25"),
  // Actual values
  actualHoursWorked: decimal("actual_hours_worked", { precision: 8, scale: 2 }),
  actualLaborCost: decimal("actual_labor_cost", { precision: 12, scale: 2 }),
  actualLaborPercent: decimal("actual_labor_percent", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSalesForecastSchema = createInsertSchema(salesForecasts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLaborForecastSchema = createInsertSchema(laborForecasts).omit({ id: true, createdAt: true, updatedAt: true });

export type SalesForecast = typeof salesForecasts.$inferSelect;
export type InsertSalesForecast = z.infer<typeof insertSalesForecastSchema>;
export type LaborForecast = typeof laborForecasts.$inferSelect;
export type InsertLaborForecast = z.infer<typeof insertLaborForecastSchema>;

// ============================================================================
// QUICK WIN: MANAGER ALERTS
// ============================================================================

export const ALERT_TYPES = ["void", "discount", "refund", "overtime", "exception", "hardware", "inventory", "security", "cash_variance"] as const;
export type AlertType = typeof ALERT_TYPES[number];

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = typeof ALERT_SEVERITIES[number];

export const managerAlerts = pgTable("manager_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  alertType: text("alert_type").notNull(),
  severity: text("severity").default("warning"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  // Context
  employeeId: varchar("employee_id").references(() => employees.id),
  checkId: varchar("check_id").references(() => checks.id),
  targetType: text("target_type"),
  targetId: varchar("target_id"),
  metadata: jsonb("metadata"), // Additional context
  // Status
  read: boolean("read").default(false),
  readAt: timestamp("read_at"),
  readById: varchar("read_by_id").references(() => employees.id),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedById: varchar("acknowledged_by_id").references(() => employees.id),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertSubscriptions = pgTable("alert_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  propertyId: varchar("property_id").references(() => properties.id),
  alertType: text("alert_type").notNull(),
  severity: text("severity"), // null = all severities
  notifyEmail: boolean("notify_email").default(false),
  notifySms: boolean("notify_sms").default(false),
  notifyPush: boolean("notify_push").default(true),
  active: boolean("active").default(true),
});

export const insertManagerAlertSchema = createInsertSchema(managerAlerts).omit({ id: true, createdAt: true });
export const insertAlertSubscriptionSchema = createInsertSchema(alertSubscriptions).omit({ id: true });

export type ManagerAlert = typeof managerAlerts.$inferSelect;
export type InsertManagerAlert = z.infer<typeof insertManagerAlertSchema>;
export type AlertSubscription = typeof alertSubscriptions.$inferSelect;
export type InsertAlertSubscription = z.infer<typeof insertAlertSubscriptionSchema>;

// ============================================================================
// QUICK WIN: PREP COUNTDOWN / ITEM AVAILABILITY
// ============================================================================

export const itemAvailability = pgTable("item_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  businessDate: text("business_date").notNull(),
  // Quantity tracking
  initialQuantity: integer("initial_quantity"), // Set at start of day
  currentQuantity: integer("current_quantity"),
  soldQuantity: integer("sold_quantity").default(0),
  // Status
  isAvailable: boolean("is_available").default(true),
  is86ed: boolean("is_86ed").default(false), // Item has been 86'd (out of stock)
  eightySixedAt: timestamp("eighty_sixed_at"),
  eightySixedById: varchar("eighty_sixed_by_id").references(() => employees.id),
  // Alerts
  lowStockThreshold: integer("low_stock_threshold").default(5),
  alertSent: boolean("alert_sent").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const prepItems = pgTable("prep_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  category: text("category"),
  parLevel: integer("par_level").notNull(),
  currentLevel: integer("current_level").default(0),
  unit: text("unit").default("each"),
  shelfLifeHours: integer("shelf_life_hours"),
  prepInstructions: text("prep_instructions"),
  // Linked menu items that consume this prep item
  menuItemIds: text("menu_item_ids").array(),
  consumptionPerItem: decimal("consumption_per_item", { precision: 5, scale: 2 }).default("1"),
  // Status
  lastPrepAt: timestamp("last_prep_at"),
  lastPrepById: varchar("last_prep_by_id").references(() => employees.id),
  lastPrepQuantity: integer("last_prep_quantity"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertItemAvailabilitySchema = createInsertSchema(itemAvailability).omit({ id: true, updatedAt: true });
export const insertPrepItemSchema = createInsertSchema(prepItems).omit({ id: true, createdAt: true });

export type ItemAvailability = typeof itemAvailability.$inferSelect;
export type InsertItemAvailability = z.infer<typeof insertItemAvailabilitySchema>;
export type PrepItem = typeof prepItems.$inferSelect;
export type InsertPrepItem = z.infer<typeof insertPrepItemSchema>;

// ============================================================================
// GUEST CHECK DESCRIPTORS (Headers & Trailers with Logo Support)
// ============================================================================

export const DESCRIPTOR_SCOPE_TYPES = ["enterprise", "property", "rvc"] as const;
export type DescriptorScopeType = typeof DESCRIPTOR_SCOPE_TYPES[number];

export const descriptorLogoAssets = pgTable("descriptor_logo_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  checksum: text("checksum"),
  escposData: text("escpos_data"),
  createdAt: timestamp("created_at").defaultNow(),
  createdById: varchar("created_by_id"),
});

export const descriptorSets = pgTable("descriptor_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scopeType: text("scope_type").notNull(),
  scopeId: varchar("scope_id").notNull(),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  headerLines: jsonb("header_lines").$type<string[]>().default([]),
  trailerLines: jsonb("trailer_lines").$type<string[]>().default([]),
  logoEnabled: boolean("logo_enabled").default(false),
  logoAssetId: varchar("logo_asset_id").references(() => descriptorLogoAssets.id),
  overrideHeader: boolean("override_header").default(false),
  overrideTrailer: boolean("override_trailer").default(false),
  overrideLogo: boolean("override_logo").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedById: varchar("updated_by_id"),
});

export const insertDescriptorLogoAssetSchema = createInsertSchema(descriptorLogoAssets).omit({ id: true, createdAt: true });
export const insertDescriptorSetSchema = createInsertSchema(descriptorSets).omit({ id: true, updatedAt: true });

export type DescriptorLogoAsset = typeof descriptorLogoAssets.$inferSelect;
export type InsertDescriptorLogoAsset = z.infer<typeof insertDescriptorLogoAssetSchema>;
export type DescriptorSet = typeof descriptorSets.$inferSelect;
export type InsertDescriptorSet = z.infer<typeof insertDescriptorSetSchema>;

// ============================================================================
// V2 PROPERTY SERVICES - DISTRIBUTED SERVICE ARCHITECTURE
// ============================================================================
// Each service (CAPS, Print, KDS, Payment) is a separate entity linked to a host workstation.
// When CAL Wizard runs, it provisions the services hosted by the selected workstation.

export const SERVICE_TYPES = ["caps", "print", "kds", "payment"] as const;
export type ServiceType = typeof SERVICE_TYPES[number];

export const SERVICE_HOST_STATUSES = ["offline", "online", "syncing", "error"] as const;
export type ServiceHostStatus = typeof SERVICE_HOST_STATUSES[number];

export const serviceHosts = pgTable("service_hosts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull().default("caps"), // caps, print, kds, payment
  hostWorkstationId: varchar("host_workstation_id").references(() => workstations.id), // The workstation hosting this service
  workstationId: varchar("workstation_id").references(() => workstations.id), // Legacy: kept for backward compatibility
  status: text("status").default("offline"),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  version: varchar("version", { length: 20 }),
  services: jsonb("services").$type<string[]>().default([]), // Legacy: kept for backward compatibility
  registrationToken: varchar("registration_token", { length: 128 }),
  registrationTokenUsed: boolean("registration_token_used").default(false),
  encryptionKeyHash: varchar("encryption_key_hash", { length: 64 }),
  hostname: text("hostname"),
  ipAddress: text("ip_address"),
  activeChecks: integer("active_checks").default(0),
  pendingTransactions: integer("pending_transactions").default(0),
  localConfigVersion: integer("local_config_version").default(0),
  connectedDeviceIds: jsonb("connected_device_ids").$type<string[]>().default([]),
  // Service-specific configuration
  serviceConfig: jsonb("service_config").$type<{
    // CAPS config
    port?: number;
    dataDir?: string;
    // Print config
    agentId?: string;
    agentToken?: string;
    printerMappings?: Record<string, string>;
    // KDS config
    displayIds?: string[];
    routingRules?: Record<string, string[]>;
    // Payment Controller config (ADDITIVE: enhanced for EMV terminal support)
    gatewayType?: string; // 'heartland_pay_app', 'heartland_opi', 'elavon_fusebox', etc.
    gatewayConfig?: Record<string, string>;
    terminalIds?: string[];
    apiPort?: number; // Payment Controller REST API port (default: 8090)
    callbackUrl?: string; // Cloud POS URL for transaction callbacks
    terminalTimeout?: number; // Seconds to wait for card (default: 120)
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const configVersions = pgTable("config_versions", {
  id: serial("id").primaryKey(),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  version: integer("version").notNull(),
  tableName: varchar("table_name", { length: 50 }).notNull(),
  entityId: varchar("entity_id").notNull(),
  operation: varchar("operation", { length: 10 }).notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const serviceHostTransactions = pgTable("service_host_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceHostId: varchar("service_host_id").notNull().references(() => serviceHosts.id, { onDelete: "cascade" }),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  localId: varchar("local_id").notNull(),
  transactionType: varchar("transaction_type", { length: 50 }).notNull(),
  businessDate: text("business_date").notNull(),
  data: jsonb("data").notNull(),
  processedAt: timestamp("processed_at").defaultNow(),
  cloudEntityId: varchar("cloud_entity_id"),
});

export const insertServiceHostSchema = createInsertSchema(serviceHosts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertConfigVersionSchema = createInsertSchema(configVersions).omit({ id: true, createdAt: true });
export const insertServiceHostTransactionSchema = createInsertSchema(serviceHostTransactions).omit({ id: true, processedAt: true });

export type ServiceHost = typeof serviceHosts.$inferSelect;
export type InsertServiceHost = z.infer<typeof insertServiceHostSchema>;
export type ConfigVersion = typeof configVersions.$inferSelect;
export type InsertConfigVersion = z.infer<typeof insertConfigVersionSchema>;
export type ServiceHostTransaction = typeof serviceHostTransactions.$inferSelect;
export type InsertServiceHostTransaction = z.infer<typeof insertServiceHostTransactionSchema>;

// Service Host Metrics - Heartbeat history for observability dashboard
export const CONNECTION_MODES = ["green", "yellow", "orange", "red"] as const;
export type ConnectionMode = typeof CONNECTION_MODES[number];

export const serviceHostMetrics = pgTable("service_host_metrics", {
  id: serial("id").primaryKey(),
  serviceHostId: varchar("service_host_id").notNull().references(() => serviceHosts.id, { onDelete: "cascade" }),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  connectionMode: text("connection_mode").default("green"),
  connectedWorkstations: integer("connected_workstations").default(0),
  pendingSyncItems: integer("pending_sync_items").default(0),
  cpuUsagePercent: integer("cpu_usage_percent"),
  memoryUsageMB: integer("memory_usage_mb"),
  diskUsagePercent: integer("disk_usage_percent"),
  diskFreeGB: real("disk_free_gb"),
  uptime: integer("uptime"),
});

// Service Host Alerts - Alert rules and triggered alerts
export const SERVICE_HOST_ALERT_TYPES = [
  "service_host_offline",
  "sync_queue_backup",
  "disk_space_low",
  "connection_mode_yellow",
  "connection_mode_orange",
  "connection_mode_red",
  "failed_transaction",
  "high_cpu",
  "high_memory",
] as const;
export type ServiceHostAlertType = typeof SERVICE_HOST_ALERT_TYPES[number];

export const serviceHostAlertRules = pgTable("service_host_alert_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  alertType: text("alert_type").notNull(),
  severity: text("severity").default("warning"),
  enabled: boolean("enabled").default(true),
  thresholdValue: integer("threshold_value"),
  thresholdDurationMinutes: integer("threshold_duration_minutes"),
  notifyEmail: boolean("notify_email").default(true),
  notifySms: boolean("notify_sms").default(false),
  emailRecipients: jsonb("email_recipients").$type<string[]>().default([]),
  smsRecipients: jsonb("sms_recipients").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serviceHostAlerts = pgTable("service_host_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceHostId: varchar("service_host_id").notNull().references(() => serviceHosts.id, { onDelete: "cascade" }),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  alertType: text("alert_type").notNull(),
  severity: text("severity").default("warning"),
  message: text("message").notNull(),
  details: jsonb("details"),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedById: varchar("acknowledged_by_id").references(() => employees.id),
  resolvedAt: timestamp("resolved_at"),
  notificationsSent: boolean("notifications_sent").default(false),
});

export const serviceHostMetricsRelations = relations(serviceHostMetrics, ({ one }) => ({
  serviceHost: one(serviceHosts, { fields: [serviceHostMetrics.serviceHostId], references: [serviceHosts.id] }),
}));

export const serviceHostAlertRulesRelations = relations(serviceHostAlertRules, ({ one }) => ({
  enterprise: one(enterprises, { fields: [serviceHostAlertRules.enterpriseId], references: [enterprises.id] }),
}));

export const serviceHostAlertsRelations = relations(serviceHostAlerts, ({ one }) => ({
  serviceHost: one(serviceHosts, { fields: [serviceHostAlerts.serviceHostId], references: [serviceHosts.id] }),
  property: one(properties, { fields: [serviceHostAlerts.propertyId], references: [properties.id] }),
  acknowledgedBy: one(employees, { fields: [serviceHostAlerts.acknowledgedById], references: [employees.id] }),
}));

export const insertServiceHostMetricsSchema = createInsertSchema(serviceHostMetrics).omit({ id: true });
export const insertServiceHostAlertRuleSchema = createInsertSchema(serviceHostAlertRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceHostAlertSchema = createInsertSchema(serviceHostAlerts).omit({ id: true });

export type ServiceHostMetrics = typeof serviceHostMetrics.$inferSelect;
export type InsertServiceHostMetrics = z.infer<typeof insertServiceHostMetricsSchema>;
export type ServiceHostAlertRule = typeof serviceHostAlertRules.$inferSelect;
export type InsertServiceHostAlertRule = z.infer<typeof insertServiceHostAlertRuleSchema>;
export type ServiceHostAlert = typeof serviceHostAlerts.$inferSelect;
export type InsertServiceHostAlert = z.infer<typeof insertServiceHostAlertSchema>;

// ============================================================================
// WORKSTATION SERVICE BINDINGS - Exclusive service assignment to workstations
// ============================================================================

export const SERVICE_CONTROLLER_TYPES = ["caps", "print_controller", "kds_controller", "payment_controller"] as const;
export type ServiceControllerType = typeof SERVICE_CONTROLLER_TYPES[number];

export const workstationServiceBindings = pgTable("workstation_service_bindings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  workstationId: varchar("workstation_id").notNull().references(() => workstations.id),
  serviceType: text("service_type").notNull(), // caps, print_controller, kds_controller, payment_controller
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Ensure each service type can only be assigned to ONE workstation per property
  sql`CREATE UNIQUE INDEX IF NOT EXISTS wsb_property_service_unique ON workstation_service_bindings (property_id, service_type) WHERE active = true`
]);

export const workstationServiceBindingsRelations = relations(workstationServiceBindings, ({ one }) => ({
  property: one(properties, { fields: [workstationServiceBindings.propertyId], references: [properties.id] }),
  workstation: one(workstations, { fields: [workstationServiceBindings.workstationId], references: [workstations.id] }),
}));

export const insertWorkstationServiceBindingSchema = createInsertSchema(workstationServiceBindings).omit({ id: true, createdAt: true, updatedAt: true });
export type WorkstationServiceBinding = typeof workstationServiceBindings.$inferSelect;
export type InsertWorkstationServiceBinding = z.infer<typeof insertWorkstationServiceBindingSchema>;

// ============================================================================
// CAL PACKAGES - Configuration Application Loader
// ============================================================================

export const CAL_PACKAGE_TYPES = [
  "service_host",
  "service_host_prereqs", 
  "caps",
  "print_controller",
  "kds_controller",
  "kds_handler",
  "kds_client",
  "payment_controller",
  "cal_client",
  "custom"
] as const;
export type CalPackageType = typeof CAL_PACKAGE_TYPES[number];

export const CAL_DEPLOYMENT_ACTIONS = ["install", "update", "remove", "reinstall"] as const;
export type CalDeploymentAction = typeof CAL_DEPLOYMENT_ACTIONS[number];

export const CAL_DEPLOYMENT_STATUSES = ["pending", "scheduled", "downloading", "installing", "completed", "failed", "cancelled"] as const;
export type CalDeploymentStatus = typeof CAL_DEPLOYMENT_STATUSES[number];

export const CAL_DEPLOYMENT_SCOPES = ["enterprise", "property", "workstation"] as const;
export type CalDeploymentScope = typeof CAL_DEPLOYMENT_SCOPES[number];

export const calPackages = pgTable("cal_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  name: text("name").notNull(),
  packageType: text("package_type").notNull(), // service_host, caps, print_controller, etc.
  description: text("description"),
  isSystem: boolean("is_system").default(false), // System packages vs custom
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const calPackageVersions = pgTable("cal_package_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("package_id").notNull().references(() => calPackages.id),
  version: text("version").notNull(), // e.g., "3.3", "3.5", "1.0.0"
  releaseNotes: text("release_notes"),
  downloadUrl: text("download_url"), // URL to package installer/files
  checksum: text("checksum"), // SHA-256 for integrity verification
  fileSize: integer("file_size"), // Size in bytes
  minOsVersion: text("min_os_version"), // Minimum OS version required
  isLatest: boolean("is_latest").default(false),
  active: boolean("active").default(true),
  releasedAt: timestamp("released_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const calPackagePrerequisites = pgTable("cal_package_prerequisites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageVersionId: varchar("package_version_id").notNull().references(() => calPackageVersions.id),
  prerequisitePackageId: varchar("prerequisite_package_id").notNull().references(() => calPackages.id),
  minVersion: text("min_version"), // Minimum required version of prerequisite
  installOrder: integer("install_order").default(0), // Order in which prerequisites should be installed
});

export const calDeployments = pgTable("cal_deployments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  packageVersionId: varchar("package_version_id").notNull().references(() => calPackageVersions.id),
  deploymentScope: text("deployment_scope").notNull(), // enterprise, property, workstation, service_host
  targetPropertyId: varchar("target_property_id").references(() => properties.id), // For property-scoped
  targetWorkstationId: varchar("target_workstation_id").references(() => workstations.id), // For workstation-scoped
  targetServiceHostId: varchar("target_service_host_id").references(() => serviceHosts.id), // For service_host-scoped
  action: text("action").notNull().default("install"), // install, update, remove, reinstall
  scheduledAt: timestamp("scheduled_at"), // When to deploy (null = immediate)
  expiresAt: timestamp("expires_at"), // Deployment expires after this time
  createdById: varchar("created_by_id").references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const calDeploymentTargets = pgTable("cal_deployment_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deploymentId: varchar("deployment_id").notNull().references(() => calDeployments.id),
  propertyId: varchar("property_id").references(() => properties.id), // null if enterprise-wide
  workstationId: varchar("workstation_id").references(() => workstations.id), // null if property-wide
  serviceHostId: varchar("service_host_id").references(() => serviceHosts.id, { onDelete: "cascade" }), // Target service host
  status: text("status").default("pending"), // pending, downloading, installing, completed, failed
  statusMessage: text("status_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  retryCount: integer("retry_count").default(0),
});

export const calPackagesRelations = relations(calPackages, ({ one, many }) => ({
  enterprise: one(enterprises, { fields: [calPackages.enterpriseId], references: [enterprises.id] }),
  versions: many(calPackageVersions),
}));

export const calPackageVersionsRelations = relations(calPackageVersions, ({ one, many }) => ({
  package: one(calPackages, { fields: [calPackageVersions.packageId], references: [calPackages.id] }),
  prerequisites: many(calPackagePrerequisites),
  deployments: many(calDeployments),
}));

export const calPackagePrerequisitesRelations = relations(calPackagePrerequisites, ({ one }) => ({
  packageVersion: one(calPackageVersions, { fields: [calPackagePrerequisites.packageVersionId], references: [calPackageVersions.id] }),
  prerequisitePackage: one(calPackages, { fields: [calPackagePrerequisites.prerequisitePackageId], references: [calPackages.id] }),
}));

export const calDeploymentsRelations = relations(calDeployments, ({ one, many }) => ({
  enterprise: one(enterprises, { fields: [calDeployments.enterpriseId], references: [enterprises.id] }),
  packageVersion: one(calPackageVersions, { fields: [calDeployments.packageVersionId], references: [calPackageVersions.id] }),
  createdBy: one(employees, { fields: [calDeployments.createdById], references: [employees.id] }),
  targets: many(calDeploymentTargets),
}));

export const calDeploymentTargetsRelations = relations(calDeploymentTargets, ({ one }) => ({
  deployment: one(calDeployments, { fields: [calDeploymentTargets.deploymentId], references: [calDeployments.id] }),
  property: one(properties, { fields: [calDeploymentTargets.propertyId], references: [properties.id] }),
  workstation: one(workstations, { fields: [calDeploymentTargets.workstationId], references: [workstations.id] }),
  serviceHost: one(serviceHosts, { fields: [calDeploymentTargets.serviceHostId], references: [serviceHosts.id] }),
}));

export const insertCalPackageSchema = createInsertSchema(calPackages).omit({ id: true, createdAt: true, updatedAt: true });

// CAL Package Version format: X.X.X (Major.Patch.Hotfix)
// - Major: Main product version number
// - Patch: New enhancements/features added
// - Hotfix: Bug fix to the patch
// Similar to Oracle Simphony versioning (e.g., 19.3.1, 19.5.0)
export const CAL_VERSION_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const CAL_VERSION_FORMAT_MESSAGE = "Version must be in X.X.X format (e.g., 1.0.0, 3.5.2)";

export const insertCalPackageVersionSchema = createInsertSchema(calPackageVersions)
  .omit({ id: true, createdAt: true })
  .extend({
    version: z.string().regex(CAL_VERSION_REGEX, CAL_VERSION_FORMAT_MESSAGE),
  });
export const insertCalPackagePrerequisiteSchema = createInsertSchema(calPackagePrerequisites).omit({ id: true });
export const insertCalDeploymentSchema = createInsertSchema(calDeployments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCalDeploymentTargetSchema = createInsertSchema(calDeploymentTargets).omit({ id: true });

export type CalPackage = typeof calPackages.$inferSelect;
export type InsertCalPackage = z.infer<typeof insertCalPackageSchema>;
export type CalPackageVersion = typeof calPackageVersions.$inferSelect;
export type InsertCalPackageVersion = z.infer<typeof insertCalPackageVersionSchema>;
export type CalPackagePrerequisite = typeof calPackagePrerequisites.$inferSelect;
export type InsertCalPackagePrerequisite = z.infer<typeof insertCalPackagePrerequisiteSchema>;
export type CalDeployment = typeof calDeployments.$inferSelect;
export type InsertCalDeployment = z.infer<typeof insertCalDeploymentSchema>;
export type CalDeploymentTarget = typeof calDeploymentTargets.$inferSelect;
export type InsertCalDeploymentTarget = z.infer<typeof insertCalDeploymentTargetSchema>;

export const stressTestResults = pgTable("stress_test_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  rvcId: varchar("rvc_id").references(() => rvcs.id),
  employeeId: varchar("employee_id"),
  status: text("status").notNull(), // 'completed', 'stopped', 'error'
  durationMinutes: integer("duration_minutes").notNull(),
  targetTxPerMinute: integer("target_tx_per_minute").notNull(),
  patterns: text("patterns").array(),
  totalTransactions: integer("total_transactions").default(0),
  successfulTransactions: integer("successful_transactions").default(0),
  failedTransactions: integer("failed_transactions").default(0),
  avgTransactionMs: integer("avg_transaction_ms"),
  minTransactionMs: integer("min_transaction_ms"),
  maxTransactionMs: integer("max_transaction_ms"),
  actualTxPerMinute: numeric("actual_tx_per_minute"),
  elapsedSeconds: integer("elapsed_seconds"),
  errors: text("errors").array(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertStressTestResultSchema = createInsertSchema(stressTestResults).omit({ id: true });
export type StressTestResult = typeof stressTestResults.$inferSelect;
export type InsertStressTestResult = z.infer<typeof insertStressTestResultSchema>;

export const configOverrides = pgTable("config_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(),
  sourceItemId: text("source_item_id").notNull(),
  overrideItemId: text("override_item_id").notNull(),
  overrideLevel: text("override_level").notNull(),
  overrideScopeId: text("override_scope_id").notNull(),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConfigOverrideSchema = createInsertSchema(configOverrides).omit({ id: true, createdAt: true });
export type ConfigOverride = typeof configOverrides.$inferSelect;
export type InsertConfigOverride = z.infer<typeof insertConfigOverrideSchema>;

// ============================================================================
// PAYMENT GATEWAY CONFIGURATION - Hierarchy-aware option-bit settings
// Follows Simphony-class inheritance: Enterprise → Property → Workstation
// ============================================================================

export const PAYMENT_GATEWAY_CONFIG_LEVELS = ["enterprise", "property", "workstation"] as const;
export type PaymentGatewayConfigLevel = (typeof PAYMENT_GATEWAY_CONFIG_LEVELS)[number];

export const paymentGatewayConfig = pgTable("payment_gateway_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configLevel: text("config_level").notNull(),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  propertyId: varchar("property_id").references(() => properties.id),
  workstationId: varchar("workstation_id"),

  gatewayType: text("gateway_type"),
  integrationModel: text("integration_model"),
  environment: text("environment"),
  credentialKeyPrefix: text("credential_key_prefix"),
  merchantId: text("merchant_id"),
  terminalId: text("terminal_id"),
  siteId: text("site_id"),
  deviceId: text("device_id"),
  licenseId: text("license_id"),

  terminalIpAddress: text("terminal_ip_address"),
  terminalPort: text("terminal_port"),
  terminalConnectionType: text("terminal_connection_type"),

  enableSale: boolean("enable_sale").default(false),
  enableVoid: boolean("enable_void").default(false),
  enableRefund: boolean("enable_refund").default(false),
  enableAuthCapture: boolean("enable_auth_capture").default(false),
  enableManualEntry: boolean("enable_manual_entry").default(false),
  enableDebit: boolean("enable_debit").default(false),
  enableEbt: boolean("enable_ebt").default(false),
  enableHealthcare: boolean("enable_healthcare").default(false),
  enableContactless: boolean("enable_contactless").default(false),
  enableEmv: boolean("enable_emv").default(false),
  enableMsr: boolean("enable_msr").default(false),

  enablePartialApproval: boolean("enable_partial_approval").default(false),
  enableTokenization: boolean("enable_tokenization").default(false),
  enableStoreAndForward: boolean("enable_store_and_forward").default(false),
  enableSurcharge: boolean("enable_surcharge").default(false),
  enableTipAdjust: boolean("enable_tip_adjust").default(false),
  enableIncrementalAuth: boolean("enable_incremental_auth").default(false),
  enableCashback: boolean("enable_cashback").default(false),

  surchargePercent: text("surcharge_percent"),
  safFloorLimit: text("saf_floor_limit"),
  safMaxTransactions: integer("saf_max_transactions"),
  authHoldMinutes: integer("auth_hold_minutes"),

  enableAutoBatchClose: boolean("enable_auto_batch_close").default(false),
  batchCloseTime: text("batch_close_time"),
  enableManualBatchClose: boolean("enable_manual_batch_close").default(false),

  receiptShowEmvFields: boolean("receipt_show_emv_fields").default(false),
  receiptShowAid: boolean("receipt_show_aid").default(false),
  receiptShowTvr: boolean("receipt_show_tvr").default(false),
  receiptShowTsi: boolean("receipt_show_tsi").default(false),
  receiptShowAppLabel: boolean("receipt_show_app_label").default(false),
  receiptShowEntryMethod: boolean("receipt_show_entry_method").default(false),
  receiptPrintMerchantCopy: boolean("receipt_print_merchant_copy").default(false),
  receiptPrintCustomerCopy: boolean("receipt_print_customer_copy").default(false),

  encryptedCredentials: text("encrypted_credentials"),

  enableDebugLogging: boolean("enable_debug_logging").default(false),
  logRawRequests: boolean("log_raw_requests").default(false),
  logRawResponses: boolean("log_raw_responses").default(false),

  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const paymentGatewayConfigRelations = relations(paymentGatewayConfig, ({ one }) => ({
  enterprise: one(enterprises, { fields: [paymentGatewayConfig.enterpriseId], references: [enterprises.id] }),
  property: one(properties, { fields: [paymentGatewayConfig.propertyId], references: [properties.id] }),
}));

export const insertPaymentGatewayConfigSchema = createInsertSchema(paymentGatewayConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type PaymentGatewayConfig = typeof paymentGatewayConfig.$inferSelect;
export type InsertPaymentGatewayConfig = z.infer<typeof insertPaymentGatewayConfigSchema>;

// ============================================================================
// IDEMPOTENCY KEYS (Production Hardening)
// ============================================================================

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull(),
  workstationId: varchar("workstation_id").notNull(),
  operation: text("operation").notNull(),
  idempotencyKey: varchar("idempotency_key").notNull(),
  status: text("status").notNull().default("processing"),
  requestHash: text("request_hash"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  uniqueIndex("idx_idempotency_keys_unique").on(table.enterpriseId, table.workstationId, table.operation, table.idempotencyKey),
  index("idx_idempotency_keys_expires_at").on(table.expiresAt),
]);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type InsertIdempotencyKey = typeof idempotencyKeys.$inferInsert;

// ============================================================================
// EMC OPTION FLAGS (Generic OptionBits System)
// ============================================================================

export const emcOptionFlags = pgTable("emc_option_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterprises.id),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  optionKey: text("option_key").notNull(),
  valueText: text("value_text"),
  scopeLevel: text("scope_level").notNull(),
  scopeId: varchar("scope_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_emc_option_flags_unique").on(table.enterpriseId, table.entityType, table.entityId, table.optionKey, table.scopeLevel, table.scopeId),
  index("idx_emc_option_flags_entity").on(table.enterpriseId, table.entityType, table.entityId),
  index("idx_emc_option_flags_key").on(table.enterpriseId, table.optionKey),
]);

export const insertEmcOptionFlagSchema = createInsertSchema(emcOptionFlags).omit({ id: true, createdAt: true, updatedAt: true });
export type EmcOptionFlag = typeof emcOptionFlags.$inferSelect;
export type InsertEmcOptionFlag = z.infer<typeof insertEmcOptionFlagSchema>;

// ============================================================================
// SYNC NOTIFICATIONS
// ============================================================================

export const syncNotifications = pgTable("sync_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  enterpriseId: varchar("enterprise_id").references(() => enterprises.id),
  serviceHostId: varchar("service_host_id").references(() => serviceHosts.id),
  category: text("category").notNull(),
  severity: text("severity").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  read: boolean("read").default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_sync_notifications_property").on(table.propertyId),
  index("idx_sync_notifications_created").on(table.createdAt),
  index("idx_sync_notifications_unread").on(table.propertyId, table.read),
]);

export const insertSyncNotificationSchema = createInsertSchema(syncNotifications).omit({ id: true, createdAt: true });
export type SyncNotification = typeof syncNotifications.$inferSelect;
export type InsertSyncNotification = z.infer<typeof insertSyncNotificationSchema>;

// ============================================================================
// LFS CONFIGURATIONS (per-property Local Failover Server management)
// ============================================================================

export const lfsConfigurations = pgTable("lfs_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  apiKey: text("api_key").notNull(),
  apiKeyMasked: text("api_key_masked").notNull(),
  lfsVersion: text("lfs_version"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncIp: text("last_sync_ip"),
  syncStatus: text("sync_status").default("never_connected"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_lfs_configurations_property").on(table.propertyId),
]);

export const lfsConfigurationsRelations = relations(lfsConfigurations, ({ one }) => ({
  property: one(properties, { fields: [lfsConfigurations.propertyId], references: [properties.id] }),
}));

export const insertLfsConfigurationSchema = createInsertSchema(lfsConfigurations).omit({ id: true, createdAt: true, updatedAt: true });
export type LfsConfiguration = typeof lfsConfigurations.$inferSelect;
export type InsertLfsConfiguration = z.infer<typeof insertLfsConfigurationSchema>;

export const lfsSyncLogs = pgTable("lfs_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  syncType: text("sync_type").notNull(),
  direction: text("direction").notNull(),
  recordCount: integer("record_count").default(0),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  lfsIp: text("lfs_ip"),
  lfsVersion: text("lfs_version"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_lfs_sync_logs_property").on(table.propertyId),
  index("idx_lfs_sync_logs_created").on(table.createdAt),
]);

export const insertLfsSyncLogSchema = createInsertSchema(lfsSyncLogs).omit({ id: true, createdAt: true });
export type LfsSyncLog = typeof lfsSyncLogs.$inferSelect;

export const transactionJournal = pgTable("transaction_journal", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().unique(),
  operationType: text("operation_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  httpMethod: text("http_method").notNull(),
  endpoint: text("endpoint").notNull(),
  payload: jsonb("payload"),
  offlineTransactionId: text("offline_transaction_id"),
  workstationId: varchar("workstation_id"),
  propertyId: varchar("property_id"),
  journalStatus: text("journal_status").default("completed"),
  synced: boolean("synced").default(false),
  syncedAt: timestamp("synced_at"),
  syncError: text("sync_error"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_transaction_journal_synced").on(table.synced),
  index("idx_transaction_journal_entity").on(table.entityType, table.entityId),
  index("idx_transaction_journal_created").on(table.createdAt),
  index("idx_transaction_journal_property").on(table.propertyId),
]);

export const insertTransactionJournalSchema = createInsertSchema(transactionJournal).omit({ id: true, createdAt: true });
export type TransactionJournalEntry = typeof transactionJournal.$inferSelect;
export type InsertTransactionJournalEntry = z.infer<typeof insertTransactionJournalSchema>;

export const lfsSyncStatus = pgTable("lfs_sync_status", {
  tableName: text("table_name").primaryKey(),
  lastSyncedAt: timestamp("last_synced_at"),
  recordCount: integer("record_count").default(0),
});

export const lfsOfflineSequence = pgTable("lfs_offline_sequence", {
  workstationId: varchar("workstation_id").primaryKey(),
  currentNumber: integer("current_number").notNull(),
  rangeStart: integer("range_start").notNull(),
  rangeEnd: integer("range_end").notNull(),
});
export type InsertLfsSyncLog = z.infer<typeof insertLfsSyncLogSchema>;

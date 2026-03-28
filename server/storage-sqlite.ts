import type Database from "better-sqlite3";
import crypto from "crypto";
import { createRequire } from "node:module";
import { getColumnMap, type TableColumnMap } from "./sqlite-init";

export interface TransactionJournalEntry {
  id: string;
  operation_type: string;
  entity_type: string;
  entity_id: string;
  http_method: string;
  endpoint: string;
  payload: Record<string, unknown>;
  offline_transaction_id: string;
  workstation_id: string | null;
  created_at: string;
  synced: number;
  synced_at: string | null;
}

const _require = createRequire(import.meta.url);
const bcrypt = _require("bcryptjs");
import type { IStorage } from "./storage";
import type {
  Enterprise, InsertEnterprise, Property, InsertProperty, Rvc, InsertRvc,
  Role, InsertRole, RoleRules, InsertRoleRules, Privilege, InsertPrivilege,
  Employee, InsertEmployee, EmployeeAssignment, InsertEmployeeAssignment,
  MajorGroup, InsertMajorGroup, FamilyGroup, InsertFamilyGroup,
  Slu, InsertSlu, TaxGroup, InsertTaxGroup, PrintClass, InsertPrintClass,
  Workstation, InsertWorkstation, WorkstationOrderDevice,
  Printer, InsertPrinter, KdsDevice, InsertKdsDevice,
  OrderDevice, InsertOrderDevice, OrderDevicePrinter, InsertOrderDevicePrinter,
  OrderDeviceKds, InsertOrderDeviceKds, PrintClassRouting, InsertPrintClassRouting,
  MenuItem, InsertMenuItem, MenuItemSlu,
  ModifierGroup, InsertModifierGroup, Modifier, InsertModifier,
  ModifierGroupModifier, InsertModifierGroupModifier,
  MenuItemModifierGroup, InsertMenuItemModifierGroup,
  IngredientPrefix, InsertIngredientPrefix,
  MenuItemRecipeIngredient, InsertMenuItemRecipeIngredient,
  Tender, InsertTender, Discount, InsertDiscount,
  ServiceCharge, InsertServiceCharge, CheckServiceCharge, InsertCheckServiceCharge,
  Check, InsertCheck, Round, InsertRound,
  CheckItem, InsertCheckItem, CheckPayment, InsertCheckPayment,
  CheckDiscount, InsertCheckDiscount, CheckLock,
  AuditLog, InsertAuditLog, KdsTicket, InsertKdsTicket, KdsTicketItem,
  PosLayout, InsertPosLayout, PosLayoutCell, InsertPosLayoutCell,
  PosLayoutRvcAssignment, InsertPosLayoutRvcAssignment,
  Device, InsertDevice, DeviceEnrollmentToken, InsertDeviceEnrollmentToken,
  DeviceHeartbeat, InsertDeviceHeartbeat,
  Refund, InsertRefund, RefundItem, InsertRefundItem, RefundPayment, InsertRefundPayment,
  PrintJob, InsertPrintJob, PrintAgent, InsertPrintAgent,
  PaymentProcessor, InsertPaymentProcessor,
  PaymentTransaction, InsertPaymentTransaction,
  PaymentGatewayConfig, InsertPaymentGatewayConfig,
  TerminalDevice, InsertTerminalDevice,
  TerminalSession, InsertTerminalSession,
  RegisteredDevice, InsertRegisteredDevice,
  EmcUser, InsertEmcUser, EmcSession, InsertEmcSession,
  JobCode, InsertJobCode, EmployeeJobCode, InsertEmployeeJobCode,
  PayPeriod, InsertPayPeriod, TimePunch, InsertTimePunch,
  BreakSession, InsertBreakSession, Timecard, InsertTimecard,
  TimecardException, InsertTimecardException, TimecardEdit, InsertTimecardEdit,
  EmployeeAvailability, InsertEmployeeAvailability,
  AvailabilityException, InsertAvailabilityException,
  TimeOffRequest, InsertTimeOffRequest,
  ShiftTemplate, InsertShiftTemplate, Shift, InsertShift,
  ShiftCoverRequest, InsertShiftCoverRequest,
  ShiftCoverOffer, InsertShiftCoverOffer,
  ShiftCoverApproval,
  TipPoolPolicy, InsertTipPoolPolicy,
  TipPoolRun, InsertTipPoolRun,
  TipAllocation, InsertTipAllocation,
  TipRule, InsertTipRule, TipRuleJobPercentage,
  LaborSnapshot, InsertLaborSnapshot,
  OvertimeRule, InsertOvertimeRule,
  BreakRule, InsertBreakRule, BreakAttestation, InsertBreakAttestation,
  BreakViolation, InsertBreakViolation,
  MinorLaborRule, InsertMinorLaborRule,
  EmployeeMinorStatus, InsertEmployeeMinorStatus,
  OfflineOrderQueue, InsertOfflineOrderQueue,
  FiscalPeriod, InsertFiscalPeriod,
  CashDrawer, InsertCashDrawer, DrawerAssignment, InsertDrawerAssignment,
  CashTransaction, InsertCashTransaction, SafeCount, InsertSafeCount,
  GiftCard, InsertGiftCard, GiftCardTransaction, InsertGiftCardTransaction,
  GlMapping, InsertGlMapping, AccountingExport, InsertAccountingExport,
  LoyaltyProgram, InsertLoyaltyProgram,
  LoyaltyMember, InsertLoyaltyMember,
  LoyaltyMemberEnrollment, InsertLoyaltyMemberEnrollment,
  LoyaltyMemberWithEnrollments,
  LoyaltyTransaction, InsertLoyaltyTransaction,
  LoyaltyReward, InsertLoyaltyReward,
  LoyaltyRedemption, InsertLoyaltyRedemption,
  SyncNotification, InsertSyncNotification,
  DescriptorLogoAsset, InsertDescriptorLogoAsset,
  DescriptorSet, InsertDescriptorSet, DescriptorScopeType,
  ServiceHost, InsertServiceHost,
  ConfigVersion, InsertConfigVersion,
  ServiceHostTransaction, InsertServiceHostTransaction,
  ServiceHostMetrics, InsertServiceHostMetrics,
  ServiceHostAlertRule, InsertServiceHostAlertRule,
  ServiceHostAlert, InsertServiceHostAlert,
  WorkstationServiceBinding, InsertWorkstationServiceBinding,
  CalPackage, InsertCalPackage,
  CalPackageVersion, InsertCalPackageVersion,
  CalPackagePrerequisite, InsertCalPackagePrerequisite,
  CalDeployment, InsertCalDeployment,
  CalDeploymentTarget, InsertCalDeploymentTarget,
  EmcOptionFlag, InsertEmcOptionFlag,
  OnlineOrderSource, InsertOnlineOrderSource,
  OnlineOrder, InsertOnlineOrder,
  DeliveryPlatformItemMapping, InsertDeliveryPlatformItemMapping,
  InventoryItem, InsertInventoryItem,
  InventoryStock, InsertInventoryStock,
  InventoryTransaction, InsertInventoryTransaction,
  Recipe, InsertRecipe,
  SalesForecast, InsertSalesForecast,
  LaborForecast, InsertLaborForecast,
  ManagerAlert, InsertManagerAlert,
  AlertSubscription, InsertAlertSubscription,
  ItemAvailability, InsertItemAvailability,
  PrepItem, InsertPrepItem,
} from "@shared/schema";

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function boolToInt(val: any): number | null {
  if (val === null || val === undefined) return null;
  return val ? 1 : 0;
}

function intToBool(val: any): boolean | null {
  if (val === null || val === undefined) return null;
  return val === 1 || val === true;
}

function jsonStringify(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function jsonParse(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

function transformRowForTable(row: any, tableName: string): any {
  if (!row) return row;
  const result = { ...row };
  const colMap = getColumnMap().get(tableName);

  for (const [snakeKey, val] of Object.entries(result)) {
    const meta = colMap?.get(snakeKey);
    if (!meta) continue;

    if (meta.columnType === "PgBoolean" && typeof val === "number") {
      result[snakeKey] = val === 1;
    }
    if ((meta.columnType === "PgJsonb" || meta.isArray) && typeof val === "string") {
      result[snakeKey] = jsonParse(val);
    }
  }
  return result;
}

function prepareInsert(data: Record<string, any>, tableName?: string): { columns: string[]; placeholders: string[]; values: any[] } {
  const columns: string[] = [];
  const placeholders: string[] = [];
  const values: any[] = [];
  const validCols = tableName ? getColumnMap().get(tableName) : undefined;

  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    const colName = camelToSnake(key);
    if (validCols && !validCols.has(colName)) continue;
    columns.push(`"${colName}"`);
    placeholders.push("?");
    values.push(prepareValue(key, val));
  }

  return { columns, placeholders, values };
}

function prepareUpdate(data: Record<string, any>, tableName?: string): { setClauses: string[]; values: any[] } {
  const setClauses: string[] = [];
  const values: any[] = [];
  const validCols = tableName ? getColumnMap().get(tableName) : undefined;

  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    const colName = camelToSnake(key);
    if (validCols && !validCols.has(colName)) continue;
    setClauses.push(`"${colName}" = ?`);
    values.push(prepareValue(key, val));
  }

  return { setClauses, values };
}

function prepareValue(key: string, val: any): any {
  if (val === null) return null;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val) || (typeof val === "object" && val !== null)) return JSON.stringify(val);
  return val;
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformRowFromDb(row: any, tableName?: string): any {
  if (!row) return undefined;
  const transformed = tableName ? transformRowForTable(row, tableName) : row;
  const result: any = {};
  for (const [key, val] of Object.entries(transformed)) {
    result[snakeToCamel(key)] = val;
  }
  return result;
}

function transformRowsFromDb(rows: any[], tableName?: string): any[] {
  return rows.map(r => transformRowFromDb(r, tableName));
}

export class SqliteDatabaseStorage implements IStorage {
  constructor(private db: Database.Database) {}

  private isSerialPk(table: string): boolean {
    const colMap = getColumnMap().get(table);
    if (!colMap) return false;
    const idMeta = colMap.get("id");
    return idMeta?.columnType === "PgSerial";
  }

  private getById<T>(table: string, id: string | number): T | undefined {
    const row = this.db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id);
    return row ? transformRowFromDb(row, table) as T : undefined;
  }

  private getAll<T>(table: string, where?: string, params?: any[]): T[] {
    const sql = where ? `SELECT * FROM "${table}" WHERE ${where}` : `SELECT * FROM "${table}"`;
    const rows = this.db.prepare(sql).all(...(params || []));
    return transformRowsFromDb(rows, table) as T[];
  }

  private insertOne<T>(table: string, data: Record<string, any>): T {
    const serial = this.isSerialPk(table);
    if (!serial && !data.id) data.id = uuid();
    if (serial) delete data.id;
    const { columns, placeholders, values } = prepareInsert(data, table);
    const info = this.db.prepare(`INSERT INTO "${table}" (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`).run(...values);
    const lookupId = serial ? info.lastInsertRowid : data.id;
    return this.getById<T>(table, lookupId as any)!;
  }

  private updateOne<T>(table: string, id: string | number, data: Record<string, any>): T | undefined {
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) return this.getById<T>(table, id);
    const { setClauses, values } = prepareUpdate(filtered, table);
    if (setClauses.length === 0) return this.getById<T>(table, id);
    this.db.prepare(`UPDATE "${table}" SET ${setClauses.join(", ")} WHERE id = ?`).run(...values, id);
    return this.getById<T>(table, id);
  }

  private deleteOne(table: string, id: string | number): boolean {
    const result = this.db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ========================================================================
  // ENTERPRISES
  // ========================================================================
  async getEnterprises(): Promise<Enterprise[]> { return this.getAll("enterprises"); }
  async getEnterprise(id: string): Promise<Enterprise | undefined> { return this.getById("enterprises", id); }
  async createEnterprise(data: InsertEnterprise): Promise<Enterprise> { return this.insertOne("enterprises", { ...data }); }
  async updateEnterprise(id: string, data: Partial<InsertEnterprise>): Promise<Enterprise | undefined> { return this.updateOne("enterprises", id, data); }
  async deleteEnterprise(id: string): Promise<boolean> { return this.deleteOne("enterprises", id); }

  // ========================================================================
  // PROPERTIES
  // ========================================================================
  async getProperties(enterpriseId?: string): Promise<Property[]> {
    if (enterpriseId) return this.getAll("properties", "enterprise_id = ?", [enterpriseId]);
    return this.getAll("properties");
  }
  async getProperty(id: string): Promise<Property | undefined> { return this.getById("properties", id); }
  async createProperty(data: InsertProperty): Promise<Property> { return this.insertOne("properties", { ...data }); }
  async updateProperty(id: string, data: Partial<InsertProperty>): Promise<Property | undefined> { return this.updateOne("properties", id, data); }
  async deleteProperty(id: string): Promise<boolean> { return this.deleteOne("properties", id); }

  // ========================================================================
  // RVCS
  // ========================================================================
  async getRvcs(propertyId?: string): Promise<Rvc[]> {
    if (propertyId) return this.getAll("rvcs", "property_id = ?", [propertyId]);
    return this.getAll("rvcs");
  }
  async getRvc(id: string): Promise<Rvc | undefined> { return this.getById("rvcs", id); }
  async createRvc(data: InsertRvc): Promise<Rvc> { return this.insertOne("rvcs", { ...data }); }
  async updateRvc(id: string, data: Partial<InsertRvc>): Promise<Rvc | undefined> { return this.updateOne("rvcs", id, data); }
  async deleteRvc(id: string): Promise<boolean> { return this.deleteOne("rvcs", id); }

  // ========================================================================
  // ROLES
  // ========================================================================
  async getRoles(): Promise<Role[]> { return this.getAll("roles"); }
  async getRole(id: string): Promise<Role | undefined> { return this.getById("roles", id); }
  async createRole(data: InsertRole): Promise<Role> { return this.insertOne("roles", { ...data }); }
  async updateRole(id: string, data: Partial<InsertRole>): Promise<Role | undefined> { return this.updateOne("roles", id, data); }
  async deleteRole(id: string): Promise<boolean> { return this.deleteOne("roles", id); }

  async getRolePrivileges(roleId: string): Promise<string[]> {
    const rows = this.db.prepare(`SELECT privilege_code FROM "role_privileges" WHERE role_id = ?`).all(roleId) as any[];
    return rows.map(r => r.privilege_code);
  }

  async setRolePrivileges(roleId: string, privilegeCodes: string[]): Promise<void> {
    this.db.prepare(`DELETE FROM "role_privileges" WHERE role_id = ?`).run(roleId);
    const stmt = this.db.prepare(`INSERT INTO "role_privileges" (id, role_id, privilege_code) VALUES (?, ?, ?)`);
    for (const code of privilegeCodes) {
      stmt.run(uuid(), roleId, code);
    }
  }

  async upsertRole(data: InsertRole): Promise<Role> {
    const existing = this.db.prepare(`SELECT * FROM "roles" WHERE code = ? AND enterprise_id = ?`).get(data.code, data.enterpriseId) as any;
    if (existing) return this.updateOne("roles", existing.id, data) as Promise<Role>;
    return this.insertOne("roles", { ...data });
  }

  async getRoleRules(roleId: string): Promise<RoleRules | undefined> {
    const row = this.db.prepare(`SELECT * FROM "role_rules" WHERE role_id = ?`).get(roleId);
    return row ? transformRowFromDb(row, "role_rules") : undefined;
  }

  async upsertRoleRules(data: InsertRoleRules): Promise<RoleRules> {
    const existing = this.db.prepare(`SELECT * FROM "role_rules" WHERE role_id = ?`).get(data.roleId) as any;
    if (existing) return this.updateOne("role_rules", existing.id, data) as Promise<RoleRules>;
    return this.insertOne("role_rules", { ...data });
  }

  // ========================================================================
  // EMPLOYEES
  // ========================================================================
  async getEmployees(): Promise<Employee[]> { return this.getAll("employees"); }
  async getEmployee(id: string): Promise<Employee | undefined> { return this.getById("employees", id); }

  async getEmployeeByPin(pin: string): Promise<Employee | undefined> {
    const emps = this.getAll<Employee>("employees");
    for (const emp of emps) {
      if (bcrypt.compareSync(pin, emp.pinHash)) return emp;
    }
    return undefined;
  }

  async getEmployeeByPinAndEnterprise(pin: string, enterpriseId: string): Promise<Employee | undefined> {
    const emps = this.getAll<Employee>("employees", "enterprise_id = ?", [enterpriseId]);
    for (const emp of emps) {
      if (emp.active !== false && bcrypt.compareSync(pin, emp.pinHash)) return emp;
    }
    return undefined;
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> { return this.insertOne("employees", { ...data }); }
  async updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | undefined> { return this.updateOne("employees", id, data); }
  async deleteEmployee(id: string): Promise<boolean> { return this.deleteOne("employees", id); }

  // ========================================================================
  // EMPLOYEE ASSIGNMENTS
  // ========================================================================
  async getEmployeeAssignments(employeeId: string): Promise<EmployeeAssignment[]> {
    return this.getAll("employee_assignments", "employee_id = ?", [employeeId]);
  }
  async getAllEmployeeAssignments(): Promise<EmployeeAssignment[]> { return this.getAll("employee_assignments"); }
  async setEmployeeAssignments(employeeId: string, propertyIds: string[]): Promise<EmployeeAssignment[]> {
    this.db.prepare(`DELETE FROM "employee_assignments" WHERE employee_id = ?`).run(employeeId);
    const stmt = this.db.prepare(`INSERT INTO "employee_assignments" (id, employee_id, property_id, is_primary) VALUES (?, ?, ?, ?)`);
    for (let i = 0; i < propertyIds.length; i++) {
      stmt.run(uuid(), employeeId, propertyIds[i], i === 0 ? 1 : 0);
    }
    return this.getAll("employee_assignments", "employee_id = ?", [employeeId]);
  }

  // ========================================================================
  // PRIVILEGES
  // ========================================================================
  async getPrivileges(): Promise<Privilege[]> { return this.getAll("privileges"); }
  async createPrivilege(data: InsertPrivilege): Promise<Privilege> { return this.insertOne("privileges", { ...data }); }
  async upsertPrivileges(privileges: InsertPrivilege[]): Promise<void> {
    for (const priv of privileges) {
      const existing = this.db.prepare(`SELECT id FROM "privileges" WHERE code = ?`).get(priv.code) as any;
      if (existing) {
        this.updateOne("privileges", existing.id, priv);
      } else {
        this.insertOne("privileges", { ...priv });
      }
    }
  }

  // ========================================================================
  // MAJOR/FAMILY GROUPS
  // ========================================================================
  async getMajorGroups(): Promise<MajorGroup[]> { return this.getAll("major_groups"); }
  async getMajorGroup(id: string): Promise<MajorGroup | undefined> { return this.getById("major_groups", id); }
  async createMajorGroup(data: InsertMajorGroup): Promise<MajorGroup> { return this.insertOne("major_groups", { ...data }); }
  async updateMajorGroup(id: string, data: Partial<InsertMajorGroup>): Promise<MajorGroup | undefined> { return this.updateOne("major_groups", id, data); }
  async deleteMajorGroup(id: string): Promise<boolean> { return this.deleteOne("major_groups", id); }

  async getFamilyGroups(majorGroupId?: string): Promise<FamilyGroup[]> {
    if (majorGroupId) return this.getAll("family_groups", "major_group_id = ?", [majorGroupId]);
    return this.getAll("family_groups");
  }
  async getFamilyGroup(id: string): Promise<FamilyGroup | undefined> { return this.getById("family_groups", id); }
  async createFamilyGroup(data: InsertFamilyGroup): Promise<FamilyGroup> { return this.insertOne("family_groups", { ...data }); }
  async updateFamilyGroup(id: string, data: Partial<InsertFamilyGroup>): Promise<FamilyGroup | undefined> { return this.updateOne("family_groups", id, data); }
  async deleteFamilyGroup(id: string): Promise<boolean> { return this.deleteOne("family_groups", id); }

  // ========================================================================
  // SLUS
  // ========================================================================
  async getSlus(rvcId?: string): Promise<Slu[]> {
    if (rvcId) return this.getAll("slus", "rvc_id = ?", [rvcId]);
    return this.getAll("slus");
  }
  async getSlu(id: string): Promise<Slu | undefined> { return this.getById("slus", id); }
  async createSlu(data: InsertSlu): Promise<Slu> { return this.insertOne("slus", { ...data }); }
  async updateSlu(id: string, data: Partial<InsertSlu>): Promise<Slu | undefined> { return this.updateOne("slus", id, data); }
  async deleteSlu(id: string): Promise<boolean> { return this.deleteOne("slus", id); }

  async getMenuItemSlus(menuItemId?: string): Promise<MenuItemSlu[]> {
    if (menuItemId) return this.getAll("menu_item_slus", "menu_item_id = ?", [menuItemId]);
    return this.getAll("menu_item_slus");
  }
  async setMenuItemSlus(menuItemId: string, sluIds: string[]): Promise<void> {
    this.db.prepare(`DELETE FROM "menu_item_slus" WHERE menu_item_id = ?`).run(menuItemId);
    const stmt = this.db.prepare(`INSERT INTO "menu_item_slus" (id, menu_item_id, slu_id, display_order) VALUES (?, ?, ?, ?)`);
    sluIds.forEach((sluId, i) => stmt.run(uuid(), menuItemId, sluId, i));
  }

  // ========================================================================
  // TAX GROUPS
  // ========================================================================
  async getTaxGroups(): Promise<TaxGroup[]> { return this.getAll("tax_groups"); }
  async getTaxGroup(id: string): Promise<TaxGroup | undefined> { return this.getById("tax_groups", id); }
  async createTaxGroup(data: InsertTaxGroup): Promise<TaxGroup> { return this.insertOne("tax_groups", { ...data }); }
  async updateTaxGroup(id: string, data: Partial<InsertTaxGroup>): Promise<TaxGroup | undefined> { return this.updateOne("tax_groups", id, data); }
  async deleteTaxGroup(id: string): Promise<boolean> { return this.deleteOne("tax_groups", id); }

  // ========================================================================
  // PRINT CLASSES
  // ========================================================================
  async getPrintClasses(): Promise<PrintClass[]> { return this.getAll("print_classes"); }
  async getPrintClass(id: string): Promise<PrintClass | undefined> { return this.getById("print_classes", id); }
  async createPrintClass(data: InsertPrintClass): Promise<PrintClass> { return this.insertOne("print_classes", { ...data }); }
  async updatePrintClass(id: string, data: Partial<InsertPrintClass>): Promise<PrintClass | undefined> { return this.updateOne("print_classes", id, data); }
  async deletePrintClass(id: string): Promise<boolean> { return this.deleteOne("print_classes", id); }

  // ========================================================================
  // WORKSTATIONS
  // ========================================================================
  async getWorkstations(propertyId?: string): Promise<Workstation[]> {
    if (propertyId) return this.getAll("workstations", "property_id = ?", [propertyId]);
    return this.getAll("workstations");
  }
  async getWorkstation(id: string): Promise<Workstation | undefined> { return this.getById("workstations", id); }
  async createWorkstation(data: InsertWorkstation): Promise<Workstation> { return this.insertOne("workstations", { ...data }); }
  async updateWorkstation(id: string, data: Partial<InsertWorkstation>): Promise<Workstation | undefined> { return this.updateOne("workstations", id, data); }
  async deleteWorkstation(id: string): Promise<boolean> { return this.deleteOne("workstations", id); }

  async getWorkstationOrderDevices(workstationId: string): Promise<WorkstationOrderDevice[]> {
    return this.getAll("workstation_order_devices", "workstation_id = ?", [workstationId]);
  }
  async setWorkstationOrderDevices(workstationId: string, orderDeviceIds: string[]): Promise<WorkstationOrderDevice[]> {
    this.db.prepare(`DELETE FROM "workstation_order_devices" WHERE workstation_id = ?`).run(workstationId);
    const stmt = this.db.prepare(`INSERT INTO "workstation_order_devices" (id, workstation_id, order_device_id) VALUES (?, ?, ?)`);
    for (const odId of orderDeviceIds) { stmt.run(uuid(), workstationId, odId); }
    return this.getAll("workstation_order_devices", "workstation_id = ?", [workstationId]);
  }

  // ========================================================================
  // PRINTERS
  // ========================================================================
  async getPrinters(propertyId?: string): Promise<Printer[]> {
    if (propertyId) return this.getAll("printers", "property_id = ?", [propertyId]);
    return this.getAll("printers");
  }
  async getPrinter(id: string): Promise<Printer | undefined> { return this.getById("printers", id); }
  async createPrinter(data: InsertPrinter): Promise<Printer> { return this.insertOne("printers", { ...data }); }
  async updatePrinter(id: string, data: Partial<InsertPrinter>): Promise<Printer | undefined> { return this.updateOne("printers", id, data); }
  async deletePrinter(id: string): Promise<boolean> { return this.deleteOne("printers", id); }

  // ========================================================================
  // KDS DEVICES
  // ========================================================================
  async getKdsDevices(propertyId?: string): Promise<KdsDevice[]> {
    if (propertyId) return this.getAll("kds_devices", "property_id = ?", [propertyId]);
    return this.getAll("kds_devices");
  }
  async getKdsDevice(id: string): Promise<KdsDevice | undefined> { return this.getById("kds_devices", id); }
  async createKdsDevice(data: InsertKdsDevice): Promise<KdsDevice> { return this.insertOne("kds_devices", { ...data }); }
  async updateKdsDevice(id: string, data: Partial<InsertKdsDevice>): Promise<KdsDevice | undefined> { return this.updateOne("kds_devices", id, data); }
  async deleteKdsDevice(id: string): Promise<boolean> { return this.deleteOne("kds_devices", id); }

  // ========================================================================
  // ORDER DEVICES
  // ========================================================================
  async getOrderDevices(propertyId?: string): Promise<OrderDevice[]> {
    if (propertyId) return this.getAll("order_devices", "property_id = ?", [propertyId]);
    return this.getAll("order_devices");
  }
  async getOrderDevice(id: string): Promise<OrderDevice | undefined> { return this.getById("order_devices", id); }
  async createOrderDevice(data: InsertOrderDevice): Promise<OrderDevice> { return this.insertOne("order_devices", { ...data }); }
  async updateOrderDevice(id: string, data: Partial<InsertOrderDevice>): Promise<OrderDevice | undefined> { return this.updateOne("order_devices", id, data); }
  async deleteOrderDevice(id: string): Promise<boolean> { return this.deleteOne("order_devices", id); }

  // Order Device Linkages
  async getOrderDevicePrinters(orderDeviceId?: string): Promise<OrderDevicePrinter[]> {
    if (orderDeviceId) return this.getAll("order_device_printers", "order_device_id = ?", [orderDeviceId]);
    return this.getAll("order_device_printers");
  }
  async linkPrinterToOrderDevice(data: InsertOrderDevicePrinter): Promise<OrderDevicePrinter> { return this.insertOne("order_device_printers", { ...data }); }
  async unlinkPrinterFromOrderDevice(id: string): Promise<boolean> { return this.deleteOne("order_device_printers", id); }

  async getOrderDeviceKdsList(orderDeviceId?: string): Promise<OrderDeviceKds[]> {
    if (orderDeviceId) return this.getAll("order_device_kds", "order_device_id = ?", [orderDeviceId]);
    return this.getAll("order_device_kds");
  }
  async linkKdsToOrderDevice(data: InsertOrderDeviceKds): Promise<OrderDeviceKds> { return this.insertOne("order_device_kds", { ...data }); }
  async unlinkKdsFromOrderDevice(id: string): Promise<boolean> { return this.deleteOne("order_device_kds", id); }

  // ========================================================================
  // PRINT CLASS ROUTING
  // ========================================================================
  async getAllPrintClassRoutings(): Promise<PrintClassRouting[]> { return this.getAll("print_class_routing"); }
  async getPrintClassRouting(printClassId?: string, propertyId?: string, rvcId?: string): Promise<PrintClassRouting[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    if (printClassId) { conditions.push("print_class_id = ?"); params.push(printClassId); }
    if (propertyId) { conditions.push("property_id = ?"); params.push(propertyId); }
    if (rvcId) { conditions.push("rvc_id = ?"); params.push(rvcId); }
    return this.getAll("print_class_routing", conditions.length ? conditions.join(" AND ") : undefined, params);
  }
  async createPrintClassRouting(data: InsertPrintClassRouting): Promise<PrintClassRouting> { return this.insertOne("print_class_routing", { ...data }); }
  async deletePrintClassRouting(id: string): Promise<boolean> { return this.deleteOne("print_class_routing", id); }

  async resolveDevicesForMenuItem(menuItemId: string, rvcId: string): Promise<{ printers: Printer[]; kdsDevices: KdsDevice[] }> {
    const menuItem = await this.getMenuItem(menuItemId);
    if (!menuItem?.printClassId) return { printers: [], kdsDevices: [] };
    const routings = await this.getPrintClassRouting(menuItem.printClassId, undefined, rvcId);
    const printersList: Printer[] = [];
    const kdsList: KdsDevice[] = [];
    for (const routing of routings) {
      const odPrinters = await this.getOrderDevicePrinters(routing.orderDeviceId);
      for (const odp of odPrinters) {
        const printer = await this.getPrinter(odp.printerId);
        if (printer && !printersList.find(p => p.id === printer.id)) printersList.push(printer);
      }
      const odKds = await this.getOrderDeviceKdsList(routing.orderDeviceId);
      for (const odk of odKds) {
        const kds = await this.getKdsDevice(odk.kdsDeviceId);
        if (kds && !kdsList.find(k => k.id === kds.id)) kdsList.push(kds);
      }
    }
    return { printers: printersList, kdsDevices: kdsList };
  }

  // ========================================================================
  // MENU ITEMS
  // ========================================================================
  async getMenuItems(sluId?: string): Promise<MenuItem[]> {
    if (sluId) {
      const links = this.getAll<MenuItemSlu>("menu_item_slus", "slu_id = ?", [sluId]);
      const ids = links.map(l => l.menuItemId);
      if (!ids.length) return [];
      return this.getAll("menu_items", `id IN (${ids.map(() => "?").join(",")})`, ids);
    }
    return this.getAll("menu_items");
  }
  async getMenuItem(id: string): Promise<MenuItem | undefined> { return this.getById("menu_items", id); }
  async createMenuItem(data: InsertMenuItem): Promise<MenuItem> { return this.insertOne("menu_items", { ...data }); }
  async updateMenuItem(id: string, data: Partial<InsertMenuItem>): Promise<MenuItem | undefined> { return this.updateOne("menu_items", id, data); }
  async deleteMenuItem(id: string): Promise<boolean> { return this.deleteOne("menu_items", id); }

  // ========================================================================
  // MODIFIERS
  // ========================================================================
  async getModifiers(): Promise<Modifier[]> { return this.getAll("modifiers"); }
  async getModifier(id: string): Promise<Modifier | undefined> { return this.getById("modifiers", id); }
  async createModifier(data: InsertModifier): Promise<Modifier> { return this.insertOne("modifiers", { ...data }); }
  async updateModifier(id: string, data: Partial<InsertModifier>): Promise<Modifier | undefined> { return this.updateOne("modifiers", id, data); }
  async deleteModifier(id: string): Promise<boolean> { return this.deleteOne("modifiers", id); }

  // ========================================================================
  // MODIFIER GROUPS
  // ========================================================================
  async getModifierGroups(menuItemId?: string): Promise<(ModifierGroup & { modifiers: (Modifier & { isDefault: boolean; displayOrder: number })[] })[]> {
    let groups: ModifierGroup[];
    if (menuItemId) {
      const links = this.getAll<MenuItemModifierGroup>("menu_item_modifier_groups", "menu_item_id = ?", [menuItemId]);
      const groupIds = links.map(l => l.modifierGroupId);
      if (!groupIds.length) return [];
      groups = this.getAll("modifier_groups", `id IN (${groupIds.map(() => "?").join(",")})`, groupIds);
    } else {
      groups = this.getAll("modifier_groups");
    }
    return groups.map(g => {
      const mgms = this.getAll<any>("modifier_group_modifiers", "modifier_group_id = ?", [g.id]);
      const mods = mgms.map(mgm => {
        const mod = this.getById<Modifier>("modifiers", mgm.modifierId);
        return mod ? { ...mod, isDefault: mgm.isDefault || false, displayOrder: mgm.displayOrder || 0 } : null;
      }).filter(Boolean) as (Modifier & { isDefault: boolean; displayOrder: number })[];
      return { ...g, modifiers: mods };
    });
  }
  async getModifierGroup(id: string): Promise<ModifierGroup | undefined> { return this.getById("modifier_groups", id); }
  async createModifierGroup(data: InsertModifierGroup): Promise<ModifierGroup> { return this.insertOne("modifier_groups", { ...data }); }
  async updateModifierGroup(id: string, data: Partial<InsertModifierGroup>): Promise<ModifierGroup | undefined> { return this.updateOne("modifier_groups", id, data); }
  async deleteModifierGroup(id: string): Promise<boolean> { return this.deleteOne("modifier_groups", id); }

  async getModifierGroupModifiers(modifierGroupId?: string): Promise<ModifierGroupModifier[]> {
    if (modifierGroupId) return this.getAll("modifier_group_modifiers", "modifier_group_id = ?", [modifierGroupId]);
    return this.getAll("modifier_group_modifiers");
  }
  async linkModifierToGroup(data: InsertModifierGroupModifier): Promise<ModifierGroupModifier> { return this.insertOne("modifier_group_modifiers", { ...data }); }
  async unlinkModifierFromGroup(modifierGroupId: string, modifierId: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM "modifier_group_modifiers" WHERE modifier_group_id = ? AND modifier_id = ?`).run(modifierGroupId, modifierId);
    return result.changes > 0;
  }
  async updateModifierGroupModifier(id: string, data: Partial<InsertModifierGroupModifier>): Promise<ModifierGroupModifier | undefined> {
    return this.updateOne("modifier_group_modifiers", id, data);
  }

  async getMenuItemModifierGroups(menuItemId?: string): Promise<MenuItemModifierGroup[]> {
    if (menuItemId) return this.getAll("menu_item_modifier_groups", "menu_item_id = ?", [menuItemId]);
    return this.getAll("menu_item_modifier_groups");
  }
  async linkModifierGroupToMenuItem(data: InsertMenuItemModifierGroup): Promise<MenuItemModifierGroup> { return this.insertOne("menu_item_modifier_groups", { ...data }); }
  async unlinkModifierGroupFromMenuItem(menuItemId: string, modifierGroupId: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM "menu_item_modifier_groups" WHERE menu_item_id = ? AND modifier_group_id = ?`).run(menuItemId, modifierGroupId);
    return result.changes > 0;
  }

  // ========================================================================
  // INGREDIENT PREFIXES & RECIPE INGREDIENTS
  // ========================================================================
  async getIngredientPrefixes(): Promise<IngredientPrefix[]> { return this.getAll("ingredient_prefixes"); }
  async getIngredientPrefix(id: string): Promise<IngredientPrefix | undefined> { return this.getById("ingredient_prefixes", id); }
  async createIngredientPrefix(data: InsertIngredientPrefix): Promise<IngredientPrefix> { return this.insertOne("ingredient_prefixes", { ...data }); }
  async updateIngredientPrefix(id: string, data: Partial<InsertIngredientPrefix>): Promise<IngredientPrefix | undefined> { return this.updateOne("ingredient_prefixes", id, data); }
  async deleteIngredientPrefix(id: string): Promise<boolean> { return this.deleteOne("ingredient_prefixes", id); }

  async getMenuItemRecipeIngredients(menuItemId?: string): Promise<MenuItemRecipeIngredient[]> {
    if (menuItemId) return this.getAll("menu_item_recipe_ingredients", "menu_item_id = ?", [menuItemId]);
    return this.getAll("menu_item_recipe_ingredients");
  }
  async getMenuItemRecipeIngredient(id: string): Promise<MenuItemRecipeIngredient | undefined> { return this.getById("menu_item_recipe_ingredients", id); }
  async createMenuItemRecipeIngredient(data: InsertMenuItemRecipeIngredient): Promise<MenuItemRecipeIngredient> { return this.insertOne("menu_item_recipe_ingredients", { ...data }); }
  async updateMenuItemRecipeIngredient(id: string, data: Partial<InsertMenuItemRecipeIngredient>): Promise<MenuItemRecipeIngredient | undefined> { return this.updateOne("menu_item_recipe_ingredients", id, data); }
  async deleteMenuItemRecipeIngredient(id: string): Promise<boolean> { return this.deleteOne("menu_item_recipe_ingredients", id); }

  // ========================================================================
  // TENDERS
  // ========================================================================
  async getTenders(rvcId?: string): Promise<Tender[]> {
    if (rvcId) return this.getAll("tenders", "rvc_id = ?", [rvcId]);
    return this.getAll("tenders");
  }
  async getAllTendersIncludingSystem(): Promise<Tender[]> { return this.getAll("tenders"); }
  async getTender(id: string): Promise<Tender | undefined> { return this.getById("tenders", id); }
  async createTender(data: InsertTender): Promise<Tender> { return this.insertOne("tenders", { ...data }); }
  async updateTender(id: string, data: Partial<InsertTender>): Promise<Tender | undefined> { return this.updateOne("tenders", id, data); }
  async deleteTender(id: string): Promise<boolean> { return this.deleteOne("tenders", id); }

  // ========================================================================
  // DISCOUNTS
  // ========================================================================
  async getDiscounts(): Promise<Discount[]> { return this.getAll("discounts"); }
  async getDiscount(id: string): Promise<Discount | undefined> { return this.getById("discounts", id); }
  async createDiscount(data: InsertDiscount): Promise<Discount> { return this.insertOne("discounts", { ...data }); }
  async updateDiscount(id: string, data: Partial<InsertDiscount>): Promise<Discount | undefined> { return this.updateOne("discounts", id, data); }
  async deleteDiscount(id: string): Promise<boolean> { return this.deleteOne("discounts", id); }

  // ========================================================================
  // SERVICE CHARGES
  // ========================================================================
  async getServiceCharges(): Promise<ServiceCharge[]> { return this.getAll("service_charges"); }
  async getServiceCharge(id: string): Promise<ServiceCharge | undefined> { return this.getById("service_charges", id); }
  async createServiceCharge(data: InsertServiceCharge): Promise<ServiceCharge> { return this.insertOne("service_charges", { ...data }); }
  async updateServiceCharge(id: string, data: Partial<InsertServiceCharge>): Promise<ServiceCharge | undefined> { return this.updateOne("service_charges", id, data); }
  async deleteServiceCharge(id: string): Promise<boolean> { return this.deleteOne("service_charges", id); }

  async getCheckServiceChargesByCheck(checkId: string): Promise<CheckServiceCharge[]> {
    return this.getAll("check_service_charges", "check_id = ?", [checkId]);
  }
  async getCheckServiceChargesByBusinessDate(propertyId: string, businessDate: string, rvcId?: string): Promise<CheckServiceCharge[]> {
    const checks = this.getAll<Check>("checks", rvcId ? "rvc_id = ? AND business_date = ?" : "business_date = ?", rvcId ? [rvcId, businessDate] : [businessDate]);
    const checkIds = checks.map(c => c.id);
    if (!checkIds.length) return [];
    return this.getAll("check_service_charges", `check_id IN (${checkIds.map(() => "?").join(",")})`, checkIds);
  }
  async createCheckServiceCharge(data: InsertCheckServiceCharge): Promise<CheckServiceCharge> {
    const result = await this.insertOne("check_service_charges", { ...data });
    this.recordTransaction({
      operationType: "create",
      entityType: "check_service_charge",
      entityId: result.id,
      httpMethod: "POST",
      endpoint: `/api/check-service-charges`,
      payload: result,
      offlineTransactionId: crypto.randomUUID(),
    });
    return result;
  }
  async voidCheckServiceCharge(id: string, voidedByEmployeeId: string, voidReason?: string): Promise<CheckServiceCharge | undefined> {
    const result = await this.updateOne("check_service_charges", id, { isVoided: true, voidedByEmployeeId, voidReason, voidedAt: new Date().toISOString() } as any);
    if (result) {
      this.recordTransaction({
        operationType: "update",
        entityType: "check_service_charge",
        entityId: id,
        httpMethod: "PATCH",
        endpoint: `/api/check-service-charges/${id}/void`,
        payload: { id, isVoided: true, voidedByEmployeeId, voidReason },
        offlineTransactionId: crypto.randomUUID(),
      });
    }
    return result;
  }

  // ========================================================================
  // CHECKS
  // ========================================================================
  async getChecks(rvcId?: string, status?: string, includeTestMode?: boolean): Promise<Check[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    if (rvcId) { conditions.push("rvc_id = ?"); params.push(rvcId); }
    if (status) { conditions.push("status = ?"); params.push(status); }
    return this.getAll("checks", conditions.length ? conditions.join(" AND ") : undefined, params);
  }

  async getChecksByPropertyAndDateRange(propertyId: string, startDate: string, endDate: string): Promise<Check[]> {
    return this.getAll("checks", "property_id = ? AND business_date >= ? AND business_date <= ?", [propertyId, startDate, endDate]);
  }

  async getCheck(id: string): Promise<Check | undefined> { return this.getById("checks", id); }

  async getOpenChecks(rvcId: string): Promise<Check[]> {
    return this.getAll("checks", "rvc_id = ? AND status = 'open'", [rvcId]);
  }

  async createCheck(data: InsertCheck): Promise<Check> {
    const offlineTxnId = crypto.randomUUID();
    const result = await this.insertOne("checks", { ...data, offlineTransactionId: offlineTxnId });
    this.recordTransaction({
      operationType: "create",
      entityType: "check",
      entityId: result.id,
      httpMethod: "POST",
      endpoint: "/api/checks",
      payload: result,
      offlineTransactionId: offlineTxnId,
    });
    return result;
  }

  async createCheckAtomic(rvcId: string, data: Omit<InsertCheck, 'checkNumber'>): Promise<Check> {
    const dataRecord = data as Record<string, unknown>;
    const workstationId = typeof dataRecord.workstationId === "string" ? dataRecord.workstationId : undefined;
    let checkNumber: number;

    if (workstationId) {
      const offlineStatus = this.getOfflineCheckNumberStatus(workstationId);
      if (offlineStatus && offlineStatus.remaining > 0) {
        checkNumber = this.getNextOfflineCheckNumber(workstationId);
      } else {
        checkNumber = await this.getNextCheckNumber(rvcId);
      }
    } else {
      checkNumber = await this.getNextCheckNumber(rvcId);
    }

    const offlineTxnId = crypto.randomUUID();
    const result = await this.insertOne("checks", { ...data, rvcId, checkNumber, offlineTransactionId: offlineTxnId });
    this.recordTransaction({
      operationType: "create",
      entityType: "check",
      entityId: result.id,
      httpMethod: "POST",
      endpoint: "/api/checks",
      payload: result,
      offlineTransactionId: offlineTxnId,
    });
    return result;
  }

  async updateCheck(id: string, data: Partial<Check>): Promise<Check | undefined> {
    const result = await this.updateOne("checks", id, data);
    if (result) {
      this.recordTransaction({
        operationType: "update",
        entityType: "check",
        entityId: id,
        httpMethod: "PATCH",
        endpoint: `/api/checks/${id}`,
        payload: { id, ...data },
        offlineTransactionId: result.offlineTransactionId || crypto.randomUUID(),
      });
    }
    return result;
  }
  async deleteCheck(id: string): Promise<boolean> {
    const result = await this.deleteOne("checks", id);
    if (result) {
      this.recordTransaction({
        operationType: "delete",
        entityType: "check",
        entityId: id,
        httpMethod: "DELETE",
        endpoint: `/api/checks/${id}`,
        payload: { id },
        offlineTransactionId: crypto.randomUUID(),
      });
    }
    return result;
  }

  async getNextCheckNumber(rvcId: string): Promise<number> {
    const row = this.db.prepare(`SELECT * FROM "rvc_counters" WHERE rvc_id = ?`).get(rvcId) as any;
    if (row) {
      const next = (row.last_check_number || 0) + 1;
      this.db.prepare(`UPDATE "rvc_counters" SET last_check_number = ? WHERE rvc_id = ?`).run(next, rvcId);
      return next;
    }
    this.db.prepare(`INSERT INTO "rvc_counters" (id, rvc_id, last_check_number) VALUES (?, ?, 1)`).run(uuid(), rvcId, 1);
    return 1;
  }

  getNextOfflineCheckNumber(workstationId: string): number {
    const row = this.db.prepare(`SELECT * FROM "lfs_offline_sequence" WHERE workstation_id = ?`).get(workstationId) as any;
    if (!row) {
      throw new Error(`No offline check number range configured for workstation ${workstationId}`);
    }
    const current = row.current_number;
    if (current > row.range_end) {
      throw new Error(`Offline check number range exhausted for workstation ${workstationId} (max: ${row.range_end})`);
    }
    this.db.prepare(`UPDATE "lfs_offline_sequence" SET current_number = ? WHERE workstation_id = ?`).run(current + 1, workstationId);
    return current;
  }

  initOfflineCheckNumberRange(workstationId: string, rangeStart: number, rangeEnd: number): void {
    const existing = this.db.prepare(`SELECT * FROM "lfs_offline_sequence" WHERE workstation_id = ?`).get(workstationId);
    if (existing) {
      this.db.prepare(`UPDATE "lfs_offline_sequence" SET range_start = ?, range_end = ?, current_number = ? WHERE workstation_id = ?`).run(rangeStart, rangeEnd, rangeStart, workstationId);
    } else {
      this.db.prepare(`INSERT INTO "lfs_offline_sequence" (workstation_id, current_number, range_start, range_end) VALUES (?, ?, ?, ?)`).run(workstationId, rangeStart, rangeStart, rangeEnd);
    }
  }

  getOfflineCheckNumberStatus(workstationId: string): { current: number; rangeStart: number; rangeEnd: number; remaining: number } | null {
    const row = this.db.prepare(`SELECT * FROM "lfs_offline_sequence" WHERE workstation_id = ?`).get(workstationId) as any;
    if (!row) return null;
    return {
      current: row.current_number,
      rangeStart: row.range_start,
      rangeEnd: row.range_end,
      remaining: row.range_end - row.current_number,
    };
  }

  // ========================================================================
  // IDEMPOTENCY
  // ========================================================================
  async acquireIdempotencyLock(enterpriseId: string, workstationId: string, operation: string, key: string, requestHash: string): Promise<{ acquired: boolean; status?: string; requestHash?: string; responseStatus?: number; responseBody?: string }> {
    const existing = this.db.prepare(`SELECT * FROM "idempotency_keys" WHERE enterprise_id = ? AND workstation_id = ? AND operation = ? AND key = ?`).get(enterpriseId, workstationId, operation, key) as any;
    if (existing) {
      const row = transformRowFromDb(existing, "idempotency_keys");
      return { acquired: false, status: row.status, requestHash: row.requestHash, responseStatus: row.responseStatus, responseBody: row.responseBody };
    }
    this.db.prepare(`INSERT INTO "idempotency_keys" (id, enterprise_id, workstation_id, operation, key, request_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)`).run(uuid(), enterpriseId, workstationId, operation, key, requestHash, now());
    return { acquired: true };
  }

  async completeIdempotencyKey(enterpriseId: string, workstationId: string, operation: string, key: string, responseStatus: number, responseBody: string): Promise<void> {
    this.db.prepare(`UPDATE "idempotency_keys" SET status = 'completed', response_status = ?, response_body = ? WHERE enterprise_id = ? AND workstation_id = ? AND operation = ? AND key = ?`).run(responseStatus, responseBody, enterpriseId, workstationId, operation, key);
  }

  async failIdempotencyKey(enterpriseId: string, workstationId: string, operation: string, key: string): Promise<void> {
    this.db.prepare(`DELETE FROM "idempotency_keys" WHERE enterprise_id = ? AND workstation_id = ? AND operation = ? AND key = ?`).run(enterpriseId, workstationId, operation, key);
  }

  async cleanupExpiredIdempotencyKeys(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(`DELETE FROM "idempotency_keys" WHERE created_at < ?`).run(cutoff);
    return result.changes;
  }

  // ========================================================================
  // PRINT QUEUE
  // ========================================================================
  async claimPrintJob(agentId: string, leaseDurationSeconds?: number): Promise<PrintJob | null> {
    const duration = leaseDurationSeconds || 30;
    const expiresAt = new Date(Date.now() + duration * 1000).toISOString();
    const job = this.db.prepare(`SELECT * FROM "print_jobs" WHERE status = 'pending' AND (lease_expires_at IS NULL OR lease_expires_at < ?) ORDER BY created_at ASC LIMIT 1`).get(now()) as any;
    if (!job) return null;
    this.db.prepare(`UPDATE "print_jobs" SET status = 'printing', agent_id = ?, lease_expires_at = ? WHERE id = ?`).run(agentId, expiresAt, job.id);
    return transformRowFromDb(this.db.prepare(`SELECT * FROM "print_jobs" WHERE id = ?`).get(job.id), "print_jobs");
  }

  async ackPrintJob(jobId: string, success: boolean, error?: string): Promise<void> {
    const status = success ? "completed" : "failed";
    this.db.prepare(`UPDATE "print_jobs" SET status = ?, error = ?, completed_at = ? WHERE id = ?`).run(status, error || null, now(), jobId);
  }

  async recoverExpiredLeases(): Promise<number> {
    const result = this.db.prepare(`UPDATE "print_jobs" SET status = 'pending', agent_id = NULL, lease_expires_at = NULL WHERE status = 'printing' AND lease_expires_at < ?`).run(now());
    return result.changes;
  }

  // ========================================================================
  // CHECK ITEMS
  // ========================================================================
  async getCheckItems(checkId: string): Promise<CheckItem[]> { return this.getAll("check_items", "check_id = ?", [checkId]); }
  async getCheckItem(id: string): Promise<CheckItem | undefined> { return this.getById("check_items", id); }
  async createCheckItem(data: InsertCheckItem): Promise<CheckItem> {
    const offlineTxnId = crypto.randomUUID();
    const result = await this.insertOne("check_items", { ...data, offlineTransactionId: offlineTxnId });
    this.recordTransaction({
      operationType: "create",
      entityType: "check_item",
      entityId: result.id,
      httpMethod: "POST",
      endpoint: `/api/check-items`,
      payload: result,
      offlineTransactionId: offlineTxnId,
    });
    return result;
  }
  async updateCheckItem(id: string, data: Partial<CheckItem>): Promise<CheckItem | undefined> {
    const result = await this.updateOne("check_items", id, data);
    if (result) {
      this.recordTransaction({
        operationType: "update",
        entityType: "check_item",
        entityId: id,
        httpMethod: "PATCH",
        endpoint: `/api/check-items/${id}`,
        payload: { id, ...data },
        offlineTransactionId: result.offlineTransactionId || crypto.randomUUID(),
      });
    }
    return result;
  }
  async deleteCheckItem(id: string): Promise<boolean> {
    const result = await this.deleteOne("check_items", id);
    if (result) {
      this.recordTransaction({
        operationType: "delete",
        entityType: "check_item",
        entityId: id,
        httpMethod: "DELETE",
        endpoint: `/api/check-items/${id}`,
        payload: { id },
        offlineTransactionId: crypto.randomUUID(),
      });
    }
    return result;
  }

  // ========================================================================
  // CHECK DISCOUNTS
  // ========================================================================
  async getCheckDiscounts(checkId: string): Promise<CheckDiscount[]> { return this.getAll("check_discounts", "check_id = ?", [checkId]); }
  async getCheckDiscount(id: string): Promise<CheckDiscount | undefined> { return this.getById("check_discounts", id); }
  async createCheckDiscount(data: InsertCheckDiscount): Promise<CheckDiscount> {
    const result = await this.insertOne("check_discounts", { ...data });
    this.recordTransaction({
      operationType: "create",
      entityType: "check_discount",
      entityId: result.id,
      httpMethod: "POST",
      endpoint: `/api/check-discounts`,
      payload: result,
      offlineTransactionId: crypto.randomUUID(),
    });
    return result;
  }
  async deleteCheckDiscount(id: string): Promise<boolean> {
    const result = await this.deleteOne("check_discounts", id);
    if (result) {
      this.recordTransaction({
        operationType: "delete",
        entityType: "check_discount",
        entityId: id,
        httpMethod: "DELETE",
        endpoint: `/api/check-discounts/${id}`,
        payload: { id },
        offlineTransactionId: crypto.randomUUID(),
      });
    }
    return result;
  }

  // ========================================================================
  // ROUNDS
  // ========================================================================
  async createRound(data: InsertRound): Promise<Round> {
    const result = await this.insertOne("rounds", { ...data });
    this.recordTransaction({
      operationType: "create",
      entityType: "round",
      entityId: result.id,
      httpMethod: "POST",
      endpoint: `/api/rounds`,
      payload: result,
      offlineTransactionId: crypto.randomUUID(),
    });
    return result;
  }
  async getRounds(checkId: string): Promise<Round[]> { return this.getAll("rounds", "check_id = ?", [checkId]); }

  // ========================================================================
  // CHECK LOCKS
  // ========================================================================
  async getCheckLock(checkId: string): Promise<CheckLock | undefined> {
    const row = this.db.prepare(`SELECT * FROM "check_locks" WHERE check_id = ?`).get(checkId);
    return row ? transformRowFromDb(row, "check_locks") : undefined;
  }
  async getCheckLocksByCheckIds(checkIds: string[]): Promise<CheckLock[]> {
    if (!checkIds.length) return [];
    return this.getAll("check_locks", `check_id IN (${checkIds.map(() => "?").join(",")})`, checkIds);
  }
  async createCheckLock(data: { checkId: string; workstationId: string; employeeId: string; lockMode?: string; expiresAt: Date }): Promise<CheckLock> {
    return this.insertOne("check_locks", { ...data, expiresAt: data.expiresAt.toISOString() });
  }
  async updateCheckLock(id: string, data: Partial<{ expiresAt: Date; lockMode: string }>): Promise<CheckLock | undefined> {
    const updateData: any = { ...data };
    if (data.expiresAt) updateData.expiresAt = data.expiresAt.toISOString();
    return this.updateOne("check_locks", id, updateData);
  }
  async deleteCheckLock(id: string): Promise<boolean> { return this.deleteOne("check_locks", id); }
  async deleteCheckLocksByWorkstation(workstationId: string): Promise<number> {
    const result = this.db.prepare(`DELETE FROM "check_locks" WHERE workstation_id = ?`).run(workstationId);
    return result.changes;
  }

  // ========================================================================
  // PAYMENTS
  // ========================================================================
  async createPayment(data: InsertCheckPayment): Promise<CheckPayment> {
    const offlineTxnId = crypto.randomUUID();
    const result = await this.insertOne("check_payments", { ...data, offlineTransactionId: offlineTxnId });
    this.recordTransaction({
      operationType: "create",
      entityType: "check_payment",
      entityId: result.id,
      httpMethod: "POST",
      endpoint: `/api/check-payments`,
      payload: result,
      offlineTransactionId: offlineTxnId,
    });
    return result;
  }
  async getPayments(checkId: string): Promise<CheckPayment[]> { return this.getAll("check_payments", "check_id = ?", [checkId]); }
  async getAllPayments(): Promise<CheckPayment[]> { return this.getAll("check_payments"); }
  async updateCheckPayment(id: string, data: Partial<CheckPayment>): Promise<CheckPayment | undefined> {
    const result = await this.updateOne("check_payments", id, data);
    if (result) {
      this.recordTransaction({
        operationType: "update",
        entityType: "check_payment",
        entityId: id,
        httpMethod: "PATCH",
        endpoint: `/api/checks/payments/${id}`,
        payload: data as Record<string, unknown>,
        offlineTransactionId: (data as Record<string, unknown>).offlineTransactionId as string || crypto.randomUUID(),
      });
    }
    return result;
  }
  async getAllCheckItems(): Promise<CheckItem[]> { return this.getAll("check_items"); }

  // ========================================================================
  // PAYMENT PROCESSORS
  // ========================================================================
  async getPaymentProcessors(propertyId?: string): Promise<PaymentProcessor[]> {
    if (propertyId) return this.getAll("payment_processors", "property_id = ?", [propertyId]);
    return this.getAll("payment_processors");
  }
  async getPaymentProcessor(id: string): Promise<PaymentProcessor | undefined> { return this.getById("payment_processors", id); }
  async createPaymentProcessor(data: InsertPaymentProcessor): Promise<PaymentProcessor> { return this.insertOne("payment_processors", { ...data }); }
  async updatePaymentProcessor(id: string, data: Partial<InsertPaymentProcessor>): Promise<PaymentProcessor | undefined> { return this.updateOne("payment_processors", id, data); }
  async deletePaymentProcessor(id: string): Promise<boolean> { return this.deleteOne("payment_processors", id); }
  async getActivePaymentProcessor(propertyId: string): Promise<PaymentProcessor | undefined> {
    const rows = this.getAll<PaymentProcessor>("payment_processors", "property_id = ? AND active = 1", [propertyId]);
    return rows[0];
  }

  // ========================================================================
  // PAYMENT GATEWAY CONFIG
  // ========================================================================
  async getPaymentGatewayConfigs(enterpriseId: string): Promise<PaymentGatewayConfig[]> {
    return this.getAll("payment_gateway_config", "enterprise_id = ?", [enterpriseId]);
  }
  async getPaymentGatewayConfig(id: string): Promise<PaymentGatewayConfig | undefined> { return this.getById("payment_gateway_config", id); }
  async getPaymentGatewayConfigForLevel(configLevel: string, enterpriseId: string, propertyId?: string | null, workstationId?: string | null): Promise<PaymentGatewayConfig | undefined> {
    const conditions = ["config_level = ?", "enterprise_id = ?"];
    const params: any[] = [configLevel, enterpriseId];
    if (propertyId) { conditions.push("property_id = ?"); params.push(propertyId); }
    if (workstationId) { conditions.push("workstation_id = ?"); params.push(workstationId); }
    const rows = this.getAll<PaymentGatewayConfig>("payment_gateway_config", conditions.join(" AND "), params);
    return rows[0];
  }
  async getMergedPaymentGatewayConfig(enterpriseId: string, propertyId?: string | null, workstationId?: string | null): Promise<Partial<PaymentGatewayConfig>> {
    let merged: Partial<PaymentGatewayConfig> = {};
    const enterprise = await this.getPaymentGatewayConfigForLevel("enterprise", enterpriseId);
    if (enterprise) merged = { ...merged, ...enterprise };
    if (propertyId) {
      const property = await this.getPaymentGatewayConfigForLevel("property", enterpriseId, propertyId);
      if (property) merged = { ...merged, ...property };
    }
    if (workstationId) {
      const ws = await this.getPaymentGatewayConfigForLevel("workstation", enterpriseId, propertyId, workstationId);
      if (ws) merged = { ...merged, ...ws };
    }
    return merged;
  }
  async createPaymentGatewayConfig(data: InsertPaymentGatewayConfig): Promise<PaymentGatewayConfig> { return this.insertOne("payment_gateway_config", { ...data }); }
  async updatePaymentGatewayConfig(id: string, data: Partial<InsertPaymentGatewayConfig>): Promise<PaymentGatewayConfig | undefined> { return this.updateOne("payment_gateway_config", id, data); }
  async deletePaymentGatewayConfig(id: string): Promise<boolean> { return this.deleteOne("payment_gateway_config", id); }

  // ========================================================================
  // PAYMENT TRANSACTIONS
  // ========================================================================
  async getPaymentTransactions(checkPaymentId?: string): Promise<PaymentTransaction[]> {
    if (checkPaymentId) return this.getAll("payment_transactions", "check_payment_id = ?", [checkPaymentId]);
    return this.getAll("payment_transactions");
  }
  async getPaymentTransaction(id: string): Promise<PaymentTransaction | undefined> { return this.getById("payment_transactions", id); }
  async getPaymentTransactionByGatewayId(gatewayTransactionId: string): Promise<PaymentTransaction | undefined> {
    const rows = this.getAll<PaymentTransaction>("payment_transactions", "gateway_transaction_id = ?", [gatewayTransactionId]);
    return rows[0];
  }
  async createPaymentTransaction(data: InsertPaymentTransaction): Promise<PaymentTransaction> { return this.insertOne("payment_transactions", { ...data }); }
  async updatePaymentTransaction(id: string, data: Partial<PaymentTransaction>): Promise<PaymentTransaction | undefined> { return this.updateOne("payment_transactions", id, data); }

  // ========================================================================
  // TERMINAL DEVICES
  // ========================================================================
  async getTerminalDevices(propertyId?: string): Promise<TerminalDevice[]> {
    if (propertyId) return this.getAll("terminal_devices", "property_id = ?", [propertyId]);
    return this.getAll("terminal_devices");
  }
  async getTerminalDevice(id: string): Promise<TerminalDevice | undefined> { return this.getById("terminal_devices", id); }
  async getTerminalDevicesByWorkstation(workstationId: string): Promise<TerminalDevice[]> {
    return this.getAll("terminal_devices", "workstation_id = ?", [workstationId]);
  }
  async createTerminalDevice(data: InsertTerminalDevice): Promise<TerminalDevice> { return this.insertOne("terminal_devices", { ...data }); }
  async updateTerminalDevice(id: string, data: Partial<InsertTerminalDevice>): Promise<TerminalDevice | undefined> { return this.updateOne("terminal_devices", id, data); }
  async deleteTerminalDevice(id: string): Promise<boolean> { return this.deleteOne("terminal_devices", id); }
  async updateTerminalDeviceStatus(id: string, status: string, lastHeartbeat?: Date): Promise<TerminalDevice | undefined> {
    const data: any = { status };
    if (lastHeartbeat) data.lastHeartbeat = lastHeartbeat.toISOString();
    return this.updateOne("terminal_devices", id, data);
  }

  // ========================================================================
  // TERMINAL SESSIONS
  // ========================================================================
  async getTerminalSessions(terminalDeviceId?: string, status?: string): Promise<TerminalSession[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (terminalDeviceId) { conds.push("terminal_device_id = ?"); params.push(terminalDeviceId); }
    if (status) { conds.push("status = ?"); params.push(status); }
    return this.getAll("terminal_sessions", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getTerminalSession(id: string): Promise<TerminalSession | undefined> { return this.getById("terminal_sessions", id); }
  async getActiveTerminalSession(terminalDeviceId: string): Promise<TerminalSession | undefined> {
    const rows = this.getAll<TerminalSession>("terminal_sessions", "terminal_device_id = ? AND status = 'active'", [terminalDeviceId]);
    return rows[0];
  }
  async createTerminalSession(data: InsertTerminalSession): Promise<TerminalSession> { return this.insertOne("terminal_sessions", { ...data }); }
  async updateTerminalSession(id: string, data: Partial<TerminalSession>): Promise<TerminalSession | undefined> { return this.updateOne("terminal_sessions", id, data); }

  // ========================================================================
  // REGISTERED DEVICES
  // ========================================================================
  async getRegisteredDevices(propertyId?: string): Promise<RegisteredDevice[]> {
    if (propertyId) return this.getAll("registered_devices", "property_id = ?", [propertyId]);
    return this.getAll("registered_devices");
  }
  async getRegisteredDevice(id: string): Promise<RegisteredDevice | undefined> { return this.getById("registered_devices", id); }
  async getRegisteredDeviceByToken(deviceTokenHash: string): Promise<RegisteredDevice | undefined> {
    const rows = this.getAll<RegisteredDevice>("registered_devices", "device_token_hash = ?", [deviceTokenHash]);
    return rows[0];
  }
  async getRegisteredDeviceByEnrollmentCode(enrollmentCode: string): Promise<RegisteredDevice | undefined> {
    const rows = this.getAll<RegisteredDevice>("registered_devices", "enrollment_code = ?", [enrollmentCode]);
    return rows[0];
  }
  async createRegisteredDevice(data: InsertRegisteredDevice): Promise<RegisteredDevice> { return this.insertOne("registered_devices", { ...data }); }
  async updateRegisteredDevice(id: string, data: Partial<RegisteredDevice>): Promise<RegisteredDevice | undefined> { return this.updateOne("registered_devices", id, data); }
  async deleteRegisteredDevice(id: string): Promise<boolean> { return this.deleteOne("registered_devices", id); }

  // ========================================================================
  // EMC USERS & SESSIONS
  // ========================================================================
  async getEmcUsers(enterpriseId?: string, propertyId?: string): Promise<EmcUser[]> {
    if (enterpriseId) return this.getAll("emc_users", "enterprise_id = ?", [enterpriseId]);
    return this.getAll("emc_users");
  }
  async getEmcUser(id: string): Promise<EmcUser | undefined> { return this.getById("emc_users", id); }
  async getEmcUserByEmail(email: string): Promise<EmcUser | undefined> {
    const rows = this.getAll<EmcUser>("emc_users", "LOWER(email) = LOWER(?)", [email]);
    return rows[0];
  }
  async createEmcUser(data: InsertEmcUser): Promise<EmcUser> { return this.insertOne("emc_users", { ...data }); }
  async updateEmcUser(id: string, data: Partial<EmcUser>): Promise<EmcUser | undefined> { return this.updateOne("emc_users", id, data); }
  async deleteEmcUser(id: string): Promise<boolean> { return this.deleteOne("emc_users", id); }
  async getEmcUserCount(): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM "emc_users"`).get() as any;
    return row?.count || 0;
  }

  async getEmcSession(id: string): Promise<EmcSession | undefined> { return this.getById("emc_sessions", id); }
  async getEmcSessionByToken(sessionToken: string): Promise<EmcSession | undefined> {
    const rows = this.getAll<EmcSession>("emc_sessions", "session_token = ?", [sessionToken]);
    return rows[0];
  }
  async createEmcSession(data: InsertEmcSession): Promise<EmcSession> { return this.insertOne("emc_sessions", { ...data }); }
  async deleteEmcSession(id: string): Promise<boolean> { return this.deleteOne("emc_sessions", id); }
  async deleteExpiredEmcSessions(): Promise<number> {
    const result = this.db.prepare(`DELETE FROM "emc_sessions" WHERE expires_at < ?`).run(now());
    return result.changes;
  }

  // ========================================================================
  // AUDIT LOGS
  // ========================================================================
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> { return this.insertOne("audit_logs", { ...data }); }
  async getAuditLogs(rvcId?: string): Promise<AuditLog[]> {
    if (rvcId) return this.getAll("audit_logs", "rvc_id = ?", [rvcId]);
    return this.getAll("audit_logs");
  }

  // ========================================================================
  // PRINT JOBS & AGENTS
  // ========================================================================
  async createPrintJob(data: InsertPrintJob): Promise<PrintJob> { return this.insertOne("print_jobs", { ...data }); }
  async getPrintJob(id: string): Promise<PrintJob | undefined> { return this.getById("print_jobs", id); }
  async getPendingPrintJobs(workstationId?: string, propertyId?: string): Promise<PrintJob[]> {
    const conds = ["status = 'pending'"];
    const params: any[] = [];
    if (workstationId) { conds.push("workstation_id = ?"); params.push(workstationId); }
    if (propertyId) { conds.push("property_id = ?"); params.push(propertyId); }
    return this.getAll("print_jobs", conds.join(" AND "), params);
  }
  async updatePrintJob(id: string, data: Partial<PrintJob>): Promise<PrintJob | undefined> { return this.updateOne("print_jobs", id, data); }
  async findReceiptPrinter(propertyId: string): Promise<Printer | undefined> {
    const rows = this.getAll<Printer>("printers", "property_id = ? AND printer_type = 'receipt' AND active = 1", [propertyId]);
    return rows[0];
  }

  async getPrintAgents(propertyId?: string): Promise<PrintAgent[]> {
    if (propertyId) return this.getAll("print_agents", "property_id = ?", [propertyId]);
    return this.getAll("print_agents");
  }
  async getPrintAgent(id: string): Promise<PrintAgent | undefined> { return this.getById("print_agents", id); }
  async getPrintAgentByToken(agentTokenHash: string): Promise<PrintAgent | undefined> {
    const rows = this.getAll<PrintAgent>("print_agents", "agent_token_hash = ?", [agentTokenHash]);
    return rows[0];
  }
  async getOnlinePrintAgentForProperty(propertyId: string): Promise<PrintAgent | undefined> {
    const rows = this.getAll<PrintAgent>("print_agents", "property_id = ? AND status = 'online'", [propertyId]);
    return rows[0];
  }
  async getOnlinePrintAgentForWorkstation(workstationId: string): Promise<PrintAgent | undefined> {
    const rows = this.getAll<PrintAgent>("print_agents", "workstation_id = ? AND status = 'online'", [workstationId]);
    return rows[0];
  }
  async createPrintAgent(data: InsertPrintAgent): Promise<PrintAgent> { return this.insertOne("print_agents", { ...data }); }
  async updatePrintAgent(id: string, data: Partial<PrintAgent>): Promise<PrintAgent | undefined> { return this.updateOne("print_agents", id, data); }
  async deletePrintAgent(id: string): Promise<boolean> { return this.deleteOne("print_agents", id); }
  async getAgentPendingPrintJobs(agentId: string): Promise<PrintJob[]> {
    return this.getAll("print_jobs", "agent_id = ? AND status = 'pending'", [agentId]);
  }
  async getAgentPrintingJobs(agentId: string): Promise<PrintJob[]> {
    return this.getAll("print_jobs", "agent_id = ? AND status = 'printing'", [agentId]);
  }
  async getUnassignedPendingPrintJobsForProperty(propertyId: string): Promise<PrintJob[]> {
    return this.getAll("print_jobs", "property_id = ? AND status = 'pending' AND agent_id IS NULL", [propertyId]);
  }

  // ========================================================================
  // KDS TICKETS
  // ========================================================================
  async getKdsTickets(filters?: { rvcId?: string; kdsDeviceId?: string; stationType?: string }): Promise<any[]> {
    const conds: string[] = ["status != 'bumped'"];
    const params: any[] = [];
    if (filters?.rvcId) { conds.push("rvc_id = ?"); params.push(filters.rvcId); }
    if (filters?.stationType) { conds.push("station_type = ?"); params.push(filters.stationType); }
    const tickets = this.getAll<any>("kds_tickets", conds.join(" AND "), params);
    for (const ticket of tickets) {
      ticket.items = this.getAll<any>("kds_ticket_items", "kds_ticket_id = ?", [ticket.id]);
    }
    return tickets;
  }

  async getAllKdsTicketsForReporting(filters?: { rvcId?: string }): Promise<any[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters?.rvcId) { conds.push("rvc_id = ?"); params.push(filters.rvcId); }
    const tickets = this.getAll<any>("kds_tickets", conds.length ? conds.join(" AND ") : undefined, params);
    for (const ticket of tickets) {
      ticket.items = this.getAll<any>("kds_ticket_items", "kds_ticket_id = ?", [ticket.id]);
    }
    return tickets;
  }

  async getKdsTicket(id: string): Promise<KdsTicket | undefined> { return this.getById("kds_tickets", id); }
  async createKdsTicket(data: InsertKdsTicket): Promise<KdsTicket> { return this.insertOne("kds_tickets", { ...data }); }
  async updateKdsTicket(id: string, data: Partial<KdsTicket>): Promise<KdsTicket | undefined> { return this.updateOne("kds_tickets", id, data); }

  async createKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void> {
    this.db.prepare(`INSERT INTO "kds_ticket_items" (id, kds_ticket_id, check_item_id) VALUES (?, ?, ?)`).run(uuid(), kdsTicketId, checkItemId);
  }
  async getKdsTicketItems(kdsTicketId: string): Promise<KdsTicketItem[]> {
    return this.getAll("kds_ticket_items", "kds_ticket_id = ?", [kdsTicketId]);
  }
  async removeKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void> {
    this.db.prepare(`DELETE FROM "kds_ticket_items" WHERE kds_ticket_id = ? AND check_item_id = ?`).run(kdsTicketId, checkItemId);
  }
  async voidKdsTicketItem(checkItemId: string): Promise<void> {
    this.db.prepare(`UPDATE "kds_ticket_items" SET is_voided = 1 WHERE check_item_id = ?`).run(checkItemId);
  }
  async bumpKdsTicket(id: string, bumpedBy?: string): Promise<KdsTicket | undefined> {
    return this.updateOne("kds_tickets", id, { status: "bumped", bumpedAt: now(), bumpedBy: bumpedBy || null } as any);
  }
  async recallKdsTicket(id: string, scope?: 'expo' | 'all'): Promise<KdsTicket | undefined> {
    return this.updateOne("kds_tickets", id, { status: "active", bumpedAt: null, bumpedBy: null } as any);
  }
  async getBumpedKdsTickets(filters: { rvcId?: string; stationType?: string; limit?: number }): Promise<any[]> {
    const conds = ["status = 'bumped'"];
    const params: any[] = [];
    if (filters.rvcId) { conds.push("rvc_id = ?"); params.push(filters.rvcId); }
    if (filters.stationType) { conds.push("station_type = ?"); params.push(filters.stationType); }
    let sql = `SELECT * FROM "kds_tickets" WHERE ${conds.join(" AND ")} ORDER BY bumped_at DESC`;
    if (filters.limit) sql += ` LIMIT ${filters.limit}`;
    const tickets = this.db.prepare(sql).all(...params).map(r => transformRowFromDb(r, "kds_tickets"));
    for (const ticket of tickets) {
      ticket.items = this.getAll<any>("kds_ticket_items", "kds_ticket_id = ?", [ticket.id]);
    }
    return tickets;
  }
  async markKdsItemReady(ticketItemId: string): Promise<void> {
    this.db.prepare(`UPDATE "kds_ticket_items" SET is_ready = 1 WHERE id = ?`).run(ticketItemId);
  }
  async unmarkKdsItemReady(ticketItemId: string): Promise<void> {
    this.db.prepare(`UPDATE "kds_ticket_items" SET is_ready = 0 WHERE id = ?`).run(ticketItemId);
  }
  async getPreviewTicket(checkId: string): Promise<KdsTicket | undefined> {
    const rows = this.getAll<KdsTicket>("kds_tickets", "check_id = ? AND status = 'draft'", [checkId]);
    return rows[0];
  }
  async getPreviewTickets(checkId: string): Promise<KdsTicket[]> {
    return this.getAll("kds_tickets", "check_id = ? AND status = 'draft'", [checkId]);
  }
  async getKdsTicketsByCheck(checkId: string): Promise<KdsTicket[]> {
    return this.getAll("kds_tickets", "check_id = ?", [checkId]);
  }
  async markKdsTicketsPaid(checkId: string): Promise<void> {
    this.db.prepare(`UPDATE "kds_tickets" SET is_paid = 1 WHERE check_id = ?`).run(checkId);
  }

  // ========================================================================
  // ADMIN STATS
  // ========================================================================
  async getAdminStats(enterpriseId?: string): Promise<{ enterprises: number; properties: number; rvcs: number; employees: number; menuItems: number; activeChecks: number }> {
    const count = (table: string, where?: string, params?: any[]) => {
      const sql = where ? `SELECT COUNT(*) as c FROM "${table}" WHERE ${where}` : `SELECT COUNT(*) as c FROM "${table}"`;
      return (this.db.prepare(sql).get(...(params || [])) as any)?.c || 0;
    };
    return {
      enterprises: count("enterprises"),
      properties: count("properties"),
      rvcs: count("rvcs"),
      employees: count("employees"),
      menuItems: count("menu_items"),
      activeChecks: count("checks", "status = 'open'"),
    };
  }

  // ========================================================================
  // POS LAYOUTS
  // ========================================================================
  async getPosLayouts(rvcId?: string): Promise<PosLayout[]> {
    if (rvcId) {
      const assignments = this.getAll<any>("pos_layout_rvc_assignments", "rvc_id = ?", [rvcId]);
      const layoutIds = assignments.map((a: any) => a.layoutId);
      if (!layoutIds.length) return this.getAll("pos_layouts");
      return this.getAll("pos_layouts", `id IN (${layoutIds.map(() => "?").join(",")})`, layoutIds);
    }
    return this.getAll("pos_layouts");
  }
  async getPosLayout(id: string): Promise<PosLayout | undefined> { return this.getById("pos_layouts", id); }
  async getDefaultPosLayout(rvcId: string): Promise<PosLayout | undefined> {
    const assignments = this.getAll<any>("pos_layout_rvc_assignments", "rvc_id = ? AND is_default = 1", [rvcId]);
    if (assignments.length) return this.getById("pos_layouts", assignments[0].layoutId);
    const layouts = await this.getPosLayouts(rvcId);
    return layouts[0];
  }
  async createPosLayout(data: InsertPosLayout): Promise<PosLayout> { return this.insertOne("pos_layouts", { ...data }); }
  async updatePosLayout(id: string, data: Partial<InsertPosLayout>): Promise<PosLayout | undefined> { return this.updateOne("pos_layouts", id, data); }
  async deletePosLayout(id: string): Promise<boolean> { return this.deleteOne("pos_layouts", id); }

  async getPosLayoutCells(layoutId: string): Promise<PosLayoutCell[]> {
    return this.getAll("pos_layout_cells", "layout_id = ?", [layoutId]);
  }
  async setPosLayoutCells(layoutId: string, cells: InsertPosLayoutCell[]): Promise<PosLayoutCell[]> {
    this.db.prepare(`DELETE FROM "pos_layout_cells" WHERE layout_id = ?`).run(layoutId);
    for (const cell of cells) {
      this.insertOne("pos_layout_cells", { ...cell, layoutId });
    }
    return this.getAll("pos_layout_cells", "layout_id = ?", [layoutId]);
  }

  async getPosLayoutRvcAssignments(layoutId: string): Promise<PosLayoutRvcAssignment[]> {
    return this.getAll("pos_layout_rvc_assignments", "layout_id = ?", [layoutId]);
  }
  async setPosLayoutRvcAssignments(layoutId: string, assignments: { propertyId: string; rvcId: string; isDefault?: boolean }[]): Promise<PosLayoutRvcAssignment[]> {
    this.db.prepare(`DELETE FROM "pos_layout_rvc_assignments" WHERE layout_id = ?`).run(layoutId);
    for (const a of assignments) {
      this.insertOne("pos_layout_rvc_assignments", { layoutId, ...a });
    }
    return this.getAll("pos_layout_rvc_assignments", "layout_id = ?", [layoutId]);
  }
  async getPosLayoutsForRvc(rvcId: string): Promise<PosLayout[]> { return this.getPosLayouts(rvcId); }
  async getDefaultLayoutForRvc(rvcId: string): Promise<PosLayout | undefined> { return this.getDefaultPosLayout(rvcId); }
  async setDefaultLayoutForRvc(rvcId: string, layoutId: string): Promise<void> {
    this.db.prepare(`UPDATE "pos_layout_rvc_assignments" SET is_default = 0 WHERE rvc_id = ?`).run(rvcId);
    this.db.prepare(`UPDATE "pos_layout_rvc_assignments" SET is_default = 1 WHERE rvc_id = ? AND layout_id = ?`).run(rvcId, layoutId);
  }

  // ========================================================================
  // ADMIN SALES RESET
  // ========================================================================
  async getSalesDataSummary(propertyId: string): Promise<any> {
    const count = (table: string, col: string = "property_id") => {
      return (this.db.prepare(`SELECT COUNT(*) as c FROM "${table}" WHERE ${col} = ?`).get(propertyId) as any)?.c || 0;
    };
    return {
      checks: count("checks"), checkItems: 0, payments: 0, rounds: 0, kdsTickets: count("kds_tickets", "rvc_id"),
      auditLogs: count("audit_logs", "rvc_id"), fiscalPeriods: count("fiscal_periods"),
      cashTransactions: 0, drawerAssignments: 0, safeCounts: 0,
      giftCardTransactions: 0, giftCards: 0, loyaltyTransactions: 0, loyaltyRedemptions: 0, loyaltyMembers: 0,
      onlineOrders: 0, inventoryTransactions: 0, inventoryStock: 0,
      salesForecasts: 0, laborForecasts: 0, managerAlerts: 0,
      itemAvailability: 0, prepItems: 0, offlineQueue: 0, accountingExports: 0,
    };
  }

  async clearSalesData(propertyId: string): Promise<any> {
    const tablesToClear = [
      "check_items", "check_payments", "check_discounts", "check_service_charges",
      "check_locks", "rounds", "checks",
      "kds_ticket_items", "kds_tickets",
      "print_jobs", "audit_logs",
      "time_punches", "timecards", "break_sessions", "timecard_exceptions",
      "shifts", "tip_allocations", "tip_pool_runs",
      "fiscal_periods", "cash_transactions", "drawer_assignments", "safe_counts",
      "gift_card_transactions", "loyalty_transactions", "loyalty_redemptions",
      "online_orders", "inventory_transactions", "inventory_stock",
      "sales_forecasts", "labor_forecasts", "manager_alerts",
      "item_availability_overrides", "prep_items", "accounting_exports",
    ];
    const deleted: Record<string, number> = {};
    this.db.exec("BEGIN TRANSACTION");
    try {
      for (const table of tablesToClear) {
        try {
          const result = this.db.prepare(`DELETE FROM "${table}"`).run();
          deleted[table] = result.changes;
        } catch {
          deleted[table] = 0;
        }
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { deleted };
  }

  // ========================================================================
  // DEVICES & ENROLLMENT
  // ========================================================================
  async getDevices(filters?: { enterpriseId?: string; propertyId?: string; deviceType?: string; status?: string }): Promise<Device[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters?.enterpriseId) { conds.push("enterprise_id = ?"); params.push(filters.enterpriseId); }
    if (filters?.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters?.deviceType) { conds.push("device_type = ?"); params.push(filters.deviceType); }
    if (filters?.status) { conds.push("status = ?"); params.push(filters.status); }
    return this.getAll("devices", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getDevice(id: string): Promise<Device | undefined> { return this.getById("devices", id); }
  async getDeviceByDeviceId(deviceId: string): Promise<Device | undefined> {
    const rows = this.getAll<Device>("devices", "device_id = ?", [deviceId]);
    return rows[0];
  }
  async createDevice(data: InsertDevice): Promise<Device> { return this.insertOne("devices", { ...data }); }
  async updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined> { return this.updateOne("devices", id, data); }
  async deleteDevice(id: string): Promise<boolean> { return this.deleteOne("devices", id); }
  async updateDeviceLastSeen(id: string): Promise<void> {
    this.db.prepare(`UPDATE "devices" SET last_seen_at = ? WHERE id = ?`).run(now(), id);
  }

  async getDeviceEnrollmentTokens(enterpriseId?: string): Promise<DeviceEnrollmentToken[]> {
    if (enterpriseId) return this.getAll("device_enrollment_tokens", "enterprise_id = ?", [enterpriseId]);
    return this.getAll("device_enrollment_tokens");
  }
  async getDeviceEnrollmentToken(id: string): Promise<DeviceEnrollmentToken | undefined> { return this.getById("device_enrollment_tokens", id); }
  async getDeviceEnrollmentTokenByToken(token: string): Promise<DeviceEnrollmentToken | undefined> {
    const rows = this.getAll<DeviceEnrollmentToken>("device_enrollment_tokens", "token = ?", [token]);
    return rows[0];
  }
  async createDeviceEnrollmentToken(data: InsertDeviceEnrollmentToken): Promise<DeviceEnrollmentToken> { return this.insertOne("device_enrollment_tokens", { ...data }); }
  async deleteDeviceEnrollmentToken(id: string): Promise<boolean> { return this.deleteOne("device_enrollment_tokens", id); }
  async useDeviceEnrollmentToken(token: string): Promise<DeviceEnrollmentToken | undefined> {
    const t = await this.getDeviceEnrollmentTokenByToken(token);
    if (!t) return undefined;
    this.db.prepare(`UPDATE "device_enrollment_tokens" SET uses_remaining = uses_remaining - 1 WHERE id = ? AND uses_remaining > 0`).run(t.id);
    return this.getById("device_enrollment_tokens", t.id);
  }

  async createDeviceHeartbeat(data: InsertDeviceHeartbeat): Promise<DeviceHeartbeat> { return this.insertOne("device_heartbeats", { ...data }); }
  async getDeviceHeartbeats(deviceId: string, limit?: number): Promise<DeviceHeartbeat[]> {
    const sql = `SELECT * FROM "device_heartbeats" WHERE device_id = ? ORDER BY created_at DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(deviceId, limit || 10);
    return transformRowsFromDb(rows);
  }

  // ========================================================================
  // REFUNDS
  // ========================================================================
  async getRefunds(rvcId?: string): Promise<Refund[]> {
    if (rvcId) return this.getAll("refunds", "rvc_id = ?", [rvcId]);
    return this.getAll("refunds");
  }
  async getRefundsForCheck(checkId: string): Promise<Refund[]> { return this.getAll("refunds", "original_check_id = ?", [checkId]); }
  async getRefund(id: string): Promise<Refund | undefined> { return this.getById("refunds", id); }
  async getRefundWithDetails(id: string): Promise<{ refund: Refund; items: RefundItem[]; payments: RefundPayment[] } | undefined> {
    const refund = await this.getRefund(id);
    if (!refund) return undefined;
    const items = this.getAll<RefundItem>("refund_items", "refund_id = ?", [id]);
    const payments = this.getAll<RefundPayment>("refund_payments", "refund_id = ?", [id]);
    return { refund, items, payments };
  }
  async createRefund(data: InsertRefund, items: Omit<InsertRefundItem, 'refundId'>[], payments: Omit<InsertRefundPayment, 'refundId'>[]): Promise<Refund> {
    const refund = this.insertOne<Refund>("refunds", { ...data });
    for (const item of items) this.insertOne("refund_items", { ...item, refundId: refund.id });
    for (const payment of payments) this.insertOne("refund_payments", { ...payment, refundId: refund.id });
    return refund;
  }
  async getAllRefundItems(): Promise<RefundItem[]> { return this.getAll("refund_items"); }
  async getNextRefundNumber(rvcId: string): Promise<number> {
    const row = this.db.prepare(`SELECT MAX(refund_number) as max_num FROM "refunds" WHERE rvc_id = ?`).get(rvcId) as any;
    return (row?.max_num || 0) + 1;
  }
  async getClosedChecks(rvcId: string, options?: { businessDate?: string; checkNumber?: number; limit?: number }): Promise<Check[]> {
    const conds = ["rvc_id = ?", "status = 'closed'"];
    const params: any[] = [rvcId];
    if (options?.businessDate) { conds.push("business_date = ?"); params.push(options.businessDate); }
    if (options?.checkNumber) { conds.push("check_number = ?"); params.push(options.checkNumber); }
    let sql = `SELECT * FROM "checks" WHERE ${conds.join(" AND ")} ORDER BY closed_at DESC`;
    if (options?.limit) sql += ` LIMIT ${options.limit}`;
    return this.db.prepare(sql).all(...params).map(r => transformRowFromDb(r, "checks"));
  }
  async getCheckWithPaymentsAndItems(checkId: string): Promise<{ check: Check; items: CheckItem[]; payments: CheckPayment[] } | undefined> {
    const check = await this.getCheck(checkId);
    if (!check) return undefined;
    return { check, items: await this.getCheckItems(checkId), payments: await this.getPayments(checkId) };
  }

  // ========================================================================
  // TIME & ATTENDANCE - Job Codes, Time Punches, etc.
  // ========================================================================
  async getJobCodes(propertyId?: string): Promise<JobCode[]> {
    if (propertyId) return this.getAll("job_codes", "property_id = ?", [propertyId]);
    return this.getAll("job_codes");
  }
  async getJobCode(id: string): Promise<JobCode | undefined> { return this.getById("job_codes", id); }
  async createJobCode(data: InsertJobCode): Promise<JobCode> { return this.insertOne("job_codes", { ...data }); }
  async updateJobCode(id: string, data: Partial<InsertJobCode>): Promise<JobCode | undefined> { return this.updateOne("job_codes", id, data); }
  async deleteJobCode(id: string): Promise<boolean> { return this.deleteOne("job_codes", id); }

  async getEmployeeJobCodes(employeeId: string): Promise<EmployeeJobCode[]> {
    return this.getAll("employee_job_codes", "employee_id = ?", [employeeId]);
  }
  async getEmployeeJobCodesWithDetails(employeeId: string): Promise<(EmployeeJobCode & { jobCode: JobCode })[]> {
    const ejcs = await this.getEmployeeJobCodes(employeeId);
    return ejcs.map(ejc => {
      const jc = this.getById<JobCode>("job_codes", ejc.jobCodeId);
      return { ...ejc, jobCode: jc! };
    }).filter(e => e.jobCode);
  }
  async getAllEmployeeJobCodesForProperty(propertyId: string): Promise<Record<string, (EmployeeJobCode & { jobCode: JobCode })[]>> {
    const jobCodes = await this.getJobCodes(propertyId);
    const jcIds = jobCodes.map(jc => jc.id);
    if (!jcIds.length) return {};
    const allEjcs = this.getAll<EmployeeJobCode>("employee_job_codes", `job_code_id IN (${jcIds.map(() => "?").join(",")})`, jcIds);
    const result: Record<string, (EmployeeJobCode & { jobCode: JobCode })[]> = {};
    for (const ejc of allEjcs) {
      const jc = jobCodes.find(j => j.id === ejc.jobCodeId)!;
      if (!result[ejc.employeeId]) result[ejc.employeeId] = [];
      result[ejc.employeeId].push({ ...ejc, jobCode: jc });
    }
    return result;
  }
  async setEmployeeJobCodes(employeeId: string, assignments: { jobCodeId: string; payRate?: string; isPrimary?: boolean; bypassClockIn?: boolean }[]): Promise<EmployeeJobCode[]> {
    this.db.prepare(`DELETE FROM "employee_job_codes" WHERE employee_id = ?`).run(employeeId);
    for (const a of assignments) {
      this.insertOne("employee_job_codes", { employeeId, ...a });
    }
    return this.getAll("employee_job_codes", "employee_id = ?", [employeeId]);
  }

  async getPayPeriods(propertyId: string): Promise<PayPeriod[]> { return this.getAll("pay_periods", "property_id = ?", [propertyId]); }
  async getPayPeriod(id: string): Promise<PayPeriod | undefined> { return this.getById("pay_periods", id); }
  async getPayPeriodForDate(propertyId: string, date: string): Promise<PayPeriod | undefined> {
    const rows = this.getAll<PayPeriod>("pay_periods", "property_id = ? AND start_date <= ? AND end_date >= ?", [propertyId, date, date]);
    return rows[0];
  }
  async createPayPeriod(data: InsertPayPeriod): Promise<PayPeriod> { return this.insertOne("pay_periods", { ...data }); }
  async updatePayPeriod(id: string, data: Partial<InsertPayPeriod>): Promise<PayPeriod | undefined> { return this.updateOne("pay_periods", id, data); }
  async lockPayPeriod(id: string, lockedById: string): Promise<PayPeriod | undefined> {
    return this.updateOne("pay_periods", id, { status: "locked", lockedAt: now(), lockedBy: lockedById } as any);
  }
  async unlockPayPeriod(id: string, reason: string, unlockedById: string): Promise<PayPeriod | undefined> {
    return this.updateOne("pay_periods", id, { status: "open", lockedAt: null, lockedBy: null } as any);
  }

  async getTimePunches(filters: { propertyId?: string; employeeId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<TimePunch[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.employeeId) { conds.push("employee_id = ?"); params.push(filters.employeeId); }
    if (filters.businessDate) { conds.push("business_date = ?"); params.push(filters.businessDate); }
    if (filters.startDate) { conds.push("business_date >= ?"); params.push(filters.startDate); }
    if (filters.endDate) { conds.push("business_date <= ?"); params.push(filters.endDate); }
    return this.getAll("time_punches", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getTimePunch(id: string): Promise<TimePunch | undefined> { return this.getById("time_punches", id); }
  async getLastPunch(employeeId: string): Promise<TimePunch | undefined> {
    const row = this.db.prepare(`SELECT * FROM "time_punches" WHERE employee_id = ? ORDER BY clock_in DESC LIMIT 1`).get(employeeId);
    return row ? transformRowFromDb(row, "time_punches") : undefined;
  }
  async getActiveTimePunches(propertyId: string): Promise<TimePunch[]> {
    return this.getAll("time_punches", "property_id = ? AND clock_out IS NULL AND is_voided = 0", [propertyId]);
  }
  async createTimePunch(data: InsertTimePunch): Promise<TimePunch> { return this.insertOne("time_punches", { ...data }); }
  async updateTimePunch(id: string, data: Partial<InsertTimePunch>, editedById?: string, editReason?: string, editedByEmcUserId?: string, editedByDisplayName?: string): Promise<TimePunch | undefined> {
    return this.updateOne("time_punches", id, data);
  }
  async voidTimePunch(id: string, voidedById: string, voidReason: string): Promise<TimePunch | undefined> {
    return this.updateOne("time_punches", id, { isVoided: true, voidedBy: voidedById, voidReason } as any);
  }

  async getBreakSessions(filters: { propertyId?: string; employeeId?: string; businessDate?: string }): Promise<BreakSession[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.employeeId) { conds.push("employee_id = ?"); params.push(filters.employeeId); }
    if (filters.businessDate) { conds.push("business_date = ?"); params.push(filters.businessDate); }
    return this.getAll("break_sessions", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getBreakSession(id: string): Promise<BreakSession | undefined> { return this.getById("break_sessions", id); }
  async getActiveBreak(employeeId: string): Promise<BreakSession | undefined> {
    const rows = this.getAll<BreakSession>("break_sessions", "employee_id = ? AND end_time IS NULL", [employeeId]);
    return rows[0];
  }
  async createBreakSession(data: InsertBreakSession): Promise<BreakSession> { return this.insertOne("break_sessions", { ...data }); }
  async updateBreakSession(id: string, data: Partial<InsertBreakSession>): Promise<BreakSession | undefined> { return this.updateOne("break_sessions", id, data); }

  async getTimecards(filters: { propertyId?: string; employeeId?: string; payPeriodId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<Timecard[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.employeeId) { conds.push("employee_id = ?"); params.push(filters.employeeId); }
    if (filters.payPeriodId) { conds.push("pay_period_id = ?"); params.push(filters.payPeriodId); }
    if (filters.businessDate) { conds.push("business_date = ?"); params.push(filters.businessDate); }
    if (filters.startDate) { conds.push("business_date >= ?"); params.push(filters.startDate); }
    if (filters.endDate) { conds.push("business_date <= ?"); params.push(filters.endDate); }
    return this.getAll("timecards", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getTimecard(id: string): Promise<Timecard | undefined> { return this.getById("timecards", id); }
  async createTimecard(data: InsertTimecard): Promise<Timecard> { return this.insertOne("timecards", { ...data }); }
  async updateTimecard(id: string, data: Partial<InsertTimecard>): Promise<Timecard | undefined> { return this.updateOne("timecards", id, data); }
  async recalculateTimecard(employeeId: string, businessDate: string): Promise<Timecard | undefined> {
    const rows = this.getAll<Timecard>("timecards", "employee_id = ? AND business_date = ?", [employeeId, businessDate]);
    return rows[0];
  }

  async getTimecardExceptions(filters: { propertyId?: string; employeeId?: string; status?: string }): Promise<TimecardException[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.employeeId) { conds.push("employee_id = ?"); params.push(filters.employeeId); }
    if (filters.status) { conds.push("status = ?"); params.push(filters.status); }
    return this.getAll("timecard_exceptions", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getTimecardException(id: string): Promise<TimecardException | undefined> { return this.getById("timecard_exceptions", id); }
  async createTimecardException(data: InsertTimecardException): Promise<TimecardException> { return this.insertOne("timecard_exceptions", { ...data }); }
  async resolveTimecardException(id: string, resolvedById: string, resolutionNotes: string): Promise<TimecardException | undefined> {
    return this.updateOne("timecard_exceptions", id, { status: "resolved", resolvedById, resolutionNotes, resolvedAt: now() } as any);
  }

  async getTimecardEdits(filters: { propertyId?: string; targetType?: string; targetId?: string }): Promise<TimecardEdit[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.targetType) { conds.push("target_type = ?"); params.push(filters.targetType); }
    if (filters.targetId) { conds.push("target_id = ?"); params.push(filters.targetId); }
    return this.getAll("timecard_edits", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async createTimecardEdit(data: InsertTimecardEdit): Promise<TimecardEdit> { return this.insertOne("timecard_edits", { ...data }); }

  // ========================================================================
  // SCHEDULING
  // ========================================================================
  async getEmployeeAvailability(employeeId: string): Promise<EmployeeAvailability[]> { return this.getAll("employee_availability", "employee_id = ?", [employeeId]); }
  async setEmployeeAvailability(employeeId: string, availability: InsertEmployeeAvailability[]): Promise<EmployeeAvailability[]> {
    this.db.prepare(`DELETE FROM "employee_availability" WHERE employee_id = ?`).run(employeeId);
    for (const a of availability) this.insertOne("employee_availability", { ...a, employeeId });
    return this.getAll("employee_availability", "employee_id = ?", [employeeId]);
  }

  async getAvailabilityExceptions(employeeId: string, startDate?: string, endDate?: string): Promise<AvailabilityException[]> {
    const conds = ["employee_id = ?"];
    const params: any[] = [employeeId];
    if (startDate) { conds.push("date >= ?"); params.push(startDate); }
    if (endDate) { conds.push("date <= ?"); params.push(endDate); }
    return this.getAll("availability_exceptions", conds.join(" AND "), params);
  }
  async createAvailabilityException(data: InsertAvailabilityException): Promise<AvailabilityException> { return this.insertOne("availability_exceptions", { ...data }); }
  async deleteAvailabilityException(id: string): Promise<boolean> { return this.deleteOne("availability_exceptions", id); }

  async getTimeOffRequests(filters: { employeeId?: string; propertyId?: string; status?: string }): Promise<TimeOffRequest[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.employeeId) { conds.push("employee_id = ?"); params.push(filters.employeeId); }
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.status) { conds.push("status = ?"); params.push(filters.status); }
    return this.getAll("time_off_requests", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getTimeOffRequest(id: string): Promise<TimeOffRequest | undefined> { return this.getById("time_off_requests", id); }
  async createTimeOffRequest(data: InsertTimeOffRequest): Promise<TimeOffRequest> { return this.insertOne("time_off_requests", { ...data }); }
  async updateTimeOffRequest(id: string, data: Partial<InsertTimeOffRequest>): Promise<TimeOffRequest | undefined> { return this.updateOne("time_off_requests", id, data); }
  async reviewTimeOffRequest(id: string, reviewedById: string, approved: boolean, notes?: string): Promise<TimeOffRequest | undefined> {
    return this.updateOne("time_off_requests", id, { status: approved ? "approved" : "denied", reviewedById, reviewNotes: notes, reviewedAt: now() } as any);
  }

  async getShiftTemplates(propertyId: string): Promise<ShiftTemplate[]> { return this.getAll("shift_templates", "property_id = ?", [propertyId]); }
  async getShiftTemplate(id: string): Promise<ShiftTemplate | undefined> { return this.getById("shift_templates", id); }
  async createShiftTemplate(data: InsertShiftTemplate): Promise<ShiftTemplate> { return this.insertOne("shift_templates", { ...data }); }
  async updateShiftTemplate(id: string, data: Partial<InsertShiftTemplate>): Promise<ShiftTemplate | undefined> { return this.updateOne("shift_templates", id, data); }
  async deleteShiftTemplate(id: string): Promise<boolean> { return this.deleteOne("shift_templates", id); }

  async getShifts(filters: { propertyId?: string; rvcId?: string; employeeId?: string; startDate?: string; endDate?: string; status?: string }): Promise<Shift[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.rvcId) { conds.push("rvc_id = ?"); params.push(filters.rvcId); }
    if (filters.employeeId) { conds.push("employee_id = ?"); params.push(filters.employeeId); }
    if (filters.startDate) { conds.push("shift_date >= ?"); params.push(filters.startDate); }
    if (filters.endDate) { conds.push("shift_date <= ?"); params.push(filters.endDate); }
    if (filters.status) { conds.push("status = ?"); params.push(filters.status); }
    return this.getAll("shifts", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getShift(id: string): Promise<Shift | undefined> { return this.getById("shifts", id); }
  async createShift(data: InsertShift): Promise<Shift> { return this.insertOne("shifts", { ...data }); }
  async updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined> { return this.updateOne("shifts", id, data); }
  async deleteShift(id: string): Promise<boolean> { return this.deleteOne("shifts", id); }
  async publishShifts(shiftIds: string[], publishedById: string | null): Promise<Shift[]> {
    for (const id of shiftIds) {
      this.db.prepare(`UPDATE "shifts" SET status = 'published', published_at = ? WHERE id = ?`).run(now(), id);
    }
    if (!shiftIds.length) return [];
    return this.getAll("shifts", `id IN (${shiftIds.map(() => "?").join(",")})`, shiftIds);
  }
  async copyWeekSchedule(propertyId: string, sourceWeekStart: string, targetWeekStart: string): Promise<Shift[]> {
    const sourceShifts = this.getAll<any>("shifts", "property_id = ? AND week_start = ?", [propertyId, sourceWeekStart]);
    const created: Shift[] = [];
    for (const shift of sourceShifts) {
      const { id, createdAt, updatedAt, publishedAt, status, ...rest } = shift;
      const newShift = this.insertOne<Shift>("shifts", { ...rest, weekStart: targetWeekStart, status: "draft" });
      created.push(newShift);
    }
    return created;
  }

  async getShiftCoverRequests(filters: { shiftId?: string; requesterId?: string; status?: string }): Promise<ShiftCoverRequest[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.shiftId) { conds.push("shift_id = ?"); params.push(filters.shiftId); }
    if (filters.requesterId) { conds.push("requester_id = ?"); params.push(filters.requesterId); }
    if (filters.status) { conds.push("status = ?"); params.push(filters.status); }
    return this.getAll("shift_cover_requests", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getShiftCoverRequest(id: string): Promise<ShiftCoverRequest | undefined> { return this.getById("shift_cover_requests", id); }
  async createShiftCoverRequest(data: InsertShiftCoverRequest): Promise<ShiftCoverRequest> { return this.insertOne("shift_cover_requests", { ...data }); }
  async updateShiftCoverRequest(id: string, data: Partial<InsertShiftCoverRequest>): Promise<ShiftCoverRequest | undefined> { return this.updateOne("shift_cover_requests", id, data); }

  async getShiftCoverOffers(coverRequestId: string): Promise<ShiftCoverOffer[]> {
    return this.getAll("shift_cover_offers", "cover_request_id = ?", [coverRequestId]);
  }
  async createShiftCoverOffer(data: InsertShiftCoverOffer): Promise<ShiftCoverOffer> { return this.insertOne("shift_cover_offers", { ...data }); }
  async updateShiftCoverOffer(id: string, data: Partial<InsertShiftCoverOffer>): Promise<ShiftCoverOffer | undefined> { return this.updateOne("shift_cover_offers", id, data); }

  async approveShiftCover(coverRequestId: string, offerId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval> {
    return this.insertOne("shift_cover_approvals", { coverRequestId, offerId, approvedById, notes, decision: "approved" });
  }
  async denyShiftCover(coverRequestId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval> {
    return this.insertOne("shift_cover_approvals", { coverRequestId, approvedById, notes, decision: "denied" });
  }

  // ========================================================================
  // TIP POOLING
  // ========================================================================
  async getTipPoolPolicies(propertyId: string): Promise<TipPoolPolicy[]> { return this.getAll("tip_pool_policies", "property_id = ?", [propertyId]); }
  async getTipPoolPolicy(id: string): Promise<TipPoolPolicy | undefined> { return this.getById("tip_pool_policies", id); }
  async createTipPoolPolicy(data: InsertTipPoolPolicy): Promise<TipPoolPolicy> { return this.insertOne("tip_pool_policies", { ...data }); }
  async updateTipPoolPolicy(id: string, data: Partial<InsertTipPoolPolicy>): Promise<TipPoolPolicy | undefined> { return this.updateOne("tip_pool_policies", id, data); }
  async deleteTipPoolPolicy(id: string): Promise<boolean> { return this.deleteOne("tip_pool_policies", id); }

  async getTipPoolRuns(filters: { propertyId?: string; businessDate?: string }): Promise<TipPoolRun[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.businessDate) { conds.push("business_date = ?"); params.push(filters.businessDate); }
    return this.getAll("tip_pool_runs", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getTipPoolRun(id: string): Promise<TipPoolRun | undefined> { return this.getById("tip_pool_runs", id); }
  async createTipPoolRun(data: InsertTipPoolRun): Promise<TipPoolRun> { return this.insertOne("tip_pool_runs", { ...data }); }
  async updateTipPoolRun(id: string, data: Partial<InsertTipPoolRun>): Promise<TipPoolRun | undefined> { return this.updateOne("tip_pool_runs", id, data); }

  async getTipAllocations(tipPoolRunId: string): Promise<TipAllocation[]> { return this.getAll("tip_allocations", "tip_pool_run_id = ?", [tipPoolRunId]); }
  async createTipAllocation(data: InsertTipAllocation): Promise<TipAllocation> { return this.insertOne("tip_allocations", { ...data }); }
  async runTipPoolSettlement(propertyId: string, businessDate: string, policyId: string, runById: string): Promise<{ run: TipPoolRun; allocations: TipAllocation[] }> {
    const run = await this.createTipPoolRun({ propertyId, businessDate, policyId, runById, status: "completed", totalTips: "0" } as any);
    return { run, allocations: [] };
  }

  // ========================================================================
  // TIP RULES
  // ========================================================================
  async getTipRules(filters: { enterpriseId?: string; propertyId?: string; rvcId?: string }): Promise<TipRule[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.enterpriseId) { conds.push("enterprise_id = ?"); params.push(filters.enterpriseId); }
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.rvcId) { conds.push("rvc_id = ?"); params.push(filters.rvcId); }
    return this.getAll("tip_rules", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async getTipRule(id: string): Promise<TipRule | undefined> { return this.getById("tip_rules", id); }
  async getTipRuleForProperty(propertyId: string): Promise<TipRule | undefined> {
    const rows = this.getAll<TipRule>("tip_rules", "property_id = ? AND active = 1", [propertyId]);
    return rows[0];
  }
  async createTipRule(data: InsertTipRule): Promise<TipRule> { return this.insertOne("tip_rules", { ...data }); }
  async updateTipRule(id: string, data: Partial<InsertTipRule>): Promise<TipRule | undefined> { return this.updateOne("tip_rules", id, data); }
  async deleteTipRule(id: string): Promise<boolean> { return this.deleteOne("tip_rules", id); }

  async getTipRuleJobPercentages(tipRuleId: string): Promise<TipRuleJobPercentage[]> {
    return this.getAll("tip_rule_job_percentages", "tip_rule_id = ?", [tipRuleId]);
  }
  async upsertTipRuleJobPercentages(tipRuleId: string, percentages: Array<{ jobCodeId: string; percentage: string }>): Promise<TipRuleJobPercentage[]> {
    this.db.prepare(`DELETE FROM "tip_rule_job_percentages" WHERE tip_rule_id = ?`).run(tipRuleId);
    for (const p of percentages) {
      this.insertOne("tip_rule_job_percentages", { tipRuleId, ...p });
    }
    return this.getAll("tip_rule_job_percentages", "tip_rule_id = ?", [tipRuleId]);
  }

  // ========================================================================
  // LABOR SNAPSHOTS
  // ========================================================================
  async getLaborSnapshots(filters: { propertyId?: string; rvcId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<LaborSnapshot[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filters.propertyId) { conds.push("property_id = ?"); params.push(filters.propertyId); }
    if (filters.businessDate) { conds.push("business_date = ?"); params.push(filters.businessDate); }
    if (filters.startDate) { conds.push("business_date >= ?"); params.push(filters.startDate); }
    if (filters.endDate) { conds.push("business_date <= ?"); params.push(filters.endDate); }
    return this.getAll("labor_snapshots", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async createLaborSnapshot(data: InsertLaborSnapshot): Promise<LaborSnapshot> { return this.insertOne("labor_snapshots", { ...data }); }
  async updateLaborSnapshot(id: string, data: Partial<InsertLaborSnapshot>): Promise<LaborSnapshot | undefined> { return this.updateOne("labor_snapshots", id, data); }
  async calculateLaborSnapshot(propertyId: string, businessDate: string): Promise<LaborSnapshot> {
    return this.insertOne("labor_snapshots", { propertyId, businessDate, totalLabor: "0", totalSales: "0", laborCostPct: "0" } as any);
  }

  // ========================================================================
  // OVERTIME, BREAK RULES, MINOR LABOR
  // ========================================================================
  async getOvertimeRules(propertyId: string): Promise<OvertimeRule[]> { return this.getAll("overtime_rules", "property_id = ?", [propertyId]); }
  async getOvertimeRule(id: string): Promise<OvertimeRule | undefined> { return this.getById("overtime_rules", id); }
  async getActiveOvertimeRule(propertyId: string): Promise<OvertimeRule | undefined> {
    const rows = this.getAll<OvertimeRule>("overtime_rules", "property_id = ? AND active = 1", [propertyId]);
    return rows[0];
  }
  async createOvertimeRule(data: InsertOvertimeRule): Promise<OvertimeRule> { return this.insertOne("overtime_rules", { ...data }); }
  async updateOvertimeRule(id: string, data: Partial<InsertOvertimeRule>): Promise<OvertimeRule | undefined> { return this.updateOne("overtime_rules", id, data); }
  async deleteOvertimeRule(id: string): Promise<boolean> { return this.deleteOne("overtime_rules", id); }

  async getBreakRules(propertyId: string): Promise<BreakRule[]> { return this.getAll("break_rules", "property_id = ?", [propertyId]); }
  async getBreakRule(id: string): Promise<BreakRule | undefined> { return this.getById("break_rules", id); }
  async getActiveBreakRule(propertyId: string): Promise<BreakRule | undefined> {
    const rows = this.getAll<BreakRule>("break_rules", "property_id = ? AND active = 1", [propertyId]);
    return rows[0];
  }
  async createBreakRule(data: InsertBreakRule): Promise<BreakRule> { return this.insertOne("break_rules", { ...data }); }
  async updateBreakRule(id: string, data: Partial<InsertBreakRule>): Promise<BreakRule | undefined> { return this.updateOne("break_rules", id, data); }
  async deleteBreakRule(id: string): Promise<boolean> { return this.deleteOne("break_rules", id); }

  async getBreakAttestations(propertyId: string, businessDate?: string): Promise<BreakAttestation[]> {
    if (businessDate) return this.getAll("break_attestations", "property_id = ? AND business_date = ?", [propertyId, businessDate]);
    return this.getAll("break_attestations", "property_id = ?", [propertyId]);
  }
  async getBreakAttestationsByEmployee(employeeId: string, businessDate?: string): Promise<BreakAttestation[]> {
    if (businessDate) return this.getAll("break_attestations", "employee_id = ? AND business_date = ?", [employeeId, businessDate]);
    return this.getAll("break_attestations", "employee_id = ?", [employeeId]);
  }
  async createBreakAttestation(data: InsertBreakAttestation): Promise<BreakAttestation> { return this.insertOne("break_attestations", { ...data }); }

  async getBreakViolations(propertyId: string, options?: { businessDate?: string; startDate?: string; endDate?: string; status?: string }): Promise<BreakViolation[]> {
    const conds = ["property_id = ?"];
    const params: any[] = [propertyId];
    if (options?.businessDate) { conds.push("business_date = ?"); params.push(options.businessDate); }
    if (options?.startDate) { conds.push("business_date >= ?"); params.push(options.startDate); }
    if (options?.endDate) { conds.push("business_date <= ?"); params.push(options.endDate); }
    if (options?.status) { conds.push("status = ?"); params.push(options.status); }
    return this.getAll("break_violations", conds.join(" AND "), params);
  }
  async getBreakViolationsByEmployee(employeeId: string): Promise<BreakViolation[]> { return this.getAll("break_violations", "employee_id = ?", [employeeId]); }
  async createBreakViolation(data: InsertBreakViolation): Promise<BreakViolation> { return this.insertOne("break_violations", { ...data }); }
  async updateBreakViolation(id: string, data: Partial<InsertBreakViolation>): Promise<BreakViolation | undefined> { return this.updateOne("break_violations", id, data); }
  async acknowledgeBreakViolation(id: string, acknowledgedById: string): Promise<BreakViolation | undefined> {
    return this.updateOne("break_violations", id, { status: "acknowledged", acknowledgedById, acknowledgedAt: now() } as any);
  }

  async getMinorLaborRules(propertyId: string): Promise<MinorLaborRule[]> { return this.getAll("minor_labor_rules", "property_id = ?", [propertyId]); }
  async getActiveMinorLaborRule(propertyId: string): Promise<MinorLaborRule | undefined> {
    const rows = this.getAll<MinorLaborRule>("minor_labor_rules", "property_id = ? AND active = 1", [propertyId]);
    return rows[0];
  }
  async createMinorLaborRule(data: InsertMinorLaborRule): Promise<MinorLaborRule> { return this.insertOne("minor_labor_rules", { ...data }); }
  async updateMinorLaborRule(id: string, data: Partial<InsertMinorLaborRule>): Promise<MinorLaborRule | undefined> { return this.updateOne("minor_labor_rules", id, data); }

  async getEmployeeMinorStatus(employeeId: string): Promise<EmployeeMinorStatus | undefined> {
    const rows = this.getAll<EmployeeMinorStatus>("employee_minor_status", "employee_id = ?", [employeeId]);
    return rows[0];
  }
  async getEmployeeMinorStatusesByProperty(propertyId: string): Promise<EmployeeMinorStatus[]> {
    return this.getAll("employee_minor_status", "property_id = ?", [propertyId]);
  }
  async createEmployeeMinorStatus(data: InsertEmployeeMinorStatus): Promise<EmployeeMinorStatus> { return this.insertOne("employee_minor_status", { ...data }); }
  async updateEmployeeMinorStatus(id: string, data: Partial<InsertEmployeeMinorStatus>): Promise<EmployeeMinorStatus | undefined> { return this.updateOne("employee_minor_status", id, data); }
  async deleteEmployeeMinorStatus(id: string): Promise<boolean> { return this.deleteOne("employee_minor_status", id); }

  // ========================================================================
  // LOYALTY, GIFT CARDS, FISCAL, CASH, etc.
  // ========================================================================
  async getLoyaltyPrograms(enterpriseId?: string, propertyId?: string): Promise<LoyaltyProgram[]> {
    if (enterpriseId) return this.getAll("loyalty_programs", "enterprise_id = ?", [enterpriseId]);
    return this.getAll("loyalty_programs");
  }
  async createLoyaltyProgram(data: InsertLoyaltyProgram): Promise<LoyaltyProgram> { return this.insertOne("loyalty_programs", { ...data }); }
  async updateLoyaltyProgram(id: string, data: Partial<InsertLoyaltyProgram>): Promise<LoyaltyProgram | undefined> { return this.updateOne("loyalty_programs", id, data); }

  async getLoyaltyMembers(search?: string, enterpriseId?: string, propertyId?: string): Promise<LoyaltyMember[]> {
    if (search) {
      const s = `%${search}%`;
      return this.getAll("loyalty_members", "LOWER(first_name) LIKE LOWER(?) OR LOWER(last_name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) OR phone LIKE ?", [s, s, s, s]);
    }
    return this.getAll("loyalty_members");
  }
  async getLoyaltyMember(id: string): Promise<LoyaltyMember | undefined> { return this.getById("loyalty_members", id); }
  async getLoyaltyMemberWithEnrollments(id: string): Promise<LoyaltyMemberWithEnrollments | undefined> {
    const member = await this.getLoyaltyMember(id);
    if (!member) return undefined;
    const enrollments = this.getAll<LoyaltyMemberEnrollment>("loyalty_member_enrollments", "member_id = ?", [id]);
    return { ...member, enrollments } as LoyaltyMemberWithEnrollments;
  }
  async getLoyaltyMemberByIdentifier(identifier: string): Promise<LoyaltyMember | undefined> {
    const rows = this.getAll<LoyaltyMember>("loyalty_members", "loyalty_card_number = ? OR phone = ? OR email = ?", [identifier, identifier, identifier]);
    return rows[0];
  }
  async createLoyaltyMember(data: InsertLoyaltyMember): Promise<LoyaltyMember> { return this.insertOne("loyalty_members", { ...data }); }
  async updateLoyaltyMember(id: string, data: Partial<InsertLoyaltyMember>): Promise<LoyaltyMember | undefined> { return this.updateOne("loyalty_members", id, data); }

  async getLoyaltyEnrollments(memberId: string): Promise<LoyaltyMemberEnrollment[]> { return this.getAll("loyalty_member_enrollments", "member_id = ?", [memberId]); }
  async getLoyaltyEnrollmentsByProgram(programId: string): Promise<LoyaltyMemberEnrollment[]> { return this.getAll("loyalty_member_enrollments", "program_id = ?", [programId]); }
  async getLoyaltyEnrollment(id: string): Promise<LoyaltyMemberEnrollment | undefined> { return this.getById("loyalty_member_enrollments", id); }
  async createLoyaltyEnrollment(data: InsertLoyaltyMemberEnrollment): Promise<LoyaltyMemberEnrollment> { return this.insertOne("loyalty_member_enrollments", { ...data }); }
  async updateLoyaltyEnrollment(id: string, data: Partial<InsertLoyaltyMemberEnrollment>): Promise<LoyaltyMemberEnrollment | undefined> { return this.updateOne("loyalty_member_enrollments", id, data); }

  async createLoyaltyTransaction(data: InsertLoyaltyTransaction): Promise<LoyaltyTransaction> { return this.insertOne("loyalty_transactions", { ...data }); }
  async getLoyaltyTransactionsByMember(memberId: string): Promise<LoyaltyTransaction[]> { return this.getAll("loyalty_transactions", "member_id = ?", [memberId]); }
  async getLoyaltyTransactionsByEnrollment(enrollmentId: string): Promise<LoyaltyTransaction[]> { return this.getAll("loyalty_transactions", "enrollment_id = ?", [enrollmentId]); }

  async getLoyaltyRewards(programId?: string): Promise<LoyaltyReward[]> {
    if (programId) return this.getAll("loyalty_rewards", "program_id = ?", [programId]);
    return this.getAll("loyalty_rewards");
  }
  async getLoyaltyReward(id: string): Promise<LoyaltyReward | undefined> { return this.getById("loyalty_rewards", id); }
  async createLoyaltyReward(data: InsertLoyaltyReward): Promise<LoyaltyReward> { return this.insertOne("loyalty_rewards", { ...data }); }
  async updateLoyaltyReward(id: string, data: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined> { return this.updateOne("loyalty_rewards", id, data); }

  async getLoyaltyRedemptionsByMember(memberId: string): Promise<LoyaltyRedemption[]> { return this.getAll("loyalty_redemptions", "member_id = ?", [memberId]); }
  async getLoyaltyRedemptionsByCheck(checkId: string): Promise<LoyaltyRedemption[]> { return this.getAll("loyalty_redemptions", "check_id = ?", [checkId]); }
  async createLoyaltyRedemption(data: InsertLoyaltyRedemption): Promise<LoyaltyRedemption> { return this.insertOne("loyalty_redemptions", { ...data }); }

  async getChecksByCustomer(customerId: string, limit?: number): Promise<Check[]> {
    const sql = `SELECT * FROM "checks" WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?`;
    return this.db.prepare(sql).all(customerId, limit || 50).map(r => transformRowFromDb(r, "checks"));
  }
  async attachCustomerToCheck(checkId: string, customerId: string): Promise<Check | undefined> {
    return this.updateOne("checks", checkId, { customerId });
  }
  async detachCustomerFromCheck(checkId: string): Promise<Check | undefined> {
    return this.updateOne("checks", checkId, { customerId: null });
  }

  // ========================================================================
  // DESCRIPTORS
  // ========================================================================
  async getDescriptorSet(scopeType: DescriptorScopeType, scopeId: string): Promise<DescriptorSet | undefined> {
    const rows = this.getAll<DescriptorSet>("descriptor_sets", "scope_type = ? AND scope_id = ?", [scopeType, scopeId]);
    return rows[0];
  }
  async getDescriptorSets(enterpriseId: string): Promise<DescriptorSet[]> { return this.getAll("descriptor_sets", "enterprise_id = ?", [enterpriseId]); }
  async createDescriptorSet(data: InsertDescriptorSet): Promise<DescriptorSet> { return this.insertOne("descriptor_sets", { ...data }); }
  async updateDescriptorSet(id: string, data: Partial<InsertDescriptorSet>): Promise<DescriptorSet | undefined> { return this.updateOne("descriptor_sets", id, data); }
  async deleteDescriptorSet(id: string): Promise<boolean> { return this.deleteOne("descriptor_sets", id); }
  async getEffectiveDescriptors(rvcId: string): Promise<{ headerLines: string[]; trailerLines: string[]; logoEnabled: boolean; logoAssetId: string | null }> {
    const rvcSet = await this.getDescriptorSet("rvc", rvcId);
    if (rvcSet) return { headerLines: rvcSet.headerLines as string[] || [], trailerLines: rvcSet.trailerLines as string[] || [], logoEnabled: !!rvcSet.logoEnabled, logoAssetId: rvcSet.logoAssetId };
    return { headerLines: [], trailerLines: [], logoEnabled: false, logoAssetId: null };
  }

  async getDescriptorLogoAsset(id: string): Promise<DescriptorLogoAsset | undefined> { return this.getById("descriptor_logo_assets", id); }
  async getDescriptorLogoAssets(enterpriseId: string): Promise<DescriptorLogoAsset[]> { return this.getAll("descriptor_logo_assets", "enterprise_id = ?", [enterpriseId]); }
  async createDescriptorLogoAsset(data: InsertDescriptorLogoAsset): Promise<DescriptorLogoAsset> { return this.insertOne("descriptor_logo_assets", { ...data }); }
  async deleteDescriptorLogoAsset(id: string): Promise<boolean> { return this.deleteOne("descriptor_logo_assets", id); }

  // ========================================================================
  // SERVICE HOSTS, CONFIG VERSIONS, etc.
  // ========================================================================
  async getServiceHosts(propertyId?: string): Promise<ServiceHost[]> {
    if (propertyId) return this.getAll("service_hosts", "property_id = ?", [propertyId]);
    return this.getAll("service_hosts");
  }
  async getServiceHost(id: string): Promise<ServiceHost | undefined> { return this.getById("service_hosts", id); }
  async createServiceHost(data: InsertServiceHost): Promise<ServiceHost> { return this.insertOne("service_hosts", { ...data }); }
  async updateServiceHost(id: string, data: Partial<InsertServiceHost>): Promise<ServiceHost | undefined> { return this.updateOne("service_hosts", id, data); }
  async deleteServiceHost(id: string): Promise<boolean> { return this.deleteOne("service_hosts", id); }

  async getLatestConfigVersion(propertyId: string): Promise<number> {
    const row = this.db.prepare(`SELECT MAX(version) as v FROM "config_versions" WHERE property_id = ?`).get(propertyId) as any;
    return row?.v || 0;
  }
  async getConfigChanges(propertyId: string, sinceVersion: number): Promise<ConfigVersion[]> {
    return this.getAll("config_versions", "property_id = ? AND version > ?", [propertyId, sinceVersion]);
  }
  async createConfigVersion(data: InsertConfigVersion): Promise<ConfigVersion> { return this.insertOne("config_versions", { ...data }); }

  async createServiceHostTransaction(data: InsertServiceHostTransaction): Promise<ServiceHostTransaction> { return this.insertOne("service_host_transactions", { ...data }); }
  async getServiceHostTransactions(serviceHostId: string): Promise<ServiceHostTransaction[]> { return this.getAll("service_host_transactions", "service_host_id = ?", [serviceHostId]); }

  async createServiceHostMetrics(data: InsertServiceHostMetrics): Promise<ServiceHostMetrics> { return this.insertOne("service_host_metrics", { ...data }); }
  async getServiceHostMetrics(serviceHostId: string, limit?: number): Promise<ServiceHostMetrics[]> {
    const sql = `SELECT * FROM "service_host_metrics" WHERE service_host_id = ? ORDER BY recorded_at DESC LIMIT ?`;
    return this.db.prepare(sql).all(serviceHostId, limit || 100).map(r => transformRowFromDb(r, "service_host_metrics"));
  }
  async getServiceHostMetricsByProperty(propertyId: string, since?: Date): Promise<ServiceHostMetrics[]> {
    return this.getAll("service_host_metrics");
  }

  async createServiceHostAlert(data: InsertServiceHostAlert): Promise<ServiceHostAlert> { return this.insertOne("service_host_alerts", { ...data }); }
  async getServiceHostAlerts(propertyId?: string, acknowledged?: boolean): Promise<ServiceHostAlert[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (propertyId) { conds.push("property_id = ?"); params.push(propertyId); }
    if (acknowledged !== undefined) { conds.push("acknowledged = ?"); params.push(acknowledged ? 1 : 0); }
    return this.getAll("service_host_alerts", conds.length ? conds.join(" AND ") : undefined, params);
  }
  async acknowledgeServiceHostAlert(id: string, acknowledgedById: string): Promise<ServiceHostAlert | undefined> {
    return this.updateOne("service_host_alerts", id, { acknowledged: true, acknowledgedById, acknowledgedAt: now() } as any);
  }
  async resolveServiceHostAlert(id: string): Promise<ServiceHostAlert | undefined> {
    return this.updateOne("service_host_alerts", id, { resolved: true, resolvedAt: now() } as any);
  }

  async getServiceHostAlertRules(enterpriseId: string): Promise<ServiceHostAlertRule[]> { return this.getAll("service_host_alert_rules", "enterprise_id = ?", [enterpriseId]); }
  async createServiceHostAlertRule(data: InsertServiceHostAlertRule): Promise<ServiceHostAlertRule> { return this.insertOne("service_host_alert_rules", { ...data }); }
  async updateServiceHostAlertRule(id: string, data: Partial<InsertServiceHostAlertRule>): Promise<ServiceHostAlertRule | undefined> { return this.updateOne("service_host_alert_rules", id, data); }
  async deleteServiceHostAlertRule(id: string): Promise<boolean> { return this.deleteOne("service_host_alert_rules", id); }

  // ========================================================================
  // WORKSTATION SERVICE BINDINGS
  // ========================================================================
  async getWorkstationServiceBindings(propertyId: string): Promise<WorkstationServiceBinding[]> { return this.getAll("workstation_service_bindings", "property_id = ?", [propertyId]); }
  async getAllWorkstationServiceBindings(): Promise<WorkstationServiceBinding[]> { return this.getAll("workstation_service_bindings"); }
  async getWorkstationServiceBinding(id: string): Promise<WorkstationServiceBinding | undefined> { return this.getById("workstation_service_bindings", id); }
  async getServiceBindingByType(propertyId: string, serviceType: string): Promise<WorkstationServiceBinding | undefined> {
    const rows = this.getAll<WorkstationServiceBinding>("workstation_service_bindings", "property_id = ? AND service_type = ?", [propertyId, serviceType]);
    return rows[0];
  }
  async getBindingsForWorkstation(workstationId: string): Promise<WorkstationServiceBinding[]> { return this.getAll("workstation_service_bindings", "workstation_id = ?", [workstationId]); }
  async deleteBindingsForWorkstation(workstationId: string): Promise<number> {
    const result = this.db.prepare(`DELETE FROM "workstation_service_bindings" WHERE workstation_id = ?`).run(workstationId);
    return result.changes;
  }
  async deleteOtherBindingsForServiceType(propertyId: string, serviceType: string, keepWorkstationId: string): Promise<number> {
    const result = this.db.prepare(`DELETE FROM "workstation_service_bindings" WHERE property_id = ? AND service_type = ? AND workstation_id != ?`).run(propertyId, serviceType, keepWorkstationId);
    return result.changes;
  }
  async createWorkstationServiceBinding(data: InsertWorkstationServiceBinding): Promise<WorkstationServiceBinding> { return this.insertOne("workstation_service_bindings", { ...data }); }
  async updateWorkstationServiceBinding(id: string, data: Partial<InsertWorkstationServiceBinding>): Promise<WorkstationServiceBinding | undefined> { return this.updateOne("workstation_service_bindings", id, data); }
  async deleteWorkstationServiceBinding(id: string): Promise<boolean> { return this.deleteOne("workstation_service_bindings", id); }

  // ========================================================================
  // CAL PACKAGES
  // ========================================================================
  async getCalPackages(enterpriseId: string): Promise<CalPackage[]> { return this.getAll("cal_packages", "enterprise_id = ?", [enterpriseId]); }
  async getCalPackage(id: string): Promise<CalPackage | undefined> { return this.getById("cal_packages", id); }
  async createCalPackage(data: InsertCalPackage): Promise<CalPackage> { return this.insertOne("cal_packages", { ...data }); }
  async updateCalPackage(id: string, data: Partial<InsertCalPackage>): Promise<CalPackage | undefined> { return this.updateOne("cal_packages", id, data); }
  async deleteCalPackage(id: string): Promise<boolean> { return this.deleteOne("cal_packages", id); }

  async getCalPackageVersions(packageId: string): Promise<CalPackageVersion[]> { return this.getAll("cal_package_versions", "package_id = ?", [packageId]); }
  async getCalPackageVersion(id: string): Promise<CalPackageVersion | undefined> { return this.getById("cal_package_versions", id); }
  async createCalPackageVersion(data: InsertCalPackageVersion): Promise<CalPackageVersion> { return this.insertOne("cal_package_versions", { ...data }); }
  async updateCalPackageVersion(id: string, data: Partial<InsertCalPackageVersion>): Promise<CalPackageVersion | undefined> { return this.updateOne("cal_package_versions", id, data); }
  async deleteCalPackageVersion(id: string): Promise<boolean> { return this.deleteOne("cal_package_versions", id); }

  async getCalPackagePrerequisites(packageVersionId: string): Promise<CalPackagePrerequisite[]> { return this.getAll("cal_package_prerequisites", "package_version_id = ?", [packageVersionId]); }
  async createCalPackagePrerequisite(data: InsertCalPackagePrerequisite): Promise<CalPackagePrerequisite> { return this.insertOne("cal_package_prerequisites", { ...data }); }
  async deleteCalPackagePrerequisite(id: string): Promise<boolean> { return this.deleteOne("cal_package_prerequisites", id); }

  async getCalDeployments(enterpriseId: string): Promise<CalDeployment[]> { return this.getAll("cal_deployments", "enterprise_id = ?", [enterpriseId]); }
  async getCalDeployment(id: string): Promise<CalDeployment | undefined> { return this.getById("cal_deployments", id); }
  async createCalDeployment(data: InsertCalDeployment): Promise<CalDeployment> { return this.insertOne("cal_deployments", { ...data }); }
  async updateCalDeployment(id: string, data: Partial<InsertCalDeployment>): Promise<CalDeployment | undefined> { return this.updateOne("cal_deployments", id, data); }
  async deleteCalDeployment(id: string): Promise<boolean> { return this.deleteOne("cal_deployments", id); }

  async getCalDeploymentTargets(deploymentId: string): Promise<CalDeploymentTarget[]> { return this.getAll("cal_deployment_targets", "deployment_id = ?", [deploymentId]); }
  async getCalDeploymentTarget(id: string): Promise<CalDeploymentTarget | undefined> { return this.getById("cal_deployment_targets", id); }
  async getCalDeploymentTargetsByServiceHost(serviceHostId: string): Promise<CalDeploymentTarget[]> { return this.getAll("cal_deployment_targets", "service_host_id = ?", [serviceHostId]); }
  async createCalDeploymentTarget(data: InsertCalDeploymentTarget): Promise<CalDeploymentTarget> { return this.insertOne("cal_deployment_targets", { ...data }); }
  async updateCalDeploymentTarget(id: string, data: Partial<InsertCalDeploymentTarget>): Promise<CalDeploymentTarget | undefined> { return this.updateOne("cal_deployment_targets", id, data); }
  async updateCalDeploymentTargetStatus(id: string, status: string, statusMessage?: string): Promise<CalDeploymentTarget | undefined> {
    return this.updateOne("cal_deployment_targets", id, { status, statusMessage } as any);
  }

  // ========================================================================
  // EMC OPTION FLAGS
  // ========================================================================
  async getOptionFlags(enterpriseId: string, entityType: string, entityId: string): Promise<EmcOptionFlag[]> {
    return this.getAll("emc_option_flags", "enterprise_id = ? AND entity_type = ? AND entity_id = ?", [enterpriseId, entityType, entityId]);
  }
  async getOptionFlag(enterpriseId: string, entityType: string, entityId: string, optionKey: string, scopeLevel: string, scopeId: string): Promise<EmcOptionFlag | undefined> {
    const rows = this.getAll<EmcOptionFlag>("emc_option_flags", "enterprise_id = ? AND entity_type = ? AND entity_id = ? AND option_key = ? AND scope_level = ? AND scope_id = ?", [enterpriseId, entityType, entityId, optionKey, scopeLevel, scopeId]);
    return rows[0];
  }
  async setOptionFlag(data: InsertEmcOptionFlag): Promise<EmcOptionFlag> {
    const existing = await this.getOptionFlag(data.enterpriseId, data.entityType, data.entityId, data.optionKey, data.scopeLevel, data.scopeId);
    if (existing) return this.updateOne<EmcOptionFlag>("emc_option_flags", existing.id, data)!;
    return this.insertOne("emc_option_flags", { ...data });
  }
  async deleteOptionFlag(id: string): Promise<boolean> { return this.deleteOne("emc_option_flags", id); }
  async deleteOptionFlagByKey(enterpriseId: string, entityType: string, entityId: string, optionKey: string, scopeLevel: string, scopeId: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM "emc_option_flags" WHERE enterprise_id = ? AND entity_type = ? AND entity_id = ? AND option_key = ? AND scope_level = ? AND scope_id = ?`).run(enterpriseId, entityType, entityId, optionKey, scopeLevel, scopeId);
    return result.changes > 0;
  }
  async listOptionFlagsByScope(enterpriseId: string, scopeLevel: string, scopeId: string): Promise<EmcOptionFlag[]> {
    return this.getAll("emc_option_flags", "enterprise_id = ? AND scope_level = ? AND scope_id = ?", [enterpriseId, scopeLevel, scopeId]);
  }
  async listAllOptionFlagsByEnterprise(enterpriseId: string): Promise<EmcOptionFlag[]> {
    return this.getAll("emc_option_flags", "enterprise_id = ?", [enterpriseId]);
  }

  // ========================================================================
  // REMAINING STUBS (Fiscal, Cash, Gift Cards, Online Orders, Inventory, etc.)
  // ========================================================================
  async getFiscalPeriods(propertyId: string): Promise<FiscalPeriod[]> { return this.getAll("fiscal_periods", "property_id = ?", [propertyId]); }
  async getFiscalPeriod(id: string): Promise<FiscalPeriod | undefined> { return this.getById("fiscal_periods", id); }
  async createFiscalPeriod(data: InsertFiscalPeriod): Promise<FiscalPeriod> { return this.insertOne("fiscal_periods", { ...data }); }
  async updateFiscalPeriod(id: string, data: Partial<InsertFiscalPeriod>): Promise<FiscalPeriod | undefined> { return this.updateOne("fiscal_periods", id, data); }

  async getCashDrawers(propertyId: string): Promise<CashDrawer[]> { return this.getAll("cash_drawers", "property_id = ?", [propertyId]); }
  async getCashDrawer(id: string): Promise<CashDrawer | undefined> { return this.getById("cash_drawers", id); }
  async createCashDrawer(data: InsertCashDrawer): Promise<CashDrawer> { return this.insertOne("cash_drawers", { ...data }); }
  async updateCashDrawer(id: string, data: Partial<InsertCashDrawer>): Promise<CashDrawer | undefined> { return this.updateOne("cash_drawers", id, data); }
  async deleteCashDrawer(id: string): Promise<boolean> { return this.deleteOne("cash_drawers", id); }

  async getDrawerAssignments(propertyId: string): Promise<DrawerAssignment[]> { return this.getAll("drawer_assignments", "property_id = ?", [propertyId]); }
  async getDrawerAssignment(id: string): Promise<DrawerAssignment | undefined> { return this.getById("drawer_assignments", id); }
  async createDrawerAssignment(data: InsertDrawerAssignment): Promise<DrawerAssignment> { return this.insertOne("drawer_assignments", { ...data }); }
  async updateDrawerAssignment(id: string, data: Partial<InsertDrawerAssignment>): Promise<DrawerAssignment | undefined> { return this.updateOne("drawer_assignments", id, data); }

  async getCashTransactions(propertyId: string): Promise<CashTransaction[]> { return this.getAll("cash_transactions", "property_id = ?", [propertyId]); }
  async createCashTransaction(data: InsertCashTransaction): Promise<CashTransaction> { return this.insertOne("cash_transactions", { ...data }); }

  async getSafeCounts(propertyId: string): Promise<SafeCount[]> { return this.getAll("safe_counts", "property_id = ?", [propertyId]); }
  async getSafeCount(id: string): Promise<SafeCount | undefined> { return this.getById("safe_counts", id); }
  async createSafeCount(data: InsertSafeCount): Promise<SafeCount> { return this.insertOne("safe_counts", { ...data }); }
  async updateSafeCount(id: string, data: Partial<InsertSafeCount>): Promise<SafeCount | undefined> { return this.updateOne("safe_counts", id, data); }

  async getGiftCards(enterpriseId?: string): Promise<GiftCard[]> {
    if (enterpriseId) return this.getAll("gift_cards", "enterprise_id = ?", [enterpriseId]);
    return this.getAll("gift_cards");
  }
  async getGiftCard(id: string): Promise<GiftCard | undefined> { return this.getById("gift_cards", id); }
  async getGiftCardByNumber(cardNumber: string): Promise<GiftCard | undefined> {
    const rows = this.getAll<GiftCard>("gift_cards", "card_number = ?", [cardNumber]);
    return rows[0];
  }
  async createGiftCard(data: InsertGiftCard): Promise<GiftCard> { return this.insertOne("gift_cards", { ...data }); }
  async updateGiftCard(id: string, data: Partial<InsertGiftCard>): Promise<GiftCard | undefined> { return this.updateOne("gift_cards", id, data); }

  async getGiftCardTransactions(giftCardId: string): Promise<GiftCardTransaction[]> { return this.getAll("gift_card_transactions", "gift_card_id = ?", [giftCardId]); }
  async createGiftCardTransaction(data: InsertGiftCardTransaction): Promise<GiftCardTransaction> { return this.insertOne("gift_card_transactions", { ...data }); }

  async getGlMappings(enterpriseId: string): Promise<GlMapping[]> { return this.getAll("gl_mappings", "enterprise_id = ?", [enterpriseId]); }
  async createGlMapping(data: InsertGlMapping): Promise<GlMapping> { return this.insertOne("gl_mappings", { ...data }); }
  async updateGlMapping(id: string, data: Partial<InsertGlMapping>): Promise<GlMapping | undefined> { return this.updateOne("gl_mappings", id, data); }
  async deleteGlMapping(id: string): Promise<boolean> { return this.deleteOne("gl_mappings", id); }

  async getAccountingExports(enterpriseId: string): Promise<AccountingExport[]> { return this.getAll("accounting_exports", "enterprise_id = ?", [enterpriseId]); }
  async createAccountingExport(data: InsertAccountingExport): Promise<AccountingExport> { return this.insertOne("accounting_exports", { ...data }); }
  async updateAccountingExport(id: string, data: Partial<InsertAccountingExport>): Promise<AccountingExport | undefined> { return this.updateOne("accounting_exports", id, data); }

  // Online Orders
  async getOnlineOrderSources(enterpriseId?: string): Promise<OnlineOrderSource[]> {
    if (enterpriseId) return this.getAll("online_order_sources", "enterprise_id = ?", [enterpriseId]);
    return this.getAll("online_order_sources");
  }
  async createOnlineOrderSource(data: InsertOnlineOrderSource): Promise<OnlineOrderSource> { return this.insertOne("online_order_sources", { ...data }); }
  async updateOnlineOrderSource(id: string, data: Partial<InsertOnlineOrderSource>): Promise<OnlineOrderSource | undefined> { return this.updateOne("online_order_sources", id, data); }
  async deleteOnlineOrderSource(id: string): Promise<boolean> { return this.deleteOne("online_order_sources", id); }

  // Inventory
  async getInventoryItems(propertyId?: string): Promise<InventoryItem[]> {
    if (propertyId) return this.getAll("inventory_items", "property_id = ?", [propertyId]);
    return this.getAll("inventory_items");
  }
  async createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem> { return this.insertOne("inventory_items", { ...data }); }
  async updateInventoryItem(id: string, data: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> { return this.updateOne("inventory_items", id, data); }
  async deleteInventoryItem(id: string): Promise<boolean> { return this.deleteOne("inventory_items", id); }

  // Item Availability
  async getItemAvailability(propertyId: string): Promise<ItemAvailability[]> { return this.getAll("item_availability", "property_id = ?", [propertyId]); }
  async setItemAvailability(data: any): Promise<ItemAvailability> { return this.insertOne("item_availability", { ...data }); }

  // Sync Notifications
  async getSyncNotifications(propertyId?: string): Promise<SyncNotification[]> {
    if (propertyId) return this.getAll("sync_notifications", "property_id = ?", [propertyId]);
    return this.getAll("sync_notifications");
  }
  async createSyncNotification(data: InsertSyncNotification): Promise<SyncNotification> { return this.insertOne("sync_notifications", { ...data }); }
  async updateSyncNotification(id: string, data: Partial<InsertSyncNotification>): Promise<SyncNotification | undefined> { return this.updateOne("sync_notifications", id, data); }

  // Prep Items
  async getPrepItems(propertyId: string): Promise<PrepItem[]> { return this.getAll("prep_items", "property_id = ?", [propertyId]); }
  async createPrepItem(data: InsertPrepItem): Promise<PrepItem> { return this.insertOne("prep_items", { ...data }); }
  async updatePrepItem(id: string, data: Partial<InsertPrepItem>): Promise<PrepItem | undefined> { return this.updateOne("prep_items", id, data); }
  async deletePrepItem(id: string): Promise<boolean> { return this.deleteOne("prep_items", id); }

  // ========================================================================
  // TRANSACTION JOURNAL (LFS-specific)
  // ========================================================================
  recordTransaction(entry: {
    operationType: string;
    entityType: string;
    entityId: string;
    httpMethod: string;
    endpoint: string;
    payload: Record<string, unknown>;
    offlineTransactionId: string;
    workstationId?: string;
  }): void {
    this.db.prepare(
      `INSERT INTO "lfs_transaction_journal" (id, operation_type, entity_type, entity_id, http_method, endpoint, payload, offline_transaction_id, workstation_id, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      crypto.randomUUID(),
      entry.operationType,
      entry.entityType,
      entry.entityId,
      entry.httpMethod,
      entry.endpoint,
      JSON.stringify(entry.payload),
      entry.offlineTransactionId,
      entry.workstationId || null,
      new Date().toISOString(),
    );
  }

  getPendingTransactions(): TransactionJournalEntry[] {
    const rows = this.db.prepare(
      `SELECT * FROM "lfs_transaction_journal" WHERE synced = 0 ORDER BY created_at ASC`
    ).all() as Array<Record<string, unknown>>;
    return rows.map(r => ({
      ...r,
      payload: typeof r.payload === "string" ? JSON.parse(r.payload as string) : r.payload,
    })) as TransactionJournalEntry[];
  }

  getPendingTransactionCount(): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as count FROM "lfs_transaction_journal" WHERE synced = 0`
    ).get() as { count: number } | undefined;
    return row?.count || 0;
  }

  markTransactionSynced(id: string): void {
    this.db.prepare(
      `UPDATE "lfs_transaction_journal" SET synced = 1, synced_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), id);
  }

  markTransactionSyncedByOfflineId(offlineTransactionId: string): void {
    this.db.prepare(
      `UPDATE "lfs_transaction_journal" SET synced = 1, synced_at = ? WHERE offline_transaction_id = ?`
    ).run(new Date().toISOString(), offlineTransactionId);
  }
}

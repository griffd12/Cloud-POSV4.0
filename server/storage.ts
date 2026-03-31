import { db } from "./db";
import { eq, and, desc, sql, inArray, gte, lte, gt, or, ilike, isNotNull, isNull } from "drizzle-orm";
import {
  enterprises, properties, rvcs, roles, privileges, rolePrivileges, roleRules, employees, employeeAssignments,
  majorGroups, familyGroups,
  slus, taxGroups, printClasses, orderDevices, menuItems, menuItemSlus, type MenuItemSlu,
  modifierGroups, modifiers, modifierGroupModifiers, menuItemModifierGroups,
  ingredientPrefixes, menuItemRecipeIngredients,
  tenders, discounts, serviceCharges, checkServiceCharges,
  rvcCounters,
  checks, rounds, checkItems, checkPayments, checkDiscounts, checkLocks, auditLogs, kdsTickets, kdsTicketItems,
  paymentProcessors, paymentTransactions, terminalDevices, terminalSessions,
  workstations, printers, kdsDevices, orderDevicePrinters, orderDeviceKds, workstationOrderDevices, printClassRouting,
  posLayouts, posLayoutCells, posLayoutRvcAssignments,
  devices, deviceEnrollmentTokens, deviceHeartbeats,
  refunds, refundItems, refundPayments,
  // T&A tables
  jobCodes, employeeJobCodes, payPeriods, timePunches, breakSessions,
  timecards, timecardExceptions, timecardEdits,
  employeeAvailability, availabilityExceptions, timeOffRequests,
  shiftTemplates, shifts, shiftCoverRequests, shiftCoverOffers, shiftCoverApprovals,
  tipPoolPolicies, tipPoolRuns, tipAllocations, tipRules, tipRuleJobPercentages, laborSnapshots, overtimeRules,
  // Phase 1-3 new tables
  offlineOrderQueue, fiscalPeriods, cashDrawers, drawerAssignments, cashTransactions, safeCounts,
  giftCards, giftCardTransactions, glMappings, accountingExports,
  loyaltyPrograms, loyaltyMembers, loyaltyTransactions, loyaltyRewards, loyaltyRedemptions,
  onlineOrderSources, onlineOrders, deliveryPlatformItemMappings, inventoryItems, inventoryStock, inventoryTransactions, recipes,
  salesForecasts, laborForecasts, managerAlerts, alertSubscriptions, itemAvailability, prepItems,
  syncNotifications,
  type Enterprise, type InsertEnterprise,
  type Property, type InsertProperty,
  type Rvc, type InsertRvc,
  type Role, type InsertRole,
  type RoleRules, type InsertRoleRules,
  type Privilege, type InsertPrivilege,
  type Employee, type InsertEmployee,
  type EmployeeAssignment, type InsertEmployeeAssignment,
  type MajorGroup, type InsertMajorGroup,
  type FamilyGroup, type InsertFamilyGroup,
  type Slu, type InsertSlu,
  type TaxGroup, type InsertTaxGroup,
  type PrintClass, type InsertPrintClass,
  type Workstation, type InsertWorkstation, type WorkstationOrderDevice,
  type Printer, type InsertPrinter,
  type KdsDevice, type InsertKdsDevice,
  type OrderDevice, type InsertOrderDevice,
  type OrderDevicePrinter, type InsertOrderDevicePrinter,
  type OrderDeviceKds, type InsertOrderDeviceKds,
  type PrintClassRouting, type InsertPrintClassRouting,
  type MenuItem, type InsertMenuItem,
  type ModifierGroup, type InsertModifierGroup,
  type Modifier, type InsertModifier,
  type ModifierGroupModifier, type InsertModifierGroupModifier,
  type MenuItemModifierGroup, type InsertMenuItemModifierGroup,
  type IngredientPrefix, type InsertIngredientPrefix,
  type MenuItemRecipeIngredient, type InsertMenuItemRecipeIngredient,
  type Tender, type InsertTender,
  type Discount, type InsertDiscount,
  type ServiceCharge, type InsertServiceCharge,
  type CheckServiceCharge, type InsertCheckServiceCharge,
  type Check, type InsertCheck,
  type Round, type InsertRound,
  type CheckItem, type InsertCheckItem,
  type CheckPayment, type InsertCheckPayment,
  type CheckDiscount, type InsertCheckDiscount,
  type CheckLock,
  type AuditLog, type InsertAuditLog,
  type KdsTicket, type InsertKdsTicket, type KdsTicketItem,
  type PosLayout, type InsertPosLayout,
  type PosLayoutCell, type InsertPosLayoutCell,
  type PosLayoutRvcAssignment, type InsertPosLayoutRvcAssignment,
  type Device, type InsertDevice,
  type DeviceEnrollmentToken, type InsertDeviceEnrollmentToken,
  type DeviceHeartbeat, type InsertDeviceHeartbeat,
  type Refund, type InsertRefund,
  type RefundItem, type InsertRefundItem,
  type RefundPayment, type InsertRefundPayment,
  type PrintJob, type InsertPrintJob, printJobs,
  type PrintAgent, type InsertPrintAgent, printAgents,
  // T&A imports
  type JobCode, type InsertJobCode,
  type EmployeeJobCode, type InsertEmployeeJobCode,
  type PayPeriod, type InsertPayPeriod,
  type TimePunch, type InsertTimePunch,
  type BreakSession, type InsertBreakSession,
  type Timecard, type InsertTimecard,
  type TimecardException, type InsertTimecardException,
  type TimecardEdit, type InsertTimecardEdit,
  type EmployeeAvailability, type InsertEmployeeAvailability,
  type AvailabilityException, type InsertAvailabilityException,
  type TimeOffRequest, type InsertTimeOffRequest,
  type ShiftTemplate, type InsertShiftTemplate,
  type Shift, type InsertShift,
  type ShiftCoverRequest, type InsertShiftCoverRequest,
  type ShiftCoverOffer, type InsertShiftCoverOffer,
  type ShiftCoverApproval, type InsertShiftCoverApproval,
  type TipPoolPolicy, type InsertTipPoolPolicy,
  type TipPoolRun, type InsertTipPoolRun,
  type TipAllocation, type InsertTipAllocation,
  type TipRule, type InsertTipRule,
  type TipRuleJobPercentage, type InsertTipRuleJobPercentage,
  type LaborSnapshot, type InsertLaborSnapshot,
  type OvertimeRule, type InsertOvertimeRule,
  type BreakRule, type InsertBreakRule,
  type BreakAttestation, type InsertBreakAttestation,
  type BreakViolation, type InsertBreakViolation,
  type MinorLaborRule, type InsertMinorLaborRule,
  type EmployeeMinorStatus, type InsertEmployeeMinorStatus,
  breakRules, breakAttestations, breakViolations, minorLaborRules, employeeMinorStatus,
  type PaymentProcessor, type InsertPaymentProcessor,
  type PaymentTransaction, type InsertPaymentTransaction,
  type TerminalDevice, type InsertTerminalDevice,
  type TerminalSession, type InsertTerminalSession,
  type RegisteredDevice, type InsertRegisteredDevice,
  type EmcUser, type InsertEmcUser,
  type EmcSession, type InsertEmcSession,
  registeredDevices, emcUsers, emcSessions,
  // Phase 1-3 new types
  type OfflineOrderQueue, type InsertOfflineOrderQueue,
  type FiscalPeriod, type InsertFiscalPeriod,
  type CashDrawer, type InsertCashDrawer,
  type DrawerAssignment, type InsertDrawerAssignment,
  type CashTransaction, type InsertCashTransaction,
  type SafeCount, type InsertSafeCount,
  type GiftCard, type InsertGiftCard,
  type GiftCardTransaction, type InsertGiftCardTransaction,
  type GlMapping, type InsertGlMapping,
  type AccountingExport, type InsertAccountingExport,
  type LoyaltyProgram, type InsertLoyaltyProgram,
  type LoyaltyMember, type InsertLoyaltyMember,
  type LoyaltyMemberEnrollment, type InsertLoyaltyMemberEnrollment,
  type LoyaltyMemberWithEnrollments,
  loyaltyMemberEnrollments,
  type LoyaltyTransaction, type InsertLoyaltyTransaction,
  type LoyaltyReward, type InsertLoyaltyReward,
  type LoyaltyRedemption, type InsertLoyaltyRedemption,
  type OnlineOrderSource, type InsertOnlineOrderSource,
  type OnlineOrder, type InsertOnlineOrder,
  type DeliveryPlatformItemMapping, type InsertDeliveryPlatformItemMapping,
  type InventoryItem, type InsertInventoryItem,
  type InventoryStock, type InsertInventoryStock,
  type InventoryTransaction, type InsertInventoryTransaction,
  type Recipe, type InsertRecipe,
  type SalesForecast, type InsertSalesForecast,
  type LaborForecast, type InsertLaborForecast,
  type ManagerAlert, type InsertManagerAlert,
  type SyncNotification, type InsertSyncNotification,
  type AlertSubscription, type InsertAlertSubscription,
  type ItemAvailability, type InsertItemAvailability,
  type PrepItem, type InsertPrepItem,
  descriptorLogoAssets, descriptorSets,
  type DescriptorLogoAsset, type InsertDescriptorLogoAsset,
  type DescriptorSet, type InsertDescriptorSet,
  type DescriptorScopeType,
  serviceHosts, configVersions, serviceHostTransactions,
  serviceHostMetrics, serviceHostAlertRules, serviceHostAlerts,
  type ServiceHost, type InsertServiceHost,
  type ConfigVersion, type InsertConfigVersion,
  type ServiceHostTransaction, type InsertServiceHostTransaction,
  type ServiceHostMetrics, type InsertServiceHostMetrics,
  type ServiceHostAlertRule, type InsertServiceHostAlertRule,
  type ServiceHostAlert, type InsertServiceHostAlert,
  workstationServiceBindings,
  type WorkstationServiceBinding, type InsertWorkstationServiceBinding,
  idempotencyKeys,
  paymentGatewayConfig,
  type PaymentGatewayConfig, type InsertPaymentGatewayConfig,
  calPackages, calPackageVersions, calPackagePrerequisites, calDeployments, calDeploymentTargets,
  type CalPackage, type InsertCalPackage,
  type CalPackageVersion, type InsertCalPackageVersion,
  type CalPackagePrerequisite, type InsertCalPackagePrerequisite,
  type CalDeployment, type InsertCalDeployment,
  type CalDeploymentTarget, type InsertCalDeploymentTarget,
  emcOptionFlags,
  type EmcOptionFlag, type InsertEmcOptionFlag,
  lfsConfigurations, lfsSyncLogs,
  type LfsConfiguration, type InsertLfsConfiguration,
  type LfsSyncLog, type InsertLfsSyncLog,
} from "@shared/schema";

export interface IStorage {
  getDatabaseStatus(): Promise<{ db: string; version: string; serverTime: Date }>;
  executeReportQuery(query: any): Promise<{ rows: any[] }>;

  // Enterprises
  getEnterprises(): Promise<Enterprise[]>;
  getEnterprise(id: string): Promise<Enterprise | undefined>;
  createEnterprise(data: InsertEnterprise): Promise<Enterprise>;
  updateEnterprise(id: string, data: Partial<InsertEnterprise>): Promise<Enterprise | undefined>;
  deleteEnterprise(id: string): Promise<boolean>;

  // Properties
  getProperties(enterpriseId?: string): Promise<Property[]>;
  getProperty(id: string): Promise<Property | undefined>;
  createProperty(data: InsertProperty): Promise<Property>;
  updateProperty(id: string, data: Partial<InsertProperty>): Promise<Property | undefined>;
  deleteProperty(id: string): Promise<boolean>;

  // RVCs
  getRvcs(propertyId?: string): Promise<Rvc[]>;
  getRvc(id: string): Promise<Rvc | undefined>;
  createRvc(data: InsertRvc): Promise<Rvc>;
  updateRvc(id: string, data: Partial<InsertRvc>): Promise<Rvc | undefined>;
  deleteRvc(id: string): Promise<boolean>;

  // Roles
  getRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(data: InsertRole): Promise<Role>;
  updateRole(id: string, data: Partial<InsertRole>): Promise<Role | undefined>;
  deleteRole(id: string): Promise<boolean>;
  getRolePrivileges(roleId: string): Promise<string[]>;
  setRolePrivileges(roleId: string, privilegeCodes: string[]): Promise<void>;
  upsertRole(data: InsertRole): Promise<Role>;
  getRoleRules(roleId: string): Promise<RoleRules | undefined>;
  upsertRoleRules(data: InsertRoleRules): Promise<RoleRules>;

  // Employees
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: string): Promise<Employee | undefined>;
  getEmployeeByPin(pin: string): Promise<Employee | undefined>;
  getEmployeeByPinAndEnterprise(pin: string, enterpriseId: string): Promise<Employee | undefined>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<boolean>;

  // Employee Assignments (multi-property)
  getEmployeeAssignments(employeeId: string): Promise<EmployeeAssignment[]>;
  getAllEmployeeAssignments(): Promise<EmployeeAssignment[]>;
  setEmployeeAssignments(employeeId: string, propertyIds: string[]): Promise<EmployeeAssignment[]>;

  // Privileges
  getPrivileges(): Promise<Privilege[]>;
  createPrivilege(data: InsertPrivilege): Promise<Privilege>;
  upsertPrivileges(privileges: InsertPrivilege[]): Promise<void>;

  // Major Groups
  getMajorGroups(): Promise<MajorGroup[]>;
  getMajorGroup(id: string): Promise<MajorGroup | undefined>;
  createMajorGroup(data: InsertMajorGroup): Promise<MajorGroup>;
  updateMajorGroup(id: string, data: Partial<InsertMajorGroup>): Promise<MajorGroup | undefined>;
  deleteMajorGroup(id: string): Promise<boolean>;

  // Family Groups
  getFamilyGroups(majorGroupId?: string): Promise<FamilyGroup[]>;
  getFamilyGroup(id: string): Promise<FamilyGroup | undefined>;
  createFamilyGroup(data: InsertFamilyGroup): Promise<FamilyGroup>;
  updateFamilyGroup(id: string, data: Partial<InsertFamilyGroup>): Promise<FamilyGroup | undefined>;
  deleteFamilyGroup(id: string): Promise<boolean>;

  // SLUs
  getSlus(rvcId?: string): Promise<Slu[]>;
  getSlu(id: string): Promise<Slu | undefined>;
  createSlu(data: InsertSlu): Promise<Slu>;
  updateSlu(id: string, data: Partial<InsertSlu>): Promise<Slu | undefined>;
  deleteSlu(id: string): Promise<boolean>;

  // Menu Item SLU Linkages
  getMenuItemSlus(menuItemId?: string): Promise<MenuItemSlu[]>;
  setMenuItemSlus(menuItemId: string, sluIds: string[]): Promise<void>;

  // Tax Groups
  getTaxGroups(): Promise<TaxGroup[]>;
  getTaxGroup(id: string): Promise<TaxGroup | undefined>;
  createTaxGroup(data: InsertTaxGroup): Promise<TaxGroup>;
  updateTaxGroup(id: string, data: Partial<InsertTaxGroup>): Promise<TaxGroup | undefined>;
  deleteTaxGroup(id: string): Promise<boolean>;

  // Print Classes
  getPrintClasses(): Promise<PrintClass[]>;
  getPrintClass(id: string): Promise<PrintClass | undefined>;
  createPrintClass(data: InsertPrintClass): Promise<PrintClass>;
  updatePrintClass(id: string, data: Partial<InsertPrintClass>): Promise<PrintClass | undefined>;
  deletePrintClass(id: string): Promise<boolean>;

  // Workstations
  getWorkstations(propertyId?: string): Promise<Workstation[]>;
  getWorkstation(id: string): Promise<Workstation | undefined>;
  createWorkstation(data: InsertWorkstation): Promise<Workstation>;
  updateWorkstation(id: string, data: Partial<InsertWorkstation>): Promise<Workstation | undefined>;
  deleteWorkstation(id: string): Promise<boolean>;

  // Workstation Order Device routing
  getWorkstationOrderDevices(workstationId: string): Promise<WorkstationOrderDevice[]>;
  setWorkstationOrderDevices(workstationId: string, orderDeviceIds: string[]): Promise<WorkstationOrderDevice[]>;

  // Printers
  getPrinters(propertyId?: string): Promise<Printer[]>;
  getPrinter(id: string): Promise<Printer | undefined>;
  createPrinter(data: InsertPrinter): Promise<Printer>;
  updatePrinter(id: string, data: Partial<InsertPrinter>): Promise<Printer | undefined>;
  deletePrinter(id: string): Promise<boolean>;

  // KDS Devices
  getKdsDevices(propertyId?: string): Promise<KdsDevice[]>;
  getKdsDevice(id: string): Promise<KdsDevice | undefined>;
  createKdsDevice(data: InsertKdsDevice): Promise<KdsDevice>;
  updateKdsDevice(id: string, data: Partial<InsertKdsDevice>): Promise<KdsDevice | undefined>;
  deleteKdsDevice(id: string): Promise<boolean>;

  // Order Devices
  getOrderDevices(propertyId?: string): Promise<OrderDevice[]>;
  getOrderDevice(id: string): Promise<OrderDevice | undefined>;
  createOrderDevice(data: InsertOrderDevice): Promise<OrderDevice>;
  updateOrderDevice(id: string, data: Partial<InsertOrderDevice>): Promise<OrderDevice | undefined>;
  deleteOrderDevice(id: string): Promise<boolean>;

  // Order Device Linkages
  getOrderDevicePrinters(orderDeviceId?: string): Promise<OrderDevicePrinter[]>;
  linkPrinterToOrderDevice(data: InsertOrderDevicePrinter): Promise<OrderDevicePrinter>;
  unlinkPrinterFromOrderDevice(id: string): Promise<boolean>;
  getOrderDeviceKdsList(orderDeviceId?: string): Promise<OrderDeviceKds[]>;
  linkKdsToOrderDevice(data: InsertOrderDeviceKds): Promise<OrderDeviceKds>;
  unlinkKdsFromOrderDevice(id: string): Promise<boolean>;

  // Print Class Routing
  getAllPrintClassRoutings(): Promise<PrintClassRouting[]>;
  getPrintClassRouting(printClassId?: string, propertyId?: string, rvcId?: string): Promise<PrintClassRouting[]>;
  createPrintClassRouting(data: InsertPrintClassRouting): Promise<PrintClassRouting>;
  deletePrintClassRouting(id: string): Promise<boolean>;
  resolveDevicesForMenuItem(menuItemId: string, rvcId: string): Promise<{ printers: Printer[]; kdsDevices: KdsDevice[] }>;

  // Menu Items
  getMenuItems(sluId?: string): Promise<MenuItem[]>;
  getMenuItem(id: string): Promise<MenuItem | undefined>;
  createMenuItem(data: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, data: Partial<InsertMenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: string): Promise<boolean>;

  // Modifiers (standalone)
  getModifiers(): Promise<Modifier[]>;
  getModifier(id: string): Promise<Modifier | undefined>;
  createModifier(data: InsertModifier): Promise<Modifier>;
  updateModifier(id: string, data: Partial<InsertModifier>): Promise<Modifier | undefined>;
  deleteModifier(id: string): Promise<boolean>;

  // Modifier Groups
  getModifierGroups(menuItemId?: string): Promise<(ModifierGroup & { modifiers: (Modifier & { isDefault: boolean; displayOrder: number })[] })[]>;
  getModifierGroup(id: string): Promise<ModifierGroup | undefined>;
  createModifierGroup(data: InsertModifierGroup): Promise<ModifierGroup>;
  updateModifierGroup(id: string, data: Partial<InsertModifierGroup>): Promise<ModifierGroup | undefined>;
  deleteModifierGroup(id: string): Promise<boolean>;

  // Modifier Group to Modifier linkage
  getModifierGroupModifiers(modifierGroupId?: string): Promise<ModifierGroupModifier[]>;
  linkModifierToGroup(data: InsertModifierGroupModifier): Promise<ModifierGroupModifier>;
  unlinkModifierFromGroup(modifierGroupId: string, modifierId: string): Promise<boolean>;
  updateModifierGroupModifier(id: string, data: Partial<InsertModifierGroupModifier>): Promise<ModifierGroupModifier | undefined>;

  // Menu Item to Modifier Group linkage
  getMenuItemModifierGroups(menuItemId?: string): Promise<MenuItemModifierGroup[]>;
  linkModifierGroupToMenuItem(data: InsertMenuItemModifierGroup): Promise<MenuItemModifierGroup>;
  unlinkModifierGroupFromMenuItem(menuItemId: string, modifierGroupId: string): Promise<boolean>;

  // Ingredient Prefixes (Conversational Ordering)
  getIngredientPrefixes(): Promise<IngredientPrefix[]>;
  getIngredientPrefix(id: string): Promise<IngredientPrefix | undefined>;
  createIngredientPrefix(data: InsertIngredientPrefix): Promise<IngredientPrefix>;
  updateIngredientPrefix(id: string, data: Partial<InsertIngredientPrefix>): Promise<IngredientPrefix | undefined>;
  deleteIngredientPrefix(id: string): Promise<boolean>;

  // Menu Item Recipe Ingredients (Conversational Ordering)
  getMenuItemRecipeIngredients(menuItemId?: string): Promise<MenuItemRecipeIngredient[]>;
  getMenuItemRecipeIngredient(id: string): Promise<MenuItemRecipeIngredient | undefined>;
  createMenuItemRecipeIngredient(data: InsertMenuItemRecipeIngredient): Promise<MenuItemRecipeIngredient>;
  updateMenuItemRecipeIngredient(id: string, data: Partial<InsertMenuItemRecipeIngredient>): Promise<MenuItemRecipeIngredient | undefined>;
  deleteMenuItemRecipeIngredient(id: string): Promise<boolean>;

  // Tenders
  getTenders(rvcId?: string): Promise<Tender[]>;
  getAllTendersIncludingSystem(): Promise<Tender[]>;
  getTender(id: string): Promise<Tender | undefined>;
  createTender(data: InsertTender): Promise<Tender>;
  updateTender(id: string, data: Partial<InsertTender>): Promise<Tender | undefined>;
  deleteTender(id: string): Promise<boolean>;

  // Discounts
  getDiscounts(): Promise<Discount[]>;
  getDiscount(id: string): Promise<Discount | undefined>;
  createDiscount(data: InsertDiscount): Promise<Discount>;
  updateDiscount(id: string, data: Partial<InsertDiscount>): Promise<Discount | undefined>;
  deleteDiscount(id: string): Promise<boolean>;

  // Service Charges
  getServiceCharges(): Promise<ServiceCharge[]>;
  getServiceCharge(id: string): Promise<ServiceCharge | undefined>;
  createServiceCharge(data: InsertServiceCharge): Promise<ServiceCharge>;
  updateServiceCharge(id: string, data: Partial<InsertServiceCharge>): Promise<ServiceCharge | undefined>;
  deleteServiceCharge(id: string): Promise<boolean>;

  // Check Service Charges (ledger entries)
  getCheckServiceChargesByCheck(checkId: string): Promise<CheckServiceCharge[]>;
  getCheckServiceChargesByBusinessDate(propertyId: string, businessDate: string, rvcId?: string): Promise<CheckServiceCharge[]>;
  createCheckServiceCharge(data: InsertCheckServiceCharge): Promise<CheckServiceCharge>;
  voidCheckServiceCharge(id: string, voidedByEmployeeId: string, voidReason?: string): Promise<CheckServiceCharge | undefined>;

  // Checks
  getChecks(rvcId?: string, status?: string, includeTestMode?: boolean): Promise<Check[]>;
  getChecksByPropertyAndDateRange(propertyId: string, startDate: string, endDate: string): Promise<Check[]>;
  getCheck(id: string): Promise<Check | undefined>;
  getOpenChecks(rvcId: string): Promise<Check[]>;
  createCheck(data: InsertCheck): Promise<Check>;
  createCheckAtomic(rvcId: string, data: Omit<InsertCheck, 'checkNumber'>): Promise<Check>;
  updateCheck(id: string, data: Partial<Check>): Promise<Check | undefined>;
  deleteCheck(id: string): Promise<boolean>;
  getNextCheckNumber(rvcId: string): Promise<number>;

  // Idempotency (INSERT-first transactional pattern)
  acquireIdempotencyLock(enterpriseId: string, workstationId: string, operation: string, key: string, requestHash: string): Promise<{ acquired: boolean; status?: string; requestHash?: string; responseStatus?: number; responseBody?: string }>;
  completeIdempotencyKey(enterpriseId: string, workstationId: string, operation: string, key: string, responseStatus: number, responseBody: string): Promise<void>;
  failIdempotencyKey(enterpriseId: string, workstationId: string, operation: string, key: string): Promise<void>;
  cleanupExpiredIdempotencyKeys(): Promise<number>;

  // Print Queue Lease Pattern
  claimPrintJob(agentId: string, leaseDurationSeconds?: number): Promise<PrintJob | null>;
  ackPrintJob(jobId: string, success: boolean, error?: string): Promise<void>;
  recoverExpiredLeases(): Promise<number>;

  // Check Items
  getCheckItems(checkId: string): Promise<CheckItem[]>;
  getCheckItem(id: string): Promise<CheckItem | undefined>;
  createCheckItem(data: InsertCheckItem): Promise<CheckItem>;
  updateCheckItem(id: string, data: Partial<CheckItem>): Promise<CheckItem | undefined>;
  deleteCheckItem(id: string): Promise<boolean>;

  // Check Discounts (applied to checks)
  getCheckDiscounts(checkId: string): Promise<CheckDiscount[]>;
  getCheckDiscount(id: string): Promise<CheckDiscount | undefined>;
  createCheckDiscount(data: InsertCheckDiscount): Promise<CheckDiscount>;
  deleteCheckDiscount(id: string): Promise<boolean>;

  // Rounds
  createRound(data: InsertRound & { id?: string }): Promise<Round>;
  getRounds(checkId: string): Promise<Round[]>;

  // Check Locks (for multi-workstation operation)
  getCheckLock(checkId: string): Promise<CheckLock | undefined>;
  getCheckLocksByCheckIds(checkIds: string[]): Promise<CheckLock[]>;
  createCheckLock(data: { checkId: string; workstationId: string; employeeId: string; lockMode?: string; expiresAt: Date }): Promise<CheckLock>;
  updateCheckLock(id: string, data: Partial<{ expiresAt: Date; lockMode: string }>): Promise<CheckLock | undefined>;
  deleteCheckLock(id: string): Promise<boolean>;
  deleteCheckLocksByWorkstation(workstationId: string): Promise<number>;

  // Payments
  createPayment(data: InsertCheckPayment): Promise<CheckPayment>;
  getPayments(checkId: string): Promise<CheckPayment[]>;
  getAllPayments(): Promise<CheckPayment[]>;
  updateCheckPayment(id: string, data: Partial<CheckPayment>): Promise<CheckPayment | undefined>;
  getAllCheckItems(): Promise<CheckItem[]>;

  // Payment Processors
  getPaymentProcessors(propertyId?: string): Promise<PaymentProcessor[]>;
  getPaymentProcessor(id: string): Promise<PaymentProcessor | undefined>;
  createPaymentProcessor(data: InsertPaymentProcessor): Promise<PaymentProcessor>;
  updatePaymentProcessor(id: string, data: Partial<InsertPaymentProcessor>): Promise<PaymentProcessor | undefined>;
  deletePaymentProcessor(id: string): Promise<boolean>;
  getActivePaymentProcessor(propertyId: string): Promise<PaymentProcessor | undefined>;

  // Payment Gateway Configuration (hierarchy-aware)
  getPaymentGatewayConfigs(enterpriseId: string): Promise<PaymentGatewayConfig[]>;
  getPaymentGatewayConfig(id: string): Promise<PaymentGatewayConfig | undefined>;
  getPaymentGatewayConfigForLevel(configLevel: string, enterpriseId: string, propertyId?: string | null, workstationId?: string | null): Promise<PaymentGatewayConfig | undefined>;
  getMergedPaymentGatewayConfig(enterpriseId: string, propertyId?: string | null, workstationId?: string | null): Promise<Partial<PaymentGatewayConfig>>;
  createPaymentGatewayConfig(data: InsertPaymentGatewayConfig): Promise<PaymentGatewayConfig>;
  updatePaymentGatewayConfig(id: string, data: Partial<InsertPaymentGatewayConfig>): Promise<PaymentGatewayConfig | undefined>;
  deletePaymentGatewayConfig(id: string): Promise<boolean>;

  // Payment Transactions
  getPaymentTransactions(checkPaymentId?: string): Promise<PaymentTransaction[]>;
  getPaymentTransaction(id: string): Promise<PaymentTransaction | undefined>;
  getPaymentTransactionByGatewayId(gatewayTransactionId: string): Promise<PaymentTransaction | undefined>;
  createPaymentTransaction(data: InsertPaymentTransaction): Promise<PaymentTransaction>;
  updatePaymentTransaction(id: string, data: Partial<PaymentTransaction>): Promise<PaymentTransaction | undefined>;

  // Terminal Devices (EMV Card Readers)
  getTerminalDevices(propertyId?: string): Promise<TerminalDevice[]>;
  getTerminalDevice(id: string): Promise<TerminalDevice | undefined>;
  getTerminalDevicesByWorkstation(workstationId: string): Promise<TerminalDevice[]>;
  createTerminalDevice(data: InsertTerminalDevice): Promise<TerminalDevice>;
  updateTerminalDevice(id: string, data: Partial<InsertTerminalDevice>): Promise<TerminalDevice | undefined>;
  deleteTerminalDevice(id: string): Promise<boolean>;
  updateTerminalDeviceStatus(id: string, status: string, lastHeartbeat?: Date): Promise<TerminalDevice | undefined>;

  // Terminal Sessions (Active payment sessions on terminals)
  getTerminalSessions(terminalDeviceId?: string, status?: string): Promise<TerminalSession[]>;
  getTerminalSession(id: string): Promise<TerminalSession | undefined>;
  getActiveTerminalSession(terminalDeviceId: string): Promise<TerminalSession | undefined>;
  createTerminalSession(data: InsertTerminalSession): Promise<TerminalSession>;
  updateTerminalSession(id: string, data: Partial<TerminalSession>): Promise<TerminalSession | undefined>;

  // Registered Devices (POS/KDS access control)
  getRegisteredDevices(propertyId?: string): Promise<RegisteredDevice[]>;
  getRegisteredDevice(id: string): Promise<RegisteredDevice | undefined>;
  getRegisteredDeviceByToken(deviceTokenHash: string): Promise<RegisteredDevice | undefined>;
  getRegisteredDeviceByEnrollmentCode(enrollmentCode: string): Promise<RegisteredDevice | undefined>;
  createRegisteredDevice(data: InsertRegisteredDevice): Promise<RegisteredDevice>;
  updateRegisteredDevice(id: string, data: Partial<RegisteredDevice>): Promise<RegisteredDevice | undefined>;
  deleteRegisteredDevice(id: string): Promise<boolean>;

  // EMC Users (Enterprise Management Console)
  getEmcUsers(enterpriseId?: string, propertyId?: string): Promise<EmcUser[]>;
  getEmcUser(id: string): Promise<EmcUser | undefined>;
  getEmcUserByEmail(email: string): Promise<EmcUser | undefined>;
  createEmcUser(data: InsertEmcUser): Promise<EmcUser>;
  updateEmcUser(id: string, data: Partial<EmcUser>): Promise<EmcUser | undefined>;
  deleteEmcUser(id: string): Promise<boolean>;
  getEmcUserCount(): Promise<number>;

  getModifierMapRaw(): Promise<any[]>;
  getAccessibleEnterprisesAndProperties(user: { accessLevel: string; enterpriseId?: string | null; propertyId?: string | null; employeeId?: string | null }): Promise<{ enterprises: any[]; properties: any[] }>;

  runStartupMigrations(): Promise<void>;
  getConfigTableData(tableName: string, propertyId?: string, enterpriseId?: string, since?: string): Promise<{ rows: any[]; columns: string[]; incremental: boolean }>;
  getPaymentsByStatus(status: string, propertyId?: string): Promise<any[]>;
  getPaymentById(paymentId: string): Promise<any | undefined>;
  getTenderWithGateway(tenderId: string): Promise<{ tender: any; gatewayConfig: any | null } | null>;
  storeLfsIdRemap(localId: string, cloudId: string): Promise<void>;
  loadLfsIdRemap(localId: string): Promise<string | null>;
  ensureLfsRemapTable(): Promise<void>;
  findEntityByOfflineTransactionId(entityType: string, offlineTransactionId: string): Promise<string | null>;

  // EMC Sessions
  getEmcSession(id: string): Promise<EmcSession | undefined>;
  getEmcSessionByToken(sessionToken: string): Promise<EmcSession | undefined>;
  createEmcSession(data: InsertEmcSession): Promise<EmcSession>;
  deleteEmcSession(id: string): Promise<boolean>;
  deleteExpiredEmcSessions(): Promise<number>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(rvcId?: string): Promise<AuditLog[]>;

  // Print Jobs
  createPrintJob(data: InsertPrintJob): Promise<PrintJob>;
  getPrintJob(id: string): Promise<PrintJob | undefined>;
  getPendingPrintJobs(workstationId?: string, propertyId?: string): Promise<PrintJob[]>;
  updatePrintJob(id: string, data: Partial<PrintJob>): Promise<PrintJob | undefined>;
  findReceiptPrinter(propertyId: string): Promise<Printer | undefined>;

  // Print Agents
  getPrintAgents(propertyId?: string): Promise<PrintAgent[]>;
  getPrintAgent(id: string): Promise<PrintAgent | undefined>;
  getPrintAgentByToken(agentTokenHash: string): Promise<PrintAgent | undefined>;
  getOnlinePrintAgentForProperty(propertyId: string): Promise<PrintAgent | undefined>;
  getOnlinePrintAgentForWorkstation(workstationId: string): Promise<PrintAgent | undefined>;
  createPrintAgent(data: InsertPrintAgent): Promise<PrintAgent>;
  updatePrintAgent(id: string, data: Partial<PrintAgent>): Promise<PrintAgent | undefined>;
  deletePrintAgent(id: string): Promise<boolean>;
  getAgentPendingPrintJobs(agentId: string): Promise<PrintJob[]>;
  getAgentPrintingJobs(agentId: string): Promise<PrintJob[]>;
  getUnassignedPendingPrintJobsForProperty(propertyId: string): Promise<PrintJob[]>;

  getActiveKdsTicketsWithDetails(filters: { kdsDeviceId?: string; rvcId?: string }): Promise<{ tickets: any[]; fetchedAt: string }>;
  getAllWorkstationOrderDevicesFiltered(propertyId?: string): Promise<any[]>;
  getAllPosLayoutRvcAssignmentsFiltered(propertyId: string): Promise<any[]>;
  getOrdersForPickup(rvcId: string, filters?: { orderType?: string; statusFilter?: string }): Promise<any[]>;

  // KDS Tickets
  getKdsTickets(filters?: { rvcId?: string; kdsDeviceId?: string; stationType?: string }): Promise<any[]>;
  getAllKdsTicketsForReporting(filters?: { rvcId?: string }): Promise<any[]>;
  getKdsTicket(id: string): Promise<KdsTicket | undefined>;
  createKdsTicket(data: InsertKdsTicket & { id?: string }): Promise<KdsTicket>;
  updateKdsTicket(id: string, data: Partial<KdsTicket>): Promise<KdsTicket | undefined>;
  createKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void>;
  getKdsTicketItems(kdsTicketId: string): Promise<KdsTicketItem[]>;
  removeKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void>;
  voidKdsTicketItem(checkItemId: string): Promise<void>;
  bumpKdsTicket(id: string, bumpedBy?: string): Promise<KdsTicket | undefined>;
  recallKdsTicket(id: string, scope?: 'expo' | 'all'): Promise<KdsTicket | undefined>;
  getBumpedKdsTickets(filters: { rvcId?: string; stationType?: string; limit?: number }): Promise<any[]>;
  markKdsItemReady(ticketItemId: string): Promise<void>;
  unmarkKdsItemReady(ticketItemId: string): Promise<void>;
  getPreviewTicket(checkId: string): Promise<KdsTicket | undefined>;
  getPreviewTickets(checkId: string): Promise<KdsTicket[]>;
  getKdsTicketsByCheck(checkId: string): Promise<KdsTicket[]>;
  markKdsTicketsPaid(checkId: string): Promise<void>;

  // Admin Stats
  getAdminStats(enterpriseId?: string): Promise<{ enterprises: number; properties: number; rvcs: number; employees: number; menuItems: number; activeChecks: number }>;

  // POS Layouts
  getPosLayouts(rvcId?: string): Promise<PosLayout[]>;
  getPosLayout(id: string): Promise<PosLayout | undefined>;
  getDefaultPosLayout(rvcId: string): Promise<PosLayout | undefined>;
  createPosLayout(data: InsertPosLayout): Promise<PosLayout>;
  updatePosLayout(id: string, data: Partial<InsertPosLayout>): Promise<PosLayout | undefined>;
  deletePosLayout(id: string): Promise<boolean>;

  // POS Layout Cells
  getPosLayoutCells(layoutId: string): Promise<PosLayoutCell[]>;
  setPosLayoutCells(layoutId: string, cells: InsertPosLayoutCell[]): Promise<PosLayoutCell[]>;

  // POS Layout RVC Assignments
  getPosLayoutRvcAssignments(layoutId: string): Promise<PosLayoutRvcAssignment[]>;
  setPosLayoutRvcAssignments(layoutId: string, assignments: { propertyId: string; rvcId: string; isDefault?: boolean }[]): Promise<PosLayoutRvcAssignment[]>;
  getPosLayoutsForRvc(rvcId: string): Promise<PosLayout[]>;
  getDefaultLayoutForRvc(rvcId: string): Promise<PosLayout | undefined>;
  setDefaultLayoutForRvc(rvcId: string, layoutId: string): Promise<void>;

  // Admin Sales Reset (property-specific)
  getSalesDataSummary(propertyId: string): Promise<{ 
    checks: number; checkItems: number; payments: number; rounds: number; kdsTickets: number; auditLogs: number;
    fiscalPeriods: number; cashTransactions: number; drawerAssignments: number; safeCounts: number;
    giftCardTransactions: number; giftCards: number; loyaltyTransactions: number; loyaltyRedemptions: number; loyaltyMembers: number;
    onlineOrders: number; inventoryTransactions: number; inventoryStock: number;
    salesForecasts: number; laborForecasts: number; managerAlerts: number;
    itemAvailability: number; prepItems: number; offlineQueue: number; accountingExports: number;
  }>;
  clearSalesData(propertyId: string): Promise<{ deleted: { 
    checks: number; checkItems: number; payments: number; discounts: number; rounds: number; 
    kdsTicketItems: number; kdsTickets: number; terminalSessions: number; checkLocks: number; printJobs: number; auditLogs: number; 
    timePunches: number; timecards: number; breakSessions: number; timecardExceptions: number; shifts: number; 
    tipAllocations: number; tipPoolRuns: number;
    fiscalPeriods: number; cashTransactions: number; drawerAssignments: number; safeCounts: number;
    giftCardTransactions: number; giftCards: number; loyaltyTransactions: number; loyaltyRedemptions: number; loyaltyMembersReset: number;
    onlineOrders: number; inventoryTransactions: number; inventoryStock: number;
    salesForecasts: number; laborForecasts: number; managerAlerts: number;
    itemAvailability: number; prepItems: number; offlineQueue: number; accountingExports: number;
  } }>;

  // Device Registry (CAL)
  getDevices(filters?: { enterpriseId?: string; propertyId?: string; deviceType?: string; status?: string }): Promise<Device[]>;
  getDevice(id: string): Promise<Device | undefined>;
  getDeviceByDeviceId(deviceId: string): Promise<Device | undefined>;
  createDevice(data: InsertDevice): Promise<Device>;
  updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined>;
  deleteDevice(id: string): Promise<boolean>;
  updateDeviceLastSeen(id: string): Promise<void>;

  // Device Enrollment Tokens
  getDeviceEnrollmentTokens(enterpriseId?: string): Promise<DeviceEnrollmentToken[]>;
  getDeviceEnrollmentToken(id: string): Promise<DeviceEnrollmentToken | undefined>;
  getDeviceEnrollmentTokenByToken(token: string): Promise<DeviceEnrollmentToken | undefined>;
  createDeviceEnrollmentToken(data: InsertDeviceEnrollmentToken): Promise<DeviceEnrollmentToken>;
  deleteDeviceEnrollmentToken(id: string): Promise<boolean>;
  useDeviceEnrollmentToken(token: string): Promise<DeviceEnrollmentToken | undefined>;

  // Device Heartbeats
  createDeviceHeartbeat(data: InsertDeviceHeartbeat): Promise<DeviceHeartbeat>;
  getDeviceHeartbeats(deviceId: string, limit?: number): Promise<DeviceHeartbeat[]>;

  // Refunds
  getRefunds(rvcId?: string): Promise<Refund[]>;
  getRefundsForCheck(checkId: string): Promise<Refund[]>;
  getRefund(id: string): Promise<Refund | undefined>;
  getRefundWithDetails(id: string): Promise<{ refund: Refund; items: RefundItem[]; payments: RefundPayment[] } | undefined>;
  createRefund(data: InsertRefund, items: Omit<InsertRefundItem, 'refundId'>[], payments: Omit<InsertRefundPayment, 'refundId'>[]): Promise<Refund>;
  getAllRefundItems(): Promise<RefundItem[]>;
  getNextRefundNumber(rvcId: string): Promise<number>;
  getClosedChecks(rvcId: string, options?: { businessDate?: string; checkNumber?: number; limit?: number }): Promise<Check[]>;
  getCheckWithPaymentsAndItems(checkId: string): Promise<{ check: Check; items: CheckItem[]; payments: CheckPayment[] } | undefined>;

  // ============================================================================
  // TIME & ATTENDANCE
  // ============================================================================

  // Job Codes
  getJobCodes(propertyId?: string): Promise<JobCode[]>;
  getJobCode(id: string): Promise<JobCode | undefined>;
  createJobCode(data: InsertJobCode): Promise<JobCode>;
  updateJobCode(id: string, data: Partial<InsertJobCode>): Promise<JobCode | undefined>;
  deleteJobCode(id: string): Promise<boolean>;

  // Employee Job Codes
  getEmployeeJobCodes(employeeId: string): Promise<EmployeeJobCode[]>;
  getEmployeeJobCodesWithDetails(employeeId: string): Promise<(EmployeeJobCode & { jobCode: JobCode })[]>;
  getAllEmployeeJobCodesForProperty(propertyId: string): Promise<Record<string, (EmployeeJobCode & { jobCode: JobCode })[]>>;
  setEmployeeJobCodes(employeeId: string, assignments: { jobCodeId: string; payRate?: string; isPrimary?: boolean; bypassClockIn?: boolean }[]): Promise<EmployeeJobCode[]>;

  // Pay Periods
  getPayPeriods(propertyId: string): Promise<PayPeriod[]>;
  getPayPeriod(id: string): Promise<PayPeriod | undefined>;
  getPayPeriodForDate(propertyId: string, date: string): Promise<PayPeriod | undefined>;
  createPayPeriod(data: InsertPayPeriod): Promise<PayPeriod>;
  updatePayPeriod(id: string, data: Partial<InsertPayPeriod>): Promise<PayPeriod | undefined>;
  lockPayPeriod(id: string, lockedById: string): Promise<PayPeriod | undefined>;
  unlockPayPeriod(id: string, reason: string, unlockedById: string): Promise<PayPeriod | undefined>;

  // Time Punches
  getTimePunches(filters: { propertyId?: string; employeeId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<TimePunch[]>;
  getTimePunch(id: string): Promise<TimePunch | undefined>;
  getLastPunch(employeeId: string): Promise<TimePunch | undefined>;
  getActiveTimePunches(propertyId: string): Promise<TimePunch[]>;
  createTimePunch(data: InsertTimePunch): Promise<TimePunch>;
  updateTimePunch(id: string, data: Partial<InsertTimePunch>, editedById?: string, editReason?: string, editedByEmcUserId?: string, editedByDisplayName?: string): Promise<TimePunch | undefined>;
  voidTimePunch(id: string, voidedById: string, voidReason: string): Promise<TimePunch | undefined>;

  // Break Sessions
  getBreakSessions(filters: { propertyId?: string; employeeId?: string; businessDate?: string }): Promise<BreakSession[]>;
  getBreakSession(id: string): Promise<BreakSession | undefined>;
  getActiveBreak(employeeId: string): Promise<BreakSession | undefined>;
  createBreakSession(data: InsertBreakSession): Promise<BreakSession>;
  updateBreakSession(id: string, data: Partial<InsertBreakSession>): Promise<BreakSession | undefined>;

  // Timecards
  getTimecards(filters: { propertyId?: string; employeeId?: string; payPeriodId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<Timecard[]>;
  getTimecard(id: string): Promise<Timecard | undefined>;
  createTimecard(data: InsertTimecard): Promise<Timecard>;
  updateTimecard(id: string, data: Partial<InsertTimecard>): Promise<Timecard | undefined>;
  recalculateTimecard(employeeId: string, businessDate: string): Promise<Timecard | undefined>;

  // Timecard Exceptions
  getTimecardExceptions(filters: { propertyId?: string; employeeId?: string; status?: string }): Promise<TimecardException[]>;
  getTimecardException(id: string): Promise<TimecardException | undefined>;
  createTimecardException(data: InsertTimecardException): Promise<TimecardException>;
  resolveTimecardException(id: string, resolvedById: string, resolutionNotes: string): Promise<TimecardException | undefined>;

  // Timecard Edits (Audit Log)
  getTimecardEdits(filters: { propertyId?: string; targetType?: string; targetId?: string }): Promise<TimecardEdit[]>;
  createTimecardEdit(data: InsertTimecardEdit): Promise<TimecardEdit>;

  // ============================================================================
  // SCHEDULING
  // ============================================================================

  // Employee Availability
  getEmployeeAvailability(employeeId: string): Promise<EmployeeAvailability[]>;
  setEmployeeAvailability(employeeId: string, availability: InsertEmployeeAvailability[]): Promise<EmployeeAvailability[]>;

  // Availability Exceptions
  getAvailabilityExceptions(employeeId: string, startDate?: string, endDate?: string): Promise<AvailabilityException[]>;
  createAvailabilityException(data: InsertAvailabilityException): Promise<AvailabilityException>;
  deleteAvailabilityException(id: string): Promise<boolean>;

  // Time Off Requests
  getTimeOffRequests(filters: { employeeId?: string; propertyId?: string; status?: string }): Promise<TimeOffRequest[]>;
  getTimeOffRequest(id: string): Promise<TimeOffRequest | undefined>;
  createTimeOffRequest(data: InsertTimeOffRequest): Promise<TimeOffRequest>;
  updateTimeOffRequest(id: string, data: Partial<InsertTimeOffRequest>): Promise<TimeOffRequest | undefined>;
  reviewTimeOffRequest(id: string, reviewedById: string, approved: boolean, notes?: string): Promise<TimeOffRequest | undefined>;

  // Shift Templates
  getShiftTemplates(propertyId: string): Promise<ShiftTemplate[]>;
  getShiftTemplate(id: string): Promise<ShiftTemplate | undefined>;
  createShiftTemplate(data: InsertShiftTemplate): Promise<ShiftTemplate>;
  updateShiftTemplate(id: string, data: Partial<InsertShiftTemplate>): Promise<ShiftTemplate | undefined>;
  deleteShiftTemplate(id: string): Promise<boolean>;

  // Shifts
  getShifts(filters: { propertyId?: string; rvcId?: string; employeeId?: string; startDate?: string; endDate?: string; status?: string }): Promise<Shift[]>;
  getShift(id: string): Promise<Shift | undefined>;
  createShift(data: InsertShift): Promise<Shift>;
  updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined>;
  deleteShift(id: string): Promise<boolean>;
  publishShifts(shiftIds: string[], publishedById: string | null): Promise<Shift[]>;
  copyWeekSchedule(propertyId: string, sourceWeekStart: string, targetWeekStart: string): Promise<Shift[]>;

  // Shift Cover Requests
  getShiftCoverRequests(filters: { shiftId?: string; requesterId?: string; status?: string }): Promise<ShiftCoverRequest[]>;
  getShiftCoverRequest(id: string): Promise<ShiftCoverRequest | undefined>;
  createShiftCoverRequest(data: InsertShiftCoverRequest): Promise<ShiftCoverRequest>;
  updateShiftCoverRequest(id: string, data: Partial<InsertShiftCoverRequest>): Promise<ShiftCoverRequest | undefined>;

  // Shift Cover Offers
  getShiftCoverOffers(coverRequestId: string): Promise<ShiftCoverOffer[]>;
  createShiftCoverOffer(data: InsertShiftCoverOffer): Promise<ShiftCoverOffer>;
  updateShiftCoverOffer(id: string, data: Partial<InsertShiftCoverOffer>): Promise<ShiftCoverOffer | undefined>;

  // Shift Cover Approvals
  approveShiftCover(coverRequestId: string, offerId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval>;
  denyShiftCover(coverRequestId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval>;

  // ============================================================================
  // TIP POOLING
  // ============================================================================

  // Tip Pool Policies
  getTipPoolPolicies(propertyId: string): Promise<TipPoolPolicy[]>;
  getTipPoolPolicy(id: string): Promise<TipPoolPolicy | undefined>;
  createTipPoolPolicy(data: InsertTipPoolPolicy): Promise<TipPoolPolicy>;
  updateTipPoolPolicy(id: string, data: Partial<InsertTipPoolPolicy>): Promise<TipPoolPolicy | undefined>;
  deleteTipPoolPolicy(id: string): Promise<boolean>;

  // Tip Pool Runs
  getTipPoolRuns(filters: { propertyId?: string; businessDate?: string }): Promise<TipPoolRun[]>;
  getTipPoolRun(id: string): Promise<TipPoolRun | undefined>;
  createTipPoolRun(data: InsertTipPoolRun): Promise<TipPoolRun>;
  updateTipPoolRun(id: string, data: Partial<InsertTipPoolRun>): Promise<TipPoolRun | undefined>;

  // Tip Allocations
  getTipAllocations(tipPoolRunId: string): Promise<TipAllocation[]>;
  createTipAllocation(data: InsertTipAllocation): Promise<TipAllocation>;
  runTipPoolSettlement(propertyId: string, businessDate: string, policyId: string, runById: string): Promise<{ run: TipPoolRun; allocations: TipAllocation[] }>;

  // ============================================================================
  // TIP RULES (Square-style tip configuration)
  // ============================================================================

  getTipRules(filters: { enterpriseId?: string; propertyId?: string; rvcId?: string }): Promise<TipRule[]>;
  getTipRule(id: string): Promise<TipRule | undefined>;
  getTipRuleForProperty(propertyId: string): Promise<TipRule | undefined>;
  createTipRule(data: InsertTipRule): Promise<TipRule>;
  updateTipRule(id: string, data: Partial<InsertTipRule>): Promise<TipRule | undefined>;
  deleteTipRule(id: string): Promise<boolean>;

  // Tip Rule Job Percentages (for pool_by_percentages distribution method)
  getTipRuleJobPercentages(tipRuleId: string): Promise<TipRuleJobPercentage[]>;
  upsertTipRuleJobPercentages(tipRuleId: string, percentages: Array<{ jobCodeId: string; percentage: string }>): Promise<TipRuleJobPercentage[]>;

  // ============================================================================
  // LABOR VS SALES
  // ============================================================================

  // Labor Snapshots
  getLaborSnapshots(filters: { propertyId?: string; rvcId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<LaborSnapshot[]>;
  createLaborSnapshot(data: InsertLaborSnapshot): Promise<LaborSnapshot>;
  updateLaborSnapshot(id: string, data: Partial<InsertLaborSnapshot>): Promise<LaborSnapshot | undefined>;
  calculateLaborSnapshot(propertyId: string, businessDate: string): Promise<LaborSnapshot>;

  // ============================================================================
  // OVERTIME RULES
  // ============================================================================
  
  getOvertimeRules(propertyId: string): Promise<OvertimeRule[]>;
  getOvertimeRule(id: string): Promise<OvertimeRule | undefined>;
  getActiveOvertimeRule(propertyId: string): Promise<OvertimeRule | undefined>;
  createOvertimeRule(data: InsertOvertimeRule): Promise<OvertimeRule>;
  updateOvertimeRule(id: string, data: Partial<InsertOvertimeRule>): Promise<OvertimeRule | undefined>;
  deleteOvertimeRule(id: string): Promise<boolean>;

  // ============================================================================
  // CALIFORNIA LABOR COMPLIANCE - Break Rules, Attestations, Violations
  // ============================================================================
  
  getBreakRules(propertyId: string): Promise<BreakRule[]>;
  getBreakRule(id: string): Promise<BreakRule | undefined>;
  getActiveBreakRule(propertyId: string): Promise<BreakRule | undefined>;
  createBreakRule(data: InsertBreakRule): Promise<BreakRule>;
  updateBreakRule(id: string, data: Partial<InsertBreakRule>): Promise<BreakRule | undefined>;
  deleteBreakRule(id: string): Promise<boolean>;
  
  getBreakAttestations(propertyId: string, businessDate?: string): Promise<BreakAttestation[]>;
  getBreakAttestationsByEmployee(employeeId: string, businessDate?: string): Promise<BreakAttestation[]>;
  createBreakAttestation(data: InsertBreakAttestation): Promise<BreakAttestation>;
  
  getBreakViolations(propertyId: string, options?: { businessDate?: string; startDate?: string; endDate?: string; status?: string }): Promise<BreakViolation[]>;
  getBreakViolationsByEmployee(employeeId: string): Promise<BreakViolation[]>;
  createBreakViolation(data: InsertBreakViolation): Promise<BreakViolation>;
  updateBreakViolation(id: string, data: Partial<InsertBreakViolation>): Promise<BreakViolation | undefined>;
  acknowledgeBreakViolation(id: string, acknowledgedById: string): Promise<BreakViolation | undefined>;
  
  getMinorLaborRules(propertyId: string): Promise<MinorLaborRule[]>;
  getActiveMinorLaborRule(propertyId: string): Promise<MinorLaborRule | undefined>;
  createMinorLaborRule(data: InsertMinorLaborRule): Promise<MinorLaborRule>;
  updateMinorLaborRule(id: string, data: Partial<InsertMinorLaborRule>): Promise<MinorLaborRule | undefined>;
  
  getEmployeeMinorStatus(employeeId: string): Promise<EmployeeMinorStatus | undefined>;
  getEmployeeMinorStatusesByProperty(propertyId: string): Promise<EmployeeMinorStatus[]>;
  createEmployeeMinorStatus(data: InsertEmployeeMinorStatus): Promise<EmployeeMinorStatus>;
  updateEmployeeMinorStatus(id: string, data: Partial<InsertEmployeeMinorStatus>): Promise<EmployeeMinorStatus | undefined>;
  deleteEmployeeMinorStatus(id: string): Promise<boolean>;

  // ============================================================================
  // LOYALTY PROGRAMS
  // ============================================================================

  getLoyaltyPrograms(enterpriseId?: string, propertyId?: string): Promise<LoyaltyProgram[]>;
  createLoyaltyProgram(data: InsertLoyaltyProgram): Promise<LoyaltyProgram>;
  updateLoyaltyProgram(id: string, data: Partial<InsertLoyaltyProgram>): Promise<LoyaltyProgram | undefined>;
  
  // Loyalty Members (customer profiles)
  getLoyaltyMembers(search?: string, enterpriseId?: string, propertyId?: string): Promise<LoyaltyMember[]>;
  getLoyaltyMember(id: string): Promise<LoyaltyMember | undefined>;
  getLoyaltyMemberWithEnrollments(id: string): Promise<LoyaltyMemberWithEnrollments | undefined>;
  getLoyaltyMemberByIdentifier(identifier: string): Promise<LoyaltyMember | undefined>;
  createLoyaltyMember(data: InsertLoyaltyMember): Promise<LoyaltyMember>;
  updateLoyaltyMember(id: string, data: Partial<InsertLoyaltyMember>): Promise<LoyaltyMember | undefined>;
  
  // Loyalty Enrollments (member-program connections)
  getLoyaltyEnrollments(memberId: string): Promise<LoyaltyMemberEnrollment[]>;
  getLoyaltyEnrollmentsByProgram(programId: string): Promise<LoyaltyMemberEnrollment[]>;
  getLoyaltyEnrollment(id: string): Promise<LoyaltyMemberEnrollment | undefined>;
  createLoyaltyEnrollment(data: InsertLoyaltyMemberEnrollment): Promise<LoyaltyMemberEnrollment>;
  updateLoyaltyEnrollment(id: string, data: Partial<InsertLoyaltyMemberEnrollment>): Promise<LoyaltyMemberEnrollment | undefined>;
  
  // Loyalty Transactions
  createLoyaltyTransaction(data: InsertLoyaltyTransaction): Promise<LoyaltyTransaction>;
  getLoyaltyTransactionsByMember(memberId: string): Promise<LoyaltyTransaction[]>;
  getLoyaltyTransactionsByEnrollment(enrollmentId: string): Promise<LoyaltyTransaction[]>;
  
  // Loyalty Rewards
  getLoyaltyRewards(programId?: string): Promise<LoyaltyReward[]>;
  getLoyaltyReward(id: string): Promise<LoyaltyReward | undefined>;
  createLoyaltyReward(data: InsertLoyaltyReward): Promise<LoyaltyReward>;
  updateLoyaltyReward(id: string, data: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined>;
  
  // Loyalty Redemptions
  getLoyaltyRedemptionsByMember(memberId: string): Promise<LoyaltyRedemption[]>;
  getLoyaltyRedemptionsByCheck(checkId: string): Promise<LoyaltyRedemption[]>;
  createLoyaltyRedemption(data: InsertLoyaltyRedemption): Promise<LoyaltyRedemption>;
  
  // Check customer operations
  getChecksByCustomer(customerId: string, limit?: number): Promise<Check[]>;
  attachCustomerToCheck(checkId: string, customerId: string): Promise<Check | undefined>;
  detachCustomerFromCheck(checkId: string): Promise<Check | undefined>;

  updateGiftCard(id: string, data: Partial<InsertGiftCard>): Promise<GiftCard | undefined>;
  updateOnlineOrder(id: string, data: Partial<InsertOnlineOrder>): Promise<OnlineOrder | undefined>;

  // ============================================================================
  // GUEST CHECK DESCRIPTORS
  // ============================================================================
  
  getDescriptorSet(scopeType: DescriptorScopeType, scopeId: string): Promise<DescriptorSet | undefined>;
  getDescriptorSets(enterpriseId: string): Promise<DescriptorSet[]>;
  createDescriptorSet(data: InsertDescriptorSet): Promise<DescriptorSet>;
  updateDescriptorSet(id: string, data: Partial<InsertDescriptorSet>): Promise<DescriptorSet | undefined>;
  deleteDescriptorSet(id: string): Promise<boolean>;
  getEffectiveDescriptors(rvcId: string): Promise<{ headerLines: string[]; trailerLines: string[]; logoEnabled: boolean; logoAssetId: string | null }>;
  
  // Logo Assets
  getDescriptorLogoAsset(id: string): Promise<DescriptorLogoAsset | undefined>;
  getDescriptorLogoAssets(enterpriseId: string): Promise<DescriptorLogoAsset[]>;
  createDescriptorLogoAsset(data: InsertDescriptorLogoAsset): Promise<DescriptorLogoAsset>;
  deleteDescriptorLogoAsset(id: string): Promise<boolean>;

  // ============================================================================
  // V2 SERVICE HOST SYNC INFRASTRUCTURE
  // ============================================================================
  
  // Service Hosts
  getServiceHosts(propertyId?: string): Promise<ServiceHost[]>;
  getServiceHost(id: string): Promise<ServiceHost | undefined>;
  createServiceHost(data: InsertServiceHost): Promise<ServiceHost>;
  updateServiceHost(id: string, data: Partial<InsertServiceHost>): Promise<ServiceHost | undefined>;
  deleteServiceHost(id: string): Promise<boolean>;
  
  // Config Versions
  getLatestConfigVersion(propertyId: string): Promise<number>;
  getConfigChanges(propertyId: string, sinceVersion: number): Promise<ConfigVersion[]>;
  createConfigVersion(data: InsertConfigVersion): Promise<ConfigVersion>;
  
  // Service Host Transactions
  createServiceHostTransaction(data: InsertServiceHostTransaction): Promise<ServiceHostTransaction>;
  getServiceHostTransactions(serviceHostId: string): Promise<ServiceHostTransaction[]>;
  
  // Service Host Metrics
  createServiceHostMetrics(data: InsertServiceHostMetrics): Promise<ServiceHostMetrics>;
  getServiceHostMetrics(serviceHostId: string, limit?: number): Promise<ServiceHostMetrics[]>;
  getServiceHostMetricsByProperty(propertyId: string, since?: Date): Promise<ServiceHostMetrics[]>;
  
  // Service Host Alerts
  createServiceHostAlert(data: InsertServiceHostAlert): Promise<ServiceHostAlert>;
  getServiceHostAlerts(propertyId?: string, acknowledged?: boolean): Promise<ServiceHostAlert[]>;
  acknowledgeServiceHostAlert(id: string, acknowledgedById: string): Promise<ServiceHostAlert | undefined>;
  resolveServiceHostAlert(id: string): Promise<ServiceHostAlert | undefined>;
  
  // Service Host Alert Rules
  getServiceHostAlertRules(enterpriseId: string): Promise<ServiceHostAlertRule[]>;
  createServiceHostAlertRule(data: InsertServiceHostAlertRule): Promise<ServiceHostAlertRule>;
  updateServiceHostAlertRule(id: string, data: Partial<InsertServiceHostAlertRule>): Promise<ServiceHostAlertRule | undefined>;
  deleteServiceHostAlertRule(id: string): Promise<boolean>;

  // ============================================================================
  // WORKSTATION SERVICE BINDINGS
  // ============================================================================
  
  getWorkstationServiceBindings(propertyId: string): Promise<WorkstationServiceBinding[]>;
  getAllWorkstationServiceBindings(): Promise<WorkstationServiceBinding[]>;
  getWorkstationServiceBinding(id: string): Promise<WorkstationServiceBinding | undefined>;
  getServiceBindingByType(propertyId: string, serviceType: string): Promise<WorkstationServiceBinding | undefined>;
  getBindingsForWorkstation(workstationId: string): Promise<WorkstationServiceBinding[]>;
  deleteBindingsForWorkstation(workstationId: string): Promise<number>;
  deleteOtherBindingsForServiceType(propertyId: string, serviceType: string, keepWorkstationId: string): Promise<number>;
  createWorkstationServiceBinding(data: InsertWorkstationServiceBinding): Promise<WorkstationServiceBinding>;
  updateWorkstationServiceBinding(id: string, data: Partial<InsertWorkstationServiceBinding>): Promise<WorkstationServiceBinding | undefined>;
  deleteWorkstationServiceBinding(id: string): Promise<boolean>;

  // ============================================================================
  // CAL PACKAGES
  // ============================================================================
  
  getCalPackages(enterpriseId: string): Promise<CalPackage[]>;
  getCalPackage(id: string): Promise<CalPackage | undefined>;
  createCalPackage(data: InsertCalPackage): Promise<CalPackage>;
  updateCalPackage(id: string, data: Partial<InsertCalPackage>): Promise<CalPackage | undefined>;
  deleteCalPackage(id: string): Promise<boolean>;

  // CAL Package Versions
  getCalPackageVersions(packageId: string): Promise<CalPackageVersion[]>;
  getCalPackageVersion(id: string): Promise<CalPackageVersion | undefined>;
  createCalPackageVersion(data: InsertCalPackageVersion): Promise<CalPackageVersion>;
  updateCalPackageVersion(id: string, data: Partial<InsertCalPackageVersion>): Promise<CalPackageVersion | undefined>;
  deleteCalPackageVersion(id: string): Promise<boolean>;

  // CAL Package Prerequisites
  getCalPackagePrerequisites(packageVersionId: string): Promise<CalPackagePrerequisite[]>;
  createCalPackagePrerequisite(data: InsertCalPackagePrerequisite): Promise<CalPackagePrerequisite>;
  deleteCalPackagePrerequisite(id: string): Promise<boolean>;

  // CAL Deployments
  getCalDeployments(enterpriseId: string): Promise<CalDeployment[]>;
  getCalDeployment(id: string): Promise<CalDeployment | undefined>;
  createCalDeployment(data: InsertCalDeployment): Promise<CalDeployment>;
  updateCalDeployment(id: string, data: Partial<InsertCalDeployment>): Promise<CalDeployment | undefined>;
  deleteCalDeployment(id: string): Promise<boolean>;

  // CAL Deployment Targets
  getCalDeploymentTargets(deploymentId: string): Promise<CalDeploymentTarget[]>;
  getCalDeploymentTarget(id: string): Promise<CalDeploymentTarget | undefined>;
  getCalDeploymentTargetsByServiceHost(serviceHostId: string): Promise<CalDeploymentTarget[]>;
  createCalDeploymentTarget(data: InsertCalDeploymentTarget): Promise<CalDeploymentTarget>;
  updateCalDeploymentTarget(id: string, data: Partial<InsertCalDeploymentTarget>): Promise<CalDeploymentTarget | undefined>;
  updateCalDeploymentTargetStatus(id: string, status: string, statusMessage?: string): Promise<CalDeploymentTarget | undefined>;

  // EMC Option Flags
  getOptionFlags(enterpriseId: string, entityType: string, entityId: string): Promise<EmcOptionFlag[]>;
  getOptionFlag(enterpriseId: string, entityType: string, entityId: string, optionKey: string, scopeLevel: string, scopeId: string): Promise<EmcOptionFlag | undefined>;
  setOptionFlag(data: InsertEmcOptionFlag): Promise<EmcOptionFlag>;
  deleteOptionFlag(id: string): Promise<boolean>;
  deleteOptionFlagByKey(enterpriseId: string, entityType: string, entityId: string, optionKey: string, scopeLevel: string, scopeId: string): Promise<boolean>;
  listOptionFlagsByScope(enterpriseId: string, scopeLevel: string, scopeId: string): Promise<EmcOptionFlag[]>;
  listAllOptionFlagsByEnterprise(enterpriseId: string): Promise<EmcOptionFlag[]>;

  // LFS Configurations
  getLfsConfiguration(propertyId: string): Promise<LfsConfiguration | undefined>;
  getLfsConfigurations(): Promise<LfsConfiguration[]>;
  createLfsConfiguration(data: InsertLfsConfiguration): Promise<LfsConfiguration>;
  updateLfsConfiguration(propertyId: string, data: Partial<InsertLfsConfiguration>): Promise<LfsConfiguration | undefined>;
  deleteLfsConfiguration(propertyId: string): Promise<boolean>;
  getLfsConfigurationByApiKey(apiKey: string): Promise<LfsConfiguration | undefined>;

  // LFS Sync Logs
  getLfsSyncLogs(propertyId: string, limit?: number): Promise<LfsSyncLog[]>;
  createLfsSyncLog(data: InsertLfsSyncLog): Promise<LfsSyncLog>;

  // Cash Transactions
  createCashTransaction(data: InsertCashTransaction): Promise<CashTransaction>;

  // Inventory Transactions
  createInventoryTransaction(data: InsertInventoryTransaction): Promise<InventoryTransaction>;

  // Item Availability
  restoreItemAvailability(menuItemId: string, propertyId: string, quantity?: number): Promise<ItemAvailability | undefined>;
}

function sanitizeDates<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const result = { ...data };
  for (const key in result) {
    const val = result[key];
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        (result as any)[key] = d;
      }
    }
  }
  return result;
}

export class DatabaseStorage implements IStorage {
  async getDatabaseStatus(): Promise<{ db: string; version: string; serverTime: Date }> {
    const result = await db.execute(sql`SELECT current_database() AS db, version() AS version, now() AS server_time`);
    const row = result.rows[0] as any;
    return { db: row.db, version: row.version, serverTime: new Date(row.server_time) };
  }

  async executeReportQuery(query: any): Promise<{ rows: any[] }> {
    const result = await db.execute(query);
    return { rows: result.rows as any[] };
  }

  // Enterprises
  async getEnterprises(): Promise<Enterprise[]> {
    return db.select().from(enterprises);
  }

  async getEnterprise(id: string): Promise<Enterprise | undefined> {
    const [result] = await db.select().from(enterprises).where(eq(enterprises.id, id));
    return result;
  }

  async createEnterprise(data: InsertEnterprise): Promise<Enterprise> {
    const [result] = await db.insert(enterprises).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateEnterprise(id: string, data: Partial<InsertEnterprise>): Promise<Enterprise | undefined> {
    const [result] = await db.update(enterprises).set(sanitizeDates(data)).where(eq(enterprises.id, id)).returning();
    return result;
  }

  async deleteEnterprise(id: string): Promise<boolean> {
    const result = await db.delete(enterprises).where(eq(enterprises.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Properties
  async getProperties(enterpriseId?: string): Promise<Property[]> {
    if (enterpriseId) {
      return db.select().from(properties).where(eq(properties.enterpriseId, enterpriseId));
    }
    return db.select().from(properties);
  }

  async getProperty(id: string): Promise<Property | undefined> {
    const [result] = await db.select().from(properties).where(eq(properties.id, id));
    return result;
  }

  async createProperty(data: InsertProperty): Promise<Property> {
    const [result] = await db.insert(properties).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateProperty(id: string, data: Partial<InsertProperty>): Promise<Property | undefined> {
    const [result] = await db.update(properties).set(sanitizeDates(data)).where(eq(properties.id, id)).returning();
    return result;
  }

  async deleteProperty(id: string): Promise<boolean> {
    const result = await db.delete(properties).where(eq(properties.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // RVCs
  async getRvcs(propertyId?: string): Promise<Rvc[]> {
    if (propertyId) {
      return db.select().from(rvcs).where(eq(rvcs.propertyId, propertyId));
    }
    return db.select().from(rvcs);
  }

  async getRvc(id: string): Promise<Rvc | undefined> {
    const [result] = await db.select().from(rvcs).where(eq(rvcs.id, id));
    return result;
  }

  async createRvc(data: InsertRvc): Promise<Rvc> {
    const [result] = await db.insert(rvcs).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateRvc(id: string, data: Partial<InsertRvc>): Promise<Rvc | undefined> {
    const [result] = await db.update(rvcs).set(sanitizeDates(data)).where(eq(rvcs.id, id)).returning();
    return result;
  }

  async deleteRvc(id: string): Promise<boolean> {
    const result = await db.delete(rvcs).where(eq(rvcs.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Roles
  async getRoles(): Promise<Role[]> {
    return db.select().from(roles);
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [result] = await db.select().from(roles).where(eq(roles.id, id));
    return result;
  }

  async createRole(data: InsertRole): Promise<Role> {
    const [result] = await db.insert(roles).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateRole(id: string, data: Partial<InsertRole>): Promise<Role | undefined> {
    const [result] = await db.update(roles).set(sanitizeDates(data)).where(eq(roles.id, id)).returning();
    return result;
  }

  async deleteRole(id: string): Promise<boolean> {
    const result = await db.delete(roles).where(eq(roles.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getRolePrivileges(roleId: string): Promise<string[]> {
    const result = await db.select().from(rolePrivileges).where(eq(rolePrivileges.roleId, roleId));
    return result.map(rp => rp.privilegeCode);
  }

  async setRolePrivileges(roleId: string, privilegeCodes: string[]): Promise<void> {
    // Delete existing privileges for this role
    await db.delete(rolePrivileges).where(eq(rolePrivileges.roleId, roleId));
    
    // Insert new privileges
    if (privilegeCodes.length === 0) return;
    
    const inserts = privilegeCodes.map(code => ({
      roleId,
      privilegeCode: code,
    }));
    await db.insert(rolePrivileges).values(inserts);
  }

  async upsertRole(data: InsertRole): Promise<Role> {
    // Try to find existing role by code AND enterpriseId (each enterprise has their own set of roles)
    const conditions = [eq(roles.code, data.code)];
    if (data.enterpriseId) {
      conditions.push(eq(roles.enterpriseId, data.enterpriseId));
    } else {
      conditions.push(sql`${roles.enterpriseId} IS NULL`);
    }
    const existing = await db.select().from(roles).where(and(...conditions)).limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(roles).set(sanitizeDates(data)).where(eq(roles.id, existing[0].id)).returning();
      return updated;
    }
    const [created] = await db.insert(roles).values(sanitizeDates(data)).returning();
    return created;
  }

  async getRoleRules(roleId: string): Promise<RoleRules | undefined> {
    const [result] = await db.select().from(roleRules).where(eq(roleRules.roleId, roleId));
    return result;
  }

  async upsertRoleRules(data: InsertRoleRules): Promise<RoleRules> {
    const existing = await db.select().from(roleRules).where(eq(roleRules.roleId, data.roleId)).limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(roleRules)
        .set({ ...sanitizeDates(data), updatedAt: new Date() })
        .where(eq(roleRules.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(roleRules).values(sanitizeDates(data)).returning();
    return created;
  }

  // Employees
  async getEmployees(): Promise<Employee[]> {
    return db.select().from(employees);
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const [result] = await db.select().from(employees).where(eq(employees.id, id));
    return result;
  }

  async getEmployeeByPin(pin: string): Promise<Employee | undefined> {
    const [result] = await db.select().from(employees).where(eq(employees.pinHash, pin));
    return result;
  }

  async getEmployeeByPinAndEnterprise(pin: string, enterpriseId: string): Promise<Employee | undefined> {
    const [result] = await db.select().from(employees).where(
      and(eq(employees.pinHash, pin), eq(employees.enterpriseId, enterpriseId))
    );
    return result;
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> {
    const [result] = await db.insert(employees).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const [result] = await db.update(employees).set(sanitizeDates(data)).where(eq(employees.id, id)).returning();
    return result;
  }

  async deleteEmployee(id: string): Promise<boolean> {
    // Delete employee assignments first
    await db.delete(employeeAssignments).where(eq(employeeAssignments.employeeId, id));
    const result = await db.delete(employees).where(eq(employees.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Employee Assignments (multi-property)
  async getEmployeeAssignments(employeeId: string): Promise<EmployeeAssignment[]> {
    return db.select().from(employeeAssignments).where(eq(employeeAssignments.employeeId, employeeId));
  }

  async getAllEmployeeAssignments(): Promise<EmployeeAssignment[]> {
    return db.select().from(employeeAssignments);
  }

  async setEmployeeAssignments(employeeId: string, propertyIds: string[]): Promise<EmployeeAssignment[]> {
    // Delete existing assignments
    await db.delete(employeeAssignments).where(eq(employeeAssignments.employeeId, employeeId));
    
    // Insert new assignments
    if (propertyIds.length === 0) return [];
    
    const assignments = propertyIds.map((propertyId, index) => ({
      employeeId,
      propertyId,
      isPrimary: index === 0, // First property is primary
    }));
    
    return db.insert(employeeAssignments).values(assignments).returning();
  }

  // Privileges
  async getPrivileges(): Promise<Privilege[]> {
    return db.select().from(privileges);
  }

  async createPrivilege(data: InsertPrivilege): Promise<Privilege> {
    const [result] = await db.insert(privileges).values(sanitizeDates(data)).returning();
    return result;
  }

  async upsertPrivileges(privilegeList: InsertPrivilege[]): Promise<void> {
    for (const priv of privilegeList) {
      await db.insert(privileges)
        .values(priv)
        .onConflictDoUpdate({
          target: privileges.code,
          set: { name: priv.name, domain: priv.domain, description: priv.description }
        });
    }
  }

  // Major Groups
  async getMajorGroups(): Promise<MajorGroup[]> {
    return db.select().from(majorGroups).orderBy(majorGroups.displayOrder);
  }

  async getMajorGroup(id: string): Promise<MajorGroup | undefined> {
    const [result] = await db.select().from(majorGroups).where(eq(majorGroups.id, id));
    return result;
  }

  async createMajorGroup(data: InsertMajorGroup): Promise<MajorGroup> {
    const [result] = await db.insert(majorGroups).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateMajorGroup(id: string, data: Partial<InsertMajorGroup>): Promise<MajorGroup | undefined> {
    const [result] = await db.update(majorGroups).set(sanitizeDates(data)).where(eq(majorGroups.id, id)).returning();
    return result;
  }

  async deleteMajorGroup(id: string): Promise<boolean> {
    // Clear references in family groups and menu items first
    await db.update(familyGroups).set({ majorGroupId: null }).where(eq(familyGroups.majorGroupId, id));
    await db.update(menuItems).set({ majorGroupId: null }).where(eq(menuItems.majorGroupId, id));
    const result = await db.delete(majorGroups).where(eq(majorGroups.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Family Groups
  async getFamilyGroups(majorGroupId?: string): Promise<FamilyGroup[]> {
    if (majorGroupId) {
      return db.select().from(familyGroups).where(eq(familyGroups.majorGroupId, majorGroupId)).orderBy(familyGroups.displayOrder);
    }
    return db.select().from(familyGroups).orderBy(familyGroups.displayOrder);
  }

  async getFamilyGroup(id: string): Promise<FamilyGroup | undefined> {
    const [result] = await db.select().from(familyGroups).where(eq(familyGroups.id, id));
    return result;
  }

  async createFamilyGroup(data: InsertFamilyGroup): Promise<FamilyGroup> {
    const [result] = await db.insert(familyGroups).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateFamilyGroup(id: string, data: Partial<InsertFamilyGroup>): Promise<FamilyGroup | undefined> {
    const [result] = await db.update(familyGroups).set(sanitizeDates(data)).where(eq(familyGroups.id, id)).returning();
    return result;
  }

  async deleteFamilyGroup(id: string): Promise<boolean> {
    // Clear references in menu items first
    await db.update(menuItems).set({ familyGroupId: null }).where(eq(menuItems.familyGroupId, id));
    const result = await db.delete(familyGroups).where(eq(familyGroups.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // SLUs
  async getSlus(rvcId?: string): Promise<Slu[]> {
    return db.select().from(slus).orderBy(slus.displayOrder);
  }

  async getSlu(id: string): Promise<Slu | undefined> {
    const [result] = await db.select().from(slus).where(eq(slus.id, id));
    return result;
  }

  async createSlu(data: InsertSlu): Promise<Slu> {
    const [result] = await db.insert(slus).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateSlu(id: string, data: Partial<InsertSlu>): Promise<Slu | undefined> {
    const [result] = await db.update(slus).set(sanitizeDates(data)).where(eq(slus.id, id)).returning();
    return result;
  }

  async deleteSlu(id: string): Promise<boolean> {
    // First delete related menu item linkages
    await db.delete(menuItemSlus).where(eq(menuItemSlus.sluId, id));
    // Then delete the SLU
    const result = await db.delete(slus).where(eq(slus.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Menu Item SLU Linkages
  async getMenuItemSlus(menuItemId?: string): Promise<MenuItemSlu[]> {
    if (menuItemId) {
      return db.select().from(menuItemSlus).where(eq(menuItemSlus.menuItemId, menuItemId));
    }
    return db.select().from(menuItemSlus);
  }

  async setMenuItemSlus(menuItemId: string, sluIds: string[]): Promise<void> {
    // Delete existing linkages
    await db.delete(menuItemSlus).where(eq(menuItemSlus.menuItemId, menuItemId));
    // Insert new linkages
    if (sluIds.length > 0) {
      await db.insert(menuItemSlus).values(
        sluIds.map((sluId, index) => ({
          menuItemId,
          sluId,
          displayOrder: index,
        }))
      );
    }
  }

  // Tax Groups
  async getTaxGroups(): Promise<TaxGroup[]> {
    return db.select().from(taxGroups);
  }

  async getTaxGroup(id: string): Promise<TaxGroup | undefined> {
    const [result] = await db.select().from(taxGroups).where(eq(taxGroups.id, id));
    return result;
  }

  async createTaxGroup(data: InsertTaxGroup): Promise<TaxGroup> {
    const [result] = await db.insert(taxGroups).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTaxGroup(id: string, data: Partial<InsertTaxGroup>): Promise<TaxGroup | undefined> {
    const [result] = await db.update(taxGroups).set(sanitizeDates(data)).where(eq(taxGroups.id, id)).returning();
    return result;
  }

  async deleteTaxGroup(id: string): Promise<boolean> {
    const result = await db.delete(taxGroups).where(eq(taxGroups.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Print Classes
  async getPrintClasses(): Promise<PrintClass[]> {
    return db.select().from(printClasses);
  }

  async getPrintClass(id: string): Promise<PrintClass | undefined> {
    const [result] = await db.select().from(printClasses).where(eq(printClasses.id, id));
    return result;
  }

  async createPrintClass(data: InsertPrintClass): Promise<PrintClass> {
    const [result] = await db.insert(printClasses).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePrintClass(id: string, data: Partial<InsertPrintClass>): Promise<PrintClass | undefined> {
    const [result] = await db.update(printClasses).set(sanitizeDates(data)).where(eq(printClasses.id, id)).returning();
    return result;
  }

  async deletePrintClass(id: string): Promise<boolean> {
    const result = await db.delete(printClasses).where(eq(printClasses.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Workstations
  async getWorkstations(propertyId?: string): Promise<Workstation[]> {
    if (propertyId) {
      return db.select().from(workstations).where(eq(workstations.propertyId, propertyId));
    }
    return db.select().from(workstations);
  }

  async getWorkstation(id: string): Promise<Workstation | undefined> {
    const [result] = await db.select().from(workstations).where(eq(workstations.id, id));
    return result;
  }

  async createWorkstation(data: InsertWorkstation): Promise<Workstation> {
    const [result] = await db.insert(workstations).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateWorkstation(id: string, data: Partial<InsertWorkstation>): Promise<Workstation | undefined> {
    const [result] = await db.update(workstations).set(sanitizeDates(data)).where(eq(workstations.id, id)).returning();
    return result;
  }

  async deleteWorkstation(id: string): Promise<boolean> {
    await db.delete(workstationOrderDevices).where(eq(workstationOrderDevices.workstationId, id));
    const result = await db.delete(workstations).where(eq(workstations.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getWorkstationOrderDevices(workstationId: string): Promise<WorkstationOrderDevice[]> {
    return db.select().from(workstationOrderDevices).where(eq(workstationOrderDevices.workstationId, workstationId));
  }

  async setWorkstationOrderDevices(workstationId: string, orderDeviceIds: string[]): Promise<WorkstationOrderDevice[]> {
    await db.delete(workstationOrderDevices).where(eq(workstationOrderDevices.workstationId, workstationId));
    if (orderDeviceIds.length === 0) return [];
    const rows = orderDeviceIds.map(orderDeviceId => ({ workstationId, orderDeviceId }));
    return db.insert(workstationOrderDevices).values(rows).returning();
  }

  // Printers
  async getPrinters(propertyId?: string): Promise<Printer[]> {
    if (propertyId) {
      return db.select().from(printers).where(eq(printers.propertyId, propertyId));
    }
    return db.select().from(printers);
  }

  async getPrinter(id: string): Promise<Printer | undefined> {
    const [result] = await db.select().from(printers).where(eq(printers.id, id));
    return result;
  }

  async createPrinter(data: InsertPrinter): Promise<Printer> {
    const [result] = await db.insert(printers).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePrinter(id: string, data: Partial<InsertPrinter>): Promise<Printer | undefined> {
    const [result] = await db.update(printers).set(sanitizeDates(data)).where(eq(printers.id, id)).returning();
    return result;
  }

  async deletePrinter(id: string): Promise<boolean> {
    // First, clear the printer reference from any print jobs to avoid FK constraint violation
    await db.update(printJobs).set({ printerId: null }).where(eq(printJobs.printerId, id));
    const result = await db.delete(printers).where(eq(printers.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // KDS Devices
  async getKdsDevices(propertyId?: string): Promise<KdsDevice[]> {
    if (propertyId) {
      return db.select().from(kdsDevices).where(eq(kdsDevices.propertyId, propertyId));
    }
    return db.select().from(kdsDevices);
  }

  async getKdsDevice(id: string): Promise<KdsDevice | undefined> {
    const [result] = await db.select().from(kdsDevices).where(eq(kdsDevices.id, id));
    return result;
  }

  async createKdsDevice(data: InsertKdsDevice): Promise<KdsDevice> {
    const [result] = await db.insert(kdsDevices).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateKdsDevice(id: string, data: Partial<InsertKdsDevice>): Promise<KdsDevice | undefined> {
    const [result] = await db.update(kdsDevices).set(sanitizeDates(data)).where(eq(kdsDevices.id, id)).returning();
    return result;
  }

  async deleteKdsDevice(id: string): Promise<boolean> {
    const result = await db.delete(kdsDevices).where(eq(kdsDevices.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Order Devices
  async getOrderDevices(propertyId?: string): Promise<OrderDevice[]> {
    if (propertyId) {
      return db.select().from(orderDevices).where(eq(orderDevices.propertyId, propertyId));
    }
    return db.select().from(orderDevices);
  }

  async getOrderDevice(id: string): Promise<OrderDevice | undefined> {
    const [result] = await db.select().from(orderDevices).where(eq(orderDevices.id, id));
    return result;
  }

  async createOrderDevice(data: InsertOrderDevice): Promise<OrderDevice> {
    const [result] = await db.insert(orderDevices).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateOrderDevice(id: string, data: Partial<InsertOrderDevice>): Promise<OrderDevice | undefined> {
    const [result] = await db.update(orderDevices).set(sanitizeDates(data)).where(eq(orderDevices.id, id)).returning();
    return result;
  }

  async deleteOrderDevice(id: string): Promise<boolean> {
    const result = await db.delete(orderDevices).where(eq(orderDevices.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Order Device Linkages
  async getOrderDevicePrinters(orderDeviceId?: string): Promise<OrderDevicePrinter[]> {
    if (orderDeviceId) {
      return db.select().from(orderDevicePrinters).where(eq(orderDevicePrinters.orderDeviceId, orderDeviceId));
    }
    return db.select().from(orderDevicePrinters);
  }

  async linkPrinterToOrderDevice(data: InsertOrderDevicePrinter): Promise<OrderDevicePrinter> {
    // Validate: Ensure printer and order device belong to same property
    const orderDevice = await this.getOrderDevice(data.orderDeviceId);
    const printer = await this.getPrinter(data.printerId);
    
    if (!orderDevice) {
      throw new Error("Order device not found");
    }
    if (!printer) {
      throw new Error("Printer not found");
    }
    if (orderDevice.propertyId !== printer.propertyId) {
      throw new Error("Printer must belong to the same property as the order device");
    }
    
    const [result] = await db.insert(orderDevicePrinters).values(sanitizeDates(data)).returning();
    return result;
  }

  async unlinkPrinterFromOrderDevice(id: string): Promise<boolean> {
    const result = await db.delete(orderDevicePrinters).where(eq(orderDevicePrinters.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getOrderDeviceKdsList(orderDeviceId?: string): Promise<OrderDeviceKds[]> {
    if (orderDeviceId) {
      return db.select().from(orderDeviceKds).where(eq(orderDeviceKds.orderDeviceId, orderDeviceId));
    }
    return db.select().from(orderDeviceKds);
  }

  async linkKdsToOrderDevice(data: InsertOrderDeviceKds): Promise<OrderDeviceKds> {
    // Validate: Ensure KDS device and order device belong to same property
    const orderDevice = await this.getOrderDevice(data.orderDeviceId);
    const kdsDevice = await this.getKdsDevice(data.kdsDeviceId);
    
    if (!orderDevice) {
      throw new Error("Order device not found");
    }
    if (!kdsDevice) {
      throw new Error("KDS device not found");
    }
    if (orderDevice.propertyId !== kdsDevice.propertyId) {
      throw new Error("KDS device must belong to the same property as the order device");
    }
    
    const [result] = await db.insert(orderDeviceKds).values(sanitizeDates(data)).returning();
    return result;
  }

  async unlinkKdsFromOrderDevice(id: string): Promise<boolean> {
    const result = await db.delete(orderDeviceKds).where(eq(orderDeviceKds.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Print Class Routing
  async getAllPrintClassRoutings(): Promise<PrintClassRouting[]> {
    return db.select().from(printClassRouting);
  }

  async getPrintClassRouting(printClassId: string, propertyId?: string, rvcId?: string): Promise<PrintClassRouting[]> {
    const conditions = [eq(printClassRouting.printClassId, printClassId)];
    if (propertyId) conditions.push(eq(printClassRouting.propertyId, propertyId));
    if (rvcId) conditions.push(eq(printClassRouting.rvcId, rvcId));
    return db.select().from(printClassRouting).where(and(...conditions));
  }

  async createPrintClassRouting(data: InsertPrintClassRouting): Promise<PrintClassRouting> {
    const [result] = await db.insert(printClassRouting).values(sanitizeDates(data)).returning();
    return result;
  }

  async deletePrintClassRouting(id: string): Promise<boolean> {
    const result = await db.delete(printClassRouting).where(eq(printClassRouting.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Routing Resolution: Menu Item → Print Class → Order Device → Physical Devices
  async resolveDevicesForMenuItem(menuItemId: string, rvcId: string): Promise<{ printers: Printer[]; kdsDevices: KdsDevice[] }> {
    // Get menu item and its print class
    const menuItem = await this.getMenuItem(menuItemId);
    if (!menuItem?.printClassId) {
      return { printers: [], kdsDevices: [] };
    }

    // Get RVC to find property
    const rvc = await this.getRvc(rvcId);
    if (!rvc) {
      return { printers: [], kdsDevices: [] };
    }

    // Find routing for this print class (check RVC-specific first, then property-level, then any)
    let routing = await db.select().from(printClassRouting)
      .where(and(
        eq(printClassRouting.printClassId, menuItem.printClassId),
        eq(printClassRouting.rvcId, rvcId)
      ));

    if (routing.length === 0) {
      routing = await db.select().from(printClassRouting)
        .where(and(
          eq(printClassRouting.printClassId, menuItem.printClassId),
          eq(printClassRouting.propertyId, rvc.propertyId)
        ));
    }

    if (routing.length === 0) {
      routing = await db.select().from(printClassRouting)
        .where(eq(printClassRouting.printClassId, menuItem.printClassId));
    }

    if (routing.length === 0) {
      return { printers: [], kdsDevices: [] };
    }

    // Get all order devices from routing
    const orderDeviceIds = routing.map(r => r.orderDeviceId);
    
    // Get linked printers and KDS devices for each order device
    const resolvedPrinters: Printer[] = [];
    const resolvedKds: KdsDevice[] = [];

    for (const odId of orderDeviceIds) {
      const printerLinks = await this.getOrderDevicePrinters(odId);
      for (const link of printerLinks) {
        const printer = await this.getPrinter(link.printerId);
        if (printer && printer.active) {
          resolvedPrinters.push(printer);
        }
      }

      const kdsLinks = await this.getOrderDeviceKdsList(odId);
      for (const link of kdsLinks) {
        const kds = await this.getKdsDevice(link.kdsDeviceId);
        if (kds && kds.active) {
          resolvedKds.push(kds);
        }
      }
    }

    return { printers: resolvedPrinters, kdsDevices: resolvedKds };
  }

  // Menu Items
  async getMenuItems(sluId?: string): Promise<MenuItem[]> {
    if (sluId) {
      const linkages = await db.select().from(menuItemSlus).where(eq(menuItemSlus.sluId, sluId));
      const itemIds = linkages.map(l => l.menuItemId);
      if (itemIds.length === 0) return [];
      return db.select().from(menuItems).where(inArray(menuItems.id, itemIds));
    }
    return db.select().from(menuItems);
  }

  async getMenuItem(id: string): Promise<MenuItem | undefined> {
    const [result] = await db.select().from(menuItems).where(eq(menuItems.id, id));
    return result;
  }

  async createMenuItem(data: InsertMenuItem): Promise<MenuItem> {
    const [result] = await db.insert(menuItems).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateMenuItem(id: string, data: Partial<InsertMenuItem>): Promise<MenuItem | undefined> {
    const [result] = await db.update(menuItems).set(sanitizeDates(data)).where(eq(menuItems.id, id)).returning();
    return result;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    // Check if menu item is referenced in check_items (can't delete if used in orders)
    const usedInOrders = await db.select().from(checkItems).where(eq(checkItems.menuItemId, id)).limit(1);
    if (usedInOrders.length > 0) {
      throw new Error("This menu item has transaction history and cannot be deleted. To remove it from the POS, use 'Unlink from Categories' or set it to Inactive.");
    }
    // Delete all related linkages first
    await db.delete(menuItemSlus).where(eq(menuItemSlus.menuItemId, id));
    await db.delete(menuItemModifierGroups).where(eq(menuItemModifierGroups.menuItemId, id));
    await db.delete(posLayoutCells).where(eq(posLayoutCells.menuItemId, id));
    // Then delete the menu item
    const result = await db.delete(menuItems).where(eq(menuItems.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async unlinkMenuItemFromSLUs(menuItemId: string): Promise<number> {
    const result = await db.delete(menuItemSlus).where(eq(menuItemSlus.menuItemId, menuItemId));
    return result.rowCount || 0;
  }

  // Modifiers (standalone)
  async getModifiers(): Promise<Modifier[]> {
    return db.select().from(modifiers).where(eq(modifiers.active, true));
  }

  async getModifier(id: string): Promise<Modifier | undefined> {
    const [result] = await db.select().from(modifiers).where(eq(modifiers.id, id));
    return result;
  }

  async createModifier(data: InsertModifier): Promise<Modifier> {
    const [result] = await db.insert(modifiers).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateModifier(id: string, data: Partial<InsertModifier>): Promise<Modifier | undefined> {
    const [result] = await db.update(modifiers).set(sanitizeDates(data)).where(eq(modifiers.id, id)).returning();
    return result;
  }

  async deleteModifier(id: string): Promise<boolean> {
    // First delete linkages to groups
    await db.delete(modifierGroupModifiers).where(eq(modifierGroupModifiers.modifierId, id));
    const result = await db.delete(modifiers).where(eq(modifiers.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Modifier Groups
  async getModifierGroups(menuItemId?: string): Promise<(ModifierGroup & { modifiers: (Modifier & { isDefault: boolean; displayOrder: number })[] })[]> {
    let groups: ModifierGroup[];
    if (menuItemId) {
      const linkages = await db.select().from(menuItemModifierGroups).where(eq(menuItemModifierGroups.menuItemId, menuItemId)).orderBy(menuItemModifierGroups.displayOrder);
      const groupIds = linkages.map(l => l.modifierGroupId);
      if (groupIds.length === 0) return [];
      groups = await db.select().from(modifierGroups).where(inArray(modifierGroups.id, groupIds));
    } else {
      groups = await db.select().from(modifierGroups).where(eq(modifierGroups.active, true)).orderBy(modifierGroups.displayOrder);
    }

    if (groups.length === 0) return [];

    const allGroupIds = groups.map(g => g.id);
    const allLinkages = await db.select().from(modifierGroupModifiers).where(inArray(modifierGroupModifiers.modifierGroupId, allGroupIds)).orderBy(modifierGroupModifiers.displayOrder);
    const allModifierIds = [...new Set(allLinkages.map(l => l.modifierId))];
    const allMods = allModifierIds.length > 0
      ? await db.select().from(modifiers).where(and(inArray(modifiers.id, allModifierIds), eq(modifiers.active, true)))
      : [];
    const modsById = new Map(allMods.map(m => [m.id, m]));

    return groups.map(group => {
      const groupLinkages = allLinkages.filter(l => l.modifierGroupId === group.id);
      const modsWithMeta = groupLinkages
        .map(linkage => {
          const mod = modsById.get(linkage.modifierId);
          if (!mod) return null;
          return {
            ...mod,
            isDefault: linkage.isDefault ?? false,
            displayOrder: linkage.displayOrder ?? 0,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      return { ...group, modifiers: modsWithMeta };
    });
  }

  async getModifierGroup(id: string): Promise<ModifierGroup | undefined> {
    const [result] = await db.select().from(modifierGroups).where(eq(modifierGroups.id, id));
    return result;
  }

  async createModifierGroup(data: InsertModifierGroup): Promise<ModifierGroup> {
    const [result] = await db.insert(modifierGroups).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateModifierGroup(id: string, data: Partial<InsertModifierGroup>): Promise<ModifierGroup | undefined> {
    const [result] = await db.update(modifierGroups).set(sanitizeDates(data)).where(eq(modifierGroups.id, id)).returning();
    return result;
  }

  async deleteModifierGroup(id: string): Promise<boolean> {
    // First delete linkages to modifiers and menu items
    await db.delete(modifierGroupModifiers).where(eq(modifierGroupModifiers.modifierGroupId, id));
    await db.delete(menuItemModifierGroups).where(eq(menuItemModifierGroups.modifierGroupId, id));
    const result = await db.delete(modifierGroups).where(eq(modifierGroups.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Modifier Group to Modifier linkage
  async getModifierGroupModifiers(modifierGroupId?: string): Promise<ModifierGroupModifier[]> {
    if (modifierGroupId) {
      return db.select().from(modifierGroupModifiers).where(eq(modifierGroupModifiers.modifierGroupId, modifierGroupId)).orderBy(modifierGroupModifiers.displayOrder);
    }
    return db.select().from(modifierGroupModifiers).orderBy(modifierGroupModifiers.displayOrder);
  }

  async linkModifierToGroup(data: InsertModifierGroupModifier): Promise<ModifierGroupModifier> {
    const [result] = await db.insert(modifierGroupModifiers).values(sanitizeDates(data)).returning();
    return result;
  }

  async unlinkModifierFromGroup(modifierGroupId: string, modifierId: string): Promise<boolean> {
    const result = await db.delete(modifierGroupModifiers).where(
      and(eq(modifierGroupModifiers.modifierGroupId, modifierGroupId), eq(modifierGroupModifiers.modifierId, modifierId))
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updateModifierGroupModifier(id: string, data: Partial<InsertModifierGroupModifier>): Promise<ModifierGroupModifier | undefined> {
    const [result] = await db.update(modifierGroupModifiers).set(sanitizeDates(data)).where(eq(modifierGroupModifiers.id, id)).returning();
    return result;
  }

  // Menu Item to Modifier Group linkage
  async getMenuItemModifierGroups(menuItemId?: string): Promise<MenuItemModifierGroup[]> {
    if (menuItemId) {
      return db.select().from(menuItemModifierGroups).where(eq(menuItemModifierGroups.menuItemId, menuItemId)).orderBy(menuItemModifierGroups.displayOrder);
    }
    return db.select().from(menuItemModifierGroups).orderBy(menuItemModifierGroups.displayOrder);
  }

  async linkModifierGroupToMenuItem(data: InsertMenuItemModifierGroup): Promise<MenuItemModifierGroup> {
    const [result] = await db.insert(menuItemModifierGroups).values(sanitizeDates(data)).returning();
    return result;
  }

  async unlinkModifierGroupFromMenuItem(menuItemId: string, modifierGroupId: string): Promise<boolean> {
    const result = await db.delete(menuItemModifierGroups).where(
      and(eq(menuItemModifierGroups.menuItemId, menuItemId), eq(menuItemModifierGroups.modifierGroupId, modifierGroupId))
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Ingredient Prefixes (Conversational Ordering)
  async getIngredientPrefixes(): Promise<IngredientPrefix[]> {
    return db.select().from(ingredientPrefixes).where(eq(ingredientPrefixes.active, true)).orderBy(ingredientPrefixes.displayOrder);
  }

  async getIngredientPrefix(id: string): Promise<IngredientPrefix | undefined> {
    const [result] = await db.select().from(ingredientPrefixes).where(eq(ingredientPrefixes.id, id));
    return result;
  }

  async createIngredientPrefix(data: InsertIngredientPrefix): Promise<IngredientPrefix> {
    const [result] = await db.insert(ingredientPrefixes).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateIngredientPrefix(id: string, data: Partial<InsertIngredientPrefix>): Promise<IngredientPrefix | undefined> {
    const [result] = await db.update(ingredientPrefixes).set(sanitizeDates(data)).where(eq(ingredientPrefixes.id, id)).returning();
    return result;
  }

  async deleteIngredientPrefix(id: string): Promise<boolean> {
    const result = await db.delete(ingredientPrefixes).where(eq(ingredientPrefixes.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Menu Item Recipe Ingredients (Conversational Ordering)
  async getMenuItemRecipeIngredients(menuItemId?: string): Promise<MenuItemRecipeIngredient[]> {
    if (menuItemId) {
      return db.select().from(menuItemRecipeIngredients)
        .where(and(eq(menuItemRecipeIngredients.menuItemId, menuItemId), eq(menuItemRecipeIngredients.active, true)))
        .orderBy(menuItemRecipeIngredients.displayOrder);
    }
    return db.select().from(menuItemRecipeIngredients)
      .where(eq(menuItemRecipeIngredients.active, true))
      .orderBy(menuItemRecipeIngredients.displayOrder);
  }

  async getMenuItemRecipeIngredient(id: string): Promise<MenuItemRecipeIngredient | undefined> {
    const [result] = await db.select().from(menuItemRecipeIngredients).where(eq(menuItemRecipeIngredients.id, id));
    return result;
  }

  async createMenuItemRecipeIngredient(data: InsertMenuItemRecipeIngredient): Promise<MenuItemRecipeIngredient> {
    const [result] = await db.insert(menuItemRecipeIngredients).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateMenuItemRecipeIngredient(id: string, data: Partial<InsertMenuItemRecipeIngredient>): Promise<MenuItemRecipeIngredient | undefined> {
    const [result] = await db.update(menuItemRecipeIngredients).set(sanitizeDates(data)).where(eq(menuItemRecipeIngredients.id, id)).returning();
    return result;
  }

  async deleteMenuItemRecipeIngredient(id: string): Promise<boolean> {
    const result = await db.delete(menuItemRecipeIngredients).where(eq(menuItemRecipeIngredients.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Tenders
  async getTenders(rvcId?: string): Promise<Tender[]> {
    return db.select().from(tenders).where(and(eq(tenders.active, true), or(eq(tenders.isSystem, false), isNull(tenders.isSystem))));
  }

  async getAllTendersIncludingSystem(): Promise<Tender[]> {
    return db.select().from(tenders).where(eq(tenders.active, true));
  }

  async getTender(id: string): Promise<Tender | undefined> {
    const [result] = await db.select().from(tenders).where(eq(tenders.id, id));
    return result;
  }

  async createTender(data: InsertTender): Promise<Tender> {
    const [result] = await db.insert(tenders).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTender(id: string, data: Partial<InsertTender>): Promise<Tender | undefined> {
    const [result] = await db.update(tenders).set(sanitizeDates(data)).where(eq(tenders.id, id)).returning();
    return result;
  }

  async deleteTender(id: string): Promise<boolean> {
    const result = await db.delete(tenders).where(eq(tenders.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Discounts
  async getDiscounts(): Promise<Discount[]> {
    return db.select().from(discounts);
  }

  async getDiscount(id: string): Promise<Discount | undefined> {
    const [result] = await db.select().from(discounts).where(eq(discounts.id, id));
    return result;
  }

  async createDiscount(data: InsertDiscount): Promise<Discount> {
    const [result] = await db.insert(discounts).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateDiscount(id: string, data: Partial<InsertDiscount>): Promise<Discount | undefined> {
    const [result] = await db.update(discounts).set(sanitizeDates(data)).where(eq(discounts.id, id)).returning();
    return result;
  }

  async deleteDiscount(id: string): Promise<boolean> {
    const result = await db.delete(discounts).where(eq(discounts.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Service Charges
  async getServiceCharges(): Promise<ServiceCharge[]> {
    return db.select().from(serviceCharges);
  }

  async getServiceCharge(id: string): Promise<ServiceCharge | undefined> {
    const [result] = await db.select().from(serviceCharges).where(eq(serviceCharges.id, id));
    return result;
  }

  async createServiceCharge(data: InsertServiceCharge): Promise<ServiceCharge> {
    const [result] = await db.insert(serviceCharges).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateServiceCharge(id: string, data: Partial<InsertServiceCharge>): Promise<ServiceCharge | undefined> {
    const [result] = await db.update(serviceCharges).set(sanitizeDates(data)).where(eq(serviceCharges.id, id)).returning();
    return result;
  }

  async deleteServiceCharge(id: string): Promise<boolean> {
    const result = await db.delete(serviceCharges).where(eq(serviceCharges.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getCheckServiceChargesByCheck(checkId: string): Promise<CheckServiceCharge[]> {
    return db.select().from(checkServiceCharges).where(eq(checkServiceCharges.checkId, checkId));
  }

  async getCheckServiceChargesByBusinessDate(propertyId: string, businessDate: string, rvcId?: string): Promise<CheckServiceCharge[]> {
    const conditions = [
      eq(checkServiceCharges.propertyId, propertyId),
      eq(checkServiceCharges.businessDate, businessDate),
    ];
    if (rvcId) conditions.push(eq(checkServiceCharges.rvcId, rvcId));
    return db.select().from(checkServiceCharges).where(and(...conditions));
  }

  async createCheckServiceCharge(data: InsertCheckServiceCharge): Promise<CheckServiceCharge> {
    const [result] = await db.insert(checkServiceCharges).values(sanitizeDates(data)).returning();
    return result;
  }

  async voidCheckServiceCharge(id: string, voidedByEmployeeId: string, voidReason?: string): Promise<CheckServiceCharge | undefined> {
    const [result] = await db.update(checkServiceCharges).set({
      voided: true,
      voidedAt: new Date(),
      voidedByEmployeeId,
      voidReason: voidReason || null,
    }).where(eq(checkServiceCharges.id, id)).returning();
    return result;
  }

  // Checks
  async getChecks(rvcId?: string, status?: string, includeTestMode?: boolean): Promise<Check[]> {
    const noTest = or(eq(checks.testMode, false), isNull(checks.testMode));
    const testFilter = includeTestMode ? undefined : noTest;
    if (rvcId && status) {
      return db.select().from(checks).where(and(eq(checks.rvcId, rvcId), eq(checks.status, status), testFilter));
    }
    if (rvcId) {
      return db.select().from(checks).where(and(eq(checks.rvcId, rvcId), testFilter));
    }
    if (status) {
      return db.select().from(checks).where(and(eq(checks.status, status), testFilter));
    }
    if (testFilter) {
      return db.select().from(checks).where(testFilter).orderBy(desc(checks.openedAt));
    }
    return db.select().from(checks).orderBy(desc(checks.openedAt));
  }

  async getChecksByPropertyAndDateRange(propertyId: string, startDate: string, endDate: string): Promise<Check[]> {
    // Get all RVCs for the property
    const propertyRvcs = await this.getRvcs(propertyId);
    const rvcIds = propertyRvcs.map(rvc => rvc.id);
    
    if (rvcIds.length === 0) return [];
    
    // Query checks for those RVCs within the date range (exclude test mode)
    return db.select().from(checks)
      .where(and(
        inArray(checks.rvcId, rvcIds),
        gte(checks.businessDate, startDate),
        lte(checks.businessDate, endDate),
        or(eq(checks.testMode, false), isNull(checks.testMode))
      ))
      .orderBy(checks.businessDate);
  }

  async getCheck(id: string): Promise<Check | undefined> {
    const [result] = await db.select().from(checks).where(eq(checks.id, id));
    return result;
  }

  async getOpenChecks(rvcId: string): Promise<Check[]> {
    return db.select().from(checks)
      .where(and(eq(checks.rvcId, rvcId), eq(checks.status, "open")))
      .orderBy(checks.openedAt);
  }

  async createCheck(data: InsertCheck): Promise<Check> {
    const [result] = await db.insert(checks).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateCheck(id: string, data: Partial<Check>): Promise<Check | undefined> {
    const [result] = await db.update(checks).set(sanitizeDates(data)).where(eq(checks.id, id)).returning();
    return result;
  }

  async deleteCheck(id: string): Promise<boolean> {
    const result = await db.delete(checks).where(eq(checks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNextCheckNumber(rvcId: string): Promise<number> {
    const result = await db.execute(sql`
      INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at)
      VALUES (${rvcId}, 2, NOW())
      ON CONFLICT (rvc_id) DO UPDATE
        SET next_check_number = rvc_counters.next_check_number + 1,
            updated_at = NOW()
      RETURNING next_check_number - 1 AS reserved_number
    `);
    return (result.rows[0] as any).reserved_number;
  }

  async createCheckAtomic(rvcId: string, data: Omit<InsertCheck, 'checkNumber'>): Promise<Check> {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await db.transaction(async (tx) => {
          const counterResult = await tx.execute(sql`
            INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at)
            VALUES (${rvcId}, 2, NOW())
            ON CONFLICT (rvc_id) DO UPDATE
              SET next_check_number = rvc_counters.next_check_number + 1,
                  updated_at = NOW()
            RETURNING next_check_number - 1 AS reserved_number
          `);
          const checkNumber = (counterResult.rows[0] as any).reserved_number;
          const [result] = await tx.insert(checks).values(sanitizeDates({ ...data, checkNumber, rvcId })).returning();
          return result;
        });
      } catch (err: any) {
        const isDuplicateKey = err?.code === '23505' || (err?.message && err.message.includes('duplicate key'));
        if (isDuplicateKey && attempt < MAX_RETRIES - 1) {
          console.warn(`[CheckCounter] Duplicate key on attempt ${attempt + 1} for rvc ${rvcId}, resetting counter...`);
          await db.execute(sql`
            INSERT INTO rvc_counters (rvc_id, next_check_number, updated_at)
            VALUES (
              ${rvcId},
              COALESCE((SELECT MAX(check_number) + 1 FROM checks WHERE rvc_id = ${rvcId}), 1),
              NOW()
            )
            ON CONFLICT (rvc_id) DO UPDATE
              SET next_check_number = COALESCE(
                (SELECT MAX(check_number) + 1 FROM checks WHERE rvc_id = ${rvcId}), 1
              ),
              updated_at = NOW()
          `);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Failed to create check after max retries');
  }

  // Idempotency — INSERT-first transactional pattern
  async acquireIdempotencyLock(enterpriseId: string, workstationId: string, operation: string, key: string, requestHash: string): Promise<{ acquired: boolean; status?: string; requestHash?: string; responseStatus?: number; responseBody?: string }> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    try {
      await db.insert(idempotencyKeys).values({
        enterpriseId,
        workstationId,
        operation,
        idempotencyKey: key,
        status: 'processing',
        requestHash,
        expiresAt,
      });
      return { acquired: true };
    } catch (err: any) {
      if (err.code === '23505') {
        const [existing] = await db.select().from(idempotencyKeys).where(
          and(
            eq(idempotencyKeys.enterpriseId, enterpriseId),
            eq(idempotencyKeys.workstationId, workstationId),
            eq(idempotencyKeys.operation, operation),
            eq(idempotencyKeys.idempotencyKey, key)
          )
        );
        if (!existing) return { acquired: false, status: 'failed' };
        return {
          acquired: false,
          status: existing.status,
          requestHash: existing.requestHash ?? undefined,
          responseStatus: existing.responseStatus ?? undefined,
          responseBody: existing.responseBody ?? undefined,
        };
      }
      throw err;
    }
  }

  async completeIdempotencyKey(enterpriseId: string, workstationId: string, operation: string, key: string, responseStatus: number, responseBody: string): Promise<void> {
    await db.update(idempotencyKeys).set({
      status: 'completed',
      responseStatus,
      responseBody,
    }).where(
      and(
        eq(idempotencyKeys.enterpriseId, enterpriseId),
        eq(idempotencyKeys.workstationId, workstationId),
        eq(idempotencyKeys.operation, operation),
        eq(idempotencyKeys.idempotencyKey, key)
      )
    );
  }

  async failIdempotencyKey(enterpriseId: string, workstationId: string, operation: string, key: string): Promise<void> {
    await db.update(idempotencyKeys).set({
      status: 'failed',
    }).where(
      and(
        eq(idempotencyKeys.enterpriseId, enterpriseId),
        eq(idempotencyKeys.workstationId, workstationId),
        eq(idempotencyKeys.operation, operation),
        eq(idempotencyKeys.idempotencyKey, key)
      )
    );
  }

  async cleanupExpiredIdempotencyKeys(): Promise<number> {
    const result = await db.delete(idempotencyKeys).where(
      and(
        isNotNull(idempotencyKeys.expiresAt),
        lte(idempotencyKeys.expiresAt, new Date())
      )
    );
    return result.rowCount ?? 0;
  }

  // Print Queue Lease Pattern
  async claimPrintJob(agentId: string, leaseDurationSeconds: number = 30): Promise<any> {
    const leaseUntil = new Date(Date.now() + leaseDurationSeconds * 1000);
    const result = await db.execute(sql`
      UPDATE print_jobs
      SET status = 'processing', leased_by = ${agentId}, leased_until = ${leaseUntil}
      WHERE id = (
        SELECT id FROM print_jobs
        WHERE status = 'pending'
          AND (leased_until IS NULL OR leased_until < NOW())
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    return result.rows[0] || null;
  }

  async ackPrintJob(jobId: string, success: boolean, error?: string): Promise<void> {
    if (success) {
      await db.update(printJobs).set({
        status: 'completed',
        printedAt: new Date(),
        leasedBy: null,
        leasedUntil: null,
      }).where(eq(printJobs.id, jobId));
    } else {
      await db.update(printJobs).set({
        status: 'failed',
        lastError: error || 'Unknown error',
        leasedBy: null,
        leasedUntil: null,
      }).where(eq(printJobs.id, jobId));
    }
  }

  async recoverExpiredLeases(): Promise<number> {
    const result = await db.update(printJobs).set({
      status: 'pending',
      leasedBy: null,
      leasedUntil: null,
    }).where(
      and(
        eq(printJobs.status, 'processing'),
        isNotNull(printJobs.leasedUntil),
        lte(printJobs.leasedUntil, new Date())
      )
    );
    return result.rowCount ?? 0;
  }

  // Check Items
  async getCheckItems(checkId: string): Promise<CheckItem[]> {
    return db.select().from(checkItems).where(eq(checkItems.checkId, checkId));
  }

  async getCheckItem(id: string): Promise<CheckItem | undefined> {
    const [result] = await db.select().from(checkItems).where(eq(checkItems.id, id));
    return result;
  }

  async createCheckItem(data: InsertCheckItem): Promise<CheckItem> {
    const [result] = await db.insert(checkItems).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateCheckItem(id: string, data: Partial<CheckItem>): Promise<CheckItem | undefined> {
    const [result] = await db.update(checkItems).set(sanitizeDates(data)).where(eq(checkItems.id, id)).returning();
    return result;
  }

  async deleteCheckItem(id: string): Promise<boolean> {
    const result = await db.delete(checkItems).where(eq(checkItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Check Discounts (applied to checks)
  async getCheckDiscounts(checkId: string): Promise<CheckDiscount[]> {
    return await db.select().from(checkDiscounts).where(eq(checkDiscounts.checkId, checkId));
  }

  async getCheckDiscount(id: string): Promise<CheckDiscount | undefined> {
    const [result] = await db.select().from(checkDiscounts).where(eq(checkDiscounts.id, id));
    return result;
  }

  async createCheckDiscount(data: InsertCheckDiscount): Promise<CheckDiscount> {
    const [result] = await db.insert(checkDiscounts).values(sanitizeDates(data)).returning();
    return result;
  }

  async deleteCheckDiscount(id: string): Promise<boolean> {
    const result = await db.delete(checkDiscounts).where(eq(checkDiscounts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Rounds
  async createRound(data: InsertRound & { id?: string }): Promise<Round> {
    const [result] = await db.insert(rounds).values(sanitizeDates(data)).returning();
    return result;
  }

  async getRounds(checkId: string): Promise<Round[]> {
    return db.select().from(rounds).where(eq(rounds.checkId, checkId));
  }

  // Check Locks (for multi-workstation operation)
  async getCheckLock(checkId: string): Promise<CheckLock | undefined> {
    const [result] = await db.select().from(checkLocks).where(eq(checkLocks.checkId, checkId));
    return result;
  }

  async getCheckLocksByCheckIds(checkIds: string[]): Promise<CheckLock[]> {
    if (checkIds.length === 0) return [];
    return db.select().from(checkLocks).where(inArray(checkLocks.checkId, checkIds));
  }

  async createCheckLock(data: { checkId: string; workstationId: string; employeeId: string; lockMode?: string; expiresAt: Date }): Promise<CheckLock> {
    const [result] = await db.insert(checkLocks).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateCheckLock(id: string, data: Partial<{ expiresAt: Date; lockMode: string }>): Promise<CheckLock | undefined> {
    const [result] = await db.update(checkLocks).set(sanitizeDates(data)).where(eq(checkLocks.id, id)).returning();
    return result;
  }

  async deleteCheckLock(id: string): Promise<boolean> {
    const result = await db.delete(checkLocks).where(eq(checkLocks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteCheckLocksByWorkstation(workstationId: string): Promise<number> {
    const result = await db.delete(checkLocks).where(eq(checkLocks.workstationId, workstationId));
    return result.rowCount ?? 0;
  }

  // Payments
  async createPayment(data: InsertCheckPayment): Promise<CheckPayment> {
    const [result] = await db.insert(checkPayments).values(sanitizeDates(data)).returning();
    return result;
  }

  async getPayments(checkId: string): Promise<CheckPayment[]> {
    return db.select().from(checkPayments).where(eq(checkPayments.checkId, checkId));
  }

  async getAllPayments(): Promise<CheckPayment[]> {
    return db.select().from(checkPayments);
  }

  async updateCheckPayment(id: string, data: Partial<CheckPayment>): Promise<CheckPayment | undefined> {
    const [result] = await db.update(checkPayments).set(sanitizeDates(data)).where(eq(checkPayments.id, id)).returning();
    return result;
  }

  async getAllCheckItems(): Promise<CheckItem[]> {
    return db.select().from(checkItems);
  }

  // Payment Processors
  async getPaymentProcessors(propertyId?: string): Promise<PaymentProcessor[]> {
    if (propertyId) {
      return db.select().from(paymentProcessors).where(eq(paymentProcessors.propertyId, propertyId));
    }
    return db.select().from(paymentProcessors);
  }

  async getPaymentProcessor(id: string): Promise<PaymentProcessor | undefined> {
    const [result] = await db.select().from(paymentProcessors).where(eq(paymentProcessors.id, id));
    return result;
  }

  async createPaymentProcessor(data: InsertPaymentProcessor): Promise<PaymentProcessor> {
    const [result] = await db.insert(paymentProcessors).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePaymentProcessor(id: string, data: Partial<InsertPaymentProcessor>): Promise<PaymentProcessor | undefined> {
    const [result] = await db.update(paymentProcessors).set(sanitizeDates(data)).where(eq(paymentProcessors.id, id)).returning();
    return result;
  }

  async deletePaymentProcessor(id: string): Promise<boolean> {
    const result = await db.delete(paymentProcessors).where(eq(paymentProcessors.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getActivePaymentProcessor(propertyId: string): Promise<PaymentProcessor | undefined> {
    const [result] = await db.select().from(paymentProcessors)
      .where(and(eq(paymentProcessors.propertyId, propertyId), eq(paymentProcessors.active, true)));
    return result;
  }

  // Payment Gateway Configuration (hierarchy-aware)
  async getPaymentGatewayConfigs(enterpriseId: string): Promise<PaymentGatewayConfig[]> {
    return db.select().from(paymentGatewayConfig)
      .where(eq(paymentGatewayConfig.enterpriseId, enterpriseId));
  }

  async getPaymentGatewayConfig(id: string): Promise<PaymentGatewayConfig | undefined> {
    const [result] = await db.select().from(paymentGatewayConfig)
      .where(eq(paymentGatewayConfig.id, id));
    return result;
  }

  async getPaymentGatewayConfigForLevel(
    configLevel: string,
    enterpriseId: string,
    propertyId?: string | null,
    workstationId?: string | null
  ): Promise<PaymentGatewayConfig | undefined> {
    const conditions = [
      eq(paymentGatewayConfig.configLevel, configLevel),
      eq(paymentGatewayConfig.enterpriseId, enterpriseId),
    ];
    if (configLevel === "property" && propertyId) {
      conditions.push(eq(paymentGatewayConfig.propertyId, propertyId));
    }
    if (configLevel === "workstation" && workstationId) {
      conditions.push(eq(paymentGatewayConfig.workstationId, workstationId));
    }
    const [result] = await db.select().from(paymentGatewayConfig)
      .where(and(...conditions));
    return result;
  }

  async getMergedPaymentGatewayConfig(
    enterpriseId: string,
    propertyId?: string | null,
    workstationId?: string | null
  ): Promise<Partial<PaymentGatewayConfig>> {
    const enterpriseConfig = await this.getPaymentGatewayConfigForLevel("enterprise", enterpriseId);
    const propertyConfig = propertyId
      ? await this.getPaymentGatewayConfigForLevel("property", enterpriseId, propertyId)
      : undefined;
    const workstationConfig = workstationId
      ? await this.getPaymentGatewayConfigForLevel("workstation", enterpriseId, propertyId, workstationId)
      : undefined;

    const merged: Partial<PaymentGatewayConfig> = {};
    const configs = [enterpriseConfig, propertyConfig, workstationConfig].filter(Boolean) as PaymentGatewayConfig[];
    for (const config of configs) {
      for (const [key, value] of Object.entries(config)) {
        if (value !== null && value !== undefined && key !== "id" && key !== "configLevel" && key !== "enterpriseId" && key !== "propertyId" && key !== "workstationId" && key !== "createdAt" && key !== "updatedAt") {
          (merged as any)[key] = value;
        }
      }
    }
    return merged;
  }

  async createPaymentGatewayConfig(data: InsertPaymentGatewayConfig): Promise<PaymentGatewayConfig> {
    const [result] = await db.insert(paymentGatewayConfig).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePaymentGatewayConfig(id: string, data: Partial<InsertPaymentGatewayConfig>): Promise<PaymentGatewayConfig | undefined> {
    const [result] = await db.update(paymentGatewayConfig)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(paymentGatewayConfig.id, id))
      .returning();
    return result;
  }

  async deletePaymentGatewayConfig(id: string): Promise<boolean> {
    const result = await db.delete(paymentGatewayConfig).where(eq(paymentGatewayConfig.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Payment Transactions
  async getPaymentTransactions(checkPaymentId?: string): Promise<PaymentTransaction[]> {
    if (checkPaymentId) {
      return db.select().from(paymentTransactions).where(eq(paymentTransactions.checkPaymentId, checkPaymentId));
    }
    return db.select().from(paymentTransactions);
  }

  async getPaymentTransaction(id: string): Promise<PaymentTransaction | undefined> {
    const [result] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id));
    return result;
  }

  async getPaymentTransactionByGatewayId(gatewayTransactionId: string): Promise<PaymentTransaction | undefined> {
    const [result] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.gatewayTransactionId, gatewayTransactionId));
    return result;
  }

  async createPaymentTransaction(data: InsertPaymentTransaction): Promise<PaymentTransaction> {
    const [result] = await db.insert(paymentTransactions).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePaymentTransaction(id: string, data: Partial<PaymentTransaction>): Promise<PaymentTransaction | undefined> {
    const [result] = await db.update(paymentTransactions).set(sanitizeDates(data)).where(eq(paymentTransactions.id, id)).returning();
    return result;
  }

  // Terminal Devices (EMV Card Readers)
  async getTerminalDevices(propertyId?: string): Promise<TerminalDevice[]> {
    if (propertyId) {
      return db.select().from(terminalDevices).where(eq(terminalDevices.propertyId, propertyId)).orderBy(terminalDevices.name);
    }
    return db.select().from(terminalDevices).orderBy(terminalDevices.name);
  }

  async getTerminalDevice(id: string): Promise<TerminalDevice | undefined> {
    const [result] = await db.select().from(terminalDevices).where(eq(terminalDevices.id, id));
    return result;
  }

  async getTerminalDevicesByWorkstation(workstationId: string): Promise<TerminalDevice[]> {
    return db.select().from(terminalDevices).where(eq(terminalDevices.workstationId, workstationId)).orderBy(terminalDevices.name);
  }

  async createTerminalDevice(data: InsertTerminalDevice): Promise<TerminalDevice> {
    const [result] = await db.insert(terminalDevices).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTerminalDevice(id: string, data: Partial<InsertTerminalDevice>): Promise<TerminalDevice | undefined> {
    const [result] = await db.update(terminalDevices).set(sanitizeDates(data)).where(eq(terminalDevices.id, id)).returning();
    return result;
  }

  async deleteTerminalDevice(id: string): Promise<boolean> {
    const result = await db.delete(terminalDevices).where(eq(terminalDevices.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateTerminalDeviceStatus(id: string, status: string, lastHeartbeat?: Date): Promise<TerminalDevice | undefined> {
    const updateData: Partial<TerminalDevice> = { status };
    if (lastHeartbeat) {
      updateData.lastHeartbeat = lastHeartbeat;
    }
    const [result] = await db.update(terminalDevices).set(sanitizeDates(updateData)).where(eq(terminalDevices.id, id)).returning();
    return result;
  }

  // Terminal Sessions (Active payment sessions on terminals)
  async getTerminalSessions(terminalDeviceId?: string, status?: string): Promise<TerminalSession[]> {
    const conditions = [];
    if (terminalDeviceId) {
      conditions.push(eq(terminalSessions.terminalDeviceId, terminalDeviceId));
    }
    if (status) {
      conditions.push(eq(terminalSessions.status, status));
    }
    if (conditions.length > 0) {
      return db.select().from(terminalSessions).where(and(...conditions)).orderBy(desc(terminalSessions.initiatedAt));
    }
    return db.select().from(terminalSessions).orderBy(desc(terminalSessions.initiatedAt));
  }

  async getTerminalSession(id: string): Promise<TerminalSession | undefined> {
    const [result] = await db.select().from(terminalSessions).where(eq(terminalSessions.id, id));
    return result;
  }

  async getActiveTerminalSession(terminalDeviceId: string): Promise<TerminalSession | undefined> {
    const activeStatuses = ['pending', 'processing', 'awaiting_card', 'card_inserted', 'pin_entry'];
    const [result] = await db.select().from(terminalSessions)
      .where(and(
        eq(terminalSessions.terminalDeviceId, terminalDeviceId),
        inArray(terminalSessions.status, activeStatuses),
        or(
          isNull(terminalSessions.expiresAt),
          gt(terminalSessions.expiresAt, new Date())
        )
      ));
    return result;
  }

  async createTerminalSession(data: InsertTerminalSession): Promise<TerminalSession> {
    const [result] = await db.insert(terminalSessions).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTerminalSession(id: string, data: Partial<TerminalSession>): Promise<TerminalSession | undefined> {
    const [result] = await db.update(terminalSessions).set(sanitizeDates(data)).where(eq(terminalSessions.id, id)).returning();
    return result;
  }

  // Registered Devices (POS/KDS access control)
  async getRegisteredDevices(propertyId?: string): Promise<RegisteredDevice[]> {
    if (propertyId) {
      return db.select().from(registeredDevices).where(eq(registeredDevices.propertyId, propertyId));
    }
    return db.select().from(registeredDevices);
  }

  async getRegisteredDevice(id: string): Promise<RegisteredDevice | undefined> {
    const [result] = await db.select().from(registeredDevices).where(eq(registeredDevices.id, id));
    return result;
  }

  async getRegisteredDeviceByToken(deviceTokenHash: string): Promise<RegisteredDevice | undefined> {
    const [result] = await db.select().from(registeredDevices)
      .where(and(
        eq(registeredDevices.deviceTokenHash, deviceTokenHash),
        eq(registeredDevices.status, "enrolled")
      ));
    return result;
  }

  async getRegisteredDeviceByEnrollmentCode(enrollmentCode: string): Promise<RegisteredDevice | undefined> {
    // Find device by enrollment code - check both pending and enrolled status
    // (for claim code redemption after wizard completion)
    const [result] = await db.select().from(registeredDevices)
      .where(eq(registeredDevices.enrollmentCode, enrollmentCode));
    return result;
  }

  async createRegisteredDevice(data: InsertRegisteredDevice): Promise<RegisteredDevice> {
    const [result] = await db.insert(registeredDevices).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateRegisteredDevice(id: string, data: Partial<RegisteredDevice>): Promise<RegisteredDevice | undefined> {
    const [result] = await db.update(registeredDevices).set(sanitizeDates(data)).where(eq(registeredDevices.id, id)).returning();
    return result;
  }

  async deleteRegisteredDevice(id: string): Promise<boolean> {
    const result = await db.delete(registeredDevices).where(eq(registeredDevices.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // EMC Users (Enterprise Management Console)
  async getEmcUsers(enterpriseId?: string, propertyId?: string): Promise<EmcUser[]> {
    if (propertyId) {
      return db.select().from(emcUsers).where(eq(emcUsers.propertyId, propertyId));
    }
    if (enterpriseId) {
      return db.select().from(emcUsers).where(eq(emcUsers.enterpriseId, enterpriseId));
    }
    return db.select().from(emcUsers);
  }

  async getEmcUser(id: string): Promise<EmcUser | undefined> {
    const [result] = await db.select().from(emcUsers).where(eq(emcUsers.id, id));
    return result;
  }

  async getEmcUserByEmail(email: string): Promise<EmcUser | undefined> {
    const [result] = await db.select().from(emcUsers).where(eq(emcUsers.email, email.toLowerCase()));
    return result;
  }

  async createEmcUser(data: InsertEmcUser): Promise<EmcUser> {
    const [result] = await db.insert(emcUsers).values({
      ...data,
      email: data.email.toLowerCase(),
    }).returning();
    return result;
  }

  async updateEmcUser(id: string, data: Partial<EmcUser>): Promise<EmcUser | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    if (data.email) {
      updateData.email = data.email.toLowerCase();
    }
    const [result] = await db.update(emcUsers).set(sanitizeDates(updateData)).where(eq(emcUsers.id, id)).returning();
    return result;
  }

  async deleteEmcUser(id: string): Promise<boolean> {
    // First delete any sessions for this user
    await db.delete(emcSessions).where(eq(emcSessions.userId, id));
    const result = await db.delete(emcUsers).where(eq(emcUsers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEmcUserCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(emcUsers);
    return result?.count ?? 0;
  }

  async getModifierMapRaw(): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT
        mimg.menu_item_id,
        mg.id AS group_id,
        mg.name AS group_name,
        mg.required AS group_required,
        mg.min_select,
        mg.max_select,
        mg.display_order AS group_display_order,
        mg.enterprise_id AS group_enterprise_id,
        mg.property_id AS group_property_id,
        mg.rvc_id AS group_rvc_id,
        m.id AS mod_id,
        m.name AS mod_name,
        m.price_delta AS mod_price_delta,
        m.active AS mod_active,
        mgm.is_default AS mod_is_default,
        mgm.display_order AS mod_display_order
      FROM menu_item_modifier_groups mimg
      JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id AND mg.active = true
      LEFT JOIN modifier_group_modifiers mgm ON mgm.modifier_group_id = mg.id
      LEFT JOIN modifiers m ON m.id = mgm.modifier_id AND m.active = true
      ORDER BY mimg.menu_item_id, mg.display_order, mgm.display_order
    `);
    return result.rows as any[];
  }

  async getAccessibleEnterprisesAndProperties(user: { accessLevel: string; enterpriseId?: string | null; propertyId?: string | null; employeeId?: string | null }): Promise<{ enterprises: any[]; properties: any[] }> {
    const isSystem = user.accessLevel === "system_admin" || user.accessLevel === "super_admin";

    if (isSystem) {
      const allEnterprises = await db.select().from(enterprises);
      const allProperties = await db.select().from(properties);
      return { enterprises: allEnterprises, properties: allProperties };
    }

    if (user.accessLevel === "enterprise_admin" && user.enterpriseId) {
      const ents = await db.select().from(enterprises).where(eq(enterprises.id, user.enterpriseId));
      const props = await db.select().from(properties).where(eq(properties.enterpriseId, user.enterpriseId));
      return { enterprises: ents, properties: props };
    }

    let accessibleEnterprises: any[] = [];
    let accessibleProperties: any[] = [];

    if (user.enterpriseId) {
      accessibleEnterprises = await db.select().from(enterprises).where(eq(enterprises.id, user.enterpriseId));
    }

    if (user.employeeId) {
      const assignments = await db.select().from(employeeAssignments).where(eq(employeeAssignments.employeeId, user.employeeId));
      const assignedPropertyIds = assignments.map(a => a.propertyId).filter(Boolean) as string[];
      if (assignedPropertyIds.length > 0) {
        accessibleProperties = await db.select().from(properties).where(inArray(properties.id, assignedPropertyIds));
      }
    }

    if (accessibleProperties.length === 0 && user.propertyId) {
      accessibleProperties = await db.select().from(properties).where(eq(properties.id, user.propertyId));
    }

    return { enterprises: accessibleEnterprises, properties: accessibleProperties };
  }

  async runStartupMigrations(): Promise<void> {
    try {
      await db.execute(sql`ALTER TABLE emc_users ADD COLUMN IF NOT EXISTS employee_id VARCHAR REFERENCES employees(id)`);
    } catch (e) {
      console.error("Migration error (non-fatal):", e);
    }
  }

  async getConfigTableData(tableName: string, propertyId?: string, enterpriseId?: string, since?: string): Promise<{ rows: any[]; columns: string[]; incremental: boolean }> {
    const colsResult = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${tableName}`);
    const allCols = new Set((colsResult.rows || []).map((r: any) => r.column_name as string));
    const hasPropertyId = allCols.has("property_id");
    const hasRvcId = allCols.has("rvc_id");
    const hasEnterpriseId = allCols.has("enterprise_id");
    const hasUpdatedAt = allCols.has("updated_at");

    let resolvedEnterpriseId = enterpriseId || null;
    let propertyRvcIds: string[] = [];
    if (propertyId) {
      if (hasPropertyId && hasEnterpriseId && !resolvedEnterpriseId) {
        const propResult = await db.execute(sql`SELECT "enterprise_id" FROM "properties" WHERE "id" = ${propertyId} LIMIT 1`);
        const propRow = (propResult.rows || [])[0] as { enterprise_id?: string } | undefined;
        resolvedEnterpriseId = propRow?.enterprise_id || null;
      }
      if (hasRvcId) {
        const rvcResult = await db.execute(sql`SELECT "id" FROM "rvcs" WHERE "property_id" = ${propertyId}`);
        propertyRvcIds = (rvcResult.rows || []).map((r: any) => r.id as string);
      }
    }

    let incremental = false;
    let result;

    const buildScopeFilter = () => {
      const conditions: any[] = [];
      if (hasPropertyId) conditions.push(sql`"property_id" = ${propertyId}`);
      if (hasRvcId && propertyRvcIds.length > 0) {
        const rvcList = propertyRvcIds.map(id => sql`${id}`);
        conditions.push(sql`"rvc_id" IN (${sql.join(rvcList, sql`, `)})`);
      }
      if (resolvedEnterpriseId && hasEnterpriseId) {
        if (hasPropertyId) {
          conditions.push(sql`("property_id" IS NULL AND "enterprise_id" = ${resolvedEnterpriseId})`);
        } else {
          conditions.push(sql`"enterprise_id" = ${resolvedEnterpriseId}`);
        }
      }
      if (conditions.length === 0) return null;
      return conditions.length === 1 ? conditions[0] : sql`(${sql.join(conditions, sql` OR `)})`;
    };

    if (propertyId && (hasPropertyId || hasRvcId || hasEnterpriseId)) {
      const scopeFilter = buildScopeFilter();
      if (scopeFilter) {
        if (since && hasUpdatedAt) {
          incremental = true;
          result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE ${scopeFilter} AND "updated_at" > ${since}`);
        } else {
          result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE ${scopeFilter}`);
        }
      } else {
        if (since && hasUpdatedAt) {
          incremental = true;
          result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE "updated_at" > ${since}`);
        } else {
          result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)}`);
        }
      }
    } else if (since && hasUpdatedAt) {
      incremental = true;
      result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE "updated_at" > ${since}`);
    } else {
      result = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)}`);
    }

    const rows = result.rows || [];
    const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];
    return { rows, columns, incremental };
  }

  async getPaymentsByStatus(status: string, propertyId?: string): Promise<any[]> {
    if (propertyId) {
      const joined = await db.select()
        .from(checkPayments)
        .innerJoin(checks, eq(checks.id, checkPayments.checkId))
        .where(and(
          eq(checkPayments.paymentStatus, status),
          sql`EXISTS (SELECT 1 FROM rvcs WHERE rvcs.id = ${checks.rvcId} AND rvcs.property_id = ${propertyId})`
        ));
      return joined.map(r => r.check_payments);
    }
    return db.select().from(checkPayments).where(eq(checkPayments.paymentStatus, status));
  }

  async getPaymentById(paymentId: string): Promise<any | undefined> {
    const [result] = await db.select().from(checkPayments).where(eq(checkPayments.id, paymentId)).limit(1);
    return result;
  }

  async getTenderWithGateway(tenderId: string): Promise<{ tender: any; gatewayConfig: any | null } | null> {
    const [tender] = await db.select().from(tenders).where(eq(tenders.id, tenderId)).limit(1);
    if (!tender) return null;
    if (!tender.gatewayType) return { tender, gatewayConfig: null };

    const configConditions = [eq(paymentGatewayConfig.gatewayType, tender.gatewayType)];
    if (tender.propertyId) {
      configConditions.push(eq(paymentGatewayConfig.propertyId, tender.propertyId));
    }
    const [config] = await db.select().from(paymentGatewayConfig).where(and(...configConditions)).limit(1);
    if (config) return { tender, gatewayConfig: config };

    if (tender.propertyId) {
      const [fallback] = await db.select().from(paymentGatewayConfig)
        .where(eq(paymentGatewayConfig.gatewayType, tender.gatewayType)).limit(1);
      return { tender, gatewayConfig: fallback || null };
    }
    return { tender, gatewayConfig: null };
  }

  async storeLfsIdRemap(localId: string, cloudId: string): Promise<void> {
    await db.execute(sql`INSERT INTO "lfs_id_remap" (local_id, cloud_id, created_at) VALUES (${localId}, ${cloudId}, NOW()) ON CONFLICT (local_id) DO UPDATE SET cloud_id = EXCLUDED.cloud_id`);
  }

  async loadLfsIdRemap(localId: string): Promise<string | null> {
    const rows = await db.execute(sql`SELECT cloud_id FROM "lfs_id_remap" WHERE local_id = ${localId}`);
    if (rows.rows && rows.rows.length > 0) {
      return (rows.rows[0] as Record<string, unknown>).cloud_id as string;
    }
    return null;
  }

  async ensureLfsRemapTable(): Promise<void> {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS "lfs_id_remap" (
      "local_id" VARCHAR PRIMARY KEY,
      "cloud_id" VARCHAR NOT NULL,
      "created_at" TIMESTAMP DEFAULT NOW()
    )`);
  }

  async findEntityByOfflineTransactionId(entityType: string, offlineTransactionId: string): Promise<string | null> {
    switch (entityType) {
      case "check": {
        const rows = await db.select({ id: checks.id }).from(checks)
          .where(eq(checks.offlineTransactionId, offlineTransactionId)).limit(1);
        return rows.length > 0 ? rows[0].id : null;
      }
      case "check_item": {
        const rows = await db.select({ id: checkItems.id }).from(checkItems)
          .where(eq(checkItems.offlineTransactionId, offlineTransactionId)).limit(1);
        return rows.length > 0 ? rows[0].id : null;
      }
      case "check_payment": {
        const rows = await db.select({ id: checkPayments.id }).from(checkPayments)
          .where(eq(checkPayments.offlineTransactionId, offlineTransactionId)).limit(1);
        return rows.length > 0 ? rows[0].id : null;
      }
      default:
        return null;
    }
  }

  // EMC Sessions
  async getEmcSession(id: string): Promise<EmcSession | undefined> {
    const [result] = await db.select().from(emcSessions).where(eq(emcSessions.id, id));
    return result;
  }

  async getEmcSessionByToken(sessionToken: string): Promise<EmcSession | undefined> {
    const [result] = await db.select().from(emcSessions)
      .where(and(
        eq(emcSessions.sessionToken, sessionToken),
        gte(emcSessions.expiresAt, new Date())
      ));
    return result;
  }

  async createEmcSession(data: InsertEmcSession): Promise<EmcSession> {
    const [result] = await db.insert(emcSessions).values(sanitizeDates(data)).returning();
    return result;
  }

  async deleteEmcSession(id: string): Promise<boolean> {
    const result = await db.delete(emcSessions).where(eq(emcSessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteExpiredEmcSessions(): Promise<number> {
    const result = await db.delete(emcSessions).where(lte(emcSessions.expiresAt, new Date()));
    return result.rowCount ?? 0;
  }

  // Audit Logs
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [result] = await db.insert(auditLogs).values(sanitizeDates(data)).returning();
    return result;
  }

  async getAuditLogs(rvcId?: string): Promise<AuditLog[]> {
    if (rvcId) {
      return db.select().from(auditLogs).where(eq(auditLogs.rvcId, rvcId)).orderBy(desc(auditLogs.createdAt));
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  // Print Jobs
  async createPrintJob(data: InsertPrintJob): Promise<PrintJob> {
    const [result] = await db.insert(printJobs).values(sanitizeDates(data)).returning();
    return result;
  }

  async getPrintJob(id: string): Promise<PrintJob | undefined> {
    const [result] = await db.select().from(printJobs).where(eq(printJobs.id, id));
    return result;
  }

  async getPendingPrintJobs(workstationId?: string, propertyId?: string): Promise<PrintJob[]> {
    const conditions = [eq(printJobs.status, "pending")];
    if (workstationId) {
      conditions.push(eq(printJobs.workstationId, workstationId));
    }
    if (propertyId) {
      conditions.push(eq(printJobs.propertyId, propertyId));
    }
    return db.select().from(printJobs).where(and(...conditions)).orderBy(printJobs.priority, printJobs.createdAt);
  }

  async updatePrintJob(id: string, data: Partial<PrintJob>): Promise<PrintJob | undefined> {
    const [result] = await db.update(printJobs).set(sanitizeDates(data)).where(eq(printJobs.id, id)).returning();
    return result;
  }

  async findReceiptPrinter(propertyId: string): Promise<Printer | undefined> {
    const [result] = await db.select().from(printers)
      .where(and(
        eq(printers.propertyId, propertyId),
        eq(printers.active, true),
        eq(printers.printerType, "receipt")
      ))
      .limit(1);
    return result;
  }

  // Print Agents
  async getPrintAgents(propertyId?: string): Promise<PrintAgent[]> {
    if (propertyId) {
      // Include agents for this property OR global agents (null propertyId)
      return db.select().from(printAgents)
        .where(or(eq(printAgents.propertyId, propertyId), isNull(printAgents.propertyId)))
        .orderBy(printAgents.name);
    }
    return db.select().from(printAgents).orderBy(printAgents.name);
  }

  async getPrintAgent(id: string): Promise<PrintAgent | undefined> {
    const [result] = await db.select().from(printAgents).where(eq(printAgents.id, id));
    return result;
  }

  async getPrintAgentByToken(agentTokenHash: string): Promise<PrintAgent | undefined> {
    const [result] = await db.select().from(printAgents).where(eq(printAgents.agentToken, agentTokenHash));
    return result;
  }

  async getOnlinePrintAgentForProperty(propertyId: string): Promise<PrintAgent | undefined> {
    // Find an online, active print agent for this property (or global agent)
    const [result] = await db.select().from(printAgents)
      .where(and(
        or(eq(printAgents.propertyId, propertyId), isNull(printAgents.propertyId)),
        eq(printAgents.status, "online"),
        eq(printAgents.active, true)
      ))
      .orderBy(printAgents.propertyId) // Prefer property-specific agents over global
      .limit(1);
    return result;
  }

  async getOnlinePrintAgentForWorkstation(workstationId: string): Promise<PrintAgent | undefined> {
    const [result] = await db.select().from(printAgents)
      .where(and(
        eq(printAgents.workstationId, workstationId),
        eq(printAgents.status, "online"),
        eq(printAgents.active, true)
      ))
      .limit(1);
    return result;
  }

  async createPrintAgent(data: InsertPrintAgent): Promise<PrintAgent> {
    const [result] = await db.insert(printAgents).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePrintAgent(id: string, data: Partial<PrintAgent>): Promise<PrintAgent | undefined> {
    const [result] = await db.update(printAgents).set(sanitizeDates(data)).where(eq(printAgents.id, id)).returning();
    return result;
  }

  async deletePrintAgent(id: string): Promise<boolean> {
    const result = await db.delete(printAgents).where(eq(printAgents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAgentPendingPrintJobs(agentId: string): Promise<PrintJob[]> {
    // Get jobs assigned to this agent that are pending
    return db.select().from(printJobs)
      .where(and(
        eq(printJobs.printAgentId, agentId),
        eq(printJobs.status, "pending")
      ))
      .orderBy(printJobs.priority, printJobs.createdAt);
  }

  async getAgentPrintingJobs(agentId: string): Promise<PrintJob[]> {
    // Get jobs assigned to this agent that are in "printing" status (for reset on disconnect)
    return db.select().from(printJobs)
      .where(and(
        eq(printJobs.printAgentId, agentId),
        eq(printJobs.status, "printing")
      ));
  }

  async getUnassignedPendingPrintJobsForProperty(propertyId: string): Promise<PrintJob[]> {
    // Get pending jobs for this property that have no agent assigned (null printAgentId)
    return db.select().from(printJobs)
      .where(and(
        eq(printJobs.propertyId, propertyId),
        isNull(printJobs.printAgentId),
        eq(printJobs.status, "pending")
      ))
      .orderBy(printJobs.priority, printJobs.createdAt);
  }

  async getActiveKdsTicketsWithDetails(filters: { kdsDeviceId?: string; rvcId?: string }): Promise<{ tickets: any[]; fetchedAt: string }> {
    const conditions: any[] = [inArray(kdsTickets.status, ['active', 'draft'])];
    if (filters.kdsDeviceId) {
      conditions.push(eq(kdsTickets.kdsDeviceId, filters.kdsDeviceId));
    } else if (filters.rvcId) {
      conditions.push(eq(kdsTickets.rvcId, filters.rvcId));
    }

    const tickets = await db.select().from(kdsTickets)
      .where(and(...conditions))
      .orderBy(kdsTickets.createdAt);

    const ticketIds = tickets.map(t => t.id);
    let ticketItemsData: any[] = [];
    if (ticketIds.length > 0) {
      ticketItemsData = await db.select().from(kdsTicketItems)
        .where(inArray(kdsTicketItems.kdsTicketId, ticketIds));
    }

    const checkIds = [...new Set(tickets.map(t => t.checkId))];
    let checksData: any[] = [];
    if (checkIds.length > 0) {
      checksData = await db.select().from(checks)
        .where(inArray(checks.id, checkIds));
    }

    const checkItemIds = ticketItemsData.map(ti => ti.checkItemId);
    let checkItemsData: any[] = [];
    if (checkItemIds.length > 0) {
      checkItemsData = await db.select().from(checkItems)
        .where(inArray(checkItems.id, checkItemIds));
    }

    const fullState = tickets.map(ticket => ({
      ...ticket,
      items: ticketItemsData
        .filter(ti => ti.kdsTicketId === ticket.id)
        .map(ti => ({
          ...ti,
          checkItem: checkItemsData.find(ci => ci.id === ti.checkItemId),
        })),
      check: checksData.find(c => c.id === ticket.checkId),
    }));

    return { tickets: fullState, fetchedAt: new Date().toISOString() };
  }

  async getAllWorkstationOrderDevicesFiltered(propertyId?: string): Promise<any[]> {
    let data = await db.select().from(workstationOrderDevices);
    if (propertyId) {
      const ws = (await this.getWorkstations()).filter((w: any) => w.propertyId === propertyId);
      const wsIds = new Set(ws.map((w: any) => w.id));
      data = data.filter((d: any) => wsIds.has(d.workstationId));
    }
    return data;
  }

  async getAllPosLayoutRvcAssignmentsFiltered(propertyId: string): Promise<any[]> {
    const data = await db.select().from(posLayoutRvcAssignments);
    return data.filter((a: any) => a.propertyId === propertyId);
  }

  async getOrdersForPickup(rvcId: string, filters?: { orderType?: string; statusFilter?: string }): Promise<any[]> {
    const ne = (col: any, val: any) => sql`${col} != ${val}`;
    const conditions: any[] = [eq(checks.rvcId, rvcId), ne(checks.testMode, true)];

    if (filters?.orderType && filters.orderType !== "all") {
      conditions.push(eq(checks.orderType, filters.orderType));
    }

    if (filters?.statusFilter === "completed") {
      conditions.push(eq(checks.status, "closed"));
    } else {
      conditions.push(inArray(checks.status, ["open", "voided"]));
    }

    const allChecks = await db
      .select()
      .from(checks)
      .where(and(...conditions))
      .orderBy(filters?.statusFilter === "completed" ? desc(checks.closedAt) : desc(checks.openedAt))
      .limit(filters?.statusFilter === "completed" ? 50 : 500);

    const enrichedChecks = await Promise.all(
      allChecks.map(async (check) => {
        const items = await this.getCheckItems(check.id);
        const activeItems = items.filter((i: any) => !i.voided);
        const rounds = await this.getRounds(check.id);
        const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
        let employeeName: string | null = null;
        if (check.employeeId) {
          const employee = await this.getEmployee(check.employeeId);
          if (employee) {
            employeeName = `${employee.firstName} ${employee.lastName}`.trim();
          }
        }
        return {
          ...check,
          employeeName,
          itemCount: activeItems.length,
          unsentCount: activeItems.filter((i: any) => !i.sent).length,
          roundCount: rounds.length,
          lastRoundAt: lastRound?.sentAt || null,
        };
      })
    );

    return enrichedChecks;
  }

  // KDS Tickets
  async getKdsTickets(filters?: { rvcId?: string; kdsDeviceId?: string; stationType?: string; propertyId?: string }): Promise<any[]> {
    // Filter out bumped AND voided tickets - voided means cancelled/auto-bumped
    const conditions = [sql`${kdsTickets.status} NOT IN ('bumped', 'voided')`];
    
    if (filters?.rvcId) {
      conditions.push(eq(kdsTickets.rvcId, filters.rvcId));
    }
    if (filters?.propertyId) {
      // Filter by property - get all RVCs for this property and filter tickets by those RVCs
      const propertyRvcs = await db.select({ id: rvcs.id }).from(rvcs).where(eq(rvcs.propertyId, filters.propertyId));
      const rvcIds = propertyRvcs.map(r => r.id);
      if (rvcIds.length > 0) {
        conditions.push(inArray(kdsTickets.rvcId, rvcIds));
      } else {
        // No RVCs for this property, return empty
        return [];
      }
    }
    if (filters?.kdsDeviceId) {
      conditions.push(eq(kdsTickets.kdsDeviceId, filters.kdsDeviceId));
    }
    if (filters?.stationType) {
      conditions.push(eq(kdsTickets.stationType, filters.stationType));
    }

    const tickets = await db.select().from(kdsTickets)
      .where(and(...conditions))
      .orderBy(kdsTickets.createdAt);

    // Sort so recalled tickets appear first (in creation order among themselves)
    const sortedTickets = tickets.sort((a, b) => {
      if (a.isRecalled && !b.isRecalled) return -1;
      if (!a.isRecalled && b.isRecalled) return 1;
      return new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime();
    });

    const result = [];
    for (const ticket of sortedTickets) {
      const check = await this.getCheck(ticket.checkId);
      const items = await db.select().from(kdsTicketItems).where(eq(kdsTicketItems.kdsTicketId, ticket.id));
      const checkItemsList = [];
      for (const item of items) {
        const checkItem = await this.getCheckItem(item.checkItemId);
        if (checkItem) {
          checkItemsList.push({
            id: item.id, // Use the kdsTicketItem id for marking ready
            checkItemId: checkItem.id,
            name: checkItem.menuItemName,
            quantity: checkItem.quantity || 1,
            modifiers: checkItem.modifiers,
            status: item.status,
            itemStatus: checkItem.itemStatus, // 'pending' or 'active'
            isReady: item.isReady || false,
            isModified: item.isModified || false,
            sortPriority: item.sortPriority || 0,
          });
        }
      }
      result.push({
        id: ticket.id,
        checkNumber: check?.checkNumber || 0,
        orderType: check?.orderType || 'dine_in',
        stationType: ticket.stationType,
        kdsDeviceId: ticket.kdsDeviceId,
        items: checkItemsList,
        isDraft: ticket.status === 'draft',
        isPreview: ticket.isPreview || false,
        isPaid: ticket.paid || false,
        isRecalled: ticket.isRecalled || false,
        status: ticket.status,
        createdAt: ticket.createdAt,
        subtotal: ticket.subtotal || check?.subtotal || null,
      });
    }
    return result;
  }

  async getAllKdsTicketsForReporting(filters?: { rvcId?: string }): Promise<any[]> {
    // Get ALL tickets including bumped ones for reporting purposes
    const conditions = [];
    
    if (filters?.rvcId) {
      conditions.push(eq(kdsTickets.rvcId, filters.rvcId));
    }

    const tickets = conditions.length > 0 
      ? await db.select().from(kdsTickets).where(and(...conditions)).orderBy(kdsTickets.createdAt)
      : await db.select().from(kdsTickets).orderBy(kdsTickets.createdAt);

    const result = [];
    for (const ticket of tickets) {
      const items = await db.select().from(kdsTicketItems).where(eq(kdsTicketItems.kdsTicketId, ticket.id));
      const checkItemsList = [];
      for (const item of items) {
        const checkItem = await this.getCheckItem(item.checkItemId);
        if (checkItem) {
          checkItemsList.push({
            id: item.id,
            checkItemId: checkItem.id,
            name: checkItem.menuItemName,
            quantity: checkItem.quantity || 1,
            modifiers: checkItem.modifiers,
            status: item.status,
            isReady: item.isReady || false,
          });
        }
      }
      result.push({
        id: ticket.id,
        rvcId: ticket.rvcId,
        stationType: ticket.stationType,
        kdsDeviceId: ticket.kdsDeviceId,
        items: checkItemsList,
        isPreview: ticket.isPreview || false,
        isPaid: ticket.paid || false,
        isRecalled: ticket.isRecalled || false,
        status: ticket.status,
        createdAt: ticket.createdAt,
        bumpedAt: ticket.bumpedAt,
        completedAt: ticket.bumpedAt, // bumpedAt is the completion time
      });
    }
    return result;
  }

  async getKdsTicket(id: string): Promise<KdsTicket | undefined> {
    const [result] = await db.select().from(kdsTickets).where(eq(kdsTickets.id, id));
    return result;
  }

  async createKdsTicket(data: InsertKdsTicket & { id?: string }): Promise<KdsTicket> {
    const [result] = await db.insert(kdsTickets).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateKdsTicket(id: string, data: Partial<KdsTicket>): Promise<KdsTicket | undefined> {
    const [result] = await db.update(kdsTickets).set(sanitizeDates(data)).where(eq(kdsTickets.id, id)).returning();
    return result;
  }

  async createKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void> {
    // Check if this item is already on the ticket to avoid duplicates
    const existing = await db.select().from(kdsTicketItems)
      .where(and(eq(kdsTicketItems.kdsTicketId, kdsTicketId), eq(kdsTicketItems.checkItemId, checkItemId)));
    if (existing.length === 0) {
      await db.insert(kdsTicketItems).values({ kdsTicketId, checkItemId, status: "pending" });
    }
  }

  async getKdsTicketItems(kdsTicketId: string): Promise<KdsTicketItem[]> {
    return db.select().from(kdsTicketItems)
      .where(eq(kdsTicketItems.kdsTicketId, kdsTicketId));
  }

  async removeKdsTicketItem(kdsTicketId: string, checkItemId: string): Promise<void> {
    await db.delete(kdsTicketItems)
      .where(and(eq(kdsTicketItems.kdsTicketId, kdsTicketId), eq(kdsTicketItems.checkItemId, checkItemId)));
  }

  async voidKdsTicketItem(checkItemId: string): Promise<void> {
    await db.update(kdsTicketItems)
      .set({ status: "voided" })
      .where(eq(kdsTicketItems.checkItemId, checkItemId));
  }

  async bumpKdsTicket(id: string, bumpedBy?: string): Promise<KdsTicket | undefined> {
    const [result] = await db.update(kdsTickets).set({
      status: "bumped",
      bumpedAt: new Date(),
      bumpedByEmployeeId: bumpedBy || null,
    }).where(eq(kdsTickets.id, id)).returning();
    
    if (result) {
      await db.update(kdsTicketItems).set({ status: "bumped" })
        .where(eq(kdsTicketItems.kdsTicketId, id));
    }
    return result;
  }

  async recallKdsTicket(id: string, scope?: 'expo' | 'all'): Promise<KdsTicket | undefined> {
    // scope determines which stations to recall to:
    // 'expo' = only expeditor stations see the recalled ticket
    // 'all' = all stations see the recalled ticket (default behavior)
    const recallScope = scope || 'all';
    
    const [result] = await db.update(kdsTickets).set({
      status: "active",
      isRecalled: true,
      recalledAt: new Date(),
      bumpedAt: null,
      bumpedByEmployeeId: null,
      // If expo-only recall, set station type to expo so only expo sees it
      ...(recallScope === 'expo' ? { stationType: 'expo' } : {}),
    }).where(eq(kdsTickets.id, id)).returning();
    
    if (result) {
      // Reset item ready states as well
      await db.update(kdsTicketItems).set({ status: "pending", isReady: false, readyAt: null })
        .where(eq(kdsTicketItems.kdsTicketId, id));
    }
    return result;
  }

  async getBumpedKdsTickets(filters: { rvcId?: string; stationType?: string; limit?: number }): Promise<any[]> {
    const allTickets = await db.select().from(kdsTickets)
      .where(eq(kdsTickets.status, "bumped"))
      .orderBy(desc(kdsTickets.bumpedAt));
    
    let filtered = allTickets;
    if (filters.rvcId) {
      filtered = filtered.filter((t) => t.rvcId === filters.rvcId);
    }
    if (filters.stationType) {
      filtered = filtered.filter((t) => t.stationType === filters.stationType);
    }
    
    const limited = filters.limit ? filtered.slice(0, filters.limit) : filtered.slice(0, 50);
    
    // Load check details for each ticket
    const enriched = await Promise.all(limited.map(async (ticket) => {
      const check = await this.getCheck(ticket.checkId);
      const ticketItems = await db.select().from(kdsTicketItems)
        .where(eq(kdsTicketItems.kdsTicketId, ticket.id));
      
      const items = await Promise.all(ticketItems.map(async (ti) => {
        const checkItem = await this.getCheckItem(ti.checkItemId);
        return checkItem ? {
          id: ti.id,
          name: checkItem.menuItemName,
          quantity: checkItem.quantity,
          status: ti.status,
          isReady: ti.isReady,
        } : null;
      }));
      
      return {
        ...ticket,
        checkNumber: check?.checkNumber,
        orderType: check?.orderType,
        items: items.filter(Boolean),
      };
    }));
    
    return enriched;
  }

  async markKdsItemReady(ticketItemId: string): Promise<void> {
    await db.update(kdsTicketItems)
      .set({ isReady: true, readyAt: new Date() })
      .where(eq(kdsTicketItems.id, ticketItemId));
  }

  async unmarkKdsItemReady(ticketItemId: string): Promise<void> {
    await db.update(kdsTicketItems)
      .set({ isReady: false, readyAt: null })
      .where(eq(kdsTicketItems.id, ticketItemId));
  }

  async getPreviewTicket(checkId: string): Promise<KdsTicket | undefined> {
    const [result] = await db.select().from(kdsTickets)
      .where(and(eq(kdsTickets.checkId, checkId), eq(kdsTickets.isPreview, true)));
    return result;
  }

  async getPreviewTickets(checkId: string): Promise<KdsTicket[]> {
    return db.select().from(kdsTickets)
      .where(and(eq(kdsTickets.checkId, checkId), eq(kdsTickets.isPreview, true)));
  }

  async getKdsTicketsByCheck(checkId: string): Promise<KdsTicket[]> {
    return db.select().from(kdsTickets).where(eq(kdsTickets.checkId, checkId));
  }

  async markKdsTicketsPaid(checkId: string): Promise<void> {
    await db.update(kdsTickets).set({ paid: true }).where(eq(kdsTickets.checkId, checkId));
  }

  // Admin Stats
  async getAdminStats(enterpriseId?: string): Promise<{ enterprises: number; properties: number; rvcs: number; employees: number; menuItems: number; activeChecks: number }> {
    if (enterpriseId) {
      // Get properties for this enterprise
      const entProps = await db.select().from(properties).where(eq(properties.enterpriseId, enterpriseId));
      const entPropIdSet = new Set(entProps.map(p => p.id));
      
      // If no properties, count just enterprise-level items
      if (entPropIdSet.size === 0) {
        const [itemCount] = await db.select({ count: sql<number>`count(*)` }).from(menuItems).where(eq(menuItems.enterpriseId, enterpriseId));
        return {
          enterprises: 1,
          properties: 0,
          rvcs: 0,
          employees: 0,
          menuItems: Number(itemCount?.count || 0),
          activeChecks: 0,
        };
      }
      
      // Fetch RVCs for enterprise's properties using in-memory filter
      const allRvcs = await db.select().from(rvcs);
      const entRvcs = allRvcs.filter(r => entPropIdSet.has(r.propertyId));
      const entRvcIdSet = new Set(entRvcs.map(r => r.id));
      
      // Count employees in-memory
      const allEmps = await db.select().from(employees);
      const entEmps = allEmps.filter(e => e.propertyId && entPropIdSet.has(e.propertyId));
      
      // Count menu items in-memory (need to check enterprise, property, or rvc)
      const allItems = await db.select().from(menuItems);
      const entItems = allItems.filter(item => {
        if (item.enterpriseId === enterpriseId) return true;
        if (item.propertyId && entPropIdSet.has(item.propertyId)) return true;
        if (item.rvcId && entRvcIdSet.has(item.rvcId)) return true;
        return false;
      });
      
      // Count open checks in-memory
      const openChecks = await db.select().from(checks).where(eq(checks.status, 'open'));
      const entChecks = openChecks.filter(c => c.propertyId && entPropIdSet.has(c.propertyId));
      
      return {
        enterprises: 1,
        properties: entProps.length,
        rvcs: entRvcs.length,
        employees: entEmps.length,
        menuItems: entItems.length,
        activeChecks: entChecks.length,
      };
    }
    
    // No enterprise filter - return global stats
    const [entCount] = await db.select({ count: sql<number>`count(*)` }).from(enterprises);
    const [propCount] = await db.select({ count: sql<number>`count(*)` }).from(properties);
    const [rvcCount] = await db.select({ count: sql<number>`count(*)` }).from(rvcs);
    const [empCount] = await db.select({ count: sql<number>`count(*)` }).from(employees);
    const [itemCount] = await db.select({ count: sql<number>`count(*)` }).from(menuItems);
    const [checkCount] = await db.select({ count: sql<number>`count(*)` }).from(checks).where(eq(checks.status, 'open'));

    return {
      enterprises: Number(entCount?.count || 0),
      properties: Number(propCount?.count || 0),
      rvcs: Number(rvcCount?.count || 0),
      employees: Number(empCount?.count || 0),
      menuItems: Number(itemCount?.count || 0),
      activeChecks: Number(checkCount?.count || 0),
    };
  }

  // POS Layouts
  async getPosLayouts(rvcId?: string): Promise<PosLayout[]> {
    if (rvcId) {
      return db.select().from(posLayouts).where(eq(posLayouts.rvcId, rvcId));
    }
    return db.select().from(posLayouts);
  }

  async getPosLayout(id: string): Promise<PosLayout | undefined> {
    const [result] = await db.select().from(posLayouts).where(eq(posLayouts.id, id));
    return result;
  }

  async getDefaultPosLayout(rvcId: string): Promise<PosLayout | undefined> {
    const [result] = await db.select().from(posLayouts)
      .where(and(eq(posLayouts.rvcId, rvcId), eq(posLayouts.isDefault, true), eq(posLayouts.active, true)));
    return result;
  }

  async createPosLayout(data: InsertPosLayout): Promise<PosLayout> {
    const [result] = await db.insert(posLayouts).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePosLayout(id: string, data: Partial<InsertPosLayout>): Promise<PosLayout | undefined> {
    const [result] = await db.update(posLayouts).set(sanitizeDates(data)).where(eq(posLayouts.id, id)).returning();
    return result;
  }

  async deletePosLayout(id: string): Promise<boolean> {
    await db.delete(posLayoutCells).where(eq(posLayoutCells.layoutId, id));
    const result = await db.delete(posLayouts).where(eq(posLayouts.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // POS Layout Cells
  async getPosLayoutCells(layoutId: string): Promise<PosLayoutCell[]> {
    return db.select().from(posLayoutCells).where(eq(posLayoutCells.layoutId, layoutId));
  }

  async setPosLayoutCells(layoutId: string, cells: InsertPosLayoutCell[]): Promise<PosLayoutCell[]> {
    await db.delete(posLayoutCells).where(eq(posLayoutCells.layoutId, layoutId));
    if (cells.length === 0) return [];
    const result = await db.insert(posLayoutCells).values(cells.map(c => ({ ...c, layoutId }))).returning();
    return result;
  }

  // POS Layout RVC Assignments
  async getPosLayoutRvcAssignments(layoutId: string): Promise<PosLayoutRvcAssignment[]> {
    return db.select().from(posLayoutRvcAssignments).where(eq(posLayoutRvcAssignments.layoutId, layoutId));
  }

  async setPosLayoutRvcAssignments(layoutId: string, assignments: { propertyId: string; rvcId: string; isDefault?: boolean }[]): Promise<PosLayoutRvcAssignment[]> {
    // Delete existing assignments for this layout
    await db.delete(posLayoutRvcAssignments).where(eq(posLayoutRvcAssignments.layoutId, layoutId));
    if (assignments.length === 0) return [];
    
    // For any RVC where isDefault=true, clear existing defaults first
    for (const a of assignments) {
      if (a.isDefault) {
        await db.update(posLayoutRvcAssignments)
          .set({ isDefault: false })
          .where(eq(posLayoutRvcAssignments.rvcId, a.rvcId));
      }
    }
    
    // Insert new assignments
    const result = await db.insert(posLayoutRvcAssignments).values(
      assignments.map(a => ({ layoutId, propertyId: a.propertyId, rvcId: a.rvcId, isDefault: a.isDefault ?? false }))
    ).returning();
    return result;
  }

  async getPosLayoutsForRvc(rvcId: string): Promise<PosLayout[]> {
    // Get layouts assigned to this RVC via the join table or legacy rvcId field
    const assignedLayoutIds = await db.select({ layoutId: posLayoutRvcAssignments.layoutId })
      .from(posLayoutRvcAssignments)
      .where(eq(posLayoutRvcAssignments.rvcId, rvcId));
    const layoutIds = assignedLayoutIds.map(a => a.layoutId);
    
    // Get layouts either assigned via join table OR via legacy rvcId field
    if (layoutIds.length > 0) {
      return db.select().from(posLayouts).where(
        sql`${posLayouts.id} = ANY(${layoutIds}) OR ${posLayouts.rvcId} = ${rvcId}`
      );
    }
    // Fallback to just legacy rvcId
    return db.select().from(posLayouts).where(eq(posLayouts.rvcId, rvcId));
  }

  async getDefaultLayoutForRvc(rvcId: string): Promise<PosLayout | undefined> {
    // First check for a layout marked as default for this RVC in the assignments table
    const [assignment] = await db.select()
      .from(posLayoutRvcAssignments)
      .where(and(
        eq(posLayoutRvcAssignments.rvcId, rvcId),
        eq(posLayoutRvcAssignments.isDefault, true)
      ));
    
    if (assignment) {
      const [layout] = await db.select().from(posLayouts).where(eq(posLayouts.id, assignment.layoutId));
      return layout;
    }
    
    // Check for a layout with legacy rvcId field set directly
    const [legacyLayout] = await db.select().from(posLayouts)
      .where(and(eq(posLayouts.rvcId, rvcId), eq(posLayouts.isDefault, true), eq(posLayouts.active, true)));
    if (legacyLayout) {
      return legacyLayout;
    }
    
    // No layout found - return undefined so POS uses built-in SLU/category mode
    // DO NOT fall back to global default as it may be from a different enterprise
    return undefined;
  }

  async setDefaultLayoutForRvc(rvcId: string, layoutId: string): Promise<void> {
    // Clear any existing default for this RVC
    await db.update(posLayoutRvcAssignments)
      .set({ isDefault: false })
      .where(eq(posLayoutRvcAssignments.rvcId, rvcId));
    
    // Set the new default
    await db.update(posLayoutRvcAssignments)
      .set({ isDefault: true })
      .where(and(
        eq(posLayoutRvcAssignments.rvcId, rvcId),
        eq(posLayoutRvcAssignments.layoutId, layoutId)
      ));
  }

  // Admin Sales Reset (property-specific)
  async getSalesDataSummary(propertyId: string): Promise<{ 
    checks: number; checkItems: number; payments: number; rounds: number; kdsTickets: number; auditLogs: number;
    fiscalPeriods: number; cashTransactions: number; drawerAssignments: number; safeCounts: number;
    giftCardTransactions: number; giftCards: number; loyaltyTransactions: number; loyaltyRedemptions: number; loyaltyMembers: number;
    onlineOrders: number; inventoryTransactions: number; inventoryStock: number;
    salesForecasts: number; laborForecasts: number; managerAlerts: number;
    itemAvailability: number; prepItems: number; offlineQueue: number; accountingExports: number;
  }> {
    // Get all RVCs for this property
    const propertyRvcs = await db.select({ id: rvcs.id }).from(rvcs).where(eq(rvcs.propertyId, propertyId));
    const rvcIds = propertyRvcs.map(r => r.id);

    const emptyResult = { 
      checks: 0, checkItems: 0, payments: 0, rounds: 0, kdsTickets: 0, auditLogs: 0,
      fiscalPeriods: 0, cashTransactions: 0, drawerAssignments: 0, safeCounts: 0,
      giftCardTransactions: 0, giftCards: 0, loyaltyTransactions: 0, loyaltyRedemptions: 0, loyaltyMembers: 0,
      onlineOrders: 0, inventoryTransactions: 0, inventoryStock: 0,
      salesForecasts: 0, laborForecasts: 0, managerAlerts: 0,
      itemAvailability: 0, prepItems: 0, offlineQueue: 0, accountingExports: 0,
    };

    if (rvcIds.length === 0) {
      return emptyResult;
    }

    // Count checks for this property's RVCs
    const [checksCount] = await db.select({ count: sql<number>`count(*)` }).from(checks).where(inArray(checks.rvcId, rvcIds));
    
    // Get check IDs to count related records
    const propertyChecks = await db.select({ id: checks.id }).from(checks).where(inArray(checks.rvcId, rvcIds));
    const checkIds = propertyChecks.map(c => c.id);
    
    let itemsCount = { count: 0 };
    let paymentsCount = { count: 0 };
    let roundsCount = { count: 0 };
    
    if (checkIds.length > 0) {
      [itemsCount] = await db.select({ count: sql<number>`count(*)` }).from(checkItems).where(inArray(checkItems.checkId, checkIds));
      [paymentsCount] = await db.select({ count: sql<number>`count(*)` }).from(checkPayments).where(inArray(checkPayments.checkId, checkIds));
      [roundsCount] = await db.select({ count: sql<number>`count(*)` }).from(rounds).where(inArray(rounds.checkId, checkIds));
    }

    // KDS tickets and audit logs for this property's RVCs
    const [kdsCount] = await db.select({ count: sql<number>`count(*)` }).from(kdsTickets).where(inArray(kdsTickets.rvcId, rvcIds));
    const [auditCount] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(inArray(auditLogs.rvcId, rvcIds));

    // Enterprise features - count by propertyId
    const [fiscalCount] = await db.select({ count: sql<number>`count(*)` }).from(fiscalPeriods).where(eq(fiscalPeriods.propertyId, propertyId));
    const [safeCount] = await db.select({ count: sql<number>`count(*)` }).from(safeCounts).where(eq(safeCounts.propertyId, propertyId));
    const [onlineOrdersCount] = await db.select({ count: sql<number>`count(*)` }).from(onlineOrders).where(eq(onlineOrders.propertyId, propertyId));
    const [invTransCount] = await db.select({ count: sql<number>`count(*)` }).from(inventoryTransactions).where(eq(inventoryTransactions.propertyId, propertyId));
    const [invStockCount] = await db.select({ count: sql<number>`count(*)` }).from(inventoryStock).where(eq(inventoryStock.propertyId, propertyId));
    const [salesForecastCount] = await db.select({ count: sql<number>`count(*)` }).from(salesForecasts).where(eq(salesForecasts.propertyId, propertyId));
    const [laborForecastCount] = await db.select({ count: sql<number>`count(*)` }).from(laborForecasts).where(eq(laborForecasts.propertyId, propertyId));
    const [alertsCount] = await db.select({ count: sql<number>`count(*)` }).from(managerAlerts).where(eq(managerAlerts.propertyId, propertyId));
    const [itemAvailCount] = await db.select({ count: sql<number>`count(*)` }).from(itemAvailability).where(eq(itemAvailability.propertyId, propertyId));
    const [prepCount] = await db.select({ count: sql<number>`count(*)` }).from(prepItems).where(eq(prepItems.propertyId, propertyId));
    const [accountingCount] = await db.select({ count: sql<number>`count(*)` }).from(accountingExports).where(eq(accountingExports.propertyId, propertyId));

    // Cash management - get drawers for this property first
    const propertyDrawers = await db.select({ id: cashDrawers.id }).from(cashDrawers).where(eq(cashDrawers.propertyId, propertyId));
    const drawerIds = propertyDrawers.map(d => d.id);
    let cashTransCount = { count: 0 };
    let drawerAssignCount = { count: 0 };
    if (drawerIds.length > 0) {
      [cashTransCount] = await db.select({ count: sql<number>`count(*)` }).from(cashTransactions).where(inArray(cashTransactions.drawerId, drawerIds));
      [drawerAssignCount] = await db.select({ count: sql<number>`count(*)` }).from(drawerAssignments).where(inArray(drawerAssignments.drawerId, drawerIds));
    }

    // Gift card transactions and cards by propertyId
    const [giftCardTransCount] = await db.select({ count: sql<number>`count(*)` }).from(giftCardTransactions).where(eq(giftCardTransactions.propertyId, propertyId));
    const [giftCardCount] = await db.select({ count: sql<number>`count(*)` }).from(giftCards).where(eq(giftCards.propertyId, propertyId));

    // Loyalty transactions by propertyId and count all members (will be reset)
    const [loyaltyTransCount] = await db.select({ count: sql<number>`count(*)` }).from(loyaltyTransactions).where(eq(loyaltyTransactions.propertyId, propertyId));
    const [loyaltyRedemptionCount] = await db.select({ count: sql<number>`count(*)` }).from(loyaltyRedemptions).where(eq(loyaltyRedemptions.propertyId, propertyId));
    const [loyaltyMemberCount] = await db.select({ count: sql<number>`count(*)` }).from(loyaltyMembers);

    // Offline queue by rvcId
    let offlineCount = { count: 0 };
    if (rvcIds.length > 0) {
      [offlineCount] = await db.select({ count: sql<number>`count(*)` }).from(offlineOrderQueue).where(inArray(offlineOrderQueue.rvcId, rvcIds));
    }

    return {
      checks: Number(checksCount?.count || 0),
      checkItems: Number(itemsCount?.count || 0),
      payments: Number(paymentsCount?.count || 0),
      rounds: Number(roundsCount?.count || 0),
      kdsTickets: Number(kdsCount?.count || 0),
      auditLogs: Number(auditCount?.count || 0),
      fiscalPeriods: Number(fiscalCount?.count || 0),
      cashTransactions: Number(cashTransCount?.count || 0),
      drawerAssignments: Number(drawerAssignCount?.count || 0),
      safeCounts: Number(safeCount?.count || 0),
      giftCardTransactions: Number(giftCardTransCount?.count || 0),
      giftCards: Number(giftCardCount?.count || 0),
      loyaltyTransactions: Number(loyaltyTransCount?.count || 0),
      loyaltyRedemptions: Number(loyaltyRedemptionCount?.count || 0),
      loyaltyMembers: Number(loyaltyMemberCount?.count || 0),
      onlineOrders: Number(onlineOrdersCount?.count || 0),
      inventoryTransactions: Number(invTransCount?.count || 0),
      inventoryStock: Number(invStockCount?.count || 0),
      salesForecasts: Number(salesForecastCount?.count || 0),
      laborForecasts: Number(laborForecastCount?.count || 0),
      managerAlerts: Number(alertsCount?.count || 0),
      itemAvailability: Number(itemAvailCount?.count || 0),
      prepItems: Number(prepCount?.count || 0),
      offlineQueue: Number(offlineCount?.count || 0),
      accountingExports: Number(accountingCount?.count || 0),
    };
  }

  async clearSalesData(propertyId: string): Promise<{ deleted: { 
    checks: number; checkItems: number; payments: number; discounts: number; rounds: number; 
    kdsTicketItems: number; kdsTickets: number; terminalSessions: number; checkLocks: number; printJobs: number; auditLogs: number; 
    timePunches: number; timecards: number; breakSessions: number; timecardExceptions: number; shifts: number; 
    tipAllocations: number; tipPoolRuns: number;
    fiscalPeriods: number; cashTransactions: number; drawerAssignments: number; safeCounts: number;
    giftCardTransactions: number; giftCards: number; loyaltyTransactions: number; loyaltyRedemptions: number; loyaltyMembersReset: number;
    onlineOrders: number; inventoryTransactions: number; inventoryStock: number;
    salesForecasts: number; laborForecasts: number; managerAlerts: number;
    itemAvailability: number; prepItems: number; offlineQueue: number; accountingExports: number;
  } }> {
    const propertyRecord = await db.select({ name: properties.name }).from(properties).where(eq(properties.id, propertyId)).limit(1);
    const propertyName = propertyRecord[0]?.name || 'Unknown Property';
    const logPrefix = `[clearSalesData] [${propertyName}]`;

    const propertyRvcs = await db.select({ id: rvcs.id, name: rvcs.name }).from(rvcs).where(eq(rvcs.propertyId, propertyId));
    const rvcIds = propertyRvcs.map(r => r.id);
    const rvcNameMap = new Map(propertyRvcs.map(r => [r.id, r.name]));
    const rvcNameList = propertyRvcs.map(r => r.name).join(', ') || 'none';

    const allCheckRvcIds = await db.selectDistinct({ rvcId: checks.rvcId }).from(checks);
    const allKnownRvcIds = await db.select({ id: rvcs.id }).from(rvcs);
    const knownRvcIdSet = new Set(allKnownRvcIds.map(r => r.id));
    const orphanedRvcIds = allCheckRvcIds
      .map(r => r.rvcId)
      .filter(id => id && !knownRvcIdSet.has(id));
    
    if (orphanedRvcIds.length > 0) {
      console.log(`${logPrefix} Found ${orphanedRvcIds.length} orphaned RVC IDs with transactional data`);
    }

    const allRvcIds = [...new Set([...rvcIds, ...orphanedRvcIds])];

    const emptyResult = { 
      checks: 0, checkItems: 0, payments: 0, discounts: 0, rounds: 0, 
      kdsTicketItems: 0, kdsTickets: 0, auditLogs: 0, 
      timePunches: 0, timecards: 0, breakSessions: 0, timecardExceptions: 0, shifts: 0, 
      tipAllocations: 0, tipPoolRuns: 0, giftCards: 0, loyaltyMembersReset: 0,
      fiscalPeriods: 0, cashTransactions: 0, drawerAssignments: 0, safeCounts: 0,
      giftCardTransactions: 0, loyaltyTransactions: 0, loyaltyRedemptions: 0,
      onlineOrders: 0, inventoryTransactions: 0, inventoryStock: 0,
      salesForecasts: 0, laborForecasts: 0, managerAlerts: 0,
      itemAvailability: 0, prepItems: 0, offlineQueue: 0, accountingExports: 0,
    };

    if (allRvcIds.length === 0) {
      return { deleted: emptyResult };
    }

    // Use transaction to ensure atomicity - either all tables are cleared or none
    return await db.transaction(async (tx) => {
      console.log(`${logPrefix} Starting transaction — RVCs: [${rvcNameList}], orphanedRvcIds: ${orphanedRvcIds.length}, totalRvcIds: ${allRvcIds.length}`);
      
      // STEP 1: Gather all affected IDs upfront
      // Get check IDs for this property (including orphaned RVCs)
      const propertyChecks = await tx.select({ id: checks.id }).from(checks).where(inArray(checks.rvcId, allRvcIds));
      const checkIds = propertyChecks.map(c => c.id);

      // Get check item IDs for these checks
      let checkItemIds: string[] = [];
      if (checkIds.length > 0) {
        const propertyCheckItems = await tx.select({ id: checkItems.id }).from(checkItems).where(inArray(checkItems.checkId, checkIds));
        checkItemIds = propertyCheckItems.map(ci => ci.id);
      }

      // Get round IDs for these checks
      let roundIds: string[] = [];
      if (checkIds.length > 0) {
        const propertyRounds = await tx.select({ id: rounds.id }).from(rounds).where(inArray(rounds.checkId, checkIds));
        roundIds = propertyRounds.map(r => r.id);
      }

      // Get ALL KDS ticket IDs - by rvcId, checkId, OR roundId (deduplicated)
      const kdsTicketIdSet = new Set<string>();
      
      const kdsTicketsByRvc = await tx.select({ id: kdsTickets.id }).from(kdsTickets).where(inArray(kdsTickets.rvcId, allRvcIds));
      kdsTicketsByRvc.forEach(k => kdsTicketIdSet.add(k.id));
      
      if (checkIds.length > 0) {
        const kdsTicketsByCheck = await tx.select({ id: kdsTickets.id }).from(kdsTickets).where(inArray(kdsTickets.checkId, checkIds));
        kdsTicketsByCheck.forEach(k => kdsTicketIdSet.add(k.id));
      }
      
      if (roundIds.length > 0) {
        const kdsTicketsByRound = await tx.select({ id: kdsTickets.id }).from(kdsTickets).where(inArray(kdsTickets.roundId, roundIds));
        kdsTicketsByRound.forEach(k => kdsTicketIdSet.add(k.id));
      }
      
      const allKdsTicketIds = Array.from(kdsTicketIdSet);

      // Get cash drawer IDs for this property
      const propertyDrawers = await tx.select({ id: cashDrawers.id }).from(cashDrawers).where(eq(cashDrawers.propertyId, propertyId));
      const drawerIds = propertyDrawers.map(d => d.id);

      // STEP 2: Delete in FK-safe order
      let kdsItemsResult = { rowCount: 0 };
      let kdsResult = { rowCount: 0 };
      let paymentsResult = { rowCount: 0 };
      let discountsResult = { rowCount: 0 };
      let itemsResult = { rowCount: 0 };
      let roundsResult = { rowCount: 0 };

      // 1. Delete kds_ticket_items (references kdsTickets and checkItems)
      if (allKdsTicketIds.length > 0) {
        kdsItemsResult = await tx.delete(kdsTicketItems).where(inArray(kdsTicketItems.kdsTicketId, allKdsTicketIds));
      }
      // Also delete by checkItemId to catch any stragglers
      if (checkItemIds.length > 0) {
        const additionalKdsItems = await tx.delete(kdsTicketItems).where(inArray(kdsTicketItems.checkItemId, checkItemIds));
        kdsItemsResult = { rowCount: (kdsItemsResult.rowCount || 0) + (additionalKdsItems.rowCount || 0) };
      }

      // 2. Delete kds_tickets (references rounds and checks)
      if (allKdsTicketIds.length > 0) {
        kdsResult = await tx.delete(kdsTickets).where(inArray(kdsTickets.id, allKdsTicketIds));
      }

      // 2b. Get refund IDs that reference our checks
      const refundRecords = await tx.select({ id: refunds.id }).from(refunds).where(inArray(refunds.originalCheckId, checkIds.length > 0 ? checkIds : ['__none__']));
      const refundIds = refundRecords.map(r => r.id);

      // 2c. Delete refund_payments and refund_items (must come before check_payments/check_items)
      if (refundIds.length > 0) {
        await tx.delete(refundPayments).where(inArray(refundPayments.refundId, refundIds));
        await tx.delete(refundItems).where(inArray(refundItems.refundId, refundIds));
        await tx.delete(refunds).where(inArray(refunds.id, refundIds));
      }

      // 2d. Delete terminal_sessions FIRST (references paymentTransactions and checks)
      let terminalSessionsResult = { rowCount: 0 };
      if (checkIds.length > 0) {
        terminalSessionsResult = await tx.delete(terminalSessions).where(inArray(terminalSessions.checkId, checkIds));
      }
      console.log(`${logPrefix} Terminal sessions deleted: ${terminalSessionsResult.rowCount}`);

      // 2e. Delete payment_transactions (references check_payments via checkPaymentId FK)
      if (checkIds.length > 0) {
        const checkPaymentRecords = await tx.select({ id: checkPayments.id }).from(checkPayments).where(inArray(checkPayments.checkId, checkIds));
        const checkPaymentIds = checkPaymentRecords.map(cp => cp.id);
        if (checkPaymentIds.length > 0) {
          await tx.delete(paymentTransactions).where(inArray(paymentTransactions.checkPaymentId, checkPaymentIds));
        }
      }

      // 3. Delete check_payments and check_discounts
      if (checkIds.length > 0) {
        paymentsResult = await tx.delete(checkPayments).where(inArray(checkPayments.checkId, checkIds));
        discountsResult = await tx.delete(checkDiscounts).where(inArray(checkDiscounts.checkId, checkIds));
      }

      // 4. Delete check_items (after kds_ticket_items are gone)
      if (checkIds.length > 0) {
        itemsResult = await tx.delete(checkItems).where(inArray(checkItems.checkId, checkIds));
      }

      // 5. Delete rounds (after kds_tickets are gone)
      if (checkIds.length > 0) {
        roundsResult = await tx.delete(rounds).where(inArray(rounds.checkId, checkIds));
      }

      // 5b. Get affected loyalty member IDs BEFORE deleting transactions (for later reset)
      const affectedLoyaltyMembers = await tx.select({ memberId: loyaltyTransactions.memberId })
        .from(loyaltyTransactions)
        .where(eq(loyaltyTransactions.propertyId, propertyId));
      const affectedMemberIds = [...new Set(affectedLoyaltyMembers.map(m => m.memberId).filter(Boolean))] as string[];
      
      // 5c. Delete loyalty transactions and redemptions BEFORE checks (they reference checks)
      // Must delete by BOTH propertyId AND checkId since checkId is the FK constraint
      let loyaltyTransResult = { rowCount: 0 };
      if (checkIds.length > 0) {
        loyaltyTransResult = await tx.delete(loyaltyTransactions).where(inArray(loyaltyTransactions.checkId, checkIds));
      }
      // Also delete by propertyId to catch any orphaned transactions
      const additionalLoyaltyTrans = await tx.delete(loyaltyTransactions).where(eq(loyaltyTransactions.propertyId, propertyId));
      loyaltyTransResult = { rowCount: (loyaltyTransResult.rowCount || 0) + (additionalLoyaltyTrans.rowCount || 0) };
      
      const loyaltyRedemptionResult = await tx.delete(loyaltyRedemptions).where(eq(loyaltyRedemptions.propertyId, propertyId));

      // 5c. Delete gift card transactions BEFORE checks (they reference checks via checkId FK)
      // First get gift card IDs for this property
      const propertyGiftCards = await tx.select({ id: giftCards.id }).from(giftCards).where(eq(giftCards.propertyId, propertyId));
      const giftCardIds = propertyGiftCards.map(g => g.id);
      
      // Delete gift card transactions by propertyId and checkId to catch all
      let giftCardTransResult = { rowCount: 0 };
      if (checkIds.length > 0) {
        giftCardTransResult = await tx.delete(giftCardTransactions).where(inArray(giftCardTransactions.checkId, checkIds));
      }
      // Also delete by propertyId to catch any orphaned transactions
      const additionalGiftCardTrans = await tx.delete(giftCardTransactions).where(eq(giftCardTransactions.propertyId, propertyId));
      giftCardTransResult = { rowCount: (giftCardTransResult.rowCount || 0) + (additionalGiftCardTrans.rowCount || 0) };

      // 6. Delete print jobs, audit logs and checks
      console.log(`${logPrefix} Deleting print jobs, audit logs and checks (${allRvcIds.length} RVCs)`);
      
      // 6a. Delete check locks (they reference checks)
      let checkLocksResult = { rowCount: 0 };
      if (checkIds.length > 0) {
        checkLocksResult = await tx.delete(checkLocks).where(inArray(checkLocks.checkId, checkIds));
      }
      console.log(`${logPrefix} Check locks deleted: ${checkLocksResult.rowCount}`);
      
      // 6b. Delete print jobs (they reference checks)
      let printJobsResult = { rowCount: 0 };
      if (checkIds.length > 0) {
        printJobsResult = await tx.delete(printJobs).where(inArray(printJobs.checkId, checkIds));
      }
      // Also delete any print jobs by propertyId
      const additionalPrintJobs = await tx.delete(printJobs).where(eq(printJobs.propertyId, propertyId));
      printJobsResult = { rowCount: (printJobsResult.rowCount || 0) + (additionalPrintJobs.rowCount || 0) };
      console.log(`${logPrefix} Print jobs deleted: ${printJobsResult.rowCount}`);
      
      // 6c. Delete audit logs
      const auditResult = await tx.delete(auditLogs).where(inArray(auditLogs.rvcId, allRvcIds));
      console.log(`${logPrefix} Audit logs deleted: ${auditResult.rowCount}`);
      
      // 6d. Delete checks (including orphaned RVCs)
      const checksResult = await tx.delete(checks).where(inArray(checks.rvcId, allRvcIds));
      console.log(`${logPrefix} Checks deleted: ${checksResult.rowCount}`);

      // STEP 3: Delete labor/time & attendance data for this property
      // Delete in FK-safe order

      // 3a. Get tip pool run IDs for this property before deleting allocations
      const propertyTipPoolRuns = await tx.select({ id: tipPoolRuns.id }).from(tipPoolRuns).where(eq(tipPoolRuns.propertyId, propertyId));
      const tipPoolRunIds = propertyTipPoolRuns.map(r => r.id);

      // 3b. Delete tip allocations (references tipPoolRuns)
      let tipAllocationsResult = { rowCount: 0 };
      if (tipPoolRunIds.length > 0) {
        tipAllocationsResult = await tx.delete(tipAllocations).where(inArray(tipAllocations.tipPoolRunId, tipPoolRunIds));
      }

      // 3c. Delete tip pool runs
      const tipPoolRunsResult = await tx.delete(tipPoolRuns).where(eq(tipPoolRuns.propertyId, propertyId));

      // 3d. Get timecard IDs for this property
      const propertyTimecards = await tx.select({ id: timecards.id }).from(timecards).where(eq(timecards.propertyId, propertyId));
      const timecardIds = propertyTimecards.map(t => t.id);

      // 3e. Delete timecard exceptions (references timecards)
      let timecardExceptionsResult = { rowCount: 0 };
      if (timecardIds.length > 0) {
        timecardExceptionsResult = await tx.delete(timecardExceptions).where(inArray(timecardExceptions.timecardId, timecardIds));
      }
      // Also delete by propertyId to catch any orphaned exceptions
      const additionalExceptions = await tx.delete(timecardExceptions).where(eq(timecardExceptions.propertyId, propertyId));
      timecardExceptionsResult = { rowCount: (timecardExceptionsResult.rowCount || 0) + (additionalExceptions.rowCount || 0) };

      // 3f. Delete break_attestations (references timecards FK)
      const breakAttestationsResult = await tx.delete(breakAttestations).where(eq(breakAttestations.propertyId, propertyId));

      // 3f2. Delete break_violations (references break_sessions and timecards FK)
      const breakViolationsResult = await tx.delete(breakViolations).where(eq(breakViolations.propertyId, propertyId));

      // 3f3. Delete break sessions (references timePunches via startPunchId/endPunchId)
      const breakSessionsResult = await tx.delete(breakSessions).where(eq(breakSessions.propertyId, propertyId));

      // 3g. Delete timecard_edits (references property)
      await tx.delete(timecardEdits).where(eq(timecardEdits.propertyId, propertyId));

      // 3h. Delete timecards
      const timecardsResult = await tx.delete(timecards).where(eq(timecards.propertyId, propertyId));

      // 3i. Delete time punches
      const timePunchesResult = await tx.delete(timePunches).where(eq(timePunches.propertyId, propertyId));

      // 3i. Delete shifts (schedules)
      const shiftsResult = await tx.delete(shifts).where(eq(shifts.propertyId, propertyId));

      // STEP 4: Delete enterprise feature data for this property

      // 4a. Fiscal periods
      const fiscalResult = await tx.delete(fiscalPeriods).where(eq(fiscalPeriods.propertyId, propertyId));

      // 4b. Cash management - delete transactions and assignments first, then safe counts
      let cashTransResult = { rowCount: 0 };
      let drawerAssignResult = { rowCount: 0 };
      if (drawerIds.length > 0) {
        cashTransResult = await tx.delete(cashTransactions).where(inArray(cashTransactions.drawerId, drawerIds));
        drawerAssignResult = await tx.delete(drawerAssignments).where(inArray(drawerAssignments.drawerId, drawerIds));
      }
      const safeCountsResult = await tx.delete(safeCounts).where(eq(safeCounts.propertyId, propertyId));

      // 4c. Delete gift cards for this property (transactions already deleted above before checks)
      let giftCardsResult = { rowCount: 0 };
      if (giftCardIds.length > 0) {
        giftCardsResult = await tx.delete(giftCards).where(inArray(giftCards.id, giftCardIds));
      }

      // 4d. Reset loyalty member enrollments for all programs (full reset)
      // The member-program relationship is in loyaltyMemberEnrollments, not loyaltyMembers
      console.log(`${logPrefix} Fetching enterprise programs...`);
      const enterprisePrograms = await tx.select({ id: loyaltyPrograms.id }).from(loyaltyPrograms);
      const programIds = enterprisePrograms.map(p => p.id);
      console.log(`${logPrefix} Enterprise programs: ${programIds.length}`);
      
      let enrollmentsReset = { rowCount: 0 };
      if (programIds.length > 0) {
        console.log(`${logPrefix} Resetting all enrollments by programId...`);
        enrollmentsReset = await tx.update(loyaltyMemberEnrollments)
          .set({ currentPoints: 0, lifetimePoints: 0, visitCount: 0, lifetimeSpend: "0", currentTier: null })
          .where(inArray(loyaltyMemberEnrollments.programId, programIds));
        console.log(`${logPrefix} Enrollments reset: ${enrollmentsReset.rowCount}`);
      }

      // 4e. Online orders
      const onlineOrdersResult = await tx.delete(onlineOrders).where(eq(onlineOrders.propertyId, propertyId));

      // 4f. Inventory transactions and stock
      const invTransResult = await tx.delete(inventoryTransactions).where(eq(inventoryTransactions.propertyId, propertyId));
      const invStockResult = await tx.delete(inventoryStock).where(eq(inventoryStock.propertyId, propertyId));

      // 4g. Forecasts
      const salesForecastResult = await tx.delete(salesForecasts).where(eq(salesForecasts.propertyId, propertyId));
      const laborForecastResult = await tx.delete(laborForecasts).where(eq(laborForecasts.propertyId, propertyId));

      // 4h. Manager alerts
      const alertsResult = await tx.delete(managerAlerts).where(eq(managerAlerts.propertyId, propertyId));

      // 4i. Item availability and prep items
      const itemAvailResult = await tx.delete(itemAvailability).where(eq(itemAvailability.propertyId, propertyId));
      const prepResult = await tx.delete(prepItems).where(eq(prepItems.propertyId, propertyId));

      // 4j. Offline queue (by rvcId, including orphans)
      let offlineResult = { rowCount: 0 };
      if (allRvcIds.length > 0) {
        offlineResult = await tx.delete(offlineOrderQueue).where(inArray(offlineOrderQueue.rvcId, allRvcIds));
      }

      // 4k. Accounting exports
      const accountingResult = await tx.delete(accountingExports).where(eq(accountingExports.propertyId, propertyId));

      // 4l. Reset RVC counters so check numbers start from 1 (including orphans)
      if (allRvcIds.length > 0) {
        await tx.delete(rvcCounters).where(inArray(rvcCounters.rvcId, allRvcIds));
      }

      return {
        deleted: {
          checks: checksResult.rowCount || 0,
          checkItems: itemsResult.rowCount || 0,
          payments: paymentsResult.rowCount || 0,
          discounts: discountsResult.rowCount || 0,
          rounds: roundsResult.rowCount || 0,
          kdsTicketItems: kdsItemsResult.rowCount || 0,
          kdsTickets: kdsResult.rowCount || 0,
          terminalSessions: terminalSessionsResult.rowCount || 0,
          checkLocks: checkLocksResult.rowCount || 0,
          printJobs: printJobsResult.rowCount || 0,
          auditLogs: auditResult.rowCount || 0,
          timePunches: timePunchesResult.rowCount || 0,
          timecards: timecardsResult.rowCount || 0,
          breakSessions: breakSessionsResult.rowCount || 0,
          timecardExceptions: timecardExceptionsResult.rowCount || 0,
          shifts: shiftsResult.rowCount || 0,
          tipAllocations: tipAllocationsResult.rowCount || 0,
          tipPoolRuns: tipPoolRunsResult.rowCount || 0,
          fiscalPeriods: fiscalResult.rowCount || 0,
          cashTransactions: cashTransResult.rowCount || 0,
          drawerAssignments: drawerAssignResult.rowCount || 0,
          safeCounts: safeCountsResult.rowCount || 0,
          giftCardTransactions: giftCardTransResult.rowCount || 0,
          giftCards: giftCardsResult.rowCount || 0,
          loyaltyTransactions: loyaltyTransResult.rowCount || 0,
          loyaltyRedemptions: loyaltyRedemptionResult.rowCount || 0,
          loyaltyMembersReset: enrollmentsReset.rowCount || 0,
          onlineOrders: onlineOrdersResult.rowCount || 0,
          inventoryTransactions: invTransResult.rowCount || 0,
          inventoryStock: invStockResult.rowCount || 0,
          salesForecasts: salesForecastResult.rowCount || 0,
          laborForecasts: laborForecastResult.rowCount || 0,
          managerAlerts: alertsResult.rowCount || 0,
          itemAvailability: itemAvailResult.rowCount || 0,
          prepItems: prepResult.rowCount || 0,
          offlineQueue: offlineResult.rowCount || 0,
          accountingExports: accountingResult.rowCount || 0,
        }
      };
    });
  }

  // ============================================================================
  // DEVICE REGISTRY (CAL)
  // ============================================================================

  async getDevices(filters?: { enterpriseId?: string; propertyId?: string; deviceType?: string; status?: string }): Promise<Device[]> {
    let query = db.select().from(devices);
    const conditions = [];
    
    if (filters?.enterpriseId) {
      conditions.push(eq(devices.enterpriseId, filters.enterpriseId));
    }
    if (filters?.propertyId) {
      conditions.push(eq(devices.propertyId, filters.propertyId));
    }
    if (filters?.deviceType) {
      conditions.push(eq(devices.deviceType, filters.deviceType));
    }
    if (filters?.status) {
      conditions.push(eq(devices.status, filters.status));
    }
    
    if (conditions.length > 0) {
      return db.select().from(devices).where(and(...conditions)).orderBy(desc(devices.createdAt));
    }
    return db.select().from(devices).orderBy(desc(devices.createdAt));
  }

  async getDevice(id: string): Promise<Device | undefined> {
    const [result] = await db.select().from(devices).where(eq(devices.id, id));
    return result;
  }

  async getDeviceByDeviceId(deviceId: string): Promise<Device | undefined> {
    const [result] = await db.select().from(devices).where(eq(devices.deviceId, deviceId));
    return result;
  }

  async createDevice(data: InsertDevice): Promise<Device> {
    const [result] = await db.insert(devices).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined> {
    const [result] = await db.update(devices).set(sanitizeDates(data)).where(eq(devices.id, id)).returning();
    return result;
  }

  async deleteDevice(id: string): Promise<boolean> {
    const result = await db.delete(devices).where(eq(devices.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updateDeviceLastSeen(id: string): Promise<void> {
    await db.update(devices).set({ lastSeenAt: new Date(), status: "active" }).where(eq(devices.id, id));
  }

  // Device Enrollment Tokens
  async getDeviceEnrollmentTokens(enterpriseId?: string): Promise<DeviceEnrollmentToken[]> {
    if (enterpriseId) {
      return db.select().from(deviceEnrollmentTokens).where(eq(deviceEnrollmentTokens.enterpriseId, enterpriseId)).orderBy(desc(deviceEnrollmentTokens.createdAt));
    }
    return db.select().from(deviceEnrollmentTokens).orderBy(desc(deviceEnrollmentTokens.createdAt));
  }

  async getDeviceEnrollmentToken(id: string): Promise<DeviceEnrollmentToken | undefined> {
    const [result] = await db.select().from(deviceEnrollmentTokens).where(eq(deviceEnrollmentTokens.id, id));
    return result;
  }

  async getDeviceEnrollmentTokenByToken(token: string): Promise<DeviceEnrollmentToken | undefined> {
    const [result] = await db.select().from(deviceEnrollmentTokens).where(eq(deviceEnrollmentTokens.token, token));
    return result;
  }

  async createDeviceEnrollmentToken(data: InsertDeviceEnrollmentToken): Promise<DeviceEnrollmentToken> {
    const [result] = await db.insert(deviceEnrollmentTokens).values(sanitizeDates(data)).returning();
    return result;
  }

  async deleteDeviceEnrollmentToken(id: string): Promise<boolean> {
    const result = await db.delete(deviceEnrollmentTokens).where(eq(deviceEnrollmentTokens.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async useDeviceEnrollmentToken(token: string): Promise<DeviceEnrollmentToken | undefined> {
    const existing = await this.getDeviceEnrollmentTokenByToken(token);
    if (!existing || !existing.active) return undefined;
    
    // Check if expired
    if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
      return undefined;
    }
    
    // Check if max uses reached
    if (existing.maxUses && (existing.usedCount || 0) >= existing.maxUses) {
      return undefined;
    }
    
    // Increment used count
    const [result] = await db.update(deviceEnrollmentTokens)
      .set({ usedCount: (existing.usedCount || 0) + 1 })
      .where(eq(deviceEnrollmentTokens.id, existing.id))
      .returning();
    
    return result;
  }

  // Device Heartbeats
  async createDeviceHeartbeat(data: InsertDeviceHeartbeat): Promise<DeviceHeartbeat> {
    const [result] = await db.insert(deviceHeartbeats).values(sanitizeDates(data)).returning();
    // Also update the device's last seen timestamp
    await this.updateDeviceLastSeen(data.deviceId);
    return result;
  }

  async getDeviceHeartbeats(deviceId: string, limit: number = 100): Promise<DeviceHeartbeat[]> {
    return db.select().from(deviceHeartbeats)
      .where(eq(deviceHeartbeats.deviceId, deviceId))
      .orderBy(desc(deviceHeartbeats.timestamp))
      .limit(limit);
  }

  // Refunds
  async getRefunds(rvcId?: string): Promise<Refund[]> {
    if (rvcId) {
      return db.select().from(refunds).where(eq(refunds.rvcId, rvcId)).orderBy(desc(refunds.createdAt));
    }
    return db.select().from(refunds).orderBy(desc(refunds.createdAt));
  }

  async getRefundsForCheck(checkId: string): Promise<Refund[]> {
    return db.select().from(refunds).where(eq(refunds.originalCheckId, checkId)).orderBy(desc(refunds.createdAt));
  }

  async getRefund(id: string): Promise<Refund | undefined> {
    const [result] = await db.select().from(refunds).where(eq(refunds.id, id));
    return result;
  }

  async getRefundWithDetails(id: string): Promise<{ refund: Refund; items: RefundItem[]; payments: RefundPayment[] } | undefined> {
    const refund = await this.getRefund(id);
    if (!refund) return undefined;

    const items = await db.select().from(refundItems).where(eq(refundItems.refundId, id));
    const payments = await db.select().from(refundPayments).where(eq(refundPayments.refundId, id));

    return { refund, items, payments };
  }

  async createRefund(
    data: InsertRefund,
    items: Omit<InsertRefundItem, 'refundId'>[],
    payments: Omit<InsertRefundPayment, 'refundId'>[]
  ): Promise<Refund> {
    const [refund] = await db.insert(refunds).values(sanitizeDates(data)).returning();

    if (items.length > 0) {
      await db.insert(refundItems).values(
        items.map(item => ({ ...item, refundId: refund.id }))
      );
    }

    if (payments.length > 0) {
      await db.insert(refundPayments).values(
        payments.map(payment => ({ ...payment, refundId: refund.id }))
      );
    }

    return refund;
  }

  async getAllRefundItems(): Promise<RefundItem[]> {
    return db.select().from(refundItems);
  }

  async getNextRefundNumber(rvcId: string): Promise<number> {
    const result = await db.select({ maxNumber: sql<number>`COALESCE(MAX(${refunds.refundNumber}), 0)` })
      .from(refunds)
      .where(eq(refunds.rvcId, rvcId));
    return (result[0]?.maxNumber || 0) + 1;
  }

  async getClosedChecks(rvcId: string, options?: { businessDate?: string; checkNumber?: number; limit?: number }): Promise<Check[]> {
    const conditions = [
      eq(checks.rvcId, rvcId),
      eq(checks.status, "closed"),
      or(eq(checks.testMode, false), isNull(checks.testMode)),
    ];
    
    if (options?.businessDate) {
      conditions.push(eq(checks.businessDate, options.businessDate));
    }
    if (options?.checkNumber) {
      conditions.push(eq(checks.checkNumber, options.checkNumber));
    }

    let query = db.select().from(checks).where(and(...conditions)).orderBy(desc(checks.closedAt));
    
    if (options?.limit) {
      return query.limit(options.limit);
    }
    return query;
  }

  async getCheckWithPaymentsAndItems(checkId: string): Promise<{ check: Check; items: CheckItem[]; payments: CheckPayment[] } | undefined> {
    const [check] = await db.select().from(checks).where(eq(checks.id, checkId));
    if (!check) return undefined;

    const items = await db.select().from(checkItems).where(eq(checkItems.checkId, checkId));
    const payments = await db.select().from(checkPayments).where(eq(checkPayments.checkId, checkId));

    return { check, items, payments };
  }

  // ============================================================================
  // TIME & ATTENDANCE IMPLEMENTATIONS
  // ============================================================================

  // Job Codes
  async getJobCodes(propertyId?: string): Promise<JobCode[]> {
    if (propertyId) {
      return db.select().from(jobCodes).where(eq(jobCodes.propertyId, propertyId)).orderBy(jobCodes.displayOrder);
    }
    return db.select().from(jobCodes).orderBy(jobCodes.displayOrder);
  }

  async getJobCode(id: string): Promise<JobCode | undefined> {
    const [result] = await db.select().from(jobCodes).where(eq(jobCodes.id, id));
    return result;
  }

  async createJobCode(data: InsertJobCode): Promise<JobCode> {
    const [result] = await db.insert(jobCodes).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateJobCode(id: string, data: Partial<InsertJobCode>): Promise<JobCode | undefined> {
    const [result] = await db.update(jobCodes).set(sanitizeDates(data)).where(eq(jobCodes.id, id)).returning();
    return result;
  }

  async deleteJobCode(id: string): Promise<boolean> {
    const result = await db.delete(jobCodes).where(eq(jobCodes.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Employee Job Codes
  async getEmployeeJobCodes(employeeId: string): Promise<EmployeeJobCode[]> {
    return db.select().from(employeeJobCodes).where(eq(employeeJobCodes.employeeId, employeeId));
  }

  async getEmployeeJobCodesWithDetails(employeeId: string): Promise<(EmployeeJobCode & { jobCode: JobCode })[]> {
    const results = await db
      .select({
        id: employeeJobCodes.id,
        employeeId: employeeJobCodes.employeeId,
        jobCodeId: employeeJobCodes.jobCodeId,
        payRate: employeeJobCodes.payRate,
        isPrimary: employeeJobCodes.isPrimary,
        bypassClockIn: employeeJobCodes.bypassClockIn,
        jobCode: jobCodes,
      })
      .from(employeeJobCodes)
      .innerJoin(jobCodes, eq(employeeJobCodes.jobCodeId, jobCodes.id))
      .where(eq(employeeJobCodes.employeeId, employeeId));
    
    return results.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      jobCodeId: r.jobCodeId,
      payRate: r.payRate,
      isPrimary: r.isPrimary,
      bypassClockIn: r.bypassClockIn,
      jobCode: r.jobCode,
    }));
  }

  async getAllEmployeeJobCodesForProperty(propertyId: string): Promise<Record<string, (EmployeeJobCode & { jobCode: JobCode })[]>> {
    // First get all employee IDs that are assigned to this property (via employeeAssignments or direct propertyId)
    const assignedEmployeeIds = await db
      .select({ employeeId: employeeAssignments.employeeId })
      .from(employeeAssignments)
      .where(eq(employeeAssignments.propertyId, propertyId));
    
    const directEmployeeIds = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.propertyId, propertyId));
    
    const allEmployeeIds = new Set([
      ...assignedEmployeeIds.map(e => e.employeeId),
      ...directEmployeeIds.map(e => e.id)
    ]);
    
    if (allEmployeeIds.size === 0) return {};
    
    const results = await db
      .select({
        id: employeeJobCodes.id,
        employeeId: employeeJobCodes.employeeId,
        jobCodeId: employeeJobCodes.jobCodeId,
        payRate: employeeJobCodes.payRate,
        isPrimary: employeeJobCodes.isPrimary,
        bypassClockIn: employeeJobCodes.bypassClockIn,
        jobCode: jobCodes,
      })
      .from(employeeJobCodes)
      .innerJoin(jobCodes, eq(employeeJobCodes.jobCodeId, jobCodes.id))
      .where(inArray(employeeJobCodes.employeeId, Array.from(allEmployeeIds)));
    
    const grouped: Record<string, (EmployeeJobCode & { jobCode: JobCode })[]> = {};
    results.forEach(r => {
      if (!grouped[r.employeeId]) grouped[r.employeeId] = [];
      grouped[r.employeeId].push({
        id: r.id,
        employeeId: r.employeeId,
        jobCodeId: r.jobCodeId,
        payRate: r.payRate,
        isPrimary: r.isPrimary,
        bypassClockIn: r.bypassClockIn,
        jobCode: r.jobCode,
      });
    });
    return grouped;
  }

  async setEmployeeJobCodes(employeeId: string, assignments: { jobCodeId: string; payRate?: string; isPrimary?: boolean; bypassClockIn?: boolean }[]): Promise<EmployeeJobCode[]> {
    await db.delete(employeeJobCodes).where(eq(employeeJobCodes.employeeId, employeeId));
    if (assignments.length === 0) return [];
    
    // Fetch all job codes to validate bypassClockIn - only allowed for salaried jobs
    const allJobCodes = await db.select().from(jobCodes);
    const jobCodeMap = new Map(allJobCodes.map(jc => [jc.id, jc]));
    
    const values = assignments.map((assignment, index) => {
      const job = jobCodeMap.get(assignment.jobCodeId);
      // Backend guard: only allow bypassClockIn for salaried jobs
      const validBypassClockIn = job?.compensationType === "salaried" ? (assignment.bypassClockIn ?? false) : false;
      
      return {
        employeeId,
        jobCodeId: assignment.jobCodeId,
        payRate: assignment.payRate || null,
        isPrimary: assignment.isPrimary ?? (index === 0),
        bypassClockIn: validBypassClockIn,
      };
    });
    return db.insert(employeeJobCodes).values(values).returning();
  }

  // Pay Periods
  async getPayPeriods(propertyId: string): Promise<PayPeriod[]> {
    return db.select().from(payPeriods).where(eq(payPeriods.propertyId, propertyId)).orderBy(desc(payPeriods.startDate));
  }

  async getPayPeriod(id: string): Promise<PayPeriod | undefined> {
    const [result] = await db.select().from(payPeriods).where(eq(payPeriods.id, id));
    return result;
  }

  async getPayPeriodForDate(propertyId: string, date: string): Promise<PayPeriod | undefined> {
    const [result] = await db.select().from(payPeriods)
      .where(and(
        eq(payPeriods.propertyId, propertyId),
        lte(payPeriods.startDate, date),
        gte(payPeriods.endDate, date)
      ));
    return result;
  }

  async createPayPeriod(data: InsertPayPeriod): Promise<PayPeriod> {
    const [result] = await db.insert(payPeriods).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePayPeriod(id: string, data: Partial<InsertPayPeriod>): Promise<PayPeriod | undefined> {
    const [result] = await db.update(payPeriods).set(sanitizeDates(data)).where(eq(payPeriods.id, id)).returning();
    return result;
  }

  async lockPayPeriod(id: string, lockedById: string): Promise<PayPeriod | undefined> {
    const [result] = await db.update(payPeriods)
      .set({ status: "locked", lockedAt: new Date(), lockedById })
      .where(eq(payPeriods.id, id))
      .returning();
    return result;
  }

  async unlockPayPeriod(id: string, reason: string, unlockedById: string): Promise<PayPeriod | undefined> {
    const payPeriod = await this.getPayPeriod(id);
    if (!payPeriod) return undefined;
    
    // Create audit record for unlock
    await this.createTimecardEdit({
      propertyId: payPeriod.propertyId,
      targetType: "pay_period",
      targetId: id,
      editType: "unlock",
      beforeValue: { status: payPeriod.status },
      afterValue: { status: "open" },
      reasonCode: "manual_unlock",
      notes: reason,
      editedById: unlockedById,
    });

    const [result] = await db.update(payPeriods)
      .set({ status: "open", lockedAt: null, lockedById: null })
      .where(eq(payPeriods.id, id))
      .returning();
    return result;
  }

  // Time Punches
  async getTimePunches(filters: { propertyId?: string; employeeId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<TimePunch[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(timePunches.propertyId, filters.propertyId));
    if (filters.employeeId) conditions.push(eq(timePunches.employeeId, filters.employeeId));
    if (filters.businessDate) conditions.push(eq(timePunches.businessDate, filters.businessDate));
    if (filters.startDate) conditions.push(gte(timePunches.businessDate, filters.startDate));
    if (filters.endDate) conditions.push(lte(timePunches.businessDate, filters.endDate));
    conditions.push(eq(timePunches.voided, false));
    
    if (conditions.length === 0) {
      return db.select().from(timePunches).orderBy(desc(timePunches.actualTimestamp));
    }
    return db.select().from(timePunches).where(and(...conditions)).orderBy(desc(timePunches.actualTimestamp));
  }

  async getTimePunch(id: string): Promise<TimePunch | undefined> {
    const [result] = await db.select().from(timePunches).where(eq(timePunches.id, id));
    return result;
  }

  async getLastPunch(employeeId: string): Promise<TimePunch | undefined> {
    const [result] = await db.select().from(timePunches)
      .where(and(eq(timePunches.employeeId, employeeId), eq(timePunches.voided, false)))
      .orderBy(desc(timePunches.actualTimestamp))
      .limit(1);
    return result;
  }

  async getActiveTimePunches(propertyId: string): Promise<TimePunch[]> {
    // Get all punches for today from the property
    const today = new Date().toISOString().split('T')[0];
    const allPunches = await db.select().from(timePunches)
      .where(and(
        eq(timePunches.propertyId, propertyId),
        eq(timePunches.voided, false),
        eq(timePunches.businessDate, today)
      ))
      .orderBy(desc(timePunches.actualTimestamp));
    
    // Group by employee and find those currently clocked in
    const employeePunches: Record<string, TimePunch[]> = {};
    for (const punch of allPunches) {
      if (!employeePunches[punch.employeeId]) {
        employeePunches[punch.employeeId] = [];
      }
      employeePunches[punch.employeeId].push(punch);
    }
    
    // Return clock_in punches for employees who are currently clocked in
    const activeClockIns: TimePunch[] = [];
    for (const [employeeId, punches] of Object.entries(employeePunches)) {
      const sorted = [...punches].sort((a, b) => 
        new Date(b.actualTimestamp).getTime() - new Date(a.actualTimestamp).getTime()
      );
      const mostRecent = sorted[0];
      // If most recent is clock_in, they're still clocked in - return that punch
      if (mostRecent && mostRecent.punchType === "clock_in") {
        activeClockIns.push(mostRecent);
      }
    }
    
    return activeClockIns;
  }

  async createTimePunch(data: InsertTimePunch): Promise<TimePunch> {
    const [result] = await db.insert(timePunches).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTimePunch(
    id: string, 
    data: Partial<InsertTimePunch>, 
    editedById?: string, 
    editReason?: string,
    editedByEmcUserId?: string,
    editedByDisplayName?: string
  ): Promise<TimePunch | undefined> {
    const existing = await this.getTimePunch(id);
    if (!existing) return undefined;

    const updateData: any = { ...data };
    // Record edit if we have any editor identifier
    if (editedById || editedByEmcUserId) {
      updateData.isEdited = true;
      updateData.editedAt = new Date();
      updateData.editReason = editReason;
      // Only set editedById if it's an employee ID (FK to employees table)
      // For EMC user edits, leave editedById null but record in audit trail
      if (editedById) {
        updateData.editedById = editedById;
      }
      if (!existing.originalTimestamp) {
        updateData.originalTimestamp = existing.actualTimestamp;
      }
      
      // Create audit record with support for both employee and EMC user
      await this.createTimecardEdit({
        propertyId: existing.propertyId,
        targetType: "time_punch",
        targetId: id,
        editType: "update",
        beforeValue: existing,
        afterValue: { ...existing, ...updateData },
        reasonCode: editReason || "manual_edit",
        notes: editReason,
        editedById: editedById || null,
        editedByEmcUserId: editedByEmcUserId || null,
        editedByDisplayName: editedByDisplayName || null,
      });
    }

    const [result] = await db.update(timePunches).set(sanitizeDates(updateData)).where(eq(timePunches.id, id)).returning();
    return result;
  }

  async voidTimePunch(id: string, voidedById: string, voidReason: string): Promise<TimePunch | undefined> {
    const existing = await this.getTimePunch(id);
    if (!existing) return undefined;

    await this.createTimecardEdit({
      propertyId: existing.propertyId,
      targetType: "time_punch",
      targetId: id,
      editType: "void",
      beforeValue: existing,
      afterValue: { ...existing, voided: true },
      reasonCode: "void",
      notes: voidReason,
      editedById: voidedById,
    });

    const [result] = await db.update(timePunches)
      .set({ voided: true, voidedById, voidedAt: new Date(), voidReason })
      .where(eq(timePunches.id, id))
      .returning();
    return result;
  }

  // Break Sessions
  async getBreakSessions(filters: { propertyId?: string; employeeId?: string; businessDate?: string }): Promise<BreakSession[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(breakSessions.propertyId, filters.propertyId));
    if (filters.employeeId) conditions.push(eq(breakSessions.employeeId, filters.employeeId));
    if (filters.businessDate) conditions.push(eq(breakSessions.businessDate, filters.businessDate));
    
    if (conditions.length === 0) {
      return db.select().from(breakSessions).orderBy(desc(breakSessions.startTime));
    }
    return db.select().from(breakSessions).where(and(...conditions)).orderBy(desc(breakSessions.startTime));
  }

  async getBreakSession(id: string): Promise<BreakSession | undefined> {
    const [result] = await db.select().from(breakSessions).where(eq(breakSessions.id, id));
    return result;
  }

  async getActiveBreak(employeeId: string): Promise<BreakSession | undefined> {
    const [result] = await db.select().from(breakSessions)
      .where(and(eq(breakSessions.employeeId, employeeId), sql`${breakSessions.endTime} IS NULL`))
      .orderBy(desc(breakSessions.startTime))
      .limit(1);
    return result;
  }

  async createBreakSession(data: InsertBreakSession): Promise<BreakSession> {
    const [result] = await db.insert(breakSessions).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateBreakSession(id: string, data: Partial<InsertBreakSession>): Promise<BreakSession | undefined> {
    const [result] = await db.update(breakSessions).set(sanitizeDates(data)).where(eq(breakSessions.id, id)).returning();
    return result;
  }

  // Timecards
  async getTimecards(filters: { propertyId?: string; employeeId?: string; payPeriodId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<Timecard[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(timecards.propertyId, filters.propertyId));
    if (filters.employeeId) conditions.push(eq(timecards.employeeId, filters.employeeId));
    if (filters.payPeriodId) conditions.push(eq(timecards.payPeriodId, filters.payPeriodId));
    if (filters.businessDate) conditions.push(eq(timecards.businessDate, filters.businessDate));
    if (filters.startDate) conditions.push(gte(timecards.businessDate, filters.startDate));
    if (filters.endDate) conditions.push(lte(timecards.businessDate, filters.endDate));
    
    if (conditions.length === 0) {
      return db.select().from(timecards).orderBy(desc(timecards.businessDate));
    }
    return db.select().from(timecards).where(and(...conditions)).orderBy(desc(timecards.businessDate));
  }

  async getTimecard(id: string): Promise<Timecard | undefined> {
    const [result] = await db.select().from(timecards).where(eq(timecards.id, id));
    return result;
  }

  async createTimecard(data: InsertTimecard): Promise<Timecard> {
    const [result] = await db.insert(timecards).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTimecard(id: string, data: Partial<InsertTimecard>): Promise<Timecard | undefined> {
    const [result] = await db.update(timecards).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(timecards.id, id)).returning();
    return result;
  }

  async recalculateTimecard(employeeId: string, businessDate: string): Promise<Timecard | undefined> {
    // Get all punches for this employee on this date
    const punches = await this.getTimePunches({ employeeId, businessDate });
    const breaks = await this.getBreakSessions({ employeeId, businessDate });

    // Calculate hours from clock in/out pairs
    const clockIns = punches.filter(p => p.punchType === "clock_in");
    const clockOuts = punches.filter(p => p.punchType === "clock_out");
    
    let totalMinutes = 0;
    let clockInTime: Date | null = null;
    let clockOutTime: Date | null = null;
    let jobCodeId: string | null = null;

    for (const clockIn of clockIns) {
      const matchingOut = clockOuts.find(o => new Date(o.actualTimestamp) > new Date(clockIn.actualTimestamp));
      
      // Always capture the earliest clock in time and job code, regardless of whether clocked out
      if (!clockInTime || new Date(clockIn.actualTimestamp) < clockInTime) {
        clockInTime = new Date(clockIn.actualTimestamp);
        jobCodeId = clockIn.jobCodeId || null;
      }
      
      if (matchingOut) {
        const duration = (new Date(matchingOut.actualTimestamp).getTime() - new Date(clockIn.actualTimestamp).getTime()) / 60000;
        totalMinutes += duration;
        if (!clockOutTime || new Date(matchingOut.actualTimestamp) > clockOutTime) {
          clockOutTime = new Date(matchingOut.actualTimestamp);
        }
      }
    }

    // Calculate break minutes
    let paidBreakMinutes = 0;
    let unpaidBreakMinutes = 0;
    for (const brk of breaks) {
      if (brk.actualMinutes) {
        if (brk.isPaid) {
          paidBreakMinutes += brk.actualMinutes;
        } else {
          unpaidBreakMinutes += brk.actualMinutes;
        }
      }
    }

    // Subtract unpaid breaks from total
    const workedMinutes = totalMinutes - unpaidBreakMinutes;
    const totalHoursWorked = workedMinutes / 60;

    // Get property from employee or from the punch records for OT rule lookup
    const employee = await this.getEmployee(employeeId);
    // Try to get propertyId from employee, or fall back to the first punch's propertyId
    const propertyId = employee?.propertyId || (punches.length > 0 ? punches[0].propertyId : null);
    if (!propertyId) return undefined;
    
    // Get active overtime rule for this property
    const otRule = await this.getActiveOvertimeRule(propertyId);
    
    // Apply OT rules - default to 8 hours regular if no rule configured
    const dailyRegular = otRule?.dailyOvertimeThreshold ? parseFloat(otRule.dailyOvertimeThreshold) : 8;
    const dailyDoubleThreshold = otRule?.dailyDoubleTimeThreshold ? parseFloat(otRule.dailyDoubleTimeThreshold) : null;
    const enableDailyOT = otRule?.enableDailyOvertime !== false;
    const enableDailyDT = otRule?.enableDailyDoubleTime === true && dailyDoubleThreshold !== null;
    
    let regularHours = totalHoursWorked;
    let overtimeHours = 0;
    let doubleTimeHours = 0;
    
    if (enableDailyOT) {
      if (enableDailyDT && dailyDoubleThreshold !== null) {
        // California-style: Regular up to 8, OT from 8-12, DT over 12
        if (totalHoursWorked > dailyDoubleThreshold) {
          regularHours = dailyRegular;
          overtimeHours = dailyDoubleThreshold - dailyRegular;
          doubleTimeHours = totalHoursWorked - dailyDoubleThreshold;
        } else if (totalHoursWorked > dailyRegular) {
          regularHours = dailyRegular;
          overtimeHours = totalHoursWorked - dailyRegular;
          doubleTimeHours = 0;
        } else {
          regularHours = totalHoursWorked;
          overtimeHours = 0;
          doubleTimeHours = 0;
        }
      } else {
        // Standard: Regular up to threshold, OT after
        regularHours = Math.min(totalHoursWorked, dailyRegular);
        overtimeHours = Math.max(0, totalHoursWorked - dailyRegular);
        doubleTimeHours = 0;
      }
    }

    // Look up employee's pay rate for this job
    let payRate: string | null = null;
    if (jobCodeId) {
      const jobAssignment = await db.select().from(employeeJobCodes)
        .where(and(eq(employeeJobCodes.employeeId, employeeId), eq(employeeJobCodes.jobCodeId, jobCodeId)))
        .limit(1);
      if (jobAssignment.length > 0 && jobAssignment[0].payRate) {
        payRate = jobAssignment[0].payRate;
      } else {
        // Fall back to job's default hourly rate
        const job = await db.select().from(jobCodes).where(eq(jobCodes.id, jobCodeId)).limit(1);
        if (job.length > 0 && job[0].hourlyRate) {
          payRate = job[0].hourlyRate;
        }
      }
    }

    // Get or create timecard
    const existing = await db.select().from(timecards)
      .where(and(eq(timecards.employeeId, employeeId), eq(timecards.businessDate, businessDate)))
      .limit(1);

    const timecardData: any = {
      regularHours: regularHours.toFixed(2),
      overtimeHours: overtimeHours.toFixed(2),
      doubleTimeHours: doubleTimeHours.toFixed(2),
      totalHours: totalHoursWorked.toFixed(2),
      breakMinutes: paidBreakMinutes + unpaidBreakMinutes,
      paidBreakMinutes,
      unpaidBreakMinutes,
      clockInTime,
      clockOutTime,
      updatedAt: new Date(),
    };
    
    if (jobCodeId) {
      timecardData.jobCodeId = jobCodeId;
    }
    if (payRate) {
      timecardData.payRate = payRate;
    }

    if (existing.length > 0) {
      return this.updateTimecard(existing[0].id, timecardData);
    } else {
      return this.createTimecard({
        propertyId,
        employeeId,
        businessDate,
        ...timecardData,
      });
    }
  }

  // Timecard Exceptions
  async getTimecardExceptions(filters: { propertyId?: string; employeeId?: string; status?: string }): Promise<TimecardException[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(timecardExceptions.propertyId, filters.propertyId));
    if (filters.employeeId) conditions.push(eq(timecardExceptions.employeeId, filters.employeeId));
    if (filters.status) conditions.push(eq(timecardExceptions.status, filters.status));
    
    if (conditions.length === 0) {
      return db.select().from(timecardExceptions).orderBy(desc(timecardExceptions.createdAt));
    }
    return db.select().from(timecardExceptions).where(and(...conditions)).orderBy(desc(timecardExceptions.createdAt));
  }

  async getTimecardException(id: string): Promise<TimecardException | undefined> {
    const [result] = await db.select().from(timecardExceptions).where(eq(timecardExceptions.id, id));
    return result;
  }

  async createTimecardException(data: InsertTimecardException): Promise<TimecardException> {
    const [result] = await db.insert(timecardExceptions).values(sanitizeDates(data)).returning();
    return result;
  }

  async resolveTimecardException(id: string, resolvedById: string, resolutionNotes: string): Promise<TimecardException | undefined> {
    const [result] = await db.update(timecardExceptions)
      .set({ status: "resolved", resolvedById, resolvedAt: new Date(), resolutionNotes })
      .where(eq(timecardExceptions.id, id))
      .returning();
    return result;
  }

  // Timecard Edits (Audit Log)
  async getTimecardEdits(filters: { propertyId?: string; targetType?: string; targetId?: string }): Promise<TimecardEdit[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(timecardEdits.propertyId, filters.propertyId));
    if (filters.targetType) conditions.push(eq(timecardEdits.targetType, filters.targetType));
    if (filters.targetId) conditions.push(eq(timecardEdits.targetId, filters.targetId));
    
    if (conditions.length === 0) {
      return db.select().from(timecardEdits).orderBy(desc(timecardEdits.createdAt));
    }
    return db.select().from(timecardEdits).where(and(...conditions)).orderBy(desc(timecardEdits.createdAt));
  }

  async createTimecardEdit(data: InsertTimecardEdit): Promise<TimecardEdit> {
    const [result] = await db.insert(timecardEdits).values(sanitizeDates(data)).returning();
    return result;
  }

  // ============================================================================
  // SCHEDULING IMPLEMENTATIONS
  // ============================================================================

  // Employee Availability
  async getEmployeeAvailability(employeeId: string): Promise<EmployeeAvailability[]> {
    return db.select().from(employeeAvailability).where(eq(employeeAvailability.employeeId, employeeId));
  }

  async setEmployeeAvailability(employeeId: string, availability: InsertEmployeeAvailability[]): Promise<EmployeeAvailability[]> {
    await db.delete(employeeAvailability).where(eq(employeeAvailability.employeeId, employeeId));
    if (availability.length === 0) return [];
    return db.insert(employeeAvailability).values(availability).returning();
  }

  // Availability Exceptions
  async getAvailabilityExceptions(employeeId: string, startDate?: string, endDate?: string): Promise<AvailabilityException[]> {
    const conditions = [eq(availabilityExceptions.employeeId, employeeId)];
    if (startDate) conditions.push(gte(availabilityExceptions.exceptionDate, startDate));
    if (endDate) conditions.push(lte(availabilityExceptions.exceptionDate, endDate));
    return db.select().from(availabilityExceptions).where(and(...conditions));
  }

  async createAvailabilityException(data: InsertAvailabilityException): Promise<AvailabilityException> {
    const [result] = await db.insert(availabilityExceptions).values(sanitizeDates(data)).returning();
    return result;
  }

  async deleteAvailabilityException(id: string): Promise<boolean> {
    const result = await db.delete(availabilityExceptions).where(eq(availabilityExceptions.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Time Off Requests
  async getTimeOffRequests(filters: { employeeId?: string; propertyId?: string; status?: string }): Promise<TimeOffRequest[]> {
    const conditions: any[] = [];
    if (filters.employeeId) conditions.push(eq(timeOffRequests.employeeId, filters.employeeId));
    if (filters.propertyId) conditions.push(eq(timeOffRequests.propertyId, filters.propertyId));
    if (filters.status) conditions.push(eq(timeOffRequests.status, filters.status));
    
    if (conditions.length === 0) {
      return db.select().from(timeOffRequests).orderBy(desc(timeOffRequests.createdAt));
    }
    return db.select().from(timeOffRequests).where(and(...conditions)).orderBy(desc(timeOffRequests.createdAt));
  }

  async getTimeOffRequest(id: string): Promise<TimeOffRequest | undefined> {
    const [result] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, id));
    return result;
  }

  async createTimeOffRequest(data: InsertTimeOffRequest): Promise<TimeOffRequest> {
    const [result] = await db.insert(timeOffRequests).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTimeOffRequest(id: string, data: Partial<InsertTimeOffRequest>): Promise<TimeOffRequest | undefined> {
    const [result] = await db.update(timeOffRequests).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(timeOffRequests.id, id)).returning();
    return result;
  }

  async reviewTimeOffRequest(id: string, reviewedById: string, approved: boolean, notes?: string): Promise<TimeOffRequest | undefined> {
    const [result] = await db.update(timeOffRequests)
      .set({ 
        status: approved ? "approved" : "denied", 
        reviewedById, 
        reviewedAt: new Date(), 
        reviewNotes: notes,
        updatedAt: new Date()
      })
      .where(eq(timeOffRequests.id, id))
      .returning();
    return result;
  }

  // Shift Templates
  async getShiftTemplates(propertyId: string): Promise<ShiftTemplate[]> {
    return db.select().from(shiftTemplates).where(eq(shiftTemplates.propertyId, propertyId));
  }

  async getShiftTemplate(id: string): Promise<ShiftTemplate | undefined> {
    const [result] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, id));
    return result;
  }

  async createShiftTemplate(data: InsertShiftTemplate): Promise<ShiftTemplate> {
    const [result] = await db.insert(shiftTemplates).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateShiftTemplate(id: string, data: Partial<InsertShiftTemplate>): Promise<ShiftTemplate | undefined> {
    const [result] = await db.update(shiftTemplates).set(sanitizeDates(data)).where(eq(shiftTemplates.id, id)).returning();
    return result;
  }

  async deleteShiftTemplate(id: string): Promise<boolean> {
    const result = await db.delete(shiftTemplates).where(eq(shiftTemplates.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Shifts
  async getShifts(filters: { propertyId?: string; rvcId?: string; employeeId?: string; startDate?: string; endDate?: string; status?: string }): Promise<Shift[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(shifts.propertyId, filters.propertyId));
    if (filters.rvcId) conditions.push(eq(shifts.rvcId, filters.rvcId));
    if (filters.employeeId) conditions.push(eq(shifts.employeeId, filters.employeeId));
    if (filters.startDate) conditions.push(gte(shifts.shiftDate, filters.startDate));
    if (filters.endDate) conditions.push(lte(shifts.shiftDate, filters.endDate));
    if (filters.status) conditions.push(eq(shifts.status, filters.status));
    
    if (conditions.length === 0) {
      return db.select().from(shifts).orderBy(shifts.shiftDate, shifts.startTime);
    }
    return db.select().from(shifts).where(and(...conditions)).orderBy(shifts.shiftDate, shifts.startTime);
  }

  async getShift(id: string): Promise<Shift | undefined> {
    const [result] = await db.select().from(shifts).where(eq(shifts.id, id));
    return result;
  }

  async createShift(data: InsertShift): Promise<Shift> {
    const [result] = await db.insert(shifts).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined> {
    const [result] = await db.update(shifts).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(shifts.id, id)).returning();
    return result;
  }

  async deleteShift(id: string): Promise<boolean> {
    const result = await db.delete(shifts).where(eq(shifts.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async publishShifts(shiftIds: string[], publishedById: string | null): Promise<Shift[]> {
    const now = new Date();
    const updateData: Record<string, unknown> = { 
      status: "published", 
      publishedAt: now, 
      updatedAt: now 
    };
    if (publishedById) {
      updateData.publishedById = publishedById;
    }
    return db.update(shifts)
      .set(sanitizeDates(updateData))
      .where(inArray(shifts.id, shiftIds))
      .returning();
  }

  async copyWeekSchedule(propertyId: string, sourceWeekStart: string, targetWeekStart: string): Promise<Shift[]> {
    // Get all shifts from source week
    const sourceEnd = new Date(sourceWeekStart);
    sourceEnd.setDate(sourceEnd.getDate() + 6);
    
    const sourceShifts = await this.getShifts({ 
      propertyId, 
      startDate: sourceWeekStart, 
      endDate: sourceEnd.toISOString().split('T')[0] 
    });

    const dayDiff = Math.round((new Date(targetWeekStart).getTime() - new Date(sourceWeekStart).getTime()) / (1000 * 60 * 60 * 24));
    
    const newShifts: Shift[] = [];
    for (const shift of sourceShifts) {
      const newDate = new Date(shift.shiftDate);
      newDate.setDate(newDate.getDate() + dayDiff);
      
      const newShift = await this.createShift({
        propertyId: shift.propertyId,
        rvcId: shift.rvcId,
        employeeId: shift.employeeId,
        jobCodeId: shift.jobCodeId,
        templateId: shift.templateId,
        shiftDate: newDate.toISOString().split('T')[0],
        startTime: shift.startTime,
        endTime: shift.endTime,
        scheduledBreakMinutes: shift.scheduledBreakMinutes,
        status: "draft",
        notes: shift.notes,
      });
      newShifts.push(newShift);
    }

    return newShifts;
  }

  // Shift Cover Requests
  async getShiftCoverRequests(filters: { shiftId?: string; requesterId?: string; status?: string }): Promise<ShiftCoverRequest[]> {
    const conditions: any[] = [];
    if (filters.shiftId) conditions.push(eq(shiftCoverRequests.shiftId, filters.shiftId));
    if (filters.requesterId) conditions.push(eq(shiftCoverRequests.requesterId, filters.requesterId));
    if (filters.status) conditions.push(eq(shiftCoverRequests.status, filters.status));
    
    if (conditions.length === 0) {
      return db.select().from(shiftCoverRequests).orderBy(desc(shiftCoverRequests.createdAt));
    }
    return db.select().from(shiftCoverRequests).where(and(...conditions)).orderBy(desc(shiftCoverRequests.createdAt));
  }

  async getShiftCoverRequest(id: string): Promise<ShiftCoverRequest | undefined> {
    const [result] = await db.select().from(shiftCoverRequests).where(eq(shiftCoverRequests.id, id));
    return result;
  }

  async createShiftCoverRequest(data: InsertShiftCoverRequest): Promise<ShiftCoverRequest> {
    const [result] = await db.insert(shiftCoverRequests).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateShiftCoverRequest(id: string, data: Partial<InsertShiftCoverRequest>): Promise<ShiftCoverRequest | undefined> {
    const [result] = await db.update(shiftCoverRequests).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(shiftCoverRequests.id, id)).returning();
    return result;
  }

  // Shift Cover Offers
  async getShiftCoverOffers(coverRequestId: string): Promise<ShiftCoverOffer[]> {
    return db.select().from(shiftCoverOffers).where(eq(shiftCoverOffers.coverRequestId, coverRequestId));
  }

  async createShiftCoverOffer(data: InsertShiftCoverOffer): Promise<ShiftCoverOffer> {
    const [result] = await db.insert(shiftCoverOffers).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateShiftCoverOffer(id: string, data: Partial<InsertShiftCoverOffer>): Promise<ShiftCoverOffer | undefined> {
    const [result] = await db.update(shiftCoverOffers).set(sanitizeDates(data)).where(eq(shiftCoverOffers.id, id)).returning();
    return result;
  }

  // Shift Cover Approvals
  async approveShiftCover(coverRequestId: string, offerId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval> {
    // Update the offer status
    await this.updateShiftCoverOffer(offerId, { status: "approved" });
    
    // Update the cover request status
    await this.updateShiftCoverRequest(coverRequestId, { status: "approved" });
    
    // Get offer details and update the shift assignment
    const [offer] = await db.select().from(shiftCoverOffers).where(eq(shiftCoverOffers.id, offerId));
    const [request] = await db.select().from(shiftCoverRequests).where(eq(shiftCoverRequests.id, coverRequestId));
    
    if (offer && request) {
      await this.updateShift(request.shiftId, { employeeId: offer.offererId });
    }
    
    const [result] = await db.insert(shiftCoverApprovals).values({
      coverRequestId,
      offerId,
      approvedById,
      approved: true,
      notes,
    }).returning();
    
    return result;
  }

  async denyShiftCover(coverRequestId: string, approvedById: string, notes?: string): Promise<ShiftCoverApproval> {
    await this.updateShiftCoverRequest(coverRequestId, { status: "denied" });
    
    const [result] = await db.insert(shiftCoverApprovals).values({
      coverRequestId,
      approvedById,
      approved: false,
      notes,
    }).returning();
    
    return result;
  }

  // ============================================================================
  // TIP POOLING IMPLEMENTATIONS
  // ============================================================================

  // Tip Pool Policies
  async getTipPoolPolicies(propertyId: string): Promise<TipPoolPolicy[]> {
    return db.select().from(tipPoolPolicies).where(eq(tipPoolPolicies.propertyId, propertyId));
  }

  async getTipPoolPolicy(id: string): Promise<TipPoolPolicy | undefined> {
    const [result] = await db.select().from(tipPoolPolicies).where(eq(tipPoolPolicies.id, id));
    return result;
  }

  async createTipPoolPolicy(data: InsertTipPoolPolicy): Promise<TipPoolPolicy> {
    const [result] = await db.insert(tipPoolPolicies).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTipPoolPolicy(id: string, data: Partial<InsertTipPoolPolicy>): Promise<TipPoolPolicy | undefined> {
    const [result] = await db.update(tipPoolPolicies).set(sanitizeDates(data)).where(eq(tipPoolPolicies.id, id)).returning();
    return result;
  }

  async deleteTipPoolPolicy(id: string): Promise<boolean> {
    const result = await db.delete(tipPoolPolicies).where(eq(tipPoolPolicies.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Tip Pool Runs
  async getTipPoolRuns(filters: { propertyId?: string; businessDate?: string }): Promise<TipPoolRun[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(tipPoolRuns.propertyId, filters.propertyId));
    if (filters.businessDate) conditions.push(eq(tipPoolRuns.businessDate, filters.businessDate));
    
    if (conditions.length === 0) {
      return db.select().from(tipPoolRuns).orderBy(desc(tipPoolRuns.businessDate));
    }
    return db.select().from(tipPoolRuns).where(and(...conditions)).orderBy(desc(tipPoolRuns.businessDate));
  }

  async getTipPoolRun(id: string): Promise<TipPoolRun | undefined> {
    const [result] = await db.select().from(tipPoolRuns).where(eq(tipPoolRuns.id, id));
    return result;
  }

  async createTipPoolRun(data: InsertTipPoolRun): Promise<TipPoolRun> {
    const [result] = await db.insert(tipPoolRuns).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTipPoolRun(id: string, data: Partial<InsertTipPoolRun>): Promise<TipPoolRun | undefined> {
    const [result] = await db.update(tipPoolRuns).set(sanitizeDates(data)).where(eq(tipPoolRuns.id, id)).returning();
    return result;
  }

  // Tip Allocations
  async getTipAllocations(tipPoolRunId: string): Promise<TipAllocation[]> {
    return db.select().from(tipAllocations).where(eq(tipAllocations.tipPoolRunId, tipPoolRunId));
  }

  async createTipAllocation(data: InsertTipAllocation): Promise<TipAllocation> {
    const [result] = await db.insert(tipAllocations).values(sanitizeDates(data)).returning();
    return result;
  }

  async runTipPoolSettlement(propertyId: string, businessDate: string, policyId: string, runById: string): Promise<{ run: TipPoolRun; allocations: TipAllocation[] }> {
    // Get policy
    const policy = await this.getTipPoolPolicy(policyId);
    if (!policy) throw new Error("Tip pool policy not found");

    // Get all tips for the day from closed checks
    const closedChecks = await db.select().from(checks)
      .where(and(
        eq(checks.businessDate, businessDate),
        eq(checks.status, "closed")
      ));
    
    let totalTips = 0;
    for (const check of closedChecks) {
      const payments = await this.getPayments(check.id);
      for (const payment of payments) {
        totalTips += parseFloat(payment.tipAmount || "0");
      }
    }

    // Get timecards for eligible employees
    const dayTimecards = await this.getTimecards({ propertyId, businessDate });
    
    // Filter by excluded job codes and calculate hours
    const excludedJobCodes = policy.excludedJobCodeIds || [];
    const eligibleTimecards = dayTimecards.filter(tc => 
      !tc.jobCodeId || !excludedJobCodes.includes(tc.jobCodeId)
    );

    let totalHours = 0;
    for (const tc of eligibleTimecards) {
      totalHours += parseFloat(tc.totalHours || "0");
    }

    // Create the run
    const run = await this.createTipPoolRun({
      propertyId,
      policyId,
      businessDate,
      totalTips: totalTips.toFixed(2),
      totalHours: totalHours.toFixed(2),
      participantCount: eligibleTimecards.length,
      status: "completed",
      runById,
      runAt: new Date(),
    });

    // Calculate allocations based on calculation method
    const allocations: TipAllocation[] = [];
    
    if (policy.calculationMethod === "hours_worked" && totalHours > 0) {
      for (const tc of eligibleTimecards) {
        const hours = parseFloat(tc.totalHours || "0");
        const sharePercentage = (hours / totalHours) * 100;
        const allocatedAmount = (hours / totalHours) * totalTips;

        const allocation = await this.createTipAllocation({
          tipPoolRunId: run.id,
          employeeId: tc.employeeId,
          hoursWorked: hours.toFixed(2),
          sharePercentage: sharePercentage.toFixed(2),
          allocatedAmount: allocatedAmount.toFixed(2),
          totalTips: allocatedAmount.toFixed(2),
        });
        allocations.push(allocation);
      }
    } else if (policy.calculationMethod === "equal" && eligibleTimecards.length > 0) {
      const equalShare = totalTips / eligibleTimecards.length;
      const sharePercentage = 100 / eligibleTimecards.length;

      for (const tc of eligibleTimecards) {
        const allocation = await this.createTipAllocation({
          tipPoolRunId: run.id,
          employeeId: tc.employeeId,
          hoursWorked: tc.totalHours || "0",
          sharePercentage: sharePercentage.toFixed(2),
          allocatedAmount: equalShare.toFixed(2),
          totalTips: equalShare.toFixed(2),
        });
        allocations.push(allocation);
      }
    }

    return { run, allocations };
  }

  // ============================================================================
  // TIP RULES IMPLEMENTATIONS (Square-style tip configuration)
  // ============================================================================

  async getTipRules(filters: { enterpriseId?: string; propertyId?: string; rvcId?: string }): Promise<TipRule[]> {
    const conditions: any[] = [];
    if (filters.enterpriseId) conditions.push(eq(tipRules.enterpriseId, filters.enterpriseId));
    if (filters.propertyId) conditions.push(eq(tipRules.propertyId, filters.propertyId));
    if (filters.rvcId) conditions.push(eq(tipRules.rvcId, filters.rvcId));
    
    if (conditions.length === 0) {
      return db.select().from(tipRules).orderBy(desc(tipRules.createdAt));
    }
    return db.select().from(tipRules).where(and(...conditions)).orderBy(desc(tipRules.createdAt));
  }

  async getTipRule(id: string): Promise<TipRule | undefined> {
    const [result] = await db.select().from(tipRules).where(eq(tipRules.id, id));
    return result;
  }

  async getTipRuleForProperty(propertyId: string): Promise<TipRule | undefined> {
    // First check for property-specific rule
    const [propertyRule] = await db.select().from(tipRules).where(
      and(eq(tipRules.propertyId, propertyId), eq(tipRules.active, true))
    );
    if (propertyRule) return propertyRule;

    // Fall back to enterprise-wide rule if property doesn't have one
    const property = await this.getProperty(propertyId);
    if (property?.enterpriseId) {
      const [enterpriseRule] = await db.select().from(tipRules).where(
        and(
          eq(tipRules.enterpriseId, property.enterpriseId),
          eq(tipRules.appliesToAllLocations, true),
          eq(tipRules.active, true)
        )
      );
      if (enterpriseRule) return enterpriseRule;
    }

    return undefined;
  }

  async createTipRule(data: InsertTipRule): Promise<TipRule> {
    const [result] = await db.insert(tipRules).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateTipRule(id: string, data: Partial<InsertTipRule>): Promise<TipRule | undefined> {
    const [result] = await db.update(tipRules).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(tipRules.id, id)).returning();
    return result;
  }

  async deleteTipRule(id: string): Promise<boolean> {
    const result = await db.delete(tipRules).where(eq(tipRules.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getTipRuleJobPercentages(tipRuleId: string): Promise<TipRuleJobPercentage[]> {
    return db.select().from(tipRuleJobPercentages).where(eq(tipRuleJobPercentages.tipRuleId, tipRuleId));
  }

  async upsertTipRuleJobPercentages(tipRuleId: string, percentages: Array<{ jobCodeId: string; percentage: string }>): Promise<TipRuleJobPercentage[]> {
    // Delete existing percentages for this rule
    await db.delete(tipRuleJobPercentages).where(eq(tipRuleJobPercentages.tipRuleId, tipRuleId));
    
    if (percentages.length === 0) return [];
    
    // Insert new percentages
    const results = await db.insert(tipRuleJobPercentages).values(
      percentages.map(p => ({
        tipRuleId,
        jobCodeId: p.jobCodeId,
        percentage: p.percentage,
      }))
    ).returning();
    
    return results;
  }

  // ============================================================================
  // LABOR VS SALES IMPLEMENTATIONS
  // ============================================================================

  // Labor Snapshots
  async getLaborSnapshots(filters: { propertyId?: string; rvcId?: string; businessDate?: string; startDate?: string; endDate?: string }): Promise<LaborSnapshot[]> {
    const conditions: any[] = [];
    if (filters.propertyId) conditions.push(eq(laborSnapshots.propertyId, filters.propertyId));
    if (filters.rvcId) conditions.push(eq(laborSnapshots.rvcId, filters.rvcId));
    if (filters.businessDate) conditions.push(eq(laborSnapshots.businessDate, filters.businessDate));
    if (filters.startDate) conditions.push(gte(laborSnapshots.businessDate, filters.startDate));
    if (filters.endDate) conditions.push(lte(laborSnapshots.businessDate, filters.endDate));
    
    if (conditions.length === 0) {
      return db.select().from(laborSnapshots).orderBy(desc(laborSnapshots.businessDate));
    }
    return db.select().from(laborSnapshots).where(and(...conditions)).orderBy(desc(laborSnapshots.businessDate));
  }

  async createLaborSnapshot(data: InsertLaborSnapshot): Promise<LaborSnapshot> {
    const [result] = await db.insert(laborSnapshots).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateLaborSnapshot(id: string, data: Partial<InsertLaborSnapshot>): Promise<LaborSnapshot | undefined> {
    const [result] = await db.update(laborSnapshots).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(laborSnapshots.id, id)).returning();
    return result;
  }

  async calculateLaborSnapshot(propertyId: string, businessDate: string): Promise<LaborSnapshot> {
    // Get total sales for the day
    const dayChecks = await db.select().from(checks)
      .where(and(
        eq(checks.businessDate, businessDate),
        eq(checks.status, "closed")
      ));
    
    let totalSales = 0;
    for (const check of dayChecks) {
      totalSales += parseFloat(check.total || "0");
    }

    // Get labor hours and cost
    const dayTimecards = await this.getTimecards({ propertyId, businessDate });
    
    let laborHours = 0;
    let laborCost = 0;
    let headcount = dayTimecards.length;

    for (const tc of dayTimecards) {
      laborHours += parseFloat(tc.totalHours || "0");
      laborCost += parseFloat(tc.totalPay || "0");
    }

    const laborPercentage = totalSales > 0 ? (laborCost / totalSales) * 100 : 0;
    const salesPerLaborHour = laborHours > 0 ? totalSales / laborHours : 0;

    // Check for existing snapshot
    const existing = await db.select().from(laborSnapshots)
      .where(and(eq(laborSnapshots.propertyId, propertyId), eq(laborSnapshots.businessDate, businessDate)))
      .limit(1);

    const snapshotData = {
      totalSales: totalSales.toFixed(2),
      laborHours: laborHours.toFixed(2),
      laborCost: laborCost.toFixed(2),
      laborPercentage: laborPercentage.toFixed(2),
      salesPerLaborHour: salesPerLaborHour.toFixed(2),
      headcount,
    };

    if (existing.length > 0) {
      const [result] = await db.update(laborSnapshots)
        .set({ ...snapshotData, updatedAt: new Date() })
        .where(eq(laborSnapshots.id, existing[0].id))
        .returning();
      return result;
    }

    return this.createLaborSnapshot({
      propertyId,
      businessDate,
      ...snapshotData,
    });
  }

  // ============================================================================
  // OVERTIME RULES
  // ============================================================================

  async getOvertimeRules(propertyId: string): Promise<OvertimeRule[]> {
    return db.select().from(overtimeRules).where(eq(overtimeRules.propertyId, propertyId));
  }

  async getOvertimeRule(id: string): Promise<OvertimeRule | undefined> {
    const [result] = await db.select().from(overtimeRules).where(eq(overtimeRules.id, id));
    return result;
  }

  async getActiveOvertimeRule(propertyId: string): Promise<OvertimeRule | undefined> {
    const [result] = await db.select().from(overtimeRules)
      .where(and(eq(overtimeRules.propertyId, propertyId), eq(overtimeRules.active, true)))
      .orderBy(desc(overtimeRules.createdAt))
      .limit(1);
    return result;
  }

  async createOvertimeRule(data: InsertOvertimeRule): Promise<OvertimeRule> {
    const [result] = await db.insert(overtimeRules).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateOvertimeRule(id: string, data: Partial<InsertOvertimeRule>): Promise<OvertimeRule | undefined> {
    const [result] = await db.update(overtimeRules)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(overtimeRules.id, id))
      .returning();
    return result;
  }

  async deleteOvertimeRule(id: string): Promise<boolean> {
    const result = await db.delete(overtimeRules).where(eq(overtimeRules.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ============================================================================
  // CALIFORNIA LABOR COMPLIANCE - Break Rules, Attestations, Violations
  // ============================================================================

  async getBreakRules(propertyId: string): Promise<BreakRule[]> {
    return db.select().from(breakRules).where(eq(breakRules.propertyId, propertyId));
  }

  async getBreakRule(id: string): Promise<BreakRule | undefined> {
    const [result] = await db.select().from(breakRules).where(eq(breakRules.id, id));
    return result;
  }

  async getActiveBreakRule(propertyId: string): Promise<BreakRule | undefined> {
    const [result] = await db.select().from(breakRules)
      .where(and(eq(breakRules.propertyId, propertyId), eq(breakRules.active, true)))
      .orderBy(desc(breakRules.createdAt))
      .limit(1);
    return result;
  }

  async createBreakRule(data: InsertBreakRule): Promise<BreakRule> {
    const [result] = await db.insert(breakRules).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateBreakRule(id: string, data: Partial<InsertBreakRule>): Promise<BreakRule | undefined> {
    const [result] = await db.update(breakRules)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(breakRules.id, id))
      .returning();
    return result;
  }

  async deleteBreakRule(id: string): Promise<boolean> {
    const result = await db.delete(breakRules).where(eq(breakRules.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getBreakAttestations(propertyId: string, businessDate?: string): Promise<BreakAttestation[]> {
    const conditions = [eq(breakAttestations.propertyId, propertyId)];
    if (businessDate) conditions.push(eq(breakAttestations.businessDate, businessDate));
    return db.select().from(breakAttestations).where(and(...conditions)).orderBy(desc(breakAttestations.attestedAt));
  }

  async getBreakAttestationsByEmployee(employeeId: string, businessDate?: string): Promise<BreakAttestation[]> {
    const conditions = [eq(breakAttestations.employeeId, employeeId)];
    if (businessDate) conditions.push(eq(breakAttestations.businessDate, businessDate));
    return db.select().from(breakAttestations).where(and(...conditions)).orderBy(desc(breakAttestations.attestedAt));
  }

  async createBreakAttestation(data: InsertBreakAttestation): Promise<BreakAttestation> {
    const [result] = await db.insert(breakAttestations).values(sanitizeDates(data)).returning();
    return result;
  }

  async getBreakViolations(propertyId: string, options?: { businessDate?: string; startDate?: string; endDate?: string; status?: string }): Promise<BreakViolation[]> {
    const conditions = [eq(breakViolations.propertyId, propertyId)];
    if (options?.businessDate) conditions.push(eq(breakViolations.businessDate, options.businessDate));
    if (options?.startDate) conditions.push(gte(breakViolations.businessDate, options.startDate));
    if (options?.endDate) conditions.push(lte(breakViolations.businessDate, options.endDate));
    if (options?.status) conditions.push(eq(breakViolations.status, options.status));
    return db.select().from(breakViolations).where(and(...conditions)).orderBy(desc(breakViolations.createdAt));
  }

  async getBreakViolationsByEmployee(employeeId: string): Promise<BreakViolation[]> {
    return db.select().from(breakViolations)
      .where(eq(breakViolations.employeeId, employeeId))
      .orderBy(desc(breakViolations.businessDate));
  }

  async createBreakViolation(data: InsertBreakViolation): Promise<BreakViolation> {
    const [result] = await db.insert(breakViolations).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateBreakViolation(id: string, data: Partial<InsertBreakViolation>): Promise<BreakViolation | undefined> {
    const [result] = await db.update(breakViolations)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(breakViolations.id, id))
      .returning();
    return result;
  }

  async acknowledgeBreakViolation(id: string, acknowledgedById: string): Promise<BreakViolation | undefined> {
    const [result] = await db.update(breakViolations)
      .set({ acknowledgedById, acknowledgedAt: new Date(), status: "acknowledged", updatedAt: new Date() })
      .where(eq(breakViolations.id, id))
      .returning();
    return result;
  }

  async getMinorLaborRules(propertyId: string): Promise<MinorLaborRule[]> {
    return db.select().from(minorLaborRules).where(eq(minorLaborRules.propertyId, propertyId));
  }

  async getActiveMinorLaborRule(propertyId: string): Promise<MinorLaborRule | undefined> {
    const [result] = await db.select().from(minorLaborRules)
      .where(and(eq(minorLaborRules.propertyId, propertyId), eq(minorLaborRules.active, true)))
      .orderBy(desc(minorLaborRules.createdAt))
      .limit(1);
    return result;
  }

  async createMinorLaborRule(data: InsertMinorLaborRule): Promise<MinorLaborRule> {
    const [result] = await db.insert(minorLaborRules).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateMinorLaborRule(id: string, data: Partial<InsertMinorLaborRule>): Promise<MinorLaborRule | undefined> {
    const [result] = await db.update(minorLaborRules)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(minorLaborRules.id, id))
      .returning();
    return result;
  }

  async getEmployeeMinorStatus(employeeId: string): Promise<EmployeeMinorStatus | undefined> {
    const [result] = await db.select().from(employeeMinorStatus).where(eq(employeeMinorStatus.employeeId, employeeId));
    return result;
  }

  async createEmployeeMinorStatus(data: InsertEmployeeMinorStatus): Promise<EmployeeMinorStatus> {
    const [result] = await db.insert(employeeMinorStatus).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateEmployeeMinorStatus(id: string, data: Partial<InsertEmployeeMinorStatus>): Promise<EmployeeMinorStatus | undefined> {
    const [result] = await db.update(employeeMinorStatus)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(employeeMinorStatus.id, id))
      .returning();
    return result;
  }

  async getEmployeeMinorStatusesByProperty(propertyId: string): Promise<EmployeeMinorStatus[]> {
    // Get all employees for the property, then get their minor statuses
    const propertyEmployees = await db.select().from(employees).where(eq(employees.propertyId, propertyId));
    const employeeIds = propertyEmployees.map(e => e.id);
    if (employeeIds.length === 0) return [];
    const statuses = await db.select().from(employeeMinorStatus).where(inArray(employeeMinorStatus.employeeId, employeeIds));
    return statuses;
  }

  async deleteEmployeeMinorStatus(id: string): Promise<boolean> {
    const result = await db.delete(employeeMinorStatus).where(eq(employeeMinorStatus.id, id)).returning();
    return result.length > 0;
  }

  // ============================================================================
  // FISCAL PERIODS
  // ============================================================================

  async getFiscalPeriods(propertyId: string, startDate?: string, endDate?: string): Promise<FiscalPeriod[]> {
    const conditions = [eq(fiscalPeriods.propertyId, propertyId)];
    if (startDate) conditions.push(gte(fiscalPeriods.businessDate, startDate));
    if (endDate) conditions.push(lte(fiscalPeriods.businessDate, endDate));
    return db.select().from(fiscalPeriods).where(and(...conditions)).orderBy(desc(fiscalPeriods.businessDate));
  }

  async getFiscalPeriod(id: string): Promise<FiscalPeriod | undefined> {
    const [result] = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, id));
    return result;
  }

  async getFiscalPeriodByDate(propertyId: string, businessDate: string): Promise<FiscalPeriod | undefined> {
    const [result] = await db.select().from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.propertyId, propertyId), eq(fiscalPeriods.businessDate, businessDate)));
    return result;
  }

  async createFiscalPeriod(data: InsertFiscalPeriod): Promise<FiscalPeriod> {
    const [result] = await db.insert(fiscalPeriods).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateFiscalPeriod(id: string, data: Partial<InsertFiscalPeriod>): Promise<FiscalPeriod | undefined> {
    const [result] = await db.update(fiscalPeriods).set(sanitizeDates(data)).where(eq(fiscalPeriods.id, id)).returning();
    return result;
  }

  async calculateFiscalPeriodTotals(propertyId: string, businessDate: string): Promise<any> {
    // Get all RVCs for this property
    const propertyRvcs = await db.select().from(rvcs).where(eq(rvcs.propertyId, propertyId));
    const rvcIds = propertyRvcs.map(r => r.id);
    
    if (rvcIds.length === 0) {
      return { grossSales: "0", netSales: "0", taxCollected: "0", discountsTotal: "0", checkCount: 0, cashExpected: "0", cardTotal: "0", tipsTotal: "0", serviceChargesTotal: "0", refundsTotal: "0", guestCount: 0 };
    }

    // Get all checks for this business date and property's RVCs (exclude test mode)
    const dayChecks = await db.select().from(checks)
      .where(and(inArray(checks.rvcId, rvcIds), eq(checks.businessDate, businessDate), or(eq(checks.testMode, false), isNull(checks.testMode))));

    let grossSalesCents = 0, netSalesCents = 0, taxCollectedCents = 0, discountsTotalCents = 0;
    let cashExpectedCents = 0, cardTotalCents = 0, tipsTotalCents = 0;
    let serviceChargesTotalCents = 0, refundsTotalCents = 0, guestCount = 0;
    let voidCount = 0, voidAmountCents = 0;
    let checksBegun = 0, checksPaid = 0;

    for (const check of dayChecks) {
      checksBegun++;
      if (check.status === "closed") checksPaid++;

      const subtotalCents = Math.round(parseFloat(check.subtotal || "0") * 100);
      const discountCents = Math.round(parseFloat(check.discountTotal || "0") * 100);
      const taxCents = Math.round(parseFloat(check.taxTotal || "0") * 100);
      const serviceChargeCents = Math.round(parseFloat(check.serviceChargeTotal || "0") * 100);

      grossSalesCents += subtotalCents + discountCents;
      netSalesCents += subtotalCents;
      taxCollectedCents += taxCents;
      discountsTotalCents += discountCents;
      serviceChargesTotalCents += serviceChargeCents;
      guestCount += check.guestCount || 1;

      const payments = await db.select().from(checkPayments).where(eq(checkPayments.checkId, check.id));
      for (const payment of payments) {
        if (payment.paymentStatus !== "completed") continue;
        const amountCents = Math.round(parseFloat(payment.amount || "0") * 100);
        const tender = await this.getTender(payment.tenderId);
        if (tender?.isCashMedia) {
          cashExpectedCents += amountCents;
        } else if (tender?.isCardMedia) {
          cardTotalCents += amountCents;
        }
        tipsTotalCents += Math.round(parseFloat(payment.tipAmount || "0") * 100);
      }

      const checkRefunds = await db.select().from(refunds).where(eq(refunds.originalCheckId, check.id));
      for (const refund of checkRefunds) {
        refundsTotalCents += Math.round(parseFloat(refund.total || "0") * 100);
      }

      const items = await db.select().from(checkItems).where(eq(checkItems.checkId, check.id));
      for (const item of items) {
        if (item.voided) {
          voidCount++;
          const itemPrice = parseFloat(item.unitPrice || "0") * (item.quantity || 1);
          voidAmountCents += Math.round(itemPrice * 100);
        }
      }
    }

    return {
      grossSales: (grossSalesCents / 100).toFixed(2),
      netSales: (netSalesCents / 100).toFixed(2),
      taxCollected: (taxCollectedCents / 100).toFixed(2),
      discountsTotal: (discountsTotalCents / 100).toFixed(2),
      tipsTotal: (tipsTotalCents / 100).toFixed(2),
      serviceChargesTotal: (serviceChargesTotalCents / 100).toFixed(2),
      refundsTotal: (refundsTotalCents / 100).toFixed(2),
      checkCount: dayChecks.length,
      checksBegun,
      checksPaid,
      guestCount,
      cashExpected: (cashExpectedCents / 100).toFixed(2),
      cardTotal: (cardTotalCents / 100).toFixed(2),
      voidCount,
      voidAmount: (voidAmountCents / 100).toFixed(2),
    };
  }

  async getHistoricalSalesData(propertyId: string, weeks: number): Promise<FiscalPeriod[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeks * 7));
    return this.getFiscalPeriods(propertyId, startDate.toISOString().split("T")[0]);
  }

  // ============================================================================
  // CASH MANAGEMENT
  // ============================================================================

  async getCashDrawers(propertyId: string): Promise<CashDrawer[]> {
    return db.select().from(cashDrawers).where(eq(cashDrawers.propertyId, propertyId));
  }

  async getCashDrawer(id: string): Promise<CashDrawer | undefined> {
    const [result] = await db.select().from(cashDrawers).where(eq(cashDrawers.id, id));
    return result;
  }

  async createCashDrawer(data: InsertCashDrawer): Promise<CashDrawer> {
    const [result] = await db.insert(cashDrawers).values(sanitizeDates(data)).returning();
    return result;
  }

  async getDrawerAssignments(propertyId?: string, employeeId?: string, businessDate?: string): Promise<DrawerAssignment[]> {
    const conditions = [];
    if (businessDate) conditions.push(eq(drawerAssignments.businessDate, businessDate));
    if (employeeId) conditions.push(eq(drawerAssignments.employeeId, employeeId));
    
    // Join with cashDrawers to filter by propertyId for security
    if (propertyId) {
      const propertyDrawers = await db.select().from(cashDrawers).where(eq(cashDrawers.propertyId, propertyId));
      const drawerIds = propertyDrawers.map(d => d.id);
      if (drawerIds.length === 0) return [];
      conditions.push(inArray(drawerAssignments.drawerId, drawerIds));
    }
    
    return db.select().from(drawerAssignments).where(conditions.length > 0 ? and(...conditions) : undefined);
  }

  async getDrawerAssignment(id: string): Promise<DrawerAssignment | undefined> {
    const [result] = await db.select().from(drawerAssignments).where(eq(drawerAssignments.id, id));
    return result;
  }

  async createDrawerAssignment(data: InsertDrawerAssignment): Promise<DrawerAssignment> {
    const [result] = await db.insert(drawerAssignments).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateDrawerAssignment(id: string, data: Partial<InsertDrawerAssignment>): Promise<DrawerAssignment | undefined> {
    const [result] = await db.update(drawerAssignments).set(sanitizeDates(data)).where(eq(drawerAssignments.id, id)).returning();
    return result;
  }

  async createCashTransaction(data: InsertCashTransaction): Promise<CashTransaction> {
    const [result] = await db.insert(cashTransactions).values(sanitizeDates(data)).returning();
    return result;
  }

  async getCashTransactions(propertyId?: string, businessDate?: string, assignmentId?: string): Promise<CashTransaction[]> {
    const conditions = [];
    if (propertyId) conditions.push(eq(cashTransactions.propertyId, propertyId));
    if (businessDate) conditions.push(eq(cashTransactions.businessDate, businessDate));
    if (assignmentId) conditions.push(eq(cashTransactions.assignmentId, assignmentId));
    return db.select().from(cashTransactions).where(conditions.length > 0 ? and(...conditions) : undefined);
  }

  async getSafeCounts(propertyId: string, businessDate?: string): Promise<SafeCount[]> {
    const conditions = [eq(safeCounts.propertyId, propertyId)];
    if (businessDate) conditions.push(eq(safeCounts.businessDate, businessDate));
    return db.select().from(safeCounts).where(and(...conditions));
  }

  async createSafeCount(data: InsertSafeCount): Promise<SafeCount> {
    const [result] = await db.insert(safeCounts).values(sanitizeDates(data)).returning();
    return result;
  }

  // ============================================================================
  // GIFT CARDS
  // ============================================================================

  async getGiftCards(propertyId?: string, status?: string): Promise<GiftCard[]> {
    const conditions = [];
    if (propertyId) conditions.push(eq(giftCards.propertyId, propertyId));
    if (status) conditions.push(eq(giftCards.status, status));
    return db.select().from(giftCards).where(conditions.length > 0 ? and(...conditions) : undefined);
  }

  async getGiftCard(id: string): Promise<GiftCard | undefined> {
    const [result] = await db.select().from(giftCards).where(eq(giftCards.id, id));
    return result;
  }

  async getGiftCardByNumber(cardNumber: string): Promise<GiftCard | undefined> {
    const [result] = await db.select().from(giftCards).where(eq(giftCards.cardNumber, cardNumber));
    return result;
  }

  async createGiftCard(data: InsertGiftCard): Promise<GiftCard> {
    const [result] = await db.insert(giftCards).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateGiftCard(id: string, data: Partial<InsertGiftCard>): Promise<GiftCard | undefined> {
    const [result] = await db.update(giftCards).set(sanitizeDates(data)).where(eq(giftCards.id, id)).returning();
    return result;
  }

  async getGiftCardTransactions(giftCardId: string): Promise<GiftCardTransaction[]> {
    return db.select().from(giftCardTransactions).where(eq(giftCardTransactions.giftCardId, giftCardId)).orderBy(desc(giftCardTransactions.createdAt));
  }

  async createGiftCardTransaction(data: InsertGiftCardTransaction): Promise<GiftCardTransaction> {
    const [result] = await db.insert(giftCardTransactions).values(sanitizeDates(data)).returning();
    return result;
  }

  // ============================================================================
  // LOYALTY PROGRAMS
  // ============================================================================

  async getLoyaltyPrograms(enterpriseId?: string, propertyId?: string): Promise<LoyaltyProgram[]> {
    const conditions = [];
    if (enterpriseId) conditions.push(eq(loyaltyPrograms.enterpriseId, enterpriseId));
    if (propertyId) conditions.push(eq(loyaltyPrograms.propertyId, propertyId));
    if (conditions.length > 0) {
      return db.select().from(loyaltyPrograms).where(and(...conditions));
    }
    return db.select().from(loyaltyPrograms);
  }

  async createLoyaltyProgram(data: InsertLoyaltyProgram): Promise<LoyaltyProgram> {
    const [result] = await db.insert(loyaltyPrograms).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateLoyaltyProgram(id: string, data: Partial<InsertLoyaltyProgram>): Promise<LoyaltyProgram | undefined> {
    const [result] = await db.update(loyaltyPrograms).set(sanitizeDates(data)).where(eq(loyaltyPrograms.id, id)).returning();
    return result;
  }

  async getLoyaltyMembers(search?: string, enterpriseId?: string, propertyId?: string): Promise<LoyaltyMember[]> {
    const conditions = [];
    if (enterpriseId) {
      conditions.push(eq(loyaltyMembers.enterpriseId, enterpriseId));
    }
    if (propertyId) {
      conditions.push(eq(loyaltyMembers.propertyId, propertyId));
    }
    if (search) {
      conditions.push(or(
        ilike(loyaltyMembers.firstName, `%${search}%`),
        ilike(loyaltyMembers.lastName, `%${search}%`),
        ilike(loyaltyMembers.email, `%${search}%`),
        ilike(loyaltyMembers.phone, `%${search}%`),
        ilike(loyaltyMembers.memberNumber, `%${search}%`)
      ));
    }
    return db.select().from(loyaltyMembers).where(conditions.length > 0 ? and(...conditions) : undefined);
  }

  async getLoyaltyMember(id: string): Promise<LoyaltyMember | undefined> {
    const [result] = await db.select().from(loyaltyMembers).where(eq(loyaltyMembers.id, id));
    return result;
  }

  async getLoyaltyMemberWithEnrollments(id: string): Promise<LoyaltyMemberWithEnrollments | undefined> {
    const member = await this.getLoyaltyMember(id);
    if (!member) return undefined;
    
    const enrollments = await db.select().from(loyaltyMemberEnrollments)
      .where(eq(loyaltyMemberEnrollments.memberId, id));
    
    const enrollmentsWithPrograms = await Promise.all(
      enrollments.map(async (enrollment) => {
        const [program] = await db.select().from(loyaltyPrograms)
          .where(eq(loyaltyPrograms.id, enrollment.programId));
        return { ...enrollment, program };
      })
    );
    
    return { ...member, enrollments: enrollmentsWithPrograms };
  }

  async getLoyaltyMemberByIdentifier(identifier: string): Promise<LoyaltyMember | undefined> {
    const [result] = await db.select().from(loyaltyMembers).where(or(
      eq(loyaltyMembers.memberNumber, identifier),
      eq(loyaltyMembers.phone, identifier),
      eq(loyaltyMembers.email, identifier)
    ));
    return result;
  }

  async createLoyaltyMember(data: InsertLoyaltyMember): Promise<LoyaltyMember> {
    const [result] = await db.insert(loyaltyMembers).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateLoyaltyMember(id: string, data: Partial<InsertLoyaltyMember>): Promise<LoyaltyMember | undefined> {
    const [result] = await db.update(loyaltyMembers).set(sanitizeDates(data)).where(eq(loyaltyMembers.id, id)).returning();
    return result;
  }

  // Loyalty Enrollments
  async getLoyaltyEnrollments(memberId: string): Promise<LoyaltyMemberEnrollment[]> {
    return db.select().from(loyaltyMemberEnrollments)
      .where(eq(loyaltyMemberEnrollments.memberId, memberId));
  }

  async getLoyaltyEnrollmentsByProgram(programId: string): Promise<LoyaltyMemberEnrollment[]> {
    return db.select().from(loyaltyMemberEnrollments)
      .where(eq(loyaltyMemberEnrollments.programId, programId));
  }

  async getLoyaltyEnrollment(id: string): Promise<LoyaltyMemberEnrollment | undefined> {
    const [result] = await db.select().from(loyaltyMemberEnrollments)
      .where(eq(loyaltyMemberEnrollments.id, id));
    return result;
  }

  async createLoyaltyEnrollment(data: InsertLoyaltyMemberEnrollment): Promise<LoyaltyMemberEnrollment> {
    const [result] = await db.insert(loyaltyMemberEnrollments).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateLoyaltyEnrollment(id: string, data: Partial<InsertLoyaltyMemberEnrollment>): Promise<LoyaltyMemberEnrollment | undefined> {
    const [result] = await db.update(loyaltyMemberEnrollments).set(sanitizeDates(data))
      .where(eq(loyaltyMemberEnrollments.id, id)).returning();
    return result;
  }

  async createLoyaltyTransaction(data: InsertLoyaltyTransaction): Promise<LoyaltyTransaction> {
    const [result] = await db.insert(loyaltyTransactions).values(sanitizeDates(data)).returning();
    return result;
  }

  async getLoyaltyTransactionsByMember(memberId: string): Promise<LoyaltyTransaction[]> {
    return db.select().from(loyaltyTransactions).where(eq(loyaltyTransactions.memberId, memberId));
  }

  async getLoyaltyTransactionsByEnrollment(enrollmentId: string): Promise<LoyaltyTransaction[]> {
    return db.select().from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.enrollmentId, enrollmentId));
  }

  async getLoyaltyRewards(programId?: string): Promise<LoyaltyReward[]> {
    if (programId) {
      return db.select().from(loyaltyRewards).where(eq(loyaltyRewards.programId, programId));
    }
    return db.select().from(loyaltyRewards);
  }

  async createLoyaltyReward(data: InsertLoyaltyReward): Promise<LoyaltyReward> {
    const [result] = await db.insert(loyaltyRewards).values(sanitizeDates(data)).returning();
    return result;
  }

  async getLoyaltyReward(id: string): Promise<LoyaltyReward | undefined> {
    const [result] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, id));
    return result;
  }

  async updateLoyaltyReward(id: string, data: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined> {
    const [result] = await db.update(loyaltyRewards).set(sanitizeDates(data)).where(eq(loyaltyRewards.id, id)).returning();
    return result;
  }

  // Loyalty Redemptions
  async getLoyaltyRedemptionsByMember(memberId: string): Promise<LoyaltyRedemption[]> {
    return db.select().from(loyaltyRedemptions).where(eq(loyaltyRedemptions.memberId, memberId));
  }

  async getLoyaltyRedemptionsByCheck(checkId: string): Promise<LoyaltyRedemption[]> {
    return db.select().from(loyaltyRedemptions).where(eq(loyaltyRedemptions.checkId, checkId));
  }

  async createLoyaltyRedemption(data: InsertLoyaltyRedemption): Promise<LoyaltyRedemption> {
    const [result] = await db.insert(loyaltyRedemptions).values(sanitizeDates(data)).returning();
    return result;
  }

  // Check customer operations
  async getChecksByCustomer(customerId: string, limit?: number): Promise<Check[]> {
    const query = db.select().from(checks)
      .where(eq(checks.customerId, customerId))
      .orderBy(sql`${checks.openedAt} DESC`);
    if (limit) {
      return query.limit(limit);
    }
    return query;
  }

  async attachCustomerToCheck(checkId: string, customerId: string): Promise<Check | undefined> {
    const [result] = await db.update(checks)
      .set({ customerId })
      .where(eq(checks.id, checkId))
      .returning();
    return result;
  }

  async detachCustomerFromCheck(checkId: string): Promise<Check | undefined> {
    const [result] = await db.update(checks)
      .set({ customerId: null })
      .where(eq(checks.id, checkId))
      .returning();
    return result;
  }

  // ============================================================================
  // INVENTORY MANAGEMENT
  // ============================================================================

  async getInventoryItems(propertyId?: string, category?: string): Promise<InventoryItem[]> {
    const conditions = [];
    if (propertyId) conditions.push(eq(inventoryItems.propertyId, propertyId));
    if (category) conditions.push(eq(inventoryItems.category, category));
    return db.select().from(inventoryItems).where(conditions.length > 0 ? and(...conditions) : undefined);
  }

  async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    const [result] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return result;
  }

  async createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem> {
    const [result] = await db.insert(inventoryItems).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateInventoryItem(id: string, data: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const [result] = await db.update(inventoryItems).set(sanitizeDates(data)).where(eq(inventoryItems.id, id)).returning();
    return result;
  }

  async getInventoryStock(propertyId: string): Promise<InventoryStock[]> {
    return db.select().from(inventoryStock).where(eq(inventoryStock.propertyId, propertyId));
  }

  async getInventoryStockByItem(inventoryItemId: string, propertyId: string): Promise<InventoryStock | undefined> {
    const [result] = await db.select().from(inventoryStock)
      .where(and(eq(inventoryStock.inventoryItemId, inventoryItemId), eq(inventoryStock.propertyId, propertyId)));
    return result;
  }

  async createInventoryStock(data: InsertInventoryStock): Promise<InventoryStock> {
    const [result] = await db.insert(inventoryStock).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateInventoryStock(id: string, data: Partial<InsertInventoryStock>): Promise<InventoryStock | undefined> {
    const [result] = await db.update(inventoryStock).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(inventoryStock.id, id)).returning();
    return result;
  }

  async createInventoryTransaction(data: InsertInventoryTransaction): Promise<InventoryTransaction> {
    const [result] = await db.insert(inventoryTransactions).values(sanitizeDates(data)).returning();
    return result;
  }

  async getInventoryTransactions(propertyId: string): Promise<InventoryTransaction[]> {
    return db.select().from(inventoryTransactions)
      .where(eq(inventoryTransactions.propertyId, propertyId))
      .orderBy(desc(inventoryTransactions.transactionDate));
  }

  async getRecipes(menuItemId?: string): Promise<Recipe[]> {
    if (menuItemId) {
      return db.select().from(recipes).where(eq(recipes.menuItemId, menuItemId));
    }
    return db.select().from(recipes);
  }

  async createRecipe(data: InsertRecipe): Promise<Recipe> {
    const [result] = await db.insert(recipes).values(sanitizeDates(data)).returning();
    return result;
  }

  // ============================================================================
  // ONLINE ORDERING
  // ============================================================================

  async getOnlineOrderSources(propertyId: string): Promise<OnlineOrderSource[]> {
    return db.select().from(onlineOrderSources).where(eq(onlineOrderSources.propertyId, propertyId));
  }

  async createOnlineOrderSource(data: InsertOnlineOrderSource): Promise<OnlineOrderSource> {
    const [result] = await db.insert(onlineOrderSources).values(sanitizeDates(data)).returning();
    return result;
  }

  async getOnlineOrders(propertyId: string, status?: string, startDate?: string, endDate?: string): Promise<OnlineOrder[]> {
    const conditions = [eq(onlineOrders.propertyId, propertyId)];
    if (status) conditions.push(eq(onlineOrders.status, status));
    return db.select().from(onlineOrders).where(and(...conditions)).orderBy(desc(onlineOrders.createdAt));
  }

  async getOnlineOrder(id: string): Promise<OnlineOrder | undefined> {
    const [result] = await db.select().from(onlineOrders).where(eq(onlineOrders.id, id));
    return result;
  }

  async createOnlineOrder(data: InsertOnlineOrder): Promise<OnlineOrder> {
    const [result] = await db.insert(onlineOrders).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateOnlineOrder(id: string, data: Partial<InsertOnlineOrder>): Promise<OnlineOrder | undefined> {
    const [result] = await db.update(onlineOrders).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(onlineOrders.id, id)).returning();
    return result;
  }

  async getOnlineOrderSource(id: string): Promise<OnlineOrderSource | undefined> {
    const [result] = await db.select().from(onlineOrderSources).where(eq(onlineOrderSources.id, id));
    return result;
  }

  async updateOnlineOrderSource(id: string, data: Partial<InsertOnlineOrderSource>): Promise<OnlineOrderSource | undefined> {
    const [result] = await db.update(onlineOrderSources).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(onlineOrderSources.id, id)).returning();
    return result;
  }

  async deleteOnlineOrderSource(id: string): Promise<boolean> {
    const result = await db.delete(onlineOrderSources).where(eq(onlineOrderSources.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getOnlineOrderSourcesByPlatform(platform: string): Promise<OnlineOrderSource[]> {
    return db.select().from(onlineOrderSources).where(and(eq(onlineOrderSources.platform, platform), eq(onlineOrderSources.active, true)));
  }

  async getOnlineOrderByExternalId(externalOrderId: string, sourceId: string): Promise<OnlineOrder | undefined> {
    const [result] = await db.select().from(onlineOrders).where(and(eq(onlineOrders.externalOrderId, externalOrderId), eq(onlineOrders.sourceId, sourceId)));
    return result;
  }

  async getDeliveryPlatformItemMappings(sourceId: string): Promise<DeliveryPlatformItemMapping[]> {
    return db.select().from(deliveryPlatformItemMappings).where(eq(deliveryPlatformItemMappings.sourceId, sourceId));
  }

  async createDeliveryPlatformItemMapping(data: InsertDeliveryPlatformItemMapping): Promise<DeliveryPlatformItemMapping> {
    const [result] = await db.insert(deliveryPlatformItemMappings).values(sanitizeDates(data)).returning();
    return result;
  }

  async deleteDeliveryPlatformItemMapping(id: string): Promise<boolean> {
    const result = await db.delete(deliveryPlatformItemMappings).where(eq(deliveryPlatformItemMappings.id, id));
    return (result.rowCount || 0) > 0;
  }

  // ============================================================================
  // MANAGER ALERTS
  // ============================================================================

  async getManagerAlerts(propertyId: string, alertType?: string, read?: boolean, acknowledged?: boolean): Promise<ManagerAlert[]> {
    const conditions = [eq(managerAlerts.propertyId, propertyId)];
    if (alertType) conditions.push(eq(managerAlerts.alertType, alertType));
    if (read !== undefined) conditions.push(eq(managerAlerts.read, read));
    if (acknowledged !== undefined) conditions.push(eq(managerAlerts.acknowledged, acknowledged));
    return db.select().from(managerAlerts).where(and(...conditions)).orderBy(desc(managerAlerts.createdAt));
  }

  async getUnreadAlertCount(propertyId: string): Promise<number> {
    const result = await db.select().from(managerAlerts)
      .where(and(eq(managerAlerts.propertyId, propertyId), eq(managerAlerts.read, false)));
    return result.length;
  }

  async createManagerAlert(data: InsertManagerAlert): Promise<ManagerAlert> {
    const [result] = await db.insert(managerAlerts).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateManagerAlert(id: string, data: Partial<InsertManagerAlert>): Promise<ManagerAlert | undefined> {
    const [result] = await db.update(managerAlerts).set(sanitizeDates(data)).where(eq(managerAlerts.id, id)).returning();
    return result;
  }

  // ============================================================================
  // SYNC NOTIFICATIONS
  // ============================================================================

  async getSyncNotifications(propertyId: string, unreadOnly?: boolean, limit?: number): Promise<SyncNotification[]> {
    const conditions = [eq(syncNotifications.propertyId, propertyId)];
    if (unreadOnly) conditions.push(eq(syncNotifications.read, false));
    let query = db.select().from(syncNotifications).where(and(...conditions)).orderBy(desc(syncNotifications.createdAt));
    if (limit) return query.limit(limit);
    return query.limit(100);
  }

  async getUnreadSyncNotificationCount(propertyId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(syncNotifications)
      .where(and(eq(syncNotifications.propertyId, propertyId), eq(syncNotifications.read, false)));
    return Number(result?.count || 0);
  }

  async createSyncNotification(data: InsertSyncNotification): Promise<SyncNotification> {
    const [result] = await db.insert(syncNotifications).values(sanitizeDates(data)).returning();
    return result;
  }

  async markSyncNotificationRead(id: string): Promise<SyncNotification | undefined> {
    const [result] = await db.update(syncNotifications).set({ read: true, readAt: new Date() }).where(eq(syncNotifications.id, id)).returning();
    return result;
  }

  async markAllSyncNotificationsRead(propertyId: string): Promise<number> {
    const result = await db.update(syncNotifications).set({ read: true, readAt: new Date() })
      .where(and(eq(syncNotifications.propertyId, propertyId), eq(syncNotifications.read, false)));
    return result.rowCount || 0;
  }

  async deleteSyncNotification(id: string): Promise<boolean> {
    const result = await db.delete(syncNotifications).where(eq(syncNotifications.id, id));
    return (result.rowCount || 0) > 0;
  }

  async deleteAllSyncNotifications(propertyId: string): Promise<number> {
    const result = await db.delete(syncNotifications).where(eq(syncNotifications.propertyId, propertyId));
    return result.rowCount || 0;
  }

  async getRecentSyncNotification(propertyId: string, category: string, serviceHostId: string, minutesAgo: number = 5): Promise<SyncNotification | undefined> {
    const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000);
    const [result] = await db.select().from(syncNotifications)
      .where(and(
        eq(syncNotifications.propertyId, propertyId),
        eq(syncNotifications.category, category),
        eq(syncNotifications.serviceHostId, serviceHostId),
        eq(syncNotifications.read, false),
        gte(syncNotifications.createdAt, cutoff)
      ))
      .orderBy(desc(syncNotifications.createdAt))
      .limit(1);
    return result;
  }

  // ============================================================================
  // ITEM AVAILABILITY / PREP
  // ============================================================================

  async getItemAvailability(propertyId: string, rvcId?: string, businessDate?: string): Promise<ItemAvailability[]> {
    const conditions = [eq(itemAvailability.propertyId, propertyId)];
    if (rvcId) conditions.push(eq(itemAvailability.rvcId, rvcId));
    if (businessDate) conditions.push(eq(itemAvailability.businessDate, businessDate));
    return db.select().from(itemAvailability).where(and(...conditions));
  }

  async createItemAvailability(data: InsertItemAvailability): Promise<ItemAvailability> {
    const [result] = await db.insert(itemAvailability).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateItemAvailability(id: string, data: Partial<InsertItemAvailability>): Promise<ItemAvailability | undefined> {
    const [result] = await db.update(itemAvailability).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(itemAvailability.id, id)).returning();
    return result;
  }

  async getItemAvailabilityByMenuItem(menuItemId: string, propertyId: string): Promise<ItemAvailability | undefined> {
    // First try to find a record with actual quantity data (non-null currentQuantity)
    const [activeRecord] = await db.select().from(itemAvailability)
      .where(and(
        eq(itemAvailability.menuItemId, menuItemId),
        eq(itemAvailability.propertyId, propertyId),
        isNotNull(itemAvailability.currentQuantity)
      ))
      .orderBy(desc(itemAvailability.updatedAt))
      .limit(1);
    
    if (activeRecord) return activeRecord;
    
    // Fall back to any record (for cases where only 86'd status matters)
    const [result] = await db.select().from(itemAvailability)
      .where(and(
        eq(itemAvailability.menuItemId, menuItemId),
        eq(itemAvailability.propertyId, propertyId)
      ))
      .orderBy(desc(itemAvailability.updatedAt))
      .limit(1);
    return result;
  }

  async restoreItemAvailability(menuItemId: string, propertyId: string, quantity: number = 1): Promise<ItemAvailability | undefined> {
    const existing = await this.getItemAvailabilityByMenuItem(menuItemId, propertyId);
    if (!existing || existing.currentQuantity === null) return existing;
    
    const newQuantity = existing.currentQuantity + quantity;
    const newSoldQuantity = Math.max(0, (existing.soldQuantity || 0) - quantity);
    
    const [result] = await db.update(itemAvailability)
      .set({ 
        currentQuantity: newQuantity,
        soldQuantity: newSoldQuantity,
        isAvailable: newQuantity > 0,
        is86ed: false,
        eightySixedAt: null,
        updatedAt: new Date() 
      })
      .where(eq(itemAvailability.id, existing.id))
      .returning();
    return result;
  }

  async decrementItemAvailability(menuItemId: string, propertyId: string, delta: number = 1): Promise<ItemAvailability | undefined> {
    const existing = await this.getItemAvailabilityByMenuItem(menuItemId, propertyId);
    // If no record or unlimited quantity (null), nothing to decrement
    if (!existing || existing.currentQuantity === null) return existing;
    
    // Calculate new quantity atomically (can't go below 0)
    const newQuantity = Math.max(0, existing.currentQuantity - delta);
    const newSoldQuantity = (existing.soldQuantity || 0) + delta;
    const isNowSoldOut = newQuantity === 0;
    
    const [result] = await db.update(itemAvailability)
      .set({ 
        currentQuantity: newQuantity,
        soldQuantity: newSoldQuantity,
        isAvailable: !isNowSoldOut,
        is86ed: isNowSoldOut,
        eightySixedAt: isNowSoldOut ? new Date() : existing.eightySixedAt,
        updatedAt: new Date() 
      })
      .where(eq(itemAvailability.id, existing.id))
      .returning();
    return result;
  }

  async incrementItemAvailability(menuItemId: string, propertyId: string, delta: number = 1): Promise<ItemAvailability | undefined> {
    const existing = await this.getItemAvailabilityByMenuItem(menuItemId, propertyId);
    if (!existing || existing.currentQuantity === null) return existing;
    
    const newQuantity = existing.currentQuantity + delta;
    const newSoldQuantity = Math.max(0, (existing.soldQuantity || 0) - delta);
    
    const [result] = await db.update(itemAvailability)
      .set({ 
        currentQuantity: newQuantity,
        soldQuantity: newSoldQuantity,
        isAvailable: true,
        is86ed: false,
        updatedAt: new Date() 
      })
      .where(eq(itemAvailability.id, existing.id))
      .returning();
    return result;
  }

  async getPrepItems(propertyId: string): Promise<PrepItem[]> {
    return db.select().from(prepItems).where(eq(prepItems.propertyId, propertyId));
  }

  async createPrepItem(data: InsertPrepItem): Promise<PrepItem> {
    const [result] = await db.insert(prepItems).values(sanitizeDates(data)).returning();
    return result;
  }

  async updatePrepItem(id: string, data: Partial<InsertPrepItem>): Promise<PrepItem | undefined> {
    const [result] = await db.update(prepItems).set(sanitizeDates(data)).where(eq(prepItems.id, id)).returning();
    return result;
  }

  // ============================================================================
  // SALES & LABOR FORECASTING
  // ============================================================================

  async getSalesForecasts(propertyId: string, startDate?: string, endDate?: string): Promise<SalesForecast[]> {
    const conditions = [eq(salesForecasts.propertyId, propertyId)];
    if (startDate) conditions.push(gte(salesForecasts.forecastDate, startDate));
    if (endDate) conditions.push(lte(salesForecasts.forecastDate, endDate));
    return db.select().from(salesForecasts).where(and(...conditions)).orderBy(salesForecasts.forecastDate);
  }

  async createSalesForecast(data: InsertSalesForecast): Promise<SalesForecast> {
    const [result] = await db.insert(salesForecasts).values(sanitizeDates(data)).returning();
    return result;
  }

  async getLaborForecasts(propertyId: string, startDate?: string, endDate?: string): Promise<LaborForecast[]> {
    const conditions = [eq(laborForecasts.propertyId, propertyId)];
    if (startDate) conditions.push(gte(laborForecasts.forecastDate, startDate));
    if (endDate) conditions.push(lte(laborForecasts.forecastDate, endDate));
    return db.select().from(laborForecasts).where(and(...conditions)).orderBy(laborForecasts.forecastDate);
  }

  async createLaborForecast(data: InsertLaborForecast): Promise<LaborForecast> {
    const [result] = await db.insert(laborForecasts).values(sanitizeDates(data)).returning();
    return result;
  }

  // ============================================================================
  // ACCOUNTING / GL MAPPINGS
  // ============================================================================

  async getGlMappings(propertyId?: string, enterpriseId?: string): Promise<GlMapping[]> {
    const conditions = [];
    if (propertyId) conditions.push(eq(glMappings.propertyId, propertyId));
    if (enterpriseId) conditions.push(eq(glMappings.enterpriseId, enterpriseId));
    return db.select().from(glMappings).where(conditions.length > 0 ? and(...conditions) : undefined);
  }

  async createGlMapping(data: InsertGlMapping): Promise<GlMapping> {
    const [result] = await db.insert(glMappings).values(sanitizeDates(data)).returning();
    return result;
  }

  async getAccountingExports(propertyId: string): Promise<AccountingExport[]> {
    return db.select().from(accountingExports).where(eq(accountingExports.propertyId, propertyId)).orderBy(desc(accountingExports.createdAt));
  }

  async createAccountingExport(data: InsertAccountingExport): Promise<AccountingExport> {
    const [result] = await db.insert(accountingExports).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateAccountingExport(id: string, data: Partial<InsertAccountingExport>): Promise<AccountingExport | undefined> {
    const [result] = await db.update(accountingExports).set(sanitizeDates(data)).where(eq(accountingExports.id, id)).returning();
    return result;
  }

  // ============================================================================
  // OFFLINE ORDER QUEUE
  // ============================================================================

  async getOfflineOrderQueue(propertyId: string, status?: string): Promise<OfflineOrderQueue[]> {
    const conditions = [eq(offlineOrderQueue.propertyId, propertyId)];
    if (status) conditions.push(eq(offlineOrderQueue.status, status));
    return db.select().from(offlineOrderQueue).where(and(...conditions)).orderBy(desc(offlineOrderQueue.createdAt));
  }

  async getOfflineOrderByLocalId(localId: string): Promise<OfflineOrderQueue | undefined> {
    const [result] = await db.select().from(offlineOrderQueue).where(eq(offlineOrderQueue.localId, localId));
    return result;
  }

  async getOfflineOrderQueueItem(id: string): Promise<OfflineOrderQueue | undefined> {
    const [result] = await db.select().from(offlineOrderQueue).where(eq(offlineOrderQueue.id, id));
    return result;
  }

  async createOfflineOrderQueue(data: InsertOfflineOrderQueue): Promise<OfflineOrderQueue> {
    const [result] = await db.insert(offlineOrderQueue).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateOfflineOrderQueue(id: string, data: Partial<InsertOfflineOrderQueue>): Promise<OfflineOrderQueue | undefined> {
    const [result] = await db.update(offlineOrderQueue).set(sanitizeDates(data)).where(eq(offlineOrderQueue.id, id)).returning();
    return result;
  }

  // ============================================================================
  // GUEST CHECK DESCRIPTORS
  // ============================================================================

  async getDescriptorSet(scopeType: DescriptorScopeType, scopeId: string): Promise<DescriptorSet | undefined> {
    const [result] = await db.select().from(descriptorSets)
      .where(and(eq(descriptorSets.scopeType, scopeType), eq(descriptorSets.scopeId, scopeId)));
    return result;
  }

  async getDescriptorSets(enterpriseId: string): Promise<DescriptorSet[]> {
    return db.select().from(descriptorSets).where(eq(descriptorSets.enterpriseId, enterpriseId));
  }

  async createDescriptorSet(data: InsertDescriptorSet): Promise<DescriptorSet> {
    const [result] = await db.insert(descriptorSets).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateDescriptorSet(id: string, data: Partial<InsertDescriptorSet>): Promise<DescriptorSet | undefined> {
    const [result] = await db.update(descriptorSets)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(descriptorSets.id, id))
      .returning();
    return result;
  }

  async deleteDescriptorSet(id: string): Promise<boolean> {
    const result = await db.delete(descriptorSets).where(eq(descriptorSets.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getEffectiveDescriptors(rvcId: string): Promise<{ headerLines: string[]; trailerLines: string[]; logoEnabled: boolean; logoAssetId: string | null }> {
    const rvc = await this.getRvc(rvcId);
    if (!rvc) {
      return { headerLines: [], trailerLines: [], logoEnabled: false, logoAssetId: null };
    }

    const property = await this.getProperty(rvc.propertyId);
    if (!property) {
      return { headerLines: [], trailerLines: [], logoEnabled: false, logoAssetId: null };
    }

    const enterpriseId = property.enterpriseId;

    const rvcDescriptor = await this.getDescriptorSet("rvc", rvcId);
    const propertyDescriptor = await this.getDescriptorSet("property", rvc.propertyId);
    const enterpriseDescriptor = await this.getDescriptorSet("enterprise", enterpriseId);

    let headerLines: string[] = [];
    let trailerLines: string[] = [];
    let logoEnabled = false;
    let logoAssetId: string | null = null;

    if (rvcDescriptor?.overrideHeader && rvcDescriptor.headerLines) {
      headerLines = rvcDescriptor.headerLines as string[];
    } else if (propertyDescriptor?.overrideHeader && propertyDescriptor.headerLines) {
      headerLines = propertyDescriptor.headerLines as string[];
    } else if (enterpriseDescriptor?.headerLines) {
      headerLines = enterpriseDescriptor.headerLines as string[];
    }

    if (rvcDescriptor?.overrideTrailer && rvcDescriptor.trailerLines) {
      trailerLines = rvcDescriptor.trailerLines as string[];
    } else if (propertyDescriptor?.overrideTrailer && propertyDescriptor.trailerLines) {
      trailerLines = propertyDescriptor.trailerLines as string[];
    } else if (enterpriseDescriptor?.trailerLines) {
      trailerLines = enterpriseDescriptor.trailerLines as string[];
    }

    if (rvcDescriptor?.overrideLogo) {
      logoEnabled = rvcDescriptor.logoEnabled ?? false;
      logoAssetId = rvcDescriptor.logoAssetId;
    } else if (propertyDescriptor?.overrideLogo) {
      logoEnabled = propertyDescriptor.logoEnabled ?? false;
      logoAssetId = propertyDescriptor.logoAssetId;
    } else if (enterpriseDescriptor) {
      logoEnabled = enterpriseDescriptor.logoEnabled ?? false;
      logoAssetId = enterpriseDescriptor.logoAssetId;
    }

    return { headerLines, trailerLines, logoEnabled, logoAssetId };
  }

  // Logo Assets
  async getDescriptorLogoAsset(id: string): Promise<DescriptorLogoAsset | undefined> {
    const [result] = await db.select().from(descriptorLogoAssets).where(eq(descriptorLogoAssets.id, id));
    return result;
  }

  async getDescriptorLogoAssets(enterpriseId: string): Promise<DescriptorLogoAsset[]> {
    return db.select().from(descriptorLogoAssets).where(eq(descriptorLogoAssets.enterpriseId, enterpriseId));
  }

  async createDescriptorLogoAsset(data: InsertDescriptorLogoAsset): Promise<DescriptorLogoAsset> {
    const [result] = await db.insert(descriptorLogoAssets).values(sanitizeDates(data)).returning();
    return result;
  }

  async deleteDescriptorLogoAsset(id: string): Promise<boolean> {
    const result = await db.delete(descriptorLogoAssets).where(eq(descriptorLogoAssets.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ============================================================================
  // V2 SERVICE HOST SYNC INFRASTRUCTURE
  // ============================================================================

  async getServiceHosts(propertyId?: string): Promise<ServiceHost[]> {
    if (propertyId) {
      return db.select().from(serviceHosts).where(eq(serviceHosts.propertyId, propertyId));
    }
    return db.select().from(serviceHosts);
  }

  async getServiceHost(id: string): Promise<ServiceHost | undefined> {
    const [result] = await db.select().from(serviceHosts).where(eq(serviceHosts.id, id));
    return result;
  }

  async createServiceHost(data: InsertServiceHost): Promise<ServiceHost> {
    const [result] = await db.insert(serviceHosts).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateServiceHost(id: string, data: Partial<InsertServiceHost>): Promise<ServiceHost | undefined> {
    const [result] = await db.update(serviceHosts)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(serviceHosts.id, id))
      .returning();
    return result;
  }

  async deleteServiceHost(id: string): Promise<boolean> {
    const result = await db.delete(serviceHosts).where(eq(serviceHosts.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getLatestConfigVersion(propertyId: string): Promise<number> {
    const [result] = await db.select({ maxVersion: sql<number>`COALESCE(MAX(${configVersions.version}), 0)` })
      .from(configVersions)
      .where(eq(configVersions.propertyId, propertyId));
    return result?.maxVersion || 0;
  }

  async getConfigChanges(propertyId: string, sinceVersion: number): Promise<ConfigVersion[]> {
    return db.select()
      .from(configVersions)
      .where(and(
        eq(configVersions.propertyId, propertyId),
        gt(configVersions.version, sinceVersion)
      ))
      .orderBy(configVersions.version);
  }

  async createConfigVersion(data: InsertConfigVersion): Promise<ConfigVersion> {
    const [result] = await db.insert(configVersions).values(sanitizeDates(data)).returning();
    return result;
  }

  async createServiceHostTransaction(data: InsertServiceHostTransaction): Promise<ServiceHostTransaction> {
    const [result] = await db.insert(serviceHostTransactions).values(sanitizeDates(data)).returning();
    return result;
  }

  async getServiceHostTransactions(serviceHostId: string): Promise<ServiceHostTransaction[]> {
    return db.select()
      .from(serviceHostTransactions)
      .where(eq(serviceHostTransactions.serviceHostId, serviceHostId))
      .orderBy(desc(serviceHostTransactions.processedAt));
  }

  // Service Host Metrics
  async createServiceHostMetrics(data: InsertServiceHostMetrics): Promise<ServiceHostMetrics> {
    const [result] = await db.insert(serviceHostMetrics).values(sanitizeDates(data)).returning();
    return result;
  }

  async getServiceHostMetrics(serviceHostId: string, limit: number = 100): Promise<ServiceHostMetrics[]> {
    return db.select()
      .from(serviceHostMetrics)
      .where(eq(serviceHostMetrics.serviceHostId, serviceHostId))
      .orderBy(desc(serviceHostMetrics.recordedAt))
      .limit(limit);
  }

  async getServiceHostMetricsByProperty(propertyId: string, since?: Date): Promise<ServiceHostMetrics[]> {
    const hosts = await this.getServiceHosts(propertyId);
    const hostIds = hosts.map(h => h.id);
    if (hostIds.length === 0) return [];
    
    const conditions = [inArray(serviceHostMetrics.serviceHostId, hostIds)];
    if (since) {
      conditions.push(gt(serviceHostMetrics.recordedAt, since));
    }
    
    return db.select()
      .from(serviceHostMetrics)
      .where(and(...conditions))
      .orderBy(desc(serviceHostMetrics.recordedAt))
      .limit(500);
  }

  // Service Host Alerts
  async createServiceHostAlert(data: InsertServiceHostAlert): Promise<ServiceHostAlert> {
    const [result] = await db.insert(serviceHostAlerts).values(sanitizeDates(data)).returning();
    return result;
  }

  async getServiceHostAlerts(propertyId?: string, acknowledged?: boolean): Promise<ServiceHostAlert[]> {
    const conditions = [];
    if (propertyId) {
      conditions.push(eq(serviceHostAlerts.propertyId, propertyId));
    }
    if (acknowledged === false) {
      conditions.push(sql`${serviceHostAlerts.acknowledgedAt} IS NULL`);
    } else if (acknowledged === true) {
      conditions.push(sql`${serviceHostAlerts.acknowledgedAt} IS NOT NULL`);
    }
    
    return db.select()
      .from(serviceHostAlerts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(serviceHostAlerts.triggeredAt))
      .limit(100);
  }

  async acknowledgeServiceHostAlert(id: string, acknowledgedById: string): Promise<ServiceHostAlert | undefined> {
    const [result] = await db.update(serviceHostAlerts)
      .set({ acknowledgedAt: new Date(), acknowledgedById })
      .where(eq(serviceHostAlerts.id, id))
      .returning();
    return result;
  }

  async resolveServiceHostAlert(id: string): Promise<ServiceHostAlert | undefined> {
    const [result] = await db.update(serviceHostAlerts)
      .set({ resolvedAt: new Date() })
      .where(eq(serviceHostAlerts.id, id))
      .returning();
    return result;
  }

  // Service Host Alert Rules
  async getServiceHostAlertRules(enterpriseId: string): Promise<ServiceHostAlertRule[]> {
    return db.select()
      .from(serviceHostAlertRules)
      .where(eq(serviceHostAlertRules.enterpriseId, enterpriseId));
  }

  async createServiceHostAlertRule(data: InsertServiceHostAlertRule): Promise<ServiceHostAlertRule> {
    const [result] = await db.insert(serviceHostAlertRules).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateServiceHostAlertRule(id: string, data: Partial<InsertServiceHostAlertRule>): Promise<ServiceHostAlertRule | undefined> {
    const [result] = await db.update(serviceHostAlertRules)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(serviceHostAlertRules.id, id))
      .returning();
    return result;
  }

  async deleteServiceHostAlertRule(id: string): Promise<boolean> {
    const result = await db.delete(serviceHostAlertRules).where(eq(serviceHostAlertRules.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ============================================================================
  // WORKSTATION SERVICE BINDINGS
  // ============================================================================

  async getWorkstationServiceBindings(propertyId: string): Promise<WorkstationServiceBinding[]> {
    return db.select()
      .from(workstationServiceBindings)
      .where(eq(workstationServiceBindings.propertyId, propertyId));
  }

  async getAllWorkstationServiceBindings(): Promise<WorkstationServiceBinding[]> {
    return db.select().from(workstationServiceBindings);
  }

  async getWorkstationServiceBinding(id: string): Promise<WorkstationServiceBinding | undefined> {
    const [result] = await db.select().from(workstationServiceBindings).where(eq(workstationServiceBindings.id, id));
    return result;
  }

  async getServiceBindingByType(propertyId: string, serviceType: string): Promise<WorkstationServiceBinding | undefined> {
    const [result] = await db.select()
      .from(workstationServiceBindings)
      .where(and(
        eq(workstationServiceBindings.propertyId, propertyId),
        eq(workstationServiceBindings.serviceType, serviceType),
        eq(workstationServiceBindings.active, true)
      ));
    return result;
  }

  async getBindingsForWorkstation(workstationId: string): Promise<WorkstationServiceBinding[]> {
    return db.select()
      .from(workstationServiceBindings)
      .where(eq(workstationServiceBindings.workstationId, workstationId));
  }

  async deleteBindingsForWorkstation(workstationId: string): Promise<number> {
    const result = await db.delete(workstationServiceBindings)
      .where(eq(workstationServiceBindings.workstationId, workstationId));
    return result.rowCount ?? 0;
  }

  async deleteOtherBindingsForServiceType(propertyId: string, serviceType: string, keepWorkstationId: string): Promise<number> {
    const result = await db.delete(workstationServiceBindings)
      .where(and(
        eq(workstationServiceBindings.propertyId, propertyId),
        eq(workstationServiceBindings.serviceType, serviceType),
        sql`${workstationServiceBindings.workstationId} != ${keepWorkstationId}`
      ));
    return result.rowCount ?? 0;
  }

  async createWorkstationServiceBinding(data: InsertWorkstationServiceBinding): Promise<WorkstationServiceBinding> {
    const [result] = await db.insert(workstationServiceBindings).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateWorkstationServiceBinding(id: string, data: Partial<InsertWorkstationServiceBinding>): Promise<WorkstationServiceBinding | undefined> {
    const [result] = await db.update(workstationServiceBindings)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(workstationServiceBindings.id, id))
      .returning();
    return result;
  }

  async deleteWorkstationServiceBinding(id: string): Promise<boolean> {
    const result = await db.delete(workstationServiceBindings).where(eq(workstationServiceBindings.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ============================================================================
  // CAL PACKAGES
  // ============================================================================

  async getCalPackages(enterpriseId: string): Promise<CalPackage[]> {
    return db.select()
      .from(calPackages)
      .where(eq(calPackages.enterpriseId, enterpriseId))
      .orderBy(calPackages.packageType, calPackages.name);
  }

  async getCalPackage(id: string): Promise<CalPackage | undefined> {
    const [result] = await db.select().from(calPackages).where(eq(calPackages.id, id));
    return result;
  }

  async createCalPackage(data: InsertCalPackage): Promise<CalPackage> {
    const [result] = await db.insert(calPackages).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateCalPackage(id: string, data: Partial<InsertCalPackage>): Promise<CalPackage | undefined> {
    const [result] = await db.update(calPackages)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(calPackages.id, id))
      .returning();
    return result;
  }

  async deleteCalPackage(id: string): Promise<boolean> {
    // First, get all versions for this package
    const versions = await db.select().from(calPackageVersions).where(eq(calPackageVersions.packageId, id));
    
    // Delete prerequisites for each version
    for (const version of versions) {
      await db.delete(calPackagePrerequisites).where(eq(calPackagePrerequisites.packageVersionId, version.id));
      // Delete deployments that reference this version
      await db.delete(calDeployments).where(eq(calDeployments.packageVersionId, version.id));
    }
    
    // Delete all versions for this package
    await db.delete(calPackageVersions).where(eq(calPackageVersions.packageId, id));
    
    // Finally delete the package
    const result = await db.delete(calPackages).where(eq(calPackages.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // CAL Package Versions
  async getCalPackageVersions(packageId: string): Promise<CalPackageVersion[]> {
    return db.select()
      .from(calPackageVersions)
      .where(eq(calPackageVersions.packageId, packageId))
      .orderBy(desc(calPackageVersions.releasedAt));
  }

  async getCalPackageVersion(id: string): Promise<CalPackageVersion | undefined> {
    const [result] = await db.select().from(calPackageVersions).where(eq(calPackageVersions.id, id));
    return result;
  }

  async createCalPackageVersion(data: InsertCalPackageVersion): Promise<CalPackageVersion> {
    const [result] = await db.insert(calPackageVersions).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateCalPackageVersion(id: string, data: Partial<InsertCalPackageVersion>): Promise<CalPackageVersion | undefined> {
    const [result] = await db.update(calPackageVersions)
      .set(sanitizeDates(data))
      .where(eq(calPackageVersions.id, id))
      .returning();
    return result;
  }

  async deleteCalPackageVersion(id: string): Promise<boolean> {
    const result = await db.delete(calPackageVersions).where(eq(calPackageVersions.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // CAL Package Prerequisites
  async getCalPackagePrerequisites(packageVersionId: string): Promise<CalPackagePrerequisite[]> {
    return db.select()
      .from(calPackagePrerequisites)
      .where(eq(calPackagePrerequisites.packageVersionId, packageVersionId))
      .orderBy(calPackagePrerequisites.installOrder);
  }

  async createCalPackagePrerequisite(data: InsertCalPackagePrerequisite): Promise<CalPackagePrerequisite> {
    const [result] = await db.insert(calPackagePrerequisites).values(sanitizeDates(data)).returning();
    return result;
  }

  async deleteCalPackagePrerequisite(id: string): Promise<boolean> {
    const result = await db.delete(calPackagePrerequisites).where(eq(calPackagePrerequisites.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // CAL Deployments
  async getCalDeployments(enterpriseId: string): Promise<CalDeployment[]> {
    return db.select()
      .from(calDeployments)
      .where(eq(calDeployments.enterpriseId, enterpriseId))
      .orderBy(desc(calDeployments.createdAt));
  }

  async getCalDeployment(id: string): Promise<CalDeployment | undefined> {
    const [result] = await db.select().from(calDeployments).where(eq(calDeployments.id, id));
    return result;
  }

  async createCalDeployment(data: InsertCalDeployment): Promise<CalDeployment> {
    const [result] = await db.insert(calDeployments).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateCalDeployment(id: string, data: Partial<InsertCalDeployment>): Promise<CalDeployment | undefined> {
    const [result] = await db.update(calDeployments)
      .set({ ...sanitizeDates(data), updatedAt: new Date() })
      .where(eq(calDeployments.id, id))
      .returning();
    return result;
  }

  async deleteCalDeployment(id: string): Promise<boolean> {
    const result = await db.delete(calDeployments).where(eq(calDeployments.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // CAL Deployment Targets
  async getCalDeploymentTargets(deploymentId: string): Promise<CalDeploymentTarget[]> {
    return db.select()
      .from(calDeploymentTargets)
      .where(eq(calDeploymentTargets.deploymentId, deploymentId));
  }

  async getCalDeploymentTarget(id: string): Promise<CalDeploymentTarget | undefined> {
    const [result] = await db.select().from(calDeploymentTargets).where(eq(calDeploymentTargets.id, id));
    return result;
  }

  async createCalDeploymentTarget(data: InsertCalDeploymentTarget): Promise<CalDeploymentTarget> {
    const [result] = await db.insert(calDeploymentTargets).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateCalDeploymentTarget(id: string, data: Partial<InsertCalDeploymentTarget>): Promise<CalDeploymentTarget | undefined> {
    const [result] = await db.update(calDeploymentTargets)
      .set(sanitizeDates(data))
      .where(eq(calDeploymentTargets.id, id))
      .returning();
    return result;
  }

  async getCalDeploymentTargetsByServiceHost(serviceHostId: string): Promise<CalDeploymentTarget[]> {
    return db.select()
      .from(calDeploymentTargets)
      .where(
        and(
          eq(calDeploymentTargets.serviceHostId, serviceHostId),
          inArray(calDeploymentTargets.status, ['pending', 'downloading', 'installing', 'failed'])
        )
      );
  }

  async updateCalDeploymentTargetStatus(id: string, status: string, statusMessage?: string): Promise<CalDeploymentTarget | undefined> {
    const target = await this.getCalDeploymentTarget(id);
    if (!target) return undefined;
    
    const updateData: any = { status };
    
    if (statusMessage !== undefined) {
      updateData.statusMessage = statusMessage;
    }
    
    // Only set startedAt when transitioning from pending to downloading
    if ((status === 'downloading' || status === 'installing') && target.status === 'pending') {
      updateData.startedAt = new Date();
    }
    
    // Only set completedAt if not already completed
    if ((status === 'completed' || status === 'failed') && !target.completedAt) {
      updateData.completedAt = new Date();
    }
    
    if (status === 'failed') {
      updateData.retryCount = (target.retryCount || 0) + 1;
    }

    const [result] = await db.update(calDeploymentTargets)
      .set(sanitizeDates(updateData))
      .where(eq(calDeploymentTargets.id, id))
      .returning();
    return result;
  }

  // ============================================================================
  // EMC OPTION FLAGS
  // ============================================================================

  async getOptionFlags(enterpriseId: string, entityType: string, entityId: string): Promise<EmcOptionFlag[]> {
    return db.select().from(emcOptionFlags).where(
      and(
        eq(emcOptionFlags.enterpriseId, enterpriseId),
        eq(emcOptionFlags.entityType, entityType),
        eq(emcOptionFlags.entityId, entityId)
      )
    );
  }

  async getOptionFlag(
    enterpriseId: string, entityType: string, entityId: string,
    optionKey: string, scopeLevel: string, scopeId: string
  ): Promise<EmcOptionFlag | undefined> {
    const [row] = await db.select().from(emcOptionFlags).where(
      and(
        eq(emcOptionFlags.enterpriseId, enterpriseId),
        eq(emcOptionFlags.entityType, entityType),
        eq(emcOptionFlags.entityId, entityId),
        eq(emcOptionFlags.optionKey, optionKey),
        eq(emcOptionFlags.scopeLevel, scopeLevel),
        eq(emcOptionFlags.scopeId, scopeId)
      )
    );
    return row;
  }

  async setOptionFlag(data: InsertEmcOptionFlag): Promise<EmcOptionFlag> {
    const existing = await this.getOptionFlag(
      data.enterpriseId, data.entityType, data.entityId,
      data.optionKey, data.scopeLevel, data.scopeId
    );
    if (existing) {
      const [updated] = await db.update(emcOptionFlags)
        .set({ valueText: data.valueText, updatedAt: new Date() })
        .where(eq(emcOptionFlags.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(emcOptionFlags).values(sanitizeDates(data)).returning();
    return created;
  }

  async deleteOptionFlag(id: string): Promise<boolean> {
    const result = await db.delete(emcOptionFlags).where(eq(emcOptionFlags.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteOptionFlagByKey(
    enterpriseId: string, entityType: string, entityId: string,
    optionKey: string, scopeLevel: string, scopeId: string
  ): Promise<boolean> {
    const result = await db.delete(emcOptionFlags).where(
      and(
        eq(emcOptionFlags.enterpriseId, enterpriseId),
        eq(emcOptionFlags.entityType, entityType),
        eq(emcOptionFlags.entityId, entityId),
        eq(emcOptionFlags.optionKey, optionKey),
        eq(emcOptionFlags.scopeLevel, scopeLevel),
        eq(emcOptionFlags.scopeId, scopeId)
      )
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listOptionFlagsByScope(enterpriseId: string, scopeLevel: string, scopeId: string): Promise<EmcOptionFlag[]> {
    return db.select().from(emcOptionFlags).where(
      and(
        eq(emcOptionFlags.enterpriseId, enterpriseId),
        eq(emcOptionFlags.scopeLevel, scopeLevel),
        eq(emcOptionFlags.scopeId, scopeId)
      )
    );
  }

  async listAllOptionFlagsByEnterprise(enterpriseId: string): Promise<EmcOptionFlag[]> {
    return db.select().from(emcOptionFlags).where(
      eq(emcOptionFlags.enterpriseId, enterpriseId)
    );
  }

  async getLfsConfiguration(propertyId: string): Promise<LfsConfiguration | undefined> {
    const [result] = await db.select().from(lfsConfigurations).where(eq(lfsConfigurations.propertyId, propertyId));
    return result;
  }

  async getLfsConfigurations(): Promise<LfsConfiguration[]> {
    return db.select().from(lfsConfigurations);
  }

  async createLfsConfiguration(data: InsertLfsConfiguration): Promise<LfsConfiguration> {
    const [result] = await db.insert(lfsConfigurations).values(sanitizeDates(data)).returning();
    return result;
  }

  async updateLfsConfiguration(propertyId: string, data: Partial<InsertLfsConfiguration>): Promise<LfsConfiguration | undefined> {
    const [result] = await db.update(lfsConfigurations).set({ ...sanitizeDates(data), updatedAt: new Date() }).where(eq(lfsConfigurations.propertyId, propertyId)).returning();
    return result;
  }

  async deleteLfsConfiguration(propertyId: string): Promise<boolean> {
    const result = await db.delete(lfsConfigurations).where(eq(lfsConfigurations.propertyId, propertyId));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getLfsConfigurationByApiKey(apiKey: string): Promise<LfsConfiguration | undefined> {
    const [result] = await db.select().from(lfsConfigurations).where(eq(lfsConfigurations.apiKey, apiKey));
    return result;
  }

  async getLfsSyncLogs(propertyId: string, limit = 20): Promise<LfsSyncLog[]> {
    return db.select().from(lfsSyncLogs).where(eq(lfsSyncLogs.propertyId, propertyId)).orderBy(desc(lfsSyncLogs.createdAt)).limit(limit);
  }

  async createLfsSyncLog(data: InsertLfsSyncLog): Promise<LfsSyncLog> {
    const [result] = await db.insert(lfsSyncLogs).values(sanitizeDates(data)).returning();
    return result;
  }
}

import { isLocalMode } from "./db";

function createStorage(): IStorage {
  if (isLocalMode) {
    console.log("[LFS] Using PostgreSQL storage (local mode)");
  } else {
    console.log("[Cloud] Using PostgreSQL storage");
  }
  return new DatabaseStorage();
}

export const storage = createStorage();

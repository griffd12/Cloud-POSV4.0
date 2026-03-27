/**
 * Configuration Sync Service
 * 
 * Synchronizes configuration from cloud PostgreSQL to local SQLite:
 * - Hierarchy: Enterprises, Properties, RVCs
 * - Menu: SLUs, Menu Items, Modifiers, Print Classes
 * - Employees: Employees, Roles, Privileges, Assignments
 * - Devices: Workstations, Printers, KDS Devices, Order Devices
 * - Operations: Tax Groups, Tenders, Discounts, Service Charges
 * - POS Layouts: Layouts, Cells, RVC Assignments
 * - Payments: Payment Processors
 * - Loyalty: Programs, Members
 * 
 * Supports full sync and incremental delta sync with version tracking.
 */

import { Database } from '../db/database.js';
import { CloudConnection } from './cloud-connection.js';

interface SyncMetadata {
  entityType: string;
  lastSyncAt: string;
  lastVersion: number;
  recordCount: number;
}

interface FullConfigResponse {
  version: number;
  propertyId: string;
  syncedAt: string;
  
  enterprises?: any[];
  properties?: any[];
  rvcs?: any[];
  
  majorGroups?: any[];
  familyGroups?: any[];
  slus?: any[];
  menuItems?: any[];
  menuItemSlus?: any[];
  modifierGroups?: any[];
  modifiers?: any[];
  modifierGroupModifiers?: any[];
  menuItemModifierGroups?: any[];
  printClasses?: any[];
  
  employees?: any[];
  roles?: any[];
  privileges?: any[];
  rolePrivileges?: any[];
  employeeAssignments?: any[];
  jobCodes?: any[];
  employeeJobCodes?: any[];
  
  workstations?: any[];
  printers?: any[];
  kdsDevices?: any[];
  orderDevices?: any[];
  orderDevicePrinters?: any[];
  orderDeviceKds?: any[];
  printClassRouting?: any[];
  terminalDevices?: any[];
  
  taxGroups?: any[];
  tenders?: any[];
  discounts?: any[];
  serviceCharges?: any[];
  
  posLayouts?: any[];
  posLayoutCells?: any[];
  posLayoutRvcAssignments?: any[];
  
  paymentProcessors?: any[];
  
  loyaltyPrograms?: any[];
  loyaltyMembers?: any[];
  loyaltyMemberEnrollments?: any[];
  
  fiscalPeriods?: any[];
  
  itemAvailability?: any[];
  
  emcOptionFlags?: any[];
  
  giftCards?: any[];
  loyaltyRewards?: any[];
  
  overtimeRules?: any[];
  breakRules?: any[];
  tipRules?: any[];
  tipRuleJobPercentages?: any[];
  minorLaborRules?: any[];
  
  descriptorSets?: any[];
  descriptorLogoAssets?: any[];
  printAgents?: any[];
  paymentGatewayConfig?: any[];
  
  cashDrawers?: any[];
  onlineOrderSources?: any[];
  ingredientPrefixes?: any[];
  menuItemRecipeIngredients?: any[];
}

interface DeltaConfigResponse {
  version: number;
  fromVersion: number;
  changes: ConfigChange[];
}

interface ConfigChange {
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data?: any;
  timestamp: string;
}

export class ConfigSync {
  private db: Database;
  private cloud: CloudConnection;
  private propertyId: string;
  private activeRvcId: string | null = null;
  private currentVersion: number = 0;
  private syncInProgress: boolean = false;
  private lastSyncAt: string | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  
  constructor(db: Database, cloud: CloudConnection, propertyId: string) {
    this.db = db;
    this.cloud = cloud;
    this.propertyId = propertyId;
    
    this.loadSyncState();
    
    this.cloud.onMessage('CONFIG_UPDATE', (data) => {
      this.handleRealtimeUpdate(data);
    });
    
    this.cloud.onMessage('CONFIG_REFRESH', () => {
      this.syncFull().catch(err => {
        console.error('Full sync triggered by cloud failed:', err.message);
      });
    });
  }
  
  private loadSyncState(): void {
    const metadata = this.db.getSyncMetadata('config');
    if (metadata) {
      this.currentVersion = metadata.lastVersion || 0;
      this.lastSyncAt = metadata.lastSyncAt || null;
    }
  }
  
  private saveSyncState(recordCount: number = 0): void {
    this.lastSyncAt = new Date().toISOString();
    this.db.updateSyncMetadata('config', this.lastSyncAt, this.currentVersion, recordCount);
  }
  
  startAutoSync(intervalMs: number = 120000): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.syncInterval = setInterval(() => {
      if (this.cloud.isConnected() && !this.syncInProgress) {
        this.syncDelta().catch(err => {
          console.error('Auto delta sync failed:', err.message);
        });
      }
    }, intervalMs);
    
    console.log(`Config auto-sync started (every ${intervalMs / 1000}s)`);
  }
  
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
  
  async syncFull(): Promise<{ success: boolean; recordCount: number; error?: string }> {
    if (this.syncInProgress) {
      return { success: false, recordCount: 0, error: 'Sync already in progress' };
    }
    
    if (!this.cloud.isConnected()) {
      return { success: false, recordCount: 0, error: 'Cloud not connected' };
    }
    
    this.syncInProgress = true;
    let totalRecords = 0;
    
    try {
      console.log(`Starting full configuration sync for property ${this.propertyId}...`);
      
      const rawResponse = await this.cloud.get<any>(
        `/api/sync/config/full?propertyId=${encodeURIComponent(this.propertyId)}`
      );
      
      console.log(`[ConfigSync] Raw response keys: ${Object.keys(rawResponse).join(', ')}`);
      
      const innerData = rawResponse.data || rawResponse;
      console.log(`[ConfigSync] Inner data keys: ${Object.keys(innerData).join(', ')}`);

      const syncEnterprise = innerData.enterprise || (innerData.enterprises && innerData.enterprises[0]);
      const syncProperty = innerData.property || (innerData.properties && innerData.properties[0]);
      console.log(`[ConfigSync] Enterprise: ${syncEnterprise?.name || 'unknown'} (${syncEnterprise?.id || 'N/A'})`);
      console.log(`[ConfigSync] Property: ${syncProperty?.name || 'unknown'} (${syncProperty?.id || this.propertyId})`);
      
      const config: FullConfigResponse = {
        version: rawResponse.configVersion || rawResponse.version || 1,
        propertyId: this.propertyId,
        syncedAt: rawResponse.timestamp || new Date().toISOString(),
        enterprises: innerData.enterprises || (innerData.enterprise ? [innerData.enterprise] : undefined),
        properties: innerData.properties || (innerData.property ? [innerData.property] : undefined),
        rvcs: innerData.rvcs || innerData.revenueCenters,
        majorGroups: innerData.majorGroups,
        familyGroups: innerData.familyGroups,
        slus: innerData.slus,
        menuItems: innerData.menuItems,
        menuItemSlus: innerData.menuItemSlus,
        modifierGroups: innerData.modifierGroups,
        modifiers: innerData.modifiers,
        modifierGroupModifiers: innerData.modifierGroupModifiers,
        menuItemModifierGroups: innerData.menuItemModifierGroups,
        printClasses: innerData.printClasses,
        employees: innerData.employees,
        roles: innerData.roles,
        privileges: innerData.privileges,
        rolePrivileges: innerData.rolePrivileges,
        employeeAssignments: innerData.employeeAssignments,
        jobCodes: innerData.jobCodes,
        employeeJobCodes: innerData.employeeJobCodes,
        workstations: innerData.workstations,
        printers: innerData.printers,
        kdsDevices: innerData.kdsDevices,
        orderDevices: innerData.orderDevices,
        orderDevicePrinters: innerData.orderDevicePrinters,
        orderDeviceKds: innerData.orderDeviceKds,
        printClassRouting: innerData.printClassRouting,
        terminalDevices: innerData.terminalDevices,
        taxGroups: innerData.taxGroups,
        tenders: innerData.tenders,
        discounts: innerData.discounts,
        serviceCharges: innerData.serviceCharges,
        posLayouts: innerData.posLayouts,
        posLayoutCells: innerData.posLayoutCells,
        posLayoutRvcAssignments: innerData.posLayoutRvcAssignments,
        paymentProcessors: innerData.paymentProcessors,
        loyaltyPrograms: innerData.loyaltyPrograms,
        loyaltyMembers: innerData.loyaltyMembers,
        loyaltyMemberEnrollments: innerData.loyaltyMemberEnrollments,
        fiscalPeriods: innerData.fiscalPeriods,
        itemAvailability: innerData.itemAvailability,
        emcOptionFlags: innerData.emcOptionFlags,
        giftCards: innerData.giftCards,
        loyaltyRewards: innerData.loyaltyRewards,
        overtimeRules: innerData.overtimeRules,
        breakRules: innerData.breakRules,
        tipRules: innerData.tipRules,
        tipRuleJobPercentages: innerData.tipRuleJobPercentages,
        minorLaborRules: innerData.minorLaborRules,
        descriptorSets: innerData.descriptorSets,
        descriptorLogoAssets: innerData.descriptorLogoAssets,
        printAgents: innerData.printAgents,
        paymentGatewayConfig: innerData.paymentGatewayConfig,
        cashDrawers: innerData.cashDrawers,
        onlineOrderSources: innerData.onlineOrderSources,
        ingredientPrefixes: innerData.ingredientPrefixes,
        menuItemRecipeIngredients: innerData.menuItemRecipeIngredients,
      };
      
      const arraySizes = Object.entries(config)
        .filter(([_, v]) => Array.isArray(v) && (v as any[]).length > 0)
        .map(([k, v]) => `${k}:${(v as any[]).length}`)
        .join(', ');
      console.log(`[ConfigSync] Mapped entity arrays: ${arraySizes || '(none)'}`);
      
      this.db.run('PRAGMA foreign_keys = OFF');
      const syncErrors: string[] = [];
      const safeSync = (label: string, fn: () => number) => {
        try {
          totalRecords += fn.call(this);
        } catch (e) {
          const msg = `${label}: ${(e as Error).message}`;
          console.error(`[ConfigSync] Category sync failed — ${msg}`);
          syncErrors.push(msg);
        }
      };
      try {
        safeSync('hierarchy', () => this.syncHierarchy(config));
        safeSync('menu', () => this.syncMenu(config));
        safeSync('employees', () => this.syncEmployees(config));
        safeSync('devices', () => this.syncDevices(config));
        safeSync('operations', () => this.syncOperations(config));
        safeSync('posLayouts', () => this.syncPosLayouts(config));
        safeSync('payments', () => this.syncPayments(config));
        safeSync('loyalty', () => this.syncLoyalty(config));
        safeSync('labor', () => this.syncLabor(config));
        safeSync('misc', () => this.syncMisc(config));
      } finally {
        this.db.run('PRAGMA foreign_keys = ON');
      }
      if (syncErrors.length > 0) {
        console.warn(`[ConfigSync] Full sync completed with ${syncErrors.length} category warning(s): ${syncErrors.join('; ')}`);
      }
      
      this.currentVersion = config.version || 1;
      this.saveSyncState(totalRecords);
      
      console.log(`Full sync complete: ${totalRecords} records, version ${this.currentVersion}`);
      
      return { success: true, recordCount: totalRecords };
    } catch (e) {
      const error = (e as Error).message;
      console.error('Full sync failed:', error);
      return { success: false, recordCount: 0, error };
    } finally {
      this.syncInProgress = false;
    }
  }
  
  private syncHierarchy(config: FullConfigResponse): number {
    let count = 0;
    
    if (config.enterprises) {
      for (const ent of config.enterprises) {
        this.db.upsertEnterprise(ent);
        count++;
      }
      console.log(`  Synced ${config.enterprises.length} enterprises`);
    }
    
    if (config.properties) {
      for (const prop of config.properties) {
        this.db.upsertProperty(prop);
        count++;
      }
      console.log(`  Synced ${config.properties.length} properties`);
    }
    
    if (config.rvcs) {
      for (const rvc of config.rvcs) {
        this.db.upsertRvc(rvc);
        count++;
      }
      console.log(`  Synced ${config.rvcs.length} revenue centers`);
    }
    
    return count;
  }
  
  private syncMenu(config: FullConfigResponse): number {
    let count = 0;
    
    if (config.majorGroups) {
      for (const mg of config.majorGroups) {
        this.db.upsertMajorGroup(mg);
        count++;
      }
      console.log(`  Synced ${config.majorGroups.length} major groups`);
    }
    
    if (config.familyGroups) {
      for (const fg of config.familyGroups) {
        this.db.upsertFamilyGroup(fg);
        count++;
      }
      console.log(`  Synced ${config.familyGroups.length} family groups`);
    }
    
    if (config.slus) {
      for (const slu of config.slus) {
        this.db.upsertSlu(slu);
        count++;
      }
      console.log(`  Synced ${config.slus.length} SLUs`);
    }
    
    if (config.menuItems) {
      for (const item of config.menuItems) {
        this.db.upsertMenuItem(item);
        count++;
      }
      console.log(`  Synced ${config.menuItems.length} menu items`);
    }
    
    if (config.menuItemSlus) {
      for (const mis of config.menuItemSlus) {
        this.db.upsertMenuItemSlu(mis);
        count++;
      }
      console.log(`  Synced ${config.menuItemSlus.length} menu item SLU assignments`);
    }
    
    if (config.modifierGroups) {
      for (const mg of config.modifierGroups) {
        this.db.upsertModifierGroup(mg);
        count++;
      }
      console.log(`  Synced ${config.modifierGroups.length} modifier groups`);
    }
    
    if (config.modifiers) {
      for (const mod of config.modifiers) {
        this.db.upsertModifier(mod);
        count++;
      }
      console.log(`  Synced ${config.modifiers.length} modifiers`);
    }
    
    if (config.modifierGroupModifiers) {
      for (const mgm of config.modifierGroupModifiers) {
        this.db.upsertModifierGroupModifier(mgm);
        count++;
      }
      console.log(`  Synced ${config.modifierGroupModifiers.length} modifier group assignments`);
    }
    
    if (config.menuItemModifierGroups) {
      for (const mimg of config.menuItemModifierGroups) {
        this.db.upsertMenuItemModifierGroup(mimg);
        count++;
      }
      console.log(`  Synced ${config.menuItemModifierGroups.length} menu item modifier groups`);
    }
    
    if (config.printClasses) {
      for (const pc of config.printClasses) {
        this.db.upsertPrintClass(pc);
        count++;
      }
      console.log(`  Synced ${config.printClasses.length} print classes`);
    }
    
    return count;
  }
  
  private syncEmployees(config: FullConfigResponse): number {
    let count = 0;
    
    if (config.roles) {
      for (const role of config.roles) {
        this.db.upsertRole(role);
        count++;
      }
      console.log(`  Synced ${config.roles.length} roles`);
    }
    
    if (config.privileges) {
      for (const priv of config.privileges) {
        this.db.upsertPrivilege(priv);
        count++;
      }
      console.log(`  Synced ${config.privileges.length} privileges`);
    }
    
    if (config.rolePrivileges) {
      for (const rp of config.rolePrivileges) {
        this.db.upsertRolePrivilege(rp);
        count++;
      }
      console.log(`  Synced ${config.rolePrivileges.length} role privileges`);
    }
    
    if (config.employees) {
      for (const emp of config.employees) {
        this.db.upsertEmployee(emp);
        count++;
      }
      console.log(`  Synced ${config.employees.length} employees`);
    }
    
    if (config.employeeAssignments) {
      for (const assign of config.employeeAssignments) {
        this.db.upsertEmployeeAssignment(assign);
        count++;
      }
      console.log(`  Synced ${config.employeeAssignments.length} employee assignments`);
    }
    
    if (config.jobCodes) {
      for (const jc of config.jobCodes) {
        this.db.upsertJobCode(jc);
        count++;
      }
      console.log(`  Synced ${config.jobCodes.length} job codes`);
    }
    
    if (config.employeeJobCodes) {
      for (const ejc of config.employeeJobCodes) {
        this.db.upsertEmployeeJobCode(ejc);
        count++;
      }
      console.log(`  Synced ${config.employeeJobCodes.length} employee job codes`);
    }
    
    return count;
  }
  
  private syncDevices(config: FullConfigResponse): number {
    let count = 0;
    const errors: string[] = [];
    
    if (config.workstations) {
      try {
        for (const ws of config.workstations) {
          this.db.upsertWorkstation(ws);
          count++;
        }
        console.log(`  Synced ${config.workstations.length} workstations`);
      } catch (e) {
        errors.push(`workstations: ${(e as Error).message}`);
      }
    }
    
    if (config.printers) {
      try {
        for (const printer of config.printers) {
          this.db.upsertPrinter(printer);
          count++;
        }
        console.log(`  Synced ${config.printers.length} printers`);
      } catch (e) {
        errors.push(`printers: ${(e as Error).message}`);
      }
    }
    
    if (config.kdsDevices) {
      try {
        for (const kds of config.kdsDevices) {
          this.db.upsertKdsDevice(kds);
          count++;
        }
        console.log(`  Synced ${config.kdsDevices.length} KDS devices`);
      } catch (e) {
        errors.push(`kdsDevices: ${(e as Error).message}`);
      }
    }
    
    if (config.orderDevices) {
      try {
        for (const od of config.orderDevices) {
          this.db.upsertOrderDevice(od);
          count++;
        }
        console.log(`  Synced ${config.orderDevices.length} order devices`);
      } catch (e) {
        errors.push(`orderDevices: ${(e as Error).message}`);
      }
    }
    
    if (config.orderDevicePrinters) {
      try {
        for (const odp of config.orderDevicePrinters) {
          this.db.upsertOrderDevicePrinter(odp);
          count++;
        }
        console.log(`  Synced ${config.orderDevicePrinters.length} order device printers`);
      } catch (e) {
        errors.push(`orderDevicePrinters: ${(e as Error).message}`);
      }
    }
    
    if (config.orderDeviceKds) {
      try {
        for (const odk of config.orderDeviceKds) {
          this.db.upsertOrderDeviceKds(odk);
          count++;
        }
        console.log(`  Synced ${config.orderDeviceKds.length} order device KDS`);
      } catch (e) {
        errors.push(`orderDeviceKds: ${(e as Error).message}`);
      }
    }
    
    if (config.printClassRouting) {
      try {
        for (const pcr of config.printClassRouting) {
          this.db.upsertPrintClassRouting(pcr);
          count++;
        }
        console.log(`  Synced ${config.printClassRouting.length} print class routings`);
      } catch (e) {
        errors.push(`printClassRouting: ${(e as Error).message}`);
      }
    }
    
    if (config.terminalDevices) {
      try {
        for (const td of config.terminalDevices) {
          this.db.upsertTerminalDevice(td);
          count++;
        }
        console.log(`  Synced ${config.terminalDevices.length} terminal devices`);
      } catch (e) {
        errors.push(`terminalDevices: ${(e as Error).message}`);
      }
    }
    
    if (config.printAgents) {
      try {
        for (const pa of config.printAgents) {
          this.db.upsertPrintAgent(pa);
          count++;
        }
        console.log(`  Synced ${config.printAgents.length} print agents`);
      } catch (e) {
        errors.push(`printAgents: ${(e as Error).message}`);
      }
    }
    
    if (errors.length > 0) {
      console.error(`  [syncDevices] ${errors.length} category error(s):\n    ${errors.join('\n    ')}`);
    }
    
    return count;
  }
  
  private syncOperations(config: FullConfigResponse): number {
    let count = 0;
    
    if (config.taxGroups) {
      for (const tg of config.taxGroups) {
        this.db.upsertTaxGroup(tg);
        count++;
      }
      console.log(`  Synced ${config.taxGroups.length} tax groups`);
    }
    
    if (config.tenders) {
      for (const tender of config.tenders) {
        this.db.upsertTender(tender);
        count++;
      }
      console.log(`  Synced ${config.tenders.length} tenders`);
    }
    
    if (config.discounts) {
      for (const discount of config.discounts) {
        this.db.upsertDiscount(discount);
        count++;
      }
      console.log(`  Synced ${config.discounts.length} discounts`);
    }
    
    if (config.serviceCharges) {
      for (const sc of config.serviceCharges) {
        this.db.upsertServiceCharge(sc);
        count++;
      }
      console.log(`  Synced ${config.serviceCharges.length} service charges`);
    }
    
    return count;
  }
  
  private syncPosLayouts(config: FullConfigResponse): number {
    let count = 0;
    
    if (config.posLayouts) {
      for (const layout of config.posLayouts) {
        this.db.upsertPosLayout(layout);
        count++;
      }
      console.log(`  Synced ${config.posLayouts.length} POS layouts`);
    }
    
    if (config.posLayoutCells) {
      for (const cell of config.posLayoutCells) {
        this.db.upsertPosLayoutCell(cell);
        count++;
      }
      console.log(`  Synced ${config.posLayoutCells.length} POS layout cells`);
    }
    
    if (config.posLayoutRvcAssignments) {
      for (const assign of config.posLayoutRvcAssignments) {
        this.db.upsertPosLayoutRvcAssignment(assign);
        count++;
      }
      console.log(`  Synced ${config.posLayoutRvcAssignments.length} POS layout RVC assignments`);
    }
    
    return count;
  }
  
  private syncPayments(config: FullConfigResponse): number {
    let count = 0;
    
    if (config.paymentProcessors) {
      for (const pp of config.paymentProcessors) {
        this.db.upsertPaymentProcessor(pp);
        count++;
      }
      console.log(`  Synced ${config.paymentProcessors.length} payment processors`);
    }
    
    if (config.paymentGatewayConfig) {
      for (const pgc of config.paymentGatewayConfig) {
        this.db.upsertPaymentGatewayConfig(pgc);
        count++;
      }
      console.log(`  Synced ${config.paymentGatewayConfig.length} payment gateway configs`);
    }
    
    return count;
  }
  
  private syncLoyalty(config: FullConfigResponse): number {
    let count = 0;
    
    const syncGroup = (label: string, items: any[] | undefined, upsertFn: (item: any) => void) => {
      if (!items) return;
      let synced = 0;
      for (const item of items) {
        try {
          upsertFn.call(this.db, item);
          synced++;
          count++;
        } catch (e) {
          console.error(`  [ConfigSync] Failed to sync ${label} item ${item.id || '?'}: ${(e as Error).message}`);
        }
      }
      console.log(`  Synced ${synced}/${items.length} ${label}`);
    };

    syncGroup('loyalty programs', config.loyaltyPrograms, this.db.upsertLoyaltyProgram);
    syncGroup('loyalty members', config.loyaltyMembers, this.db.upsertLoyaltyMember);
    syncGroup('loyalty enrollments', config.loyaltyMemberEnrollments, this.db.upsertLoyaltyMemberEnrollment);
    syncGroup('loyalty rewards', config.loyaltyRewards, this.db.upsertLoyaltyReward);
    syncGroup('gift cards', config.giftCards, this.db.upsertGiftCard);

    return count;
  }
  
  private syncMisc(config: FullConfigResponse): number {
    let count = 0;
    
    const syncGroup = (label: string, items: any[] | undefined, upsertFn: (item: any) => void) => {
      if (!items) return;
      let synced = 0;
      for (const item of items) {
        try {
          upsertFn.call(this.db, item);
          synced++;
          count++;
        } catch (e) {
          console.error(`  [ConfigSync] Failed to sync ${label} item ${item.id || '?'}: ${(e as Error).message}`);
        }
      }
      console.log(`  Synced ${synced}/${items.length} ${label}`);
    };

    syncGroup('fiscal periods', config.fiscalPeriods, this.db.upsertFiscalPeriod);
    syncGroup('cash drawers', config.cashDrawers, this.db.upsertCashDrawer);
    syncGroup('online order sources', config.onlineOrderSources, this.db.upsertOnlineOrderSource);
    syncGroup('item availability records', config.itemAvailability, this.db.upsertItemAvailability);
    syncGroup('EMC option flags', config.emcOptionFlags, this.db.upsertOptionFlag);
    syncGroup('descriptor sets', config.descriptorSets, this.db.upsertDescriptorSet);
    syncGroup('descriptor logo assets', config.descriptorLogoAssets, this.db.upsertDescriptorLogoAsset);
    syncGroup('ingredient prefixes', config.ingredientPrefixes, this.db.upsertIngredientPrefix);
    syncGroup('menu item recipe ingredients', config.menuItemRecipeIngredients, this.db.upsertMenuItemRecipeIngredient);

    return count;
  }
  
  private syncLabor(config: FullConfigResponse): number {
    let count = 0;
    
    if (config.overtimeRules) {
      for (const rule of config.overtimeRules) {
        this.db.upsertOvertimeRule(rule);
        count++;
      }
      console.log(`  Synced ${config.overtimeRules.length} overtime rules`);
    }
    
    if (config.breakRules) {
      for (const rule of config.breakRules) {
        this.db.upsertBreakRule(rule);
        count++;
      }
      console.log(`  Synced ${config.breakRules.length} break rules`);
    }
    
    if (config.tipRules) {
      for (const rule of config.tipRules) {
        this.db.upsertTipRule(rule);
        count++;
      }
      console.log(`  Synced ${config.tipRules.length} tip rules`);
    }
    
    if (config.tipRuleJobPercentages) {
      for (const trjp of config.tipRuleJobPercentages) {
        this.db.upsertTipRuleJobPercentage(trjp);
        count++;
      }
      console.log(`  Synced ${config.tipRuleJobPercentages.length} tip rule job percentages`);
    }
    
    if (config.minorLaborRules) {
      for (const rule of config.minorLaborRules) {
        this.db.upsertMinorLaborRule(rule);
        count++;
      }
      console.log(`  Synced ${config.minorLaborRules.length} minor labor rules`);
    }
    
    return count;
  }
  
  async syncDelta(): Promise<{ success: boolean; changeCount: number; error?: string }> {
    if (this.syncInProgress) {
      return { success: false, changeCount: 0, error: 'Sync already in progress' };
    }
    
    if (!this.cloud.isConnected()) {
      return { success: false, changeCount: 0, error: 'Cloud not connected' };
    }
    
    if (this.currentVersion === 0) {
      console.log('No previous sync, performing full sync first...');
      const result = await this.syncFull();
      return { success: result.success, changeCount: result.recordCount, error: result.error };
    }
    
    this.syncInProgress = true;
    
    try {
      const delta = await this.cloud.get<DeltaConfigResponse>(
        `/api/sync/config/delta?propertyId=${encodeURIComponent(this.propertyId)}&since=${this.currentVersion}`
      );
      
      if (!delta.changes || delta.changes.length === 0) {
        this.syncInProgress = false;
        return { success: true, changeCount: 0 };
      }
      
      console.log(`Applying ${delta.changes.length} config changes...`);
      
      for (const change of delta.changes) {
        this.applyChange(change);
      }
      
      this.currentVersion = delta.version;
      this.saveSyncState(delta.changes.length);
      
      console.log(`Delta sync complete: ${delta.changes.length} changes, version ${this.currentVersion}`);
      
      return { success: true, changeCount: delta.changes.length };
    } catch (e) {
      const error = (e as Error).message;
      console.error('Delta sync failed:', error);
      return { success: false, changeCount: 0, error };
    } finally {
      this.syncInProgress = false;
    }
  }
  
  private handleRealtimeUpdate(data: any): void {
    if (data.changes) {
      console.log(`Received ${data.changes.length} real-time config updates`);
      for (const change of data.changes) {
        this.applyChange(change);
      }
      if (data.version && data.version > this.currentVersion) {
        this.currentVersion = data.version;
        this.saveSyncState();
      }
    }
  }
  
  private applyChange(change: ConfigChange): void {
    const { entityType, entityId, action, data } = change;
    
    if (action === 'delete') {
      this.deleteEntity(entityType, entityId);
      return;
    }
    
    if (!data) {
      console.warn(`Skipping ${action} for ${entityType} ${entityId}: no data provided`);
      return;
    }
    
    switch (entityType) {
      case 'enterprise':
        this.db.upsertEnterprise(data);
        break;
      case 'property':
        this.db.upsertProperty(data);
        break;
      case 'rvc':
        this.db.upsertRvc(data);
        break;
        
      case 'majorGroup':
        this.db.upsertMajorGroup(data);
        break;
      case 'familyGroup':
        this.db.upsertFamilyGroup(data);
        break;
      case 'slu':
        this.db.upsertSlu(data);
        break;
      case 'menuItem':
        this.db.upsertMenuItem(data);
        break;
      case 'menuItemSlu':
        this.db.upsertMenuItemSlu(data);
        break;
      case 'modifierGroup':
        this.db.upsertModifierGroup(data);
        break;
      case 'modifier':
        this.db.upsertModifier(data);
        break;
      case 'modifierGroupModifier':
        this.db.upsertModifierGroupModifier(data);
        break;
      case 'menuItemModifierGroup':
        this.db.upsertMenuItemModifierGroup(data);
        break;
      case 'printClass':
        this.db.upsertPrintClass(data);
        break;
        
      case 'role':
        this.db.upsertRole(data);
        break;
      case 'privilege':
        this.db.upsertPrivilege(data);
        break;
      case 'rolePrivilege':
        this.db.upsertRolePrivilege(data);
        break;
      case 'employee':
        this.db.upsertEmployee(data);
        break;
      case 'employeeAssignment':
        this.db.upsertEmployeeAssignment(data);
        break;
      case 'jobCode':
        this.db.upsertJobCode(data);
        break;
      case 'employeeJobCode':
        this.db.upsertEmployeeJobCode(data);
        break;
        
      case 'workstation':
        this.db.upsertWorkstation(data);
        break;
      case 'printer':
        this.db.upsertPrinter(data);
        break;
      case 'kdsDevice':
        this.db.upsertKdsDevice(data);
        break;
      case 'orderDevice':
        this.db.upsertOrderDevice(data);
        break;
      case 'orderDevicePrinter':
        this.db.upsertOrderDevicePrinter(data);
        break;
      case 'orderDeviceKds':
        this.db.upsertOrderDeviceKds(data);
        break;
      case 'printClassRouting':
        this.db.upsertPrintClassRouting(data);
        break;
      case 'terminalDevice':
        this.db.upsertTerminalDevice(data);
        break;
        
      case 'taxGroup':
        this.db.upsertTaxGroup(data);
        break;
      case 'tender':
        this.db.upsertTender(data);
        break;
      case 'discount':
        this.db.upsertDiscount(data);
        break;
      case 'serviceCharge':
        this.db.upsertServiceCharge(data);
        break;
        
      case 'posLayout':
        this.db.upsertPosLayout(data);
        break;
      case 'posLayoutCell':
        this.db.upsertPosLayoutCell(data);
        break;
      case 'posLayoutRvcAssignment':
        this.db.upsertPosLayoutRvcAssignment(data);
        break;
        
      case 'paymentProcessor':
        this.db.upsertPaymentProcessor(data);
        break;
        
      case 'loyaltyProgram':
        this.db.upsertLoyaltyProgram(data);
        break;
      case 'loyaltyMember':
        this.db.upsertLoyaltyMember(data);
        break;
      case 'loyaltyMemberEnrollment':
        this.db.upsertLoyaltyMemberEnrollment(data);
        break;
      case 'loyaltyReward':
        this.db.upsertLoyaltyReward(data);
        break;
      case 'giftCard':
        this.db.upsertGiftCard(data);
        break;
        
      case 'fiscalPeriod':
        this.db.upsertFiscalPeriod(data);
        break;
      case 'itemAvailability':
        this.db.upsertItemAvailability(data);
        break;
      case 'emcOptionFlag':
        this.db.upsertOptionFlag(data);
        break;
      case 'cashDrawer':
        this.db.upsertCashDrawer(data);
        break;
      case 'onlineOrderSource':
        this.db.upsertOnlineOrderSource(data);
        break;
        
      case 'paymentGatewayConfig':
        this.db.upsertPaymentGatewayConfig(data);
        break;
      case 'descriptorSet':
        this.db.upsertDescriptorSet(data);
        break;
      case 'descriptorLogoAsset':
        this.db.upsertDescriptorLogoAsset(data);
        break;
      case 'printAgent':
        this.db.upsertPrintAgent(data);
        break;
        
      case 'overtimeRule':
        this.db.upsertOvertimeRule(data);
        break;
      case 'breakRule':
        this.db.upsertBreakRule(data);
        break;
      case 'tipRule':
        this.db.upsertTipRule(data);
        break;
      case 'tipRuleJobPercentage':
        this.db.upsertTipRuleJobPercentage(data);
        break;
      case 'minorLaborRule':
        this.db.upsertMinorLaborRule(data);
        break;
        
      case 'ingredientPrefix':
        this.db.upsertIngredientPrefix(data);
        break;
      case 'menuItemRecipeIngredient':
        this.db.upsertMenuItemRecipeIngredient(data);
        break;
        
      default:
        console.warn(`Unknown config entity type: ${entityType}`);
    }
  }
  
  private deleteEntity(entityType: string, entityId: string): void {
    const softDeleteTables: Record<string, string> = {
      enterprise: 'enterprises',
      property: 'properties',
      rvc: 'rvcs',
      majorGroup: 'major_groups',
      familyGroup: 'family_groups',
      slu: 'slus',
      menuItem: 'menu_items',
      modifierGroup: 'modifier_groups',
      modifier: 'modifiers',
      printClass: 'print_classes',
      role: 'roles',
      employee: 'employees',
      jobCode: 'job_codes',
      workstation: 'workstations',
      printer: 'printers',
      kdsDevice: 'kds_devices',
      orderDevice: 'order_devices',
      taxGroup: 'tax_groups',
      tender: 'tenders',
      discount: 'discounts',
      serviceCharge: 'service_charges',
      posLayout: 'pos_layouts',
      paymentProcessor: 'payment_processors',
      loyaltyProgram: 'loyalty_programs',
      loyaltyMember: 'loyalty_members',
      loyaltyReward: 'loyalty_rewards',
      giftCard: 'gift_cards',
      onlineOrderSource: 'online_order_sources',
      overtimeRule: 'overtime_rules',
      breakRule: 'break_rules',
      tipRule: 'tip_rules',
      minorLaborRule: 'minor_labor_rules',
      printAgent: 'print_agents',
      paymentGatewayConfig: 'payment_gateway_config',
      ingredientPrefix: 'ingredient_prefixes',
    };
    
    const hardDeleteTables: Record<string, string> = {
      menuItemSlu: 'menu_item_slus',
      modifierGroupModifier: 'modifier_group_modifiers',
      menuItemModifierGroup: 'menu_item_modifier_groups',
      privilege: 'privileges',
      rolePrivilege: 'role_privileges',
      employeeAssignment: 'employee_assignments',
      employeeJobCode: 'employee_job_codes',
      orderDevicePrinter: 'order_device_printers',
      orderDeviceKds: 'order_device_kds',
      printClassRouting: 'print_class_routing',
      posLayoutCell: 'pos_layout_cells',
      posLayoutRvcAssignment: 'pos_layout_rvc_assignments',
      terminalDevice: 'terminal_devices',
      loyaltyMemberEnrollment: 'loyalty_member_enrollments',
      tipRuleJobPercentage: 'tip_rule_job_percentages',
      descriptorSet: 'descriptor_sets',
      descriptorLogoAsset: 'descriptor_logo_assets',
      loyaltyTransaction: 'loyalty_transactions',
      loyaltyRedemption: 'loyalty_redemptions',
      giftCardTransaction: 'gift_card_transactions',
      itemAvailability: 'item_availability',
      emcOptionFlag: 'emc_option_flags',
      menuItemRecipeIngredient: 'menu_item_recipe_ingredients',
      fiscalPeriod: 'fiscal_periods',
      drawerAssignment: 'drawer_assignments',
      cashDrawer: 'cash_drawers',
      cashTransaction: 'cash_transactions',
      safeCount: 'safe_counts',
      auditLog: 'audit_logs',
      timePunch: 'time_punches',
      breakSession: 'break_sessions',
      timeEntry: 'time_entries',
      kdsTicket: 'kds_tickets',
      kdsTicketItem: 'kds_ticket_items',
      onlineOrder: 'online_orders',
      check: 'checks',
      round: 'rounds',
      checkItem: 'check_items',
      checkPayment: 'check_payments',
      checkDiscount: 'check_discounts',
      checkServiceCharge: 'check_service_charges',
      refund: 'refunds',
      refundItem: 'refund_items',
      refundPayment: 'refund_payments',
      paymentTransaction: 'payment_transactions',
    };
    
    const softTable = softDeleteTables[entityType];
    if (softTable) {
      this.db.run(`UPDATE ${softTable} SET active = 0, updated_at = datetime('now') WHERE id = ?`, [entityId]);
      console.log(`Soft-deleted ${entityType} ${entityId}`);
      return;
    }
    
    const hardTable = hardDeleteTables[entityType];
    if (hardTable) {
      this.db.run(`DELETE FROM ${hardTable} WHERE id = ?`, [entityId]);
      console.log(`Hard-deleted ${entityType} ${entityId}`);
      return;
    }
    
    console.warn(`Cannot delete unknown entity type: ${entityType}`);
  }
  
  getStatus(): {
    version: number;
    lastSyncAt: string | null;
    isConnected: boolean;
    syncInProgress: boolean;
  } {
    return {
      version: this.currentVersion,
      lastSyncAt: this.lastSyncAt,
      isConnected: this.cloud.isConnected(),
      syncInProgress: this.syncInProgress,
    };
  }
  
  setActiveRvcId(rvcId: string): void {
    this.activeRvcId = rvcId;
  }

  getActiveRvcId(): string | null {
    return this.activeRvcId;
  }

  getMenuItems(): any[] {
    return this.db.getAllMenuItems();
  }
  
  getMenuItem(id: string): any | null {
    return this.db.getMenuItem(id);
  }
  
  getMenuItemWithModifiers(id: string): any | null {
    return this.db.getMenuItemWithModifiers(id);
  }
  
  getMenuItemsBySlu(sluId: string): any[] {
    return this.db.getMenuItemsBySlu(sluId);
  }
  
  getSlus(): any[] {
    return this.db.getSlusByProperty(this.propertyId);
  }
  
  getSlusByRvc(rvcId: string): any[] {
    return this.db.getSlusByRvc(rvcId);
  }
  
  getTaxGroups(): any[] {
    return this.db.getEffectiveTaxGroups(this.propertyId, this.activeRvcId || undefined);
  }
  
  getTenders(): any[] {
    return this.db.getEffectiveTenders(this.propertyId, this.activeRvcId || undefined);
  }
  
  getDiscounts(): any[] {
    return this.db.getEffectiveDiscounts(this.propertyId, this.activeRvcId || undefined);
  }
  
  getServiceCharges(): any[] {
    return this.db.getEffectiveServiceCharges(this.propertyId, this.activeRvcId || undefined);
  }
  
  getEmployees(): any[] {
    return this.db.getEmployeesByProperty(this.propertyId);
  }
  
  getEmployee(id: string): any | null {
    return this.db.getEmployee(id);
  }
  
  getEmployeeByPin(pin: string): any | null {
    return this.db.getEmployeeByPin(pin);
  }
  
  getWorkstations(): any[] {
    return this.db.getWorkstationsByProperty(this.propertyId);
  }
  
  getPrinters(): any[] {
    return this.db.getPrintersByProperty(this.propertyId);
  }
  
  getKdsDevices(): any[] {
    return this.db.getKdsDevicesByProperty(this.propertyId);
  }
  
  getOrderDevices(): any[] {
    return this.db.getOrderDevicesByProperty(this.propertyId);
  }
  
  getPosLayoutForRvc(rvcId: string, orderType?: string): any | null {
    return this.db.getPosLayoutForRvc(rvcId, this.propertyId, orderType);
  }
  
  getPosLayoutCells(layoutId: string): any[] {
    return this.db.getPosLayoutCells(layoutId);
  }
  
  getRoles(): any[] {
    return this.db.getRolesByProperty(this.propertyId);
  }
  
  getPaymentProcessors(): any[] {
    return this.db.getPaymentProcessorsByProperty(this.propertyId);
  }
  
  getPaymentProcessor(id: string): any | null {
    return this.db.getPaymentProcessor(id);
  }
  
  getLoyaltyPrograms(): any[] {
    return this.db.getLoyaltyProgramsByProperty(this.propertyId);
  }
  
  getLoyaltyProgram(id: string): any | null {
    return this.db.getLoyaltyProgram(id);
  }
  
  getLoyaltyMemberByPhone(phone: string): any | null {
    return this.db.getLoyaltyMemberByPhone(phone);
  }
  
  getLoyaltyMemberByEmail(email: string): any | null {
    return this.db.getLoyaltyMemberByEmail(email);
  }
  
  getLoyaltyMemberEnrollments(memberId: string): any[] {
    return this.db.getMemberEnrollments(memberId);
  }
  
  getRvc(id: string): any | null {
    return this.db.getRvc(id);
  }
  
  getRvcs(): any[] {
    return this.db.getRvcsByProperty(this.propertyId);
  }
  
  getProperty(): any | null {
    return this.db.getProperty(this.propertyId);
  }
  
  getMajorGroups(): any[] {
    return this.db.getMajorGroupsByProperty(this.propertyId);
  }
  
  getFamilyGroups(majorGroupId: string): any[] {
    return this.db.getFamilyGroupsByMajorGroup(majorGroupId);
  }
  
  getPrintClasses(): any[] {
    return this.db.getPrintClassesByProperty(this.propertyId);
  }
  
  getJobCodes(): any[] {
    return this.db.getJobCodesByProperty(this.propertyId);
  }
  
  getTerminalDevices(): any[] {
    return this.db.getTerminalDevicesByProperty(this.propertyId);
  }
  
  getTerminalDevice(id: string): any | null {
    return this.db.getTerminalDevice(id);
  }
  
  getFiscalPeriods(limit: number = 30): any[] {
    return this.db.getFiscalPeriodsByProperty(this.propertyId, limit);
  }
  
  getFiscalPeriod(id: string): any | null {
    return this.db.getFiscalPeriod(id);
  }
  
  getActiveFiscalPeriod(): any | null {
    return this.db.getActiveFiscalPeriod(this.propertyId);
  }
  
  getLoyaltyMember(id: string): any | null {
    return this.db.getLoyaltyMember(id);
  }
  
  getOptionFlags(enterpriseId?: string): any[] {
    return this.db.getOptionFlags(enterpriseId);
  }
  
  resolveOptionFlag(
    entityType: string,
    entityId: string,
    optionKey: string,
    scopeChain: { level: string; id: string }[]
  ): string | null {
    return this.db.resolveOptionFlag(entityType, entityId, optionKey, scopeChain);
  }
}

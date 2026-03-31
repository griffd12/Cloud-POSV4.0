import { storage } from "./storage";
import type { EmcOptionFlag, TaxGroup, Tender, Discount, ServiceCharge, BreakRule, OvertimeRule, OrderDevice } from "@shared/schema";

export interface EffectiveConfigOptions {
  enterpriseId: string;
  propertyId?: string;
  rvcId?: string;
}

export interface ResolvedConfig<T = Record<string, unknown>> {
  value: T;
  resolvedFrom: "rvc" | "property" | "enterprise" | "default";
  rvcId?: string;
  propertyId?: string;
  enterpriseId: string;
}

type ScopeLevel = "rvc" | "property" | "enterprise";

function scopePriority(level: string): number {
  if (level === "rvc") return 3;
  if (level === "property") return 2;
  return 1;
}

export class EffectiveConfigService {
  async resolveOptionFlag(
    opts: EffectiveConfigOptions,
    entityType: string,
    entityId: string,
    optionKey: string,
    defaultValue: boolean = false
  ): Promise<ResolvedConfig<boolean>> {
    const allFlags = await storage.listAllOptionFlagsByEnterprise(opts.enterpriseId);

    const matchesBase = (f: EmcOptionFlag) =>
      f.entityType === entityType && f.entityId === entityId && f.optionKey === optionKey;

    const parseValue = (f: EmcOptionFlag): boolean =>
      f.valueText === "true" || f.valueText === "1";

    if (opts.rvcId) {
      const rvcFlag = allFlags.find((f: EmcOptionFlag) => matchesBase(f) && f.scopeLevel === "rvc" && f.scopeId === opts.rvcId);
      if (rvcFlag) {
        return { value: parseValue(rvcFlag), resolvedFrom: "rvc", rvcId: opts.rvcId, propertyId: opts.propertyId, enterpriseId: opts.enterpriseId };
      }
    }

    if (opts.propertyId) {
      const propFlag = allFlags.find((f: EmcOptionFlag) => matchesBase(f) && f.scopeLevel === "property" && f.scopeId === opts.propertyId);
      if (propFlag) {
        return { value: parseValue(propFlag), resolvedFrom: "property", propertyId: opts.propertyId, enterpriseId: opts.enterpriseId };
      }
    }

    const entFlag = allFlags.find((f: EmcOptionFlag) => matchesBase(f) && f.scopeLevel === "enterprise" && f.scopeId === opts.enterpriseId);
    if (entFlag) {
      return { value: parseValue(entFlag), resolvedFrom: "enterprise", enterpriseId: opts.enterpriseId };
    }

    return { value: defaultValue, resolvedFrom: "default", enterpriseId: opts.enterpriseId };
  }

  async resolveAllOptionFlags(
    opts: EffectiveConfigOptions,
    entityType: string,
    entityId: string
  ): Promise<Map<string, ResolvedConfig<boolean>>> {
    const allFlags = await storage.listAllOptionFlagsByEnterprise(opts.enterpriseId);
    const entityFlags = allFlags.filter((f: EmcOptionFlag) => f.entityType === entityType && f.entityId === entityId);

    const result = new Map<string, ResolvedConfig<boolean>>();

    for (const flag of entityFlags) {
      const key = flag.optionKey;
      const level = flag.scopeLevel as ScopeLevel;
      const priority = scopePriority(level);

      if (level === "rvc" && flag.scopeId !== opts.rvcId) continue;
      if (level === "property" && flag.scopeId !== opts.propertyId) continue;

      const existing = result.get(key);
      if (existing) {
        const existingPriority = scopePriority(existing.resolvedFrom);
        if (priority <= existingPriority) continue;
      }

      result.set(key, {
        value: flag.valueText === "true" || flag.valueText === "1",
        resolvedFrom: level,
        rvcId: level === "rvc" ? opts.rvcId : undefined,
        propertyId: level !== "enterprise" ? opts.propertyId : undefined,
        enterpriseId: opts.enterpriseId,
      });
    }

    return result;
  }

  async resolveTaxGroups(opts: EffectiveConfigOptions): Promise<{ taxGroups: TaxGroup[]; resolvedFrom: ScopeLevel }> {
    const allTaxGroups = await storage.getTaxGroups();
    const entScopedGroups = allTaxGroups.filter((tg: TaxGroup) => tg.enterpriseId === opts.enterpriseId);

    if (opts.rvcId) {
      const rvcGroups = entScopedGroups.filter((tg: TaxGroup) => tg.rvcId === opts.rvcId);
      if (rvcGroups.length > 0) return { taxGroups: rvcGroups, resolvedFrom: "rvc" };
    }

    if (opts.propertyId) {
      const propGroups = entScopedGroups.filter((tg: TaxGroup) => tg.propertyId === opts.propertyId && !tg.rvcId);
      if (propGroups.length > 0) return { taxGroups: propGroups, resolvedFrom: "property" };
    }

    return { taxGroups: entScopedGroups.filter((tg: TaxGroup) => !tg.propertyId && !tg.rvcId), resolvedFrom: "enterprise" };
  }

  async resolveServiceCharges(opts: EffectiveConfigOptions): Promise<ServiceCharge[]> {
    const allCharges = await storage.getServiceCharges();

    const applicable = allCharges.filter((sc: ServiceCharge) => {
      if (sc.enterpriseId !== opts.enterpriseId) return false;
      if (opts.rvcId && sc.rvcId === opts.rvcId) return true;
      if (opts.propertyId && sc.propertyId === opts.propertyId && !sc.rvcId) return true;
      if (!sc.propertyId && !sc.rvcId) return true;
      return false;
    });

    const byName = new Map<string, ServiceCharge>();
    for (const sc of applicable) {
      const existing = byName.get(sc.name);
      if (!existing) {
        byName.set(sc.name, sc);
        continue;
      }
      const existingLevel = existing.rvcId ? 3 : existing.propertyId ? 2 : 1;
      const newLevel = sc.rvcId ? 3 : sc.propertyId ? 2 : 1;
      if (newLevel > existingLevel) {
        byName.set(sc.name, sc);
      }
    }

    return Array.from(byName.values());
  }

  async resolveTenders(opts: EffectiveConfigOptions): Promise<Tender[]> {
    const allTenders = await storage.getTenders();
    const entScopedTenders = allTenders.filter((t: Tender) => {
      if (t.enterpriseId && t.enterpriseId !== opts.enterpriseId) return false;
      return true;
    });

    const entOnly = entScopedTenders.filter((t: Tender) => !t.propertyId && !t.rvcId);

    if (opts.rvcId) {
      const rvcTenders = entScopedTenders.filter((t: Tender) => t.rvcId === opts.rvcId);
      const propTenders = opts.propertyId
        ? entScopedTenders.filter((t: Tender) => t.propertyId === opts.propertyId && !t.rvcId)
        : [];
      if (rvcTenders.length > 0) {
        return [...rvcTenders, ...propTenders, ...entOnly];
      }
      if (propTenders.length > 0) {
        return [...propTenders, ...entOnly];
      }
    }

    if (opts.propertyId) {
      const propTenders = entScopedTenders.filter((t: Tender) => t.propertyId === opts.propertyId && !t.rvcId);
      if (propTenders.length > 0) {
        return [...propTenders, ...entOnly];
      }
    }

    return entOnly;
  }

  async resolveDiscounts(opts: EffectiveConfigOptions): Promise<Discount[]> {
    const allDiscounts = await storage.getDiscounts();
    const applicable = allDiscounts.filter((d: Discount) => {
      if (d.enterpriseId && d.enterpriseId !== opts.enterpriseId) return false;
      return true;
    });

    const entOnly = applicable.filter((d: Discount) => !d.propertyId && !d.rvcId);

    if (opts.rvcId) {
      const rvcDiscounts = applicable.filter((d: Discount) => d.rvcId === opts.rvcId);
      const propDiscounts = opts.propertyId
        ? applicable.filter((d: Discount) => d.propertyId === opts.propertyId && !d.rvcId)
        : [];
      if (rvcDiscounts.length > 0) {
        return [...rvcDiscounts, ...propDiscounts, ...entOnly];
      }
      if (propDiscounts.length > 0) {
        return [...propDiscounts, ...entOnly];
      }
    }

    if (opts.propertyId) {
      const propDiscounts = applicable.filter((d: Discount) => d.propertyId === opts.propertyId && !d.rvcId);
      if (propDiscounts.length > 0) {
        return [...propDiscounts, ...entOnly];
      }
    }

    return entOnly;
  }

  async resolveBreakRules(opts: EffectiveConfigOptions): Promise<BreakRule[]> {
    if (!opts.propertyId) return [];
    return storage.getBreakRules(opts.propertyId);
  }

  async resolveOvertimeRules(opts: EffectiveConfigOptions): Promise<OvertimeRule[]> {
    if (!opts.propertyId) return [];
    return storage.getOvertimeRules(opts.propertyId);
  }

  async resolvePrintClassRouting(opts: EffectiveConfigOptions, printClassId: string) {
    if (opts.rvcId) {
      const rvcRouting = await storage.getPrintClassRouting(printClassId, opts.propertyId, opts.rvcId);
      if (rvcRouting.length > 0) return rvcRouting;
    }

    if (opts.propertyId) {
      const propRouting = await storage.getPrintClassRouting(printClassId, opts.propertyId);
      if (propRouting.length > 0) return propRouting;
    }

    return storage.getPrintClassRouting(printClassId);
  }

  async getAllTaxGroups(): Promise<TaxGroup[]> {
    return storage.getTaxGroups();
  }

  async getAllTenders(rvcId?: string): Promise<Tender[]> {
    return storage.getTenders(rvcId);
  }

  async getAllServiceCharges(): Promise<ServiceCharge[]> {
    return storage.getServiceCharges();
  }

  async getAllDiscounts(): Promise<Discount[]> {
    return storage.getDiscounts();
  }

  async getAllBreakRules(propertyId: string): Promise<BreakRule[]> {
    return storage.getBreakRules(propertyId);
  }

  async getAllOvertimeRules(propertyId: string): Promise<OvertimeRule[]> {
    return storage.getOvertimeRules(propertyId);
  }

  async resolveOrderDevices(opts: EffectiveConfigOptions): Promise<OrderDevice[]> {
    const allDevices = await storage.getOrderDevices();
    return allDevices.filter((d: OrderDevice) => {
      if (opts.propertyId && d.propertyId === opts.propertyId) return true;
      return false;
    });
  }

  async resolveMenuItems(opts: EffectiveConfigOptions) {
    const allItems = await storage.getMenuItems(opts.rvcId);
    return allItems;
  }

  filterVisibleConfig<T>(
    opts: EffectiveConfigOptions,
    data: T[],
    getScopeId: (item: T) => { rvcId?: string | null; propertyId?: string | null }
  ): T[] {
    return data.filter(item => {
      const scope = getScopeId(item);
      if (opts.rvcId && scope.rvcId === opts.rvcId) return true;
      if (opts.propertyId && scope.propertyId === opts.propertyId && !scope.rvcId) return true;
      if (!scope.propertyId && !scope.rvcId) return true;
      return false;
    });
  }

  filterByEnterpriseScope<T extends { enterpriseId?: string | null; propertyId?: string | null; rvcId?: string | null }>(
    data: T[],
    enterpriseId: string,
    propertyIds: Set<string>,
    rvcIds: Set<string>
  ): T[] {
    return data.filter(item => {
      if (item.enterpriseId === enterpriseId) return true;
      if (item.propertyId && propertyIds.has(item.propertyId)) return true;
      if (item.rvcId && rvcIds.has(item.rvcId)) return true;
      return false;
    });
  }

  async resolveConfigForScope<T>(
    opts: EffectiveConfigOptions,
    getter: () => Promise<T[]>,
    getScopeId: (item: T) => { rvcId?: string | null; propertyId?: string | null }
  ): Promise<{ items: T[]; resolvedFrom: ScopeLevel }> {
    const allItems = await getter();
    const scoped: { rvc: T[]; property: T[]; enterprise: T[] } = { rvc: [], property: [], enterprise: [] };

    for (const item of allItems) {
      const scope = getScopeId(item);
      if (opts.rvcId && scope.rvcId === opts.rvcId) {
        scoped.rvc.push(item);
      } else if (opts.propertyId && scope.propertyId === opts.propertyId && !scope.rvcId) {
        scoped.property.push(item);
      } else if (!scope.propertyId && !scope.rvcId) {
        scoped.enterprise.push(item);
      }
    }

    if (scoped.rvc.length > 0) return { items: scoped.rvc, resolvedFrom: "rvc" };
    if (scoped.property.length > 0) return { items: scoped.property, resolvedFrom: "property" };
    return { items: scoped.enterprise, resolvedFrom: "enterprise" };
  }
}

export const effectiveConfig = new EffectiveConfigService();

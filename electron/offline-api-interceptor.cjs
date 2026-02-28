const crypto = require('crypto');
const { appLogger } = require('./logger.cjs');

class OfflineApiInterceptor {
  constructor(offlineDb) {
    this.db = offlineDb;
    this.isOffline = false;
    this.config = {};
    this.serviceHostUrl = null;
    this.capsConfig = null;
    this._connectionMode = 'green';
  }

  setOffline(offline) {
    const changed = this.isOffline !== offline;
    this.isOffline = offline;
    if (changed) {
      appLogger.info('Interceptor', `Offline mode ${offline ? 'ENABLED' : 'DISABLED'}`);
    }
  }

  setConfig(config) {
    this.config = config || {};
  }

  setServiceHostUrl(url) {
    this.serviceHostUrl = url || null;
    appLogger.info('Interceptor', `Service host URL set: ${url || 'none'}`);
  }

  setCapsConfig(capsConfig) {
    this.capsConfig = capsConfig || null;
  }

  setConnectionMode(mode) {
    const changed = this._connectionMode !== mode;
    this._connectionMode = mode;
    if (changed) {
      appLogger.info('Interceptor', `Connection mode changed to: ${mode.toUpperCase()}`);
    }
  }

  getConnectionMode() {
    return this._connectionMode;
  }

  getServiceHostUrl() {
    return this.serviceHostUrl;
  }

  canHandleOffline(method, pathname) {
    if (method === 'GET') {
      const readEndpoints = [
        /^\/api\/menu-items/,
        /^\/api\/modifier-groups/,
        /^\/api\/modifiers/,
        /^\/api\/condiment-groups/,
        /^\/api\/combo-meals/,
        /^\/api\/employees/,
        /^\/api\/tax-rates/,
        /^\/api\/tax-groups/,
        /^\/api\/discounts/,
        /^\/api\/tender-types/,
        /^\/api\/tenders/,
        /^\/api\/order-types/,
        /^\/api\/service-charges/,
        /^\/api\/major-groups/,
        /^\/api\/family-groups/,
        /^\/api\/menu-item-classes/,
        /^\/api\/menu-item-availability/,
        /^\/api\/item-availability/,
        /^\/api\/revenue-centers/,
        /^\/api\/rvcs/,
        /^\/api\/slus/,
        /^\/api\/properties/,
        /^\/api\/printers/,
        /^\/api\/workstations/,
        /^\/api\/checks/,
        /^\/api\/pos-layouts/,
        /^\/api\/health/,
        /^\/api\/auth\/manager-approval/,
        /^\/api\/loyalty-members/,
        /^\/api\/gift-cards/,
        /^\/api\/offline\//,
        /^\/api\/kds-devices/,
        /^\/api\/order-devices/,
        /^\/api\/print-classes/,
        /^\/api\/print-class-routings/,
        /^\/api\/ingredient-prefixes/,
        /^\/api\/pos\/modifier-map/,
        /^\/api\/sync\//,
        /^\/api\/auth\/offline-employees/,
        /^\/api\/break-rules/,
        /^\/api\/time-punches\/status/,
        /^\/api\/employees\/[^/]+\/job-codes\/details/,
        /^\/api\/system-status/,
        /^\/api\/option-flags/,
      ];
      return readEndpoints.some(re => re.test(pathname));
    }

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const writeEndpoints = [
        /^\/api\/auth\/login/,
        /^\/api\/auth\/pin/,
        /^\/api\/checks/,
        /^\/api\/check-items/,
        /^\/api\/payments/,
        /^\/api\/time-punches/,
        /^\/api\/time-clock/,
        /^\/api\/print-jobs/,
        /^\/api\/employees\/.*\/authenticate/,
        /^\/api\/auth\/manager-approval/,
        /^\/api\/system-status/,
        /^\/api\/registered-devices\/heartbeat/,
        /^\/api\/gift-cards/,
        /^\/api\/loyalty/,
      ];
      return writeEndpoints.some(re => re.test(pathname));
    }

    if (method === 'DELETE') {
      const deleteEndpoints = [
        /^\/api\/checks\/[^/]+$/,
        /^\/api\/check-items\/[^/]+$/,
      ];
      return deleteEndpoints.some(re => re.test(pathname));
    }

    return false;
  }

  handleRequest(method, pathname, query, body) {
    if (method === 'GET') {
      return this.handleGet(pathname, query);
    } else if (method === 'POST') {
      return this.handlePost(pathname, body);
    } else if (method === 'PUT' || method === 'PATCH') {
      return this.handleUpdate(pathname, body);
    } else if (method === 'DELETE') {
      return this.handleDelete(pathname);
    }
    return null;
  }

  handleGet(pathname, query) {
    if (pathname === '/api/health') {
      return {
        status: 200,
        data: { status: 'offline', mode: 'offline', timestamp: new Date().toISOString(), offlineMode: true },
      };
    }

    if (pathname === '/api/auth/offline-employees') {
      const employees = this.db.getEntityList('employees', this.config.enterpriseId);
      const mapped = employees.map(emp => ({
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        pinHash: emp.pinHash,
        posPin: emp.posPin,
        roleId: emp.roleId,
        roleName: emp.roleName,
        active: emp.active,
      }));
      return { status: 200, data: mapped };
    }

    if (pathname.match(/^\/api\/break-rules/)) {
      return { status: 200, data: [] };
    }

    const timePunchStatusMatch = pathname.match(/^\/api\/time-punches\/status\/([^/]+)$/);
    if (timePunchStatusMatch) {
      return {
        status: 200,
        data: {
          status: 'clocked_in',
          isClockedIn: true,
          lastPunch: null,
          activeBreak: null,
          clockedInAt: new Date().toISOString(),
          todayTimecard: null,
        },
      };
    }

    if (pathname === '/api/time-punches/status') {
      return {
        status: 200,
        data: {
          status: 'clocked_in',
          isClockedIn: true,
          lastPunch: null,
          activeBreak: null,
          clockedInAt: new Date().toISOString(),
          todayTimecard: null,
        },
      };
    }

    const jobCodesDetailsMatch = pathname.match(/^\/api\/employees\/[^/]+\/job-codes\/details$/);
    if (jobCodesDetailsMatch) {
      return { status: 200, data: [] };
    }

    const entityMap = {
      '/api/menu-items': 'menu_items',
      '/api/modifier-groups': 'modifier_groups',
      '/api/modifiers': 'modifiers',
      '/api/condiment-groups': 'condiment_groups',
      '/api/combo-meals': 'combo_meals',
      '/api/employees': 'employees',
      '/api/tax-rates': 'tax_rates',
      '/api/tax-groups': 'tax_rates',
      '/api/discounts': 'discounts',
      '/api/tender-types': 'tender_types',
      '/api/tenders': 'tender_types',
      '/api/order-types': 'order_types',
      '/api/service-charges': 'service_charges',
      '/api/major-groups': 'major_groups',
      '/api/family-groups': 'family_groups',
      '/api/menu-item-classes': 'menu_item_classes',
      '/api/menu-item-availability': 'menu_item_availability',
      '/api/revenue-centers': 'revenue_centers',
      '/api/rvcs': 'revenue_centers',
      '/api/properties': 'properties',
      '/api/printers': 'printers',
      '/api/workstations': 'workstations',
      '/api/kds-devices': 'kds_devices',
      '/api/order-devices': 'order_devices',
      '/api/print-classes': 'print_classes',
      '/api/print-class-routings': 'print_class_routings',
      '/api/ingredient-prefixes': 'ingredient_prefixes',
      '/api/sync/modifier-group-modifiers': 'modifier_group_modifiers',
      '/api/sync/menu-item-modifier-groups': 'menu_item_modifier_groups',
      '/api/sync/order-device-printers': 'order_device_printers',
      '/api/sync/order-device-kds': 'order_device_kds',
      '/api/sync/menu-item-recipe-ingredients': 'menu_item_recipe_ingredients',
    };

    const wsContextMatch = pathname.match(/^\/api\/workstations\/([^/]+)\/context$/);
    if (wsContextMatch) {
      const wsId = wsContextMatch[1];
      const workstation = this.db.getEntity('workstations', wsId);
      const propertyId = this.config.propertyId || query?.propertyId;
      const rvcs = this.db.getEntityList('revenue_centers', null)
        .filter(r => !propertyId || r.propertyId === propertyId);
      const property = propertyId ? this.db.getEntity('properties', propertyId) : null;
      return {
        status: 200,
        data: {
          workstation: workstation || { id: wsId, name: 'Offline Workstation' },
          rvcs: rvcs || [],
          property: property || (propertyId ? { id: propertyId, name: 'Offline Property' } : null),
          offlineMode: true,
        },
      };
    }

    const sluMatch = pathname.match(/^\/api\/slus/);
    if (sluMatch) {
      const rvcId = query?.rvcId || this.config.rvcId;
      const cacheKey = rvcId ? `slus_${rvcId}` : 'slus';
      return { status: 200, data: this.db.getCachedConfig(cacheKey) || [] };
    }

    const rvcConfigMatch = pathname.match(/^\/api\/rvcs\/([^/]+)$/);
    if (rvcConfigMatch) {
      const rvcId = rvcConfigMatch[1];
      const cached = this.db.getCachedConfig(`rvc_config_${rvcId}`);
      if (cached) return { status: 200, data: cached };
      const entity = this.db.getEntity('revenue_centers', rvcId);
      if (entity) return { status: 200, data: entity };
      return { status: 404, data: { message: 'RVC not found (offline)' } };
    }

    const posLayoutDefaultMatch = pathname.match(/^\/api\/pos-layouts\/default\/([^/]+)$/);
    if (posLayoutDefaultMatch) {
      const rvcId = posLayoutDefaultMatch[1];
      const layout = this.db.getCachedConfig(`posLayout_default_${rvcId}`) || this.db.getCachedConfig(`posLayout_${rvcId}`);
      return { status: 200, data: layout || null };
    }

    const posLayoutCellsMatch = pathname.match(/^\/api\/pos-layouts\/([^/]+)\/cells$/);
    if (posLayoutCellsMatch) {
      const layoutId = posLayoutCellsMatch[1];
      const cells = this.db.getCachedConfig(`posLayoutCells_${layoutId}`);
      return { status: 200, data: cells || [] };
    }

    const checkPaymentsMatch = pathname.match(/^\/api\/checks\/([^/]+)\/payments$/);
    if (checkPaymentsMatch) {
      const checkId = checkPaymentsMatch[1];
      const check = this.db.getOfflineCheck(checkId);
      if (check) {
        const payments = check.payments || [];
        const paidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        return { status: 200, data: { payments, paidAmount } };
      }
      return { status: 200, data: { payments: [], paidAmount: 0 } };
    }

    if (pathname === '/api/item-availability' || pathname.match(/^\/api\/item-availability/)) {
      return { status: 200, data: [] };
    }

    if (pathname === '/api/checks/open') {
      const rvcId = query?.rvcId || this.config.rvcId;
      const checks = this.db.getOfflineChecks(rvcId, 'open');
      return { status: 200, data: checks };
    }

    if (pathname === '/api/checks/locks') {
      return { status: 200, data: {} };
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/full-details$/)) {
      const detailMatch = pathname.match(/^\/api\/checks\/([^/]+)\/full-details$/);
      if (detailMatch) {
        const check = this.db.getOfflineCheck(detailMatch[1]);
        if (check) return { status: 200, data: check };
        return { status: 404, data: { message: 'Check not found (offline)' } };
      }
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/discounts$/)) {
      const discMatch = pathname.match(/^\/api\/checks\/([^/]+)\/discounts$/);
      if (discMatch) {
        const check = this.db.getOfflineCheck(discMatch[1]);
        return { status: 200, data: check?.discounts || [] };
      }
    }

    if (pathname.match(/^\/api\/auth\/manager-approval$/)) {
      return { status: 503, data: { error: 'Manager approval unavailable in offline mode' } };
    }

    if (pathname.match(/^\/api\/loyalty-members/)) {
      return { status: 200, data: null };
    }

    if (pathname.match(/^\/api\/gift-cards/)) {
      return { status: 503, data: { error: 'Gift card lookup requires a cloud connection', offline: true } };
    }

    if (pathname === '/api/pos/modifier-map' || (pathname === '/api/modifier-groups' && query?.menuItemId)) {
      const allLinkages = this.db.getEntityList('menu_item_modifier_groups', null);
      const allGroups = this.db.getEntityList('modifier_groups', null);
      const allModLinkages = this.db.getEntityList('modifier_group_modifiers', null);
      const allModifiers = this.db.getEntityList('modifiers', null);

      const groupMap = {};
      for (const g of allGroups) { groupMap[g.id] = g; }
      const modMap = {};
      for (const m of allModifiers) { modMap[m.id] = m; }

      const modsByGroup = {};
      for (const link of allModLinkages) {
        if (!modsByGroup[link.modifierGroupId]) modsByGroup[link.modifierGroupId] = [];
        const mod = modMap[link.modifierId];
        if (mod) {
          modsByGroup[link.modifierGroupId].push({
            ...mod,
            isDefault: link.isDefault || false,
            displayOrder: link.displayOrder || 0,
          });
        }
      }
      for (const gid in modsByGroup) {
        modsByGroup[gid].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      }

      if (pathname === '/api/pos/modifier-map') {
        const result = {};
        for (const link of allLinkages) {
          const miId = link.menuItemId;
          const group = groupMap[link.modifierGroupId];
          if (!group) continue;
          if (!result[miId]) result[miId] = [];
          result[miId].push({
            ...group,
            modifiers: modsByGroup[group.id] || [],
            displayOrder: link.displayOrder || 0,
          });
        }
        for (const miId in result) {
          result[miId].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
        }
        return { status: 200, data: result };
      } else {
        const menuItemId = query.menuItemId;
        const filteredLinkages = allLinkages
          .filter(l => l.menuItemId === menuItemId)
          .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

        const result = filteredLinkages
          .map(link => {
            const group = groupMap[link.modifierGroupId];
            if (!group) return null;
            return {
              ...group,
              modifiers: modsByGroup[group.id] || [],
            };
          })
          .filter(Boolean);
        return { status: 200, data: result };
      }
    }

    if (pathname === '/api/option-flags' || pathname.match(/^\/api\/option-flags/)) {
      const enterpriseId = query?.enterpriseId || this.config.enterpriseId;
      const flags = this.db.getOptionFlags(enterpriseId);
      return { status: 200, data: flags };
    }

    if (pathname === '/api/offline/sales-report') {
      const businessDate = query?.date || new Date().toISOString().split('T')[0];
      const rvcId = query?.rvcId || this.config.rvcId;
      return { status: 200, data: this.db.getLocalSalesData(businessDate, rvcId) };
    }

    if (pathname === '/api/offline/stats') {
      return { status: 200, data: this.db.getStats() };
    }

    const idMatch = pathname.match(/^(\/api\/[\w-]+)\/([a-f0-9-]+)$/);
    if (idMatch) {
      const basePath = idMatch[1];
      const id = idMatch[2];
      const table = entityMap[basePath];
      if (table) {
        const entity = this.db.getEntity(table, id);
        if (entity) return { status: 200, data: entity };
        return { status: 404, data: { message: 'Not found (offline)' } };
      }
    }

    const table = entityMap[pathname];
    if (table) {
      const enterpriseId = query?.enterpriseId;
      const data = this.db.getEntityList(table, enterpriseId);
      return { status: 200, data };
    }

    if (pathname.startsWith('/api/checks')) {
      const rvcId = query?.rvcId;
      const status = query?.status;
      const checks = this.db.getOfflineChecks(rvcId, status);
      return { status: 200, data: checks };
    }

    appLogger.debug('Interceptor', `No offline handler for GET ${pathname}`);
    return null;
  }

  handlePost(pathname, body) {
    if (pathname === '/api/auth/login' || pathname === '/api/auth/login/') {
      return this.authenticateByLogin(body);
    }

    if (pathname === '/api/auth/pin' || pathname === '/api/auth/pin/') {
      return this.authenticateByPin(body);
    }

    if (pathname === '/api/checks' || pathname === '/api/checks/') {
      return this.createOfflineCheck(body);
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/items/)) {
      return this.addOfflineCheckItem(pathname, body);
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/payments/)) {
      const checkIdMatch = pathname.match(/^\/api\/checks\/([^/]+)\/payments/);
      if (checkIdMatch) {
        return this.createOfflinePayment({ ...body, checkId: checkIdMatch[1] });
      }
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/unlock/)) {
      return { status: 200, data: { success: true } };
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/lock/)) {
      return { status: 200, data: { success: true, offline: true } };
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/send/)) {
      const sendCheckMatch = pathname.match(/^\/api\/checks\/([^/]+)\/send/);
      if (sendCheckMatch) {
        const checkId = sendCheckMatch[1];
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          if (check.items) {
            check.items.forEach(item => { item.sent = true; });
          }
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
          this.db.queueOperation('send_check', `/api/checks/${checkId}/send`, 'POST', body || {}, 2);
        }
        return { status: 202, data: { message: 'Order sent (offline)', offline: true } };
      }
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/print/)) {
      const printCheckMatch = pathname.match(/^\/api\/checks\/([^/]+)\/print/);
      if (printCheckMatch) {
        const checkId = printCheckMatch[1];
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          this.db.queueOperation('print_check', `/api/checks/${checkId}/print`, 'POST', body || {}, 3);
        }
        return { status: 202, data: { message: 'Print queued for sync (offline)', offline: true } };
      }
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/discount/)) {
      const discountMatch = pathname.match(/^\/api\/checks\/([^/]+)\/discount/);
      if (discountMatch) {
        const checkId = discountMatch[1];
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          if (!check.discounts) check.discounts = [];
          check.discounts.push(body);
          const discountAmt = parseFloat(body.amount) || 0;
          if (!isNaN(discountAmt) && discountAmt > 0) {
            check.discountTotal = ((parseFloat(check.discountTotal) || 0) + discountAmt).toFixed(2);
            const subtotal = parseFloat(check.subtotal) || 0;
            const taxTotal = parseFloat(check.taxTotal) || 0;
            const newTotal = subtotal - (parseFloat(check.discountTotal) || 0) + taxTotal;
            check.total = (newTotal < 0 ? 0 : newTotal).toFixed(2);
          }
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
          this.db.queueOperation('check_discount', `/api/checks/${checkId}/discount`, 'POST', body, 2);
        }
        return { status: 200, data: check || { message: 'Discount applied (offline)', offline: true } };
      }
    }

    if (pathname.match(/^\/api\/registered-devices\/heartbeat/)) {
      return { status: 200, data: { status: 'offline', offline: true } };
    }

    if (pathname.match(/^\/api\/system-status\/workstation\/heartbeat/) || pathname.match(/^\/api\/system-status/)) {
      return { status: 200, data: { status: 'offline', offline: true } };
    }

    if (pathname.match(/^\/api\/gift-cards/)) {
      return { status: 503, data: { error: 'Gift card operations require a cloud connection', offline: true } };
    }

    if (pathname.match(/^\/api\/loyalty/)) {
      return { status: 503, data: { error: 'Loyalty features require a cloud connection', offline: true } };
    }

    if (pathname === '/api/payments' || pathname === '/api/payments/') {
      return this.createOfflinePayment(body);
    }

    if (pathname.match(/^\/api\/employees\/[^/]+\/authenticate/)) {
      return this.authenticateOffline(pathname, body);
    }

    if (pathname === '/api/auth/manager-approval') {
      return { status: 503, data: { error: 'Manager approval unavailable in offline mode' } };
    }

    if (pathname === '/api/time-clock/punch' || pathname.match(/^\/api\/time-punches/)) {
      return this.handleOfflineTimePunch(body);
    }

    if (pathname === '/api/print-jobs' || pathname === '/api/print-jobs/') {
      return this.queueOfflinePrintJob(body);
    }

    this.db.queueOperation('offline_post', pathname, 'POST', body, 5);
    return { status: 202, data: { message: 'Queued for sync', offline: true } };
  }

  handleUpdate(pathname, body) {
    const checkMatch = pathname.match(/^\/api\/checks\/([a-f0-9-]+)$/);
    if (checkMatch) {
      return this.updateOfflineCheck(checkMatch[1], body);
    }

    this.db.queueOperation('offline_update', pathname, 'PATCH', body, 5);
    return { status: 202, data: { message: 'Queued for sync', offline: true } };
  }

  createOfflineCheck(body) {
    const id = `offline_${crypto.randomUUID()}`;
    const checkData = {
      id,
      rvcId: body.rvcId,
      employeeId: body.employeeId,
      customerId: body.customerId || null,
      orderType: body.orderType || 'dine-in',
      status: 'open',
      subtotal: '0.00',
      taxTotal: '0.00',
      discountTotal: '0.00',
      total: '0.00',
      guestCount: body.guestCount || 1,
      items: [],
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isOffline: true,
    };

    const check = this.db.createCheckAtomic(body.rvcId, checkData);
    if (!check) {
      return { status: 500, data: { message: 'Failed to create offline check' } };
    }
    this.db.queueOperation('create_check', '/api/checks', 'POST', body, 1);

    return { status: 201, data: check };
  }

  addOfflineCheckItem(pathname, body) {
    const checkIdMatch = pathname.match(/^\/api\/checks\/([^/]+)\/items/);
    if (!checkIdMatch) return null;

    const checkId = checkIdMatch[1];
    const check = this.db.getOfflineCheck(checkId);
    if (!check) return { status: 404, data: { message: 'Check not found (offline)' } };

    const itemId = `offline_item_${crypto.randomUUID()}`;
    const item = {
      id: itemId,
      checkId,
      menuItemId: body.menuItemId,
      menuItemName: body.menuItemName,
      quantity: body.quantity || 1,
      unitPrice: body.unitPrice || '0.00',
      totalPrice: body.totalPrice || body.unitPrice || '0.00',
      modifiers: body.modifiers || [],
      condiments: body.condiments || [],
      seatNumber: body.seatNumber || 1,
      createdAt: new Date().toISOString(),
    };

    if (!check.items) check.items = [];
    check.items.push(item);

    let subtotal = 0;
    check.items.forEach(i => {
      subtotal += parseFloat(i.totalPrice || i.unitPrice || 0) * (i.quantity || 1);
    });
    check.subtotal = subtotal.toFixed(2);

    let taxTotal = 0;
    try {
      const taxRates = this.db.getEntityList('tax_rates', null);
      if (taxRates && taxRates.length > 0) {
        const defaultRate = taxRates.find(t => t.isDefault) || taxRates[0];
        if (defaultRate && defaultRate.rate) {
          taxTotal = subtotal * (parseFloat(defaultRate.rate) / 100);
        }
      }
    } catch (e) {
      appLogger.debug('Interceptor', `Tax calc fallback: ${e.message}`);
    }
    check.taxTotal = taxTotal.toFixed(2);
    const discountTotal = parseFloat(check.discountTotal) || 0;
    check.total = Math.max(0, subtotal - discountTotal + taxTotal).toFixed(2);
    check.updatedAt = new Date().toISOString();

    this.db.saveOfflineCheck(check);
    this.db.queueOperation('add_check_item', `/api/checks/${checkId}/items`, 'POST', body, 2);

    return { status: 201, data: item };
  }

  updateOfflineCheck(checkId, body) {
    const check = this.db.getOfflineCheck(checkId);
    if (!check) return { status: 404, data: { message: 'Check not found (offline)' } };

    Object.assign(check, body, { updatedAt: new Date().toISOString() });
    this.db.saveOfflineCheck(check);
    this.db.queueOperation('update_check', `/api/checks/${checkId}`, 'PATCH', body, 2);

    return { status: 200, data: check };
  }

  createOfflinePayment(body) {
    const paymentId = `offline_pay_${crypto.randomUUID()}`;
    const payment = {
      id: paymentId,
      checkId: body.checkId,
      tenderId: body.tenderId,
      tenderName: body.tenderName,
      amount: body.amount,
      tipAmount: body.tipAmount || '0.00',
      changeAmount: body.changeAmount || '0.00',
      paidAt: new Date().toISOString(),
      isOffline: true,
    };

    this.db.saveOfflinePayment(payment);

    const check = this.db.getOfflineCheck(body.checkId);
    if (check) {
      if (!check.payments) check.payments = [];
      check.payments.push(payment);

      let totalPaid = 0;
      check.payments.forEach(p => totalPaid += parseFloat(p.amount || 0));
      const totalDue = parseFloat(check.total || check.subtotal || 0);
      if (totalPaid >= totalDue) {
        check.status = 'closed';
        check.closedAt = new Date().toISOString();
      }
      check.updatedAt = new Date().toISOString();
      this.db.saveOfflineCheck(check);
    }

    this.db.queueOperation('create_payment', '/api/payments', 'POST', body, 1);

    return { status: 201, data: payment };
  }

  authenticateByPin(body) {
    const pin = body?.pin;
    if (!pin) {
      return { status: 400, data: { success: false, message: 'PIN required' } };
    }

    const employees = this.db.getEntityList('employees', this.config.enterpriseId);
    appLogger.info('Interceptor', `Offline PIN auth attempt, ${employees.length} employees in cache`);
    const employee = employees.find(emp => {
      if (emp.pinHash === pin) return true;
      if (emp.pin === pin) return true;
      if (emp.posPin === pin) return true;
      return false;
    });

    if (employee) {
      appLogger.info('Interceptor', `Offline PIN auth SUCCESS: ${employee.firstName} ${employee.lastName}`);
      return {
        status: 200,
        data: {
          success: true,
          employee,
          privileges: (employee.privileges && employee.privileges.length > 0)
            ? employee.privileges
            : (employee.rolePrivileges && employee.rolePrivileges.length > 0)
              ? employee.rolePrivileges
              : [
                  'fast_transaction', 'send_to_kitchen', 'void_unsent', 'void_sent',
                  'apply_discount', 'admin_access', 'kds_access', 'manager_approval'
                ],
          offlineAuth: true,
        },
      };
    }

    return { status: 401, data: { success: false, message: 'Invalid PIN (offline)' } };
  }

  authenticateByLogin(body) {
    const pin = body?.pin;
    if (!pin) {
      return { status: 400, data: { message: 'PIN required' } };
    }

    const employees = this.db.getEntityList('employees', this.config.enterpriseId);
    appLogger.info('Interceptor', `Offline login auth attempt, ${employees.length} employees in cache`);
    const employee = employees.find(emp => {
      if (emp.pinHash === pin) return true;
      if (emp.pin === pin) return true;
      if (emp.posPin === pin) return true;
      return false;
    });

    if (employee) {
      appLogger.info('Interceptor', `Offline login auth SUCCESS: ${employee.firstName} ${employee.lastName}`);
      return {
        status: 200,
        data: {
          employee: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            pinHash: employee.pinHash,
            roleId: employee.roleId,
            roleName: employee.roleName,
            active: employee.active !== undefined ? employee.active : true,
            jobTitle: employee.jobTitle || null,
            enterpriseId: employee.enterpriseId || null,
          },
          privileges: (employee.privileges && employee.privileges.length > 0)
            ? employee.privileges
            : (employee.rolePrivileges && employee.rolePrivileges.length > 0)
              ? employee.rolePrivileges
              : [
                  'fast_transaction', 'send_to_kitchen', 'void_unsent', 'void_sent',
                  'apply_discount', 'admin_access', 'kds_access', 'manager_approval'
                ],
          salariedBypass: true,
          bypassJobCode: null,
          device: null,
          offlineAuth: true,
        },
      };
    }

    return { status: 401, data: { message: 'Invalid PIN (offline)' } };
  }

  authenticateOffline(pathname, body) {
    const employeeIdMatch = pathname.match(/^\/api\/employees\/([^/]+)\/authenticate/);
    if (!employeeIdMatch) return null;

    const pin = body.pin;
    const employees = this.db.getEntityList('employees');

    const employee = employees.find(emp => {
      if (emp.pinHash === pin) return true;
      if (emp.pin === pin) return true;
      if (emp.posPin === pin) return true;
      return false;
    });

    if (employee) {
      return {
        status: 200,
        data: {
          success: true,
          employee: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            roleId: employee.roleId,
            roleName: employee.roleName,
            jobTitle: employee.jobTitle,
          },
          offlineAuth: true,
        },
      };
    }

    return {
      status: 401,
      data: { success: false, message: 'Invalid PIN (offline authentication)' },
    };
  }

  handleOfflineTimePunch(body) {
    const punchId = `offline_punch_${crypto.randomUUID()}`;
    const punch = {
      id: punchId,
      employeeId: body.employeeId,
      punchType: body.punchType || 'clock_in',
      punchTime: new Date().toISOString(),
      isOffline: true,
    };

    this.db.saveOfflineTimePunch(punch);
    this.db.queueOperation('time_punch', '/api/time-clock/punch', 'POST', body, 3);

    return { status: 201, data: punch };
  }

  queueOfflinePrintJob(body) {
    const jobId = `offline_print_${crypto.randomUUID()}`;
    const job = {
      id: jobId,
      printerId: body.printerId,
      printerIp: body.printerIp,
      printerPort: body.printerPort || 9100,
      jobType: body.jobType,
      escposData: body.escPosData,
      status: 'pending',
    };

    this.db.savePrintJob(job);
    return { status: 201, data: { id: jobId, status: 'pending', offline: true } };
  }

  handleDelete(pathname) {
    const checkMatch = pathname.match(/^\/api\/checks\/([a-f0-9-]+)$/);
    if (checkMatch) {
      const checkId = checkMatch[1];
      const check = this.db.getOfflineCheck(checkId);
      if (!check) return { status: 404, data: { message: 'Check not found (offline)' } };
      check.status = 'voided';
      check.updatedAt = new Date().toISOString();
      this.db.saveOfflineCheck(check);
      this.db.queueOperation('void_check', `/api/checks/${checkId}`, 'DELETE', null, 2);
      return { status: 200, data: { message: 'Check voided (offline)', offline: true } };
    }

    const checkItemMatch = pathname.match(/^\/api\/check-items\/([a-f0-9_-]+)$/);
    if (checkItemMatch) {
      const itemId = checkItemMatch[1];
      const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
      for (const c of checks) {
        if (c.items && c.items.some(i => i.id === itemId)) {
          c.items = c.items.filter(i => i.id !== itemId);
          let subtotal = 0;
          c.items.forEach(i => {
            subtotal += parseFloat(i.totalPrice || i.unitPrice || 0) * (i.quantity || 1);
          });
          c.subtotal = subtotal.toFixed(2);
          let taxTotal = 0;
          try {
            const taxRates = this.db.getEntityList('tax_rates', null);
            if (taxRates && taxRates.length > 0) {
              const defaultRate = taxRates.find(t => t.isDefault) || taxRates[0];
              if (defaultRate && defaultRate.rate) {
                taxTotal = subtotal * (parseFloat(defaultRate.rate) / 100);
              }
            }
          } catch (e) {}
          c.taxTotal = taxTotal.toFixed(2);
          const discountTotal = parseFloat(c.discountTotal) || 0;
          c.total = Math.max(0, subtotal - discountTotal + taxTotal).toFixed(2);
          c.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(c);
          break;
        }
      }
      this.db.queueOperation('delete_check_item', pathname, 'DELETE', null, 3);
      return { status: 200, data: { message: 'Item removed (offline)', offline: true } };
    }

    this.db.queueOperation('offline_delete', pathname, 'DELETE', null, 5);
    return { status: 202, data: { message: 'Delete queued for sync', offline: true } };
  }
}

module.exports = { OfflineApiInterceptor };

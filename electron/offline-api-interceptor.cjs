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
    this._statsRequests = 0;
    this._statsGetRequests = 0;
    this._statsPostRequests = 0;
    this._statsOtherRequests = 0;
  }

  getAndResetStats() {
    const stats = {
      totalRequests: this._statsRequests,
      getRequests: this._statsGetRequests,
      postRequests: this._statsPostRequests,
      otherRequests: this._statsOtherRequests,
    };
    this._statsRequests = 0;
    this._statsGetRequests = 0;
    this._statsPostRequests = 0;
    this._statsOtherRequests = 0;
    return stats;
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
        /^\/api\/client-ip/,
        /^\/api\/kds-tickets/,
      ];
      return readEndpoints.some(re => re.test(pathname));
    }

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const writeEndpoints = [
        /^\/api\/auth\/login/,
        /^\/api\/auth\/pin/,
        /^\/api\/checks/,
        /^\/api\/check-items/,
        /^\/api\/check-payments/,
        /^\/api\/check-discounts/,
        /^\/api\/check-service-charges/,
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
        /^\/api\/cash-drawer-kick/,
        /^\/api\/pos\//,
        /^\/api\/kds-tickets/,
        /^\/api\/item-availability/,
      ];
      return writeEndpoints.some(re => re.test(pathname));
    }

    if (method === 'DELETE') {
      const deleteEndpoints = [
        /^\/api\/checks\/[^/]+$/,
        /^\/api\/check-items\/[^/]+$/,
        /^\/api\/pos\/checks\/[^/]+\/customer$/,
        /^\/api\/check-items\/[^/]+\/discount$/,
        /^\/api\/check-discounts\/[^/]+$/,
      ];
      return deleteEndpoints.some(re => re.test(pathname));
    }

    return false;
  }

  handleRequest(method, pathname, query, body) {
    this._statsRequests++;
    if (method === 'GET') {
      this._statsGetRequests++;
      return this.handleGet(pathname, query);
    } else if (method === 'POST') {
      this._statsPostRequests++;
      return this.handlePost(pathname, body);
    } else if (method === 'PUT' || method === 'PATCH') {
      this._statsOtherRequests++;
      return this.handleUpdate(pathname, body);
    } else if (method === 'DELETE') {
      this._statsOtherRequests++;
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
      checks.forEach(c => {
        c.items = c.items || [];
        c.payments = c.payments || [];
        c.serviceCharges = c.serviceCharges || [];
        c.discounts = c.discounts || [];
      });
      return { status: 200, data: checks };
    }

    if (pathname === '/api/checks/locks') {
      return { status: 200, data: {} };
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/full-details$/)) {
      const detailMatch = pathname.match(/^\/api\/checks\/([^/]+)\/full-details$/);
      if (detailMatch) {
        const check = this.db.getOfflineCheck(detailMatch[1]);
        if (check) {
          check.items = check.items || [];
          check.payments = check.payments || [];
          check.serviceCharges = check.serviceCharges || [];
          check.discounts = check.discounts || [];
          return { status: 200, data: check };
        }
        if (this._connectionMode === 'green') return null;
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
      return this.validateManagerApprovalOffline(null, body);
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

    if (pathname.match(/^\/api\/checks\/[^/]+\/service-charges/)) {
      return { status: 200, data: [] };
    }

    if (pathname === '/api/client-ip') {
      return { status: 200, data: { ip: '127.0.0.1', offline: true } };
    }

    if (pathname === '/api/kds-tickets' || pathname === '/api/kds-tickets/') {
      const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
      const tickets = checks
        .filter(c => c.status === 'open' && c.items && c.items.some(i => i.sent && !i.voided))
        .filter(c => !c._kdsBumped)
        .map(c => ({
          id: `kds_${c.id}`,
          checkId: c.id,
          checkNumber: c.checkNumber,
          orderType: c.orderType || 'dine-in',
          status: 'active',
          createdAt: c.createdAt,
          items: (c.items || []).filter(i => i.sent && !i.voided).map(i => ({
            name: i.menuItemName || i.name,
            quantity: i.quantity || 1,
            modifiers: (i.modifiers || []).map(m => m.name || m),
            seatNumber: i.seatNumber,
          })),
        }));
      return { status: 200, data: tickets };
    }

    const kdsTicketMatch = pathname.match(/^\/api\/kds-tickets\/([^/]+)$/);
    if (kdsTicketMatch) {
      const ticketId = kdsTicketMatch[1];
      const checkId = ticketId.startsWith('kds_') ? ticketId.substring(4) : ticketId;
      const check = this.db.getOfflineCheck(checkId);
      if (check) {
        return {
          status: 200,
          data: {
            id: ticketId,
            checkId: check.id,
            checkNumber: check.checkNumber,
            orderType: check.orderType,
            status: check._kdsBumped ? 'bumped' : 'active',
            createdAt: check.createdAt,
            items: (check.items || []).filter(i => i.sent && !i.voided).map(i => ({
              name: i.menuItemName || i.name,
              quantity: i.quantity || 1,
              modifiers: (i.modifiers || []).map(m => m.name || m),
              seatNumber: i.seatNumber,
            })),
          },
        };
      }
      return { status: 404, data: { message: 'KDS ticket not found (offline)' } };
    }

    if (pathname === '/api/checks/orders') {
      const rvcId = query?.rvcId;
      const statusFilter = query?.statusFilter || 'active';
      const orderType = query?.orderType;
      const allChecks = this.db.getOfflineChecks(rvcId, null);
      const employees = this.db.getEntityList ? this.db.getEntityList('employees', this.config.enterpriseId) : [];
      const filtered = allChecks.filter(c => {
        if (statusFilter === 'active') {
          if (c.status !== 'open' && c.status !== 'voided') return false;
        } else if (statusFilter === 'completed') {
          if (c.status !== 'closed') return false;
        }
        if (orderType && orderType !== 'all' && c.orderType !== orderType) return false;
        return true;
      });
      const orderChecks = filtered.map(c => {
        const emp = employees.find(e => e.id === c.employeeId);
        const items = c.items || [];
        const activeItems = items.filter(i => !i.voided);
        const unsentItems = activeItems.filter(i => !i.sent);
        return {
          id: c.id,
          checkNumber: c.checkNumber,
          orderType: c.orderType || 'dine-in',
          status: c.status,
          fulfillmentStatus: c.fulfillmentStatus || null,
          onlineOrderId: c.onlineOrderId || null,
          customerName: c.customerName || null,
          platformSource: c.platformSource || null,
          guestCount: c.guestCount || null,
          subtotal: c.subtotal || '0.00',
          total: c.total || '0.00',
          tableNumber: c.tableNumber || null,
          openedAt: c.openedAt || c.createdAt || new Date().toISOString(),
          closedAt: c.closedAt || null,
          employeeName: emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : null,
          itemCount: activeItems.length,
          unsentCount: unsentItems.length,
          roundCount: c.roundCount || 0,
          lastRoundAt: c.lastRoundAt || null,
        };
      });
      return { status: 200, data: orderChecks };
    }

    const singleCheckMatch = pathname.match(/^\/api\/checks\/([^/]+)$/);
    if (singleCheckMatch) {
      const checkId = singleCheckMatch[1];
      const reserved = ['orders', 'open', 'locks', 'active', 'closed'];
      if (!reserved.includes(checkId)) {
        const check = this.db.getOfflineCheck(checkId);
        if (!check) {
          if (this._connectionMode === 'green') return null;
          return { status: 404, data: { message: 'Check not found (offline)' } };
        }
        const items = check.items || [];
        const payments = check.payments || [];
        const paidAmount = payments
          .filter(p => p.paymentStatus !== 'voided' && !p.voided)
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const totalDue = parseFloat(check.total || check.subtotal || 0);
        const tenderedAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const changeDue = Math.max(0, tenderedAmount - totalDue);
        const checkObj = { ...check };
        delete checkObj.items;
        delete checkObj.payments;
        checkObj.openedAt = checkObj.openedAt || checkObj.createdAt;
        return {
          status: 200,
          data: {
            check: { ...checkObj, paidAmount, tenderedAmount, changeDue },
            items,
            payments,
            refunds: [],
          },
        };
      }
    }

    if (pathname.startsWith('/api/checks')) {
      const rvcId = query?.rvcId;
      const status = query?.status;
      const checks = this.db.getOfflineChecks(rvcId, status);
      checks.forEach(c => {
        c.items = c.items || [];
        c.payments = c.payments || [];
        c.serviceCharges = c.serviceCharges || [];
        c.discounts = c.discounts || [];
      });
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
      return this.validateManagerApprovalOffline(pathname, body);
    }

    if (pathname === '/api/time-clock/punch' || pathname.match(/^\/api\/time-punches/)) {
      return this.handleOfflineTimePunch(body);
    }

    if (pathname === '/api/print-jobs' || pathname === '/api/print-jobs/') {
      return this.queueOfflinePrintJob(body);
    }

    if (pathname === '/api/cash-drawer-kick' || pathname === '/api/cash-drawer-kick/') {
      return { status: 200, data: { success: true, offline: true, message: 'Cash drawer kick queued (offline)' } };
    }

    if (pathname.match(/^\/api\/pos\/capture-with-tip/)) {
      const paymentId = body?.paymentId;
      const tipAmount = parseFloat(body?.tipAmount || 0);
      if (paymentId) {
        const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
        for (const c of checks) {
          if (c.payments) {
            const payment = c.payments.find(p => p.id === paymentId);
            if (payment) {
              payment.tipAmount = tipAmount.toFixed(2);
              c.updatedAt = new Date().toISOString();
              this.db.saveOfflineCheck(c);
              break;
            }
          }
        }
      }
      this.db.queueOperation('capture_with_tip', pathname, 'POST', body || {}, 2);
      return { status: 200, data: { success: true, offline: true, message: 'Tip capture queued for sync' } };
    }

    if (pathname.match(/^\/api\/pos\/loyalty\/earn/)) {
      return { status: 503, data: { error: 'Loyalty features require a cloud connection', offline: true } };
    }

    if (pathname.match(/^\/api\/pos\/record-external-payment/)) {
      const checkId = body?.checkId;
      if (checkId) {
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          if (!check.payments) check.payments = [];
          const paymentId = `offline_pay_${crypto.randomUUID()}`;
          const paymentAmount = parseFloat(body.amount || 0);
          const payment = {
            id: paymentId,
            checkId,
            amount: paymentAmount.toFixed(2),
            tipAmount: '0.00',
            tenderType: body.tenderType || body.paymentMethod || 'external',
            status: 'captured',
            createdAt: new Date().toISOString(),
            isOffline: true,
          };
          check.payments.push(payment);
          const totalPaid = check.payments
            .filter(p => !p.voided)
            .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
          const totalDue = parseFloat(check.total || check.subtotal || 0);
          if (totalPaid >= totalDue && totalDue > 0) {
            check.status = 'closed';
            check.closedAt = new Date().toISOString();
          }
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
        }
      }
      this.db.queueOperation('external_payment', pathname, 'POST', body, 1);
      return { status: 202, data: { success: true, offline: true, message: 'External payment recorded (offline)' } };
    }

    if (pathname.match(/^\/api\/pos\/process-card-payment/) || pathname.match(/^\/api\/stripe/)) {
      return { status: 503, data: { error: 'Card payment processing requires a cloud connection', offline: true } };
    }

    if (pathname.match(/^\/api\/checks\/merge/)) {
      if (this._connectionMode === 'green') return null;
      return { status: 503, data: { error: 'Check merge requires a cloud connection', offline: true } };
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/transfer/)) {
      const transferMatch = pathname.match(/^\/api\/checks\/([^/]+)\/transfer/);
      if (transferMatch) {
        const checkId = transferMatch[1];
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          check.employeeId = body.employeeId || check.employeeId;
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
          this.db.queueOperation('transfer_check', `/api/checks/${checkId}/transfer`, 'POST', body || {}, 2);
        }
        return { status: 200, data: { success: true, offline: true, message: 'Check transferred (offline)' } };
      }
    }

    if (pathname.match(/^\/api\/kds-tickets\/[^/]+\/bump/)) {
      const bumpMatch = pathname.match(/^\/api\/kds-tickets\/([^/]+)\/bump/);
      if (bumpMatch) {
        const ticketId = bumpMatch[1];
        const checkId = ticketId.startsWith('kds_') ? ticketId.substring(4) : ticketId;
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          check._kdsBumped = true;
          check._kdsBumpedAt = new Date().toISOString();
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
          this.db.queueOperation('bump_kds_ticket', pathname, 'POST', body || {}, 3);
        }
        appLogger.info('Interceptor', `RED mode: KDS ticket bumped ${ticketId}`);
        return { status: 200, data: { success: true, offline: true } };
      }
    }

    if (pathname.match(/^\/api\/kds-tickets\/[^/]+\/recall/)) {
      const recallMatch = pathname.match(/^\/api\/kds-tickets\/([^/]+)\/recall/);
      if (recallMatch) {
        const ticketId = recallMatch[1];
        const checkId = ticketId.startsWith('kds_') ? ticketId.substring(4) : ticketId;
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          check._kdsBumped = false;
          check._kdsBumpedAt = null;
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
          this.db.queueOperation('recall_kds_ticket', pathname, 'POST', body || {}, 3);
        }
        appLogger.info('Interceptor', `RED mode: KDS ticket recalled ${ticketId}`);
        return { status: 200, data: { success: true, offline: true } };
      }
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/cancel-transaction/)) {
      const cancelMatch = pathname.match(/^\/api\/checks\/([^/]+)\/cancel-transaction/);
      if (cancelMatch) {
        const checkId = cancelMatch[1];
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          check.status = 'cancelled';
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
          this.db.queueOperation('cancel_transaction', `/api/checks/${checkId}/cancel-transaction`, 'POST', body || {}, 1);
        }
        return { status: 200, data: { success: true, offline: true, message: 'Transaction cancelled (offline)' } };
      }
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/reopen/)) {
      const reopenMatch = pathname.match(/^\/api\/checks\/([^/]+)\/reopen/);
      if (reopenMatch) {
        const checkId = reopenMatch[1];
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          check.status = 'open';
          check.closedAt = null;
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
          this.db.queueOperation('reopen_check', `/api/checks/${checkId}/reopen`, 'POST', body || {}, 1);
        }
        return { status: 200, data: { success: true, offline: true, message: 'Check reopened (offline)' } };
      }
    }

    if (pathname.match(/^\/api\/check-service-charges\/[^/]+\/void/)) {
      const scMatch = pathname.match(/^\/api\/check-service-charges\/([^/]+)\/void/);
      if (scMatch) {
        const scId = scMatch[1];
        const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
        for (const c of checks) {
          if (c.serviceCharges) {
            const sc = c.serviceCharges.find(s => s.id === scId);
            if (sc) {
              sc.voided = true;
              sc.voidedAt = new Date().toISOString();
              this._recalcCheckTotals(c);
              this.db.saveOfflineCheck(c);
              break;
            }
          }
        }
        this.db.queueOperation('void_service_charge', pathname, 'POST', body || {}, 2);
        return { status: 200, data: { success: true, offline: true, message: 'Service charge voided (offline)' } };
      }
    }

    if (pathname.match(/^\/api\/item-availability\/decrement/)) {
      return { status: 200, data: { success: true, offline: true } };
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/split/)) {
      return this.splitCheckOffline(pathname, body);
    }

    if (pathname.match(/^\/api\/check-items\/[^/]+\/void/)) {
      return this.voidCheckItemOffline(pathname, body);
    }

    if (pathname.match(/^\/api\/check-items\/[^/]+\/discount/)) {
      return this.applyItemDiscountOffline(pathname, body);
    }

    if (pathname.match(/^\/api\/check-items\/[^/]+\/price-override/)) {
      return this.priceOverrideOffline(pathname, body);
    }

    this.db.queueOperation('offline_post', pathname, 'POST', body, 5);
    return { status: 202, data: { message: 'Queued for sync', offline: true } };
  }

  handleUpdate(pathname, body) {
    const checkMatch = pathname.match(/^\/api\/checks\/([a-f0-9-]+)$/);
    if (checkMatch) {
      return this.updateOfflineCheck(checkMatch[1], body);
    }

    if (pathname.match(/^\/api\/check-payments\/[^/]+\/void/)) {
      const payVoidMatch = pathname.match(/^\/api\/check-payments\/([^/]+)\/void/);
      if (payVoidMatch) {
        const paymentId = payVoidMatch[1];
        const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
        for (const c of checks) {
          if (c.payments) {
            const payment = c.payments.find(p => p.id === paymentId);
            if (payment) {
              payment.voided = true;
              payment.voidedAt = new Date().toISOString();
              if (c.status === 'closed') {
                c.status = 'open';
                c.closedAt = null;
              }
              c.updatedAt = new Date().toISOString();
              this.db.saveOfflineCheck(c);
              break;
            }
          }
        }
        this.db.queueOperation('void_payment', pathname, 'PATCH', body, 1);
        return { status: 200, data: { success: true, offline: true, message: 'Payment voided (offline)' } };
      }
    }

    if (pathname.match(/^\/api\/check-payments\/[^/]+\/restore/)) {
      const payRestoreMatch = pathname.match(/^\/api\/check-payments\/([^/]+)\/restore/);
      if (payRestoreMatch) {
        const paymentId = payRestoreMatch[1];
        const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
        for (const c of checks) {
          if (c.payments) {
            const payment = c.payments.find(p => p.id === paymentId);
            if (payment) {
              payment.voided = false;
              payment.voidedAt = null;
              let totalPaid = 0;
              c.payments.filter(p => !p.voided).forEach(p => totalPaid += parseFloat(p.amount || 0));
              const totalDue = parseFloat(c.total || c.subtotal || 0);
              if (totalPaid >= totalDue) {
                c.status = 'closed';
                c.closedAt = new Date().toISOString();
              }
              c.updatedAt = new Date().toISOString();
              this.db.saveOfflineCheck(c);
              break;
            }
          }
        }
        this.db.queueOperation('restore_payment', pathname, 'PATCH', body, 1);
        return { status: 200, data: { success: true, offline: true, message: 'Payment restored (offline)' } };
      }
    }

    if (pathname.match(/^\/api\/check-items\/[^/]+\/modifiers/)) {
      const modMatch = pathname.match(/^\/api\/check-items\/([^/]+)\/modifiers/);
      if (modMatch) {
        const itemId = modMatch[1];
        let updatedItem = null;
        const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
        for (const c of checks) {
          if (c.items) {
            const item = c.items.find(i => i.id === itemId);
            if (item) {
              item.modifiers = body.modifiers || body || [];
              if (body.itemStatus) item.itemStatus = body.itemStatus;
              item.updatedAt = new Date().toISOString();
              const modTotal = (item.modifiers || []).reduce((s, m) => s + parseFloat(m.priceDelta || m.price || 0), 0);
              item.totalPrice = ((parseFloat(item.unitPrice || 0) + modTotal) * (item.quantity || 1)).toFixed(2);
              this._recalcCheckTotals(c);
              this.db.saveOfflineCheck(c);
              updatedItem = { ...item };
              break;
            }
          }
        }
        this.db.queueOperation('update_modifiers', pathname, 'PATCH', body, 2);
        if (updatedItem) {
          return { status: 200, data: updatedItem };
        }
        return { status: 404, data: { message: 'Item not found (offline)' } };
      }
    }

    if (pathname.match(/^\/api\/check-service-charges\/[^/]+\/void/)) {
      const scPatchMatch = pathname.match(/^\/api\/check-service-charges\/([^/]+)\/void/);
      if (scPatchMatch) {
        const scId = scPatchMatch[1];
        const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
        for (const c of checks) {
          if (c.serviceCharges) {
            const sc = c.serviceCharges.find(s => s.id === scId);
            if (sc) {
              sc.voided = true;
              sc.voidedAt = new Date().toISOString();
              this._recalcCheckTotals(c);
              this.db.saveOfflineCheck(c);
              break;
            }
          }
        }
      }
      this.db.queueOperation('void_service_charge', pathname, 'PATCH', body, 2);
      return { status: 200, data: { success: true, offline: true, message: 'Service charge voided (offline)' } };
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
      serviceCharges: [],
      discounts: [],
      openedAt: new Date().toISOString(),
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
    if (!check) {
      if (this._connectionMode === 'green') return null;
      return { status: 404, data: { message: 'Check not found (offline)' } };
    }

    const modifiers = body.modifiers || body.selectedModifiers || [];
    const condiments = body.condiments || [];
    let unitPrice = parseFloat(body.unitPrice || '0.00');
    if (unitPrice === 0 && body.menuItemId) {
      try {
        const menuItem = this.db.getEntity ? this.db.getEntity('menu_items', body.menuItemId) : null;
        if (menuItem && (menuItem.price || menuItem.defaultPrice)) {
          unitPrice = parseFloat(menuItem.price || menuItem.defaultPrice);
          appLogger.debug('Interceptor', `Price lookup for ${body.menuItemId}: $${unitPrice.toFixed(2)}`);
        }
      } catch (e) {
        appLogger.debug('Interceptor', `Menu item price lookup failed: ${e.message}`);
      }
    }
    let modifierTotal = 0;
    modifiers.forEach(m => {
      modifierTotal += parseFloat(m.priceDelta || m.price || 0);
    });
    const quantity = body.quantity || 1;
    const itemTotalPrice = body.totalPrice
      ? parseFloat(body.totalPrice)
      : (unitPrice + modifierTotal) * quantity;

    const itemId = `offline_item_${crypto.randomUUID()}`;
    const item = {
      id: itemId,
      checkId,
      menuItemId: body.menuItemId,
      menuItemName: body.menuItemName,
      quantity,
      unitPrice: unitPrice.toFixed(2),
      totalPrice: itemTotalPrice.toFixed(2),
      modifiers,
      condiments,
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
    if (!check) {
      if (this._connectionMode === 'green') return null;
      return { status: 404, data: { message: 'Check not found (offline)' } };
    }

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
      paymentStatus: 'completed',
      paidAt: new Date().toISOString(),
      isOffline: true,
    };

    this.db.saveOfflinePayment(payment);

    const check = this.db.getOfflineCheck(body.checkId);
    if (check) {
      if (!check.payments) check.payments = [];
      check.payments.push(payment);

      let totalPaid = 0;
      check.payments.filter(p => p.paymentStatus !== 'voided' && !p.voided)
        .forEach(p => totalPaid += parseFloat(p.amount || 0));
      const totalDue = parseFloat(check.total || check.subtotal || 0);
      if (totalPaid >= totalDue) {
        check.status = 'closed';
        check.closedAt = new Date().toISOString();
      }
      check.updatedAt = new Date().toISOString();
      this.db.saveOfflineCheck(check);

      const checkResponse = { ...check };
      delete checkResponse.items;
      delete checkResponse.payments;
      checkResponse.openedAt = checkResponse.openedAt || checkResponse.createdAt;

      this.db.queueOperation('create_payment', '/api/payments', 'POST', body, 1);

      return {
        status: 201,
        data: {
          ...checkResponse,
          paidAmount: totalPaid,
          payment,
          autoPrintStatus: { success: false, message: 'Offline mode - no printer' },
        },
      };
    }

    this.db.queueOperation('create_payment', '/api/payments', 'POST', body, 1);

    return { status: 201, data: payment };
  }

  resolveEmployeePrivileges(employee) {
    if (!employee) return [];
    try {
      if (this.db && this.db.getRolePrivileges && employee.roleId) {
        const rolePrivs = this.db.getRolePrivileges(employee.roleId);
        if (rolePrivs && rolePrivs.length > 0) return rolePrivs;
      }
    } catch (e) {}
    if (employee.privileges && employee.privileges.length > 0) return employee.privileges;
    if (employee.rolePrivileges && employee.rolePrivileges.length > 0) return employee.rolePrivileges;
    return [
      'open_check', 'close_check', 'split_check', 'merge_checks', 'transfer_check', 'reopen_check',
      'change_order_type', 'assign_table', 'add_item', 'void_item', 'void_item_no_reason',
      'modify_price', 'add_modifier', 'remove_modifier', 'apply_tender', 'split_payment',
      'refund', 'force_tender', 'offline_payment', 'approve_void', 'approve_discount',
      'approve_refund', 'approve_price_override', 'manager_approval',
      'view_sales_reports', 'view_labor_reports', 'export_reports', 'view_audit_logs',
      'admin_access', 'kds_access', 'fast_transaction', 'send_to_kitchen', 'void_unsent',
      'void_sent', 'apply_discount', 'clock_in_out'
    ];
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
          privileges: this.resolveEmployeePrivileges(employee),
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
          privileges: this.resolveEmployeePrivileges(employee),
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

  validateManagerApprovalOffline(pathname, body) {
    const pin = body?.pin || body?.managerPin;
    const requiredPrivilege = body?.requiredPrivilege || body?.privilege;
    if (!pin) {
      return { status: 400, data: { success: false, message: 'Manager PIN required' } };
    }

    const employees = this.db.getEntityList('employees', this.config.enterpriseId);
    const manager = employees.find(emp => {
      if (emp.pinHash === pin) return true;
      if (emp.pin === pin) return true;
      if (emp.posPin === pin) return true;
      return false;
    });

    if (!manager) {
      return { status: 401, data: { success: false, message: 'Invalid manager PIN (offline)' } };
    }

    const privs = this.resolveEmployeePrivileges(manager);
    const hasAdmin = privs.includes('admin_access');
    const hasManagerApproval = privs.includes('manager_approval');
    const hasSpecific = requiredPrivilege ? privs.includes(requiredPrivilege) : true;

    if (!hasAdmin && !hasManagerApproval && !hasSpecific) {
      return { status: 403, data: { success: false, message: 'Employee does not have manager privileges (offline)' } };
    }

    appLogger.info('Interceptor', `Offline manager approval: ${manager.firstName} ${manager.lastName} for ${requiredPrivilege || 'general'}`);
    return {
      status: 200,
      data: {
        success: true,
        approved: true,
        managerId: manager.id,
        managerName: `${manager.firstName} ${manager.lastName}`,
        offlineAuth: true,
      },
    };
  }

  voidCheckItemOffline(pathname, body) {
    const itemIdMatch = pathname.match(/^\/api\/check-items\/([^/]+)\/void/);
    if (!itemIdMatch) return null;

    const itemId = itemIdMatch[1];
    const managerPin = body?.managerPin;

    if (managerPin) {
      const approval = this.validateManagerApprovalOffline(null, { pin: managerPin, requiredPrivilege: 'void_sent' });
      if (approval.status !== 200) return approval;
    }

    const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
    for (const c of checks) {
      if (c.items && c.items.some(i => i.id === itemId)) {
        const item = c.items.find(i => i.id === itemId);
        if (item) {
          item.voided = true;
          item.voidedAt = new Date().toISOString();
          item.voidReason = body?.reason || 'Offline void';
          if (!c.voidedItems) c.voidedItems = [];
          c.voidedItems.push({ ...item });
        }
        const activeItems = c.items.filter(i => !i.voided);
        let subtotal = 0;
        activeItems.forEach(i => {
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
    this.db.queueOperation('void_check_item', pathname, 'POST', body, 2);
    const voidedItem = (() => {
      const allChecks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
      for (const ch of allChecks) {
        if (ch.items) {
          const found = ch.items.find(i => i.id === itemId);
          if (found) return found;
        }
      }
      return { id: itemId, voided: true, voidedAt: new Date().toISOString(), voidReason: body?.reason || 'Offline void', offline: true };
    })();
    return { status: 200, data: voidedItem };
  }

  applyItemDiscountOffline(pathname, body) {
    const itemIdMatch = pathname.match(/^\/api\/check-items\/([^/]+)\/discount/);
    if (!itemIdMatch) return null;

    const managerPin = body?.managerPin;
    if (managerPin) {
      const approval = this.validateManagerApprovalOffline(null, { pin: managerPin, requiredPrivilege: 'apply_discount' });
      if (approval.status !== 200) return approval;
    }

    const itemId = itemIdMatch[1];
    const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
    for (const c of checks) {
      if (c.items) {
        const item = c.items.find(i => i.id === itemId);
        if (item) {
          item.discountId = body.discountId || null;
          item.discountName = body.discountName || body.name || null;
          item.discountType = body.discountType || body.type || 'amount';
          const discountValue = parseFloat(body.amount || body.discountAmount || 0);
          if (item.discountType === 'percentage' || item.discountType === 'percent') {
            const itemPrice = parseFloat(item.totalPrice || item.unitPrice || 0) * (item.quantity || 1);
            item.discountAmount = ((itemPrice * discountValue) / 100).toFixed(2);
          } else {
            item.discountAmount = discountValue.toFixed(2);
          }
          item.discount = {
            id: body.discountId || `offline_disc_${crypto.randomUUID()}`,
            name: item.discountName,
            type: item.discountType,
            amount: item.discountAmount,
          };
          this._recalcCheckTotals(c);
          this.db.saveOfflineCheck(c);
          break;
        }
      }
    }

    this.db.queueOperation('item_discount', pathname, 'POST', body, 2);
    const discountedItem = (() => {
      const allChecks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
      for (const ch of allChecks) {
        if (ch.items) {
          const found = ch.items.find(i => i.id === itemId);
          if (found) return { item: found, check: ch };
        }
      }
      return { item: { id: itemId, discountId: body.discountId, offline: true }, check: {} };
    })();
    return { status: 200, data: discountedItem };
  }

  priceOverrideOffline(pathname, body) {
    const itemIdMatch = pathname.match(/^\/api\/check-items\/([^/]+)\/price-override/);
    if (!itemIdMatch) return null;

    const managerPin = body?.managerPin;
    if (managerPin) {
      const approval = this.validateManagerApprovalOffline(null, { pin: managerPin, requiredPrivilege: 'approve_price_override' });
      if (approval.status !== 200) return approval;
    }

    const itemId = itemIdMatch[1];
    const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
    for (const c of checks) {
      if (c.items) {
        const item = c.items.find(i => i.id === itemId);
        if (item) {
          const newPrice = body.newPrice || body.price;
          if (newPrice !== undefined) {
            item.unitPrice = parseFloat(newPrice).toFixed(2);
            item.totalPrice = (parseFloat(newPrice) * (item.quantity || 1)).toFixed(2);
            item.priceOverride = true;
          }
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
    }
    this.db.queueOperation('price_override', pathname, 'POST', body, 2);
    return { status: 200, data: { success: true, offline: true, message: 'Price override applied (offline)' } };
  }

  splitCheckOffline(pathname, body) {
    const checkIdMatch = pathname.match(/^\/api\/checks\/([^/]+)\/split/);
    if (!checkIdMatch) return null;

    const sourceCheckId = checkIdMatch[1];
    const sourceCheck = this.db.getOfflineCheck(sourceCheckId);
    if (!sourceCheck) {
      if (this._connectionMode === 'green') return null;
      return { status: 404, data: { message: 'Check not found (offline)' } };
    }

    const operations = body?.operations || [];
    if (operations.length === 0) {
      return { status: 400, data: { message: 'No split operations provided' } };
    }

    const newCheckId = `offline_${crypto.randomUUID()}`;
    const newCheck = {
      id: newCheckId,
      rvcId: sourceCheck.rvcId,
      employeeId: sourceCheck.employeeId,
      orderType: sourceCheck.orderType,
      status: 'open',
      subtotal: '0.00',
      taxTotal: '0.00',
      discountTotal: '0.00',
      total: '0.00',
      guestCount: sourceCheck.guestCount || 1,
      tableNumber: sourceCheck.tableNumber,
      items: [],
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isOffline: true,
      businessDate: sourceCheck.businessDate,
      originBusinessDate: sourceCheck.originBusinessDate || sourceCheck.businessDate,
    };

    for (const op of operations) {
      const itemId = op.itemId || op.checkItemId;
      const sourceItem = sourceCheck.items?.find(i => i.id === itemId);
      if (!sourceItem) continue;

      if (op.type === 'move') {
        sourceCheck.items = sourceCheck.items.filter(i => i.id !== itemId);
        sourceItem.checkId = newCheckId;
        newCheck.items.push(sourceItem);
      } else if (op.type === 'share') {
        const ratio = parseFloat(op.shareRatio || 0.5);
        const originalQty = sourceItem.quantity || 1;
        const originalPrice = parseFloat(sourceItem.unitPrice || 0);

        sourceItem.quantity = Math.max(1, Math.round(originalQty * (1 - ratio)));
        sourceItem.totalPrice = (sourceItem.quantity * originalPrice).toFixed(2);

        const newItem = {
          ...sourceItem,
          id: `offline_item_${crypto.randomUUID()}`,
          checkId: newCheckId,
          quantity: Math.max(1, originalQty - sourceItem.quantity),
        };
        newItem.totalPrice = (newItem.quantity * originalPrice).toFixed(2);
        newCheck.items.push(newItem);
      }
    }

    this._recalcCheckTotals(sourceCheck);
    this._recalcCheckTotals(newCheck);

    this.db.saveOfflineCheck(sourceCheck);
    const created = this.db.createCheckAtomic(newCheck.rvcId, newCheck);

    this.db.queueOperation('split_check', `/api/checks/${sourceCheckId}/split`, 'POST', body, 1);

    return {
      status: 200,
      data: {
        sourceCheck: sourceCheck,
        newChecks: [created || newCheck],
        offline: true,
        message: 'Check split (offline)',
      },
    };
  }

  _recalcCheckTotals(check) {
    let subtotal = 0;
    const activeItems = (check.items || []).filter(i => !i.voided);
    activeItems.forEach(i => {
      const unitPrice = parseFloat(i.unitPrice || 0);
      const modTotal = (i.modifiers || []).reduce((s, m) => s + parseFloat(m.priceDelta || m.price || 0), 0);
      const itemTotal = parseFloat(i.totalPrice || 0) || ((unitPrice + modTotal) * (i.quantity || 1));
      subtotal += itemTotal;
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
    } catch (e) {}
    check.taxTotal = taxTotal.toFixed(2);
    const discountTotal = parseFloat(check.discountTotal) || 0;
    check.total = Math.max(0, subtotal - discountTotal + taxTotal).toFixed(2);
    check.updatedAt = new Date().toISOString();
  }

  handleDelete(pathname) {
    const checkMatch = pathname.match(/^\/api\/checks\/([a-f0-9-]+)$/);
    if (checkMatch) {
      const checkId = checkMatch[1];
      const check = this.db.getOfflineCheck(checkId);
      if (!check) {
        if (this._connectionMode === 'green') return null;
        return { status: 404, data: { message: 'Check not found (offline)' } };
      }
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

    const itemDiscountDeleteMatch = pathname.match(/^\/api\/check-items\/([^/]+)\/discount$/);
    if (itemDiscountDeleteMatch) {
      const itemId = itemDiscountDeleteMatch[1];
      const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
      for (const c of checks) {
        if (c.items) {
          const item = c.items.find(i => i.id === itemId);
          if (item) {
            item.discount = null;
            item.discountAmount = null;
            this._recalcCheckTotals(c);
            this.db.saveOfflineCheck(c);
            break;
          }
        }
      }
      this.db.queueOperation('remove_item_discount', pathname, 'DELETE', null, 2);
      return { status: 200, data: { success: true, offline: true, message: 'Item discount removed (offline)' } };
    }

    const checkDiscountDeleteMatch = pathname.match(/^\/api\/check-discounts\/([^/]+)$/);
    if (checkDiscountDeleteMatch) {
      const discountId = checkDiscountDeleteMatch[1];
      const checks = this.db.getAllOfflineChecks ? this.db.getAllOfflineChecks() : [];
      for (const c of checks) {
        if (c.discounts) {
          c.discounts = c.discounts.filter(d => d.id !== discountId);
          let discountTotal = 0;
          c.discounts.forEach(d => discountTotal += parseFloat(d.amount || 0));
          c.discountTotal = discountTotal.toFixed(2);
          const subtotal = parseFloat(c.subtotal) || 0;
          const taxTotal = parseFloat(c.taxTotal) || 0;
          c.total = Math.max(0, subtotal - discountTotal + taxTotal).toFixed(2);
          c.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(c);
          break;
        }
      }
      this.db.queueOperation('remove_check_discount', pathname, 'DELETE', null, 2);
      return { status: 200, data: { success: true, offline: true, message: 'Check discount removed (offline)' } };
    }

    if (pathname.match(/^\/api\/pos\/checks\/[^/]+\/customer$/)) {
      const custCheckMatch = pathname.match(/^\/api\/pos\/checks\/([^/]+)\/customer$/);
      if (custCheckMatch) {
        const checkId = custCheckMatch[1];
        const check = this.db.getOfflineCheck(checkId);
        if (check) {
          check.customerId = null;
          check.updatedAt = new Date().toISOString();
          this.db.saveOfflineCheck(check);
        }
        this.db.queueOperation('remove_customer', pathname, 'DELETE', null, 3);
        return { status: 200, data: { success: true, offline: true } };
      }
    }

    this.db.queueOperation('offline_delete', pathname, 'DELETE', null, 5);
    return { status: 202, data: { message: 'Delete queued for sync', offline: true } };
  }
}

module.exports = { OfflineApiInterceptor };

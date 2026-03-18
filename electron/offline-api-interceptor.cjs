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

  _isCheckEndpoint(pathname) {
    return /^\/api\/(checks|check-items|check-payments|check-discounts|check-service-charges|payments)(\/|$)/.test(pathname) ||
           /^\/api\/pos\/(checks|process-card-payment|capture-with-tip)/.test(pathname);
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
        /^\/api\/terminal-devices/,
        /^\/api\/payment-processors/,
        /^\/api\/sync-notifications/,
        /^\/api\/pos-layout-rvc-assignments/,
        /^\/api\/menu-item-slus/,
        /^\/api\/terminal-sessions/,
        /^\/api\/pos\/reports/,
        /^\/api\/refunds/,
        /^\/api\/rvcs\/[^/]+\/closed-checks/,
        /^\/api\/rvcs\/[^/]+\/refunds/,
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
        /^\/api\/terminal-sessions/,
        /^\/api\/checks\/merge/,
        /^\/api\/refunds/,
        /^\/api\/sync-notifications/,
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
        /^\/api\/sync-notifications/,
      ];
      return deleteEndpoints.some(re => re.test(pathname));
    }

    return false;
  }
}

module.exports = { OfflineApiInterceptor };

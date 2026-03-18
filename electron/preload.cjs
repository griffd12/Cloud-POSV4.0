const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  quitApp: () => ipcRenderer.send('quit-app'),

  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getOnlineStatus: () => ipcRenderer.invoke('get-online-status'),

  printRaw: (address, port, data) =>
    ipcRenderer.invoke('print-raw', { address, port, data }),

  printEscPos: (address, port, commands) =>
    ipcRenderer.invoke('print-escpos', { address, port, commands }),

  getLocalPrinters: () => ipcRenderer.invoke('get-local-printers'),

  printToSystemPrinter: (printerName, data, options) =>
    ipcRenderer.invoke('print-to-system-printer', { printerName, data, options }),

  queueOfflineOperation: (type, endpoint, method, body) =>
    ipcRenderer.invoke('queue-offline-operation', { type, endpoint, method, body }),

  getPendingSyncCount: () => ipcRenderer.invoke('get-pending-sync-count'),
  forceSync: () => ipcRenderer.invoke('force-sync'),

  cacheData: (key, data) => ipcRenderer.invoke('cache-data', { key, data }),
  getCachedData: (key) => ipcRenderer.invoke('get-cached-data', { key }),

  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  setServerUrl: (url) => ipcRenderer.invoke('set-server-url', url),

  setAutoLaunch: (enable) => ipcRenderer.invoke('set-auto-launch', enable),
  getAutoStartupStatus: () => ipcRenderer.invoke('get-auto-startup-status'),
  setAutoStartup: (enabled) => ipcRenderer.invoke('set-auto-startup', enabled),

  // === Print Agent API ===
  printAgent: {
    getStatus: () => ipcRenderer.invoke('print-agent-get-status'),
    start: () => ipcRenderer.invoke('print-agent-start'),
    stop: () => ipcRenderer.invoke('print-agent-stop'),
    addPrinter: (config) => ipcRenderer.invoke('print-agent-add-printer', config),
    removePrinter: (key) => ipcRenderer.invoke('print-agent-remove-printer', key),
    getPrinters: () => ipcRenderer.invoke('print-agent-get-printers'),
    configure: (config) => ipcRenderer.invoke('print-agent-configure', config),
    testPrinter: (ipAddress, port) => ipcRenderer.invoke('print-agent-test-printer', { ipAddress, port }),
    localPrint: (config) => ipcRenderer.invoke('print-agent-local-print', config),
  },

  // === Diagnostics API ===
  diagnostics: {
    listComPorts: () => ipcRenderer.invoke('diag-list-com-ports'),
    testSerial: (comPort, baudRate, printTestPage) =>
      ipcRenderer.invoke('diag-test-serial', { comPort, baudRate, printTestPage }),
    testNetworkPrinter: (ipAddress, port) =>
      ipcRenderer.invoke('diag-test-network-printer', { ipAddress, port }),
  },

  // === Enhanced Offline Database API ===
  offlineDb: {
    sync: (enterpriseId, propertyId, rvcId) =>
      ipcRenderer.invoke('offline-db-sync', { enterpriseId, propertyId, rvcId }),
    getStats: () => ipcRenderer.invoke('offline-db-get-stats'),
    getEntity: (table, id) => ipcRenderer.invoke('offline-db-get-entity', { table, id }),
    getEntityList: (table, enterpriseId) =>
      ipcRenderer.invoke('offline-db-get-entity-list', { table, enterpriseId }),
    getSalesData: (businessDate, rvcId) =>
      ipcRenderer.invoke('offline-db-get-sales-data', { businessDate, rvcId }),
    syncToCloud: () => ipcRenderer.invoke('offline-db-sync-to-cloud'),
    getChecks: (rvcId, status) => ipcRenderer.invoke('offline-db-get-checks', { rvcId, status }),
    saveCheck: (check) => ipcRenderer.invoke('offline-db-save-check', check),
  },

  getOfflineMode: () => ipcRenderer.invoke('get-offline-mode'),
  offlineSelfTest: () => ipcRenderer.invoke('offline-self-test'),

  rotateLogsForBusinessDate: (businessDate) => ipcRenderer.invoke('rotate-logs-business-date', businessDate),
  clearOfflineSalesData: () => ipcRenderer.invoke('clear-offline-sales-data'),

  // === Logging API ===
  openLogDirectory: () => ipcRenderer.invoke('open-log-directory'),
  getLogContent: (logName, lines) => ipcRenderer.invoke('get-log-content', { logName, lines }),
  getSystemLog: (lines) => ipcRenderer.invoke('get-log-content', { logName: 'system', lines: lines || 300 }),
  log: (level, subsystem, category, message, data) =>
    ipcRenderer.invoke('renderer-log', { level, subsystem, category, message, data }),
  signalBootstrapReady: () => ipcRenderer.invoke('renderer-bootstrap-ready'),

  // === Auto-Updater API ===
  updater: {
    getStatus: () => ipcRenderer.invoke('updater-get-status'),
    checkNow: () => ipcRenderer.invoke('updater-check-now'),
    install: () => ipcRenderer.invoke('updater-install'),
    getVersion: () => ipcRenderer.invoke('updater-get-version'),
  },

  onUpdateStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },

  // === EMV Terminal API ===
  emvSendPayment: (config) => ipcRenderer.invoke('emv-send-payment', config),
  emvCancel: (address, port) => ipcRenderer.invoke('emv-cancel', { address, port }),
  emvGetPendingPayments: () => ipcRenderer.invoke('emv-get-pending-payments'),
  emvMarkPaymentSynced: (id) => ipcRenderer.invoke('emv-mark-payment-synced', { id }),

  getConnectionMode: () => ipcRenderer.invoke('get-connection-mode'),
  getConnectionModeDetail: () => ipcRenderer.invoke('get-connection-mode-detail'),
  getCapsBootStatus: () => ipcRenderer.invoke('get-caps-boot-status'),

  // === Event Listeners ===
  onOnlineStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('online-status', handler);
    return () => ipcRenderer.removeListener('online-status', handler);
  },

  onConnectionMode: (callback) => {
    const handler = (event, mode) => callback(mode);
    ipcRenderer.on('connection-mode', handler);
    return () => ipcRenderer.removeListener('connection-mode', handler);
  },

  onConnectionModeDetail: (callback) => {
    const handler = (event, detail) => callback(detail);
    ipcRenderer.on('connection-mode-detail', handler);
    return () => ipcRenderer.removeListener('connection-mode-detail', handler);
  },

  onSyncStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('sync-status', handler);
    return () => ipcRenderer.removeListener('sync-status', handler);
  },

  onLocalDbCritical: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('local-db-critical', handler);
    return () => ipcRenderer.removeListener('local-db-critical', handler);
  },

  onCapsBootStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('caps-boot-status', handler);
    return () => ipcRenderer.removeListener('caps-boot-status', handler);
  },

  onPrintAgentStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('print-agent-status', handler);
    return () => ipcRenderer.removeListener('print-agent-status', handler);
  },

  onPrintAgentJobCompleted: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('print-agent-job-completed', handler);
    return () => ipcRenderer.removeListener('print-agent-job-completed', handler);
  },

  onPrintAgentJobFailed: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('print-agent-job-failed', handler);
    return () => ipcRenderer.removeListener('print-agent-job-failed', handler);
  },
});

// Global error handlers for renderer - log to system log
window.addEventListener('error', (event) => {
  ipcRenderer.invoke('renderer-log', {
    level: 'ERROR',
    subsystem: 'RENDERER',
    category: 'UncaughtError',
    message: `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
    data: event.error?.stack || null
  }).catch(() => {});
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : null;
  ipcRenderer.invoke('renderer-log', {
    level: 'ERROR',
    subsystem: 'RENDERER',
    category: 'UnhandledRejection',
    message: message,
    data: stack
  }).catch(() => {});
});

const { app, BrowserWindow, Menu, ipcMain, shell, dialog, protocol, net: electronNet } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { EMVTerminalManager } = require('./emv-terminal.cjs');
const { PrintAgentService } = require('./print-agent-service.cjs');
const { OfflineDatabase } = require('./offline-database.cjs');
const { OfflineApiInterceptor } = require('./offline-api-interceptor.cjs');
const { appLogger, printLogger, updaterLogger, LOG_DIR, checkVersionAndRotate, setDeviceLabel } = require('./logger.cjs');
const { initAutoUpdater, getUpdateState } = require('./auto-updater.cjs');

const { fork } = require('child_process');

let mainWindow = null;
let appMode = 'pos';
let isKiosk = false;
let autoStartupEnabled = false;
let offlineDb = null;
let enhancedOfflineDb = null;
let offlineInterceptor = null;
let printAgent = null;
let syncInterval = null;
let isOnline = true;
let emvManager = null;
let dataSyncInterval = null;
let protocolInterceptorRegistered = false;
let serviceHostProcess = null;
let connectionMode = 'green';
let capsConfig = null;
let localDbHealthy = true;
let pendingSyncCount = 0;
let lastSyncAt = null;
let connectivityFailCount = 0;
let connectivitySuccessCount = 0;
const HYSTERESIS_THRESHOLD = 2;
let lastSyncError = null;
let backgroundSyncTimer = null;
let protocolInterceptorStartTime = 0;
let protocolConsecutiveFailCount = 0;
const PROTOCOL_STARTUP_GRACE_MS = 2000;
const PROTOCOL_FAIL_THRESHOLD = 3;
let firstBootConnectivityChecked = false;
let bootstrapWatchdogTimer = null;
let bootstrapWatchdogCleared = false;
let bootstrapReloadCount = 0;
const BOOTSTRAP_WATCHDOG_MS = 10000;
const BOOTSTRAP_MAX_RELOADS = 2;

const LOCAL_FIRST_WRITE_PATTERNS = [
  /^\/api\/auth\/login(\/|$)/,
  /^\/api\/auth\/pin(\/|$)/,
  /^\/api\/auth\/manager-approval(\/|$)/,
  /^\/api\/employees\/[^/]+\/authenticate(\/|$)/,
  /^\/api\/time-punches(\/|$)/,
  /^\/api\/time-clock(\/|$)/,
  /^\/api\/print-jobs(\/|$)/,
  /^\/api\/cash-drawer-kick(\/|$)/,
  /^\/api\/item-availability\/decrement/,
  /^\/api\/item-availability\/increment/,
  /^\/api\/registered-devices\/heartbeat/,
  /^\/api\/system-status/,
  /^\/api\/gift-cards(\/|$)/,
  /^\/api\/loyalty(\/|$)/,
  /^\/api\/checks(\/|$)/,
  /^\/api\/checks\/[^/]+\/items(\/|$)/,
  /^\/api\/checks\/[^/]+\/send(\/|$)/,
  /^\/api\/checks\/[^/]+\/payments?(\/|$)/,
  /^\/api\/checks\/[^/]+\/discount(\/|$)/,
  /^\/api\/checks\/[^/]+\/void(\/|$)/,
  /^\/api\/checks\/[^/]+\/lock(\/|$)/,
  /^\/api\/checks\/[^/]+\/unlock(\/|$)/,
  /^\/api\/checks\/[^/]+\/close(\/|$)/,
  /^\/api\/checks\/[^/]+\/print(\/|$)/,
  /^\/api\/checks\/[^/]+\/service-charges?(\/|$)/,
  /^\/api\/pos\//,
  /^\/api\/check-items(\/|$)/,
  /^\/api\/check-payments(\/|$)/,
  /^\/api\/check-discounts(\/|$)/,
  /^\/api\/check-service-charges(\/|$)/,
  /^\/api\/payments(\/|$)/,
  /^\/api\/kds-tickets(\/|$)/,
  /^\/api\/terminal-sessions(\/|$)/,
  /^\/api\/refunds(\/|$)/,
];

function isLocalFirstWrite(method, pathname) {
  if (method === 'GET' || method === 'HEAD') return false;
  return LOCAL_FIRST_WRITE_PATTERNS.some(re => re.test(pathname));
}

const LOCAL_FIRST_READ_PATTERNS = [
  /^\/api\/menu-items/,
  /^\/api\/modifier-groups/,
  /^\/api\/modifiers/,
  /^\/api\/employees/,
  /^\/api\/tax-rates/,
  /^\/api\/tax-groups/,
  /^\/api\/discounts/,
  /^\/api\/tender-types/,
  /^\/api\/tenders/,
  /^\/api\/order-types/,
  /^\/api\/service-charges/,
  /^\/api\/revenue-centers/,
  /^\/api\/rvcs/,
  /^\/api\/slus/,
  /^\/api\/properties/,
  /^\/api\/printers/,
  /^\/api\/workstations/,
  /^\/api\/pos-layouts/,
  /^\/api\/pos-layout-rvc-assignments/,
  /^\/api\/menu-item-slus/,
  /^\/api\/terminal-devices/,
  /^\/api\/terminal-sessions/,
  /^\/api\/payment-processors/,
  /^\/api\/ingredient-prefixes/,
  /^\/api\/pos\/modifier-map/,
  /^\/api\/option-flags/,
  /^\/api\/kds-devices/,
  /^\/api\/order-devices/,
  /^\/api\/print-classes/,
  /^\/api\/print-class-routings/,
  /^\/api\/pos\/reports/,
  /^\/api\/break-rules/,
  /^\/api\/checks\/open/,
  /^\/api\/checks\/locks/,
  /^\/api\/checks\/orders/,
  /^\/api\/checks\/[0-9a-f]/,
  /^\/api\/checks\/offline_/,
  /^\/api\/rvcs\/[^/]+\/closed-checks/,
  /^\/api\/rvcs\/[^/]+\/refunds/,
  /^\/api\/refunds\//,
  /^\/api\/sync\//,
  /^\/api\/auth\/offline-employees/,
];

function isLocalFirstRead(method, pathname, search) {
  if (method !== 'GET') return false;
  const full = pathname + (search || '');
  return LOCAL_FIRST_READ_PATTERNS.some(re => re.test(full));
}

function checkLocalDbHealth() {
  try {
    if (enhancedOfflineDb && enhancedOfflineDb.db && enhancedOfflineDb.usingSqlite) {
      enhancedOfflineDb.db.prepare('SELECT 1').get();
      localDbHealthy = true;
      return true;
    }
    if (offlineDb) {
      offlineDb.prepare('SELECT 1').get();
      localDbHealthy = true;
      return true;
    }
    localDbHealthy = false;
    return false;
  } catch (e) {
    localDbHealthy = false;
    appLogger.error('LocalDB', 'Local SQLite health check FAILED', e.message);
    return false;
  }
}

function updatePendingSyncCount() {
  try {
    if (enhancedOfflineDb) {
      const ops = enhancedOfflineDb.getPendingOperations();
      pendingSyncCount = ops ? ops.length : 0;
    } else {
      pendingSyncCount = getPendingOperations().length;
    }
  } catch (e) {
    pendingSyncCount = 0;
  }
}

function broadcastSyncStatus() {
  updatePendingSyncCount();
  if (mainWindow) {
    mainWindow.webContents.send('sync-status', {
      pending: pendingSyncCount,
      lastSync: lastSyncAt,
      lastError: lastSyncError,
      localDbHealthy,
      mode: connectionMode,
    });
  }
}

const APP_DATA_ROOT = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Cloud POS')
  : app.getPath('userData');
const CONFIG_DIR = path.join(APP_DATA_ROOT, 'config');
const DATA_DIR = path.join(APP_DATA_ROOT, 'data');
const OFFLINE_DB_PATH = path.join(DATA_DIR, 'offline.db');
const CONFIG_PATH = path.join(CONFIG_DIR, 'settings.json');

function ensureDirectories() {
  [CONFIG_DIR, DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    appLogger.error('Config', 'Failed to load config', e.message);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    appLogger.error('Config', 'Failed to save config', e.message);
  }
}

function configureAutoStartup(deviceMode) {
  try {
    if (process.platform === 'win32') {
      const exePath = process.execPath;
      const appName = deviceMode === 'kds' ? 'Cloud KDS' : 'Cloud POS';
      app.setLoginItemSettings({
        openAtLogin: true,
        path: exePath,
        name: appName,
        args: deviceMode === 'kds' ? ['--mode=kds'] : ['--mode=pos'],
      });
      autoStartupEnabled = true;
      appLogger.info('AutoStartup', `Registered "${appName}" for auto-startup on boot`, { exePath, mode: deviceMode });
    } else {
      appLogger.info('AutoStartup', 'Auto-startup on boot is only supported on Windows via Electron; Android uses Capacitor plugin');
    }
  } catch (e) {
    appLogger.error('AutoStartup', 'Failed to configure auto-startup', e.message);
  }
}

function removeAutoStartup() {
  try {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: false });
      autoStartupEnabled = false;
      appLogger.info('AutoStartup', 'Removed auto-startup registration');
    }
  } catch (e) {
    appLogger.error('AutoStartup', 'Failed to remove auto-startup', e.message);
  }
}

function migrateAutoStartup(config) {
  try {
    if (process.platform !== 'win32') return;
    if (!config.setupComplete) return;
    if (config.autoStartupMigrated) return;

    const settingsBefore = app.getLoginItemSettings();
    if (settingsBefore.openAtLogin) {
      appLogger.info('AutoStartup', 'Auto-startup already registered, marking migration complete');
      config.autoStartupMigrated = true;
      saveConfig(config);
      return;
    }

    const deviceMode = config.mode || 'pos';
    configureAutoStartup(deviceMode);

    const settingsAfter = app.getLoginItemSettings();
    if (settingsAfter.openAtLogin) {
      config.autoStartupMigrated = true;
      saveConfig(config);
      appLogger.info('AutoStartup', `Upgrade migration: enabled auto-startup for existing "${deviceMode}" workstation`, { device: config.deviceName || 'unknown' });
    } else {
      appLogger.warn('AutoStartup', 'Upgrade migration: auto-startup registration could not be confirmed, will retry on next launch');
    }
  } catch (e) {
    appLogger.error('AutoStartup', 'Auto-startup upgrade migration failed — will retry on next launch', e.message);
  }
}

const DEFAULT_SERVER_URL = 'https://bf45f44b-03bc-427b-ac1c-2f61e2b72052-00-3jaa279qam2p9.janeway.replit.dev';

function getServerUrl() {
  const config = loadConfig();
  return process.env.ELECTRON_SERVER_URL || config.serverUrl || DEFAULT_SERVER_URL;
}

function parseArgs() {
  const args = process.argv.slice(1);
  let cliMode = null;
  let cliKiosk = false;
  args.forEach(arg => {
    if (arg === '--pos' || arg === '--mode=pos') cliMode = 'pos';
    if (arg === '--kds' || arg === '--mode=kds') cliMode = 'kds';
    if (arg === '--kiosk') cliKiosk = true;
    if (arg.startsWith('--server=')) {
      const url = arg.split('=')[1];
      if (url) {
        const config = loadConfig();
        config.serverUrl = url;
        saveConfig(config);
      }
    }
  });

  // Command-line args take priority over saved config
  if (cliMode) {
    appMode = cliMode;
  } else {
    const config = loadConfig();
    if (config.mode) appMode = config.mode;
  }
  if (cliKiosk) {
    isKiosk = true;
  } else {
    const config = loadConfig();
    if (config.kiosk) isKiosk = config.kiosk;
  }
}

function initOfflineDatabase() {
  try {
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch (e) {
      appLogger.warn('OfflineDB', 'better-sqlite3 not available, using JSON file storage');
      return initJsonOfflineStorage();
    }

    offlineDb = new Database(OFFLINE_DB_PATH);
    offlineDb.pragma('journal_mode = WAL');

    offlineDb.exec(`
      CREATE TABLE IF NOT EXISTS offline_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT DEFAULT 'POST',
        body TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0,
        synced_at TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_checks (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_payments (
        id TEXT PRIMARY KEY,
        check_id TEXT,
        amount INTEGER,
        method TEXT,
        terminal_response TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS cached_data (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    appLogger.info('OfflineDB', 'SQLite database initialized', { path: OFFLINE_DB_PATH });
    return true;
  } catch (e) {
    appLogger.error('OfflineDB', 'SQLite init failed', e.message);
    return initJsonOfflineStorage();
  }
}

function initJsonOfflineStorage() {
  const queuePath = path.join(DATA_DIR, 'offline_queue.json');
  const cachePath = path.join(DATA_DIR, 'cached_data.json');
  if (!fs.existsSync(queuePath)) fs.writeFileSync(queuePath, '[]');
  if (!fs.existsSync(cachePath)) fs.writeFileSync(cachePath, '{}');
  appLogger.info('OfflineDB', 'Using JSON-based offline storage', { path: DATA_DIR });
  return true;
}

function queueOfflineOperation(type, endpoint, method, body) {
  try {
    if (offlineDb) {
      offlineDb.prepare(
        'INSERT INTO offline_queue (type, endpoint, method, body) VALUES (?, ?, ?, ?)'
      ).run(type, endpoint, method, JSON.stringify(body));
    } else {
      const queuePath = path.join(DATA_DIR, 'offline_queue.json');
      const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      queue.push({
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        type, endpoint, method,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        created_at: new Date().toISOString(),
        synced: false
      });
      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    }
  } catch (e) {
    appLogger.error('Sync', 'Failed to queue offline operation', e.message);
  }
}

function getPendingOperations() {
  try {
    if (offlineDb) {
      return offlineDb.prepare('SELECT * FROM offline_queue WHERE synced = 0 AND retry_count < 10 ORDER BY created_at').all();
    } else {
      const queuePath = path.join(DATA_DIR, 'offline_queue.json');
      const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      return queue.filter(op => !op.synced && (op.retry_count || 0) < 10);
    }
  } catch (e) {
    appLogger.error('Sync', 'Failed to get pending operations', e.message);
    return [];
  }
}

function markOperationSynced(id) {
  try {
    if (offlineDb) {
      offlineDb.prepare("UPDATE offline_queue SET synced = 1, synced_at = datetime('now') WHERE id = ?").run(id);
    } else {
      const queuePath = path.join(DATA_DIR, 'offline_queue.json');
      const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      const op = queue.find(o => o.id === id || o.created_at === id);
      if (op) op.synced = true;
      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    }
  } catch (e) {
    appLogger.error('Sync', 'Failed to mark operation synced', e.message);
  }
}

async function syncOfflineData() {
  if (!isOnline) return;
  const pending = getPendingOperations();
  if (pending.length === 0) return;

  const capsUrl = getCapsServiceHostUrl();
  if (!capsUrl) {
    appLogger.debug('Sync', `Legacy syncOfflineData: ${pending.length} ops queued but no CAPS URL (WS never syncs directly to cloud)`);
    return;
  }

  appLogger.info('Sync', `Forwarding ${pending.length} legacy offline operations to CAPS`);

  for (const op of pending) {
    try {
      const response = await fetch(`${capsUrl}/api/caps/sync/queue-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: op.type,
          endpoint: op.endpoint,
          method: op.method || 'POST',
          body: op.body,
          priority: op.priority || 5,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        markOperationSynced(op.id || op.created_at);
        appLogger.info('Sync', `CAPS forwarded: ${op.type} -> ${op.endpoint}`);
      } else {
        appLogger.warn('Sync', `CAPS forward failed: ${op.endpoint} -> HTTP ${response.status}`);
      }
    } catch (e) {
      appLogger.warn('Sync', `CAPS forward error: ${op.endpoint}`, e.message);
      break;
    }
  }
  broadcastSyncStatus();
}

async function triggerBackgroundSync() {
  const capsUrl = getCapsServiceHostUrl();

  try {
    if (enhancedOfflineDb) {
      let result;
      if (capsUrl && enhancedOfflineDb.syncToCaps) {
        result = await enhancedOfflineDb.syncToCaps(capsUrl);
        lastSyncAt = new Date().toISOString();
        if (result.failed > 0) {
          lastSyncError = `${result.failed} operations failed (CAPS sync)`;
        } else {
          lastSyncError = null;
        }
        const failedCount = enhancedOfflineDb.getFailedOperationCount ? enhancedOfflineDb.getFailedOperationCount() : 0;
        const remaining = result.remaining || 0;
        if (result.synced > 0 || result.failed > 0) {
          appLogger.info('Sync', `CAPS sync: ${result.synced} synced, ${result.failed} failed, ${remaining} pending` + (failedCount > 0 ? `, ${failedCount} permanently failed` : ''));
        }
      } else if (isOnline) {
        appLogger.debug('Sync', 'No CAPS URL configured, skipping background sync (WS never syncs directly to cloud)');
      }
    }

    if (isOnline && !enhancedOfflineDb) {
      await syncOfflineData();
    }
  } catch (e) {
    lastSyncError = e.message;
    appLogger.warn('Sync', `Background sync error: ${e.message}`);
  }

  broadcastSyncStatus();
}

function startBackgroundSyncWorker() {
  if (backgroundSyncTimer) clearInterval(backgroundSyncTimer);
  backgroundSyncTimer = setInterval(async () => {
    if (connectionMode === 'green' || connectionMode === 'yellow') {
      await triggerBackgroundSync();
    }
  }, 5000);
  appLogger.info('Sync', 'Background sync worker started (5s interval, syncs to CAPS in GREEN/YELLOW)');
}

async function checkConnectivity(options = {}) {
  const forceImmediate = options.forceImmediate || false;
  checkLocalDbHealth();

  if (!localDbHealthy) {
    appLogger.error('Network', 'Local SQLite UNHEALTHY — POS cannot operate');
    setConnectionMode('red');
    if (offlineInterceptor) {
      offlineInterceptor.setOffline(true);
      offlineInterceptor.setConnectionMode('red');
    }
    if (mainWindow) {
      mainWindow.webContents.send('online-status', false);
      mainWindow.webContents.send('connection-mode', 'red');
      mainWindow.webContents.send('local-db-critical', { healthy: false, message: 'Local database error — POS cannot operate. Contact support.' });
    }
    broadcastSyncStatus();
    return;
  }

  try {
    const serverUrl = getServerUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${serverUrl}/api/health/db-probe`, { signal: controller.signal });
    clearTimeout(timeout);

    let dbHealthy = false;
    if (response.ok) {
      try {
        const data = await response.json();
        dbHealthy = data.dbHealthy === true;
      } catch {
        dbHealthy = false;
      }
    }

    const wasOffline = !isOnline;
    isOnline = dbHealthy;

    if (offlineInterceptor) {
      offlineInterceptor.setOffline(!isOnline);
    }

    if (isOnline) {
      firstBootConnectivityChecked = true;
      connectivityFailCount = 0;
      connectivitySuccessCount++;
      if (connectionMode !== 'green') {
        if (connectivitySuccessCount >= HYSTERESIS_THRESHOLD) {
          setConnectionMode('green');
          connectivitySuccessCount = 0;
        } else {
          appLogger.info('Network', `Cloud reachable (${connectivitySuccessCount}/${HYSTERESIS_THRESHOLD} checks) — waiting for stable connection`);
        }
      } else {
        setConnectionMode('green');
      }
    } else {
      appLogger.warn('Network', `Cloud DB probe failed (HTTP ${response.status}) — cloud reachable but DB unhealthy`);
      throw new Error('DB probe failed — cloud DB not functional');
    }

    if (wasOffline && isOnline) {
      appLogger.info('Network', 'Cloud connection restored with healthy DB — triggering sync');
      setConnectionMode('green');
      triggerBackgroundSync();
      if (mainWindow && !mainWindow.isDestroyed()) {
        const currentUrl = mainWindow.webContents.getURL();
        if (currentUrl.startsWith('data:')) {
          const bundledIndex = path.join(getBundledAssetsDir(), 'index.html');
          appLogger.info('Network', `Window stuck on error/loading page after reconnect, loading bundled index.html`);
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              if (fs.existsSync(bundledIndex)) {
                mainWindow.loadFile(bundledIndex);
              } else {
                const serverUrl = getServerUrl();
                mainWindow.loadURL(`${serverUrl}${appMode === 'kds' ? '/kds' : '/'}`);
              }
            }
          }, 1000);
        }
      }
    }
  } catch (e) {
    connectivitySuccessCount = 0;
    connectivityFailCount++;
    
    if (!forceImmediate && firstBootConnectivityChecked && connectionMode === 'green' && connectivityFailCount < HYSTERESIS_THRESHOLD) {
      appLogger.info('Network', `Cloud unreachable (${connectivityFailCount}/${HYSTERESIS_THRESHOLD} failures) — waiting before switching mode`);
      return;
    }
    if (!firstBootConnectivityChecked) {
      firstBootConnectivityChecked = true;
      appLogger.info('Network', 'First boot connectivity check failed — immediately switching to offline mode');
    }

    const wasOnline = isOnline;
    isOnline = false;
    if (offlineInterceptor) {
      offlineInterceptor.setOffline(true);
    }

    if (wasOnline) {
      appLogger.warn('Network', `Cloud connection lost — checking CAPS fallback | Error: ${e.message}`);
    }

    const config = loadConfig();
    const serviceHostUrl = config.serviceHostUrl;
    if (serviceHostUrl) {
      try {
        const capsCheck = await fetch(`${serviceHostUrl}/api/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (capsCheck.ok) {
          let capsDbHealthy = false;
          try {
            const capsHealthData = await capsCheck.json();
            capsDbHealthy = capsHealthData.dbHealthy === true;
          } catch {
            appLogger.warn('Network', 'CAPS /api/health returned OK but unparseable response — treating as unhealthy');
          }
          if (capsDbHealthy) {
            setConnectionMode('yellow');
            if (offlineInterceptor) {
              offlineInterceptor.setServiceHostUrl(serviceHostUrl);
              offlineInterceptor.setConnectionMode('yellow');
            }
          } else {
            appLogger.warn('Network', 'CAPS reachable but local DB unhealthy — setting RED mode');
            setConnectionMode('red');
            if (offlineInterceptor) {
              offlineInterceptor.setConnectionMode('red');
            }
          }
        } else {
          setConnectionMode('red');
          if (offlineInterceptor) {
            offlineInterceptor.setConnectionMode('red');
          }
        }
      } catch {
        setConnectionMode('red');
        if (offlineInterceptor) {
          offlineInterceptor.setConnectionMode('red');
        }
      }
    } else {
      setConnectionMode('red');
      if (offlineInterceptor) {
        offlineInterceptor.setConnectionMode('red');
      }
    }
  }

  if (mainWindow) {
    mainWindow.webContents.send('online-status', isOnline);
    mainWindow.webContents.send('connection-mode', connectionMode);
  }
  broadcastSyncStatus();
}

function createWindow() {
  const config = loadConfig();
  const needsSetup = !config.setupComplete;

  const windowConfig = {
    width: needsSetup ? 620 : 1280,
    height: needsSetup ? 640 : 1024,
    minWidth: needsSetup ? 580 : 1024,
    minHeight: needsSetup ? 500 : 768,
    title: needsSetup ? 'Cloud POS - Terminal Setup' : (appMode === 'kds' ? 'Cloud POS - Kitchen Display' : 'Cloud POS'),
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: needsSetup
        ? path.join(__dirname, 'setup-wizard-preload.cjs')
        : path.join(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
    fullscreenable: !needsSetup,
    backgroundColor: '#0f1729',
    kiosk: needsSetup ? false : isKiosk,
    fullscreen: needsSetup ? false : isKiosk,
    resizable: true,
  };

  mainWindow = new BrowserWindow(windowConfig);
  if (!needsSetup && !isKiosk) {
    mainWindow.maximize();
  }
  appLogger.info('Window', needsSetup ? 'Opening setup wizard' : `Launching ${appMode.toUpperCase()} mode`, { kiosk: isKiosk, maximized: !needsSetup && !isKiosk });

  if (needsSetup) {
    mainWindow.loadFile(path.join(__dirname, 'setup-wizard.html'));
  } else {
    const serverUrl = getServerUrl();
    const startPath = appMode === 'kds' ? '/kds' : '/';
    const targetUrl = `${serverUrl}${startPath}`;
    appLogger.info('Window', `Loading URL: ${targetUrl} (always-local frontend via protocol interceptor)`);
    
    mainWindow.webContents.session.clearCache().then(() => {
      appLogger.info('Cache', 'Chromium HTTP cache cleared on startup');
    }).catch(() => {});

    mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      details.requestHeaders['Pragma'] = 'no-cache';
      callback({ requestHeaders: details.requestHeaders });
    });

    mainWindow.loadURL(targetUrl);

    let lastBuildHash = null;
    const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
    const buildCheckInterval = setInterval(async () => {
      try {
        if (!mainWindow || mainWindow.isDestroyed()) {
          clearInterval(buildCheckInterval);
          return;
        }
        const serverUrl = getServerUrl();
        const resp = await require('electron').net.fetch(`${serverUrl}/api/health/build-version`, {
          cache: 'no-store',
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data.buildHash) return;
        
        if (lastBuildHash === null) {
          lastBuildHash = data.buildHash;
          appLogger.info('FrontendRefresh', `Initial build hash: ${lastBuildHash}`);
        } else if (lastBuildHash !== data.buildHash) {
          appLogger.info('FrontendRefresh', `Build hash changed: ${lastBuildHash} → ${data.buildHash}. Reloading frontend.`);
          lastBuildHash = data.buildHash;
          mainWindow.webContents.reloadIgnoringCache();
        }
      } catch (err) {
        appLogger.debug('FrontendRefresh', `Build version check failed (offline?): ${err.message}`);
      }
    }, REFRESH_INTERVAL_MS);

    mainWindow.on('closed', () => {
      clearInterval(buildCheckInterval);
    });
  }

  if (process.env.NODE_ENV !== 'production' && !isKiosk) {
    const menuTemplate = [
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          {
            label: 'Toggle Fullscreen',
            accelerator: 'F11',
            click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()),
          },
        ],
      },
      {
        label: 'Mode',
        submenu: [
          {
            label: 'POS Mode',
            type: 'radio',
            checked: appMode === 'pos',
            click: () => switchMode('pos'),
          },
          {
            label: 'KDS Mode',
            type: 'radio',
            checked: appMode === 'kds',
            click: () => switchMode('kds'),
          },
        ],
      },
      {
        label: 'Settings',
        submenu: [
          {
            label: 'Configure Server URL...',
            click: () => showServerConfig(),
          },
          {
            label: 'Reconfigure Terminal...',
            click: async () => {
              const result = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'Reconfigure Terminal',
                message: 'This will open the Terminal Setup Wizard to change the enterprise, property, or device assignment.\n\nContinue?',
                buttons: ['Cancel', 'Reconfigure'],
                defaultId: 0,
              });
              if (result.response === 1) {
                const cfg = loadConfig();
                cfg.setupComplete = false;
                saveConfig(cfg);
                app.relaunch();
                app.exit(0);
              }
            },
          },
          {
            label: 'Toggle Kiosk Mode',
            click: () => {
              isKiosk = !isKiosk;
              mainWindow.setKiosk(isKiosk);
              const config = loadConfig();
              config.kiosk = isKiosk;
              saveConfig(config);
            },
          },
          { type: 'separator' },
          {
            label: 'View Logs...',
            click: () => {
              appLogger.info('App', 'User opened log directory');
              shell.openPath(LOG_DIR);
            },
          },
          { type: 'separator' },
          {
            label: 'Clear Browser Data',
            click: async () => {
              const result = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'Clear Browser Data',
                message: 'This will clear saved login sessions and enterprise selection. You will need to log in again.\n\nContinue?',
                buttons: ['Cancel', 'Clear'],
                defaultId: 0,
              });
              if (result.response === 1) {
                await mainWindow.webContents.session.clearStorageData();
                const startPath = appMode === 'kds' ? '/kds' : '/';
                mainWindow.loadURL(`${getServerUrl()}${startPath}`);
              }
            },
          },
          {
            label: 'Reset Everything...',
            click: () => resetAllData(),
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  } else {
    Menu.setApplicationMenu(null);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentURL = mainWindow.webContents.getURL();
    try {
      const currentOrigin = new URL(currentURL).origin;
      const newOrigin = new URL(url).origin;
      if (currentOrigin !== newOrigin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch (e) {
      // ignore invalid URLs
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    appLogger.error('Window', `Page load failed: ${errorDescription}`, { errorCode, url: validatedURL });

    if (errorCode === -3) {
      appLogger.info('Window', 'Navigation cancelled (error -3), ignoring');
      return;
    }

    if (!mainWindow) return;

    if (errorCode === -21) {
      appLogger.info('Window', 'Network changed (ERR_NETWORK_CHANGED), auto-retrying in 2s...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const bundledIndex = path.join(getBundledAssetsDir(), 'index.html');
          if (fs.existsSync(bundledIndex)) {
            appLogger.info('Window', `Auto-retrying load after ERR_NETWORK_CHANGED: loading bundled index.html`);
            mainWindow.loadFile(bundledIndex);
          } else {
            const sUrl = getServerUrl();
            const sPath = appMode === 'kds' ? '/kds' : '/';
            appLogger.info('Window', `Auto-retrying load after ERR_NETWORK_CHANGED: ${sUrl}${sPath}`);
            mainWindow.loadURL(`${sUrl}${sPath}`);
          }
        }
      }, 2000);
      return;
    }

    if (errorCode === -106 || errorCode === -105 || errorCode === -2) {
      isOnline = false;
      if (offlineInterceptor) offlineInterceptor.setOffline(true);
      checkConnectivity();
    }

    const serverUrl = getServerUrl();
    const startPath = appMode === 'kds' ? '/kds' : '/';
    const retryUrl = `${serverUrl}${startPath}`;

    const isKdsMode = appMode === 'kds';
    const pageTitle = isKdsMode ? 'Kitchen Display - Connecting' : 'Cloud POS - Connection Error';
    const pageIcon = isKdsMode 
      ? '<div style="font-size:48px;margin-bottom:16px">🍳</div>' 
      : '';
    const pageHeading = isKdsMode 
      ? 'Kitchen Display - Connecting to Server' 
      : 'Cannot Connect to Server';
    const pageMessage = isKdsMode
      ? 'Waiting for the server to become available. The kitchen display will load automatically when connected.'
      : 'Unable to reach the Cloud POS server. Please check your internet connection and verify the server URL is correct.';
    const autoRetryScript = isKdsMode
      ? `<script>let c=15;const t=document.getElementById('countdown');setInterval(()=>{c--;if(c<=0){c=15;location.href='${retryUrl.replace(/'/g, "\\'")}';}if(t)t.textContent=c;},1000);</script>`
      : '';
    const countdownText = isKdsMode 
      ? '<p style="opacity:0.6;font-size:13px;margin-top:8px">Auto-retry in <span id="countdown">15</span>s</p>' 
      : '';
    const spinnerHtml = isKdsMode
      ? '<div style="width:32px;height:32px;border:3px solid #2a3a52;border-top-color:#f59e0b;border-radius:50%;animation:spin 0.8s linear infinite;margin:16px auto 0"></div>@keyframes spin{to{transform:rotate(360deg)}}'
      : '';
    const spinnerCss = isKdsMode ? '@keyframes spin{to{transform:rotate(360deg)}}' : '';

    const errorHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pageTitle}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1729;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.c{max-width:520px;padding:40px}h1{margin:0 0 12px;font-size:22px}p{opacity:0.8;line-height:1.6;margin:0 0 20px;font-size:14px}
button{padding:12px 32px;font-size:16px;border:1px solid #4a4a6a;border-radius:8px;background:#2a2a4a;color:#fff;cursor:pointer;margin:4px}
button:hover{background:#3a3a5a}.info{margin-top:20px;font-size:12px;opacity:0.4;font-family:monospace}${spinnerCss}</style></head>
<body><div class="c">${pageIcon}<h1>${pageHeading}</h1>
<p>${pageMessage}</p>
<button onclick="location.href='${retryUrl.replace(/'/g, "\\'")}'" id="retryBtn">Retry Connection</button>
${countdownText}${isKdsMode ? '<div style="width:32px;height:32px;border:3px solid #2a3a52;border-top-color:#f59e0b;border-radius:50%;animation:spin 0.8s linear infinite;margin:16px auto 0"></div>' : ''}
<p class="info">Server: ${serverUrl}<br>Error: ${errorDescription} (${errorCode})</p></div></body>${autoRetryScript}</html>`;

    if (mainWindow) mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`).catch(() => {});
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) return;
    const url = mainWindow.webContents.getURL();
    if (!url.startsWith('data:')) {
      appLogger.info('Window', `Page loaded successfully: ${url}`);
      injectServiceHostUrl();

      if (!bootstrapWatchdogCleared && bootstrapReloadCount < BOOTSTRAP_MAX_RELOADS) {
        if (bootstrapWatchdogTimer) clearTimeout(bootstrapWatchdogTimer);
        bootstrapWatchdogTimer = setTimeout(() => {
          if (!bootstrapWatchdogCleared && mainWindow && !mainWindow.isDestroyed()) {
            bootstrapReloadCount++;
            appLogger.warn('Window', `Bootstrap watchdog: no renderer activity after ${BOOTSTRAP_WATCHDOG_MS / 1000}s, reloading (attempt ${bootstrapReloadCount}/${BOOTSTRAP_MAX_RELOADS})`);
            mainWindow.webContents.reloadIgnoringCache();
          }
        }, BOOTSTRAP_WATCHDOG_MS);
      } else if (bootstrapReloadCount >= BOOTSTRAP_MAX_RELOADS && !bootstrapWatchdogCleared) {
        appLogger.error('Window', `Bootstrap watchdog: ${BOOTSTRAP_MAX_RELOADS} reload attempts exhausted, app may be stuck`);
      }
    }
  });
}

function switchMode(mode) {
  appMode = mode;
  const config = loadConfig();
  config.mode = mode;
  saveConfig(config);
  appLogger.info('App', `Mode switched to ${mode}`);
  const serverUrl = getServerUrl();
  const startPath = mode === 'kds' ? '/kds' : '/';
  mainWindow.loadURL(`${serverUrl}${startPath}`);
}

async function showServerConfig() {
  const config = loadConfig();
  const currentUrl = getServerUrl();

  const { response, returnValue } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Server Configuration',
    message: `Current server:\n${currentUrl}\n\nCurrent mode: ${appMode.toUpperCase()}`,
    detail: 'Choose an action below:',
    buttons: ['Cancel', 'Change Server URL', 'Reset to Default'],
    defaultId: 0,
    cancelId: 0,
  });

  if (response === 1) {
    const newUrlWin = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 460,
      height: 200,
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'settings-preload.cjs'),
      },
    });
    newUrlWin.setMenuBarVisibility(false);

    ipcMain.handleOnce('settings-get-data', () => ({
      currentUrl,
      defaultUrl: DEFAULT_SERVER_URL,
      mode: appMode,
    }));

    ipcMain.once('settings-save-url', (event, newUrl) => {
      if (newUrl && newUrl.trim()) {
        const cleanUrl = newUrl.trim().replace(/\/+$/, '');
        config.serverUrl = cleanUrl;
        saveConfig(config);
        const startPath = appMode === 'kds' ? '/kds' : '/';
        mainWindow.loadURL(`${cleanUrl}${startPath}`);
      }
      newUrlWin.close();
    });

    newUrlWin.on('closed', () => {
      ipcMain.removeHandler('settings-get-data');
      ipcMain.removeAllListeners('settings-save-url');
    });

    newUrlWin.loadFile(path.join(__dirname, 'settings-url.html'));
  } else if (response === 2) {
    delete config.serverUrl;
    saveConfig(config);
    const startPath = appMode === 'kds' ? '/kds' : '/';
    mainWindow.loadURL(`${getServerUrl()}${startPath}`);
  }
}

async function resetAllData() {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Reset Application',
    message: 'This will clear all saved settings, cached data, offline transactions, and stored credentials. The app will restart fresh.\n\nAre you sure?',
    buttons: ['Cancel', 'Reset Everything'],
    defaultId: 0,
    cancelId: 0,
  });

  if (result.response === 1) {
    appLogger.info('App', 'Reset all data requested');
    try {
      await mainWindow.webContents.session.clearStorageData();

      saveConfig({});

      if (offlineDb) {
        try {
          offlineDb.exec('DELETE FROM cached_data');
          offlineDb.exec('DELETE FROM offline_queue');
          offlineDb.exec('DELETE FROM offline_payments');
          offlineDb.exec('DELETE FROM offline_checks');
        } catch (e) {
          appLogger.warn('App', 'Some offline tables may not exist during reset', e.message);
        }
      }

      const jsonResets = { 'cached_data.json': '{}', 'offline_queue.json': '[]' };
      Object.entries(jsonResets).forEach(([file, empty]) => {
        const filePath = path.join(DATA_DIR, file);
        if (fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, empty);
        }
      });

      appLogger.warn('App', 'All data cleared, app will relaunch');
      app.relaunch();
      app.exit(0);
    } catch (e) {
      appLogger.error('App', 'Reset failed', e.message);
      dialog.showErrorBox('Reset Failed', 'Could not reset application data: ' + e.message);
    }
  }
}

function sendRawToPrinter(address, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Printer connection timed out'));
    }, 10000);

    client.connect(port || 9100, address, () => {
      client.write(Buffer.from(data), (err) => {
        clearTimeout(timeout);
        if (err) {
          client.destroy();
          reject(err);
        } else {
          client.end();
          resolve({ success: true });
        }
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    client.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

function setupIpcHandlers() {
  ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });

  ipcMain.handle('get-app-info', () => {
    const config = loadConfig();
    return {
      mode: appMode,
      isKiosk,
      isOnline,
      connectionMode,
      serverUrl: getServerUrl(),
      serviceHostUrl: config.serviceHostUrl || null,
      capsWorkstationId: config.capsWorkstationId || null,
      capsWorkstationName: config.capsWorkstationName || null,
      isCapsWorkstation: config.isCapsWorkstation || false,
      platform: process.platform,
      version: app.getVersion(),
      dataDir: DATA_DIR,
      pendingSync: getPendingOperations().length,
      enterpriseId: config.enterpriseId || null,
      enterpriseName: config.enterpriseName || null,
      propertyId: config.propertyId || null,
      propertyName: config.propertyName || null,
      rvcId: config.rvcId || null,
      rvcName: config.rvcName || null,
      deviceId: config.deviceId || null,
      deviceName: config.deviceName || null,
      deviceType: config.deviceType || null,
      offlineCheckNumberStart: config.offlineCheckNumberStart || null,
      offlineCheckNumberEnd: config.offlineCheckNumberEnd || null,
      setupComplete: config.setupComplete || false,
      updateStatus: getUpdateState(),
    };
  });

  ipcMain.handle('get-online-status', () => isOnline);
  ipcMain.handle('get-connection-mode', () => connectionMode);

  ipcMain.handle('clear-offline-sales-data', () => {
    appLogger.info('App', 'Clearing offline sales data (sales_data_cleared event received)');
    try {
      if (offlineDb) {
        const tables = ['offline_queue', 'offline_payments', 'offline_checks'];
        for (const table of tables) {
          try {
            offlineDb.exec(`DELETE FROM ${table}`);
            appLogger.info('App', `Cleared offline table: ${table}`);
          } catch (e) {
            appLogger.warn('App', `Could not clear offline table ${table}: ${e.message}`);
          }
        }
      }
      if (enhancedOfflineDb) {
        try {
          if (enhancedOfflineDb.clearFailedOperations) {
            enhancedOfflineDb.clearFailedOperations();
            appLogger.info('App', 'Cleared enhanced offline DB failed operations');
          }
          if (enhancedOfflineDb.db && enhancedOfflineDb.usingSqlite) {
            const saleTables = ['offline_checks', 'offline_payments', 'offline_queue', 'pending_operations'];
            for (const t of saleTables) {
              try {
                enhancedOfflineDb.db.exec(`DELETE FROM ${t}`);
                appLogger.info('App', `Cleared enhanced offline table: ${t}`);
              } catch (e) {
                appLogger.warn('App', `Enhanced offline table ${t} not found or empty: ${e.message}`);
              }
            }
          }
        } catch (e) {
          appLogger.warn('App', `Could not clear enhanced offline DB: ${e.message}`);
        }
      }
      return { success: true };
    } catch (e) {
      appLogger.error('App', `Failed to clear offline sales data: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('rotate-logs-business-date', (event, businessDate) => {
    appLogger.info('LogRotation', `Business date rollover: archiving logs for ${businessDate}`);
    const { rotateLogsForBusinessDate } = require('./logger.cjs');
    const moved = rotateLogsForBusinessDate(businessDate);
    appLogger.info('LogRotation', `Archived ${moved} log files to archive/${businessDate}/`);
    return { success: true, moved, businessDate };
  });

  ipcMain.handle('open-log-directory', () => {
    appLogger.info('App', 'Opening log directory via IPC');
    shell.openPath(LOG_DIR);
    return { success: true, path: LOG_DIR };
  });

  ipcMain.handle('get-log-content', async (event, { logName, lines }) => {
    try {
      if (logName === 'system') {
        const { UNIFIED_LOG_FILE } = require('./logger.cjs');
        const fs = require('fs');
        if (fs.existsSync(UNIFIED_LOG_FILE)) {
          const content = fs.readFileSync(UNIFIED_LOG_FILE, 'utf8');
          const allLines = content.split('\n');
          return { success: true, content: allLines.slice(-(lines || 300)).join('\n'), path: UNIFIED_LOG_FILE };
        }
        return { success: true, content: '', path: UNIFIED_LOG_FILE };
      }
      const allowedLogs = ['app', 'print-agent', 'offline-db', 'installer'];
      const safeName = allowedLogs.includes(logName) ? logName : 'app';
      const { Logger } = require('./logger.cjs');
      const logger = new Logger(safeName);
      return { success: true, content: logger.readRecentLines(lines || 200), path: logger.getLogPath() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('renderer-log', (event, payload) => {
    try {
      if (!bootstrapWatchdogCleared) {
        bootstrapWatchdogCleared = true;
        if (bootstrapWatchdogTimer) { clearTimeout(bootstrapWatchdogTimer); bootstrapWatchdogTimer = null; }
        appLogger.info('Window', 'Bootstrap watchdog cleared via renderer-log IPC');
      }
      if (!payload || typeof payload !== 'object') return { success: false };
      const allowedLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      const allowedSubsystems = ['RENDERER', 'NETWORK', 'POS', 'KDS', 'SYNC', 'UI', 'AUTH'];
      const safeLevel = allowedLevels.includes(payload.level) ? payload.level : 'INFO';
      const safeSubsystem = allowedSubsystems.includes(payload.subsystem)
        ? payload.subsystem : 'RENDERER';
      const safeCategory = String(payload.category || 'General').substring(0, 32).replace(/[\r\n]/g, '');
      const safeMessage = String(payload.message || '').substring(0, 1000).replace(/[\r\n]/g, ' ');
      let safeData = payload.data;
      if (safeData !== undefined && safeData !== null) {
        try {
          const serialized = JSON.stringify(safeData);
          if (serialized.length > 2000) safeData = serialized.substring(0, 2000) + '...(truncated)';
        } catch { safeData = '[unserializable]'; }
      }
      const { Logger } = require('./logger.cjs');
      const rendererLogger = new Logger('app');
      rendererLogger.write(safeLevel, `R:${safeSubsystem}:${safeCategory}`, safeMessage, safeData);
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle('renderer-bootstrap-ready', () => {
    if (!bootstrapWatchdogCleared) {
      bootstrapWatchdogCleared = true;
      if (bootstrapWatchdogTimer) {
        clearTimeout(bootstrapWatchdogTimer);
        bootstrapWatchdogTimer = null;
      }
      appLogger.info('Window', `Bootstrap watchdog cleared: renderer confirmed ready (after ${bootstrapReloadCount} reload(s))`);
    }
    return { success: true };
  });

  ipcMain.handle('print-raw', async (event, { address, port, data }) => {
    try {
      printLogger.info('RawPrint', `Sending raw data to ${address}:${port || 9100}`);
      const result = await sendRawToPrinter(address, port || 9100, data);
      printLogger.info('RawPrint', 'Raw print successful');
      return { success: true };
    } catch (e) {
      printLogger.error('RawPrint', `Raw print failed: ${e.message}`, { address, port });
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('print-escpos', async (event, { address, port, commands }) => {
    try {
      printLogger.info('EscPos', `Sending ESC/POS commands to ${address}:${port || 9100}`, { commandCount: commands.length });
      const buffer = buildEscPosBuffer(commands);
      const result = await sendRawToPrinter(address, port || 9100, buffer);
      printLogger.info('EscPos', 'ESC/POS print successful');
      return { success: true };
    } catch (e) {
      printLogger.error('EscPos', `ESC/POS print failed: ${e.message}`, { address, port });
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-local-printers', async () => {
    try {
      if (mainWindow) {
        const printers = await mainWindow.webContents.getPrintersAsync();
        return printers.map(p => ({
          name: p.name,
          displayName: p.displayName,
          status: p.status,
          isDefault: p.isDefault,
        }));
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('print-to-system-printer', async (event, { printerName, data, options }) => {
    try {
      if (!mainWindow) return { success: false, error: 'No window available' };
      mainWindow.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: printerName || undefined,
        ...options,
      }, (success, errorType) => {
        // callback-based, can't easily return
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('queue-offline-operation', async (event, { type, endpoint, method, body }) => {
    queueOfflineOperation(type, endpoint, method, body);
    return { success: true, pending: getPendingOperations().length };
  });

  ipcMain.handle('get-pending-sync-count', () => {
    updatePendingSyncCount();
    return pendingSyncCount;
  });

  ipcMain.handle('get-connection-mode-detail', () => ({
    mode: connectionMode,
    pendingSyncCount,
    localDbHealthy,
    lastSyncAt,
    cloudProbeResult: isOnline,
  }));

  ipcMain.handle('force-sync', async () => {
    await triggerBackgroundSync();
    return { pending: pendingSyncCount };
  });

  ipcMain.handle('clear-failed-sync-ops', () => {
    if (enhancedOfflineDb && enhancedOfflineDb.clearFailedOperations) {
      const cleared = enhancedOfflineDb.clearFailedOperations();
      updatePendingSyncCount();
      broadcastSyncStatus();
      return { cleared, pending: pendingSyncCount };
    }
    return { cleared: 0, pending: pendingSyncCount };
  });

  ipcMain.handle('get-failed-sync-ops', () => {
    if (enhancedOfflineDb && enhancedOfflineDb.getFailedOperations) {
      return enhancedOfflineDb.getFailedOperations();
    }
    return [];
  });

  ipcMain.handle('cache-data', async (event, { key, data }) => {
    try {
      if (offlineDb) {
        offlineDb.prepare(
          "INSERT OR REPLACE INTO cached_data (key, data, updated_at) VALUES (?, ?, datetime('now'))"
        ).run(key, JSON.stringify(data));
      } else {
        const cachePath = path.join(DATA_DIR, 'cached_data.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        cache[key] = { data, updated_at: new Date().toISOString() };
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-cached-data', async (event, { key }) => {
    try {
      if (offlineDb) {
        const row = offlineDb.prepare('SELECT data FROM cached_data WHERE key = ?').get(key);
        return row ? JSON.parse(row.data) : null;
      } else {
        const cachePath = path.join(DATA_DIR, 'cached_data.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        return cache[key]?.data || null;
      }
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('set-mode', async (event, mode) => {
    switchMode(mode);
    return { success: true, mode };
  });

  ipcMain.handle('set-server-url', async (event, url) => {
    const config = loadConfig();
    config.serverUrl = url;
    saveConfig(config);
    return { success: true };
  });

  ipcMain.handle('set-auto-launch', async (event, enable) => {
    const config = loadConfig();
    config.autoLaunch = enable;
    saveConfig(config);
    setupAutoLaunch(enable);
    return { success: true };
  });

  // === Print Agent IPC Handlers ===
  ipcMain.handle('print-agent-get-status', async () => {
    if (!printAgent) return { isRunning: false };
    return printAgent.getStatus();
  });

  ipcMain.handle('print-agent-start', async () => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    printAgent.start();
    return { success: true };
  });

  ipcMain.handle('print-agent-stop', async () => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    printAgent.stop();
    return { success: true };
  });

  ipcMain.handle('print-agent-add-printer', async (event, config) => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    printAgent.addPrinter(config);
    return { success: true };
  });

  ipcMain.handle('print-agent-remove-printer', async (event, key) => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    printAgent.removePrinter(key);
    return { success: true };
  });

  ipcMain.handle('print-agent-get-printers', async () => {
    if (!printAgent) return [];
    return printAgent.getPrinters();
  });

  ipcMain.handle('print-agent-configure', async (event, config) => {
    const appConfig = loadConfig();
    if (config.agentId) appConfig.printAgentId = config.agentId;
    if (config.agentToken) appConfig.printAgentToken = config.agentToken;
    saveConfig(appConfig);

    if (printAgent) {
      if (config.agentId) printAgent.agentId = config.agentId;
      if (config.agentToken) printAgent.agentToken = config.agentToken;
      printAgent.stop();
      printAgent.start();
    }
    return { success: true };
  });

  ipcMain.handle('print-agent-test-printer', async (event, { ipAddress, port }) => {
    try {
      printLogger.info('Test', `Testing printer at ${ipAddress}:${port || 9100}`);
      const testData = Buffer.from([0x1B, 0x40, 0x1B, 0x61, 0x01]); // init + center
      const text = Buffer.from('*** PRINT TEST ***\nCloud POS Print Agent\nPrinter Connected OK\n\n\n', 'utf-8');
      const cut = Buffer.from([0x1D, 0x56, 0x01]); // partial cut
      const fullData = Buffer.concat([testData, text, cut]);

      await printAgent.sendToPrinter(ipAddress, port || 9100, fullData);
      printLogger.info('Test', 'Printer test successful');
      return { success: true };
    } catch (e) {
      printLogger.error('Test', `Printer test failed: ${e.message}`, { ipAddress, port });
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('diag-list-com-ports', async () => {
    let ports = [];
    const errors = [];

    try {
      const { SerialPort } = require('serialport');
      const spPorts = await SerialPort.list();
      ports = spPorts.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || null,
        serialNumber: p.serialNumber || null,
        pnpId: p.pnpId || null,
        vendorId: p.vendorId || null,
        productId: p.productId || null,
        source: 'serialport',
      }));
    } catch (err) {
      const msg = err.code === 'MODULE_NOT_FOUND' ? 'serialport module not available' : err.message;
      errors.push(msg);
      appLogger.warn('Diagnostics', 'serialport list failed, trying registry fallback', msg);
    }

    if (ports.length === 0 && process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        const regOutput = execSync(
          'reg query HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM 2>nul',
          { encoding: 'utf-8', timeout: 5000 }
        );
        const regPorts = [];
        for (const line of regOutput.split('\n')) {
          const match = line.match(/REG_SZ\s+(COM\d+)/i);
          if (match) {
            regPorts.push({
              path: match[1],
              manufacturer: null,
              serialNumber: null,
              pnpId: null,
              vendorId: null,
              productId: null,
              source: 'registry',
            });
          }
        }
        if (regPorts.length > 0) {
          ports = regPorts;
          appLogger.info('Diagnostics', `Registry fallback found ${regPorts.length} COM port(s): ${regPorts.map(p => p.path).join(', ')}`);
        }
      } catch (regErr) {
        appLogger.warn('Diagnostics', 'Registry COM port query failed', regErr.message);
      }
    }

    if (ports.length === 0 && process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        const wmiOutput = execSync(
          'powershell -NoProfile -Command "Get-WmiObject Win32_SerialPort | Select-Object DeviceID, Name | ConvertTo-Json"',
          { encoding: 'utf-8', timeout: 10000 }
        );
        const trimmed = wmiOutput.trim();
        if (trimmed && trimmed !== '') {
          let wmiPorts = JSON.parse(trimmed);
          if (!Array.isArray(wmiPorts)) wmiPorts = [wmiPorts];
          const parsed = wmiPorts.filter(p => p.DeviceID).map(p => ({
            path: p.DeviceID,
            manufacturer: p.Name || null,
            serialNumber: null,
            pnpId: null,
            vendorId: null,
            productId: null,
            source: 'wmi',
          }));
          if (parsed.length > 0) {
            ports = parsed;
            appLogger.info('Diagnostics', `WMI fallback found ${parsed.length} COM port(s): ${parsed.map(p => p.path).join(', ')}`);
          }
        }
      } catch (wmiErr) {
        appLogger.warn('Diagnostics', 'WMI COM port query failed', wmiErr.message);
      }
    }

    if (ports.length === 0 && errors.length > 0) {
      return { success: false, error: errors.join('; ') + '. Use manual port entry below.', ports: [] };
    }
    return { success: true, ports };
  });

  ipcMain.handle('diag-test-serial', async (event, { comPort, baudRate, printTestPage }) => {
    try {
      const { SerialPort } = require('serialport');
      const startTime = Date.now();
      const result = await new Promise((resolve, reject) => {
        const port = new SerialPort({
          path: comPort,
          baudRate: baudRate || 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false,
        });

        const timeout = setTimeout(() => {
          port.close(() => {});
          reject(new Error(`Timeout opening ${comPort}`));
        }, 8000);

        port.open((err) => {
          if (err) {
            clearTimeout(timeout);
            reject(new Error(`Failed to open ${comPort}: ${err.message}`));
            return;
          }

          const openTime = Date.now() - startTime;

          if (printTestPage) {
            const init = Buffer.from([0x1B, 0x40]);
            const center = Buffer.from([0x1B, 0x61, 0x01]);
            const bold = Buffer.from([0x1B, 0x45, 0x01]);
            const boldOff = Buffer.from([0x1B, 0x45, 0x00]);
            const left = Buffer.from([0x1B, 0x61, 0x00]);
            const text = Buffer.from([
              '*** COM PORT TEST ***',
              'Cloud POS Diagnostics',
              `Port: ${comPort}`,
              `Baud: ${baudRate || 9600}`,
              `Time: ${new Date().toLocaleString()}`,
              '',
              'Serial communication OK',
              '',
              '',
              '',
            ].join('\n'), 'utf-8');
            const cut = Buffer.from([0x1D, 0x56, 0x01]);
            const fullData = Buffer.concat([init, center, bold, Buffer.from('*** COM PORT TEST ***\n'), boldOff, left, text, cut]);

            port.write(fullData, (writeErr) => {
              if (writeErr) {
                clearTimeout(timeout);
                port.close(() => {});
                reject(new Error(`Write failed: ${writeErr.message}`));
                return;
              }
              port.drain(() => {
                clearTimeout(timeout);
                port.close(() => {});
                resolve({ opened: true, openTimeMs: openTime, dataSent: true, bytesSent: fullData.length });
              });
            });
          } else {
            clearTimeout(timeout);
            port.close(() => {});
            resolve({ opened: true, openTimeMs: openTime, dataSent: false, bytesSent: 0 });
          }
        });

        port.on('error', (portErr) => {
          clearTimeout(timeout);
          port.close(() => {});
          reject(portErr);
        });
      });

      return { success: true, ...result };
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        return { success: false, error: 'serialport module not available' };
      }
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('diag-test-network-printer', async (event, { ipAddress, port }) => {
    try {
      const startTime = Date.now();
      const result = await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error(`Connection timeout to ${ipAddress}:${port}`));
        }, 5000);

        socket.connect(port || 9100, ipAddress, () => {
          const connectTime = Date.now() - startTime;
          clearTimeout(timeout);
          socket.destroy();
          resolve({ connected: true, connectTimeMs: connectTime });
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          socket.destroy();
          reject(new Error(`Connection failed: ${err.message}`));
        });
      });

      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('print-agent-local-print', async (event, { printerIp, printerPort, data, printerId }) => {
    if (!printAgent) return { success: false, error: 'Print agent not initialized' };
    const jobId = printAgent.queueLocalPrintJob({
      printerIp,
      printerPort: printerPort || 9100,
      data,
      printerId,
    });
    printLogger.info('LocalPrint', `Print job queued`, { printerIp, printerPort, printerId, jobId });
    return { success: true, jobId };
  });

  // === Enhanced Offline Database IPC Handlers ===
  ipcMain.handle('offline-db-sync', async (event, { enterpriseId, propertyId, rvcId }) => {
    if (!enhancedOfflineDb) return { success: false, error: 'Offline DB not initialized' };
    const serverUrl = getServerUrl();
    const result = await enhancedOfflineDb.syncFromCloud(serverUrl, enterpriseId, propertyId, rvcId);
    return result;
  });

  ipcMain.handle('offline-db-get-stats', async () => {
    if (!enhancedOfflineDb) return {};
    return enhancedOfflineDb.getStats();
  });

  ipcMain.handle('offline-db-get-entity', async (event, { table, id }) => {
    if (!enhancedOfflineDb) return null;
    return enhancedOfflineDb.getEntity(table, id);
  });

  ipcMain.handle('offline-db-get-entity-list', async (event, { table, enterpriseId }) => {
    if (!enhancedOfflineDb) return [];
    return enhancedOfflineDb.getEntityList(table, enterpriseId);
  });

  ipcMain.handle('offline-db-get-sales-data', async (event, { businessDate, rvcId }) => {
    if (!enhancedOfflineDb) return null;
    return enhancedOfflineDb.getLocalSalesData(businessDate, rvcId);
  });

  ipcMain.handle('offline-db-sync-to-cloud', async () => {
    if (!enhancedOfflineDb) return { synced: 0, failed: 0 };
    const capsUrl = getCapsServiceHostUrl();
    if (capsUrl && enhancedOfflineDb.syncToCaps) {
      return enhancedOfflineDb.syncToCaps(capsUrl);
    }
    appLogger.debug('Sync', 'IPC sync: no CAPS URL, operations will remain queued');
    return { synced: 0, failed: 0, reason: 'no CAPS URL configured' };
  });

  ipcMain.handle('offline-db-get-checks', async (event, { rvcId, status }) => {
    if (!enhancedOfflineDb) return [];
    return enhancedOfflineDb.getOfflineChecks(rvcId, status);
  });

  ipcMain.handle('offline-db-save-check', async (event, check) => {
    if (!enhancedOfflineDb) return { success: false };
    enhancedOfflineDb.saveOfflineCheck(check);
    return { success: true };
  });

  ipcMain.handle('get-offline-mode', async () => {
    return {
      isOffline: !isOnline,
      lastSync: enhancedOfflineDb?.getSyncMetadata('lastFullSync'),
      pendingOps: enhancedOfflineDb?.getPendingOperations().length || 0,
      stats: enhancedOfflineDb?.getStats() || {},
    };
  });

  ipcMain.handle('emv-send-payment', async (event, { address, port, amount, transactionType, timeout }) => {
    if (!emvManager) return { success: false, error: 'EMV manager not initialized' };
    try {
      const result = await emvManager.sendPaymentToTerminal({ address, port, amount, transactionType, timeout });
      if (result.approved) {
        emvManager.storeOfflinePayment({
          amount,
          transactionType,
          authCode: result.authCode,
          transactionId: result.transactionId,
          cardType: result.cardType,
          lastFour: result.lastFour,
          entryMethod: result.entryMethod,
          tipAmount: result.tipAmount,
          approved: true,
        });
      }
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('emv-cancel', async (event, { address, port }) => {
    if (!emvManager) return { success: false, error: 'EMV manager not initialized' };
    return emvManager.cancelTerminalAction(address, port);
  });

  ipcMain.handle('emv-get-pending-payments', async () => {
    if (!emvManager) return [];
    return emvManager.getPendingPayments();
  });

  ipcMain.handle('emv-mark-payment-synced', async (event, { id }) => {
    if (!emvManager) return { success: false };
    emvManager.markPaymentSynced(id);
    return { success: true };
  });

  ipcMain.handle('offline-self-test', async () => {
    const results = {
      timestamp: new Date().toISOString(),
      protocolInterceptorActive: protocolInterceptorRegistered,
      isOnline,
      offlineInterceptorInitialized: !!offlineInterceptor,
      enhancedOfflineDbInitialized: !!enhancedOfflineDb,
      tests: [],
    };

    if (enhancedOfflineDb) {
      try {
        const stats = enhancedOfflineDb.getStats();
        results.dbStats = stats;
        results.tests.push({
          name: 'SQLite database accessible',
          pass: stats.usingSqlite === true,
          detail: stats.usingSqlite ? 'SQLite active' : 'Using JSON fallback',
        });
        results.tests.push({
          name: 'Employees cached',
          pass: (stats.cachedEmployees || 0) > 0,
          detail: `${stats.cachedEmployees || 0} employees in cache`,
        });
        results.tests.push({
          name: 'Menu items cached',
          pass: (stats.cachedMenuItems || 0) > 0,
          detail: `${stats.cachedMenuItems || 0} menu items in cache`,
        });
        results.tests.push({
          name: 'Last sync completed',
          pass: !!stats.lastSync,
          detail: stats.lastSync || 'Never synced',
        });
      } catch (e) {
        results.tests.push({ name: 'Database check', pass: false, detail: e.message });
      }
    } else {
      results.tests.push({ name: 'Database check', pass: false, detail: 'enhancedOfflineDb not initialized' });
    }

    if (offlineInterceptor) {
      try {
        const canHandlePinAuth = offlineInterceptor.canHandleOffline('POST', '/api/auth/pin');
        results.tests.push({
          name: 'PIN auth endpoint registered',
          pass: canHandlePinAuth,
          detail: canHandlePinAuth ? 'POST /api/auth/pin is handled' : 'NOT handled - auth will fail offline',
        });

        const canHandleMenuItems = offlineInterceptor.canHandleOffline('GET', '/api/menu-items');
        results.tests.push({
          name: 'Menu items endpoint registered',
          pass: canHandleMenuItems,
          detail: canHandleMenuItems ? 'GET /api/menu-items is handled' : 'NOT handled',
        });

        const canHandleHealth = offlineInterceptor.canHandleOffline('GET', '/api/health');
        results.tests.push({
          name: 'Health endpoint registered',
          pass: canHandleHealth,
          detail: canHandleHealth ? 'GET /api/health is handled' : 'NOT handled',
        });
      } catch (e) {
        results.tests.push({ name: 'Interceptor check', pass: false, detail: e.message });
      }
    } else {
      results.tests.push({ name: 'Interceptor check', pass: false, detail: 'offlineInterceptor not initialized' });
    }

    results.tests.push({
      name: 'Protocol interceptor registered',
      pass: protocolInterceptorRegistered,
      detail: protocolInterceptorRegistered ? 'HTTPS protocol handler active' : 'NOT registered - offline will not work',
    });

    const pageCacheExists = fs.existsSync(PAGE_CACHE_DIR);
    let cachedPages = 0;
    if (pageCacheExists) {
      try {
        const walkDir = (dir) => {
          let count = 0;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && !entry.name.endsWith('.meta')) count++;
            else if (entry.isDirectory()) count += walkDir(path.join(dir, entry.name));
          }
          return count;
        };
        cachedPages = walkDir(PAGE_CACHE_DIR);
      } catch {}
    }
    results.tests.push({
      name: 'Page cache populated',
      pass: cachedPages > 0,
      detail: `${cachedPages} pages/assets cached for cold start`,
    });

    const allPass = results.tests.every(t => t.pass);
    results.overallStatus = allPass ? 'READY FOR OFFLINE' : 'NOT READY - see failing tests';

    appLogger.info('SelfTest', `Offline self-test: ${results.overallStatus}`, {
      passed: results.tests.filter(t => t.pass).length,
      failed: results.tests.filter(t => !t.pass).length,
    });

    return results;
  });

  // === Setup Wizard IPC Handlers ===
  ipcMain.handle('wizard-test-connection', async (event, url) => {
    try {
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        return { success: false, error: `Server responded with status ${response.status}` };
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          return { success: false, error: 'Server returned HTML instead of JSON. Check that the URL is correct and does not include extra path segments.' };
        }
      }
      return { success: true, baseUrl };
    } catch (e) {
      return { success: false, error: e.name === 'AbortError' ? 'Connection timed out' : e.message };
    }
  });

  ipcMain.handle('wizard-emc-login', async (event, serverUrl, email, password) => {
    try {
      let baseUrl = serverUrl;
      try {
        const parsed = new URL(serverUrl);
        baseUrl = `${parsed.protocol}//${parsed.host}`;
      } catch {}

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${baseUrl}/api/emc/wizard-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          return { success: false, error: 'Server returned HTML instead of JSON. The server URL may be incorrect.' };
        }
        return { success: false, error: `Unexpected response format from server (${response.status})` };
      }

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || `HTTP ${response.status}` };
      }
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.name === 'AbortError' ? 'Login timed out' : e.message };
    }
  });

  ipcMain.handle('wizard-fetch-enterprises', async (event, serverUrl) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/enterprises`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-fetch-properties', async (event, serverUrl, enterpriseId) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/properties?enterpriseId=${enterpriseId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-fetch-devices', async (event, serverUrl, enterpriseId, propertyId, mode) => {
    try {
      const endpoint = mode === 'kds' ? 'kds-devices' : 'workstations';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/${endpoint}?propertyId=${propertyId}&enterpriseId=${enterpriseId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-fetch-rvcs', async (event, serverUrl, propertyId) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${serverUrl}/api/rvcs?propertyId=${propertyId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-save-config', async (event, wizardConfig) => {
    try {
      const config = loadConfig();
      config.serverUrl = wizardConfig.serverUrl;
      config.enterpriseId = wizardConfig.enterpriseId;
      config.enterpriseName = wizardConfig.enterpriseName;
      config.enterpriseCode = wizardConfig.enterpriseCode;
      config.propertyId = wizardConfig.propertyId;
      config.propertyName = wizardConfig.propertyName;
      config.rvcId = wizardConfig.rvcId;
      config.rvcName = wizardConfig.rvcName;
      config.mode = wizardConfig.mode;
      config.deviceId = wizardConfig.deviceId;
      config.deviceName = wizardConfig.deviceName;
      config.deviceType = wizardConfig.deviceType;
      config.offlineCheckNumberStart = wizardConfig.offlineCheckNumberStart || null;
      config.offlineCheckNumberEnd = wizardConfig.offlineCheckNumberEnd || null;
      config.setupComplete = true;
      config.setupDate = wizardConfig.setupDate;
      saveConfig(config);
      setDeviceLabel(wizardConfig.deviceName || wizardConfig.mode.toUpperCase());
      appLogger.info('Wizard', 'Setup wizard completed', { enterprise: wizardConfig.enterpriseName, property: wizardConfig.propertyName, mode: wizardConfig.mode, device: wizardConfig.deviceName });
      appMode = wizardConfig.mode;
      configureAutoStartup(wizardConfig.mode);
      const startupSettings = app.getLoginItemSettings();
      if (startupSettings.openAtLogin) {
        config.autoStartupMigrated = true;
        saveConfig(config);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('wizard-get-existing-config', async () => {
    return loadConfig();
  });

  ipcMain.handle('get-auto-startup-status', () => {
    if (process.platform !== 'win32') return { supported: false, enabled: false };
    const settings = app.getLoginItemSettings();
    return { supported: true, enabled: settings.openAtLogin };
  });

  ipcMain.handle('set-auto-startup', (event, enabled) => {
    if (enabled) {
      configureAutoStartup(appMode);
    } else {
      removeAutoStartup();
    }
    return { success: true, enabled };
  });

  ipcMain.on('wizard-launch-app', async () => {
    appLogger.info('Wizard', 'Launching app after wizard completion');
    const config = loadConfig();

    appLogger.info('Wizard', 'Initializing all services after setup completion');
    await initAllServices();

    if (mainWindow) {
      mainWindow.close();
      mainWindow = null;
    }

    const windowConfig = {
      width: 1280,
      height: 1024,
      minWidth: 1024,
      minHeight: 768,
      title: appMode === 'kds' ? 'Cloud POS - Kitchen Display' : 'Cloud POS',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, 'preload.cjs'),
      },
      autoHideMenuBar: true,
      fullscreenable: true,
      backgroundColor: '#0f1729',
      kiosk: isKiosk,
      fullscreen: isKiosk,
    };

    const newWindow = new BrowserWindow(windowConfig);
    mainWindow = newWindow;
    if (!isKiosk) {
      mainWindow.maximize();
    }

    const serverUrl = config.serverUrl || getServerUrl();
    const startPath = appMode === 'kds' ? '/kds' : '/';
    const targetUrl = `${serverUrl}${startPath}`;
    appLogger.info('Wizard', `Post-wizard loading URL: ${targetUrl}`, { maximized: !isKiosk });

    const loadingHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cloud POS</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1729;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.c{max-width:480px;padding:40px}.spinner{width:40px;height:40px;border:3px solid #2a3a52;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 20px}
@keyframes spin{to{transform:rotate(360deg)}}h2{margin:0 0 8px;font-weight:500}p{opacity:0.6;font-size:14px;margin:0}</style></head>
<body><div class="c"><div class="spinner"></div><h2>Cloud POS</h2><p>Connecting to server...</p></div></body></html>`;

    newWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`).then(() => {
      appLogger.info('Wizard', 'Post-wizard loading screen shown, navigating to server...');
      if (!newWindow.isDestroyed()) newWindow.loadURL(targetUrl);
    }).catch((err) => {
      appLogger.error('Wizard', `Failed to show loading screen: ${err.message}`);
      if (!newWindow.isDestroyed()) newWindow.loadURL(targetUrl);
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      appLogger.error('Window', `Page load failed after wizard: ${errorDescription}`, { errorCode, url: validatedURL });

      if (errorCode === -3) return;
      if (!mainWindow) return;

      if (errorCode === -21) {
        appLogger.info('Window', 'Network changed after wizard (ERR_NETWORK_CHANGED), auto-retrying in 2s...');
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            const bundledIndex = path.join(getBundledAssetsDir(), 'index.html');
            if (fs.existsSync(bundledIndex)) {
              appLogger.info('Window', 'Auto-retrying post-wizard load: loading bundled index.html');
              mainWindow.loadFile(bundledIndex);
            } else {
              appLogger.info('Window', `Auto-retrying post-wizard load: ${serverUrl}${startPath}`);
              mainWindow.loadURL(`${serverUrl}${startPath}`);
            }
          }
        }, 2000);
        return;
      }

      if (errorCode === -106 || errorCode === -105 || errorCode === -2) {
        isOnline = false;
        if (offlineInterceptor) offlineInterceptor.setOffline(true);
      }

      const retryUrl = `${serverUrl}${startPath}`;
      const isKdsMode2 = appMode === 'kds';
      const postWizTitle = isKdsMode2 ? 'Kitchen Display - Connecting' : 'Cloud POS - Connection Error';
      const postWizHeading = isKdsMode2 ? 'Kitchen Display - Connecting to Server' : 'Cannot Connect to Server';
      const postWizMsg = isKdsMode2
        ? 'Waiting for the server to become available. The kitchen display will load automatically when connected.'
        : 'Unable to reach the Cloud POS server. Please check your internet connection and verify the server URL is correct.';
      const postWizAutoRetry = isKdsMode2
        ? `<script>let c=15;const t=document.getElementById('countdown');setInterval(()=>{c--;if(c<=0){c=15;location.href='${retryUrl.replace(/'/g, "\\'")}';}if(t)t.textContent=c;},1000);</script>`
        : '';
      const postWizCountdown = isKdsMode2 ? '<p style="opacity:0.6;font-size:13px;margin-top:8px">Auto-retry in <span id="countdown">15</span>s</p>' : '';
      const postWizSpinner = isKdsMode2 ? '<div style="width:32px;height:32px;border:3px solid #2a3a52;border-top-color:#f59e0b;border-radius:50%;animation:spin 0.8s linear infinite;margin:16px auto 0"></div>' : '';

      const errorHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${postWizTitle}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1729;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.c{max-width:520px;padding:40px}h1{margin:0 0 12px;font-size:22px}p{opacity:0.8;line-height:1.6;margin:0 0 20px;font-size:14px}
button{padding:12px 32px;font-size:16px;border:1px solid #4a4a6a;border-radius:8px;background:#2a2a4a;color:#fff;cursor:pointer;margin:4px}
button:hover{background:#3a3a5a}.info{margin-top:20px;font-size:12px;opacity:0.4;font-family:monospace}${isKdsMode2 ? '@keyframes spin{to{transform:rotate(360deg)}}' : ''}</style></head>
<body><div class="c">${isKdsMode2 ? '<div style="font-size:48px;margin-bottom:16px">🍳</div>' : ''}<h1>${postWizHeading}</h1>
<p>${postWizMsg}</p>
<button onclick="location.href='${retryUrl.replace(/'/g, "\\'")}'" id="retryBtn">Retry Connection</button>
${postWizCountdown}${postWizSpinner}
<p class="info">Server: ${serverUrl}<br>Error: ${errorDescription} (${errorCode})</p></div></body>${postWizAutoRetry}</html>`;

      if (mainWindow) mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`).catch(() => {});
    });

    mainWindow.webContents.on('did-finish-load', () => {
      if (!mainWindow) return;
      const url = mainWindow.webContents.getURL();
      if (!url.startsWith('data:')) {
        appLogger.info('Window', `Post-wizard page loaded: ${url}`);
      }
    });
  });
}

function buildEscPosBuffer(commands) {
  const parts = [];
  const ESC = 0x1B;
  const GS = 0x1D;
  const LF = 0x0A;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'init':
        parts.push(Buffer.from([ESC, 0x40]));
        break;
      case 'text':
        parts.push(Buffer.from(cmd.value, 'utf-8'));
        break;
      case 'newline':
        parts.push(Buffer.from([LF]));
        break;
      case 'cut':
        parts.push(Buffer.from([GS, 0x56, 0x00]));
        break;
      case 'partial-cut':
        parts.push(Buffer.from([GS, 0x56, 0x01]));
        break;
      case 'bold-on':
        parts.push(Buffer.from([ESC, 0x45, 0x01]));
        break;
      case 'bold-off':
        parts.push(Buffer.from([ESC, 0x45, 0x00]));
        break;
      case 'align-left':
        parts.push(Buffer.from([ESC, 0x61, 0x00]));
        break;
      case 'align-center':
        parts.push(Buffer.from([ESC, 0x61, 0x01]));
        break;
      case 'align-right':
        parts.push(Buffer.from([ESC, 0x61, 0x02]));
        break;
      case 'double-height':
        parts.push(Buffer.from([ESC, 0x21, 0x10]));
        break;
      case 'double-width':
        parts.push(Buffer.from([ESC, 0x21, 0x20]));
        break;
      case 'double-size':
        parts.push(Buffer.from([ESC, 0x21, 0x30]));
        break;
      case 'normal-size':
        parts.push(Buffer.from([ESC, 0x21, 0x00]));
        break;
      case 'feed':
        const lines = cmd.lines || 1;
        parts.push(Buffer.from([ESC, 0x64, lines]));
        break;
      case 'open-drawer':
        parts.push(Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]));
        break;
      case 'separator':
        parts.push(Buffer.from('-'.repeat(cmd.width || 42), 'utf-8'));
        parts.push(Buffer.from([LF]));
        break;
      case 'raw':
        parts.push(Buffer.from(cmd.bytes));
        break;
    }
  }

  return Buffer.concat(parts);
}

function setupAutoLaunch(enable) {
  if (process.platform !== 'win32') return;
  const appPath = process.execPath;
  const appArgs = appMode === 'kds' ? '--kds' : '--pos';
  const kioskArg = isKiosk ? ' --kiosk' : '';
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const regValue = 'CloudPOS';

  const { execSync } = require('child_process');
  try {
    if (enable) {
      execSync(`reg add "${regKey}" /v "${regValue}" /t REG_SZ /d "\\"${appPath}\\" ${appArgs}${kioskArg}" /f`, { windowsHide: true });
      appLogger.info('Config', 'Auto-launch enabled');
    } else {
      execSync(`reg delete "${regKey}" /v "${regValue}" /f`, { windowsHide: true });
      appLogger.info('Config', 'Auto-launch disabled');
    }
  } catch (e) {
    appLogger.warn('Config', 'Could not set auto-launch', e.message);
  }
}

async function autoRegisterPrintAgent(config) {
  try {
    const serverUrl = getServerUrl();
    const deviceName = config.deviceName || os.hostname();
    const propertyId = config.propertyId || null;

    printLogger.info('AutoRegister', `Registering embedded print agent for device: ${deviceName}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${serverUrl}/api/print-agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: propertyId ? Number(propertyId) : null,
        name: `${deviceName} (Embedded Agent)`,
        description: `Auto-registered embedded print agent for ${deviceName}`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      printLogger.error('AutoRegister', `Server returned ${response.status}: ${errText}`);
      return null;
    }

    const result = await response.json();
    printLogger.info('AutoRegister', `Print agent registered: ${result.name} (${result.id})`);

    config.printAgentId = result.id;
    config.printAgentToken = result.agentToken;
    saveConfig(config);

    return { agentId: result.id, agentToken: result.agentToken };
  } catch (e) {
    printLogger.error('AutoRegister', `Auto-registration failed: ${e.message}`);
    return null;
  }
}

async function initPrintAgent() {
  const config = loadConfig();

  if (!config.printAgentId && !config.printAgentToken) {
    printLogger.info('Init', 'No agent ID/token configured, attempting auto-registration');
    const registered = await autoRegisterPrintAgent(config);
    if (registered) {
      config.printAgentId = registered.agentId;
      config.printAgentToken = registered.agentToken;
    }
  }

  printAgent = new PrintAgentService({
    serverUrl: getServerUrl(),
    agentId: config.printAgentId || null,
    agentToken: config.printAgentToken || null,
    configDir: CONFIG_DIR,
    dataDir: DATA_DIR,
    heartbeatMs: 30000,
  });

  printAgent.on('status', (status) => {
    if (mainWindow) {
      mainWindow.webContents.send('print-agent-status', status);
    }
    printLogger.info('Status', `connected=${status.connected}, auth=${status.authenticated}`);
  });

  printAgent.on('jobCompleted', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('print-agent-job-completed', info);
    }
  });

  printAgent.on('jobFailed', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('print-agent-job-failed', info);
    }
  });

  if (config.printAgentId || config.printAgentToken) {
    printAgent.start();
  } else {
    printLogger.info('Init', 'No agent ID/token configured and auto-registration failed, print agent awaiting manual configuration');
  }
}

async function initOfflineDbEarly() {
  try {
    if (enhancedOfflineDb) return;
    enhancedOfflineDb = new OfflineDatabase({ dataDir: DATA_DIR });
    await enhancedOfflineDb.initialize();
    const config = loadConfig();
    enhancedOfflineDb.config = {
      deviceId: config.deviceId || null,
      deviceName: config.deviceName || null,
      enterpriseId: config.enterpriseId || null,
      propertyId: config.propertyId || null,
      offlineCheckNumberStart: config.offlineCheckNumberStart || null,
      offlineCheckNumberEnd: config.offlineCheckNumberEnd || null,
    };
    offlineInterceptor = new OfflineApiInterceptor(enhancedOfflineDb);
    offlineInterceptor.setConfig({
      enterpriseId: config.enterpriseId || null,
      propertyId: config.propertyId || null,
      rvcId: config.rvcId || null,
    });
    if (config.serviceHostUrl) {
      capsConfig = {
        serviceHostUrl: config.serviceHostUrl,
        capsWorkstationId: config.capsWorkstationId || null,
        capsWorkstationName: config.capsWorkstationName || null,
        isCapsWorkstation: config.isCapsWorkstation || false,
        propertyId: config.propertyId,
        serviceHostId: null,
      };
    }
    initOfflineDatabase();
    appLogger.info('OfflineDB', 'Early offline DB + interceptor initialized for instant boot');
  } catch (e) {
    appLogger.warn('OfflineDB', `Early init failed (will retry in full init): ${e.message}`);
  }
}

async function initEnhancedOfflineDb() {
  if (enhancedOfflineDb && offlineInterceptor) {
    appLogger.info('OfflineDB', 'Enhanced offline DB already initialized (from early init), skipping');
    return;
  }
  enhancedOfflineDb = new OfflineDatabase({
    dataDir: DATA_DIR,
  });
  await enhancedOfflineDb.initialize();
  const config = loadConfig();
  enhancedOfflineDb.config = {
    deviceId: config.deviceId || null,
    deviceName: config.deviceName || null,
    enterpriseId: config.enterpriseId || null,
    propertyId: config.propertyId || null,
    offlineCheckNumberStart: config.offlineCheckNumberStart || null,
    offlineCheckNumberEnd: config.offlineCheckNumberEnd || null,
  };

  offlineInterceptor = new OfflineApiInterceptor(enhancedOfflineDb);
  offlineInterceptor.setConfig({
    enterpriseId: config.enterpriseId || null,
    propertyId: config.propertyId || null,
    rvcId: config.rvcId || null,
  });
  appLogger.info('OfflineDB', 'Enhanced offline database initialized');
}

async function performInitialDataSync() {
  const config = loadConfig();
  if (!config.setupComplete) {
    return;
  }

  const enterpriseId = config.enterpriseId;
  const propertyId = config.propertyId;
  const rvcId = config.rvcId;

  if (!enterpriseId) {
    appLogger.info('OfflineDB', 'No enterprise configured, skipping initial sync');
    return;
  }

  if (connectionMode !== 'green') {
    appLogger.info('OfflineDB', `Skipping initial sync (mode: ${connectionMode}), using cached data`);
    return;
  }

  try {
    const serverUrl = getServerUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${serverUrl}/api/health/db-probe`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok && enhancedOfflineDb) {
      appLogger.info('OfflineDB', 'Cloud reachable (db-probe OK), starting initial data sync');
      const result = await enhancedOfflineDb.syncFromCloud(serverUrl, enterpriseId, propertyId, rvcId);
      appLogger.info('OfflineDB', 'Initial sync completed', { tables: result.synced?.length || 0, errors: result.errors?.length || 0 });
    } else {
      appLogger.warn('OfflineDB', `Cloud health check failed (status: ${response?.status}), skipping initial sync`);
    }
  } catch (e) {
    appLogger.warn('OfflineDB', 'Cloud not reachable for initial sync, using cached data');
  }
}

async function fetchActivationConfig() {
  const config = loadConfig();
  if (!config.deviceId || !config.setupComplete) {
    appLogger.info('CAPS', 'No device ID or setup not complete, skipping activation-config');
    return null;
  }

  try {
    const serverUrl = getServerUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${serverUrl}/api/workstations/${config.deviceId}/activation-config`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      appLogger.warn('CAPS', `Activation-config returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const connConfig = data.connectionConfig || {};
    const serviceHostUrl = connConfig.serviceHostUrl || null;
    const capsWorkstationId = connConfig.capsWorkstationId || null;
    const capsWorkstationName = connConfig.capsWorkstationName || null;
    const isCapsWorkstation = capsWorkstationId && capsWorkstationId === config.deviceId;
    const serviceHostToken = connConfig.serviceHostToken || null;

    const effectiveServiceHostUrl = isCapsWorkstation ? 'http://127.0.0.1:3001' : serviceHostUrl;

    capsConfig = {
      serviceHostUrl: effectiveServiceHostUrl,
      capsWorkstationId,
      capsWorkstationName,
      isCapsWorkstation: !!isCapsWorkstation,
      propertyId: config.propertyId,
      serviceHostId: data.serviceHost?.id || null,
    };

    config.serviceHostUrl = effectiveServiceHostUrl;
    config.capsWorkstationId = capsWorkstationId;
    config.capsWorkstationName = capsWorkstationName;
    config.isCapsWorkstation = !!isCapsWorkstation;
    config.serviceHostToken = serviceHostToken || config.serviceHostToken || '';
    saveConfig(config);

    if (offlineInterceptor) {
      offlineInterceptor.setServiceHostUrl(effectiveServiceHostUrl);
      offlineInterceptor.setCapsConfig(capsConfig);
    }

    appLogger.info('CAPS', `Activation config fetched`, {
      serviceHostUrl: effectiveServiceHostUrl,
      capsWorkstationId,
      capsWorkstationName,
      isCaps: !!isCapsWorkstation,
    });

    return capsConfig;
  } catch (e) {
    appLogger.warn('CAPS', `Failed to fetch activation-config: ${e.message}`);
    const config = loadConfig();
    if (config.serviceHostUrl) {
      capsConfig = {
        serviceHostUrl: config.serviceHostUrl,
        capsWorkstationId: config.capsWorkstationId || null,
        capsWorkstationName: config.capsWorkstationName || null,
        isCapsWorkstation: config.isCapsWorkstation || false,
        propertyId: config.propertyId,
        serviceHostId: null,
      };
      if (offlineInterceptor) {
        offlineInterceptor.setServiceHostUrl(config.serviceHostUrl);
        offlineInterceptor.setCapsConfig(capsConfig);
      }
      appLogger.info('CAPS', 'Using cached activation config', { serviceHostUrl: config.serviceHostUrl });
    }
    return capsConfig;
  }
}

async function startServiceHost() {
  if (!capsConfig || !capsConfig.isCapsWorkstation) {
    return;
  }

  let config = loadConfig();

  if (!config.serviceHostToken) {
    appLogger.info('ServiceHost', 'Service host token missing from local config, attempting fresh fetch from cloud...');
    try {
      await fetchActivationConfig();
      config = loadConfig();
    } catch (e) {
      appLogger.warn('ServiceHost', `Failed to fetch activation config for token: ${e.message}`);
    }
    if (!config.serviceHostToken) {
      appLogger.warn('ServiceHost', 'Service host token still unavailable after fresh fetch. Will retry in 60 seconds.');
      setTimeout(() => {
        appLogger.info('ServiceHost', 'Retrying service host start (token was missing)...');
        startServiceHost();
      }, 60000);
      return;
    }
  }

  const serviceHostBundlePath = path.join(__dirname, 'service-host-embedded.cjs');

  if (!fs.existsSync(serviceHostBundlePath)) {
    appLogger.warn('ServiceHost', 'Service host bundle not found, CAPS mode unavailable', { path: serviceHostBundlePath });
    return;
  }

  if (serviceHostProcess) {
    appLogger.info('ServiceHost', 'Service host already running');
    return;
  }

  const serviceHostDataDir = path.join(DATA_DIR, 'service-host');
  if (!fs.existsSync(serviceHostDataDir)) {
    fs.mkdirSync(serviceHostDataDir, { recursive: true });
  }

  const serverUrl = getServerUrl();

  try {
    appLogger.info('ServiceHost', 'Starting embedded service host (CAPS mode)', {
      dataDir: serviceHostDataDir,
      port: 3001,
      cloudUrl: serverUrl,
    });

    serviceHostProcess = fork(serviceHostBundlePath, [], {
      env: {
        ...process.env,
        SERVICE_HOST_PORT: '3001',
        SERVICE_HOST_DATA_DIR: serviceHostDataDir,
        SERVICE_HOST_CLOUD_URL: serverUrl,
        SERVICE_HOST_PROPERTY_ID: config.propertyId || '',
        SERVICE_HOST_ID: capsConfig.serviceHostId || config.deviceId || '',
        SERVICE_HOST_TOKEN: config.serviceHostToken || '',
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    serviceHostProcess.stdout.on('data', (data) => {
      appLogger.info('ServiceHost', data.toString().trim());
    });

    serviceHostProcess.stderr.on('data', (data) => {
      appLogger.warn('ServiceHost', data.toString().trim());
    });

    serviceHostProcess.on('exit', (code, signal) => {
      appLogger.warn('ServiceHost', `Service host process exited`, { code, signal });
      serviceHostProcess = null;
      if (code === 2) {
        appLogger.info('ServiceHost', 'Service host exited with code 2 (token not available). Retrying in 60 seconds with fresh config fetch...');
        setTimeout(async () => {
          try {
            await fetchActivationConfig();
          } catch (e) {}
          startServiceHost();
        }, 60000);
      } else if (code !== 0 && code !== null) {
        setTimeout(() => {
          appLogger.info('ServiceHost', 'Restarting service host after crash...');
          startServiceHost();
        }, 5000);
      }
    });

    serviceHostProcess.on('error', (err) => {
      appLogger.error('ServiceHost', `Service host process error: ${err.message}`);
      serviceHostProcess = null;
    });

    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const hc = await fetch('http://127.0.0.1:3001/health', {
          signal: AbortSignal.timeout(2000),
        });
        if (hc.ok) {
          ready = true;
          break;
        }
      } catch {}
    }

    if (ready) {
      appLogger.info('ServiceHost', 'Service host is ready on port 3001 (CAPS mode)');
    } else {
      appLogger.warn('ServiceHost', 'Service host started but health check not responding yet');
    }
  } catch (e) {
    appLogger.error('ServiceHost', `Failed to start service host: ${e.message}`);
  }
}

function stopServiceHost() {
  if (serviceHostProcess) {
    appLogger.info('ServiceHost', 'Stopping service host process');
    serviceHostProcess.kill('SIGTERM');
    setTimeout(() => {
      if (serviceHostProcess) {
        serviceHostProcess.kill('SIGKILL');
        serviceHostProcess = null;
      }
    }, 5000);
  }
}

function setConnectionMode(newMode) {
  if (connectionMode === newMode) return;
  const oldMode = connectionMode;
  connectionMode = newMode;
  if (offlineInterceptor && offlineInterceptor.setConnectionMode) {
    offlineInterceptor.setConnectionMode(newMode);
  }
  const config = loadConfig();
  const cloudStatus = isOnline ? 'reachable' : 'unreachable';
  const capsUrl = config.serviceHostUrl || 'not configured';
  const capsStatus = newMode === 'yellow' ? 'reachable' : (newMode === 'red' ? 'unreachable' : 'n/a');
  appLogger.info('Network', `Mode changed: ${oldMode.toUpperCase()} -> ${newMode.toUpperCase()} | Cloud: ${cloudStatus} | CAPS: ${capsUrl} (${capsStatus})`);
  updatePendingSyncCount();
  if (mainWindow) {
    mainWindow.webContents.send('connection-mode', newMode);
    mainWindow.webContents.send('connection-mode-detail', {
      mode: newMode,
      pendingSyncCount,
      localDbHealthy,
      lastSyncAt,
      cloudProbeResult: isOnline,
    });
  }
}

function getCapsServiceHostUrl() {
  const config = loadConfig();
  return config.serviceHostUrl || (capsConfig && capsConfig.serviceHostUrl) || null;
}

function injectServiceHostUrl() {
  if (!mainWindow) return;
  const config = loadConfig();
  const serviceHostUrl = config.serviceHostUrl || null;
  if (serviceHostUrl) {
    const safeUrl = JSON.stringify(serviceHostUrl);
    mainWindow.webContents.executeJavaScript(
      `try { localStorage.setItem('serviceHostUrl', ${safeUrl}); } catch(e) {}`
    ).catch(() => {});
  }
  const safeMode = JSON.stringify(connectionMode);
  mainWindow.webContents.executeJavaScript(
    `try { localStorage.setItem('connectionMode', ${safeMode}); } catch(e) {}`
  ).catch(() => {});
}

const PAGE_CACHE_DIR = path.join(DATA_DIR, 'page-cache');

function ensurePageCacheDir() {
  if (!fs.existsSync(PAGE_CACHE_DIR)) {
    fs.mkdirSync(PAGE_CACHE_DIR, { recursive: true });
  }
}

function getCachePath(pathname) {
  let safePath = pathname.replace(/[^a-zA-Z0-9._\/-]/g, '_');
  if (safePath === '/' || safePath === '') safePath = '__root__';
  if (safePath.startsWith('/')) safePath = safePath.substring(1);
  return path.join(PAGE_CACHE_DIR, safePath + '.cache');
}

function ensureCacheDirRecursive(dir) {
  if (fs.existsSync(dir)) {
    if (fs.statSync(dir).isDirectory()) return;
    fs.unlinkSync(dir);
    try { fs.unlinkSync(dir + '.meta'); } catch {}
  }
  const parent = path.dirname(dir);
  if (parent !== dir && parent.startsWith(PAGE_CACHE_DIR)) {
    ensureCacheDirRecursive(parent);
  }
  fs.mkdirSync(dir, { recursive: true });
}

async function cacheResponseToDisk(pathname, response) {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.match(/html|javascript|css|json|text|font|svg|icon/)) return;

    const cachePath = getCachePath(pathname);
    const dir = path.dirname(cachePath);

    ensureCacheDirRecursive(dir);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(cachePath, buffer);
    fs.writeFileSync(cachePath + '.meta', JSON.stringify({
      contentType,
      cachedAt: new Date().toISOString(),
      pathname,
    }));
  } catch (e) {
    appLogger.debug('PageCache', `Cache write error for ${pathname}`, e.message);
  }
}

function findCachedFile(cachePath) {
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).isFile()) return cachePath;
  const legacyPath = cachePath.replace(/\.cache$/, '');
  if (legacyPath !== cachePath && fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) return legacyPath;
  return null;
}

function getCachedResponseFromDisk(pathname) {
  try {
    const cachePath = getCachePath(pathname);
    const found = findCachedFile(cachePath);
    if (found) {
      const buffer = fs.readFileSync(found);
      let contentType = 'text/html';
      const metaPath = found + '.meta';
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          contentType = meta.contentType || 'text/html';
        } catch {}
      }
      appLogger.debug('PageCache', `Serving cached: ${pathname}`);
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': contentType, 'X-Offline-Cache': 'true' },
      });
    }

    if (!pathname.includes('.') && pathname !== '/api') {
      const spaFallbacks = appMode === 'kds' ? ['/kds', '/pos'] : ['/pos', '/kds'];
      for (const fallbackPath of spaFallbacks) {
        const cachedPath = getCachePath(fallbackPath);
        const cachedFound = findCachedFile(cachedPath);
        if (cachedFound) {
          const buffer = fs.readFileSync(cachedFound);
          appLogger.debug('PageCache', `Serving cached ${fallbackPath} for SPA route: ${pathname}`);
          return new Response(buffer, {
            status: 200,
            headers: { 'Content-Type': 'text/html', 'X-Offline-Cache': 'true' },
          });
        }
      }
    }

    return null;
  } catch (e) {
    appLogger.debug('PageCache', `Cache read error for ${pathname}`, e.message);
    return null;
  }
}

async function parseRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  try {
    const buf = await req.arrayBuffer();
    const text = new TextDecoder().decode(buf);
    if (!text || text.length === 0) return null;
    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  }
}

function routeToOfflineInterceptor(method, url, body) {
  const queryParams = Object.fromEntries(url.searchParams);
  if (offlineInterceptor.canHandleOffline(method, url.pathname)) {
    const result = offlineInterceptor.handleRequest(method, url.pathname, queryParams, body);
    if (result) {
      appLogger.info('Interceptor', `OFFLINE -> ${method} ${url.pathname} -> ${result.status}`);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', 'X-Offline-Mode': 'true' },
      });
    }
  }
  appLogger.warn('Interceptor', `No offline handler for: ${method} ${url.pathname}`);
  return new Response(JSON.stringify({ error: 'Not available offline', offline: true }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Offline-Mode': 'true' },
  });
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
};

function getBundledAssetsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', 'dist', 'public');
  }
  return path.join(__dirname, '..', 'dist', 'public');
}

function serveBundledAsset(pathname) {
  try {
    const assetsDir = getBundledAssetsDir();
    let filePath;

    if (pathname === '/' || pathname === '') {
      filePath = path.join(assetsDir, 'index.html');
    } else {
      const safePath = pathname.replace(/\.\./g, '').replace(/\/\//g, '/');
      filePath = path.join(assetsDir, safePath);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const buffer = fs.readFileSync(filePath);
      appLogger.debug('BundledAssets', `Serving bundled: ${pathname} (${contentType})`);
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': contentType, 'X-Bundled-Asset': 'true' },
      });
    }

    if (!pathname.includes('.') || pathname === '/pos' || pathname === '/kds' || pathname === '/pos/' || pathname === '/kds/' || pathname === '/login' || pathname === '/setup' || pathname === '/server-setup' || pathname === '/device-type' || pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/emc') || pathname.startsWith('/pos/')) {
      const indexPath = path.join(assetsDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        const buffer = fs.readFileSync(indexPath);
        appLogger.debug('BundledAssets', `SPA fallback for: ${pathname}`);
        return new Response(buffer, {
          status: 200,
          headers: { 'Content-Type': 'text/html', 'X-Bundled-Asset': 'true', 'X-SPA-Fallback': 'true' },
        });
      }
    }

    return null;
  } catch (e) {
    appLogger.debug('BundledAssets', `Error serving ${pathname}: ${e.message}`);
    return null;
  }
}

let bundledAssetsAvailable = false;
function checkBundledAssetsIntegrity() {
  try {
    const assetsDir = getBundledAssetsDir();
    const indexPath = path.join(assetsDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      appLogger.warn('BundledAssets', `Integrity check FAILED: index.html not found at ${indexPath}`);
      bundledAssetsAvailable = false;
      return false;
    }
    const indexSize = fs.statSync(indexPath).size;
    if (indexSize < 100) {
      appLogger.warn('BundledAssets', `Integrity check FAILED: index.html too small (${indexSize} bytes)`);
      bundledAssetsAvailable = false;
      return false;
    }
    const assetsSubdir = path.join(assetsDir, 'assets');
    const hasAssets = fs.existsSync(assetsSubdir) && fs.readdirSync(assetsSubdir).length > 0;
    if (!hasAssets) {
      appLogger.warn('BundledAssets', 'Integrity check WARNING: assets/ directory empty or missing');
    }
    appLogger.info('BundledAssets', `Integrity check passed: index.html=${indexSize}b, assets=${hasAssets}`);
    bundledAssetsAvailable = true;
    return true;
  } catch (e) {
    appLogger.warn('BundledAssets', `Integrity check error: ${e.message}`);
    bundledAssetsAvailable = false;
    return false;
  }
}

function registerProtocolInterceptor() {
  if (protocolInterceptorRegistered) return;
  protocolInterceptorRegistered = true;
  protocolInterceptorStartTime = Date.now();
  protocolConsecutiveFailCount = 0;
  ensurePageCacheDir();
  checkBundledAssetsIntegrity();

  protocol.handle('https', async (request) => {
    const url = new URL(request.url);
    const serverUrl = getServerUrl();
    let serverHost;
    try { serverHost = new URL(serverUrl).hostname; } catch { return electronNet.fetch(request, { bypassCustomProtocolHandlers: true }); }

    if (url.hostname !== serverHost) {
      return electronNet.fetch(request, { bypassCustomProtocolHandlers: true });
    }

    if (url.pathname === '/health' || url.pathname === '/api/health/db-probe') {
      if (!isOnline) {
        return new Response(JSON.stringify({ status: 'offline', offline: true, timestamp: new Date().toISOString() }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'X-Offline-Mode': 'true' },
        });
      }
      return electronNet.fetch(request, { bypassCustomProtocolHandlers: true });
    }

    const isApiRequest = url.pathname.startsWith('/api/');

    // CAPS-FIRST routing: All live POS/KDS operations go to CAPS first
    // Cloud is NEVER in the blocking write path (Architecture Contract Rule B)
    const isCapsTransactionRoute = isApiRequest && /^\/api\/(checks|check-items|check-payments|check-discounts|check-service-charges|payments|refunds|kds-tickets|time-punches|time-clock)(\/|$)/.test(url.pathname);
    const isCapsAuthRoute = isApiRequest && /^\/api\/(auth\/login|auth\/pin)(\/|$)/.test(url.pathname);
    const isWriteMethod = request.method !== 'GET' && request.method !== 'HEAD';
    if (isCapsTransactionRoute) {
      const capsUrl = getCapsServiceHostUrl();
      if (capsUrl) {
        try {
          let capsPath = url.pathname;
          if (capsPath.startsWith('/api/checks')) {
            capsPath = capsPath.replace('/api/checks', '/api/caps/checks');
          } else if (capsPath.startsWith('/api/payments')) {
            capsPath = capsPath.replace('/api/payments', '/api/payment');
          } else if (capsPath.startsWith('/api/refunds')) {
            capsPath = capsPath.replace('/api/refunds', '/api/payment');
          }
          const capsApiUrl = `${capsUrl}${capsPath}${url.search}`;
          const capsReqHeaders = {};
          for (const [key, value] of request.headers.entries()) {
            if (key.toLowerCase() !== 'host') capsReqHeaders[key] = value;
          }
          const cfgForCaps = loadConfig();
          if (cfgForCaps.serviceHostToken) capsReqHeaders['x-workstation-token'] = cfgForCaps.serviceHostToken;
          if (cfgForCaps.deviceId) capsReqHeaders['x-workstation-id'] = cfgForCaps.deviceId;
          if (cfgForCaps.deviceName) capsReqHeaders['x-device-name'] = cfgForCaps.deviceName;
          const capsBody = isWriteMethod ? await request.clone().arrayBuffer() : undefined;
          const capsResp = await fetch(capsApiUrl, {
            method: request.method,
            headers: capsReqHeaders,
            body: capsBody,
            signal: AbortSignal.timeout(5000),
          });
          if (capsResp.status !== 401 && capsResp.status !== 404) {
            appLogger.info('Interceptor', `CAPS-FIRST: ${request.method} ${url.pathname} -> ${capsPath} CAPS ${capsResp.status} [mode=${connectionMode}]`);
            return new Response(capsResp.body, {
              status: capsResp.status,
              statusText: capsResp.statusText,
              headers: { ...Object.fromEntries(capsResp.headers.entries()), 'X-Connection-Mode': connectionMode, 'X-Source': 'caps' },
            });
          }
          if (isWriteMethod) {
            appLogger.error('Interceptor', `CAPS-FIRST: CAPS returned ${capsResp.status} for WRITE ${request.method} ${capsPath} — BLOCKING (cloud never in write path)`);
            return new Response(JSON.stringify({ error: 'Store server rejected the request', capsStatus: capsResp.status, path: capsPath }), {
              status: capsResp.status === 404 ? 404 : 503,
              headers: { 'Content-Type': 'application/json', 'X-Connection-Mode': connectionMode, 'X-Source': 'caps-blocked' },
            });
          }
          appLogger.info('Interceptor', `CAPS-FIRST: CAPS returned ${capsResp.status} for READ ${capsPath}, falling through to cloud`);
        } catch (capsFirstErr) {
          if (isWriteMethod) {
            appLogger.error('Interceptor', `CAPS-FIRST: CAPS unreachable for WRITE ${request.method} ${url.pathname} — BLOCKING (${capsFirstErr.message})`);
            return new Response(JSON.stringify({ error: 'Store server unreachable — cannot process write', detail: capsFirstErr.message }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', 'X-Connection-Mode': connectionMode, 'X-Source': 'caps-blocked' },
            });
          }
          appLogger.warn('Interceptor', `CAPS-FIRST: CAPS unreachable for READ ${url.pathname} (${capsFirstErr.message}), falling through to cloud`);
        }
      }
    }

    if (isCapsAuthRoute) {
      const capsUrl = getCapsServiceHostUrl();
      if (capsUrl) {
        try {
          const capsApiUrl = `${capsUrl}${url.pathname}${url.search}`;
          const capsReqHeaders = {};
          for (const [key, value] of request.headers.entries()) {
            if (key.toLowerCase() !== 'host') capsReqHeaders[key] = value;
          }
          const cfgForCaps = loadConfig();
          if (cfgForCaps.serviceHostToken) capsReqHeaders['x-workstation-token'] = cfgForCaps.serviceHostToken;
          if (cfgForCaps.deviceId) capsReqHeaders['x-workstation-id'] = cfgForCaps.deviceId;
          if (cfgForCaps.deviceName) capsReqHeaders['x-device-name'] = cfgForCaps.deviceName;
          const authBody = isWriteMethod ? await request.clone().arrayBuffer() : undefined;
          const capsResp = await fetch(capsApiUrl, {
            method: request.method,
            headers: capsReqHeaders,
            body: authBody,
            signal: AbortSignal.timeout(3000),
          });
          if (capsResp.ok) {
            appLogger.info('Interceptor', `CAPS-AUTH: ${request.method} ${url.pathname} -> CAPS ${capsResp.status} [mode=${connectionMode}]`);
            return new Response(capsResp.body, {
              status: capsResp.status,
              statusText: capsResp.statusText,
              headers: { ...Object.fromEntries(capsResp.headers.entries()), 'X-Connection-Mode': connectionMode, 'X-Source': 'caps' },
            });
          }
          appLogger.info('Interceptor', `CAPS-AUTH: CAPS returned ${capsResp.status} for ${url.pathname}, falling through to cloud`);
        } catch (capsAuthErr) {
          appLogger.warn('Interceptor', `CAPS-AUTH: CAPS unreachable for ${url.pathname} (${capsAuthErr.message}), falling through to cloud`);
        }
      }
    }

    if (isApiRequest && connectionMode === 'red' && isWriteMethod && !isCapsAuthRoute) {
      appLogger.error('Interceptor', `RED mode HARD FAIL: blocking WRITE ${request.method} ${url.pathname} — CAPS unreachable (Architecture Contract: pilot hard fail)`);
      return new Response(JSON.stringify({ error: 'Store server unreachable — POS operations disabled', mode: 'red', path: url.pathname }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'X-Connection-Mode': 'red', 'X-Source': 'red-blocked' },
      });
    }

    if (isApiRequest && offlineInterceptor && isLocalFirstWrite(request.method, url.pathname)) {
      const cloudFallbackClone = request.clone();
      const body = await parseRequestBody(request);
      const queryParams = Object.fromEntries(url.searchParams);
      let interceptorHandled = false;
      if (offlineInterceptor.canHandleOffline(request.method, url.pathname)) {
        const result = offlineInterceptor.handleRequest(request.method, url.pathname, queryParams, body);
        if (result) {
          interceptorHandled = true;
          appLogger.info('Interceptor', `LOCAL-FIRST: ${request.method} ${url.pathname} -> ${result.status} [mode=${connectionMode}]`);
          broadcastSyncStatus();
          const sendMatch = url.pathname.match(/^\/api\/checks\/([^/]+)\/send/);
          if (sendMatch) {
            const capsUrl = getCapsServiceHostUrl();
            if (capsUrl) {
              const capsCheckId = sendMatch[1];
              const fwdConfig = loadConfig();
              const fwdHeaders = { 'Content-Type': 'application/json' };
              if (fwdConfig.deviceId) fwdHeaders['x-workstation-id'] = fwdConfig.deviceId;
              if (fwdConfig.deviceName) fwdHeaders['x-device-name'] = fwdConfig.deviceName;
              if (fwdConfig.serviceHostToken) fwdHeaders['x-workstation-token'] = fwdConfig.serviceHostToken;
              (async () => {
                try {
                  if (enhancedOfflineDb && enhancedOfflineDb.syncToCaps) {
                    appLogger.info('Interceptor', `CAPS send: syncing pending checks to CAPS before send (check ${capsCheckId})`);
                    const syncResult = await enhancedOfflineDb.syncToCaps(capsUrl);
                    appLogger.info('Interceptor', `CAPS send: pre-sync done - synced:${syncResult?.synced || 0} failed:${syncResult?.failed || 0}`);
                  }
                } catch (syncErr) {
                  appLogger.warn('Interceptor', `CAPS send: pre-sync failed (will still attempt send): ${syncErr.message}`);
                }
                const capsSendUrl = `${capsUrl}/api/caps/checks/${capsCheckId}/send`;
                const maxRetries = 3;
                let lastError = null;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                  try {
                    const r = await fetch(capsSendUrl, {
                      method: 'POST',
                      headers: fwdHeaders,
                      body: JSON.stringify(body || {}),
                      signal: AbortSignal.timeout(8000),
                    });
                    appLogger.info('Interceptor', `CAPS send-to-kitchen forwarded: ${capsCheckId} -> ${r.status} (attempt ${attempt})`);
                    if (r.status >= 500 || r.status === 429) {
                      const errBody = await r.text().catch(() => '');
                      appLogger.warn('Interceptor', `CAPS send-to-kitchen server error (retryable): ${errBody}`);
                      lastError = new Error(`Server error ${r.status}`);
                      if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        continue;
                      }
                      break;
                    }
                    if (r.status >= 400) {
                      const errBody = await r.text().catch(() => '');
                      appLogger.warn('Interceptor', `CAPS send-to-kitchen client error (not retryable): ${errBody}`);
                    }
                    lastError = null;
                    break;
                  } catch (e) {
                    lastError = e;
                    appLogger.warn('Interceptor', `CAPS send-to-kitchen attempt ${attempt}/${maxRetries} failed: ${e.message}`);
                    if (attempt < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                  }
                }
                if (lastError) {
                  appLogger.error('Interceptor', `CAPS send-to-kitchen all ${maxRetries} attempts failed for check ${capsCheckId}, queuing for retry`);
                  if (enhancedOfflineDb && enhancedOfflineDb.queueOperation) {
                    enhancedOfflineDb.queueOperation('kds_send_retry', `/api/caps/checks/${capsCheckId}/send`, 'POST', body || {}, 1);
                  }
                }
              })();
            }
          }
          const termSessionCreateMatch = url.pathname.match(/^\/api\/terminal-sessions\/?$/);
          if (termSessionCreateMatch && request.method === 'POST') {
            const capsUrl = getCapsServiceHostUrl();
            if (capsUrl) {
              const tsConfig = loadConfig();
              const tsHeaders = { 'Content-Type': 'application/json' };
              if (tsConfig.deviceId) tsHeaders['x-workstation-id'] = tsConfig.deviceId;
              if (tsConfig.serviceHostToken) tsHeaders['x-workstation-token'] = tsConfig.serviceHostToken;
              let capsForwardSuccess = false;
              for (let tsAttempt = 1; tsAttempt <= 2; tsAttempt++) {
                try {
                  const capsResp = await fetch(`${capsUrl}/api/terminal-sessions`, {
                    method: 'POST',
                    headers: tsHeaders,
                    body: JSON.stringify(body || {}),
                    signal: AbortSignal.timeout(5000),
                  });
                  if (!capsResp.ok) {
                    const errBody = await capsResp.text().catch(() => '');
                    appLogger.warn('Interceptor', `CAPS terminal-session create returned ${capsResp.status}: ${errBody} (attempt ${tsAttempt})`);
                    if (tsAttempt < 2) await new Promise(r => setTimeout(r, 500));
                    continue;
                  }
                  const capsData = await capsResp.json().catch(() => ({}));
                  appLogger.info('Interceptor', `CAPS terminal-session created: ${capsResp.status} -> id=${capsData.id || 'unknown'} (attempt ${tsAttempt})`);
                  if (capsData.id && result.data && result.data.id) {
                    if (offlineInterceptor) {
                      offlineInterceptor._capsTerminalSessionMap = offlineInterceptor._capsTerminalSessionMap || {};
                      offlineInterceptor._capsTerminalSessionMap[result.data.id] = capsData.id;
                    }
                    result.data.capsSessionId = capsData.id;
                  }
                  capsForwardSuccess = true;
                  break;
                } catch (e) {
                  appLogger.warn('Interceptor', `CAPS terminal-session create attempt ${tsAttempt}/2 failed: ${e.message}`);
                  if (tsAttempt < 2) await new Promise(r => setTimeout(r, 500));
                }
              }
              if (!capsForwardSuccess) {
                appLogger.error('Interceptor', 'CAPS terminal-session create failed after 2 attempts, queuing for retry');
                if (enhancedOfflineDb && enhancedOfflineDb.queueOperation) {
                  enhancedOfflineDb.queueOperation('terminal_session_create', '/api/terminal-sessions', 'POST', body || {}, 1);
                }
                result.data.capsForwardPending = true;
              }
            }
          }
          const termSessionPatchMatch = url.pathname.match(/^\/api\/terminal-sessions\/([^/]+)$/);
          if (termSessionPatchMatch && (request.method === 'PATCH' || request.method === 'PUT')) {
            const capsUrl = getCapsServiceHostUrl();
            if (capsUrl) {
              const tsId = termSessionPatchMatch[1];
              const mappedId = (offlineInterceptor && offlineInterceptor._capsTerminalSessionMap && offlineInterceptor._capsTerminalSessionMap[tsId]) || tsId;
              const tsConfig = loadConfig();
              const tsHeaders = { 'Content-Type': 'application/json' };
              if (tsConfig.serviceHostToken) tsHeaders['x-workstation-token'] = tsConfig.serviceHostToken;
              for (let patchAttempt = 1; patchAttempt <= 2; patchAttempt++) {
                try {
                  const patchResp = await fetch(`${capsUrl}/api/terminal-sessions/${mappedId}`, {
                    method: 'PATCH',
                    headers: tsHeaders,
                    body: JSON.stringify(body || {}),
                    signal: AbortSignal.timeout(3000),
                  });
                  appLogger.info('Interceptor', `CAPS terminal-session patch: ${mappedId} -> ${patchResp.status} (attempt ${patchAttempt})`);
                  break;
                } catch (e) {
                  appLogger.warn('Interceptor', `CAPS terminal-session patch attempt ${patchAttempt}/2 failed: ${e.message}`);
                  if (patchAttempt < 2) await new Promise(r => setTimeout(r, 500));
                }
              }
            }
          }
          return new Response(JSON.stringify(result.data), {
            status: result.status,
            headers: { 'Content-Type': 'application/json', 'X-Local-First': 'true', 'X-Connection-Mode': connectionMode },
          });
        } else if (connectionMode === 'green') {
          appLogger.info('Interceptor', `GREEN-FALLTHROUGH: ${request.method} ${url.pathname} -> cloud (interceptor returned null)`);
          return electronNet.fetch(cloudFallbackClone, { bypassCustomProtocolHandlers: true });
        }
      }
      if (!interceptorHandled) {
        if (connectionMode === 'green') {
          appLogger.info('Interceptor', `GREEN-FALLTHROUGH: ${request.method} ${url.pathname} -> cloud (not handled offline)`);
          return electronNet.fetch(cloudFallbackClone, { bypassCustomProtocolHandlers: true });
        } else {
          appLogger.warn('Interceptor', `OFFLINE-QUEUE: ${request.method} ${url.pathname}, queuing for sync [mode=${connectionMode}]`);
          if (enhancedOfflineDb && enhancedOfflineDb.queueOperation) {
            enhancedOfflineDb.queueOperation('unhandled_write', url.pathname, request.method, body || {}, 3);
            broadcastSyncStatus();
          }
        }
      }
    }

    if (isApiRequest && offlineInterceptor && isLocalFirstRead(request.method, url.pathname, url.search)) {
      const isTerminalSessionPoll = url.pathname.match(/^\/api\/terminal-sessions\/[^/]+$/);
      if (isTerminalSessionPoll) {
        const capsUrl = getCapsServiceHostUrl();
        if (capsUrl) {
          try {
            const capsApiUrl = `${capsUrl}${url.pathname}${url.search}`;
            const tsConfig = loadConfig();
            const tsHeaders = { 'Content-Type': 'application/json' };
            if (tsConfig.serviceHostToken) tsHeaders['x-workstation-token'] = tsConfig.serviceHostToken;
            const sessionId = url.pathname.match(/^\/api\/terminal-sessions\/([^/]+)$/)[1];
            const mappedId = (offlineInterceptor._capsTerminalSessionMap && offlineInterceptor._capsTerminalSessionMap[sessionId]) || sessionId;
            const capsResp = await fetch(`${capsUrl}/api/terminal-sessions/${mappedId}`, {
              method: 'GET',
              headers: tsHeaders,
              signal: AbortSignal.timeout(2000),
            });
            if (capsResp.ok) {
              const capsData = await capsResp.json();
              if (capsData.status && capsData.status !== 'pending') {
                const existing = offlineInterceptor.db.getEntity('terminal_sessions', sessionId);
                if (existing && existing.status !== capsData.status) {
                  const updated = { ...existing, status: capsData.status, updatedAt: new Date().toISOString() };
                  if (offlineInterceptor.db.usingSqlite) {
                    offlineInterceptor.db.db.prepare(`
                      UPDATE terminal_sessions SET data = ?, status = ?, updated_at = datetime('now') WHERE id = ?
                    `).run(JSON.stringify(updated), capsData.status, sessionId);
                  }
                }
              }
              return new Response(JSON.stringify(capsData), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'X-Local-First': 'true', 'X-Connection-Mode': connectionMode, 'X-Source': 'caps' },
              });
            }
          } catch (capsErr) {
            appLogger.debug('Interceptor', `Terminal session CAPS poll failed, using local: ${capsErr.message}`);
          }
        }
      }
      const queryParams = Object.fromEntries(url.searchParams);
      const result = offlineInterceptor.handleRequest('GET', url.pathname, queryParams, null);
      if (result) {
        appLogger.info('Interceptor', `LOCAL-FIRST-READ: GET ${url.pathname} -> ${result.status} [mode=${connectionMode}]`);
        return new Response(JSON.stringify(result.data), {
          status: result.status,
          headers: { 'Content-Type': 'application/json', 'X-Local-First': 'true', 'X-Connection-Mode': connectionMode },
        });
      }
    }

    if (isApiRequest && (connectionMode === 'yellow' || connectionMode === 'red')) {
      const capsUrl = getCapsServiceHostUrl();
      if (capsUrl && connectionMode === 'yellow') {
        try {
          const capsApiUrl = `${capsUrl}${url.pathname}${url.search}`;
          appLogger.info('Interceptor', `YELLOW mode -> CAPS: ${request.method} ${url.pathname}`);
          const capsHeaders = {};
          for (const [key, value] of request.headers.entries()) {
            if (key.toLowerCase() !== 'host') capsHeaders[key] = value;
          }
          const config = loadConfig();
          if (config.serviceHostToken) {
            capsHeaders['x-workstation-token'] = config.serviceHostToken;
          }
          const capsResponse = await fetch(capsApiUrl, {
            method: request.method,
            headers: capsHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
            signal: AbortSignal.timeout(3000),
          });
          appLogger.info('Interceptor', `YELLOW mode -> CAPS: ${request.method} ${url.pathname} -> ${capsResponse.status}`);
          if (capsResponse.status === 401 || capsResponse.status === 404) {
            appLogger.warn('Interceptor', `YELLOW->RED fallback: CAPS returned ${capsResponse.status} for ${request.method} ${url.pathname}`);
          } else {
            return new Response(capsResponse.body, {
              status: capsResponse.status,
              statusText: capsResponse.statusText,
              headers: { ...Object.fromEntries(capsResponse.headers.entries()), 'X-Connection-Mode': 'yellow' },
            });
          }
        } catch (capsError) {
          appLogger.warn('Interceptor', `CAPS proxy failed: ${capsError.message}, falling to RED`);
          setConnectionMode('red');
          if (offlineInterceptor) offlineInterceptor.setConnectionMode('red');
        }
      }

      if (connectionMode === 'red') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          appLogger.error('Interceptor', `RED mode HARD FAIL: blocking WRITE ${request.method} ${url.pathname} — CAPS unreachable (Architecture Contract: pilot hard fail)`);
          return new Response(JSON.stringify({ error: 'Store server unreachable — POS operations disabled', mode: 'red', path: url.pathname }), {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'X-Connection-Mode': 'red', 'X-Source': 'red-blocked' },
          });
        }
        if (offlineInterceptor) {
          appLogger.info('Interceptor', `RED mode -> local cache READ: ${url.pathname}`);
          const body = await parseRequestBody(request);
          return routeToOfflineInterceptor(request.method, url, body);
        }
      } else if (offlineInterceptor) {
        appLogger.info('Interceptor', `YELLOW fallback -> local: ${request.method} ${url.pathname}`);
        const body = await parseRequestBody(request);
        return routeToOfflineInterceptor(request.method, url, body);
      }
    }

    if (!isApiRequest) {
      const bundled = serveBundledAsset(url.pathname);
      if (bundled) {
        return bundled;
      }
      if (bundledAssetsAvailable) {
        const spaFallback = serveBundledAsset('/');
        if (spaFallback) {
          appLogger.debug('Interceptor', `Bundled SPA fallback for: ${url.pathname}`);
          return spaFallback;
        }
      }
    }

    const failoverClone = isApiRequest ? request.clone() : null;

    try {
      let fetchSignal;
      if (typeof AbortSignal.timeout === 'function') {
        fetchSignal = AbortSignal.timeout(2000);
      } else {
        const ac = new AbortController();
        setTimeout(() => ac.abort(), 2000);
        fetchSignal = ac.signal;
      }
      const response = await Promise.race([
        electronNet.fetch(request, { bypassCustomProtocolHandlers: true, signal: fetchSignal }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Protocol fetch timeout (2s)')), 2500)),
      ]);

      if (response.status === 502 || response.status === 503 || response.status === 504) {
        appLogger.warn('Interceptor', `Cloud returned ${response.status} for ${request.method} ${url.pathname} — treating as network failure`);
        response.body?.cancel().catch(() => {});
        checkConnectivity().catch(() => {});
        throw new Error(`Cloud gateway error (HTTP ${response.status})`);
      }

      if (response.ok && isApiRequest) {
        protocolConsecutiveFailCount = 0;
      }

      if (!isOnline && response.ok && isApiRequest) {
        isOnline = true;
        if (offlineInterceptor) offlineInterceptor.setOffline(false);
        setConnectionMode('green');
        if (mainWindow) mainWindow.webContents.send('online-status', true);
        appLogger.info('Network', 'Connection restored via protocol handler');
        triggerBackgroundSync();
        if (mainWindow && !mainWindow.isDestroyed()) {
          const currentUrl = mainWindow.webContents.getURL();
          if (currentUrl.startsWith('data:')) {
            const bundledIndex = path.join(getBundledAssetsDir(), 'index.html');
            appLogger.info('Network', `Window stuck on error/loading page, loading bundled index.html`);
            setTimeout(() => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                if (fs.existsSync(bundledIndex)) {
                  mainWindow.loadFile(bundledIndex);
                } else {
                  const sUrl = getServerUrl();
                  const sPath = appMode === 'kds' ? '/kds' : '/';
                  mainWindow.loadURL(`${sUrl}${sPath}`);
                }
              }
            }, 1000);
          }
        }
      }

      if (response.ok && isApiRequest && request.method === 'GET' && enhancedOfflineDb) {
        const singleCheckReadMatch = url.pathname.match(/^\/api\/checks\/([0-9a-f][^/]*)$/);
        if (singleCheckReadMatch) {
          const persistClone = response.clone();
          (async () => {
            try {
              const ct = persistClone.headers.get('content-type') || '';
              if (!ct.includes('json')) return;
              const cloudData = await persistClone.json();
              if (cloudData && cloudData.check && cloudData.check.id) {
                const checkToSave = { ...cloudData.check, items: cloudData.items || [], payments: cloudData.payments || [] };
                enhancedOfflineDb.saveOfflineCheck(checkToSave);
              }
            } catch (e) {
              appLogger.debug('Interceptor', `Failed to persist cloud check read locally: ${e.message}`);
            }
          })();
        }
      }

      if (response.ok && isApiRequest && /^\/api\/checks/.test(url.pathname) && request.method !== 'GET' && connectionMode === 'green') {
        const capsUrl = getCapsServiceHostUrl();
        if (capsUrl) {
          const warmClone = response.clone();
          (async () => {
            try {
              const contentType = warmClone.headers.get('content-type') || '';
              if (!contentType.includes('json')) return;
              const responseData = await warmClone.json();
              let checkId = null;
              const checkIdMatch = url.pathname.match(/^\/api\/checks\/([^/]+)/);
              if (checkIdMatch) {
                checkId = checkIdMatch[1];
              } else if (responseData && responseData.id) {
                checkId = responseData.id;
              } else if (responseData && responseData.check && responseData.check.id) {
                checkId = responseData.check.id;
              }
              if (!checkId) return;
              const cloudBaseUrl = request.url.replace(url.pathname + url.search, '');
              const warmHeaders = {};
              for (const [key, value] of request.headers.entries()) {
                if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'content-length') {
                  warmHeaders[key] = value;
                }
              }
              const fullCheckResp = await electronNet.fetch(`${cloudBaseUrl}/api/checks/${checkId}`, {
                headers: warmHeaders,
                bypassCustomProtocolHandlers: true,
                signal: AbortSignal.timeout(4000),
              });
              if (!fullCheckResp.ok) {
                appLogger.warn('Interceptor', `GREEN->CAPS warm sync: cloud GET /api/checks/${checkId} returned ${fullCheckResp.status}`);
                return;
              }
              const fullData = await fullCheckResp.json();
              const checkState = fullData.check ? { ...fullData.check, items: fullData.items || [], payments: fullData.payments || [] } : responseData;
              if (!checkState.id) return;
              const syncHeaders = { 'Content-Type': 'application/json' };
              const warmConfig = loadConfig();
              if (warmConfig.serviceHostToken) syncHeaders['x-workstation-token'] = warmConfig.serviceHostToken;
              if (warmConfig.deviceId) syncHeaders['x-workstation-id'] = warmConfig.deviceId;
              const syncResp = await fetch(`${capsUrl}/api/caps/sync/check-state`, {
                method: 'POST',
                headers: syncHeaders,
                body: JSON.stringify(checkState),
                signal: AbortSignal.timeout(5000),
              });
              appLogger.info('Interceptor', `GREEN->CAPS warm sync: check ${checkId} (${(checkState.items || []).length} items) -> ${syncResp.status}`);
            } catch (warmErr) {
              appLogger.warn('Interceptor', `GREEN->CAPS warm sync failed: ${warmErr.message}`);
            }
          })();
        }
      }

      return response;
    } catch (networkError) {
      const msSinceStart = Date.now() - protocolInterceptorStartTime;
      const inGracePeriod = msSinceStart < PROTOCOL_STARTUP_GRACE_MS;

      if (inGracePeriod) {
        appLogger.debug('Interceptor', `Startup grace: ignoring timeout for ${isApiRequest ? 'API' : 'asset'} ${url.pathname} (${Math.round((PROTOCOL_STARTUP_GRACE_MS - msSinceStart) / 1000)}s remaining)`);
      } else if (!isApiRequest) {
        appLogger.debug('Interceptor', `Ignoring asset timeout (non-API): ${url.pathname}`);
      }

      if (isOnline && !inGracePeriod && isApiRequest) {
        protocolConsecutiveFailCount++;
        if (protocolConsecutiveFailCount >= PROTOCOL_FAIL_THRESHOLD) {
          isOnline = false;
          if (offlineInterceptor) offlineInterceptor.setOffline(true);
          if (mainWindow) mainWindow.webContents.send('online-status', false);
          appLogger.warn('Network', `Connection lost after ${protocolConsecutiveFailCount} consecutive API failures: ${networkError.message}`);
          protocolConsecutiveFailCount = 0;
          checkConnectivity().catch(() => {});
        } else {
          appLogger.info('Network', `API request failed (${protocolConsecutiveFailCount}/${PROTOCOL_FAIL_THRESHOLD}): ${url.pathname} — ${networkError.message}`);
        }
      }

      if (isApiRequest) {
        const capsUrl = getCapsServiceHostUrl();
        if (capsUrl) {
          try {
            const capsApiUrl = `${capsUrl}${url.pathname}${url.search}`;
            appLogger.info('Interceptor', `FAILOVER YELLOW -> CAPS: ${request.method} ${url.pathname}`);
            const capsHeaders = {};
            if (failoverClone) {
              for (const [key, value] of failoverClone.headers.entries()) {
                if (key.toLowerCase() !== 'host') capsHeaders[key] = value;
              }
            }
            const failoverConfig = loadConfig();
            if (failoverConfig.serviceHostToken) {
              capsHeaders['x-workstation-token'] = failoverConfig.serviceHostToken;
            }
            const capsBody = failoverClone && request.method !== 'GET' && request.method !== 'HEAD'
              ? await failoverClone.arrayBuffer()
              : undefined;
            const capsResponse = await fetch(capsApiUrl, {
              method: request.method,
              headers: capsHeaders,
              body: capsBody,
              signal: AbortSignal.timeout(3000),
            });
            appLogger.info('Interceptor', `FAILOVER YELLOW -> CAPS: ${request.method} ${url.pathname} -> ${capsResponse.status}`);
            if (capsResponse.status === 401 || capsResponse.status === 404) {
              appLogger.warn('Interceptor', `YELLOW->RED fallback: CAPS returned ${capsResponse.status} for ${request.method} ${url.pathname}`);
            } else {
              if (!inGracePeriod) {
                setConnectionMode('yellow');
                if (offlineInterceptor) offlineInterceptor.setConnectionMode('yellow');
              } else {
                appLogger.debug('Interceptor', `Startup grace: serving via CAPS but suppressing yellow mode downgrade for ${url.pathname}`);
              }
              return new Response(capsResponse.body, {
                status: capsResponse.status,
                statusText: capsResponse.statusText,
                headers: { ...Object.fromEntries(capsResponse.headers.entries()), 'X-Connection-Mode': inGracePeriod ? 'green' : 'yellow' },
              });
            }
          } catch (capsErr) {
            if (!inGracePeriod) {
              appLogger.warn('Interceptor', `CAPS also unreachable: ${capsErr.message}, falling to RED`);
              setConnectionMode('red');
              if (offlineInterceptor) offlineInterceptor.setConnectionMode('red');
            } else {
              appLogger.debug('Interceptor', `Startup grace: CAPS unreachable (${capsErr.message}), using offline handler`);
            }
          }
        } else {
          if (!inGracePeriod) {
            setConnectionMode('red');
            if (offlineInterceptor) offlineInterceptor.setConnectionMode('red');
          }
        }

        if (offlineInterceptor && failoverClone) {
          if (connectionMode === 'red' && request.method !== 'GET' && request.method !== 'HEAD') {
            appLogger.error('Interceptor', `RED FAILOVER HARD FAIL: blocking WRITE ${request.method} ${url.pathname} — no offline write in RED mode`);
            return new Response(JSON.stringify({ error: 'Store server unreachable — POS operations disabled', mode: 'red', path: url.pathname }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', 'X-Connection-Mode': 'red', 'X-Source': 'red-blocked' },
            });
          }
          appLogger.info('Interceptor', `FAILOVER -> offline: ${request.method} ${url.pathname} [mode=${connectionMode}]`);
          const body = await parseRequestBody(failoverClone);
          return routeToOfflineInterceptor(request.method, url, body);
        }
      }

      const cached = getCachedResponseFromDisk(url.pathname);
      if (cached) return cached;

      const bundled = serveBundledAsset(url.pathname);
      if (bundled) {
        appLogger.info('BundledAssets', `Serving bundled asset (network error fallback): ${url.pathname}`);
        return bundled;
      }
      if (bundledAssetsAvailable) {
        const spaFallback = serveBundledAsset('/');
        if (spaFallback) {
          appLogger.info('BundledAssets', `SPA fallback (network error): ${url.pathname}`);
          return spaFallback;
        }
      }

      if (!url.pathname.includes('.')) {
        appLogger.warn('PageCache', `No cached page or bundled asset for: ${url.pathname}, serving offline fallback`);
        return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cloud POS - Offline</title>
<style>body{font-family:system-ui;background:#0f1729;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.c{max-width:480px;padding:40px}h1{margin-bottom:12px}p{opacity:0.8;line-height:1.6;margin-bottom:20px}
button{padding:12px 32px;font-size:16px;border:1px solid #4a4a6a;border-radius:8px;background:#2a2a4a;color:#fff;cursor:pointer}
button:hover{background:#3a3a5a}.info{margin-top:20px;font-size:13px;opacity:0.5}</style></head>
<body><div class="c"><h1>Cloud POS Offline</h1>
<p>The server is unreachable and no bundled or cached pages are available. Please reinstall the application or connect to the internet.</p>
<button onclick="location.reload()">Retry Connection</button>
<p class="info">Once connected, the app will automatically cache itself for offline use.</p></div></body></html>`, {
          status: 503,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      appLogger.warn('BundledAssets', `No fallback available for asset: ${url.pathname}, serving minimal offline response`);
      const offlineFallbackHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cloud POS - Restart Required</title>
<style>body{font-family:system-ui;background:#0f1729;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.c{max-width:480px;padding:40px}h1{margin-bottom:12px;color:#f59e0b}p{opacity:0.8;line-height:1.6;margin-bottom:20px}
button{padding:12px 32px;font-size:16px;border:1px solid #4a4a6a;border-radius:8px;background:#2a2a4a;color:#fff;cursor:pointer}
button:hover{background:#3a3a5a}.info{margin-top:20px;font-size:13px;opacity:0.5}</style></head>
<body><div class="c"><h1>Restart Required</h1>
<p>The application needs to be restarted. Bundled assets are missing or unavailable.</p>
<p>Please close and reopen the application, or connect to the internet to download the latest version.</p>
<button onclick="location.reload()">Retry</button>
<p class="info">If this persists, reinstall the application.</p></div></body></html>`;
      return new Response(offlineFallbackHtml, {
        status: 503,
        headers: { 'Content-Type': 'text/html' },
      });
    }
  });

  appLogger.info('Interceptor', 'HTTPS protocol interceptor registered for offline support');
}

let servicesInitialized = false;
let syncTimer = null;
let statusSummaryInterval = null;
const appStartTime = Date.now();

function startPeriodicStatusSummary() {
  if (statusSummaryInterval) clearInterval(statusSummaryInterval);
  statusSummaryInterval = setInterval(() => {
    const uptimeMs = Date.now() - appStartTime;
    const uptimeH = Math.floor(uptimeMs / 3600000);
    const uptimeM = Math.floor((uptimeMs % 3600000) / 60000);
    const uptimeStr = uptimeH > 0 ? `${uptimeH}h${uptimeM}m` : `${uptimeM}m`;
    const pending = getPendingOperations().length;
    const config = loadConfig();
    const deviceName = config.deviceName || 'unknown';
    const interceptorStats = offlineInterceptor ? offlineInterceptor.getAndResetStats() : null;
    let interceptorInfo = '';
    if (interceptorStats && interceptorStats.totalRequests > 0) {
      interceptorInfo = ` | Interceptor (last 60s): ${interceptorStats.totalRequests} requests handled`;
    }
    appLogger.info('Status', `Mode: ${connectionMode.toUpperCase()} | Cloud: ${isOnline ? 'connected' : 'disconnected'} | Device: ${deviceName} | Uptime: ${uptimeStr} | Pending sync: ${pending}${interceptorInfo}`);
  }, 60000);
}

async function initAllServices() {
  if (servicesInitialized) {
    appLogger.info('App', 'Services already initialized, skipping');
    return;
  }

  const config = loadConfig();
  if (!config.setupComplete) {
    appLogger.info('App', 'Setup not complete, deferring service initialization');
    return;
  }

  appLogger.info('App', 'Initializing services after setup verification');

  if (config.serviceHostUrl) {
    capsConfig = {
      serviceHostUrl: config.serviceHostUrl,
      capsWorkstationId: config.capsWorkstationId || null,
      capsWorkstationName: config.capsWorkstationName || null,
      isCapsWorkstation: config.isCapsWorkstation || false,
      propertyId: config.propertyId,
      serviceHostId: null,
    };
    appLogger.info('CAPS', 'Loaded cached CAPS config', { serviceHostUrl: config.serviceHostUrl, isCaps: config.isCapsWorkstation });
  }

  initOfflineDatabase();
  await initEnhancedOfflineDb();
  emvManager = new EMVTerminalManager(DATA_DIR);
  await initPrintAgent();

  if (config.autoLaunch) {
    setupAutoLaunch(true);
  }

  let lastConnectivityMode = 'green';
  function scheduleConnectivityCheck() {
    if (syncInterval) clearInterval(syncInterval);
    const interval = lastConnectivityMode === 'green' ? 15000 : 8000;
    appLogger.info('Connectivity', `Check interval set to ${interval / 1000}s (mode: ${lastConnectivityMode})`);
    syncInterval = setInterval(async () => {
      await checkConnectivity();
      const currentMode = connectionMode || 'green';
      if (currentMode !== lastConnectivityMode) {
        appLogger.info('Connectivity', `Mode changed ${lastConnectivityMode} -> ${currentMode}, adjusting interval`);
        lastConnectivityMode = currentMode;
        scheduleConnectivityCheck();
      }
    }, interval);
  }
  scheduleConnectivityCheck();
  await checkConnectivity({ forceImmediate: true });

  if (!enhancedOfflineDb) {
    syncTimer = setInterval(syncOfflineData, 60000);
  }
  startBackgroundSyncWorker();

  dataSyncInterval = setInterval(async () => {
    if (isOnline && connectionMode === 'green' && enhancedOfflineDb) {
      const cfg = loadConfig();
      if (cfg.enterpriseId) {
        try {
          await enhancedOfflineDb.syncFromCloud(getServerUrl(), cfg.enterpriseId, cfg.propertyId, cfg.rvcId);
        } catch (e) {
          appLogger.warn('OfflineDB', 'Periodic sync failed', e.message);
        }
      }
    } else if (connectionMode !== 'green' && enhancedOfflineDb) {
      appLogger.debug('OfflineDB', `Skipping periodic sync (mode: ${connectionMode})`);
    }
  }, 300000);

  startPeriodicStatusSummary();

  await performInitialDataSync();

  await fetchActivationConfig();
  if (!capsConfig && config.isCapsWorkstation && config.serviceHostUrl) {
    capsConfig = {
      serviceHostUrl: config.serviceHostUrl,
      capsWorkstationId: config.capsWorkstationId || null,
      capsWorkstationName: config.capsWorkstationName || null,
      isCapsWorkstation: true,
      propertyId: config.propertyId,
      serviceHostId: null,
    };
    appLogger.info('CAPS', 'Using cached CAPS config after activation-config failure');
  }
  await startServiceHost();

  try {
    initAutoUpdater(updaterLogger);
  } catch (e) {
    appLogger.warn('App', 'Auto-updater init failed (expected in dev mode)', e.message);
  }

  servicesInitialized = true;
  appLogger.info('App', 'All services initialized successfully');
}

// Ensure only one instance of the app runs at a time
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // When a second instance is launched, focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  ensureDirectories();
  parseArgs();
  checkVersionAndRotate(app.getVersion());
  appLogger.separator('APPLICATION STARTUP');
  appLogger.info('App', 'Cloud POS starting', { version: app.getVersion(), mode: appMode, kiosk: isKiosk, platform: process.platform });
  appLogger.info('App', 'Directories', { config: CONFIG_DIR, data: DATA_DIR, logs: LOG_DIR });

  const config = loadConfig();

  if (config.deviceName) {
    setDeviceLabel(config.deviceName);
  } else if (config.mode) {
    setDeviceLabel(config.mode.toUpperCase());
  }

  setupIpcHandlers();

  registerProtocolInterceptor();

  if (config.setupComplete) {
    appLogger.info('App', 'Setup previously completed — launching window immediately, services in background');
    migrateAutoStartup(config);

    await initOfflineDbEarly();

    createWindow();

    (async () => {
      try {
        const serverUrl = getServerUrl();
        const quickCheck = await fetch(`${serverUrl}/api/health`, {
          signal: AbortSignal.timeout(1500),
        });
        if (quickCheck.ok) {
          isOnline = true;
          firstBootConnectivityChecked = true;
          appLogger.info('App', 'Background connectivity check: ONLINE');
        } else {
          isOnline = false;
          connectionMode = 'red';
          firstBootConnectivityChecked = true;
          if (offlineInterceptor) {
            offlineInterceptor.setOffline(true);
            offlineInterceptor.setConnectionMode('red');
          }
          appLogger.info('App', `Background connectivity check: OFFLINE (status ${quickCheck.status})`);
        }
      } catch (e) {
        isOnline = false;
        connectionMode = 'red';
        firstBootConnectivityChecked = true;
        if (offlineInterceptor) {
          offlineInterceptor.setOffline(true);
          offlineInterceptor.setConnectionMode('red');
        }
        appLogger.info('App', `Background connectivity check: OFFLINE (${e.message})`);
      }
    })();

    initAllServices().then(() => {
      appLogger.info('App', 'Background service initialization complete');
    }).catch(err => {
      appLogger.error('App', `Background service init failed: ${err.message}`);
    });
  } else {
    appLogger.info('App', 'Setup not yet completed, launching Setup Wizard only (no services initialized)');
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  appLogger.info('App', 'Application shutting down');
  stopServiceHost();
  if (syncInterval) clearInterval(syncInterval);
  if (syncTimer) clearInterval(syncTimer);
  if (dataSyncInterval) clearInterval(dataSyncInterval);
  if (statusSummaryInterval) clearInterval(statusSummaryInterval);
  if (printAgent) {
    printAgent.stop();
  }
  if (enhancedOfflineDb) {
    try { enhancedOfflineDb.close(); } catch (e) {}
  }
  if (offlineDb) {
    try { offlineDb.close(); } catch (e) {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navigationEvent, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      const serverUrl = getServerUrl();
      const serverHost = new URL(serverUrl).hostname;
      const trustedHosts = ['localhost', '127.0.0.1', serverHost];
      const trustedDomains = ['repl.co', 'replit.dev', 'replit.app'];

      const isTrusted = trustedHosts.includes(parsedUrl.hostname) ||
        trustedDomains.some(d => parsedUrl.hostname.endsWith('.' + d));

      if (!isTrusted) {
        navigationEvent.preventDefault();
      }
    } catch (e) {
      navigationEvent.preventDefault();
    }
  });
});

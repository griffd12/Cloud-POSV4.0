declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      versions: { node: string; electron: string; chrome: string };
      toggleFullscreen: () => void;
      quitApp: () => void;
      getAppInfo: () => Promise<{
        mode: string;
        isKiosk: boolean;
        isOnline: boolean;
        serverUrl: string;
        platform: string;
        version: string;
        dataDir: string;
        pendingSync: number;
        enterpriseId?: string | null;
        enterpriseName?: string | null;
        propertyId?: string | null;
        propertyName?: string | null;
        rvcId?: string | null;
        rvcName?: string | null;
        deviceId?: string | null;
        deviceName?: string | null;
        deviceType?: string | null;
        setupComplete?: boolean;
      }>;
      getOnlineStatus: () => Promise<boolean>;
      getConnectionMode: () => Promise<string>;
      printRaw: (address: string, port: number, data: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
      printEscPos: (address: string, port: number, commands: EscPosCommand[]) => Promise<{ success: boolean; error?: string }>;
      getLocalPrinters: () => Promise<LocalPrinter[]>;
      printToSystemPrinter: (printerName: string, data: string, options?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      queueOfflineOperation: (type: string, endpoint: string, method: string, body: unknown) => Promise<{ success: boolean; pending: number }>;
      getPendingSyncCount: () => Promise<number>;
      forceSync: () => Promise<{ pending: number }>;
      cacheData: (key: string, data: unknown) => Promise<{ success: boolean; error?: string }>;
      getCachedData: (key: string) => Promise<unknown>;
      setMode: (mode: string) => Promise<{ success: boolean; mode: string }>;
      setServerUrl: (url: string) => Promise<{ success: boolean }>;
      setAutoLaunch: (enable: boolean) => Promise<{ success: boolean }>;
      // Print Agent API
      printAgent: {
        getStatus: () => Promise<PrintAgentStatus>;
        start: () => Promise<{ success: boolean; error?: string }>;
        stop: () => Promise<{ success: boolean; error?: string }>;
        addPrinter: (config: PrinterConfig) => Promise<{ success: boolean }>;
        removePrinter: (key: string) => Promise<{ success: boolean }>;
        getPrinters: () => Promise<PrinterConfig[]>;
        configure: (config: { agentId?: string; agentToken?: string }) => Promise<{ success: boolean }>;
        testPrinter: (ipAddress: string, port?: number) => Promise<{ success: boolean; error?: string }>;
        localPrint: (config: { printerIp: string; printerPort?: number; data: string; printerId?: string }) => Promise<{ success: boolean; jobId?: string }>;
      };

      // Diagnostics API
      diagnostics: {
        listComPorts: () => Promise<{
          success: boolean;
          error?: string;
          ports: Array<{
            path: string;
            manufacturer: string | null;
            serialNumber: string | null;
            pnpId: string | null;
            vendorId: string | null;
            productId: string | null;
          }>;
        }>;
        testSerial: (comPort: string, baudRate?: number, printTestPage?: boolean) => Promise<{
          success: boolean;
          error?: string;
          opened?: boolean;
          openTimeMs?: number;
          dataSent?: boolean;
          bytesSent?: number;
        }>;
        testNetworkPrinter: (ipAddress: string, port?: number) => Promise<{
          success: boolean;
          error?: string;
          connected?: boolean;
          connectTimeMs?: number;
        }>;
      };

      // Enhanced Offline Database API
      offlineDb: {
        sync: (enterpriseId: string, propertyId?: string, rvcId?: string) => Promise<OfflineSyncResult>;
        getStats: () => Promise<OfflineDbStats>;
        getEntity: (table: string, id: string) => Promise<unknown>;
        getEntityList: (table: string, enterpriseId?: string) => Promise<unknown[]>;
        getSalesData: (businessDate?: string, rvcId?: string) => Promise<LocalSalesData | null>;
        syncToCloud: () => Promise<{ synced: number; failed: number; remaining?: number }>;
        getChecks: (rvcId?: string, status?: string) => Promise<unknown[]>;
        saveCheck: (check: unknown) => Promise<{ success: boolean }>;
      };

      getOfflineMode: () => Promise<OfflineModeStatus>;

      openLogDirectory: () => Promise<{ success: boolean; path: string }>;
      getLogContent: (logName: string, lines?: number) => Promise<{ success: boolean; content?: string; path?: string; error?: string }>;

      emvSendPayment: (config: {
        address: string;
        port?: number;
        amount: number;
        transactionType?: string;
        timeout?: number;
      }) => Promise<EMVPaymentResult>;
      emvCancel: (address: string, port?: number) => Promise<{ success: boolean; reason?: string }>;
      emvGetPendingPayments: () => Promise<OfflinePayment[]>;
      emvMarkPaymentSynced: (id: string) => Promise<{ success: boolean }>;
      signalBootstrapReady: () => Promise<{ success: boolean }>;
      onOnlineStatus: (callback: (status: boolean) => void) => () => void;
      onConnectionMode: (callback: (mode: string) => void) => () => void;
      onSyncStatus: (callback: (status: { pending: number; lastSync: string }) => void) => () => void;
      onPrintAgentStatus: (callback: (status: PrintAgentStatus) => void) => () => void;
      onPrintAgentJobCompleted: (callback: (info: { jobId: string; printer: string }) => void) => () => void;
      onPrintAgentJobFailed: (callback: (info: { jobId: string; printer: string; error: string }) => void) => () => void;
      updater: {
        getStatus: () => Promise<UpdateStatus>;
        checkNow: () => Promise<{ success: boolean; status: string }>;
        install: () => Promise<{ success: boolean }>;
        getVersion: () => Promise<{ current: string; available: string | null; updateReady: boolean }>;
      };
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
    };
  }
}

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error';
  currentVersion: string | null;
  availableVersion: string | null;
  downloadProgress: number;
  lastChecked: string | null;
  error: string | null;
  updateReady: boolean;
}

export interface PrintAgentStatus {
  isRunning: boolean;
  isConnected?: boolean;
  isAuthenticated?: boolean;
  agentId?: string;
  agentName?: string;
  printers?: PrinterConfig[];
  localQueueSize?: number;
  completedJobs?: number;
  failedJobs?: number;
}

export interface PrinterConfig {
  name: string;
  ipAddress: string;
  port?: number;
  printerId?: string;
  type?: string;
}

export interface OfflineSyncResult {
  success: boolean;
  errors?: Array<{ endpoint: string; error?: string; status?: number }>;
  synced?: Array<{ table?: string; key?: string; count?: number }>;
  reason?: string;
}

export interface OfflineDbStats {
  usingSqlite?: boolean;
  encryptionActive?: boolean;
  lastSync?: string;
  enterpriseId?: string;
  propertyId?: string;
  pendingOperations?: number;
  offlineChecks?: number;
  offlinePayments?: number;
  cachedMenuItems?: number;
  cachedEmployees?: number;
}

export interface LocalSalesData {
  businessDate: string;
  totalSales: string;
  totalTax: string;
  totalDiscounts: string;
  totalNet: string;
  checkCount: number;
  itemCount: number;
  paymentsByTender: Record<string, { count: number; total: number }>;
  isOfflineData: boolean;
}

export interface OfflineModeStatus {
  isOffline: boolean;
  lastSync?: string;
  pendingOps?: number;
  stats?: OfflineDbStats;
}

export interface EscPosCommand {
  type: 'init' | 'text' | 'newline' | 'cut' | 'partial-cut' | 'bold-on' | 'bold-off' |
    'align-left' | 'align-center' | 'align-right' | 'double-height' | 'double-width' |
    'double-size' | 'normal-size' | 'feed' | 'open-drawer' | 'separator' | 'raw';
  value?: string;
  lines?: number;
  width?: number;
  bytes?: number[];
}

export interface LocalPrinter {
  name: string;
  displayName: string;
  status: number;
  isDefault: boolean;
}

export interface EMVPaymentResult {
  success: boolean;
  complete?: boolean;
  approved?: boolean;
  authCode?: string;
  transactionId?: string;
  cardType?: string;
  lastFour?: string;
  entryMethod?: string;
  tipAmount?: number;
  totalAmount?: number;
  responseCode?: string;
  responseMessage?: string;
  error?: string;
}

export interface OfflinePayment {
  id: string;
  amount: number;
  transactionType: string;
  authCode: string;
  transactionId: string;
  cardType: string;
  lastFour: string;
  entryMethod: string;
  tipAmount: number;
  approved: boolean;
  storedAt: string;
  synced: boolean;
}

export function isElectron(): boolean {
  return !!(window.electronAPI?.isElectron);
}

export function getElectronAPI() {
  return window.electronAPI;
}

export async function printViaElectron(
  address: string,
  port: number,
  commands: EscPosCommand[]
): Promise<{ success: boolean; error?: string }> {
  const api = getElectronAPI();
  if (!api) return { success: false, error: 'Not running in Electron' };
  return api.printEscPos(address, port, commands);
}

export async function sendEMVPayment(config: {
  address: string;
  port?: number;
  amount: number;
  transactionType?: string;
  timeout?: number;
}): Promise<EMVPaymentResult> {
  const api = getElectronAPI();
  if (!api) return { success: false, error: 'Not running in Electron' };
  return api.emvSendPayment(config);
}

export async function cancelEMVPayment(address: string, port?: number) {
  const api = getElectronAPI();
  if (!api) return { success: false, reason: 'Not running in Electron' };
  return api.emvCancel(address, port);
}

export function buildReceiptCommands(receipt: {
  header?: string;
  lines: Array<{ text: string; bold?: boolean; align?: 'left' | 'center' | 'right'; size?: 'normal' | 'double' }>;
  footer?: string;
  openDrawer?: boolean;
}): EscPosCommand[] {
  const commands: EscPosCommand[] = [{ type: 'init' }];

  if (receipt.header) {
    commands.push({ type: 'align-center' });
    commands.push({ type: 'double-size' });
    commands.push({ type: 'text', value: receipt.header });
    commands.push({ type: 'newline' });
    commands.push({ type: 'normal-size' });
    commands.push({ type: 'align-left' });
    commands.push({ type: 'newline' });
  }

  for (const line of receipt.lines) {
    if (line.align === 'center') commands.push({ type: 'align-center' });
    else if (line.align === 'right') commands.push({ type: 'align-right' });
    else commands.push({ type: 'align-left' });

    if (line.size === 'double') commands.push({ type: 'double-size' });
    if (line.bold) commands.push({ type: 'bold-on' });

    commands.push({ type: 'text', value: line.text });
    commands.push({ type: 'newline' });

    if (line.bold) commands.push({ type: 'bold-off' });
    if (line.size === 'double') commands.push({ type: 'normal-size' });
  }

  if (receipt.footer) {
    commands.push({ type: 'newline' });
    commands.push({ type: 'align-center' });
    commands.push({ type: 'text', value: receipt.footer });
    commands.push({ type: 'newline' });
  }

  commands.push({ type: 'feed', lines: 3 });
  commands.push({ type: 'partial-cut' });

  if (receipt.openDrawer) {
    commands.push({ type: 'open-drawer' });
  }

  return commands;
}

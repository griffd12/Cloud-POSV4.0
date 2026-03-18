#!/usr/bin/env node

/**
 * Cloud POS Service Host
 * 
 * On-premise server providing offline operation for the Cloud POS system.
 * 
 * Services:
 * - CAPS (Check And Posting Service) - Order management
 * - Print Controller - Kitchen/receipt printing
 * - KDS Controller - Kitchen display routing
 * - Payment Controller - Card terminal integration
 * 
 * Usage:
 *   node dist/index.js --cloud <https://your-pos.replit.app> --token <service-host-token>
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Database } from './db/database.js';
import { ConfigSync } from './sync/config-sync.js';
import { TransactionSync } from './sync/transaction-sync.js';
import { CalSync } from './sync/cal-sync.js';
import { CapsService } from './services/caps.js';
import { PrintController } from './services/print-controller.js';
import { KdsController } from './services/kds-controller.js';
import { PaymentController } from './services/payment-controller.js';
import { createApiRoutes } from './routes/api.js';
import { CloudConnection } from './sync/cloud-connection.js';
import { createAuthMiddleware, createPropertyScopeMiddleware } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TrackedDevice {
  deviceId: string;
  deviceName: string;
  lastSeen: number;
  requestCount: number;
}

class CapsDeviceTracker {
  private devices: Map<string, TrackedDevice> = new Map();
  private startTime: number = Date.now();
  private logInterval: ReturnType<typeof setInterval> | null = null;
  private readonly ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

  trackDevice(deviceId: string, deviceName: string): void {
    const existing = this.devices.get(deviceId);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.requestCount++;
      existing.deviceName = deviceName || existing.deviceName;
    } else {
      this.devices.set(deviceId, {
        deviceId,
        deviceName: deviceName || deviceId,
        lastSeen: Date.now(),
        requestCount: 1,
      });
    }
  }

  getConnectedDevices(): Array<TrackedDevice & { status: string }> {
    const now = Date.now();
    const result: Array<TrackedDevice & { status: string }> = [];
    for (const device of this.devices.values()) {
      const age = now - device.lastSeen;
      result.push({
        ...device,
        status: age <= this.ACTIVE_THRESHOLD_MS ? 'active' : 'stale',
      });
    }
    return result;
  }

  getActiveDeviceIds(): string[] {
    const now = Date.now();
    const ids: string[] = [];
    for (const device of this.devices.values()) {
      if (now - device.lastSeen <= this.ACTIVE_THRESHOLD_MS) {
        ids.push(device.deviceId);
      }
    }
    return ids;
  }

  getUptimeMinutes(): number {
    return Math.floor((Date.now() - this.startTime) / 60000);
  }

  startPeriodicLog(): void {
    this.logInterval = setInterval(() => {
      const now = Date.now();
      const active: string[] = [];
      const stale: string[] = [];
      for (const device of this.devices.values()) {
        const age = now - device.lastSeen;
        if (age <= this.ACTIVE_THRESHOLD_MS) {
          active.push(`${device.deviceName}(active)`);
        } else {
          stale.push(device.deviceName);
        }
      }
      const parts: string[] = [];
      if (active.length > 0) {
        parts.push(`Connected devices: ${active.join(', ')}`);
      }
      if (stale.length > 0) {
        parts.push(`Stale: ${stale.join(', ')}`);
      }
      if (parts.length === 0) {
        parts.push('No devices tracked');
      }
      parts.push(`CAPS uptime: ${this.getUptimeMinutes()}min`);
      console.log(`[CAPS] ${parts.join(' | ')}`);
    }, 60_000);
  }

  stop(): void {
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }
  }
}

interface Config {
  cloudUrl: string;
  token: string;
  serviceHostId: string;
  propertyId: string;
  port: number;
  dataDir: string;
  calRootDir: string; // Root directory for CAL package installations (e.g., C:\OPS-POS on Windows)
}

// Detect default CAL root directory based on OS
function getDefaultCalRootDir(): string {
  if (process.platform === 'win32') {
    return 'C:\\OPS-POS';
  }
  return path.join(process.env.HOME || '/opt', 'ops-pos');
}

const defaultConfig: Config = {
  cloudUrl: '',
  token: '',
  serviceHostId: '',
  propertyId: '',
  port: 3001,
  dataDir: path.join(__dirname, '../data'),
  calRootDir: getDefaultCalRootDir(),
};

function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const config: Partial<Config> = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cloud':
        config.cloudUrl = args[++i];
        break;
      case '--token':
        config.token = args[++i];
        break;
      case '--service-host-id':
        config.serviceHostId = args[++i];
        break;
      case '--property':
        config.propertyId = args[++i];
        break;
      case '--port':
        config.port = parseInt(args[++i], 10);
        break;
      case '--data-dir':
        config.dataDir = args[++i];
        break;
      case '--cal-root-dir':
        config.calRootDir = args[++i];
        break;
    }
  }
  
  return config;
}

function loadConfigFile(): Partial<Config> {
  const configPath = path.join(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      console.log('Loaded configuration from config.json');
      return JSON.parse(content);
    } catch (e) {
      console.error('Failed to read config.json:', (e as Error).message);
    }
  }
  return {};
}

class ServiceHost {
  private config: Config;
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private db: Database;
  private cloudConnection: CloudConnection;
  private configSync: ConfigSync;
  private transactionSync: TransactionSync;
  private calSync: CalSync;
  private capsService: CapsService;
  private printController: PrintController;
  private kdsController: KdsController;
  private paymentController: PaymentController;
  private deviceTracker: CapsDeviceTracker;
  private printAgentClients: Map<WebSocket, { agentId: string; agentName: string; authenticatedAt: string }> = new Map();
  private cloudHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readiness = {
    dbReady: false,
    configReady: false,
    websocketReady: false,
    deviceRegistryReady: false,
  };
  
  constructor(config: Config) {
    this.config = config;
    
    // Ensure data directory exists
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }
    
    // Initialize database
    this.db = new Database(path.join(config.dataDir, 'service-host.db'));
    
    // Initialize cloud connection
    this.cloudConnection = new CloudConnection(config.cloudUrl, config.token, config.serviceHostId);
    
    // Initialize sync services
    this.configSync = new ConfigSync(this.db, this.cloudConnection, config.propertyId);
    this.transactionSync = new TransactionSync(this.db, this.cloudConnection, config.serviceHostId, config.propertyId);
    this.calSync = new CalSync(this.db, this.cloudConnection, config.serviceHostId, config.dataDir, config.calRootDir);
    
    // Initialize service controllers
    this.capsService = new CapsService(this.db, this.transactionSync);
    this.printController = new PrintController(this.db);
    this.kdsController = new KdsController(this.db);
    this.paymentController = new PaymentController(this.db, this.transactionSync);
    
    // Initialize CAPS device tracker
    this.deviceTracker = new CapsDeviceTracker();
    
    // Initialize Express app
    this.app = express();
    this.app.use(express.json());
    
    // CORS for local workstations
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token, X-Workstation-Id');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    // CAPS device tracking middleware — logs incoming requests with device identity
    this.app.use((req, res, next) => {
      if (req.path === '/health' || req.method === 'OPTIONS') {
        return next();
      }
      const workstationId = req.headers['x-workstation-id'] as string | undefined;
      const deviceToken = req.headers['x-device-token'] as string | undefined;
      const deviceId = workstationId || deviceToken;
      if (deviceId) {
        const deviceName = (req.headers['x-device-name'] as string) || deviceId;
        this.deviceTracker.trackDevice(deviceId, deviceName);
        console.log(`[CAPS] Request: ${req.method} ${req.path} from ${deviceName} (${workstationId ? 'wsId' : 'token'}=${deviceId})`);
      }
      next();
    });
    
    const healthResponse = () => {
      let dbHealthy = false;
      try {
        const row = this.db.getDb().prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
        dbHealthy = row?.ok === 1;
      } catch {
        dbHealthy = false;
      }
      return {
        status: dbHealthy ? 'ok' : 'degraded',
        version: '1.0.0',
        serviceHostId: this.config.serviceHostId,
        cloudConnected: this.cloudConnection.isConnected(),
        propertyId: this.config.propertyId,
        uptime: process.uptime(),
        dbHealthy,
        installedPackages: this.calSync.getInstalledPackages(),
      };
    };
    this.app.get('/health', (_req, res) => {
      res.json(healthResponse());
    });
    this.app.get('/api/health', (_req, res) => {
      res.json(healthResponse());
    });
    
    this.app.get('/health/ready', (_req, res) => {
      const allReady = this.readiness.dbReady && this.readiness.configReady && 
                       this.readiness.websocketReady && this.readiness.deviceRegistryReady;
      const anyReady = this.readiness.dbReady || this.readiness.configReady;
      const status = allReady ? 'ready' : (anyReady ? 'degraded' : 'starting');
      res.json({
        status,
        ...this.readiness,
      });
    });
    this.app.get('/api/health/ready', (_req, res) => {
      const allReady = this.readiness.dbReady && this.readiness.configReady && 
                       this.readiness.websocketReady && this.readiness.deviceRegistryReady;
      const anyReady = this.readiness.dbReady || this.readiness.configReady;
      const status = allReady ? 'ready' : (anyReady ? 'degraded' : 'starting');
      res.json({
        status,
        ...this.readiness,
      });
    });
    
    // CAPS connected devices endpoint (unauthenticated for local network visibility)
    this.app.get('/api/caps/connected-devices', (req, res) => {
      const devices = this.deviceTracker.getConnectedDevices();
      res.json({
        serviceHostId: this.config.serviceHostId,
        uptimeMinutes: this.deviceTracker.getUptimeMinutes(),
        devices,
        totalTracked: devices.length,
        activeCount: devices.filter(d => d.status === 'active').length,
      });
    });
    
    // Authentication middleware for API routes
    const authMiddleware = createAuthMiddleware(this.db);
    const propertyScopeMiddleware = createPropertyScopeMiddleware();
    
    // API routes (authenticated)
    const apiRouter = createApiRoutes(
      this.capsService,
      this.printController,
      this.kdsController,
      this.paymentController,
      this.configSync,
      this.db
    );
    this.app.use('/api', authMiddleware, propertyScopeMiddleware, apiRouter);
    
    // Create HTTP server
    this.server = http.createServer(this.app);
    
    // WebSocket server for KDS and real-time updates
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });
    this.setupWebSocket();
    this.readiness.websocketReady = true;
  }
  
  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Workstation connected via WebSocket');
      
      // Send current CAL update status if an update is in progress
      if (this.calSync.isUpdating()) {
        const current = this.calSync.getCurrentUpdate();
        if (current) {
          ws.send(JSON.stringify({
            type: 'CAL_UPDATE_STATUS',
            status: 'running_script',
            packageName: current.packageName,
            packageVersion: current.version,
            message: 'Update in progress...',
            logOutput: this.calSync.getScriptOutput().join('\n'),
          }));
        }
      }
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (e) {
          console.error('Invalid WebSocket message:', (e as Error).message);
        }
      });
      
      ws.on('close', () => {
        const printAgent = this.printAgentClients.get(ws);
        if (printAgent) {
          console.log(`[PrintAgent] ${printAgent.agentName} disconnected`);
          this.printAgentClients.delete(ws);
        } else {
          console.log('Workstation disconnected');
        }
        this.kdsController.removeClient(ws);
      });
    });
    
    // Subscribe to CAL update events and broadcast to all connected clients
    this.calSync.onUpdate((event) => {
      this.broadcastToAll(event);
    });
  }
  
  private broadcastToAll(message: any): void {
    const payload = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
  
  private handleWebSocketMessage(ws: WebSocket, message: any) {
    switch (message.type) {
      case 'subscribe_kds':
        this.kdsController.addClient(ws, message.deviceId || message.stationId || '*');
        break;
      case 'subscribe':
        if (message.channel === 'kds') {
          this.kdsController.addClient(ws, message.deviceId || message.rvcId || '*');
        }
        break;
      case 'kds_bump':
        this.kdsController.bumpTicket(message.ticketId, message.stationId);
        break;
      case 'kds_recall':
        this.kdsController.recallTicket(message.ticketId);
        break;
      case 'HELLO': {
        const agentId = message.agentId || `print-agent-${Date.now()}`;
        const agentName = message.agentName || `Print Agent (${agentId.substring(0, 8)})`;
        console.log(`[PrintAgent] HELLO from ${agentName} (${agentId})`);
        this.printAgentClients.set(ws, { agentId, agentName, authenticatedAt: new Date().toISOString() });
        ws.send(JSON.stringify({
          type: 'AUTH_OK',
          agentId,
          agentName,
          propertyId: this.config.propertyId,
          serviceHostId: this.config.serviceHostId,
        }));
        break;
      }
      case 'HEARTBEAT':
        ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK', timestamp: new Date().toISOString() }));
        break;
      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        break;
      case 'JOB_RESULT':
        console.log(`[PrintAgent] Job result: ${message.jobId} -> ${message.status}`);
        break;
      case 'PRINTER_DISCOVERY_RESULT':
        console.log(`[PrintAgent] Discovered ${(message.printers || []).length} printers from agent ${message.agentId}`);
        break;
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }
  
  async start() {
    console.log('='.repeat(60));
    console.log('Cloud POS Service Host v1.0.0');
    console.log('='.repeat(60));
    console.log(`Cloud URL: ${this.config.cloudUrl}`);
    console.log(`Service Host ID: ${this.config.serviceHostId}`);
    console.log(`Property ID: ${this.config.propertyId}`);
    console.log(`Data Directory: ${this.config.dataDir}`);
    console.log(`CAL Root Directory: ${this.config.calRootDir}`);
    console.log('');
    
    // Initialize database schema
    await this.db.initialize();
    this.readiness.dbReady = true;
    console.log('Database initialized');
    
    // Connect to cloud and sync configuration
    try {
      await this.cloudConnection.connect();
      console.log('Connected to cloud');
      
      await this.configSync.syncFull();
      this.readiness.configReady = true;
      console.log('Configuration synced from cloud');
      
      this.cloudConnection.onMessage('SALES_DATA_CLEARED', (data) => {
        console.log('[CAPS] Received SALES_DATA_CLEARED from cloud, clearing local transactional data...');
        try {
          const result = this.db.clearTransactionalData();
          console.log(`[CAPS] Local transactional data cleared: ${result.tablesCleared.length} tables`);
          if (result.errors.length > 0) {
            console.warn('[CAPS] Some tables had errors during clear:', result.errors);
          }
        } catch (e) {
          console.error('[CAPS] Failed to clear local transactional data:', (e as Error).message);
        }
      });
      
      // Start CAL deployment sync
      await this.calSync.start();
      console.log('CAL deployment sync started');
    } catch (e) {
      console.warn('Cloud connection failed, operating in offline mode:', (e as Error).message);
      this.readiness.configReady = true;
    }
    
    // Start transaction sync worker
    this.transactionSync.startWorker();
    
    // Start CAPS device tracker periodic logging
    this.deviceTracker.startPeriodicLog();
    this.readiness.deviceRegistryReady = true;
    console.log('CAPS device tracker started');
    
    // Start periodic cloud heartbeat with connected device IDs
    this.startCloudHeartbeat();
    
    // Start HTTP server
    this.server.listen(this.config.port, '0.0.0.0', () => {
      console.log('');
      console.log(`Service Host listening on http://0.0.0.0:${this.config.port}`);
      console.log('');
      console.log('Available endpoints:');
      console.log('  GET  /health              - Health check');
      console.log('  POST /api/caps/checks     - Create check');
      console.log('  GET  /api/caps/checks     - List open checks');
      console.log('  POST /api/caps/checks/:id/items - Add items');
      console.log('  POST /api/caps/checks/:id/send  - Send to kitchen');
      console.log('  POST /api/caps/checks/:id/pay   - Process payment');
      console.log('  POST /api/print/jobs      - Submit print job');
      console.log('  GET  /api/kds/tickets     - Get KDS tickets');
      console.log('  POST /api/payment/authorize - Authorize payment');
      console.log('  GET  /api/caps/connected-devices - CAPS device tracker');
      console.log('  POST /api/caps/sync/check-state  - WS check sync');
      console.log('  POST /api/caps/sync/queue-operation - WS operation sync');
      console.log('  WS   /ws                  - Real-time updates');
      console.log('');
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }
  
  private startCloudHeartbeat(): void {
    const HEARTBEAT_INTERVAL = 60_000;
    const sendHeartbeat = async () => {
      if (!this.cloudConnection.isConnected()) return;
      try {
        const connectedDeviceIds = this.deviceTracker.getActiveDeviceIds();
        const connectedDevices = this.deviceTracker.getConnectedDevices();
        const activeCount = connectedDevices.filter(d => d.status === 'active').length;
        
        await this.cloudConnection.post(
          `/api/service-hosts/${this.config.serviceHostId}/heartbeat`,
          {
            status: 'online',
            connectedWorkstations: activeCount,
            connectedDeviceIds,
            activeChecks: 0,
            pendingTransactions: 0,
          }
        );
        console.log(`[CAPS] Cloud heartbeat sent — ${connectedDeviceIds.length} connected devices: [${connectedDeviceIds.join(', ')}]`);
      } catch (e) {
        console.warn('[CAPS] Cloud heartbeat failed:', (e as Error).message);
      }
    };

    sendHeartbeat();
    this.cloudHeartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    console.log(`Cloud heartbeat started (every ${HEARTBEAT_INTERVAL / 1000}s)`);
  }

  private shutdown() {
    console.log('\nShutting down Service Host...');
    if (this.cloudHeartbeatInterval) {
      clearInterval(this.cloudHeartbeatInterval);
    }
    this.deviceTracker.stop();
    this.calSync.stop();
    this.transactionSync.stopWorker();
    this.cloudConnection.disconnect();
    this.wss.close();
    this.server.close(() => {
      this.db.close();
      console.log('Service Host stopped');
      process.exit(0);
    });
  }
}

// Subcommand: verify-schema
if (process.argv[2] === 'verify-schema') {
  const isTsx = import.meta.url.endsWith('.ts');
  const verifyModulePath = isTsx ? './verify-schema.ts' : './verify-schema.js';
  import(verifyModulePath).then(({ runVerification }) => {
    let dataDir = defaultConfig.dataDir;
    const args = process.argv.slice(3);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--data-dir' && args[i + 1]) {
        dataDir = args[i + 1];
      }
    }
    runVerification(dataDir);
    process.exit(0);
  }).catch((e) => {
    console.error('Failed to run schema verification:', e);
    process.exit(1);
  });
} else {
  // Main
  async function main() {
    const fileConfig = loadConfigFile();
    const argConfig = parseArgs();
    
    const config: Config = {
      ...defaultConfig,
      ...fileConfig,
      ...argConfig,
    };
    
    if (!config.cloudUrl) {
      console.error('Error: Cloud URL is required');
      console.error('Usage: node dist/index.js --cloud <url> --service-host-id <id> --token <token>');
      process.exit(1);
    }
    
    if (!config.serviceHostId) {
      console.error('Error: Service Host ID is required');
      console.error('Usage: node dist/index.js --cloud <url> --service-host-id <id> --token <token>');
      process.exit(1);
    }
    
    if (!config.token) {
      console.error('Error: Service Host token is required. Exiting with code 2 (token not available yet).');
      process.exit(2);
    }
    
    const serviceHost = new ServiceHost(config);
    await serviceHost.start();
  }

  main().catch((e) => {
    console.error('Failed to start Service Host:', e);
    process.exit(1);
  });
}

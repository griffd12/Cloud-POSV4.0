const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { printLogger } = require('./logger.cjs');

class PrintAgentService {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'https://localhost:5000';
    this.agentId = options.agentId || null;
    this.agentToken = options.agentToken || null;
    this.configDir = options.configDir || path.join(require('os').homedir(), '.cloudpos');
    this.dataDir = options.dataDir || path.join(this.configDir, 'data');

    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000;
    this.reconnectTimer = null;
    this.heartbeatInterval = null;
    this.heartbeatMs = options.heartbeatMs || 30000;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.isRunning = false;

    this.printerMap = new Map();
    this.jobQueue = [];
    this.activeJobs = new Map();
    this.offlineDb = options.offlineDb || null;
    this.serialPortQueues = new Map();

    this.listeners = {
      status: [],
      jobCompleted: [],
      jobFailed: [],
      error: [],
    };

    this.ensureDirectories();
    this.loadPrinterConfig();
  }

  ensureDirectories() {
    [this.configDir, this.dataDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { printLogger.error('Event', 'PrintAgent event error', e.message); }
      });
    }
  }

  loadPrinterConfig() {
    try {
      const configPath = path.join(this.configDir, 'printers.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (Array.isArray(config)) {
          config.forEach(p => {
            this.printerMap.set(p.printerId || p.name, {
              name: p.name,
              ipAddress: p.ipAddress,
              port: p.port || 9100,
              printerId: p.printerId,
              type: p.type || 'network',
              connectionType: p.connectionType || p.type || 'network',
              comPort: p.comPort || null,
              baudRate: p.baudRate || 9600,
            });
          });
        }
      }
    } catch (e) {
      printLogger.error('Config', 'Failed to load printer config', e.message);
    }
  }

  savePrinterConfig() {
    try {
      const configPath = path.join(this.configDir, 'printers.json');
      const printers = Array.from(this.printerMap.values());
      fs.writeFileSync(configPath, JSON.stringify(printers, null, 2));
    } catch (e) {
      printLogger.error('Config', 'Failed to save printer config', e.message);
    }
  }

  addPrinter(config) {
    const key = config.printerId || config.name;
    this.printerMap.set(key, {
      name: config.name,
      ipAddress: config.ipAddress,
      port: config.port || 9100,
      printerId: config.printerId,
      type: config.type || 'network',
      connectionType: config.connectionType || config.type || 'network',
      comPort: config.comPort || null,
      baudRate: config.baudRate || 9600,
      windowsPrinterName: config.windowsPrinterName || null,
    });
    this.savePrinterConfig();
    printLogger.info('Config', `Printer added: ${config.name}`, { connectionType: config.connectionType || config.type, ip: config.ipAddress, windowsPrinterName: config.windowsPrinterName });
  }

  removePrinter(key) {
    this.printerMap.delete(key);
    this.savePrinterConfig();
  }

  getPrinters() {
    return Array.from(this.printerMap.values());
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    printLogger.info('Service', 'Starting print agent service');
    this.connect();
    this.processLocalQueue();
  }

  stop() {
    this.isRunning = false;
    this.isConnected = false;
    this.isAuthenticated = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

    this.emit('status', { connected: false, authenticated: false, reason: 'stopped' });
    printLogger.info('Service', 'Print agent service stopped');
  }

  async connect() {
    if (!this.isRunning) return;

    try {
      const WebSocket = require('ws');
      const wsUrl = this.serverUrl
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        .replace(/\/$/, '') + '/ws/print-agents';

      printLogger.info('Connect', `Connecting to ${wsUrl}`);

      this.ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,
        handshakeTimeout: 10000,
      });

      this.ws.on('open', () => {
        printLogger.info('Connect', 'WebSocket connected, authenticating');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        const authMsg = { type: 'HELLO' };
        if (this.agentToken) {
          authMsg.token = this.agentToken;
        }
        if (this.agentId) {
          authMsg.agentId = this.agentId;
        }
        this.ws.send(JSON.stringify(authMsg));
      });

      this.ws.on('message', (rawData) => {
        this.handleMessage(rawData);
      });

      this.ws.on('close', (code, reason) => {
        printLogger.info('Connect', `Disconnected (code: ${code})`);
        this.isConnected = false;
        this.isAuthenticated = false;
        this.stopHeartbeat();
        this.emit('status', { connected: false, authenticated: false, reason: 'disconnected' });
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        printLogger.error('Connect', `WebSocket error: ${err.message}`);
        this.emit('error', { message: err.message });
      });

    } catch (e) {
      printLogger.error('Connect', `Connection failed: ${e.message}`);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (!this.isRunning) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    printLogger.info('Connect', `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.isAuthenticated) {
        try {
          this.ws.send(JSON.stringify({
            type: 'HEARTBEAT',
            timestamp: new Date().toISOString(),
            printers: this.getPrinters().map(p => ({
              name: p.name,
              ipAddress: p.ipAddress,
              port: p.port,
            })),
            pendingLocalJobs: this.jobQueue.length,
          }));
        } catch (e) {
          printLogger.error('Heartbeat', `Heartbeat failed: ${e.message}`);
        }
      }
    }, this.heartbeatMs);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  handleMessage(rawData) {
    try {
      const msg = JSON.parse(rawData.toString());

      switch (msg.type) {
        case 'AUTH_OK':
          this.isAuthenticated = true;
          this.agentId = msg.agentId;
          printLogger.info('Auth', `Authenticated as: ${msg.agentName} (${msg.agentId})`);
          this.startHeartbeat();
          this.emit('status', {
            connected: true,
            authenticated: true,
            agentId: msg.agentId,
            agentName: msg.agentName,
            propertyId: msg.propertyId,
          });
          this.syncLocalQueueToCloud();
          break;

        case 'AUTH_FAIL':
          printLogger.error('Auth', `Authentication failed: ${msg.message}`);
          this.isAuthenticated = false;
          this.emit('status', { connected: true, authenticated: false, reason: msg.message });
          break;

        case 'JOB':
          this.handlePrintJob(msg);
          break;

        case 'DRAWER_KICK':
          this.handleDrawerKick(msg);
          break;

        case 'DISCOVER_PRINTERS':
          this.handleDiscoverPrinters(msg);
          break;

        case 'PONG':
        case 'HEARTBEAT_ACK':
          break;

        default:
          printLogger.warn('Message', `Unknown message type: ${msg.type}`);
      }
    } catch (e) {
      printLogger.error('Message', 'Failed to parse message', e.message);
    }
  }

  async handleDiscoverPrinters(msg) {
    const requestId = msg.requestId || `discover_${Date.now()}`;
    printLogger.info('Discovery', `Printer discovery requested (${requestId})`);

    try {
      const printers = await this.enumerateWindowsPrinters();
      const response = {
        type: 'PRINTER_DISCOVERY_RESULT',
        requestId,
        agentId: this.agentId,
        printers: printers.map(p => ({
          name: p.Name,
          port: p.Port,
          driver: p.Driver,
          status: p.Status,
        })),
      };
      this.ws.send(JSON.stringify(response));
      printLogger.info('Discovery', `Sent ${printers.length} printers for request ${requestId}`);
    } catch (err) {
      const response = {
        type: 'PRINTER_DISCOVERY_RESULT',
        requestId,
        agentId: this.agentId,
        printers: [],
        error: err.message,
      };
      try { this.ws.send(JSON.stringify(response)); } catch (e) {}
      printLogger.error('Discovery', `Discovery failed: ${err.message}`);
    }
  }

  async handlePrintJob(msg) {
    const jobId = msg.jobId;
    const printerIp = msg.printerIp;
    const printerPort = msg.printerPort || 9100;
    const printData = msg.data;
    const printerId = msg.printerId;
    const connectionType = msg.connectionType || 'network';
    const comPort = msg.comPort;
    const baudRate = msg.baudRate || 9600;
    const windowsPrinterName = msg.windowsPrinterName;

    printLogger.info('Job', `Received job ${jobId}`, { printer: windowsPrinterName || printerIp || comPort || printerId || 'default', connectionType });

    try {
      this.ws.send(JSON.stringify({ type: 'ACK', jobId }));
    } catch (e) {}

    // Windows Print Spooler path — for USB printers on Windows
    if (connectionType === 'windows_printer' && windowsPrinterName) {
      try {
        const buffer = Buffer.from(printData, 'base64');
        printLogger.info('Job', `Job ${jobId} sending ${buffer.length} bytes to Windows printer`, { printer: windowsPrinterName });
        await this.sendToWindowsPrinter(windowsPrinterName, buffer);
        this.sendJobResult(jobId, true);
        this.emit('jobCompleted', { jobId, printer: windowsPrinterName });
        printLogger.info('Job', `Job ${jobId} printed successfully via Windows spooler`, { printer: windowsPrinterName });
      } catch (err) {
        this.sendJobResult(jobId, false, err.message);
        this.emit('jobFailed', { jobId, printer: windowsPrinterName, error: err.message });
        printLogger.error('Job', `Job ${jobId} Windows printer failed: ${err.message}`);
      }
      return;
    }

    if ((connectionType === 'serial' || connectionType === 'usb') && comPort) {
      try {
        const buffer = Buffer.from(printData, 'base64');
        printLogger.info('Job', `Job ${jobId} sending ${buffer.length} bytes to serial`, { port: comPort, baudRate });
        await this.enqueueSerialJob(comPort, baudRate, buffer);
        this.sendJobResult(jobId, true);
        this.emit('jobCompleted', { jobId, printer: comPort });
        printLogger.info('Job', `Job ${jobId} printed successfully via serial`, { port: comPort, baudRate });
      } catch (err) {
        this.sendJobResult(jobId, false, err.message);
        this.emit('jobFailed', { jobId, printer: comPort, error: err.message });
        printLogger.error('Job', `Job ${jobId} serial print failed: ${err.message}`);
      }
      return;
    }

    let targetIp = printerIp;
    let targetPort = printerPort;

    if (!targetIp && printerId) {
      const printer = this.printerMap.get(printerId);
      if (printer) {
        // Check if mapped printer uses Windows spooler
        if (printer.connectionType === 'windows_printer' && printer.windowsPrinterName) {
          try {
            const buffer = Buffer.from(printData, 'base64');
            await this.sendToWindowsPrinter(printer.windowsPrinterName, buffer);
            this.sendJobResult(jobId, true);
            this.emit('jobCompleted', { jobId, printer: printer.windowsPrinterName });
            printLogger.info('Job', `Job ${jobId} printed via Windows spooler (mapped)`, { printer: printer.windowsPrinterName });
          } catch (err) {
            this.sendJobResult(jobId, false, err.message);
            this.emit('jobFailed', { jobId, printer: printer.windowsPrinterName, error: err.message });
            printLogger.error('Job', `Job ${jobId} Windows printer failed: ${err.message}`);
          }
          return;
        }
        if ((printer.connectionType === 'serial' || printer.connectionType === 'usb') && printer.comPort) {
          try {
            const buffer = Buffer.from(printData, 'base64');
            await this.enqueueSerialJob(printer.comPort, printer.baudRate || 9600, buffer);
            this.sendJobResult(jobId, true);
            this.emit('jobCompleted', { jobId, printer: printer.comPort });
            printLogger.info('Job', `Job ${jobId} printed via serial (mapped)`, { port: printer.comPort });
          } catch (err) {
            this.sendJobResult(jobId, false, err.message);
            this.emit('jobFailed', { jobId, printer: printer.comPort, error: err.message });
            printLogger.error('Job', `Job ${jobId} serial print failed: ${err.message}`);
          }
          return;
        }
        targetIp = printer.ipAddress;
        targetPort = printer.port || 9100;
      }
    }

    if (!targetIp) {
      const firstPrinter = this.printerMap.values().next().value;
      if (firstPrinter) {
        targetIp = firstPrinter.ipAddress;
        targetPort = firstPrinter.port || 9100;
      }
    }

    if (!targetIp) {
      printLogger.error('Job', `No printer IP for job ${jobId}`);
      this.sendJobResult(jobId, false, 'No printer configured');
      return;
    }

    try {
      const buffer = Buffer.from(printData, 'base64');
      await this.sendToPrinter(targetIp, targetPort, buffer);
      this.sendJobResult(jobId, true);
      this.emit('jobCompleted', { jobId, printer: targetIp });
      printLogger.info('Job', `Job ${jobId} printed successfully`, { printer: `${targetIp}:${targetPort}` });
    } catch (err) {
      this.sendJobResult(jobId, false, err.message);
      this.emit('jobFailed', { jobId, printer: targetIp, error: err.message });
      printLogger.error('Job', `Job ${jobId} failed: ${err.message}`);
    }
  }

  sendJobResult(jobId, success, error) {
    if (this.ws && this.isAuthenticated) {
      try {
        this.ws.send(JSON.stringify({
          type: success ? 'DONE' : 'ERROR',
          jobId,
          ...(error ? { error } : {}),
        }));
      } catch (e) {
        printLogger.error('Job', 'Failed to send job result', e.message);
      }
    }
  }

  buildDrawerKickCommand(pin, pulseDurationMs) {
    const duration = pulseDurationMs || 200;
    const pulseOn = Math.max(1, Math.min(255, Math.round(duration / 2)));
    const pulseOff = pulseOn;
    const pinByte = pin === 'pin5' ? 0x01 : 0x00;

    printLogger.info('DrawerKick', `Building ESC/POS command: pin=${pin} (byte=0x${pinByte.toString(16).padStart(2,'0')}), pulseOn=${pulseOn}, pulseOff=${pulseOff}, duration=${duration}ms`);

    return Buffer.from([0x1B, 0x70, pinByte, pulseOn, pulseOff]);
  }

  async handleDrawerKick(msg) {
    const kickId = msg.kickId || `kick_${Date.now()}`;
    const printerIp = msg.printerIp;
    const printerPort = msg.printerPort || 9100;
    const printerId = msg.printerId;
    const pin = msg.pin || 'pin2';
    const pulseDuration = msg.pulseDuration || 200;
    const connectionType = msg.connectionType || 'network';
    const comPort = msg.comPort;
    const baudRate = msg.baudRate || 9600;
    const windowsPrinterName = msg.windowsPrinterName;

    printLogger.info('DrawerKick', `Received drawer kick ${kickId}`, { printer: windowsPrinterName || printerIp || comPort || printerId || 'default', pin, connectionType });

    const kickCommand = this.buildDrawerKickCommand(pin, pulseDuration);

    // Windows Print Spooler path for drawer kick
    if (connectionType === 'windows_printer' && windowsPrinterName) {
      try {
        await this.sendToWindowsPrinter(windowsPrinterName, kickCommand);
        this.sendKickResult(kickId, true);
        printLogger.info('DrawerKick', `Drawer kick ${kickId} sent via Windows printer`, { printer: windowsPrinterName, pin });
      } catch (err) {
        this.sendKickResult(kickId, false, err.message);
        printLogger.error('DrawerKick', `Drawer kick ${kickId} Windows printer failed: ${err.message}`);
      }
      return;
    }

    if ((connectionType === 'serial' || connectionType === 'usb') && comPort) {
      try {
        await this.enqueueSerialJob(comPort, baudRate, kickCommand);
        this.sendKickResult(kickId, true);
        printLogger.info('DrawerKick', `Drawer kick ${kickId} sent via serial`, { port: comPort, pin });
      } catch (err) {
        this.sendKickResult(kickId, false, err.message);
        printLogger.error('DrawerKick', `Drawer kick ${kickId} serial failed: ${err.message}`);
      }
      return;
    }

    let targetIp = printerIp;
    let targetPort = printerPort;

    if (!targetIp && printerId) {
      const printer = this.printerMap.get(printerId);
      if (printer) {
        if ((printer.connectionType === 'serial' || printer.connectionType === 'usb') && printer.comPort) {
          try {
            await this.enqueueSerialJob(printer.comPort, printer.baudRate || 9600, kickCommand);
            this.sendKickResult(kickId, true);
            printLogger.info('DrawerKick', `Drawer kick ${kickId} sent via serial (mapped)`, { port: printer.comPort, pin });
          } catch (err) {
            this.sendKickResult(kickId, false, err.message);
            printLogger.error('DrawerKick', `Drawer kick ${kickId} serial failed: ${err.message}`);
          }
          return;
        }
        targetIp = printer.ipAddress;
        targetPort = printer.port || 9100;
      }
    }

    if (!targetIp) {
      const firstPrinter = this.printerMap.values().next().value;
      if (firstPrinter) {
        targetIp = firstPrinter.ipAddress;
        targetPort = firstPrinter.port || 9100;
      }
    }

    if (!targetIp) {
      printLogger.error('DrawerKick', `No printer IP for kick ${kickId}`);
      this.sendKickResult(kickId, false, 'No printer configured for cash drawer');
      return;
    }

    try {
      await this.sendToPrinter(targetIp, targetPort, kickCommand);
      this.sendKickResult(kickId, true);
      printLogger.info('DrawerKick', `Drawer kick ${kickId} sent successfully`, { printer: `${targetIp}:${targetPort}`, pin });
    } catch (err) {
      this.sendKickResult(kickId, false, err.message);
      printLogger.error('DrawerKick', `Drawer kick ${kickId} failed: ${err.message}`);
    }
  }

  sendKickResult(kickId, success, error) {
    if (this.ws && this.isAuthenticated) {
      try {
        this.ws.send(JSON.stringify({
          type: success ? 'KICK_DONE' : 'KICK_ERROR',
          kickId,
          ...(error ? { error } : {}),
        }));
      } catch (e) {
        printLogger.error('DrawerKick', 'Failed to send kick result', e.message);
      }
    }
  }

  async kickDrawerLocal(options = {}) {
    const pin = options.pin || 'pin2';
    const pulseDuration = options.pulseDuration || 200;
    const printerId = options.printerId;
    const kickCommand = this.buildDrawerKickCommand(pin, pulseDuration);

    if (printerId) {
      const printer = this.printerMap.get(printerId);
      if (printer) {
        if (printer.connectionType === 'windows_printer' && printer.windowsPrinterName) {
          await this.sendToWindowsPrinter(printer.windowsPrinterName, kickCommand);
          printLogger.info('DrawerKick', 'Local drawer kick sent via Windows printer', { printer: printer.windowsPrinterName, pin });
          return { success: true, printer: printer.windowsPrinterName };
        }
        if ((printer.connectionType === 'serial' || printer.connectionType === 'usb') && printer.comPort) {
          await this.enqueueSerialJob(printer.comPort, printer.baudRate || 9600, kickCommand);
          printLogger.info('DrawerKick', 'Local drawer kick sent via serial', { port: printer.comPort, pin });
          return { success: true, printer: printer.comPort };
        }
        if (printer.ipAddress) {
          await this.sendToPrinter(printer.ipAddress, printer.port || 9100, kickCommand);
          printLogger.info('DrawerKick', 'Local drawer kick sent via network', { printer: `${printer.ipAddress}:${printer.port || 9100}`, pin });
          return { success: true, printer: printer.ipAddress };
        }
      }
    }

    if (options.windowsPrinterName) {
      await this.sendToWindowsPrinter(options.windowsPrinterName, kickCommand);
      printLogger.info('DrawerKick', 'Local drawer kick sent via Windows printer (direct)', { printer: options.windowsPrinterName, pin });
      return { success: true, printer: options.windowsPrinterName };
    }

    if (options.comPort) {
      await this.enqueueSerialJob(options.comPort, options.baudRate || 9600, kickCommand);
      printLogger.info('DrawerKick', 'Local drawer kick sent via serial (direct)', { port: options.comPort, pin });
      return { success: true, printer: options.comPort };
    }

    let targetIp = options.printerIp;
    let targetPort = options.printerPort || 9100;

    if (!targetIp) {
      const firstPrinter = this.printerMap.values().next().value;
      if (firstPrinter) {
        if (firstPrinter.connectionType === 'windows_printer' && firstPrinter.windowsPrinterName) {
          await this.sendToWindowsPrinter(firstPrinter.windowsPrinterName, kickCommand);
          printLogger.info('DrawerKick', 'Local drawer kick sent via Windows printer (fallback)', { printer: firstPrinter.windowsPrinterName, pin });
          return { success: true, printer: firstPrinter.windowsPrinterName };
        }
        if ((firstPrinter.connectionType === 'serial' || firstPrinter.connectionType === 'usb') && firstPrinter.comPort) {
          await this.enqueueSerialJob(firstPrinter.comPort, firstPrinter.baudRate || 9600, kickCommand);
          printLogger.info('DrawerKick', 'Local drawer kick sent via serial (fallback)', { port: firstPrinter.comPort, pin });
          return { success: true, printer: firstPrinter.comPort };
        }
        targetIp = firstPrinter.ipAddress;
        targetPort = firstPrinter.port || 9100;
      }
    }

    if (!targetIp) {
      throw new Error('No printer configured for cash drawer kick');
    }

    await this.sendToPrinter(targetIp, targetPort, kickCommand);
    printLogger.info('DrawerKick', 'Local drawer kick sent via network', { printer: `${targetIp}:${targetPort}`, pin });
    return { success: true, printer: targetIp };
  }

  sendToPrinter(ipAddress, port, data) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Printer timeout connecting to ${ipAddress}:${port}`));
      }, 10000);

      socket.connect(port, ipAddress, () => {
        socket.write(data, (err) => {
          clearTimeout(timeout);
          if (err) {
            cleanup();
            reject(err);
          } else {
            socket.end(() => {
              cleanup();
              resolve({ success: true });
            });
          }
        });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        cleanup();
        reject(err);
      });
    });
  }

  sendToWindowsPrinter(printerName, data) {
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      const os = require('os');
      const tmpFile = path.join(os.tmpdir(), `cloudpos_print_${Date.now()}.bin`);

      try {
        fs.writeFileSync(tmpFile, data);
        printLogger.info('WindowsPrint', `Wrote ${data.length} bytes to temp file ${tmpFile}`);

        const psScript = `
          $ErrorActionPreference = 'Stop'
          try {
            $printerName = '${printerName.replace(/'/g, "''")}'

            Add-Type -TypeDefinition @'
            using System;
            using System.Runtime.InteropServices;

            public class RawPrinterHelper {
              [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
              public struct DOCINFOW {
                [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
                [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
                [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
              }

              [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
              public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

              [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
              public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);

              [DllImport("winspool.drv", SetLastError = true)]
              public static extern bool StartPagePrinter(IntPtr hPrinter);

              [DllImport("winspool.drv", SetLastError = true)]
              public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

              [DllImport("winspool.drv", SetLastError = true)]
              public static extern bool EndPagePrinter(IntPtr hPrinter);

              [DllImport("winspool.drv", SetLastError = true)]
              public static extern bool EndDocPrinter(IntPtr hPrinter);

              [DllImport("winspool.drv", SetLastError = true)]
              public static extern bool ClosePrinter(IntPtr hPrinter);

              public static bool SendBytesToPrinter(string printerName, byte[] data) {
                IntPtr hPrinter;
                if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
                  throw new Exception("OpenPrinter failed for: " + printerName + " (error " + Marshal.GetLastWin32Error() + ")");
                }
                try {
                  DOCINFOW di = new DOCINFOW();
                  di.pDocName = "CloudPOS RAW Document";
                  di.pDataType = "RAW";
                  di.pOutputFile = null;
                  if (!StartDocPrinter(hPrinter, 1, ref di)) {
                    throw new Exception("StartDocPrinter failed (error " + Marshal.GetLastWin32Error() + ")");
                  }
                  try {
                    if (!StartPagePrinter(hPrinter)) {
                      throw new Exception("StartPagePrinter failed (error " + Marshal.GetLastWin32Error() + ")");
                    }
                    IntPtr pBytes = Marshal.AllocHGlobal(data.Length);
                    try {
                      Marshal.Copy(data, 0, pBytes, data.Length);
                      int written;
                      if (!WritePrinter(hPrinter, pBytes, data.Length, out written)) {
                        throw new Exception("WritePrinter failed (error " + Marshal.GetLastWin32Error() + ")");
                      }
                    } finally {
                      Marshal.FreeHGlobal(pBytes);
                    }
                    EndPagePrinter(hPrinter);
                  } finally {
                    EndDocPrinter(hPrinter);
                  }
                } finally {
                  ClosePrinter(hPrinter);
                }
                return true;
              }
            }
'@

            $rawData = [System.IO.File]::ReadAllBytes('${tmpFile.replace(/\\/g, '\\\\')}')
            Write-Host "Sending $($rawData.Length) bytes to printer '$printerName' via Windows Print Spooler"
            [RawPrinterHelper]::SendBytesToPrinter($printerName, $rawData)
            Write-Host "SUCCESS"
          } catch {
            Write-Error $_.Exception.Message
            exit 1
          }
        `;

        execFile('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-Command', psScript,
        ], { timeout: 15000 }, (error, stdout, stderr) => {
          try { fs.unlinkSync(tmpFile); } catch (e) {}

          if (error) {
            const errMsg = stderr?.trim() || error.message || 'Unknown PowerShell error';
            printLogger.error('WindowsPrint', `PowerShell failed: ${errMsg}`);
            printLogger.error('WindowsPrint', `stdout: ${stdout?.trim()}`);
            reject(new Error(`Windows printer "${printerName}" failed: ${errMsg}`));
            return;
          }

          const output = stdout?.trim() || '';
          printLogger.info('WindowsPrint', `PowerShell output: ${output}`);

          if (output.includes('SUCCESS')) {
            resolve({ success: true });
          } else {
            reject(new Error(`Windows printer "${printerName}" - unexpected output: ${output}`));
          }
        });
      } catch (err) {
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        reject(new Error(`Failed to prepare print data: ${err.message}`));
      }
    });
  }

  async enumerateWindowsPrinters() {
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      const psScript = `
        Get-WmiObject -Query "SELECT Name, PortName, DriverName, PrinterStatus FROM Win32_Printer" |
          ForEach-Object {
            [PSCustomObject]@{
              Name = $_.Name
              Port = $_.PortName
              Driver = $_.DriverName
              Status = $_.PrinterStatus
            }
          } | ConvertTo-Json -Compress
      `;

      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-Command', psScript,
      ], { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          printLogger.error('WindowsPrint', `Enumerate failed: ${stderr || error.message}`);
          reject(new Error(`Failed to enumerate printers: ${stderr || error.message}`));
          return;
        }

        try {
          const output = stdout?.trim();
          if (!output) {
            resolve([]);
            return;
          }
          let printers = JSON.parse(output);
          if (!Array.isArray(printers)) printers = [printers];
          printLogger.info('WindowsPrint', `Found ${printers.length} Windows printers`);
          resolve(printers);
        } catch (parseErr) {
          printLogger.error('WindowsPrint', `Parse error: ${parseErr.message}`);
          resolve([]);
        }
      });
    });
  }

  enqueueSerialJob(comPort, baudRate, data) {
    return new Promise((resolve, reject) => {
      const portKey = comPort.toUpperCase();
      if (!this.serialPortQueues.has(portKey)) {
        this.serialPortQueues.set(portKey, { busy: false, queue: [] });
      }
      const q = this.serialPortQueues.get(portKey);
      q.queue.push({ comPort, baudRate, data, resolve, reject });
      if (!q.busy) {
        this._drainSerialQueue(portKey);
      }
    });
  }

  async _drainSerialQueue(portKey) {
    const q = this.serialPortQueues.get(portKey);
    if (!q || q.busy || q.queue.length === 0) return;
    q.busy = true;
    let first = true;
    while (q.queue.length > 0) {
      if (!first) {
        await new Promise(r => setTimeout(r, 150));
      }
      first = false;
      const job = q.queue.shift();
      try {
        const result = await this.sendToSerialPrinter(job.comPort, job.baudRate, job.data);
        job.resolve(result);
      } catch (err) {
        job.reject(err);
      }
    }
    q.busy = false;
  }

  sendToSerialPrinter(comPort, baudRate, data, retries = 2) {
    let settled = false;
    return new Promise((resolve, reject) => {
      const safeResolve = (val) => { if (!settled) { settled = true; resolve(val); } };
      const safeReject = (err) => { if (!settled) { settled = true; reject(err); } };

      const attempt = (attemptsLeft) => {
        if (settled) return;
        try {
          const { SerialPort } = require('serialport');
          const port = new SerialPort({
            path: comPort,
            baudRate: baudRate || 9600,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            rtscts: false,
            hupcl: false,
            autoOpen: false,
          });

          let portOpened = false;
          const timeout = setTimeout(() => {
            port.close(() => {});
            if (attemptsLeft > 0 && !settled) {
              printLogger.info('Serial', `Port ${comPort} timed out, retrying (${attemptsLeft} left)`);
              setTimeout(() => attempt(attemptsLeft - 1), 500);
            } else {
              safeReject(new Error(`Serial printer timeout on ${comPort}`));
            }
          }, 10000);

          port.open((err) => {
            if (settled) { clearTimeout(timeout); port.close(() => {}); return; }
            if (err) {
              clearTimeout(timeout);
              printLogger.error('Serial', `Port ${comPort} open error: ${err.message}`);
              if (attemptsLeft > 0 && (err.message.includes('Access denied') || err.message.includes('locked') || err.message.includes('busy') || err.message.includes('in use'))) {
                printLogger.info('Serial', `Port ${comPort} busy, retrying in 500ms (${attemptsLeft} left)`);
                setTimeout(() => attempt(attemptsLeft - 1), 500);
              } else {
                safeReject(new Error(`Failed to open ${comPort}: ${err.message}`));
              }
              return;
            }

            portOpened = true;
            printLogger.info('Serial', `Port ${comPort} opened, setting DTR/RTS high`);
            port.set({ dtr: true, rts: true }, (setErr) => {
              if (setErr) {
                printLogger.warn('Serial', `Port ${comPort} set signals warning: ${setErr.message}`);
              }

              setTimeout(() => {
                printLogger.info('Serial', `Writing ${data.length} bytes to ${comPort}`);
                port.write(data, (writeErr) => {
                  if (writeErr) {
                    clearTimeout(timeout);
                    printLogger.error('Serial', `Port ${comPort} write error: ${writeErr.message}`);
                    port.close(() => {});
                    safeReject(writeErr);
                    return;
                  }

                  port.drain((drainErr) => {
                    clearTimeout(timeout);
                    printLogger.info('Serial', `Port ${comPort} drain complete, closing`);
                    setTimeout(() => {
                      port.close(() => {});
                      if (drainErr) {
                        safeReject(drainErr);
                      } else {
                        safeResolve({ success: true });
                      }
                    }, 100);
                  });
                });
              }, 50);
            });
          });

          port.on('error', (err) => {
            if (settled || portOpened) return;
            clearTimeout(timeout);
            port.close(() => {});
            if (attemptsLeft > 0) {
              printLogger.info('Serial', `Port ${comPort} error, retrying in 500ms (${attemptsLeft} left): ${err.message}`);
              setTimeout(() => attempt(attemptsLeft - 1), 500);
            } else {
              safeReject(err);
            }
          });
        } catch (err) {
          if (err.code === 'MODULE_NOT_FOUND') {
            safeReject(new Error(`Serial port support not available - 'serialport' module not installed. Install with: npm install serialport`));
          } else {
            safeReject(err);
          }
        }
      };
      attempt(retries);
    });
  }

  queueLocalPrintJob(job) {
    const localJob = {
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      ...job,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    this.jobQueue.push(localJob);
    this.saveLocalQueue();
    printLogger.info('LocalQueue', `Queued local job ${localJob.id}`);

    this.processNextLocalJob();
    return localJob.id;
  }

  async processNextLocalJob() {
    const pending = this.jobQueue.filter(j => j.status === 'pending');
    if (pending.length === 0) return;

    const job = pending[0];
    job.status = 'printing';

    let targetIp = job.printerIp;
    let targetPort = job.printerPort || 9100;

    if (!targetIp && job.printerId) {
      const printer = this.printerMap.get(job.printerId);
      if (printer) {
        targetIp = printer.ipAddress;
        targetPort = printer.port || 9100;
      }
    }

    if (!targetIp) {
      const firstPrinter = this.printerMap.values().next().value;
      if (firstPrinter) {
        targetIp = firstPrinter.ipAddress;
        targetPort = firstPrinter.port || 9100;
      }
    }

    if (!targetIp) {
      job.status = 'failed';
      job.error = 'No printer configured';
      this.saveLocalQueue();
      return;
    }

    try {
      const buffer = Buffer.isBuffer(job.data) ? job.data : Buffer.from(job.data, 'base64');
      await this.sendToPrinter(targetIp, targetPort, buffer);
      job.status = 'completed';
      job.printedAt = new Date().toISOString();
      printLogger.info('LocalQueue', `Local job ${job.id} printed`, { printer: targetIp });
    } catch (err) {
      job.retries = (job.retries || 0) + 1;
      if (job.retries >= 3) {
        job.status = 'failed';
        job.error = err.message;
      } else {
        job.status = 'pending';
        job.error = err.message;
      }
      printLogger.error('LocalQueue', `Local job ${job.id} failed: ${err.message}`);
    }

    this.saveLocalQueue();

    if (this.jobQueue.some(j => j.status === 'pending')) {
      setTimeout(() => this.processNextLocalJob(), 2000);
    }
  }

  processLocalQueue() {
    this.loadLocalQueue();
    this.processNextLocalJob();
  }

  async syncLocalQueueToCloud() {
    if (!this.isAuthenticated) return;

    const completedLocal = this.jobQueue.filter(j => j.status === 'completed' && j.cloudJobId);
    for (const job of completedLocal) {
      try {
        this.ws.send(JSON.stringify({ type: 'DONE', jobId: job.cloudJobId }));
        this.jobQueue = this.jobQueue.filter(j => j.id !== job.id);
      } catch (e) {}
    }
    this.saveLocalQueue();
  }

  saveLocalQueue() {
    try {
      const queuePath = path.join(this.dataDir, 'print_queue.json');
      const activeJobs = this.jobQueue.filter(j => j.status !== 'completed' || j.cloudJobId);
      fs.writeFileSync(queuePath, JSON.stringify(activeJobs, null, 2));
    } catch (e) {
      printLogger.error('LocalQueue', 'Failed to save local queue', e.message);
    }
  }

  loadLocalQueue() {
    try {
      const queuePath = path.join(this.dataDir, 'print_queue.json');
      if (fs.existsSync(queuePath)) {
        this.jobQueue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      }
    } catch (e) {
      printLogger.error('LocalQueue', 'Failed to load local queue', e.message);
      this.jobQueue = [];
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      isAuthenticated: this.isAuthenticated,
      agentId: this.agentId,
      printers: this.getPrinters(),
      localQueueSize: this.jobQueue.filter(j => j.status === 'pending').length,
      completedJobs: this.jobQueue.filter(j => j.status === 'completed').length,
      failedJobs: this.jobQueue.filter(j => j.status === 'failed').length,
    };
  }
}

module.exports = { PrintAgentService };

#!/usr/bin/env node

/**
 * Cloud POS Print Agent
 * 
 * This agent runs on a local computer at the property and:
 * 1. Connects to the cloud POS system via WebSocket
 * 2. Receives print jobs from the cloud
 * 3. Forwards them to local network printers
 * 
 * Usage:
 *   node print-agent.js --server <wss://your-pos.replit.app> --token <agent-token>
 * 
 * Or create a config.json file with:
 *   { "server": "wss://your-pos.replit.app", "token": "your-agent-token" }
 */

const WebSocket = require('ws');
const net = require('net');
const fs = require('fs');
const path = require('path');

// Configuration
let config = {
  server: '',
  token: '',
  reconnectInterval: 5000,
  maxReconnectInterval: 60000,
  heartbeatInterval: 30000,
  defaultPrinterPort: 9100,
  printTimeout: 10000,
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server' && args[i + 1]) {
      config.server = args[i + 1];
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      config.token = args[i + 1];
      i++;
    } else if (args[i] === '--config' && args[i + 1]) {
      try {
        const configFile = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'));
        config = { ...config, ...configFile };
      } catch (e) {
        console.error('Failed to read config file:', e.message);
      }
      i++;
    }
  }
}

// Try to load config from file if exists
function loadConfigFile() {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const configFile = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...configFile };
      console.log('Loaded configuration from config.json');
    } catch (e) {
      console.error('Failed to read config.json:', e.message);
    }
  }
}

// Print to network printer via TCP socket
function printToNetworkPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let connected = false;
    
    const timeout = setTimeout(() => {
      if (!connected) {
        socket.destroy();
        reject(new Error(`Connection timeout to ${ip}:${port}`));
      }
    }, config.printTimeout);
    
    socket.connect(port, ip, () => {
      connected = true;
      clearTimeout(timeout);
      console.log(`Connected to printer at ${ip}:${port}`);
      
      // Decode base64 data and send
      const buffer = Buffer.from(data, 'base64');
      socket.write(buffer, (err) => {
        if (err) {
          socket.destroy();
          reject(new Error(`Write error: ${err.message}`));
        } else {
          // Give printer time to process
          setTimeout(() => {
            socket.end();
            resolve();
          }, 500);
        }
      });
    });
    
    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Socket error: ${err.message}`));
    });
    
    socket.on('close', () => {
      console.log(`Disconnected from printer at ${ip}:${port}`);
    });
  });
}

// WebSocket connection with reconnection logic
class PrintAgentConnection {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.heartbeatTimer = null;
    this.authenticated = false;
  }
  
  connect() {
    // Build WebSocket URL - connect to CAPS at /ws
    let wsUrl = config.server.replace(/^http/, 'ws').replace(/\/$/, '');
    if (!wsUrl.endsWith('/ws')) {
      wsUrl += '/ws';
    }
    console.log(`Connecting to ${wsUrl}...`);
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.on('open', () => {
      console.log('WebSocket connected, authenticating...');
      this.reconnectAttempts = 0;
      
      // Send HELLO with token
      this.ws.send(JSON.stringify({
        type: 'HELLO',
        token: config.token,
      }));
    });
    
    this.ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(message);
      } catch (e) {
        console.error('Failed to parse message:', e.message);
      }
    });
    
    this.ws.on('close', (code, reason) => {
      console.log(`WebSocket closed: ${code} - ${reason || 'No reason'}`);
      this.authenticated = false;
      this.stopHeartbeat();
      this.scheduleReconnect();
    });
    
    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  }
  
  async handleMessage(message) {
    switch (message.type) {
      case 'AUTH_OK':
        console.log(`Authenticated as ${message.agentName} (${message.agentId})`);
        console.log(`Property ID: ${message.propertyId}`);
        this.authenticated = true;
        this.startHeartbeat();
        break;
        
      case 'AUTH_FAIL':
        console.error('Authentication failed:', message.message);
        process.exit(1);
        break;
        
      case 'JOB':
        console.log(`Received print job: ${message.jobId}`);
        await this.handlePrintJob(message);
        break;
        
      case 'HEARTBEAT_ACK':
        // Heartbeat acknowledged
        break;
        
      case 'ERROR':
        console.error('Server error:', message.message);
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  }
  
  async handlePrintJob(job) {
    const { jobId, printerIp, printerPort, data, jobType } = job;
    
    // Send ACK immediately
    this.send({ type: 'ACK', jobId });
    
    try {
      console.log(`Printing job ${jobId} to ${printerIp}:${printerPort || config.defaultPrinterPort}`);
      
      await printToNetworkPrinter(
        printerIp,
        printerPort || config.defaultPrinterPort,
        data
      );
      
      console.log(`Job ${jobId} completed successfully`);
      this.send({ type: 'DONE', jobId });
    } catch (err) {
      console.error(`Job ${jobId} failed:`, err.message);
      this.send({ type: 'ERROR', jobId, error: err.message });
    }
  }
  
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.authenticated) {
        this.send({ type: 'HEARTBEAT' });
      }
    }, config.heartbeatInterval);
  }
  
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(
      config.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
      config.maxReconnectInterval
    );
    
    console.log(`Reconnecting in ${Math.round(delay / 1000)} seconds... (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// Main
function main() {
  console.log('='.repeat(50));
  console.log('Cloud POS Print Agent');
  console.log('='.repeat(50));
  
  // Load configuration
  loadConfigFile();
  parseArgs();
  
  // Validate configuration
  if (!config.server) {
    console.error('Error: Server URL is required');
    console.error('Usage: node print-agent.js --server <url> --token <token>');
    console.error('Or create a config.json file with server and token');
    process.exit(1);
  }
  
  if (!config.token) {
    console.error('Error: Agent token is required');
    console.error('Usage: node print-agent.js --server <url> --token <token>');
    process.exit(1);
  }
  
  console.log(`Server: ${config.server}`);
  console.log(`Token: ${config.token.substring(0, 8)}...`);
  console.log('');
  
  // Start connection
  const agent = new PrintAgentConnection();
  agent.connect();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    agent.stopHeartbeat();
    if (agent.ws) {
      agent.ws.close(1000, 'Agent shutdown');
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    agent.stopHeartbeat();
    if (agent.ws) {
      agent.ws.close(1000, 'Agent shutdown');
    }
    process.exit(0);
  });
}

main();

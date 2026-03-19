import * as fs from 'fs';
import * as path from 'path';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROTATED_FILES = 3;

export interface GatewayFileEntry {
  ts: string;
  device: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  reqBody: string | null;
  resBody: string | null;
  err: string | null;
}

let logFilePath: string | null = null;
let logStream: fs.WriteStream | null = null;
let currentSize = 0;

export function initGatewayLogger(dataDir: string): void {
  const logsDir = path.join(dataDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  logFilePath = path.join(logsDir, 'gateway.log');
  if (fs.existsSync(logFilePath)) {
    try {
      currentSize = fs.statSync(logFilePath).size;
    } catch {
      currentSize = 0;
    }
  }
  openStream();
  console.log(`[GatewayLogger] File logging to ${logFilePath} (5MB rotation)`);
}

function openStream(): void {
  if (!logFilePath) return;
  if (logStream) {
    try { logStream.end(); } catch {}
  }
  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  logStream.on('error', (err) => {
    console.error('[GatewayLogger] Write error:', err.message);
  });
}

function rotate(): void {
  if (!logFilePath || !logStream) return;
  try { logStream.end(); } catch {}
  logStream = null;

  for (let i = MAX_ROTATED_FILES; i >= 1; i--) {
    const older = `${logFilePath}.${i}`;
    const newer = i === 1 ? logFilePath : `${logFilePath}.${i - 1}`;
    if (i === MAX_ROTATED_FILES && fs.existsSync(older)) {
      try { fs.unlinkSync(older); } catch {}
    }
    if (fs.existsSync(newer)) {
      try { fs.renameSync(newer, `${logFilePath}.${i}`); } catch {}
    }
  }

  currentSize = 0;
  openStream();
}

export function writeGatewayEntry(entry: GatewayFileEntry): void {
  if (!logStream || !logFilePath) return;

  const line = JSON.stringify(entry) + '\n';
  const lineSize = Buffer.byteLength(line, 'utf8');

  if (currentSize + lineSize > MAX_FILE_SIZE) {
    rotate();
  }

  try {
    logStream.write(line);
    currentSize += lineSize;
  } catch (err: any) {
    console.error('[GatewayLogger] Failed to write:', err.message);
  }
}

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(
  process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    : os.homedir(),
  process.platform === 'win32' ? 'Cloud POS' : '.cloudpos',
  'logs'
);

const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 5;
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };
const LOG_FILE = path.join(LOG_DIR, 'system.log');

const SUBSYSTEMS = {
  APP: 'APP',
  PRINT: 'PRINT',
  OFFLINEDB: 'OFFLINEDB',
  SYNC: 'SYNC',
  EMV: 'EMV',
  INTERCEPTOR: 'INTERCEPTOR',
  INSTALLER: 'INSTALLER',
  NETWORK: 'NETWORK',
  WINDOW: 'WINDOW',
  IPC: 'IPC',
  CONFIG: 'CONFIG',
  RENDERER: 'RENDERER',
  UPDATER: 'UPDATER',
};

let minLevel = LOG_LEVELS.DEBUG;
let initialized = false;

function ensureLogDir() {
  if (initialized) return;
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    initialized = true;
  } catch (e) {
    console.error(`[SystemLogger] Failed to create log directory: ${e.message}`);
  }
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stats = fs.statSync(LOG_FILE);
    if (stats.size < MAX_LOG_SIZE) return;

    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const older = `${LOG_FILE}.${i}`;
      const newer = i === 1 ? LOG_FILE : `${LOG_FILE}.${i - 1}`;
      if (fs.existsSync(newer)) {
        if (fs.existsSync(older)) fs.unlinkSync(older);
        fs.renameSync(newer, older);
      }
    }
  } catch (e) {
    console.error(`[SystemLogger] Rotation error: ${e.message}`);
  }
}

function summarizeData(data) {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') {
    return data.length > 200 ? data.substring(0, 200) + '…' : data;
  }
  if (typeof data !== 'object') return String(data);
  if (Array.isArray(data)) {
    if (data.length === 0) return '';
    return `[${data.length} items]`;
  }
  const keys = Object.keys(data);
  if (keys.length === 0) return '';
  const parts = [];
  for (const k of keys.slice(0, 6)) {
    const v = data[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      if (Array.isArray(v)) {
        parts.push(`${k}=[${v.length}]`);
      } else {
        const s = JSON.stringify(v);
        parts.push(`${k}=${s.length > 60 ? s.substring(0, 60) + '…' : s}`);
      }
    } else {
      const sv = String(v);
      parts.push(`${k}=${sv.length > 60 ? sv.substring(0, 60) + '…' : sv}`);
    }
  }
  if (keys.length > 6) parts.push(`+${keys.length - 6} more`);
  return parts.join(', ');
}

function formatMessage(level, subsystem, category, message, data) {
  const timestamp = new Date().toISOString();
  const time = timestamp.split('T')[1].split('.')[0];
  let line = `[${time}] [${level.padEnd(5)}] [${subsystem.padEnd(12)}] [${category}] ${message}`;
  if (data !== undefined && data !== null) {
    try {
      const summary = summarizeData(data);
      if (summary) {
        line += ` | ${summary}`;
      }
    } catch {
      line += ` | [unserializable]`;
    }
  }
  return line;
}

function writeLog(level, subsystem, category, message, data) {
  const levelNum = LOG_LEVELS[level] || 0;
  if (levelNum < minLevel) return;

  ensureLogDir();
  const line = formatMessage(level, subsystem, category, message, data);

  const consoleMethod = level === 'ERROR' || level === 'FATAL' ? 'error' : level === 'WARN' ? 'warn' : 'log';
  console[consoleMethod](line);

  try {
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (e) {
    console.error(`[SystemLogger] Write failed: ${e.message}`);
  }
}

function separator(title) {
  ensureLogDir();
  const line = `\n${'='.repeat(100)}\n  ${title} - ${new Date().toISOString()}\n${'='.repeat(100)}`;
  try {
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    console.log(line);
  } catch (e) {
    console.error(`[SystemLogger] Write failed: ${e.message}`);
  }
}

function createSubsystemLogger(subsystem) {
  return {
    debug: (category, message, data) => writeLog('DEBUG', subsystem, category, message, data),
    info: (category, message, data) => writeLog('INFO', subsystem, category, message, data),
    warn: (category, message, data) => writeLog('WARN', subsystem, category, message, data),
    error: (category, message, data) => writeLog('ERROR', subsystem, category, message, data),
    fatal: (category, message, data) => writeLog('FATAL', subsystem, category, message, data),
    separator: (title) => separator(`[${subsystem}] ${title}`),
    getLogPath: () => LOG_FILE,
  };
}

function setMinLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    minLevel = LOG_LEVELS[level];
  }
}

function readRecentLines(count = 300) {
  try {
    if (!fs.existsSync(LOG_FILE)) return '';
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n');
    return lines.slice(-count).join('\n');
  } catch (e) {
    return `[Error reading log: ${e.message}]`;
  }
}

function readFilteredLines(subsystem, count = 200) {
  try {
    if (!fs.existsSync(LOG_FILE)) return '';
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n');
    const tag = `[${subsystem}`;
    const filtered = lines.filter(l => l.includes(tag));
    return filtered.slice(-count).join('\n');
  } catch (e) {
    return `[Error reading log: ${e.message}]`;
  }
}

const sysLog = {
  app: createSubsystemLogger(SUBSYSTEMS.APP),
  print: createSubsystemLogger(SUBSYSTEMS.PRINT),
  offlineDb: createSubsystemLogger(SUBSYSTEMS.OFFLINEDB),
  sync: createSubsystemLogger(SUBSYSTEMS.SYNC),
  emv: createSubsystemLogger(SUBSYSTEMS.EMV),
  interceptor: createSubsystemLogger(SUBSYSTEMS.INTERCEPTOR),
  installer: createSubsystemLogger(SUBSYSTEMS.INSTALLER),
  network: createSubsystemLogger(SUBSYSTEMS.NETWORK),
  window: createSubsystemLogger(SUBSYSTEMS.WINDOW),
  ipc: createSubsystemLogger(SUBSYSTEMS.IPC),
  config: createSubsystemLogger(SUBSYSTEMS.CONFIG),
  renderer: createSubsystemLogger(SUBSYSTEMS.RENDERER),
  updater: createSubsystemLogger(SUBSYSTEMS.UPDATER),
};

module.exports = {
  sysLog,
  createSubsystemLogger,
  separator,
  setMinLevel,
  readRecentLines,
  readFilteredLines,
  SUBSYSTEMS,
  LOG_DIR,
  LOG_FILE,
  LOG_LEVELS,
};

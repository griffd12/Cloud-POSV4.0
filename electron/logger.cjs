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

const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_LOG_FILES = 5;
const UNIFIED_MAX_SIZE = 10 * 1024 * 1024;
const UNIFIED_LOG_FILE = path.join(LOG_DIR, 'system.log');

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const SUBSYSTEM_MAP = {
  'app': 'APP',
  'print-agent': 'PRINT',
  'offline-db': 'OFFLINEDB',
  'installer': 'INSTALLER',
  'updater': 'UPDATER',
};

let logDirCreated = false;
let globalDeviceLabel = null;

function ensureLogDir() {
  if (logDirCreated) return;
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    logDirCreated = true;
  } catch (e) {
    console.error(`[Logger] Failed to create log directory: ${e.message}`);
  }
}

function rotateFile(filePath, maxSize, maxFiles) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size < maxSize) return;

    for (let i = maxFiles - 1; i >= 1; i--) {
      const older = `${filePath}.${i}`;
      const newer = i === 1 ? filePath : `${filePath}.${i - 1}`;
      if (fs.existsSync(newer)) {
        if (fs.existsSync(older)) fs.unlinkSync(older);
        fs.renameSync(newer, older);
      }
    }
  } catch (e) {
    console.error(`[Logger] Rotation error: ${e.message}`);
  }
}

function setDeviceLabel(label) {
  globalDeviceLabel = label || null;
}

function getDeviceLabel() {
  return globalDeviceLabel;
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

function writeToUnifiedLog(subsystemTag, line) {
  try {
    rotateFile(UNIFIED_LOG_FILE, UNIFIED_MAX_SIZE, MAX_LOG_FILES);
    const parts = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(?:\[([^\]]+)\]\s+)?\[([^\]]+)\]\s+(.*)/s);
    let unifiedLine;
    if (parts) {
      const [, timestamp, level, deviceOrCategory, categoryOrRest, rest] = parts;
      if (rest !== undefined) {
        unifiedLine = `[${timestamp}] [${level.padEnd(5)}] [${deviceOrCategory}] [${subsystemTag.padEnd(12)}] [${categoryOrRest}] ${rest}`;
      } else {
        const dTag = globalDeviceLabel ? `[${globalDeviceLabel}] ` : '';
        unifiedLine = `[${timestamp}] [${level.padEnd(5)}] ${dTag}[${subsystemTag.padEnd(12)}] [${deviceOrCategory}] ${categoryOrRest}`;
      }
    } else {
      const dTag = globalDeviceLabel ? `[${globalDeviceLabel}] ` : '';
      unifiedLine = `[${new Date().toISOString()}] [INFO ] ${dTag}[${subsystemTag.padEnd(12)}] ${line}`;
    }
    fs.appendFileSync(UNIFIED_LOG_FILE, unifiedLine + '\n', 'utf8');
  } catch {
  }
}

class Logger {
  constructor(logName, options = {}) {
    this.logName = logName;
    this.minLevel = LOG_LEVELS[options.minLevel || 'DEBUG'];
    this.logFile = path.join(LOG_DIR, `${logName}.log`);
    this.subsystemTag = SUBSYSTEM_MAP[logName] || logName.toUpperCase();
    ensureLogDir();
  }

  formatMessage(level, category, message, data) {
    const timestamp = new Date().toISOString();
    const time = timestamp.split('T')[1].split('.')[0];
    const deviceTag = globalDeviceLabel ? `[${globalDeviceLabel}] ` : '';
    let line = `[${time}] [${level}] ${deviceTag}[${category}] ${message}`;
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

  write(level, category, message, data) {
    const levelNum = LOG_LEVELS[level] || 0;
    if (levelNum < this.minLevel) return;

    const line = this.formatMessage(level, category, message, data);

    const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod](line);

    try {
      rotateFile(this.logFile, MAX_LOG_SIZE, MAX_LOG_FILES);
      fs.appendFileSync(this.logFile, line + '\n', 'utf8');
    } catch (e) {
      console.error(`[Logger] Write failed: ${e.message}`);
    }

    writeToUnifiedLog(this.subsystemTag, line);
  }

  debug(category, message, data) { this.write('DEBUG', category, message, data); }
  info(category, message, data) { this.write('INFO', category, message, data); }
  warn(category, message, data) { this.write('WARN', category, message, data); }
  error(category, message, data) { this.write('ERROR', category, message, data); }

  separator(title) {
    const line = `\n${'='.repeat(80)}\n  ${title} - ${new Date().toISOString()}\n${'='.repeat(80)}`;
    try {
      rotateFile(this.logFile, MAX_LOG_SIZE, MAX_LOG_FILES);
      fs.appendFileSync(this.logFile, line + '\n', 'utf8');
    } catch (e) {
      console.error(`[Logger] Write failed: ${e.message}`);
    }
    try {
      rotateFile(UNIFIED_LOG_FILE, UNIFIED_MAX_SIZE, MAX_LOG_FILES);
      fs.appendFileSync(UNIFIED_LOG_FILE, `\n${'='.repeat(100)}\n  [${this.subsystemTag}] ${title} - ${new Date().toISOString()}\n${'='.repeat(100)}\n`, 'utf8');
    } catch {
    }
  }

  getLogPath() { return this.logFile; }

  static getLogDirectory() { return LOG_DIR; }
  static getUnifiedLogPath() { return UNIFIED_LOG_FILE; }

  readRecentLines(count = 200) {
    try {
      if (!fs.existsSync(this.logFile)) return '';
      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.split('\n');
      return lines.slice(-count).join('\n');
    } catch (e) {
      return `[Error reading log: ${e.message}]`;
    }
  }
}

const ARCHIVE_DIR = path.join(LOG_DIR, 'archive');
const ACTIVE_LOG_FILES = ['app.log', 'print-agent.log', 'offline-db.log', 'installer.log', 'updater.log', 'system.log'];
const MAX_ARCHIVE_DAYS = 14;
const MAX_UPGRADE_ARCHIVES = 10;

const SERVICE_HOST_LOG_DIR = path.join(
  process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    : os.homedir(),
  process.platform === 'win32' ? 'Cloud POS' : '.cloudpos',
  'data', 'service-host', 'logs'
);

function collectAllLogFiles() {
  const files = [];

  for (const logFile of ACTIVE_LOG_FILES) {
    const filePath = path.join(LOG_DIR, logFile);
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.size > 0) files.push({ absPath: filePath, archiveName: `electron/${logFile}` });
      } catch {}
    }
    for (let i = 1; i <= MAX_LOG_FILES; i++) {
      const rotated = `${filePath}.${i}`;
      if (fs.existsSync(rotated)) {
        try {
          const stats = fs.statSync(rotated);
          if (stats.size > 0) files.push({ absPath: rotated, archiveName: `electron/${logFile}.${i}` });
        } catch {}
      }
    }
  }

  if (fs.existsSync(SERVICE_HOST_LOG_DIR)) {
    try {
      const shFiles = fs.readdirSync(SERVICE_HOST_LOG_DIR);
      for (const f of shFiles) {
        if (f.endsWith('.log') || f.match(/\.log\.\d+$/)) {
          const filePath = path.join(SERVICE_HOST_LOG_DIR, f);
          try {
            const stats = fs.statSync(filePath);
            if (stats.size > 0) files.push({ absPath: filePath, archiveName: `service-host/${f}` });
          } catch {}
        }
      }
    } catch {}
  }

  return files;
}

function truncateActiveLogFiles() {
  for (const logFile of ACTIVE_LOG_FILES) {
    const filePath = path.join(LOG_DIR, logFile);
    try {
      if (fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
    } catch {}
    for (let i = 1; i <= MAX_LOG_FILES; i++) {
      const rotated = `${filePath}.${i}`;
      try {
        if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
      } catch {}
    }
  }

  if (fs.existsSync(SERVICE_HOST_LOG_DIR)) {
    try {
      const shFiles = fs.readdirSync(SERVICE_HOST_LOG_DIR);
      for (const f of shFiles) {
        if (f.endsWith('.log') || f.match(/\.log\.\d+$/)) {
          const filePath = path.join(SERVICE_HOST_LOG_DIR, f);
          try {
            if (f.match(/\.log\.\d+$/)) {
              fs.unlinkSync(filePath);
            } else {
              fs.writeFileSync(filePath, '', 'utf8');
            }
          } catch {}
        }
      }
    } catch {}
  }
}

function createLogZip(zipPath, logFiles) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    for (const file of logFiles) {
      const content = fs.readFileSync(file.absPath);
      zip.addFile(file.archiveName, content);
    }
    const zipDir = path.dirname(zipPath);
    if (!fs.existsSync(zipDir)) fs.mkdirSync(zipDir, { recursive: true });
    zip.writeZip(zipPath);
    return true;
  } catch (e) {
    console.error(`[Logger] Failed to create zip ${zipPath}: ${e.message}`);
    return false;
  }
}

function cleanupOldArchives(pattern, maxKeep) {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) return;
    const entries = fs.readdirSync(ARCHIVE_DIR)
      .filter(f => f.match(pattern))
      .map(f => {
        const fullPath = path.join(ARCHIVE_DIR, f);
        let mtime = 0;
        try { mtime = fs.statSync(fullPath).mtimeMs; } catch {}
        return { name: f, mtime };
      })
      .sort((a, b) => a.mtime - b.mtime);
    while (entries.length > maxKeep) {
      const oldest = entries.shift();
      try {
        fs.unlinkSync(path.join(ARCHIVE_DIR, oldest.name));
      } catch {}
    }
  } catch {}
}

function formatDateMMDDYY(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[1]}_${parts[2]}_${parts[0].slice(2)}`;
  }
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${mm}_${dd}_${yy}`;
}

function rotateLogsForBusinessDate(closedBusinessDate) {
  ensureLogDir();
  const logFiles = collectAllLogFiles();
  if (logFiles.length === 0) {
    console.log(`[Logger] Business date rotation: no log files to archive`);
    return 0;
  }

  const datePart = formatDateMMDDYY(closedBusinessDate);
  const zipName = `logs_${datePart}.zip`;
  const zipPath = path.join(ARCHIVE_DIR, zipName);

  const success = createLogZip(zipPath, logFiles);
  if (!success) {
    console.error(`[Logger] Business date rotation: zip creation failed for ${zipName}`);
    return 0;
  }
  truncateActiveLogFiles();
  cleanupOldArchives(/^logs_\d{2}_\d{2}_\d{2}\.zip$/, MAX_ARCHIVE_DAYS);
  console.log(`[Logger] Business date rotation: archived ${logFiles.length} files to ${zipName}`);
  return logFiles.length;
}

function rotateLogsForUpgrade(fromVersion, toVersion) {
  ensureLogDir();
  const logFiles = collectAllLogFiles();
  if (logFiles.length === 0) return 0;

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(2);
  const datePart = `${mm}_${dd}_${yy}`;
  const versionClean = (fromVersion || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '');
  const zipName = `logs_upgrade_v${versionClean}_${datePart}.zip`;
  const zipPath = path.join(ARCHIVE_DIR, zipName);

  const success = createLogZip(zipPath, logFiles);
  if (!success) {
    console.error(`[Logger] Upgrade rotation: zip creation failed for ${zipName}`);
    return 0;
  }
  truncateActiveLogFiles();
  cleanupOldArchives(/^logs_upgrade_v.*\.zip$/, MAX_UPGRADE_ARCHIVES);
  console.log(`[Logger] Upgrade rotation: archived ${logFiles.length} files to ${zipName}`);
  return logFiles.length;
}

const VERSION_MARKER_FILE = path.join(LOG_DIR, '.last-version');

function checkVersionAndRotate(currentVersion) {
  ensureLogDir();
  let lastVersion = null;
  try {
    if (fs.existsSync(VERSION_MARKER_FILE)) {
      lastVersion = fs.readFileSync(VERSION_MARKER_FILE, 'utf8').trim();
    }
  } catch {}
  if (lastVersion && lastVersion !== currentVersion) {
    const count = rotateLogsForUpgrade(lastVersion, currentVersion);
    console.log(`[Logger] Version change detected (${lastVersion} → ${currentVersion}): rotated ${count} log files`);
  }
  try {
    fs.writeFileSync(VERSION_MARKER_FILE, currentVersion, 'utf8');
  } catch {}
}

const appLogger = new Logger('app');
const printLogger = new Logger('print-agent');
const offlineDbLogger = new Logger('offline-db');
const installerLogger = new Logger('installer');
const updaterLogger = new Logger('updater');

module.exports = {
  Logger,
  appLogger,
  printLogger,
  offlineDbLogger,
  installerLogger,
  updaterLogger,
  LOG_DIR,
  UNIFIED_LOG_FILE,
  setDeviceLabel,
  getDeviceLabel,
  rotateLogsForUpgrade,
  rotateLogsForBusinessDate,
  checkVersionAndRotate,
};

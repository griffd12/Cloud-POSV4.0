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
    const deviceTag = globalDeviceLabel ? `[${globalDeviceLabel}] ` : '';
    let line = `[${timestamp}] [${level}] ${deviceTag}[${category}] ${message}`;
    if (data !== undefined) {
      try {
        const serialized = typeof data === 'string' ? data : JSON.stringify(data, null, 0);
        if (serialized.length > 2000) {
          line += ` | DATA: ${serialized.substring(0, 2000)}...(truncated)`;
        } else {
          line += ` | DATA: ${serialized}`;
        }
      } catch {
        line += ` | DATA: [unserializable]`;
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

function moveLogsToArchive(archiveSubDir, logFiles) {
  ensureLogDir();
  const destDir = path.join(ARCHIVE_DIR, archiveSubDir);
  try {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
  } catch (e) {
    console.error(`[Logger] Failed to create archive dir ${destDir}: ${e.message}`);
    return 0;
  }
  let moved = 0;
  for (const logFile of logFiles) {
    const src = path.join(LOG_DIR, logFile);
    if (fs.existsSync(src)) {
      try {
        const stats = fs.statSync(src);
        if (stats.size > 0) {
          const dest = path.join(destDir, logFile);
          fs.renameSync(src, dest);
          moved++;
        }
      } catch (e) {
        console.error(`[Logger] Failed to archive ${logFile}: ${e.message}`);
      }
    }
  }
  return moved;
}

function cleanupOldArchives() {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) return;
    const entries = fs.readdirSync(ARCHIVE_DIR)
      .filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/))
      .sort();
    while (entries.length > MAX_ARCHIVE_DAYS) {
      const oldest = entries.shift();
      const oldDir = path.join(ARCHIVE_DIR, oldest);
      try {
        const files = fs.readdirSync(oldDir);
        for (const f of files) fs.unlinkSync(path.join(oldDir, f));
        fs.rmdirSync(oldDir);
      } catch {}
    }
  } catch {}
}

function rotateLogsForBusinessDate(closedBusinessDate) {
  const moved = moveLogsToArchive(closedBusinessDate, ACTIVE_LOG_FILES);
  cleanupOldArchives();
  console.log(`[Logger] Business date rotation: archived ${moved} log files to archive/${closedBusinessDate}/`);
  return moved;
}

function rotateLogsForUpgrade(fromVersion, toVersion) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
  const archiveSubDir = path.join('upgrades', `v${fromVersion}_${timestamp}`);
  const moved = moveLogsToArchive(archiveSubDir, ACTIVE_LOG_FILES);
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) return moved;
    const upgradesDir = path.join(ARCHIVE_DIR, 'upgrades');
    if (!fs.existsSync(upgradesDir)) return moved;
    const upgradeDirs = fs.readdirSync(upgradesDir)
      .map(d => ({ name: d, mtime: fs.statSync(path.join(upgradesDir, d)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime);
    const MAX_UPGRADE_ARCHIVES = 10;
    while (upgradeDirs.length > MAX_UPGRADE_ARCHIVES) {
      const oldest = upgradeDirs.shift();
      const oldDir = path.join(upgradesDir, oldest.name);
      try {
        const files = fs.readdirSync(oldDir);
        for (const f of files) fs.unlinkSync(path.join(oldDir, f));
        fs.rmdirSync(oldDir);
      } catch {}
    }
  } catch {}
  return moved;
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

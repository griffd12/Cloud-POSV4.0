/**
 * Structured Logging System for Service Host
 * 
 * Features:
 * - Categorized log levels (DEBUG, INFO, WARN, ERROR, FATAL)
 * - Structured JSON output for cloud ingestion
 * - File rotation with configurable retention
 * - Cloud reporting for ERROR/FATAL levels
 * - Context-aware logging with service tags
 */

import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  logDir: string;
  maxFileSizeMB: number;
  maxFiles: number;
  cloudReportingEnabled: boolean;
  minCloudReportLevel: LogLevel;
  consoleOutput: boolean;
}

function resolveLogDir(): string {
  if (process.env.SERVICE_HOST_DATA_DIR) {
    return path.join(process.env.SERVICE_HOST_DATA_DIR, 'logs');
  }
  return './data/logs';
}

const DEFAULT_CONFIG: LoggerConfig = {
  logDir: resolveLogDir(),
  maxFileSizeMB: 10,
  maxFiles: 5,
  cloudReportingEnabled: true,
  minCloudReportLevel: 'ERROR',
  consoleOutput: true,
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

export class Logger {
  private config: LoggerConfig;
  private serviceName: string;
  private currentLogFile: string | null = null;
  private cloudReportQueue: LogEntry[] = [];
  private cloudReportCallback?: (entries: LogEntry[]) => Promise<void>;

  constructor(serviceName: string, config: Partial<LoggerConfig> = {}) {
    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  private getLogFileName(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.config.logDir, `service-host-${date}.log`);
  }

  private shouldRotate(): boolean {
    if (!this.currentLogFile || !fs.existsSync(this.currentLogFile)) {
      return true;
    }
    const stats = fs.statSync(this.currentLogFile);
    return stats.size > this.config.maxFileSizeMB * 1024 * 1024;
  }

  private rotateIfNeeded(): void {
    const newLogFile = this.getLogFileName();
    
    if (this.currentLogFile !== newLogFile || this.shouldRotate()) {
      this.currentLogFile = newLogFile;
      this.cleanupOldLogs();
    }
  }

  private cleanupOldLogs(): void {
    try {
      const files = fs.readdirSync(this.config.logDir)
        .filter(f => f.startsWith('service-host-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logDir, f),
          mtime: fs.statSync(path.join(this.config.logDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      while (files.length > this.config.maxFiles) {
        const oldest = files.pop();
        if (oldest) {
          fs.unlinkSync(oldest.path);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  private formatForConsole(entry: LogEntry): string {
    const levelColors: Record<LogLevel, string> = {
      DEBUG: '\x1b[90m',
      INFO: '\x1b[36m',
      WARN: '\x1b[33m',
      ERROR: '\x1b[31m',
      FATAL: '\x1b[35m',
    };
    const reset = '\x1b[0m';
    const color = levelColors[entry.level];
    const time = entry.timestamp.split('T')[1]?.split('.')[0] || entry.timestamp;

    let msg = `${color}${time} [${entry.level}] [${entry.service}]${reset} ${entry.message}`;
    if (entry.context && Object.keys(entry.context).length > 0) {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(entry.context)) {
        if (v === null || v === undefined) continue;
        if (typeof v === 'object') {
          if (Array.isArray(v)) {
            parts.push(`${k}=[${v.length} items]`);
          } else {
            const objKeys = Object.keys(v as Record<string, unknown>);
            parts.push(`${k}={${objKeys.slice(0, 3).join(',')}${objKeys.length > 3 ? ',…' : ''}}`);
          }
        } else {
          parts.push(`${k}=${v}`);
        }
      }
      if (parts.length > 0) {
        msg += ` | ${parts.join(', ')}`;
      }
    }
    if (entry.error) {
      msg += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        msg += `\n  ${entry.error.stack.split('\n').slice(1, 4).join('\n  ')}`;
      }
    }
    return msg;
  }

  private writeToFile(entry: LogEntry): void {
    this.rotateIfNeeded();
    if (!this.currentLogFile) return;

    const line = JSON.stringify(entry) + '\n';
    try {
      fs.appendFileSync(this.currentLogFile, line);
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  private shouldReportToCloud(level: LogLevel): boolean {
    return (
      this.config.cloudReportingEnabled &&
      LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.config.minCloudReportLevel]
    );
  }

  private queueCloudReport(entry: LogEntry): void {
    this.cloudReportQueue.push(entry);
    
    if (this.cloudReportQueue.length >= 10) {
      this.flushCloudReports();
    }
  }

  async flushCloudReports(): Promise<void> {
    if (this.cloudReportQueue.length === 0 || !this.cloudReportCallback) return;

    const entries = [...this.cloudReportQueue];
    this.cloudReportQueue = [];

    try {
      await this.cloudReportCallback(entries);
    } catch (error) {
      this.cloudReportQueue = [...entries, ...this.cloudReportQueue];
    }
  }

  setCloudReportCallback(callback: (entries: LogEntry[]) => Promise<void>): void {
    this.cloudReportCallback = callback;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (this.config.consoleOutput) {
      console.log(this.formatForConsole(entry));
    }

    this.writeToFile(entry);

    if (this.shouldReportToCloud(level)) {
      this.queueCloudReport(entry);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('DEBUG', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('WARN', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('ERROR', message, context, error);
  }

  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('FATAL', message, context, error);
    this.flushCloudReports();
  }

  child(childService: string): Logger {
    return new Logger(`${this.serviceName}:${childService}`, this.config);
  }
}

let defaultLogger: Logger | null = null;
const childLoggers = new Map<string, Logger>();

export function getLogger(serviceName: string = 'ServiceHost'): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger('ServiceHost');
  }
  
  if (serviceName === 'ServiceHost') {
    return defaultLogger;
  }
  
  if (!childLoggers.has(serviceName)) {
    childLoggers.set(serviceName, defaultLogger.child(serviceName));
  }
  
  return childLoggers.get(serviceName)!;
}

export function initializeLogger(config: Partial<LoggerConfig>): Logger {
  defaultLogger = new Logger('ServiceHost', config);
  childLoggers.clear();
  return defaultLogger;
}

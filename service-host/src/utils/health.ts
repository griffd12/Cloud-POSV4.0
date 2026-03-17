/**
 * Health Check System for Service Host
 * 
 * Monitors internal services and reports status to cloud:
 * - CAPS (Check and Posting Service)
 * - Print Controller
 * - KDS Controller
 * - Payment Controller
 * - Database
 * - Cloud Connection
 */

import { getLogger } from './logger.js';
import * as os from 'os';

const logger = getLogger('Health');

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  lastCheck: string;
  message?: string;
  metrics?: Record<string, number | string>;
}

export interface SystemResources {
  cpuUsagePercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  memoryUsagePercent: number;
  diskUsedGB?: number;
  diskTotalGB?: number;
  diskUsagePercent?: number;
  uptime: number;
}

export interface HealthReport {
  timestamp: string;
  propertyId: string;
  serviceHostId: string;
  overallStatus: ServiceStatus;
  services: ServiceHealth[];
  resources: SystemResources;
  syncQueueSize: number;
  activeConnections: number;
  connectedDeviceIds: string[];
}

export type HealthCheckFn = () => Promise<ServiceHealth> | ServiceHealth;

export class HealthMonitor {
  private checks = new Map<string, HealthCheckFn>();
  private lastReport: HealthReport | null = null;
  private propertyId: string;
  private serviceHostId: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatCallback?: (report: HealthReport) => Promise<void>;
  
  private getSyncQueueSize: () => number = () => 0;
  private getActiveConnections: () => number = () => 0;
  private getConnectedDeviceIds: () => string[] = () => [];

  constructor(propertyId: string, serviceHostId: string) {
    this.propertyId = propertyId;
    this.serviceHostId = serviceHostId;
  }

  registerCheck(name: string, checkFn: HealthCheckFn): void {
    this.checks.set(name, checkFn);
    logger.debug(`Registered health check: ${name}`);
  }

  unregisterCheck(name: string): void {
    this.checks.delete(name);
  }

  setSyncQueueSizeGetter(getter: () => number): void {
    this.getSyncQueueSize = getter;
  }

  setActiveConnectionsGetter(getter: () => number): void {
    this.getActiveConnections = getter;
  }

  setConnectedDeviceIdsGetter(getter: () => string[]): void {
    this.getConnectedDeviceIds = getter;
  }

  setHeartbeatCallback(callback: (report: HealthReport) => Promise<void>): void {
    this.heartbeatCallback = callback;
  }

  async runChecks(): Promise<HealthReport> {
    const services: ServiceHealth[] = [];
    
    for (const [name, checkFn] of this.checks) {
      try {
        const health = await checkFn();
        services.push(health);
      } catch (error) {
        services.push({
          name,
          status: 'unhealthy',
          lastCheck: new Date().toISOString(),
          message: error instanceof Error ? error.message : 'Check failed',
        });
      }
    }

    const overallStatus = this.computeOverallStatus(services);
    const resources = this.getSystemResources();

    const report: HealthReport = {
      timestamp: new Date().toISOString(),
      propertyId: this.propertyId,
      serviceHostId: this.serviceHostId,
      overallStatus,
      services,
      resources,
      syncQueueSize: this.getSyncQueueSize(),
      activeConnections: this.getActiveConnections(),
      connectedDeviceIds: this.getConnectedDeviceIds(),
    };

    this.lastReport = report;
    return report;
  }

  private computeOverallStatus(services: ServiceHealth[]): ServiceStatus {
    if (services.length === 0) return 'unknown';
    
    const hasUnhealthy = services.some(s => s.status === 'unhealthy');
    const hasDegraded = services.some(s => s.status === 'degraded');
    
    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }

  private getSystemResources(): SystemResources {
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce(
      (acc, cpu) => acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq,
      0
    );
    const cpuUsagePercent = Math.round((1 - totalIdle / totalTick) * 100);

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const resources: SystemResources = {
      cpuUsagePercent,
      memoryUsedMB: Math.round(usedMemory / (1024 * 1024)),
      memoryTotalMB: Math.round(totalMemory / (1024 * 1024)),
      memoryUsagePercent: Math.round((usedMemory / totalMemory) * 100),
      uptime: Math.round(os.uptime()),
    };

    try {
      const { execSync } = require('child_process');
      const dfOutput = execSync('df -k / 2>/dev/null || echo "0 0 0"', { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          const totalKB = parseInt(parts[1], 10);
          const usedKB = parseInt(parts[2], 10);
          if (!isNaN(totalKB) && !isNaN(usedKB) && totalKB > 0) {
            resources.diskTotalGB = Math.round(totalKB / (1024 * 1024) * 10) / 10;
            resources.diskUsedGB = Math.round(usedKB / (1024 * 1024) * 10) / 10;
            resources.diskUsagePercent = Math.round((usedKB / totalKB) * 100);
          }
        }
      }
    } catch {
      // Disk metrics unavailable on this platform
    }

    return resources;
  }

  startHeartbeat(intervalMs: number = 60000): void {
    if (this.heartbeatInterval) {
      this.stopHeartbeat();
    }

    logger.info(`Starting health heartbeat (interval: ${intervalMs}ms)`);

    this.heartbeatInterval = setInterval(async () => {
      try {
        const report = await this.runChecks();
        
        if (this.heartbeatCallback) {
          await this.heartbeatCallback(report);
        }

        if (report.overallStatus === 'unhealthy') {
          logger.warn('Service Host overall status: UNHEALTHY', {
            services: report.services.filter(s => s.status === 'unhealthy').map(s => s.name),
          });
        }
      } catch (error) {
        logger.error('Heartbeat failed', error instanceof Error ? error : new Error(String(error)));
      }
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Health heartbeat stopped');
    }
  }

  getLastReport(): HealthReport | null {
    return this.lastReport;
  }
}

export function createDatabaseHealthCheck(db: { get: (sql: string) => unknown }): HealthCheckFn {
  return () => {
    const start = Date.now();
    try {
      db.get('SELECT 1');
      const latency = Date.now() - start;
      return {
        name: 'Database',
        status: latency < 100 ? 'healthy' : 'degraded',
        lastCheck: new Date().toISOString(),
        metrics: { queryLatencyMs: latency },
      };
    } catch (error) {
      return {
        name: 'Database',
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Database check failed',
      };
    }
  };
}

export function createServiceHealthCheck(
  name: string,
  checkFn: () => boolean | Promise<boolean>
): HealthCheckFn {
  return async () => {
    try {
      const isHealthy = await checkFn();
      return {
        name,
        status: isHealthy ? 'healthy' : 'degraded',
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Check failed',
      };
    }
  };
}

/**
 * Transaction Sync Worker
 * 
 * Uploads local transactions to cloud with exponential backoff:
 * - Closed checks
 * - Payments
 * - Time entries
 */

import { Database } from '../db/database.js';
import { CloudConnection } from './cloud-connection.js';
import { getLogger } from '../utils/logger.js';
import { withRetry, getCircuitBreaker, CircuitBreaker } from '../utils/retry.js';

const logger = getLogger('TransactionSync');

export class TransactionSync {
  private db: Database;
  private cloud: CloudConnection;
  private serviceHostId: string;
  private propertyId: string;
  private workerTimer: NodeJS.Timeout | null = null;
  private syncInterval: number = 5000;
  private circuitBreaker: CircuitBreaker;
  private isProcessing: boolean = false;
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 10;
  private lastCloudDisconnectLogged: boolean = false;
  
  constructor(db: Database, cloud: CloudConnection, serviceHostId?: string, propertyId?: string) {
    this.db = db;
    this.cloud = cloud;
    this.serviceHostId = serviceHostId || '';
    this.propertyId = propertyId || '';
    this.circuitBreaker = getCircuitBreaker('cloud-sync', {
      failureThreshold: 5,
      recoveryTimeMs: 60000,
      halfOpenMaxAttempts: 3,
    });
  }
  
  startWorker(): void {
    logger.info('Starting transaction sync worker...', { interval: this.syncInterval });
    this.processQueue().catch(e => logger.error('processQueue error', e instanceof Error ? e : new Error(String(e))));
    
    this.workerTimer = setInterval(() => {
      this.processQueue().catch(e => logger.error('processQueue error', e instanceof Error ? e : new Error(String(e))));
    }, this.syncInterval);
  }
  
  stopWorker(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
      logger.info('Transaction sync worker stopped');
    }
  }
  
  private async processQueue(): Promise<void> {
    if (!this.cloud.isConnected()) {
      if (!this.lastCloudDisconnectLogged) {
        logger.debug('Cloud not connected, skipping sync (will suppress until reconnect)');
        this.lastCloudDisconnectLogged = true;
      }
      return;
    }
    
    if (this.lastCloudDisconnectLogged) {
      logger.info('Cloud reconnected, resuming sync');
      this.lastCloudDisconnectLogged = false;
    }
    
    if (this.isProcessing) {
      logger.debug('Sync already in progress, skipping');
      return;
    }
    
    if (this.circuitBreaker.isOpen()) {
      const waitTime = this.circuitBreaker.getTimeUntilHalfOpen();
      logger.debug(`Circuit breaker OPEN, skipping sync (retry in ${Math.ceil(waitTime / 1000)}s)`);
      return;
    }
    
    this.isProcessing = true;
    
    try {
      try {
        await this.syncJournalEntries();
      } catch (journalError) {
        const err = journalError instanceof Error ? journalError : new Error(String(journalError));
        logger.warn('Journal sync failed, will retry next cycle', { error: err.message });
        this.consecutiveFailures++;
      }
      
      const items = this.db.getPendingSyncItems(10);
      
      if (items.length === 0) {
        this.consecutiveFailures = 0;
        return;
      }
      
      logger.debug(`Processing ${items.length} sync items`);
      
      for (const item of items) {
        try {
          await this.syncItemWithRetry(item);
          this.db.removeSyncItem(item.id);
          this.consecutiveFailures = 0;
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          logger.error(`Sync failed for ${item.entity_type}/${item.entity_id}`, error, {
            attempts: item.attempts,
          });
          this.db.markSyncAttempt(item.id, error.message);
          this.consecutiveFailures++;
          
          if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            logger.warn('Max consecutive failures reached, pausing sync');
            break;
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  async syncJournalEntries(): Promise<{ acknowledged: string[]; skipped: string[] }> {
    const entries = this.db.getUnsyncedJournalEntries(10);
    
    if (entries.length === 0) {
      return { acknowledged: [], skipped: [] };
    }
    
    logger.info(`Syncing ${entries.length} journal entries`);
    
    try {
      const transactions = entries.map(entry => ({
        localId: entry.event_id,
        type: entry.event_type,
        action: 'create',
        data: {
          eventId: entry.event_id,
          txnGroupId: entry.txn_group_id,
          deviceId: entry.device_id,
          rvcId: entry.rvc_id,
          businessDate: entry.business_date,
          checkId: entry.check_id,
          eventType: entry.event_type,
          payload: JSON.parse(entry.payload_json),
          configVersion: entry.config_version,
          createdAt: entry.created_at,
        },
      }));
      
      const result = await this.circuitBreaker.execute(() =>
        this.cloud.post<JournalSyncResponse>('/api/sync/transactions', {
          batch: true,
          serviceHostId: this.serviceHostId,
          propertyId: this.propertyId,
          businessDate: entries[0]?.business_date || new Date().toISOString().split('T')[0],
          transactions,
        })
      );
      
      for (const eventId of (result.acknowledged || [])) {
        this.db.markJournalSynced(eventId);
      }
      
      for (const eventId of (result.skipped || [])) {
        this.db.markJournalSynced(eventId);
      }
      
      logger.info(`Journal sync complete: ${result.acknowledged?.length || 0} acknowledged, ${result.skipped?.length || 0} skipped`);
      
      return {
        acknowledged: result.acknowledged || [],
        skipped: result.skipped || [],
      };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      const isPermanentError = error.message.includes('400') || error.message.includes('422') || error.message.includes('404') || error.message.includes('409');
      
      if (isPermanentError) {
        logger.error('Journal sync permanently failed (bad data), marking entries as failed', error);
        for (const entry of entries) {
          this.db.markJournalFailed(entry.event_id);
        }
      } else {
        logger.warn('Journal sync batch failed (transient), will retry next cycle', { error: error.message });
      }
      
      throw error;
    }
  }
  
  private async syncItemWithRetry(item: SyncQueueItem): Promise<void> {
    const maxAttempts = Math.min(3, 5 - item.attempts);
    
    if (maxAttempts <= 0) {
      logger.warn(`Sync item ${item.id} has exceeded max attempts, marking as failed`);
      throw new Error('Max sync attempts exceeded');
    }
    
    await this.circuitBreaker.execute(() =>
      withRetry(
        () => this.syncItem(item),
        {
          maxAttempts,
          baseDelayMs: 1000,
          maxDelayMs: 10000,
          jitterFactor: 0.2,
          shouldRetry: (error) => {
            if (error.message.includes('404')) return false;
            if (error.message.includes('401')) return false;
            if (error.message.includes('403')) return false;
            return true;
          },
          onRetry: (error, attempt, delay) => {
            logger.debug(`Retrying sync item ${item.id}`, {
              attempt,
              delay,
              error: error.message,
            });
          },
        }
      )
    );
  }
  
  private async syncItem(item: SyncQueueItem): Promise<void> {
    const payload = JSON.parse(item.payload);
    
    switch (item.entity_type) {
      case 'check':
        await this.syncCheck(item.entity_id, item.action, payload);
        break;
        
      case 'payment':
        await this.syncPayment(item.entity_id, item.action, payload);
        break;
        
      case 'time_entry':
        await this.syncTimeEntry(item.entity_id, item.action, payload);
        break;
        
      case 'timecard':
        await this.syncTimecard(item.entity_id, item.action, payload);
        break;
        
      case 'terminal_session':
        await this.syncTerminalSession(item.entity_id, item.action, payload);
        break;
        
      case 'break_attestation':
        await this.syncBreakAttestation(item.entity_id, item.action, payload);
        break;
        
      case 'break_violation':
        await this.syncBreakViolation(item.entity_id, item.action, payload);
        break;
        
      default:
        logger.warn(`Unknown entity type: ${item.entity_type}`);
        throw new Error(`Unknown entity type: ${item.entity_type}`);
    }
  }
  
  private async syncCheck(entityId: string, action: string, payload: any): Promise<void> {
    if (action === 'create' || action === 'update') {
      const result = await this.cloud.post<{ id?: string; success?: boolean; processed?: number; skipped?: string[]; cloudIds?: Record<string, string> }>('/api/sync/transactions', {
        type: 'check',
        action,
        data: payload,
      });
      
      if (result.id) {
        this.db.run(
          'UPDATE checks SET cloud_synced = 1, cloud_id = ? WHERE id = ?',
          [result.id, entityId]
        );
        logger.debug(`Check synced: ${entityId}`);
      } else {
        const wasSkipped = result.skipped && Array.isArray(result.skipped) &&
          (result.skipped.includes(entityId) || (payload?.localId && result.skipped.includes(payload.localId)));
        if (wasSkipped) {
          const cloudId = result.cloudIds?.[entityId] || (payload?.localId && result.cloudIds?.[payload.localId]) || null;
          this.db.run(
            'UPDATE checks SET cloud_synced = 1, cloud_id = ? WHERE id = ?',
            [cloudId, entityId]
          );
          logger.debug(`Check already synced (skipped by cloud): ${entityId}`);
        } else if (result.success && (result.processed || 0) > 0) {
          this.db.run(
            'UPDATE checks SET cloud_synced = 1 WHERE id = ?',
            [entityId]
          );
          logger.debug(`Check synced (no id returned): ${entityId}`);
        }
      }
    }
  }
  
  private async syncPayment(entityId: string, action: string, payload: any): Promise<void> {
    if (action === 'create') {
      const result = await this.cloud.post<{ success?: boolean; skipped?: string[] }>('/api/sync/transactions', {
        type: 'payment',
        action,
        data: payload,
      });
      
      const wasSkipped = result?.skipped && Array.isArray(result.skipped) &&
        (result.skipped.includes(entityId) || (payload?.localId && result.skipped.includes(payload.localId)));
      if (wasSkipped || result?.success) {
        this.db.run(
          'UPDATE check_payments SET cloud_synced = 1 WHERE id = ?',
          [entityId]
        );
        logger.debug(`Payment synced${wasSkipped ? ' (skipped by cloud)' : ''}: ${entityId}`);
      }
    }
  }
  
  private async syncTimeEntry(entityId: string, action: string, payload: any): Promise<void> {
    await this.cloud.post('/api/sync/transactions', {
      type: 'time_entry',
      action,
      data: payload,
    });
    
    this.db.run(
      'UPDATE time_entries SET cloud_synced = 1 WHERE id = ?',
      [entityId]
    );
    logger.debug(`Time entry synced: ${entityId}`);
  }
  
  private async syncTimecard(entityId: string, action: string, payload: any): Promise<void> {
    const result = await this.cloud.post<SyncIngestResponse>('/api/sync/timecards', {
      serviceHostId: this.serviceHostId,
      propertyId: this.propertyId,
      timecards: [{ ...payload, id: entityId, _action: action }],
    });
    
    if (result?.processed > 0 && result?.cloudIds?.[entityId]) {
      this.db.run(
        'UPDATE timecards SET cloud_synced = 1 WHERE id = ?',
        [entityId]
      );
      logger.debug(`Timecard synced: ${entityId}`);
    } else if (result?.failedIds?.includes(entityId)) {
      throw new Error(`Cloud rejected timecard ${entityId}`);
    } else {
      throw new Error(`Timecard ${entityId} not acknowledged by cloud`);
    }
  }
  
  private async syncTerminalSession(entityId: string, action: string, payload: any): Promise<void> {
    const result = await this.cloud.post<SyncIngestResponse>('/api/sync/terminal-sessions', {
      serviceHostId: this.serviceHostId,
      propertyId: this.propertyId,
      sessions: [{ ...payload, id: entityId, _action: action }],
    });
    
    if (result?.processed > 0 && result?.cloudIds?.[entityId]) {
      this.db.run(
        'UPDATE terminal_sessions SET cloud_synced = 1 WHERE id = ?',
        [entityId]
      );
      logger.debug(`Terminal session synced: ${entityId}`);
    } else if (result?.failedIds?.includes(entityId)) {
      throw new Error(`Cloud rejected terminal session ${entityId}`);
    } else {
      throw new Error(`Terminal session ${entityId} not acknowledged by cloud`);
    }
  }
  
  private async syncBreakAttestation(entityId: string, action: string, payload: any): Promise<void> {
    const result = await this.cloud.post<SyncIngestResponse>('/api/sync/break-attestations', {
      serviceHostId: this.serviceHostId,
      propertyId: this.propertyId,
      attestations: [{ ...payload, id: entityId }],
    });
    
    if (result?.processed > 0 && result?.cloudIds?.[entityId]) {
      this.db.run(
        'UPDATE break_attestations SET cloud_synced = 1 WHERE id = ?',
        [entityId]
      );
      logger.debug(`Break attestation synced: ${entityId}`);
    } else if (result?.failedIds?.includes(entityId)) {
      throw new Error(`Cloud rejected break attestation ${entityId}`);
    } else {
      throw new Error(`Break attestation ${entityId} not acknowledged by cloud`);
    }
  }
  
  private async syncBreakViolation(entityId: string, action: string, payload: any): Promise<void> {
    const result = await this.cloud.post<SyncIngestResponse>('/api/sync/break-violations', {
      serviceHostId: this.serviceHostId,
      propertyId: this.propertyId,
      violations: [{ ...payload, id: entityId }],
    });
    
    if (result?.processed > 0 && result?.cloudIds?.[entityId]) {
      this.db.run(
        'UPDATE break_violations SET cloud_synced = 1 WHERE id = ?',
        [entityId]
      );
      logger.debug(`Break violation synced: ${entityId}`);
    } else if (result?.failedIds?.includes(entityId)) {
      throw new Error(`Cloud rejected break violation ${entityId}`);
    } else {
      throw new Error(`Break violation ${entityId} not acknowledged by cloud`);
    }
  }
  
  queueCheck(checkId: string, action: 'create' | 'update', data: any): void {
    this.db.addToSyncQueue('check', checkId, action, data);
    logger.debug(`Queued check for sync: ${checkId}`, { action });
  }
  
  queuePayment(paymentId: string, data: any): void {
    this.db.addToSyncQueue('payment', paymentId, 'create', data);
    logger.debug(`Queued payment for sync: ${paymentId}`);
  }
  
  queueTimeEntry(entryId: string, action: 'create' | 'update', data: any): void {
    this.db.addToSyncQueue('time_entry', entryId, action, data);
    logger.debug(`Queued time entry for sync: ${entryId}`, { action });
  }
  
  getQueueSize(): number {
    const items = this.db.getPendingSyncItems(1000);
    return items.length;
  }
  
  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }
  
  getStats(): SyncStats {
    const prop = this.db.get<any>('SELECT current_business_date FROM properties WHERE active = 1 LIMIT 1');
    const businessDate = prop?.current_business_date || new Date().toISOString().split('T')[0];
    const journalStats = this.db.getJournalStats(businessDate);
    return {
      queueSize: this.getQueueSize(),
      journalPending: journalStats?.pending || 0,
      circuitBreakerState: this.getCircuitBreakerState(),
      consecutiveFailures: this.consecutiveFailures,
      isProcessing: this.isProcessing,
    };
  }
}

interface SyncQueueItem {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: string;
  attempts: number;
  last_attempt: string | null;
  error: string | null;
}

interface JournalSyncResponse {
  processed: number;
  acknowledged: string[];
  skipped: string[];
}

interface SyncIngestResponse {
  success: boolean;
  processed: number;
  cloudIds: Record<string, string>;
  failedIds?: string[];
}

interface SyncStats {
  queueSize: number;
  journalPending: number;
  circuitBreakerState: string;
  consecutiveFailures: number;
  isProcessing: boolean;
}

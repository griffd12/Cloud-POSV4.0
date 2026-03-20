/**
 * Payment Controller
 * 
 * Handles payment terminal integration:
 * - Cloud-proxied terminal payments (Stripe, Heartland, North, Square)
 * - Authorize card payments
 * - Capture/void transactions
 * - Graceful error handling when Cloud unreachable
 */

import { Database } from '../db/database.js';
import { TransactionSync } from '../sync/transaction-sync.js';
import { CloudConnection } from '../sync/cloud-connection.js';
import { EMVTerminalService } from './emv-terminal.js';
import { getLogger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

const logger = getLogger('Payment');

const CLOUD_POLL_INTERVAL_MS = 1500;
const CLOUD_POLL_TIMEOUT_MS = 120000;

export class PaymentController {
  private db: Database;
  private transactionSync: TransactionSync;
  private cloudConnection: CloudConnection;
  private emvTerminal: EMVTerminalService;
  
  constructor(db: Database, transactionSync: TransactionSync, cloudConnection: CloudConnection) {
    this.db = db;
    this.transactionSync = transactionSync;
    this.cloudConnection = cloudConnection;
    this.emvTerminal = new EMVTerminalService();
  }

  private resolveCardTenderId(providedTenderId?: string, propertyId?: string): string | null {
    if (providedTenderId && providedTenderId !== 'card') {
      const tender = this.db.getTender(providedTenderId);
      if (tender) return providedTenderId;
    }
    const cardTender = this.db.getDefaultCardTender(propertyId);
    if (cardTender) return cardTender.id;
    return null;
  }
  
  async authorize(params: AuthorizeParams): Promise<PaymentResult> {
    const transactionId = randomUUID();
    
    const tenderId = this.resolveCardTenderId(params.tenderId);
    if (!tenderId) {
      return { success: false, error: 'No card tender configured. Add a credit/debit tender in EMC.' };
    }
    
    const result: PaymentResult = {
      success: true,
      transactionId,
      authCode: this.generateAuthCode(),
      cardLast4: params.cardLast4 || '****',
      cardBrand: params.cardBrand || 'unknown',
      amount: params.amount,
      tip: params.tip || 0,
    };
    
    this.db.run(
      `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, reference_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'authorized')`,
      [
        transactionId,
        params.checkId,
        tenderId,
        params.tenderType || 'credit',
        params.amount,
        params.tip || 0,
        JSON.stringify({
          authCode: result.authCode,
          cardLast4: result.cardLast4,
          cardBrand: result.cardBrand,
        }),
      ]
    );
    
    this.transactionSync.queuePayment(transactionId, {
      id: transactionId,
      checkId: params.checkId,
      amount: params.amount,
      tip: params.tip || 0,
      authCode: result.authCode,
      cardLast4: result.cardLast4,
      cardBrand: result.cardBrand,
      status: 'authorized',
    });
    
    return result;
  }
  
  async capture(transactionId: string): Promise<PaymentResult> {
    const payment = this.getPayment(transactionId);
    if (!payment) {
      return { success: false, error: 'Transaction not found' };
    }
    
    if (payment.status !== 'authorized') {
      return { success: false, error: `Cannot capture ${payment.status} transaction` };
    }
    
    this.db.run(
      `UPDATE check_payments SET status = 'captured' WHERE id = ?`,
      [transactionId]
    );
    
    return {
      success: true,
      transactionId,
      amount: payment.amount,
    };
  }
  
  async void(transactionId: string, reason?: string): Promise<PaymentResult> {
    const payment = this.getPayment(transactionId);
    if (!payment) {
      return { success: false, error: 'Transaction not found' };
    }
    
    if (payment.status === 'voided') {
      return { success: false, error: 'Transaction already voided' };
    }
    
    this.db.run(
      `UPDATE check_payments SET status = 'voided' WHERE id = ?`,
      [transactionId]
    );
    
    return {
      success: true,
      transactionId,
      amount: payment.amount,
    };
  }
  
  async refund(transactionId: string, amount?: number): Promise<PaymentResult> {
    const payment = this.getPayment(transactionId);
    if (!payment) {
      return { success: false, error: 'Transaction not found' };
    }
    
    if (payment.status !== 'captured') {
      return { success: false, error: `Cannot refund ${payment.status} transaction` };
    }
    
    const refundAmount = amount || payment.amount;
    if (refundAmount > payment.amount) {
      return { success: false, error: 'Refund amount exceeds original amount' };
    }
    
    const refundId = randomUUID();
    
    return {
      success: true,
      transactionId: refundId,
      amount: refundAmount,
    };
  }
  
  getPayment(transactionId: string): PaymentRecord | null {
    const row = this.db.get<PaymentRow>(
      'SELECT * FROM check_payments WHERE id = ?',
      [transactionId]
    );
    
    if (!row) return null;
    
    const reference = (row.reference_number || row.reference) ? JSON.parse(row.reference_number || row.reference) : {};
    const tender = this.db.getTender(row.tender_id);
    
    return {
      id: row.id,
      checkId: row.check_id,
      tenderId: row.tender_id,
      tenderType: row.tender_type,
      isCashMedia: tender?.is_cash_media === 1,
      isCardMedia: tender?.is_card_media === 1,
      isGiftMedia: tender?.is_gift_media === 1,
      amount: row.amount,
      tip: row.tip_amount || row.tip || 0,
      authCode: reference.authCode,
      cardLast4: reference.cardLast4 || row.card_last4,
      cardBrand: reference.cardBrand || row.card_brand,
      status: row.status as PaymentRecord['status'],
      createdAt: row.created_at,
    };
  }
  
  getPaymentsForCheck(checkId: string): PaymentRecord[] {
    const rows = this.db.all<PaymentRow>(
      'SELECT * FROM check_payments WHERE check_id = ? ORDER BY created_at',
      [checkId]
    );
    
    return rows.map(row => {
      const reference = (row.reference_number || row.reference) ? JSON.parse(row.reference_number || row.reference) : {};
      const tender = this.db.getTender(row.tender_id);
      return {
        id: row.id,
        checkId: row.check_id,
        tenderId: row.tender_id,
        tenderType: row.tender_type,
        isCashMedia: tender?.is_cash_media === 1,
        isCardMedia: tender?.is_card_media === 1,
        isGiftMedia: tender?.is_gift_media === 1,
        amount: row.amount,
        tip: row.tip_amount || row.tip || 0,
        authCode: reference.authCode,
        cardLast4: reference.cardLast4 || row.card_last4,
        cardBrand: reference.cardBrand || row.card_brand,
        status: row.status as PaymentRecord['status'],
        createdAt: row.created_at,
      };
    });
  }
  
  async authorizeOffline(params: AuthorizeParams): Promise<PaymentResult> {
    const tenderId = this.resolveCardTenderId(params.tenderId);
    if (!tenderId) {
      logger.error('No card tender found for offline auth — cannot insert check_payment', undefined, {
        checkId: params.checkId,
        providedTenderId: params.tenderId,
      });
      return { success: false, error: 'No card tender configured. Cannot authorize offline.' };
    }

    const transactionId = randomUUID();
    const offlineAuthCode = `OFF${Date.now().toString(36).toUpperCase()}`;
    
    const result: PaymentResult = {
      success: true,
      transactionId,
      authCode: offlineAuthCode,
      cardLast4: params.cardLast4 || '****',
      cardBrand: params.cardBrand || 'unknown',
      amount: params.amount,
      tip: params.tip || 0,
      offline: true,
    };
    
    this.db.run(
      `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, reference_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'offline_authorized')`,
      [
        transactionId,
        params.checkId,
        tenderId,
        params.tenderType || 'credit',
        params.amount,
        params.tip || 0,
        JSON.stringify({
          authCode: offlineAuthCode,
          cardLast4: result.cardLast4,
          cardBrand: result.cardBrand,
          offline: true,
        }),
      ]
    );
    
    this.transactionSync.queuePayment(transactionId, {
      id: transactionId,
      checkId: params.checkId,
      amount: params.amount,
      tip: params.tip || 0,
      authCode: offlineAuthCode,
      cardLast4: result.cardLast4,
      cardBrand: result.cardBrand,
      status: 'offline_authorized',
      requiresOnlineAuth: true,
    });
    
    return result;
  }
  
  private isCloudEligibleTerminal(device: any): boolean {
    if (device.cloud_device_id) return true;
    const dt = (device.device_type || '').toLowerCase();
    if (dt.startsWith('stripe_') || dt === 'bbpos_chipper') return true;
    if (dt.startsWith('pax_') || dt.startsWith('verifone_') || dt.startsWith('ingenico_')) return true;
    if (device.connection_type === 'cloud') return true;
    return false;
  }

  async processTerminalSession(sessionId: string, session: any): Promise<PaymentResult> {
    const amount = parseFloat(session.amount || '0');
    const tip = parseFloat(session.tipAmount || '0');

    const terminalDevice = session.terminalDeviceId
      ? this.db.getTerminalDevice(session.terminalDeviceId)
      : null;

    if (!terminalDevice) {
      logger.warn('No terminal device found', { sessionId, terminalDeviceId: session.terminalDeviceId });
      return this.handleTerminalFailure(sessionId, session, amount, tip, 'Terminal device not configured');
    }

    logger.info('Processing terminal session', {
      sessionId,
      terminalName: terminalDevice.name,
      deviceType: terminalDevice.device_type,
      cloudDeviceId: terminalDevice.cloud_device_id,
      address: terminalDevice.ip_address,
      amount,
      tip,
    });

    this.db.run(
      `UPDATE terminal_sessions SET status = 'waiting_for_card', data = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        JSON.stringify({ ...session, status: 'waiting_for_card', updatedAt: new Date().toISOString() }),
        sessionId,
      ]
    );

    if (this.isCloudEligibleTerminal(terminalDevice)) {
      return this.processViaCloudProxy(sessionId, session, terminalDevice, amount, tip);
    }

    return this.processViaRawTcp(sessionId, session, terminalDevice, amount, tip);
  }

  private async processViaCloudProxy(
    sessionId: string,
    session: any,
    terminalDevice: any,
    amount: number,
    tip: number
  ): Promise<PaymentResult> {
    if (!this.cloudConnection.isConnected()) {
      logger.error('Cloud not connected — cannot process card payment via Cloud proxy', undefined, { sessionId });
      this.db.run(
        `UPDATE terminal_sessions SET status = 'error', data = ?, updated_at = datetime('now') WHERE id = ?`,
        [
          JSON.stringify({
            ...session,
            status: 'error',
            statusMessage: 'Cloud connection required for card payments. Check network.',
            processedAt: new Date().toISOString(),
          }),
          sessionId,
        ]
      );
      return { success: false, error: 'Cloud connection required for card payments. Check network connection.' };
    }

    try {
      const cloudPayload = {
        terminalDeviceId: session.terminalDeviceId,
        checkId: session.checkId,
        amount: String(amount),
        tipAmount: String(tip),
        transactionType: session.transactionType || 'sale',
        currency: session.currency || 'usd',
        employeeId: session.employeeId,
        workstationId: session.workstationId,
        propertyId: terminalDevice.property_id,
      };

      logger.info('Proxying terminal session to Cloud', { sessionId, terminalDeviceId: session.terminalDeviceId });
      const cloudSession = await this.cloudConnection.post<any>('/api/terminal-sessions', cloudPayload);

      const cloudSessionId = cloudSession.id;
      this.db.run(
        `UPDATE terminal_sessions SET cloud_session_id = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
        [
          cloudSessionId,
          JSON.stringify({
            ...session,
            status: 'awaiting_card',
            cloudSessionId,
            updatedAt: new Date().toISOString(),
          }),
          sessionId,
        ]
      );

      logger.info('Cloud terminal session created, polling for completion', { sessionId, cloudSessionId });

      const result = await this.pollCloudSession(cloudSessionId, sessionId, session, terminalDevice, amount, tip);
      return result;
    } catch (e: any) {
      logger.error('Cloud proxy terminal payment failed', e, { sessionId });
      this.db.run(
        `UPDATE terminal_sessions SET status = 'error', data = ?, updated_at = datetime('now') WHERE id = ?`,
        [
          JSON.stringify({
            ...session,
            status: 'error',
            statusMessage: e.message || 'Cloud terminal communication error',
            processedAt: new Date().toISOString(),
          }),
          sessionId,
        ]
      );
      return { success: false, error: e.message || 'Cloud terminal communication error' };
    }
  }

  private async pollCloudSession(
    cloudSessionId: string,
    localSessionId: string,
    session: any,
    terminalDevice: any,
    amount: number,
    tip: number
  ): Promise<PaymentResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < CLOUD_POLL_TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, CLOUD_POLL_INTERVAL_MS));

      try {
        const cloudStatus = await this.cloudConnection.get<any>(`/api/terminal-sessions/${cloudSessionId}`);
        const status = cloudStatus.status;

        if (status === 'completed' || status === 'approved') {
          return this.handleCloudApproval(localSessionId, session, cloudStatus, terminalDevice, amount, tip);
        }

        if (status === 'declined') {
          logger.info('Cloud terminal payment declined', { localSessionId, cloudSessionId });
          this.db.run(
            `UPDATE terminal_sessions SET status = 'declined', data = ?, updated_at = datetime('now') WHERE id = ?`,
            [
              JSON.stringify({
                ...session,
                status: 'declined',
                cloudSessionId,
                statusMessage: cloudStatus.statusMessage || 'Card declined',
                processedAt: new Date().toISOString(),
              }),
              localSessionId,
            ]
          );
          return { success: false, error: cloudStatus.statusMessage || 'Card declined' };
        }

        if (status === 'error' || status === 'cancelled' || status === 'expired') {
          logger.warn('Cloud terminal session ended', { localSessionId, cloudSessionId, status });
          this.db.run(
            `UPDATE terminal_sessions SET status = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
            [
              status,
              JSON.stringify({
                ...session,
                status,
                cloudSessionId,
                statusMessage: cloudStatus.statusMessage || `Terminal session ${status}`,
                processedAt: new Date().toISOString(),
              }),
              localSessionId,
            ]
          );
          return { success: false, error: cloudStatus.statusMessage || `Terminal session ${status}` };
        }

        this.db.run(
          `UPDATE terminal_sessions SET status = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
          [
            status,
            JSON.stringify({
              ...session,
              status,
              cloudSessionId,
              updatedAt: new Date().toISOString(),
            }),
            localSessionId,
          ]
        );
      } catch (pollErr: any) {
        logger.warn('Cloud poll error (retrying)', { cloudSessionId, error: pollErr.message });
      }
    }

    logger.error('Cloud terminal session timed out', undefined, { localSessionId, cloudSessionId });
    this.db.run(
      `UPDATE terminal_sessions SET status = 'error', data = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        JSON.stringify({
          ...session,
          status: 'error',
          cloudSessionId,
          statusMessage: 'Terminal payment timed out (120s)',
          processedAt: new Date().toISOString(),
        }),
        localSessionId,
      ]
    );
    return { success: false, error: 'Terminal payment timed out' };
  }

  private handleCloudApproval(
    localSessionId: string,
    session: any,
    cloudStatus: any,
    terminalDevice: any,
    amount: number,
    tip: number
  ): PaymentResult {
    const transactionId = randomUUID();

    const tenderId = this.resolveCardTenderId(session.tenderId, terminalDevice.property_id);
    if (!tenderId) {
      logger.error('No card tender found after Cloud approval — cannot record payment locally', undefined, {
        localSessionId,
      });
      this.db.run(
        `UPDATE terminal_sessions SET status = 'error', cloud_session_id = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
        [
          cloudStatus.id,
          JSON.stringify({
            ...session,
            status: 'error',
            cloudSessionId: cloudStatus.id,
            statusMessage: 'Payment approved by terminal but no card tender configured in EMC. Configure a credit/debit tender.',
            processedAt: new Date().toISOString(),
          }),
          localSessionId,
        ]
      );
      return {
        success: false,
        error: 'Payment approved by terminal but no card tender configured in EMC. Configure a credit/debit tender.',
      };
    }

    const authCode = cloudStatus.approvalCode || cloudStatus.processorReference || 'CLOUD';
    const cardLast4 = cloudStatus.cardLast4 || '****';
    const cardBrand = cloudStatus.cardBrand || 'unknown';
    const entryMethod = cloudStatus.entryMethod || 'chip';

    this.db.run(
      `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, reference_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'authorized')`,
      [
        transactionId,
        session.checkId,
        tenderId,
        session.transactionType === 'debit' ? 'debit' : 'credit',
        amount + tip,
        tip,
        JSON.stringify({
          authCode,
          cardLast4,
          cardBrand,
          entryMethod,
          cloudSessionId: cloudStatus.id,
          processorReference: cloudStatus.processorReference,
        }),
      ]
    );

    this.transactionSync.queuePayment(transactionId, {
      id: transactionId,
      checkId: session.checkId,
      amount: amount + tip,
      tip,
      authCode,
      cardLast4,
      cardBrand,
      status: 'authorized',
    });

    this.db.run(
      `UPDATE terminal_sessions SET status = 'completed', cloud_session_id = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        cloudStatus.id,
        JSON.stringify({
          ...session,
          status: 'approved',
          paymentTransactionId: transactionId,
          approvalCode: authCode,
          cardLast4,
          cardBrand,
          entryMethod,
          cloudSessionId: cloudStatus.id,
          tipAmount: tip,
          processedAt: new Date().toISOString(),
        }),
        localSessionId,
      ]
    );

    logger.info('Cloud terminal payment approved', {
      localSessionId,
      transactionId,
      authCode,
      cardBrand,
      cardLast4,
    });

    return {
      success: true,
      transactionId,
      authCode,
      cardLast4,
      cardBrand,
      amount: amount + tip,
      tip,
    };
  }

  private async processViaRawTcp(
    sessionId: string,
    session: any,
    terminalDevice: any,
    amount: number,
    tip: number
  ): Promise<PaymentResult> {
    if (!terminalDevice.ip_address) {
      logger.warn('No IP address for raw TCP terminal', { sessionId });
      return this.handleTerminalFailure(sessionId, session, amount, tip, 'Terminal IP not configured');
    }

    const totalCents = Math.round((amount + tip) * 100);

    logger.info('Processing via raw TCP', {
      sessionId,
      address: terminalDevice.ip_address,
      port: terminalDevice.port || 9100,
    });

    try {
      const terminalResponse = await this.emvTerminal.sendPayment({
        address: terminalDevice.ip_address,
        port: terminalDevice.port || 9100,
        amount: totalCents,
        transactionType: session.transactionType || 'sale',
        timeout: 120,
      });

      if (!terminalResponse.complete) {
        logger.warn('Terminal response incomplete', { sessionId });
        return this.handleTerminalFailure(sessionId, session, amount, tip, 'Incomplete terminal response');
      }

      if (terminalResponse.approved) {
        const transactionId = randomUUID();
        const tenderId = this.resolveCardTenderId(session.tenderId, terminalDevice.property_id);
        if (!tenderId) {
          logger.error('No card tender for raw TCP approved payment', undefined, { sessionId });
          return { success: false, error: 'No card tender configured in EMC.' };
        }

        this.db.run(
          `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, reference_number, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'authorized')`,
          [
            transactionId,
            session.checkId,
            tenderId,
            session.transactionType === 'debit' ? 'debit' : 'credit',
            amount + tip,
            tip,
            JSON.stringify({
              authCode: terminalResponse.authCode,
              cardLast4: terminalResponse.lastFour,
              cardBrand: terminalResponse.cardType,
              entryMethod: terminalResponse.entryMethod,
              terminalTransactionId: terminalResponse.transactionId,
            }),
          ]
        );

        this.transactionSync.queuePayment(transactionId, {
          id: transactionId,
          checkId: session.checkId,
          amount: amount + tip,
          tip,
          authCode: terminalResponse.authCode,
          cardLast4: terminalResponse.lastFour,
          cardBrand: terminalResponse.cardType,
          status: 'authorized',
        });

        const result: PaymentResult = {
          success: true,
          transactionId,
          authCode: terminalResponse.authCode,
          cardLast4: terminalResponse.lastFour,
          cardBrand: terminalResponse.cardType,
          amount: amount + tip,
          tip,
        };

        this.db.run(
          `UPDATE terminal_sessions SET status = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
          [
            'completed',
            JSON.stringify({
              ...session,
              status: 'approved',
              paymentTransactionId: transactionId,
              approvalCode: terminalResponse.authCode,
              cardLast4: terminalResponse.lastFour,
              cardBrand: terminalResponse.cardType,
              entryMethod: terminalResponse.entryMethod,
              tipAmount: terminalResponse.tipAmount || 0,
              processedAt: new Date().toISOString(),
            }),
            sessionId,
          ]
        );

        logger.info('Raw TCP terminal payment approved', {
          sessionId,
          transactionId,
          authCode: terminalResponse.authCode,
        });

        return result;
      } else {
        logger.info('Raw TCP terminal payment declined', {
          sessionId,
          responseCode: terminalResponse.responseCode,
          message: terminalResponse.responseMessage,
        });

        this.db.run(
          `UPDATE terminal_sessions SET status = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
          [
            'declined',
            JSON.stringify({
              ...session,
              status: 'declined',
              statusMessage: terminalResponse.responseMessage || 'Card declined',
              responseCode: terminalResponse.responseCode,
              processedAt: new Date().toISOString(),
            }),
            sessionId,
          ]
        );

        return {
          success: false,
          error: terminalResponse.responseMessage || 'Card declined',
        };
      }
    } catch (e: any) {
      logger.error('Raw TCP terminal communication failed', e, {
        sessionId,
        address: terminalDevice.ip_address,
      });
      return this.handleTerminalFailure(sessionId, session, amount, tip, e.message);
    }
  }

  private async handleTerminalFailure(
    sessionId: string,
    session: any,
    amount: number,
    tip: number,
    reason: string
  ): Promise<PaymentResult> {
    logger.warn('Terminal failure — returning error (no offline fallback for card)', { sessionId, reason });

    this.db.run(
      `UPDATE terminal_sessions SET status = 'error', data = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        JSON.stringify({
          ...session,
          status: 'error',
          statusMessage: reason,
          processedAt: new Date().toISOString(),
        }),
        sessionId,
      ]
    );

    return { success: false, error: reason };
  }

  async processPendingSessions(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    try {
      const pending = this.db.all(
        `SELECT id, data FROM terminal_sessions WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10`
      ) as any[];
      for (const row of pending) {
        const claimed = this.db.run(
          `UPDATE terminal_sessions SET status = 'processing', updated_at = datetime('now') WHERE id = ? AND status = 'pending'`,
          [row.id]
        );
        if (!claimed || (claimed as any).changes === 0) continue;

        const session = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        try {
          await this.processTerminalSession(row.id, session);
          processed++;
        } catch (e: any) {
          logger.error('Terminal session processing failed', e, { sessionId: row.id });
          this.db.run(
            `UPDATE terminal_sessions SET status = 'error', updated_at = datetime('now') WHERE id = ?`,
            [row.id]
          );
          failed++;
        }
      }
    } catch (e: any) {
      logger.error('Poll pending sessions error', e as Error);
    }
    return { processed, failed };
  }

  startPolling(intervalMs: number = 5000): void {
    if (this._pollInterval) return;
    let polling = false;
    this._pollInterval = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await this.processPendingSessions();
        if (result.processed > 0 || result.failed > 0) {
          logger.info('Poll results', { processed: result.processed, failed: result.failed });
        }
      } catch (e: any) {
        logger.error('Poll error', e as Error);
      } finally {
        polling = false;
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  private _pollInterval: ReturnType<typeof setInterval> | null = null;

  private generateAuthCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

interface AuthorizeParams {
  checkId: string;
  amount: number;
  tip?: number;
  tenderId?: string;
  tenderType?: 'credit' | 'debit';
  cardLast4?: string;
  cardBrand?: string;
  terminalId?: string;
}

interface PaymentResult {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  cardLast4?: string;
  cardBrand?: string;
  amount?: number;
  tip?: number;
  error?: string;
  offline?: boolean;
}

interface PaymentRecord {
  id: string;
  checkId: string;
  tenderId: string;
  tenderType: string;
  isCashMedia?: boolean;
  isCardMedia?: boolean;
  isGiftMedia?: boolean;
  amount: number;
  tip: number;
  authCode?: string;
  cardLast4?: string;
  cardBrand?: string;
  status: 'authorized' | 'captured' | 'voided' | 'offline_authorized';
  createdAt: string;
}

interface PaymentRow {
  id: string;
  check_id: string;
  tender_id: string;
  tender_type: string;
  amount: number;
  tip: number;
  tip_amount: number;
  reference: string | null;
  reference_number: string | null;
  card_last4: string | null;
  card_brand: string | null;
  status: string;
  created_at: string;
}

export type { PaymentResult, AuthorizeParams, PaymentRecord };

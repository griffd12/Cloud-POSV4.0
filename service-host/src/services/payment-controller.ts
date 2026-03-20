/**
 * Payment Controller
 * 
 * Handles payment terminal integration:
 * - Real EMV terminal communication via TCP
 * - Authorize card payments
 * - Capture/void transactions
 * - Store-and-forward for offline
 */

import { Database } from '../db/database.js';
import { TransactionSync } from '../sync/transaction-sync.js';
import { EMVTerminalService } from './emv-terminal.js';
import { getLogger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

const logger = getLogger('Payment');

export class PaymentController {
  private db: Database;
  private transactionSync: TransactionSync;
  private emvTerminal: EMVTerminalService;
  
  constructor(db: Database, transactionSync: TransactionSync) {
    this.db = db;
    this.transactionSync = transactionSync;
    this.emvTerminal = new EMVTerminalService();
  }
  
  async authorize(params: AuthorizeParams): Promise<PaymentResult> {
    const transactionId = randomUUID();
    
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
        params.tenderId || 'card',
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
        params.tenderId || 'card',
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
  
  async processTerminalSession(sessionId: string, session: any): Promise<PaymentResult> {
    const amount = parseFloat(session.amount || '0');
    const tip = parseFloat(session.tipAmount || '0');
    const totalCents = Math.round((amount + tip) * 100);

    const terminalDevice = session.terminalDeviceId
      ? this.db.getTerminalDevice(session.terminalDeviceId)
      : null;

    if (!terminalDevice || !terminalDevice.ip_address) {
      logger.warn('No terminal device or address found, falling back to offline', {
        sessionId,
        terminalDeviceId: session.terminalDeviceId,
      });
      return this.handleTerminalFailure(sessionId, session, amount, tip, 'Terminal device not configured');
    }

    logger.info('Processing terminal session', {
      sessionId,
      terminalName: terminalDevice.name,
      address: terminalDevice.ip_address,
      port: terminalDevice.port || 9100,
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

        this.db.run(
          `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, reference_number, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'authorized')`,
          [
            transactionId,
            session.checkId,
            session.tenderId || 'card',
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

        logger.info('Terminal payment approved', {
          sessionId,
          transactionId,
          authCode: terminalResponse.authCode,
          cardType: terminalResponse.cardType,
          lastFour: terminalResponse.lastFour,
        });

        return result;
      } else {
        logger.info('Terminal payment declined', {
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
      logger.error('Terminal communication failed, falling back to offline', e, {
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
    const offlineResult = await this.authorizeOffline({
      checkId: session.checkId,
      amount: amount + tip,
      tip,
      tenderId: session.tenderId || 'card',
      tenderType: session.transactionType === 'debit' ? 'debit' : 'credit',
      cardLast4: session.cardLast4 || '****',
      cardBrand: session.cardBrand || 'unknown',
      terminalId: session.terminalDeviceId,
    });

    this.db.run(
      `UPDATE terminal_sessions SET status = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        'completed_offline',
        JSON.stringify({
          ...session,
          status: 'completed_offline',
          paymentTransactionId: offlineResult.transactionId,
          approvalCode: offlineResult.authCode,
          offline: true,
          offlineReason: reason,
          processedAt: new Date().toISOString(),
        }),
        sessionId,
      ]
    );

    logger.info('Terminal session completed offline', { sessionId, reason });
    return offlineResult;
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

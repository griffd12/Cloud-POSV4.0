/**
 * Payment Controller
 * 
 * Handles payment terminal integration:
 * - Authorize card payments
 * - Capture/void transactions
 * - Store-and-forward for offline
 */

import { Database } from '../db/database.js';
import { TransactionSync } from '../sync/transaction-sync.js';
import { randomUUID } from 'crypto';

export class PaymentController {
  private db: Database;
  private transactionSync: TransactionSync;
  
  constructor(db: Database, transactionSync: TransactionSync) {
    this.db = db;
    this.transactionSync = transactionSync;
  }
  
  // Authorize a payment
  async authorize(params: AuthorizeParams): Promise<PaymentResult> {
    const transactionId = randomUUID();
    
    // For now, simulate authorization
    // In production, this would connect to payment gateway
    const result: PaymentResult = {
      success: true,
      transactionId,
      authCode: this.generateAuthCode(),
      cardLast4: params.cardLast4 || '****',
      cardBrand: params.cardBrand || 'unknown',
      amount: params.amount,
      tip: params.tip || 0,
    };
    
    // Store authorization
    this.db.run(
      `INSERT INTO payments (id, check_id, tender_id, tender_type, amount, tip, reference, status)
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
    
    // Queue for cloud sync
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
  
  // Capture an authorized payment
  async capture(transactionId: string): Promise<PaymentResult> {
    const payment = this.getPayment(transactionId);
    if (!payment) {
      return { success: false, error: 'Transaction not found' };
    }
    
    if (payment.status !== 'authorized') {
      return { success: false, error: `Cannot capture ${payment.status} transaction` };
    }
    
    // Update status
    this.db.run(
      `UPDATE payments SET status = 'captured' WHERE id = ?`,
      [transactionId]
    );
    
    return {
      success: true,
      transactionId,
      amount: payment.amount,
    };
  }
  
  // Void a transaction
  async void(transactionId: string, reason?: string): Promise<PaymentResult> {
    const payment = this.getPayment(transactionId);
    if (!payment) {
      return { success: false, error: 'Transaction not found' };
    }
    
    if (payment.status === 'voided') {
      return { success: false, error: 'Transaction already voided' };
    }
    
    // Update status
    this.db.run(
      `UPDATE payments SET status = 'voided' WHERE id = ?`,
      [transactionId]
    );
    
    return {
      success: true,
      transactionId,
      amount: payment.amount,
    };
  }
  
  // Refund a captured payment
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
    
    // In production, would call payment gateway
    // For now, just track locally
    const refundId = randomUUID();
    
    return {
      success: true,
      transactionId: refundId,
      amount: refundAmount,
    };
  }
  
  // Get payment by ID
  getPayment(transactionId: string): PaymentRecord | null {
    const row = this.db.get<PaymentRow>(
      'SELECT * FROM payments WHERE id = ?',
      [transactionId]
    );
    
    if (!row) return null;
    
    const reference = row.reference ? JSON.parse(row.reference) : {};
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
      tip: row.tip,
      authCode: reference.authCode,
      cardLast4: reference.cardLast4,
      cardBrand: reference.cardBrand,
      status: row.status as PaymentRecord['status'],
      createdAt: row.created_at,
    };
  }
  
  // Get payments for a check
  getPaymentsForCheck(checkId: string): PaymentRecord[] {
    const rows = this.db.all<PaymentRow>(
      'SELECT * FROM payments WHERE check_id = ? ORDER BY created_at',
      [checkId]
    );
    
    return rows.map(row => {
      const reference = row.reference ? JSON.parse(row.reference) : {};
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
        tip: row.tip,
        authCode: reference.authCode,
        cardLast4: reference.cardLast4,
        cardBrand: reference.cardBrand,
        status: row.status as PaymentRecord['status'],
        createdAt: row.created_at,
      };
    });
  }
  
  // Offline authorization (store-and-forward)
  async authorizeOffline(params: AuthorizeParams): Promise<PaymentResult> {
    // For offline, we generate a local auth code and queue for later
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
    
    // Store with offline flag
    this.db.run(
      `INSERT INTO payments (id, check_id, tender_id, tender_type, amount, tip, reference, status)
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
    
    // Queue for sync - will be processed when online
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
    
    try {
      const terminalResult = await this.authorize({
        checkId: session.checkId,
        amount: amount + tip,
        tip: tip,
        tenderId: session.tenderId || 'card',
        tenderType: session.transactionType === 'debit' ? 'debit' : 'credit',
        cardLast4: session.cardLast4,
        cardBrand: session.cardBrand,
        terminalId: session.terminalDeviceId,
      });

      this.db.run(
        `UPDATE terminal_sessions SET status = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
        [
          terminalResult.success ? 'completed' : 'failed',
          JSON.stringify({
            ...session,
            status: terminalResult.success ? 'completed' : 'failed',
            transactionId: terminalResult.transactionId,
            authCode: terminalResult.authCode,
            cardLast4: terminalResult.cardLast4,
            cardBrand: terminalResult.cardBrand,
            processedAt: new Date().toISOString(),
          }),
          sessionId,
        ]
      );

      return terminalResult;
    } catch (e: any) {
      const offlineResult = await this.authorizeOffline({
        checkId: session.checkId,
        amount: amount + tip,
        tip: tip,
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
            transactionId: offlineResult.transactionId,
            authCode: offlineResult.authCode,
            offline: true,
            processedAt: new Date().toISOString(),
          }),
          sessionId,
        ]
      );

      return offlineResult;
    }
  }

  async processPendingSessions(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    try {
      const pending = this.db.all(
        `SELECT id, data FROM terminal_sessions WHERE status = 'pending' OR status = 'processing' ORDER BY created_at ASC LIMIT 10`
      );
      for (const row of pending as any[]) {
        const session = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        try {
          this.db.run(
            `UPDATE terminal_sessions SET status = 'processing', updated_at = datetime('now') WHERE id = ?`,
            [row.id]
          );
          await this.processTerminalSession(row.id, session);
          processed++;
        } catch (e: any) {
          failed++;
        }
      }
    } catch (e: any) {
      console.error(`[PaymentController] Poll pending sessions error: ${e.message}`);
    }
    return { processed, failed };
  }

  startPolling(intervalMs: number = 5000): void {
    if (this._pollInterval) return;
    this._pollInterval = setInterval(async () => {
      try {
        const result = await this.processPendingSessions();
        if (result.processed > 0 || result.failed > 0) {
          console.log(`[PaymentController] Poll: ${result.processed} processed, ${result.failed} failed`);
        }
      } catch (e: any) {
        console.error(`[PaymentController] Poll error: ${e.message}`);
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
  tenderType: string; // display/label only, not used for behavioral logic
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
  reference: string | null;
  status: string;
  created_at: string;
}

export type { PaymentResult, AuthorizeParams, PaymentRecord };

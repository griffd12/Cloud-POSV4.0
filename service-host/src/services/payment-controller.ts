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

  private async processViaDirectStripe(
    sessionId: string,
    session: any,
    terminalDevice: any,
    amount: number,
    tip: number
  ): Promise<PaymentResult> {
    const processorId = terminalDevice.payment_processor_id;
    if (!processorId) {
      logger.warn('No payment_processor_id on terminal device — cannot use direct Stripe fallback', { sessionId });
      return { success: false, error: 'No payment processor linked to terminal device. Configure in EMC.' };
    }
    const processor = this.db.getPaymentProcessor(processorId);
    if (!processor) {
      logger.warn('Payment processor not found in local DB', { sessionId, processorId });
      return { success: false, error: 'Payment processor not synced to local device.' };
    }
    let stripeSecretKey: string | null = null;
    if (processor.credentials) {
      try {
        const creds = typeof processor.credentials === 'string' ? JSON.parse(processor.credentials) : processor.credentials;
        stripeSecretKey = creds.secretKey || creds.secret_key || creds.apiKey || creds.api_key || null;
      } catch { /* ignore parse error */ }
    }
    if (!stripeSecretKey) {
      logger.warn('No Stripe secret key in payment processor credentials — direct fallback unavailable', { sessionId, processorId });
      return { success: false, error: 'Stripe credentials not available locally. Cloud connection required.' };
    }
    const stripeReaderId = terminalDevice.cloud_device_id || terminalDevice.terminal_id;
    if (!stripeReaderId) {
      logger.warn('No Stripe reader ID on terminal device', { sessionId });
      return { success: false, error: 'Stripe reader ID not configured on terminal device.' };
    }
    logger.info('Attempting direct Stripe Terminal payment (YELLOW mode)', { sessionId, readerId: stripeReaderId });
    this.db.run(
      `UPDATE terminal_sessions SET status = 'waiting_for_card', data = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify({ ...session, status: 'waiting_for_card', directStripe: true, updatedAt: new Date().toISOString() }), sessionId]
    );
    const totalCents = Math.round((amount + tip) * 100);
    const stripeHeaders = {
      'Authorization': `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-04-10',
    };
    try {
      const piBody = new URLSearchParams({
        'amount': String(totalCents),
        'currency': session.currency || 'usd',
        'payment_method_types[]': 'card_present',
        'capture_method': 'automatic',
      });
      const piResp = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: stripeHeaders,
        body: piBody.toString(),
      });
      if (!piResp.ok) {
        const errBody = await piResp.text();
        logger.error('Stripe PaymentIntent creation failed', undefined, { sessionId, status: piResp.status, body: errBody });
        return this.handleTerminalFailure(sessionId, session, amount, tip, `Stripe API error: ${piResp.status}`);
      }
      const paymentIntent = await piResp.json() as any;
      logger.info('Stripe PaymentIntent created directly', { sessionId, piId: paymentIntent.id });
      const processBody = new URLSearchParams({ 'payment_intent': paymentIntent.id });
      const processResp = await fetch(`https://api.stripe.com/v1/terminal/readers/${stripeReaderId}/process_payment_intent`, {
        method: 'POST',
        headers: stripeHeaders,
        body: processBody.toString(),
      });
      if (!processResp.ok) {
        const errBody = await processResp.text();
        logger.error('Stripe reader process_payment_intent failed', undefined, { sessionId, status: processResp.status, body: errBody });
        try {
          await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntent.id}/cancel`, { method: 'POST', headers: stripeHeaders });
        } catch { /* best effort cancel */ }
        return this.handleTerminalFailure(sessionId, session, amount, tip, `Stripe reader error: ${processResp.status}`);
      }
      logger.info('Stripe reader processing payment — polling for result', { sessionId, readerId: stripeReaderId });
      const STRIPE_POLL_INTERVAL = 2000;
      const STRIPE_POLL_TIMEOUT = 120000;
      const pollStart = Date.now();
      while (Date.now() - pollStart < STRIPE_POLL_TIMEOUT) {
        await new Promise(r => setTimeout(r, STRIPE_POLL_INTERVAL));
        const localRow = this.db.get<any>('SELECT status FROM terminal_sessions WHERE id = ?', [sessionId]);
        if (localRow && localRow.status === 'cancelled') {
          try {
            await fetch(`https://api.stripe.com/v1/terminal/readers/${stripeReaderId}/cancel_action`, { method: 'POST', headers: stripeHeaders });
            await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntent.id}/cancel`, { method: 'POST', headers: stripeHeaders });
          } catch { /* best effort */ }
          return { success: false, error: 'Payment cancelled' };
        }
        try {
          const piCheck = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntent.id}`, { headers: stripeHeaders });
          if (!piCheck.ok) continue;
          const piStatus = await piCheck.json() as any;
          if (piStatus.status === 'succeeded' || piStatus.status === 'requires_capture') {
            const charge = piStatus.latest_charge ? piStatus.charges?.data?.[0] : null;
            const cardDetails = charge?.payment_method_details?.card_present || {};
            const transactionId = randomUUID();
            const tenderId = this.resolveCardTenderId(session.tenderId, terminalDevice.property_id);
            if (!tenderId) {
              logger.error('No card tender for direct Stripe approved payment', undefined, { sessionId });
              return { success: false, error: 'No card tender configured in EMC.' };
            }
            this.db.run(
              `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, reference_number, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'authorized')`,
              [transactionId, session.checkId, tenderId, 'credit', amount + tip, tip,
                JSON.stringify({
                  authCode: charge?.authorization_code || piStatus.id,
                  cardLast4: cardDetails.last4 || '****',
                  cardBrand: cardDetails.brand || 'unknown',
                  stripePaymentIntentId: piStatus.id,
                  directStripe: true,
                })]
            );
            this.transactionSync.queuePayment(transactionId, {
              id: transactionId, checkId: session.checkId, amount: amount + tip, tip,
              authCode: charge?.authorization_code || piStatus.id,
              cardLast4: cardDetails.last4 || '****', cardBrand: cardDetails.brand || 'unknown',
              status: 'authorized',
            });
            this.db.run(
              `UPDATE terminal_sessions SET status = 'completed', data = ?, updated_at = datetime('now') WHERE id = ?`,
              [JSON.stringify({
                ...session, status: 'approved', paymentTransactionId: transactionId,
                approvalCode: charge?.authorization_code || piStatus.id,
                cardLast4: cardDetails.last4 || '****', cardBrand: cardDetails.brand || 'unknown',
                directStripe: true, processedAt: new Date().toISOString(),
              }), sessionId]
            );
            logger.info('Direct Stripe payment approved (YELLOW mode)', { sessionId, transactionId, piId: piStatus.id });
            return {
              success: true, transactionId,
              authCode: charge?.authorization_code || piStatus.id,
              cardLast4: cardDetails.last4 || '****', cardBrand: cardDetails.brand || 'unknown',
              amount: amount + tip, tip,
            };
          }
          if (piStatus.status === 'canceled' || piStatus.last_payment_error) {
            const errMsg = piStatus.last_payment_error?.message || 'Card declined';
            this.db.run(
              `UPDATE terminal_sessions SET status = 'declined', data = ?, updated_at = datetime('now') WHERE id = ?`,
              [JSON.stringify({ ...session, status: 'declined', statusMessage: errMsg, directStripe: true, processedAt: new Date().toISOString() }), sessionId]
            );
            return { success: false, error: errMsg };
          }
        } catch (pollErr: any) {
          logger.warn('Stripe direct poll error (retrying)', { sessionId, error: pollErr.message });
        }
      }
      return this.handleTerminalFailure(sessionId, session, amount, tip, 'Direct Stripe payment timed out (120s)');
    } catch (e: any) {
      logger.error('Direct Stripe Terminal payment failed', e, { sessionId });
      return this.handleTerminalFailure(sessionId, session, amount, tip, e.message || 'Direct Stripe communication error');
    }
  }

  private async processViaCloudProxy(
    sessionId: string,
    session: any,
    terminalDevice: any,
    amount: number,
    tip: number
  ): Promise<PaymentResult> {
    if (!this.cloudConnection.isConnected()) {
      logger.warn('Cloud not connected — attempting direct Stripe Terminal fallback (YELLOW mode)', { sessionId });
      const directResult = await this.processViaDirectStripe(sessionId, session, terminalDevice, amount, tip);
      if (directResult.success || !directResult.error?.includes('not available locally')) {
        return directResult;
      }
      logger.error('Direct Stripe fallback unavailable — no local credentials', undefined, { sessionId });
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
      let cloudSession: any;
      try {
        cloudSession = await this.cloudConnection.post<any>('/api/terminal-sessions', cloudPayload);
      } catch (firstErr: any) {
        if (firstErr.message?.includes('409') && firstErr.message?.includes('Conflict')) {
          logger.warn('Cloud returned 409 — stale session blocking terminal, cancelling and retrying', { sessionId });
          try {
            const staleResp = await this.cloudConnection.get<any>(`/api/terminal-devices/${session.terminalDeviceId}/active-session`);
            if (staleResp?.id) {
              await this.cloudConnection.post(`/api/terminal-sessions/${staleResp.id}/cancel`, { reason: 'Auto-cleared stale session' });
              logger.info('Stale Cloud session cancelled', { staleSessionId: staleResp.id });
            }
          } catch (cancelErr: any) {
            logger.warn('Could not cancel stale Cloud session', { error: cancelErr.message });
          }
          cloudSession = await this.cloudConnection.post<any>('/api/terminal-sessions', cloudPayload);
        } else {
          throw firstErr;
        }
      }

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
      const isNetworkError = e.message?.includes('503') || e.message?.includes('ECONNREFUSED') ||
        e.message?.includes('ETIMEDOUT') || e.message?.includes('ENOTFOUND') ||
        e.message?.includes('fetch failed') || e.message?.includes('network');
      if (isNetworkError) {
        logger.warn('Cloud proxy failed with network error — trying direct Stripe fallback', { sessionId, error: e.message });
        const directResult = await this.processViaDirectStripe(sessionId, session, terminalDevice, amount, tip);
        if (directResult.success || !directResult.error?.includes('not available locally')) {
          return directResult;
        }
      }
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
    const MAX_CONSECUTIVE_FAILURES = 5;
    let consecutiveFailures = 0;

    while (Date.now() - startTime < CLOUD_POLL_TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, CLOUD_POLL_INTERVAL_MS));

      const localRow = this.db.get<any>('SELECT status FROM terminal_sessions WHERE id = ?', [localSessionId]);
      if (localRow && localRow.status === 'cancelled') {
        logger.info('Local session cancelled — aborting Cloud poll', { localSessionId, cloudSessionId });
        return { success: false, error: 'Payment cancelled' };
      }

      try {
        const cloudStatus = await this.cloudConnection.get<any>(`/api/terminal-sessions/${cloudSessionId}`);
        consecutiveFailures = 0;
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
        consecutiveFailures++;
        const isNetworkError = pollErr.message?.includes('503') || pollErr.message?.includes('ECONNREFUSED') ||
          pollErr.message?.includes('ETIMEDOUT') || pollErr.message?.includes('ENOTFOUND') ||
          pollErr.message?.includes('fetch failed') || pollErr.message?.includes('network');
        logger.warn('Cloud poll error', {
          cloudSessionId,
          error: pollErr.message,
          consecutiveFailures,
          isNetworkError,
        });
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const failMsg = `Cloud unreachable after ${consecutiveFailures} consecutive poll failures. Payment could not be confirmed.`;
          logger.error(failMsg, undefined, { localSessionId, cloudSessionId });
          this.db.run(
            `UPDATE terminal_sessions SET status = 'error', data = ?, updated_at = datetime('now') WHERE id = ?`,
            [
              JSON.stringify({
                ...session,
                status: 'error',
                cloudSessionId,
                statusMessage: failMsg,
                processedAt: new Date().toISOString(),
              }),
              localSessionId,
            ]
          );
          return { success: false, error: failMsg };
        }
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
    const localRow = this.db.get<any>('SELECT status FROM terminal_sessions WHERE id = ?', [localSessionId]);
    if (localRow && localRow.status === 'cancelled') {
      logger.warn('Cloud approved but local session already cancelled — discarding payment', {
        localSessionId,
        cloudSessionId: cloudStatus.id,
      });
      return { success: false, error: 'Payment cancelled before terminal response received' };
    }

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

    const amountDollars = amount / 100;
    const tipDollars = tip / 100;

    this.db.run(
      `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, reference_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'authorized')`,
      [
        transactionId,
        session.checkId,
        tenderId,
        session.transactionType === 'debit' ? 'debit' : 'credit',
        Math.round((amountDollars + tipDollars) * 100),
        Math.round(tipDollars * 100),
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
      amount: amountDollars + tipDollars,
      tipAmount: tipDollars,
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
          paymentRecorded: true,
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
      amount: amountDollars + tipDollars,
      tip: tipDollars,
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

        const totalDollars = amount + tip;
        const totalCentsStored = Math.round(totalDollars * 100);
        const tipCentsStored = Math.round(tip * 100);

        this.db.run(
          `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, reference_number, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'authorized')`,
          [
            transactionId,
            session.checkId,
            tenderId,
            session.transactionType === 'debit' ? 'debit' : 'credit',
            totalCentsStored,
            tipCentsStored,
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
          amount: totalDollars,
          tipAmount: tip,
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
          amount: totalDollars,
          tip,
        };

        this.db.run(
          `UPDATE terminal_sessions SET status = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
          [
            'completed',
            JSON.stringify({
              ...session,
              status: 'approved',
              paymentRecorded: true,
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

import * as net from 'net';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('EMVTerminal');

export interface TerminalPaymentConfig {
  address: string;
  port?: number;
  amount: number;
  transactionType?: string;
  timeout?: number;
}

export interface TerminalResponse {
  complete: boolean;
  approved?: boolean;
  authCode?: string;
  transactionId?: string;
  cardType?: string;
  lastFour?: string;
  entryMethod?: string;
  tipAmount?: number;
  totalAmount?: number;
  responseCode?: string;
  responseMessage?: string;
  raw?: any;
}

export class EMVTerminalService {

  async sendPayment(config: TerminalPaymentConfig): Promise<TerminalResponse> {
    const { address, amount, transactionType } = config;
    const terminalPort = config.port || 9100;
    const timeoutMs = (config.timeout || 120) * 1000;

    logger.info('Sending payment to terminal', { address, port: terminalPort, amount, transactionType: transactionType || 'sale' });

    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = Buffer.alloc(0);
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          client.destroy();
          logger.warn('Terminal communication timed out', { address, timeoutMs });
          reject(new Error('Terminal communication timed out'));
        }
      }, timeoutMs);

      client.connect(terminalPort, address, () => {
        logger.info('Connected to terminal', { address, port: terminalPort });
        const payload = this.buildPayload(amount, transactionType);
        client.write(payload);
      });

      client.on('data', (data) => {
        responseData = Buffer.concat([responseData, data]);
        const parsed = this.parseResponse(responseData);
        if (parsed.complete) {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            client.end();
            logger.info('Terminal response received', {
              approved: parsed.approved,
              authCode: parsed.authCode,
              cardType: parsed.cardType,
              lastFour: parsed.lastFour,
            });
            resolve(parsed);
          }
        }
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          logger.error('Terminal connection error', err as Error, { address, port: terminalPort });
          reject(err);
        }
      });

      client.on('close', () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          if (responseData.length > 0) {
            resolve(this.parseResponse(responseData));
          } else {
            reject(new Error('Connection closed without response'));
          }
        }
      });
    });
  }

  async cancelPayment(address: string, port?: number): Promise<{ success: boolean; reason?: string }> {
    const terminalPort = port || 9100;
    logger.info('Sending cancel to terminal', { address, port: terminalPort });

    return new Promise((resolve) => {
      const client = new net.Socket();
      const timer = setTimeout(() => {
        client.destroy();
        resolve({ success: false, reason: 'timeout' });
      }, 5000);

      client.connect(terminalPort, address, () => {
        const payload = JSON.stringify({ type: 'cancel', timestamp: new Date().toISOString() });
        const header = Buffer.alloc(4);
        header.writeUInt32BE(payload.length, 0);
        client.write(Buffer.concat([header, Buffer.from(payload, 'utf-8')]));
        clearTimeout(timer);
        client.end();
        resolve({ success: true });
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        resolve({ success: false, reason: (err as Error).message });
      });
    });
  }

  private buildPayload(amount: number, transactionType?: string): Buffer {
    const type = transactionType || 'sale';
    const amountStr = amount.toString().padStart(12, '0');
    const payload = {
      type,
      amount: amountStr,
      currency: 'USD',
      timestamp: new Date().toISOString(),
    };
    const jsonStr = JSON.stringify(payload);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(jsonStr.length, 0);
    return Buffer.concat([header, Buffer.from(jsonStr, 'utf-8')]);
  }

  private parseResponse(buffer: Buffer): TerminalResponse {
    try {
      const text = buffer.toString('utf-8').trim();
      if (!text) return { complete: false };

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          json = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
        } else {
          return { complete: false };
        }
      }

      return {
        complete: true,
        approved: json.approved || json.status === 'approved' || json.responseCode === '00',
        authCode: json.authCode || json.authorization_code || json.approvalCode,
        transactionId: json.transactionId || json.reference || json.referenceNumber,
        cardType: json.cardType || json.card_brand || json.cardBrand,
        lastFour: json.lastFour || json.last4 || json.maskedPan?.slice(-4),
        entryMethod: json.entryMethod || json.entry_mode || 'chip',
        tipAmount: json.tipAmount || json.tip || 0,
        totalAmount: json.totalAmount || json.total,
        responseCode: json.responseCode || json.response_code,
        responseMessage: json.responseMessage || json.message || json.status,
        raw: json,
      };
    } catch {
      return { complete: false };
    }
  }
}

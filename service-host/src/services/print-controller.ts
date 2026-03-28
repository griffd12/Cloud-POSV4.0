/**
 * Print Controller
 * 
 * Handles all printing operations:
 * - Receipt printing
 * - Kitchen tickets
 * - Reports
 * 
 * Sends print jobs to network printers via TCP/IP.
 */

import { Database } from '../db/database.js';
import { randomUUID } from 'crypto';
import net from 'net';

export class PrintController {
  private db: Database;
  private printTimeout: number = 10000;
  private processingQueue: boolean = false;
  private agentId: string;
  
  constructor(db: Database) {
    this.db = db;
    this.agentId = randomUUID();
    
    // Start queue processor
    setInterval(() => this.processQueue(), 2000);
    
    // Start lease recovery processor (every 15 seconds)
    setInterval(() => this.recoverExpiredLeases(), 15000);
  }
  
  // Submit a print job
  async submitJob(params: PrintJobParams): Promise<PrintJob> {
    const id = randomUUID();
    
    // Get printer info
    const printer = this.db.getPrinter(params.printerId);
    const printerIp = params.printerIp || printer?.ipAddress;
    const printerPort = params.printerPort || printer?.port || 9100;
    
    if (!printerIp) {
      throw new Error(`No IP address for printer: ${params.printerId}`);
    }
    
    // Build ESC/POS content
    const content = this.buildPrintContent(params.jobType, params.content);
    
    this.db.run(
      `INSERT INTO print_queue (id, printer_id, printer_ip, printer_port, job_type, content, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [id, params.printerId, printerIp, printerPort, params.jobType, content]
    );
    
    const job: PrintJob = {
      id,
      printerId: params.printerId,
      printerIp,
      printerPort,
      jobType: params.jobType,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    // Try to print immediately
    this.processQueue();
    
    return job;
  }
  
  // Get job status
  getJob(id: string): PrintJob | null {
    const row = this.db.get<PrintJobRow>(
      'SELECT * FROM print_queue WHERE id = ?',
      [id]
    );
    
    if (!row) return null;
    
    return {
      id: row.id,
      printerId: row.printer_id,
      printerIp: row.printer_ip,
      printerPort: row.printer_port,
      jobType: row.job_type,
      status: row.status as PrintJob['status'],
      error: row.error || undefined,
      createdAt: row.created_at,
    };
  }
  
  // Process pending print jobs using lease-based claiming
  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;
    
    try {
      // Claim and process up to 5 jobs
      for (let i = 0; i < 5; i++) {
        const job = this.db.claimPrintJob(this.agentId);
        if (!job) break; // No more jobs to claim
        
        await this.printJob(job);
      }
    } finally {
      this.processingQueue = false;
    }
  }

  // Recover jobs with expired leases (run periodically)
  private recoverExpiredLeases(): void {
    const recoveredCount = this.db.recoverExpiredLeases();
    if (recoveredCount > 0) {
      console.log(`[PrintController] Recovered ${recoveredCount} expired lease(s)`);
    }
  }
  
  private async printJob(job: PrintJobRow): Promise<void> {
    try {
      await this.sendToPrinter(job.printer_ip, job.printer_port, job.content);
      
      // Acknowledge successful completion
      this.db.ackPrintJob(job.id, true);
      console.log(`Print job ${job.id} completed`);
    } catch (e) {
      const error = (e as Error).message;
      console.error(`Print job ${job.id} failed:`, error);
      
      // Acknowledge failure and release lease for retry
      this.db.ackPrintJob(job.id, false, error);
    }
  }
  
  private sendToPrinter(ip: string, port: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let connected = false;
      
      const timeout = setTimeout(() => {
        if (!connected) {
          socket.destroy();
          reject(new Error(`Connection timeout to ${ip}:${port}`));
        }
      }, this.printTimeout);
      
      socket.connect(port, ip, () => {
        connected = true;
        clearTimeout(timeout);
        console.log(`Connected to printer at ${ip}:${port}`);
        
        socket.write(data, (err) => {
          if (err) {
            socket.destroy();
            reject(new Error(`Write error: ${err.message}`));
          } else {
            setTimeout(() => {
              socket.end();
              resolve();
            }, 500);
          }
        });
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Socket error: ${err.message}`));
      });
    });
  }
  
  private buildPrintContent(jobType: string, content: any): Buffer {
    const b = new ESCPOSBuilder();

    if (jobType === 'receipt') {
      this.buildReceiptContent(b, content);
    } else if (jobType === 'kitchen') {
      this.buildKitchenTicketContent(b, content);
    } else if (jobType === 'report') {
      this.buildReportContent(b, content);
    }

    b.cut();
    return b.build();
  }

  private buildReceiptContent(b: ESCPOSBuilder, content: any): void {
    if (content.cashDrawer) {
      b.kickDrawer();
    }

    b.center();
    if (content.header) {
      b.bold(true).doubleSize(true).text(content.header).newLine().doubleSize(false).bold(false);
    }
    if (content.rvcHeader) {
      b.text(content.rvcHeader).newLine();
    }
    if (content.dateTime) {
      b.text(content.dateTime).newLine();
    }
    if (content.orderType) {
      b.bold(true).text(`** ${content.orderType.toUpperCase()} **`).newLine().bold(false);
    }
    if (content.checkNumber) {
      b.text(`Check #${content.checkNumber}`).newLine();
    }
    if (content.serverName) {
      b.text(`Server: ${content.serverName}`).newLine();
    }

    b.separator();
    b.left();

    if (content.items && Array.isArray(content.items)) {
      for (const item of content.items) {
        const qty = item.quantity || 1;
        const name = item.name || '';
        const price = formatMoney(item.total || item.price || 0);
        b.threeColumn(`${qty}x`, name, price);

        if (item.modifiers && Array.isArray(item.modifiers)) {
          for (const mod of item.modifiers) {
            const modName = mod.name || mod;
            const modPrice = mod.price ? formatMoney(mod.price) : '';
            b.threeColumn('', `  ${modName}`, modPrice);
          }
        }
      }
    }

    b.separator();

    if (content.discounts && Array.isArray(content.discounts)) {
      for (const d of content.discounts) {
        b.threeColumn('', d.name || 'Discount', `-${formatMoney(d.amount || 0)}`);
      }
    }
    if (content.serviceCharges && Array.isArray(content.serviceCharges)) {
      for (const sc of content.serviceCharges) {
        b.threeColumn('', sc.name || 'Service Charge', formatMoney(sc.amount || 0));
      }
    }

    if (content.totals) {
      b.right();
      if (content.totals.subtotal !== undefined) {
        b.text(`Subtotal: ${formatMoney(content.totals.subtotal)}`).newLine();
      }
      if (content.totals.tax !== undefined) {
        b.text(`Tax: ${formatMoney(content.totals.tax)}`).newLine();
      }
      if (content.totals.total !== undefined) {
        b.bold(true).text(`TOTAL: ${formatMoney(content.totals.total)}`).newLine().bold(false);
      }
      if (content.totals.tip !== undefined) {
        b.text(`Tip: ${formatMoney(content.totals.tip)}`).newLine();
      }
    }

    b.center().newLine();
    if (content.rvcTrailer) {
      b.text(content.rvcTrailer).newLine();
    }
    b.text(content.footer || 'Thank you!').newLine().newLine();
  }

  private buildKitchenTicketContent(b: ESCPOSBuilder, content: any): void {
    b.center().doubleSize(true);
    if (content.orderType) {
      b.text(content.orderType.toUpperCase()).newLine();
    }
    if (content.checkNumber) {
      b.text(`#${content.checkNumber}`).newLine();
    }
    b.doubleSize(false);

    if (content.stationName) {
      b.bold(true).text(content.stationName).newLine().bold(false);
    }
    if (content.tableNumber) {
      b.text(`Table: ${content.tableNumber}`).newLine();
    }
    if (content.serverName) {
      b.text(`Server: ${content.serverName}`).newLine();
    }

    b.separator('=');
    b.left();

    if (content.items && Array.isArray(content.items)) {
      for (const item of content.items) {
        const qty = item.quantity || 1;
        const name = item.name || '';
        b.bold(true).text(`${qty}x ${name}`).bold(false).newLine();

        if (item.modifiers && Array.isArray(item.modifiers)) {
          for (const mod of item.modifiers) {
            b.text(`   > ${mod.name || mod}`).newLine();
          }
        }
        b.newLine();
      }
    }

    b.center();
    b.text(new Date().toLocaleTimeString()).newLine().newLine();
  }

  private buildReportContent(b: ESCPOSBuilder, content: any): void {
    b.center();
    if (content.title) {
      b.bold(true).text(content.title).newLine().bold(false);
    }
    b.separator('=');
    b.left();

    if (content.lines && Array.isArray(content.lines)) {
      for (const line of content.lines) {
        b.text(line).newLine();
      }
    }
    b.newLine();
  }
}

class ESCPOSBuilder {
  private buf: number[] = [];
  private lineWidth = 42;

  constructor() {
    this.buf.push(0x1B, 0x40);
  }

  text(s: string): this {
    for (const c of s) this.buf.push(c.charCodeAt(0) & 0xFF);
    return this;
  }

  newLine(): this {
    this.buf.push(0x0A);
    return this;
  }

  left(): this { this.buf.push(0x1B, 0x61, 0x00); return this; }
  center(): this { this.buf.push(0x1B, 0x61, 0x01); return this; }
  right(): this { this.buf.push(0x1B, 0x61, 0x02); return this; }

  bold(on: boolean): this {
    this.buf.push(0x1B, 0x45, on ? 0x01 : 0x00);
    return this;
  }

  doubleSize(on: boolean): this {
    this.buf.push(0x1D, 0x21, on ? 0x11 : 0x00);
    return this;
  }

  separator(ch = '-'): this {
    this.left();
    this.text(ch.repeat(this.lineWidth));
    this.newLine();
    return this;
  }

  threeColumn(left: string, middle: string, right: string): this {
    this.left();
    const lw = Math.min(left.length, 4);
    const rw = Math.max(right.length, 8);
    const mw = this.lineWidth - lw - rw - 2;
    const l = left.padEnd(lw);
    const m = middle.length > mw ? middle.substring(0, mw) : middle.padEnd(mw);
    const r = right.padStart(rw);
    this.text(`${l} ${m} ${r}`);
    this.newLine();
    return this;
  }

  kickDrawer(pin = 0): this {
    this.buf.push(0x1B, 0x70, pin, 0x19, 0xFA);
    return this;
  }

  cut(): this {
    this.buf.push(0x1D, 0x56, 0x00);
    return this;
  }

  build(): Buffer {
    return Buffer.from(this.buf);
  }
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface PrintJobParams {
  printerId: string;
  printerIp?: string;
  printerPort?: number;
  jobType: 'receipt' | 'kitchen' | 'report';
  content: any;
}

interface PrintJob {
  id: string;
  printerId: string;
  printerIp: string;
  printerPort: number;
  jobType: string;
  status: 'pending' | 'printing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
}

interface PrintJobRow {
  id: string;
  printer_id: string;
  printer_ip: string;
  printer_port: number;
  job_type: string;
  content: Buffer;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
}

export type { PrintJob, PrintJobParams };

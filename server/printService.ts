import * as net from "net";
import { db } from "./db";
import { printers, printJobs, checks, checkItems, checkPayments, employees, properties, rvcs } from "@shared/schema";
import { eq, and, or, isNull, desc } from "drizzle-orm";
import { storage } from "./storage";

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const ESCPOS = {
  INIT: Buffer.from([ESC, 0x40]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_HEIGHT: Buffer.from([GS, 0x21, 0x10]),
  DOUBLE_WIDTH: Buffer.from([GS, 0x21, 0x20]),
  DOUBLE_SIZE: Buffer.from([GS, 0x21, 0x30]),
  NORMAL_SIZE: Buffer.from([GS, 0x21, 0x00]),
  UNDERLINE_ON: Buffer.from([ESC, 0x2D, 0x01]),
  UNDERLINE_OFF: Buffer.from([ESC, 0x2D, 0x00]),
  CUT_PARTIAL: Buffer.from([GS, 0x56, 0x01]),
  CUT_FULL: Buffer.from([GS, 0x56, 0x00]),
  FEED_LINES: (n: number) => Buffer.from([ESC, 0x64, n]),
  CASH_DRAWER: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]),
};

export interface ReceiptLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  doubleHeight?: boolean;
  doubleWidth?: boolean;
  underline?: boolean;
}

export class ESCPOSBuilder {
  private buffer: Buffer[] = [];
  private charWidth: number;

  constructor(charWidth: number = 42) {
    this.charWidth = charWidth;
    this.buffer.push(ESCPOS.INIT);
  }

  align(alignment: "left" | "center" | "right"): this {
    switch (alignment) {
      case "left": this.buffer.push(ESCPOS.ALIGN_LEFT); break;
      case "center": this.buffer.push(ESCPOS.ALIGN_CENTER); break;
      case "right": this.buffer.push(ESCPOS.ALIGN_RIGHT); break;
    }
    return this;
  }

  bold(on: boolean = true): this {
    this.buffer.push(on ? ESCPOS.BOLD_ON : ESCPOS.BOLD_OFF);
    return this;
  }

  doubleHeight(on: boolean = true): this {
    this.buffer.push(on ? ESCPOS.DOUBLE_HEIGHT : ESCPOS.NORMAL_SIZE);
    return this;
  }

  doubleWidth(on: boolean = true): this {
    this.buffer.push(on ? ESCPOS.DOUBLE_WIDTH : ESCPOS.NORMAL_SIZE);
    return this;
  }

  doubleSize(on: boolean = true): this {
    this.buffer.push(on ? ESCPOS.DOUBLE_SIZE : ESCPOS.NORMAL_SIZE);
    return this;
  }

  normalSize(): this {
    this.buffer.push(ESCPOS.NORMAL_SIZE);
    return this;
  }

  underline(on: boolean = true): this {
    this.buffer.push(on ? ESCPOS.UNDERLINE_ON : ESCPOS.UNDERLINE_OFF);
    return this;
  }

  text(str: string): this {
    this.buffer.push(Buffer.from(str, "utf8"));
    return this;
  }

  newLine(): this {
    this.buffer.push(Buffer.from([LF]));
    return this;
  }

  line(str: string): this {
    return this.text(str).newLine();
  }

  feed(lines: number = 1): this {
    this.buffer.push(ESCPOS.FEED_LINES(lines));
    return this;
  }

  separator(char: string = "-"): this {
    return this.line(char.repeat(this.charWidth));
  }

  doubleSeparator(char: string = "="): this {
    return this.line(char.repeat(this.charWidth));
  }

  leftRight(left: string, right: string): this {
    const spaces = this.charWidth - left.length - right.length;
    const padded = left + " ".repeat(Math.max(1, spaces)) + right;
    return this.line(padded.substring(0, this.charWidth));
  }

  threeColumn(left: string, center: string, right: string): this {
    const colWidth = Math.floor(this.charWidth / 3);
    const leftPad = left.substring(0, colWidth).padEnd(colWidth);
    const centerPad = center.substring(0, colWidth).padStart(Math.floor(colWidth/2) + Math.floor(center.length/2)).padEnd(colWidth);
    const rightPad = right.substring(0, colWidth).padStart(colWidth);
    return this.line(leftPad + centerPad + rightPad);
  }

  cut(partial: boolean = true): this {
    this.feed(3);
    this.buffer.push(partial ? ESCPOS.CUT_PARTIAL : ESCPOS.CUT_FULL);
    return this;
  }

  openCashDrawer(pin: number = 0x00, pulseOn: number = 0x19, pulseOff: number = 0xFA): this {
    // Robust drawer kick sequence:
    // 1. ESC @ (0x1B 0x40) - Re-initialize printer, ensures clean state for drawer command
    // 2. BEL (0x07) - Star Line Mode drawer kick (works on Star printers regardless of emulation)
    // 3. ESC p pin pulseOn pulseOff - Standard ESC/POS drawer kick
    // Both BEL and ESC p are sent so the drawer fires on Star printers in either mode
    this.buffer.push(Buffer.from([0x1B, 0x40, 0x07, 0x1B, 0x70, pin, pulseOn, pulseOff]));
    return this;
  }

  raw(data: Buffer): this {
    this.buffer.push(data);
    return this;
  }

  build(): Buffer {
    return Buffer.concat(this.buffer);
  }

  toBase64(): string {
    return this.build().toString("base64");
  }

  toPlainText(): string {
    let text = "";
    for (const buf of this.buffer) {
      const isCommand = buf.length > 0 && (buf[0] === ESC || buf[0] === GS);
      if (!isCommand) {
        text += buf.toString("utf8");
      }
    }
    return text;
  }
}

// Format currency for receipts
function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `$${num.toFixed(2)}`;
}

// Format date/time for receipts with timezone support
function formatDateTime(date: Date | string | null, timezone?: string): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    timeZone: timezone || "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Build check receipt
export async function buildCheckReceipt(checkId: string, charWidth: number = 42): Promise<ESCPOSBuilder> {
  const builder = new ESCPOSBuilder(charWidth);

  const [check] = await db
    .select()
    .from(checks)
    .where(eq(checks.id, checkId))
    .limit(1);

  if (!check) {
    builder.align("center").bold().line("CHECK NOT FOUND").bold(false);
    return builder;
  }

  // Get RVC first, then property from RVC
  const [rvc] = check.rvcId
    ? await db.select().from(rvcs).where(eq(rvcs.id, check.rvcId)).limit(1)
    : [null];

  const [property] = rvc?.propertyId
    ? await db.select().from(properties).where(eq(properties.id, rvc.propertyId)).limit(1)
    : [null];

  const [employee] = check.employeeId
    ? await db.select().from(employees).where(eq(employees.id, check.employeeId)).limit(1)
    : [null];

  const items = await db
    .select()
    .from(checkItems)
    .where(and(eq(checkItems.checkId, checkId), eq(checkItems.voided, false)));

  const payments = await db
    .select()
    .from(checkPayments)
    .where(eq(checkPayments.checkId, checkId));

  // Get effective descriptors for this RVC (or use defaults)
  let headerLines: string[] = [];
  let trailerLines: string[] = [];
  
  if (check.rvcId) {
    const descriptors = await storage.getEffectiveDescriptors(check.rvcId);
    headerLines = descriptors.headerLines || [];
    trailerLines = descriptors.trailerLines || [];
  }

  const tz = property?.timezone || "America/Los_Angeles";

  // ── HEADER: Store name / branding ──
  builder.align("center");

  if (headerLines.length > 0) {
    // First non-empty header line gets bold double-height (store name)
    let firstLine = true;
    for (const line of headerLines) {
      if (line && line.trim()) {
        if (firstLine) {
          builder.bold().doubleHeight().line(line).doubleHeight(false).bold(false);
          firstLine = false;
        } else {
          builder.line(line);
        }
      }
    }
  } else {
    if (property) {
      builder.bold().doubleHeight().line(property.name).doubleHeight(false).bold(false);
    }
    if (property?.address) {
      builder.line(property.address);
    }
  }

  builder.newLine();
  builder.doubleSeparator();

  // ── CHECK INFO: number, RVC, server, dates ──
  builder.align("center");
  builder.bold().line(`Check #${check.checkNumber}`).bold(false);

  if (rvc) {
    builder.line(rvc.name);
  }

  builder.align("left");
  if (employee) {
    builder.line(`Server: ${employee.firstName} ${employee.lastName}`);
  }
  builder.line(`Opened: ${formatDateTime(check.openedAt, tz)}`);
  if (check.closedAt) {
    builder.line(`Closed: ${formatDateTime(check.closedAt, tz)}`);
  }
  if (check.tableNumber) {
    builder.line(`Table: ${check.tableNumber}`);
  }

  builder.doubleSeparator();

  // ── ORDER TYPE BANNER ──
  const orderTypeLabel = (check.orderType || "dine_in").replace(/_/g, " ").toUpperCase();
  builder.align("center").bold().line(orderTypeLabel).bold(false);

  builder.separator();

  // ── ITEMS ──
  builder.align("left");
  for (const item of items) {
    const qty = item.quantity || 1;
    const unitPrice = parseFloat(item.unitPrice || "0");
    const lineTotal = qty * unitPrice;

    builder.bold().leftRight(
      `${qty} ${item.menuItemName}`.substring(0, charWidth - 10),
      formatCurrency(lineTotal)
    ).bold(false);

    if (item.modifiers && Array.isArray(item.modifiers)) {
      for (const mod of item.modifiers as any[]) {
        const modPrice = parseFloat(mod.priceDelta || "0");
        if (modPrice !== 0) {
          builder.leftRight(`  ${mod.name}`, formatCurrency(modPrice));
        } else {
          builder.line(`  ${mod.name}`);
        }
      }
    }
  }

  builder.separator();

  // ── TOTALS ──
  const subtotal = parseFloat(check.subtotal || "0");
  const discountTotal = parseFloat(check.discountTotal || "0");
  const serviceChargeTotal = parseFloat(check.serviceChargeTotal || "0");
  const taxTotal = parseFloat(check.taxTotal || "0");
  const tipTotal = parseFloat(check.tipTotal || "0");
  const total = parseFloat(check.total || "0");

  builder.leftRight("Subtotal", formatCurrency(subtotal));

  if (discountTotal > 0) {
    builder.leftRight("Discounts", `-${formatCurrency(discountTotal)}`);
  }

  if (serviceChargeTotal > 0) {
    builder.leftRight("Service Charge", formatCurrency(serviceChargeTotal));
  }

  builder.leftRight("Tax", formatCurrency(taxTotal));

  if (tipTotal > 0) {
    builder.leftRight("Tip", formatCurrency(tipTotal));
  }

  builder.newLine();
  builder.bold().doubleHeight();
  builder.leftRight("Total", formatCurrency(total));
  builder.doubleHeight(false).bold(false);

  // ── PAYMENTS ──
  if (payments.length > 0) {
    builder.separator();
    let totalTendered = 0;
    for (const payment of payments) {
      const amount = parseFloat(payment.amount || "0");
      const tip = parseFloat(payment.tipAmount || "0");
      totalTendered += amount;
      builder.bold().leftRight(payment.tenderName || "Payment", formatCurrency(amount)).bold(false);
      if (tip > 0) {
        builder.leftRight("  Tip", formatCurrency(tip));
      }
    }

    const changeDue = totalTendered - total;
    if (changeDue > 0.01) {
      builder.leftRight("Change", formatCurrency(changeDue));
    }
  }

  builder.newLine();
  builder.doubleSeparator();

  // ── FOOTER / TRAILER ──
  builder.align("center");

  if (trailerLines.length > 0) {
    for (const line of trailerLines) {
      if (line && line.trim()) {
        builder.line(line);
      }
    }
  } else {
    builder.line("Thank you for your visit!");
  }

  builder.newLine();
  builder.line(formatDateTime(new Date(), tz));
  builder.line(`#${check.checkNumber}`);

  return builder;
}

// Build kitchen ticket (for KDS printing)
export function buildKitchenTicket(
  orderNumber: string,
  items: Array<{ name: string; qty: number; modifiers?: string[] }>,
  orderType: string,
  tableNumber?: string,
  charWidth: number = 42,
  timezone?: string
): ESCPOSBuilder {
  const builder = new ESCPOSBuilder(charWidth);

  // Header
  builder.align("center").bold().doubleSize();
  builder.line(`ORDER #${orderNumber}`);
  builder.normalSize();
  builder.line(orderType.toUpperCase());
  if (tableNumber) {
    builder.line(`TABLE: ${tableNumber}`);
  }
  builder.bold(false);
  builder.line(formatDateTime(new Date(), timezone));
  builder.separator();

  // Items
  builder.align("left").doubleHeight();
  for (const item of items) {
    builder.bold().line(`${item.qty}x ${item.name}`).bold(false);
    if (item.modifiers && item.modifiers.length > 0) {
      builder.normalSize();
      for (const mod of item.modifiers) {
        builder.line(`   ** ${mod}`);
      }
      builder.doubleHeight();
    }
  }

  builder.normalSize();
  builder.doubleSeparator();
  builder.cut();

  return builder;
}

// Network TCP printing (port 9100)
export async function printToNetworkPrinter(
  ipAddress: string,
  port: number,
  data: Buffer,
  timeout: number = 5000
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.on("connect", () => {
      socket.write(data, (err) => {
        if (err) {
          cleanup();
          resolve({ success: false, error: err.message });
        } else {
          socket.end(() => {
            cleanup();
            resolve({ success: true });
          });
        }
      });
    });

    socket.on("error", (err) => {
      cleanup();
      resolve({ success: false, error: err.message });
    });

    socket.on("timeout", () => {
      cleanup();
      resolve({ success: false, error: "Connection timeout" });
    });

    socket.connect(port, ipAddress);
  });
}

// Get printer by ID with connection info
export async function getPrinter(printerId: string) {
  const [printer] = await db
    .select()
    .from(printers)
    .where(eq(printers.id, printerId))
    .limit(1);
  return printer;
}

// Find receipt printer for a property/workstation
export async function findReceiptPrinter(propertyId: string, workstationId?: string) {
  if (workstationId) {
    const { workstations } = await import("@shared/schema");
    const [ws] = await db.select().from(workstations).where(eq(workstations.id, workstationId)).limit(1);
    if (ws?.defaultReceiptPrinterId) {
      const [wsPrinter] = await db.select().from(printers).where(
        and(eq(printers.id, ws.defaultReceiptPrinterId), eq(printers.active, true))
      ).limit(1);
      if (wsPrinter) return wsPrinter;
    }
  }

  const result = await db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.propertyId, propertyId),
        eq(printers.printerType, "receipt"),
        eq(printers.active, true)
      )
    )
    .limit(1);
  
  return result[0] || null;
}

// Create a print job
export async function createPrintJob(
  propertyId: string,
  jobType: string,
  escPosData: string,
  plainTextData: string,
  options: {
    printerId?: string;
    workstationId?: string;
    checkId?: string;
    employeeId?: string;
    businessDate?: string;
    priority?: number;
  } = {}
) {
  const [job] = await db
    .insert(printJobs)
    .values({
      propertyId,
      printerId: options.printerId,
      workstationId: options.workstationId,
      jobType,
      status: "pending",
      priority: options.priority || 5,
      checkId: options.checkId,
      employeeId: options.employeeId,
      businessDate: options.businessDate,
      escPosData,
      plainTextData,
      attempts: 0,
      maxAttempts: 3,
    })
    .returning();

  return job;
}

// Process pending print jobs for network printers
export async function processPendingPrintJobs() {
  const pendingJobs = await db
    .select()
    .from(printJobs)
    .where(
      and(
        eq(printJobs.status, "pending"),
        or(
          isNull(printJobs.expiresAt),
          // Can't directly compare with now in drizzle easily, skip for now
        )
      )
    )
    .orderBy(printJobs.priority, printJobs.createdAt)
    .limit(10);

  for (const job of pendingJobs) {
    if (!job.printerId || !job.escPosData) continue;

    const printer = await getPrinter(job.printerId);
    if (!printer || printer.connectionType !== "network" || !printer.ipAddress) continue;

    // Mark as printing
    await db
      .update(printJobs)
      .set({ status: "printing", attempts: (job.attempts || 0) + 1 })
      .where(eq(printJobs.id, job.id));

    const data = Buffer.from(job.escPosData, "base64");
    const result = await printToNetworkPrinter(
      printer.ipAddress,
      printer.port || 9100,
      data
    );

    if (result.success) {
      await db
        .update(printJobs)
        .set({ status: "completed", printedAt: new Date() })
        .where(eq(printJobs.id, job.id));

      // Update printer online status
      await db
        .update(printers)
        .set({ isOnline: true, lastSeenAt: new Date() })
        .where(eq(printers.id, printer.id));
    } else {
      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = job.maxAttempts || 3;

      await db
        .update(printJobs)
        .set({
          status: attempts >= maxAttempts ? "failed" : "pending",
          lastError: result.error,
        })
        .where(eq(printJobs.id, job.id));

      // Update printer offline status
      await db
        .update(printers)
        .set({ isOnline: false })
        .where(eq(printers.id, printer.id));
    }
  }
}

// WebSocket print agent types
export interface PrintAgentMessage {
  type: "print" | "status" | "ping";
  jobId?: string;
  printerId?: string;
  data?: string; // Base64 ESC/POS data
  printerType?: string; // serial, usb
  port?: string; // COM port for serial
}

export interface PrintAgentResponse {
  type: "result" | "status" | "pong";
  jobId?: string;
  success?: boolean;
  error?: string;
  printers?: Array<{ name: string; type: string; port?: string }>;
}

// Export for use in routes
export { ESCPOS };

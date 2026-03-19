/**
 * CAPS - Check And Posting Service
 * 
 * Core service for order management:
 * - Create/modify checks
 * - Add items with modifiers
 * - Send to kitchen (rounds)
 * - Apply payments
 * - Close checks
 */

import { Database } from '../db/database.js';
import { TransactionSync } from '../sync/transaction-sync.js';
import { randomUUID } from 'crypto';

export class CapsService {
  db: Database;
  transactionSync: TransactionSync;
  private checkNumberSequence: number = 1;
  private defaultLockDuration: number = 300;
  private deviceId: string = 'unknown';
  private configVersion: string | null = null;
  
  constructor(db: Database, transactionSync: TransactionSync) {
    this.db = db;
    this.transactionSync = transactionSync;
    
    // Initialize check number from last used
    const lastCheck = this.db.get<{ check_number: number }>(
      'SELECT MAX(check_number) as check_number FROM checks'
    );
    if (lastCheck?.check_number) {
      this.checkNumberSequence = lastCheck.check_number + 1;
    }
  }
  
  setDeviceId(deviceId: string): void {
    this.deviceId = deviceId;
  }
  
  setConfigVersion(version: string): void {
    this.configVersion = version;
  }
  
  writeJournal(checkId: string, txnGroupId: string, rvcId: string, eventType: string, payload: any): void {
    const businessDate = this.getBusinessDate();
    this.db.writeJournalEntry({
      eventId: randomUUID(),
      txnGroupId,
      deviceId: this.deviceId,
      rvcId,
      businessDate,
      checkId,
      eventType,
      payloadJson: JSON.stringify(payload),
      configVersion: this.configVersion || undefined,
    });
  }
  
  private getBusinessDate(): string {
    return new Date().toISOString().split('T')[0];
  }
  
  getTxnGroupId(checkId: string): string {
    const row = this.db.get<{ txn_group_id: string | null }>('SELECT txn_group_id FROM checks WHERE id = ?', [checkId]);
    return row?.txn_group_id || checkId;
  }
  
  // ============================================================================
  // CHECK LOCKING - Prevents multiple workstations from editing same check
  // ============================================================================
  
  // Acquire lock on a check (required before editing)
  acquireLock(checkId: string, workstationId: string, employeeId: string): { success: boolean; lockedBy?: string } {
    const success = this.db.acquireLock(checkId, workstationId, employeeId, this.defaultLockDuration);
    
    if (!success) {
      const lock = this.db.getLock(checkId);
      return { success: false, lockedBy: lock?.workstationId };
    }
    
    return { success: true };
  }
  
  // Release lock on a check
  releaseLock(checkId: string, workstationId: string): void {
    this.db.releaseLock(checkId, workstationId);
  }
  
  // Get current lock info
  getLockInfo(checkId: string): { locked: boolean; workstationId?: string; employeeId?: string; expiresAt?: string } {
    const lock = this.db.getLock(checkId);
    if (!lock) {
      return { locked: false };
    }
    return {
      locked: true,
      workstationId: lock.workstationId,
      employeeId: lock.employeeId,
      expiresAt: lock.expiresAt,
    };
  }
  
  // Release all locks for a workstation (on disconnect/logout)
  releaseAllLocks(workstationId: string): void {
    this.db.releaseAllLocks(workstationId);
  }
  
  // Refresh lock (extend expiration)
  refreshLock(checkId: string, workstationId: string, employeeId: string): boolean {
    return this.db.acquireLock(checkId, workstationId, employeeId, this.defaultLockDuration);
  }
  
  // Validate that workstation has lock before editing
  private validateLock(checkId: string, workstationId?: string): void {
    if (!workstationId) return; // Skip validation if no workstation ID provided
    
    const lock = this.db.getLock(checkId);
    if (lock && lock.workstationId !== workstationId) {
      throw new Error(`Check is locked by another workstation: ${lock.workstationId}`);
    }
  }
  
  // ============================================================================
  // CHECK NUMBER RANGES - For offline operation without duplicates
  // ============================================================================
  
  // Get next check number for a workstation (uses assigned range)
  getNextCheckNumber(workstationId?: string): number {
    if (workstationId) {
      const rangeNumber = this.db.getNextCheckNumber(workstationId);
      if (rangeNumber !== null) {
        return rangeNumber;
      }
    }
    // Fall back to global sequence
    return this.checkNumberSequence++;
  }
  
  // Configure check number range for a workstation
  setCheckNumberRange(workstationId: string, start: number, end: number): void {
    this.db.setWorkstationConfig(workstationId, start, end);
  }
  
  createCheck(params: CreateCheckParams): Check {
    const id = randomUUID();
    const txnGroupId = randomUUID();
    const checkNumber = this.getNextCheckNumber(params.workstationId);
    const businessDate = this.getBusinessDate();
    
    this.db.run(
      `INSERT INTO checks (id, txn_group_id, check_number, rvc_id, employee_id, workstation_id, order_type, table_number, guest_count, status, business_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [id, txnGroupId, checkNumber, params.rvcId, params.employeeId, params.workstationId || null, params.orderType || 'dine_in', params.tableNumber, params.guestCount || 1, businessDate]
    );
    
    const check = this.getCheck(id)!;
    
    this.writeJournal(id, txnGroupId, params.rvcId, 'check_opened', {
      checkNumber,
      employeeId: params.employeeId,
      orderType: params.orderType || 'dine_in',
      tableNumber: params.tableNumber,
      guestCount: params.guestCount || 1,
      workstationId: params.workstationId,
    });
    
    this.transactionSync.queueCheck(id, 'create', check);
    
    return check;
  }
  
  // Get check by ID
  getCheck(id: string): Check | null {
    const row = this.db.get<CheckRow>(
      'SELECT * FROM checks WHERE id = ?',
      [id]
    );
    
    if (!row) return null;
    
    const items = this.getCheckItems(id);
    const payments = this.getCheckPayments(id);
    
    return {
      id: row.id,
      txnGroupId: row.txn_group_id || row.id,
      checkNumber: row.check_number,
      rvcId: row.rvc_id,
      employeeId: row.employee_id,
      orderType: row.order_type,
      tableNumber: row.table_number || undefined,
      guestCount: row.guest_count,
      status: row.status as 'open' | 'closed' | 'voided',
      subtotal: row.subtotal || 0,
      tax: row.tax || 0,
      total: row.total || 0,
      discountTotal: row.discount_total || 0,
      serviceChargeTotal: row.service_charge_total || 0,
      amountDue: row.amount_due || 0,
      currentRound: row.current_round,
      businessDate: row.business_date || undefined,
      items,
      payments,
      createdAt: row.created_at,
      closedAt: row.closed_at || undefined,
    };
  }
  
  // List open checks
  getOpenChecks(rvcId?: string): Check[] {
    let sql = 'SELECT id FROM checks WHERE status = ?';
    const params: any[] = ['open'];
    
    if (rvcId) {
      sql += ' AND rvc_id = ?';
      params.push(rvcId);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const rows = this.db.all<{ id: string }>(sql, params);
    return rows.map(r => this.getCheck(r.id)!);
  }
  
  // Add items to check
  addItems(checkId: string, items: AddItemParams[], workstationId?: string): CheckItem[] {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    if (check.status !== 'open') throw new Error('Check is not open');
    this.validateLock(checkId, workstationId);
    
    const addedItems: CheckItem[] = [];
    
    for (const item of items) {
      const id = randomUUID();
      const menuItem = this.db.getMenuItem(item.menuItemId);
      
      if (!menuItem) {
        console.warn(`Menu item not found: ${item.menuItemId}`);
        continue;
      }
      
      const rawPriceDollars = item.priceOverride != null ? item.priceOverride : (item.unitPrice != null ? item.unitPrice : null);
      let unitPrice: number;
      if (rawPriceDollars != null) {
        const parsed = typeof rawPriceDollars === 'number' ? rawPriceDollars : parseFloat(String(rawPriceDollars));
        unitPrice = Number.isFinite(parsed) ? this.db.toCents(parsed) : 0;
      } else {
        unitPrice = typeof menuItem.price === 'number' ? menuItem.price : 0;
      }
      const parsedPrice = unitPrice;
      if (!Number.isFinite(parsedPrice)) {
        console.warn(`[CAPS] addItems: unitPrice fallback to 0 for item ${menuItem.name} — rawPriceDollars=${rawPriceDollars} is not a valid number`);
      }
      const qty = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      const rawTotal = Math.round(qty * unitPrice);
      const totalPrice = Number.isFinite(rawTotal) ? rawTotal : 0;
      if (!Number.isFinite(rawTotal)) {
        console.warn(`[CAPS] addItems: totalPrice fallback to 0 for item ${menuItem.name} — qty=${item.quantity}, unitPrice=${unitPrice}`);
      }
      const modifiersJson = JSON.stringify(item.modifiers || []);
      const now = new Date().toISOString();
      
      this.db.run(
        `INSERT INTO check_items (id, check_id, round_number, menu_item_id, name, quantity, unit_price, total_price, print_class_id, tax_group_id, modifiers, modifiers_json, seat_number, sent_to_kitchen, sent, voided, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
        [
          id,
          checkId,
          check.currentRound,
          item.menuItemId,
          menuItem.name,
          qty,
          unitPrice,
          totalPrice,
          menuItem.print_class_id || null,
          menuItem.tax_group_id || null,
          modifiersJson,
          modifiersJson,
          item.seatNumber,
          now,
        ]
      );
      
      const checkItem: CheckItem = {
        id,
        checkId,
        roundNumber: check.currentRound,
        menuItemId: item.menuItemId,
        menuItemName: menuItem.name,
        name: menuItem.name,
        quantity: qty,
        unitPrice: parseFloat((unitPrice / 100).toFixed(2)),
        totalPrice: parseFloat((totalPrice / 100).toFixed(2)),
        modifiers: item.modifiers || [],
        seatNumber: item.seatNumber,
        sentToKitchen: false,
        voided: false,
      };
      addedItems.push(checkItem);
      
      this.writeJournal(checkId, check.txnGroupId, check.rvcId, 'item_added', {
        itemId: id,
        menuItemId: item.menuItemId,
        name: menuItem.name,
        quantity: item.quantity || 1,
        unitPrice,
        taxGroupId: menuItem.tax_group_id || null,
        modifiers: item.modifiers || [],
        seatNumber: item.seatNumber,
        roundNumber: check.currentRound,
      });
    }
    
    this.recalculateTotals(checkId);
    
    const updatedCheck = this.getCheck(checkId)!;
    this.transactionSync.queueCheck(checkId, 'update', updatedCheck);
    
    return addedItems;
  }
  
  sendToKitchen(checkId: string, workstationId?: string): { roundNumber: number; itemsSent: number } {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    this.validateLock(checkId, workstationId);
    
    const result = this.db.run(
      `UPDATE check_items SET sent_to_kitchen = 1 WHERE check_id = ? AND sent_to_kitchen = 0 AND voided = 0`,
      [checkId]
    );
    
    const newRound = check.currentRound + 1;
    this.db.run(
      'UPDATE checks SET current_round = ? WHERE id = ?',
      [newRound, checkId]
    );
    
    this.writeJournal(checkId, check.txnGroupId, check.rvcId, 'round_sent', {
      roundNumber: check.currentRound,
      itemsSent: result.changes,
      workstationId,
    });
    
    return {
      roundNumber: check.currentRound,
      itemsSent: result.changes,
    };
  }
  
  voidItem(checkId: string, itemId: string, reason?: string, workstationId?: string): void {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    if (check.status !== 'open') throw new Error('Check is not open');
    this.validateLock(checkId, workstationId);
    
    const item = check.items.find(i => i.id === itemId);
    
    if (item?.voided) return;
    
    this.db.run(
      'UPDATE check_items SET voided = 1, void_reason = ? WHERE id = ? AND check_id = ?',
      [reason, itemId, checkId]
    );
    
    this.writeJournal(checkId, check.txnGroupId, check.rvcId, 'item_voided', {
      itemId,
      menuItemId: item?.menuItemId,
      name: item?.name,
      quantity: item?.quantity,
      unitPrice: item?.unitPrice,
      amount: item ? item.quantity * item.unitPrice : 0,
      reason,
    });
    
    this.recalculateTotals(checkId);
  }
  
  addDiscount(checkId: string, params: {
    discountId?: string;
    checkItemId?: string;
    name: string;
    type: string;
    amount: number;
    rate?: number;
    employeeId?: string;
    managerEmployeeId?: string;
  }): { id: string; amount: number } {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');

    const id = `caps_disc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const amountCents = this.db.toCents(params.amount);

    this.db.run(
      `INSERT INTO check_discounts (id, check_id, check_item_id, discount_id, name, discount_type, amount, employee_id, manager_employee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        checkId,
        params.checkItemId || null,
        params.discountId || null,
        params.name,
        params.type,
        amountCents,
        params.employeeId || null,
        params.managerEmployeeId || null,
      ]
    );

    this.recalculateTotals(checkId);
    this.transactionSync.queueCheck(checkId, 'update', this.getCheck(checkId)!);

    return { id, amount: params.amount };
  }

  addPayment(checkId: string, params: AddPaymentParams, workstationId?: string): Payment & { popDrawer?: boolean; printCheck?: boolean } {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    if (check.status !== 'open') throw new Error('Check is not open');
    this.validateLock(checkId, workstationId);
    
    const tender = this.db.getTender(params.tenderId);
    
    if (tender) {
      if (!tender.allow_tips && (params.tip || 0) > 0) {
        throw new Error('Tips not allowed for this tender type');
      }
      
      if (!tender.allow_over_tender && params.amount > check.total) {
        throw new Error('Over-tendering not allowed for this tender type');
      }
      
      if (tender.require_manager_approval && !params.managerPin) {
        throw new Error('Manager approval required for this tender type');
      }
    }
    
    const id = randomUUID();
    
    let changeAmount = 0;
    const amountDue = check.amountDue || check.total;
    if (tender?.is_cash_media === 1 && tender?.allow_over_tender && params.amount > amountDue) {
      changeAmount = params.amount - amountDue;
    }
    
    this.db.run(
      `INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, change_amount, reference_number, status, business_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'authorized', ?)`,
      [id, checkId, params.tenderId, params.tenderType, params.amount, params.tip || 0, changeAmount, params.reference, check.businessDate || null]
    );
    
    const payment: Payment & { popDrawer?: boolean; printCheck?: boolean } = {
      id,
      checkId,
      tenderId: params.tenderId,
      tenderName: tender?.name || params.tenderType,
      tenderType: params.tenderType,
      isCashMedia: tender?.is_cash_media === 1,
      isCardMedia: tender?.is_card_media === 1,
      isGiftMedia: tender?.is_gift_media === 1,
      amount: params.amount,
      tipAmount: String(params.tip || 0),
      tip: params.tip || 0,
      changeAmount: String(changeAmount),
      reference: params.reference,
      status: 'authorized',
      paymentStatus: 'completed',
      popDrawer: tender?.pop_drawer === 1,
      printCheck: tender?.print_check_on_payment === 1,
    };
    
    this.writeJournal(checkId, check.txnGroupId, check.rvcId, 'payment_added', {
      paymentId: id,
      tenderId: params.tenderId,
      tenderType: params.tenderType,
      amount: params.amount,
      tip: params.tip || 0,
      reference: params.reference,
      isCashMedia: payment.isCashMedia,
      isCardMedia: payment.isCardMedia,
      isGiftMedia: payment.isGiftMedia,
      popDrawer: payment.popDrawer,
    });
    
    this.transactionSync.queuePayment(id, payment);
    
    this.recalculateTotals(checkId);
    
    const totalPayments = this.getTotalPayments(checkId);
    if (totalPayments >= check.total) {
      this.closeCheck(checkId);
    }
    
    return payment;
  }
  
  closeCheck(checkId: string, workstationId?: string): void {
    this.validateLock(checkId, workstationId);
    this.db.run(
      `UPDATE checks SET status = 'closed', closed_at = datetime('now') WHERE id = ?`,
      [checkId]
    );
    
    const check = this.getCheck(checkId)!;
    
    this.writeJournal(checkId, check.txnGroupId, check.rvcId, 'check_closed', {
      checkNumber: check.checkNumber,
      subtotal: check.subtotal,
      tax: check.tax,
      discountTotal: check.discountTotal,
      serviceChargeTotal: check.serviceChargeTotal,
      total: check.total,
      itemCount: check.items.length,
      paymentCount: check.payments.length,
      items: check.items.map(i => ({ id: i.id, name: i.name, qty: i.quantity, price: i.unitPrice, voided: i.voided })),
      payments: check.payments.map(p => ({ id: p.id, type: p.tenderType, amount: p.amount, tip: p.tip })),
    });
    
    this.transactionSync.queueCheck(checkId, 'update', check);
  }
  
  voidCheck(checkId: string, reason?: string, workstationId?: string): void {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    this.validateLock(checkId, workstationId);
    
    this.writeJournal(checkId, check.txnGroupId, check.rvcId, 'check_voided', {
      checkNumber: check.checkNumber,
      reason,
      originalTotal: check.total,
      itemCount: check.items.length,
    });
    
    this.db.run(
      `UPDATE checks SET status = 'voided', closed_at = datetime('now') WHERE id = ?`,
      [checkId]
    );
    
    this.db.run(
      'UPDATE check_items SET voided = 1, void_reason = ? WHERE check_id = ?',
      [reason || 'Check voided', checkId]
    );
    
    const updatedCheck = this.getCheck(checkId)!;
    this.transactionSync.queueCheck(checkId, 'update', updatedCheck);
  }
  
  reopenCheck(checkId: string): void {
    const check = this.getCheck(checkId);
    if (!check) throw new Error('Check not found');
    
    this.db.run(
      `UPDATE checks SET status = 'open', closed_at = NULL WHERE id = ?`,
      [checkId]
    );
    
    this.writeJournal(checkId, check.txnGroupId, check.rvcId, 'check_reopened', {
      checkNumber: check.checkNumber,
    });
    
    const updatedCheck = this.getCheck(checkId)!;
    this.transactionSync.queueCheck(checkId, 'update', updatedCheck);
  }
  
  // Private helpers
  private getCheckItems(checkId: string): CheckItem[] {
    const rows = this.db.all<CheckItemRow>(
      'SELECT * FROM check_items WHERE check_id = ? ORDER BY created_at',
      [checkId]
    );
    
    return rows.map(row => ({
      id: row.id,
      checkId: row.check_id,
      roundNumber: row.round_number,
      menuItemId: row.menu_item_id,
      menuItemName: row.name,
      name: row.name,
      quantity: row.quantity,
      unitPrice: parseFloat((row.unit_price / 100).toFixed(2)),
      totalPrice: parseFloat((row.total_price / 100).toFixed(2)),
      modifiers: JSON.parse(row.modifiers || '[]'),
      printClassId: row.print_class_id || null,
      seatNumber: row.seat_number || undefined,
      taxGroupId: row.tax_group_id || null,
      sent: !!row.sent,
      sentToKitchen: !!row.sent_to_kitchen,
      voided: !!row.voided,
      voidReason: row.void_reason || undefined,
      discountId: row.discount_id || null,
      discountName: row.discount_name || null,
      discountAmount: row.discount_amount ? parseFloat((row.discount_amount / 100).toFixed(2)) : 0,
      discountType: row.discount_type || null,
      itemStatus: row.voided ? 'voided' : 'active',
    }));
  }
  
  private getCheckPayments(checkId: string): Payment[] {
    const rows = this.db.all<PaymentRow>(
      'SELECT * FROM check_payments WHERE check_id = ? ORDER BY created_at',
      [checkId]
    );
    
    return rows.map(row => {
      const tender = this.db.getTender(row.tender_id);
      const rawStatus = row.status as string;
      const paymentStatus = rawStatus === 'voided' ? 'voided' : 'completed';
      return {
        id: row.id,
        checkId: row.check_id,
        tenderId: row.tender_id,
        tenderName: tender?.name || row.tender_type || 'Payment',
        tenderType: row.tender_type,
        isCashMedia: tender?.is_cash_media === 1,
        isCardMedia: tender?.is_card_media === 1,
        isGiftMedia: tender?.is_gift_media === 1,
        amount: String(row.amount || 0),
        tipAmount: String(row.tip_amount || 0),
        tip: row.tip_amount || 0,
        changeAmount: String(row.change_amount || 0),
        reference: row.reference_number || undefined,
        status: rawStatus,
        paymentStatus,
      };
    });
  }
  
  private getTotalPayments(checkId: string): number {
    const result = this.db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount - change_amount), 0) as total FROM check_payments WHERE check_id = ? AND status != 'voided' AND voided = 0`,
      [checkId]
    );
    return result?.total || 0;
  }
  
  recalculateTotals(checkId: string): void {
    const items = this.db.all<{ quantity: number; unit_price: number; tax_group_id: string | null }>(
      `SELECT quantity, unit_price, tax_group_id FROM check_items WHERE check_id = ? AND voided = 0`,
      [checkId]
    );
    
    let subtotalCents = 0;
    let totalTaxCents = 0;
    
    for (const item of items) {
      const lineTotalCents = Math.round(item.quantity * item.unit_price);
      subtotalCents += lineTotalCents;
      
      if (item.tax_group_id) {
        const taxGroup = this.db.getTaxGroup(item.tax_group_id);
        if (taxGroup) {
          const rate = parseFloat(taxGroup.rate) || 0;
          if (taxGroup.tax_mode === 'inclusive') {
            const taxPortionCents = Math.round(lineTotalCents - (lineTotalCents / (1 + rate)));
            totalTaxCents += taxPortionCents;
          } else {
            totalTaxCents += Math.round(lineTotalCents * rate);
          }
        }
      }
    }
    
    const discountResult = this.db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM check_discounts WHERE check_id = ? AND voided = 0`,
      [checkId]
    );
    const discountTotalCents = Math.round(discountResult?.total || 0);
    
    const serviceChargeResult = this.db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM check_service_charges WHERE check_id = ? AND voided = 0`,
      [checkId]
    );
    const serviceChargeTotalCents = Math.round(serviceChargeResult?.total || 0);
    
    const totalCents = Math.max(0, subtotalCents + totalTaxCents - discountTotalCents + serviceChargeTotalCents);
    
    const totalPayments = this.getTotalPayments(checkId);
    const totalPaymentsCents = this.db.toCents(totalPayments);
    const amountDueCents = Math.max(0, totalCents - totalPaymentsCents);
    
    const subtotal = parseFloat(this.db.fromCents(subtotalCents));
    const totalTax = parseFloat(this.db.fromCents(totalTaxCents));
    const discountTotal = parseFloat(this.db.fromCents(discountTotalCents));
    const serviceChargeTotal = parseFloat(this.db.fromCents(serviceChargeTotalCents));
    const total = parseFloat(this.db.fromCents(totalCents));
    const amountDue = parseFloat(this.db.fromCents(amountDueCents));
    
    this.db.run(
      `UPDATE checks SET subtotal = ?, tax = ?, discount_total = ?, service_charge_total = ?, total = ?, amount_due = ? WHERE id = ?`,
      [subtotal, totalTax, discountTotal, serviceChargeTotal, total, amountDue, checkId]
    );
  }
}

// Types
interface CreateCheckParams {
  rvcId: string;
  employeeId: string;
  workstationId?: string;
  orderType?: string;
  tableNumber?: string;
  guestCount?: number;
}

interface AddItemParams {
  menuItemId: string;
  quantity?: number;
  modifiers?: any[];
  seatNumber?: number;
  priceOverride?: number;
  unitPrice?: number | string;
}

interface AddPaymentParams {
  tenderId: string;
  tenderType: 'cash' | 'credit' | 'debit' | 'gift';
  amount: number;
  tip?: number;
  reference?: string;
  managerPin?: string;
}

interface Check {
  id: string;
  txnGroupId: string;
  checkNumber: number;
  rvcId: string;
  employeeId: string;
  orderType: string;
  tableNumber?: string;
  guestCount: number;
  status: 'open' | 'closed' | 'voided';
  subtotal: number;
  tax: number;
  total: number;
  discountTotal: number;
  serviceChargeTotal: number;
  amountDue: number;
  currentRound: number;
  businessDate?: string;
  items: CheckItem[];
  payments: Payment[];
  createdAt: string;
  closedAt?: string;
}

interface CheckItem {
  id: string;
  checkId: string;
  roundNumber: number;
  menuItemId: string;
  menuItemName?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
  modifiers: any[];
  printClassId?: string | null;
  seatNumber?: number;
  taxGroupId?: string | null;
  sent?: boolean;
  sentToKitchen: boolean;
  voided: boolean;
  voidReason?: string;
  discountId?: string | null;
  discountName?: string | null;
  discountAmount?: number;
  discountType?: string | null;
  itemStatus?: string;
}

interface Payment {
  id: string;
  checkId: string;
  tenderId: string;
  tenderName?: string;
  tenderType: string;
  isCashMedia?: boolean;
  isCardMedia?: boolean;
  isGiftMedia?: boolean;
  amount: number | string;
  tipAmount?: string;
  tip: number;
  changeAmount?: string;
  reference?: string;
  status: string;
  paymentStatus: 'completed' | 'voided';
}

interface CheckRow {
  id: string;
  txn_group_id: string | null;
  check_number: number;
  rvc_id: string;
  employee_id: string;
  order_type: string;
  table_number: string | null;
  guest_count: number;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  discount_total: number;
  service_charge_total: number;
  amount_due: number;
  current_round: number;
  business_date: string | null;
  created_at: string;
  closed_at: string | null;
}

interface CheckItemRow {
  id: string;
  check_id: string;
  round_number: number;
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  modifiers: string;
  seat_number: number | null;
  sent_to_kitchen: number;
  voided: number;
  void_reason: string | null;
}

interface PaymentRow {
  id: string;
  check_id: string;
  tender_id: string;
  tender_type: string;
  amount: number;
  tip_amount: number;
  change_amount: number;
  reference_number: string | null;
  status: string;
  voided: number;
}

export type { Check, CheckItem, Payment, CreateCheckParams, AddItemParams, AddPaymentParams };

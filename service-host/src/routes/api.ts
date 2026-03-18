/**
 * API Routes for Service Host
 * 
 * Provides REST endpoints for workstations to interact with:
 * - CAPS (checks, items, payments)
 * - Print jobs
 * - KDS tickets
 * - Payment processing
 * - Configuration
 */

import { Router, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { CapsService } from '../services/caps.js';
import { PrintController } from '../services/print-controller.js';
import { KdsController } from '../services/kds-controller.js';
import { PaymentController } from '../services/payment-controller.js';
import { ConfigSync } from '../sync/config-sync.js';
import { Database } from '../db/database.js';

export function createApiRoutes(
  caps: CapsService,
  print: PrintController,
  kds: KdsController,
  payment: PaymentController,
  config: ConfigSync,
  db?: Database
): Router {
  const router = Router();

  // ============================================================================
  // GATEWAY LOG — structured request/response logging for all CAPS traffic
  // ============================================================================

  interface GatewayLogEntry {
    id: string;
    timestamp: string;
    deviceName: string;
    method: string;
    url: string;
    requestBody: string | null;
    responseStatus: number;
    responseSummary: string | null;
    durationMs: number;
    error: string | null;
  }

  const GATEWAY_LOG_MAX = 500;
  const gatewayLog: GatewayLogEntry[] = [];

  router.use((req: any, res: any, next: any) => {
    const start = Date.now();
    const deviceName = (req.headers['x-device-name'] as string)
      || (req.headers['x-workstation-id'] as string)
      || (req.headers['x-device-token'] as string)
      || 'unknown';
    const method = req.method;
    const url = req.originalUrl || req.url;

    if (url.startsWith('/api/caps/gateway-log') || req.method === 'OPTIONS') {
      return next();
    }

    const REDACTED_FIELDS = ['pin', 'managerPin', 'pinHash', 'pin_hash', 'posPin', 'pos_pin', 'password', 'token', 'cardNumber', 'cvv', 'expiryDate'];
    let requestBodySummary: string | null = null;
    if (req.body && Object.keys(req.body).length > 0) {
      const sanitized = { ...req.body };
      for (const field of REDACTED_FIELDS) {
        if (field in sanitized) sanitized[field] = '[REDACTED]';
      }
      const bodyStr = JSON.stringify(sanitized);
      requestBodySummary = bodyStr.length > 200 ? bodyStr.substring(0, 200) + '...' : bodyStr;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      const durationMs = Date.now() - start;
      let responseSummary: string | null = null;
      let errorMsg: string | null = null;

      if (body) {
        if (body.error || body.message) {
          errorMsg = body.error || body.message;
        }
        const sanitizedResp = typeof body === 'object' && body !== null ? { ...body } : body;
        if (typeof sanitizedResp === 'object' && sanitizedResp !== null) {
          for (const field of REDACTED_FIELDS) {
            if (field in sanitizedResp) sanitizedResp[field] = '[REDACTED]';
          }
          if (sanitizedResp.employee && typeof sanitizedResp.employee === 'object') {
            const empCopy = { ...sanitizedResp.employee };
            for (const field of REDACTED_FIELDS) {
              if (field in empCopy) empCopy[field] = '[REDACTED]';
            }
            sanitizedResp.employee = empCopy;
          }
        }
        const bodyStr = JSON.stringify(sanitizedResp);
        responseSummary = bodyStr.length > 200 ? bodyStr.substring(0, 200) + '...' : bodyStr;
      }

      const entry: GatewayLogEntry = {
        id: `gw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        deviceName,
        method,
        url,
        requestBody: requestBodySummary,
        responseStatus: res.statusCode,
        responseSummary,
        durationMs,
        error: errorMsg,
      };

      gatewayLog.push(entry);
      if (gatewayLog.length > GATEWAY_LOG_MAX) {
        gatewayLog.splice(0, gatewayLog.length - GATEWAY_LOG_MAX);
      }

      return originalJson(body);
    };

    next();
  });

  router.get('/caps/gateway-log', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const deviceFilter = req.query.device as string | undefined;
    const methodFilter = req.query.method as string | undefined;
    const errorsOnly = req.query.errorsOnly === 'true';

    let entries = gatewayLog.slice(-limit).reverse();

    if (deviceFilter) {
      entries = entries.filter(e => e.deviceName.toLowerCase().includes(deviceFilter.toLowerCase()));
    }
    if (methodFilter) {
      entries = entries.filter(e => e.method === methodFilter.toUpperCase());
    }
    if (errorsOnly) {
      entries = entries.filter(e => e.error || e.responseStatus >= 400);
    }

    res.json({
      total: gatewayLog.length,
      showing: entries.length,
      entries,
    });
  });
  
  // ============================================================================
  // CAPS - Check & Posting Service
  // ============================================================================
  
  // Create a new check
  router.post('/caps/checks', (req, res) => {
    try {
      const check = caps.createCheck(req.body);
      res.json(check);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Get open checks
  router.get('/caps/checks', (req, res) => {
    try {
      const rvcId = req.query.rvcId as string | undefined;
      const checks = caps.getOpenChecks(rvcId);
      res.json(checks);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  router.get('/caps/checks/orders', (req, res) => {
    try {
      const rvcId = req.query.rvcId as string | undefined;
      const orderType = req.query.orderType as string | undefined;
      const statusFilter = req.query.statusFilter as string | undefined;

      if (!rvcId) {
        return res.status(400).json({ message: 'rvcId is required' });
      }

      let allChecks: any[];
      if (statusFilter === 'completed') {
        const closedRows = db ? db.all<any>(
          `SELECT id FROM checks WHERE rvc_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 50`,
          [rvcId]
        ) : [];
        allChecks = closedRows.map((r: any) => caps.getCheck(r.id)).filter(Boolean);
      } else {
        const rows = db ? db.all<any>(
          `SELECT id FROM checks WHERE rvc_id = ? AND status IN ('open', 'voided') ORDER BY created_at DESC LIMIT 500`,
          [rvcId]
        ) : [];
        allChecks = rows.map((r: any) => caps.getCheck(r.id)).filter(Boolean);
      }

      if (orderType && orderType !== 'all') {
        allChecks = allChecks.filter((c: any) => c.orderType === orderType);
      }

      const enriched = allChecks.map((c: any) => {
        let employeeName: string | null = null;
        if (c.employeeId && db) {
          const emp = db.getEmployee(c.employeeId);
          if (emp) {
            employeeName = `${emp.first_name || emp.firstName || ''} ${emp.last_name || emp.lastName || ''}`.trim();
          }
        }
        const activeItems = (c.items || []).filter((i: any) => !i.voided);
        return {
          ...c,
          openedAt: c.createdAt || c.openedAt,
          employeeName,
          fulfillmentStatus: c.fulfillmentStatus || null,
          onlineOrderId: c.onlineOrderId || null,
          customerName: c.customerName || null,
          platformSource: c.platformSource || null,
          itemCount: activeItems.length,
          unsentCount: activeItems.filter((i: any) => !i.sentToKitchen).length,
          roundCount: c.currentRound || 0,
          lastRoundAt: null,
        };
      });

      res.json(enriched);
    } catch (e) {
      console.error('Get caps/checks/orders error:', e);
      res.status(400).json({ message: 'Failed to get orders' });
    }
  });

  router.get('/caps/checks/locks', (_req, res) => {
    res.json({});
  });

  // Get specific check
  router.get('/caps/checks/:id', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) {
        return res.status(404).json({ error: 'Check not found' });
      }
      res.json(check);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Add items to check
  router.post('/caps/checks/:id/items', (req, res) => {
    try {
      const { workstationId } = req.body;
      const items = caps.addItems(req.params.id, req.body.items || [req.body], workstationId);
      res.status(201).json(items[0]);
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Send to kitchen
  router.post('/caps/checks/:id/send', (req, res) => {
    try {
      const { workstationId, employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'send_to_kitchen', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const result = caps.sendToKitchen(req.params.id, workstationId);
      
      try {
        const check = caps.getCheck(req.params.id);
        if (check) {
          const unsentItems = check.items.filter(i => !i.voided);
          if (unsentItems.length > 0) {
            const stationItemsMap = new Map<string, typeof unsentItems>();

            for (const item of unsentItems) {
              let targetStations: string[] = [];
              const printClassId = (item as any).printClassId || (item as any).print_class_id;
              if (printClassId && db) {
                const orderDevices = db.getOrderDevicesForPrintClass(printClassId, undefined, check.rvcId);
                for (const od of orderDevices) {
                  if (od.kds_device_id) {
                    targetStations.push(od.kds_device_id);
                  }
                  const kdsLinks = db.getOrderDeviceKds(od.id);
                  for (const link of kdsLinks) {
                    if (link.kds_device_id && !targetStations.includes(link.kds_device_id)) {
                      targetStations.push(link.kds_device_id);
                    }
                  }
                }
              }
              if (targetStations.length === 0) {
                targetStations = ['default'];
              }
              for (const stationId of targetStations) {
                if (!stationItemsMap.has(stationId)) {
                  stationItemsMap.set(stationId, []);
                }
                stationItemsMap.get(stationId)!.push(item);
              }
            }

            for (const [stationId, items] of stationItemsMap) {
              kds.createTicket({
                checkId: check.id,
                checkNumber: check.checkNumber || 0,
                roundNumber: result.roundNumber || 0,
                orderType: check.orderType,
                stationId: stationId === 'default' ? undefined : stationId,
                items: items.map(i => ({
                  name: i.name,
                  quantity: i.quantity,
                  modifiers: i.modifiers?.map(m => m.name || m),
                  seatNumber: i.seatNumber,
                })),
              });
            }
          }
        }
      } catch (kdsErr) {
        console.error('[KDS] Failed to create ticket for check', req.params.id, kdsErr);
      }
      
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Void an item
  router.post('/caps/checks/:id/items/:itemId/void', (req, res) => {
    try {
      const { reason, workstationId, employeeId, managerPin } = req.body;
      const item = db?.get<any>('SELECT * FROM check_items WHERE id = ?', [req.params.itemId]);
      const requiredPriv = item && item.sent ? 'void_sent' : 'void_unsent';
      const privCheck = checkPrivilege(employeeId, requiredPriv, managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      caps.voidItem(req.params.id, req.params.itemId, reason, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Add payment
  const payHandler = (req: any, res: any) => {
    try {
      const { workstationId, tipAmount, ...paymentParams } = req.body;
      if (!paymentParams.tenderType && paymentParams.tenderId && db) {
        const tender = db.get<{ name: string; type: string }>('SELECT name, type FROM tenders WHERE id = ?', [paymentParams.tenderId]);
        if (tender) {
          paymentParams.tenderType = tender.type || 'cash';
        } else {
          paymentParams.tenderType = 'cash';
        }
      }
      if (!paymentParams.tenderType) {
        paymentParams.tenderType = 'cash';
      }
      if (tipAmount !== undefined && paymentParams.tip === undefined) {
        paymentParams.tip = parseFloat(tipAmount) || 0;
      }
      if (typeof paymentParams.amount === 'string') {
        paymentParams.amount = parseFloat(paymentParams.amount) || 0;
      }
      const payment = caps.addPayment(req.params.id, paymentParams, workstationId);
      res.json(payment);
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  };
  router.post('/caps/checks/:id/pay', payHandler);
  router.post('/caps/checks/:id/payments', payHandler);
  
  // Close check
  router.post('/caps/checks/:id/close', (req, res) => {
    try {
      const { workstationId } = req.body;
      caps.closeCheck(req.params.id, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Void check
  router.post('/caps/checks/:id/void', (req, res) => {
    try {
      const { reason, workstationId, employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'void_sent', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      caps.voidCheck(req.params.id, reason, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Cancel transaction - void all unsent items
  router.post('/caps/checks/:id/cancel-transaction', (req, res) => {
    try {
      const { workstationId, employeeId, reason } = req.body;
      const check = caps.getCheck(req.params.id);
      if (!check) {
        return res.status(404).json({ error: 'Check not found' });
      }
      
      const unsentItems = check.items.filter(i => !i.sentToKitchen && !i.voided);
      const previouslySentItems = check.items.filter(i => i.sentToKitchen && !i.voided);
      
      for (const item of unsentItems) {
        caps.voidItem(req.params.id, item.id, reason || 'Transaction cancelled', workstationId);
      }
      
      if (previouslySentItems.length === 0) {
        caps.closeCheck(req.params.id, workstationId);
      }
      
      const updatedCheck = caps.getCheck(req.params.id);
      res.json({
        success: true,
        itemsVoided: unsentItems.length,
        checkStatus: updatedCheck?.status || 'closed',
      });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // ============================================================================
  // CHECK ITEMS - Direct item operations (flat URL structure matching cloud API)
  // ============================================================================
  
  // Update item modifiers
  router.patch('/caps/check-items/:id/modifiers', (req, res) => {
    try {
      const itemId = req.params.id;
      const { modifiers, workstationId } = req.body;
      
      const itemRow = db?.get<{ check_id: string }>('SELECT check_id FROM check_items WHERE id = ?', [itemId]);
      if (!itemRow) {
        return res.status(404).json({ error: 'Check item not found' });
      }
      
      const modifiersJson = JSON.stringify(modifiers || []);
      db?.run(
        'UPDATE check_items SET modifiers = ?, modifiers_json = ? WHERE id = ?',
        [modifiersJson, modifiersJson, itemId]
      );
      
      caps.recalculateTotals(itemRow.check_id);
      
      const check = caps.getCheck(itemRow.check_id);
      const updatedItem = check?.items.find(i => i.id === itemId);
      res.json(updatedItem || { id: itemId, modifiers });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Also support PUT for modifiers
  router.put('/caps/check-items/:id/modifiers', (req, res) => {
    try {
      const itemId = req.params.id;
      const { modifiers, workstationId } = req.body;
      
      const itemRow = db?.get<{ check_id: string }>('SELECT check_id FROM check_items WHERE id = ?', [itemId]);
      if (!itemRow) {
        return res.status(404).json({ error: 'Check item not found' });
      }
      
      const modifiersJson = JSON.stringify(modifiers || []);
      db?.run(
        'UPDATE check_items SET modifiers = ?, modifiers_json = ? WHERE id = ?',
        [modifiersJson, modifiersJson, itemId]
      );
      
      caps.recalculateTotals(itemRow.check_id);
      
      const check = caps.getCheck(itemRow.check_id);
      const updatedItem = check?.items.find(i => i.id === itemId);
      res.json(updatedItem || { id: itemId, modifiers });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Void item by item ID (flat URL)
  router.post('/caps/check-items/:id/void', (req, res) => {
    try {
      const itemId = req.params.id;
      const { reason, workstationId, employeeId, managerPin } = req.body;
      
      const itemRow = db?.get<any>('SELECT check_id, sent FROM check_items WHERE id = ?', [itemId]);
      if (!itemRow) {
        return res.status(404).json({ error: 'Check item not found' });
      }

      const requiredPriv = itemRow.sent ? 'void_sent' : 'void_unsent';
      const privCheck = checkPrivilege(employeeId, requiredPriv, managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      
      caps.voidItem(itemRow.check_id, itemId, reason, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Apply discount to item by item ID (flat URL)
  router.post('/caps/check-items/:id/discount', (req, res) => {
    try {
      const itemId = req.params.id;
      const { discountId, employeeId, managerPin, workstationId } = req.body;

      const privCheck = checkPrivilege(employeeId, 'apply_discount', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      
      const itemRow = db?.get<{ check_id: string; name: string; unit_price: number; quantity: number }>(
        'SELECT check_id, name, unit_price, quantity FROM check_items WHERE id = ?', [itemId]
      );
      if (!itemRow) {
        return res.status(404).json({ error: 'Check item not found' });
      }
      
      let discountName = 'Item Discount';
      let discountType = 'amount';
      let discountAmount = 0;
      
      if (discountId && db) {
        const discount = db.get<{ name: string; discount_type: string; amount: string }>(
          'SELECT name, discount_type, amount FROM discounts WHERE id = ?', [discountId]
        );
        if (discount) {
          discountName = discount.name;
          discountType = discount.discount_type;
          const itemTotal = itemRow.unit_price * itemRow.quantity;
          const discountVal = parseFloat(discount.amount || '0');
          if (discount.discount_type === 'percent') {
            discountAmount = itemTotal * (discountVal / 100);
          } else {
            discountAmount = discountVal;
          }
          discountAmount = Math.min(discountAmount, itemTotal);
        }
      }
      
      caps.addDiscount(itemRow.check_id, {
        discountId,
        checkItemId: itemId,
        name: discountName,
        type: discountType,
        amount: discountAmount,
        employeeId,
      });
      
      const updatedCheck = caps.getCheck(itemRow.check_id);
      const updatedItem = updatedCheck?.items?.find((i: any) => i.id === itemId);
      res.json({ item: updatedItem, check: updatedCheck });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // CHECK LOCKING - Multi-workstation concurrency control
  // ============================================================================
  
  // Acquire lock on a check
  router.post('/caps/checks/:id/lock', (req, res) => {
    try {
      const { workstationId, employeeId } = req.body;
      if (!workstationId || !employeeId) {
        return res.status(400).json({ error: 'workstationId and employeeId required' });
      }
      const result = caps.acquireLock(req.params.id, workstationId, employeeId);
      if (!result.success) {
        return res.status(409).json({ 
          error: 'Check is locked by another workstation',
          lockedBy: result.lockedBy 
        });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Release lock on a check
  router.post('/caps/checks/:id/unlock', (req, res) => {
    try {
      const { workstationId } = req.body;
      if (!workstationId) {
        return res.status(400).json({ error: 'workstationId required' });
      }
      caps.releaseLock(req.params.id, workstationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Get lock info for a check
  router.get('/caps/checks/:id/lock', (req, res) => {
    try {
      const info = caps.getLockInfo(req.params.id);
      res.json(info);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Refresh lock (extend expiration)
  router.post('/caps/checks/:id/lock/refresh', (req, res) => {
    try {
      const { workstationId, employeeId } = req.body;
      if (!workstationId || !employeeId) {
        return res.status(400).json({ error: 'workstationId and employeeId required' });
      }
      const success = caps.refreshLock(req.params.id, workstationId, employeeId);
      if (!success) {
        return res.status(409).json({ error: 'Could not refresh lock' });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Release all locks for a workstation (on disconnect)
  router.post('/caps/workstation/:workstationId/release-locks', (req, res) => {
    try {
      caps.releaseAllLocks(req.params.workstationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Configure check number range for a workstation
  router.post('/caps/workstation/:workstationId/check-range', (req, res) => {
    try {
      const { start, end } = req.body;
      if (typeof start !== 'number' || typeof end !== 'number') {
        return res.status(400).json({ error: 'start and end numbers required' });
      }
      caps.setCheckNumberRange(req.params.workstationId, start, end);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // CAPS PREFIX NORMALIZATION MIDDLEWARE
  // The Electron interceptor rewrites /api/checks → /api/caps/checks, etc.
  // Original CAPS handlers above (with /caps/ prefix) match first for routes
  // they handle. For all other /caps/ prefixed requests, strip the prefix so
  // they fall through to the Cloud-Compatible Route Aliases below.
  // Exclude /caps/sync/, /caps/reports/, /caps/workstation/ which have dedicated handlers.
  // ============================================================================
  router.use((req: any, _res: any, next: any) => {
    if (req.url.startsWith('/caps/') &&
        !req.url.startsWith('/caps/sync/') &&
        !req.url.startsWith('/caps/reports/') &&
        !req.url.startsWith('/caps/workstation/')) {
      req.url = req.url.replace(/^\/caps\//, '/');
    }
    next();
  });

  // ============================================================================
  // Print Controller
  // ============================================================================
  
  // Submit print job
  router.post('/print/jobs', async (req, res) => {
    try {
      const job = await print.submitJob(req.body);
      res.json(job);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Get print job status
  router.get('/print/jobs/:id', (req, res) => {
    try {
      const job = print.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      res.json(job);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // KDS Controller
  // ============================================================================
  
  // Get active tickets
  router.get('/kds/tickets', (req, res) => {
    try {
      const stationId = req.query.stationId as string | undefined;
      const tickets = kds.getActiveTickets(stationId);
      res.json(tickets);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get bumped tickets (for recall)
  router.get('/kds/tickets/bumped', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const tickets = kds.getBumpedTickets(limit);
      res.json(tickets);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get specific ticket
  router.get('/kds/tickets/:id', (req, res) => {
    try {
      const ticket = kds.getTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      res.json(ticket);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Bump ticket
  router.post('/kds/tickets/:id/bump', (req, res) => {
    try {
      kds.bumpTicket(req.params.id, req.body.stationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Recall ticket
  router.post('/kds/tickets/:id/recall', (req, res) => {
    try {
      kds.recallTicket(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Priority bump
  router.post('/kds/tickets/:id/priority', (req, res) => {
    try {
      kds.priorityBump(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Payment Controller
  // ============================================================================
  
  // Authorize payment
  router.post('/payment/authorize', async (req, res) => {
    try {
      const result = await payment.authorize(req.body);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Capture payment
  router.post('/payment/:id/capture', async (req, res) => {
    try {
      const result = await payment.capture(req.params.id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Void payment
  router.post('/payment/:id/void', async (req, res) => {
    try {
      const result = await payment.void(req.params.id, req.body.reason);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Refund payment
  router.post('/payment/:id/refund', async (req, res) => {
    try {
      const result = await payment.refund(req.params.id, req.body.amount);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Get payment
  router.get('/payment/:id', (req, res) => {
    try {
      const record = payment.getPayment(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      res.json(record);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Configuration
  // ============================================================================
  
  // Get menu items
  router.get('/config/menu-items', (req, res) => {
    try {
      const items = config.getMenuItems();
      res.json(items);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get SLUs (categories)
  router.get('/config/slus', (req, res) => {
    try {
      const slus = config.getSlus();
      res.json(slus);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get tenders
  router.get('/config/tenders', (req, res) => {
    try {
      const tenders = config.getTenders();
      res.json(tenders);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get discounts
  router.get('/config/discounts', (req, res) => {
    try {
      const discounts = config.getDiscounts();
      res.json(discounts);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get tax groups
  router.get('/config/tax-groups', (req, res) => {
    try {
      const taxGroups = config.getTaxGroups();
      res.json(taxGroups);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get service charges
  router.get('/config/service-charges', (req, res) => {
    try {
      const serviceCharges = config.getServiceCharges();
      res.json(serviceCharges);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get employees
  router.get('/config/employees', (req, res) => {
    try {
      const employees = config.getEmployees();
      res.json(employees);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get employee by ID
  router.get('/config/employees/:id', (req, res) => {
    try {
      const employee = config.getEmployee(req.params.id);
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      res.json(employee);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get workstations
  router.get('/config/workstations', (req, res) => {
    try {
      const workstations = config.getWorkstations();
      res.json(workstations);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get printers
  router.get('/config/printers', (req, res) => {
    try {
      const printers = config.getPrinters();
      res.json(printers);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get KDS devices
  router.get('/config/kds-devices', (req, res) => {
    try {
      const kdsDevices = config.getKdsDevices();
      const orderDevices = config.getOrderDevices();
      const enriched = kdsDevices.map((d: any) => {
        const linkedOrderDevices = orderDevices.filter((od: any) => {
          if (od.kdsDeviceId === d.id || od.kds_device_id === d.id) return true;
          if (caps.db) {
            const odKdsLinks = caps.db.getOrderDeviceKds(od.id);
            return odKdsLinks.some((link: any) => link.kds_device_id === d.id);
          }
          return false;
        });
        return { ...d, orderDevices: linkedOrderDevices };
      });
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get order devices
  router.get('/config/order-devices', (req, res) => {
    try {
      const orderDevices = config.getOrderDevices();
      res.json(orderDevices);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get POS layout for RVC
  router.get('/config/pos-layout', (req, res) => {
    try {
      const rvcId = req.query.rvcId as string;
      const orderType = req.query.orderType as string | undefined;
      if (!rvcId) {
        return res.status(400).json({ error: 'rvcId required' });
      }
      const layout = config.getPosLayoutForRvc(rvcId, orderType);
      if (!layout) {
        return res.status(404).json({ error: 'No layout found for RVC' });
      }
      const cells = config.getPosLayoutCells(layout.id);
      res.json({ ...layout, cells });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get menu item with modifiers
  router.get('/config/menu-items/:id', (req, res) => {
    try {
      const item = config.getMenuItemWithModifiers(req.params.id);
      if (!item) {
        return res.status(404).json({ error: 'Menu item not found' });
      }
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get menu items by SLU
  router.get('/config/slus/:id/items', (req, res) => {
    try {
      const items = config.getMenuItemsBySlu(req.params.id);
      res.json(items);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get SLUs by RVC
  router.get('/config/rvcs/:id/slus', (req, res) => {
    try {
      const slus = config.getSlusByRvc(req.params.id);
      res.json(slus);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get roles
  router.get('/config/roles', (req, res) => {
    try {
      const roles = config.getRoles();
      res.json(roles);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get payment processors
  router.get('/config/payment-processors', (req, res) => {
    try {
      const processors = config.getPaymentProcessors();
      res.json(processors);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get payment processor by ID
  router.get('/config/payment-processors/:id', (req, res) => {
    try {
      const processor = config.getPaymentProcessor(req.params.id);
      if (!processor) {
        return res.status(404).json({ error: 'Payment processor not found' });
      }
      res.json(processor);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get RVCs
  router.get('/config/rvcs', (req, res) => {
    try {
      const rvcs = config.getRvcs();
      res.json(rvcs);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get RVC by ID
  router.get('/config/rvcs/:id', (req, res) => {
    try {
      const rvc = config.getRvc(req.params.id);
      if (!rvc) {
        return res.status(404).json({ error: 'RVC not found' });
      }
      res.json(rvc);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get property
  router.get('/config/property', (req, res) => {
    try {
      const property = config.getProperty();
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }
      res.json(property);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get major groups
  router.get('/config/major-groups', (req, res) => {
    try {
      const majorGroups = config.getMajorGroups();
      res.json(majorGroups);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get family groups by major group
  router.get('/config/major-groups/:id/family-groups', (req, res) => {
    try {
      const familyGroups = config.getFamilyGroups(req.params.id);
      res.json(familyGroups);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get print classes
  router.get('/config/print-classes', (req, res) => {
    try {
      const printClasses = config.getPrintClasses();
      res.json(printClasses);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get EMC option flags
  router.get('/api/option-flags', (req, res) => {
    try {
      const enterpriseId = req.query.enterpriseId as string | undefined;
      const flags = config.getOptionFlags(enterpriseId);
      res.json(flags);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get job codes
  router.get('/config/job-codes', (req, res) => {
    try {
      const jobCodes = config.getJobCodes();
      res.json(jobCodes);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Loyalty
  // ============================================================================
  
  // Get loyalty programs
  router.get('/loyalty/programs', (req, res) => {
    try {
      const programs = config.getLoyaltyPrograms();
      res.json(programs);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get loyalty program by ID
  router.get('/loyalty/programs/:id', (req, res) => {
    try {
      const program = config.getLoyaltyProgram(req.params.id);
      if (!program) {
        return res.status(404).json({ error: 'Loyalty program not found' });
      }
      res.json(program);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Lookup loyalty member by phone
  router.get('/loyalty/members/phone/:phone', (req, res) => {
    try {
      const member = config.getLoyaltyMemberByPhone(req.params.phone);
      if (!member) {
        return res.status(404).json({ error: 'Loyalty member not found' });
      }
      const enrollments = config.getLoyaltyMemberEnrollments(member.id);
      res.json({ ...member, enrollments });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Lookup loyalty member by email
  router.get('/loyalty/members/email/:email', (req, res) => {
    try {
      const member = config.getLoyaltyMemberByEmail(req.params.email);
      if (!member) {
        return res.status(404).json({ error: 'Loyalty member not found' });
      }
      const enrollments = config.getLoyaltyMemberEnrollments(member.id);
      res.json({ ...member, enrollments });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get member enrollments
  router.get('/loyalty/members/:id/enrollments', (req, res) => {
    try {
      const enrollments = config.getLoyaltyMemberEnrollments(req.params.id);
      res.json(enrollments);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get loyalty member by ID
  router.get('/loyalty/members/:id', (req, res) => {
    try {
      const member = config.getLoyaltyMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: 'Loyalty member not found' });
      }
      const enrollments = config.getLoyaltyMemberEnrollments(member.id);
      res.json({ ...member, enrollments });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Terminal Devices (PED/Payment terminals)
  // ============================================================================
  
  // Get terminal devices
  router.get('/config/terminal-devices', (req, res) => {
    try {
      const devices = config.getTerminalDevices();
      res.json(devices);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get terminal device by ID
  router.get('/config/terminal-devices/:id', (req, res) => {
    try {
      const device = config.getTerminalDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ error: 'Terminal device not found' });
      }
      res.json(device);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Fiscal Periods
  // ============================================================================
  
  // Get fiscal periods
  router.get('/fiscal/periods', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      const periods = config.getFiscalPeriods(limit);
      res.json(periods);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get active fiscal period
  router.get('/fiscal/periods/active', (req, res) => {
    try {
      const period = config.getActiveFiscalPeriod();
      if (!period) {
        return res.status(404).json({ error: 'No active fiscal period' });
      }
      res.json(period);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get fiscal period by ID
  router.get('/fiscal/periods/:id', (req, res) => {
    try {
      const period = config.getFiscalPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ error: 'Fiscal period not found' });
      }
      res.json(period);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Sync Operations
  // ============================================================================
  
  // Get sync status
  router.get('/sync/status', (req, res) => {
    try {
      const status = config.getStatus();
      res.json(status);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Trigger full sync
  router.post('/sync/full', async (req, res) => {
    try {
      const result = await config.syncFull();
      if (result.success) {
        res.json({ 
          success: true, 
          message: `Synced ${result.recordCount} records`,
          recordCount: result.recordCount 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Trigger delta sync
  router.post('/sync/delta', async (req, res) => {
    try {
      const result = await config.syncDelta();
      if (result.success) {
        res.json({ 
          success: true, 
          message: `Applied ${result.changeCount} changes`,
          changeCount: result.changeCount 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Start auto-sync (background periodic sync)
  router.post('/sync/auto/start', (req, res) => {
    try {
      const intervalMs = parseInt(req.query.interval as string) || 120000;
      config.startAutoSync(intervalMs);
      res.json({ 
        success: true, 
        message: `Auto-sync started (every ${intervalMs / 1000}s)` 
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  router.post('/sync/auto/stop', (req, res) => {
    try {
      config.stopAutoSync();
      res.json({ success: true, message: 'Auto-sync stopped' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  router.get('/caps/reports/daily-summary', (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ error: 'Database not available' });
      }
      const businessDate = (req.query.businessDate as string) || new Date().toISOString().split('T')[0];
      const summary = db.getOfflineDailySummary(businessDate);
      res.json(summary);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Cloud-Compatible Route Aliases
  // Maps cloud API paths (/checks, /menu-items, etc.) to existing CAPS/config
  // handlers so the frontend can use the same paths in YELLOW mode without
  // needing path rewriting in the protocol interceptor.
  // ============================================================================

  router.post('/checks', (req, res) => {
    try {
      const check = caps.createCheck(req.body);
      res.json(check);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/checks', (req, res) => {
    try {
      const rvcId = req.query.rvcId as string | undefined;
      const status = req.query.status as string | undefined;
      const checks = caps.getOpenChecks(rvcId);
      res.json(checks);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  const openChecksHandler: RequestHandler = (req, res) => {
    try {
      const rvcId = req.query.rvcId as string | undefined;
      const checks = caps.getOpenChecks(rvcId);
      const enriched = checks.map((c: any) => {
        let employeeName: string | null = null;
        if (c.employeeId && db) {
          const emp = db.getEmployee(c.employeeId);
          if (emp) {
            employeeName = `${emp.first_name || emp.firstName || ''} ${emp.last_name || emp.lastName || ''}`.trim();
          }
        }
        const activeItems = (c.items || []).filter((i: any) => !i.voided);
        return {
          ...c,
          openedAt: c.createdAt || c.openedAt,
          employeeName,
          itemCount: activeItems.length,
          unsentCount: activeItems.filter((i: any) => !i.sentToKitchen).length,
          roundCount: c.currentRound || 0,
          lastRoundAt: null,
        };
      });
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  };
  router.get('/checks/open', openChecksHandler);

  router.get('/checks/orders', (req, res) => {
    try {
      const rvcId = req.query.rvcId as string | undefined;
      const orderType = req.query.orderType as string | undefined;
      const statusFilter = req.query.statusFilter as string | undefined;

      if (!rvcId) {
        return res.status(400).json({ message: 'rvcId is required' });
      }

      let allChecks: any[];
      if (statusFilter === 'completed') {
        const closedRows = db ? db.all<any>(
          `SELECT id FROM checks WHERE rvc_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 50`,
          [rvcId]
        ) : [];
        allChecks = closedRows.map((r: any) => caps.getCheck(r.id)).filter(Boolean);
      } else {
        const rows = db ? db.all<any>(
          `SELECT id FROM checks WHERE rvc_id = ? AND status IN ('open', 'voided') ORDER BY created_at DESC LIMIT 500`,
          [rvcId]
        ) : [];
        allChecks = rows.map((r: any) => caps.getCheck(r.id)).filter(Boolean);
      }

      if (orderType && orderType !== 'all') {
        allChecks = allChecks.filter((c: any) => c.orderType === orderType);
      }

      const enriched = allChecks.map((c: any) => {
        let employeeName: string | null = null;
        if (c.employeeId && db) {
          const emp = db.getEmployee(c.employeeId);
          if (emp) {
            employeeName = `${emp.first_name || emp.firstName || ''} ${emp.last_name || emp.lastName || ''}`.trim();
          }
        }
        const activeItems = (c.items || []).filter((i: any) => !i.voided);
        return {
          ...c,
          openedAt: c.createdAt || c.openedAt,
          employeeName,
          fulfillmentStatus: c.fulfillmentStatus || null,
          onlineOrderId: c.onlineOrderId || null,
          customerName: c.customerName || null,
          platformSource: c.platformSource || null,
          itemCount: activeItems.length,
          unsentCount: activeItems.filter((i: any) => !i.sentToKitchen).length,
          roundCount: c.currentRound || 0,
          lastRoundAt: null,
        };
      });

      res.json(enriched);
    } catch (e) {
      console.error('Get checks/orders error:', e);
      res.status(400).json({ message: 'Failed to get orders' });
    }
  });

  router.get('/checks/locks', (_req, res) => {
    res.json({});
  });

  router.get('/checks/:id', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const { items = [], payments = [], ...checkData } = check;
      const paidAmount = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0);
      const total = parseFloat(checkData.total || '0');
      const changeDue = Math.max(0, paidAmount - total);
      res.json({ check: { ...checkData, paidAmount, tenderedAmount: paidAmount, changeDue }, items, payments, refunds: [] });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  const fullDetailsHandler: RequestHandler = (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const { items = [], payments = [], ...checkData } = check;
      const paidAmount = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0);
      const total = parseFloat(checkData.total || '0');
      const changeDue = Math.max(0, paidAmount - total);
      res.json({ check: { ...checkData, paidAmount, tenderedAmount: paidAmount, changeDue }, items, payments, refunds: [] });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  };
  router.get('/checks/:id/full-details', fullDetailsHandler);

  const checkPaymentsHandler: RequestHandler = (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.json({ payments: [], paidAmount: 0 });
      const payments = check.payments || [];
      const paidAmount = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0);
      res.json({ payments, paidAmount });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  };
  router.get('/checks/:id/payments', checkPaymentsHandler);

  const checkDiscountsHandler: RequestHandler = (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      res.json(check?.discounts || []);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  };
  router.get('/checks/:id/discounts', checkDiscountsHandler);

  const getServiceChargesHandler: RequestHandler = (req, res) => {
    try {
      const rows = caps.db.all(
        'SELECT * FROM check_service_charges WHERE check_id = ? AND voided = 0 ORDER BY created_at',
        [req.params.id]
      );
      res.json(rows.map((r: any) => ({
        id: r.id,
        checkId: r.check_id,
        serviceChargeId: r.service_charge_id,
        name: r.name,
        chargeType: r.charge_type,
        amount: r.amount,
        voided: !!r.voided,
        createdAt: r.created_at,
      })));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  };
  router.get('/checks/:id/service-charges', getServiceChargesHandler);

  const postServiceChargesHandler: RequestHandler = (req, res) => {
    try {
      const { serviceChargeId, employeeId, amount: overrideAmount } = req.body;
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const sc = caps.db.getServiceCharge(serviceChargeId);
      if (!sc) return res.status(404).json({ error: 'Service charge not found' });
      const scId = `csc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      let computedAmount = overrideAmount;
      if (!computedAmount) {
        if (sc.charge_type === 'percent') {
          computedAmount = (parseFloat(check.subtotal || '0') * parseFloat(sc.amount || '0') / 100).toFixed(2);
        } else {
          computedAmount = sc.amount;
        }
      }
      caps.db.run(
        `INSERT INTO check_service_charges (id, check_id, service_charge_id, name, charge_type, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [scId, req.params.id, serviceChargeId, sc.name, sc.charge_type || 'percent', computedAmount]
      );
      caps.recalculateTotals(req.params.id);
      const updatedCheck = caps.getCheck(req.params.id);
      if (updatedCheck) {
        caps.transactionSync.queueCheck(req.params.id, 'update', updatedCheck);
      }
      res.status(201).json({ id: scId, checkId: req.params.id, serviceChargeId, name: sc.name, amount: computedAmount });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/checks/:id/service-charges', postServiceChargesHandler);

  router.post('/checks/:id/items', (req, res) => {
    try {
      const { workstationId } = req.body;
      const items = caps.addItems(req.params.id, req.body.items || [req.body], workstationId);
      const lastItem = Array.isArray(items) && items.length > 0 ? items[items.length - 1] : null;
      res.status(201).json({ ...(lastItem || {}), items });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) return res.status(409).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/checks/:id/send', (req, res) => {
    try {
      const { workstationId, employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'send_to_kitchen', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const result = caps.sendToKitchen(req.params.id, workstationId);
      try {
        const check = caps.getCheck(req.params.id);
        if (check) {
          const unsentItems = check.items.filter((i: any) => !i.voided);
          if (unsentItems.length > 0) {
            kds.createTicket({
              checkId: check.id,
              checkNumber: check.checkNumber || 0,
              roundNumber: result.roundNumber || 0,
              orderType: check.orderType,
              items: unsentItems.map((i: any) => ({
                name: i.name,
                quantity: i.quantity,
                modifiers: i.modifiers?.map((m: any) => m.name || m),
                seatNumber: i.seatNumber,
              })),
            });
          }
        }
      } catch (kdsErr) {
        console.error('[KDS] Failed to create ticket for check', req.params.id, kdsErr);
      }
      const updatedCheck = caps.getCheck(req.params.id);
      res.json({ round: result.roundNumber || result.round || null, updatedItems: updatedCheck?.items || [] });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/payments', (req, res) => {
    try {
      const { workstationId, tipAmount, ...paymentParams } = req.body;
      if (!paymentParams.tenderType && paymentParams.tenderId) {
        const tender = caps.db.get<any>('SELECT name, type FROM tenders WHERE id = ?', [paymentParams.tenderId]);
        if (tender) {
          paymentParams.tenderType = tender.type || 'cash';
        } else {
          paymentParams.tenderType = 'cash';
        }
      }
      if (!paymentParams.tenderType) paymentParams.tenderType = 'cash';
      if (tipAmount !== undefined && paymentParams.tip === undefined) {
        paymentParams.tip = parseFloat(tipAmount) || 0;
      }
      if (typeof paymentParams.amount === 'string') {
        paymentParams.amount = parseFloat(paymentParams.amount) || 0;
      }
      const payment = caps.addPayment(req.params.id, paymentParams, workstationId);
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found after payment' });
      const { items = [], payments = [], ...checkData } = check;
      const paidAmount = payments
        .filter((p: any) => p.paymentStatus === 'completed' || !p.paymentStatus)
        .reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0);
      const total = parseFloat(checkData.total || '0');
      const tolerance = 0.05;
      if (paidAmount >= total - tolerance && total > 0) {
        caps.closeCheck(req.params.id, workstationId);
        const closedCheck = caps.getCheck(req.params.id);
        if (closedCheck) {
          const { items: ci, payments: cp, ...closedData } = closedCheck;
          return res.json({ ...closedData, paidAmount, appliedTenderId: paymentParams.tenderId });
        }
      }
      res.json({ ...checkData, paidAmount, appliedTenderId: paymentParams.tenderId });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) return res.status(409).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/checks/:id/close', (req, res) => {
    try {
      const { workstationId } = req.body;
      caps.closeCheck(req.params.id, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) return res.status(409).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/checks/:id/void', (req, res) => {
    try {
      const { reason, workstationId, employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'void_sent', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      caps.voidCheck(req.params.id, reason, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) return res.status(409).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/checks/:id/cancel-transaction', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const activeItems = (check.items || []).filter((i: any) => !i.voided);
      const voidedCount = activeItems.length;
      const { reason, workstationId } = req.body;
      caps.voidCheck(req.params.id, reason || 'cancelled', workstationId);
      res.json({ success: true, voidedCount, remainingActiveItems: 0 });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  const reopenCheckHandler: RequestHandler = (req, res) => {
    try {
      const { employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'reopen_check', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      caps.reopenCheck(req.params.id);
      const updated = caps.getCheck(req.params.id);
      res.json({ success: true, check: updated });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/checks/:id/reopen', reopenCheckHandler);

  const checkDiscountHandler: RequestHandler = (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });

      const { discountId, checkItemId, name, type, amount, rate, managerPin, requiredPrivilege, employeeId } = req.body;

      const privCheck = checkPrivilege(employeeId, 'apply_discount', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }

      if (requiredPrivilege && !managerPin) {
        return res.status(401).json({ error: 'Manager approval required for this discount' });
      }

      let managerEmployeeId: string | undefined;
      if (managerPin) {
        const employees = config.getEmployees();
        const manager = employees.find((emp: any) =>
          emp.pinHash === managerPin || emp.pin_hash === managerPin || emp.pin === managerPin || emp.posPin === managerPin || emp.pos_pin === managerPin
        );
        if (!manager) return res.status(401).json({ error: 'Invalid manager PIN' });
        if (requiredPrivilege) {
          const hasPrivilege = manager.privileges && (
            Array.isArray(manager.privileges)
              ? manager.privileges.includes(requiredPrivilege)
              : manager.privileges[requiredPrivilege]
          );
          if (!hasPrivilege && manager.role !== 'admin' && manager.role !== 'manager') {
            return res.status(403).json({ error: `Employee does not have required privilege: ${requiredPrivilege}` });
          }
        }
        managerEmployeeId = manager.id;
      }

      let discountAmount = 0;
      const discountType = type || 'fixed';
      if (discountType === 'percentage' || discountType === 'percent') {
        const subtotal = parseFloat(check.subtotal || '0');
        discountAmount = (subtotal * parseFloat(rate || amount || '0')) / 100;
      } else {
        discountAmount = parseFloat(amount || '0');
      }

      const result = caps.addDiscount(req.params.id, {
        discountId,
        checkItemId,
        name: name || 'Discount',
        type: discountType,
        amount: discountAmount,
        rate: rate ? parseFloat(rate) : undefined,
        employeeId,
        managerEmployeeId,
      });

      const updated = caps.getCheck(req.params.id);
      res.json({ success: true, discount: result, check: updated });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/checks/:id/discount', checkDiscountHandler);

  const printCheckHandler: RequestHandler = (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      res.json({ success: true, message: 'Print queued' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/checks/:id/print', printCheckHandler);

  const transferCheckHandler: RequestHandler = (req, res) => {
    try {
      const { employeeId, workstationId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'transfer_check', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      caps.db.run('UPDATE checks SET employee_id = ? WHERE id = ?', [employeeId, req.params.id]);
      caps.recalculateTotals(req.params.id);
      const txnGroupId = caps.getTxnGroupId(req.params.id);
      caps.writeJournal(req.params.id, txnGroupId, check.rvcId || '', 'transfer_check', { employeeId, workstationId });
      caps.transactionSync.queueCheck(req.params.id, 'update', caps.getCheck(req.params.id));
      const updated = caps.getCheck(req.params.id);
      res.json(updated || { success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/checks/:id/transfer', transferCheckHandler);

  const splitCheckHandler: RequestHandler = (req, res) => {
    try {
      const { itemIds, workstationId, employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'split_check', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const newCheck = caps.createCheck({
        rvcId: check.rvcId,
        employeeId: check.employeeId,
        orderType: check.orderType,
        workstationId,
      });
      if (itemIds && itemIds.length > 0) {
        for (const itemId of itemIds) {
          caps.db.run('UPDATE check_items SET check_id = ? WHERE id = ?', [newCheck.id, itemId]);
        }
        caps.recalculateTotals(req.params.id);
        caps.recalculateTotals(newCheck.id);
      }
      const txnGroupId = caps.getTxnGroupId(req.params.id);
      caps.writeJournal(req.params.id, txnGroupId, check.rvcId || '', 'split_check', { newCheckId: newCheck.id, itemIds });
      caps.transactionSync.queueCheck(req.params.id, 'update', caps.getCheck(req.params.id));
      caps.transactionSync.queueCheck(newCheck.id, 'create', caps.getCheck(newCheck.id));
      const sourceCheck = caps.getCheck(req.params.id);
      const sourceItems = sourceCheck ? sourceCheck.items || [] : [];
      const newCheckFull = caps.getCheck(newCheck.id);
      const newItems = newCheckFull ? newCheckFull.items || [] : [];
      res.json({ sourceCheck: { check: sourceCheck, items: sourceItems }, newChecks: [{ check: newCheckFull, items: newItems }] });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/checks/:id/split', splitCheckHandler);

  const mergeChecksHandler: RequestHandler = (req, res) => {
    try {
      const { targetCheckId, sourceCheckIds, employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'merge_checks', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const targetCheck = caps.getCheck(targetCheckId);
      if (!targetCheck) return res.status(404).json({ error: 'Target check not found' });
      for (const sourceId of (sourceCheckIds || [])) {
        const sourceCheck = caps.getCheck(sourceId);
        if (!sourceCheck) continue;
        caps.db.run('UPDATE check_items SET check_id = ? WHERE check_id = ?', [targetCheckId, sourceId]);
        caps.db.run("UPDATE checks SET status = 'closed', closed_at = datetime('now') WHERE id = ?", [sourceId]);
        const txnGroupId = caps.getTxnGroupId(sourceId);
        caps.writeJournal(sourceId, txnGroupId, sourceCheck.rvcId || '', 'merge_check', { targetCheckId });
        caps.transactionSync.queueCheck(sourceId, 'update', caps.getCheck(sourceId));
      }
      caps.recalculateTotals(targetCheckId);
      const txnGroupId = caps.getTxnGroupId(targetCheckId);
      caps.writeJournal(targetCheckId, txnGroupId, targetCheck.rvcId || '', 'merge_check_target', { sourceCheckIds });
      caps.transactionSync.queueCheck(targetCheckId, 'update', caps.getCheck(targetCheckId));
      const merged = caps.getCheck(targetCheckId);
      res.json({ check: merged, items: merged?.items || [] });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/checks/merge', mergeChecksHandler);

  const patchCheckHandler: RequestHandler = (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const updates = req.body;
      const allowedFields = ['orderType', 'guestCount', 'tableNumber', 'customerId', 'customerName', 'notes'];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
          sets.push(`${dbField} = ?`);
          vals.push(updates[field]);
        }
      }
      if (sets.length > 0) {
        vals.push(req.params.id);
        caps.db.run(`UPDATE checks SET ${sets.join(', ')} WHERE id = ?`, vals);
      }
      const txnGroupId = caps.getTxnGroupId(req.params.id);
      caps.writeJournal(req.params.id, txnGroupId, check.rvcId || '', 'update_check', updates);
      caps.transactionSync.queueCheck(req.params.id, 'update', caps.getCheck(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.patch('/checks/:id', patchCheckHandler);

  const voidPaymentHandler: RequestHandler = (req, res) => {
    try {
      const paymentId = req.params.id;
      const { reason, employeeId } = req.body;
      const pmtRow = caps.db.get<any>('SELECT * FROM check_payments WHERE id = ?', [paymentId]);
      if (!pmtRow) return res.status(404).json({ error: 'Payment not found' });
      caps.db.run(
        'UPDATE check_payments SET voided = 1, void_reason = ?, status = ? WHERE id = ?',
        [reason || 'Payment voided', 'voided', paymentId]
      );
      caps.recalculateTotals(pmtRow.check_id);
      const check = caps.getCheck(pmtRow.check_id);
      if (check && check.status === 'closed') {
        caps.db.run('UPDATE checks SET status = ?, closed_at = NULL WHERE id = ?', ['open', pmtRow.check_id]);
      }
      caps.recalculateTotals(pmtRow.check_id);
      const txnGroupId = caps.getTxnGroupId(pmtRow.check_id);
      caps.writeJournal(pmtRow.check_id, txnGroupId, '', 'void_payment', { paymentId, reason, employeeId });
      caps.transactionSync.queueCheck(pmtRow.check_id, 'update', caps.getCheck(pmtRow.check_id));
      res.json({ success: true, voidedPaymentId: paymentId, voidedAmount: pmtRow.amount });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.patch('/check-payments/:id/void', voidPaymentHandler);
  router.patch('/caps/check-payments/:id/void', voidPaymentHandler);

  const restorePaymentHandler: RequestHandler = (req, res) => {
    try {
      const payment = caps.db.get<any>('SELECT * FROM check_payments WHERE id = ?', [req.params.id]);
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      caps.db.run("UPDATE check_payments SET voided = 0, status = 'completed' WHERE id = ?", [req.params.id]);
      caps.recalculateTotals(payment.check_id);
      const txnGroupId = caps.getTxnGroupId(payment.check_id);
      caps.writeJournal(payment.check_id, txnGroupId, '', 'restore_payment', { paymentId: req.params.id });
      caps.transactionSync.queueCheck(payment.check_id, 'update', caps.getCheck(payment.check_id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.patch('/check-payments/:id/restore', restorePaymentHandler);
  router.patch('/caps/check-payments/:id/restore', restorePaymentHandler);

  const voidServiceChargeHandler: RequestHandler = (req, res) => {
    try {
      const sc = caps.db.get<any>('SELECT * FROM check_service_charges WHERE id = ?', [req.params.id]);
      if (!sc) return res.status(404).json({ error: 'Service charge not found' });
      caps.db.run('UPDATE check_service_charges SET voided = 1 WHERE id = ?', [req.params.id]);
      caps.recalculateTotals(sc.check_id);
      const txnGroupId = caps.getTxnGroupId(sc.check_id);
      caps.writeJournal(sc.check_id, txnGroupId, '', 'void_service_charge', { serviceChargeId: req.params.id });
      caps.transactionSync.queueCheck(sc.check_id, 'update', caps.getCheck(sc.check_id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/check-service-charges/:id/void', voidServiceChargeHandler);

  const deleteCheckItemHandler: RequestHandler = (req, res) => {
    try {
      const item = caps.db.get<any>('SELECT * FROM check_items WHERE id = ?', [req.params.id]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (item.sent) return res.status(400).json({ error: 'Cannot delete sent item, void instead' });
      caps.db.run('DELETE FROM check_items WHERE id = ?', [req.params.id]);
      caps.recalculateTotals(item.check_id);
      const txnGroupId = caps.getTxnGroupId(item.check_id);
      caps.writeJournal(item.check_id, txnGroupId, '', 'delete_check_item', { itemId: req.params.id });
      caps.transactionSync.queueCheck(item.check_id, 'update', caps.getCheck(item.check_id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.delete('/check-items/:id', deleteCheckItemHandler);

  router.delete('/check-discounts/:id', (req, res) => {
    try {
      const disc = caps.db.get<any>('SELECT * FROM check_discounts WHERE id = ?', [req.params.id]);
      if (!disc) return res.status(404).json({ error: 'Discount not found' });
      caps.db.run('DELETE FROM check_discounts WHERE id = ?', [req.params.id]);
      caps.recalculateTotals(disc.check_id);
      const txnGroupId = caps.getTxnGroupId(disc.check_id);
      caps.writeJournal(disc.check_id, txnGroupId, '', 'remove_check_discount', { discountId: req.params.id });
      caps.transactionSync.queueCheck(disc.check_id, 'update', caps.getCheck(disc.check_id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.delete('/pos/checks/:id/customer', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      caps.db.run('UPDATE checks SET customer_id = NULL, customer_name = NULL WHERE id = ?', [req.params.id]);
      const txnGroupId = caps.getTxnGroupId(req.params.id);
      caps.writeJournal(req.params.id, txnGroupId, check.rvcId || '', 'remove_customer', { checkId: req.params.id });
      caps.transactionSync.queueCheck(req.params.id, 'update', caps.getCheck(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/lock', (req, res) => {
    try {
      const { workstationId, employeeId } = req.body;
      if (!workstationId || !employeeId) return res.status(400).json({ error: 'workstationId and employeeId required' });
      const result = caps.acquireLock(req.params.id, workstationId, employeeId);
      if (!result.success) return res.status(409).json({ error: 'Check is locked by another workstation', lockedBy: result.lockedBy });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/checks/:id/lock', (req, res) => {
    try {
      const info = caps.getLockInfo(req.params.id);
      res.json(info);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/unlock', (req, res) => {
    try {
      const { workstationId } = req.body;
      if (!workstationId) return res.status(400).json({ error: 'workstationId required' });
      caps.releaseLock(req.params.id, workstationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/check-items/:id/void', (req, res) => {
    try {
      const { reason, workstationId, employeeId, managerPin } = req.body;
      const itemRow = db?.get<any>('SELECT sent FROM check_items WHERE id = ?', [req.params.id]);
      const requiredPriv = itemRow && itemRow.sent ? 'void_sent' : 'void_unsent';
      const privCheck = checkPrivilege(employeeId, requiredPriv, managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const checks = caps.getOpenChecks();
      for (const check of checks) {
        if (check.items?.some((i: any) => i.id === req.params.id)) {
          caps.voidItem(check.id, req.params.id, reason, workstationId);
          const updatedCheck = caps.getCheck(check.id);
          const voidedItem = updatedCheck?.items?.find((i: any) => i.id === req.params.id);
          if (voidedItem) return res.json(voidedItem);
          return res.json({ id: req.params.id, voided: true, itemStatus: 'voided' });
        }
      }
      res.status(404).json({ error: 'Item not found' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.patch('/check-items/:id/modifiers', (req, res) => {
    try {
      const itemId = req.params.id;
      const { modifiers, itemStatus } = req.body;
      const item = caps.db.get<any>('SELECT * FROM check_items WHERE id = ?', [itemId]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const modifiersJson = JSON.stringify(modifiers || []);
      const modSum = (modifiers || []).reduce((s: number, m: any) => s + (parseFloat(m.priceDelta) || 0), 0);
      const totalPrice = (item.unit_price + modSum) * item.quantity;
      caps.db.run(
        `UPDATE check_items SET modifiers = ?, modifiers_json = ?, total_price = ? WHERE id = ?`,
        [modifiersJson, modifiersJson, totalPrice, itemId]
      );
      if (itemStatus) {
        caps.db.run('UPDATE check_items SET sent = ? WHERE id = ?', [itemStatus === 'active' ? 1 : 0, itemId]);
      }
      caps.recalculateTotals(item.check_id);
      const txnGroupId = caps.getTxnGroupId(item.check_id);
      caps.writeJournal(item.check_id, txnGroupId, '', 'update_modifiers', { itemId, modifiers });
      caps.transactionSync.queueCheck(item.check_id, 'update', caps.getCheck(item.check_id));
      const updatedCheck = caps.getCheck(item.check_id);
      const updatedItem = updatedCheck?.items?.find((i: any) => i.id === itemId);
      if (updatedItem) return res.json(updatedItem);
      res.json({ id: itemId, modifiers, menuItemName: item.name, unitPrice: item.unit_price, totalPrice, quantity: item.quantity });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/check-items/:id/discount', (req, res) => {
    try {
      const itemId = req.params.id;
      const { discountId, employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'apply_discount', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const item = caps.db.get<any>('SELECT * FROM check_items WHERE id = ?', [itemId]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const discount = caps.db.getDiscount(discountId);
      if (!discount) return res.status(404).json({ error: 'Discount not found' });
      let discountAmount = 0;
      const discType = discount.discount_type || discount.type || 'percent';
      if (discType === 'percent') {
        discountAmount = parseFloat(((item.unit_price * item.quantity) * (parseFloat(discount.amount || discount.value || '0') / 100)).toFixed(2));
      } else {
        discountAmount = parseFloat(discount.amount || discount.value || '0');
      }
      caps.db.run(
        `UPDATE check_items SET discount_id = ?, discount_name = ?, discount_amount = ?, discount_type = ? WHERE id = ?`,
        [discountId, discount.name, discountAmount, discType, itemId]
      );
      caps.recalculateTotals(item.check_id);
      const txnGroupId = caps.getTxnGroupId(item.check_id);
      caps.writeJournal(item.check_id, txnGroupId, '', 'apply_item_discount', { itemId, discountId, discountAmount });
      caps.transactionSync.queueCheck(item.check_id, 'update', caps.getCheck(item.check_id));
      const updatedCheck = caps.getCheck(item.check_id);
      const updatedItem = updatedCheck?.items?.find((i: any) => i.id === itemId);
      res.json({ item: updatedItem, check: updatedCheck });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  const deleteItemDiscountHandler: RequestHandler = (req, res) => {
    try {
      const itemId = req.params.id;
      const { employeeId, managerPin } = req.body || {};
      const privCheck = checkPrivilege(employeeId, 'apply_discount', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const item = caps.db.get<any>('SELECT * FROM check_items WHERE id = ?', [itemId]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      caps.db.run(
        'UPDATE check_items SET discount_id = NULL, discount_name = NULL, discount_amount = 0, discount_type = NULL WHERE id = ?',
        [itemId]
      );
      caps.recalculateTotals(item.check_id);
      const txnGroupId = caps.getTxnGroupId(item.check_id);
      caps.writeJournal(item.check_id, txnGroupId, '', 'remove_item_discount', { itemId });
      caps.transactionSync.queueCheck(item.check_id, 'update', caps.getCheck(item.check_id));
      const updatedCheck = caps.getCheck(item.check_id);
      const updatedItem = updatedCheck?.items?.find((i: any) => i.id === itemId);
      res.json({ item: updatedItem, check: updatedCheck });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.delete('/check-items/:id/discount', deleteItemDiscountHandler);

  const priceOverrideHandler: RequestHandler = (req, res) => {
    try {
      const itemId = req.params.id;
      const { newPrice, reason, employeeId, managerPin } = req.body;
      const privCheck = checkPrivilege(employeeId, 'modify_price', managerPin);
      if (!privCheck.allowed) {
        return res.status(403).json(privCheck.error);
      }
      const item = caps.db.get<any>('SELECT * FROM check_items WHERE id = ?', [itemId]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const modifiers = JSON.parse(item.modifiers || '[]');
      const modSum = modifiers.reduce((s: number, m: any) => s + (parseFloat(m.priceDelta) || 0), 0);
      const totalPrice = (parseFloat(newPrice) + modSum) * item.quantity;
      caps.db.run('UPDATE check_items SET unit_price = ?, total_price = ? WHERE id = ?', [parseFloat(newPrice), totalPrice, itemId]);
      caps.recalculateTotals(item.check_id);
      const txnGroupId = caps.getTxnGroupId(item.check_id);
      caps.writeJournal(item.check_id, txnGroupId, '', 'price_override', { itemId, oldPrice: item.unit_price, newPrice, reason });
      caps.transactionSync.queueCheck(item.check_id, 'update', caps.getCheck(item.check_id));
      const updatedCheck = caps.getCheck(item.check_id);
      const updatedItem = updatedCheck?.items?.find((i: any) => i.id === itemId);
      res.json(updatedItem || { id: itemId, unitPrice: parseFloat(newPrice), totalPrice });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/check-items/:id/price-override', priceOverrideHandler);

  const postPaymentHandler: RequestHandler = (req, res) => {
    try {
      const body = req.body || {};
      const checkId = body.checkId || body.check_id;
      if (!checkId) {
        return res.status(400).json({ error: 'Missing checkId in payment body' });
      }
      const paymentId = body.id || randomUUID();
      const now = new Date().toISOString();
      caps.db.run(
        `INSERT OR REPLACE INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, change_amount, card_last4, card_brand, auth_code, reference_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          checkId,
          body.tenderId || body.tender_id || 'cash',
          body.tenderType || body.tender_type || body.type || 'cash',
          body.amount || 0,
          body.tipAmount || body.tip_amount || 0,
          body.changeAmount || body.change_amount || 0,
          body.cardLast4 || body.card_last4 || null,
          body.cardBrand || body.card_brand || null,
          body.authCode || body.auth_code || null,
          body.referenceNumber || body.reference_number || null,
          body.status || 'completed',
          body.createdAt || body.created_at || now,
        ]
      );
      caps.recalculateTotals(checkId);
      const pmtTxnGroupId = caps.getTxnGroupId(checkId);
      const pmtCheck = caps.getCheck(checkId);
      caps.writeJournal(checkId, pmtTxnGroupId, pmtCheck?.rvcId || '', 'payment_added', { paymentId, amount: body.amount || 0, type: body.tenderType || body.tender_type || 'cash' });
      caps.transactionSync.queueCheck(checkId, 'update', pmtCheck);
      console.log('[CAPS] Payment saved:', paymentId, 'for check:', checkId);
      res.json({ id: paymentId, checkId, status: body.status || 'completed', offline: false });
    } catch (e) {
      console.error('[CAPS] Payment route error:', (e as Error).message);
      res.status(500).json({ error: (e as Error).message });
    }
  };
  router.post('/payments', postPaymentHandler);

  router.post('/pos/record-external-payment', (req, res) => {
    try {
      const { checkId, amount, paymentType, reference, workstationId } = req.body;
      const check = caps.getCheck(checkId);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const payment = caps.addPayment(checkId, {
        tenderType: (paymentType === 'credit' || paymentType === 'debit' || paymentType === 'gift') ? paymentType : 'cash',
        tenderId: paymentType || 'external',
        amount: amount,
        reference: reference || 'external'
      }, workstationId);
      const updatedCheck = caps.getCheck(checkId);
      if (updatedCheck && updatedCheck.amountDue <= 0) {
        caps.closeCheck(checkId, workstationId);
      }
      res.json({ success: true, payment });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/time-clock/punch', (req, res) => {
    try {
      const { employeeId, punchType, jobCodeId, workstationId } = req.body;
      const id = randomUUID();
      const now = new Date().toISOString();
      caps.db.run(
        `INSERT OR IGNORE INTO time_entries (id, employee_id, punch_type, job_code_id, punch_time, clock_in, workstation_id, cloud_synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [id, employeeId, punchType || 'clock_in', jobCodeId || null, now, now, workstationId || null]
      );
      caps.transactionSync.queueTimeEntry(id, 'create', { id, employeeId, punchType, jobCodeId, punchTime: now, workstationId });
      res.json({ success: true, id, punchTime: now });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/pos/modifier-map', (_req, res) => {
    try {
      const menuItemModGroups = caps.db.all<any>(
        'SELECT mimg.menu_item_id, mimg.modifier_group_id, mimg.display_order, mimg.sort_order, mimg.min_required, mimg.max_allowed FROM menu_item_modifier_groups mimg'
      );
      const modGroups = caps.db.all<any>('SELECT * FROM modifier_groups');
      const modGroupMods = caps.db.all<any>(
        'SELECT mgm.modifier_group_id, mgm.modifier_id, mgm.display_order, mgm.is_default FROM modifier_group_modifiers mgm'
      );
      const modifiers = caps.db.all<any>('SELECT * FROM modifiers');

      const modGroupMap: Record<string, any> = {};
      for (const mg of modGroups) {
        modGroupMap[mg.id] = mg;
      }
      const modMap: Record<string, any> = {};
      for (const m of modifiers) {
        modMap[m.id] = m;
      }

      const result: Record<string, any> = {};
      for (const mimg of menuItemModGroups) {
        if (!result[mimg.menu_item_id]) result[mimg.menu_item_id] = {};
        const mg = modGroupMap[mimg.modifier_group_id];
        if (!mg) continue;
        const groupMods = modGroupMods
          .filter((mgm: any) => mgm.modifier_group_id === mimg.modifier_group_id)
          .map((mgm: any) => {
            const mod = modMap[mgm.modifier_id];
            if (!mod) return null;
            return {
              id: mod.id,
              name: mod.name,
              price: mod.price || mod.additional_price || 0,
              sortOrder: mgm.display_order || 0,
              isDefault: mgm.is_default ? true : false,
              active: mod.active !== 0
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));

        result[mimg.menu_item_id][mimg.modifier_group_id] = {
          id: mg.id,
          name: mg.name,
          code: mg.code || null,
          minRequired: mimg.min_required ?? mg.min_required ?? 0,
          maxAllowed: mimg.max_allowed ?? mg.max_allowed ?? 0,
          sortOrder: mimg.sort_order ?? mimg.display_order ?? 0,
          modifiers: groupMods
        };
      }
      res.json(result);
    } catch (e) {
      console.error('[CAPS] modifier-map error:', (e as Error).message);
      res.json({});
    }
  });

  try {
    caps.db.run(`
      CREATE TABLE IF NOT EXISTS terminal_sessions (
        id TEXT PRIMARY KEY,
        terminal_device_id TEXT,
        check_id TEXT,
        amount TEXT,
        tip_amount TEXT DEFAULT '0.00',
        status TEXT DEFAULT 'pending',
        transaction_type TEXT DEFAULT 'sale',
        data TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    console.log('[CAPS] terminal_sessions table ensured in CAPS database');
  } catch (e) {
    console.error('[CAPS] Failed to create terminal_sessions table:', (e as Error).message);
  }

  router.post('/terminal-sessions', async (req, res) => {
    try {
      const sessionId = `caps_ts_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      const session = {
        id: sessionId,
        terminalDeviceId: req.body.terminalDeviceId,
        checkId: req.body.checkId,
        amount: req.body.amount,
        tipAmount: req.body.tipAmount || '0.00',
        status: 'pending',
        transactionType: req.body.transactionType || 'sale',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        localCaps: true,
      };
      caps.db.run(
        `INSERT INTO terminal_sessions (id, terminal_device_id, check_id, amount, tip_amount, status, transaction_type, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [session.id, session.terminalDeviceId, session.checkId, session.amount,
         session.tipAmount, session.status, session.transactionType,
         JSON.stringify(session), session.createdAt, session.updatedAt]
      );
      console.log(`[CAPS] Terminal session created (SQLite): ${sessionId} — queued for poll-based processing`);
      res.json(session);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/terminal-sessions', async (_req, res) => {
    try {
      const rows = caps.db.all<any>('SELECT data FROM terminal_sessions ORDER BY created_at DESC');
      const sessions = rows.map((r: any) => {
        try { return JSON.parse(r.data); } catch { return r; }
      });
      res.json(sessions);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/terminal-sessions/:id', async (req, res) => {
    try {
      const row = caps.db.get<any>('SELECT data FROM terminal_sessions WHERE id = ?', [req.params.id]);
      if (row) {
        try { return res.json(JSON.parse(row.data)); } catch { return res.json(row); }
      }
      res.status(404).json({ error: 'Terminal session not found' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.patch('/terminal-sessions/:id', async (req, res) => {
    try {
      const row = caps.db.get<any>('SELECT data FROM terminal_sessions WHERE id = ?', [req.params.id]);
      if (row) {
        let session: any;
        try { session = JSON.parse(row.data); } catch { session = { id: req.params.id }; }
        Object.assign(session, req.body, { updatedAt: new Date().toISOString() });
        caps.db.run(
          `UPDATE terminal_sessions SET data = ?, status = ?, updated_at = ? WHERE id = ?`,
          [JSON.stringify(session), session.status || 'pending', session.updatedAt, req.params.id]
        );
        console.log(`[CAPS] Terminal session updated (SQLite): ${req.params.id} -> ${session.status}`);
        return res.json(session);
      }
      res.status(404).json({ error: 'Terminal session not found' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ============================================================================
  // CAPS-prefixed route aliases for Electron interceptor path rewriting
  // The /caps/ prefix is added by the Electron interceptor; these aliases
  // use the same named handler functions as the non-prefixed routes to
  // guarantee behavioral parity with zero duplication.
  // Static paths (e.g. /caps/checks/open) are registered before parameterized
  // paths (e.g. /caps/checks/:id) to prevent path shadowing.
  // ============================================================================

  router.get('/caps/checks/open', openChecksHandler);
  router.post('/caps/checks/merge', mergeChecksHandler);
  router.post('/caps/payments', postPaymentHandler);

  router.post('/caps/checks/:id/reopen', reopenCheckHandler);
  router.post('/caps/checks/:id/transfer', transferCheckHandler);
  router.post('/caps/checks/:id/split', splitCheckHandler);
  router.post('/caps/checks/:id/discount', checkDiscountHandler);
  router.post('/caps/checks/:id/print', printCheckHandler);
  router.post('/caps/checks/:id/service-charges', postServiceChargesHandler);
  router.get('/caps/checks/:id/full-details', fullDetailsHandler);
  router.get('/caps/checks/:id/payments', checkPaymentsHandler);
  router.get('/caps/checks/:id/discounts', checkDiscountsHandler);
  router.get('/caps/checks/:id/service-charges', getServiceChargesHandler);
  router.patch('/caps/checks/:id', patchCheckHandler);

  router.delete('/caps/check-items/:id/discount', deleteItemDiscountHandler);
  router.post('/caps/check-items/:id/price-override', priceOverrideHandler);
  router.delete('/caps/check-items/:id', deleteCheckItemHandler);

  router.post('/caps/check-service-charges/:id/void', voidServiceChargeHandler);

  // ============================================================================
  // Privilege Enforcement
  // ============================================================================

  const DEFAULT_PRIVILEGES = [
    'fast_transaction', 'send_to_kitchen', 'void_unsent', 'void_sent',
    'apply_discount', 'admin_access', 'kds_access', 'manager_approval',
    'transfer_check', 'split_check', 'merge_checks', 'reopen_check', 'modify_price',
    'open_check', 'close_check', 'add_modifier', 'remove_modifier',
    'apply_tender', 'split_payment', 'process_refunds',
  ];

  function resolveEmployeePrivileges(employee: any): string[] {
    if (employee.privileges && Array.isArray(employee.privileges) && employee.privileges.length > 0) {
      return employee.privileges;
    }
    if (employee.rolePrivileges && Array.isArray(employee.rolePrivileges) && employee.rolePrivileges.length > 0) {
      return employee.rolePrivileges;
    }
    if (db) {
      const roleId = employee.roleId || employee.role_id;
      if (roleId) {
        const rolePrivs = db.getRolePrivileges(roleId);
        if (rolePrivs && rolePrivs.length > 0) {
          return rolePrivs;
        }
      }
      const assignments = db.getEmployeeAssignments(employee.id);
      if (assignments && assignments.length > 0) {
        const primary = assignments.find((a: any) => a.is_primary === 1 || a.isPrimary) || assignments[0];
        const assignRoleId = primary.role_id || primary.roleId;
        if (assignRoleId) {
          const assignPrivs = db.getRolePrivileges(assignRoleId);
          if (assignPrivs && assignPrivs.length > 0) {
            return assignPrivs;
          }
        }
      }
    }
    console.warn(`[Auth] Falling back to default privileges for employee ${employee.id} — no role/assignment privileges found`);
    return DEFAULT_PRIVILEGES;
  }

  function checkPrivilege(employeeId: string | undefined, requiredPrivilege: string, managerPin?: string): { allowed: boolean; error?: any } {
    if (!employeeId) {
      return { allowed: false, error: { error: 'Permission denied', requiredPrivilege, employeeId: employeeId || 'unknown' } };
    }
    const employees = config.getEmployees();
    const employee = employees.find((emp: any) => emp.id === employeeId);
    if (!employee) {
      return { allowed: false, error: { error: 'Permission denied', requiredPrivilege, employeeId } };
    }
    const privileges = resolveEmployeePrivileges(employee);
    if (privileges.includes('admin_access') || privileges.includes(requiredPrivilege)) {
      return { allowed: true };
    }
    if (managerPin) {
      const manager = employees.find((emp: any) =>
        emp.pinHash === managerPin || emp.pin_hash === managerPin || emp.pin === managerPin || emp.posPin === managerPin || emp.pos_pin === managerPin
      );
      if (manager) {
        const managerPrivs = resolveEmployeePrivileges(manager);
        if (managerPrivs.includes('admin_access') || managerPrivs.includes(requiredPrivilege)) {
          return { allowed: true };
        }
      }
    }
    return { allowed: false, error: { error: 'Permission denied', requiredPrivilege, employeeId } };
  }

  router.post('/auth/login', (req, res) => {
    try {
      const pin = req.body?.pin;
      if (!pin) return res.status(400).json({ message: 'PIN required' });
      const employees = config.getEmployees();
      const employee = employees.find((emp: any) =>
        emp.pinHash === pin || emp.pin_hash === pin || emp.pin === pin || emp.posPin === pin || emp.pos_pin === pin
      );
      if (!employee) return res.status(401).json({ message: 'Invalid PIN' });
      res.json({
        employee: {
          id: employee.id,
          firstName: employee.firstName || employee.first_name,
          lastName: employee.lastName || employee.last_name,
          pinHash: employee.pinHash || employee.pin_hash,
          roleId: employee.roleId || employee.role_id,
          roleName: employee.roleName || employee.role_name,
          active: employee.active !== undefined ? employee.active : true,
          jobTitle: employee.jobTitle || employee.job_title || null,
          enterpriseId: employee.enterpriseId || employee.enterprise_id || null,
        },
        privileges: resolveEmployeePrivileges(employee),
        salariedBypass: true,
        bypassJobCode: null,
        device: null,
        offlineAuth: true,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/auth/pin', (req, res) => {
    try {
      const pin = req.body?.pin;
      if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });
      const employees = config.getEmployees();
      const employee = employees.find((emp: any) =>
        emp.pinHash === pin || emp.pin_hash === pin || emp.pin === pin || emp.posPin === pin || emp.pos_pin === pin
      );
      if (!employee) return res.status(401).json({ success: false, message: 'Invalid PIN' });
      res.json({
        success: true,
        employee,
        privileges: resolveEmployeePrivileges(employee),
        offlineAuth: true,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/auth/offline-employees', (req, res) => {
    try {
      const employees = config.getEmployees();
      res.json(employees.map((emp: any) => ({
        id: emp.id,
        firstName: emp.firstName || emp.first_name,
        lastName: emp.lastName || emp.last_name,
        pinHash: emp.pinHash || emp.pin_hash,
        posPin: emp.posPin || emp.pos_pin,
        roleId: emp.roleId || emp.role_id,
        roleName: emp.roleName || emp.role_name,
        active: emp.active,
      })));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/auth/manager-approval', (req, res) => {
    try {
      const pin = req.body?.pin || req.body?.managerPin;
      const requiredPrivilege = req.body?.requiredPrivilege || req.body?.privilege;
      if (!pin) return res.status(400).json({ success: false, message: 'Manager PIN required' });
      const employees = config.getEmployees();
      const manager = employees.find((emp: any) =>
        emp.pinHash === pin || emp.pin_hash === pin || emp.pin === pin || emp.posPin === pin || emp.pos_pin === pin
      );
      if (!manager) return res.status(401).json({ success: false, message: 'Invalid manager PIN' });
      const privs = resolveEmployeePrivileges(manager);
      const hasAdmin = privs.includes('admin_access');
      const hasManager = privs.includes('manager_approval');
      const hasSpecific = requiredPrivilege ? privs.includes(requiredPrivilege) : true;
      if (!hasAdmin && !hasManager && !hasSpecific) {
        return res.status(403).json({ success: false, message: 'Employee does not have manager privileges' });
      }
      res.json({
        success: true,
        approved: true,
        managerId: manager.id,
        managerName: `${manager.firstName} ${manager.lastName}`,
        offlineAuth: true,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/tenders', (_req, res) => {
    try { res.json(config.getTenders()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/tender-types', (_req, res) => {
    try { res.json(config.getTenders()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/discounts', (_req, res) => {
    try { res.json(config.getDiscounts()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/service-charges', (_req, res) => {
    try { res.json(config.getServiceCharges()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/menu-items', (_req, res) => {
    try { res.json(config.getMenuItems()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/menu-items/:id', (req, res) => {
    try {
      const item = config.getMenuItemWithModifiers(req.params.id);
      if (!item) return res.status(404).json({ error: 'Menu item not found' });
      res.json(item);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/slus', (req, res) => {
    try { res.json(config.getSlus()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/slus/:id/items', (req, res) => {
    try { res.json(config.getMenuItemsBySlu(req.params.id)); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/modifier-groups', (_req, res) => {
    try {
      const groups = (config as any).getModifierGroups ? (config as any).getModifierGroups() : [];
      res.json(groups);
    } catch (e) { res.json([]); }
  });
  router.get('/modifiers', (_req, res) => {
    try {
      const mods = (config as any).getModifiers ? (config as any).getModifiers() : [];
      res.json(mods);
    } catch (e) { res.json([]); }
  });
  router.get('/tax-rates', (_req, res) => {
    try { res.json(config.getTaxGroups()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/tax-groups', (_req, res) => {
    try { res.json(config.getTaxGroups()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/order-types', (_req, res) => {
    try {
      const types = (config as any).getOrderTypes ? (config as any).getOrderTypes() : [];
      res.json(types);
    } catch (e) { res.json([]); }
  });
  router.get('/payment-processors', (_req, res) => {
    try { res.json(config.getPaymentProcessors()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/payment-processors/:id', (req, res) => {
    try {
      const proc = config.getPaymentProcessor(req.params.id);
      if (!proc) return res.status(404).json({ error: 'Not found' });
      res.json(proc);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/properties', (_req, res) => {
    try {
      const prop = config.getProperty();
      res.json(prop ? [prop] : []);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/rvcs', (_req, res) => {
    try { res.json(config.getRvcs()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/rvcs/:id', (req, res) => {
    try {
      const rvc = config.getRvc(req.params.id);
      if (!rvc) return res.status(404).json({ error: 'RVC not found' });
      res.json(rvc);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/revenue-centers', (_req, res) => {
    try { res.json(config.getRvcs()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/employees', (_req, res) => {
    try { res.json(config.getEmployees()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/employees/:id', (req, res) => {
    try {
      const emp = config.getEmployee(req.params.id);
      if (!emp) return res.status(404).json({ error: 'Employee not found' });
      res.json(emp);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/workstations', (_req, res) => {
    try { res.json(config.getWorkstations()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/workstations/:id/context', (req, res) => {
    try {
      const ws = config.getWorkstations().find((w: any) => w.id === req.params.id);
      const rvcs = config.getRvcs();
      const prop = config.getProperty();
      let enterprise: any = null;
      if (prop && (prop.enterpriseId || prop.enterprise_id) && caps.db) {
        enterprise = caps.db.getEnterprise(prop.enterpriseId || prop.enterprise_id);
      }

      const wsRvcId = ws?.rvcId || ws?.rvc_id;
      let defaultLayout: any = null;
      if (wsRvcId) {
        const layout = config.getPosLayoutForRvc(wsRvcId);
        if (layout) {
          const cells = config.getPosLayoutCells(layout.id);
          defaultLayout = { ...layout, cells };
        }
      }

      const menuItemCount = config.getMenuItems().length;
      const sluCount = config.getSlus().length;
      const tenderCount = config.getTenders().length;
      const taxGroupCount = config.getTaxGroups().length;
      const discountCount = config.getDiscounts().length;

      res.json({
        workstation: ws || { id: req.params.id, name: 'CAPS Workstation' },
        rvcs: rvcs || [],
        property: prop || null,
        enterprise: enterprise || null,
        defaultLayout,
        configSummary: {
          menuItems: menuItemCount,
          slus: sluCount,
          tenders: tenderCount,
          taxGroups: taxGroupCount,
          discounts: discountCount,
        },
        offlineMode: true,
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/printers', (_req, res) => {
    try { res.json(config.getPrinters()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/kds-devices', (_req, res) => {
    try { res.json(config.getKdsDevices()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/kds-devices/active', (req, res) => {
    try {
      const propertyId = req.query.propertyId as string | undefined;
      const devices = config.getKdsDevices();
      const filtered = propertyId ? devices.filter((d: any) => d.propertyId === propertyId || d.property_id === propertyId) : devices;
      const orderDevices = config.getOrderDevices();
      const enriched = filtered.map((d: any) => {
        const linkedOrderDevices = orderDevices.filter((od: any) => {
          if (od.kdsDeviceId === d.id || od.kds_device_id === d.id) return true;
          if (caps.db) {
            const odKdsLinks = caps.db.getOrderDeviceKds(od.id);
            return odKdsLinks.some((link: any) => link.kds_device_id === d.id);
          }
          return false;
        });
        return { ...d, orderDevices: linkedOrderDevices };
      });
      res.json(enriched);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/kds-devices/:id', (req, res) => {
    try {
      const devices = config.getKdsDevices();
      const device = devices.find((d: any) => d.id === req.params.id);
      if (!device) return res.status(404).json({ message: 'Not found' });
      const orderDevices = config.getOrderDevices();
      const linkedOrderDevices = orderDevices.filter((od: any) => {
        if (od.kdsDeviceId === device.id || od.kds_device_id === device.id) return true;
        if (caps.db) {
          const odKdsLinks = caps.db.getOrderDeviceKds(od.id);
          return odKdsLinks.some((link: any) => link.kds_device_id === device.id);
        }
        return false;
      });
      res.json({ ...device, orderDevices: linkedOrderDevices });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/order-devices', (_req, res) => {
    try { res.json(config.getOrderDevices()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/terminal-devices', (_req, res) => {
    try { res.json(config.getTerminalDevices()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/major-groups', (_req, res) => {
    try { res.json(config.getMajorGroups()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/family-groups', (_req, res) => {
    try {
      const groups = (config as any).getAllFamilyGroups ? (config as any).getAllFamilyGroups() : [];
      res.json(groups);
    } catch (e) { res.json([]); }
  });
  router.get('/print-classes', (_req, res) => {
    try { res.json(config.getPrintClasses()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/roles', (_req, res) => {
    try { res.json(config.getRoles()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/job-codes', (_req, res) => {
    try { res.json(config.getJobCodes()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/option-flags', (req, res) => {
    try {
      const enterpriseId = req.query.enterpriseId as string | undefined;
      const flags = config.getOptionFlags(enterpriseId);
      res.json(flags);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/pos-layouts/default/:rvcId', (req, res) => {
    try {
      const layout = config.getPosLayoutForRvc(req.params.rvcId);
      if (!layout) return res.status(404).json({ error: 'No layout found for rvc=' + req.params.rvcId });
      const cells = config.getPosLayoutCells(layout.id);
      res.json({ ...layout, cells });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/pos-layouts/:id/cells', (req, res) => {
    try {
      const cells = config.getPosLayoutCells(req.params.id);
      res.json(cells || []);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  router.get('/item-availability', (_req, res) => {
    res.json([]);
  });
  router.post('/item-availability/decrement', (_req, res) => {
    res.json({ success: true });
  });
  router.post('/item-availability/increment', (_req, res) => {
    res.json({ success: true });
  });
  router.get('/break-rules', (_req, res) => {
    res.json([]);
  });
  router.post('/system-status/workstation/heartbeat', (_req, res) => {
    res.json({ status: 'caps', offline: true });
  });
  router.get('/system-status', (_req, res) => {
    res.json({ status: 'caps', offline: true });
  });
  router.get('/client-ip', (req, res) => {
    res.json({ ip: req.ip || '127.0.0.1', offline: true });
  });
  router.post('/registered-devices/heartbeat', (_req, res) => {
    res.json({ status: 'caps', offline: true });
  });
  router.post('/cash-drawer-kick', (_req, res) => {
    res.json({ success: true, message: 'Cash drawer kick accepted' });
  });
  router.post('/print-jobs', async (req, res) => {
    try {
      const job = await print.submitJob(req.body);
      res.json(job);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  router.get('/kds-tickets', (req, res) => {
    try {
      const stationId = (req.query.stationId || req.query.kdsDeviceId || req.query.stationType) as string | undefined;
      const tickets = kds.getActiveTickets(stationId);
      res.json(tickets);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  router.get('/kds-tickets/bumped', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const tickets = kds.getBumpedTickets(limit);
      res.json(tickets);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  router.post('/kds-tickets/bump-all', (req, res) => {
    try {
      const { stationId, stationType, kdsDeviceId, deviceId } = req.body;
      const effectiveStation = stationId || stationType || kdsDeviceId || deviceId;
      const tickets = kds.getActiveTickets(effectiveStation);
      let bumped = 0;
      for (const ticket of tickets) {
        kds.bumpTicket(ticket.id, effectiveStation);
        bumped++;
      }
      res.json({ bumped, message: `Cleared ${bumped} tickets` });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  router.post('/kds-tickets/:id/bump', (req, res) => {
    try {
      kds.bumpTicket(req.params.id, req.body.stationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  router.post('/kds-tickets/:id/recall', (req, res) => {
    try {
      kds.recallTicket(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  router.get('/kds-tickets/:id', (req, res) => {
    try {
      const ticket = kds.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      res.json(ticket);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  router.get('/loyalty-members/phone/:phone', (req, res) => {
    try {
      const member = config.getLoyaltyMemberByPhone(req.params.phone);
      if (!member) return res.status(404).json({ error: 'Not found' });
      res.json(member);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  router.get('/loyalty-members/:id', (req, res) => {
    try {
      const member = config.getLoyaltyMember(req.params.id);
      if (!member) return res.status(404).json({ error: 'Not found' });
      res.json(member);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/rvcs/:id/closed-checks', (req, res) => {
    try {
      const rvcId = req.params.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const closedRows = db ? db.all<any>(
        `SELECT id FROM checks WHERE rvc_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT ?`,
        [rvcId, limit]
      ) : [];
      const checks = closedRows.map((r: any) => caps.getCheck(r.id)).filter(Boolean);
      res.json(checks);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/rvcs/:id/refunds', (req, res) => {
    try {
      const rvcId = req.params.id;
      const refunds = db ? db.all<any>(
        `SELECT * FROM refunds WHERE rvc_id = ? ORDER BY created_at DESC LIMIT 50`,
        [rvcId]
      ) : [];
      res.json(refunds);
    } catch (e) {
      res.json([]);
    }
  });

  router.get('/refunds/:id', (req, res) => {
    try {
      const refund = db ? db.get<any>('SELECT * FROM refunds WHERE id = ?', [req.params.id]) : null;
      if (!refund) return res.status(404).json({ error: 'Refund not found' });
      res.json(refund);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  const postRefundHandler: RequestHandler = (req, res) => {
    try {
      const { checkId, rvcId, employeeId, items, reason, refundType, total } = req.body;
      const refundId = randomUUID();
      const refundNumber = Date.now() % 100000;
      const now = new Date().toISOString();
      if (db) {
        try {
          db.run(
            `INSERT INTO refunds (id, check_id, rvc_id, employee_id, refund_type, reason, total, refund_number, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
            [refundId, checkId || null, rvcId || null, employeeId || null, refundType || 'full', reason || '', parseFloat(total) || 0, refundNumber, now]
          );
        } catch (dbErr) {
          console.warn('[CAPS] Refunds table may not exist, returning stub:', (dbErr as Error).message);
        }
      }
      const txnGroupId = checkId ? caps.getTxnGroupId(checkId) : refundId;
      caps.writeJournal(checkId || refundId, txnGroupId, rvcId || '', 'refund_created', { refundId, refundType, total, reason });
      if (checkId) {
        caps.transactionSync.queueCheck(checkId, 'update', caps.getCheck(checkId));
      }
      res.json({ id: refundId, refundNumber, total: parseFloat(total) || 0, status: 'completed' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };
  router.post('/refunds', postRefundHandler);
  router.post('/caps/refunds', postRefundHandler);
  router.get('/gift-cards/:id', (_req, res) => {
    res.status(503).json({ error: 'Gift card operations require cloud connection' });
  });
  router.post('/gift-cards/:action', (_req, res) => {
    res.status(503).json({ error: 'Gift card operations require cloud connection' });
  });
  router.get('/time-punches/status/:id', (_req, res) => {
    res.json({ status: 'clocked_in', isClockedIn: true, lastPunch: null, activeBreak: null });
  });
  router.get('/time-punches/status', (_req, res) => {
    res.json({ status: 'clocked_in', isClockedIn: true, lastPunch: null, activeBreak: null });
  });

  // ============================================================================
  // POS-prefixed routes — frontend calls /api/pos/... which arrives as /pos/...
  // These ensure all POS operations route through CAPS with no cloud fallback.
  // ============================================================================

  router.post('/pos/checks/:id/customer', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const { customerId, customerName } = req.body;
      caps.db.run('UPDATE checks SET customer_id = ?, customer_name = ? WHERE id = ?',
        [customerId || null, customerName || null, req.params.id]);
      const txnGroupId = caps.getTxnGroupId(req.params.id);
      caps.writeJournal(req.params.id, txnGroupId, check.rvcId || '', 'attach_customer', { customerId, customerName });
      caps.transactionSync.queueCheck(req.params.id, 'update', caps.getCheck(req.params.id));
      res.json({ success: true, customerId, customerName });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/pos/capture-with-tip', (req, res) => {
    try {
      const { checkPaymentId, tipAmount, employeeId } = req.body;
      if (!checkPaymentId) return res.status(400).json({ success: false, message: 'checkPaymentId required' });
      const pmtRow = caps.db.get<any>('SELECT * FROM check_payments WHERE id = ?', [checkPaymentId]);
      if (!pmtRow) return res.status(404).json({ success: false, message: 'Payment not found' });
      const tip = parseFloat(tipAmount) || 0;
      const baseAmount = parseFloat(pmtRow.amount) || 0;
      const finalAmount = baseAmount + tip;
      caps.db.run(
        'UPDATE check_payments SET tip_amount = ?, amount = ?, status = ? WHERE id = ?',
        [tip, finalAmount, 'captured', checkPaymentId]
      );
      caps.recalculateTotals(pmtRow.check_id);
      const txnGroupId = caps.getTxnGroupId(pmtRow.check_id);
      caps.writeJournal(pmtRow.check_id, txnGroupId, '', 'capture_with_tip', { checkPaymentId, tipAmount: tip, finalAmount });
      caps.transactionSync.queueCheck(pmtRow.check_id, 'update', caps.getCheck(pmtRow.check_id));
      res.json({ success: true, finalAmount, tipAmount: tip });
    } catch (e) {
      res.status(400).json({ success: false, message: (e as Error).message });
    }
  });

  router.post('/pos/process-card-payment', (req, res) => {
    try {
      const { checkId, amount, tenderId, cardNumber, expiryDate, cvv, workstationId } = req.body;
      if (!checkId) return res.status(400).json({ success: false, message: 'checkId required' });
      const check = caps.getCheck(checkId);
      if (!check) return res.status(404).json({ success: false, message: 'Check not found' });
      const last4 = cardNumber ? String(cardNumber).slice(-4) : '0000';
      const authCode = `CAP${Date.now().toString(36).toUpperCase()}`;
      const payment = caps.addPayment(checkId, {
        tenderType: 'credit',
        tenderId: tenderId || 'credit',
        amount: parseFloat(amount) || 0,
        reference: `REF${Date.now()}|${last4}|${authCode}`,
      }, workstationId);
      const updatedCheck = caps.getCheck(checkId);
      if (updatedCheck && updatedCheck.amountDue <= 0) {
        caps.closeCheck(checkId, workstationId);
      }
      res.json({
        success: true,
        payment,
        transactionId: payment.id,
        authCode,
        cardLast4: last4,
        message: 'Card payment processed through CAPS',
      });
    } catch (e) {
      res.status(400).json({ success: false, message: (e as Error).message });
    }
  });

  router.post('/pos/gift-cards/redeem', (req, res) => {
    try {
      const { checkId, giftCardNumber, amount, workstationId } = req.body;
      if (!checkId) return res.status(400).json({ success: false, message: 'checkId required' });
      const check = caps.getCheck(checkId);
      if (!check) return res.status(404).json({ success: false, message: 'Check not found' });
      const payment = caps.addPayment(checkId, {
        tenderType: 'gift',
        tenderId: 'gift',
        amount: parseFloat(amount) || 0,
        reference: giftCardNumber || 'GC-CAPS',
      }, workstationId);
      const updatedCheck = caps.getCheck(checkId);
      if (updatedCheck && updatedCheck.amountDue <= 0) {
        caps.closeCheck(checkId, workstationId);
      }
      res.json({
        success: true,
        payment,
        remainingBalance: 0,
        message: 'Gift card redeemed through CAPS (balance tracking requires cloud)',
      });
    } catch (e) {
      res.status(400).json({ success: false, message: (e as Error).message });
    }
  });

  router.get('/pos/customers/search', (req, res) => {
    try {
      const query = (req.query.query as string || '').toLowerCase();
      if (!query) return res.json([]);
      const members = (config as any).getLoyaltyMembers ? (config as any).getLoyaltyMembers() : [];
      const results = members.filter((m: any) => {
        const name = `${m.firstName || m.first_name || ''} ${m.lastName || m.last_name || ''}`.toLowerCase();
        const phone = (m.phone || m.phoneNumber || m.phone_number || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        return name.includes(query) || phone.includes(query) || email.includes(query);
      }).slice(0, 20);
      res.json(results);
    } catch (e) {
      res.json([]);
    }
  });

  router.get('/pos/customers/:id', (req, res) => {
    try {
      const members = (config as any).getLoyaltyMembers ? (config as any).getLoyaltyMembers() : [];
      const member = members.find((m: any) => m.id === req.params.id);
      if (!member) return res.status(404).json({ error: 'Customer not found' });
      res.json(member);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/pos/customers/:id/add-points', (req, res) => {
    res.json({ success: true, message: 'Points tracked locally, will sync to cloud' });
  });

  router.post('/pos/loyalty/earn', (req, res) => {
    res.json({ success: true, pointsEarned: 0, message: 'Loyalty earn queued for cloud sync' });
  });

  router.post('/pos/loyalty/enroll', (req, res) => {
    res.json({ success: true, message: 'Loyalty enrollment queued for cloud sync' });
  });

  router.get('/pos/checks/:id/reorder/:customerId', (req, res) => {
    res.json([]);
  });

  router.get('/pos/system-status', (_req, res) => {
    res.json({ status: 'caps', offline: true });
  });

  router.get('/pos/reports/:reportType', (req, res) => {
    try {
      const reportType = req.params.reportType;
      const rvcId = req.query.rvcId as string | undefined;
      const businessDate = (req.query.businessDate as string) || new Date().toISOString().split('T')[0];

      if (reportType === 'daily-summary') {
        const openChecks = caps.getOpenChecks(rvcId);
        const closedRows = db ? db.all<any>(
          `SELECT id FROM checks WHERE status = 'closed' AND business_date = ?${rvcId ? ' AND rvc_id = ?' : ''}`,
          rvcId ? [businessDate, rvcId] : [businessDate]
        ) : [];
        const closedChecks = closedRows.map((r: any) => caps.getCheck(r.id)).filter(Boolean);

        let totalSales = 0;
        let totalTax = 0;
        let totalDiscounts = 0;
        let checkCount = closedChecks.length;
        for (const c of closedChecks as any[]) {
          totalSales += c.total || 0;
          totalTax += c.tax || 0;
          totalDiscounts += c.discountTotal || 0;
        }

        return res.json({
          businessDate,
          rvcId: rvcId || 'all',
          openChecks: openChecks.length,
          closedChecks: checkCount,
          totalSales: parseFloat(totalSales.toFixed(2)),
          totalTax: parseFloat(totalTax.toFixed(2)),
          totalDiscounts: parseFloat(totalDiscounts.toFixed(2)),
          averageCheck: checkCount > 0 ? parseFloat((totalSales / checkCount).toFixed(2)) : 0,
        });
      }

      res.json({ reportType, message: 'Report data from CAPS', businessDate });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/caps/sync/check-state', (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ error: 'Database not available' });
      }
      const check = req.body;
      if (!check || !check.id) {
        return res.status(400).json({ error: 'Check data with id required' });
      }

      db.run('PRAGMA foreign_keys = OFF');
      try {
        db.transaction(() => {
          db.run(`INSERT OR REPLACE INTO checks (id, cloud_id, check_number, rvc_id, employee_id, workstation_id, order_type, table_number, guest_count, status, subtotal, tax, discount_total, service_charge_total, total, amount_due, current_round, business_date, opened_at, closed_at, voided_at, void_reason, customer_id, customer_name, cloud_synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`, [
            check.id, check.cloudId || check.cloud_id || null, check.checkNumber || check.check_number || 0,
            check.rvcId || check.rvc_id || '', check.employeeId || check.employee_id || '',
            check.workstationId || check.workstation_id || null, check.orderType || check.order_type || 'dine_in',
            check.tableNumber || check.table_number || null, check.guestCount || check.guest_count || 1,
            check.status || 'open', check.subtotal || 0, check.tax || 0,
            check.discountTotal || check.discount_total || 0, check.serviceChargeTotal || check.service_charge_total || 0,
            check.total || 0, check.amountDue || check.amount_due || 0,
            check.currentRound || check.current_round || 1, check.businessDate || check.business_date || null,
            check.openedAt || check.opened_at || new Date().toISOString(), check.closedAt || check.closed_at || null,
            check.voidedAt || check.voided_at || null, check.voidReason || check.void_reason || null,
            check.customerId || check.customer_id || null, check.customerName || check.customer_name || null,
            check.createdAt || check.created_at || new Date().toISOString(), new Date().toISOString(),
          ]);

          db.run('DELETE FROM check_items WHERE check_id = ?', [check.id]);
          db.run('DELETE FROM check_payments WHERE check_id = ?', [check.id]);
          db.run('DELETE FROM check_discounts WHERE check_id = ?', [check.id]);
          db.run('DELETE FROM check_service_charges WHERE check_id = ?', [check.id]);

          if (check.items && Array.isArray(check.items)) {
            for (const item of check.items) {
              const modifiersStr = typeof item.modifiers === 'string' ? item.modifiers : JSON.stringify(item.modifiers || null);
              const modifiersJsonStr = item.modifiersJson || item.modifiers_json || modifiersStr;
              db.run(`INSERT INTO check_items (id, check_id, round_id, round_number, menu_item_id, name, short_name, quantity, unit_price, total_price, tax_amount, tax_group_id, print_class_id, modifiers, modifiers_json, seat_number, course_number, sent_to_kitchen, sent, sent_at, kds_status, voided, void_reason, discount_id, discount_name, discount_amount, discount_type, parent_item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                item.id, check.id, item.roundId || item.round_id || null, item.roundNumber || item.round_number || 1,
                item.menuItemId || item.menu_item_id || '', item.name || '', item.shortName || item.short_name || null,
                item.quantity || 1, item.unitPrice || item.unit_price || 0, item.totalPrice || item.total_price || 0,
                item.taxAmount || item.tax_amount || 0, item.taxGroupId || item.tax_group_id || null,
                item.printClassId || item.print_class_id || null,
                modifiersStr, modifiersJsonStr,
                item.seatNumber || item.seat_number || null, item.courseNumber || item.course_number || 1,
                item.sentToKitchen || item.sent_to_kitchen ? 1 : 0, item.sent ? 1 : 0,
                item.sentAt || item.sent_at || null, item.kdsStatus || item.kds_status || 'pending',
                item.voided ? 1 : 0, item.voidReason || item.void_reason || null,
                item.discountId || item.discount_id || null, item.discountName || item.discount_name || null,
                item.discountAmount || item.discount_amount || 0, item.discountType || item.discount_type || null,
                item.parentItemId || item.parent_item_id || null, item.createdAt || item.created_at || new Date().toISOString(),
              ]);
            }
          }

          if (check.payments && Array.isArray(check.payments)) {
            for (const pmt of check.payments) {
              db.run(`INSERT INTO check_payments (id, check_id, tender_id, tender_type, amount, tip_amount, change_amount, card_last4, card_brand, auth_code, reference_number, status, voided, void_reason, business_date, cloud_synced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`, [
                pmt.id, check.id, pmt.tenderId || pmt.tender_id || '', pmt.tenderType || pmt.tender_type || '',
                pmt.amount || 0, pmt.tipAmount || pmt.tip_amount || 0, pmt.changeAmount || pmt.change_amount || 0,
                pmt.cardLast4 || pmt.card_last4 || null, pmt.cardBrand || pmt.card_brand || null,
                pmt.authCode || pmt.auth_code || null, pmt.referenceNumber || pmt.reference_number || null,
                pmt.status || 'authorized', pmt.voided ? 1 : 0, pmt.voidReason || pmt.void_reason || null,
                pmt.businessDate || pmt.business_date || null, pmt.createdAt || pmt.created_at || new Date().toISOString(),
              ]);
            }
          }

          if (check.discounts && Array.isArray(check.discounts)) {
            for (const disc of check.discounts) {
              db.run(`INSERT INTO check_discounts (id, check_id, check_item_id, discount_id, name, discount_type, amount, employee_id, manager_employee_id, voided, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                disc.id, check.id, disc.checkItemId || disc.check_item_id || null,
                disc.discountId || disc.discount_id || '', disc.name || '',
                disc.discountType || disc.discount_type || 'percent', disc.amount || 0,
                disc.employeeId || disc.employee_id || null, disc.managerEmployeeId || disc.manager_employee_id || null,
                disc.voided ? 1 : 0,
                disc.createdAt || disc.created_at || new Date().toISOString(),
              ]);
            }
          }

          if (check.serviceCharges && Array.isArray(check.serviceCharges)) {
            for (const sc of check.serviceCharges) {
              db.run(`INSERT INTO check_service_charges (id, check_id, service_charge_id, name, charge_type, amount, auto_applied, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                sc.id, check.id, sc.serviceChargeId || sc.service_charge_id || '',
                sc.name || '', sc.chargeType || sc.charge_type || 'percent', sc.amount || 0,
                sc.autoApplied || sc.auto_applied ? 1 : 0, sc.createdAt || sc.created_at || new Date().toISOString(),
              ]);
            }
          }
        });

        console.log(`[CAPS Sync] Check ${check.id} synced with ${check.items?.length || 0} items, ${check.payments?.length || 0} payments`);

        try {
          db.addToSyncQueue('check', check.id, 'update', check, 5);
        } catch (qErr) {
          console.warn(`[CAPS Sync] Failed to queue check ${check.id} for cloud forward: ${(qErr as Error).message}`);
        }
      } finally {
        db.run('PRAGMA foreign_keys = ON');
      }

      res.json({ success: true, checkId: check.id });
    } catch (e) {
      console.error('[CAPS Sync] check-state error:', (e as Error).message);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/caps/sync/queue-operation', (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ error: 'Database not available' });
      }
      const { body, headers } = req.body;
      const opPath = req.body.path || req.body.endpoint;
      const method = req.body.method || 'POST';
      let opType = req.body.type;
      if (!opPath) {
        return res.status(400).json({ error: 'path or endpoint is required' });
      }
      if (!opType) {
        opType = opPath.replace(/^\/api\//, '').replace(/\//g, '-') || 'unknown';
      }

      const id = `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      db.run(`INSERT INTO operation_queue (id, operation_type, method, path, body, headers, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`, [
        id, opType, method, opPath,
        typeof body === 'string' ? body : JSON.stringify(body || null),
        typeof headers === 'string' ? headers : JSON.stringify(headers || null),
        new Date().toISOString(),
      ]);

      console.log(`[CAPS Sync] Queued operation: ${method} ${opPath}`);
      res.json({ success: true, operationId: id });
    } catch (e) {
      console.error('[CAPS Sync] queue-operation error:', (e as Error).message);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  payment.startPolling(5000);
  console.log('[CAPS] Payment controller polling started (5s interval)');

  return router;
}

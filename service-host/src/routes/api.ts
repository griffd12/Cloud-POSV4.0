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

import { Router } from 'express';
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
      res.json({ items });
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
      const { workstationId } = req.body;
      const result = caps.sendToKitchen(req.params.id, workstationId);
      
      // Also create KDS ticket
      const check = caps.getCheck(req.params.id);
      if (check) {
        const unsentItems = check.items.filter(i => !i.voided);
        if (unsentItems.length > 0) {
          kds.createTicket({
            checkId: check.id,
            checkNumber: check.checkNumber,
            orderType: check.orderType,
            items: unsentItems.map(i => ({
              name: i.name,
              quantity: i.quantity,
              modifiers: i.modifiers?.map(m => m.name || m),
              seatNumber: i.seatNumber,
            })),
          });
        }
      }
      
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Void an item
  router.post('/caps/checks/:id/items/:itemId/void', (req, res) => {
    try {
      const { reason, workstationId } = req.body;
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
  router.post('/caps/checks/:id/pay', (req, res) => {
    try {
      const { workstationId, ...paymentParams } = req.body;
      const payment = caps.addPayment(req.params.id, paymentParams, workstationId);
      res.json(payment);
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
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
      const { reason, workstationId } = req.body;
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
      res.json(kdsDevices);
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

  router.get('/checks/open', (req, res) => {
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
  });

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

  router.get('/checks/:id/full-details', (req, res) => {
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

  router.get('/checks/:id/payments', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.json({ payments: [], paidAmount: 0 });
      const payments = check.payments || [];
      const paidAmount = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0);
      res.json({ payments, paidAmount });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/checks/:id/discounts', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      res.json(check?.discounts || []);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/checks/:id/service-charges', (req, res) => {
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
  });

  router.post('/checks/:id/service-charges', (req, res) => {
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
  });

  router.post('/checks/:id/items', (req, res) => {
    try {
      const { workstationId } = req.body;
      const items = caps.addItems(req.params.id, req.body.items || [req.body], workstationId);
      const result = Array.isArray(items) ? items[items.length - 1] : items;
      res.status(201).json(result);
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) return res.status(409).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/checks/:id/send', (req, res) => {
    try {
      const { workstationId } = req.body;
      const result = caps.sendToKitchen(req.params.id, workstationId);
      const check = caps.getCheck(req.params.id);
      if (check) {
        const unsentItems = check.items.filter((i: any) => !i.voided);
        if (unsentItems.length > 0) {
          kds.createTicket({
            checkId: check.id,
            checkNumber: check.checkNumber,
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
      const updatedCheck = caps.getCheck(req.params.id);
      res.json({ round: result.roundNumber || result.round || null, updatedItems: updatedCheck?.items || [] });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/payments', (req, res) => {
    try {
      const { workstationId, ...paymentParams } = req.body;
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
      const { reason, workstationId } = req.body;
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

  router.post('/checks/:id/reopen', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      caps.reopenCheck(req.params.id);
      const updated = caps.getCheck(req.params.id);
      res.json({ success: true, check: updated });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/discount', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      if (!check.discounts) check.discounts = [];
      check.discounts.push(req.body);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/print', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      res.json({ success: true, message: 'Print queued' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/transfer', (req, res) => {
    try {
      const { employeeId, workstationId } = req.body;
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
  });

  router.post('/checks/:id/split', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const { itemIds, workstationId } = req.body;
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
  });

  router.post('/checks/merge', (req, res) => {
    try {
      const { targetCheckId, sourceCheckIds, employeeId } = req.body;
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
  });

  router.patch('/checks/:id', (req, res) => {
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
  });

  router.patch('/check-payments/:id/void', (req, res) => {
    try {
      const { reason } = req.body;
      const payment = caps.db.get<any>('SELECT * FROM check_payments WHERE id = ?', [req.params.id]);
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      caps.db.run("UPDATE check_payments SET voided = 1, status = 'voided' WHERE id = ?", [req.params.id]);
      caps.recalculateTotals(payment.check_id);
      const txnGroupId = caps.getTxnGroupId(payment.check_id);
      caps.writeJournal(payment.check_id, txnGroupId, '', 'void_payment', { paymentId: req.params.id, reason });
      caps.transactionSync.queueCheck(payment.check_id, 'update', caps.getCheck(payment.check_id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.patch('/check-payments/:id/restore', (req, res) => {
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
  });

  router.post('/check-service-charges/:id/void', (req, res) => {
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
  });

  router.delete('/check-items/:id', (req, res) => {
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
  });

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
      const checks = caps.getOpenChecks();
      for (const check of checks) {
        if (check.items?.some((i: any) => i.id === req.params.id)) {
          const { reason, workstationId } = req.body;
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
      const { discountId, employeeId } = req.body;
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

  router.delete('/check-items/:id/discount', (req, res) => {
    try {
      const itemId = req.params.id;
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
  });

  router.post('/check-items/:id/price-override', (req, res) => {
    try {
      const itemId = req.params.id;
      const { newPrice, reason, employeeId } = req.body;
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
  });

  router.post('/payments', (req, res) => {
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
      caps.writeJournal(checkId, 'payment_added', { paymentId, amount: body.amount || 0, type: body.tenderType || body.tender_type || 'cash' });
      caps.transactionSync.queueCheck(checkId, 'update');
      console.log('[CAPS] Payment saved:', paymentId, 'for check:', checkId);
      res.json({ id: paymentId, checkId, status: body.status || 'completed', offline: false });
    } catch (e) {
      console.error('[CAPS] Payment route error:', (e as Error).message);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/pos/record-external-payment', (req, res) => {
    try {
      const { checkId, amount, paymentType, reference, workstationId } = req.body;
      const check = caps.getCheck(checkId);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      const payment = caps.addPayment(checkId, {
        type: paymentType || 'external',
        amount: amount,
        referenceNumber: reference || 'external'
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
        `INSERT OR IGNORE INTO time_entries (id, employee_id, punch_type, job_code_id, punch_time, workstation_id, cloud_synced)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [id, employeeId, punchType || 'clock_in', jobCodeId || null, now, workstationId || null]
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
        'SELECT mimg.menu_item_id, mimg.modifier_group_id, mimg.sort_order, mimg.min_required, mimg.max_allowed FROM menu_item_modifier_groups mimg'
      );
      const modGroups = caps.db.all<any>('SELECT * FROM modifier_groups');
      const modGroupMods = caps.db.all<any>(
        'SELECT mgm.modifier_group_id, mgm.modifier_id, mgm.sort_order, mgm.is_default FROM modifier_group_modifiers mgm'
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
              sortOrder: mgm.sort_order || 0,
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
          minRequired: mimg.min_required || mg.min_required || 0,
          maxAllowed: mimg.max_allowed || mg.max_allowed || 0,
          sortOrder: mimg.sort_order || 0,
          modifiers: groupMods
        };
      }
      res.json(result);
    } catch (e) {
      console.error('[CAPS] modifier-map error:', (e as Error).message);
      res.json({});
    }
  });

  router.post('/terminal-sessions', async (req, res) => {
    try {
      res.status(503).json({ error: 'Credit card processing requires cloud connection in service-host mode.' });
    } catch (e) {
      res.status(503).json({ error: (e as Error).message });
    }
  });

  router.get('/terminal-sessions', async (_req, res) => {
    try {
      res.status(503).json({ error: 'Credit card processing requires cloud connection in service-host mode.' });
    } catch (e) {
      res.status(503).json({ error: (e as Error).message });
    }
  });

  router.post('/auth/login', (req, res) => {
    try {
      const pin = req.body?.pin;
      if (!pin) return res.status(400).json({ message: 'PIN required' });
      const employees = config.getEmployees();
      const employee = employees.find((emp: any) =>
        emp.pinHash === pin || emp.pin === pin || emp.posPin === pin
      );
      if (!employee) return res.status(401).json({ message: 'Invalid PIN' });
      res.json({
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          pinHash: employee.pinHash,
          roleId: employee.roleId,
          roleName: employee.roleName,
          active: employee.active !== undefined ? employee.active : true,
          jobTitle: employee.jobTitle || null,
          enterpriseId: employee.enterpriseId || null,
        },
        privileges: employee.privileges || employee.rolePrivileges || [
          'fast_transaction', 'send_to_kitchen', 'void_unsent', 'void_sent',
          'apply_discount', 'admin_access', 'kds_access', 'manager_approval'
        ],
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
        emp.pinHash === pin || emp.pin === pin || emp.posPin === pin
      );
      if (!employee) return res.status(401).json({ success: false, message: 'Invalid PIN' });
      res.json({
        success: true,
        employee,
        privileges: employee.privileges || employee.rolePrivileges || [
          'fast_transaction', 'send_to_kitchen', 'void_unsent', 'void_sent',
          'apply_discount', 'admin_access', 'kds_access', 'manager_approval'
        ],
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
        firstName: emp.firstName,
        lastName: emp.lastName,
        pinHash: emp.pinHash,
        posPin: emp.posPin,
        roleId: emp.roleId,
        roleName: emp.roleName,
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
        emp.pinHash === pin || emp.pin === pin || emp.posPin === pin
      );
      if (!manager) return res.status(401).json({ success: false, message: 'Invalid manager PIN' });
      const privs = manager.privileges || manager.rolePrivileges || [];
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
      res.json({
        workstation: ws || { id: req.params.id, name: 'CAPS Workstation' },
        rvcs: rvcs || [],
        property: prop || null,
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
      if (!layout) return res.status(404).json({ error: 'No layout found' });
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
      const stationId = req.query.stationId as string | undefined;
      const tickets = kds.getActiveTickets(stationId);
      res.json(tickets);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
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
              db.run(`INSERT INTO check_items (id, check_id, round_id, round_number, menu_item_id, name, short_name, quantity, unit_price, total_price, tax_amount, tax_group_id, print_class_id, modifiers, seat_number, course_number, sent_at, kds_status, voided, void_reason, parent_item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                item.id, check.id, item.roundId || item.round_id || null, item.roundNumber || item.round_number || 1,
                item.menuItemId || item.menu_item_id || '', item.name || '', item.shortName || item.short_name || null,
                item.quantity || 1, item.unitPrice || item.unit_price || 0, item.totalPrice || item.total_price || 0,
                item.taxAmount || item.tax_amount || 0, item.taxGroupId || item.tax_group_id || null,
                item.printClassId || item.print_class_id || null,
                typeof item.modifiers === 'string' ? item.modifiers : JSON.stringify(item.modifiers || null),
                item.seatNumber || item.seat_number || null, item.courseNumber || item.course_number || 1,
                item.sentAt || item.sent_at || null, item.kdsStatus || item.kds_status || 'pending',
                item.voided ? 1 : 0, item.voidReason || item.void_reason || null,
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
              db.run(`INSERT INTO check_discounts (id, check_id, check_item_id, discount_id, name, discount_type, amount, employee_id, manager_employee_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                disc.id, check.id, disc.checkItemId || disc.check_item_id || null,
                disc.discountId || disc.discount_id || '', disc.name || '',
                disc.discountType || disc.discount_type || 'percent', disc.amount || 0,
                disc.employeeId || disc.employee_id || null, disc.managerEmployeeId || disc.manager_employee_id || null,
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
      const { method, path: opPath, body, headers } = req.body;
      if (!method || !opPath) {
        return res.status(400).json({ error: 'method and path required' });
      }

      const id = `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      db.run(`INSERT INTO sync_queue (id, operation_type, method, path, body, headers, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`, [
        id, 'generic', method, opPath,
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

  return router;
}

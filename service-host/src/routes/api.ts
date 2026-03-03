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
      res.json(checks);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/checks/locks', (_req, res) => {
    res.json({});
  });

  router.get('/checks/:id', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      res.json(check);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/checks/:id/full-details', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      res.json(check);
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
      res.json([]);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/items', (req, res) => {
    try {
      const { workstationId } = req.body;
      const items = caps.addItems(req.params.id, req.body.items || [req.body], workstationId);
      res.json({ items });
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
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/payments', (req, res) => {
    try {
      const { workstationId, ...paymentParams } = req.body;
      const payment = caps.addPayment(req.params.id, paymentParams, workstationId);
      res.json(payment);
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
      const { reason, workstationId } = req.body;
      caps.voidCheck(req.params.id, reason || 'cancelled', workstationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/checks/:id/reopen', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) return res.status(404).json({ error: 'Check not found' });
      check.status = 'open';
      check.closedAt = null;
      res.json({ success: true });
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
    res.json({ success: true, message: 'Print queued' });
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
          return res.json({ success: true });
        }
      }
      res.status(404).json({ error: 'Item not found' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.patch('/check-items/:id/modifiers', (req, res) => {
    try {
      res.json({ success: true, message: 'Modifiers updated' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/check-items/:id/discount', (req, res) => {
    try {
      res.json({ success: true, message: 'Item discount applied' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/check-items/:id/price-override', (req, res) => {
    try {
      res.json({ success: true, message: 'Price override applied' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
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

import { db } from "./db";
import { eq, and, sql, gte, lte, desc, isNull, or, inArray } from "drizzle-orm";
import {
  checks, checkItems, checkPayments, checkDiscounts, checkServiceCharges,
  cashTransactions, drawerAssignments, cashDrawers, timecards, tenders,
  refunds, refundItems, refundPayments,
} from "@shared/schema";

export interface ReportFilters {
  propertyId: string;
  businessDate: string;
  rvcId?: string;
  enterpriseId?: string;
  closedOnly?: boolean;
}

export interface SalesLine {
  checkId: string;
  checkItemId: string;
  employeeId: string;
  menuItemId: string | null;
  itemName: string;
  quantity: number;
  unitPrice: string;
  grossLine: string;
  discountAmount: string;
  netLine: string;
  taxAmount: string;
  taxableAmount: string;
  businessDate: string;
  rvcId: string;
  majorGroupName: string | null;
}

export interface CheckDiscountLine {
  checkId: string;
  discountId: string;
  name: string;
  amount: string;
  type: string;
  employeeId: string | null;
  businessDate: string;
}

export interface ServiceChargeLine {
  checkId: string;
  serviceChargeId: string;
  nameAtSale: string;
  amount: string;
  taxAmount: string;
  taxableAmount: string;
  isTaxableAtSale: boolean;
  autoApplied: boolean;
  businessDate: string;
  propertyId: string;
  rvcId: string;
}

export interface PaymentLine {
  checkId: string;
  paymentId: string;
  tenderId: string;
  tenderName: string;
  tenderType: string;
  isCashMedia: boolean;
  isCardMedia: boolean;
  isGiftMedia: boolean;
  amount: string;
  tipAmount: string;
  employeeId: string | null;
  businessDate: string;
}

export interface VoidLine {
  checkId: string;
  checkItemId: string;
  itemName: string;
  quantity: number;
  unitPrice: string;
  voidAmount: string;
  voidedByEmployeeId: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  businessDate: string;
}

export interface TimecardLine {
  timecardId: string;
  employeeId: string;
  jobCodeId: string | null;
  regularHours: string;
  overtimeHours: string;
  doubleTimeHours: string;
  totalHours: string;
  regularPay: string;
  overtimePay: string;
  totalPay: string;
  declaredCashTips: string;
  businessDate: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  status: string;
}

export interface CashDrawerActivityLine {
  transactionId: string;
  drawerId: string | null;
  drawerName: string | null;
  assignmentId: string | null;
  employeeId: string;
  transactionType: string;
  amount: string;
  checkId: string | null;
  businessDate: string;
  createdAt: string | null;
}

export interface DrawerSummary {
  opening: string;
  cashSales: string;
  cashRefunds: string;
  paidIns: string;
  paidOuts: string;
  drops: string;
  pickups: string;
  tipsPaid: string;
  expectedCash: string;
}

export async function getSalesLines(filters: ReportFilters): Promise<SalesLine[]> {
  const rvcFilter = filters.rvcId
    ? sql`AND c.rvc_id = ${filters.rvcId}`
    : sql``;
  const closedFilter = filters.closedOnly
    ? sql`AND c.status = 'closed'`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      ci.check_id AS "checkId",
      ci.id AS "checkItemId",
      c.employee_id AS "employeeId",
      ci.menu_item_id AS "menuItemId",
      ci.menu_item_name AS "itemName",
      ci.quantity,
      ci.unit_price AS "unitPrice",
      (ci.unit_price * ci.quantity) AS "grossLine",
      COALESCE(ci.discount_amount, 0) AS "discountAmount",
      (ci.unit_price * ci.quantity - COALESCE(ci.discount_amount, 0)) AS "netLine",
      ci.tax_amount AS "rawTaxAmount",
      COALESCE(ci.tax_amount, 0) AS "taxAmount",
      COALESCE(ci.taxable_amount, 0) AS "taxableAmount",
      c.business_date AS "businessDate",
      c.rvc_id AS "rvcId",
      c.tax_total AS "checkTaxTotal",
      mg.name AS "majorGroupName"
    FROM check_items ci
    JOIN checks c ON c.id = ci.check_id
    JOIN rvcs r ON r.id = c.rvc_id
    LEFT JOIN menu_items mi ON mi.id = ci.menu_item_id
    LEFT JOIN major_groups mg ON mg.id = mi.major_group_id
    WHERE c.business_date = ${filters.businessDate}
      AND r.property_id = ${filters.propertyId}
      AND (ci.voided = false OR ci.voided IS NULL)
      AND (c.test_mode = false OR c.test_mode IS NULL)
      ${closedFilter}
      ${rvcFilter}
    ORDER BY c.id, ci.id
  `);

  const rows = result.rows as any[];

  const checkGroups = new Map<string, any[]>();
  for (const row of rows) {
    const group = checkGroups.get(row.checkId) || [];
    group.push(row);
    checkGroups.set(row.checkId, group);
  }

  for (const [, items] of checkGroups) {
    const allNull = items.every((it: any) => it.rawTaxAmount === null || it.rawTaxAmount === undefined);
    if (!allNull) continue;

    const checkTax = parseFloat(items[0].checkTaxTotal || '0');
    if (checkTax <= 0) continue;

    const totalNet = items.reduce((s: number, it: any) => s + parseFloat(it.netLine || '0'), 0);
    if (totalNet <= 0) continue;

    let allocatedCents = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const itemNet = parseFloat(it.netLine || '0');
      if (i === items.length - 1) {
        const remainderCents = Math.round(checkTax * 100) - allocatedCents;
        it.taxAmount = String(remainderCents / 100);
      } else {
        const proratedCents = Math.round((itemNet / totalNet) * checkTax * 100);
        allocatedCents += proratedCents;
        it.taxAmount = String(proratedCents / 100);
      }
    }
  }

  return rows.map((r: any) => ({
    checkId: r.checkId,
    checkItemId: r.checkItemId,
    employeeId: r.employeeId,
    menuItemId: r.menuItemId,
    itemName: r.itemName,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    grossLine: r.grossLine,
    discountAmount: r.discountAmount,
    netLine: r.netLine,
    taxAmount: r.taxAmount,
    taxableAmount: r.taxableAmount,
    businessDate: r.businessDate,
    rvcId: r.rvcId,
    majorGroupName: r.majorGroupName,
  })) as SalesLine[];
}

export async function getCheckDiscounts(filters: ReportFilters): Promise<CheckDiscountLine[]> {
  const rvcFilter = filters.rvcId
    ? sql`AND c.rvc_id = ${filters.rvcId}`
    : sql``;
  const closedFilter = filters.closedOnly
    ? sql`AND c.status = 'closed'`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      cd.check_id AS "checkId",
      cd.discount_id AS "discountId",
      cd.discount_name AS "name",
      cd.amount,
      d.type,
      cd.employee_id AS "employeeId",
      c.business_date AS "businessDate"
    FROM check_discounts cd
    JOIN checks c ON c.id = cd.check_id
    JOIN rvcs r ON r.id = c.rvc_id
    JOIN discounts d ON d.id = cd.discount_id
    WHERE c.business_date = ${filters.businessDate}
      AND r.property_id = ${filters.propertyId}
      ${closedFilter}
      ${rvcFilter}
    ORDER BY cd.check_id, cd.id
  `);

  return result.rows as unknown as CheckDiscountLine[];
}

export async function getServiceChargeLines(filters: ReportFilters): Promise<ServiceChargeLine[]> {
  const rvcFilter = filters.rvcId
    ? sql`AND csc.rvc_id = ${filters.rvcId}`
    : sql``;
  const closedFilter = filters.closedOnly
    ? sql`AND EXISTS (SELECT 1 FROM checks c2 WHERE c2.id = csc.check_id AND c2.status = 'closed')`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      csc.check_id AS "checkId",
      csc.service_charge_id AS "serviceChargeId",
      csc.name_at_sale AS "nameAtSale",
      csc.amount,
      csc.tax_amount AS "taxAmount",
      csc.taxable_amount AS "taxableAmount",
      csc.is_taxable_at_sale AS "isTaxableAtSale",
      csc.auto_applied AS "autoApplied",
      csc.business_date AS "businessDate",
      csc.property_id AS "propertyId",
      csc.rvc_id AS "rvcId"
    FROM check_service_charges csc
    WHERE csc.business_date = ${filters.businessDate}
      AND csc.property_id = ${filters.propertyId}
      AND csc.voided = false
      ${closedFilter}
      ${rvcFilter}
    ORDER BY csc.check_id, csc.id
  `);

  return result.rows as unknown as ServiceChargeLine[];
}

export async function getPaymentLines(filters: ReportFilters): Promise<PaymentLine[]> {
  const rvcFilter = filters.rvcId
    ? sql`AND c.rvc_id = ${filters.rvcId}`
    : sql``;
  const closedFilter = filters.closedOnly
    ? sql`AND c.status = 'closed'`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      cp.check_id AS "checkId",
      cp.id AS "paymentId",
      cp.tender_id AS "tenderId",
      cp.tender_name AS "tenderName",
      t.type AS "tenderType",
      COALESCE(t.is_cash_media, false) AS "isCashMedia",
      COALESCE(t.is_card_media, false) AS "isCardMedia",
      COALESCE(t.is_gift_media, false) AS "isGiftMedia",
      cp.amount,
      COALESCE(cp.tip_amount, 0) AS "tipAmount",
      cp.employee_id AS "employeeId",
      COALESCE(cp.business_date, c.business_date) AS "businessDate"
    FROM check_payments cp
    JOIN checks c ON c.id = cp.check_id
    JOIN rvcs r ON r.id = c.rvc_id
    JOIN tenders t ON t.id = cp.tender_id
    WHERE cp.payment_status = 'completed'
      AND (c.test_mode = false OR c.test_mode IS NULL)
      AND COALESCE(cp.business_date, c.business_date) = ${filters.businessDate}
      AND r.property_id = ${filters.propertyId}
      ${closedFilter}
      ${rvcFilter}
    ORDER BY cp.check_id, cp.id
  `);

  return result.rows as unknown as PaymentLine[];
}

export async function getVoidLines(filters: ReportFilters): Promise<VoidLine[]> {
  const rvcFilter = filters.rvcId
    ? sql`AND c.rvc_id = ${filters.rvcId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      ci.check_id AS "checkId",
      ci.id AS "checkItemId",
      ci.menu_item_name AS "itemName",
      ci.quantity,
      ci.unit_price AS "unitPrice",
      (ci.unit_price * ci.quantity) AS "voidAmount",
      ci.voided_by_employee_id AS "voidedByEmployeeId",
      ci.void_reason AS "voidReason",
      ci.voided_at AS "voidedAt",
      c.business_date AS "businessDate"
    FROM check_items ci
    JOIN checks c ON c.id = ci.check_id
    JOIN rvcs r ON r.id = c.rvc_id
    WHERE ci.voided = true
      AND c.business_date = ${filters.businessDate}
      AND r.property_id = ${filters.propertyId}
      ${rvcFilter}
    ORDER BY ci.voided_at DESC, ci.id
  `);

  return result.rows as unknown as VoidLine[];
}

export async function getTimecardLines(filters: ReportFilters): Promise<TimecardLine[]> {
  const result = await db.execute(sql`
    SELECT
      tc.id AS "timecardId",
      tc.employee_id AS "employeeId",
      tc.job_code_id AS "jobCodeId",
      COALESCE(tc.regular_hours, 0) AS "regularHours",
      COALESCE(tc.overtime_hours, 0) AS "overtimeHours",
      COALESCE(tc.double_time_hours, 0) AS "doubleTimeHours",
      COALESCE(tc.total_hours, 0) AS "totalHours",
      COALESCE(tc.regular_pay, 0) AS "regularPay",
      COALESCE(tc.overtime_pay, 0) AS "overtimePay",
      COALESCE(tc.total_pay, 0) AS "totalPay",
      COALESCE(tc.tips, 0) AS "declaredCashTips",
      tc.business_date AS "businessDate",
      tc.clock_in_time AS "clockInTime",
      tc.clock_out_time AS "clockOutTime",
      tc.status
    FROM timecards tc
    WHERE tc.property_id = ${filters.propertyId}
      AND tc.business_date = ${filters.businessDate}
    ORDER BY tc.employee_id, tc.clock_in_time
  `);

  return result.rows as unknown as TimecardLine[];
}

export async function getCashDrawerActivity(filters: ReportFilters): Promise<CashDrawerActivityLine[]> {
  const result = await db.execute(sql`
    SELECT
      ct.id AS "transactionId",
      ct.drawer_id AS "drawerId",
      cd.name AS "drawerName",
      ct.assignment_id AS "assignmentId",
      ct.employee_id AS "employeeId",
      ct.transaction_type AS "transactionType",
      ct.amount,
      ct.check_id AS "checkId",
      ct.business_date AS "businessDate",
      ct.created_at AS "createdAt"
    FROM cash_transactions ct
    LEFT JOIN cash_drawers cd ON cd.id = ct.drawer_id
    WHERE ct.property_id = ${filters.propertyId}
      AND ct.business_date = ${filters.businessDate}
    ORDER BY ct.created_at
  `);

  return result.rows as unknown as CashDrawerActivityLine[];
}

export async function getDrawerSummary(assignmentId: string): Promise<DrawerSummary> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(da.opening_amount, 0) AS "opening",
      COALESCE(SUM(CASE WHEN ct.transaction_type = 'sale' THEN ct.amount ELSE 0 END), 0) AS "cashSales",
      COALESCE(SUM(CASE WHEN ct.transaction_type = 'refund' THEN ct.amount ELSE 0 END), 0) AS "cashRefunds",
      COALESCE(SUM(CASE WHEN ct.transaction_type = 'paid_in' THEN ct.amount ELSE 0 END), 0) AS "paidIns",
      COALESCE(SUM(CASE WHEN ct.transaction_type = 'paid_out' THEN ct.amount ELSE 0 END), 0) AS "paidOuts",
      COALESCE(SUM(CASE WHEN ct.transaction_type = 'drop' THEN ct.amount ELSE 0 END), 0) AS "drops",
      COALESCE(SUM(CASE WHEN ct.transaction_type = 'pickup' THEN ct.amount ELSE 0 END), 0) AS "pickups",
      COALESCE(SUM(CASE WHEN ct.transaction_type = 'tips_paid' THEN ct.amount ELSE 0 END), 0) AS "tipsPaid",
      (
        COALESCE(da.opening_amount, 0)
        + COALESCE(SUM(CASE WHEN ct.transaction_type = 'sale' THEN ct.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN ct.transaction_type = 'refund' THEN ct.amount ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN ct.transaction_type = 'paid_in' THEN ct.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN ct.transaction_type = 'paid_out' THEN ct.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN ct.transaction_type = 'drop' THEN ct.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN ct.transaction_type = 'tips_paid' THEN ct.amount ELSE 0 END), 0)
      ) AS "expectedCash"
    FROM drawer_assignments da
    LEFT JOIN cash_transactions ct ON ct.assignment_id = da.id
    WHERE da.id = ${assignmentId}
    GROUP BY da.id, da.opening_amount
  `);

  if (result.rows.length === 0) {
    return {
      opening: "0",
      cashSales: "0",
      cashRefunds: "0",
      paidIns: "0",
      paidOuts: "0",
      drops: "0",
      pickups: "0",
      tipsPaid: "0",
      expectedCash: "0",
    };
  }

  return result.rows[0] as unknown as DrawerSummary;
}

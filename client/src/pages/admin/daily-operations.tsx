import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  FileText, DollarSign, Users, Banknote, Clock, Printer, Coins,
  CheckCircle2, AlertTriangle, ShieldCheck, Activity, Info, ChevronRight, ChevronDown,
  CreditCard, ShoppingCart, Layers, Receipt, UserCheck, TrendingUp, Package, Download, RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { exportData, commonFormatters } from "@/lib/export-utils";
import { formatInTimeZone } from "date-fns-tz";
import type { Property, CheckItem } from "@shared/schema";

const EMC_SESSION_KEY = "emc_session_token";
const DEVICE_TOKEN_KEY = "pos_device_token";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const emcToken = sessionStorage.getItem(EMC_SESSION_KEY);
  if (emcToken) headers["X-EMC-Session"] = emcToken;
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (deviceToken) headers["X-Device-Token"] = deviceToken;
  return headers;
}

async function authFetch(url: string): Promise<Response> {
  return fetch(url, { headers: getAuthHeaders() });
}

function formatCurrency(val: number | undefined | null): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val ?? 0);
}

function formatPercent(val: number | undefined | null): string {
  return `${(val ?? 0).toFixed(1)}%`;
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDatePreset(preset: string, currentBusinessDate?: string): string {
  const base = currentBusinessDate ? new Date(currentBusinessDate + "T12:00:00") : new Date();
  const d = new Date(base);

  switch (preset) {
    case "today":
      return formatLocalDate(d);
    case "yesterday":
      d.setDate(d.getDate() - 1);
      return formatLocalDate(d);
    case "this-week-start": {
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return formatLocalDate(d);
    }
    case "last-week-start": {
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - 7);
      return formatLocalDate(d);
    }
    case "this-month-start":
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    case "last-month-start": {
      d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    }
    case "this-qtr-start": {
      const qMonth = Math.floor(d.getMonth() / 3) * 3;
      return `${d.getFullYear()}-${String(qMonth + 1).padStart(2, "0")}-01`;
    }
    case "last-qtr-start": {
      let qMonth = Math.floor(d.getMonth() / 3) * 3 - 3;
      let year = d.getFullYear();
      if (qMonth < 0) { qMonth += 12; year--; }
      return `${year}-${String(qMonth + 1).padStart(2, "0")}-01`;
    }
    case "this-year-start":
      return `${d.getFullYear()}-01-01`;
    case "last-year-start":
      return `${d.getFullYear() - 1}-01-01`;
    case "ytd-start":
      return `${d.getFullYear()}-01-01`;
    default:
      return formatLocalDate(d);
  }
}

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week-start", label: "This Week" },
  { value: "last-week-start", label: "Last Week" },
  { value: "this-month-start", label: "This Month" },
  { value: "last-month-start", label: "Last Month" },
  { value: "this-qtr-start", label: "This Quarter" },
  { value: "last-qtr-start", label: "Last Quarter" },
  { value: "this-year-start", label: "This Year" },
  { value: "last-year-start", label: "Last Year" },
  { value: "ytd-start", label: "YTD" },
];

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, bold, negative, highlight, indent, muted }: {
  label: string; value: string; bold?: boolean; negative?: boolean; highlight?: boolean; indent?: boolean; muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 ${bold ? "font-semibold" : ""} ${highlight ? "bg-muted/50 -mx-2 px-2 rounded" : ""}`}>
      <span className={`text-sm ${indent ? "pl-4" : ""} ${muted ? "text-muted-foreground italic" : ""}`}>{label}</span>
      <span className={`text-sm tabular-nums ${negative ? "text-destructive" : ""} ${muted ? "text-muted-foreground italic" : ""}`}>{value}</span>
    </div>
  );
}

function ReconciliationStatus({ customerTotal, totalPayments, delta: propDelta, changeDue, netCollected }: { customerTotal: number; totalPayments: number; delta?: number; changeDue?: number; netCollected?: number }) {
  const effectiveNet = netCollected !== undefined ? netCollected : totalPayments;
  const delta = propDelta !== undefined ? propDelta : Math.round((effectiveNet - customerTotal) * 100) / 100;
  const balanced = Math.abs(delta) <= 0.02;
  return (
    <div className={`border rounded-md p-3 ${balanced ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5"}`}>
      <div className="flex items-center gap-2 mb-2">
        {balanced ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        )}
        <span className={`text-sm font-semibold ${balanced ? "text-green-600" : "text-destructive"}`}>
          {balanced ? "BALANCED" : "OUT OF BALANCE"}
        </span>
      </div>
      <SummaryRow label="Customer Total" value={formatCurrency(customerTotal)} bold />
      <SummaryRow label="Total Payments (Tendered)" value={formatCurrency(totalPayments)} bold />
      {(changeDue !== undefined && changeDue > 0) && (
        <SummaryRow label="Less: Change Due" value={formatCurrency(-changeDue)} muted />
      )}
      {netCollected !== undefined && (changeDue !== undefined && changeDue > 0) && (
        <SummaryRow label="Net Collected" value={formatCurrency(netCollected)} bold highlight />
      )}
      <Separator className="my-1" />
      <SummaryRow label="Difference" value={formatCurrency(delta)} bold negative={!balanced} />
    </div>
  );
}

interface ProductMixItem {
  itemName: string;
  majorGroup: string;
  quantity: number;
  grossSales: number;
  netSales: number;
}

function ProductMixByCategory({ items }: { items: ProductMixItem[] }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, { items: ProductMixItem[]; totalQty: number; totalGross: number; totalNet: number }>();
    for (const item of items) {
      const group = item.majorGroup || "Uncategorized";
      const existing = map.get(group);
      if (existing) {
        existing.items.push(item);
        existing.totalQty += item.quantity;
        existing.totalGross += item.grossSales;
        existing.totalNet += item.netSales;
      } else {
        map.set(group, {
          items: [item],
          totalQty: item.quantity,
          totalGross: item.grossSales,
          totalNet: item.netSales,
        });
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Product Mix</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category / Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([groupName, group]) => {
                const isExpanded = expandedGroups.has(groupName);
                return (
                  <Fragment key={groupName}>
                    <TableRow
                      className="cursor-pointer hover-elevate"
                      onClick={() => toggleGroup(groupName)}
                      data-testid={`row-pmix-group-${groupName}`}
                    >
                      <TableCell className="font-semibold">
                        <span className="flex items-center gap-1">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {groupName}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{group.totalQty}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(group.totalGross)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(group.totalNet)}</TableCell>
                    </TableRow>
                    {isExpanded && group.items.map((p, i) => (
                      <TableRow key={`${groupName}-${i}`} data-testid={`row-pmix-${groupName}-${i}`}>
                        <TableCell className="pl-10 text-muted-foreground">{p.itemName}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{p.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(p.grossSales)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(p.netSales)}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface TenderTransaction {
  id: string;
  checkNumber: number;
  tenderName: string;
  tenderType: string;
  amount: number;
  tipAmount: number;
  employeeName: string;
  rvcName: string;
  paidAt: string | null;
}

interface TenderSummary {
  name: string;
  count: number;
  amount: number;
  tips: number;
}

interface TenderDetailData {
  transactions: TenderTransaction[];
  summary: TenderSummary[];
  totalAmount: number;
  totalTips: number;
  transactionCount: number;
}

interface MenuItemSale {
  id: string;
  name: string;
  category: string;
  quantity: number;
  grossSales: number;
  netSales: number;
  avgPrice: number;
}

interface MenuItemSalesData {
  items: MenuItemSale[];
  totalQuantity: number;
  totalSales: number;
  itemCount: number;
}

interface CategoryItem {
  id: string;
  name: string;
  quantity: number;
  sales: number;
}

interface CategorySaleDetail {
  id: string;
  name: string;
  totalQuantity: number;
  totalSales: number;
  items: CategoryItem[];
}

interface CategorySalesData {
  categories: CategorySaleDetail[];
  totalSales: number;
  totalQuantity: number;
}

interface OpenCheck {
  id: string;
  checkNumber: number;
  employeeName: string;
  rvcName: string;
  tableNumber: number | null;
  guestCount: number;
  subtotal: number;
  total: number;
  itemCount: number;
  durationMinutes: number;
  openedAt: string | null;
  businessDate: string | null;
}

interface OpenChecksData {
  checks: OpenCheck[];
  summary: { count: number; totalValue: number; avgDuration: number };
}

interface ClosedCheck {
  id: string;
  checkNumber: number;
  employeeName: string;
  rvcName: string;
  tableNumber: number | null;
  guestCount: number;
  subtotal: number;
  tax: number;
  total: number;
  totalPaid: number;
  tipAmount: number;
  tenderName: string;
  refundAmount: number;
  durationMinutes: number;
  openedAt: string | null;
  closedAt: string | null;
  businessDate: string | null;
}

interface ClosedChecksData {
  checks: ClosedCheck[];
  summary: { count: number; totalSales: number; totalTips: number; totalRefunds: number; avgCheck: number; avgDuration: number };
}

interface EmployeeBalanceItem {
  employeeId: string;
  employeeName: string;
  checkCount: number;
  itemCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  tax: number;
  total: number;
  cashCollected: number;
  creditCollected: number;
  otherCollected: number;
  totalCollected: number;
  tips: number;
}

interface EmployeeBalanceData {
  employees: EmployeeBalanceItem[];
  summary: { employeeCount: number; totalChecks: number; totalSales: number; totalTax: number; totalTips: number; totalCollected: number };
}

interface ClockedInEmployee {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  clockInTime: string;
  businessDate: string;
  jobCodeId: string | null;
  jobName: string;
  durationMinutes: number;
  isOnBreak: boolean;
  breakType?: string;
}

interface ClockedInStatusData {
  propertyId: string;
  timestamp: string;
  totalClockedIn: number;
  onBreak: number;
  working: number;
  employees: ClockedInEmployee[];
}

interface CheckPayment {
  id: string;
  checkId: string;
  tenderId: string;
  tenderName: string;
  amount: string;
  tipAmount?: string | null;
  paidAt?: string | null;
}

interface CheckDetailData {
  check: {
    id: string;
    checkNumber: number;
    employeeId: string;
    rvcId: string;
    status: string;
    tableNumber?: string | null;
    orderType?: string;
    subtotal?: string;
    taxTotal?: string;
    discountTotal?: string;
    total?: string;
    openedAt?: string | null;
    closedAt?: string | null;
    paidAmount?: number;
    tenderedAmount?: number;
    changeDue?: number;
  };
  items: CheckItem[];
  payments?: CheckPayment[];
  refunds?: Array<{
    id: string;
    total: string;
    reason: string;
    createdAt: string;
    refundedByName: string;
    items: Array<{ menuItemName: string; quantity: number; unitPrice: string; taxAmount: string }>;
  }>;
}

function OpsCategoryRows({ category, totalSales }: { category: CategorySaleDetail; totalSales: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const pctOfTotal = totalSales > 0 ? (category.totalSales / totalSales * 100) : 0;

  return (
    <>
      <TableRow
        className="cursor-pointer hover-elevate"
        data-testid={`row-ops-category-${category.id}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">{category.name}</span>
            <Badge variant="secondary" className="text-xs">{category.items.length} items</Badge>
          </div>
        </TableCell>
        <TableCell className="text-right">{category.totalQuantity}</TableCell>
        <TableCell className="text-right font-medium">{formatCurrency(category.totalSales)}</TableCell>
        <TableCell className="text-right text-muted-foreground">{pctOfTotal.toFixed(1)}%</TableCell>
      </TableRow>
      {isOpen && category.items.map((item) => {
        const itemPct = category.totalSales > 0 ? (item.sales / category.totalSales * 100) : 0;
        return (
          <TableRow key={item.id} className="bg-muted/30" data-testid={`row-ops-item-${item.id}`}>
            <TableCell className="pl-10">{item.name}</TableCell>
            <TableCell className="text-right text-muted-foreground">{item.quantity}</TableCell>
            <TableCell className="text-right text-muted-foreground">{formatCurrency(item.sales)}</TableCell>
            <TableCell className="text-right text-muted-foreground text-xs">{itemPct.toFixed(1)}%</TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

export default function DailyOperationsPage() {
  const emcFilter = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [businessDate, setBusinessDate] = useState<string>(formatLocalDate(new Date()));
  const [activeTab, setActiveTab] = useState("daily-sales");

  const { data: allProperties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const properties = useMemo(() => {
    if (!allProperties) return [];
    if (emcFilter?.selectedEnterpriseId) {
      return allProperties.filter(p => p.enterpriseId === emcFilter.selectedEnterpriseId);
    }
    return allProperties;
  }, [allProperties, emcFilter?.selectedEnterpriseId]);

  const effectivePropertyId = useMemo(() => {
    const candidate = selectedPropertyId || emcFilter?.selectedPropertyId || "";
    if (candidate && properties.some(p => p.id === candidate)) {
      return candidate;
    }
    return properties[0]?.id ?? "";
  }, [selectedPropertyId, emcFilter?.selectedPropertyId, properties]);

  const selectedProperty = useMemo(() => {
    return properties?.find(p => p.id === effectivePropertyId);
  }, [properties, effectivePropertyId]);

  useEffect(() => {
    if (selectedProperty?.currentBusinessDate) {
      setBusinessDate(selectedProperty.currentBusinessDate);
    }
  }, [selectedProperty?.id, selectedProperty?.currentBusinessDate]);

  const queryParams = `propertyId=${effectivePropertyId}&businessDate=${businessDate}`;

  const { data: zReport, isLoading: zLoading } = useQuery({
    queryKey: ["/api/reports/z-report", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/z-report?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "financial-close",
  });

  const { data: activityReport, isLoading: activityLoading } = useQuery({
    queryKey: ["/api/reports/business-day-activity", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/business-day-activity?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "activity",
  });

  const { data: cashierReport, isLoading: cashierLoading } = useQuery({
    queryKey: ["/api/reports/cashier-report", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/cashier-report?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "cashier",
  });

  const { data: dailySales, isLoading: salesLoading } = useQuery({
    queryKey: ["/api/reports/daily-sales-summary", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/daily-sales-summary?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "daily-sales",
  });

  const { data: laborSummary, isLoading: laborLoading } = useQuery({
    queryKey: ["/api/reports/labor-summary", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/labor-summary?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "labor",
  });

  const { data: tipPoolSummary, isLoading: tipLoading } = useQuery({
    queryKey: ["/api/reports/tip-pool-summary", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/tip-pool-summary?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "tip-pool",
  });

  const { data: validation, isLoading: validLoading } = useQuery({
    queryKey: ["/api/reports/validate", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/validate?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "validation",
  });

  const { toast } = useToast();
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [checkModalOpen, setCheckModalOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const selectedPropertyTimezone = useMemo(() => {
    return (selectedProperty as any)?.timezone || "America/New_York";
  }, [selectedProperty]);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return formatInTimeZone(new Date(dateStr), selectedPropertyTimezone, "MMM d, h:mm a");
    } catch {
      return new Date(dateStr).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
      });
    }
  };

  const dateRangeParams = useMemo(() => {
    const start = new Date(businessDate + "T00:00:00");
    start.setHours(0, 0, 0, 0);
    const end = new Date(businessDate + "T23:59:59");
    end.setHours(23, 59, 59, 999);
    return `startDate=${start.toISOString()}&endDate=${end.toISOString()}&businessDate=${businessDate}${effectivePropertyId ? `&propertyId=${effectivePropertyId}` : ''}`;
  }, [businessDate, effectivePropertyId]);

  const { data: tenderData } = useQuery<TenderDetailData>({
    queryKey: ["/api/reports/tender-detail", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/tender-detail?${dateRangeParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "tenders",
  });

  const { data: menuItemData } = useQuery<MenuItemSalesData>({
    queryKey: ["/api/reports/menu-item-sales", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/menu-item-sales?${dateRangeParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "menu-items",
  });

  const { data: categoryData } = useQuery<CategorySalesData>({
    queryKey: ["/api/reports/category-sales", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/category-sales?${dateRangeParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "categories",
  });

  const { data: openChecksData, isLoading: openChecksLoading } = useQuery<OpenChecksData>({
    queryKey: ["/api/reports/open-checks", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/open-checks?${dateRangeParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "open-checks",
  });

  const { data: closedChecksData, isLoading: closedChecksLoading } = useQuery<ClosedChecksData>({
    queryKey: ["/api/reports/closed-checks", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/closed-checks?${dateRangeParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "closed-checks",
  });

  const { data: employeeBalanceData, isLoading: employeeBalanceLoading } = useQuery<EmployeeBalanceData>({
    queryKey: ["/api/reports/employee-balance", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/employee-balance?${dateRangeParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "employee-balance",
  });

  const { data: clockedInData, isLoading: clockedInLoading } = useQuery<ClockedInStatusData>({
    queryKey: ["/api/reports/clocked-in-status", effectivePropertyId],
    queryFn: () => authFetch(`/api/reports/clocked-in-status?propertyId=${effectivePropertyId}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "clocked-in",
    refetchInterval: 60000,
  });

  const { data: checkDetailData, isLoading: checkDetailLoading } = useQuery<CheckDetailData>({
    queryKey: ["/api/checks", selectedCheckId],
    queryFn: async () => {
      if (!selectedCheckId) throw new Error("No check selected");
      const res = await authFetch(`/api/checks/${selectedCheckId}`);
      if (!res.ok) throw new Error("Failed to fetch check details");
      return res.json();
    },
    enabled: !!selectedCheckId && checkModalOpen,
  });

  const avgItemPrice = menuItemData && menuItemData.totalQuantity > 0
    ? menuItemData.totalSales / menuItemData.totalQuantity
    : 0;

  const handleViewCheck = (checkId: string) => {
    setSelectedCheckId(checkId);
    setCheckModalOpen(true);
  };

  const handlePrintCheck = async (checkId: string) => {
    try {
      setIsPrinting(true);
      const response = await apiRequest("POST", `/api/print/check/${checkId}`, {});
      const data = await response.json();
      if (data.success) {
        toast({ title: "Print job created", description: "Receipt sent to print queue" });
      } else {
        toast({ title: "Print failed", description: data.error || "Failed to print receipt", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Print error", description: error.message || "Failed to print", variant: "destructive" });
    } finally {
      setIsPrinting(false);
    }
  };

  function getTenderIcon(type: string) {
    switch (type) {
      case "cash": return <Banknote className="h-4 w-4" />;
      case "credit": return <CreditCard className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  }

  const handlePrint = () => window.print();

  if (!properties?.length) {
    return (
      <div className="p-6">
        <div className="py-8 text-center text-muted-foreground">No properties configured. Set up a property first.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-daily-ops-title">Daily Operations Reports</h1>
          <p className="text-muted-foreground text-sm">Oracle Simphony-compliant FOH/BOH reports with enterprise reconciliation</p>
        </div>
        <Button variant="outline" onClick={handlePrint} data-testid="button-print-report">
          <Printer className="h-4 w-4 mr-2" />
          Print Report
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label>Property</Label>
              <Select value={effectivePropertyId} onValueChange={setSelectedPropertyId}>
                <SelectTrigger className="w-[220px]" data-testid="select-ops-property">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Quick Select</Label>
              <Select
                value=""
                onValueChange={(preset) => {
                  const date = getDatePreset(preset, selectedProperty?.currentBusinessDate || undefined);
                  setBusinessDate(date);
                }}
              >
                <SelectTrigger className="w-[160px]" data-testid="select-date-preset">
                  <SelectValue placeholder="Choose period" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Business Date</Label>
              <Input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                className="w-[180px]"
                data-testid="input-ops-date"
              />
            </div>

            <Badge variant="outline" className="text-sm px-3 py-1.5 ml-auto">
              <Clock className="h-3.5 w-3.5 mr-2" />
              {selectedProperty?.name || "Property"} - {businessDate}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="print:hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1" data-testid="tabs-daily-ops">
            <TabsTrigger value="daily-sales" data-testid="tab-daily-sales">
              <DollarSign className="h-4 w-4 mr-2" />
              Daily Sales
            </TabsTrigger>
            <TabsTrigger value="cashier" data-testid="tab-cashier">
              <Users className="h-4 w-4 mr-2" />
              Cashier
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="labor" data-testid="tab-labor">
              <Clock className="h-4 w-4 mr-2" />
              Labor Summary
            </TabsTrigger>
            <TabsTrigger value="tip-pool" data-testid="tab-tip-pool">
              <Coins className="h-4 w-4 mr-2" />
              Tip Pool
            </TabsTrigger>
            <TabsTrigger value="financial-close" data-testid="tab-financial-close">
              <FileText className="h-4 w-4 mr-2" />
              Financial Close
            </TabsTrigger>
            <TabsTrigger value="validation" data-testid="tab-validation">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Validation
            </TabsTrigger>
            <TabsTrigger value="tenders" data-testid="tab-ops-tenders">
              <CreditCard className="h-4 w-4 mr-2" />
              Tenders
            </TabsTrigger>
            <TabsTrigger value="menu-items" data-testid="tab-ops-menu-items">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Menu Items
            </TabsTrigger>
            <TabsTrigger value="categories" data-testid="tab-ops-categories">
              <Layers className="h-4 w-4 mr-2" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="open-checks" data-testid="tab-ops-open-checks">
              <FileText className="h-4 w-4 mr-2" />
              Open Checks
            </TabsTrigger>
            <TabsTrigger value="closed-checks" data-testid="tab-ops-closed-checks">
              <Receipt className="h-4 w-4 mr-2" />
              Closed Checks
            </TabsTrigger>
            <TabsTrigger value="employee-balance" data-testid="tab-ops-employee-balance">
              <UserCheck className="h-4 w-4 mr-2" />
              Employee Balance
            </TabsTrigger>
            <TabsTrigger value="clocked-in" data-testid="tab-ops-clocked-in">
              <Clock className="h-4 w-4 mr-2" />
              Clocked In
            </TabsTrigger>
          </TabsList>

          {/* ========== FINANCIAL CLOSE (Report 1) ========== */}
          <TabsContent value="financial-close">
            {zLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Financial Close...</CardContent></Card>
            ) : zReport ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Daily Financial Close</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {zReport.businessDate}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Closed checks only (status = closed)</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ReportSection title="Section A - Sales">
                      <SummaryRow label="Gross Sales" value={formatCurrency(zReport.grossSales)} />
                      <SummaryRow label="Item Discounts" value={`(${formatCurrency(zReport.itemDiscounts)})`} negative indent />
                      <SummaryRow label="Check Discounts" value={`(${formatCurrency(zReport.checkDiscounts)})`} negative indent />
                      <SummaryRow label="Total Discounts" value={`(${formatCurrency(zReport.totalDiscounts)})`} negative />
                      <Separator className="my-1" />
                      <SummaryRow label="Net Sales" value={formatCurrency(zReport.netSales)} bold highlight />
                    </ReportSection>

                    <ReportSection title="Section B - Additions">
                      <SummaryRow label="Tax (Item)" value={formatCurrency(zReport.itemTax)} indent />
                      <SummaryRow label="Tax (Service Charge)" value={formatCurrency(zReport.serviceChargeTax)} indent />
                      <SummaryRow label="Total Tax" value={formatCurrency(zReport.totalTax)} />
                      <SummaryRow label="Service Charges" value={formatCurrency(zReport.serviceCharges)} />
                      <Separator className="my-1" />
                      <SummaryRow label="Total Revenue" value={formatCurrency(zReport.totalRevenue)} bold />
                      <p className="text-xs text-muted-foreground">Net Sales + Tax + Service Charges (tips NOT included)</p>
                    </ReportSection>

                    <ReportSection title="Section C - Tips (Liability)">
                      <SummaryRow label="Card Tips" value={formatCurrency(zReport.cardTips)} />
                    </ReportSection>

                    <Separator />
                    <SummaryRow label="Customer Total" value={formatCurrency(zReport.customerTotal)} bold highlight />
                    <p className="text-xs text-muted-foreground">Net Sales + Tax + Service Charges + Card Tips</p>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Section D - Payments</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {zReport.tenderBreakdown?.map((t: any, i: number) => (
                        <SummaryRow key={i} label={t.tenderName} value={formatCurrency(t.amount)} />
                      ))}
                      <Separator className="my-1" />
                      <SummaryRow label="Total Tendered" value={formatCurrency(zReport.totalCollected)} bold />
                      {(zReport.changeDue > 0) && (
                        <>
                          <SummaryRow label="Less: Change Due" value={formatCurrency(-zReport.changeDue)} muted />
                          <SummaryRow label="Net Collected" value={formatCurrency(zReport.netCollected)} bold highlight />
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Section E - Reconciliation</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReconciliationStatus
                        customerTotal={zReport.customerTotal || 0}
                        totalPayments={zReport.totalCollected || 0}
                        changeDue={zReport.changeDue || 0}
                        netCollected={zReport.netCollected}
                        delta={zReport.reconciliationDelta}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Operational Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <SummaryRow label="Closed Checks" value={String(zReport.checkCount || 0)} />
                      <SummaryRow label="Voids" value={`${zReport.voidCount || 0} items`} />
                      <SummaryRow label="Void Amount" value={formatCurrency(zReport.voidAmount)} negative={!!zReport.voidAmount} />
                      {(zReport.checkCount || 0) > 0 && (
                        <SummaryRow
                          label="Avg Check"
                          value={formatCurrency((zReport.netSales || 0) / (zReport.checkCount || 1))}
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date to generate Financial Close</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== BUSINESS DAY ACTIVITY (Report 2) ========== */}
          <TabsContent value="activity">
            {activityLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Activity Report...</CardContent></Card>
            ) : activityReport ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Business Day Activity</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {activityReport.businessDate}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">All check statuses - operational flow (does not need to balance)</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="border rounded-md p-3 space-y-1">
                        <p className="text-xs text-muted-foreground uppercase">Carried In</p>
                        <p className="text-2xl font-bold tabular-nums" data-testid="text-activity-carried-in">{activityReport.carriedIn?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.carriedIn?.amount)}</p>
                      </div>
                      <div className="border rounded-md p-3 space-y-1">
                        <p className="text-xs text-muted-foreground uppercase">Started</p>
                        <p className="text-2xl font-bold tabular-nums" data-testid="text-activity-started">{activityReport.checksStarted?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.checksStarted?.amount)}</p>
                      </div>
                      <div className="border rounded-md p-3 space-y-1 border-green-500/30">
                        <p className="text-xs text-muted-foreground uppercase">Paid</p>
                        <p className="text-2xl font-bold tabular-nums text-green-600" data-testid="text-activity-closed">{activityReport.checksClosed?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.checksClosed?.amount)}</p>
                      </div>
                      <div className={`border rounded-md p-3 space-y-1 ${(activityReport.checksCancelled?.count || 0) > 0 ? "border-red-500/30" : ""}`}>
                        <p className="text-xs text-muted-foreground uppercase">Cancelled</p>
                        <p className={`text-2xl font-bold tabular-nums ${(activityReport.checksCancelled?.count || 0) > 0 ? "text-red-600" : ""}`} data-testid="text-activity-cancelled">{activityReport.checksCancelled?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.checksCancelled?.amount)}</p>
                      </div>
                      <div className={`border rounded-md p-3 space-y-1 ${(activityReport.checksOutstanding?.count || 0) > 0 ? "border-amber-500/30" : ""}`}>
                        <p className="text-xs text-muted-foreground uppercase">Outstanding</p>
                        <p className={`text-2xl font-bold tabular-nums ${(activityReport.checksOutstanding?.count || 0) > 0 ? "text-amber-600" : ""}`} data-testid="text-activity-outstanding">{activityReport.checksOutstanding?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.checksOutstanding?.amount)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {(activityReport.checksOutstanding?.checks?.length || 0) > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <CardTitle className="text-sm">Outstanding Checks</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Check #</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activityReport.checksOutstanding.checks.map((c: any, i: number) => (
                            <TableRow key={i} data-testid={`row-outstanding-${i}`}>
                              <TableCell className="font-medium">#{c.checkNumber}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{c.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(c.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {(activityReport.carriedIn?.checks?.length || 0) > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm">Carried-In Checks (from prior business dates)</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Check #</TableHead>
                            <TableHead>Original Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activityReport.carriedIn.checks.map((c: any, i: number) => (
                            <TableRow key={i} data-testid={`row-carried-in-${i}`}>
                              <TableCell className="font-medium">#{c.checkNumber}</TableCell>
                              <TableCell>{c.businessDate}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{c.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(c.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== CASHIER REPORT ========== */}
          <TabsContent value="cashier">
            {cashierLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Cashier Report...</CardContent></Card>
            ) : cashierReport && Array.isArray(cashierReport) ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Cashier Report</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {businessDate} (closed checks)
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Cashiers</p>
                        <p className="font-medium text-lg" data-testid="text-cashier-count">{cashierReport.length}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Net Sales</p>
                        <p className="font-medium text-lg" data-testid="text-cashier-net">
                          {formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.netSales || 0), 0))}
                        </p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Total Collected</p>
                        <p className="font-medium text-lg" data-testid="text-cashier-collected">
                          {formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.totalCollected || 0), 0))}
                        </p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Card Tips</p>
                        <p className="font-medium text-lg">
                          {formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.cardTips || 0), 0))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {cashierReport.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">By Cashier</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cashier</TableHead>
                              <TableHead className="text-right">Checks</TableHead>
                              <TableHead className="text-right">Net</TableHead>
                              <TableHead className="text-right">Tax</TableHead>
                              <TableHead className="text-right">Svc Chg</TableHead>
                              <TableHead className="text-right">Card Tips</TableHead>
                              <TableHead className="text-right">Cust Total</TableHead>
                              <TableHead className="text-right">Collected</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cashierReport.map((c: any, i: number) => {
                              const delta = Math.abs((c.customerTotal || 0) - (c.totalCollected || 0));
                              return (
                                <TableRow key={i} data-testid={`row-cashier-${i}`}>
                                  <TableCell className="font-medium">{c.employeeId?.substring(0, 8) || `Cashier ${i + 1}`}</TableCell>
                                  <TableCell className="text-right tabular-nums">{c.checksOpened}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.netSales)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.tax)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.serviceCharges)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.cardTips)}</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(c.customerTotal)}</TableCell>
                                  <TableCell className={`text-right tabular-nums font-medium ${delta > 0.02 ? "text-destructive" : ""}`}>{formatCurrency(c.totalCollected)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== DAILY SALES SUMMARY ========== */}
          <TabsContent value="daily-sales">
            {salesLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Daily Sales Summary...</CardContent></Card>
            ) : dailySales ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Daily Sales Summary</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {selectedProperty?.name} - {dailySales.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ReportSection title="Sales">
                        <SummaryRow label="Gross Sales" value={formatCurrency(dailySales.grossSales)} />
                        <SummaryRow label="Item Discounts" value={`(${formatCurrency(dailySales.itemDiscounts)})`} negative indent />
                        <SummaryRow label="Check Discounts" value={`(${formatCurrency(dailySales.checkDiscounts)})`} negative indent />
                        <SummaryRow label="Total Discounts" value={`(${formatCurrency(dailySales.totalDiscounts)})`} negative />
                        <Separator className="my-1" />
                        <SummaryRow label="Net Sales" value={formatCurrency(dailySales.netSales)} bold highlight />
                      </ReportSection>

                      <ReportSection title="Additions">
                        <SummaryRow label="Total Tax" value={formatCurrency(dailySales.totalTax)} />
                        <SummaryRow label="Service Charges" value={formatCurrency(dailySales.serviceCharges)} />
                        <Separator className="my-1" />
                        <SummaryRow label="Total Revenue" value={formatCurrency(dailySales.totalRevenue)} bold />
                      </ReportSection>

                      <ReportSection title="Tips">
                        <SummaryRow label="Card Tips" value={formatCurrency(dailySales.cardTips)} />
                      </ReportSection>

                      <Separator />
                      <SummaryRow label="Customer Total" value={formatCurrency(dailySales.customerTotal)} bold highlight />
                      <p className="text-xs text-muted-foreground">Net Sales + Tax + Service Charges + Card Tips</p>
                      <ReconciliationStatus
                        customerTotal={dailySales.customerTotal || 0}
                        totalPayments={dailySales.totalCollected || 0}
                        changeDue={dailySales.changeDue || 0}
                        netCollected={dailySales.netCollected}
                        delta={dailySales.reconciliationDelta}
                      />
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Payments</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {dailySales.tenderBreakdown?.map((t: any, i: number) => (
                          <SummaryRow key={i} label={t.tenderName} value={formatCurrency(t.amount)} />
                        ))}
                        <Separator className="my-1" />
                        <SummaryRow label="Total Payments" value={formatCurrency(dailySales.totalCollected)} bold />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Operational Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="space-y-1">
                          <SummaryRow
                            label="Checks Carried Over"
                            value={`${dailySales.operationalMetrics?.carriedOver?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.carriedOver?.amt || 0)})`}
                          />
                          <SummaryRow
                            label="Checks Begun"
                            value={`${dailySales.operationalMetrics?.begun?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.begun?.amt || 0)})`}
                          />
                          <SummaryRow
                            label="Checks Paid"
                            value={`${dailySales.operationalMetrics?.checksPaid?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.checksPaid?.amt || 0)})`}
                            bold
                          />
                          <SummaryRow
                            label="Cancelled/Voided"
                            value={`${dailySales.operationalMetrics?.cancelled?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.cancelled?.amt || 0)})`}
                            highlight={(dailySales.operationalMetrics?.cancelled?.qty || 0) > 0}
                          />
                          <SummaryRow
                            label="Checks O/S"
                            value={`${dailySales.operationalMetrics?.outstanding?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.outstanding?.amt || 0)})`}
                            highlight={(dailySales.operationalMetrics?.outstanding?.qty || 0) > 0}
                          />
                        </div>
                        <Separator className="my-1" />
                        <SummaryRow label="Total Checks (Sales)" value={String(dailySales.checkCount || 0)} />
                        <SummaryRow label="Voids" value={`${dailySales.voidCount || 0} items (${formatCurrency(dailySales.voidAmount)})`} />
                        {(dailySales.checkCount || 0) > 0 && (
                          <SummaryRow
                            label="Avg Check"
                            value={formatCurrency((dailySales.netSales || 0) / (dailySales.checkCount || 1))}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {dailySales.productMix?.length > 0 && (
                  <ProductMixByCategory items={dailySales.productMix} />
                )}

                {dailySales.discountDetail?.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Discount Detail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Discount</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dailySales.discountDetail.map((d: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>{d.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{d.count}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(d.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {dailySales.serviceChargeDetail?.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Service Charge Detail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service Charge</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Tax</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dailySales.serviceChargeDetail.map((sc: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>{sc.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{sc.count}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(sc.amount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(sc.taxAmount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== LABOR SUMMARY ========== */}
          <TabsContent value="labor">
            {laborLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Labor Summary...</CardContent></Card>
            ) : laborSummary ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Labor Summary</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {laborSummary.businessDate}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Employees</p>
                        <p className="font-medium text-lg">{laborSummary.employeeCount || 0}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Total Hours</p>
                        <p className="font-medium text-lg">{laborSummary.totalHours || 0}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Total Wages</p>
                        <p className="font-medium text-lg">{formatCurrency(laborSummary.totalPay)}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Labor %</p>
                        <p className="font-medium text-lg">{formatPercent(laborSummary.laborPercent)}</p>
                      </div>
                    </div>

                    <Separator />

                    <ReportSection title="Summary">
                      <SummaryRow label="Regular Hours" value={String(laborSummary.totalRegularHours || 0)} />
                      <SummaryRow label="Overtime Hours" value={String(laborSummary.totalOvertimeHours || 0)} />
                      <SummaryRow label="Total Hours" value={String(laborSummary.totalHours || 0)} bold />
                      <Separator className="my-1" />
                      <SummaryRow label="Regular Pay" value={formatCurrency(laborSummary.totalRegularPay)} />
                      <SummaryRow label="Overtime Pay" value={formatCurrency(laborSummary.totalOvertimePay)} />
                      <SummaryRow label="Total Wages" value={formatCurrency(laborSummary.totalPay)} bold />
                      <Separator className="my-1" />
                      <SummaryRow label="Declared Cash Tips" value={formatCurrency(laborSummary.totalDeclaredCashTips)} />
                      <SummaryRow label="Net Sales (closed)" value={formatCurrency(laborSummary.netSales)} />
                      <SummaryRow label="Labor %" value={formatPercent(laborSummary.laborPercent)} bold highlight />
                      <SummaryRow label="Sales Per Labor Hour" value={formatCurrency(laborSummary.salesPerLaborHour)} />
                    </ReportSection>
                  </CardContent>
                </Card>

                {laborSummary.byEmployee?.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">By Employee</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Reg Hrs</TableHead>
                              <TableHead className="text-right">OT Hrs</TableHead>
                              <TableHead className="text-right">Total Hrs</TableHead>
                              <TableHead className="text-right">Pay</TableHead>
                              <TableHead className="text-right">Cash Tips</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {laborSummary.byEmployee.map((e: any, i: number) => (
                              <TableRow key={i} data-testid={`row-labor-${i}`}>
                                <TableCell className="font-medium">{e.employeeId?.substring(0, 8)}</TableCell>
                                <TableCell className="text-right tabular-nums">{e.regularHours}</TableCell>
                                <TableCell className="text-right tabular-nums">{e.overtimeHours}</TableCell>
                                <TableCell className="text-right tabular-nums">{e.totalHours}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(e.totalPay)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(e.declaredCashTips)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== TIP POOL SUMMARY ========== */}
          <TabsContent value="tip-pool">
            {tipLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Tip Pool Summary...</CardContent></Card>
            ) : tipPoolSummary ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Tip Pool Summary (CC Only)</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {tipPoolSummary.businessDate}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Closed checks only - card tips pooled by hours worked</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Poolable Tips</p>
                        <p className="font-medium text-lg">{formatCurrency(tipPoolSummary.totalPoolableTips)}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Participants</p>
                        <p className="font-medium text-lg">{tipPoolSummary.participantCount || 0}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Total Hours</p>
                        <p className="font-medium text-lg">{tipPoolSummary.totalHoursWorked || 0}</p>
                      </div>
                    </div>

                    {tipPoolSummary.participants?.length > 0 && (
                      <>
                        <Separator />
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                              <TableHead className="text-right">Share %</TableHead>
                              <TableHead className="text-right">Allocation</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tipPoolSummary.participants.map((p: any, i: number) => (
                              <TableRow key={i} data-testid={`row-tippool-${i}`}>
                                <TableCell className="font-medium">{p.employeeId?.substring(0, 8)}</TableCell>
                                <TableCell className="text-right tabular-nums">{p.hoursWorked}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatPercent(p.sharePercentage)}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(p.allocatedAmount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== VALIDATION ========== */}
          <TabsContent value="validation">
            {validLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Validation...</CardContent></Card>
            ) : validation ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Validation Checks</CardTitle>
                      <Badge
                        variant={validation.overall === "PASS" ? "default" : validation.overall === "WARN" ? "secondary" : "destructive"}
                        data-testid="badge-validation-overall"
                      >
                        {validation.overall}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {validation.checks && Object.entries(validation.checks).map(([key, check]: [string, any]) => (
                      <div key={key} className={`border rounded-md p-3 ${
                        check.status === "PASS" ? "border-green-500/30 bg-green-500/5" :
                        check.status === "WARN" ? "border-amber-500/30 bg-amber-500/5" :
                        "border-destructive/30 bg-destructive/5"
                      }`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {check.status === "PASS" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : check.status === "WARN" ? (
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="text-sm font-medium">
                              {key === "serviceChargeReconciliation" && "Service Charge Reconciliation"}
                              {key === "tipDoubleCountCheck" && "Model A Tip Verification"}
                              {key === "cashDrawerLinkage" && "Cash Drawer Linkage"}
                              {key === "salesRebuild" && "Sales Rebuild"}
                              {key === "paymentReconciliation" && "Payment Reconciliation"}
                              {key === "overpaymentCheck" && "Overpayment Check"}
                              {key === "openCheckWarning" && "Open Checks Warning"}
                            </span>
                          </div>
                          <Badge
                            variant={check.status === "PASS" ? "default" : check.status === "WARN" ? "secondary" : "destructive"}
                          >
                            {check.status}
                          </Badge>
                        </div>
                        {check.message && (
                          <p className="text-xs text-muted-foreground mt-1">{check.message}</p>
                        )}
                        {check.breakdown && (
                          <div className="mt-2 text-xs space-y-0.5">
                            <div className="flex justify-between gap-2"><span>Net Sales</span><span className="tabular-nums">{formatCurrency(check.breakdown.netSales)}</span></div>
                            <div className="flex justify-between gap-2"><span>Tax</span><span className="tabular-nums">{formatCurrency(check.breakdown.tax)}</span></div>
                            <div className="flex justify-between gap-2"><span>Service Charges</span><span className="tabular-nums">{formatCurrency(check.breakdown.serviceCharges)}</span></div>
                            <div className="flex justify-between gap-2"><span>Card Tips</span><span className="tabular-nums">{formatCurrency(check.breakdown.cardTips)}</span></div>
                            <Separator className="my-1" />
                            <div className="flex justify-between gap-2 font-medium"><span>Customer Total</span><span className="tabular-nums">{formatCurrency(check.breakdown.customerTotal)}</span></div>
                            <div className="flex justify-between gap-2 font-medium"><span>Total Payments</span><span className="tabular-nums">{formatCurrency(check.breakdown.totalPayments)}</span></div>
                            <div className="flex justify-between gap-2 font-medium"><span>Delta</span><span className={`tabular-nums ${Math.abs(check.breakdown.delta) > 0.02 ? "text-destructive" : "text-green-600"}`}>{formatCurrency(check.breakdown.delta)}</span></div>
                          </div>
                        )}
                        {check.details && check.details.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium mb-1">{check.details.length} issue(s):</p>
                            <div className="max-h-32 overflow-y-auto text-xs space-y-0.5">
                              {check.details.slice(0, 10).map((d: any, i: number) => (
                                <div key={i} className="flex gap-2 text-muted-foreground">
                                  <span>#{d.checkNumber || d.paymentId?.substring(0, 8) || i}</span>
                                  {d.overpayment !== undefined && <span>Overpaid: {formatCurrency(d.overpayment)}</span>}
                                  {d.difference !== undefined && <span>Diff: {formatCurrency(d.difference)}</span>}
                                  {d.amount !== undefined && d.status !== undefined && <span>{d.status}: {formatCurrency(d.amount)}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== TENDERS ========== */}
          <TabsContent value="tenders" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-ops-total-collected">
                    {formatCurrency(tenderData?.totalAmount || 0)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Tips</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-ops-total-tips">
                    {formatCurrency(tenderData?.totalTips || 0)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-ops-transaction-count">
                    {tenderData?.transactionCount || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-ops-avg-transaction">
                    {formatCurrency(tenderData && tenderData.transactionCount > 0 ? tenderData.totalAmount / tenderData.transactionCount : 0)}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Summary by Tender Type</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tender</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Tips</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tenderData?.summary || []).map((t) => (
                        <TableRow key={t.name} data-testid={`row-ops-tender-${t.name}`}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="text-right">{t.count}</TableCell>
                          <TableCell className="text-right">{formatCurrency(t.amount - (t.tips || 0))}</TableCell>
                          <TableCell className="text-right">{formatCurrency(t.tips)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(t.amount)}</TableCell>
                        </TableRow>
                      ))}
                      {(!tenderData?.summary || tenderData.summary.length === 0) && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No tender data</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">Recent Transactions</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-ops-export-transactions">
                        <Download className="h-4 w-4 mr-1" />Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => exportData('csv', tenderData?.transactions || [], [
                        { key: 'checkNumber', header: 'Check #' },
                        { key: 'tenderName', header: 'Tender' },
                        { key: 'amount', header: 'Amount', format: commonFormatters.currency },
                        { key: 'tipAmount', header: 'Tip', format: commonFormatters.currency },
                        { key: 'employeeName', header: 'Employee' },
                        { key: 'paidAt', header: 'Time', format: commonFormatters.dateTime },
                      ], `tender-transactions-${businessDate}`, 'Tender Transactions')}>Export as CSV</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Check</TableHead>
                        <TableHead>Tender</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tenderData?.transactions || []).slice(0, 10).map((t) => (
                        <TableRow key={t.id} data-testid={`row-ops-transaction-${t.id}`}>
                          <TableCell>#{t.checkNumber}</TableCell>
                          <TableCell><div className="flex items-center gap-2">{getTenderIcon(t.tenderType)}<span>{t.tenderName}</span></div></TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(t.amount)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDateTime(t.paidAt)}</TableCell>
                        </TableRow>
                      ))}
                      {(!tenderData?.transactions || tenderData.transactions.length === 0) && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No transactions</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ========== MENU ITEMS ========== */}
          <TabsContent value="menu-items" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-total-item-sales">{formatCurrency(menuItemData?.totalSales || 0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-items-sold">{menuItemData?.totalQuantity || 0}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unique Items</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-unique-items">{menuItemData?.itemCount || 0}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Item Price</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-avg-item-price">{formatCurrency(avgItemPrice)}</div></CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Item Sales Detail</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-ops-export-items"><Download className="h-4 w-4 mr-1" />Export</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => exportData('csv', menuItemData?.items || [], [
                      { key: 'name', header: 'Item' },
                      { key: 'category', header: 'Category' },
                      { key: 'quantity', header: 'Quantity' },
                      { key: 'avgPrice', header: 'Avg Price', format: commonFormatters.currency },
                      { key: 'netSales', header: 'Net Sales', format: commonFormatters.currency },
                    ], `item-sales-${businessDate}`, 'Item Sales')}>Export as CSV</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg Price</TableHead>
                      <TableHead className="text-right">Net Sales</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(menuItemData?.items || []).map((item) => {
                      const pct = menuItemData && menuItemData.totalSales > 0 ? (item.netSales / menuItemData.totalSales * 100) : 0;
                      return (
                        <TableRow key={item.id} data-testid={`row-ops-item-detail-${item.id}`}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell><Badge variant="secondary">{item.category}</Badge></TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.avgPrice)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.netSales)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{pct.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                    {(!menuItemData?.items || menuItemData.items.length === 0) && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No item sales data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== CATEGORIES ========== */}
          <TabsContent value="categories" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-category-total-sales">{formatCurrency(categoryData?.totalSales || 0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-category-items-sold">{categoryData?.totalQuantity || 0}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Categories</CardTitle>
                  <Layers className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-category-count">{categoryData?.categories?.length || 0}</div></CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Category Breakdown</CardTitle>
                <p className="text-sm text-muted-foreground">Click a category to see item details</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Total Sales</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(categoryData?.categories || []).map((category) => (
                      <OpsCategoryRows key={category.id} category={category} totalSales={categoryData?.totalSales || 0} />
                    ))}
                    {(!categoryData?.categories || categoryData.categories.length === 0) && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No category data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== OPEN CHECKS ========== */}
          <TabsContent value="open-checks" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Open Checks</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-open-check-count">{openChecksLoading ? "..." : openChecksData?.summary.count || 0}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-open-check-value">{openChecksLoading ? "..." : formatCurrency(openChecksData?.summary.totalValue || 0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-open-check-duration">{openChecksLoading ? "..." : `${Math.round(openChecksData?.summary.avgDuration || 0)} min`}</div></CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Open Checks</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check #</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>RVC</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead>Opened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(openChecksData?.checks || []).map((check) => (
                      <TableRow key={check.id} data-testid={`row-ops-open-check-${check.id}`} className="cursor-pointer hover-elevate" onClick={() => handleViewCheck(check.id)}>
                        <TableCell className="font-medium">{check.checkNumber}</TableCell>
                        <TableCell>{check.employeeName}</TableCell>
                        <TableCell>{check.rvcName}</TableCell>
                        <TableCell>{check.tableNumber || "-"}</TableCell>
                        <TableCell className="text-right">{check.itemCount}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(check.total)}</TableCell>
                        <TableCell className="text-right">{check.durationMinutes} min</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(check.openedAt)}</TableCell>
                      </TableRow>
                    ))}
                    {(!openChecksData?.checks || openChecksData.checks.length === 0) && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No open checks</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground mt-2">Click on a check to view details</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== CLOSED CHECKS ========== */}
          <TabsContent value="closed-checks" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Closed Checks</CardTitle>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-closed-check-count">{closedChecksLoading ? "..." : closedChecksData?.summary.count || 0}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-closed-check-sales">{closedChecksLoading ? "..." : formatCurrency(closedChecksData?.summary.totalSales || 0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Check</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-closed-avg-check">{closedChecksLoading ? "..." : formatCurrency(closedChecksData?.summary.avgCheck || 0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-closed-avg-duration">{closedChecksLoading ? "..." : `${Math.round(closedChecksData?.summary.avgDuration || 0)} min`}</div></CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Closed Checks</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-ops-export-closed-checks"><Download className="h-4 w-4 mr-1" />Export</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => exportData('csv', closedChecksData?.checks || [], [
                      { key: 'checkNumber', header: 'Check #' },
                      { key: 'employeeName', header: 'Employee' },
                      { key: 'total', header: 'Total', format: commonFormatters.currency },
                      { key: 'tipAmount', header: 'Tip', format: commonFormatters.currency },
                      { key: 'tenderName', header: 'Tender' },
                      { key: 'totalPaid', header: 'Paid', format: commonFormatters.currency },
                      { key: 'closedAt', header: 'Closed', format: commonFormatters.dateTime },
                      { key: 'businessDate', header: 'Business Date' },
                    ], `closed-checks-${businessDate}`, 'Closed Checks')}>Export as CSV</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check #</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Tip</TableHead>
                      <TableHead className="text-right">Refund</TableHead>
                      <TableHead>Tender</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead>Closed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(closedChecksData?.checks || []).map((check: any) => (
                      <TableRow key={check.id} data-testid={`row-ops-closed-check-${check.id}`} className="cursor-pointer hover-elevate" onClick={() => handleViewCheck(check.id)}>
                        <TableCell className="font-medium">{check.checkNumber}</TableCell>
                        <TableCell>{check.employeeName}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(check.total)}</TableCell>
                        <TableCell className="text-right">{check.tipAmount > 0 ? <span className="text-green-600">{formatCurrency(check.tipAmount)}</span> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-right">{check.refundAmount > 0 ? <span className="text-destructive">-{formatCurrency(check.refundAmount)}</span> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-sm">{check.tenderName || "-"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(check.totalPaid)}</TableCell>
                        <TableCell className="text-right">{check.durationMinutes} min</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(check.closedAt)}</TableCell>
                      </TableRow>
                    ))}
                    {(!closedChecksData?.checks || closedChecksData.checks.length === 0) && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No closed checks</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground mt-2">Click on a check to view details</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== EMPLOYEE BALANCE ========== */}
          <TabsContent value="employee-balance" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Employees</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-employee-count">{employeeBalanceLoading ? "..." : employeeBalanceData?.summary.employeeCount || 0}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-employee-total-sales">{employeeBalanceLoading ? "..." : formatCurrency(employeeBalanceData?.summary.totalSales || 0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-employee-total-collected">{employeeBalanceLoading ? "..." : formatCurrency(employeeBalanceData?.summary.totalCollected || 0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Tips</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ops-employee-total-tips">{employeeBalanceLoading ? "..." : formatCurrency(employeeBalanceData?.summary.totalTips || 0)}</div></CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">Employee Balance</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Checks</TableHead>
                      <TableHead className="text-right">Gross Sales</TableHead>
                      <TableHead className="text-right">Discounts</TableHead>
                      <TableHead className="text-right">Net Sales</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Tips</TableHead>
                      <TableHead className="text-right">Cash</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Total Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(employeeBalanceData?.employees || []).map((emp) => (
                      <TableRow key={emp.employeeId} data-testid={`row-ops-employee-${emp.employeeId}`}>
                        <TableCell className="font-medium">{emp.employeeName}</TableCell>
                        <TableCell className="text-right">{emp.checkCount}</TableCell>
                        <TableCell className="text-right">{formatCurrency(emp.grossSales)}</TableCell>
                        <TableCell className="text-right text-destructive">{formatCurrency(emp.discounts)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(emp.netSales)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(emp.tax)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(emp.tips || 0)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(emp.cashCollected)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(emp.creditCollected)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(emp.totalCollected)}</TableCell>
                      </TableRow>
                    ))}
                    {(!employeeBalanceData?.employees || employeeBalanceData.employees.length === 0) && (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No employee data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== CLOCKED IN ========== */}
          <TabsContent value="clocked-in" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Clocked In</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-ops-total-clocked-in">{clockedInLoading ? "..." : clockedInData?.totalClockedIn || 0}</div>
                  <p className="text-xs text-muted-foreground">employees currently on shift</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Working</CardTitle>
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-ops-working-count">{clockedInLoading ? "..." : clockedInData?.working || 0}</div>
                  <p className="text-xs text-muted-foreground">actively working</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">On Break</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600" data-testid="text-ops-on-break-count">{clockedInLoading ? "..." : clockedInData?.onBreak || 0}</div>
                  <p className="text-xs text-muted-foreground">currently on break</p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Clocked In Employees
                </CardTitle>
              </CardHeader>
              <CardContent>
                {clockedInLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading...</div>
                ) : clockedInData?.employees && clockedInData.employees.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Clock In Time</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clockedInData.employees.map((emp) => {
                        const hours = Math.floor(emp.durationMinutes / 60);
                        const mins = emp.durationMinutes % 60;
                        const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                        return (
                          <TableRow key={emp.employeeId} data-testid={`row-ops-clocked-in-${emp.employeeId}`}>
                            <TableCell>
                              <div>
                                <span className="font-medium">{emp.employeeName}</span>
                                <span className="text-muted-foreground ml-2 text-xs">#{emp.employeeNumber}</span>
                              </div>
                            </TableCell>
                            <TableCell>{emp.jobName}</TableCell>
                            <TableCell>
                              {new Date(emp.clockInTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                            </TableCell>
                            <TableCell className="font-mono">{durationStr}</TableCell>
                            <TableCell>
                              {emp.isOnBreak ? (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">On Break</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Working</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">No employees currently clocked in</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Check Detail Dialog */}
        <Dialog open={checkModalOpen} onOpenChange={setCheckModalOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Check #{checkDetailData?.check.checkNumber || "..."}
                  <Badge variant={checkDetailData?.check.status === "open" ? "default" : "secondary"}>
                    {checkDetailData?.check.status || "..."}
                  </Badge>
                </div>
                {checkDetailData && (
                  <Button size="sm" variant="outline" onClick={() => handlePrintCheck(checkDetailData.check.id)} disabled={isPrinting} data-testid="button-ops-print-check">
                    <Printer className="h-4 w-4 mr-2" />{isPrinting ? "Printing..." : "Print"}
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2">
              {checkDetailLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading check details...</div>
              ) : checkDetailData ? (
                <ScrollArea className="max-h-[60vh]">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><p className="text-muted-foreground">Order Type</p><p className="font-medium">{checkDetailData.check.orderType || "Dine In"}</p></div>
                      <div><p className="text-muted-foreground">Table</p><p className="font-medium">{checkDetailData.check.tableNumber || "-"}</p></div>
                      <div><p className="text-muted-foreground">Opened</p><p className="font-medium">{formatDateTime(checkDetailData.check.openedAt || null)}</p></div>
                      {checkDetailData.check.closedAt && <div><p className="text-muted-foreground">Closed</p><p className="font-medium">{formatDateTime(checkDetailData.check.closedAt)}</p></div>}
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Items ({checkDetailData.items.filter((i: any) => !i.voided).length})</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {checkDetailData.items.filter((i: any) => !i.voided).map((item: any) => {
                            const unitPrice = parseFloat(item.unitPrice || "0");
                            const qty = item.quantity || 1;
                            const modifierTotal = item.modifiers?.reduce((sum: number, m: any) => sum + parseFloat(m.priceDelta || "0"), 0) || 0;
                            const extendedPrice = (unitPrice + modifierTotal) * qty;
                            return (
                              <TableRow key={item.id} data-testid={`row-ops-check-item-${item.id}`}>
                                <TableCell>
                                  <div>
                                    <span className="font-medium">{item.menuItemName}</span>
                                    {item.modifiers && item.modifiers.length > 0 && (
                                      <div className="text-xs text-muted-foreground mt-0.5">{item.modifiers.map((m: any) => m.name).join(", ")}</div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{qty}</TableCell>
                                <TableCell className="text-right">{formatCurrency(unitPrice)}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(extendedPrice)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(parseFloat(checkDetailData.check.subtotal || "0"))}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discounts</span><span className="text-destructive">-{formatCurrency(parseFloat(checkDetailData.check.discountTotal || "0"))}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(parseFloat(checkDetailData.check.taxTotal || "0"))}</span></div>
                        <div className="flex justify-between text-sm font-medium pt-1 border-t border-border/50"><span>Total</span><span>{formatCurrency(parseFloat(checkDetailData.check.total || "0"))}</span></div>
                      </div>
                      <div className="space-y-1">
                        {checkDetailData.check.tenderedAmount !== undefined && checkDetailData.check.tenderedAmount > 0 && (
                          <>
                            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tendered</span><span className="text-green-600 dark:text-green-400">{formatCurrency(checkDetailData.check.tenderedAmount)}</span></div>
                            {checkDetailData.payments && checkDetailData.payments.length > 0 && (
                              <div className="mt-1">
                                <span className="text-xs text-muted-foreground font-medium">Payments:</span>
                                {checkDetailData.payments.map((payment, index) => (
                                  <div key={payment.id} className="flex justify-between text-sm mt-1" data-testid={`ops-payment-row-${index}`}>
                                    <span className="text-muted-foreground">{payment.tenderName}</span>
                                    <span className="text-green-600 dark:text-green-400">
                                      {formatCurrency(parseFloat(payment.amount || "0"))}
                                      {payment.tipAmount && parseFloat(payment.tipAmount) > 0 && (
                                        <span className="text-xs ml-1">(+{formatCurrency(parseFloat(payment.tipAmount))} tip)</span>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {(checkDetailData.check.changeDue ?? 0) > 0 && (
                              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Change Due</span><span>{formatCurrency(checkDetailData.check.changeDue ?? 0)}</span></div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {checkDetailData.refunds && checkDetailData.refunds.length > 0 && (
                      <>
                        <Separator />
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                          <h4 className="font-medium text-destructive flex items-center gap-2"><RotateCcw className="h-4 w-4" />Refund History</h4>
                          {checkDetailData.refunds.map((refund) => (
                            <div key={refund.id} className="space-y-2 text-sm" data-testid={`ops-refund-entry-${refund.id}`}>
                              <div className="flex justify-between flex-wrap gap-1">
                                <span className="text-muted-foreground">{formatDateTime(refund.createdAt)} by {refund.refundedByName}</span>
                                <span className="font-medium text-destructive">-{formatCurrency(parseFloat(refund.total))}</span>
                              </div>
                              {refund.reason && <p className="text-xs text-muted-foreground">Reason: {refund.reason}</p>}
                              <div className="pl-2 space-y-0.5">
                                {refund.items.map((ri, idx) => (
                                  <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                    <span>{ri.quantity}x {ri.menuItemName}</span>
                                    <span>-{formatCurrency(parseFloat(ri.unitPrice) * ri.quantity + parseFloat(ri.taxAmount))}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <div className="py-8 text-center text-muted-foreground">Failed to load check details</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

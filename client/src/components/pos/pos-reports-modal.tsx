import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  DollarSign,
  Users,
  Receipt,
  CreditCard,
  UtensilsCrossed,
  TrendingUp,
  Clock,
  FileText,
  Calendar,
} from "lucide-react";

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDatePresetFromBase(preset: string, baseDate: string): { fromDate: string; toDate: string } {
  const [y, m, d] = baseDate.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  const toDate = baseDate;
  let fromDate = toDate;

  switch (preset) {
    case "today":
      fromDate = toDate;
      break;
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      fromDate = formatLocalDate(yesterday);
      break;
    }
    case "this-week": {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      fromDate = formatLocalDate(startOfWeek);
      break;
    }
    case "last-week": {
      const endOfLastWeek = new Date(today);
      endOfLastWeek.setDate(today.getDate() - today.getDay() - 1);
      const startOfLastWeek = new Date(endOfLastWeek);
      startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
      fromDate = formatLocalDate(startOfLastWeek);
      return { fromDate, toDate: formatLocalDate(endOfLastWeek) };
    }
    case "this-month": {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      fromDate = formatLocalDate(startOfMonth);
      break;
    }
    case "last-month": {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      fromDate = formatLocalDate(startOfLastMonth);
      return { fromDate, toDate: formatLocalDate(endOfLastMonth) };
    }
    case "this-quarter": {
      const quarter = Math.floor(today.getMonth() / 3);
      const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
      fromDate = formatLocalDate(startOfQuarter);
      break;
    }
    case "last-quarter": {
      const currentQuarter = Math.floor(today.getMonth() / 3);
      const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
      const lastQuarterYear = currentQuarter === 0 ? today.getFullYear() - 1 : today.getFullYear();
      const startOfLastQuarter = new Date(lastQuarterYear, lastQuarter * 3, 1);
      const endOfLastQuarter = new Date(lastQuarterYear, lastQuarter * 3 + 3, 0);
      fromDate = formatLocalDate(startOfLastQuarter);
      return { fromDate, toDate: formatLocalDate(endOfLastQuarter) };
    }
    case "this-year": {
      const startOfYear = new Date(today.getFullYear(), 0, 1);
      fromDate = formatLocalDate(startOfYear);
      break;
    }
    case "last-year": {
      const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
      const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31);
      fromDate = formatLocalDate(startOfLastYear);
      return { fromDate, toDate: formatLocalDate(endOfLastYear) };
    }
    default:
      break;
  }

  return { fromDate, toDate };
}

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This Week" },
  { value: "last-week", label: "Last Week" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "this-year", label: "This Year" },
  { value: "last-year", label: "Last Year" },
  { value: "custom", label: "Custom Range" },
];

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

interface POSReportsModalProps {
  open: boolean;
  onClose: () => void;
  rvcId: string;
  rvcName?: string;
  propertyId?: string;
}

interface SalesSummary {
  grossSales: number;
  netSales: number;
  netSalesAfterRefunds: number;
  grossSalesAfterRefunds: number;
  taxTotal: number;
  taxAfterRefunds: number;
  refundedTax: number;
  refundedSales: number;
  totalWithTax: number;
  totalPayments: number;
  totalTips: number;
  totalRefunds: number;
  refundCount: number;
  discountTotal: number;
  checksStarted: number;
  checksClosed: number;
  checksCancelled: number;
  checksOutstanding: number;
  avgCheck: number;
}

interface TenderBreakdown {
  name: string;
  count: number;
  amount: number;
}

interface EmployeeBalance {
  employeeId: string;
  employeeName: string;
  checkCount: number;
  itemCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  subtotal: number;
  tax: number;
  total: number;
  totalCollected: number;
  cashCollected: number;
  creditCollected: number;
  otherCollected: number;
  tips: number;
}

interface OpenCheck {
  id: string;
  checkNumber: number;
  total: string;
  tableNumber: string | null;
  openedAt: string | null;
  employeeName: string;
}

interface ClosedCheck {
  id: string;
  checkNumber: number;
  total: number;
  totalPaid: number;
  closedAt: string | null;
  employeeName: string;
  durationMinutes: number;
}

interface MenuItemSale {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  grossSales: number;
  netSales: number;
}

export function POSReportsModal({
  open,
  onClose,
  rvcId,
  rvcName,
  propertyId,
}: POSReportsModalProps) {
  const [datePreset, setDatePreset] = useState("today");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("rvc-balance");

  const { data: businessDateInfo } = useQuery<{ currentBusinessDate: string; localDate: string; timezone: string }>({
    queryKey: ["/api/properties", propertyId, "business-date"],
    queryFn: async () => {
      if (!propertyId) throw new Error("No property ID");
      const res = await failoverFetch(`/api/properties/${propertyId}/business-date`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch business date");
      return res.json();
    },
    enabled: open && !!propertyId,
  });

  const serverToday = businessDateInfo?.currentBusinessDate || null;

  useEffect(() => {
    if (serverToday && fromDate === null) {
      setFromDate(serverToday);
      setToDate(serverToday);
    }
  }, [serverToday, fromDate]);

  useEffect(() => {
    if (serverToday && datePreset === "today") {
      setFromDate(serverToday);
      setToDate(serverToday);
    }
  }, [serverToday]);

  useEffect(() => {
    if (!open) {
      setFromDate(null);
      setToDate(null);
      setDatePreset("today");
    }
  }, [open]);

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    if (preset !== "custom" && serverToday) {
      const { fromDate: from, toDate: to } = getDatePresetFromBase(preset, serverToday);
      setFromDate(from);
      setToDate(to);
    }
  };

  const businessDateReady = fromDate !== null && toDate !== null;
  const isSingleDay = fromDate === toDate;
  const dateQueryParams = isSingleDay
    ? `businessDate=${fromDate}`
    : `startDate=${fromDate}&endDate=${toDate}`;

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: [`/api/employees?rvcId=${rvcId}`],
    enabled: open,
  });

  const { data: salesSummary } = useQuery<SalesSummary>({
    queryKey: [`/api/reports/sales-summary?rvcId=${rvcId}&${dateQueryParams}`],
    enabled: open && !!rvcId && businessDateReady,
  });

  const { data: tenderBreakdown } = useQuery<TenderBreakdown[]>({
    queryKey: [`/api/reports/tender-mix?rvcId=${rvcId}&${dateQueryParams}`],
    enabled: open && !!rvcId && businessDateReady && activeTab === "tender",
  });

  const { data: employeeBalances } = useQuery<{ employees: EmployeeBalance[] }>({
    queryKey: [`/api/reports/employee-balance?rvcId=${rvcId}&${dateQueryParams}`],
    enabled: open && !!rvcId && businessDateReady && (activeTab === "employee-balance" || activeTab === "system-balance"),
  });

  const { data: openChecksData } = useQuery<{ checks: OpenCheck[] }>({
    queryKey: [`/api/reports/open-checks?rvcId=${rvcId}`],
    enabled: open && !!rvcId && activeTab === "open-checks",
  });

  const { data: closedChecksData } = useQuery<{ checks: ClosedCheck[] }>({
    queryKey: [`/api/reports/closed-checks?rvcId=${rvcId}&${dateQueryParams}`],
    enabled: open && !!rvcId && businessDateReady && activeTab === "closed-checks",
  });

  const { data: menuItemSales } = useQuery<{ items: MenuItemSale[] }>({
    queryKey: [`/api/reports/menu-item-sales?rvcId=${rvcId}&${dateQueryParams}`],
    enabled: open && !!rvcId && businessDateReady && activeTab === "menu-items",
  });

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const tz = businessDateInfo?.timezone || "America/New_York";
    return formatInTimeZone(new Date(dateStr), tz, "h:mm a");
  };

  const filteredEmployeeBalances = useMemo(() => {
    if (!employeeBalances?.employees) return [];
    if (selectedEmployeeId === "all") return employeeBalances.employees;
    return employeeBalances.employees.filter((e) => e.employeeId === selectedEmployeeId);
  }, [employeeBalances, selectedEmployeeId]);

  const systemTotals = useMemo(() => {
    if (!employeeBalances?.employees) return null;
    return employeeBalances.employees.reduce(
      (acc, emp) => ({
        checkCount: acc.checkCount + emp.checkCount,
        itemCount: acc.itemCount + emp.itemCount,
        subtotal: acc.subtotal + emp.subtotal,
        tax: acc.tax + emp.tax,
        total: acc.total + emp.total,
        totalCollected: acc.totalCollected + emp.totalCollected,
        cashCollected: acc.cashCollected + emp.cashCollected,
        creditCollected: acc.creditCollected + emp.creditCollected,
        otherCollected: acc.otherCollected + emp.otherCollected,
        tipTotal: acc.tipTotal + (emp.tips || 0),
      }),
      {
        checkCount: 0,
        itemCount: 0,
        subtotal: 0,
        tax: 0,
        total: 0,
        totalCollected: 0,
        cashCollected: 0,
        creditCollected: 0,
        otherCollected: 0,
        tipTotal: 0,
      }
    );
  }, [employeeBalances]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Reports - {rvcName || "RVC"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={datePreset} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-36" data-testid="select-date-preset">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="from-date" className="text-muted-foreground">From:</Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate || ""}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset("custom");
              }}
              className="w-36"
              data-testid="input-report-from-date"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="to-date" className="text-muted-foreground">To:</Label>
            <Input
              id="to-date"
              type="date"
              value={toDate || ""}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset("custom");
              }}
              className="w-36"
              data-testid="input-report-to-date"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-7 h-auto">
            <TabsTrigger value="rvc-balance" className="text-xs py-2">
              <DollarSign className="w-3 h-3 mr-1" />
              RVC Balance
            </TabsTrigger>
            <TabsTrigger value="system-balance" className="text-xs py-2">
              <TrendingUp className="w-3 h-3 mr-1" />
              System
            </TabsTrigger>
            <TabsTrigger value="employee-balance" className="text-xs py-2">
              <Users className="w-3 h-3 mr-1" />
              Employee
            </TabsTrigger>
            <TabsTrigger value="open-checks" className="text-xs py-2">
              <Clock className="w-3 h-3 mr-1" />
              Open Checks
            </TabsTrigger>
            <TabsTrigger value="closed-checks" className="text-xs py-2">
              <FileText className="w-3 h-3 mr-1" />
              Closed Checks
            </TabsTrigger>
            <TabsTrigger value="menu-items" className="text-xs py-2">
              <UtensilsCrossed className="w-3 h-3 mr-1" />
              Menu Items
            </TabsTrigger>
            <TabsTrigger value="tender" className="text-xs py-2">
              <CreditCard className="w-3 h-3 mr-1" />
              Tender
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            <TabsContent value="rvc-balance" className="mt-0">
              {salesSummary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Gross Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatPrice(salesSummary.grossSales)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Net Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {salesSummary.totalRefunds > 0
                          ? formatPrice(salesSummary.netSalesAfterRefunds)
                          : formatPrice(salesSummary.netSales)}
                      </div>
                      {salesSummary.totalRefunds > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatPrice(salesSummary.netSales)} - {formatPrice(salesSummary.refundedSales)} refunds
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Tax Collected</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {salesSummary.refundedTax > 0
                          ? formatPrice(salesSummary.taxAfterRefunds)
                          : formatPrice(salesSummary.taxTotal)}
                      </div>
                      {salesSummary.refundedTax > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatPrice(salesSummary.taxTotal)} - {formatPrice(salesSummary.refundedTax)} refunded
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Total Payments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">{formatPrice(salesSummary.totalPayments)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Checks Started</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{salesSummary.checksStarted}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Checks Closed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{salesSummary.checksClosed}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Cancelled</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${(salesSummary.checksCancelled || 0) > 0 ? "text-red-600" : ""}`} data-testid="text-checks-cancelled">{salesSummary.checksCancelled || 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-600" data-testid="text-checks-outstanding">{salesSummary.checksOutstanding}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Avg Check</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatPrice(salesSummary.avgCheck)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Tips</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatPrice(salesSummary.totalTips)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Discounts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">{formatPrice(salesSummary.discountTotal)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Refunds</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-destructive" data-testid="text-refund-total">
                        {salesSummary.refundCount > 0 ? `-${formatPrice(salesSummary.totalRefunds)}` : formatPrice(0)}
                      </div>
                      {salesSummary.refundCount > 0 && (
                        <div className="text-xs text-muted-foreground mt-1" data-testid="text-refund-count">
                          {salesSummary.refundCount} refund{salesSummary.refundCount !== 1 ? 's' : ''}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">Loading...</div>
              )}
            </TabsContent>

            <TabsContent value="system-balance" className="mt-0">
              {systemTotals ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Total Checks</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{systemTotals.checkCount}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Total Items</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{systemTotals.itemCount}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Sales Total</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{formatPrice(systemTotals.total)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Collected</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">{formatPrice(systemTotals.totalCollected)}</div>
                      </CardContent>
                    </Card>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Cash</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">{formatPrice(systemTotals.cashCollected)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Credit</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">{formatPrice(systemTotals.creditCollected)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Tips</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">{formatPrice(systemTotals.tipTotal)}</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">Loading...</div>
              )}
            </TabsContent>

            <TabsContent value="employee-balance" className="mt-0">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Label>Employee:</Label>
                  <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                    <SelectTrigger className="w-48" data-testid="select-employee-filter">
                      <SelectValue placeholder="All Employees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  {filteredEmployeeBalances.map((emp) => (
                    <Card key={emp.employeeId}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span>{emp.employeeName}</span>
                          <Badge variant="secondary">{emp.checkCount} checks</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Sales</div>
                            <div className="font-semibold">{formatPrice(emp.total)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Collected</div>
                            <div className="font-semibold text-green-600">{formatPrice(emp.totalCollected)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Cash</div>
                            <div className="font-semibold">{formatPrice(emp.cashCollected)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Tips</div>
                            <div className="font-semibold">{formatPrice(emp.tips || 0)}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="open-checks" className="mt-0">
              <div className="space-y-2">
                {openChecksData?.checks && openChecksData.checks.length > 0 ? (
                  openChecksData.checks.map((check) => (
                    <Card key={check.id}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <span className="font-bold text-amber-700 dark:text-amber-300">#{check.checkNumber}</span>
                          </div>
                          <div>
                            <div className="font-medium">
                              Check #{check.checkNumber}
                              {check.tableNumber && (
                                <span className="text-muted-foreground ml-2">Table {check.tableNumber}</span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {check.employeeName} • Opened {formatTime(check.openedAt)}
                            </div>
                          </div>
                        </div>
                        <div className="text-lg font-bold">{formatPrice(parseFloat(check.total))}</div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No open checks</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="closed-checks" className="mt-0">
              <div className="space-y-2">
                {closedChecksData?.checks && closedChecksData.checks.length > 0 ? (
                  closedChecksData.checks.map((check) => (
                    <Card key={check.id}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <span className="font-bold text-green-700 dark:text-green-300">#{check.checkNumber}</span>
                          </div>
                          <div>
                            <div className="font-medium">Check #{check.checkNumber}</div>
                            <div className="text-sm text-muted-foreground">
                              {check.employeeName} • Closed {formatTime(check.closedAt)} • {check.durationMinutes}min
                            </div>
                          </div>
                        </div>
                        <div className="text-lg font-bold text-green-600">{formatPrice(check.totalPaid)}</div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No closed checks for this date</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="menu-items" className="mt-0">
              <div className="space-y-2">
                {menuItemSales?.items && menuItemSales.items.length > 0 ? (
                  menuItemSales.items.map((item, idx) => (
                    <Card key={item.menuItemId || idx}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="w-10 h-10 flex items-center justify-center rounded-full">
                            {item.quantity}
                          </Badge>
                          <div>
                            <div className="font-medium">{item.menuItemName}</div>
                            <div className="text-sm text-muted-foreground">
                              {item.quantity} sold
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{formatPrice(item.netSales)}</div>
                          <div className="text-sm text-muted-foreground">gross: {formatPrice(item.grossSales)}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No menu item sales for this date</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tender" className="mt-0">
              <div className="space-y-4">
                {tenderBreakdown && tenderBreakdown.length > 0 ? (
                  tenderBreakdown.map((tender) => (
                    <Card key={tender.name}>
                      <CardContent className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CreditCard className="w-6 h-6 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{tender.name}</div>
                            <div className="text-sm text-muted-foreground">{tender.count} transactions</div>
                          </div>
                        </div>
                        <div className="text-xl font-bold text-green-600">{formatPrice(tender.amount)}</div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No tender data for this date</div>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-close-reports">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

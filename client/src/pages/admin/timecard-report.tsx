import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { CalendarIcon, DollarSign, AlertTriangle, Download, Users } from "lucide-react";
import { getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import type { Property } from "@shared/schema";

interface TimecardEmployee {
  employeeId: string;
  firstName: string;
  lastName: string;
  scheduledHours: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  paidHours: number;
  laborCost: number;
  transactionTips: number;
  declaredCashTips: number;
  tippedWage: number;
  alerts: string[];
}

interface TimecardReport {
  startDate: string;
  endDate: string;
  tipRule: {
    distributionMethod: string;
    timeFrame: string;
  } | null;
  summary: {
    regularHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    paidHours: number;
    transactionTips: number;
    declaredCashTips: number;
    totalLaborCost: number;
  };
  employees: TimecardEmployee[];
}

export default function TimecardReportPage() {
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => {
    const now = new Date();
    return {
      from: startOfWeek(subWeeks(now, 0), { weekStartsOn: 0 }),
      to: endOfWeek(subWeeks(now, 0), { weekStartsOn: 0 }),
    };
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const startDateStr = format(dateRange.from, "yyyy-MM-dd");
  const endDateStr = format(dateRange.to, "yyyy-MM-dd");

  const { data: report, isLoading } = useQuery<TimecardReport>({
    queryKey: ["/api/reports/timecard", selectedPropertyId, startDateStr, endDateStr, filterKeys],
    enabled: !!selectedPropertyId,
    queryFn: async () => {
      const authHeaders = getAuthHeaders();
      const entParam = selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : "";
      const res = await failoverFetch(
        `/api/reports/timecard?propertyId=${selectedPropertyId}&startDate=${startDateStr}&endDate=${endDateStr}${entParam}`,
        { 
          credentials: "include",
          headers: authHeaders,
        }
      );
      if (!res.ok) throw new Error("Failed to fetch timecard report");
      return res.json();
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatHours = (hours: number) => {
    return hours.toFixed(2);
  };

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-timecard-report-title">
            Timecard Report
          </h1>
          <p className="text-muted-foreground" data-testid="text-timecard-report-subtitle">
            View team hours, tips, and labor costs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled data-testid="button-export-timecard">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-[260px] justify-start" data-testid="button-date-range">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                if (range?.from) {
                  setDateRange({ 
                    from: range.from, 
                    to: range.to || range.from 
                  });
                }
              }}
              numberOfMonths={2}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
          <SelectTrigger className="w-[200px]" data-testid="select-property">
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="text-sm text-muted-foreground">
          View By: First Last
        </div>
      </div>

      {!selectedPropertyId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            Select a location to view timecard data
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold tabular-nums">
                  {formatHours(report.summary.regularHours)}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Regular Hours
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold tabular-nums">
                  {formatHours(report.summary.overtimeHours)}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Overtime Hours
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold tabular-nums">
                  {formatHours(report.summary.doubleTimeHours)}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Doubletime Hours
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold tabular-nums">
                  {formatHours(report.summary.paidHours)}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Paid Hours
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(report.summary.transactionTips)}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Transaction Tips
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(report.summary.declaredCashTips)}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Declared Cash Tips
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(report.summary.totalLaborCost)}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total Labor Cost
                </div>
              </CardContent>
            </Card>
          </div>

          {report.tipRule && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Tips distributed using:{" "}
              <Badge variant="outline">
                {report.tipRule.distributionMethod.replace(/_/g, " ")}
              </Badge>
              <span className="text-muted-foreground">
                ({report.tipRule.timeFrame})
              </span>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>All team members: {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {report.employees.length} team members
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background">Name</TableHead>
                      <TableHead className="text-right">Scheduled hours</TableHead>
                      <TableHead className="text-right">Regular hours</TableHead>
                      <TableHead className="text-right">Overtime</TableHead>
                      <TableHead className="text-right">Doubletime</TableHead>
                      <TableHead className="text-right">Paid hours</TableHead>
                      <TableHead className="text-right">Transaction tips</TableHead>
                      <TableHead className="text-right">Declared cash tips</TableHead>
                      <TableHead className="text-right">Tipped wage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.employees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No timecard data for this period
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.employees.map((emp) => (
                        <TableRow key={emp.employeeId} data-testid={`row-employee-${emp.employeeId}`}>
                          <TableCell className="sticky left-0 bg-background">
                            <div className="flex items-center gap-2">
                              {emp.alerts.length > 0 && (
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                              )}
                              <div>
                                <div className="font-medium">
                                  {emp.firstName} {emp.lastName}
                                </div>
                                {emp.alerts.length > 0 && (
                                  <div className="text-xs text-destructive flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    {emp.alerts.length} alert{emp.alerts.length > 1 ? "s" : ""}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`cell-scheduled-hours-${emp.employeeId}`}>
                            {formatHours(emp.scheduledHours)} hrs
                          </TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`cell-regular-hours-${emp.employeeId}`}>
                            {formatHours(emp.regularHours)} hrs
                          </TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`cell-overtime-hours-${emp.employeeId}`}>
                            {formatHours(emp.overtimeHours)} hrs
                          </TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`cell-doubletime-hours-${emp.employeeId}`}>
                            {formatHours(emp.doubleTimeHours)} hrs
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium" data-testid={`cell-paid-hours-${emp.employeeId}`}>
                            {formatHours(emp.paidHours)} hrs
                          </TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`cell-transaction-tips-${emp.employeeId}`}>
                            {formatCurrency(emp.transactionTips)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`cell-cash-tips-${emp.employeeId}`}>
                            {formatCurrency(emp.declaredCashTips)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`cell-tipped-wage-${emp.employeeId}`}>
                            {emp.paidHours > 0 ? `${formatCurrency(emp.tippedWage)}/hr` : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

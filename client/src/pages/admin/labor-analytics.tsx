import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, subDays } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Users,
  AlertTriangle,
  BarChart3,
  PieChart,
} from "lucide-react";
import type { Property, Employee } from "@shared/schema";

interface LaborVsSalesReport {
  propertyId: string;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalLaborCost: number;
  totalLaborHours: number;
  totalLiveHours: number;
  totalLiveCost: number;
  laborCostPercentage: number;
  activeClockedInCount: number;
  dailyBreakdown: Array<{
    businessDate: string;
    sales: number;
    laborCost: number;
    laborHours: number;
    liveHours: number;
    liveCost: number;
    laborPercentage: number;
  }>;
}

interface OvertimeReport {
  propertyId: string;
  startDate: string;
  endDate: string;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalDoubleTimeHours: number;
  employeesWithOvertime: Array<{
    employeeId: string;
    regularHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
  }>;
}

interface TipsReport {
  propertyId: string;
  startDate: string;
  endDate: string;
  totalTips: number;
  runCount: number;
  dailyBreakdown: Array<{
    businessDate: string;
    totalTips: number;
    status: string;
  }>;
  employeeTotals: Record<string, number>;
}

export default function LaborAnalyticsPage() {
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedProperty, setSelectedProperty] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId && !selectedProperty) {
      setSelectedProperty(contextPropertyId);
    }
  }, [contextPropertyId, selectedProperty]);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/employees${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json();
    },
  });

  const { data: laborReport, isLoading: laborLoading } = useQuery<LaborVsSalesReport>({
    queryKey: ["/api/reports/labor-vs-sales", { propertyId: selectedProperty, startDate, endDate, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/reports/labor-vs-sales?propertyId=${selectedProperty}&startDate=${startDate}&endDate=${endDate}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch labor report");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  const { data: overtimeReport, isLoading: overtimeLoading } = useQuery<OvertimeReport>({
    queryKey: ["/api/reports/overtime", { propertyId: selectedProperty, startDate, endDate, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/reports/overtime?propertyId=${selectedProperty}&startDate=${startDate}&endDate=${endDate}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch overtime report");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  const { data: tipsReport, isLoading: tipsLoading } = useQuery<TipsReport>({
    queryKey: ["/api/reports/tips", { propertyId: selectedProperty, startDate, endDate, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/reports/tips?propertyId=${selectedProperty}&startDate=${startDate}&endDate=${endDate}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch tips report");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null) return "$0.00";
    return `$${amount.toFixed(2)}`;
  };

  const formatPercentage = (value: number | null | undefined) => {
    if (value == null) return "0.0%";
    return `${value.toFixed(1)}%`;
  };

  const laborTarget = 30; // Target labor cost percentage

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-labor-analytics-title">Labor Analytics</h1>
        <p className="text-muted-foreground">Labor costs, overtime tracking, and tips analysis</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 max-w-xs">
          <select
            className="w-full p-2 border rounded-md bg-background"
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            data-testid="select-property"
          >
            <option value="">Select a property...</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-auto"
            data-testid="input-start-date"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-auto"
            data-testid="input-end-date"
          />
        </div>
      </div>

      {!selectedProperty ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select a property to view analytics
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="labor">
          <TabsList>
            <TabsTrigger value="labor" data-testid="tab-labor">
              <BarChart3 className="w-4 h-4 mr-2" />
              Labor vs Sales
            </TabsTrigger>
            <TabsTrigger value="overtime" data-testid="tab-overtime">
              <Clock className="w-4 h-4 mr-2" />
              Overtime
            </TabsTrigger>
            <TabsTrigger value="tips" data-testid="tab-tips">
              <DollarSign className="w-4 h-4 mr-2" />
              Tips
            </TabsTrigger>
          </TabsList>

          <TabsContent value="labor" className="space-y-6">
            {laborLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : laborReport ? (
              <>
                {laborReport.activeClockedInCount > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Users className="w-5 h-5 text-blue-500" />
                    <span className="text-sm font-medium">
                      {laborReport.activeClockedInCount} employee{laborReport.activeClockedInCount > 1 ? "s" : ""} currently clocked in
                    </span>
                    <Badge variant="secondary" className="ml-auto">
                      Live: {laborReport.totalLiveHours.toFixed(1)} hrs / {formatCurrency(laborReport.totalLiveCost)}
                    </Badge>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Sales
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-total-sales">
                        {formatCurrency(laborReport.totalSales)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        Labor Cost
                        {laborReport.totalLiveCost > 0 && (
                          <Badge variant="outline" className="text-xs">includes live</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-labor-cost">
                        {formatCurrency(laborReport.totalLaborCost)}
                      </div>
                      {laborReport.totalLiveCost > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Live: {formatCurrency(laborReport.totalLiveCost)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        Labor Hours
                        {laborReport.totalLiveHours > 0 && (
                          <Badge variant="outline" className="text-xs">includes live</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-labor-hours">
                        {laborReport.totalLaborHours.toFixed(1)}
                      </div>
                      {laborReport.totalLiveHours > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Live: {laborReport.totalLiveHours.toFixed(1)} hrs
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className={laborReport.laborCostPercentage > laborTarget ? "border-destructive" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        Labor %
                        {laborReport.laborCostPercentage > laborTarget && (
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-2xl font-bold ${
                            laborReport.laborCostPercentage > laborTarget ? "text-destructive" : ""
                          }`}
                          data-testid="text-labor-percentage"
                        >
                          {formatPercentage(laborReport.laborCostPercentage)}
                        </span>
                        {laborReport.laborCostPercentage <= laborTarget ? (
                          <TrendingDown className="w-5 h-5 text-green-500" />
                        ) : (
                          <TrendingUp className="w-5 h-5 text-destructive" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Target: {laborTarget}%</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Daily Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Sales</TableHead>
                          <TableHead>Labor Cost</TableHead>
                          <TableHead>Hours</TableHead>
                          <TableHead>Labor %</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {laborReport.dailyBreakdown.map((day) => (
                          <TableRow key={day.businessDate}>
                            <TableCell className="font-medium">{day.businessDate}</TableCell>
                            <TableCell className="tabular-nums">{formatCurrency(day.sales)}</TableCell>
                            <TableCell className="tabular-nums">
                              {formatCurrency(day.laborCost)}
                              {day.liveCost > 0 && (
                                <span className="text-xs text-muted-foreground block">
                                  (live: {formatCurrency(day.liveCost)})
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {day.laborHours.toFixed(1)}
                              {day.liveHours > 0 && (
                                <span className="text-xs text-muted-foreground block">
                                  (live: {day.liveHours.toFixed(1)})
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={day.laborPercentage > laborTarget ? "destructive" : "default"}
                              >
                                {formatPercentage(day.laborPercentage)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {day.liveHours > 0 ? (
                                <Badge variant="outline" className="text-blue-500 border-blue-500/50">
                                  <Clock className="w-3 h-3 mr-1" />
                                  Live
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Finalized</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No labor data available for this period
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="overtime" className="space-y-6">
            {overtimeLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : overtimeReport ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Regular Hours
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-regular-hours">
                        {overtimeReport.totalRegularHours.toFixed(1)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className={overtimeReport.totalOvertimeHours > 0 ? "border-amber-500" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        Overtime Hours
                        {overtimeReport.totalOvertimeHours > 0 && (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-600" data-testid="text-overtime-hours">
                        {overtimeReport.totalOvertimeHours.toFixed(1)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className={overtimeReport.totalDoubleTimeHours > 0 ? "border-destructive" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Double Time
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-destructive" data-testid="text-double-time">
                        {overtimeReport.totalDoubleTimeHours.toFixed(1)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {overtimeReport.employeesWithOvertime.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Employees with Overtime
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Regular</TableHead>
                            <TableHead>Overtime</TableHead>
                            <TableHead>Double Time</TableHead>
                            <TableHead>Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overtimeReport.employeesWithOvertime.map((emp) => (
                            <TableRow key={emp.employeeId}>
                              <TableCell className="font-medium">
                                {getEmployeeName(emp.employeeId)}
                              </TableCell>
                              <TableCell className="tabular-nums">{emp.regularHours.toFixed(1)}</TableCell>
                              <TableCell className="tabular-nums text-amber-600">{emp.overtimeHours.toFixed(1)}</TableCell>
                              <TableCell className="tabular-nums text-destructive">{emp.doubleTimeHours.toFixed(1)}</TableCell>
                              <TableCell className="tabular-nums font-semibold">
                                {(emp.regularHours + emp.overtimeHours + emp.doubleTimeHours).toFixed(1)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No overtime recorded for this period
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No overtime data available for this period
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="tips" className="space-y-6">
            {tipsLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : tipsReport ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Tips Distributed
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-total-tips">
                        {formatCurrency(tipsReport.totalTips)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Settlement Runs
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-run-count">
                        {tipsReport.runCount}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {Object.keys(tipsReport.employeeTotals).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChart className="w-5 h-5" />
                        Tips by Employee
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Total Tips</TableHead>
                            <TableHead>% of Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(tipsReport.employeeTotals)
                            .sort(([, a], [, b]) => b - a)
                            .map(([empId, total]) => (
                              <TableRow key={empId}>
                                <TableCell className="font-medium">
                                  {getEmployeeName(empId)}
                                </TableCell>
                                <TableCell className="tabular-nums font-semibold">
                                  {formatCurrency(total)}
                                </TableCell>
                                <TableCell className="tabular-nums">
                                  {formatPercentage((total / tipsReport.totalTips) * 100)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No tips data available for this period
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Coffee,
  Clock,
  DollarSign,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import type { Property, Employee, BreakViolation, BreakRule } from "@shared/schema";

interface ViolationSummary {
  employeeId: string;
  employeeName: string;
  mealViolations: number;
  restViolations: number;
  totalPremiumHours: number;
  totalPremiumPay: number;
  violations: BreakViolation[];
}

export default function BreakViolationsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedProperty, setSelectedProperty] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedProperty(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [dateRange, setDateRange] = useState<"this_week" | "last_week" | "custom">("this_week");
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date()), "yyyy-MM-dd"));
  const [showExportDialog, setShowExportDialog] = useState(false);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: breakRules = [] } = useQuery<BreakRule[]>({
    queryKey: ["/api/break-rules?propertyId=" + selectedProperty],
    enabled: !!selectedProperty,
  });

  const { data: violations = [], isLoading } = useQuery<BreakViolation[]>({
    queryKey: [`/api/break-violations?propertyId=${selectedProperty}&startDate=${startDate}&endDate=${endDate}`],
    enabled: !!selectedProperty,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees?propertyId=" + selectedProperty],
    enabled: !!selectedProperty,
  });

  const activeRule = breakRules.find(r => r.active) || null;

  const handleDateRangeChange = (range: "this_week" | "last_week" | "custom") => {
    setDateRange(range);
    const now = new Date();
    if (range === "this_week") {
      setStartDate(format(startOfWeek(now), "yyyy-MM-dd"));
      setEndDate(format(endOfWeek(now), "yyyy-MM-dd"));
    } else if (range === "last_week") {
      const lastWeek = subWeeks(now, 1);
      setStartDate(format(startOfWeek(lastWeek), "yyyy-MM-dd"));
      setEndDate(format(endOfWeek(lastWeek), "yyyy-MM-dd"));
    }
  };

  const summaries: ViolationSummary[] = [];
  const employeeViolations = new Map<string, BreakViolation[]>();

  violations.forEach(v => {
    const list = employeeViolations.get(v.employeeId) || [];
    list.push(v);
    employeeViolations.set(v.employeeId, list);
  });

  employeeViolations.forEach((vList, employeeId) => {
    const employee = employees.find(e => e.id === employeeId);
    const mealViolations = vList.filter(v => v.violationType === "meal_break").length;
    const restViolations = vList.filter(v => v.violationType === "rest_break").length;
    
    const mealPremium = parseFloat(activeRule?.mealBreakPremiumHours || "1");
    const restPremium = parseFloat(activeRule?.restBreakPremiumHours || "1");
    const totalPremiumHours = (mealViolations * mealPremium) + (restViolations * restPremium);
    
    const hourlyRate = (employee as any)?.hourlyRate ? parseFloat((employee as any).hourlyRate) : 15.00;
    const totalPremiumPay = totalPremiumHours * hourlyRate;

    summaries.push({
      employeeId,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : "Unknown",
      mealViolations,
      restViolations,
      totalPremiumHours,
      totalPremiumPay,
      violations: vList,
    });
  });

  const totals = summaries.reduce((acc, s) => ({
    mealViolations: acc.mealViolations + s.mealViolations,
    restViolations: acc.restViolations + s.restViolations,
    premiumHours: acc.premiumHours + s.totalPremiumHours,
    premiumPay: acc.premiumPay + s.totalPremiumPay,
  }), { mealViolations: 0, restViolations: 0, premiumHours: 0, premiumPay: 0 });

  const handleExport = () => {
    const csv = [
      "Employee,Meal Violations,Rest Violations,Premium Hours,Premium Pay",
      ...summaries.map(s => 
        `"${s.employeeName}",${s.mealViolations},${s.restViolations},${s.totalPremiumHours.toFixed(2)},${s.totalPremiumPay.toFixed(2)}`
      ),
      `"TOTAL",${totals.mealViolations},${totals.restViolations},${totals.premiumHours.toFixed(2)},${totals.premiumPay.toFixed(2)}`,
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `break-violations-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: "Export Complete", description: "Break violations report exported to CSV." });
    setShowExportDialog(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Break Violations Report</h1>
          <p className="text-muted-foreground">
            View break violations and premium pay calculations for payroll
          </p>
        </div>
        {selectedProperty && summaries.length > 0 && (
          <Button onClick={() => setShowExportDialog(true)} data-testid="button-export">
            <Download className="w-4 h-4 mr-2" />
            Export for Payroll
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Violation Summary
          </CardTitle>
          <CardDescription>
            Review break violations and calculate premium pay owed to employees
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1">
              <Label>Property</Label>
              <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                <SelectTrigger className="w-[250px]" data-testid="select-property">
                  <SelectValue placeholder="Select property..." />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Date Range</Label>
              <Select value={dateRange} onValueChange={(v: any) => handleDateRangeChange(v)}>
                <SelectTrigger className="w-[180px]" data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRange === "custom" && (
              <>
                <div className="space-y-1">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-[150px]"
                    data-testid="input-start-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-[150px]"
                    data-testid="input-end-date"
                  />
                </div>
              </>
            )}
          </div>

          {!selectedProperty && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-5 h-5 mr-2" />
              Select a property to view break violations
            </div>
          )}

          {selectedProperty && isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {selectedProperty && !isLoading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Coffee className="w-8 h-8 mx-auto mb-2 text-orange-600" />
                    <div className="text-2xl font-bold">{totals.mealViolations}</div>
                    <div className="text-sm text-muted-foreground">Meal Violations</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                    <div className="text-2xl font-bold">{totals.restViolations}</div>
                    <div className="text-sm text-muted-foreground">Rest Violations</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-600" />
                    <div className="text-2xl font-bold">{totals.premiumHours.toFixed(1)}</div>
                    <div className="text-sm text-muted-foreground">Premium Hours</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    <div className="text-2xl font-bold">${totals.premiumPay.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Premium Pay Owed</div>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              {summaries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mb-4 text-green-600 opacity-50" />
                  <p className="text-lg font-medium">No Violations Found</p>
                  <p className="text-sm">No break violations recorded for the selected period.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-center">Meal Violations</TableHead>
                      <TableHead className="text-center">Rest Violations</TableHead>
                      <TableHead className="text-center">Premium Hours</TableHead>
                      <TableHead className="text-right">Premium Pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaries.map((summary) => (
                      <TableRow key={summary.employeeId} data-testid={`row-employee-${summary.employeeId}`}>
                        <TableCell className="font-medium">{summary.employeeName}</TableCell>
                        <TableCell className="text-center">
                          {summary.mealViolations > 0 ? (
                            <Badge variant="destructive">{summary.mealViolations}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {summary.restViolations > 0 ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                              {summary.restViolations}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{summary.totalPremiumHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${summary.totalPremiumPay.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-center">{totals.mealViolations}</TableCell>
                      <TableCell className="text-center">{totals.restViolations}</TableCell>
                      <TableCell className="text-center">{totals.premiumHours.toFixed(1)}</TableCell>
                      <TableCell className="text-right">${totals.premiumPay.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {activeRule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Premium Pay Rates ({activeRule.stateCode})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-semibold">Meal Break Violation</h4>
                <p className="text-muted-foreground">
                  {activeRule.mealBreakPremiumHours} hour(s) of pay per missed meal break
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Rest Break Violation</h4>
                <p className="text-muted-foreground">
                  {activeRule.restBreakPremiumHours} hour(s) of pay per missed rest break
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Export Break Violations</DialogTitle>
            <DialogDescription>
              Export break violations report for payroll processing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Date Range:</span>
                  <span className="font-medium">{startDate} to {endDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Employees with Violations:</span>
                  <span className="font-medium">{summaries.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Premium Pay:</span>
                  <span className="font-medium text-green-600">${totals.premiumPay.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} data-testid="button-confirm-export">
              <Download className="w-4 h-4 mr-2" />
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  AlertCircle,
  AlertTriangle,
  Coffee,
  Clock,
  CheckCircle2,
  Bell,
  Users,
  RefreshCw,
  Timer,
  XCircle,
} from "lucide-react";
import { format, differenceInMinutes, addMinutes } from "date-fns";
import type { Property, Employee, TimePunch, BreakRule } from "@shared/schema";

interface BreakStatus {
  employee: Employee;
  clockInTime: Date;
  minutesWorked: number;
  mealBreakRequired: boolean;
  mealBreakTaken: boolean;
  mealBreakDeadline: Date | null;
  minutesToMealDeadline: number | null;
  restBreaksRequired: number;
  restBreaksTaken: number;
  status: "ok" | "warning" | "critical" | "violation";
  alerts: string[];
}

function calculateBreakStatus(
  employee: Employee,
  timePunch: TimePunch,
  breakRule: BreakRule | null
): BreakStatus {
  const now = new Date();
  const clockInTime = new Date(timePunch.actualTimestamp);
  const minutesWorked = differenceInMinutes(now, clockInTime);
  const hoursWorked = minutesWorked / 60;

  const mealThresholdMinutes = parseFloat(breakRule?.mealBreakThresholdHours || "5") * 60;
  const restIntervalMinutes = parseFloat(breakRule?.restBreakIntervalHours || "4") * 60;

  const mealBreakRequired = minutesWorked >= mealThresholdMinutes - 30;
  const mealBreakDeadline = mealBreakRequired ? addMinutes(clockInTime, mealThresholdMinutes) : null;
  const minutesToMealDeadline = mealBreakDeadline ? differenceInMinutes(mealBreakDeadline, now) : null;

  const restBreaksRequired = Math.floor(hoursWorked / 4);

  const mealBreaksTaken = (timePunch as any).breakStart1 && (timePunch as any).breakEnd1 ? 1 : 0;
  const restBreaksTaken = 0;

  const alerts: string[] = [];
  let status: "ok" | "warning" | "critical" | "violation" = "ok";

  if (breakRule?.enableMealBreakEnforcement) {
    if (minutesToMealDeadline !== null) {
      if (minutesToMealDeadline < 0 && mealBreaksTaken === 0) {
        status = "violation";
        alerts.push(`Meal break deadline passed ${Math.abs(minutesToMealDeadline)} minutes ago`);
      } else if (minutesToMealDeadline <= (breakRule?.alertMinutesBeforeDeadline || 15)) {
        status = "critical";
        alerts.push(`Meal break deadline in ${minutesToMealDeadline} minutes`);
      } else if (minutesToMealDeadline <= 30) {
        status = "warning";
        alerts.push(`Meal break due soon (${minutesToMealDeadline} min)`);
      }
    }
  }

  if (breakRule?.enableRestBreakEnforcement) {
    const restBreaksMissed = restBreaksRequired - restBreaksTaken;
    if (restBreaksMissed > 0) {
      if (status === "ok") status = "warning";
      alerts.push(`${restBreaksMissed} rest break(s) not recorded`);
    }
  }

  return {
    employee,
    clockInTime,
    minutesWorked,
    mealBreakRequired,
    mealBreakTaken: mealBreaksTaken > 0,
    mealBreakDeadline,
    minutesToMealDeadline,
    restBreaksRequired,
    restBreaksTaken,
    status,
    alerts,
  };
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function StatusBadge({ status }: { status: BreakStatus["status"] }) {
  switch (status) {
    case "ok":
      return (
        <Badge variant="outline" className="text-green-600 border-green-600">
          <CheckCircle2 className="w-3 h-3 mr-1" /> On Track
        </Badge>
      );
    case "warning":
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
          <AlertTriangle className="w-3 h-3 mr-1" /> Warning
        </Badge>
      );
    case "critical":
      return (
        <Badge variant="destructive">
          <Bell className="w-3 h-3 mr-1" /> Action Needed
        </Badge>
      );
    case "violation":
      return (
        <Badge variant="destructive" className="bg-red-700">
          <XCircle className="w-3 h-3 mr-1" /> Violation
        </Badge>
      );
  }
}

export default function BreakMonitoringPage() {
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedProperty, setSelectedProperty] = useState<string>(contextPropertyId || "");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedProperty(contextPropertyId);
    }
  }, [contextPropertyId]);

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

  const { data: activeTimePunches = [], isLoading } = useQuery<TimePunch[]>({
    queryKey: ["/api/time-punches/active?propertyId=" + selectedProperty, refreshKey],
    enabled: !!selectedProperty,
    refetchInterval: 60000,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees?propertyId=" + selectedProperty],
    enabled: !!selectedProperty,
  });

  const activeBreakRule = breakRules.find(r => r.active) || null;

  const breakStatuses: BreakStatus[] = activeTimePunches.map((punch) => {
    const employee = employees.find((e) => e.id === punch.employeeId);
    if (!employee) return null;
    return calculateBreakStatus(employee, punch, activeBreakRule);
  }).filter(Boolean) as BreakStatus[];

  const sortedStatuses = breakStatuses.sort((a, b) => {
    const statusOrder = { violation: 0, critical: 1, warning: 2, ok: 3 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  const counts = {
    total: breakStatuses.length,
    ok: breakStatuses.filter(s => s.status === "ok").length,
    warning: breakStatuses.filter(s => s.status === "warning").length,
    critical: breakStatuses.filter(s => s.status === "critical").length,
    violation: breakStatuses.filter(s => s.status === "violation").length,
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Break Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of employee breaks for labor compliance
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setRefreshKey(k => k + 1)}
          data-testid="button-refresh"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="w-5 h-5" />
            Active Shift Monitoring
          </CardTitle>
          <CardDescription>
            Monitor employees currently on shift and their break compliance status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger className="w-[300px]" data-testid="select-property">
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

            {activeBreakRule && (
              <Badge variant="outline">
                <Coffee className="w-3 h-3 mr-1" />
                {activeBreakRule.stateCode} Break Rules Active
              </Badge>
            )}
          </div>

          {!selectedProperty && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-5 h-5 mr-2" />
              Select a property to view break monitoring
            </div>
          )}

          {selectedProperty && !activeBreakRule && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No Break Rules Configured</p>
              <p className="text-sm">Configure break rules in Staff → Break Rules to enable monitoring.</p>
            </div>
          )}

          {selectedProperty && activeBreakRule && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-2xl font-bold">{counts.total}</div>
                    <div className="text-sm text-muted-foreground">Active Shifts</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    <div className="text-2xl font-bold text-green-600">{counts.ok}</div>
                    <div className="text-sm text-muted-foreground">On Track</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                    <div className="text-2xl font-bold text-yellow-600">{counts.warning}</div>
                    <div className="text-sm text-muted-foreground">Warning</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Bell className="w-8 h-8 mx-auto mb-2 text-orange-600" />
                    <div className="text-2xl font-bold text-orange-600">{counts.critical}</div>
                    <div className="text-sm text-muted-foreground">Critical</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <XCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
                    <div className="text-2xl font-bold text-red-600">{counts.violation}</div>
                    <div className="text-sm text-muted-foreground">Violations</div>
                  </CardContent>
                </Card>
              </div>

              {isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              )}

              {!isLoading && sortedStatuses.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No Active Shifts</p>
                  <p className="text-sm">No employees are currently clocked in at this property.</p>
                </div>
              )}

              {!isLoading && sortedStatuses.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Time Worked</TableHead>
                      <TableHead>Meal Break</TableHead>
                      <TableHead>Time to Deadline</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Alerts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedStatuses.map((status) => (
                      <TableRow
                        key={status.employee.id}
                        className={
                          status.status === "violation"
                            ? "bg-red-50 dark:bg-red-950/30"
                            : status.status === "critical"
                            ? "bg-orange-50 dark:bg-orange-950/30"
                            : ""
                        }
                        data-testid={`row-employee-${status.employee.id}`}
                      >
                        <TableCell className="font-medium">
                          {status.employee.firstName} {status.employee.lastName}
                        </TableCell>
                        <TableCell>
                          {format(status.clockInTime, "h:mm a")}
                        </TableCell>
                        <TableCell>
                          {formatDuration(status.minutesWorked)}
                        </TableCell>
                        <TableCell>
                          {status.mealBreakTaken ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Taken
                            </Badge>
                          ) : status.mealBreakRequired ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                              <Clock className="w-3 h-3 mr-1" /> Required
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not yet required</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {status.minutesToMealDeadline !== null ? (
                            <div className="space-y-1">
                              <div className={
                                status.minutesToMealDeadline < 0
                                  ? "text-red-600 font-bold"
                                  : status.minutesToMealDeadline <= 15
                                  ? "text-orange-600 font-medium"
                                  : ""
                              }>
                                {status.minutesToMealDeadline < 0
                                  ? `Overdue ${Math.abs(status.minutesToMealDeadline)}m`
                                  : `${status.minutesToMealDeadline}m remaining`}
                              </div>
                              {status.minutesToMealDeadline > 0 && (
                                <Progress
                                  value={Math.max(0, 100 - (status.minutesToMealDeadline / 60) * 100)}
                                  className="h-1.5"
                                />
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={status.status} />
                        </TableCell>
                        <TableCell>
                          {status.alerts.length > 0 ? (
                            <div className="space-y-1">
                              {status.alerts.map((alert, i) => (
                                <div key={i} className="text-sm text-muted-foreground">
                                  {alert}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedProperty && activeBreakRule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="w-5 h-5" />
              {activeBreakRule.stateCode} Break Requirements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-semibold">Meal Break</h4>
                <p className="text-muted-foreground">
                  {activeBreakRule.mealBreakMinutes} minutes before {activeBreakRule.mealBreakThresholdHours} hours
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Rest Break</h4>
                <p className="text-muted-foreground">
                  {activeBreakRule.restBreakMinutes} minutes every {activeBreakRule.restBreakIntervalHours} hours
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Alert Threshold</h4>
                <p className="text-muted-foreground">
                  {activeBreakRule.alertMinutesBeforeDeadline} minutes before deadline
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

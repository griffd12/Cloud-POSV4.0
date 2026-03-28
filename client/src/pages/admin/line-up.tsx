import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { format, parseISO, addDays, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar, Users } from "lucide-react";
import type { Property, Employee, Shift, Timecard, BreakSession, JobCode } from "@shared/schema";

interface LineUpData {
  shifts: Shift[];
  timecards: Timecard[];
  breakSessions: BreakSession[];
}

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const HOUR_WIDTH = 60;
const ROW_HEIGHT = 60;
const LEFT_COLUMN_WIDTH = 160;

function formatHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function timeToPosition(time: string | Date | null, startHour: number = 0): number {
  if (!time) return 0;
  let date: Date;
  if (typeof time === "string") {
    if (time.includes("T")) {
      date = parseISO(time);
    } else {
      date = parseISO(`2000-01-01T${time}`);
    }
  } else {
    date = time;
  }
  const hours = date.getHours() + date.getMinutes() / 60;
  return (hours - startHour) * HOUR_WIDTH;
}

function getBarWidth(startTime: string | Date | null, endTime: string | Date | null): number {
  if (!startTime || !endTime) return 0;
  const startPos = timeToPosition(startTime);
  const endPos = timeToPosition(endTime);
  return Math.max(endPos - startPos, 0);
}

function formatTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return "";
  try {
    const start = typeof startTime === "string" && !startTime.includes("T")
      ? parseISO(`2000-01-01T${startTime}`)
      : parseISO(startTime);
    const end = typeof endTime === "string" && !endTime.includes("T")
      ? parseISO(`2000-01-01T${endTime}`)
      : parseISO(endTime);
    return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
  } catch {
    return "";
  }
}

function calculateHours(startTime: string | Date | null, endTime: string | Date | null): number {
  if (!startTime || !endTime) return 0;
  let start: Date;
  let end: Date;
  if (typeof startTime === "string") {
    start = startTime.includes("T") ? parseISO(startTime) : parseISO(`2000-01-01T${startTime}`);
  } else {
    start = startTime;
  }
  if (typeof endTime === "string") {
    end = endTime.includes("T") ? parseISO(endTime) : parseISO(`2000-01-01T${endTime}`);
  } else {
    end = endTime;
  }
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

interface EmployeeRowData {
  employee: Employee;
  shifts: Shift[];
  timecards: Timecard[];
  breakSessions: BreakSession[];
  totalScheduledHours: number;
  totalRecordedHours: number;
  laborCost: number;
}

export default function LineUpPage() {
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("");

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

  const { data: jobCodes = [] } = useQuery<JobCode[]>({
    queryKey: ["/api/job-codes", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/job-codes${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch job codes");
      return res.json();
    },
  });

  const { data: lineUpData } = useQuery<LineUpData>({
    queryKey: ["/api/line-up", selectedPropertyId, selectedDate],
    enabled: !!selectedPropertyId && !!selectedDate,
  });

  const goToPreviousDay = () => {
    const date = parseISO(selectedDate);
    setSelectedDate(format(subDays(date, 1), "yyyy-MM-dd"));
  };

  const goToNextDay = () => {
    const date = parseISO(selectedDate);
    setSelectedDate(format(addDays(date, 1), "yyyy-MM-dd"));
  };

  const goToToday = () => {
    setSelectedDate(today);
  };

  const jobCodeMap = new Map(jobCodes.map((jc) => [jc.id, jc]));
  const employeeMap = new Map(employees.map((emp) => [emp.id, emp]));

  const employeeRows: EmployeeRowData[] = (() => {
    if (!lineUpData) return [];

    const employeeIdsWithData = new Set<string>();
    lineUpData.shifts.forEach((s) => {
      if (s.employeeId) employeeIdsWithData.add(s.employeeId);
    });
    lineUpData.timecards.forEach((t) => {
      if (t.employeeId) employeeIdsWithData.add(t.employeeId);
    });
    lineUpData.breakSessions.forEach((b) => {
      if (b.employeeId) employeeIdsWithData.add(b.employeeId);
    });

    return Array.from(employeeIdsWithData)
      .map((empId) => {
        const emp = employeeMap.get(empId);
        if (!emp) return null;

        const empShifts = lineUpData.shifts.filter((s) => s.employeeId === empId);
        const empTimecards = lineUpData.timecards.filter((t) => t.employeeId === empId);
        const empBreaks = lineUpData.breakSessions.filter((b) => b.employeeId === empId);

        let totalScheduledHours = 0;
        empShifts.forEach((shift) => {
          totalScheduledHours += calculateHours(shift.startTime, shift.endTime);
        });

        let totalRecordedHours = 0;
        let laborCost = 0;
        empTimecards.forEach((tc) => {
          totalRecordedHours += parseFloat(tc.totalHours || "0");
          laborCost += parseFloat(tc.totalPay || "0");
        });

        return {
          employee: emp,
          shifts: empShifts,
          timecards: empTimecards,
          breakSessions: empBreaks,
          totalScheduledHours,
          totalRecordedHours,
          laborCost,
        };
      })
      .filter((row): row is EmployeeRowData => row !== null)
      .filter((row) => !filterEmployeeId || filterEmployeeId === "ALL" || row.employee.id === filterEmployeeId)
      .sort((a, b) => a.employee.firstName.localeCompare(b.employee.firstName));
  })();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-lineup-title">
            Line Up
          </h1>
          <p className="text-muted-foreground text-sm">
            Daily schedule timeline with recorded hours and breaks
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={goToPreviousDay}
              data-testid="button-prev-day"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              data-testid="button-today"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={goToNextDay}
              data-testid="button-next-day"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium" data-testid="text-selected-date">
              {format(parseISO(selectedDate), "EEE, MMM d, yyyy")}
            </span>
          </div>

          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-[200px]" data-testid="select-property">
              <SelectValue placeholder="Select Property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((prop) => (
                <SelectItem key={prop.id} value={prop.id}>
                  {prop.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
            <SelectTrigger className="w-[200px]" data-testid="select-filter-employee">
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Employees</SelectItem>
              {employees
                .filter((e) => e.active)
                .sort((a, b) => a.firstName.localeCompare(b.firstName))
                .map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500" />
          <span>Recorded hours</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-300" />
          <span>Scheduled hours</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>Paid break</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded"
            style={{
              background: "repeating-linear-gradient(45deg, #22c55e, #22c55e 2px, #86efac 2px, #86efac 4px)",
            }}
          />
          <span>Unpaid break</span>
        </div>
      </div>

      {!selectedPropertyId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Select a property to view the daily line up</p>
          </CardContent>
        </Card>
      ) : employeeRows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No shifts or timecards for this date</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div
              style={{
                minWidth: LEFT_COLUMN_WIDTH + HOURS.length * HOUR_WIDTH,
                position: "relative",
              }}
            >
              <div className="flex border-b bg-muted/50 sticky top-0 z-10">
                <div
                  className="flex-shrink-0 px-3 py-2 font-medium text-sm border-r bg-muted/50 sticky left-0 z-20"
                  style={{ width: LEFT_COLUMN_WIDTH }}
                >
                  Team member
                </div>
                <div className="flex">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="text-xs text-muted-foreground px-1 py-2 text-center border-l"
                      style={{ width: HOUR_WIDTH }}
                    >
                      {formatHourLabel(hour)}
                    </div>
                  ))}
                </div>
              </div>

              {employeeRows.map((row) => (
                <div
                  key={row.employee.id}
                  className="flex border-b hover:bg-muted/20 transition-colors"
                  style={{ minHeight: ROW_HEIGHT }}
                  data-testid={`row-employee-${row.employee.id}`}
                >
                  <div
                    className="flex-shrink-0 px-3 py-2 border-r bg-background sticky left-0 z-10"
                    style={{ width: LEFT_COLUMN_WIDTH }}
                  >
                    <div className="text-sm font-medium truncate">
                      {row.employee.firstName} {row.employee.lastName?.charAt(0)}.
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.totalRecordedHours > 0 ? (
                        <>
                          {row.totalRecordedHours.toFixed(1)}h - ${row.laborCost.toFixed(2)}
                        </>
                      ) : (
                        <>
                          {row.totalScheduledHours.toFixed(1)}h scheduled
                        </>
                      )}
                    </div>
                  </div>

                  <div className="relative flex-1" style={{ minHeight: ROW_HEIGHT - 1 }}>
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="absolute top-0 bottom-0 border-l border-dashed border-muted"
                        style={{ left: hour * HOUR_WIDTH }}
                      />
                    ))}

                    {row.shifts.map((shift) => {
                      const jobCode = shift.jobCodeId ? jobCodeMap.get(shift.jobCodeId) : null;
                      const left = timeToPosition(shift.startTime);
                      const width = getBarWidth(shift.startTime, shift.endTime);
                      
                      return (
                        <div
                          key={`shift-${shift.id}`}
                          className="absolute top-2 h-10 rounded flex items-center px-2 text-xs text-white overflow-hidden"
                          style={{
                            left,
                            width: Math.max(width, 40),
                            backgroundColor: "#86efac",
                            color: "#166534",
                          }}
                          title={`Scheduled: ${formatTimeRange(shift.startTime, shift.endTime)}`}
                          data-testid={`bar-shift-${shift.id}`}
                        >
                          <div className="truncate">
                            <div className="font-medium">
                              {formatTimeRange(shift.startTime, shift.endTime)}
                            </div>
                            <div className="text-[10px] opacity-80">
                              {jobCode?.name || "Shift"}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {row.timecards.map((tc) => {
                      if (!tc.clockInTime) return null;
                      const jobCode = tc.jobCodeId ? jobCodeMap.get(tc.jobCodeId) : null;
                      const clockIn = new Date(tc.clockInTime);
                      const clockOut = tc.clockOutTime ? new Date(tc.clockOutTime) : new Date();
                      const left = timeToPosition(clockIn);
                      const width = getBarWidth(clockIn, clockOut);

                      return (
                        <div
                          key={`timecard-${tc.id}`}
                          className="absolute top-2 h-10 rounded flex items-center px-2 text-xs text-white overflow-hidden"
                          style={{
                            left,
                            width: Math.max(width, 40),
                            backgroundColor: "#22c55e",
                          }}
                          title={`Recorded: ${format(clockIn, "h:mm a")} - ${tc.clockOutTime ? format(clockOut, "h:mm a") : "Active"}`}
                          data-testid={`bar-timecard-${tc.id}`}
                        >
                          <div className="truncate">
                            <div className="font-medium">
                              {format(clockIn, "h:mm a")} - {tc.clockOutTime ? format(clockOut, "h:mm a") : "Active"}
                            </div>
                            <div className="text-[10px] opacity-80">
                              {jobCode?.name || "Work"}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {row.breakSessions.map((brk) => {
                      if (!brk.startTime) return null;
                      const startTime = new Date(brk.startTime);
                      const endTime = brk.endTime ? new Date(brk.endTime) : new Date();
                      const left = timeToPosition(startTime);
                      const width = getBarWidth(startTime, endTime);
                      const isPaid = brk.isPaid;

                      return (
                        <div
                          key={`break-${brk.id}`}
                          className="absolute top-3 h-8 rounded flex items-center justify-center text-[10px] text-white overflow-hidden"
                          style={{
                            left,
                            width: Math.max(width, 20),
                            backgroundColor: isPaid ? "#3b82f6" : undefined,
                            background: isPaid
                              ? undefined
                              : "repeating-linear-gradient(45deg, #22c55e, #22c55e 2px, #86efac 2px, #86efac 4px)",
                            color: isPaid ? "white" : "#166534",
                            zIndex: 5,
                          }}
                          title={`${isPaid ? "Paid" : "Unpaid"} Break: ${format(startTime, "h:mm a")} - ${brk.endTime ? format(endTime, "h:mm a") : "Active"}`}
                          data-testid={`bar-break-${brk.id}`}
                        >
                          {width > 30 && (isPaid ? "Paid" : "Break")}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

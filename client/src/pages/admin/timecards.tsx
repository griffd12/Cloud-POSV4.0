import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmc, useEmcFilter } from "@/lib/emc-context";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import {
  Calendar,
  Clock,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import type { Employee, Property, Timecard, TimecardException, JobCode, TimePunch } from "@shared/schema";

interface PunchPair {
  clockIn: TimePunch;
  clockOut: TimePunch | null;
  duration: number; // in minutes
}

export default function TimecardsPage() {
  const { toast } = useToast();
  const { user: emcUser } = useEmc();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  
  // Enable real-time updates via WebSocket
  usePosWebSocket();
  const [selectedProperty, setSelectedProperty] = useState<string>(contextPropertyId || "");
  
  useEffect(() => {
    if (contextPropertyId) {
      setSelectedProperty(contextPropertyId);
    }
  }, [contextPropertyId]);
  
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [editingTimecard, setEditingTimecard] = useState<Timecard | null>(null);
  const [editForm, setEditForm] = useState({ clockIn: "", clockOut: "", reason: "" });
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [editingPunch, setEditingPunch] = useState<TimePunch | null>(null);
  const [punchEditForm, setPunchEditForm] = useState({ date: "", time: "", reason: "" });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  // Get the selected property's timezone (default to America/New_York if not set)
  const selectedPropertyTimezone = properties.find(p => p.id === selectedProperty)?.timezone || "America/New_York";

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

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

  const startDateStr = format(weekStart, "yyyy-MM-dd");
  const endDateStr = format(weekEnd, "yyyy-MM-dd");

  const { data: timecards = [], isLoading } = useQuery<Timecard[]>({
    queryKey: ["/api/timecards", { propertyId: selectedProperty, startDate: startDateStr, endDate: endDateStr, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/timecards?propertyId=${selectedProperty}&startDate=${startDateStr}&endDate=${endDateStr}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch timecards");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  // Fetch time punches for detailed view
  const { data: timePunches = [] } = useQuery<TimePunch[]>({
    queryKey: ["/api/time-punches", { propertyId: selectedProperty, startDate: startDateStr, endDate: endDateStr, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/time-punches?propertyId=${selectedProperty}&startDate=${startDateStr}&endDate=${endDateStr}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch time punches");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  const { data: exceptions = [] } = useQuery<TimecardException[]>({
    queryKey: ["/api/timecard-exceptions", { propertyId: selectedProperty, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/timecard-exceptions?propertyId=${selectedProperty}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch exceptions");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  const updateTimecardMutation = useMutation({
    mutationFn: async (data: { id: string; clockInTime?: string; clockOutTime?: string; reason: string }) => {
      const emcDisplayName = emcUser ? `${emcUser.firstName} ${emcUser.lastName}` : "System";
      return apiRequest("PATCH", `/api/timecards/${data.id}`, {
        clockInTime: data.clockInTime,
        clockOutTime: data.clockOutTime,
        editReason: data.reason,
        editedByEmcUserId: emcUser?.id,
        editedByDisplayName: emcDisplayName,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Timecard updated successfully." });
      setEditingTimecard(null);
      queryClient.invalidateQueries({ queryKey: ["/api/timecards", { propertyId: selectedProperty, startDate: startDateStr, endDate: endDateStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resolveExceptionMutation = useMutation({
    mutationFn: async (data: { id: string; notes: string }) => {
      const emcDisplayName = emcUser ? `${emcUser.firstName} ${emcUser.lastName}` : "System";
      return apiRequest("POST", `/api/timecard-exceptions/${data.id}/resolve`, {
        resolvedByEmcUserId: emcUser?.id,
        resolvedByDisplayName: emcDisplayName,
        resolutionNotes: data.notes,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Exception resolved." });
      queryClient.invalidateQueries({ queryKey: ["/api/timecard-exceptions", { propertyId: selectedProperty, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePunchMutation = useMutation({
    mutationFn: async (data: { id: string; actualTimestamp: string; editReason: string }) => {
      const emcDisplayName = emcUser ? `${emcUser.firstName} ${emcUser.lastName}` : "System";
      return apiRequest("PATCH", `/api/time-punches/${data.id}`, {
        actualTimestamp: data.actualTimestamp,
        editedByEmcUserId: emcUser?.id,
        editedByDisplayName: emcDisplayName,
        editReason: data.editReason,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Time punch updated successfully." });
      setEditingPunch(null);
      queryClient.invalidateQueries({ queryKey: ["/api/time-punches", { propertyId: selectedProperty, startDate: startDateStr, endDate: endDateStr, enterpriseId: selectedEnterpriseId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/timecards", { propertyId: selectedProperty, startDate: startDateStr, endDate: endDateStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
  };

  const getJobName = (jobCodeId: string | null) => {
    if (!jobCodeId) return "-";
    const job = jobCodes.find((j) => j.id === jobCodeId);
    return job ? job.name : "-";
  };

  const formatPay = (rate: string | null) => {
    if (!rate) return "-";
    return `$${parseFloat(rate).toFixed(2)}`;
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "--:--";
    return formatInTimeZone(new Date(date), selectedPropertyTimezone, "h:mm a");
  };

  const formatHours = (hours: string | number | null) => {
    if (!hours) return "0.00";
    return parseFloat(String(hours)).toFixed(2);
  };

  const formatDuration = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getDayTimecards = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return timecards.filter((tc) => tc.businessDate === dateStr);
  };

  // Get punch pairs for an employee on a specific day
  const getEmployeePunchPairs = (employeeId: string, businessDate: string): PunchPair[] => {
    const employeePunches = timePunches
      .filter((p) => p.employeeId === employeeId && p.businessDate === businessDate)
      .sort((a, b) => new Date(a.actualTimestamp).getTime() - new Date(b.actualTimestamp).getTime());

    const pairs: PunchPair[] = [];
    const clockIns = employeePunches.filter((p) => p.punchType === "clock_in");
    const clockOuts = employeePunches.filter((p) => p.punchType === "clock_out");

    for (const clockIn of clockIns) {
      // Find the next clock out after this clock in
      const clockOut = clockOuts.find(
        (out) => new Date(out.actualTimestamp) > new Date(clockIn.actualTimestamp)
      );
      
      // Calculate duration
      let duration = 0;
      if (clockOut) {
        duration = (new Date(clockOut.actualTimestamp).getTime() - new Date(clockIn.actualTimestamp).getTime()) / 60000;
        // Remove this clock out from consideration for future pairs
        const outIndex = clockOuts.indexOf(clockOut);
        if (outIndex > -1) {
          clockOuts.splice(outIndex, 1);
        }
      }

      pairs.push({ clockIn, clockOut: clockOut || null, duration });
    }

    return pairs;
  };

  const toggleExpanded = (key: string) => {
    setExpandedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const pendingExceptions = exceptions.filter((e) => e.status === "pending");

  const handleTimecardSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editForm.reason.trim()) {
      toast({ title: "Error", description: "Edit reason is required", variant: "destructive" });
      return;
    }
    updateTimecardMutation.mutate({
      id: editingTimecard!.id,
      clockInTime: editForm.clockIn ? `${editingTimecard!.businessDate}T${editForm.clockIn}:00` : undefined,
      clockOutTime: editForm.clockOut ? `${editingTimecard!.businessDate}T${editForm.clockOut}:00` : undefined,
      reason: editForm.reason,
    });
  };

  const handleTimecardCancel = () => {
    setEditingTimecard(null);
    setEditForm({ clockIn: "", clockOut: "", reason: "" });
  };

  const handlePunchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!punchEditForm.reason.trim()) {
      toast({ title: "Error", description: "Edit reason is required", variant: "destructive" });
      return;
    }
    if (!punchEditForm.date || !punchEditForm.time) {
      toast({ title: "Error", description: "Date and time are required", variant: "destructive" });
      return;
    }
    const utcDateTime = fromZonedTime(`${punchEditForm.date}T${punchEditForm.time}:00`, selectedPropertyTimezone);
    updatePunchMutation.mutate({
      id: editingPunch!.id,
      actualTimestamp: utcDateTime.toISOString(),
      editReason: punchEditForm.reason,
    });
  };

  const handlePunchCancel = () => {
    setEditingPunch(null);
    setPunchEditForm({ date: "", time: "", reason: "" });
  };

  if (editingTimecard) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Edit Timecard
              </CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleTimecardCancel} data-testid="button-cancel-timecard">
                  Cancel
                </Button>
                <Button
                  onClick={handleTimecardSubmit}
                  disabled={updateTimecardMutation.isPending}
                  data-testid="button-save-timecard"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTimecardSubmit} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clockIn">Clock In Time</Label>
                  <Input
                    id="clockIn"
                    type="time"
                    value={editForm.clockIn}
                    onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                    data-testid="input-clock-in"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clockOut">Clock Out Time</Label>
                  <Input
                    id="clockOut"
                    type="time"
                    value={editForm.clockOut}
                    onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                    data-testid="input-clock-out"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editReason">Edit Reason (Required)</Label>
                <Textarea
                  id="editReason"
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="Explain why this timecard is being edited..."
                  data-testid="input-edit-reason"
                />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (editingPunch) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Edit Time Punch
              </CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handlePunchCancel} data-testid="button-cancel-punch">
                  Cancel
                </Button>
                <Button
                  onClick={handlePunchSubmit}
                  disabled={updatePunchMutation.isPending}
                  data-testid="button-save-punch"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePunchSubmit} className="space-y-6">
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground mb-1">Punch Type</div>
                <div className="font-medium">
                  {editingPunch.punchType === "clock_in" ? "Clock In" : "Clock Out"}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="punchDate">Date</Label>
                  <Input
                    id="punchDate"
                    type="date"
                    value={punchEditForm.date}
                    onChange={(e) => setPunchEditForm({ ...punchEditForm, date: e.target.value })}
                    data-testid="input-punch-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="punchTime">Time</Label>
                  <Input
                    id="punchTime"
                    type="time"
                    value={punchEditForm.time}
                    onChange={(e) => setPunchEditForm({ ...punchEditForm, time: e.target.value })}
                    data-testid="input-punch-time"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="punchEditReason">Edit Reason (Required)</Label>
                <Textarea
                  id="punchEditReason"
                  value={punchEditForm.reason}
                  onChange={(e) => setPunchEditForm({ ...punchEditForm, reason: e.target.value })}
                  placeholder="Explain why this punch is being edited..."
                  data-testid="input-punch-edit-reason"
                />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-timecards-title">Timecards</h1>
          <p className="text-muted-foreground">Review and edit employee timecards</p>
        </div>
        {pendingExceptions.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            {pendingExceptions.length} Exceptions
          </Badge>
        )}
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
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-4 py-2 border rounded-md bg-background min-w-[200px] text-center">
            <Calendar className="w-4 h-4 inline mr-2" />
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            data-testid="button-next-week"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {!selectedProperty ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select a property to view timecards
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-6">
          {pendingExceptions.length > 0 && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Pending Exceptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingExceptions.map((exc) => (
                      <TableRow key={exc.id}>
                        <TableCell>{getEmployeeName(exc.employeeId)}</TableCell>
                        <TableCell>{exc.businessDate}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{exc.exceptionType}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{exc.description}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveExceptionMutation.mutate({ id: exc.id, notes: "Resolved by manager" })}
                            disabled={resolveExceptionMutation.isPending}
                            data-testid={`button-resolve-exception-${exc.id}`}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {weekDays.map((day) => {
            const dayCards = getDayTimecards(day);
            if (dayCards.length === 0) return null;
            const dateStr = format(day, "yyyy-MM-dd");

            return (
              <Card key={day.toISOString()}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {format(day, "EEEE, MMMM d")}
                    <Badge variant="secondary" className="ml-2">{dayCards.length} entries</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Regular</TableHead>
                        <TableHead>OT</TableHead>
                        <TableHead>Dbl OT</TableHead>
                        <TableHead>Break</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dayCards.map((tc) => {
                        const punchPairs = getEmployeePunchPairs(tc.employeeId, tc.businessDate);
                        const expandKey = `${tc.employeeId}-${tc.businessDate}`;
                        const isExpanded = expandedEmployees.has(expandKey);
                        const hasPunches = punchPairs.length > 0;

                        return (
                          <Collapsible key={tc.id} asChild open={isExpanded}>
                            <>
                              <TableRow className={hasPunches ? "cursor-pointer hover-elevate" : ""} onClick={() => hasPunches && toggleExpanded(expandKey)}>
                                <TableCell>
                                  {hasPunches && (
                                    <CollapsibleTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => e.stopPropagation()}>
                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                      </Button>
                                    </CollapsibleTrigger>
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {getEmployeeName(tc.employeeId)}
                                  {punchPairs.length > 1 && (
                                    <Badge variant="outline" className="ml-2 text-xs">
                                      {punchPairs.length} shifts
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>{getJobName(tc.jobCodeId)}</TableCell>
                                <TableCell className="tabular-nums">{formatPay(tc.payRate)}</TableCell>
                                <TableCell>{formatTime(tc.clockInTime)}</TableCell>
                                <TableCell>{formatTime(tc.clockOutTime)}</TableCell>
                                <TableCell className="tabular-nums">{formatHours(tc.regularHours)}</TableCell>
                                <TableCell className="tabular-nums">{formatHours(tc.overtimeHours)}</TableCell>
                                <TableCell className="tabular-nums">{formatHours(tc.doubleTimeHours)}</TableCell>
                                <TableCell className="tabular-nums">{tc.breakMinutes || 0}m</TableCell>
                                <TableCell className="tabular-nums font-semibold">{formatHours(tc.totalHours)}</TableCell>
                                <TableCell>
                                  <Badge variant={tc.status === "approved" ? "default" : "secondary"}>
                                    {tc.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingTimecard(tc);
                                      setEditForm({
                                        clockIn: tc.clockInTime ? format(new Date(tc.clockInTime), "HH:mm") : "",
                                        clockOut: tc.clockOutTime ? format(new Date(tc.clockOutTime), "HH:mm") : "",
                                        reason: "",
                                      });
                                    }}
                                    data-testid={`button-edit-timecard-${tc.id}`}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                              <CollapsibleContent asChild>
                                <TableRow className="bg-muted/30">
                                  <TableCell colSpan={13} className="p-0">
                                    <div className="px-8 py-3">
                                      <div className="text-sm font-medium text-muted-foreground mb-2">
                                        Individual Punches
                                      </div>
                                      <div className="space-y-2">
                                        {punchPairs.map((pair, idx) => (
                                          <div 
                                            key={pair.clockIn.id} 
                                            className="flex items-center gap-4 p-2 bg-background rounded-md border"
                                          >
                                            <Badge variant="outline" className="text-xs">
                                              Shift {idx + 1}
                                            </Badge>
                                            <div className="flex items-center gap-2">
                                              <Clock className="w-3 h-3 text-muted-foreground" />
                                              <span className="font-medium">{formatTime(pair.clockIn.actualTimestamp)}</span>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditingPunch(pair.clockIn);
                                                  setPunchEditForm({
                                                    date: formatInTimeZone(new Date(pair.clockIn.actualTimestamp), selectedPropertyTimezone, "yyyy-MM-dd"),
                                                    time: formatInTimeZone(new Date(pair.clockIn.actualTimestamp), selectedPropertyTimezone, "HH:mm"),
                                                    reason: "",
                                                  });
                                                }}
                                                data-testid={`button-edit-punch-${pair.clockIn.id}`}
                                              >
                                                <Edit2 className="w-3 h-3" />
                                              </Button>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                            <div className="flex items-center gap-2">
                                              <Clock className="w-3 h-3 text-muted-foreground" />
                                              <span className="font-medium">
                                                {pair.clockOut ? formatTime(pair.clockOut.actualTimestamp) : (
                                                  <Badge variant="secondary">Still Working</Badge>
                                                )}
                                              </span>
                                              {pair.clockOut && (
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className="h-6 w-6"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingPunch(pair.clockOut);
                                                    setPunchEditForm({
                                                      date: formatInTimeZone(new Date(pair.clockOut!.actualTimestamp), selectedPropertyTimezone, "yyyy-MM-dd"),
                                                      time: formatInTimeZone(new Date(pair.clockOut!.actualTimestamp), selectedPropertyTimezone, "HH:mm"),
                                                      reason: "",
                                                    });
                                                  }}
                                                  data-testid={`button-edit-punch-${pair.clockOut.id}`}
                                                >
                                                  <Edit2 className="w-3 h-3" />
                                                </Button>
                                              )}
                                            </div>
                                            {pair.clockOut && (
                                              <Badge variant="outline">
                                                {formatDuration(pair.duration)}
                                              </Badge>
                                            )}
                                            {pair.clockIn.jobCodeId && (
                                              <Badge variant="secondary" className="text-xs">
                                                {getJobName(pair.clockIn.jobCodeId)}
                                              </Badge>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              </CollapsibleContent>
                            </>
                          </Collapsible>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}

          {timecards.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No timecards for this week
              </CardContent>
            </Card>
          )}
        </div>
      )}

    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { format, startOfWeek, endOfWeek, addDays, differenceInMinutes, parseISO, getDay } from "date-fns";
import {
  Calendar,
  Plus,
  Send,
  Copy,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ChevronDown,
  Settings,
  Users,
  Clock,
  GripVertical,
  X,
} from "lucide-react";
import type { Employee, Property, Rvc, Shift, JobCode, EmployeeJobCode, EmployeeAssignment } from "@shared/schema";

const WEEKDAYS = [
  { key: 0, label: "Sun", short: "S" },
  { key: 1, label: "Mon", short: "M" },
  { key: 2, label: "Tue", short: "T" },
  { key: 3, label: "Wed", short: "W" },
  { key: 4, label: "Thu", short: "T" },
  { key: 5, label: "Fri", short: "F" },
  { key: 6, label: "Sat", short: "S" },
];

type EmployeeJobCodeWithDetails = EmployeeJobCode & { jobCode: JobCode };

export default function SchedulingPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedProperty, setSelectedProperty] = useState<string>(contextPropertyId || "");
  
  useEffect(() => {
    if (contextPropertyId) {
      setSelectedProperty(contextPropertyId);
    }
  }, [contextPropertyId]);
  
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [isAddingShift, setIsAddingShift] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    employeeId: "",
    rvcId: "",
    jobCodeId: "",
    startTime: "09:00",
    endTime: "17:00",
    notes: "",
    repeatDays: [] as number[],
  });
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/rvcs${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch rvcs");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: jobCodes = [] } = useQuery<JobCode[]>({
    queryKey: ["/api/job-codes", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/job-codes${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch job codes");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: employeeAssignments = [] } = useQuery<EmployeeAssignment[]>({
    queryKey: ["/api/employee-assignments", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/employee-assignments${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch employee assignments");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  const { data: shifts = [], isLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      if (!selectedProperty) return [];
      const baseUrl = `/api/shifts?propertyId=${selectedProperty}&startDate=${weekStartStr}&endDate=${weekEndStr}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  const { data: employeeJobCodesMap = {} } = useQuery<Record<string, EmployeeJobCodeWithDetails[]>>({
    queryKey: ["/api/properties", selectedProperty, "employee-job-codes", filterKeys],
    queryFn: async () => {
      if (!selectedProperty) return {};
      const baseUrl = `/api/properties/${selectedProperty}/employee-job-codes`;
      const url = selectedEnterpriseId ? `${baseUrl}?enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch employee job codes");
      return res.json();
    },
    enabled: !!selectedProperty,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/shifts", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift created successfully." });
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/shifts/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift updated." });
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/shifts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const publishShiftsMutation = useMutation({
    mutationFn: async (shiftIds: string[]) => {
      return apiRequest("POST", "/api/shifts/publish", {
        shiftIds,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Schedule published to employees." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyWeekMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/shifts/copy-week", {
        propertyId: selectedProperty,
        sourceWeekStart: format(addDays(weekStart, -7), "yyyy-MM-dd"),
        targetWeekStart: weekStartStr,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Previous week schedule copied." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setIsAddingShift(false);
    setSelectedDay(null);
    setSelectedEmployee(null);
    setEditingShift(null);
    setShiftForm({ employeeId: "", rvcId: "", jobCodeId: "", startTime: "09:00", endTime: "17:00", notes: "", repeatDays: [] });
  };

  const reassignShiftMutation = useMutation({
    mutationFn: async ({ shiftId, newEmployeeId }: { shiftId: string; newEmployeeId: string | null }) => {
      return apiRequest("PATCH", `/api/shifts/${shiftId}`, { 
        employeeId: newEmployeeId,
        jobCodeId: null,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift reassigned successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkCreateShiftsMutation = useMutation({
    mutationFn: async (shiftsData: any[]) => {
      return apiRequest("POST", "/api/shifts/bulk-create", { shifts: shiftsData });
    },
    onSuccess: (_, variables) => {
      toast({ title: "Success", description: `${variables.length} shift(s) created successfully.` });
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr, enterpriseId: selectedEnterpriseId }] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const propertyRvcs = useMemo(() => rvcs.filter((r) => r.propertyId === selectedProperty), [rvcs, selectedProperty]);
  
  const propertyEmployees = useMemo(() => {
    const assignedEmployeeIds = new Set(
      employeeAssignments
        .filter((a) => a.propertyId === selectedProperty)
        .map((a) => a.employeeId)
    );
    return employees.filter((e) => e.active && (assignedEmployeeIds.has(e.id) || e.propertyId === selectedProperty));
  }, [employees, employeeAssignments, selectedProperty]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const calculateShiftHours = (startTime: string | null, endTime: string | null): number => {
    if (!startTime || !endTime) return 0;
    try {
      const start = parseISO(`2000-01-01T${startTime}`);
      const end = parseISO(`2000-01-01T${endTime}`);
      let minutes = differenceInMinutes(end, start);
      if (minutes < 0) minutes += 24 * 60;
      return minutes / 60;
    } catch {
      return 0;
    }
  };

  const getPayRateForShift = (employeeId: string | null, jobCodeId: string | null): number => {
    if (!employeeId || !jobCodeId) return 0;
    const empJobCodes = employeeJobCodesMap[employeeId] || [];
    const assignment = empJobCodes.find((ejc) => ejc.jobCodeId === jobCodeId);
    return assignment?.payRate ? parseFloat(assignment.payRate) : 0;
  };

  const getJobCodeName = (jobCodeId: string | null): string => {
    if (!jobCodeId) return "";
    const jc = jobCodes.find((j) => j.id === jobCodeId);
    return jc?.name || "";
  };

  const getJobCodeColor = (jobCodeId: string | null): string => {
    if (!jobCodeId) return "#3B82F6";
    const jc = jobCodes.find((j) => j.id === jobCodeId);
    return jc?.color || "#3B82F6";
  };

  const employeeShiftsMap = useMemo(() => {
    const map: Record<string, { shifts: Shift[]; weeklyHours: number; weeklyCost: number }> = {};
    
    propertyEmployees.forEach((emp) => {
      map[emp.id] = { shifts: [], weeklyHours: 0, weeklyCost: 0 };
    });
    map["open"] = { shifts: [], weeklyHours: 0, weeklyCost: 0 };

    shifts.forEach((shift) => {
      const empId = shift.employeeId || "open";
      if (!map[empId]) {
        map[empId] = { shifts: [], weeklyHours: 0, weeklyCost: 0 };
      }
      map[empId].shifts.push(shift);
      const hours = calculateShiftHours(shift.startTime, shift.endTime);
      map[empId].weeklyHours += hours;
      if (shift.employeeId) {
        const rate = getPayRateForShift(shift.employeeId, shift.jobCodeId);
        map[empId].weeklyCost += hours * rate;
      }
    });

    return map;
  }, [shifts, propertyEmployees, employeeJobCodesMap]);

  const dailyTotals = useMemo(() => {
    return weekDays.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayShifts = shifts.filter((s) => s.shiftDate === dateStr);
      let hours = 0;
      let cost = 0;
      dayShifts.forEach((s) => {
        const h = calculateShiftHours(s.startTime, s.endTime);
        hours += h;
        if (s.employeeId) {
          cost += h * getPayRateForShift(s.employeeId, s.jobCodeId);
        }
      });
      return { hours, cost };
    });
  }, [shifts, weekDays, employeeJobCodesMap]);

  const weeklyTotals = useMemo(() => {
    return dailyTotals.reduce(
      (acc, day) => ({ hours: acc.hours + day.hours, cost: acc.cost + day.cost }),
      { hours: 0, cost: 0 }
    );
  }, [dailyTotals]);

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  const formatShiftTime = (time: string | null) => {
    if (!time) return "";
    try {
      return format(parseISO(`2000-01-01T${time}`), "h:mm a");
    } catch {
      return time;
    }
  };

  const getEmployeeShiftsForDay = (employeeId: string | null, date: Date): Shift[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const empId = employeeId || "open";
    return (employeeShiftsMap[empId]?.shifts || []).filter((s) => s.shiftDate === dateStr);
  };

  const unpublishedShifts = useMemo(() => shifts.filter((s) => s.status === "draft"), [shifts]);

  const openAddShiftDialog = (employeeId: string | null, day: Date) => {
    setSelectedEmployee(employeeId);
    setSelectedDay(day);
    const dayOfWeek = getDay(day);
    setShiftForm({
      employeeId: employeeId || "",
      rvcId: propertyRvcs[0]?.id || "",
      jobCodeId: "",
      startTime: "09:00",
      endTime: "17:00",
      notes: "",
      repeatDays: [dayOfWeek],
    });
    setIsAddingShift(true);
  };

  const openEditShiftDialog = (shift: Shift) => {
    setEditingShift(shift);
    setSelectedDay(parseISO(shift.shiftDate));
    setShiftForm({
      employeeId: shift.employeeId || "",
      rvcId: shift.rvcId || propertyRvcs[0]?.id || "",
      jobCodeId: shift.jobCodeId || "",
      startTime: shift.startTime || "09:00",
      endTime: shift.endTime || "17:00",
      notes: shift.notes || "",
      repeatDays: [],
    });
    setIsAddingShift(true);
  };

  const handleSaveShift = () => {
    if (!shiftForm.rvcId) {
      toast({ title: "Error", description: "Please select a revenue center", variant: "destructive" });
      return;
    }
    if (shiftForm.employeeId && !shiftForm.jobCodeId) {
      toast({ title: "Error", description: "Please select a job for this shift", variant: "destructive" });
      return;
    }

    if (editingShift) {
      const shiftData = {
        propertyId: selectedProperty,
        rvcId: shiftForm.rvcId,
        employeeId: shiftForm.employeeId || null,
        jobCodeId: shiftForm.jobCodeId || null,
        shiftDate: format(selectedDay!, "yyyy-MM-dd"),
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        notes: shiftForm.notes || null,
        status: "draft",
      };
      updateShiftMutation.mutate({ id: editingShift.id, data: shiftData });
    } else {
      const shiftsToCreate: any[] = [];
      const selectedDayOfWeek = getDay(selectedDay!);
      
      shiftForm.repeatDays.forEach((dayNum) => {
        const dayOffset = dayNum - selectedDayOfWeek;
        const shiftDate = addDays(selectedDay!, dayOffset);
        
        if (shiftDate >= weekStart && shiftDate <= weekEnd) {
          shiftsToCreate.push({
            propertyId: selectedProperty,
            rvcId: shiftForm.rvcId,
            employeeId: shiftForm.employeeId || null,
            jobCodeId: shiftForm.jobCodeId || null,
            shiftDate: format(shiftDate, "yyyy-MM-dd"),
            startTime: shiftForm.startTime,
            endTime: shiftForm.endTime,
            notes: shiftForm.notes || null,
            status: "draft",
          });
        }
      });

      if (shiftsToCreate.length === 0) {
        const shiftData = {
          propertyId: selectedProperty,
          rvcId: shiftForm.rvcId,
          employeeId: shiftForm.employeeId || null,
          jobCodeId: shiftForm.jobCodeId || null,
          shiftDate: format(selectedDay!, "yyyy-MM-dd"),
          startTime: shiftForm.startTime,
          endTime: shiftForm.endTime,
          notes: shiftForm.notes || null,
          status: "draft",
        };
        createShiftMutation.mutate(shiftData);
      } else if (shiftsToCreate.length === 1) {
        createShiftMutation.mutate(shiftsToCreate[0]);
      } else {
        bulkCreateShiftsMutation.mutate(shiftsToCreate);
      }
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const shiftId = event.active.id as string;
    const shift = shifts.find((s) => s.id === shiftId);
    setActiveShift(shift || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveShift(null);

    if (!over) return;

    const shiftId = active.id as string;
    const dropTargetId = over.id as string;
    
    const [targetType, targetEmployeeId] = dropTargetId.split(":");
    if (targetType !== "employee-row") return;

    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    const currentEmployeeId = shift.employeeId || "open";
    const newEmployeeId = targetEmployeeId === "open" ? null : targetEmployeeId;
    
    if (currentEmployeeId === (newEmployeeId || "open")) return;

    reassignShiftMutation.mutate({ shiftId, newEmployeeId });
  };

  const toggleRepeatDay = (dayNum: number) => {
    setShiftForm((prev) => {
      const newDays = prev.repeatDays.includes(dayNum)
        ? prev.repeatDays.filter((d) => d !== dayNum)
        : [...prev.repeatDays, dayNum].sort((a, b) => a - b);
      return { ...prev, repeatDays: newDays };
    });
  };

  const selectedEmployeeJobCodes = useMemo(() => {
    if (!shiftForm.employeeId) return [];
    return employeeJobCodesMap[shiftForm.employeeId] || [];
  }, [shiftForm.employeeId, employeeJobCodesMap]);

  const handleCancel = () => {
    closeDialog();
  };

  if (isAddingShift) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>{editingShift ? "Edit Shift" : "Add Shift"}</CardTitle>
              <div className="flex gap-2">
                {editingShift && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      deleteShiftMutation.mutate(editingShift.id);
                      closeDialog();
                    }}
                    data-testid="button-delete-shift-inline"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-shift">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveShift}
                  disabled={createShiftMutation.isPending || updateShiftMutation.isPending || bulkCreateShiftsMutation.isPending}
                  data-testid="button-save-shift"
                >
                  {bulkCreateShiftsMutation.isPending || createShiftMutation.isPending || updateShiftMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-0 divide-y">
                <div className="py-3 grid grid-cols-[120px_1fr] gap-4 items-center">
                  <span className="text-sm font-medium text-muted-foreground">Team member</span>
                  <Select
                    value={shiftForm.employeeId || "OPEN_SHIFT"}
                    onValueChange={(v) => setShiftForm({ ...shiftForm, employeeId: v === "OPEN_SHIFT" ? "" : v, jobCodeId: "" })}
                  >
                    <SelectTrigger data-testid="select-employee">
                      <SelectValue placeholder="Open Shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN_SHIFT">Open Shift</SelectItem>
                      {propertyEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {shiftForm.employeeId && (
                  <div className="py-3 grid grid-cols-[120px_1fr] gap-4 items-center">
                    <span className="text-sm font-medium text-muted-foreground">Job</span>
                    <Select
                      value={shiftForm.jobCodeId || "NO_JOB"}
                      onValueChange={(v) => setShiftForm({ ...shiftForm, jobCodeId: v === "NO_JOB" ? "" : v })}
                    >
                      <SelectTrigger data-testid="select-job">
                        <SelectValue placeholder="Select job..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NO_JOB">Select job...</SelectItem>
                        {selectedEmployeeJobCodes.filter((ejc) => ejc.jobCodeId).map((ejc) => (
                          <SelectItem key={ejc.jobCodeId} value={ejc.jobCodeId}>
                            {ejc.jobCode?.name || "Job"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="py-3 grid grid-cols-[120px_1fr] gap-4 items-center">
                  <span className="text-sm font-medium text-muted-foreground">Location</span>
                  <Select
                    value={shiftForm.rvcId || "NO_RVC"}
                    onValueChange={(v) => setShiftForm({ ...shiftForm, rvcId: v === "NO_RVC" ? "" : v })}
                  >
                    <SelectTrigger data-testid="select-rvc">
                      <SelectValue placeholder="Select location..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NO_RVC">Select location...</SelectItem>
                      {propertyRvcs.map((rvc) => (
                        <SelectItem key={rvc.id} value={rvc.id}>
                          {rvc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-2">
                <div className="grid grid-cols-4 gap-4">
                  <div className="py-3 space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Start Date</span>
                    <div className="text-sm">{selectedDay && format(selectedDay, "EEEE, MMMM d, yyyy")}</div>
                  </div>
                  <div className="py-3 space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">End Date</span>
                    <div className="text-sm">{selectedDay && format(selectedDay, "EEEE, MMMM d, yyyy")}</div>
                  </div>
                  <div className="py-3 space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Start Time</span>
                    <Input
                      type="time"
                      value={shiftForm.startTime}
                      onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                      data-testid="input-start-time"
                    />
                  </div>
                  <div className="py-3 space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">End Time</span>
                    <Input
                      type="time"
                      value={shiftForm.endTime}
                      onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                      data-testid="input-end-time"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-0 divide-y border-t pt-2">
                <div className="py-3 grid grid-cols-[120px_1fr] gap-4 items-start">
                  <span className="text-sm font-medium text-muted-foreground">Notes</span>
                  <Textarea
                    value={shiftForm.notes}
                    onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                    placeholder="Optional"
                    className="min-h-[60px] resize-none"
                    data-testid="input-notes"
                  />
                </div>

                {!editingShift && (
                  <div className="py-3 grid grid-cols-[120px_1fr] gap-4 items-start">
                    <span className="text-sm font-medium text-muted-foreground pt-1">Repeat shift</span>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-3">
                        {WEEKDAYS.map((wd) => (
                          <label
                            key={wd.key}
                            className="flex items-center gap-2 cursor-pointer"
                            data-testid={`repeat-day-${wd.label}`}
                          >
                            <Checkbox
                              checked={shiftForm.repeatDays.includes(wd.key)}
                              onCheckedChange={() => toggleRepeatDay(wd.key)}
                            />
                            <span className="text-sm">{wd.label}</span>
                          </label>
                        ))}
                      </div>
                      {shiftForm.repeatDays.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Shift will be created for {shiftForm.repeatDays.length} day(s)
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {shiftForm.employeeId && shiftForm.jobCodeId && (
                <div className="p-3 bg-muted rounded-md text-sm">
                  <div className="flex justify-between gap-4">
                    <span>Duration:</span>
                    <span className="font-medium">{formatHours(calculateShiftHours(shiftForm.startTime, shiftForm.endTime))}</span>
                  </div>
                  <div className="flex justify-between gap-4 mt-1">
                    <span>Est. Cost{shiftForm.repeatDays.length > 1 ? ` (${shiftForm.repeatDays.length} days)` : ""}:</span>
                    <span className="font-medium">
                      {formatCurrency(
                        calculateShiftHours(shiftForm.startTime, shiftForm.endTime) * 
                        getPayRateForShift(shiftForm.employeeId, shiftForm.jobCodeId) *
                        Math.max(1, shiftForm.repeatDays.length)
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-scheduling-title">Scheduling</h1>
          <p className="text-muted-foreground">Build and publish employee schedules</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unpublishedShifts.length > 0 && (
            <Button
              onClick={() => setShowPublishConfirm(true)}
              disabled={publishShiftsMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-publish-shifts"
            >
              <Send className="w-4 h-4 mr-2" />
              Publish ({unpublishedShifts.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            data-testid="button-settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-4 py-2 border rounded-md bg-background min-w-[200px] text-center text-sm font-medium">
            {format(weekStart, "MM/dd/yyyy")} - {format(weekEnd, "MM/dd/yyyy")}
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

        <Select value={selectedProperty} onValueChange={setSelectedProperty}>
          <SelectTrigger className="w-[200px]" data-testid="select-property">
            <SelectValue placeholder="Select property..." />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => copyWeekMutation.mutate()}
          disabled={copyWeekMutation.isPending || !selectedProperty}
          data-testid="button-copy-week"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy Last Week
        </Button>

        <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-employee">
            <SelectValue placeholder="All Employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employees</SelectItem>
            {propertyEmployees
              .sort((a, b) => a.firstName.localeCompare(b.firstName))
              .map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedProperty ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground">
          Select a property to view and manage schedules
        </div>
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 border-b font-medium w-48 sticky left-0 bg-muted/50 z-10">
                      Team member
                    </th>
                    {weekDays.map((day) => (
                      <th key={day.toISOString()} className="text-left p-3 border-b border-l font-medium min-w-[120px]">
                        <div className="text-sm">{format(day, "EEE M/d")}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <DroppableRow employeeId="open">
                    <td className="p-3 sticky left-0 bg-background z-10 border-r">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">Open shifts</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatHours(employeeShiftsMap["open"]?.weeklyHours || 0)}
                      </div>
                    </td>
                    {weekDays.map((day) => {
                      const dayShifts = getEmployeeShiftsForDay(null, day);
                      return (
                        <td key={day.toISOString()} className="p-2 border-l align-top min-h-[80px]">
                          <div className="space-y-1">
                            {dayShifts.map((shift) => (
                              <DraggableShift
                                key={shift.id}
                                shift={shift}
                                jobName={getJobCodeName(shift.jobCodeId)}
                                color={getJobCodeColor(shift.jobCodeId)}
                                onEdit={() => openEditShiftDialog(shift)}
                                onDelete={() => deleteShiftMutation.mutate(shift.id)}
                              />
                            ))}
                            <button
                              onClick={() => openAddShiftDialog(null, day)}
                              className="w-full h-6 border border-dashed rounded text-muted-foreground hover:border-foreground hover:text-foreground transition-colors flex items-center justify-center text-xs"
                              data-testid={`button-add-open-shift-${format(day, "yyyy-MM-dd")}`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </DroppableRow>

                  {propertyEmployees
                    .filter((emp) => !filterEmployeeId || filterEmployeeId === "ALL" || emp.id === filterEmployeeId)
                    .map((emp) => {
                    const empData = employeeShiftsMap[emp.id] || { shifts: [], weeklyHours: 0, weeklyCost: 0 };
                    return (
                      <DroppableRow key={emp.id} employeeId={emp.id}>
                        <td className="p-3 sticky left-0 bg-background z-10 border-r">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="flex items-center gap-1 hover:text-primary transition-colors text-left">
                                <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem>View availability</DropdownMenuItem>
                              <DropdownMenuItem>Time off requests</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatHours(empData.weeklyHours)} {formatCurrency(empData.weeklyCost)}
                          </div>
                        </td>
                        {weekDays.map((day) => {
                          const dayShifts = getEmployeeShiftsForDay(emp.id, day);
                          return (
                            <td key={day.toISOString()} className="p-2 border-l align-top min-h-[80px]">
                              <div className="space-y-1">
                                {dayShifts.length === 0 ? (
                                  <button
                                    onClick={() => openAddShiftDialog(emp.id, day)}
                                    className="w-full h-12 border border-dashed rounded text-muted-foreground hover:border-foreground hover:text-foreground transition-colors flex items-center justify-center"
                                    data-testid={`button-add-shift-${emp.id}-${format(day, "yyyy-MM-dd")}`}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                ) : dayShifts.length === 1 ? (
                                  <>
                                    <DraggableShift
                                      shift={dayShifts[0]}
                                      jobName={getJobCodeName(dayShifts[0].jobCodeId)}
                                      color={getJobCodeColor(dayShifts[0].jobCodeId)}
                                      onEdit={() => openEditShiftDialog(dayShifts[0])}
                                      onDelete={() => deleteShiftMutation.mutate(dayShifts[0].id)}
                                    />
                                  <button
                                    onClick={() => openAddShiftDialog(emp.id, day)}
                                    className="w-full h-5 border border-dashed rounded text-muted-foreground hover:border-foreground hover:text-foreground transition-colors flex items-center justify-center text-xs opacity-0 hover:opacity-100"
                                    data-testid={`button-add-another-shift-${emp.id}-${format(day, "yyyy-MM-dd")}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="w-full">
                                      <ShiftBlock
                                        shift={dayShifts[0]}
                                        jobName={getJobCodeName(dayShifts[0].jobCodeId)}
                                        color={getJobCodeColor(dayShifts[0].jobCodeId)}
                                        showBadge={dayShifts.length}
                                      />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="w-48">
                                    {dayShifts.map((shift, idx) => (
                                      <DropdownMenuItem
                                        key={shift.id}
                                        onClick={() => openEditShiftDialog(shift)}
                                        className="flex items-center justify-between"
                                      >
                                        <span className="text-sm">
                                          {getJobCodeName(shift.jobCodeId) || "Shift"} {idx + 1}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {formatShiftTime(shift.startTime)}
                                        </span>
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem onClick={() => openAddShiftDialog(emp.id, day)}>
                                      <Plus className="w-3 h-3 mr-2" />
                                      Add shift
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </td>
                        );
                        })}
                      </DroppableRow>
                    );
                  })}
                </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-medium">
                  <td className="p-3 sticky left-0 bg-muted/30 z-10 border-r border-t">
                    <div className="text-sm">{formatCurrency(weeklyTotals.cost)}</div>
                    <div className="text-xs text-muted-foreground">{formatHours(weeklyTotals.hours)}</div>
                  </td>
                  {dailyTotals.map((total, idx) => (
                    <td key={idx} className="p-3 border-l border-t text-sm">
                      <div>{formatCurrency(total.cost)}</div>
                      <div className="text-xs text-muted-foreground">{formatHours(total.hours)}</div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <DragOverlay>
            {activeShift && (
              <div
                className="p-2 rounded cursor-grabbing text-white shadow-lg opacity-80"
                style={{ backgroundColor: getJobCodeColor(activeShift.jobCodeId) }}
              >
                <div className="text-xs font-medium">{getJobCodeName(activeShift.jobCodeId) || "Shift"}</div>
                <div className="text-xs opacity-80">
                  {formatShiftTime(activeShift.startTime)} - {formatShiftTime(activeShift.endTime)}
                </div>
              </div>
            )}
          </DragOverlay>
        </div>
        </DndContext>
      )}

      <Dialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Publish Schedule</DialogTitle>
            <DialogDescription>
              You are about to publish {unpublishedShifts.length} shift(s) for the week of {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}.
              Once published, employees will be notified and can view their schedules.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => setShowPublishConfirm(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                publishShiftsMutation.mutate(unpublishedShifts.map((s) => s.id));
                setShowPublishConfirm(false);
              }}
              disabled={publishShiftsMutation.isPending}
              data-testid="button-confirm-publish"
            >
              <Send className="w-4 h-4 mr-2" />
              Publish Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShiftBlock({
  shift,
  jobName,
  color,
  onEdit,
  onDelete,
  showBadge,
}: {
  shift: Shift;
  jobName: string;
  color: string;
  onEdit?: () => void;
  onDelete?: () => void;
  showBadge?: number;
}) {
  const formatTime = (time: string | null) => {
    if (!time) return "";
    try {
      return format(parseISO(`2000-01-01T${time}`), "h:mm a");
    } catch {
      return time;
    }
  };

  const isPublished = shift.status === "published";
  const bgOpacity = isPublished ? "bg-opacity-100" : "bg-opacity-60";

  return (
    <div
      onClick={onEdit}
      className={`p-2 rounded cursor-pointer relative group text-white ${bgOpacity}`}
      style={{ backgroundColor: isPublished ? color : `${color}99` }}
      data-testid={`shift-block-${shift.id}`}
    >
      {showBadge && showBadge > 1 && (
        <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
          {showBadge}
        </Badge>
      )}
      <div className="text-xs font-medium truncate flex items-center gap-1">
        {jobName || "Shift"}
        {!isPublished && (
          <span className="text-[10px] opacity-80">(draft)</span>
        )}
      </div>
      <div className="text-[10px] opacity-90">
        {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1 right-1 w-4 h-4 rounded bg-black/20 hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          data-testid={`button-delete-shift-${shift.id}`}
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

function DroppableRow({ employeeId, children }: { employeeId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `employee-row:${employeeId}`,
  });

  return (
    <tr
      ref={setNodeRef}
      className={`border-b transition-colors ${isOver ? "bg-primary/10" : "hover:bg-muted/20"}`}
    >
      {children}
    </tr>
  );
}

function DraggableShift({
  shift,
  jobName,
  color,
  onEdit,
  onDelete,
  showBadge,
}: {
  shift: Shift;
  jobName: string;
  color: string;
  onEdit?: () => void;
  onDelete?: () => void;
  showBadge?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: shift.id,
  });

  const formatTime = (time: string | null) => {
    if (!time) return "";
    try {
      return format(parseISO(`2000-01-01T${time}`), "h:mm a");
    } catch {
      return time;
    }
  };

  const isPublished = shift.status === "published";
  const bgOpacity = isPublished ? "bg-opacity-100" : "bg-opacity-60";

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        backgroundColor: isPublished ? color : `${color}99`,
      }
    : { backgroundColor: isPublished ? color : `${color}99` };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => !isDragging && onEdit?.()}
      className={`p-2 rounded cursor-pointer relative group text-white ${bgOpacity} ${isDragging ? "opacity-50 shadow-lg z-50" : ""}`}
      data-testid={`shift-block-${shift.id}`}
    >
      {showBadge && showBadge > 1 && (
        <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
          {showBadge}
        </Badge>
      )}
      <div className="text-xs font-medium truncate flex items-center gap-1">
        <span
          className="cursor-grab touch-none"
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3 h-3 opacity-60" />
        </span>
        {jobName || "Shift"}
        {!isPublished && (
          <span className="text-[10px] opacity-80">(draft)</span>
        )}
      </div>
      <div className="text-[10px] opacity-90">
        {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1 right-1 w-4 h-4 rounded bg-black/20 hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          data-testid={`button-delete-shift-${shift.id}`}
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  AlertCircle,
  AlertTriangle,
  Baby,
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Plus,
  Shield,
  Trash2,
  UserCheck,
} from "lucide-react";
import { format, differenceInYears, parseISO, addDays, isBefore } from "date-fns";
import type { Property, Employee, EmployeeMinorStatus, MinorLaborRule } from "@shared/schema";

interface MinorEmployee {
  employee: Employee;
  minorStatus: EmployeeMinorStatus | null;
  age: number | null;
  workPermitStatus: "valid" | "expiring_soon" | "expired" | "none";
}

export default function MinorLaborPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, scopePayload } = useEmcFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [formData, setFormData] = useState({
    dateOfBirth: "",
    workPermitNumber: "",
    workPermitExpirationDate: "",
    maxDailyHours: "8",
    maxWeeklyHours: "40",
    latestEndTime: "22:00",
    earliestStartTime: "06:00",
    parentGuardianName: "",
    parentGuardianPhone: "",
    schoolName: "",
    notes: "",
  });

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

  const { data: minorStatuses = [], isLoading } = useQuery<EmployeeMinorStatus[]>({
    queryKey: ["/api/employee-minor-status", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/employee-minor-status${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch minor statuses");
      return res.json();
    },
  });

  const { data: laborRules = [] } = useQuery<MinorLaborRule[]>({
    queryKey: ["/api/minor-labor-rules", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/minor-labor-rules${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch labor rules");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/employee-minor-status", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Minor status created." });
      setFormOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/employee-minor-status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/employee-minor-status/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Minor status deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-minor-status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedEmployee("");
    setFormData({
      dateOfBirth: "",
      workPermitNumber: "",
      workPermitExpirationDate: "",
      maxDailyHours: "8",
      maxWeeklyHours: "40",
      latestEndTime: "22:00",
      earliestStartTime: "06:00",
      parentGuardianName: "",
      parentGuardianPhone: "",
      schoolName: "",
      notes: "",
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedEmployee || !formData.dateOfBirth) {
      toast({ title: "Error", description: "Employee and date of birth are required.", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      employeeId: selectedEmployee,
      ...formData,
      ...scopePayload,
    });
  };

  const handleCancel = () => {
    setFormOpen(false);
    resetForm();
  };

  const now = new Date();

  const minorEmployees: MinorEmployee[] = minorStatuses.map(status => {
    const employee = employees.find(e => e.id === status.employeeId);
    const dob = status.dateOfBirth ? parseISO(status.dateOfBirth) : null;
    const age = dob ? differenceInYears(now, dob) : null;

    let workPermitStatus: MinorEmployee["workPermitStatus"] = "none";
    if (status.workPermitExpirationDate) {
      const expDate = parseISO(status.workPermitExpirationDate);
      if (isBefore(expDate, now)) {
        workPermitStatus = "expired";
      } else if (isBefore(expDate, addDays(now, 30))) {
        workPermitStatus = "expiring_soon";
      } else {
        workPermitStatus = "valid";
      }
    }

    return {
      employee: employee || ({ id: status.employeeId, firstName: "Unknown", lastName: "" } as Employee),
      minorStatus: status,
      age,
      workPermitStatus,
    };
  });

  const activeMinors = minorEmployees.filter(m => m.age !== null && m.age < 18);
  const expiredPermits = minorEmployees.filter(m => m.workPermitStatus === "expired");
  const expiringPermits = minorEmployees.filter(m => m.workPermitStatus === "expiring_soon");

  const employeesWithoutStatus = employees.filter(
    e => !minorStatuses.some(s => s.employeeId === e.id)
  );

  const detectedMinorsNeedingCompliance = employees.filter(
    e => (e as any).isMinor === true && !minorStatuses.some(s => s.employeeId === e.id)
  );

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Add Minor Employee</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  data-testid="button-save"
                >
                  Add Minor Employee
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger data-testid="select-employee">
                      <SelectValue placeholder="Select employee..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employeesWithoutStatus.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.firstName} {e.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    data-testid="input-dob"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="permitNumber">Work Permit Number</Label>
                  <Input
                    id="permitNumber"
                    value={formData.workPermitNumber}
                    onChange={(e) => setFormData({ ...formData, workPermitNumber: e.target.value })}
                    placeholder="WP-12345"
                    data-testid="input-permit-number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="permitExpiration">Permit Expiration</Label>
                  <Input
                    id="permitExpiration"
                    type="date"
                    value={formData.workPermitExpirationDate}
                    onChange={(e) => setFormData({ ...formData, workPermitExpirationDate: e.target.value })}
                    data-testid="input-permit-expiration"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schoolName">School Name</Label>
                  <Input
                    id="schoolName"
                    value={formData.schoolName}
                    onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                    placeholder="Lincoln High School"
                    data-testid="input-school"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxDaily">Max Daily Hours</Label>
                  <Input
                    id="maxDaily"
                    type="number"
                    value={formData.maxDailyHours}
                    onChange={(e) => setFormData({ ...formData, maxDailyHours: e.target.value })}
                    data-testid="input-max-daily"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxWeekly">Max Weekly Hours</Label>
                  <Input
                    id="maxWeekly"
                    type="number"
                    value={formData.maxWeeklyHours}
                    onChange={(e) => setFormData({ ...formData, maxWeeklyHours: e.target.value })}
                    data-testid="input-max-weekly"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="earliestStartTime">No Work Before</Label>
                  <Input
                    id="earliestStartTime"
                    type="time"
                    value={formData.earliestStartTime}
                    onChange={(e) => setFormData({ ...formData, earliestStartTime: e.target.value })}
                    data-testid="input-no-work-before"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="latestEndTime">No Work After</Label>
                  <Input
                    id="latestEndTime"
                    type="time"
                    value={formData.latestEndTime}
                    onChange={(e) => setFormData({ ...formData, latestEndTime: e.target.value })}
                    data-testid="input-no-work-after"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parentName">Parent/Guardian Name</Label>
                  <Input
                    id="parentName"
                    value={formData.parentGuardianName}
                    onChange={(e) => setFormData({ ...formData, parentGuardianName: e.target.value })}
                    data-testid="input-parent-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parentPhone">Parent/Guardian Phone</Label>
                  <Input
                    id="parentPhone"
                    type="tel"
                    value={formData.parentGuardianPhone}
                    onChange={(e) => setFormData({ ...formData, parentGuardianPhone: e.target.value })}
                    data-testid="input-parent-phone"
                  />
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Minor Labor Compliance</h1>
          <p className="text-muted-foreground">
            Track minor employees and enforce work hour restrictions
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Baby className="w-5 h-5" />
            Minor Employee Tracking
          </CardTitle>
          <CardDescription>
            Manage work permits and hour restrictions for employees under 18
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-end gap-4">
            <Button onClick={() => setFormOpen(true)} data-testid="button-add-minor">
              <Plus className="w-4 h-4 mr-2" />
              Add Minor Employee
            </Button>
          </div>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!isLoading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Baby className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                    <div className="text-2xl font-bold">{activeMinors.length}</div>
                    <div className="text-sm text-muted-foreground">Active Minors</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    <div className="text-2xl font-bold">
                      {minorEmployees.filter(m => m.workPermitStatus === "valid").length}
                    </div>
                    <div className="text-sm text-muted-foreground">Valid Permits</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                    <div className="text-2xl font-bold text-yellow-600">{expiringPermits.length}</div>
                    <div className="text-sm text-muted-foreground">Expiring Soon</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
                    <div className="text-2xl font-bold text-red-600">{expiredPermits.length}</div>
                    <div className="text-sm text-muted-foreground">Expired Permits</div>
                  </CardContent>
                </Card>
              </div>

              {detectedMinorsNeedingCompliance.length > 0 && (
                <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                      <AlertTriangle className="w-5 h-5" />
                      Detected Minors Needing Compliance Records
                    </CardTitle>
                    <CardDescription className="text-yellow-600 dark:text-yellow-500">
                      These employees are under 18 based on their date of birth but don&apos;t have compliance records yet
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {detectedMinorsNeedingCompliance.map((emp) => (
                        <div 
                          key={emp.id}
                          className="flex items-center justify-between p-3 bg-white dark:bg-background rounded-md border"
                        >
                          <div className="flex items-center gap-3">
                            <Baby className="w-5 h-5 text-yellow-600" />
                            <div>
                              <div className="font-medium">{emp.firstName} {emp.lastName}</div>
                              <div className="text-sm text-muted-foreground">
                                Age: {(emp as any).age} years | DOB: {(emp as any).dateOfBirth || "Not set"}
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedEmployee(emp.id);
                              setFormData(prev => ({
                                ...prev,
                                dateOfBirth: (emp as any).dateOfBirth || "",
                              }));
                              setFormOpen(true);
                            }}
                            data-testid={`button-add-compliance-${emp.id}`}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Add Compliance Record
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {minorEmployees.length === 0 && detectedMinorsNeedingCompliance.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Shield className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No Minor Employees</p>
                  <p className="text-sm">Add minor employees to track work permits and restrictions.</p>
                </div>
              )}

              {minorEmployees.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Work Permit</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Max Hours</TableHead>
                      <TableHead>Restricted Hours</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {minorEmployees.map((minor) => (
                      <TableRow
                        key={minor.minorStatus?.id}
                        className={
                          minor.workPermitStatus === "expired" ? "bg-red-50 dark:bg-red-950/30" :
                          minor.workPermitStatus === "expiring_soon" ? "bg-yellow-50 dark:bg-yellow-950/30" : ""
                        }
                        data-testid={`row-minor-${minor.employee.id}`}
                      >
                        <TableCell className="font-medium">
                          {minor.employee.firstName} {minor.employee.lastName}
                        </TableCell>
                        <TableCell>
                          {minor.age !== null ? (
                            <Badge variant={minor.age < 16 ? "destructive" : "secondary"}>
                              {minor.age} years
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {minor.minorStatus?.workPermitNumber ? (
                            <span className="font-mono text-sm">{minor.minorStatus.workPermitNumber}</span>
                          ) : (
                            <Badge variant="outline">No Permit</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {minor.minorStatus?.workPermitExpirationDate ? (
                            <div className="flex items-center gap-2">
                              {minor.workPermitStatus === "expired" && (
                                <AlertCircle className="w-4 h-4 text-red-600" />
                              )}
                              {minor.workPermitStatus === "expiring_soon" && (
                                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                              )}
                              {minor.workPermitStatus === "valid" && (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              )}
                              <span>{format(parseISO(minor.minorStatus.workPermitExpirationDate), "MMM d, yyyy")}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{minor.minorStatus?.maxDailyHours || 8}h/day</div>
                            <div className="text-muted-foreground">{minor.minorStatus?.maxWeeklyHours || 40}h/week</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {minor.minorStatus?.earliestStartTime && minor.minorStatus?.latestEndTime ? (
                            <Badge variant="outline">
                              <Clock className="w-3 h-3 mr-1" />
                              {minor.minorStatus.earliestStartTime} - {minor.minorStatus.latestEndTime}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => minor.minorStatus && deleteMutation.mutate(minor.minorStatus.id)}
                            data-testid={`button-delete-${minor.employee.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            California Minor Labor Law Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-semibold">14-15 Year Olds</h4>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li>Max 3 hours on school days</li>
                <li>Max 8 hours on non-school days</li>
                <li>Max 18 hours during school week</li>
                <li>Cannot work before 7am or after 7pm</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">16-17 Year Olds</h4>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li>Max 4 hours on school days</li>
                <li>Max 8 hours on non-school days</li>
                <li>Max 48 hours during non-school week</li>
                <li>Cannot work before 5am or after 10pm (12:30am weekends)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Work Permit Requirements</h4>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li>Required for all minors in California</li>
                <li>Issued by school district</li>
                <li>Must be renewed each school year</li>
                <li>Employer must keep copy on file</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

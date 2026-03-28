import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { type Employee, type Role, type Property, type EmployeeAssignment, type JobCode, type EmployeeJobCode } from "@shared/schema";
import { Plus, Trash2 } from "lucide-react";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { useConfigOverride } from "@/hooks/use-config-override";

interface JobAssignment {
  jobCodeId: string;
  payRate: string;
  isPrimary: boolean;
  bypassClockIn: boolean;
}

export default function EmployeesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  
  // Enable real-time updates via WebSocket
  usePosWebSocket();
  
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Employee | null>(null);
  
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [pinHash, setPinHash] = useState("");
  const [roleId, setRoleId] = useState("");
  const [active, setActive] = useState(true);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [jobAssignments, setJobAssignments] = useState<JobAssignment[]>([]);
  const [emcEmail, setEmcEmail] = useState("");
  const [emcPassword, setEmcPassword] = useState("");
  const [emcAccessLevel, setEmcAccessLevel] = useState("property_admin");
  const [hasEmcAccess, setHasEmcAccess] = useState(false);
  const [emcLoading, setEmcLoading] = useState(false);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/employees${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<Employee>("employee", ["/api/employees"]);
  const displayedEmployees = filterOverriddenInherited(employees);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/roles${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });

  const enterpriseOnlyParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", selectedEnterpriseId],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${enterpriseOnlyParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
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

  const resetForm = () => {
    setEmployeeNumber("");
    setFirstName("");
    setLastName("");
    setDateOfBirth("");
    setPinHash("");
    setRoleId("");
    setActive(true);
    // Pre-select the context property if one is selected in EMC
    setSelectedPropertyIds(selectedPropertyId ? [selectedPropertyId] : []);
    setJobAssignments([]);
    setEmcEmail("");
    setEmcPassword("");
    setEmcAccessLevel("property_admin");
    setHasEmcAccess(false);
  };

  useEffect(() => {
    if (editingItem) {
      setEmployeeNumber(editingItem.employeeNumber);
      setFirstName(editingItem.firstName);
      setLastName(editingItem.lastName);
      setDateOfBirth((editingItem as any).dateOfBirth || "");
      setPinHash("");
      setRoleId(editingItem.roleId || "");
      setActive(editingItem.active ?? true);
      
      apiRequest("GET", `/api/employees/${editingItem.id}/assignments`)
        .then(res => res.json())
        .then((assignments: EmployeeAssignment[]) => {
          setSelectedPropertyIds(assignments.map(a => a.propertyId).filter(Boolean) as string[]);
        });
      
      apiRequest("GET", `/api/employees/${editingItem.id}/job-codes`)
        .then(res => res.json())
        .then((assignments: EmployeeJobCode[]) => {
          setJobAssignments(assignments.map(a => ({
            jobCodeId: a.jobCodeId,
            payRate: a.payRate || "",
            isPrimary: a.isPrimary || false,
            bypassClockIn: a.bypassClockIn || false,
          })));
        });

      apiRequest("GET", `/api/employees/${editingItem.id}/emc-access`)
        .then(res => res.json())
        .then((data: any) => {
          if (data.hasEmcAccess) {
            setHasEmcAccess(true);
            setEmcEmail(data.email || "");
            setEmcAccessLevel(data.accessLevel || "property_admin");
          } else {
            setHasEmcAccess(false);
            setEmcEmail("");
            setEmcAccessLevel("property_admin");
          }
          setEmcPassword("");
        });
    } else {
      resetForm();
    }
  }, [editingItem]);

  const columns: Column<Employee>[] = [
    { key: "employeeNumber", header: "Employee #", sortable: true },
    {
      key: "firstName",
      header: "Name",
      render: (value, row) => `${row.firstName} ${row.lastName}`,
      sortable: true,
    },
    {
      key: "roleId",
      header: "Role",
      render: (value) => roles.find((r) => r.id === value)?.name || "-",
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<Employee>(scopeLookup),
    getInheritanceColumn<Employee>(selectedPropertyId, selectedRvcId),
  ];

  const createMutation = useMutation({
    mutationFn: async (data: { employee: Partial<Employee>; propertyIds: string[]; jobAssignments: JobAssignment[]; emcEmail?: string; emcPassword?: string; emcAccessLevel?: string }) => {
      const response = await apiRequest("POST", "/api/employees", data.employee);
      const created = await response.json();
      if (data.propertyIds.length > 0) {
        await apiRequest("PUT", `/api/employees/${created.id}/assignments`, { propertyIds: data.propertyIds });
      }
      if (data.jobAssignments.length > 0) {
        await apiRequest("PUT", `/api/employees/${created.id}/job-codes`, { 
          assignments: data.jobAssignments.map(a => ({
            jobCodeId: a.jobCodeId,
            payRate: a.payRate || null,
            isPrimary: a.isPrimary,
            bypassClockIn: a.bypassClockIn,
          }))
        });
      }
      if (data.emcEmail) {
        await apiRequest("PUT", `/api/employees/${created.id}/emc-access`, {
          email: data.emcEmail,
          password: data.emcPassword,
          accessLevel: data.emcAccessLevel,
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Employee created" });
    },
    onError: () => {
      toast({ title: "Failed to create employee", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { employee: Partial<Employee>; propertyIds: string[]; jobAssignments: JobAssignment[]; emcEmail?: string; emcPassword?: string; emcAccessLevel?: string; removeEmcAccess?: boolean }) => {
      const response = await apiRequest("PUT", "/api/employees/" + data.employee.id, data.employee);
      await apiRequest("PUT", `/api/employees/${data.employee.id}/assignments`, { propertyIds: data.propertyIds });
      await apiRequest("PUT", `/api/employees/${data.employee.id}/job-codes`, { 
        assignments: data.jobAssignments.map(a => ({
          jobCodeId: a.jobCodeId,
          payRate: a.payRate || null,
          isPrimary: a.isPrimary,
          bypassClockIn: a.bypassClockIn,
        }))
      });
      if (data.emcEmail) {
        await apiRequest("PUT", `/api/employees/${data.employee.id}/emc-access`, {
          email: data.emcEmail,
          password: data.emcPassword,
          accessLevel: data.emcAccessLevel,
        });
      } else if (data.removeEmcAccess) {
        await apiRequest("PUT", `/api/employees/${data.employee.id}/emc-access`, {
          removeAccess: true,
        });
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Employee updated" });
    },
    onError: () => {
      toast({ title: "Failed to update employee", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/employees/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", filterKeys] });
      toast({ title: "Employee deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete employee", variant: "destructive" });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!firstName || !lastName || !roleId) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    
    if (!editingItem && !pinHash) {
      toast({ title: "PIN is required for new employees", variant: "destructive" });
      return;
    }

    const employeeData: Partial<Employee> = {
      employeeNumber,
      firstName,
      lastName,
      dateOfBirth: dateOfBirth || undefined,
      roleId,
      active,
    } as any;

    if (pinHash) {
      employeeData.pinHash = pinHash;
    }

    const isEnterpriseLevel = !selectedPropertyId;

    if (editingItem) {
      employeeData.id = editingItem.id;
      const editPropertyIds = isEnterpriseLevel 
        ? selectedPropertyIds 
        : selectedPropertyIds;
      if (editPropertyIds.length > 0) {
        (employeeData as any).propertyId = editPropertyIds[0];
      }
      updateMutation.mutate({ employee: employeeData, propertyIds: editPropertyIds, jobAssignments, emcEmail: emcEmail || undefined, emcPassword: emcPassword || undefined, emcAccessLevel, removeEmcAccess: !emcEmail && hasEmcAccess });
    } else {
      const newPropertyIds = isEnterpriseLevel 
        ? properties.map(p => p.id) 
        : selectedPropertyIds;
      const primaryPropertyId = newPropertyIds.length > 0 
        ? newPropertyIds[0] 
        : undefined;
      
      createMutation.mutate({ 
        employee: { 
          ...employeeData, 
          ...scopePayload,
          propertyId: primaryPropertyId,
        } as Employee, 
        propertyIds: newPropertyIds, 
        jobAssignments,
        emcEmail: emcEmail || undefined,
        emcPassword: emcPassword || undefined,
        emcAccessLevel,
      });
    }
  };

  const addJobAssignment = () => {
    setJobAssignments(prev => [...prev, { jobCodeId: "", payRate: "", isPrimary: prev.length === 0, bypassClockIn: false }]);
  };

  const removeJobAssignment = (index: number) => {
    setJobAssignments(prev => {
      const newAssignments = prev.filter((_, i) => i !== index);
      if (newAssignments.length > 0 && !newAssignments.some(a => a.isPrimary)) {
        newAssignments[0].isPrimary = true;
      }
      return newAssignments;
    });
  };

  const updateJobAssignment = (index: number, field: keyof JobAssignment, value: string | boolean) => {
    setJobAssignments(prev => {
      const newAssignments = [...prev];
      newAssignments[index] = { ...newAssignments[index], [field]: value };
      if (field === "isPrimary" && value === true) {
        newAssignments.forEach((a, i) => {
          if (i !== index) a.isPrimary = false;
        });
      }
      return newAssignments;
    });
  };

  const toggleProperty = (propertyId: string) => {
    setSelectedPropertyIds(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    resetForm();
  };

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>{editingItem ? "Edit Employee" : "Add Employee"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-employee">
                  Cancel
                </Button>
                <Button
                  data-testid="button-submit-employee"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={handleSubmit}
                >
                  {editingItem ? "Save Changes" : "Create Employee"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employeeNumber">Employee Number (auto if blank)</Label>
                  <Input 
                    id="employeeNumber"
                    data-testid="input-employee-number"
                    value={employeeNumber} 
                    onChange={(e) => setEmployeeNumber(e.target.value)}
                    placeholder="Leave blank for auto-assign"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pinHash">PIN {editingItem ? "(blank = keep)" : "*"}</Label>
                  <Input 
                    id="pinHash"
                    data-testid="input-pin"
                    type="password"
                    value={pinHash} 
                    onChange={(e) => setPinHash(e.target.value)}
                    placeholder="4-6 digit PIN"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input 
                    id="firstName"
                    data-testid="input-first-name"
                    value={firstName} 
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input 
                    id="lastName"
                    data-testid="input-last-name"
                    value={lastName} 
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input 
                    id="dateOfBirth"
                    data-testid="input-date-of-birth"
                    type="date"
                    value={dateOfBirth} 
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to identify minor employees (under 18)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roleId">Default Role *</Label>
                  <Select value={roleId} onValueChange={setRoleId}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Fallback role when not clocked in to a specific job
                  </p>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch 
                    id="active"
                    data-testid="switch-active"
                    checked={active}
                    onCheckedChange={setActive}
                  />
                  <Label htmlFor="active">Active</Label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Job Assignments</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addJobAssignment}
                      data-testid="button-add-job"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Job
                    </Button>
                  </div>
                  <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-3">
                    {jobAssignments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No jobs assigned</p>
                    ) : (
                      jobAssignments.map((assignment, index) => {
                        const selectedJob = jobCodes.find(j => j.id === assignment.jobCodeId);
                        const isSalaried = selectedJob?.compensationType === "salaried";
                        return (
                          <div key={index} className="space-y-2 border-b pb-2 last:border-b-0 last:pb-0">
                            <div className="flex items-center gap-2">
                              <Select
                                value={assignment.jobCodeId}
                                onValueChange={(v) => {
                                  updateJobAssignment(index, "jobCodeId", v);
                                  const newJob = jobCodes.find(j => j.id === v);
                                  if (newJob?.compensationType !== "salaried" && assignment.bypassClockIn) {
                                    updateJobAssignment(index, "bypassClockIn", false);
                                  }
                                }}
                              >
                                <SelectTrigger className="flex-1" data-testid={`select-job-${index}`}>
                                  <SelectValue placeholder="Select job..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {jobCodes.filter(j => j.active).map((job) => (
                                    <SelectItem key={job.id} value={job.id}>
                                      {job.name} {job.compensationType === "salaried" ? "(Salaried)" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Rate"
                                className="w-24"
                                value={assignment.payRate}
                                onChange={(e) => updateJobAssignment(index, "payRate", e.target.value)}
                                data-testid={`input-pay-rate-${index}`}
                              />
                              <div className="flex items-center gap-1">
                                <Checkbox
                                  checked={assignment.isPrimary}
                                  onCheckedChange={(c) => updateJobAssignment(index, "isPrimary", !!c)}
                                  data-testid={`checkbox-primary-${index}`}
                                />
                                <span className="text-xs text-muted-foreground">Primary</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeJobAssignment(index)}
                                data-testid={`button-remove-job-${index}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            {isSalaried && (
                              <div className="flex items-center gap-2 pl-2">
                                <Checkbox
                                  checked={assignment.bypassClockIn}
                                  onCheckedChange={(c) => updateJobAssignment(index, "bypassClockIn", !!c)}
                                  data-testid={`checkbox-bypass-clockin-${index}`}
                                />
                                <span className="text-xs text-muted-foreground">
                                  Bypass clock-in (access POS without clocking in)
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assign jobs with employee-specific pay rates. Primary job is the default.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Assigned Properties</Label>
                  {!selectedPropertyId && !editingItem ? (
                    <div className="border rounded-md p-3 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Enterprise-level configuration: employee will be assigned to all properties.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        To assign to specific properties only, select a property in the filter bar above.
                      </p>
                    </div>
                  ) : (
                    <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                      {properties.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No properties available</p>
                      ) : (
                        properties.map((property) => (
                          <div key={property.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`property-${property.id}`}
                              data-testid={`checkbox-property-${property.id}`}
                              checked={selectedPropertyIds.includes(property.id)}
                              onCheckedChange={() => toggleProperty(property.id)}
                            />
                            <Label htmlFor={`property-${property.id}`} className="text-sm font-normal cursor-pointer">
                              {property.name}
                            </Label>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {!selectedPropertyId && !editingItem
                      ? "Employee configured at enterprise level applies to all properties" 
                      : "Select one or more properties this employee can access"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">EMC Access</Label>
                <p className="text-xs text-muted-foreground">
                  Grant this employee access to the Enterprise Management Console and the terminal installer program
                </p>
                <div className="border rounded-md p-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emcEmail">EMC Email</Label>
                      <Input
                        id="emcEmail"
                        data-testid="input-emc-email"
                        type="email"
                        value={emcEmail}
                        onChange={(e) => setEmcEmail(e.target.value)}
                        placeholder="email@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emcPassword">
                        Password {hasEmcAccess ? "(blank = keep)" : ""}
                      </Label>
                      <Input
                        id="emcPassword"
                        data-testid="input-emc-password"
                        type="password"
                        value={emcPassword}
                        onChange={(e) => setEmcPassword(e.target.value)}
                        placeholder={hasEmcAccess ? "Leave blank to keep" : "Min 8 characters"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emcAccessLevel">Access Level</Label>
                      <Select value={emcAccessLevel} onValueChange={setEmcAccessLevel}>
                        <SelectTrigger data-testid="select-emc-access-level">
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="property_admin">Property Admin</SelectItem>
                          <SelectItem value="enterprise_admin">Enterprise Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <DataTable
        data={displayedEmployees}
        columns={columns}
        title="Employees"
        onAdd={() => {
          setEditingItem(null);
          resetForm();
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        canDelete={canDeleteItem}
        customActions={getOverrideActions()}
        isLoading={isLoading}
        searchPlaceholder="Search employees..."
        emptyMessage="No employees configured"
      />
    </div>
  );
}

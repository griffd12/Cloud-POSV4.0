import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { type JobCode, type Role } from "@shared/schema";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function JobsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  
  usePosWebSocket();
  
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<JobCode | null>(null);
  
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [roleId, setRoleId] = useState<string>("none");
  const [hourlyRate, setHourlyRate] = useState("");
  const [tipMode, setTipMode] = useState("not_eligible");
  const [active, setActive] = useState(true);
  const [compensationType, setCompensationType] = useState<"hourly" | "salaried">("hourly");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryPeriod, setSalaryPeriod] = useState<"weekly" | "biweekly" | "monthly" | "yearly">("yearly");

  const { data: jobs = [], isLoading } = useQuery<JobCode[]>({
    queryKey: ["/api/job-codes", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/job-codes${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch job codes");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<JobCode>("job", ["/api/jobs"]);
  const displayedJobs = filterOverriddenInherited(jobs);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/roles${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });

  const resetForm = () => {
    setName("");
    setCode("");
    setRoleId("none");
    setHourlyRate("");
    setTipMode("not_eligible");
    setActive(true);
    setCompensationType("hourly");
    setSalaryAmount("");
    setSalaryPeriod("yearly");
  };

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setCode(editingItem.code);
      setRoleId(editingItem.roleId || "none");
      setHourlyRate(editingItem.hourlyRate || "");
      setTipMode(editingItem.tipMode || "not_eligible");
      setActive(editingItem.active ?? true);
      setCompensationType((editingItem.compensationType as "hourly" | "salaried") || "hourly");
      setSalaryAmount(editingItem.salaryAmount || "");
      setSalaryPeriod((editingItem.salaryPeriod as "weekly" | "biweekly" | "monthly" | "yearly") || "yearly");
    } else {
      resetForm();
    }
  }, [editingItem]);

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "No Role";
    const role = roles.find(r => r.id === roleId);
    return role?.name || "Unknown";
  };

  const columns: Column<JobCode>[] = [
    { key: "code", header: "Code", sortable: true },
    { key: "name", header: "Name", sortable: true },
    {
      key: "roleId",
      header: "Role",
      render: (value) => (
        <Badge variant="outline">{getRoleName(value as string | null)}</Badge>
      ),
    },
    {
      key: "compensationType",
      header: "Type",
      render: (value, row) => {
        if (value === "salaried") {
          const period = row.salaryPeriod || "yearly";
          const amount = row.salaryAmount ? `$${parseFloat(row.salaryAmount).toLocaleString()}` : "";
          const periodLabels: Record<string, string> = { weekly: "/wk", biweekly: "/bi-wk", monthly: "/mo", yearly: "/yr" };
          return <Badge variant="secondary">Salaried {amount}{periodLabels[period]}</Badge>;
        }
        const rate = row.hourlyRate ? `$${parseFloat(row.hourlyRate).toFixed(2)}/hr` : "";
        return <Badge variant="outline">Hourly {rate}</Badge>;
      },
    },
    {
      key: "tipMode",
      header: "Tip Mode",
      render: (value) => {
        const modes: Record<string, string> = {
          not_eligible: "Not Eligible",
          pooled: "Pooled",
          direct: "Direct",
          both: "Both"
        };
        return modes[value as string] || value;
      },
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<JobCode>(scopeLookup),
    getInheritanceColumn<JobCode>(selectedPropertyId, selectedRvcId),
  ];

  const createMutation = useMutation({
    mutationFn: async (data: Partial<JobCode>) => {
      const response = await apiRequest("POST", "/api/job-codes", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-codes", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Job created" });
    },
    onError: () => {
      toast({ title: "Failed to create job", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<JobCode>) => {
      const response = await apiRequest("PATCH", "/api/job-codes/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-codes", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Job updated" });
    },
    onError: () => {
      toast({ title: "Failed to update job", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/job-codes/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-codes", filterKeys] });
      toast({ title: "Job deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete job", variant: "destructive" });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!name || !code) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const jobData: Partial<JobCode> = {
      name,
      code,
      roleId: roleId === "none" ? null : roleId || null,
      hourlyRate: compensationType === "hourly" ? (hourlyRate || null) : null,
      tipMode,
      active,
      compensationType,
      salaryAmount: compensationType === "salaried" ? (salaryAmount || null) : null,
      salaryPeriod: compensationType === "salaried" ? salaryPeriod : null,
    };

    if (editingItem) {
      jobData.id = editingItem.id;
      updateMutation.mutate(jobData);
    } else {
      createMutation.mutate({ ...jobData, ...scopePayload });
    }
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
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{editingItem ? "Edit Job" : "New Job"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-job">
                  Cancel
                </Button>
                <Button
                  data-testid="button-save-job"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={handleSubmit}
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    id="code"
                    data-testid="input-job-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g., SERVER, BARTENDER"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    data-testid="input-job-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Server, Bartender"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role (for permissions)</Label>
                  <Select value={roleId} onValueChange={setRoleId}>
                    <SelectTrigger data-testid="select-job-role">
                      <SelectValue placeholder="Select a role..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Role</SelectItem>
                      {roles.filter(r => r.active).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Employees working this job will inherit the permissions from this role
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Compensation Type</Label>
                  <Select value={compensationType} onValueChange={(v) => setCompensationType(v as "hourly" | "salaried")}>
                    <SelectTrigger data-testid="select-compensation-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="salaried">Salaried</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {compensationType === "hourly" && (
                <div className="grid grid-cols-4 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="hourlyRate">Default Hourly Rate</Label>
                    <Input
                      id="hourlyRate"
                      data-testid="input-job-hourly-rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground">
                      Default rate used when no employee-specific rate is set
                    </p>
                  </div>
                </div>
              )}

              {compensationType === "salaried" && (
                <div className="grid grid-cols-4 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="salaryAmount">Salary Amount</Label>
                    <Input
                      id="salaryAmount"
                      data-testid="input-salary-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={salaryAmount}
                      onChange={(e) => setSalaryAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="salaryPeriod">Period</Label>
                    <Select value={salaryPeriod} onValueChange={(v) => setSalaryPeriod(v as "weekly" | "biweekly" | "monthly" | "yearly")}>
                      <SelectTrigger data-testid="select-salary-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="tipMode">Tip Mode</Label>
                  <Select value={tipMode} onValueChange={setTipMode}>
                    <SelectTrigger data-testid="select-job-tip-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_eligible">Not Eligible</SelectItem>
                      <SelectItem value="pooled">Pooled Tips</SelectItem>
                      <SelectItem value="direct">Direct Tips</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    id="active"
                    data-testid="switch-job-active"
                    checked={active}
                    onCheckedChange={setActive}
                  />
                  <Label htmlFor="active">Active</Label>
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
        title="Jobs"
        columns={columns}
        data={displayedJobs}
        isLoading={isLoading}
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
        searchPlaceholder="Search jobs..."
      />
    </div>
  );
}

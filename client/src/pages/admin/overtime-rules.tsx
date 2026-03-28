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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
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
import {
  Scale,
  Plus,
  Edit,
  Trash2,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { Property, OvertimeRule } from "@shared/schema";

const WEEK_DAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const DEFAULT_FORM = {
  name: "",
  description: "",
  dailyOvertimeThreshold: "8.00",
  dailyDoubleTimeThreshold: "12.00",
  weeklyOvertimeThreshold: "40.00",
  overtimeMultiplier: "1.50",
  doubleTimeMultiplier: "2.00",
  enableDailyOvertime: true,
  enableDailyDoubleTime: false,
  enableWeeklyOvertime: true,
  weekStartDay: 0,
  active: true,
};

export default function OvertimeRulesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, scopePayload } = useEmcFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<OvertimeRule | null>(null);
  const [ruleForm, setRuleForm] = useState(DEFAULT_FORM);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: rules = [], isLoading } = useQuery<OvertimeRule[]>({
    queryKey: ["/api/overtime-rules", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/overtime-rules${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch overtime rules");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/overtime-rules", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Overtime rule created." });
      setFormOpen(false);
      setEditingRule(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/overtime-rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/overtime-rules/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Overtime rule updated." });
      setFormOpen(false);
      setEditingRule(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/overtime-rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/overtime-rules/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Overtime rule deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/overtime-rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setRuleForm(DEFAULT_FORM);
    setEditingRule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditDialog = (rule: OvertimeRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      description: rule.description || "",
      dailyOvertimeThreshold: rule.dailyOvertimeThreshold || "8.00",
      dailyDoubleTimeThreshold: rule.dailyDoubleTimeThreshold || "12.00",
      weeklyOvertimeThreshold: rule.weeklyOvertimeThreshold || "40.00",
      overtimeMultiplier: rule.overtimeMultiplier || "1.50",
      doubleTimeMultiplier: rule.doubleTimeMultiplier || "2.00",
      enableDailyOvertime: rule.enableDailyOvertime !== false,
      enableDailyDoubleTime: rule.enableDailyDoubleTime === true,
      enableWeeklyOvertime: rule.enableWeeklyOvertime !== false,
      weekStartDay: rule.weekStartDay || 0,
      active: rule.active !== false,
    });
    setFormOpen(true);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const data = {
      ...ruleForm,
      ...scopePayload,
      dailyDoubleTimeThreshold: ruleForm.enableDailyDoubleTime ? ruleForm.dailyDoubleTimeThreshold : null,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingRule(null);
    resetForm();
  };

  const activeRule = rules.find(r => r.active);

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>{editingRule ? "Edit Overtime Rule" : "Create Overtime Rule"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!ruleForm.name || createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-rule"
                >
                  {editingRule ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Rule Name</Label>
                  <Input
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                    placeholder="e.g., California Labor Law"
                    data-testid="input-rule-name"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={ruleForm.description}
                    onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                    placeholder="Brief description of this rule"
                    data-testid="input-description"
                  />
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium">Daily Overtime Settings</h4>
                
                <div className="flex items-center justify-between">
                  <Label>Enable Daily Overtime</Label>
                  <Switch
                    checked={ruleForm.enableDailyOvertime}
                    onCheckedChange={(v) => setRuleForm({ ...ruleForm, enableDailyOvertime: v })}
                    data-testid="switch-daily-ot"
                  />
                </div>

                {ruleForm.enableDailyOvertime && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>OT After (hours)</Label>
                      <Input
                        type="number"
                        step="0.25"
                        value={ruleForm.dailyOvertimeThreshold}
                        onChange={(e) => setRuleForm({ ...ruleForm, dailyOvertimeThreshold: e.target.value })}
                        data-testid="input-daily-ot-threshold"
                      />
                    </div>
                    <div>
                      <Label>OT Multiplier</Label>
                      <Input
                        type="number"
                        step="0.05"
                        value={ruleForm.overtimeMultiplier}
                        onChange={(e) => setRuleForm({ ...ruleForm, overtimeMultiplier: e.target.value })}
                        data-testid="input-ot-multiplier"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Daily Double Time</Label>
                    <p className="text-xs text-muted-foreground">For states like California</p>
                  </div>
                  <Switch
                    checked={ruleForm.enableDailyDoubleTime}
                    onCheckedChange={(v) => setRuleForm({ ...ruleForm, enableDailyDoubleTime: v })}
                    data-testid="switch-daily-dt"
                  />
                </div>

                {ruleForm.enableDailyDoubleTime && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Double After (hours)</Label>
                      <Input
                        type="number"
                        step="0.25"
                        value={ruleForm.dailyDoubleTimeThreshold}
                        onChange={(e) => setRuleForm({ ...ruleForm, dailyDoubleTimeThreshold: e.target.value })}
                        data-testid="input-daily-dt-threshold"
                      />
                    </div>
                    <div>
                      <Label>Double Multiplier</Label>
                      <Input
                        type="number"
                        step="0.05"
                        value={ruleForm.doubleTimeMultiplier}
                        onChange={(e) => setRuleForm({ ...ruleForm, doubleTimeMultiplier: e.target.value })}
                        data-testid="input-dt-multiplier"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium">Weekly Overtime Settings</h4>
                
                <div className="flex items-center justify-between">
                  <Label>Enable Weekly Overtime</Label>
                  <Switch
                    checked={ruleForm.enableWeeklyOvertime}
                    onCheckedChange={(v) => setRuleForm({ ...ruleForm, enableWeeklyOvertime: v })}
                    data-testid="switch-weekly-ot"
                  />
                </div>

                {ruleForm.enableWeeklyOvertime && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>OT After (hours/week)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={ruleForm.weeklyOvertimeThreshold}
                        onChange={(e) => setRuleForm({ ...ruleForm, weeklyOvertimeThreshold: e.target.value })}
                        data-testid="input-weekly-ot-threshold"
                      />
                    </div>
                    <div>
                      <Label>Week Starts On</Label>
                      <Select
                        value={String(ruleForm.weekStartDay)}
                        onValueChange={(v) => setRuleForm({ ...ruleForm, weekStartDay: parseInt(v) })}
                      >
                        <SelectTrigger data-testid="select-week-start">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEK_DAYS.map((day) => (
                            <SelectItem key={day.value} value={day.value}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={ruleForm.active}
                  onCheckedChange={(v) => setRuleForm({ ...ruleForm, active: v })}
                  data-testid="switch-active"
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="w-6 h-6" />
            Overtime Rules
          </h1>
          <p className="text-muted-foreground">
            Configure labor law overtime calculations per property
          </p>
        </div>
        <Button
          onClick={openCreateDialog}
          data-testid="button-create-rule"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium">No Overtime Rules Configured</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Without overtime rules, the system uses default settings (8 hours regular, overtime after 8 hours daily).
                  Create a rule to configure California-style overtime or other state labor laws.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeRule && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Active Rule: {activeRule.name}
                </CardTitle>
                <CardDescription>{activeRule.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Daily OT After</p>
                    <p className="text-lg font-medium">{activeRule.dailyOvertimeThreshold} hours</p>
                  </div>
                  {activeRule.enableDailyDoubleTime && (
                    <div>
                      <p className="text-sm text-muted-foreground">Daily Double After</p>
                      <p className="text-lg font-medium">{activeRule.dailyDoubleTimeThreshold} hours</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Weekly OT After</p>
                    <p className="text-lg font-medium">{activeRule.weeklyOvertimeThreshold} hours</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">OT Multiplier</p>
                    <p className="text-lg font-medium">{activeRule.overtimeMultiplier}x</p>
                  </div>
                  {activeRule.enableDailyDoubleTime && (
                    <div>
                      <p className="text-sm text-muted-foreground">Double OT Multiplier</p>
                      <p className="text-lg font-medium">{activeRule.doubleTimeMultiplier}x</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All Overtime Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Daily OT</TableHead>
                    <TableHead>Daily Double</TableHead>
                    <TableHead>Weekly OT</TableHead>
                    <TableHead>Multipliers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          {rule.description && (
                            <p className="text-sm text-muted-foreground">{rule.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {rule.enableDailyOvertime ? `After ${rule.dailyOvertimeThreshold}h` : "Disabled"}
                      </TableCell>
                      <TableCell>
                        {rule.enableDailyDoubleTime ? `After ${rule.dailyDoubleTimeThreshold}h` : "Disabled"}
                      </TableCell>
                      <TableCell>
                        {rule.enableWeeklyOvertime ? `After ${rule.weeklyOvertimeThreshold}h` : "Disabled"}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span>{rule.overtimeMultiplier}x</span>
                          {rule.enableDailyDoubleTime && (
                            <span className="text-muted-foreground"> / {rule.doubleTimeMultiplier}x</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rule.active ? "default" : "secondary"}>
                          {rule.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(rule)}
                            data-testid={`button-edit-${rule.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(rule.id)}
                            data-testid={`button-delete-${rule.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

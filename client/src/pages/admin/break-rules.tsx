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
import { Textarea } from "@/components/ui/textarea";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertCircle,
  Coffee,
  Clock,
  DollarSign,
  FileCheck,
  Bell,
  Shield,
  Plus,
  Edit,
  Trash2,
  Info,
} from "lucide-react";
import type { Property, BreakRule } from "@shared/schema";

const STATE_CODES = [
  { value: "CA", label: "California" },
  { value: "NY", label: "New York" },
  { value: "OR", label: "Oregon" },
  { value: "WA", label: "Washington" },
  { value: "CO", label: "Colorado" },
  { value: "OTHER", label: "Other" },
];

const DEFAULT_FORM = {
  name: "California Break Rules",
  stateCode: "CA",
  enableMealBreakEnforcement: true,
  mealBreakMinutes: 30,
  mealBreakThresholdHours: "5.00",
  secondMealBreakThresholdHours: "10.00",
  allowMealBreakWaiver: true,
  mealWaiverMaxShiftHours: "6.00",
  enableRestBreakEnforcement: true,
  restBreakMinutes: 10,
  restBreakIntervalHours: "4.00",
  restBreakIsPaid: true,
  enablePremiumPay: true,
  mealBreakPremiumHours: "1.00",
  restBreakPremiumHours: "1.00",
  requireClockOutAttestation: true,
  attestationMessage: "I confirm that I was provided with all required meal and rest breaks during my shift.",
  enableBreakAlerts: true,
  alertMinutesBeforeDeadline: 15,
  active: true,
};

export default function BreakRulesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, scopePayload } = useEmcFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BreakRule | null>(null);
  const [ruleForm, setRuleForm] = useState(DEFAULT_FORM);
  const [activeTab, setActiveTab] = useState("meal");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: rules = [], isLoading } = useQuery<BreakRule[]>({
    queryKey: ["/api/break-rules", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/break-rules${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch break rules");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/break-rules", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Break rule created." });
      setFormOpen(false);
      setEditingRule(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/break-rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/break-rules/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Break rule updated." });
      setFormOpen(false);
      setEditingRule(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/break-rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/break-rules/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Break rule deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/break-rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setRuleForm(DEFAULT_FORM);
    setEditingRule(null);
    setActiveTab("meal");
  };

  const openCreateDialog = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditDialog = (rule: BreakRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      stateCode: rule.stateCode,
      enableMealBreakEnforcement: rule.enableMealBreakEnforcement !== false,
      mealBreakMinutes: rule.mealBreakMinutes || 30,
      mealBreakThresholdHours: rule.mealBreakThresholdHours || "5.00",
      secondMealBreakThresholdHours: rule.secondMealBreakThresholdHours || "10.00",
      allowMealBreakWaiver: rule.allowMealBreakWaiver !== false,
      mealWaiverMaxShiftHours: rule.mealWaiverMaxShiftHours || "6.00",
      enableRestBreakEnforcement: rule.enableRestBreakEnforcement !== false,
      restBreakMinutes: rule.restBreakMinutes || 10,
      restBreakIntervalHours: rule.restBreakIntervalHours || "4.00",
      restBreakIsPaid: rule.restBreakIsPaid !== false,
      enablePremiumPay: rule.enablePremiumPay !== false,
      mealBreakPremiumHours: rule.mealBreakPremiumHours || "1.00",
      restBreakPremiumHours: rule.restBreakPremiumHours || "1.00",
      requireClockOutAttestation: rule.requireClockOutAttestation !== false,
      attestationMessage: rule.attestationMessage || DEFAULT_FORM.attestationMessage,
      enableBreakAlerts: rule.enableBreakAlerts !== false,
      alertMinutesBeforeDeadline: rule.alertMinutesBeforeDeadline || 15,
      active: rule.active !== false,
    });
    setFormOpen(true);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const data = {
      ...ruleForm,
      ...scopePayload,
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
              <CardTitle>{editingRule ? "Edit Break Rule" : "Create Break Rule"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  {editingRule ? "Save Changes" : "Create Rule"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="meal">Meal Breaks</TabsTrigger>
                  <TabsTrigger value="rest">Rest Breaks</TabsTrigger>
                  <TabsTrigger value="premium">Premium Pay</TabsTrigger>
                  <TabsTrigger value="alerts">Alerts</TabsTrigger>
                </TabsList>

                <TabsContent value="meal" className="space-y-4 mt-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Rule Name</Label>
                      <Input
                        id="name"
                        value={ruleForm.name}
                        onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                        placeholder="California Break Rules"
                        data-testid="input-rule-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stateCode">State</Label>
                      <Select
                        value={ruleForm.stateCode}
                        onValueChange={(v) => setRuleForm({ ...ruleForm, stateCode: v })}
                      >
                        <SelectTrigger data-testid="select-state-code">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATE_CODES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Meal Break Enforcement</Label>
                      <p className="text-sm text-muted-foreground">
                        Track and enforce meal break requirements
                      </p>
                    </div>
                    <Switch
                      checked={ruleForm.enableMealBreakEnforcement}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, enableMealBreakEnforcement: v })}
                      data-testid="switch-meal-enforcement"
                    />
                  </div>

                  {ruleForm.enableMealBreakEnforcement && (
                    <div className="grid grid-cols-3 gap-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label htmlFor="mealBreakMinutes">Meal Break Duration (minutes)</Label>
                        <Input
                          id="mealBreakMinutes"
                          type="number"
                          value={ruleForm.mealBreakMinutes}
                          onChange={(e) => setRuleForm({ ...ruleForm, mealBreakMinutes: parseInt(e.target.value) || 30 })}
                          data-testid="input-meal-duration"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mealBreakThresholdHours">First Meal Break Threshold (hours)</Label>
                        <Input
                          id="mealBreakThresholdHours"
                          value={ruleForm.mealBreakThresholdHours}
                          onChange={(e) => setRuleForm({ ...ruleForm, mealBreakThresholdHours: e.target.value })}
                          placeholder="5.00"
                          data-testid="input-meal-threshold"
                        />
                        <p className="text-xs text-muted-foreground">Must take meal break before this many hours</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="secondMealBreakThresholdHours">Second Meal Break Threshold (hours)</Label>
                        <Input
                          id="secondMealBreakThresholdHours"
                          value={ruleForm.secondMealBreakThresholdHours}
                          onChange={(e) => setRuleForm({ ...ruleForm, secondMealBreakThresholdHours: e.target.value })}
                          placeholder="10.00"
                          data-testid="input-second-meal-threshold"
                        />
                        <p className="text-xs text-muted-foreground">Second meal break required after this many hours</p>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Allow Meal Break Waiver</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow employees to waive meal break for short shifts
                      </p>
                    </div>
                    <Switch
                      checked={ruleForm.allowMealBreakWaiver}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, allowMealBreakWaiver: v })}
                      data-testid="switch-meal-waiver"
                    />
                  </div>

                  {ruleForm.allowMealBreakWaiver && (
                    <div className="pl-4 border-l-2 border-muted">
                      <div className="space-y-2 max-w-xs">
                        <Label htmlFor="mealWaiverMaxShiftHours">Max Shift Hours for Waiver</Label>
                        <Input
                          id="mealWaiverMaxShiftHours"
                          value={ruleForm.mealWaiverMaxShiftHours}
                          onChange={(e) => setRuleForm({ ...ruleForm, mealWaiverMaxShiftHours: e.target.value })}
                          placeholder="6.00"
                          data-testid="input-waiver-max-hours"
                        />
                        <p className="text-xs text-muted-foreground">
                          Employees can waive meal break only if shift is this many hours or less
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="rest" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Rest Break Enforcement</Label>
                      <p className="text-sm text-muted-foreground">
                        Track and enforce rest break requirements
                      </p>
                    </div>
                    <Switch
                      checked={ruleForm.enableRestBreakEnforcement}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, enableRestBreakEnforcement: v })}
                      data-testid="switch-rest-enforcement"
                    />
                  </div>

                  {ruleForm.enableRestBreakEnforcement && (
                    <div className="grid grid-cols-3 gap-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label htmlFor="restBreakMinutes">Rest Break Duration (minutes)</Label>
                        <Input
                          id="restBreakMinutes"
                          type="number"
                          value={ruleForm.restBreakMinutes}
                          onChange={(e) => setRuleForm({ ...ruleForm, restBreakMinutes: parseInt(e.target.value) || 10 })}
                          data-testid="input-rest-duration"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="restBreakIntervalHours">Rest Break Interval (hours)</Label>
                        <Input
                          id="restBreakIntervalHours"
                          value={ruleForm.restBreakIntervalHours}
                          onChange={(e) => setRuleForm({ ...ruleForm, restBreakIntervalHours: e.target.value })}
                          placeholder="4.00"
                          data-testid="input-rest-interval"
                        />
                        <p className="text-xs text-muted-foreground">One rest break required per this many hours worked</p>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Rest Breaks are Paid</Label>
                      <p className="text-sm text-muted-foreground">
                        Rest breaks count as paid work time (required in California)
                      </p>
                    </div>
                    <Switch
                      checked={ruleForm.restBreakIsPaid}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, restBreakIsPaid: v })}
                      data-testid="switch-rest-paid"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="premium" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Premium Pay for Missed Breaks</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically calculate premium pay owed for break violations
                      </p>
                    </div>
                    <Switch
                      checked={ruleForm.enablePremiumPay}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, enablePremiumPay: v })}
                      data-testid="switch-premium-pay"
                    />
                  </div>

                  {ruleForm.enablePremiumPay && (
                    <div className="grid grid-cols-3 gap-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label htmlFor="mealBreakPremiumHours">Meal Break Premium (hours)</Label>
                        <Input
                          id="mealBreakPremiumHours"
                          value={ruleForm.mealBreakPremiumHours}
                          onChange={(e) => setRuleForm({ ...ruleForm, mealBreakPremiumHours: e.target.value })}
                          placeholder="1.00"
                          data-testid="input-meal-premium"
                        />
                        <p className="text-xs text-muted-foreground">
                          Hours of pay owed for each missed meal break
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="restBreakPremiumHours">Rest Break Premium (hours)</Label>
                        <Input
                          id="restBreakPremiumHours"
                          value={ruleForm.restBreakPremiumHours}
                          onChange={(e) => setRuleForm({ ...ruleForm, restBreakPremiumHours: e.target.value })}
                          placeholder="1.00"
                          data-testid="input-rest-premium"
                        />
                        <p className="text-xs text-muted-foreground">
                          Hours of pay owed for each missed rest break
                        </p>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Require Clock-Out Attestation</Label>
                      <p className="text-sm text-muted-foreground">
                        Employees must confirm breaks were provided at clock-out
                      </p>
                    </div>
                    <Switch
                      checked={ruleForm.requireClockOutAttestation}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, requireClockOutAttestation: v })}
                      data-testid="switch-attestation"
                    />
                  </div>

                  {ruleForm.requireClockOutAttestation && (
                    <div className="pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label htmlFor="attestationMessage">Attestation Message</Label>
                        <Textarea
                          id="attestationMessage"
                          value={ruleForm.attestationMessage}
                          onChange={(e) => setRuleForm({ ...ruleForm, attestationMessage: e.target.value })}
                          rows={3}
                          data-testid="textarea-attestation"
                        />
                        <p className="text-xs text-muted-foreground">
                          Message displayed to employees at clock-out
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="alerts" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Break Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Send alerts when employees are approaching break deadlines
                      </p>
                    </div>
                    <Switch
                      checked={ruleForm.enableBreakAlerts}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, enableBreakAlerts: v })}
                      data-testid="switch-break-alerts"
                    />
                  </div>

                  {ruleForm.enableBreakAlerts && (
                    <div className="pl-4 border-l-2 border-muted">
                      <div className="space-y-2 max-w-xs">
                        <Label htmlFor="alertMinutesBeforeDeadline">Alert Minutes Before Deadline</Label>
                        <Input
                          id="alertMinutesBeforeDeadline"
                          type="number"
                          value={ruleForm.alertMinutesBeforeDeadline}
                          onChange={(e) => setRuleForm({ ...ruleForm, alertMinutesBeforeDeadline: parseInt(e.target.value) || 15 })}
                          data-testid="input-alert-minutes"
                        />
                        <p className="text-xs text-muted-foreground">
                          Send alert this many minutes before break deadline
                        </p>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Active</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable this break rule for the property
                      </p>
                    </div>
                    <Switch
                      checked={ruleForm.active}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, active: v })}
                      data-testid="switch-active"
                    />
                  </div>
                </TabsContent>
              </Tabs>
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">California Labor Compliance</h1>
          <p className="text-muted-foreground">
            Configure meal and rest break rules for labor law compliance
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Break Rule Configuration
          </CardTitle>
          <CardDescription>
            Set up break enforcement rules based on state labor laws. California requires a 30-minute meal break before the 5th hour and 10-minute paid rest breaks every 4 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-end gap-4">
            <Button onClick={openCreateDialog} data-testid="button-create-rule">
              <Plus className="w-4 h-4 mr-2" />
              Create Break Rule
            </Button>
          </div>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!isLoading && rules.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shield className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No Break Rules Configured</p>
              <p className="text-sm">Create a break rule to enable California labor compliance.</p>
            </div>
          )}

          {!isLoading && rules.length > 0 && (
            <div className="space-y-4">
              {rules.map((rule) => (
                <Card key={rule.id} className={rule.active ? "border-primary" : "opacity-60"}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{rule.name}</h3>
                          {rule.active && <Badge variant="default">Active</Badge>}
                          <Badge variant="outline">{rule.stateCode}</Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Coffee className="w-4 h-4 text-muted-foreground" />
                            <span>
                              Meal: {rule.mealBreakMinutes}min before {rule.mealBreakThresholdHours}hr
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <span>
                              Rest: {rule.restBreakMinutes}min every {rule.restBreakIntervalHours}hr
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            <span>
                              Premium: {rule.enablePremiumPay ? `${rule.mealBreakPremiumHours}hr` : "Disabled"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FileCheck className="w-4 h-4 text-muted-foreground" />
                            <span>
                              Attestation: {rule.requireClockOutAttestation ? "Required" : "Optional"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-2">
                          {rule.enableMealBreakEnforcement && (
                            <Badge variant="secondary">Meal Break Enforcement</Badge>
                          )}
                          {rule.enableRestBreakEnforcement && (
                            <Badge variant="secondary">Rest Break Enforcement</Badge>
                          )}
                          {rule.enableBreakAlerts && (
                            <Badge variant="secondary">Break Alerts ({rule.alertMinutesBeforeDeadline}min)</Badge>
                          )}
                          {rule.allowMealBreakWaiver && (
                            <Badge variant="outline">Waiver Allowed</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openEditDialog(rule)}
                          data-testid={`button-edit-rule-${rule.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => deleteMutation.mutate(rule.id)}
                          data-testid={`button-delete-rule-${rule.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {activeRule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              California Break Law Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Coffee className="w-4 h-4" /> Meal Break Requirements
                </h4>
                <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
                  <li>30-minute unpaid meal break before the 5th hour of work</li>
                  <li>Second 30-minute meal break if working more than 10 hours</li>
                  <li>Employee may waive meal break if shift is 6 hours or less</li>
                  <li>1 hour premium pay for each missed meal break</li>
                </ul>
              </div>
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Rest Break Requirements
                </h4>
                <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
                  <li>10-minute paid rest break per 4 hours worked</li>
                  <li>Should be taken in the middle of each 4-hour period</li>
                  <li>Cannot be combined with meal breaks</li>
                  <li>1 hour premium pay for each missed rest break</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

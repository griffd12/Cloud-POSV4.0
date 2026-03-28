import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Users,
  DollarSign,
  Clock,
  Building2,
  Percent,
  AlertCircle,
  Save,
} from "lucide-react";
import type { Property, JobCode, TipRule, TipRuleJobPercentage } from "@shared/schema";

type DistributionMethod = "tip_directly" | "pool_per_transaction" | "pool_by_hours_worked" | "pool_by_percentages";
type Timeframe = "daily" | "weekly";

const DISTRIBUTION_METHODS: Array<{ value: DistributionMethod; label: string; description: string; icon: React.ReactNode }> = [
  {
    value: "tip_directly",
    label: "Tip directly",
    description: "Transaction tips are attributed to the team member who collected the tip.",
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    value: "pool_per_transaction",
    label: "Pool tips per transaction",
    description: "Transaction tips are split equally among all tip-eligible team members clocked in at the time of the transaction.",
    icon: <Users className="w-5 h-5" />,
  },
  {
    value: "pool_by_hours_worked",
    label: "Pool tips by hours worked",
    description: "Transaction tips from sales made in a day or week are split among tip-eligible team members based on their hours worked.",
    icon: <Clock className="w-5 h-5" />,
  },
  {
    value: "pool_by_percentages",
    label: "Pool tips by percentages",
    description: "Transaction tips are split by percentages at the end of the day or week among tip-eligible jobs. Tip-eligible team members with the same job will receive tips based on hours worked.",
    icon: <Percent className="w-5 h-5" />,
  },
];

export default function TipRulesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, scopePayload } = useEmcFilter();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [formData, setFormData] = useState<{
    distributionMethod: DistributionMethod;
    timeframe: Timeframe;
    appliesToAllLocations: boolean;
    declareCashTips: boolean;
    declareCashTipsAllLocations: boolean;
    excludeManagers: boolean;
    minimumHoursForPool: string;
  }>({
    distributionMethod: "tip_directly",
    timeframe: "daily",
    appliesToAllLocations: false,
    declareCashTips: false,
    declareCashTipsAllLocations: false,
    excludeManagers: true,
    minimumHoursForPool: "0",
  });

  const [jobPercentages, setJobPercentages] = useState<Array<{ jobCodeId: string; percentage: string }>>([]);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      return res.json();
    },
  });

  const { data: jobCodes = [] } = useQuery<JobCode[]>({
    queryKey: ["/api/job-codes", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/job-codes${filterParam}`, { headers: getAuthHeaders() });
      return res.json();
    },
  });

  const tipEligibleJobs = jobCodes.filter(jc => jc.tipMode !== "not_eligible");

  const { data: existingRule, isLoading: ruleLoading } = useQuery<TipRule | null>({
    queryKey: ["/api/tip-rules/property", selectedPropertyId],
    enabled: !!selectedPropertyId,
    retry: false,
    queryFn: async () => {
      const res = await failoverFetch(`/api/tip-rules/property/${selectedPropertyId}`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch tip rule: ${res.statusText}`);
      }
      return res.json();
    },
  });

  const { data: existingPercentages = [] } = useQuery<TipRuleJobPercentage[]>({
    queryKey: ["/api/tip-rules", existingRule?.id, "percentages"],
    enabled: !!existingRule?.id,
  });

  useEffect(() => {
    if (existingRule) {
      setFormData({
        distributionMethod: (existingRule.distributionMethod as DistributionMethod) || "tip_directly",
        timeframe: (existingRule.timeframe as Timeframe) || "daily",
        appliesToAllLocations: existingRule.appliesToAllLocations || false,
        declareCashTips: existingRule.declareCashTips || false,
        declareCashTipsAllLocations: existingRule.declareCashTipsAllLocations || false,
        excludeManagers: existingRule.excludeManagers !== false,
        minimumHoursForPool: existingRule.minimumHoursForPool || "0",
      });
    } else {
      setFormData({
        distributionMethod: "tip_directly",
        timeframe: "daily",
        appliesToAllLocations: false,
        declareCashTips: false,
        declareCashTipsAllLocations: false,
        excludeManagers: true,
        minimumHoursForPool: "0",
      });
    }
    setHasUnsavedChanges(false);
  }, [existingRule]);

  useEffect(() => {
    if (existingPercentages.length > 0) {
      setJobPercentages(existingPercentages.map(p => ({
        jobCodeId: p.jobCodeId,
        percentage: p.percentage || "0",
      })));
    } else if (tipEligibleJobs.length > 0 && formData.distributionMethod === "pool_by_percentages") {
      const equalPercentage = (100 / tipEligibleJobs.length).toFixed(2);
      setJobPercentages(tipEligibleJobs.map(jc => ({
        jobCodeId: jc.id,
        percentage: equalPercentage,
      })));
    }
  }, [existingPercentages, tipEligibleJobs.length, formData.distributionMethod]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const property = properties.find(p => p.id === selectedPropertyId);
      const payload = {
        ...scopePayload,
        name: `Tip Rules - ${property?.name || "Property"}`,
        ...formData,
      };

      let rule: TipRule;
      if (existingRule) {
        const res = await apiRequest("PATCH", `/api/tip-rules/${existingRule.id}`, payload);
        rule = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/tip-rules", payload);
        rule = await res.json();
      }

      if (formData.distributionMethod === "pool_by_percentages" && jobPercentages.length > 0) {
        await apiRequest("PUT", `/api/tip-rules/${rule.id}/percentages`, { percentages: jobPercentages });
      }

      return rule;
    },
    onSuccess: (rule) => {
      toast({ title: "Success", description: "Tip rules saved successfully." });
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tip-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tip-rules/property", selectedPropertyId] });
      if (rule?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/tip-rules", rule.id, "percentages"] });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleFormChange = <K extends keyof typeof formData>(key: K, value: typeof formData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  };

  const handlePercentageChange = (jobCodeId: string, percentage: string) => {
    setJobPercentages(prev => {
      const existing = prev.find(p => p.jobCodeId === jobCodeId);
      if (existing) {
        return prev.map(p => p.jobCodeId === jobCodeId ? { ...p, percentage } : p);
      }
      return [...prev, { jobCodeId, percentage }];
    });
    setHasUnsavedChanges(true);
  };

  const totalPercentage = jobPercentages.reduce((sum, p) => sum + parseFloat(p.percentage || "0"), 0);
  const isPercentageValid = Math.abs(totalPercentage - 100) < 0.01;

  const getJobCodeName = (id: string) => jobCodes.find(jc => jc.id === id)?.name || "Unknown";

  if (properties.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Properties Found</h3>
            <p className="text-muted-foreground">
              Create a property first to configure tip rules.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-tip-rules-title">Tips</h1>
          <p className="text-muted-foreground">
            Choose how team members earn tips. Federal and state laws regulate tip distribution methods.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (existingRule) {
                setFormData({
                  distributionMethod: (existingRule.distributionMethod as DistributionMethod) || "tip_directly",
                  timeframe: (existingRule.timeframe as Timeframe) || "daily",
                  appliesToAllLocations: existingRule.appliesToAllLocations || false,
                  declareCashTips: existingRule.declareCashTips || false,
                  declareCashTipsAllLocations: existingRule.declareCashTipsAllLocations || false,
                  excludeManagers: existingRule.excludeManagers !== false,
                  minimumHoursForPool: existingRule.minimumHoursForPool || "0",
                });
              }
              setHasUnsavedChanges(false);
            }}
            disabled={!hasUnsavedChanges}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!hasUnsavedChanges || saveMutation.isPending || (formData.distributionMethod === "pool_by_percentages" && !isPercentageValid)}
            data-testid="button-save"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {selectedPropertyId ? (
        <>
          {ruleLoading ? (
            <Card>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Distribution method</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={formData.distributionMethod}
                    onValueChange={(value) => handleFormChange("distributionMethod", value as DistributionMethod)}
                    className="space-y-3"
                  >
                    {DISTRIBUTION_METHODS.map((method) => (
                      <label
                        key={method.value}
                        className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                          formData.distributionMethod === method.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover-elevate"
                        }`}
                        data-testid={`radio-distribution-${method.value}`}
                      >
                        <RadioGroupItem value={method.value} className="mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 font-medium">
                            {method.icon}
                            {method.label}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {method.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>

              {(formData.distributionMethod === "pool_by_hours_worked" || formData.distributionMethod === "pool_by_percentages") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Time frame</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={formData.timeframe}
                      onValueChange={(value) => handleFormChange("timeframe", value as Timeframe)}
                      className="flex gap-4"
                    >
                      <label
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${
                          formData.timeframe === "daily" ? "border-primary bg-primary/5" : "border-border hover-elevate"
                        }`}
                        data-testid="radio-timeframe-daily"
                      >
                        <RadioGroupItem value="daily" />
                        <span>24-hour workday</span>
                      </label>
                      <label
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${
                          formData.timeframe === "weekly" ? "border-primary bg-primary/5" : "border-border hover-elevate"
                        }`}
                        data-testid="radio-timeframe-weekly"
                      >
                        <RadioGroupItem value="weekly" />
                        <span>7-day workweek</span>
                      </label>
                    </RadioGroup>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Apply to</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={formData.appliesToAllLocations ? "all" : "this"}
                    onValueChange={(value) => handleFormChange("appliesToAllLocations", value === "all")}
                    className="flex gap-4"
                  >
                    <label
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${
                        !formData.appliesToAllLocations ? "border-primary bg-primary/5" : "border-border hover-elevate"
                      }`}
                      data-testid="radio-scope-this"
                    >
                      <RadioGroupItem value="this" />
                      <span>Only this location</span>
                    </label>
                    <label
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${
                        formData.appliesToAllLocations ? "border-primary bg-primary/5" : "border-border hover-elevate"
                      }`}
                      data-testid="radio-scope-all"
                    >
                      <RadioGroupItem value="all" />
                      <span>All locations</span>
                    </label>
                  </RadioGroup>
                </CardContent>
              </Card>

              {formData.distributionMethod === "pool_by_percentages" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      Job Percentages
                      {!isPercentageValid && (
                        <span className="text-sm font-normal text-destructive flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          Total must equal 100%
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Configure tip distribution percentages for each job. Currently: {totalPercentage.toFixed(2)}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {tipEligibleJobs.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        No tip-eligible jobs configured. Update job codes to enable tip eligibility.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Job</TableHead>
                            <TableHead className="w-32">Percentage</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tipEligibleJobs.map(job => {
                            const current = jobPercentages.find(p => p.jobCodeId === job.id);
                            return (
                              <TableRow key={job.id}>
                                <TableCell className="font-medium">{job.name}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={current?.percentage || "0"}
                                      onChange={(e) => handlePercentageChange(job.id, e.target.value)}
                                      className="w-20"
                                      data-testid={`input-percentage-${job.id}`}
                                    />
                                    <span className="text-muted-foreground">%</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}

              <Separator />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-4">
                    <Switch
                      checked={formData.declareCashTips}
                      onCheckedChange={(checked) => handleFormChange("declareCashTips", checked)}
                      data-testid="switch-declare-cash-tips"
                    />
                    Declare cash tips
                  </CardTitle>
                  <CardDescription>
                    Tip-eligible team members can input their cash tips from the shift report or when they clock out.
                  </CardDescription>
                </CardHeader>
                {formData.declareCashTips && (
                  <CardContent>
                    <RadioGroup
                      value={formData.declareCashTipsAllLocations ? "all" : "this"}
                      onValueChange={(value) => handleFormChange("declareCashTipsAllLocations", value === "all")}
                      className="flex gap-4"
                    >
                      <label
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${
                          !formData.declareCashTipsAllLocations ? "border-primary bg-primary/5" : "border-border hover-elevate"
                        }`}
                        data-testid="radio-cash-scope-this"
                      >
                        <RadioGroupItem value="this" />
                        <span>Only this location</span>
                      </label>
                      <label
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${
                          formData.declareCashTipsAllLocations ? "border-primary bg-primary/5" : "border-border hover-elevate"
                        }`}
                        data-testid="radio-cash-scope-all"
                      >
                        <RadioGroupItem value="all" />
                        <span>All locations</span>
                      </label>
                    </RadioGroup>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Exclude Managers</Label>
                      <p className="text-sm text-muted-foreground">
                        Managers will not participate in tip pooling.
                      </p>
                    </div>
                    <Switch
                      checked={formData.excludeManagers}
                      onCheckedChange={(checked) => handleFormChange("excludeManagers", checked)}
                      data-testid="switch-exclude-managers"
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Property Selected</h3>
            <p className="text-muted-foreground">
              Select a property from the filter bar to configure tip rules.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

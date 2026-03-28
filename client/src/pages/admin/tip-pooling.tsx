import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import {
  DollarSign,
  Plus,
  Play,
  Settings,
  Users,
  Receipt,
} from "lucide-react";
import type { Property, Employee, TipPoolPolicy, TipPoolRun, TipAllocation } from "@shared/schema";

export default function TipPoolingPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, scopePayload, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedProperty, setSelectedProperty] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedProperty(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [isCreatingPolicy, setIsCreatingPolicy] = useState(false);
  const [isRunningSettlement, setIsRunningSettlement] = useState(false);
  const [settlementDate, setSettlementDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [policyForm, setPolicyForm] = useState({
    name: "",
    calcMethod: "hours_based",
    poolPercentage: "100",
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

  const { data: policies = [], isLoading: policiesLoading } = useQuery<TipPoolPolicy[]>({
    queryKey: ["/api/tip-pool-policies", selectedProperty, filterKeys],
    enabled: !!selectedProperty,
    queryFn: async () => {
      const entParam = selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : "";
      const res = await failoverFetch(`/api/tip-pool-policies?propertyId=${selectedProperty}${entParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch policies");
      return res.json();
    },
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery<TipPoolRun[]>({
    queryKey: ["/api/tip-pool-runs", selectedProperty, filterKeys],
    enabled: !!selectedProperty,
    queryFn: async () => {
      const entParam = selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : "";
      const res = await failoverFetch(`/api/tip-pool-runs?propertyId=${selectedProperty}${entParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch runs");
      return res.json();
    },
  });

  const [selectedRun, setSelectedRun] = useState<TipPoolRun | null>(null);

  const { data: allocations = [] } = useQuery<TipAllocation[]>({
    queryKey: ["/api/tip-pool-runs", selectedRun?.id, "allocations"],
    enabled: !!selectedRun,
  });

  const createPolicyMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/tip-pool-policies", { ...data, ...scopePayload });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Tip pool policy created." });
      setIsCreatingPolicy(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tip-pool-policies"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const runSettlementMutation = useMutation({
    mutationFn: async (data: { propertyId: string; businessDate: string; policyId: string }) => {
      return apiRequest("POST", "/api/tip-pool-settlement", {
        ...data,
        ...scopePayload,
        runById: "current-manager", // Would come from auth context
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Tip pool settlement completed." });
      setIsRunningSettlement(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tip-pool-runs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
  };

  const formatCurrency = (amount: string | number | null) => {
    if (!amount) return "$0.00";
    return `$${parseFloat(String(amount)).toFixed(2)}`;
  };

  const handleCancelPolicy = () => {
    setIsCreatingPolicy(false);
    setPolicyForm({ name: "", calcMethod: "hours_based", poolPercentage: "100" });
  };

  const handleCancelSettlement = () => {
    setIsRunningSettlement(false);
    setSelectedPolicyId("");
  };

  if (isCreatingPolicy) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>Create Tip Pool Policy</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelPolicy} data-testid="button-cancel-policy">
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    createPolicyMutation.mutate({
                      propertyId: selectedProperty,
                      name: policyForm.name,
                      calculationMethod: policyForm.calcMethod,
                      active: true,
                    });
                  }}
                  disabled={createPolicyMutation.isPending || !policyForm.name}
                  data-testid="button-save-policy"
                >
                  Create Policy
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Policy Name</label>
                  <Input
                    value={policyForm.name}
                    onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                    placeholder="e.g., Front of House Pool"
                    data-testid="input-policy-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Calculation Method</label>
                  <Select
                    value={policyForm.calcMethod}
                    onValueChange={(v) => setPolicyForm({ ...policyForm, calcMethod: v })}
                  >
                    <SelectTrigger data-testid="select-calc-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours_based">Hours Based</SelectItem>
                      <SelectItem value="points_based">Points Based</SelectItem>
                      <SelectItem value="equal_split">Equal Split</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Pool Percentage</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={policyForm.poolPercentage}
                    onChange={(e) => setPolicyForm({ ...policyForm, poolPercentage: e.target.value })}
                    data-testid="input-pool-percentage"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isRunningSettlement) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>Run Tip Pool Settlement</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelSettlement} data-testid="button-cancel-settlement">
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    runSettlementMutation.mutate({
                      propertyId: selectedProperty,
                      businessDate: settlementDate,
                      policyId: selectedPolicyId,
                    });
                  }}
                  disabled={runSettlementMutation.isPending || !selectedPolicyId}
                  data-testid="button-execute-settlement"
                >
                  Run Settlement
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Business Date</label>
                  <Input
                    type="date"
                    value={settlementDate}
                    onChange={(e) => setSettlementDate(e.target.value)}
                    data-testid="input-settlement-date"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Policy</label>
                  <Select
                    value={selectedPolicyId}
                    onValueChange={setSelectedPolicyId}
                  >
                    <SelectTrigger data-testid="select-settlement-policy">
                      <SelectValue placeholder="Select a policy..." />
                    </SelectTrigger>
                    <SelectContent>
                      {policies.filter((p) => p.active).map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-tip-pooling-title">Tip Pooling</h1>
          <p className="text-muted-foreground">Manage tip pool policies and run settlements</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsCreatingPolicy(true)}
            disabled={!selectedProperty}
            data-testid="button-create-policy"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Policy
          </Button>
          <Button
            onClick={() => setIsRunningSettlement(true)}
            disabled={!selectedProperty || policies.length === 0}
            data-testid="button-run-settlement"
          >
            <Play className="w-4 h-4 mr-2" />
            Run Settlement
          </Button>
        </div>
      </div>

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

      {!selectedProperty ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select a property to manage tip pooling
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="policies">
          <TabsList>
            <TabsTrigger value="policies" data-testid="tab-policies">
              <Settings className="w-4 h-4 mr-2" />
              Policies
            </TabsTrigger>
            <TabsTrigger value="runs" data-testid="tab-runs">
              <Receipt className="w-4 h-4 mr-2" />
              Settlement Runs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="policies" className="space-y-4">
            {policiesLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : policies.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No tip pool policies configured. Create one to get started.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {policies.map((policy) => (
                  <Card key={policy.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        {policy.name}
                      </CardTitle>
                      <CardDescription>
                        {policy.active ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Method:</span>
                        <Badge variant="outline">{policy.calculationMethod || "hours_based"}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="runs" className="space-y-4">
            {runsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : runs.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No settlement runs yet. Run a settlement to distribute tips.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Settlement History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Total Tips</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((run) => (
                          <TableRow
                            key={run.id}
                            className={selectedRun?.id === run.id ? "bg-muted" : ""}
                          >
                            <TableCell>{run.businessDate}</TableCell>
                            <TableCell className="font-semibold">
                              {formatCurrency(run.totalTips)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={run.status === "completed" ? "default" : "secondary"}>
                                {run.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedRun(run)}
                                data-testid={`button-view-run-${run.id}`}
                              >
                                <Users className="w-4 h-4 mr-1" />
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {selectedRun && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Allocations - {selectedRun.businessDate}</span>
                        <Badge>{formatCurrency(selectedRun.totalTips)} Total</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Hours</TableHead>
                            <TableHead>Direct Tips</TableHead>
                            <TableHead>Pool Share</TableHead>
                            <TableHead>Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allocations.map((alloc) => (
                            <TableRow key={alloc.id}>
                              <TableCell className="font-medium">
                                {getEmployeeName(alloc.employeeId)}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {parseFloat(alloc.hoursWorked || "0").toFixed(2)}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatCurrency(alloc.directTips)}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatCurrency(alloc.allocatedAmount)}
                              </TableCell>
                              <TableCell className="tabular-nums font-semibold">
                                {formatCurrency(alloc.totalTips)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

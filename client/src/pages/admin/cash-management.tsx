import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { apiRequest, queryClient, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, DollarSign, ArrowDownToLine, ArrowUpFromLine, Wallet, Banknote, Lock } from "lucide-react";
import type { Property, CashDrawer, DrawerAssignment, CashTransaction, SafeCount } from "@shared/schema";

export default function CashManagementPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [showDrawerForm, setShowDrawerForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showSafeCountForm, setShowSafeCountForm] = useState(false);
  const [editingDrawer, setEditingDrawer] = useState<CashDrawer | null>(null);
  const [transactionType, setTransactionType] = useState<string>("paid_in");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionReason, setTransactionReason] = useState("");
  const [selectedDrawerId, setSelectedDrawerId] = useState<string>("");

  const [drawerName, setDrawerName] = useState("");
  const [drawerStartingBalance, setDrawerStartingBalance] = useState("");
  
  const [safeAmount, setSafeAmount] = useState("");
  const [safeNotes, setSafeNotes] = useState("");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: cashDrawers = [], isLoading: drawersLoading } = useQuery<CashDrawer[]>({
    queryKey: ["/api/cash-drawers", { propertyId: selectedPropertyId, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/cash-drawers?propertyId=${selectedPropertyId}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch cash drawers");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: drawerAssignments = [] } = useQuery<DrawerAssignment[]>({
    queryKey: ["/api/drawer-assignments", { propertyId: selectedPropertyId, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/drawer-assignments?propertyId=${selectedPropertyId}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch drawer assignments");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: cashTransactions = [] } = useQuery<CashTransaction[]>({
    queryKey: ["/api/cash-transactions", { propertyId: selectedPropertyId, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/cash-transactions?propertyId=${selectedPropertyId}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch cash transactions");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: safeCounts = [] } = useQuery<SafeCount[]>({
    queryKey: ["/api/safe-counts", { propertyId: selectedPropertyId, enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const baseUrl = `/api/safe-counts?propertyId=${selectedPropertyId}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch safe counts");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const createDrawerMutation = useMutation({
    mutationFn: async (data: { name: string; propertyId: string }) => {
      const res = await apiRequest("POST", "/api/cash-drawers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers", { propertyId: selectedPropertyId, enterpriseId: selectedEnterpriseId }] });
      handleCancelDrawer();
      toast({ title: "Drawer Created", description: "Cash drawer has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (data: { drawerId: string; transactionType: string; amount: string; reason: string; propertyId: string }) => {
      const res = await apiRequest("POST", "/api/cash-transactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-transactions", { propertyId: selectedPropertyId, enterpriseId: selectedEnterpriseId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers", { propertyId: selectedPropertyId, enterpriseId: selectedEnterpriseId }] });
      handleCancelTransaction();
      toast({ title: "Transaction Recorded", description: "Cash transaction has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createSafeCountMutation = useMutation({
    mutationFn: async (data: { propertyId: string; actualAmount: string; businessDate: string; countType: string; employeeId?: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/safe-counts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safe-counts", { propertyId: selectedPropertyId, enterpriseId: selectedEnterpriseId }] });
      handleCancelSafeCount();
      toast({ title: "Safe Count Recorded", description: "Safe count has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetDrawerForm = () => {
    setDrawerName("");
    setDrawerStartingBalance("");
    setEditingDrawer(null);
  };

  const resetTransactionForm = () => {
    setTransactionType("paid_in");
    setTransactionAmount("");
    setTransactionReason("");
    setSelectedDrawerId("");
  };

  const resetSafeCountForm = () => {
    setSafeAmount("");
    setSafeNotes("");
  };

  const handleCancelDrawer = () => {
    setShowDrawerForm(false);
    setEditingDrawer(null);
    resetDrawerForm();
  };

  const handleCancelTransaction = () => {
    setShowTransactionForm(false);
    resetTransactionForm();
  };

  const handleCancelSafeCount = () => {
    setShowSafeCountForm(false);
    resetSafeCountForm();
  };

  const handleCreateDrawer = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!drawerName || !selectedPropertyId) return;
    createDrawerMutation.mutate({
      name: drawerName,
      propertyId: selectedPropertyId,
    });
  };

  const handleCreateTransaction = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedDrawerId || !transactionAmount || !transactionReason) return;
    createTransactionMutation.mutate({
      drawerId: selectedDrawerId,
      transactionType,
      amount: transactionAmount,
      reason: transactionReason,
      propertyId: selectedPropertyId,
    });
  };

  const handleCreateSafeCount = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!safeAmount || !selectedPropertyId) return;
    createSafeCountMutation.mutate({
      propertyId: selectedPropertyId,
      actualAmount: safeAmount,
      businessDate: format(new Date(), "yyyy-MM-dd"),
      countType: "daily",
      notes: safeNotes || undefined,
    });
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "$0.00";
    return `$${parseFloat(value).toFixed(2)}`;
  };

  const transactionTypes = [
    { value: "paid_in", label: "Paid In", icon: ArrowDownToLine },
    { value: "paid_out", label: "Paid Out", icon: ArrowUpFromLine },
    { value: "drop", label: "Drop", icon: Lock },
    { value: "pickup", label: "Pickup", icon: Banknote },
  ];

  if (showDrawerForm) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Add Cash Drawer</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelDrawer} data-testid="button-cancel-drawer">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateDrawer}
                  disabled={!drawerName || createDrawerMutation.isPending}
                  data-testid="button-save-drawer"
                >
                  {createDrawerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Drawer
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateDrawer} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Drawer Name</Label>
                  <Input value={drawerName} onChange={(e) => setDrawerName(e.target.value)} placeholder="e.g., Register 1" data-testid="input-drawer-name" />
                </div>
                <div className="space-y-2">
                  <Label>Starting Balance</Label>
                  <Input type="number" step="0.01" value={drawerStartingBalance} onChange={(e) => setDrawerStartingBalance(e.target.value)} placeholder="0.00" data-testid="input-starting-balance" />
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showTransactionForm) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Record Cash Transaction</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelTransaction} data-testid="button-cancel-transaction">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateTransaction}
                  disabled={!selectedDrawerId || !transactionAmount || !transactionReason || createTransactionMutation.isPending}
                  data-testid="button-save-tx"
                >
                  {createTransactionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Record Transaction
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTransaction} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Drawer</Label>
                  <Select value={selectedDrawerId} onValueChange={setSelectedDrawerId}>
                    <SelectTrigger data-testid="select-drawer">
                      <SelectValue placeholder="Select drawer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cashDrawers.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <Select value={transactionType} onValueChange={setTransactionType}>
                    <SelectTrigger data-testid="select-tx-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {transactionTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input type="number" step="0.01" value={transactionAmount} onChange={(e) => setTransactionAmount(e.target.value)} placeholder="0.00" data-testid="input-tx-amount" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea value={transactionReason} onChange={(e) => setTransactionReason(e.target.value)} placeholder="Reason for transaction..." data-testid="input-tx-reason" />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showSafeCountForm) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Record Safe Count</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelSafeCount} data-testid="button-cancel-safe-count">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateSafeCount}
                  disabled={!safeAmount || createSafeCountMutation.isPending}
                  data-testid="button-save-safe-count"
                >
                  {createSafeCountMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Record Count
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSafeCount} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Counted Amount</Label>
                  <Input type="number" step="0.01" value={safeAmount} onChange={(e) => setSafeAmount(e.target.value)} placeholder="0.00" data-testid="input-safe-amount" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea value={safeNotes} onChange={(e) => setSafeNotes(e.target.value)} placeholder="Any notes..." data-testid="input-safe-notes" />
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Cash Management</h1>
          <p className="text-muted-foreground">Manage cash drawers, transactions, and safe counts</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Property</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-64" data-testid="select-property">
              <SelectValue placeholder="Select a property..." />
            </SelectTrigger>
            <SelectContent>
              {properties.map(prop => (
                <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedPropertyId && (
        <Tabs defaultValue="drawers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="drawers" data-testid="tab-drawers">Cash Drawers</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">Transactions</TabsTrigger>
            <TabsTrigger value="safe" data-testid="tab-safe">Safe Counts</TabsTrigger>
          </TabsList>

          <TabsContent value="drawers" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowDrawerForm(true)} data-testid="button-add-drawer">
                <Plus className="w-4 h-4 mr-2" />
                Add Drawer
              </Button>
            </div>

            {drawersLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : cashDrawers.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No cash drawers configured.</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cashDrawers.map(drawer => (
                  <Card key={drawer.id} data-testid={`card-drawer-${drawer.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Wallet className="w-4 h-4" />
                        {drawer.name}
                      </CardTitle>
                      <CardDescription>
                        <Badge variant={drawer.active ? "default" : "secondary"}>{drawer.active ? "Active" : "Inactive"}</Badge>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Workstation</span>
                          <span className="font-medium">{drawer.workstationId || "Unassigned"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowTransactionForm(true)} data-testid="button-add-transaction">
                <Plus className="w-4 h-4 mr-2" />
                Record Transaction
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Drawer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashTransactions.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions recorded.</TableCell></TableRow>
                    ) : (
                      cashTransactions.map(tx => (
                        <TableRow key={tx.id} data-testid={`row-tx-${tx.id}`}>
                          <TableCell>{tx.createdAt ? format(new Date(tx.createdAt), "MMM d, h:mm a") : "-"}</TableCell>
                          <TableCell>{cashDrawers.find(d => d.id === tx.drawerId)?.name || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{tx.transactionType?.replace("_", " ")}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(tx.amount)}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{tx.reason}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="safe" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowSafeCountForm(true)} data-testid="button-add-safe-count">
                <Plus className="w-4 h-4 mr-2" />
                Record Safe Count
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead className="text-right">Counted Amount</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {safeCounts.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No safe counts recorded.</TableCell></TableRow>
                    ) : (
                      safeCounts.map(count => (
                        <TableRow key={count.id} data-testid={`row-safe-${count.id}`}>
                          <TableCell>{count.createdAt ? format(new Date(count.createdAt), "MMM d, h:mm a") : "-"}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(count.actualAmount)}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{count.notes || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

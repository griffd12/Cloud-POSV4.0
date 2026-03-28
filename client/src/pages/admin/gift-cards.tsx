import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { useToast } from "@/hooks/use-toast";
import { DataTable, Column, CustomAction } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { insertGiftCardSchema, type GiftCard, type GiftCardTransaction, type InsertGiftCard } from "@shared/schema";
import { CreditCard, Search, Plus, DollarSign, RefreshCw, History, Ban, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";

export default function GiftCardsPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GiftCard | null>(null);
  const [lookupDialogOpen, setLookupDialogOpen] = useState(false);
  const [lookupCardNumber, setLookupCardNumber] = useState("");
  const [selectedCard, setSelectedCard] = useState<GiftCard | null>(null);
  const [cardDetailOpen, setCardDetailOpen] = useState(false);
  const [reloadDialogOpen, setReloadDialogOpen] = useState(false);
  const [reloadAmount, setReloadAmount] = useState("");
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState("");

  const [cardNumber, setCardNumber] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [pin, setPin] = useState("");
  const [cardStatus, setCardStatus] = useState("active");

  const { data: giftCards = [], isLoading } = useQuery<GiftCard[]>({
    queryKey: ["/api/gift-cards", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/gift-cards${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch gift cards");
      return res.json();
    },
  });

  const { data: cardTransactions = [] } = useQuery<GiftCardTransaction[]>({
    queryKey: ["/api/gift-cards", selectedCard?.id, "transactions", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/gift-cards/${selectedCard?.id}/transactions${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!selectedCard?.id,
  });

  const columns: Column<GiftCard>[] = [
    { key: "cardNumber", header: "Card Number", sortable: true },
    {
      key: "currentBalance",
      header: "Balance",
      render: (value) => `$${parseFloat(value || "0").toFixed(2)}`,
      sortable: true,
    },
    {
      key: "initialBalance",
      header: "Initial Value",
      render: (value) => `$${parseFloat(value || "0").toFixed(2)}`,
    },
    {
      key: "status",
      header: "Status",
      render: (value) => {
        const variants: Record<string, "default" | "secondary" | "destructive"> = {
          active: "default",
          inactive: "secondary",
          suspended: "destructive",
          expired: "destructive",
        };
        return <Badge variant={variants[value] || "secondary"}>{value}</Badge>;
      },
    },
    {
      key: "expiresAt",
      header: "Expires",
      render: (value) => value ? format(new Date(value), "MMM d, yyyy") : "Never",
    },
    {
      key: "createdAt",
      header: "Created",
      render: (value) => value ? format(new Date(value), "MMM d, yyyy") : "-",
    },
    getScopeColumn(),
    getZoneColumn<GiftCard>(scopeLookup),
    getInheritanceColumn<GiftCard>(selectedPropertyId, selectedRvcId),
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertGiftCard) => {
      const cardData = {
        ...data,
        currentBalance: data.initialBalance,
        cardNumber: data.cardNumber || generateCardNumber(),
      };
      const response = await apiRequest("POST", "/api/gift-cards", cardData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards", filterKeys] });
      setFormOpen(false);
      resetForm();
      toast({ title: "Gift card created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create gift card", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: GiftCard) => {
      const response = await apiRequest("PUT", "/api/gift-cards/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Gift card updated" });
    },
    onError: () => {
      toast({ title: "Failed to update gift card", variant: "destructive" });
    },
  });

  const reloadMutation = useMutation({
    mutationFn: async ({ cardId, amount }: { cardId: string; amount: string }) => {
      const response = await apiRequest("POST", `/api/gift-cards/${cardId}/reload`, { amount });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards", selectedCard?.id, "transactions", filterKeys] });
      setReloadDialogOpen(false);
      setReloadAmount("");
      toast({ title: "Card reloaded successfully" });
    },
    onError: () => {
      toast({ title: "Failed to reload card", variant: "destructive" });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async ({ cardId, amount }: { cardId: string; amount: string }) => {
      const response = await apiRequest("POST", `/api/gift-cards/${cardId}/redeem`, { amount });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards", selectedCard?.id, "transactions", filterKeys] });
      setRedeemDialogOpen(false);
      setRedeemAmount("");
      toast({ title: "Redemption successful" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to redeem", variant: "destructive" });
    },
  });

  const lookupMutation = useMutation({
    mutationFn: async (cardNumber: string) => {
      const response = await apiRequest("GET", `/api/gift-cards/lookup/${cardNumber}`);
      return response.json();
    },
    onSuccess: (data) => {
      setSelectedCard(data);
      setLookupDialogOpen(false);
      setCardDetailOpen(true);
      setLookupCardNumber("");
    },
    onError: () => {
      toast({ title: "Card not found", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setCardNumber("");
    setInitialBalance("");
    setPin("");
    setCardStatus("active");
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    resetForm();
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, cardNumber: cardNumber || editingItem.cardNumber, initialBalance, pin: pin || editingItem.pin, status: cardStatus });
    } else {
      createMutation.mutate({ cardNumber, initialBalance, pin, status: cardStatus, ...scopePayload } as any);
    }
  };

  const handleEdit = (item: GiftCard) => {
    setEditingItem(item);
    setCardNumber(item.cardNumber || "");
    setInitialBalance(item.initialBalance || "");
    setPin("");
    setCardStatus(item.status || "active");
    setFormOpen(true);
  };

  const handleViewDetails = (item: GiftCard) => {
    setSelectedCard(item);
    setCardDetailOpen(true);
  };

  const customActions: CustomAction<GiftCard>[] = [
    {
      label: "View Details",
      icon: History,
      onClick: handleViewDetails,
    },
  ];

  function generateCardNumber(): string {
    const prefix = "GC";
    const random = Math.floor(Math.random() * 10000000000).toString().padStart(10, "0");
    return prefix + random;
  }

  const activeCards = giftCards.filter(c => c.status === "active");
  const totalBalance = giftCards.reduce((sum, c) => sum + parseFloat(c.currentBalance || "0"), 0);
  const totalActive = activeCards.reduce((sum, c) => sum + parseFloat(c.currentBalance || "0"), 0);

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>{editingItem ? "Edit Gift Card" : "Issue New Gift Card"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-card">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!initialBalance || createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-card"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Card Number</Label>
                  <Input
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="Auto-generated if blank"
                    data-testid="input-card-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Initial Balance ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="25.00"
                    data-testid="input-initial-balance"
                  />
                </div>
                <div className="space-y-2">
                  <Label>PIN (optional)</Label>
                  <Input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="4-digit PIN"
                    data-testid="input-pin"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={cardStatus} onValueChange={setCardStatus}>
                    <SelectTrigger data-testid="select-card-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-gift-cards-title">Gift Cards</h1>
          <p className="text-muted-foreground">Manage gift card issuance, balance, and redemptions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLookupDialogOpen(true)} data-testid="button-lookup-card">
            <Search className="w-4 h-4 mr-2" />
            Lookup Card
          </Button>
          <Button onClick={() => { setEditingItem(null); resetForm(); setFormOpen(true); }} data-testid="button-create-card">
            <Plus className="w-4 h-4 mr-2" />
            Issue New Card
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cards</CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-total-cards">{giftCards.length}</div>
            <p className="text-xs text-muted-foreground">{activeCards.length} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outstanding</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-total-balance">${totalBalance.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Liability on books</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Balance</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-active-balance">${totalActive.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Redeemable value</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={giftCards}
        columns={columns}
        onEdit={handleEdit}
        customActions={customActions}
        isLoading={isLoading}
        emptyMessage="No gift cards issued yet"
        hideSearch
      />

      <Dialog open={lookupDialogOpen} onOpenChange={setLookupDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lookup Gift Card</DialogTitle>
            <DialogDescription>Enter the card number to check balance and details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cardNumber">Card Number</Label>
              <Input
                id="cardNumber"
                value={lookupCardNumber}
                onChange={(e) => setLookupCardNumber(e.target.value)}
                placeholder="Enter card number"
                data-testid="input-lookup-card-number"
              />
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setLookupDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => lookupMutation.mutate(lookupCardNumber)}
              disabled={!lookupCardNumber || lookupMutation.isPending}
              data-testid="button-lookup-submit"
            >
              <Search className="w-4 h-4 mr-2" />
              Lookup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cardDetailOpen} onOpenChange={setCardDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Gift Card Details</DialogTitle>
            <DialogDescription>Card: {selectedCard?.cardNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedCard && (
              <Tabs defaultValue="info" className="mt-4">
                <TabsList>
                  <TabsTrigger value="info">Card Info</TabsTrigger>
                  <TabsTrigger value="history">Transaction History</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Balance</p>
                      <p className="text-3xl font-bold text-green-600" data-testid="text-card-balance">
                        ${parseFloat(selectedCard.currentBalance || "0").toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={selectedCard.status === "active" ? "default" : "secondary"}>
                        {selectedCard.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Initial Balance</p>
                      <p className="text-lg font-medium">${parseFloat(selectedCard.initialBalance || "0").toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Expires</p>
                      <p className="text-lg font-medium">
                        {selectedCard.expiresAt ? format(new Date(selectedCard.expiresAt), "MMM d, yyyy") : "Never"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setReloadDialogOpen(true)} data-testid="button-reload-card">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reload Card
                    </Button>
                    <Button variant="outline" onClick={() => setRedeemDialogOpen(true)} data-testid="button-redeem-card">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Redeem
                    </Button>
                    {selectedCard.status === "active" && (
                      <Button
                        variant="destructive"
                        onClick={() => updateMutation.mutate({ ...selectedCard, status: "suspended" })}
                        data-testid="button-suspend-card"
                      >
                        <Ban className="w-4 h-4 mr-2" />
                        Suspend
                      </Button>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="history">
                  <div className="max-h-64 overflow-y-auto">
                    {cardTransactions.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">No transactions yet</p>
                    ) : (
                      <div className="space-y-2">
                        {cardTransactions.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between p-3 border rounded-md">
                            <div>
                              <p className="font-medium capitalize">{tx.transactionType}</p>
                              <p className="text-xs text-muted-foreground">
                                {tx.createdAt && format(new Date(tx.createdAt), "MMM d, yyyy h:mm a")}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${tx.transactionType === "redemption" ? "text-red-600" : "text-green-600"}`}>
                                {tx.transactionType === "redemption" ? "-" : "+"}${parseFloat(tx.amount || "0").toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Balance: ${parseFloat(tx.balanceAfter || "0").toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reloadDialogOpen} onOpenChange={setReloadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reload Gift Card</DialogTitle>
            <DialogDescription>Add value to card {selectedCard?.cardNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reloadAmount">Amount ($)</Label>
              <Input
                id="reloadAmount"
                type="number"
                step="0.01"
                min="0"
                value={reloadAmount}
                onChange={(e) => setReloadAmount(e.target.value)}
                placeholder="25.00"
                data-testid="input-reload-amount"
              />
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setReloadDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedCard && reloadMutation.mutate({ cardId: selectedCard.id, amount: reloadAmount })}
              disabled={!reloadAmount || parseFloat(reloadAmount) <= 0 || reloadMutation.isPending}
              data-testid="button-reload-submit"
            >
              Reload ${reloadAmount || "0.00"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={redeemDialogOpen} onOpenChange={setRedeemDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Redeem Gift Card</DialogTitle>
            <DialogDescription>
              Available balance: ${parseFloat(selectedCard?.currentBalance || "0").toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="redeemAmount">Amount ($)</Label>
              <Input
                id="redeemAmount"
                type="number"
                step="0.01"
                min="0"
                max={selectedCard?.currentBalance}
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                placeholder="10.00"
                data-testid="input-redeem-amount"
              />
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setRedeemDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedCard && redeemMutation.mutate({ cardId: selectedCard.id, amount: redeemAmount })}
              disabled={!redeemAmount || parseFloat(redeemAmount) <= 0 || parseFloat(redeemAmount) > parseFloat(selectedCard?.currentBalance || "0") || redeemMutation.isPending}
              data-testid="button-redeem-submit"
            >
              Redeem ${redeemAmount || "0.00"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

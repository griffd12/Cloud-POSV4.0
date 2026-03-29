import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard,
  Search,
  Plus,
  DollarSign,
  RefreshCcw,
  Loader2,
  Check as CheckIcon,
  AlertCircle,
  Clock,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatShortDateInTimezone } from "@/lib/timezone";

interface GiftCardModalProps {
  open: boolean;
  onClose: () => void;
  checkId: string | undefined;
  propertyId: string | undefined;
  employeeId: string | undefined;
  rvcId: string | undefined;
  onGiftCardRedeemed?: (amount: string) => void;
  onGiftCardSold?: (checkItem: any, createdCheck?: any) => void;
  timezone?: string;
}

interface GiftCardBalance {
  cardNumber: string;
  currentBalance: string;
  status: string;
  activatedAt: string | null;
  expiresAt: string | null;
  recentTransactions: any[];
}

export function GiftCardModal({
  open,
  onClose,
  checkId,
  propertyId,
  employeeId,
  rvcId,
  onGiftCardRedeemed,
  onGiftCardSold,
  timezone,
}: GiftCardModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("balance");
  const [cardNumber, setCardNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [balanceResult, setBalanceResult] = useState<GiftCardBalance | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  useEffect(() => {
    if (!open) {
      setCardNumber("");
      setAmount("");
      setPin("");
      setBalanceResult(null);
      setActiveTab("balance");
    }
  }, [open]);

  const checkBalance = async () => {
    if (!cardNumber) return;
    setIsCheckingBalance(true);
    try {
      // Use apiRequest to include device token header
      const res = await apiRequest("GET", `/api/pos/gift-cards/balance/${encodeURIComponent(cardNumber)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Card not found");
      }
      const data = await res.json();
      setBalanceResult(data);
      toast({ title: "Balance Found", description: `$${data.currentBalance} available` });
    } catch (error: any) {
      toast({
        title: "Card Not Found",
        description: error.message || "Unable to find gift card",
        variant: "destructive",
      });
      setBalanceResult(null);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  const sellMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pos/gift-cards/sell", {
        cardNumber,
        initialBalance: amount,
        propertyId,
        employeeId,
        checkId,
        rvcId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Gift Card Added to Check",
        description: `$${amount} gift card added. Please complete payment to activate.`,
      });
      setCardNumber("");
      setAmount("");
      
      // Determine which check to invalidate - either existing or newly created
      const workingCheckId = data.check?.id || checkId;
      
      // Refresh check items and check data to show the gift card sale
      if (workingCheckId) {
        queryClient.invalidateQueries({ queryKey: ["/api/checks", workingCheckId, "items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checks", workingCheckId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      
      // Call callback to update local check items state in POS
      // Pass both the check item and the created check (if auto-created)
      if (data.checkItem && onGiftCardSold) {
        onGiftCardSold(data.checkItem, data.check);
      }
      // Close modal so user can see check and pay
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Activation Failed",
        description: error.message || "Could not activate gift card",
        variant: "destructive",
      });
    },
  });

  const reloadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pos/gift-cards/reload", {
        cardNumber,
        amount,
        propertyId,
        employeeId,
        checkId,
        rvcId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Reload Added to Check",
        description: `$${amount} reload added. Complete payment to apply funds to card.`,
      });
      setCardNumber("");
      setAmount("");

      const workingCheckId = data.check?.id || checkId;
      if (workingCheckId) {
        queryClient.invalidateQueries({ queryKey: ["/api/checks", workingCheckId, "items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checks", workingCheckId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });

      if (data.checkItem && onGiftCardSold) {
        onGiftCardSold(data.checkItem, data.check);
      }
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Reload Failed",
        description: error.message || "Could not reload gift card",
        variant: "destructive",
      });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pos/gift-cards/redeem", {
        cardNumber,
        amount,
        propertyId,
        employeeId,
        checkId,
        pin: pin || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Gift Card Redeemed",
        description: `$${data.amountRedeemed} applied. Remaining: $${data.remainingBalance}`,
      });
      if (onGiftCardRedeemed) {
        onGiftCardRedeemed(data.amountRedeemed);
      }
      setAmount("");
      setPin("");
      if (balanceResult) {
        setBalanceResult({ ...balanceResult, currentBalance: data.remainingBalance });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Redemption Failed",
        description: error.message || "Could not redeem gift card",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-gift-card-modal-title">
            <CreditCard className="w-5 h-5" />
            Gift Card Operations
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="balance" className="flex-1" data-testid="tab-gc-balance">
              <Search className="w-4 h-4 mr-2" />
              Balance
            </TabsTrigger>
            <TabsTrigger value="sell" className="flex-1" data-testid="tab-gc-sell">
              <Plus className="w-4 h-4 mr-2" />
              Sell
            </TabsTrigger>
            <TabsTrigger value="reload" className="flex-1" data-testid="tab-gc-reload">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Reload
            </TabsTrigger>
            <TabsTrigger value="redeem" className="flex-1" data-testid="tab-gc-redeem">
              <DollarSign className="w-4 h-4 mr-2" />
              Redeem
            </TabsTrigger>
          </TabsList>

          <TabsContent value="balance" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="balance-card">Card Number</Label>
              <div className="flex gap-2">
                <Input
                  id="balance-card"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="Enter or scan card number"
                  data-testid="input-gc-balance-card"
                />
                <Button
                  onClick={checkBalance}
                  disabled={isCheckingBalance || !cardNumber}
                  data-testid="button-check-balance"
                >
                  {isCheckingBalance ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {balanceResult && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Card Number</p>
                    <p className="font-mono">{balanceResult.cardNumber}</p>
                  </div>
                  <Badge
                    variant={balanceResult.status === "active" ? "default" : "secondary"}
                    data-testid="badge-gc-status"
                  >
                    {balanceResult.status}
                  </Badge>
                </div>

                <div className="text-center py-4 bg-muted rounded-md">
                  <p className="text-3xl font-bold text-primary" data-testid="text-gc-balance">
                    ${balanceResult.currentBalance}
                  </p>
                  <p className="text-sm text-muted-foreground">Available Balance</p>
                </div>

                {balanceResult.expiresAt && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Expires: {formatShortDateInTimezone(balanceResult.expiresAt, timezone)}
                  </div>
                )}

                {balanceResult.recentTransactions.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div>
                      <p className="text-sm font-medium mb-2">Recent Activity</p>
                      <ScrollArea className="h-[100px]">
                        <div className="space-y-1">
                          {balanceResult.recentTransactions.map((tx, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
                            >
                              <span className="text-muted-foreground">{tx.transactionType}</span>
                              <span
                                className={
                                  parseFloat(tx.amount) >= 0 ? "text-green-600" : "text-red-600"
                                }
                              >
                                ${tx.amount}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </>
                )}
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sell" className="mt-4 space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Activating a new gift card for sale</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="sell-card">Card Number</Label>
                <Input
                  id="sell-card"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="Enter or scan new card number"
                  data-testid="input-gc-sell-card"
                />
              </div>
              <div>
                <Label htmlFor="sell-amount">Initial Balance</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="sell-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="pl-7"
                    data-testid="input-gc-sell-amount"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[25, 50, 100, 200].map((val) => (
                  <Button
                    key={val}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(val.toString())}
                    data-testid={`button-gc-preset-${val}`}
                  >
                    ${val}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => sellMutation.mutate()}
              disabled={sellMutation.isPending || !cardNumber || !amount}
              data-testid="button-gc-sell"
            >
              {sellMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckIcon className="w-4 h-4 mr-2" />
              )}
              Activate Gift Card for ${amount || "0.00"}
            </Button>
          </TabsContent>

          <TabsContent value="reload" className="mt-4 space-y-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="reload-card">Card Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="reload-card"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="Enter or scan card number"
                    data-testid="input-gc-reload-card"
                  />
                  <Button
                    variant="outline"
                    onClick={checkBalance}
                    disabled={isCheckingBalance || !cardNumber}
                    data-testid="button-gc-reload-check"
                  >
                    {isCheckingBalance ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {balanceResult && (
                <div className="p-3 bg-muted rounded-md flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Balance:</span>
                  <span className="font-semibold">${balanceResult.currentBalance}</span>
                </div>
              )}

              <div>
                <Label htmlFor="reload-amount">Reload Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="reload-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="pl-7"
                    data-testid="input-gc-reload-amount"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[25, 50, 100, 200].map((val) => (
                  <Button
                    key={val}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(val.toString())}
                    data-testid={`button-gc-reload-preset-${val}`}
                  >
                    ${val}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => reloadMutation.mutate()}
              disabled={reloadMutation.isPending || !cardNumber || !amount}
              data-testid="button-gc-reload"
            >
              {reloadMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCcw className="w-4 h-4 mr-2" />
              )}
              Add Reload ${amount || "0.00"} to Check
            </Button>
          </TabsContent>

          <TabsContent value="redeem" className="mt-4 space-y-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="redeem-card">Card Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="redeem-card"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="Enter or scan card number"
                    data-testid="input-gc-redeem-card"
                  />
                  <Button
                    variant="outline"
                    onClick={checkBalance}
                    disabled={isCheckingBalance || !cardNumber}
                    data-testid="button-gc-redeem-check"
                  >
                    {isCheckingBalance ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {balanceResult && (
                <div className="p-3 bg-muted rounded-md flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Available Balance:</span>
                  <span className="font-semibold text-lg">${balanceResult.currentBalance}</span>
                </div>
              )}

              <div>
                <Label htmlFor="redeem-amount">Amount to Redeem</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="redeem-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={balanceResult ? parseFloat(balanceResult.currentBalance) : undefined}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="pl-7"
                    data-testid="input-gc-redeem-amount"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="redeem-pin">PIN (if required)</Label>
                <Input
                  id="redeem-pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN if card has one"
                  data-testid="input-gc-redeem-pin"
                />
              </div>

              {balanceResult && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setAmount(balanceResult.currentBalance)}
                  data-testid="button-gc-use-full"
                >
                  Use Full Balance (${balanceResult.currentBalance})
                </Button>
              )}
            </div>

            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => redeemMutation.mutate()}
              disabled={redeemMutation.isPending || !cardNumber || !amount}
              data-testid="button-gc-redeem"
            >
              {redeemMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="w-4 h-4 mr-2" />
              )}
              Redeem ${amount || "0.00"}
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-gc-modal">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

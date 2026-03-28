import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuthHeaders, apiRequest, failoverFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Clock, CheckCircle2, AlertCircle, ArrowRight, CalendarClock } from "lucide-react";
import type { Property, FiscalPeriod } from "@shared/schema";

interface LiveTotals {
  grossSales: string;
  netSales: string;
  taxCollected: string;
  tipsTotal: string;
  discountsTotal: string;
  refundsTotal: string;
  serviceChargesTotal: string;
  checkCount: number;
  guestCount: number;
  cashExpected: string;
  cardTotal: string;
}

export default function FiscalClosePage() {
  usePosWebSocket();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { filterParam, filterKeys, selectedEnterpriseId, scopePayload, selectedPropertyId } = useEmcFilter();
  const [targetDate, setTargetDate] = useState("");
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pin, setPin] = useState("");

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: businessDateInfo } = useQuery<{ currentBusinessDate: string; localDate: string; timezone: string }>({
    queryKey: ["/api/properties", selectedPropertyId, "business-date"],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties/${selectedPropertyId}/business-date`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch business date");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  useEffect(() => {
    if (businessDateInfo?.currentBusinessDate) {
      setTargetDate(businessDateInfo.currentBusinessDate);
    }
  }, [businessDateInfo?.currentBusinessDate, selectedPropertyId]);

  const { data: currentPeriod, isLoading: currentLoading } = useQuery<FiscalPeriod>({
    queryKey: ["/api/fiscal-periods/current", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const baseUrl = `/api/fiscal-periods/current/${selectedPropertyId}`;
      const url = selectedEnterpriseId ? `${baseUrl}?enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch current period");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: liveTotals } = useQuery<LiveTotals>({
    queryKey: ["/api/fiscal-periods/totals", selectedPropertyId, currentPeriod?.businessDate, filterKeys],
    queryFn: async () => {
      const baseUrl = `/api/fiscal-periods/totals/${selectedPropertyId}/${currentPeriod?.businessDate}`;
      const url = selectedEnterpriseId ? `${baseUrl}?enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch totals");
      return res.json();
    },
    enabled: !!selectedPropertyId && !!currentPeriod?.businessDate,
    refetchInterval: 30000,
  });

  const { data: fiscalPeriods = [], isLoading: periodsLoading } = useQuery<FiscalPeriod[]>({
    queryKey: ["/api/fiscal-periods", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const baseUrl = `/api/fiscal-periods?propertyId=${selectedPropertyId}`;
      const url = selectedEnterpriseId ? `${baseUrl}&enterpriseId=${selectedEnterpriseId}` : baseUrl;
      const res = await failoverFetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch fiscal periods");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  const advanceBusinessDateMutation = useMutation({
    mutationFn: async ({ propertyId, targetDate, pin }: { propertyId: string; targetDate: string; pin: string }) => {
      const res = await apiRequest("POST", `/api/properties/${propertyId}/business-date/advance`, {
        targetDate,
        pin,
        ...scopePayload,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to advance business date");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Business Date Updated",
        description: data.message,
      });
      setShowPinPrompt(false);
      setPin("");
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal-periods/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal-periods"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAdvanceDate = () => {
    if (!selectedPropertyId || !targetDate) return;
    setShowPinPrompt(true);
  };

  const handleConfirmAdvance = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedPropertyId || !targetDate || !pin) return;
    advanceBusinessDateMutation.mutate({ propertyId: selectedPropertyId, targetDate, pin });
  };

  const handleCancelPin = () => {
    setShowPinPrompt(false);
    setPin("");
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "$0.00";
    return `$${parseFloat(value).toFixed(2)}`;
  };

  const getNextRolloverTime = () => {
    if (!selectedProperty) return null;
    const rolloverTime = selectedProperty.businessDateRolloverTime || "04:00";
    const [hour, minute] = rolloverTime.split(":").map(Number);
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
  };

  const displayTotals = liveTotals || {
    grossSales: currentPeriod?.grossSales || "0",
    netSales: currentPeriod?.netSales || "0",
    taxCollected: currentPeriod?.taxCollected || "0",
    tipsTotal: currentPeriod?.tipsTotal || "0",
    discountsTotal: currentPeriod?.discountsTotal || "0",
    checkCount: currentPeriod?.checkCount || 0,
    guestCount: currentPeriod?.guestCount || 0,
    cashExpected: currentPeriod?.cashExpected || "0",
    cardTotal: currentPeriod?.cardTotal || "0",
  };

  if (showPinPrompt) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Admin Authorization Required</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelPin} data-testid="button-cancel-pin">
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmAdvance}
                  disabled={!pin || advanceBusinessDateMutation.isPending}
                  data-testid="button-confirm-advance"
                >
                  {advanceBusinessDateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Advancing...
                    </>
                  ) : (
                    "Confirm"
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConfirmAdvance} className="space-y-4">
              <p className="text-muted-foreground">
                Enter your PIN to advance the business date to {targetDate}
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-pin">Employee PIN</Label>
                  <Input
                    id="admin-pin"
                    type="password"
                    placeholder="Enter PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConfirmAdvance()}
                    data-testid="input-admin-pin"
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Business Day Status</h1>
          <p className="text-muted-foreground">View current business day and fiscal period history</p>
        </div>
      </div>

      {selectedPropertyId && (
        <Tabs defaultValue="current" className="space-y-4">
          <TabsList>
            <TabsTrigger value="current" data-testid="tab-current">Current Period</TabsTrigger>
            <TabsTrigger value="manage" data-testid="tab-manage">Business Date Management</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-4">
            {currentLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : currentPeriod ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Business Date: {currentPeriod.businessDate}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 flex-wrap">
                      <span>Status:</span>
                      <Badge variant={currentPeriod.status === "open" ? "default" : "secondary"}>{currentPeriod.status}</Badge>
                      {selectedProperty && (
                        <span className="flex items-center gap-1 text-xs">
                          <Clock className="w-3 h-3" />
                          Auto-close at {getNextRolloverTime()} ({selectedProperty.timezone || "America/New_York"})
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Gross Sales</p>
                        <p className="text-xl font-semibold" data-testid="text-gross-sales">{formatCurrency(displayTotals.grossSales)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Net Sales</p>
                        <p className="text-xl font-semibold" data-testid="text-net-sales">{formatCurrency(displayTotals.netSales)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Tax</p>
                        <p className="text-xl font-semibold">{formatCurrency(displayTotals.taxCollected)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Tips</p>
                        <p className="text-xl font-semibold">{formatCurrency(displayTotals.tipsTotal)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-sm text-muted-foreground">Checks</p>
                        <p className="text-lg font-medium">{displayTotals.checkCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Guests</p>
                        <p className="text-lg font-medium">{displayTotals.guestCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Discounts</p>
                        <p className="text-lg font-medium">{formatCurrency(displayTotals.discountsTotal)}</p>
                      </div>
                    </div>

                    <div className="mt-4 p-3 bg-muted rounded-md flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm">
                        This business day will automatically close at rollover time
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Payment Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Cash Expected</p>
                        <p className="text-lg font-medium">{formatCurrency(displayTotals.cashExpected)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Card Payments</p>
                        <p className="text-lg font-medium">{formatCurrency(displayTotals.cardTotal)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  No current fiscal period found. A new period will be created automatically.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="manage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="w-5 h-5" />
                  Business Date Management
                </CardTitle>
                <CardDescription>
                  Manually advance the business date to a specific date. This will close the current fiscal period and start a new one for the selected date.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground">Current Business Date</Label>
                      <div className="text-2xl font-bold mt-1" data-testid="text-current-business-date">
                        {currentPeriod?.businessDate || selectedProperty?.currentBusinessDate || "Not set"}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="target-date">Advance To Date</Label>
                      <div className="flex items-center gap-3 mt-2">
                        <Input
                          id="target-date"
                          type="date"
                          value={targetDate}
                          onChange={(e) => setTargetDate(e.target.value)}
                          className="w-48"
                          data-testid="input-target-date"
                        />
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                        <Button
                          onClick={handleAdvanceDate}
                          disabled={advanceBusinessDateMutation.isPending || !targetDate}
                          data-testid="button-advance-date"
                        >
                          {advanceBusinessDateMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Advancing...
                            </>
                          ) : (
                            "Advance Date"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                      <p className="font-medium">Important:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Advancing the date will close any open fiscal period for the current date</li>
                        <li>A new fiscal period will be created for the selected date with reset financial totals</li>
                        <li>All new transactions will be recorded under the new business date</li>
                        <li>This action is logged for audit purposes</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fiscal Period History</CardTitle>
                <CardDescription>Previous business day closings</CardDescription>
              </CardHeader>
              <CardContent>
                {periodsLoading ? (
                  <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : fiscalPeriods.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No fiscal periods found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Gross Sales</TableHead>
                        <TableHead className="text-right">Net Sales</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Checks</TableHead>
                        <TableHead>Closed At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fiscalPeriods
                        .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
                        .map(period => (
                        <TableRow key={period.id} data-testid={`row-period-${period.id}`}>
                          <TableCell className="font-medium">{period.businessDate}</TableCell>
                          <TableCell>
                            <Badge variant={period.status === "closed" ? "secondary" : "default"}>
                              {period.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(period.grossSales)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(period.netSales)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(period.taxCollected)}</TableCell>
                          <TableCell className="text-right">{period.checkCount || 0}</TableCell>
                          <TableCell>
                            {period.closedAt ? format(new Date(period.closedAt), "MMM d, h:mm a") : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

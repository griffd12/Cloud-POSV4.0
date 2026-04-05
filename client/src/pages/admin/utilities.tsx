import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { AlertTriangle, Trash2, Database, ShieldAlert, FileText, Loader2, Building2, Calendar, ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Property } from "@shared/schema";

interface SalesDataSummary {
  checks: number;
  checkItems: number;
  payments: number;
  rounds: number;
  kdsTickets: number;
  auditLogs: number;
  fiscalPeriods: number;
  cashTransactions: number;
  drawerAssignments: number;
  safeCounts: number;
  giftCardTransactions: number;
  giftCards: number;
  loyaltyTransactions: number;
  loyaltyRedemptions: number;
  loyaltyMembers: number;
  onlineOrders: number;
  inventoryTransactions: number;
  inventoryStock: number;
  salesForecasts: number;
  laborForecasts: number;
  managerAlerts: number;
  itemAvailability: number;
  prepItems: number;
  offlineQueue: number;
  accountingExports: number;
}

interface ClearResult {
  success: boolean;
  message: string;
  deleted: {
    checks: number;
    checkItems: number;
    payments: number;
    discounts: number;
    rounds: number;
    kdsTicketItems: number;
    kdsTickets: number;
    auditLogs: number;
    timePunches: number;
    timecards: number;
    breakSessions: number;
    timecardExceptions: number;
    shifts: number;
    tipAllocations: number;
    tipPoolRuns: number;
    fiscalPeriods: number;
    cashTransactions: number;
    drawerAssignments: number;
    safeCounts: number;
    giftCardTransactions: number;
    giftCards: number;
    loyaltyTransactions: number;
    loyaltyRedemptions: number;
    loyaltyMembersReset: number;
    onlineOrders: number;
    inventoryTransactions: number;
    inventoryStock: number;
    salesForecasts: number;
    laborForecasts: number;
    managerAlerts: number;
    itemAvailability: number;
    prepItems: number;
    offlineQueue: number;
    accountingExports: number;
  };
}

export default function UtilitiesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [lastResult, setLastResult] = useState<ClearResult | null>(null);
  

  // Fetch all properties for selection
  const { data: properties, isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  // Fetch summary for selected property
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<SalesDataSummary>({
    queryKey: ["/api/admin/sales-data-summary", selectedPropertyId, filterKeys],
    enabled: !!selectedPropertyId,
    queryFn: async () => {
      const entParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";
      const res = await failoverFetch(`/api/admin/sales-data-summary/${selectedPropertyId}${entParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  const selectedProperty = properties?.find(p => p.id === selectedPropertyId);

  const { data: clearStatus, refetch: refetchClearStatus } = useQuery<{ ok: boolean; status: { clearedAt: string | null; lfsAcknowledged: boolean; lfsAckAt: string | null } | null }>({
    queryKey: ["/api/admin/clear-sales-status", selectedPropertyId],
    enabled: !!selectedPropertyId,
    queryFn: async () => {
      const res = await failoverFetch(`/api/admin/clear-sales-status/${selectedPropertyId}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch clear status");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const clearMutation = useMutation({
    mutationFn: async (data: { pin: string; confirmText: string; propertyId: string }) => {
      const response = await apiRequest("POST", "/api/admin/clear-sales-data", data);
      return response.json() as Promise<ClearResult>;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setShowResetDialog(false);
      setPin("");
      setConfirmText("");
      setAcknowledged(false);
      refetchSummary();
      refetchClearStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      toast({
        title: "Property Sales Data Cleared",
        description: `${result.message} for ${selectedProperty?.name}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to clear sales data",
        variant: "destructive",
      });
    },
  });

  const handleReset = () => {
    if (!acknowledged) {
      toast({ title: "Please acknowledge the warning", variant: "destructive" });
      return;
    }
    if (!selectedPropertyId) {
      toast({ title: "Please select a property", variant: "destructive" });
      return;
    }
    clearMutation.mutate({
      pin,
      confirmText,
      propertyId: selectedPropertyId,
    });
  };

  // Calculate total records to DELETE (excluding loyaltyMembers which are just RESET, not deleted)
  const totalRecords = summary
    ? summary.checks + summary.checkItems + summary.payments + summary.rounds + summary.kdsTickets + summary.auditLogs +
      summary.fiscalPeriods + summary.cashTransactions + summary.drawerAssignments + summary.safeCounts +
      summary.giftCardTransactions + summary.giftCards + summary.loyaltyTransactions + summary.loyaltyRedemptions +
      summary.onlineOrders + summary.inventoryTransactions + summary.inventoryStock +
      summary.salesForecasts + summary.laborForecasts + summary.managerAlerts +
      summary.itemAvailability + summary.prepItems + summary.offlineQueue + summary.accountingExports
    : 0;
  
  // Loyalty members are reset (points zeroed), not deleted - show separately
  const membersToReset = summary?.loyaltyMembers || 0;

  const canSubmit = acknowledged && pin.length > 0 && confirmText === "RESET" && selectedPropertyId;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-utilities-title">Admin Utilities</h1>
        <p className="text-muted-foreground">System maintenance and administrative operations</p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Danger Zone</AlertTitle>
        <AlertDescription>
          Operations on this page can permanently delete data. Use with extreme caution.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Clear Property Sales Data
          </CardTitle>
          <CardDescription>
            Reset all transactional data for a specific property. This removes all checks (including open checks), 
            payments, KDS tickets, and unlocks menu items for deletion. Only affects the selected property.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Property Selector */}
          <div className="space-y-2">
            <Label htmlFor="property-select" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Select Property
            </Label>
            <Select 
              value={selectedPropertyId} 
              onValueChange={setSelectedPropertyId}
              disabled={propertiesLoading}
            >
              <SelectTrigger id="property-select" data-testid="select-property">
                <SelectValue placeholder="Choose a property to clear..." />
              </SelectTrigger>
              <SelectContent>
                {properties?.map((property) => (
                  <SelectItem 
                    key={property.id} 
                    value={property.id}
                    data-testid={`select-property-${property.id}`}
                  >
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedPropertyId && (
              <p className="text-sm text-muted-foreground">
                Select a property to view and clear its sales data
              </p>
            )}
          </div>

          {selectedPropertyId && (
            <>
              <div className="p-4 bg-muted/50 rounded-md">
                <div className="font-medium text-sm text-muted-foreground mb-2">Selected Property</div>
                <div className="text-lg font-semibold">{selectedProperty?.name}</div>
              </div>

              {clearStatus?.status && (
                <div className="p-3 rounded-md border" data-testid="lfs-clear-status">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">LFS Clear Status</div>
                    <div className="flex items-center gap-2">
                      {clearStatus.status.lfsAcknowledged ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-lfs-ack">
                          LFS Cleared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="badge-lfs-pending">
                          Waiting for LFS
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Cloud cleared: {new Date(clearStatus.status.clearedAt!).toLocaleString()}
                    {clearStatus.status.lfsAckAt && ` — LFS confirmed: ${new Date(clearStatus.status.lfsAckAt).toLocaleString()}`}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="text-center p-4 bg-muted rounded-md">
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-checks">
                    {summaryLoading ? "-" : summary?.checks || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Checks</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-md">
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-items">
                    {summaryLoading ? "-" : summary?.checkItems || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Check Items</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-md">
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-payments">
                    {summaryLoading ? "-" : summary?.payments || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Payments</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-md">
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-rounds">
                    {summaryLoading ? "-" : summary?.rounds || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Rounds</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-md">
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-kds">
                    {summaryLoading ? "-" : summary?.kdsTickets || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">KDS Tickets</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-md">
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-audit">
                    {summaryLoading ? "-" : summary?.auditLogs || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Audit Logs</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-md">
                <div>
                  <div className="font-medium">Total Records to Delete</div>
                  <div className="text-sm text-muted-foreground">
                    This action cannot be undone
                  </div>
                </div>
                <div className="text-3xl font-bold tabular-nums text-destructive" data-testid="text-total-records">
                  {totalRecords.toLocaleString()}
                </div>
              </div>
              
              {membersToReset > 0 && (
                <div className="flex items-center justify-between p-4 border rounded-md bg-muted/30">
                  <div>
                    <div className="font-medium">Loyalty Members to Reset</div>
                    <div className="text-sm text-muted-foreground">
                      Points will be zeroed (members not deleted)
                    </div>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-muted-foreground" data-testid="text-members-reset">
                    {membersToReset.toLocaleString()}
                  </div>
                </div>
              )}

              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowResetDialog(true)}
                disabled={totalRecords === 0 && membersToReset === 0}
                data-testid="button-open-reset-dialog"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Sales Data for {selectedProperty?.name}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Last Reset Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Checks Deleted:</span>{" "}
                <span className="font-medium">{lastResult.deleted.checks}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Check Items:</span>{" "}
                <span className="font-medium">{lastResult.deleted.checkItems}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Payments:</span>{" "}
                <span className="font-medium">{lastResult.deleted.payments}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Discounts:</span>{" "}
                <span className="font-medium">{lastResult.deleted.discounts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Rounds:</span>{" "}
                <span className="font-medium">{lastResult.deleted.rounds}</span>
              </div>
              <div>
                <span className="text-muted-foreground">KDS Ticket Items:</span>{" "}
                <span className="font-medium">{lastResult.deleted.kdsTicketItems}</span>
              </div>
              <div>
                <span className="text-muted-foreground">KDS Tickets:</span>{" "}
                <span className="font-medium">{lastResult.deleted.kdsTickets}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Audit Logs:</span>{" "}
                <span className="font-medium">{lastResult.deleted.auditLogs}</span>
              </div>
              <div className="col-span-2 pt-2 border-t mt-2">
                <span className="font-semibold text-sm">Labor Data</span>
              </div>
              <div>
                <span className="text-muted-foreground">Time Punches:</span>{" "}
                <span className="font-medium">{lastResult.deleted.timePunches}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Timecards:</span>{" "}
                <span className="font-medium">{lastResult.deleted.timecards}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Break Sessions:</span>{" "}
                <span className="font-medium">{lastResult.deleted.breakSessions}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Timecard Exceptions:</span>{" "}
                <span className="font-medium">{lastResult.deleted.timecardExceptions}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Shifts (Schedules):</span>{" "}
                <span className="font-medium">{lastResult.deleted.shifts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tip Allocations:</span>{" "}
                <span className="font-medium">{lastResult.deleted.tipAllocations}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tip Pool Runs:</span>{" "}
                <span className="font-medium">{lastResult.deleted.tipPoolRuns}</span>
              </div>
              <div className="col-span-2 md:col-span-4 pt-2 border-t mt-2">
                <span className="font-semibold text-sm">Enterprise Features</span>
              </div>
              <div>
                <span className="text-muted-foreground">Fiscal Periods:</span>{" "}
                <span className="font-medium">{lastResult.deleted.fiscalPeriods}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cash Transactions:</span>{" "}
                <span className="font-medium">{lastResult.deleted.cashTransactions}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Drawer Assignments:</span>{" "}
                <span className="font-medium">{lastResult.deleted.drawerAssignments}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Safe Counts:</span>{" "}
                <span className="font-medium">{lastResult.deleted.safeCounts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Gift Card Transactions:</span>{" "}
                <span className="font-medium">{lastResult.deleted.giftCardTransactions}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Gift Cards Deleted:</span>{" "}
                <span className="font-medium">{lastResult.deleted.giftCards}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Loyalty Transactions:</span>{" "}
                <span className="font-medium">{lastResult.deleted.loyaltyTransactions}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Loyalty Redemptions:</span>{" "}
                <span className="font-medium">{lastResult.deleted.loyaltyRedemptions}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Loyalty Members Reset:</span>{" "}
                <span className="font-medium">{lastResult.deleted.loyaltyMembersReset}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Online Orders:</span>{" "}
                <span className="font-medium">{lastResult.deleted.onlineOrders}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Inventory Transactions:</span>{" "}
                <span className="font-medium">{lastResult.deleted.inventoryTransactions}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Inventory Stock:</span>{" "}
                <span className="font-medium">{lastResult.deleted.inventoryStock}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Sales Forecasts:</span>{" "}
                <span className="font-medium">{lastResult.deleted.salesForecasts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Labor Forecasts:</span>{" "}
                <span className="font-medium">{lastResult.deleted.laborForecasts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Manager Alerts:</span>{" "}
                <span className="font-medium">{lastResult.deleted.managerAlerts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Item Availability:</span>{" "}
                <span className="font-medium">{lastResult.deleted.itemAvailability}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Prep Items:</span>{" "}
                <span className="font-medium">{lastResult.deleted.prepItems}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Offline Queue:</span>{" "}
                <span className="font-medium">{lastResult.deleted.offlineQueue}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Accounting Exports:</span>{" "}
                <span className="font-medium">{lastResult.deleted.accountingExports}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Business Date Management - redirect to Fiscal Close */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Business Date Management
          </CardTitle>
          <CardDescription>
            Advance the business date for a property. The business date determines which operating day 
            transactions are attributed to in reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Business date management is handled through Fiscal Close, which allows you to pick any target date 
            and properly manages fiscal periods during the transition.
          </p>
          <Link href="/emc/fiscal-close">
            <Button className="w-full" data-testid="button-go-fiscal-close">
              <Calendar className="w-4 h-4 mr-2" />
              Go to Fiscal Close
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" />
              Confirm Sales Data Reset
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all sales transactions, payments, KDS tickets, 
              time punches, timecards, schedules, and tip pool data 
              for <strong>{selectedProperty?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <Alert variant="destructive">
              <Database className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                {totalRecords.toLocaleString()} records will be permanently deleted from {selectedProperty?.name}.
                This includes all open and closed checks. This action cannot be undone.
              </AlertDescription>
            </Alert>

            <div className="flex items-start gap-2">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
                data-testid="checkbox-acknowledge"
              />
              <Label htmlFor="acknowledge" className="text-sm leading-tight">
                I understand that this will permanently delete all sales data for this property 
                and this action cannot be reversed.
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin">Employee PIN (Admin Role Required)</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter your PIN"
                data-testid="input-pin"
              />
              <p className="text-xs text-muted-foreground">
                Only employees with Admin access privileges can perform this action.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmText">Type RESET to confirm</Label>
              <Input
                id="confirmText"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type RESET"
                data-testid="input-confirm-text"
              />
            </div>
          </div>
          </div>

          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              data-testid="button-cancel-reset"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={!canSubmit || clearMutation.isPending}
              data-testid="button-confirm-reset"
            >
              {clearMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

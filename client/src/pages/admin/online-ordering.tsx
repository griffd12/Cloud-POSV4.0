import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Loader2, Plus, ShoppingBag, ExternalLink, RefreshCw, Check, X, Wifi, WifiOff, Upload, TestTube, Clock, MapPin, Phone, User, Truck, Store, Settings, Trash2, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import type { Property, Rvc, OnlineOrderSource, OnlineOrder } from "@shared/schema";

const PLATFORM_OPTIONS = [
  { value: "ubereats", label: "Uber Eats" },
  { value: "grubhub", label: "Grubhub" },
  { value: "doordash", label: "DoorDash" },
  { value: "direct", label: "Direct" },
  { value: "other", label: "Other" },
] as const;

const SOURCE_TYPE_OPTIONS = [
  { value: "marketplace", label: "Marketplace" },
  { value: "direct", label: "Direct" },
] as const;

function getPlatformIcon(platform: string): string {
  switch (platform) {
    case "ubereats": case "uber_eats": return "UE";
    case "grubhub": return "GH";
    case "doordash": return "DD";
    case "direct": return "WEB";
    default: return "OTH";
  }
}

function getPlatformLabel(platform: string): string {
  switch (platform) {
    case "ubereats": case "uber_eats": return "Uber Eats";
    case "grubhub": return "Grubhub";
    case "doordash": return "DoorDash";
    case "direct": return "Direct";
    default: return "Other";
  }
}

function getPlatformBadgeClass(platform: string): string {
  switch (platform) {
    case "ubereats": case "uber_eats": return "bg-green-600 text-white";
    case "grubhub": return "bg-orange-500 text-white";
    case "doordash": return "bg-red-600 text-white";
    case "direct": return "bg-blue-600 text-white";
    default: return "bg-gray-500 text-white";
  }
}

function getConnectionBadge(status: string | null) {
  switch (status) {
    case "connected": return <Badge className="bg-green-600 text-white"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>;
    case "error": return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
    default: return <Badge variant="secondary"><WifiOff className="w-3 h-3 mr-1" />Disconnected</Badge>;
  }
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "received": return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Received</Badge>;
    case "confirmed": return <Badge className="bg-blue-600 text-white"><Check className="w-3 h-3 mr-1" />Confirmed</Badge>;
    case "preparing": return <Badge className="bg-yellow-500 text-white"><Clock className="w-3 h-3 mr-1" />Preparing</Badge>;
    case "ready": return <Badge className="bg-green-600 text-white"><CheckCircle2 className="w-3 h-3 mr-1" />Ready</Badge>;
    case "picked_up": return <Badge variant="secondary"><Truck className="w-3 h-3 mr-1" />Picked Up</Badge>;
    case "delivered": return <Badge variant="secondary"><CheckCircle2 className="w-3 h-3 mr-1" />Delivered</Badge>;
    case "completed": return <Badge variant="secondary"><Check className="w-3 h-3 mr-1" />Completed</Badge>;
    case "cancelled": return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />Cancelled</Badge>;
    default: return <Badge variant="outline">{status || "Unknown"}</Badge>;
  }
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "$0.00";
  return `$${parseFloat(String(value)).toFixed(2)}`;
}

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return format(then, "MMM d, h:mm a");
}

export default function OnlineOrderingPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");
  const [activeTab, setActiveTab] = useState("connections");
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [editingSource, setEditingSource] = useState<OnlineOrderSource | null>(null);
  const [showDenyDialog, setShowDenyDialog] = useState(false);
  const [denyOrderId, setDenyOrderId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [acceptPrepTime, setAcceptPrepTime] = useState<Record<string, string>>({});
  const [historyPlatformFilter, setHistoryPlatformFilter] = useState("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");

  const [formPlatform, setFormPlatform] = useState("other");
  const [formSourceName, setFormSourceName] = useState("");
  const [formSourceType, setFormSourceType] = useState("marketplace");
  const [formClientId, setFormClientId] = useState("");
  const [formClientSecret, setFormClientSecret] = useState("");
  const [formMerchantStoreId, setFormMerchantStoreId] = useState("");
  const [formWebhookSecret, setFormWebhookSecret] = useState("");
  const [formDefaultRvcId, setFormDefaultRvcId] = useState("");
  const [formDefaultPrepMinutes, setFormDefaultPrepMinutes] = useState("15");
  const [formCommissionPercent, setFormCommissionPercent] = useState("");
  const [formAutoAccept, setFormAutoAccept] = useState(false);
  const [formAutoInject, setFormAutoInject] = useState(false);
  const [formSoundEnabled, setFormSoundEnabled] = useState(true);
  const [formActive, setFormActive] = useState(true);

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", selectedPropertyId],
    queryFn: async () => {
      const res = await failoverFetch(`/api/rvcs?propertyId=${selectedPropertyId}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch RVCs");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: orderSources = [], isLoading: sourcesLoading } = useQuery<OnlineOrderSource[]>({
    queryKey: ["/api/online-order-sources", selectedPropertyId],
    queryFn: async () => {
      const res = await failoverFetch(`/api/online-order-sources?propertyId=${selectedPropertyId}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch order sources");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: onlineOrders = [], isLoading: ordersLoading } = useQuery<OnlineOrder[]>({
    queryKey: ["/api/online-orders", selectedPropertyId],
    queryFn: async () => {
      const res = await failoverFetch(`/api/online-orders?propertyId=${selectedPropertyId}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch online orders");
      return res.json();
    },
    enabled: !!selectedPropertyId,
    refetchInterval: 10000,
  });

  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "online_order_received" || data.type === "online_order_updated") {
        queryClient.invalidateQueries({ queryKey: ["/api/online-orders", selectedPropertyId] });
      }
    } catch {}
  }, [selectedPropertyId]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/kds`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = handleWsMessage;
    } catch {}
    return () => { ws?.close(); };
  }, [handleWsMessage]);

  const incomingOrders = onlineOrders.filter(o => ["received", "confirmed", "preparing"].includes(o.status || ""));
  const historyOrders = onlineOrders
    .filter(o => {
      if (historyPlatformFilter !== "all") {
        const source = orderSources.find(s => s.id === o.sourceId);
        if (source?.platform !== historyPlatformFilter) return false;
      }
      if (historyStatusFilter !== "all" && o.status !== historyStatusFilter) return false;
      return true;
    })
    .slice(0, 100);

  const createSourceMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/online-order-sources", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-order-sources", selectedPropertyId] });
      resetSourceDialog();
      toast({ title: "Platform Added", description: "Delivery platform connection has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSourceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PUT", `/api/online-order-sources/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-order-sources", selectedPropertyId] });
      resetSourceDialog();
      toast({ title: "Platform Updated", description: "Delivery platform connection has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/online-order-sources/${id}`, { active: false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-order-sources", selectedPropertyId] });
      toast({ title: "Platform Removed", description: "Delivery platform connection has been deactivated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await apiRequest("POST", `/api/delivery-platforms/${sourceId}/test-connection`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-order-sources", selectedPropertyId] });
      toast({
        title: data.success ? "Connection Successful" : "Connection Failed",
        description: data.message || (data.success ? "Platform is reachable." : "Could not connect."),
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Connection Test Failed", description: error.message, variant: "destructive" });
    },
  });

  const syncMenuMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await apiRequest("POST", `/api/delivery-platforms/${sourceId}/sync-menu`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-order-sources", selectedPropertyId] });
      toast({ title: "Menu Synced", description: "Menu has been synced to the delivery platform." });
    },
    onError: (error: Error) => {
      toast({ title: "Menu Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleStoreMutation = useMutation({
    mutationFn: async ({ sourceId, online }: { sourceId: string; online: boolean }) => {
      const res = await apiRequest("POST", `/api/delivery-platforms/${sourceId}/toggle-store`, { online });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.online ? "Store Online" : "Store Offline", description: `Store has been set to ${data.online ? "online" : "offline"}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const acceptOrderMutation = useMutation({
    mutationFn: async ({ orderId, prepTimeMinutes }: { orderId: string; prepTimeMinutes: number }) => {
      const res = await apiRequest("POST", `/api/delivery-platforms/orders/${orderId}/accept`, { prepTimeMinutes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-orders", selectedPropertyId] });
      toast({ title: "Order Accepted", description: "Order has been confirmed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const denyOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/delivery-platforms/orders/${orderId}/deny`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-orders", selectedPropertyId] });
      setShowDenyDialog(false);
      setDenyOrderId(null);
      setDenyReason("");
      toast({ title: "Order Denied", description: "Order has been declined." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const markReadyMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/delivery-platforms/orders/${orderId}/ready`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-orders", selectedPropertyId] });
      toast({ title: "Order Ready", description: "Order has been marked as ready for pickup." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const injectOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/delivery-platforms/orders/${orderId}/inject`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-orders", selectedPropertyId] });
      toast({ title: "Order Injected", description: "Order has been sent to the POS." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetSourceDialog = () => {
    setFormPlatform("other");
    setFormSourceName("");
    setFormSourceType("marketplace");
    setFormClientId("");
    setFormClientSecret("");
    setFormMerchantStoreId("");
    setFormWebhookSecret("");
    setFormDefaultRvcId("");
    setFormDefaultPrepMinutes("15");
    setFormCommissionPercent("");
    setFormAutoAccept(false);
    setFormAutoInject(false);
    setFormSoundEnabled(true);
    setFormActive(true);
    setEditingSource(null);
    setShowSourceDialog(false);
  };

  const openEditDialog = (source: OnlineOrderSource) => {
    setEditingSource(source);
    setFormPlatform(source.platform || "other");
    setFormSourceName(source.sourceName);
    setFormSourceType(source.sourceType);
    setFormClientId(source.clientId || "");
    setFormClientSecret(source.clientSecret || "");
    setFormMerchantStoreId(source.merchantStoreId || "");
    setFormWebhookSecret(source.webhookSecret || "");
    setFormDefaultRvcId(source.defaultRvcId || "");
    setFormDefaultPrepMinutes(String(source.defaultPrepMinutes || 15));
    setFormCommissionPercent(source.commissionPercent || "");
    setFormAutoAccept(source.autoAccept ?? false);
    setFormAutoInject(source.autoInject ?? false);
    setFormSoundEnabled(source.soundEnabled ?? true);
    setFormActive(source.active ?? true);
    setShowSourceDialog(true);
  };

  const handleCancelSource = () => {
    resetSourceDialog();
  };

  const handleSaveSource = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formSourceName || !formPlatform) return;
    const data: Record<string, unknown> = {
      sourceName: formSourceName,
      sourceType: formSourceType,
      platform: formPlatform,
      propertyId: selectedPropertyId,
      clientId: formClientId || null,
      clientSecret: formClientSecret || null,
      merchantStoreId: formMerchantStoreId || null,
      webhookSecret: formWebhookSecret || null,
      defaultRvcId: formDefaultRvcId || null,
      defaultPrepMinutes: parseInt(formDefaultPrepMinutes) || 15,
      commissionPercent: formCommissionPercent || null,
      autoAccept: formAutoAccept,
      autoInject: formAutoInject,
      soundEnabled: formSoundEnabled,
      active: formActive,
    };
    if (editingSource) {
      updateSourceMutation.mutate({ id: editingSource.id, data });
    } else {
      createSourceMutation.mutate(data);
    }
  };

  const getSourceForOrder = (order: OnlineOrder) => orderSources.find(s => s.id === order.sourceId);

  const renderOrderItems = (items: unknown) => {
    const parsed = Array.isArray(items) ? items : (typeof items === "string" ? JSON.parse(items) : []);
    return parsed.map((item: any, idx: number) => (
      <div key={idx} className="flex items-center justify-between gap-2 text-sm py-1">
        <span>{item.quantity || 1}x {item.name}</span>
        <span className="text-muted-foreground">{formatCurrency(item.unitPrice)}</span>
      </div>
    ));
  };

  if (showSourceDialog) {
    return (
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{editingSource ? "Edit Platform Connection" : "Add Platform Connection"}</CardTitle>
                <CardDescription>
                  {editingSource ? "Update the delivery platform integration settings." : "Configure a new delivery platform integration."}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancelSource} data-testid="button-cancel-source">Cancel</Button>
                <Button
                  onClick={handleSaveSource}
                  disabled={!formSourceName || createSourceMutation.isPending || updateSourceMutation.isPending}
                  data-testid="button-save-source"
                >
                  {(createSourceMutation.isPending || updateSourceMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingSource ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSource} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={formPlatform} onValueChange={setFormPlatform}>
                    <SelectTrigger data-testid="select-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_OPTIONS.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Source Name</Label>
                  <Input
                    value={formSourceName}
                    onChange={(e) => setFormSourceName(e.target.value)}
                    placeholder="e.g., DoorDash Main Store"
                    data-testid="input-source-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source Type</Label>
                  <Select value={formSourceType} onValueChange={setFormSourceType}>
                    <SelectTrigger data-testid="select-source-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPE_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    value={formClientId}
                    onChange={(e) => setFormClientId(e.target.value)}
                    placeholder="API Client ID"
                    data-testid="input-client-id"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={formClientSecret}
                    onChange={(e) => setFormClientSecret(e.target.value)}
                    placeholder="API Client Secret"
                    data-testid="input-client-secret"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Merchant/Store ID</Label>
                  <Input
                    value={formMerchantStoreId}
                    onChange={(e) => setFormMerchantStoreId(e.target.value)}
                    placeholder="Store identifier"
                    data-testid="input-merchant-store-id"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <Input
                    type="password"
                    value={formWebhookSecret}
                    onChange={(e) => setFormWebhookSecret(e.target.value)}
                    placeholder="Webhook signing secret"
                    data-testid="input-webhook-secret"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Default RVC</Label>
                  <Select value={formDefaultRvcId} onValueChange={setFormDefaultRvcId}>
                    <SelectTrigger data-testid="select-default-rvc">
                      <SelectValue placeholder="Select RVC..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {rvcs.map(rvc => (
                        <SelectItem key={rvc.id} value={rvc.id}>{rvc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default Prep Time (min)</Label>
                  <Input
                    type="number"
                    value={formDefaultPrepMinutes}
                    onChange={(e) => setFormDefaultPrepMinutes(e.target.value)}
                    placeholder="15"
                    data-testid="input-prep-minutes"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Commission %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formCommissionPercent}
                    onChange={(e) => setFormCommissionPercent(e.target.value)}
                    placeholder="0"
                    data-testid="input-commission"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center justify-between gap-2">
                  <Label>Auto-Accept Orders</Label>
                  <Switch checked={formAutoAccept} onCheckedChange={setFormAutoAccept} data-testid="switch-auto-accept" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Auto-Inject to POS</Label>
                  <Switch checked={formAutoInject} onCheckedChange={setFormAutoInject} data-testid="switch-auto-inject" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Sound Enabled</Label>
                  <Switch checked={formSoundEnabled} onCheckedChange={setFormSoundEnabled} data-testid="switch-sound-enabled" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Active</Label>
                  <Switch checked={formActive} onCheckedChange={setFormActive} data-testid="switch-active" />
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Online Ordering</h1>
          <p className="text-muted-foreground">Manage delivery platform integrations and incoming orders</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="connections" data-testid="tab-connections">
              <Settings className="w-4 h-4 mr-2" />
              Platform Connections
            </TabsTrigger>
            <TabsTrigger value="incoming" data-testid="tab-incoming">
              <ShoppingBag className="w-4 h-4 mr-2" />
              Incoming Orders
              {incomingOrders.length > 0 && (
                <Badge variant="destructive" className="ml-2">{incomingOrders.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <Clock className="w-4 h-4 mr-2" />
              Order History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowSourceDialog(true)} data-testid="button-add-platform">
                <Plus className="w-4 h-4 mr-2" />
                Add Platform
              </Button>
            </div>

            {sourcesLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : orderSources.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No Platforms Connected</p>
                  <p className="mt-1">Add a delivery platform to start receiving online orders.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {orderSources.map(source => (
                  <Card key={source.id} data-testid={`card-source-${source.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-md flex items-center justify-center text-sm font-bold ${getPlatformBadgeClass(source.platform)}`}>
                            {getPlatformIcon(source.platform)}
                          </div>
                          <div>
                            <CardTitle className="text-base">{source.sourceName}</CardTitle>
                            <CardDescription>{getPlatformLabel(source.platform)}</CardDescription>
                          </div>
                        </div>
                        {getConnectionBadge(source.connectionStatus)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Auto-Accept</span>
                        <Switch
                          checked={source.autoAccept ?? false}
                          onCheckedChange={(checked) => updateSourceMutation.mutate({ id: source.id, data: { autoAccept: checked } })}
                          data-testid={`switch-auto-accept-${source.id}`}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Auto-Inject to POS</span>
                        <Switch
                          checked={source.autoInject ?? false}
                          onCheckedChange={(checked) => updateSourceMutation.mutate({ id: source.id, data: { autoInject: checked } })}
                          data-testid={`switch-auto-inject-${source.id}`}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Menu Sync</span>
                        <Badge variant={source.menuSyncStatus === "synced" ? "default" : "secondary"}>
                          {source.menuSyncStatus === "synced" ? "Synced" : source.menuSyncStatus === "error" ? "Error" : "Not Synced"}
                        </Badge>
                      </div>
                      {source.lastConnectionTest && (
                        <div className="text-xs text-muted-foreground">
                          Last tested: {format(new Date(source.lastConnectionTest), "MMM d, h:mm a")}
                        </div>
                      )}
                      <Separator />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testConnectionMutation.mutate(source.id)}
                          disabled={testConnectionMutation.isPending}
                          data-testid={`button-test-connection-${source.id}`}
                        >
                          {testConnectionMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <TestTube className="w-3 h-3 mr-1" />}
                          Test
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => syncMenuMutation.mutate(source.id)}
                          disabled={syncMenuMutation.isPending}
                          data-testid={`button-sync-menu-${source.id}`}
                        >
                          {syncMenuMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                          Sync Menu
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleStoreMutation.mutate({ sourceId: source.id, online: source.connectionStatus !== "connected" })}
                          disabled={toggleStoreMutation.isPending}
                          data-testid={`button-toggle-store-${source.id}`}
                        >
                          {source.connectionStatus === "connected" ? <WifiOff className="w-3 h-3 mr-1" /> : <Wifi className="w-3 h-3 mr-1" />}
                          {source.connectionStatus === "connected" ? "Go Offline" : "Go Online"}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(source)}
                          data-testid={`button-edit-source-${source.id}`}
                        >
                          <Settings className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm("Deactivate this platform connection?")) {
                              deleteSourceMutation.mutate(source.id);
                            }
                          }}
                          data-testid={`button-delete-source-${source.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="incoming" className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-semibold" data-testid="text-incoming-title">
                Live Orders ({incomingOrders.length})
              </h2>
              <Button
                variant="outline"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/online-orders", selectedPropertyId] })}
                data-testid="button-refresh-orders"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>

            {ordersLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : incomingOrders.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No Incoming Orders</p>
                  <p className="mt-1">Orders will appear here in real-time.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {incomingOrders.map(order => {
                  const source = getSourceForOrder(order);
                  const platform = source?.platform || "other";
                  return (
                    <Card key={order.id} data-testid={`card-order-${order.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className={getPlatformBadgeClass(platform)}>
                              {getPlatformLabel(platform)}
                            </Badge>
                            {getStatusBadge(order.status)}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {timeAgo(order.createdAt)}
                          </span>
                        </div>
                        <CardTitle className="text-sm font-mono mt-2" data-testid={`text-order-id-${order.id}`}>
                          #{order.externalOrderId}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1 text-sm">
                          {order.customerName && (
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3 text-muted-foreground" />
                              <span data-testid={`text-customer-${order.id}`}>{order.customerName}</span>
                            </div>
                          )}
                          {order.customerPhone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-3 h-3 text-muted-foreground" />
                              <span>{order.customerPhone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {order.orderType === "delivery" ? <Truck className="w-3 h-3 text-muted-foreground" /> : <Store className="w-3 h-3 text-muted-foreground" />}
                            <span className="capitalize">{order.orderType || "pickup"}</span>
                          </div>
                          {order.orderType === "delivery" && order.deliveryAddress && (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3 h-3 text-muted-foreground mt-0.5" />
                              <span className="text-xs text-muted-foreground">{order.deliveryAddress}</span>
                            </div>
                          )}
                        </div>

                        <Separator />

                        <div className="space-y-0.5">
                          {renderOrderItems(order.items)}
                        </div>

                        <Separator />

                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>{formatCurrency(order.subtotal)}</span>
                          </div>
                          {order.taxTotal && parseFloat(String(order.taxTotal)) > 0 && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground">Tax</span>
                              <span>{formatCurrency(order.taxTotal)}</span>
                            </div>
                          )}
                          {order.deliveryFee && parseFloat(String(order.deliveryFee)) > 0 && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground">Delivery Fee</span>
                              <span>{formatCurrency(order.deliveryFee)}</span>
                            </div>
                          )}
                          {order.serviceFee && parseFloat(String(order.serviceFee)) > 0 && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground">Service Fee</span>
                              <span>{formatCurrency(order.serviceFee)}</span>
                            </div>
                          )}
                          {order.tip && parseFloat(String(order.tip)) > 0 && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground">Tip</span>
                              <span>{formatCurrency(order.tip)}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-2 font-semibold">
                            <span>Total</span>
                            <span data-testid={`text-total-${order.id}`}>{formatCurrency(order.total)}</span>
                          </div>
                        </div>

                        <Separator />

                        <div className="flex flex-wrap gap-2">
                          {order.status === "received" && (
                            <>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  placeholder="Min"
                                  className="w-16"
                                  value={acceptPrepTime[order.id] || ""}
                                  onChange={(e) => setAcceptPrepTime(prev => ({ ...prev, [order.id]: e.target.value }))}
                                  data-testid={`input-prep-time-${order.id}`}
                                />
                                <Button
                                  size="sm"
                                  onClick={() => acceptOrderMutation.mutate({
                                    orderId: order.id,
                                    prepTimeMinutes: parseInt(acceptPrepTime[order.id] || "15") || 15,
                                  })}
                                  disabled={acceptOrderMutation.isPending}
                                  data-testid={`button-accept-${order.id}`}
                                >
                                  {acceptOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                                  Accept
                                </Button>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setDenyOrderId(order.id); setShowDenyDialog(true); }}
                                data-testid={`button-deny-${order.id}`}
                              >
                                <X className="w-3 h-3 mr-1" />
                                Deny
                              </Button>
                              {!order.checkId && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => injectOrderMutation.mutate(order.id)}
                                  disabled={injectOrderMutation.isPending}
                                  data-testid={`button-inject-${order.id}`}
                                >
                                  {injectOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                                  Inject to POS
                                </Button>
                              )}
                            </>
                          )}
                          {order.status === "confirmed" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => markReadyMutation.mutate(order.id)}
                                disabled={markReadyMutation.isPending}
                                data-testid={`button-ready-${order.id}`}
                              >
                                {markReadyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                Ready for Pickup
                              </Button>
                              {!order.checkId && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => injectOrderMutation.mutate(order.id)}
                                  disabled={injectOrderMutation.isPending}
                                  data-testid={`button-inject-${order.id}`}
                                >
                                  {injectOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                                  Inject to POS
                                </Button>
                              )}
                            </>
                          )}
                          {order.status === "preparing" && (
                            <Button
                              size="sm"
                              onClick={() => markReadyMutation.mutate(order.id)}
                              disabled={markReadyMutation.isPending}
                              data-testid={`button-ready-${order.id}`}
                            >
                              {markReadyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                              Ready for Pickup
                            </Button>
                          )}
                          {order.checkId && (
                            <Badge variant="secondary">POS Check #{order.checkId.slice(0, 8)}</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Select value={historyPlatformFilter} onValueChange={setHistoryPlatformFilter}>
                <SelectTrigger className="w-40" data-testid="select-history-platform">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  {PLATFORM_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-history-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/online-orders", selectedPropertyId] })}
                data-testid="button-refresh-history"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {ordersLoading ? (
                  <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : historyOrders.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">No orders found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>POS Check #</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyOrders.map(order => {
                        const source = getSourceForOrder(order);
                        return (
                          <TableRow key={order.id} data-testid={`row-history-${order.id}`}>
                            <TableCell className="font-mono text-sm">{order.externalOrderId}</TableCell>
                            <TableCell>
                              <Badge className={getPlatformBadgeClass(source?.platform || "other")}>
                                {getPlatformLabel(source?.platform || "other")}
                              </Badge>
                            </TableCell>
                            <TableCell>{order.customerName || "-"}</TableCell>
                            <TableCell className="capitalize">{order.orderType || "-"}</TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(order.total)}</TableCell>
                            <TableCell>{order.createdAt ? format(new Date(order.createdAt), "MMM d, h:mm a") : "-"}</TableCell>
                            <TableCell>{order.checkId ? order.checkId.slice(0, 8) : "-"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={showDenyDialog} onOpenChange={(open) => { if (!open) { setShowDenyDialog(false); setDenyOrderId(null); setDenyReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Order</DialogTitle>
            <DialogDescription>Provide a reason for declining this order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                placeholder="e.g., Out of stock, Kitchen closed"
                data-testid="input-deny-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDenyDialog(false); setDenyOrderId(null); setDenyReason(""); }} data-testid="button-cancel-deny">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (denyOrderId) {
                  denyOrderMutation.mutate({ orderId: denyOrderId, reason: denyReason || "Order declined" });
                }
              }}
              disabled={denyOrderMutation.isPending}
              data-testid="button-confirm-deny"
            >
              {denyOrderMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Deny Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

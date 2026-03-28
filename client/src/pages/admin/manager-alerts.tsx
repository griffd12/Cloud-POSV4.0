import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEmcFilter } from "@/lib/emc-context";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Loader2, Bell, AlertTriangle, AlertCircle, Info, Check, CheckCheck } from "lucide-react";
import type { Property, ManagerAlert, AlertSubscription } from "@shared/schema";

const ALERT_TYPES = ["void", "discount", "refund", "overtime", "exception", "hardware", "inventory", "security", "cash_variance"];
const ALERT_SEVERITIES = ["info", "warning", "critical"];

export default function ManagerAlertsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

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

  const { data: alerts = [], isLoading: alertsLoading } = useQuery<ManagerAlert[]>({
    queryKey: ["/api/manager-alerts", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("propertyId", selectedPropertyId);
      if (selectedEnterpriseId) params.set("enterpriseId", selectedEnterpriseId);
      const res = await failoverFetch(`/api/manager-alerts?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/manager-alerts/unread-count", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("propertyId", selectedPropertyId);
      if (selectedEnterpriseId) params.set("enterpriseId", selectedEnterpriseId);
      const res = await failoverFetch(`/api/manager-alerts/unread-count?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch unread count");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: subscriptions = [] } = useQuery<AlertSubscription[]>({
    queryKey: ["/api/alert-subscriptions", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("propertyId", selectedPropertyId);
      if (selectedEnterpriseId) params.set("enterpriseId", selectedEnterpriseId);
      const res = await failoverFetch(`/api/alert-subscriptions?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch subscriptions");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest("POST", `/api/manager-alerts/${alertId}/acknowledge`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager-alerts", selectedPropertyId, filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-alerts/unread-count", selectedPropertyId, filterKeys] });
      toast({ title: "Alert Acknowledged" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest("POST", `/api/manager-alerts/${alertId}/read`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager-alerts", selectedPropertyId, filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-alerts/unread-count", selectedPropertyId, filterKeys] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/manager-alerts/mark-all-read`, { propertyId: selectedPropertyId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager-alerts", selectedPropertyId, filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-alerts/unread-count", selectedPropertyId, filterKeys] });
      toast({ title: "All Alerts Marked as Read" });
    },
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <AlertCircle className="w-4 h-4 text-destructive" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical": return <Badge variant="destructive">Critical</Badge>;
      case "warning": return <Badge className="bg-yellow-500">Warning</Badge>;
      default: return <Badge variant="secondary">Info</Badge>;
    }
  };

  const getAlertTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      void: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      discount: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      refund: "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400",
      overtime: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
      exception: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
      hardware: "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400",
      inventory: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
      security: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      cash_variance: "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
    };
    return <Badge className={colors[type] || ""} variant="outline">{type.replace("_", " ")}</Badge>;
  };

  const unreadAlerts = alerts.filter(a => !a.readAt);
  const readAlerts = alerts.filter(a => a.readAt);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Manager Alerts</h1>
          <p className="text-muted-foreground">Monitor and respond to operational alerts</p>
        </div>
        {selectedPropertyId && unreadCount > 0 && (
          <Badge variant="destructive" className="text-lg px-3 py-1">
            {unreadCount} Unread
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Property</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4 flex-wrap">
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

          {selectedPropertyId && unreadAlerts.length > 0 && (
            <Button variant="outline" onClick={() => markAllReadMutation.mutate()} disabled={markAllReadMutation.isPending}>
              <CheckCheck className="w-4 h-4 mr-2" />
              Mark All Read
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedPropertyId && (
        <Tabs defaultValue="unread" className="space-y-4">
          <TabsList>
            <TabsTrigger value="unread" data-testid="tab-unread">
              Unread ({unreadAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">All Alerts</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="unread" className="space-y-4">
            {alertsLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : unreadAlerts.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                No unread alerts
              </CardContent></Card>
            ) : (
              <div className="space-y-3">
                {unreadAlerts.map(alert => (
                  <Card key={alert.id} className="border-l-4 border-l-primary" data-testid={`card-alert-${alert.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          {getSeverityIcon(alert.severity || "info")}
                          <CardTitle className="text-base">{alert.title}</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                          {getSeverityBadge(alert.severity || "info")}
                          {getAlertTypeBadge(alert.alertType)}
                        </div>
                      </div>
                      <CardDescription>{alert.createdAt ? format(new Date(alert.createdAt), "MMM d, h:mm a") : ""}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-4">{alert.message}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => markReadMutation.mutate(alert.id)}>
                          <Check className="w-4 h-4 mr-1" />
                          Mark Read
                        </Button>
                        {!alert.acknowledgedAt && (
                          <Button size="sm" onClick={() => acknowledgeAlertMutation.mutate(alert.id)}>
                            <CheckCheck className="w-4 h-4 mr-1" />
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            <Card>
              <CardContent className="p-0">
                {alertsLoading ? (
                  <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : alerts.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">No alerts.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alerts.map(alert => (
                        <TableRow key={alert.id} className={!alert.readAt ? "bg-muted/50" : ""} data-testid={`row-alert-${alert.id}`}>
                          <TableCell>{getSeverityBadge(alert.severity || "info")}</TableCell>
                          <TableCell>{getAlertTypeBadge(alert.alertType)}</TableCell>
                          <TableCell className="font-medium">{alert.title}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{alert.message}</TableCell>
                          <TableCell>{alert.createdAt ? format(new Date(alert.createdAt), "MMM d, h:mm a") : "-"}</TableCell>
                          <TableCell>
                            {alert.acknowledgedAt ? (
                              <Badge variant="secondary">Acknowledged</Badge>
                            ) : alert.readAt ? (
                              <Badge variant="outline">Read</Badge>
                            ) : (
                              <Badge>Unread</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alert Subscriptions</CardTitle>
                <CardDescription>Configure which alerts you want to receive notifications for</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ALERT_TYPES.map(type => (
                    <div key={type} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-muted-foreground" />
                        <span className="capitalize">{type.replace("_", " ")}</span>
                      </div>
                      <Switch defaultChecked data-testid={`switch-${type}`} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

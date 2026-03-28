import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { subscribeToSyncNotifications } from "@/hooks/use-pos-websocket";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { connectionManager } from "@/lib/connection-manager";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCheck,
  Trash2,
  X,
  Upload,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncNotification {
  id: string;
  propertyId: string;
  enterpriseId?: string | null;
  serviceHostId?: string | null;
  category: string;
  severity: string;
  title: string;
  message: string;
  metadata?: any;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
}

interface SyncNotificationCenterProps {
  propertyId?: string;
  enterpriseId?: string;
}

function getSeverityIcon(severity: string, category: string) {
  if (category === "service_host_connection") {
    return severity === "critical" ? WifiOff : Wifi;
  }
  switch (severity) {
    case "critical":
      return AlertCircle;
    case "warning":
      return AlertTriangle;
    case "info":
    default:
      return CheckCircle2;
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case "critical":
      return "text-red-400";
    case "warning":
      return "text-amber-400";
    case "info":
    default:
      return "text-emerald-400";
  }
}

function FailoverStatusBanner() {
  const [connState, setConnState] = useState(connectionManager.currentState);
  const [pendingCount, setPendingCount] = useState(connectionManager.pendingSync);
  const [syncProgress, setSyncProgress] = useState(connectionManager.currentSyncProgress);

  useEffect(() => {
    const unsub = connectionManager.subscribe((state) => {
      setConnState(state);
      setPendingCount(connectionManager.pendingSync);
      setSyncProgress(connectionManager.currentSyncProgress);
    });
    return unsub;
  }, []);

  if (connState === "cloud-online") return null;

  const isReconnecting = connState === "reconnecting";
  const isOffline = connState === "cloud-offline";

  return (
    <div
      className={`px-4 py-2 border-b ${
        isOffline ? "bg-amber-500/10 border-amber-500/30" : isReconnecting ? "bg-blue-500/10 border-blue-500/30" : "bg-yellow-500/10 border-yellow-500/30"
      }`}
      data-testid="failover-status-banner"
    >
      <div className="flex items-center gap-2 text-xs">
        {isReconnecting ? (
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
        ) : isOffline ? (
          <WifiOff className="h-3 w-3 text-amber-400" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
        )}
        <span className={isOffline ? "text-amber-400 font-medium" : isReconnecting ? "text-blue-400 font-medium" : "text-yellow-400 font-medium"}>
          {isReconnecting
            ? syncProgress?.phase || "Reconnecting..."
            : isOffline
              ? "Running on local server"
              : "Cloud connection degraded"}
        </span>
        {pendingCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Upload className="h-3 w-3" />
            {pendingCount} pending
          </span>
        )}
      </div>
    </div>
  );
}

export function SyncNotificationCenter({ propertyId, enterpriseId }: SyncNotificationCenterProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const autoReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [failoverActive, setFailoverActive] = useState(connectionManager.currentState !== "cloud-online");

  useEffect(() => {
    const unsub = connectionManager.subscribe((state) => {
      setFailoverActive(state !== "cloud-online");
    });
    return unsub;
  }, []);

  const queryParams = propertyId
    ? `propertyId=${propertyId}`
    : enterpriseId
    ? `enterpriseId=${enterpriseId}`
    : "";

  const { data: notifications = [], isLoading } = useQuery<SyncNotification[]>({
    queryKey: ["/api/sync-notifications", propertyId || enterpriseId],
    queryFn: async () => {
      if (!queryParams) return [];
      const res = await fetch(`/api/sync-notifications?${queryParams}&limit=50`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(propertyId || enterpriseId),
    refetchInterval: 30000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/sync-notifications/unread-count", propertyId || enterpriseId],
    queryFn: async () => {
      if (!queryParams) return { count: 0 };
      const res = await fetch(`/api/sync-notifications/unread-count?${queryParams}`, { headers: getAuthHeaders() });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!(propertyId || enterpriseId),
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count || 0;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/api/sync-notifications") });
  };

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/sync-notifications/${id}/read`);
    },
    onSuccess: invalidateAll,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const body = propertyId ? { propertyId } : enterpriseId ? { enterpriseId } : null;
      if (!body) return;
      await apiRequest("POST", "/api/sync-notifications/mark-all-read", body);
    },
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/sync-notifications/${id}`);
    },
    onSuccess: invalidateAll,
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const qp = propertyId ? `propertyId=${propertyId}` : enterpriseId ? `enterpriseId=${enterpriseId}` : "";
      if (!qp) return;
      await fetch(`/api/sync-notifications?${qp}`, { method: "DELETE", headers: getAuthHeaders() });
    },
    onSuccess: invalidateAll,
  });

  useEffect(() => {
    if (isOpen && unreadCount > 0) {
      autoReadTimerRef.current = setTimeout(() => {
        markAllReadMutation.mutate();
      }, 2000);
    }
    return () => {
      if (autoReadTimerRef.current) clearTimeout(autoReadTimerRef.current);
    };
  }, [isOpen, unreadCount]);

  const handleSyncNotification = useCallback((payload: any) => {
    if (!payload) return;
    if (propertyId && payload.propertyId && payload.propertyId !== propertyId) return;
    const severity = payload.severity || "info";
    const variant = severity === "critical" ? "destructive" : "default";
    toast({
      title: payload.title || "Sync Update",
      description: payload.message || "",
      variant,
    });
    invalidateAll();
  }, [toast, propertyId]);

  useEffect(() => {
    const unsubscribe = subscribeToSyncNotifications(handleSyncNotification);
    return unsubscribe;
  }, [handleSyncNotification]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-sync-notifications"
        >
          {failoverActive ? (
            <WifiOff className="h-5 w-5 text-amber-400" />
          ) : unreadCount > 0 ? (
            <BellRing className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" data-testid="popover-sync-notifications">
        <FailoverStatusBanner />
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Sync Notifications</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (propertyId || enterpriseId) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="text-xs h-7"
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark read
              </Button>
            )}
            {notifications.length > 0 && (propertyId || enterpriseId) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearAllMutation.mutate()}
                disabled={clearAllMutation.isPending}
                className="text-xs h-7 text-muted-foreground hover:text-destructive"
                data-testid="button-clear-all-notifications"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear all
              </Button>
            )}
          </div>
        </div>
        <div
          className="overflow-y-auto"
          style={{ maxHeight: "400px" }}
          data-testid="notification-list-scroll"
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p>No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => {
                const IconComponent = getSeverityIcon(notification.severity, notification.category);
                const colorClass = getSeverityColor(notification.severity);
                const isUnread = !notification.read;

                return (
                  <div
                    key={notification.id}
                    className={`group p-3 transition-colors cursor-pointer ${
                      isUnread
                        ? "bg-muted/40 hover:bg-muted/60"
                        : "opacity-60 hover:opacity-80 hover:bg-muted/30"
                    }`}
                    onClick={() => {
                      if (isUnread) {
                        markReadMutation.mutate(notification.id);
                      }
                    }}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex items-start gap-3">
                      {isUnread && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      )}
                      {!isUnread && (
                        <div className="w-2 h-2 mt-1.5 flex-shrink-0" />
                      )}
                      <IconComponent className={`h-4 w-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${isUnread ? "font-semibold" : "font-normal"}`}>
                            {notification.title}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0 opacity-40 group-hover:opacity-100 hover:bg-destructive/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(notification.id);
                            }}
                            data-testid={`button-delete-notification-${notification.id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0 rounded border border-border">
                            {notification.category === "service_host_connection" ? "connection" : notification.category === "transaction_sync" ? "sync" : notification.category.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

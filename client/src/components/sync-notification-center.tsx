import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { subscribeToSyncNotifications } from "@/hooks/use-pos-websocket";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCheck,
  Trash2,
  X,
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
      return severity === "info" && category === "transaction_sync" ? CheckCircle2 : Info;
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case "critical":
      return "text-red-500";
    case "warning":
      return "text-amber-500";
    case "info":
    default:
      return "text-green-500";
  }
}

function getSeverityBg(severity: string) {
  switch (severity) {
    case "critical":
      return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
    case "warning":
      return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    case "info":
    default:
      return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  }
}

export function SyncNotificationCenter({ propertyId, enterpriseId }: SyncNotificationCenterProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

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

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/sync-notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/api/sync-notifications") });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const body = propertyId ? { propertyId } : enterpriseId ? { enterpriseId } : null;
      if (!body) return;
      await apiRequest("POST", "/api/sync-notifications/mark-all-read", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/api/sync-notifications") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/sync-notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/api/sync-notifications") });
    },
  });

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
          {unreadCount > 0 ? (
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
        <div className="flex items-center justify-between px-4 py-3 border-b">
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
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-96">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p>No sync notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const IconComponent = getSeverityIcon(notification.severity, notification.category);
                const colorClass = getSeverityColor(notification.severity);
                const bgClass = notification.read ? "" : getSeverityBg(notification.severity);

                return (
                  <div
                    key={notification.id}
                    className={`p-3 hover:bg-muted/50 transition-colors cursor-pointer ${bgClass} ${!notification.read ? "border-l-2" : ""}`}
                    onClick={() => {
                      if (!notification.read) {
                        markReadMutation.mutate(notification.id);
                      }
                    }}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <IconComponent className={`h-4 w-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${!notification.read ? "font-semibold" : ""}`}>
                            {notification.title}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
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
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                            {notification.category.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

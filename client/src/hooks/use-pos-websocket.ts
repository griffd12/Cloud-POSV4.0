import { useEffect, useRef, useCallback } from "react";
import { queryClient, getAuthHeaders } from "@/lib/queryClient";
import { getDeviceToken } from "@/hooks/use-device-enrollment";

interface PosEvent {
  type: string;
  payload?: {
    customerId?: string;
    currentPoints?: number;
    lifetimePoints?: number;
    checkId?: string;
    status?: string;
    itemId?: string;
    paymentId?: string;
    entityType?: string;
    entityId?: string;
    reportType?: string;
    rvcId?: string;
    cardId?: string;
    propertyId?: string;
    menuItemId?: string;
    employeeId?: string;
    message?: string;
    source?: string;
    timestamp?: string;
    closedBusinessDate?: string;
    newBusinessDate?: string;
    propertyName?: string;
  };
}

// Global event listeners for test tickets
const kdsTestTicketListeners: Set<(payload: PosEvent['payload']) => void> = new Set();

export function subscribeToKdsTestTicket(callback: (payload: PosEvent['payload']) => void) {
  kdsTestTicketListeners.add(callback);
  return () => { kdsTestTicketListeners.delete(callback); };
}

export function usePosWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    isUnmountedRef.current = false;
    
    const connect = () => {
      if (isUnmountedRef.current) return;
      
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/kds`;
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmountedRef.current) {
            ws.close();
            return;
          }
          // Include device token for authentication
          const deviceToken = getDeviceToken();
          ws.send(JSON.stringify({ 
            type: "subscribe", 
            channel: "all",
            deviceToken 
          }));
        };

        ws.onmessage = (event) => {
          if (isUnmountedRef.current) return;
          try {
            const data: PosEvent = JSON.parse(event.data);
            handlePosEvent(data);
          } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!isUnmountedRef.current) {
            reconnectTimeoutRef.current = setTimeout(connect, 2000);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          ws.close();
        };
      } catch (error) {
        console.error("Failed to connect WebSocket:", error);
        if (!isUnmountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
      }
    };

    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return wsRef;
}

function handlePosEvent(event: PosEvent) {
  const getKeyString = (key: unknown): string => String(key ?? "");
  
  switch (event.type) {
    case "loyalty_update":
      if (event.payload?.customerId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/pos/customers", event.payload.customerId] 
        });
        queryClient.invalidateQueries({ 
          queryKey: ["/api/loyalty-members", event.payload.customerId] 
        });
      }
      queryClient.invalidateQueries({ 
        queryKey: ["/api/loyalty-members"] 
      });
      queryClient.invalidateQueries({
        predicate: (query) => 
          getKeyString(query.queryKey[0]).includes("/api/pos/customers")
      });
      break;

    case "check_update":
      if (event.payload?.checkId) {
        const checkId = event.payload.checkId;
        queryClient.invalidateQueries({
          predicate: (query) => 
            query.queryKey.some(k => k === checkId)
        });
      }
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/checks") ||
            key.includes("/api/reports") ||
            key.includes("/api/sales-summary");
        }
      });
      break;

    case "check_item_update":
      if (event.payload?.checkId) {
        const checkId = event.payload.checkId;
        queryClient.invalidateQueries({
          predicate: (query) => 
            query.queryKey.some(k => k === checkId)
        });
      }
      break;

    case "payment_update":
      if (event.payload?.checkId) {
        const checkId = event.payload.checkId;
        queryClient.invalidateQueries({
          predicate: (query) => 
            query.queryKey.some(k => k === checkId)
        });
      }
      queryClient.invalidateQueries({
        predicate: (query) => 
          getKeyString(query.queryKey[0]).includes("/api/checks")
      });
      break;

    case "kds_update":
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      break;

    case "menu_update":
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/menu-items") ||
            key.includes("/api/slus") ||
            key.includes("/api/modifier");
        }
      });
      break;

    case "employee_update":
      queryClient.invalidateQueries({
        predicate: (query) => 
          getKeyString(query.queryKey[0]).includes("/api/employees")
      });
      break;

    case "job_update":
      queryClient.invalidateQueries({
        predicate: (query) => 
          getKeyString(query.queryKey[0]).includes("/api/job-codes")
      });
      break;

    case "admin_update":
      const entityType = event.payload?.entityType;
      if (entityType) {
        queryClient.invalidateQueries({
          predicate: (query) => 
            getKeyString(query.queryKey[0]).includes(`/api/${entityType}`)
        });
      }
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/properties") || key.includes("/api/rvcs");
        }
      });
      break;

    case "inventory_update":
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/inventory") ||
            key.includes("/api/prep-items") ||
            key.includes("/api/item-availability");
        }
      });
      break;

    case "schedule_update":
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/shifts") ||
            key.includes("/api/timecards") ||
            key.includes("/api/time-punches") ||
            key.includes("/api/schedules");
        }
      });
      break;

    case "report_update":
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/reports") ||
            key.includes("/api/fiscal") ||
            key.includes("/api/sales-forecast") ||
            key.includes("/api/labor-forecast");
        }
      });
      break;

    case "gift_card_update":
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/gift-cards") ||
            key.includes("/api/pos/gift-cards");
        }
      });
      if (event.payload?.cardId) {
        queryClient.invalidateQueries({
          predicate: (query) => 
            query.queryKey.some(k => k === event.payload?.cardId)
        });
      }
      break;

    case "dashboard_update":
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/dashboard") ||
            key.includes("/api/sales-summary") ||
            key.includes("/api/reports") ||
            key.includes("/api/checks");
        }
      });
      break;

    case "tip_update":
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/tip-pool") ||
            key.includes("/api/tip-allocations");
        }
      });
      break;

    case "availability_update":
      // Invalidate item availability queries for real-time sync across all terminals
      if (event.payload?.propertyId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/item-availability", event.payload.propertyId]
        });
      }
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/item-availability");
        }
      });
      break;

    case "time_punch_update":
      // Invalidate time punch queries for real-time sync
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/time-punches");
        }
      });
      break;

    case "timecard_update":
      // Invalidate timecard queries for real-time sync
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/timecards");
        }
      });
      break;

    case "kds_test_ticket":
      // Notify all listeners about test ticket
      kdsTestTicketListeners.forEach(listener => listener(event.payload));
      break;

    case "BUSINESS_DATE_ROLLOVER":
      console.log("[WebSocket] Business date rollover:", event.payload);
      if ((window as any).electronAPI?.rotateLogsForBusinessDate && event.payload?.closedBusinessDate) {
        (window as any).electronAPI.rotateLogsForBusinessDate(event.payload.closedBusinessDate as string);
      }
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/fiscal") ||
            key.includes("/api/properties") ||
            key.includes("/api/reports") ||
            key.includes("/api/sales-summary");
        }
      });
      break;

    case "sync_notification":
      syncNotificationListeners.forEach(listener => listener(event.payload));
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = getKeyString(query.queryKey[0]);
          return key.includes("/api/sync-notifications");
        }
      });
      break;

    case "device_reload":
      // Remote reload command from EMC
      console.log("[WebSocket] Received reload command:", event.payload);
      // Notify all reload listeners
      deviceReloadListeners.forEach(listener => listener(event.payload));
      break;

    case "device_reload_all":
      // Reload all devices (optionally scoped by property)
      console.log("[WebSocket] Received reload all command:", event.payload);
      deviceReloadAllListeners.forEach(listener => listener(event.payload));
      break;

    default:
      break;
  }
}

// Global event listeners for sync notifications
const syncNotificationListeners: Set<(payload: PosEvent['payload']) => void> = new Set();

export function subscribeToSyncNotifications(callback: (payload: PosEvent['payload']) => void) {
  syncNotificationListeners.add(callback);
  return () => { syncNotificationListeners.delete(callback); };
}

// Global event listeners for targeted device reload commands
const deviceReloadListeners: Set<(payload: PosEvent['payload']) => void> = new Set();

// Global event listeners for reload-all commands
const deviceReloadAllListeners: Set<(payload: PosEvent['payload']) => void> = new Set();

export function subscribeToDeviceReload(callback: (payload: PosEvent['payload']) => void) {
  deviceReloadListeners.add(callback);
  return () => { deviceReloadListeners.delete(callback); };
}

export function subscribeToDeviceReloadAll(callback: (payload: PosEvent['payload']) => void) {
  deviceReloadAllListeners.add(callback);
  return () => { deviceReloadAllListeners.delete(callback); };
}

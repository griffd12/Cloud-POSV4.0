import { useEffect, useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import { useDeviceContext } from "@/lib/device-context";

interface ConfigUpdateEvent {
  type: "config_update";
  payload: {
    category: string;
    action: "create" | "update" | "delete";
    entityId?: string | number;
    enterpriseId?: string | number;
    timestamp: string;
  };
}

const CATEGORY_TO_QUERY_KEYS: Record<string, string[]> = {
  menu: ["/api/menu-items", "/api/slus"],
  slus: ["/api/slus", "/api/menu-items"],
  employees: ["/api/employees"],
  rvcs: ["/api/rvcs"],
  tenders: ["/api/tenders"],
  discounts: ["/api/discounts"],
  service_charges: ["/api/service-charges"],
  printers: ["/api/printers"],
  properties: ["/api/properties"],
  page_layouts: ["/api/page-layouts"],
  taxes: ["/api/taxes", "/api/tax-groups"],
  modifiers: ["/api/modifier-groups", "/api/modifiers"],
  pos_layouts: ["/api/pos-layouts"],
  major_groups: ["/api/major-groups", "/api/menu-items"],
  family_groups: ["/api/family-groups", "/api/menu-items"],
  tax_groups: ["/api/tax-groups", "/api/taxes"],
  print_classes: ["/api/print-classes"],
  order_devices: ["/api/order-devices"],
  kds_devices: ["/api/kds-devices"],
  print_routing: ["/api/print-class-routing"],
  workstations: ["/api/workstations"],
  roles: ["/api/roles", "/api/privileges"],
  enterprises: ["/api/enterprises"],
  devices: ["/api/devices", "/api/terminal-devices"],
  ingredients: ["/api/menu-items", "/api/ingredient-prefixes"],
  job_codes: ["/api/job-codes", "/api/employees"],
};

export function useConfigSync() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false);
  
  // Get enterprise ID from device context
  const { enterpriseId } = useDeviceContext();

  const invalidateQueriesForCategory = useCallback((category: string, eventEnterpriseId?: string | number) => {
    // Only invalidate if the event is for our enterprise or no enterprise filter is set
    if (enterpriseId && eventEnterpriseId && String(eventEnterpriseId) !== String(enterpriseId)) {
      return; // Skip updates for other enterprises
    }
    
    const queryKeys = CATEGORY_TO_QUERY_KEYS[category] || [];
    queryKeys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
    if (queryKeys.length === 0) {
      queryClient.invalidateQueries();
    }
  }, [enterpriseId]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/kds`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectedRef.current = true;
        // Subscribe with enterprise ID if available
        ws.send(JSON.stringify({ 
          type: "subscribe", 
          channel: "all",
          enterpriseId: enterpriseId || undefined
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "config_update") {
            const configEvent = data as ConfigUpdateEvent;
            invalidateQueriesForCategory(configEvent.payload.category, configEvent.payload.enterpriseId);
          }
        } catch {
        }
      };

      ws.onclose = () => {
        isConnectedRef.current = false;
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
    }
  }, [invalidateQueriesForCategory, enterpriseId]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected: isConnectedRef.current };
}

export function useConfigSyncPolling(intervalMs: number = 60000) {
  const lastCheckRef = useRef<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/health");
        if (response.ok) {
          const timeSinceLastCheck = Date.now() - lastCheckRef.current;
          if (timeSinceLastCheck > intervalMs * 2) {
            queryClient.invalidateQueries();
          }
          lastCheckRef.current = Date.now();
        }
      } catch {
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs]);
}

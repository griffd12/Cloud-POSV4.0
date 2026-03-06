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
  menu: ["/api/menu-items", "/api/slus", "/api/pos-layouts", "/api/pos-layouts/default"],
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
  pos_layouts: ["/api/pos-layouts", "/api/pos-layouts/default"],
  major_groups: ["/api/major-groups", "/api/menu-items"],
  family_groups: ["/api/family-groups", "/api/menu-items"],
  tax_groups: ["/api/tax-groups", "/api/taxes"],
  print_classes: ["/api/print-classes"],
  order_devices: ["/api/order-devices"],
  kds_devices: ["/api/kds-devices", "/api/kds-devices/active"],
  print_routing: ["/api/print-class-routing"],
  workstations: ["/api/workstations"],
  roles: ["/api/roles", "/api/privileges"],
  enterprises: ["/api/enterprises"],
  devices: ["/api/devices", "/api/terminal-devices", "/api/device-enrollment-tokens"],
  ingredients: ["/api/menu-items", "/api/ingredient-prefixes"],
  job_codes: ["/api/job-codes", "/api/employees"],
};

const ALL_CONFIG_QUERY_PREFIXES = [
  "/api/menu-items",
  "/api/slus",
  "/api/pos-layouts",
  "/api/pos-layouts/default",
  "/api/employees",
  "/api/rvcs",
  "/api/tenders",
  "/api/discounts",
  "/api/service-charges",
  "/api/printers",
  "/api/properties",
  "/api/page-layouts",
  "/api/taxes",
  "/api/tax-groups",
  "/api/modifier-groups",
  "/api/modifiers",
  "/api/major-groups",
  "/api/family-groups",
  "/api/print-classes",
  "/api/order-devices",
  "/api/kds-devices",
  "/api/workstations",
  "/api/roles",
  "/api/privileges",
  "/api/enterprises",
  "/api/devices",
  "/api/terminal-devices",
  "/api/ingredient-prefixes",
  "/api/job-codes",
];

function logConfigSync(level: string, ...args: any[]) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`[ConfigSync ${timestamp}] [${level}]`, ...args);
  if (typeof window !== "undefined" && (window as any).electronAPI?.log) {
    (window as any).electronAPI.log(level, "ConfigSync", args.join(" "));
  }
}

export function useConfigSync() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false);
  const hasConnectedBeforeRef = useRef(false);
  
  const { enterpriseId } = useDeviceContext();

  const invalidateAllConfigQueries = useCallback(() => {
    logConfigSync("INFO", "Invalidating all config queries (reconnect catch-up)");
    ALL_CONFIG_QUERY_PREFIXES.forEach((prefix) => {
      queryClient.invalidateQueries({ queryKey: [prefix] });
    });
  }, []);

  const invalidateQueriesForCategory = useCallback((category: string, eventEnterpriseId?: string | number) => {
    if (enterpriseId && eventEnterpriseId && String(eventEnterpriseId) !== String(enterpriseId)) {
      return;
    }
    
    const queryKeys = CATEGORY_TO_QUERY_KEYS[category] || [];
    logConfigSync("INFO", `Config update: category=${category}, action=invalidate, keys=${queryKeys.join(", ") || "ALL"}`);
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
      logConfigSync("INFO", `Connecting to ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectedRef.current = true;
        ws.send(JSON.stringify({ 
          type: "subscribe", 
          channel: "all",
          enterpriseId: enterpriseId || undefined
        }));

        if (hasConnectedBeforeRef.current) {
          logConfigSync("WARN", "WebSocket reconnected — invalidating all config queries to catch up on missed updates");
          invalidateAllConfigQueries();
        } else {
          logConfigSync("INFO", "WebSocket connected (first connect)");
          hasConnectedBeforeRef.current = true;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "config_update") {
            const configEvent = data as ConfigUpdateEvent;
            logConfigSync("INFO", `Received config_update: category=${configEvent.payload.category}, action=${configEvent.payload.action}, entityId=${configEvent.payload.entityId || "none"}`);
            invalidateQueriesForCategory(configEvent.payload.category, configEvent.payload.enterpriseId);
          }
        } catch {
        }
      };

      ws.onclose = () => {
        logConfigSync("WARN", "WebSocket disconnected, will reconnect in 2s");
        isConnectedRef.current = false;
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        logConfigSync("ERROR", "WebSocket error, closing connection");
        ws.close();
      };
    } catch {
      logConfigSync("ERROR", "Failed to create WebSocket connection");
    }
  }, [invalidateQueriesForCategory, invalidateAllConfigQueries, enterpriseId]);

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

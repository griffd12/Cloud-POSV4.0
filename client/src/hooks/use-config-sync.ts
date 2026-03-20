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
  tip_pool_policies: ["/api/tip-pool-policies", "/api/tip-pool-runs"],
  tip_rules: ["/api/tip-rules", "/api/tip-rules/property"],
  overtime_rules: ["/api/overtime-rules"],
  break_rules: ["/api/break-rules"],
};

const ALL_CONFIG_QUERY_PREFIXES = Array.from(
  new Set(Object.values(CATEGORY_TO_QUERY_KEYS).flat())
);

function logConfigSync(level: string, ...args: any[]) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`[ConfigSync ${timestamp}] [${level}]`, ...args);
  if (typeof window !== "undefined" && (window as any).electronAPI?.log) {
    (window as any).electronAPI.log(level, "ConfigSync", args.join(" "));
  }
}

let connectionIdCounter = 0;
let hasEverConnected = false;

export function useConfigSync() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false);
  const isUnmountedRef = useRef(false);
  const activeConnectionIdRef = useRef<number>(0);
  
  const { enterpriseId } = useDeviceContext();

  const invalidateByPrefix = useCallback((prefix: string) => {
    queryClient.invalidateQueries({ queryKey: [prefix] });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = String(query.queryKey[0] || "");
        return firstKey !== prefix && firstKey.startsWith(prefix);
      },
    });
  }, []);

  const invalidateAllConfigQueries = useCallback(() => {
    logConfigSync("INFO", "Invalidating all config queries (reconnect catch-up)");
    ALL_CONFIG_QUERY_PREFIXES.forEach((prefix) => {
      invalidateByPrefix(prefix);
    });
  }, [invalidateByPrefix]);

  const invalidateQueriesForCategory = useCallback((category: string, eventEnterpriseId?: string | number) => {
    if (enterpriseId && eventEnterpriseId && String(eventEnterpriseId) !== String(enterpriseId)) {
      return;
    }
    
    const queryKeys = CATEGORY_TO_QUERY_KEYS[category] || [];
    logConfigSync("INFO", `Config update: category=${category}, action=invalidate, keys=${queryKeys.join(", ") || "ALL"}`);
    queryKeys.forEach((key) => {
      invalidateByPrefix(key);
    });
    if (queryKeys.length === 0) {
      queryClient.invalidateQueries();
    }
  }, [enterpriseId, invalidateByPrefix]);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const serviceHostUrl = localStorage.getItem('serviceHostUrl');
    let wsUrl: string;
    if (serviceHostUrl) {
      try {
        const shUrl = new URL(serviceHostUrl);
        const wsProtocol = shUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProtocol}//${shUrl.host}/ws/kds`;
      } catch {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        wsUrl = `${protocol}//${window.location.host}/ws/kds`;
      }
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}/ws/kds`;
    }
    const connId = ++connectionIdCounter;
    activeConnectionIdRef.current = connId;

    try {
      logConfigSync("INFO", `Connecting to ${wsUrl} (connId=${connId})`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (activeConnectionIdRef.current !== connId) {
          logConfigSync("WARN", `Stale socket opened (connId=${connId}, active=${activeConnectionIdRef.current}), closing`);
          ws.close();
          return;
        }
        isConnectedRef.current = true;
        ws.send(JSON.stringify({ 
          type: "subscribe", 
          channel: "all",
          enterpriseId: enterpriseId || undefined
        }));

        if (hasEverConnected) {
          logConfigSync("WARN", "WebSocket reconnected — invalidating all config queries to catch up on missed updates");
          invalidateAllConfigQueries();
        } else {
          logConfigSync("INFO", "WebSocket connected (first connect)");
        }
        hasEverConnected = true;
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
        if (activeConnectionIdRef.current !== connId) {
          logConfigSync("INFO", `Stale socket closed (connId=${connId}, active=${activeConnectionIdRef.current}), ignoring`);
          return;
        }
        logConfigSync("WARN", "WebSocket disconnected, will reconnect in 2s");
        isConnectedRef.current = false;
        wsRef.current = null;
        if (!isUnmountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
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
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        activeConnectionIdRef.current = -1;
        wsRef.current.close();
        wsRef.current = null;
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

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders, failoverFetch } from "@/lib/queryClient";

export interface ServiceStatus {
  status: "online" | "offline" | "error" | "unknown" | "no_agents";
  message: string;
}

export interface PrintAgentInfo {
  id: string;
  name: string;
  status: string;
  lastHeartbeat: string | null;
}

export interface PrintAgentStatus extends ServiceStatus {
  connectedCount: number;
  totalCount: number;
  agents: PrintAgentInfo[];
}

export interface SystemStatus {
  timestamp: string;
  overallStatus: "healthy" | "degraded" | "critical";
  services: {
    database: ServiceStatus;
    emc: ServiceStatus;
    printAgent: PrintAgentStatus;
  };
  error?: string;
}

interface UseSystemStatusOptions {
  propertyId?: string;
  pollInterval?: number;
  enabled?: boolean;
}

export function useSystemStatus(options: UseSystemStatusOptions = {}) {
  const { propertyId, pollInterval = 30000, enabled = true } = options;
  
  const queryKey = propertyId 
    ? ["/api/pos/system-status", propertyId] 
    : ["/api/pos/system-status"];

  const { data, isLoading, error, refetch, isFetching } = useQuery<SystemStatus>({
    queryKey,
    queryFn: async () => {
      const url = propertyId 
        ? `/api/pos/system-status?propertyId=${propertyId}`
        : "/api/pos/system-status";
      const res = await failoverFetch(url, { 
        credentials: "include", 
        headers: getAuthHeaders() 
      });
      if (!res.ok) {
        throw new Error("Failed to fetch system status");
      }
      return res.json();
    },
    enabled,
    refetchInterval: pollInterval,
    staleTime: 10000,
  });

  const getStatusColor = useCallback((status: string): string => {
    switch (status) {
      case "online":
      case "healthy":
        return "text-green-500";
      case "degraded":
      case "unknown":
        return "text-yellow-500";
      case "offline":
      case "error":
      case "critical":
        return "text-red-500";
      case "no_agents":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  }, []);

  const getStatusIcon = useCallback((status: string): "online" | "offline" | "warning" | "none" => {
    switch (status) {
      case "online":
      case "healthy":
        return "online";
      case "degraded":
      case "unknown":
        return "warning";
      case "offline":
      case "error":
      case "critical":
        return "offline";
      case "no_agents":
        return "none";
      default:
        return "none";
    }
  }, []);

  return {
    status: data,
    isLoading,
    isFetching,
    error,
    refetch,
    getStatusColor,
    getStatusIcon,
  };
}

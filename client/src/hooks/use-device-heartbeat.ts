import { useEffect, useRef, useCallback } from "react";
import { getAuthHeaders , failoverFetch } from "@/lib/queryClient";

const HEARTBEAT_INTERVAL_MS = 30000; // Send heartbeat every 30 seconds

export function useDeviceHeartbeat(enabled: boolean = true) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      if (!headers["X-Device-Token"]) {
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await failoverFetch("/api/registered-devices/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error) {
      console.debug("Heartbeat failed:", error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    sendHeartbeat();

    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, sendHeartbeat]);

  return { sendHeartbeat };
}

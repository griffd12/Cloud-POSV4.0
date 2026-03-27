import { useState, useEffect, useRef, useCallback } from "react";
import { usePosContext } from "@/lib/pos-context";
import { apiRequest } from "@/lib/queryClient";

const WARNING_SECONDS = 30;

interface UseInactivityLogoutOptions {
  timeoutMinutes: number | null | undefined;
  enabled: boolean;
  onBeforeLogout?: () => Promise<void> | void;
}

export function useInactivityLogout({
  timeoutMinutes,
  enabled,
  onBeforeLogout,
}: UseInactivityLogoutOptions) {
  const { currentEmployee, currentCheck, logout } = usePosContext();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const currentCheckIdRef = useRef<string | null>(null);
  const currentEmployeeIdRef = useRef<string | null>(null);
  const warningDismissedRef = useRef(false);

  const [showWarning, setShowWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(WARNING_SECONDS);

  useEffect(() => {
    currentCheckIdRef.current = currentCheck?.id || null;
  }, [currentCheck?.id]);

  useEffect(() => {
    currentEmployeeIdRef.current = currentEmployee?.id || null;
  }, [currentEmployee?.id]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningDismissedRef.current = false;
  }, []);

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    setWarningSecondsLeft(WARNING_SECONDS);
    lastActivityRef.current = Date.now();
    warningDismissedRef.current = true;
    console.log("[Auto-Logout] User requested more time, timer reset");
  }, []);

  const cancelTransaction = useCallback(async () => {
    const checkId = currentCheckIdRef.current;
    const employeeId = currentEmployeeIdRef.current;

    if (!checkId) {
      console.log("[Auto-Logout] No current check to cancel");
      return;
    }

    console.log(`[Auto-Logout] Cancelling transaction for check ${checkId}`);

    try {
      const response = await apiRequest("POST", `/api/checks/${checkId}/cancel-transaction`, {
        employeeId,
        reason: "Auto-logout due to inactivity",
      });

      const data = await response.json();
      console.log(`[Auto-Logout] Transaction cancelled - voided ${data.voidedCount} item(s)`);
    } catch (error) {
      console.error("[Auto-Logout] Failed to cancel transaction:", error);
    }
  }, []);

  const performAutoLogout = useCallback(async () => {
    if (!currentEmployee) return;

    console.log("[Auto-Logout] Final timeout reached, logging out employee");
    setShowWarning(false);

    try {
      if (onBeforeLogout) {
        await onBeforeLogout();
      }
      await cancelTransaction();
    } catch (error) {
      console.error("[Auto-Logout] Error during pre-logout cleanup:", error);
    }

    logout();
  }, [currentEmployee, onBeforeLogout, cancelTransaction, logout]);

  useEffect(() => {
    if (!enabled || !timeoutMinutes || timeoutMinutes <= 0 || !currentEmployee) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setShowWarning(false);
      return;
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const warningMs = WARNING_SECONDS * 1000;
    console.log(`[Auto-Logout] Timer active: ${timeoutMinutes} minutes (${timeoutMs}ms), warning at ${WARNING_SECONDS}s before`);

    lastActivityRef.current = Date.now();

    const checkInactivity = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, timeoutMs - elapsed);

      if (elapsed >= timeoutMs) {
        performAutoLogout();
      } else if (remaining <= warningMs && !warningDismissedRef.current) {
        setShowWarning(true);
        setWarningSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        setShowWarning(false);
      }
    };

    timerRef.current = setInterval(checkInactivity, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, timeoutMinutes, currentEmployee, performAutoLogout]);

  useEffect(() => {
    if (!enabled || !timeoutMinutes || timeoutMinutes <= 0 || !currentEmployee) {
      return;
    }

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

    const handleActivity = () => {
      resetTimer();
      if (showWarning) {
        setShowWarning(false);
      }
    };

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, timeoutMinutes, currentEmployee, resetTimer, showWarning]);

  return {
    resetTimer,
    lastActivity: lastActivityRef.current,
    showWarning,
    warningSecondsLeft,
    dismissWarning,
  };
}

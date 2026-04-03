import { useState, useEffect, useRef } from "react";
import { connectionManager } from "@/lib/connection-manager";
import { Wifi, WifiOff, RefreshCw, CloudOff } from "lucide-react";
import { LfsModeBar } from "./lfs-mode-indicator";

function detectLfsMode(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("lfs=1")) return true;
  if (localStorage.getItem("lfs_local_server_url") === window.location.origin) return true;
  return false;
}

function CloudOfflineBanner() {
  const [state, setState] = useState(connectionManager.currentState);
  const [syncProgress, setSyncProgress] = useState(connectionManager.currentSyncProgress);
  const [pendingCount, setPendingCount] = useState(connectionManager.pendingSync);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = connectionManager.subscribe((newState) => {
      setState(newState);
      setSyncProgress(connectionManager.currentSyncProgress);
      setPendingCount(connectionManager.pendingSync);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (state === "cloud-offline") {
      const pollCount = async () => {
        const lfsUrl = connectionManager.localServerUrl;
        if (!lfsUrl) return;
        try {
          const res = await fetch(`${lfsUrl}/api/lfs/journal/count`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const { count } = await res.json();
            connectionManager.pendingSync = count;
            setPendingCount(count);
          }
        } catch {}
      };
      pollCount();
      pollRef.current = setInterval(pollCount, 10000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state]);

  if (state === "cloud-online") return null;

  const config: Record<string, { bg: string; icon: JSX.Element; text: string }> = {
    "cloud-degraded": {
      bg: "bg-yellow-500",
      icon: <Wifi className="h-4 w-4 animate-pulse" />,
      text: "Cloud connection unstable",
    },
    "cloud-offline": {
      bg: "bg-amber-600",
      icon: <WifiOff className="h-4 w-4" />,
      text: "RUNNING LOCALLY — offline mode",
    },
    reconnecting: {
      bg: "bg-blue-600",
      icon: <RefreshCw className="h-4 w-4 animate-spin" />,
      text: syncProgress ? syncProgress.phase : "Reconnecting to cloud...",
    },
  };

  const c = config[state] || config["cloud-offline"];

  return (
    <div
      data-testid="offline-banner"
      className={`${c.bg} text-white px-4 py-2 flex items-center justify-between text-sm font-medium z-50 shrink-0`}
    >
      <div className="flex items-center gap-2">
        {c.icon}
        <span data-testid="offline-banner-text">{c.text}</span>
      </div>
      {state === "cloud-offline" && pendingCount > 0 && (
        <div className="flex items-center gap-1" data-testid="offline-pending-count">
          <CloudOff className="h-3.5 w-3.5" />
          <span>{pendingCount} pending sync</span>
        </div>
      )}
      {state === "reconnecting" && syncProgress && (
        <div className="flex items-center gap-2" data-testid="sync-progress">
          <div className="w-24 h-1.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{
                width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-xs">
            {syncProgress.current}/{syncProgress.total}
          </span>
        </div>
      )}
    </div>
  );
}

export function OfflineBanner() {
  const [lfsMode, setLfsMode] = useState(detectLfsMode);

  useEffect(() => {
    if (lfsMode) return;
    let cancelled = false;
    fetch("/api/health", { signal: AbortSignal.timeout(4000) })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.mode === "local") {
          localStorage.setItem("lfs_local_server_url", window.location.origin);
          setLfsMode(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [lfsMode]);

  if (lfsMode) {
    return <LfsModeBar />;
  }
  return <CloudOfflineBanner />;
}

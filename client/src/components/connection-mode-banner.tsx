import { useConnectionMode, type ConnectionMode } from "@/lib/api-client";
import { Wifi, Signal, WifiOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";

interface ConnectionModeBannerProps {
  className?: string;
}

interface SyncStatus {
  pending: number;
  lastSync: string | null;
  lastError: string | null;
  localDbHealthy: boolean;
  mode: string;
}

const modeConfig: Record<Exclude<ConnectionMode, 'orange'>, {
  bgColor: string;
  textColor: string;
  label: string;
  shortLabel: string;
  Icon: typeof Wifi;
}> = {
  green: {
    bgColor: "bg-green-500",
    textColor: "text-white",
    label: "Cloud Syncing - All data syncing to cloud",
    shortLabel: "CLOUD",
    Icon: Wifi,
  },
  yellow: {
    bgColor: "bg-yellow-500",
    textColor: "text-black",
    label: "LAN Only - Using local CAPS server",
    shortLabel: "LAN",
    Icon: Signal,
  },
  red: {
    bgColor: "bg-red-500",
    textColor: "text-white",
    label: "Standalone - Local database only",
    shortLabel: "OFFLINE",
    Icon: WifiOff,
  },
};

export function ConnectionModeBanner({ className = "" }: ConnectionModeBannerProps) {
  const { mode, status } = useConnectionMode();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [localDbCritical, setLocalDbCritical] = useState(false);

  useEffect(() => {
    const w = window as any;
    if (w.electronAPI?.onSyncStatus) {
      const unsub = w.electronAPI.onSyncStatus((s: SyncStatus) => {
        setSyncStatus(s);
        if (s && s.localDbHealthy === false) {
          setLocalDbCritical(true);
        }
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    const w = window as any;
    if (w.electronAPI?.onLocalDbCritical) {
      const unsub = w.electronAPI.onLocalDbCritical(() => {
        setLocalDbCritical(true);
      });
      return unsub;
    }
  }, []);

  const effectiveMode = mode === 'orange' ? 'red' : mode;
  const config = modeConfig[effectiveMode as keyof typeof modeConfig] || modeConfig.red;
  const Icon = config.Icon;
  const pendingCount = syncStatus?.pending || 0;

  if (localDbCritical) {
    return (
      <div
        data-testid="local-db-critical-overlay"
        className="fixed inset-0 z-[9999] bg-red-900 flex items-center justify-center"
      >
        <div className="text-center text-white p-8 max-w-md">
          <WifiOff className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Local Database Error</h1>
          <p className="text-lg opacity-90">POS cannot operate. Contact support immediately.</p>
          <p className="mt-4 text-sm opacity-70">The local SQLite database is not responding. No transactions can be processed.</p>
        </div>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-testid="connection-mode-banner"
          className={`h-6 w-full flex items-center justify-center gap-2 ${config.bgColor} ${config.textColor} text-xs font-medium select-none cursor-default ${className}`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{config.shortLabel}</span>
          {pendingCount > 0 && (
            <span data-testid="text-pending-sync-count" className="opacity-80">| {pendingCount} pending</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">{config.label}</p>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Cloud: {status?.cloudReachable ? "Connected" : "Disconnected"}</p>
            <p>Local DB: {syncStatus?.localDbHealthy !== false ? "Healthy" : "ERROR"}</p>
            <p>Pending sync: {pendingCount} items</p>
            {syncStatus?.lastSync && (
              <p>Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}</p>
            )}
            {syncStatus?.lastError && (
              <p className="text-red-400">Last error: {syncStatus.lastError}</p>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

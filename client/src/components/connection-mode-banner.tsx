import { useConnectionMode, type ConnectionMode } from "@/lib/api-client";
import { Wifi, Signal, WifiOff, AlertTriangle, Loader2 } from "lucide-react";
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

type CapsBootStage = 'starting' | 'connecting' | 'loading-config' | 'ready' | 'failed' | 'unreachable' | 'no-caps-url' | null;

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
    label: "Store Server Unreachable — POS operations disabled",
    shortLabel: "OFFLINE",
    Icon: WifiOff,
  },
};

export function ConnectionModeBanner({ className = "" }: ConnectionModeBannerProps) {
  const { mode, status } = useConnectionMode();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [localDbCritical, setLocalDbCritical] = useState(false);
  const [capsBootStage, setCapsBootStage] = useState<CapsBootStage>(null);

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
    if (w.electronAPI?.getCapsBootStatus) {
      w.electronAPI.getCapsBootStatus().then((bootStatus: { stage: string }) => {
        if (bootStatus?.stage) setCapsBootStage(bootStatus.stage as CapsBootStage);
      }).catch(() => {});
    }
    if (w.electronAPI?.onCapsBootStatus) {
      const unsub = w.electronAPI.onCapsBootStatus((bootStatus: { stage: string }) => {
        setCapsBootStage((bootStatus?.stage as CapsBootStage) || null);
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

  const isBooting = capsBootStage === 'starting' || capsBootStage === 'connecting' || capsBootStage === 'loading-config';
  const isFailed = capsBootStage === 'failed';

  const handleRetryBoot = () => {
    const w = window as any;
    if (w.electronAPI?.retryCapsBoot) {
      w.electronAPI.retryCapsBoot().catch(() => {});
    }
  };

  if (isFailed) {
    return (
      <>
        <div
          data-testid="caps-boot-failed-overlay"
          className="fixed inset-0 z-[9998] bg-red-900/95 flex items-center justify-center"
        >
          <div className="text-center text-white p-8 max-w-lg">
            <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-yellow-300" />
            <h1 className="text-3xl font-bold mb-4" data-testid="text-caps-boot-failed-title">Store Server Not Ready</h1>
            <p className="text-lg opacity-90 mb-2" data-testid="text-caps-boot-failed-message">
              The store server (CAPS) did not become ready within 30 seconds.
            </p>
            <p className="text-base opacity-80 mt-2">POS cannot operate without the store server.</p>
            <button
              data-testid="button-retry-caps-boot"
              onClick={handleRetryBoot}
              className="mt-8 px-8 py-3 bg-white text-red-900 font-bold rounded-lg text-lg hover:bg-gray-100 transition-colors"
            >
              Retry Connection
            </button>
            <p className="mt-4 text-sm opacity-60">Contact a manager if this persists.</p>
          </div>
        </div>
        <div
          data-testid="connection-mode-banner"
          className={`h-6 w-full flex items-center justify-center gap-2 bg-red-500 text-white text-xs font-medium select-none cursor-default ${className}`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>CAPS FAILED</span>
        </div>
      </>
    );
  }

  if (isBooting) {
    const bootMessage = capsBootStage === 'connecting' 
      ? 'Connecting to store server...' 
      : capsBootStage === 'loading-config'
        ? 'Loading configuration...'
        : 'Starting up...';
    return (
      <>
        <div
          data-testid="caps-boot-overlay"
          className="fixed inset-0 z-[9998] bg-slate-900/95 flex items-center justify-center"
        >
          <div className="text-center text-white p-8 max-w-lg">
            <Loader2 className="h-16 w-16 mx-auto mb-4 text-blue-400 animate-spin" />
            <h1 className="text-3xl font-bold mb-4" data-testid="text-caps-boot-title">Starting Up</h1>
            <p className="text-lg opacity-90 mb-2" data-testid="text-caps-boot-message">{bootMessage}</p>
            <p className="mt-6 text-sm opacity-70">Please wait while the system initializes.</p>
            <div className="mt-8 flex items-center justify-center gap-2 text-blue-400">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-sm font-medium">Initializing...</span>
            </div>
          </div>
        </div>
        <div
          data-testid="connection-mode-banner"
          className={`h-6 w-full flex items-center justify-center gap-2 bg-blue-500 text-white text-xs font-medium select-none cursor-default ${className}`}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>STARTING</span>
        </div>
      </>
    );
  }

  if (effectiveMode === 'red') {
    return (
      <>
        <div
          data-testid="caps-unreachable-overlay"
          className="fixed inset-0 z-[9998] bg-red-900/95 flex items-center justify-center"
        >
          <div className="text-center text-white p-8 max-w-lg">
            <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-yellow-300" />
            <h1 className="text-3xl font-bold mb-4" data-testid="text-caps-unreachable-title">Store Server Unreachable</h1>
            <p className="text-lg opacity-90 mb-2">Cannot connect to the store server (CAPS).</p>
            <p className="text-lg opacity-90">POS operations are disabled until the connection is restored.</p>
            <p className="mt-6 text-sm opacity-70">Contact a manager if this persists. The system will automatically reconnect when the store server becomes available.</p>
            <div className="mt-8 flex items-center justify-center gap-2 text-yellow-300">
              <div className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
              <span className="text-sm font-medium">Attempting to reconnect...</span>
            </div>
          </div>
        </div>
        <div
          data-testid="connection-mode-banner"
          className={`h-6 w-full flex items-center justify-center gap-2 ${config.bgColor} ${config.textColor} text-xs font-medium select-none cursor-default ${className}`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{config.shortLabel}</span>
        </div>
      </>
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

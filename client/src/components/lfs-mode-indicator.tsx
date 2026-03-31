import { useState, useEffect } from "react";
import { Wifi, WifiOff, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface LfsModeData {
  mode: "green" | "yellow" | "red";
  meaning: string;
  internetAvailable: boolean;
  cloudReachable: boolean;
  pendingJournalEntries: number;
  configSync: { lastSync: string; nextSync: string; status: string } | null;
  cloudSync: { isSyncing: boolean; lastSyncAt: string | null; lastSyncError: string | null; syncCount: number };
}

const MODE_CONFIG = {
  green: {
    bg: "bg-emerald-500",
    icon: CheckCircle2,
    label: "Online",
  },
  yellow: {
    bg: "bg-yellow-500",
    icon: AlertTriangle,
    label: "Degraded",
  },
  red: {
    bg: "bg-red-600",
    icon: WifiOff,
    label: "Offline",
  },
};

export function LfsModeIndicator() {
  const [modeData, setModeData] = useState<LfsModeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchMode = async () => {
      try {
        const res = await fetch("/api/lfs/mode", { signal: AbortSignal.timeout(5000) });
        if (res.ok && mounted) {
          setModeData(await res.json());
        }
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchMode();
    const interval = setInterval(fetchMode, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div data-testid="lfs-mode-loading" className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Checking...</span>
      </div>
    );
  }

  if (!modeData) return null;

  const config = MODE_CONFIG[modeData.mode];
  const Icon = config.icon;

  return (
    <div
      data-testid="lfs-mode-indicator"
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-white ${config.bg}`}
      title={modeData.meaning}
    >
      <Icon className="h-3 w-3" />
      <span data-testid="lfs-mode-label">{config.label}</span>
      {modeData.pendingJournalEntries > 0 && (
        <span data-testid="lfs-mode-pending" className="ml-1 px-1 bg-white/20 rounded text-[10px]">
          {modeData.pendingJournalEntries} pending
        </span>
      )}
    </div>
  );
}

export function LfsModeBar() {
  const [modeData, setModeData] = useState<LfsModeData | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchMode = async () => {
      try {
        const res = await fetch("/api/lfs/mode", { signal: AbortSignal.timeout(5000) });
        if (res.ok && mounted) {
          setModeData(await res.json());
        }
      } catch {
      }
    };

    fetchMode();
    const interval = setInterval(fetchMode, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (!modeData || modeData.mode === "green") return null;

  const config = MODE_CONFIG[modeData.mode];
  const Icon = config.icon;

  return (
    <div
      data-testid="lfs-mode-bar"
      className={`${config.bg} text-white px-4 py-2 flex items-center justify-between text-sm font-medium z-50 shrink-0`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span data-testid="lfs-mode-bar-text">{modeData.meaning}</span>
      </div>
      {modeData.pendingJournalEntries > 0 && (
        <div className="flex items-center gap-1" data-testid="lfs-mode-bar-pending">
          <span>{modeData.pendingJournalEntries} pending sync</span>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";
import { getIsOfflineMode, onOfflineModeChange, setOfflineModeExternal } from "@/lib/queryClient";

export function OfflineStatusBanner() {
  const [isOffline, setIsOffline] = useState(getIsOfflineMode());

  useEffect(() => {
    const unsub = onOfflineModeChange((offline) => setIsOffline(offline));
    return unsub;
  }, []);

  useEffect(() => {
    const w = window as any;
    if (w.electronAPI?.onConnectionMode) return;
    if (w.electronAPI?.onOnlineStatus) {
      const unsub = w.electronAPI.onOnlineStatus((online: boolean) => {
        setOfflineModeExternal(!online);
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    const w = window as any;
    if (w.electronAPI?.onConnectionMode) return;
    if (w.electronAPI?.getOnlineStatus) {
      w.electronAPI.getOnlineStatus().then((online: boolean) => {
        if (!online) {
          setOfflineModeExternal(true);
        }
      }).catch(() => {});
    }
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] bg-destructive text-destructive-foreground text-center py-1.5 px-4 text-xs font-medium flex items-center justify-center gap-2"
      data-testid="banner-offline-status"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>Offline Mode - Serving cached data. Transactions will sync when connection restores.</span>
    </div>
  );
}

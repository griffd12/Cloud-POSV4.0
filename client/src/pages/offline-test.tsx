import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Play,
  Database,
  Activity,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  Printer,
  Plug,
  Usb,
  Monitor,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { isElectron, type UpdateStatus } from "@/lib/electron";
import { getIsOfflineMode, onOfflineModeChange, fetchWithTimeout } from "@/lib/queryClient";
import { offlineStorage } from "@/lib/offline-storage";
import type { CachedConfig } from "@/lib/offline-storage";
import { useLocation } from "wouter";
import { useDeviceContext } from "@/lib/device-context";

interface FetchLogEntry {
  id: number;
  timestamp: string;
  url: string;
  method: string;
  status: "success" | "cached" | "error";
  statusCode?: number;
  duration: number;
  message: string;
}

interface StorageStats {
  configCount: number;
  checksCount: number;
  syncQueueCount: number;
  printQueueCount: number;
}

const TEST_ENDPOINTS = [
  { label: "Menu Items", url: "/api/menu-items?enterpriseId=1" },
  { label: "Employees", url: "/api/employees?enterpriseId=1" },
  { label: "Revenue Centers", url: "/api/rvcs?enterpriseId=1" },
  { label: "Discounts", url: "/api/discounts?enterpriseId=1" },
  { label: "Workstations", url: "/api/workstations?enterpriseId=1" },
];

export default function OfflineTestPage() {
  const [, setLocation] = useLocation();
  const { deviceType, propertyId: ctxPropertyId } = useDeviceContext();
  const backPath = deviceType === "kds" ? "/kds" : "/";
  const [isOffline, setIsOffline] = useState(getIsOfflineMode());
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [fetchLog, setFetchLog] = useState<FetchLogEntry[]>([]);
  const [cacheEntries, setCacheEntries] = useState<CachedConfig[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [idbAvailable, setIdbAvailable] = useState<boolean | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [comPorts, setComPorts] = useState<Array<{ path: string; manufacturer: string | null }>>([]);
  const [comPortsLoading, setComPortsLoading] = useState(false);
  const [comPortsError, setComPortsError] = useState<string | null>(null);
  const [selectedComPort, setSelectedComPort] = useState<string>("");
  const [manualComPort, setManualComPort] = useState<string>("");
  const [selectedBaudRate, setSelectedBaudRate] = useState<string>("9600");
  const [serialTestResult, setSerialTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [serialTesting, setSerialTesting] = useState(false);
  const [printAgentStatus, setPrintAgentStatus] = useState<any>(null);
  const [networkTestIp, setNetworkTestIp] = useState("");
  const [networkTestPort, setNetworkTestPort] = useState("9100");
  const [networkTestResult, setNetworkTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [networkTesting, setNetworkTesting] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<any>(null);
  const [deviceStatusLoading, setDeviceStatusLoading] = useState(false);
  const logIdRef = useRef(0);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);

  useEffect(() => {
    const unsub = onOfflineModeChange((offline) => setIsOffline(offline));
    return unsub;
  }, []);

  useEffect(() => {
    checkIdbAvailability();
    refreshCacheData();
  }, []);

  useEffect(() => {
    if (!isElectron()) return;
    const api = window.electronAPI;
    if (api?.getAppInfo) {
      api.getAppInfo().then((info: any) => {
        if (info?.version) setAppVersion(info.version);
      }).catch(() => {});
    }
    if (!api?.updater) return;
    api.updater.getStatus().then(setUpdateStatus).catch(() => {});
    if (api.onUpdateStatus) {
      const unsub = api.onUpdateStatus((status) => {
        setUpdateStatus(status);
        setCheckingUpdate(false);
      });
      return unsub;
    }
  }, []);

  const loadDeviceStatus = useCallback(async () => {
    let pid = ctxPropertyId || localStorage.getItem('device_property_id');
    if (!pid) {
      try {
        const propRes = await fetch('/api/properties');
        if (propRes.ok) {
          const props = await propRes.json();
          if (props.length > 0) pid = props[0].id;
        }
      } catch {}
    }
    if (!pid) return;
    setDeviceStatusLoading(true);
    try {
      const res = await fetch(`/api/properties/${pid}/device-status`);
      if (res.ok) {
        const data = await res.json();
        setDeviceStatus(data);
      }
    } catch {
    }
    setDeviceStatusLoading(false);
  }, [ctxPropertyId]);

  useEffect(() => {
    loadDeviceStatus();
  }, [loadDeviceStatus]);

  useEffect(() => {
    if (!isElectron()) return;
    const api = window.electronAPI;
    if (api?.printAgent) {
      api.printAgent.getStatus().then(setPrintAgentStatus).catch(() => {});
    }
    if (api?.diagnostics) {
      loadComPorts();
    }
  }, []);

  const loadComPorts = async () => {
    const api = window.electronAPI;
    if (!api?.diagnostics) return;
    setComPortsLoading(true);
    setComPortsError(null);
    try {
      const result = await api.diagnostics.listComPorts();
      if (result.success) {
        setComPorts(result.ports);
        if (result.ports.length > 0 && !selectedComPort) {
          setSelectedComPort(result.ports[0].path);
        }
      } else {
        setComPortsError(result.error || 'Failed to list COM ports');
      }
    } catch {
      setComPortsError('Failed to list COM ports');
    }
    setComPortsLoading(false);
  };

  const effectiveComPort = selectedComPort || manualComPort.trim().toUpperCase();

  const handleTestSerial = async (printTestPage: boolean) => {
    const api = window.electronAPI;
    if (!api?.diagnostics || !effectiveComPort) return;
    setSerialTesting(true);
    setSerialTestResult(null);
    try {
      const result = await api.diagnostics.testSerial(effectiveComPort, parseInt(selectedBaudRate), printTestPage);
      if (result.success) {
        const msg = printTestPage
          ? `Port opened in ${result.openTimeMs}ms, sent ${result.bytesSent} bytes with test page`
          : `Port opened successfully in ${result.openTimeMs}ms (connectivity OK)`;
        setSerialTestResult({ success: true, message: msg });
      } else {
        setSerialTestResult({ success: false, message: result.error || 'Test failed' });
      }
    } catch (err: any) {
      setSerialTestResult({ success: false, message: err.message || 'Test failed' });
    }
    setSerialTesting(false);
  };

  const handleTestNetwork = async () => {
    const api = window.electronAPI;
    if (!api?.diagnostics || !networkTestIp) return;
    setNetworkTesting(true);
    setNetworkTestResult(null);
    try {
      const result = await api.diagnostics.testNetworkPrinter(networkTestIp, parseInt(networkTestPort));
      if (result.success) {
        setNetworkTestResult({ success: true, message: `Connected in ${result.connectTimeMs}ms` });
      } else {
        setNetworkTestResult({ success: false, message: result.error || 'Connection failed' });
      }
    } catch (err: any) {
      setNetworkTestResult({ success: false, message: err.message || 'Test failed' });
    }
    setNetworkTesting(false);
  };

  const handleCheckUpdate = async () => {
    if (!isElectron() || !window.electronAPI?.updater) return;
    setCheckingUpdate(true);
    try {
      await window.electronAPI.updater.checkNow();
    } catch {
      setCheckingUpdate(false);
    }
  };

  const checkIdbAvailability = async () => {
    const available = await offlineStorage.isAvailable();
    setIdbAvailable(available);
  };

  const refreshCacheData = async () => {
    try {
      const [entries, stats] = await Promise.all([
        offlineStorage.getAllConfigEntries(),
        offlineStorage.getStorageStats(),
      ]);
      setCacheEntries(entries);
      setStorageStats(stats);
    } catch {
      setCacheEntries([]);
      setStorageStats(null);
    }
  };

  const addLogEntry = useCallback((entry: Omit<FetchLogEntry, "id" | "timestamp">) => {
    logIdRef.current++;
    setFetchLog((prev) => [
      {
        ...entry,
        id: logIdRef.current,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const enableSimulatedOffline = useCallback(() => {
    if (simulatedOffline) return;
    originalFetchRef.current = window.fetch;
    window.fetch = (() => {
      return Promise.reject(new TypeError("Failed to fetch"));
    }) as typeof window.fetch;
    setSimulatedOffline(true);
  }, [simulatedOffline]);

  const disableSimulatedOffline = useCallback(() => {
    if (!simulatedOffline || !originalFetchRef.current) return;
    window.fetch = originalFetchRef.current;
    originalFetchRef.current = null;
    setSimulatedOffline(false);
  }, [simulatedOffline]);

  useEffect(() => {
    return () => {
      if (originalFetchRef.current) {
        window.fetch = originalFetchRef.current;
        originalFetchRef.current = null;
      }
    };
  }, []);

  const runSingleTest = async (label: string, url: string) => {
    const start = performance.now();
    try {
      const res = await fetchWithTimeout(url);
      const duration = Math.round(performance.now() - start);
      const isCached = res.headers.get("X-Offline-Cache") === "true";
      addLogEntry({
        url,
        method: "GET",
        status: isCached ? "cached" : "success",
        statusCode: res.status,
        duration,
        message: isCached
          ? `${label}: Served from IndexedDB cache`
          : `${label}: Live server response (${res.status})`,
      });
    } catch (err: any) {
      const duration = Math.round(performance.now() - start);
      addLogEntry({
        url,
        method: "GET",
        status: "error",
        duration,
        message: `${label}: ${err.message || "Network error"}`,
      });
    }
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    setFetchLog([]);

    for (const endpoint of TEST_ENDPOINTS) {
      await runSingleTest(endpoint.label, endpoint.url);
      await new Promise((r) => setTimeout(r, 200));
    }

    await refreshCacheData();
    setIsRunningTests(false);
  };

  const clearAllCache = async () => {
    try {
      await offlineStorage.clearAllData();
      await refreshCacheData();
      addLogEntry({
        url: "local",
        method: "DELETE",
        status: "success",
        duration: 0,
        message: "All IndexedDB cache cleared",
      });
    } catch (err: any) {
      addLogEntry({
        url: "local",
        method: "DELETE",
        status: "error",
        duration: 0,
        message: `Clear failed: ${err.message}`,
      });
    }
  };

  const clearExpiredCache = async () => {
    try {
      const count = await offlineStorage.clearExpiredConfig();
      await refreshCacheData();
      addLogEntry({
        url: "local",
        method: "DELETE",
        status: "success",
        duration: 0,
        message: `Cleared ${count} expired cache entries`,
      });
    } catch (err: any) {
      addLogEntry({
        url: "local",
        method: "DELETE",
        status: "error",
        duration: 0,
        message: `Clear expired failed: ${err.message}`,
      });
    }
  };

  const formatTimeAgo = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    return `${Math.round(diff / 3600000)}h ago`;
  };

  const formatTimeRemaining = (isoString: string) => {
    const diff = new Date(isoString).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    if (diff < 60000) return `${Math.round(diff / 1000)}s`;
    if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
    return `${Math.round(diff / 3600000)}h`;
  };

  const getDataPreview = (data: any): string => {
    if (Array.isArray(data)) return `Array[${data.length}]`;
    if (typeof data === "object" && data !== null) {
      const keys = Object.keys(data);
      return `Object{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "..." : ""}}`;
    }
    return String(data).substring(0, 50);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-4" data-testid="offline-test-page">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(backPath)}
          data-testid="button-back"
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">
          Offline System Verification
        </h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Badge
            variant={isOffline ? "destructive" : "default"}
            data-testid="badge-connection-status"
          >
            {isOffline ? (
              <>
                <WifiOff className="w-3 h-3 mr-1" /> OFFLINE
              </>
            ) : (
              <>
                <Wifi className="w-3 h-3 mr-1" /> ONLINE
              </>
            )}
          </Badge>
          {simulatedOffline && (
            <Badge variant="outline" data-testid="badge-simulated">
              <AlertTriangle className="w-3 h-3 mr-1" /> Simulated
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card data-testid="card-system-status">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Connection</span>
              <Badge
                variant={isOffline ? "destructive" : "default"}
                className="text-xs"
                data-testid="status-connection"
              >
                {isOffline ? "Offline" : "Online"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">IndexedDB</span>
              <Badge
                variant={idbAvailable === null ? "outline" : idbAvailable ? "default" : "destructive"}
                className="text-xs"
                data-testid="status-indexeddb"
              >
                {idbAvailable === null ? "Checking..." : idbAvailable ? "Available" : "Unavailable"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fetch Timeout</span>
              <span className="text-sm font-mono" data-testid="text-timeout">8000ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Cache TTL</span>
              <span className="text-sm font-mono" data-testid="text-cache-ttl">24 hours</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Simulated Offline</span>
              <Badge
                variant={simulatedOffline ? "destructive" : "secondary"}
                className="text-xs"
                data-testid="status-simulated"
              >
                {simulatedOffline ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">App Version</span>
              <span className="text-sm font-mono" data-testid="text-app-version">
                {appVersion ? `v${appVersion}` : "Web Browser"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-connected-devices">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Connected Devices</CardTitle>
            <Monitor className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {deviceStatusLoading && !deviceStatus ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" /> Loading...
              </div>
            ) : !deviceStatus ? (
              <div className="text-sm text-muted-foreground">No property context available</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Property</span>
                  <span className="text-sm font-medium" data-testid="text-device-property">{deviceStatus.propertyName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">CAPS Workstation</span>
                  {deviceStatus.capsWorkstationName ? (
                    <Badge
                      variant={deviceStatus.capsOnline ? "default" : "destructive"}
                      className={`text-xs ${deviceStatus.capsOnline ? 'bg-green-600 hover:bg-green-700' : ''}`}
                      data-testid="status-caps-ws"
                    >
                      {deviceStatus.capsWorkstationName} — {deviceStatus.capsOnline ? 'Online' : 'Offline'}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not configured</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Devices Online</span>
                  <Badge
                    variant={deviceStatus.summary.onlineDevices > 0 ? "default" : "destructive"}
                    className="text-xs"
                    data-testid="status-devices-online"
                  >
                    {deviceStatus.summary.onlineDevices} / {deviceStatus.summary.totalDevices}
                  </Badge>
                </div>
                <div className="border-t pt-2 space-y-2">
                  {deviceStatus.devices?.map((dev: any) => (
                    <div key={dev.id} className="space-y-1" data-testid={`device-row-${dev.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {dev.type === 'kds' ? (
                            <Activity className="w-3 h-3" />
                          ) : (
                            <Monitor className="w-3 h-3" />
                          )}
                          <span className="text-sm font-medium">
                            {dev.name}
                            {dev.isCaps && (
                              <span className="ml-1 text-xs text-blue-400">(CAPS)</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={dev.isOnline ? "default" : "secondary"}
                            className={`text-xs ${dev.isOnline ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                            data-testid={`status-device-online-${dev.id}`}
                          >
                            {dev.isOnline ? 'Online' : 'Offline'}
                          </Badge>
                          <div
                            className={`w-3 h-3 rounded-full ${dev.connectionStatus === 'green' ? 'bg-green-500' : 'bg-red-500'}`}
                            title={dev.connectionStatus === 'green' ? 'CAPS reachable' : 'CAPS unreachable'}
                            data-testid={`status-device-caps-${dev.id}`}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pl-4 flex-wrap">
                        {dev.ipAddress && (
                          <span>{dev.ipAddress}</span>
                        )}
                        {dev.hostname && (
                          <span>{dev.hostname}</span>
                        )}
                        {dev.type === 'workstation' && !dev.isCaps && (
                          <span className={dev.connectionStatus === 'green' ? 'text-green-500' : 'text-red-500'}>
                            {dev.connectionStatus === 'green' ? '● CAPS OK' : '● No CAPS'}
                          </span>
                        )}
                      </div>
                      {dev.lastSeenAt && (
                        <div className="text-xs text-muted-foreground pl-4">
                          Last seen: {new Date(dev.lastSeenAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={loadDeviceStatus}
              disabled={deviceStatusLoading}
              data-testid="button-refresh-devices"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${deviceStatusLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardContent>
        </Card>

        {isElectron() && (
          <Card data-testid="card-software-update">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Software Updates</CardTitle>
              <Download className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Version</span>
                <span className="text-sm font-mono" data-testid="text-current-version">
                  v{updateStatus?.currentVersion || "..."}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  variant={
                    updateStatus?.status === "ready" ? "default" :
                    updateStatus?.status === "error" ? "destructive" :
                    updateStatus?.status === "downloading" ? "outline" :
                    "secondary"
                  }
                  className="text-xs"
                  data-testid="status-update"
                >
                  {updateStatus?.status === "ready" ? "Update Ready" :
                   updateStatus?.status === "downloading" ? `Downloading ${updateStatus.downloadProgress}%` :
                   updateStatus?.status === "checking" ? "Checking..." :
                   updateStatus?.status === "up-to-date" ? "Up to Date" :
                   updateStatus?.status === "error" ? "Error" :
                   "Idle"}
                </Badge>
              </div>
              {updateStatus?.availableVersion && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Available</span>
                  <span className="text-sm font-mono" data-testid="text-available-version">
                    v{updateStatus.availableVersion}
                  </span>
                </div>
              )}
              {updateStatus?.lastChecked && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Checked</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-last-checked">
                    {new Date(updateStatus.lastChecked).toLocaleString()}
                  </span>
                </div>
              )}
              {updateStatus?.error && (
                <div className="text-xs text-destructive mt-1" data-testid="text-update-error">
                  {updateStatus.error}
                </div>
              )}
              <div className="flex gap-2 pt-1 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate || updateStatus?.status === "downloading"}
                  data-testid="button-check-update"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${checkingUpdate ? "animate-spin" : ""}`} />
                  Check Now
                </Button>
                {updateStatus?.updateReady && (
                  <Button
                    size="sm"
                    onClick={() => window.electronAPI?.updater.install()}
                    data-testid="button-install-update"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Install & Restart
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isElectron() && (
          <Card data-testid="card-print-agent-status">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Print Agent</CardTitle>
              <Printer className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  variant={printAgentStatus?.isRunning ? (printAgentStatus?.isConnected ? "default" : "secondary") : "destructive"}
                  className="text-xs"
                  data-testid="status-print-agent"
                >
                  {printAgentStatus?.isRunning
                    ? (printAgentStatus?.isConnected
                      ? (printAgentStatus?.isAuthenticated ? "Connected" : "Connecting...")
                      : "Running (Disconnected)")
                    : "Stopped"}
                </Badge>
              </div>
              {printAgentStatus?.agentId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Agent ID</span>
                  <span className="text-sm font-mono truncate max-w-[180px]" data-testid="text-agent-id">
                    {printAgentStatus.agentId}
                  </span>
                </div>
              )}
              {printAgentStatus?.printers && printAgentStatus.printers.length > 0 && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Configured Printers</span>
                  {printAgentStatus.printers.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                      <span className="font-medium truncate max-w-[120px]">{p.name || p.printerId || `Printer ${i + 1}`}</span>
                      <span className="text-muted-foreground font-mono">
                        {p.connectionType === 'serial' ? `${p.comPort} @ ${p.baudRate || 9600}` : `${p.ipAddress}:${p.port || 9100}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {printAgentStatus && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span data-testid="text-completed-jobs">Completed: {printAgentStatus.completedJobs || 0}</span>
                  <span data-testid="text-failed-jobs">Failed: {printAgentStatus.failedJobs || 0}</span>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.electronAPI?.printAgent.getStatus().then(setPrintAgentStatus).catch(() => {})}
                data-testid="button-refresh-agent"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
            </CardContent>
          </Card>
        )}

        {isElectron() && (
          <Card data-testid="card-com-port-test">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">COM Port Test</CardTitle>
              <Usb className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              {comPortsError && (
                <div className="text-xs text-destructive" data-testid="text-com-error">{comPortsError}</div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Port</span>
                  <div className="w-[180px]">
                    {comPorts.length > 0 ? (
                      <Select value={selectedComPort} onValueChange={setSelectedComPort}>
                        <SelectTrigger className="text-xs" data-testid="select-com-port">
                          <SelectValue placeholder="Select port" />
                        </SelectTrigger>
                        <SelectContent>
                          {comPorts.map(p => (
                            <SelectItem key={p.path} value={p.path}>
                              {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="text"
                        value={manualComPort}
                        onChange={(e) => setManualComPort(e.target.value)}
                        placeholder={comPortsLoading ? 'Scanning...' : 'COM1'}
                        className="text-xs"
                        data-testid="input-manual-com-port"
                      />
                    )}
                  </div>
                </div>
                {comPorts.length === 0 && !comPortsLoading && (
                  <div className="text-xs text-muted-foreground" data-testid="text-manual-port-hint">
                    Auto-detect found no ports. Type a port name (e.g. COM1) to test directly.
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Baud Rate</span>
                  <div className="w-[180px]">
                    <Select value={selectedBaudRate} onValueChange={setSelectedBaudRate}>
                      <SelectTrigger className="text-xs" data-testid="select-baud-rate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9600">9600</SelectItem>
                        <SelectItem value="19200">19200</SelectItem>
                        <SelectItem value="38400">38400</SelectItem>
                        <SelectItem value="57600">57600</SelectItem>
                        <SelectItem value="115200">115200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {serialTestResult && (
                <div className={`text-xs p-2 rounded ${serialTestResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'}`} data-testid="text-serial-result">
                  {serialTestResult.success ? <CheckCircle className="w-3 h-3 inline mr-1" /> : <XCircle className="w-3 h-3 inline mr-1" />}
                  {serialTestResult.message}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadComPorts}
                  disabled={comPortsLoading}
                  data-testid="button-scan-ports"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${comPortsLoading ? 'animate-spin' : ''}`} /> Scan Ports
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTestSerial(false)}
                  disabled={serialTesting || !effectiveComPort}
                  data-testid="button-test-connect"
                >
                  <Plug className="w-3 h-3 mr-1" /> Test Connect
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleTestSerial(true)}
                  disabled={serialTesting || !effectiveComPort}
                  data-testid="button-test-print"
                >
                  {serialTesting ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Printer className="w-3 h-3 mr-1" />}
                  Test Print
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isElectron() && (
          <Card data-testid="card-network-printer-test">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Network Printer Test</CardTitle>
              <Plug className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">IP Address</span>
                  <Input
                    type="text"
                    value={networkTestIp}
                    onChange={(e) => setNetworkTestIp(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-[180px] text-xs"
                    data-testid="input-network-ip"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Port</span>
                  <Input
                    type="text"
                    value={networkTestPort}
                    onChange={(e) => setNetworkTestPort(e.target.value)}
                    placeholder="9100"
                    className="w-[180px] text-xs"
                    data-testid="input-network-port"
                  />
                </div>
              </div>
              {networkTestResult && (
                <div className={`text-xs p-2 rounded ${networkTestResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'}`} data-testid="text-network-result">
                  {networkTestResult.success ? <CheckCircle className="w-3 h-3 inline mr-1" /> : <XCircle className="w-3 h-3 inline mr-1" />}
                  {networkTestResult.message}
                </div>
              )}
              <Button
                size="sm"
                onClick={handleTestNetwork}
                disabled={networkTesting || !networkTestIp}
                data-testid="button-test-network"
              >
                {networkTesting ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Plug className="w-3 h-3 mr-1" />}
                Test Connection
              </Button>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-storage-stats">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">IndexedDB Storage</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {storageStats ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Cached Configs</span>
                  <span className="text-sm font-mono" data-testid="text-config-count">
                    {storageStats.configCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Offline Checks</span>
                  <span className="text-sm font-mono" data-testid="text-checks-count">
                    {storageStats.checksCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sync Queue</span>
                  <span className="text-sm font-mono" data-testid="text-sync-count">
                    {storageStats.syncQueueCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Print Queue</span>
                  <span className="text-sm font-mono" data-testid="text-print-count">
                    {storageStats.printQueueCount}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            <div className="flex gap-2 pt-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={refreshCacheData}
                data-testid="button-refresh-cache"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearExpiredCache}
                data-testid="button-clear-expired"
              >
                <Clock className="w-3 h-3 mr-1" /> Clear Expired
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={clearAllCache}
                data-testid="button-clear-all"
              >
                <Trash2 className="w-3 h-3 mr-1" /> Clear All
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-test-controls">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Test Controls</CardTitle>
            <Play className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Test the offline system by running API calls, simulating network failure, and verifying cache fallback.
            </p>
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={runAllTests}
                disabled={isRunningTests}
                data-testid="button-run-tests"
              >
                {isRunningTests ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Running Tests...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" /> Run All API Tests
                  </>
                )}
              </Button>
              {!simulatedOffline ? (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={enableSimulatedOffline}
                  data-testid="button-simulate-offline"
                >
                  <WifiOff className="w-4 h-4 mr-2" /> Simulate Offline
                </Button>
              ) : (
                <Button
                  className="w-full"
                  variant="default"
                  onClick={disableSimulatedOffline}
                  data-testid="button-go-online"
                >
                  <Wifi className="w-4 h-4 mr-2" /> Go Back Online
                </Button>
              )}
            </div>
            <div className="border-t pt-2">
              <p className="text-xs text-muted-foreground mb-2">Recommended test sequence:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                <li>Run All API Tests (populates cache)</li>
                <li>Click "Simulate Offline"</li>
                <li>Run All API Tests again (should serve from cache)</li>
                <li>Click "Go Back Online" to restore</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-fetch-log">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">
            Fetch Request Log ({fetchLog.length} entries)
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFetchLog([])}
            data-testid="button-clear-log"
          >
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          {fetchLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-logs">
              No fetch requests logged yet. Click "Run All API Tests" to begin.
            </p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {fetchLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 py-1.5 px-2 rounded text-xs font-mono border-b last:border-b-0"
                  data-testid={`log-entry-${entry.id}`}
                >
                  {entry.status === "success" && (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                  )}
                  {entry.status === "cached" && (
                    <Database className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  )}
                  {entry.status === "error" && (
                    <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-muted-foreground flex-shrink-0">{entry.timestamp}</span>
                  <span className="flex-1 break-all">{entry.message}</span>
                  <span className="text-muted-foreground flex-shrink-0">{entry.duration}ms</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-cache-entries">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">
            Cache Contents ({cacheEntries.length} entries)
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={refreshCacheData}
            data-testid="button-refresh-entries"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {cacheEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-cache">
              No cached data. Run API tests while online to populate the cache.
            </p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 py-1 px-2 text-xs font-semibold text-muted-foreground border-b">
                <span>Cache Key</span>
                <span>Data</span>
                <span>Cached</span>
                <span>Expires</span>
              </div>
              {cacheEntries.map((entry) => (
                <div
                  key={entry.key}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-2 py-1.5 px-2 rounded text-xs font-mono border-b last:border-b-0 items-center"
                  data-testid={`cache-entry-${entry.key}`}
                >
                  <span className="break-all">{entry.key}</span>
                  <span className="text-muted-foreground">{getDataPreview(entry.data)}</span>
                  <span className="text-muted-foreground">{formatTimeAgo(entry.cachedAt)}</span>
                  <span className="text-muted-foreground">
                    {entry.expiresAt ? (
                      <Badge
                        variant={
                          new Date(entry.expiresAt).getTime() - Date.now() < 3600000
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {formatTimeRemaining(entry.expiresAt)}
                      </Badge>
                    ) : (
                      "No expiry"
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

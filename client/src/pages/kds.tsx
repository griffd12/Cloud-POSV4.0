import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { KdsDisplay } from "@/components/kds/kds-display";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { apiClient } from "@/lib/api-client";
import { usePosContext } from "@/lib/pos-context";
import { useDeviceContext } from "@/lib/device-context";
import { usePosWebSocket, subscribeToKdsTestTicket } from "@/hooks/use-pos-websocket";
import { useDeviceHeartbeat } from "@/hooks/use-device-heartbeat";
import { useDeviceReload } from "@/hooks/use-device-reload";
import { useConfigSync } from "@/hooks/use-config-sync";
import { DeviceEnrollmentGuard } from "@/components/device-enrollment-guard";
import { ArrowLeft, Wifi, WifiOff, Maximize, Minimize, UtensilsCrossed, Settings, Activity } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Property, Enterprise } from "@shared/schema";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useDocumentFontScale } from "@/hooks/use-font-scale";
import { Link, Redirect, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { ConnectionModeBanner } from "@/components/connection-mode-banner";

interface KdsItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: { name: string }[];
  status: "pending" | "bumped" | "voided";
}

interface Ticket {
  id: string;
  checkNumber: number;
  orderType: string;
  stationType?: string;
  kdsDeviceId?: string;
  items: KdsItem[];
  isDraft: boolean;
  status: string;
  createdAt: Date;
}

interface KdsDevice {
  id: string;
  name: string;
  stationType: string;
  propertyId: string;
  newOrderSound?: boolean;
  newOrderBlinkSeconds?: number;
  colorAlert1Enabled?: boolean;
  colorAlert1Seconds?: number;
  colorAlert1Color?: string;
  colorAlert2Enabled?: boolean;
  colorAlert2Seconds?: number;
  colorAlert2Color?: string;
  colorAlert3Enabled?: boolean;
  colorAlert3Seconds?: number;
  colorAlert3Color?: string;
}

export default function KdsPage() {
  const { toast } = useToast();
  const { currentEmployee, currentRvc } = usePosContext();
  const { deviceType, linkedDeviceId, deviceName, clearDeviceConfig, isConfigured } = useDeviceContext();
  const [, navigate] = useLocation();
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedStation, setSelectedStation] = useState("all");
  const [initialized, setInitialized] = useState(false);
  const [testTicketMessage, setTestTicketMessage] = useState<string | null>(null);
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Real-time sync for menu updates, employee changes, etc.
  usePosWebSocket();
  
  // Real-time EMC config sync - invalidates React Query cache when EMC changes
  useConfigSync();
  
  // Listen for remote reload commands from EMC (use device context for targeting)
  const { registeredDeviceId, propertyId: devicePropertyId } = useDeviceContext();
  useDeviceReload({ registeredDeviceId: registeredDeviceId || undefined, propertyId: devicePropertyId || undefined });
  
  // Send periodic device heartbeats to maintain online status
  useDeviceHeartbeat(true);

  // Check if this is a dedicated KDS device
  const isDedicatedKds = deviceType === "kds" && isConfigured;

  const [deviceConnectionError, setDeviceConnectionError] = useState(false);

  // For dedicated KDS, fetch the configured device info to get propertyId
  const { data: configuredKdsDevice, isLoading: isLoadingDevice, isError: deviceError, error: deviceQueryError } = useQuery<KdsDevice>({
    queryKey: ["/api/kds-devices", linkedDeviceId],
    enabled: isDedicatedKds && !!linkedDeviceId,
    retry: 10,
    retryDelay: (attempt) => Math.min(2000 * (attempt + 1), 8000),
    refetchInterval: deviceConnectionError ? 5000 : false,
  });

  useEffect(() => {
    if (isDedicatedKds && linkedDeviceId && deviceError && deviceQueryError) {
      const errorMsg = (deviceQueryError as Error)?.message || '';
      const is404 = errorMsg.startsWith('404:');

      if (is404) {
        toast({ 
          title: "Device not found", 
          description: "The configured KDS device no longer exists. Please reconfigure.",
          variant: "destructive" 
        });
        clearDeviceConfig();
        navigate("/setup");
      } else {
        setDeviceConnectionError(true);
      }
    } else if (!deviceError) {
      setDeviceConnectionError(false);
    }
  }, [isDedicatedKds, linkedDeviceId, deviceError, deviceQueryError, clearDeviceConfig, navigate, toast]);

  // Use property from configured device for dedicated KDS, otherwise from current RVC
  // Fallback to devicePropertyId from device context if configuredKdsDevice hasn't loaded yet
  const propertyId = isDedicatedKds 
    ? (configuredKdsDevice?.propertyId || devicePropertyId)
    : currentRvc?.propertyId;

  const { data: kdsProperty } = useQuery<Property>({
    queryKey: ["/api/properties", propertyId],
    enabled: !!propertyId,
  });

  const { data: kdsEnterprise } = useQuery<Enterprise>({
    queryKey: ["/api/enterprises", kdsProperty?.enterpriseId],
    enabled: !!kdsProperty?.enterpriseId,
  });

  // Subscribe to KDS test ticket events (filtered by property)
  useEffect(() => {
    const unsubscribe = subscribeToKdsTestTicket((payload) => {
      // Only show test ticket if it's for all properties (null) or matches this device's property
      const testPropertyId = payload?.propertyId;
      if (testPropertyId && testPropertyId !== propertyId) {
        return; // Skip - this test ticket is for a different property
      }
      
      const message = payload?.message || "Test ticket received";
      setTestTicketMessage(message);
      toast({
        title: "Test Ticket Received",
        description: message,
        duration: 5000,
      });
      // Auto-clear after 5 seconds
      setTimeout(() => setTestTicketMessage(null), 5000);
    });
    return unsubscribe;
  }, [toast, propertyId]);

  // Device heartbeat for KDS - updates lastAccessAt for connectivity tracking
  useEffect(() => {
    const deviceToken = localStorage.getItem("pos_device_token");
    if (!deviceToken || !isDedicatedKds) return;

    const sendHeartbeat = async () => {
      try {
        await fetch("/api/registered-devices/heartbeat", {
          method: "POST",
          headers: {
            ...getAuthHeaders(),
            "X-Device-Token": deviceToken,
          },
        });
      } catch (error) {
        // Silently ignore heartbeat errors
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Send heartbeat every 30 seconds
    const interval = setInterval(sendHeartbeat, 30000);

    return () => clearInterval(interval);
  }, [isDedicatedKds]);

  const { data: kdsDevices = [] } = useQuery<KdsDevice[]>({
    queryKey: ["/api/kds-devices/active", propertyId],
    enabled: !!propertyId,
  });

  const stationTypes = kdsDevices.reduce((acc, device) => {
    if (!acc.includes(device.stationType)) {
      acc.push(device.stationType);
    }
    return acc;
  }, [] as string[]);

  // Auto-select the configured KDS device if in dedicated mode
  useEffect(() => {
    if (isDedicatedKds && linkedDeviceId && kdsDevices.length > 0 && !initialized) {
      const configuredDevice = kdsDevices.find(d => d.id === linkedDeviceId);
      if (configuredDevice) {
        setSelectedStation(configuredDevice.stationType);
        setInitialized(true);
      }
    }
  }, [isDedicatedKds, linkedDeviceId, kdsDevices, initialized]);

  const selectedDevice = selectedStation !== "all" 
    ? kdsDevices.find((d) => d.stationType === selectedStation)
    : kdsDevices[0];

  const activeKdsDevice = isDedicatedKds ? configuredKdsDevice : selectedDevice;
  const fontScale = useDocumentFontScale((activeKdsDevice as any)?.fontScale);

  const settingsSource = activeKdsDevice || selectedDevice;
  const deviceSettings = settingsSource ? {
    newOrderSound: settingsSource.newOrderSound,
    newOrderBlinkSeconds: settingsSource.newOrderBlinkSeconds,
    colorAlert1Enabled: settingsSource.colorAlert1Enabled,
    colorAlert1Seconds: settingsSource.colorAlert1Seconds,
    colorAlert1Color: settingsSource.colorAlert1Color,
    colorAlert2Enabled: settingsSource.colorAlert2Enabled,
    colorAlert2Seconds: settingsSource.colorAlert2Seconds,
    colorAlert2Color: settingsSource.colorAlert2Color,
    colorAlert3Enabled: settingsSource.colorAlert3Enabled,
    colorAlert3Seconds: settingsSource.colorAlert3Seconds,
    colorAlert3Color: settingsSource.colorAlert3Color,
  } : undefined;

  // Build query params - for dedicated KDS, filter by device ID; for POS mode, use rvcId
  const queryParams = new URLSearchParams();
  if (isDedicatedKds && linkedDeviceId) {
    queryParams.set("kdsDeviceId", linkedDeviceId);
  } else if (isDedicatedKds && propertyId) {
    queryParams.set("propertyId", propertyId);
  } else if (currentRvc?.id) {
    queryParams.set("rvcId", currentRvc.id);
  }
  if (selectedStation !== "all") queryParams.set("stationType", selectedStation);

  const [apiConnected, setApiConnected] = useState<boolean | null>(null);

  const { data: tickets = [], isLoading, refetch, isError: ticketsError } = useQuery<Ticket[]>({
    queryKey: ["/api/kds-tickets", isDedicatedKds ? propertyId : currentRvc?.id, selectedStation],
    queryFn: async () => {
      const res = await fetch(`/api/kds-tickets?${queryParams.toString()}`, { 
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        setApiConnected(false);
        throw new Error("Failed to fetch tickets");
      }
      setApiConnected(true);
      return res.json();
    },
    enabled: isDedicatedKds ? !!propertyId : !!currentRvc,
    select: (data: any[]) =>
      data.map((t) => ({
        ...t,
        createdAt: new Date(t.createdAt),
      })),
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });

  // WebSocket for real-time KDS updates with auto-reconnect
  // Adapts to connection mode: GREEN=cloud, YELLOW=CAPS, RED=skip (polling only)
  useEffect(() => {
    if (!isDedicatedKds && !currentRvc) return;
    if (isDedicatedKds && !propertyId) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;

      const currentMode = apiClient.getMode();

      if (currentMode === 'red') {
        reconnectTimer = setTimeout(connect, 10000);
        return;
      }

      let wsUrl: string;
      if (currentMode === 'yellow') {
        const serviceHostUrl = localStorage.getItem('serviceHostUrl');
        if (serviceHostUrl) {
          try {
            const shUrl = new URL(serviceHostUrl);
            const wsProtocol = shUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${wsProtocol}//${shUrl.host}/ws`;
          } catch {
            reconnectTimer = setTimeout(connect, 10000);
            return;
          }
        } else {
          reconnectTimer = setTimeout(connect, 10000);
          return;
        }
      } else {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        wsUrl = `${protocol}//${window.location.host}/ws/kds`;
      }

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setWsConnected(true);
        refetch();
        const subscribeMsg: Record<string, any> = { type: "subscribe", channel: "kds" };
        if (!isDedicatedKds && currentRvc?.id) {
          subscribeMsg.rvcId = currentRvc.id;
        }
        socket!.send(JSON.stringify(subscribeMsg));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (
            message.type === "kds_update" ||
            message.type === "kds_ticket_new" ||
            message.type === "kds_ticket_bumped" ||
            message.type === "kds_ticket_recalled" ||
            message.type === "kds_ticket_priority" ||
            message.type === "kds_tickets"
          ) {
            refetch();
          }
        } catch (e) {
          console.error("WebSocket message error:", e);
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        if (!unmounted) {
          const mode = apiClient.getMode();
          const delay = mode === 'green' ? 3000 : 10000;
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      socket.onerror = () => {
        setWsConnected(false);
      };
    };

    connect();

    const modeUnsub = apiClient.onModeChange((newMode) => {
      if (newMode === 'red') {
        if (socket) { socket.close(); socket = null; }
      } else {
        if (socket) { socket.close(); socket = null; }
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        reconnectTimer = setTimeout(connect, 500);
      }
    });

    return () => {
      unmounted = true;
      modeUnsub();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [currentRvc?.id, propertyId, isDedicatedKds, refetch]);

  const bumpMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      // For dedicated KDS, use device identity; for POS mode, use employee
      const payload: Record<string, any> = {};
      if (isDedicatedKds) {
        payload.deviceId = linkedDeviceId;
      } else {
        payload.employeeId = currentEmployee?.id;
      }
      const response = await apiRequest("POST", "/api/kds-tickets/" + ticketId + "/bump", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to bump ticket", variant: "destructive" });
    },
  });

  const recallMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      // For dedicated KDS, include device identity
      const payload: Record<string, any> = {};
      if (isDedicatedKds) {
        payload.deviceId = linkedDeviceId;
      }
      const response = await apiRequest("POST", "/api/kds-tickets/" + ticketId + "/recall", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to recall ticket", variant: "destructive" });
    },
  });

  const bumpAllMutation = useMutation({
    mutationFn: async () => {
      // Use kdsDeviceId for dedicated KDS devices to scope clear to this device only
      const payload: Record<string, any> = {
        stationType: selectedStation !== "all" ? selectedStation : undefined,
      };
      if (isDedicatedKds) {
        payload.propertyId = propertyId;
        payload.deviceId = linkedDeviceId;
        if (linkedDeviceId) payload.kdsDeviceId = linkedDeviceId;
      } else {
        payload.employeeId = currentEmployee?.id;
        payload.rvcId = currentRvc?.id;
      }
      const response = await apiRequest("POST", "/api/kds-tickets/bump-all", payload);
      return response.json();
    },
    onSuccess: (data: { bumped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to clear tickets", variant: "destructive" });
    },
  });

  const handleBump = useCallback(
    (ticketId: string) => {
      bumpMutation.mutate(ticketId);
    },
    [bumpMutation]
  );

  const handleRecall = useCallback(
    (ticketId: string) => {
      recallMutation.mutate(ticketId);
    },
    [recallMutation]
  );

  const handleRefresh = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["/api/kds-devices/active", propertyId] });
    if (isDedicatedKds && linkedDeviceId) {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-devices", linkedDeviceId] });
    }
  }, [refetch, propertyId, isDedicatedKds, linkedDeviceId]);

  const handleBumpAll = useCallback(() => {
    bumpAllMutation.mutate();
  }, [bumpAllMutation]);

  useEffect(() => {
    console.log("[KDS] Init state:", {
      isDedicatedKds,
      linkedDeviceId,
      devicePropertyId,
      configuredKdsDevicePropertyId: configuredKdsDevice?.propertyId,
      resolvedPropertyId: propertyId,
      isLoadingDevice,
      deviceError,
      currentRvcId: currentRvc?.id,
      kdsDevicesCount: kdsDevices.length,
      ticketsCount: tickets.length,
    });
  }, [isDedicatedKds, linkedDeviceId, devicePropertyId, configuredKdsDevice?.propertyId, propertyId, isLoadingDevice, deviceError, currentRvc?.id, kdsDevices.length, tickets.length]);

  // For dedicated KDS devices, skip the employee/RVC check if we have a property from the device
  if (!isDedicatedKds && (!currentEmployee || !currentRvc)) {
    return <Redirect to="/" />;
  }

  // Show loading state while fetching device info for dedicated KDS
  if (isDedicatedKds && isLoadingDevice) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading device configuration...</p>
        </div>
      </div>
    );
  }

  if (isDedicatedKds && deviceConnectionError && !configuredKdsDevice) {
    return (
      <div className="h-screen flex items-center justify-center bg-background" data-testid="kds-connection-error">
        <div className="text-center max-w-md">
          <WifiOff className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Waiting for Store Server</h2>
          <p className="text-muted-foreground mb-4">
            The store server (CAPS) is not available. This display will automatically connect when the server is ready.
          </p>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mx-auto mb-4" />
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={handleRefresh} data-testid="button-kds-retry-connection">
              Retry Now
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Device ID: {linkedDeviceId?.substring(0, 8)}...
          </p>
        </div>
      </div>
    );
  }

  if (isDedicatedKds && !propertyId && !isLoadingDevice) {
    return (
      <div className="h-screen flex items-center justify-center" data-testid="kds-no-property">
        <div className="text-center max-w-md">
          <UtensilsCrossed className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">KDS Not Configured</h2>
          <p className="text-muted-foreground mb-4">
            This KDS device does not have a property assigned. Please configure the device in the Enterprise Management Console or re-enroll.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => { clearDeviceConfig(); navigate("/setup"); }} data-testid="button-kds-reconfigure">
              Reconfigure Device
            </Button>
            <Button variant="outline" onClick={handleRefresh} data-testid="button-kds-retry">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DeviceEnrollmentGuard requiredDeviceType="kds_display">
    <div className="flex flex-col h-screen">
      <ConnectionModeBanner />
      <header className="flex-shrink-0 bg-card border-b px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!isDedicatedKds && (
            <Link href="/pos">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold leading-tight" data-testid="text-kds-title">
                {kdsEnterprise?.name && (
                  <span className="font-semibold">{kdsEnterprise.name} - </span>
                )}
                {isDedicatedKds && deviceName ? deviceName : "Kitchen Display"}
                {currentRvc?.name && (
                  <span className="text-muted-foreground font-normal"> - {currentRvc.name}</span>
                )}
              </span>
              <span className="text-sm text-muted-foreground leading-tight" data-testid="text-kds-datetime">
                {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} {currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={apiConnected === true ? "default" : apiConnected === false ? "destructive" : "secondary"}
              className="text-xs"
              data-testid="status-api-connection"
            >
              {apiConnected === true ? (
                <><Wifi className="w-3 h-3 mr-1" /> API</>
              ) : apiConnected === false ? (
                <><WifiOff className="w-3 h-3 mr-1" /> API</>
              ) : (
                "Connecting..."
              )}
            </Badge>
            <div
              className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`}
              title={wsConnected ? "WebSocket Connected" : "WebSocket Disconnected"}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fullscreenSupported && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              data-testid="button-fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="Settings" data-testid="button-kds-settings">
                <Settings className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/offline-test")} data-testid="menu-kds-system-diagnostics">
                <Activity className="w-4 h-4 mr-2" />
                System Diagnostics
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
      </header>

      <KdsDisplay
        tickets={tickets}
        stationTypes={stationTypes}
        selectedStation={selectedStation}
        onStationChange={setSelectedStation}
        onBump={handleBump}
        onRecall={handleRecall}
        onRefresh={handleRefresh}
        onBumpAll={handleBumpAll}
        isLoading={isLoading}
        isBumpingAll={bumpAllMutation.isPending}
        deviceSettings={deviceSettings}
        rvcId={currentRvc?.id}
        propertyId={propertyId || undefined}
      />
    </div>
    </DeviceEnrollmentGuard>
  );
}

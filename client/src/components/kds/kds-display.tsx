import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KdsTicket, ColorAlertSettings } from "./kds-ticket";
import { 
  RefreshCw, Monitor, Flame, Snowflake, PackageCheck, UtensilsCrossed, 
  GlassWater, Trash2, RotateCcw, Volume2, VolumeX, ChevronLeft, ChevronRight,
  Ban
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, getAuthHeaders, fetchWithTimeout, failoverFetch } from "@/lib/queryClient";

interface KdsItem {
  id: string;
  checkItemId?: string;
  name: string;
  quantity: number;
  modifiers?: { name: string }[];
  status: "pending" | "bumped" | "voided";
  isReady?: boolean;
}

interface Ticket {
  id: string;
  checkNumber: number;
  orderType: string;
  stationName?: string;
  stationType?: string;
  items: KdsItem[];
  isDraft: boolean;
  isPreview?: boolean;
  isPaid?: boolean;
  isRecalled?: boolean;
  status: string;
  createdAt: Date;
  subtotal?: string;
}

interface BumpedTicket {
  id: string;
  checkNumber?: number;
  orderType?: string;
  stationType?: string;
  bumpedAt: Date;
  items: { id: string; name: string; quantity: number; status: string }[];
}

interface ItemAvailability {
  id: string;
  menuItemId: string;
  menuItemName?: string;
  is86d: boolean;
  currentQuantity: number;
}

interface KdsDeviceSettings {
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

interface KdsDisplayProps {
  tickets: Ticket[];
  stationTypes: string[];
  selectedStation: string;
  onStationChange: (station: string) => void;
  onBump: (ticketId: string) => void;
  onRecall?: (ticketId: string) => void;
  onRefresh?: () => void;
  onBumpAll?: () => void;
  isLoading?: boolean;
  isBumpingAll?: boolean;
  deviceSettings?: KdsDeviceSettings;
  rvcId?: string;
  propertyId?: string;
}

const STATION_ICONS: Record<string, LucideIcon> = {
  hot: Flame,
  cold: Snowflake,
  expo: PackageCheck,
  prep: UtensilsCrossed,
  bar: GlassWater,
};

const STATION_LABELS: Record<string, string> = {
  hot: "Hot",
  cold: "Cold",
  expo: "Expo",
  prep: "Prep",
  bar: "Bar",
};

export function KdsDisplay({
  tickets,
  stationTypes,
  selectedStation,
  onStationChange,
  onBump,
  onRecall,
  onRefresh,
  onBumpAll,
  isLoading = false,
  isBumpingAll = false,
  deviceSettings,
  rvcId,
  propertyId,
}: KdsDisplayProps) {
  const [viewMode, setViewMode] = useState<"open" | "completed">("open");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showRecallDialog, setShowRecallDialog] = useState(false);
  const [selectedRecallTicket, setSelectedRecallTicket] = useState<BumpedTicket | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(deviceSettings?.newOrderSound ?? true);
  const [blinkingTickets, setBlinkingTickets] = useState<Set<string>>(new Set());
  const previousTicketIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);

  const blinkDuration = deviceSettings?.newOrderBlinkSeconds ?? 5;

  const colorAlerts: ColorAlertSettings = {
    alert1Enabled: deviceSettings?.colorAlert1Enabled ?? false,
    alert1Seconds: deviceSettings?.colorAlert1Seconds != null ? deviceSettings.colorAlert1Seconds : 60,
    alert1Color: deviceSettings?.colorAlert1Color ?? "yellow",
    alert2Enabled: deviceSettings?.colorAlert2Enabled ?? false,
    alert2Seconds: deviceSettings?.colorAlert2Seconds != null ? deviceSettings.colorAlert2Seconds : 180,
    alert2Color: deviceSettings?.colorAlert2Color ?? "red",
    alert3Enabled: deviceSettings?.colorAlert3Enabled ?? false,
    alert3Seconds: deviceSettings?.colorAlert3Seconds != null ? deviceSettings.colorAlert3Seconds : 300,
    alert3Color: deviceSettings?.colorAlert3Color ?? "red",
  };

  const activeTickets = tickets.filter((t) => t.status === "active");
  const draftTickets = tickets.filter((t) => t.status === "draft");

  // Fetch completed/bumped tickets when in completed view
  const { data: bumpedTickets = [] } = useQuery<BumpedTicket[]>({
    queryKey: ["/api/kds-tickets/bumped", rvcId, selectedStation],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (rvcId) params.append("rvcId", rvcId);
      if (selectedStation !== "all") params.append("stationType", selectedStation);
      params.append("limit", "100");
      const response = await failoverFetch(`/api/kds-tickets/bumped?${params}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch bumped tickets");
      return response.json();
    },
    enabled: viewMode === "completed",
    refetchInterval: viewMode === "completed" ? 10000 : false,
  });

  // Fetch 86'd items for sidebar
  const { data: itemAvailability = [] } = useQuery<ItemAvailability[]>({
    queryKey: ["/api/item-availability", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const response = await failoverFetch(`/api/item-availability?propertyId=${propertyId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!propertyId && sidebarOpen,
  });

  const items86d = itemAvailability.filter((item) => item.is86d);

  // Recall mutation with scope support
  const recallMutation = useMutation({
    mutationFn: async ({ ticketId, scope }: { ticketId: string; scope: 'expo' | 'all' }) => {
      await apiRequest("POST", `/api/kds-tickets/${ticketId}/recall`, { scope });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets/bumped"] });
      setShowRecallDialog(false);
      setSelectedRecallTicket(null);
      // Switch to open view after recalling a ticket
      setViewMode("open");
    },
  });

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);

      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1100;
        osc2.type = "sine";
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.3);
      }, 150);
    } catch (e) {
      console.log("Audio playback failed:", e);
    }
  }, []);

  useEffect(() => {
    const currentTicketIds = new Set(activeTickets.map((t) => t.id));
    const previousIds = previousTicketIdsRef.current;

    const newTicketIds: string[] = [];
    currentTicketIds.forEach((id) => {
      if (!previousIds.has(id)) {
        newTicketIds.push(id);
      }
    });

    if (newTicketIds.length > 0 && previousIds.size > 0) {
      if (soundEnabled) {
        playNotificationSound();
      }

      if (blinkDuration > 0) {
        setBlinkingTickets((prev) => {
          const next = new Set(prev);
          newTicketIds.forEach((id) => next.add(id));
          return next;
        });

        setTimeout(() => {
          setBlinkingTickets((prev) => {
            const next = new Set(prev);
            newTicketIds.forEach((id) => next.delete(id));
            return next;
          });
        }, blinkDuration * 1000);
      }
    }

    previousTicketIdsRef.current = currentTicketIds;
  }, [activeTickets, soundEnabled, blinkDuration, playNotificationSound]);

  const getAllDaySummary = useCallback(() => {
    const summary: Record<string, { name: string; totalQty: number; readyQty: number }> = {};
    
    activeTickets.forEach((ticket) => {
      ticket.items.forEach((item) => {
        if (item.status === "voided") return;
        
        if (!summary[item.name]) {
          summary[item.name] = { name: item.name, totalQty: 0, readyQty: 0 };
        }
        summary[item.name].totalQty += item.quantity || 1;
        if (item.isReady) {
          summary[item.name].readyQty += item.quantity || 1;
        }
      });
    });
    
    return Object.values(summary).sort((a, b) => b.totalQty - a.totalQty);
  }, [activeTickets]);

  const handleRecallClick = (ticket: BumpedTicket) => {
    setSelectedRecallTicket(ticket);
    setShowRecallDialog(true);
  };

  const handleRecallConfirm = (scope: 'expo' | 'all') => {
    if (selectedRecallTicket) {
      recallMutation.mutate({ ticketId: selectedRecallTicket.id, scope });
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  return (
    <div className="h-full flex bg-background">
      {/* Collapsible Sidebar */}
      <div 
        className={`flex-shrink-0 border-r bg-sidebar transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        }`}
      >
        <div className="h-full flex flex-col p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sidebar-foreground">All Day</h2>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {getAllDaySummary().map((item) => (
                <div
                  key={item.name}
                  className={`flex items-center justify-between p-2 rounded-md text-sm ${
                    item.readyQty === item.totalQty 
                      ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                      : "text-sidebar-foreground"
                  }`}
                  data-testid={`all-day-item-${item.name}`}
                >
                  <span className="truncate flex-1" title={item.name}>{item.name}</span>
                  <span className="font-bold tabular-nums ml-2">
                    {item.readyQty > 0 && (
                      <span className="text-green-600 dark:text-green-400">{item.readyQty}/</span>
                    )}
                    {item.totalQty}
                  </span>
                </div>
              ))}
              {getAllDaySummary().length === 0 && (
                <div className="text-center text-muted-foreground py-4 text-sm">
                  No items
                </div>
              )}
            </div>

            {/* 86'd Items Section */}
            {items86d.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-destructive flex items-center gap-2 mb-2">
                  <Ban className="w-4 h-4" />
                  86'd Items
                </h3>
                <div className="space-y-1">
                  {items86d.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center p-2 rounded-md text-sm bg-destructive/10 text-destructive"
                    >
                      <span className="truncate">{item.menuItemName || "Unknown Item"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Sidebar Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-12 w-6 rounded-l-none bg-sidebar border border-l-0"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        data-testid="button-toggle-sidebar"
      >
        {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </Button>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex-shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Open/Completed Toggle */}
            <div className="flex items-center gap-4">
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  className={`px-4 py-2 text-base font-medium transition-colors ${
                    viewMode === "completed"
                      ? "bg-muted text-muted-foreground"
                      : "bg-background text-foreground"
                  }`}
                  onClick={() => setViewMode("completed")}
                  data-testid="tab-completed"
                >
                  Completed
                </button>
                <button
                  className={`px-4 py-2 text-base font-medium transition-colors ${
                    viewMode === "open"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground"
                  }`}
                  onClick={() => setViewMode("open")}
                  data-testid="tab-open"
                >
                  {activeTickets.length} Open
                </button>
              </div>

              {viewMode === "open" && draftTickets.length > 0 && (
                <Badge variant="outline" className="tabular-nums">
                  {draftTickets.length} Draft
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={soundEnabled ? "secondary" : "ghost"}
                size="icon"
                onClick={() => {
                  setSoundEnabled(!soundEnabled);
                  if (!soundEnabled) {
                    playNotificationSound();
                  }
                }}
                data-testid="button-kds-sound-toggle"
                title={soundEnabled ? "Sound enabled" : "Sound muted"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </Button>

              <Tabs value={selectedStation} onValueChange={onStationChange}>
                <TabsList>
                  <TabsTrigger value="all" className="gap-1.5" data-testid="tab-station-all">
                    <Monitor className="w-4 h-4" />
                    <span className="hidden sm:inline">All</span>
                  </TabsTrigger>
                  {stationTypes.map((stationType) => {
                    const Icon = STATION_ICONS[stationType] || Monitor;
                    const label = STATION_LABELS[stationType] || stationType;
                    return (
                      <TabsTrigger
                        key={stationType}
                        value={stationType}
                        className="gap-1.5"
                        data-testid={`tab-station-${stationType}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{label}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              {viewMode === "open" && onBumpAll && activeTickets.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onBumpAll}
                  disabled={isBumpingAll}
                  data-testid="button-kds-bump-all"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear All
                </Button>
              )}

              {onRefresh && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRefresh}
                  disabled={isLoading}
                  data-testid="button-kds-refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              )}
            </div>
          </div>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {viewMode === "open" ? (
              // OPEN TICKETS VIEW
              tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Monitor className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No tickets to display</p>
                  <p className="text-sm">Orders will appear here when sent</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {activeTickets.map((ticket) => (
                    <KdsTicket
                      key={ticket.id}
                      ticketId={ticket.id}
                      checkNumber={ticket.checkNumber}
                      orderType={ticket.orderType}
                      stationName={ticket.stationName}
                      stationType={ticket.stationType}
                      items={ticket.items}
                      isDraft={false}
                      isPreview={ticket.isPreview}
                      isPaid={ticket.isPaid}
                      isRecalled={ticket.isRecalled}
                      createdAt={ticket.createdAt}
                      colorAlerts={colorAlerts}
                      isBlinking={blinkingTickets.has(ticket.id)}
                      subtotal={ticket.subtotal}
                      onBump={onBump}
                      onRecall={onRecall}
                    />
                  ))}
                  {draftTickets.map((ticket) => (
                    <KdsTicket
                      key={ticket.id}
                      ticketId={ticket.id}
                      checkNumber={ticket.checkNumber}
                      orderType={ticket.orderType}
                      stationName={ticket.stationName}
                      stationType={ticket.stationType}
                      items={ticket.items}
                      isDraft={true}
                      isPreview={ticket.isPreview}
                      isPaid={ticket.isPaid}
                      createdAt={ticket.createdAt}
                      colorAlerts={colorAlerts}
                      subtotal={ticket.subtotal}
                      onBump={onBump}
                      onRecall={onRecall}
                    />
                  ))}
                </div>
              )
            ) : (
              // COMPLETED TICKETS VIEW
              bumpedTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <PackageCheck className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No completed tickets</p>
                  <p className="text-sm">Bumped orders will appear here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {bumpedTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="bg-card border rounded-lg p-4 flex flex-col"
                      data-testid={`completed-ticket-${ticket.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-lg">#{ticket.checkNumber}</span>
                        <span className="text-base text-muted-foreground">
                          {formatTimeAgo(ticket.bumpedAt)}
                        </span>
                      </div>
                      
                      {ticket.orderType && (
                        <Badge variant="outline" className="w-fit mb-2 text-xs">
                          {ticket.orderType.replace("_", " ")}
                        </Badge>
                      )}

                      <div className="flex-1 space-y-1 mb-3">
                        {ticket.items?.slice(0, 4).map((item, idx) => (
                          <div key={idx} className="text-base flex items-center gap-2">
                            <span className="font-medium">{item.quantity}</span>
                            <span className="text-muted-foreground truncate">{item.name}</span>
                          </div>
                        ))}
                        {ticket.items && ticket.items.length > 4 && (
                          <div className="text-sm text-muted-foreground">
                            +{ticket.items.length - 4} more items
                          </div>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-primary"
                        onClick={() => handleRecallClick(ticket)}
                        data-testid={`button-recall-ticket-${ticket.id}`}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Recall ticket
                      </Button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Recall Options Dialog */}
      <Dialog open={showRecallDialog} onOpenChange={setShowRecallDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Recall Ticket #{selectedRecallTicket?.checkNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Button
              className="w-full justify-center"
              onClick={() => handleRecallConfirm("expo")}
              disabled={recallMutation.isPending}
              data-testid="button-recall-expo-only"
            >
              Recall only to expeditor stations
            </Button>
            <Button
              variant="outline"
              className="w-full justify-center"
              onClick={() => handleRecallConfirm("all")}
              disabled={recallMutation.isPending}
              data-testid="button-recall-all-stations"
            >
              Recall to all stations
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-center"
              onClick={() => {
                setShowRecallDialog(false);
                setSelectedRecallTicket(null);
              }}
              data-testid="button-recall-cancel"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

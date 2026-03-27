import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check as CheckIcon, Clock, XCircle, RotateCcw, CircleCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface KdsItem {
  id: string;
  checkItemId?: string;
  name: string;
  quantity: number;
  modifiers?: { name: string }[];
  status: "pending" | "bumped" | "voided";
  itemStatus?: "pending" | "active";
  isReady?: boolean;
  isModified?: boolean;
  sortPriority?: number;
}

export interface ColorAlertSettings {
  alert1Enabled: boolean;
  alert1Seconds: number;
  alert1Color: string;
  alert2Enabled: boolean;
  alert2Seconds: number;
  alert2Color: string;
  alert3Enabled: boolean;
  alert3Seconds: number;
  alert3Color: string;
}

interface KdsTicketProps {
  ticketId: string;
  checkNumber: number;
  orderType: string;
  stationType?: string;
  items: KdsItem[];
  isDraft: boolean;
  isPreview?: boolean;
  isPaid?: boolean;
  isRecalled?: boolean;
  createdAt: Date;
  colorAlerts?: ColorAlertSettings;
  itemSelectEnabled?: boolean;
  isBlinking?: boolean;
  subtotal?: string | null;
  onBump: (ticketId: string) => void;
  onRecall?: (ticketId: string) => void;
}

const ORDER_TYPE_COLORS: Record<string, string> = {
  dine_in: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  take_out: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  delivery: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  pickup: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine In",
  take_out: "Take Out",
  delivery: "Delivery",
  pickup: "Pickup",
};

const STATION_TYPE_COLORS: Record<string, string> = {
  hot: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  cold: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  prep: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  expo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  bar: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

const STATION_TYPE_LABELS: Record<string, string> = {
  hot: "HOT",
  cold: "COLD",
  prep: "PREP",
  expo: "EXPO",
  bar: "BAR",
};

const DEFAULT_COLOR_ALERTS: ColorAlertSettings = {
  alert1Enabled: true,
  alert1Seconds: 60,
  alert1Color: "yellow",
  alert2Enabled: true,
  alert2Seconds: 180,
  alert2Color: "red",
  alert3Enabled: false,
  alert3Seconds: 300,
  alert3Color: "red",
};

const COLOR_BACKGROUND_CLASSES: Record<string, string> = {
  yellow: "bg-yellow-400 dark:bg-yellow-500",
  orange: "bg-orange-400 dark:bg-orange-500",
  red: "bg-red-500 dark:bg-red-600",
  blue: "bg-blue-400 dark:bg-blue-500",
  purple: "bg-purple-400 dark:bg-purple-500",
};

const COLOR_TEXT_CLASSES: Record<string, string> = {
  yellow: "text-yellow-900 dark:text-yellow-100",
  orange: "text-orange-900 dark:text-orange-100",
  red: "text-white",
  blue: "text-blue-900 dark:text-blue-100",
  purple: "text-purple-900 dark:text-purple-100",
};

export function KdsTicket({
  ticketId,
  checkNumber,
  orderType,
  stationType,
  items,
  isDraft,
  isPreview = false,
  isPaid = false,
  isRecalled = false,
  createdAt,
  colorAlerts = DEFAULT_COLOR_ALERTS,
  itemSelectEnabled = true,
  isBlinking = false,
  subtotal,
  onBump,
  onRecall,
}: KdsTicketProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const calculateElapsed = () => {
      const now = new Date();
      const created = new Date(createdAt);
      return Math.floor((now.getTime() - created.getTime()) / 1000);
    };
    
    setElapsedSeconds(calculateElapsed());
    
    const interval = setInterval(() => {
      setElapsedSeconds(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt]);

  const formatTime = (seconds: number) => {
    const abs = Math.max(0, seconds);
    const mins = Math.floor(abs / 60);
    const secs = abs % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTimerColorClass = useCallback(() => {
    if (colorAlerts.alert2Enabled && elapsedSeconds >= colorAlerts.alert2Seconds) return "text-red-500";
    if (colorAlerts.alert1Enabled && elapsedSeconds >= colorAlerts.alert1Seconds) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-500";
  }, [elapsedSeconds, colorAlerts]);

  const getActiveAlertColor = useCallback((): string | null => {
    if (isRecalled) return "purple";
    if (colorAlerts.alert2Enabled && elapsedSeconds >= colorAlerts.alert2Seconds) return colorAlerts.alert2Color;
    if (colorAlerts.alert1Enabled && elapsedSeconds >= colorAlerts.alert1Seconds) return colorAlerts.alert1Color;
    return null;
  }, [elapsedSeconds, colorAlerts, isRecalled]);

  const activeAlertColor = getActiveAlertColor();
  const hasAlert = activeAlertColor !== null;

  const markReadyMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("POST", `/api/kds-items/${itemId}/ready`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
  });

  const unmarkReadyMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("POST", `/api/kds-items/${itemId}/unready`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
  });

  const handleItemClick = (item: KdsItem) => {
    if (!itemSelectEnabled || item.status === "voided" || item.itemStatus === "pending") return;
    
    if (item.isReady) {
      unmarkReadyMutation.mutate(item.id);
    } else {
      markReadyMutation.mutate(item.id);
    }
  };

  const activeItems = items
    .filter((item) => item.status !== "voided")
    .sort((a, b) => {
      // Modified items appear first (higher priority)
      if (a.isModified && !b.isModified) return -1;
      if (!a.isModified && b.isModified) return 1;
      // Then sort by sortPriority if set
      return (b.sortPriority || 0) - (a.sortPriority || 0);
    });
  const allItemsReady = activeItems.length > 0 && activeItems.every((item) => item.isReady);
  const hasModifiedItems = activeItems.some((item) => item.isModified);

  const cardBgClass = hasAlert 
    ? `${COLOR_BACKGROUND_CLASSES[activeAlertColor] || ""}`
    : "";
  
  const cardTextClass = hasAlert
    ? `${COLOR_TEXT_CLASSES[activeAlertColor] || ""}`
    : "";

  return (
    <Card
      className={`flex flex-col transition-all ${isDraft ? "opacity-60" : ""} ${cardBgClass} ${cardTextClass} ${isBlinking ? "animate-pulse" : ""}`}
      data-testid={`kds-ticket-${ticketId}`}
    >
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2 space-y-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl font-bold" data-testid={`text-ticket-number-${ticketId}`}>
            #{checkNumber}
          </span>
          {isRecalled && (
            <Badge className="text-xs bg-purple-600 text-white">
              <RotateCcw className="w-3 h-3 mr-1" />
              RECALL
            </Badge>
          )}
          {stationType && (
            <Badge
              variant="outline"
              className={`text-xs font-bold ${!hasAlert ? STATION_TYPE_COLORS[stationType] || "" : "border-current"}`}
            >
              {STATION_TYPE_LABELS[stationType] || stationType.toUpperCase()}
            </Badge>
          )}
          {isDraft && (
            <Badge variant="secondary" className="text-xs">
              DRAFT
            </Badge>
          )}
          {isPreview && !isDraft && (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              PREVIEW
            </Badge>
          )}
          {isPaid && (
            <Badge className="text-xs bg-green-500 text-white">
              PAID
            </Badge>
          )}
          {hasModifiedItems && (
            <Badge className="text-xs bg-orange-500 text-white">
              MODIFIED
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={!hasAlert ? ORDER_TYPE_COLORS[orderType] || "" : "border-current"}
          >
            {ORDER_TYPE_LABELS[orderType] || orderType}
          </Badge>
          <div className={`flex items-center gap-1 text-base font-bold tabular-nums ${hasAlert ? "" : getTimerColorClass()}`}>
            <Clock className="w-3.5 h-3.5" />
            {formatTime(elapsedSeconds)}
          </div>
        </div>
      </CardHeader>

      <Separator className={hasAlert ? "bg-current/20" : ""} />

      {isRecalled && (
        <div className="px-3 py-1.5 text-center text-base font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
          Recalled
        </div>
      )}

      <CardContent className="flex-1 py-3 space-y-1">
        {activeItems.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-2 p-1.5 rounded-md transition-colors ${
              itemSelectEnabled && item.itemStatus !== "pending" && item.status !== "voided"
                ? "cursor-pointer hover:bg-black/10 dark:hover:bg-white/10"
                : ""
            } ${item.isReady ? (hasAlert ? "bg-black/20" : "bg-green-500/10") : ""} ${item.itemStatus === "pending" ? "animate-pulse" : ""} ${item.isModified ? (hasAlert ? "border-l-2 border-current" : "border-l-2 border-orange-500 bg-orange-500/5") : ""}`}
            onClick={() => handleItemClick(item)}
            data-testid={`kds-item-${item.id}`}
          >
            <div
              className={`w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center text-base font-bold ${
                item.isReady
                  ? (hasAlert ? "bg-black/30 text-current" : "bg-green-500/20 text-green-600")
                  : item.status === "bumped"
                  ? "bg-green-500/20 text-green-600"
                  : item.itemStatus === "pending"
                  ? "bg-amber-500/20 text-amber-600"
                  : (hasAlert ? "bg-black/10" : "bg-muted text-muted-foreground")
              }`}
            >
              {item.isReady ? <CircleCheck className="w-4 h-4" /> : item.quantity}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {item.status === "bumped" && (
                  <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                )}
                <span
                  className={`font-medium ${
                    item.isReady
                      ? (hasAlert ? "font-bold" : "text-green-600 dark:text-green-400")
                      : item.status === "bumped"
                      ? "line-through opacity-60"
                      : item.itemStatus === "pending"
                      ? (hasAlert ? "opacity-80" : "text-amber-600 dark:text-amber-400")
                      : ""
                  }`}
                >
                  {item.quantity > 1 && !item.isReady ? `${item.quantity}x ` : ""}{item.name}
                </span>
                {item.itemStatus === "pending" && (
                  <Badge variant="outline" className="text-[10px] py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                    MODIFYING
                  </Badge>
                )}
                {item.isModified && !item.itemStatus && (
                  <Badge variant="outline" className="text-[10px] py-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30">
                    MODIFIED
                  </Badge>
                )}
              </div>
              {item.modifiers && item.modifiers.length > 0 && (
                <div className={`mt-0.5 space-y-0.5 ${item.itemStatus === "pending" ? "animate-pulse" : ""}`}>
                  {[...item.modifiers]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((mod, idx) => (
                    <span
                      key={idx}
                      className={`block text-base font-medium pl-1 ${
                        item.itemStatus === "pending" 
                          ? (hasAlert ? "opacity-80" : "text-amber-600 dark:text-amber-400")
                          : (hasAlert ? "opacity-90 font-semibold" : "text-red-700 dark:text-red-400")
                      }`}
                      data-testid={`text-modifier-${item.id}-${idx}`}
                    >
                      - {mod.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {items.filter((i) => i.status === "voided").length > 0 && (
          <div className="pt-2 space-y-1">
            <Separator className={hasAlert ? "bg-current/20" : ""} />
            {items
              .filter((i) => i.status === "voided")
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 opacity-60"
                >
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm line-through">
                    {item.quantity}x {item.name}
                  </span>
                  <Badge variant="destructive" className="text-xs">
                    VOID
                  </Badge>
                </div>
              ))}
          </div>
        )}
      </CardContent>

      {subtotal && (
        <>
          <Separator className={hasAlert ? "bg-current/20" : ""} />
          <div className={`px-4 py-2 flex items-center justify-between ${hasAlert ? "" : "text-muted-foreground"}`}>
            <span className="text-base font-medium">Subtotal</span>
            <span className="text-base font-bold tabular-nums">${parseFloat(subtotal).toFixed(2)}</span>
          </div>
        </>
      )}

      <CardFooter className="pt-2">
        {!isDraft && !isPreview && !activeItems.some((i) => i.itemStatus === "pending") && (
          <Button
            className={`w-full h-12 text-base font-semibold ${allItemsReady ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
            variant={hasAlert ? "secondary" : "default"}
            onClick={() => onBump(ticketId)}
            disabled={activeItems.length > 0 && activeItems.every((i) => i.status === "bumped")}
            data-testid={`button-bump-${ticketId}`}
          >
            <CheckIcon className="w-5 h-5 mr-2" />
            {activeItems.length === 0 ? "DISMISS" : allItemsReady ? "ALL READY - BUMP" : "BUMP"}
          </Button>
        )}
        {!isDraft && activeItems.some((i) => i.itemStatus === "pending") && (
          <div className={`w-full h-12 flex items-center justify-center text-base font-medium animate-pulse ${hasAlert ? "" : "text-amber-600 dark:text-amber-400"}`}>
            Item being configured...
          </div>
        )}
        {isPreview && !activeItems.some((i) => i.itemStatus === "pending") && (
          <div className={`w-full h-12 flex items-center justify-center text-base font-medium ${hasAlert ? "" : "text-amber-600 dark:text-amber-400"}`}>
            Preview - awaiting send/payment
          </div>
        )}
        {isDraft && (
          <div className={`w-full h-12 flex items-center justify-center text-base ${hasAlert ? "" : "text-muted-foreground"}`}>
            Waiting for send...
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

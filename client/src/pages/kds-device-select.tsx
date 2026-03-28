import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useDeviceContext } from "@/lib/device-context";
import { Tv, Loader2, Maximize, Minimize, ArrowLeft, Building2 } from "lucide-react";
import type { KdsDevice, Property } from "@shared/schema";

interface KdsDeviceWithProperty extends KdsDevice {
  property?: Property;
}

export default function KdsDeviceSelectPage() {
  const [, navigate] = useLocation();
  const { configureAsKds, enterpriseId, clearDeviceTypeOnly } = useDeviceContext();
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const { data: kdsDevices = [], isLoading } = useQuery<KdsDeviceWithProperty[]>({
    queryKey: ["/api/kds-devices", { enterpriseId }],
    queryFn: async () => {
      const url = enterpriseId 
        ? `/api/kds-devices?enterpriseId=${enterpriseId}` 
        : "/api/kds-devices";
      const response = await failoverFetch(url);
      if (!response.ok) throw new Error("Failed to fetch KDS devices");
      return response.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", { enterpriseId }],
    queryFn: async () => {
      const url = enterpriseId 
        ? `/api/properties?enterpriseId=${enterpriseId}` 
        : "/api/properties";
      const response = await failoverFetch(url);
      if (!response.ok) throw new Error("Failed to fetch properties");
      return response.json();
    },
  });

  const getPropertyName = (propertyId: string | null | undefined) => {
    if (!propertyId) return "Unknown Property";
    const property = properties.find(p => p.id === propertyId);
    return property?.name || "Unknown Property";
  };

  const handleSelectDevice = (device: KdsDeviceWithProperty) => {
    setSelectedDeviceId(device.id);
    configureAsKds(device.id, device.name);
    navigate("/kds");
  };

  const handleBack = () => {
    // Only clear device type, not server config - let user choose POS or KDS again
    clearDeviceTypeOnly();
    navigate("/device-type");
  };

  const activeDevices = kdsDevices.filter(d => d.active !== false);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 left-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          title="Back to Device Type Selection"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
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
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-2">
            <Tv className="w-8 h-8 text-orange-500" />
          </div>
          <CardTitle className="text-xl font-semibold" data-testid="text-kds-select-title">
            Select KDS Display
          </CardTitle>
          <CardDescription>
            Choose which Kitchen Display System this device will be assigned to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeDevices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tv className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No KDS devices found.</p>
              <p className="text-sm mt-1">Please configure KDS devices in EMC first.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {activeDevices.map((device) => (
                <Button
                  key={device.id}
                  variant="outline"
                  className="h-auto py-4 px-4 flex items-center justify-start gap-4"
                  onClick={() => handleSelectDevice(device)}
                  disabled={selectedDeviceId === device.id}
                  data-testid={`button-kds-device-${device.id}`}
                >
                  <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Tv className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-semibold truncate">{device.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3" />
                      {getPropertyName(device.propertyId)}
                    </div>
                  </div>
                  {selectedDeviceId === device.id && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                </Button>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center pt-4">
            This device will be locked to the selected KDS. Use Reset Device to change later.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

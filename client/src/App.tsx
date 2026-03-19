import { useEffect, useState } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { PosProvider } from "@/lib/pos-context";
import { DeviceProvider, useDeviceContext, getAutoEnrollRedirect } from "@/lib/device-context";
import { EmcProvider } from "@/lib/emc-context";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import PosPage from "@/pages/pos";
import PizzaBuilderPage from "@/pages/pizza-builder";
import KdsPage from "@/pages/kds";
import DeviceSetupPage from "@/pages/device-setup";
import DeviceTypeSelectPage from "@/pages/device-type-select";
import ServerSetupPage from "@/pages/server-setup";
import KdsDeviceSelectPage from "@/pages/kds-device-select";
import EmcLoginPage from "@/pages/emc/login";
import EmcSetupPage from "@/pages/emc/setup";
import EmcAdminLayout from "@/pages/emc/admin-layout";
import OfflineTestPage from "@/pages/offline-test";
import { OfflineStatusBanner } from "@/components/offline-status-banner";
import { UpdateStatusBanner } from "@/components/update-status-banner";
import { ErrorBoundary } from "@/components/error-boundary";

type CapsBootStage = 'starting' | 'connecting' | 'loading-config' | 'ready' | 'failed' | 'unreachable' | 'no-caps-url' | null;

function useCapsBootGate(): { capsReady: boolean; capsBootStage: CapsBootStage } {
  const isElectron = !!(window as any).electronAPI?.isElectron;
  const [stage, setStage] = useState<CapsBootStage>(isElectron ? 'starting' : 'ready');

  useEffect(() => {
    const w = window as any;
    if (!w.electronAPI?.isElectron) {
      setStage('ready');
      return;
    }
    if (w.electronAPI?.getCapsBootStatus) {
      w.electronAPI.getCapsBootStatus().then((s: { stage: string }) => {
        setStage((s?.stage as CapsBootStage) || 'starting');
      }).catch(() => {});
    }
    if (w.electronAPI?.onCapsBootStatus) {
      const unsub = w.electronAPI.onCapsBootStatus((s: { stage: string }) => {
        setStage((s?.stage as CapsBootStage) || 'starting');
      });
      return unsub;
    }
  }, []);

  return { capsReady: stage === 'ready', capsBootStage: stage };
}

function GlobalWebSocket() {
  usePosWebSocket();
  return null;
}

function DeviceGuardedRoute({ 
  component: Component, 
  allowedTypes,
  ...rest 
}: { 
  component: React.ComponentType; 
  allowedTypes: ("pos" | "kds" | "unconfigured")[];
}) {
  const { deviceType, isConfigured } = useDeviceContext();
  
  if (!isConfigured) {
    if (allowedTypes.includes("unconfigured")) {
      return <Component />;
    }
    return <Redirect to="/setup" />;
  }
  
  if (deviceType && allowedTypes.includes(deviceType)) {
    return <Component />;
  }
  
  if (deviceType === "kds") {
    return <Redirect to="/kds" />;
  }
  
  return <Redirect to="/login" />;
}

function CapsBootGate({ children }: { children: React.ReactNode }) {
  const { capsReady } = useCapsBootGate();
  if (!capsReady) return null;
  return <>{children}</>;
}

function Router() {
  const { deviceType, isConfigured, hasExplicitDeviceType, hasServerConfig, linkedDeviceId, isElectronLoading } = useDeviceContext();
  const [location] = useLocation();
  
  if (isElectronLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background" data-testid="loading-electron-config">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Loading terminal configuration...</p>
        </div>
      </div>
    );
  }
  
  // Check for auto-enroll redirect from CAL wizard - handle FIRST before any other routing
  const autoEnrollRedirect = getAutoEnrollRedirect();
  if (autoEnrollRedirect && isConfigured) {
    console.log("[Router] Auto-enroll redirect to:", autoEnrollRedirect);
    return <Redirect to={autoEnrollRedirect} />;
  }
  
  // Offline test page - accessible without device enrollment
  if (location === "/offline-test") {
    return <OfflineTestPage />;
  }

  // EMC routes bypass device enrollment completely - accessible from any browser
  if (location.startsWith("/emc")) {
    return (
      <EmcProvider>
        <Switch>
          <Route path="/emc/login" component={EmcLoginPage} />
          <Route path="/emc/setup" component={EmcSetupPage} />
          <Route path="/emc/:rest*" component={EmcAdminLayout} />
          <Route path="/emc" component={EmcAdminLayout} />
        </Switch>
      </EmcProvider>
    );
  }

  // Server setup - REQUIRED for ALL application types (Windows, Android, Web)
  // User must enter enterprise URL (e.g., server.com/BOM) before proceeding
  if (!hasServerConfig) {
    if (location !== "/server-setup") {
      return <Redirect to="/server-setup" />;
    }
  }
  
  // Allowed setup routes for device configuration (after server is set)
  const setupRoutes = ["/server-setup", "/device-type", "/kds-device-select", "/setup"];
  
  // Device type selection - show if user hasn't explicitly chosen a device type
  // This is the FIRST screen a new device sees (POS Terminal or KDS Display)
  if (!hasExplicitDeviceType && !deviceType) {
    if (!setupRoutes.includes(location)) {
      return <Redirect to="/device-type" />;
    }
  }
  
  // KDS device selection - show if KDS type selected but no device linked
  if (hasExplicitDeviceType && deviceType === "kds" && !linkedDeviceId) {
    if (location !== "/kds-device-select" && !setupRoutes.includes(location)) {
      return <Redirect to="/kds-device-select" />;
    }
  }
  
  // Handle KDS devices - they can only access /kds and setup routes
  if (hasExplicitDeviceType && deviceType === "kds" && linkedDeviceId) {
    if (location !== "/kds" && !setupRoutes.includes(location)) {
      return <Redirect to="/kds" />;
    }
  }

  return (
    <Switch>
      <Route path="/server-setup" component={ServerSetupPage} />
      <Route path="/device-type" component={DeviceTypeSelectPage} />
      <Route path="/kds-device-select" component={KdsDeviceSelectPage} />
      <Route path="/setup" component={DeviceSetupPage} />
      <Route path="/kds">
        {() => <CapsBootGate><DeviceGuardedRoute component={KdsPage} allowedTypes={["pos", "kds"]} /></CapsBootGate>}
      </Route>
      <Route path="/">
        {() => <CapsBootGate><DeviceGuardedRoute component={LoginPage} allowedTypes={["pos"]} /></CapsBootGate>}
      </Route>
      <Route path="/login">
        {() => <CapsBootGate><DeviceGuardedRoute component={LoginPage} allowedTypes={["pos"]} /></CapsBootGate>}
      </Route>
      <Route path="/pos">
        {() => <CapsBootGate><DeviceGuardedRoute component={PosPage} allowedTypes={["pos"]} /></CapsBootGate>}
      </Route>
      <Route path="/pos/pizza-builder/:menuItemId">
        {() => <CapsBootGate><DeviceGuardedRoute component={PizzaBuilderPage} allowedTypes={["pos"]} /></CapsBootGate>}
      </Route>
      <Route path="/admin">
        {() => <Redirect to="/login" />}
      </Route>
      <Route path="/admin/:rest*">
        {() => <Redirect to="/login" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    if (window.electronAPI?.signalBootstrapReady) {
      window.electronAPI.signalBootstrapReady().catch(() => {});
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="pos-ui-theme">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <DeviceProvider>
              <PosProvider>
                <OfflineStatusBanner />
                <UpdateStatusBanner />
                <GlobalWebSocket />
                <Router />
                <Toaster />
              </PosProvider>
            </DeviceProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

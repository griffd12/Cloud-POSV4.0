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
import { ErrorBoundary } from "@/components/error-boundary";

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

function Router() {
  const { deviceType, isConfigured, hasExplicitDeviceType, hasServerConfig, linkedDeviceId } = useDeviceContext();
  const [location] = useLocation();
  
  const autoEnrollRedirect = getAutoEnrollRedirect();
  if (autoEnrollRedirect && isConfigured) {
    return <Redirect to={autoEnrollRedirect} />;
  }

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

  if (!hasServerConfig) {
    if (location !== "/server-setup") {
      return <Redirect to="/server-setup" />;
    }
  }
  
  const setupRoutes = ["/server-setup", "/device-type", "/kds-device-select", "/setup"];
  
  if (!hasExplicitDeviceType && !deviceType) {
    if (!setupRoutes.includes(location)) {
      return <Redirect to="/device-type" />;
    }
  }
  
  if (hasExplicitDeviceType && deviceType === "kds" && !linkedDeviceId) {
    if (location !== "/kds-device-select" && !setupRoutes.includes(location)) {
      return <Redirect to="/kds-device-select" />;
    }
  }
  
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
        {() => <DeviceGuardedRoute component={KdsPage} allowedTypes={["pos", "kds"]} />}
      </Route>
      <Route path="/">
        {() => <DeviceGuardedRoute component={LoginPage} allowedTypes={["pos"]} />}
      </Route>
      <Route path="/login">
        {() => <DeviceGuardedRoute component={LoginPage} allowedTypes={["pos"]} />}
      </Route>
      <Route path="/pos">
        {() => <DeviceGuardedRoute component={PosPage} allowedTypes={["pos"]} />}
      </Route>
      <Route path="/pos/pizza-builder/:menuItemId">
        {() => <DeviceGuardedRoute component={PizzaBuilderPage} allowedTypes={["pos"]} />}
      </Route>
      <Route path="/admin">
        {() => <Redirect to="/emc" />}
      </Route>
      <Route path="/admin/:rest*">
        {() => <Redirect to="/emc" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="pos-ui-theme">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <DeviceProvider>
              <PosProvider>
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

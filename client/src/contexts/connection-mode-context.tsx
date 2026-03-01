/**
 * Connection Mode Context
 * 
 * Provides global access to the current connectivity mode (GREEN/YELLOW/ORANGE/RED)
 * and manages automatic mode detection and switching.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { setElectronOfflineLock } from '@/lib/queryClient';

export type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';

interface ConnectionModeStatus {
  mode: ConnectionMode;
  cloudReachable: boolean;
  serviceHostReachable: boolean;
  printAgentAvailable: boolean;
  paymentAppAvailable: boolean;
  lastChecked: Date | null;
  isChecking: boolean;
}

interface ConnectionModeContextValue extends ConnectionModeStatus {
  checkNow: () => Promise<void>;
  setServiceHostUrl: (url: string) => void;
  serviceHostUrl: string;
}

const defaultStatus: ConnectionModeStatus = {
  mode: 'green',
  cloudReachable: true,
  serviceHostReachable: false,
  printAgentAvailable: false,
  paymentAppAvailable: false,
  lastChecked: null,
  isChecking: false,
};

const ConnectionModeContext = createContext<ConnectionModeContextValue | null>(null);

interface ConnectionModeProviderProps {
  children: ReactNode;
  checkInterval?: number;
}

function isRunningInElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron;
}

export function ConnectionModeProvider({ children, checkInterval = 15000 }: ConnectionModeProviderProps) {
  const [status, setStatus] = useState<ConnectionModeStatus>(defaultStatus);
  const electronControlled = useRef(false);
  const [serviceHostUrl, setServiceHostUrlState] = useState(
    () => localStorage.getItem('serviceHostUrl') || 'http://service-host.local:3001'
  );

  const setServiceHostUrl = useCallback((url: string) => {
    localStorage.setItem('serviceHostUrl', url);
    setServiceHostUrlState(url);
  }, []);

  const checkEndpoint = async (url: string, timeout = 5000): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        credentials: 'include',
      });
      
      clearTimeout(timeoutId);
      const isInterceptedOffline = response.headers.get('X-Offline-Mode') === 'true' || response.headers.get('X-Offline-Cache') === 'true';
      if (isInterceptedOffline) {
        return false;
      }
      return response.ok || response.status === 401;
    } catch {
      return false;
    }
  };

  const determineMode = (cloud: boolean, serviceHost: boolean, printAgent: boolean): ConnectionMode => {
    if (cloud) return 'green';
    if (serviceHost) return 'yellow';
    if (printAgent) return 'orange';
    return 'red';
  };

  const applyConnectionMode = useCallback((mode: ConnectionMode) => {
    const isOffline = mode !== 'green';
    setElectronOfflineLock(isOffline);
    setStatus({
      mode,
      cloudReachable: mode === 'green',
      serviceHostReachable: mode === 'yellow',
      printAgentAvailable: mode === 'orange',
      paymentAppAvailable: false,
      lastChecked: new Date(),
      isChecking: false,
    });
    localStorage.setItem('connectionMode', mode);
  }, []);

  useEffect(() => {
    const w = window as any;
    if (!isRunningInElectron()) return;

    electronControlled.current = true;

    if (w.electronAPI.getConnectionMode) {
      w.electronAPI.getConnectionMode().then((mode: string) => {
        applyConnectionMode(mode as ConnectionMode);
      }).catch(() => {});
    }

    if (w.electronAPI.onConnectionMode) {
      const unsub = w.electronAPI.onConnectionMode((mode: string) => {
        applyConnectionMode(mode as ConnectionMode);
      });
      return unsub;
    }
  }, [applyConnectionMode]);

  const checkNow = useCallback(async () => {
    if (electronControlled.current) return;

    setStatus(prev => ({ ...prev, isChecking: true }));

    try {
      const [cloudOk, serviceHostOk, printAgentOk, paymentAppOk] = await Promise.all([
        checkEndpoint('/api/health'),
        checkEndpoint(`${serviceHostUrl}/health`),
        checkEndpoint('http://localhost:3003/health'),
        checkEndpoint('http://localhost:3004/health'),
      ]);

      const newMode = determineMode(cloudOk, serviceHostOk, printAgentOk);

      setStatus({
        mode: newMode,
        cloudReachable: cloudOk,
        serviceHostReachable: serviceHostOk,
        printAgentAvailable: printAgentOk,
        paymentAppAvailable: paymentAppOk,
        lastChecked: new Date(),
        isChecking: false,
      });

      localStorage.setItem('connectionMode', newMode);
    } catch (error) {
      console.error('Connection mode check failed:', error);
      setStatus(prev => ({ ...prev, isChecking: false }));
    }
  }, [serviceHostUrl]);

  useEffect(() => {
    if (electronControlled.current) return;

    checkNow();

    const interval = setInterval(checkNow, checkInterval);
    return () => clearInterval(interval);
  }, [checkNow, checkInterval]);

  useEffect(() => {
    if (electronControlled.current) return;

    const handleOnline = () => checkNow();
    const handleOffline = () => {
      setStatus(prev => ({
        ...prev,
        mode: 'red',
        cloudReachable: false,
        serviceHostReachable: false,
        lastChecked: new Date(),
      }));
      localStorage.setItem('connectionMode', 'red');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkNow]);

  const value: ConnectionModeContextValue = {
    ...status,
    checkNow,
    setServiceHostUrl,
    serviceHostUrl,
  };

  return (
    <ConnectionModeContext.Provider value={value}>
      {children}
    </ConnectionModeContext.Provider>
  );
}

export function useConnectionMode(): ConnectionModeContextValue {
  const context = useContext(ConnectionModeContext);
  if (!context) {
    throw new Error('useConnectionMode must be used within a ConnectionModeProvider');
  }
  return context;
}

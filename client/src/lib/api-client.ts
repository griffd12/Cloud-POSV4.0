/**
 * API Client — CAPS-Only Architecture
 * 
 * All API requests go through the Electron protocol interceptor to CAPS.
 * The frontend uses relative URLs; Electron routes them to the local CAPS server.
 * In browser (dev mode), requests go to the current origin which proxies to CAPS.
 * 
 * Connection modes (display only — no routing decisions):
 * - GREEN: CAPS reachable and healthy
 * - RED: CAPS unreachable — POS operations disabled
 */

import { useState, useEffect } from 'react';

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';

interface ModeStatus {
  mode: ConnectionMode;
  capsReachable: boolean;
  cloudReachable: boolean;
  serviceHostReachable: boolean;
  printAgentAvailable: boolean;
  paymentAppAvailable: boolean;
  lastChecked: Date;
}

class ApiClient {
  private currentMode: ConnectionMode = 'green';
  private modeListeners: ((mode: ConnectionMode) => void)[] = [];
  private lastStatus: ModeStatus | null = null;
  private isElectron: boolean = false;
  private electronCleanup: (() => void) | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.isElectron = !!(window as any).electronAPI;
    
    if (this.isElectron) {
      this.initElectronMode();
    } else {
      this.startHealthChecks();
    }
  }
  
  private initElectronMode(): void {
    const electronAPI = (window as any).electronAPI;
    
    const storedMode = localStorage.getItem('connectionMode');
    if (storedMode && ['green', 'yellow', 'orange', 'red'].includes(storedMode)) {
      this.setMode(storedMode as ConnectionMode);
    }
    
    if (electronAPI.getConnectionMode) {
      electronAPI.getConnectionMode().then((mode: string) => {
        if (mode && ['green', 'yellow', 'orange', 'red'].includes(mode)) {
          this.setMode(mode as ConnectionMode);
          this.updateStatusFromElectron(mode as ConnectionMode);
        }
      }).catch(() => {});
    }
    
    if (electronAPI.onConnectionMode) {
      const unsub = electronAPI.onConnectionMode((mode: string) => {
        if (mode && ['green', 'yellow', 'orange', 'red'].includes(mode)) {
          this.setMode(mode as ConnectionMode);
          this.updateStatusFromElectron(mode as ConnectionMode);
        }
      });
      this.electronCleanup = unsub;
    }
  }
  
  private updateStatusFromElectron(mode: ConnectionMode): void {
    this.lastStatus = {
      mode,
      capsReachable: mode === 'green' || mode === 'yellow',
      cloudReachable: false,
      serviceHostReachable: mode === 'green' || mode === 'yellow',
      printAgentAvailable: mode !== 'red',
      paymentAppAvailable: mode !== 'red',
      lastChecked: new Date(),
    };
  }
  
  configure(config: { serviceHostUrl?: string }): void {
    if (config.serviceHostUrl) {
      localStorage.setItem('serviceHostUrl', config.serviceHostUrl);
    }
  }
  
  getMode(): ConnectionMode {
    return this.currentMode;
  }
  
  getStatus(): ModeStatus | null {
    return this.lastStatus;
  }
  
  onModeChange(callback: (mode: ConnectionMode) => void): () => void {
    this.modeListeners.push(callback);
    return () => {
      this.modeListeners = this.modeListeners.filter(cb => cb !== callback);
    };
  }
  
  async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: createTimeoutSignal(10000),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) errorMessage = errorJson.error;
      } catch {}
      throw new Error(errorMessage);
    }
    
    return response.json();
  }
  
  async get<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }
  
  async post<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  async put<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  
  async patch<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  
  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
  
  async print(params: PrintParams): Promise<PrintResult> {
    return this.request('/api/print/jobs', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }
  
  async authorizePayment(params: PaymentParams): Promise<PaymentResult> {
    return this.request('/api/payment/authorize', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }
  
  async queueForSync(endpoint: string, method: string, body?: any): Promise<string> {
    const { offlineQueue } = await import('./offline-queue');
    return offlineQueue.enqueue(endpoint, method, body);
  }
  
  async syncQueuedOperations(): Promise<{ processed: number; failed: number }> {
    if (this.currentMode === 'red') {
      return { processed: 0, failed: 0 };
    }
    
    const { offlineQueue } = await import('./offline-queue');
    return offlineQueue.processQueue(async (op) => {
      try {
        const response = await fetch(op.endpoint, {
          method: op.method,
          headers: { 'Content-Type': 'application/json' },
          body: op.body ? JSON.stringify(op.body) : undefined,
          signal: createTimeoutSignal(10000),
        });
        return response.ok;
      } catch {
        return false;
      }
    });
  }
  
  async getPendingOperationsCount(): Promise<number> {
    const { offlineQueue } = await import('./offline-queue');
    return offlineQueue.getPendingCount();
  }
  
  private setMode(mode: ConnectionMode): void {
    if (mode !== this.currentMode) {
      console.log(`Connection mode changed: ${this.currentMode} → ${mode}`);
      this.currentMode = mode;
      this.modeListeners.forEach(cb => cb(mode));
    }
  }
  
  private startHealthChecks(): void {
    this.checkHealth();
    this.healthCheckInterval = setInterval(() => this.checkHealth(), 30000);
  }
  
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.electronCleanup) {
      this.electronCleanup();
      this.electronCleanup = null;
    }
  }
  
  private async checkHealth(): Promise<void> {
    if (this.isElectron) return;
    
    const status: ModeStatus = {
      mode: this.currentMode,
      capsReachable: false,
      cloudReachable: false,
      serviceHostReachable: false,
      printAgentAvailable: false,
      paymentAppAvailable: false,
      lastChecked: new Date(),
    };
    
    try {
      const response = await fetch('/health', {
        signal: createTimeoutSignal(3000),
      });
      status.capsReachable = response.ok;
      status.serviceHostReachable = response.ok;
    } catch {
      status.capsReachable = false;
    }
    
    status.mode = status.capsReachable ? 'green' : 'red';
    this.lastStatus = status;
    this.setMode(status.mode);
  }
  
  async forceHealthCheck(): Promise<ModeStatus> {
    if (this.isElectron) {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.getConnectionMode) {
        try {
          const mode = await electronAPI.getConnectionMode();
          if (mode && ['green', 'yellow', 'orange', 'red'].includes(mode)) {
            this.setMode(mode as ConnectionMode);
            this.updateStatusFromElectron(mode as ConnectionMode);
          }
        } catch {}
      }
      return this.lastStatus!;
    }
    await this.checkHealth();
    return this.lastStatus!;
  }
}

interface PrintParams {
  printerId: string;
  printerIp?: string;
  printerPort?: number;
  jobType: 'receipt' | 'kitchen' | 'report';
  content: any;
}

interface PrintResult {
  id: string;
  status: string;
  error?: string;
}

interface PaymentParams {
  checkId: string;
  amount: number;
  tip?: number;
  tenderId?: string;
  tenderType?: 'credit' | 'debit';
}

interface PaymentResult {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  cardLast4?: string;
  error?: string;
}

export const apiClient = new ApiClient();

export function useConnectionMode(): { 
  mode: ConnectionMode; 
  status: ModeStatus | null;
  forceCheck: () => Promise<ModeStatus>;
} {
  const [mode, setMode] = useState<ConnectionMode>(apiClient.getMode());
  const [status, setStatus] = useState<ModeStatus | null>(apiClient.getStatus());
  
  useEffect(() => {
    const unsubscribe = apiClient.onModeChange((newMode) => {
      setMode(newMode);
      setStatus(apiClient.getStatus());
    });
    
    return unsubscribe;
  }, []);
  
  const forceCheck = async () => {
    const newStatus = await apiClient.forceHealthCheck();
    setStatus(newStatus);
    setMode(newStatus.mode);
    return newStatus;
  };
  
  return { mode, status, forceCheck };
}

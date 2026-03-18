/**
 * API Client with Automatic Failover
 * 
 * Handles seamless switching between:
 * - GREEN mode: Cloud API (primary)
 * - YELLOW mode: Service Host API (offline fallback)
 * - ORANGE mode: Local agents only
 * - RED mode: Browser IndexedDB only
 * 
 * In Electron, the backend determines the connection mode via real network checks
 * and sends it via IPC. The frontend trusts the Electron backend's mode determination.
 * In browser, the client runs its own health checks.
 */

import { useState, useEffect } from 'react';

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';

interface ApiClientConfig {
  cloudUrl: string;
  serviceHostUrl: string;
  localPrintAgentUrl: string;
  localPaymentAppUrl: string;
}

interface ModeStatus {
  mode: ConnectionMode;
  cloudReachable: boolean;
  serviceHostReachable: boolean;
  printAgentAvailable: boolean;
  paymentAppAvailable: boolean;
  lastChecked: Date;
}

class ApiClient {
  private config: ApiClientConfig;
  private currentMode: ConnectionMode = 'green';
  private modeListeners: ((mode: ConnectionMode) => void)[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastStatus: ModeStatus | null = null;
  private isElectron: boolean = false;
  private electronCleanup: (() => void) | null = null;
  
  constructor() {
    this.config = {
      cloudUrl: '',
      serviceHostUrl: localStorage.getItem('serviceHostUrl') || 'http://service-host.local:3001',
      localPrintAgentUrl: 'http://localhost:3003',
      localPaymentAppUrl: 'http://localhost:3004',
    };
    
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
      cloudReachable: mode === 'green',
      serviceHostReachable: mode === 'green' || mode === 'yellow',
      printAgentAvailable: mode !== 'red',
      paymentAppAvailable: mode !== 'red',
      lastChecked: new Date(),
    };
  }
  
  configure(config: Partial<ApiClientConfig>): void {
    this.config = { ...this.config, ...config };
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
    const baseUrl = this.getBaseUrl();
    
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: createTimeoutSignal(10000),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      return this.handleFailure<T>(endpoint, options, error as Error);
    }
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
    if (this.currentMode === 'green' || this.currentMode === 'yellow') {
      try {
        return await this.request('/api/print/jobs', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      } catch (error) {
        console.warn('Service Host print failed, trying local agent');
      }
    }
    
    try {
      const response = await fetch(`${this.config.localPrintAgentUrl}/api/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: createTimeoutSignal(5000),
      });
      
      if (!response.ok) {
        throw new Error('Local print agent failed');
      }
      
      return response.json();
    } catch (error) {
      throw new Error('Printing unavailable - no print service reachable');
    }
  }
  
  async authorizePayment(params: PaymentParams): Promise<PaymentResult> {
    if (this.currentMode === 'green' || this.currentMode === 'yellow') {
      try {
        return await this.request('/api/payment/authorize', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      } catch (error) {
        console.warn('Service Host payment failed, trying local app');
      }
    }
    
    if (this.lastStatus?.paymentAppAvailable) {
      try {
        const response = await fetch(`${this.config.localPaymentAppUrl}/api/payment/authorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: createTimeoutSignal(30000),
        });
        
        if (!response.ok) {
          throw new Error('Local payment app failed');
        }
        
        return response.json();
      } catch (error) {
        throw new Error('Payment processing unavailable');
      }
    }
    
    throw new Error('No payment service available - cash only');
  }
  
  private getBaseUrl(): string {
    switch (this.currentMode) {
      case 'green':
        return this.config.cloudUrl || '';
      case 'yellow':
      case 'orange':
        return this.config.serviceHostUrl;
      case 'red':
        return '';
    }
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
        const response = await fetch(`${this.getBaseUrl()}${op.endpoint}`, {
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
  
  private static readonly CAPS_ONLY_PATTERNS = [
    /^\/api\/(checks|check-items|check-payments|check-discounts|check-service-charges)(\/|$)/,
    /^\/api\/(payments|refunds|kds-tickets|terminal-sessions)(\/|$)/,
    /^\/api\/(auth\/login|auth\/pin|auth\/manager-approval)(\/|$)/,
    /^\/api\/(time-punches|time-clock|item-availability|cash-drawer-kick)(\/|$)/,
  ];

  private isCapsOnlyRoute(endpoint: string): boolean {
    return ApiClient.CAPS_ONLY_PATTERNS.some(re => re.test(endpoint));
  }

  private async handleFailure<T>(endpoint: string, options: RequestInit, error: Error): Promise<T> {
    console.warn(`Request failed in ${this.currentMode} mode:`, error.message);
    
    if (this.isElectron) {
      throw error;
    }

    if (this.isCapsOnlyRoute(endpoint)) {
      throw error;
    }
    
    if (this.currentMode === 'green') {
      this.setMode('yellow');
      
      try {
        const response = await fetch(`${this.config.serviceHostUrl}${endpoint}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          signal: createTimeoutSignal(10000),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        return response.json();
      } catch (e) {
        this.setMode('orange');
        throw new Error('Both cloud and Service Host unavailable');
      }
    } else if (this.currentMode === 'yellow') {
      this.setMode('orange');
      throw error;
    }
    
    throw error;
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
      cloudReachable: false,
      serviceHostReachable: false,
      printAgentAvailable: false,
      paymentAppAvailable: false,
      lastChecked: new Date(),
    };
    
    try {
      const cloudUrl = this.config.cloudUrl || window.location.origin;
      const response = await fetch(`${cloudUrl}/health`, {
        signal: createTimeoutSignal(3000),
      });
      status.cloudReachable = response.ok;
    } catch {
      status.cloudReachable = false;
    }
    
    try {
      const response = await fetch(`${this.config.serviceHostUrl}/health`, {
        signal: createTimeoutSignal(3000),
      });
      status.serviceHostReachable = response.ok;
    } catch {
      status.serviceHostReachable = false;
    }
    
    try {
      const response = await fetch(`${this.config.localPrintAgentUrl}/health`, {
        signal: createTimeoutSignal(1000),
      });
      status.printAgentAvailable = response.ok;
    } catch {
      status.printAgentAvailable = false;
    }
    
    try {
      const response = await fetch(`${this.config.localPaymentAppUrl}/health`, {
        signal: createTimeoutSignal(1000),
      });
      status.paymentAppAvailable = response.ok;
    } catch {
      status.paymentAppAvailable = false;
    }
    
    let newMode: ConnectionMode;
    if (status.cloudReachable) {
      newMode = 'green';
    } else if (status.serviceHostReachable) {
      newMode = 'yellow';
    } else if (status.printAgentAvailable || status.paymentAppAvailable) {
      newMode = 'orange';
    } else {
      newMode = 'red';
    }
    
    status.mode = newMode;
    this.lastStatus = status;
    this.setMode(newMode);
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

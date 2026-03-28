/**
 * API Client — Pure Cloud Architecture
 * 
 * All API requests go directly to the Express server via fetch.
 * No offline mode, no Electron, no CAPS, no service-host routing.
 */

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

class ApiClient {
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

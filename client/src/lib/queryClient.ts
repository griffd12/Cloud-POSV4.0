import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { connectionManager } from "./connection-manager";

const EMC_SESSION_KEY = "emc_session_token";
const DEVICE_TOKEN_KEY = "pos_device_token";
const FETCH_TIMEOUT_MS = 8000;

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function resolveUrl(endpoint: string): string {
  const base = connectionManager.getBaseUrl();
  if (base && endpoint.startsWith("/")) {
    return `${base}${endpoint}`;
  }
  return endpoint;
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(resolveUrl(url), {
    ...options,
    signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
  });
  return res;
}

export function failoverFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(resolveUrl(url), options);
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  
  const emcToken = sessionStorage.getItem(EMC_SESSION_KEY);
  if (emcToken) {
    headers["X-EMC-Session"] = emcToken;
  }
  
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (deviceToken) {
    headers["X-Device-Token"] = deviceToken;
  }
  
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = {
    ...authHeaders,
    ...extraHeaders,
  };
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  const res = await fetch(resolveUrl(url), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const authHeaders = getAuthHeaders();
    
    const res = await fetch(resolveUrl(url), {
      credentials: "include",
      headers: authHeaders,
      signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
    });

    if (res.ok) {
      return await res.json();
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
      gcTime: 5 * 60 * 1000,
      retry: false,
      networkMode: 'always',
    },
    mutations: {
      retry: false,
      networkMode: 'always',
    },
  },
});

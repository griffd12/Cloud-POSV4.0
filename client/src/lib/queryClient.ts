import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { offlineStorage } from './offline-storage';

const EMC_SESSION_KEY = "emc_session_token";
const DEVICE_TOKEN_KEY = "pos_device_token";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let isOfflineMode = false;
let electronOfflineLock = false;
let offlineListeners: ((offline: boolean) => void)[] = [];

export function getIsOfflineMode() { return isOfflineMode; }

export function onOfflineModeChange(cb: (offline: boolean) => void) {
  offlineListeners.push(cb);
  return () => { offlineListeners = offlineListeners.filter(l => l !== cb); };
}

export function setElectronOfflineLock(locked: boolean) {
  electronOfflineLock = locked;
  logToElectron('INFO', 'NETWORK', 'Lock', `Electron offline lock: ${locked ? 'ENGAGED' : 'RELEASED'}`);
  if (locked) {
    setOfflineMode(true);
  } else {
    setOfflineMode(false);
  }
}

export function setOfflineModeExternal(val: boolean) {
  if (val) {
    setElectronOfflineLock(true);
  } else {
    setElectronOfflineLock(false);
    setOfflineMode(false);
  }
}

function setOfflineMode(val: boolean) {
  if (electronOfflineLock && !val) {
    logToElectron('DEBUG', 'NETWORK', 'Mode', 'Blocked online flip — Electron offline lock is engaged');
    return;
  }
  if (isOfflineMode !== val) {
    isOfflineMode = val;
    offlineListeners.forEach(cb => cb(val));
    logToElectron(val ? 'WARN' : 'INFO', 'NETWORK', 'Mode', val ? 'Switched to OFFLINE mode' : 'Switched to ONLINE mode');
  }
}

export function logToElectron(level: string, subsystem: string, category: string, message: string, data?: any) {
  const w = window as any;
  if (w.electronAPI?.log) {
    w.electronAPI.log(level, subsystem, category, message, data).catch(() => {});
  }
}

const URL_CACHE_KEY_MAP: Record<string, string> = {};

function cacheKeyForUrl(url: string): string {
  if (URL_CACHE_KEY_MAP[url]) return URL_CACHE_KEY_MAP[url];
  const clean = url.replace(/^\/api\//, '').replace(/[?&]/g, '_').replace(/=/g, '-');
  const key = `api_${clean}`;
  URL_CACHE_KEY_MAP[url] = key;
  return key;
}

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(url, {
      ...options,
      signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const isInterceptedOffline = res.headers.get('X-Offline-Mode') === 'true' || res.headers.get('X-Offline-Cache') === 'true';
      if (!isInterceptedOffline) {
        setOfflineMode(false);
      }
      if (isGetRequest(options)) {
        cacheResponseInBackground(url, res.clone());
      }
    }
    return res;
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      if (isGetRequest(options)) {
        const cached = await tryGetCachedResponse(url);
        if (cached) {
          setOfflineMode(true);
          logToElectron('INFO', 'NETWORK', 'CacheFallback', `Serving cached: ${url}`);
          return cached;
        }
      }
      setOfflineMode(true);
    }
    throw err;
  }
}

function isGetRequest(options: RequestInit): boolean {
  return !options.method || options.method.toUpperCase() === 'GET';
}

async function cacheResponseInBackground(url: string, response: Response): Promise<void> {
  try {
    const data = await response.json();
    const key = cacheKeyForUrl(url);
    await offlineStorage.initialize();
    await offlineStorage.cacheConfig(key, data, CACHE_TTL_MS);
  } catch {
  }
}

async function tryGetCachedResponse(url: string): Promise<Response | null> {
  try {
    const key = cacheKeyForUrl(url);
    await offlineStorage.initialize();
    const data = await offlineStorage.getConfig<any>(key);
    if (data !== null) {
      return new Response(JSON.stringify(data), {
        status: 200,
        statusText: 'OK (offline cache)',
        headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': 'true' },
      });
    }
  } catch {
  }
  return null;
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
  
  const res = await fetch(url, {
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
    
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: authHeaders,
        signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
      });

      if (res.ok) {
        const isInterceptedOffline = res.headers.get('X-Offline-Mode') === 'true' || res.headers.get('X-Offline-Cache') === 'true';
        if (!isInterceptedOffline) {
          setOfflineMode(false);
        }
        const data = await res.json();
        cacheResponseInBackground(url, new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
        return data;
      }

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        const cached = await tryGetCachedResponse(url);
        if (cached) {
          setOfflineMode(true);
          logToElectron('INFO', 'NETWORK', 'CacheFallback', `QueryFn serving cached: ${url}`);
          return await cached.json();
        }
        setOfflineMode(true);
      }
      throw err;
    }
  };

const isElectronEnv = typeof window !== 'undefined' && !!(window as any).electronAPI;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: isElectronEnv ? 5 * 60 * 1000 : 0,
      gcTime: isElectronEnv ? 30 * 60 * 1000 : 5 * 60 * 1000,
      retry: false,
      networkMode: isElectronEnv ? 'always' : 'online',
    },
    mutations: {
      retry: false,
      networkMode: isElectronEnv ? 'always' : 'online',
    },
  },
});

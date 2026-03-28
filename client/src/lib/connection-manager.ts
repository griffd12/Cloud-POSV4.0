type ConnectionState = "cloud-online" | "cloud-degraded" | "cloud-offline" | "reconnecting";
type StateListener = (state: ConnectionState, prevState: ConnectionState) => void;

const HEALTH_CHECK_INTERVAL = 5000;
const FAILURE_THRESHOLD = 3;
const RECONNECT_SYNC_TIMEOUT = 30000;

const LFS_URL_KEY = "lfs_local_server_url";
const LFS_API_KEY_KEY = "lfs_api_key";

class ConnectionManager {
  private state: ConnectionState = "cloud-online";
  private consecutiveFailures = 0;
  private listeners = new Set<StateListener>();
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private cloudBaseUrl = "";
  private pendingSyncCount = 0;
  private syncProgress: { phase: string; current: number; total: number } | null = null;

  get currentState(): ConnectionState {
    return this.state;
  }

  get isOffline(): boolean {
    return this.state === "cloud-offline" || this.state === "reconnecting";
  }

  get localServerUrl(): string | null {
    return localStorage.getItem(LFS_URL_KEY);
  }

  set localServerUrl(url: string | null) {
    if (url) {
      localStorage.setItem(LFS_URL_KEY, url);
    } else {
      localStorage.removeItem(LFS_URL_KEY);
    }
  }

  get lfsApiKey(): string | null {
    return localStorage.getItem(LFS_API_KEY_KEY);
  }

  set lfsApiKey(key: string | null) {
    if (key) {
      localStorage.setItem(LFS_API_KEY_KEY, key);
    } else {
      localStorage.removeItem(LFS_API_KEY_KEY);
    }
  }

  get pendingSync(): number {
    return this.pendingSyncCount;
  }

  set pendingSync(count: number) {
    this.pendingSyncCount = count;
    this.notifyListeners(this.state, this.state);
  }

  get currentSyncProgress(): { phase: string; current: number; total: number } | null {
    return this.syncProgress;
  }

  getBaseUrl(): string {
    if (this.isOffline && this.localServerUrl) {
      return this.localServerUrl;
    }
    return this.cloudBaseUrl;
  }

  getWsUrl(): string {
    const base = this.getBaseUrl();
    if (base) {
      const url = new URL(base);
      const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${url.host}`;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }

  private getSyncHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const apiKey = this.lfsApiKey;
    if (apiKey) {
      headers["X-LFS-API-Key"] = apiKey;
    }
    return headers;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.healthInterval) return;
    this.cloudBaseUrl = "";
    this.checkHealth();
    this.healthInterval = setInterval(() => this.checkHealth(), HEALTH_CHECK_INTERVAL);
  }

  stop(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  private async checkHealth(): Promise<void> {
    try {
      const res = await fetch("/health", {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        this.consecutiveFailures = 0;
        if (this.state === "cloud-offline") {
          this.setState("reconnecting");
          this.runReconnectionSync();
        } else if (this.state !== "reconnecting") {
          this.setState("cloud-online");
        }
      } else {
        this.handleHealthFailure();
      }
    } catch {
      this.handleHealthFailure();
    }
  }

  private handleHealthFailure(): void {
    if (this.state === "reconnecting") return;
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      if (this.localServerUrl) {
        this.setState("cloud-offline");
      } else {
        this.setState("cloud-degraded");
      }
    } else if (this.consecutiveFailures >= 1) {
      if (this.state === "cloud-online") {
        this.setState("cloud-degraded");
      }
    }
  }

  private async runReconnectionSync(): Promise<void> {
    this.syncProgress = { phase: "Syncing configuration...", current: 0, total: 2 };
    this.notifyListeners(this.state, this.state);
    let hasSyncFailure = false;

    try {
      const lfsUrl = this.localServerUrl;
      if (lfsUrl) {
        try {
          const configRes = await fetch(`${lfsUrl}/api/lfs/sync/config-down`, {
            method: "POST",
            signal: AbortSignal.timeout(RECONNECT_SYNC_TIMEOUT),
          });
          if (!configRes.ok) {
            console.warn("[ConnectionManager] Config-down sync returned non-OK:", configRes.status);
            hasSyncFailure = true;
          }
        } catch (e: unknown) {
          console.warn("[ConnectionManager] Config-down sync failed:", e instanceof Error ? e.message : e);
          hasSyncFailure = true;
        }
      }

      this.syncProgress = { phase: "Uploading transactions...", current: 1, total: 2 };
      this.notifyListeners(this.state, this.state);

      if (lfsUrl) {
        let journalEntries: Array<{ id: string; [key: string]: unknown }> = [];
        try {
          const journalRes = await fetch(`${lfsUrl}/api/lfs/journal/pending`, {
            signal: AbortSignal.timeout(10000),
          });
          if (journalRes.ok) {
            const data = await journalRes.json();
            journalEntries = data.entries || [];
          }
        } catch {
          hasSyncFailure = true;
        }

        if (journalEntries.length > 0) {
          const total = journalEntries.length;
          const syncHeaders = this.getSyncHeaders();

          for (let i = 0; i < journalEntries.length; i++) {
            this.syncProgress = {
              phase: `Uploading transactions... ${i + 1} of ${total}`,
              current: i + 1,
              total,
            };
            this.notifyListeners(this.state, this.state);

            try {
              const uploadRes = await fetch("/api/lfs/sync/transaction-up", {
                method: "POST",
                headers: syncHeaders,
                body: JSON.stringify(journalEntries[i]),
                signal: AbortSignal.timeout(10000),
              });

              if (uploadRes.ok) {
                await fetch(`${lfsUrl}/api/lfs/journal/${journalEntries[i].id}/synced`, {
                  method: "POST",
                  signal: AbortSignal.timeout(5000),
                }).catch(() => { /* best-effort local mark */ });
              } else {
                hasSyncFailure = true;
              }
            } catch {
              hasSyncFailure = true;
              break;
            }
          }
        }
      }

      this.syncProgress = null;

      if (hasSyncFailure) {
        const remaining = lfsUrl
          ? await this.fetchPendingCount(lfsUrl)
          : 0;
        this.pendingSyncCount = remaining;
        if (remaining > 0) {
          console.warn(`[ConnectionManager] Sync incomplete: ${remaining} entries still pending`);
        }
      } else {
        this.pendingSyncCount = 0;
      }

      this.setState("cloud-online");
    } catch (e: unknown) {
      console.error("[ConnectionManager] Reconnection sync error:", e instanceof Error ? e.message : e);
      this.syncProgress = null;
      this.setState("cloud-online");
    }
  }

  private async fetchPendingCount(lfsUrl: string): Promise<number> {
    try {
      const res = await fetch(`${lfsUrl}/api/lfs/journal/count`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.count || 0;
      }
    } catch { /* ignore */ }
    return 0;
  }

  private setState(newState: ConnectionState): void {
    if (newState === this.state) return;
    const prev = this.state;
    this.state = newState;
    this.notifyListeners(newState, prev);
  }

  private notifyListeners(state: ConnectionState, prev: ConnectionState): void {
    this.listeners.forEach((fn) => {
      try { fn(state, prev); } catch { /* listener error */ }
    });
  }
}

export const connectionManager = new ConnectionManager();

connectionManager.start();

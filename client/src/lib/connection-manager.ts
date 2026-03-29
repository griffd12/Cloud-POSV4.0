type ConnectionState = "cloud-online" | "cloud-degraded" | "cloud-offline" | "reconnecting";
type StateListener = (state: ConnectionState, prevState: ConnectionState) => void;

const HEALTH_CHECK_INTERVAL = 5000;
const FAILURE_THRESHOLD = 3;
const RECONNECT_SYNC_TIMEOUT = 30000;

const LFS_URL_KEY = "lfs_local_server_url";

const CLOUD_URL_KEY = "cloud_server_url";

class ConnectionManager {
  private state: ConnectionState = "cloud-online";
  private consecutiveFailures = 0;
  private listeners = new Set<StateListener>();
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private pendingSyncCount = 0;
  private syncProgress: { phase: string; current: number; total: number } | null = null;
  private syncInProgress = false;
  private lastSyncAttempt = 0;

  get currentState(): ConnectionState {
    return this.state;
  }

  private syncRequired = false;

  get isOffline(): boolean {
    if (this.state === "cloud-offline" || this.state === "reconnecting") return true;
    if (this.state === "cloud-degraded" && this.syncRequired && this.localServerUrl) return true;
    return false;
  }

  get cloudServerUrl(): string {
    return localStorage.getItem(CLOUD_URL_KEY) || window.location.origin;
  }

  set cloudServerUrl(url: string) {
    localStorage.setItem(CLOUD_URL_KEY, url);
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
    return this.cloudServerUrl;
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

  initFromWorkstation(workstation: { serviceHostUrl?: string | null; id?: string }): void {
    if (workstation.serviceHostUrl) {
      this.localServerUrl = workstation.serviceHostUrl;
    }
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.healthInterval) return;
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
      const cloudUrl = this.cloudServerUrl;
      const res = await fetch(`${cloudUrl}/api/health`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        this.consecutiveFailures = 0;
        if (this.state === "cloud-offline" && !this.syncInProgress) {
          this.setState("reconnecting");
          this.runReconnectionSync();
        } else if (this.state === "cloud-degraded" && this.syncRequired && !this.syncInProgress) {
          const elapsed = Date.now() - this.lastSyncAttempt;
          if (elapsed >= 30000) {
            this.setState("reconnecting");
            this.runReconnectionSync();
          }
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
        this.syncRequired = true;
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
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    this.lastSyncAttempt = Date.now();

    const lfsUrl = this.localServerUrl;
    if (!lfsUrl) {
      this.pendingSyncCount = 0;
      this.syncInProgress = false;
      this.setState("cloud-online");
      return;
    }

    this.syncProgress = { phase: "Syncing configuration...", current: 0, total: 2 };
    this.notifyListeners(this.state, this.state);

    try {
      let configDownOk = false;
      try {
        const configRes = await fetch(`${lfsUrl}/api/lfs/sync/config-down`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(RECONNECT_SYNC_TIMEOUT),
        });
        if (configRes.ok) {
          const configData = await configRes.json();
          configDownOk = configData.ok === true;
          if (!configDownOk) {
            console.warn("[ConnectionManager] Config-down returned ok=false:", configData.message);
          }
        } else {
          console.warn("[ConnectionManager] Config-down sync returned non-OK:", configRes.status);
        }
      } catch (e: unknown) {
        console.warn("[ConnectionManager] Config-down sync failed:", e instanceof Error ? e.message : e);
      }

      if (!configDownOk) {
        this.syncProgress = null;
        console.warn("[ConnectionManager] Config-down failed — aborting transaction-up, staying degraded");
        this.setState("cloud-degraded");
        return;
      }

      const countBefore = await this.fetchPendingCount(lfsUrl);
      const totalEntries = countBefore > 0 ? countBefore : 0;
      this.syncProgress = {
        phase: `Uploading transactions to cloud${totalEntries > 0 ? ` (0 of ${totalEntries})` : ""}...`,
        current: 0,
        total: totalEntries,
      };
      this.notifyListeners(this.state, this.state);

      try {
        const pushRes = await fetch(`${lfsUrl}/api/lfs/sync/push-to-cloud`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(RECONNECT_SYNC_TIMEOUT),
        });

        if (pushRes.ok) {
          const pushData = await pushRes.json();
          const syncedCount = pushData.synced || 0;
          this.syncProgress = {
            phase: `Uploaded ${syncedCount} of ${totalEntries} transactions`,
            current: syncedCount,
            total: totalEntries,
          };
          this.notifyListeners(this.state, this.state);

          if (pushData.remaining > 0) {
            this.pendingSyncCount = pushData.remaining;
            this.syncProgress = null;
            console.warn(`[ConnectionManager] Push incomplete: ${pushData.remaining} remaining`);
            this.setState("cloud-degraded");
            return;
          }
        } else {
          console.warn("[ConnectionManager] Push-to-cloud returned non-OK:", pushRes.status);
          this.syncProgress = null;
          this.setState("cloud-degraded");
          return;
        }
      } catch (e: unknown) {
        console.warn("[ConnectionManager] Push-to-cloud failed:", e instanceof Error ? e.message : e);
        this.syncProgress = null;
        this.setState("cloud-degraded");
        return;
      }

      this.syncProgress = null;

      const remaining = await this.fetchPendingCount(lfsUrl);

      if (remaining < 0) {
        console.warn("[ConnectionManager] Could not confirm pending count — staying degraded");
        this.setState("cloud-degraded");
        return;
      }

      this.pendingSyncCount = remaining;

      if (remaining > 0) {
        console.warn(`[ConnectionManager] Sync incomplete: ${remaining} entries still pending — staying degraded`);
        this.setState("cloud-degraded");
        return;
      }

      let safPending = 0;
      let reconFailed = false;
      try {
        const reconRes = await fetch(`${lfsUrl}/api/lfs/reconcile-saf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(RECONNECT_SYNC_TIMEOUT),
        });
        if (reconRes.ok) {
          const reconData = await reconRes.json();
          if (reconData.ok === false) {
            console.warn("[ConnectionManager] SAF reconciliation returned ok=false:", reconData.error);
            reconFailed = true;
          } else {
            if (reconData.settled > 0 || reconData.failed > 0) {
              console.log(`[ConnectionManager] SAF reconciliation: ${reconData.settled} settled, ${reconData.failed} failed of ${reconData.total}`);
            }
            const stillPending = (reconData.results || []).filter((r: { status: string }) => r.status === "pending_settlement").length;
            const failed = (reconData.results || []).filter((r: { status: string }) => r.status === "settlement_failed").length;
            safPending = stillPending + failed;
          }
        } else {
          console.warn("[ConnectionManager] SAF reconciliation returned non-OK:", reconRes.status);
          reconFailed = true;
        }
      } catch (e: unknown) {
        console.warn("[ConnectionManager] SAF reconciliation failed:", e instanceof Error ? e.message : e);
        reconFailed = true;
      }

      this.syncRequired = false;
      if (reconFailed || safPending > 0) {
        const reason = reconFailed ? "reconciliation failed" : `${safPending} SAF payments unresolved`;
        console.warn(`[ConnectionManager] ${reason} — staying degraded`);
        this.setState("cloud-degraded");
      } else {
        this.setState("cloud-online");
      }
    } catch (e: unknown) {
      console.error("[ConnectionManager] Reconnection sync error:", e instanceof Error ? e.message : e);
      this.syncProgress = null;
      this.setState("cloud-degraded");
    } finally {
      this.syncInProgress = false;
    }
  }

  private async fetchPendingCount(lfsUrl: string): Promise<number> {
    try {
      const res = await fetch(`${lfsUrl}/api/lfs/journal/count`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        return typeof data.count === "number" ? data.count : -1;
      }
    } catch { /* network error */ }
    return -1;
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

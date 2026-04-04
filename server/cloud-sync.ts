import { isLocalMode } from "./db";
import {
  getPendingJournalEntries,
  markJournalEntrySynced,
  markJournalEntryFailed,
  markJournalEntryDeadLetter,
  getPendingJournalCount,
} from "./transaction-journal";
import { log } from "./index";

const SYNC_INTERVAL_MS = 30000;
const BATCH_SIZE = 50;

const ENTITY_SYNC_ORDER: Record<string, number> = {
  check: 0,
  round: 1,
  check_item: 2,
  kds_ticket: 3,
  kds_ticket_item: 4,
  kds_item: 5,
  check_payment: 6,
  check_discount: 7,
  check_service_charge: 8,
  check_lock: 9,
  refund: 10,
  payment_transaction: 11,
  item_availability: 12,
  time_punch: 15,
  cash_transaction: 16,
  inventory_transaction: 17,
};

let syncIntervalHandle: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let lastSyncAt: string | null = null;
let lastSyncError: string | null = null;
let syncCount = 0;

export function getCloudSyncStatus() {
  return {
    isSyncing,
    lastSyncAt,
    lastSyncError,
    syncCount,
  };
}

async function syncBatchToCloud(): Promise<{ synced: number; failed: number }> {
  const cloudUrl = process.env.LFS_CLOUD_URL;
  const apiKey = process.env.LFS_API_KEY;

  if (!cloudUrl) {
    return { synced: 0, failed: 0 };
  }

  const entries = await getPendingJournalEntries(BATCH_SIZE);
  if (entries.length === 0) {
    return { synced: 0, failed: 0 };
  }

  const MAX_RETRIES = 10;
  const exhaustedEntries = entries.filter((e) => (e.retryCount || 0) >= MAX_RETRIES);
  const retryableEntries = entries.filter((e) => (e.retryCount || 0) < MAX_RETRIES);

  for (const dead of exhaustedEntries) {
    await markJournalEntryDeadLetter(dead.id, `Exceeded ${MAX_RETRIES} retries. Last error: ${dead.syncError || "unknown"}`);
    log(`Dead-lettered entry ${dead.eventId} (${dead.entityType}/${dead.operationType}) after ${dead.retryCount} retries: ${dead.syncError || "unknown"}`, "cloud-sync");
  }

  if (retryableEntries.length === 0) {
    if (exhaustedEntries.length > 0) {
      log(`Dead-lettered ${exhaustedEntries.length} entries, no retryable entries in batch`, "cloud-sync");
    }
    return { synced: 0, failed: 0 };
  }

  const sorted = [...retryableEntries].sort((a, b) => {
    const aOp = a.operationType || "create";
    const bOp = b.operationType || "create";
    const isADelete = aOp === "delete";
    const isBDelete = bOp === "delete";
    if (isADelete && !isBDelete) return 1;
    if (!isADelete && isBDelete) return -1;
    if (isADelete && isBDelete) {
      const aEnt = ENTITY_SYNC_ORDER[a.entityType] ?? 99;
      const bEnt = ENTITY_SYNC_ORDER[b.entityType] ?? 99;
      if (aEnt !== bEnt) return bEnt - aEnt;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    }
    const aEnt = ENTITY_SYNC_ORDER[a.entityType] ?? 99;
    const bEnt = ENTITY_SYNC_ORDER[b.entityType] ?? 99;
    if (aEnt !== bEnt) return aEnt - bEnt;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  let synced = 0;
  let failed = 0;

  for (const entry of sorted) {
    try {
      const res = await fetch(`${cloudUrl}/api/lfs/sync/transaction-up`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-LFS-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({
          id: entry.eventId,
          operation_type: entry.operationType,
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          http_method: entry.httpMethod,
          endpoint: entry.endpoint,
          payload: entry.payload,
          offline_transaction_id: entry.offlineTransactionId,
          workstation_id: entry.workstationId,
          created_at: entry.createdAt,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.result?.skipped && body?.result?.reason === "empty update payload") {
          log(`Skipped empty update: ${entry.entityType}/${entry.operationType} (event ${entry.eventId})`, "cloud-sync");
        }
        await markJournalEntrySynced(entry.id);
        synced++;
      } else {
        const errText = await res.text().catch(() => "Unknown error");
        const isFkViolation = errText.includes("violates foreign key") || errText.includes("23503");
        const isEmptyUpdate = errText.includes("empty SET") || errText.includes("syntax error");
        if (isFkViolation || isEmptyUpdate) {
          log(`Retryable error for ${entry.entityType}/${entry.operationType} (event ${entry.eventId}): ${errText.slice(0, 120)}`, "cloud-sync");
        }
        await markJournalEntryFailed(entry.id, `HTTP ${res.status}: ${errText}`);
        failed++;
      }
    } catch (e: any) {
      await markJournalEntryFailed(entry.id, e.message || "Network error");
      failed++;
    }
  }

  return { synced, failed };
}

async function runSyncCycle(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const pendingCount = await getPendingJournalCount();
    if (pendingCount === 0) {
      lastSyncAt = new Date().toISOString();
      lastSyncError = null;
      return;
    }

    const result = await syncBatchToCloud();
    syncCount++;
    lastSyncAt = new Date().toISOString();

    if (result.failed > 0) {
      lastSyncError = `${result.failed} entries failed to sync`;
    } else {
      lastSyncError = null;
    }

    if (result.synced > 0) {
      log(`Cloud sync: ${result.synced} synced, ${result.failed} failed`, "cloud-sync");
    }
  } catch (e: any) {
    lastSyncError = e.message;
    log(`Cloud sync error: ${e.message}`, "cloud-sync");
  } finally {
    isSyncing = false;
  }
}

export function startCloudSyncProcess(): void {
  if (!isLocalMode) return;
  if (syncIntervalHandle) return;

  const cloudUrl = process.env.LFS_CLOUD_URL;
  if (!cloudUrl) {
    log("Cloud sync not started: LFS_CLOUD_URL not configured", "cloud-sync");
    return;
  }

  log(`Cloud sync process starting (interval: ${SYNC_INTERVAL_MS}ms)`, "cloud-sync");

  runSyncCycle().catch((e) => {
    log(`Initial cloud sync cycle failed: ${e.message}`, "cloud-sync");
  });

  syncIntervalHandle = setInterval(() => {
    runSyncCycle().catch((e) => {
      log(`Cloud sync cycle failed: ${e.message}`, "cloud-sync");
    });
  }, SYNC_INTERVAL_MS);
}

export function stopCloudSyncProcess(): void {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }
}

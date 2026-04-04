import { db } from "./db";
import { transactionJournal } from "@shared/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import crypto from "crypto";
import { log } from "./index";


export interface JournalWriteParams {
  operationType: string;
  entityType: string;
  entityId: string;
  httpMethod: string;
  endpoint: string;
  payload?: Record<string, unknown>;
  offlineTransactionId?: string;
  idempotencyKey?: string;
  workstationId?: string;
  propertyId?: string;
}

function generateEventId(params: JournalWriteParams): string {
  if (params.idempotencyKey) {
    return crypto.createHash("sha256").update(params.idempotencyKey).digest("hex").slice(0, 36);
  }
  return crypto.randomUUID();
}

export async function recordJournalEntry(params: JournalWriteParams): Promise<string> {
  const eventId = params.offlineTransactionId || generateEventId(params);

  try {
    await db.insert(transactionJournal).values({
      eventId,
      operationType: params.operationType,
      entityType: params.entityType,
      entityId: params.entityId,
      httpMethod: params.httpMethod,
      endpoint: params.endpoint,
      payload: params.payload || {},
      offlineTransactionId: params.offlineTransactionId || null,
      workstationId: params.workstationId || null,
      propertyId: params.propertyId || null,
      synced: false,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    if (err.message?.includes("duplicate key") || err.code === "23505") {
      log(`Journal entry already exists for event ${eventId}, skipping`, "journal");
      return eventId;
    }
    throw e;
  }

  return eventId;
}

export type JournalWriteResult<T> =
  | { eventId: string; result: T; replayed: false }
  | { eventId: string; result: null; replayed: true };

export async function atomicJournalWrite<T>(
  params: JournalWriteParams,
  businessWrite: ((parentEventId: string) => Promise<T>) | (() => Promise<T>)
): Promise<JournalWriteResult<T>> {
  const eventId = params.offlineTransactionId || generateEventId(params);

  const existingEntry = await db
    .select({ eventId: transactionJournal.eventId })
    .from(transactionJournal)
    .where(eq(transactionJournal.eventId, eventId))
    .limit(1);

  if (existingEntry.length > 0) {
    log(`Journal entry already exists for event ${eventId}, idempotent replay — skipping business write`, "journal");
    return { eventId, result: null, replayed: true };
  }

  try {
    await db.insert(transactionJournal).values({
      eventId,
      operationType: params.operationType,
      entityType: params.entityType,
      entityId: params.entityId,
      httpMethod: params.httpMethod,
      endpoint: params.endpoint,
      payload: params.payload || {},
      offlineTransactionId: params.offlineTransactionId || null,
      workstationId: params.workstationId || null,
      propertyId: params.propertyId || null,
      synced: false,
      journalStatus: "pending",
    });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    if (err.message?.includes("duplicate key") || err.code === "23505") {
      log(`Journal entry race for event ${eventId}, idempotent replay — skipping business write`, "journal");
      return { eventId, result: null, replayed: true };
    }
    throw e;
  }

  try {
    const result = await (businessWrite as (parentEventId: string) => Promise<T>)(eventId);
    await db.update(transactionJournal)
      .set({ journalStatus: "completed" })
      .where(eq(transactionJournal.eventId, eventId));
    return { eventId, result, replayed: false };
  } catch (bizError) {
    await db.update(transactionJournal)
      .set({ journalStatus: "failed" })
      .where(eq(transactionJournal.eventId, eventId));
    log(`Business write failed for event ${eventId}, journal marked failed`, "journal");
    throw bizError;
  }
}

export async function recordCompoundJournalEntry(
  parentEventId: string,
  operationType: string,
  entityType: string,
  entityId: string,
  httpMethod: string,
  endpoint: string,
  payload?: Record<string, unknown>
): Promise<string> {
  const childEventId = `${parentEventId}:${entityType}:${entityId}`;
  try {
    await db.insert(transactionJournal).values({
      eventId: childEventId,
      operationType,
      entityType,
      entityId,
      httpMethod,
      endpoint,
      payload: { ...payload, parentEventId },
      offlineTransactionId: null,
      workstationId: null,
      propertyId: null,
      synced: false,
      journalStatus: "completed",
    });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    if (err.message?.includes("duplicate key") || err.code === "23505") {
      return childEventId;
    }
    throw e;
  }
  return childEventId;
}

export async function getPendingJournalEntries(limit = 100) {
  return db
    .select()
    .from(transactionJournal)
    .where(and(eq(transactionJournal.synced, false), eq(transactionJournal.journalStatus, "completed")))
    .orderBy(asc(transactionJournal.createdAt))
    .limit(limit);
}

export async function getPendingJournalCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionJournal)
    .where(and(eq(transactionJournal.synced, false), eq(transactionJournal.journalStatus, "completed")));
  return Number(result[0]?.count || 0);
}

export async function markJournalEntrySynced(id: string): Promise<void> {
  await db
    .update(transactionJournal)
    .set({ synced: true, syncedAt: new Date(), syncError: null })
    .where(eq(transactionJournal.id, id));
}

export async function markJournalEntryFailed(id: string, error: string): Promise<void> {
  await db
    .update(transactionJournal)
    .set({
      syncError: error,
      retryCount: sql`${transactionJournal.retryCount} + 1`,
    })
    .where(eq(transactionJournal.id, id));
}

export async function markJournalEntryDeadLetter(id: string, error: string): Promise<void> {
  await db
    .update(transactionJournal)
    .set({
      journalStatus: "dead_letter",
      syncError: error,
    })
    .where(eq(transactionJournal.id, id));
}

export async function voidJournalEntry(eventId: string): Promise<void> {
  await db
    .update(transactionJournal)
    .set({ synced: true, syncError: "voided: business write failed locally" })
    .where(eq(transactionJournal.eventId, eventId));
}

export async function requeueDeadLetters(): Promise<number> {
  const count = await getDeadLetterCount();
  if (count === 0) return 0;

  await db
    .update(transactionJournal)
    .set({
      journalStatus: "completed",
      synced: false,
      retryCount: 0,
      syncError: null,
    })
    .where(eq(transactionJournal.journalStatus, "dead_letter"));

  return count;
}

export async function getDeadLetterCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionJournal)
    .where(eq(transactionJournal.journalStatus, "dead_letter"));
  return Number(result[0]?.count || 0);
}

export async function getJournalStats() {
  const pending = await getPendingJournalCount();
  const deadLetterCount = await getDeadLetterCount();
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionJournal);
  const synced = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionJournal)
    .where(eq(transactionJournal.synced, true));

  return {
    total: Number(total[0]?.count || 0),
    pending,
    synced: Number(synced[0]?.count || 0),
    deadLettered: deadLetterCount,
  };
}

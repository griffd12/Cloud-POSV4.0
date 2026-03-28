import { Database } from '../db/database.js';
import { calculateBusinessDate } from './business-date.js';
import { randomUUID } from 'crypto';

function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export class FiscalScheduler {
  private db: Database;
  private timer: ReturnType<typeof setInterval> | null = null;
  private broadcastFn: ((event: string, data: any) => void) | null = null;

  constructor(db: Database, broadcastFn?: (event: string, data: any) => void) {
    this.db = db;
    this.broadcastFn = broadcastFn || null;
  }

  start(): void {
    if (this.timer) return;
    console.log('[FiscalScheduler] Started – checking every 60s');
    this.tick();
    this.timer = setInterval(() => this.tick(), 60_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[FiscalScheduler] Stopped');
    }
  }

  private tick(): void {
    try {
      const property = this.db.get<{
        id: string;
        current_business_date: string | null;
        timezone: string | null;
        business_date_rollover_time: string | null;
      }>('SELECT id, current_business_date, timezone, business_date_rollover_time FROM properties WHERE active = 1 LIMIT 1');

      if (!property) return;

      const currentStored = property.current_business_date;
      const computed = calculateBusinessDate(property.timezone, property.business_date_rollover_time);

      if (!currentStored) {
        this.db.run('UPDATE properties SET current_business_date = ? WHERE id = ?', [computed, property.id]);
        return;
      }

      if (currentStored < computed) {
        console.log(`[FiscalScheduler] Rolling business date from ${currentStored} to ${computed}`);
        let cursor = currentStored;
        while (cursor < computed) {
          const nextDate = shiftDateStr(cursor, 1);
          this.rollover(property.id, cursor, nextDate <= computed ? nextDate : computed);
          cursor = nextDate;
        }
      }
    } catch (e) {
      console.error('[FiscalScheduler] tick error:', (e as Error).message);
    }
  }

  private rollover(propertyId: string, oldDate: string, newDate: string): void {
    try {
      const existing = this.db.get<{ id: string }>(
        `SELECT id FROM fiscal_periods WHERE property_id = ? AND business_date = ? AND period_type = 'daily'`,
        [propertyId, oldDate]
      );
      if (existing) {
        this.db.run(
          `UPDATE fiscal_periods SET status = 'closed', end_time = datetime('now'), closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [existing.id]
        );
      } else {
        this.db.run(
          `INSERT INTO fiscal_periods (id, property_id, period_type, business_date, start_time, end_time, status, closed_at)
           VALUES (?, ?, 'daily', ?, datetime('now'), datetime('now'), 'closed', datetime('now'))`,
          [randomUUID(), propertyId, oldDate]
        );
      }
    } catch (e) {
      console.error(`[FiscalScheduler] Failed to close fiscal period for ${oldDate}:`, (e as Error).message);
    }

    this.db.run('UPDATE properties SET current_business_date = ? WHERE id = ?', [newDate, propertyId]);

    try {
      this.db.run(
        `INSERT OR IGNORE INTO fiscal_periods (id, property_id, period_type, business_date, start_time, status)
         VALUES (?, ?, 'daily', ?, datetime('now'), 'open')`,
        [randomUUID(), propertyId, newDate]
      );
    } catch (e) {
      console.error(`[FiscalScheduler] Failed to open fiscal period for ${newDate}:`, (e as Error).message);
    }

    try {
      const hasTable = this.db.get<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='time_entries'`
      );
      if (hasTable) {
        const openClocks = this.db.all<{ id: string; employee_id: string }>(
          `SELECT id, employee_id FROM time_entries WHERE clock_out IS NULL AND business_date = ?`,
          [oldDate]
        );
        for (const entry of openClocks) {
          this.db.run(
            `UPDATE time_entries SET clock_out = datetime('now') WHERE id = ?`,
            [entry.id]
          );
          console.log(`[FiscalScheduler] Auto clock-out employee ${entry.employee_id}`);
        }
      }
    } catch (e) {
      console.error(`[FiscalScheduler] Auto clock-out error for ${oldDate}:`, (e as Error).message);
    }

    if (this.broadcastFn) {
      this.broadcastFn('BUSINESS_DATE_ROLLOVER', {
        previousDate: oldDate,
        newDate,
        propertyId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

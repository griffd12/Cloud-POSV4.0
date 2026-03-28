import { Database } from '../db/database.js';

function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function calculateBusinessDate(timezone?: string | null, rolloverTime?: string | null, now?: Date): string {
  const tz = timezone || 'America/New_York';
  const rolloverParts = (rolloverTime || '04:00').split(':');
  const rolloverHour = parseInt(rolloverParts[0], 10);
  const rolloverMinute = parseInt(rolloverParts[1] || '0', 10);
  const rolloverMinutes = rolloverHour * 60 + rolloverMinute;

  const d = now || new Date();
  const localDateStr = d.toLocaleDateString('en-CA', { timeZone: tz });
  const localHour = parseInt(d.toLocaleTimeString('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }), 10);
  const localMin = parseInt(d.toLocaleTimeString('en-US', { timeZone: tz, hour12: false, minute: '2-digit' }), 10);
  const localTotalMinutes = localHour * 60 + localMin;

  if (rolloverHour >= 12) {
    if (localTotalMinutes >= rolloverMinutes) {
      return shiftDateStr(localDateStr, 1);
    }
    return localDateStr;
  }

  if (localTotalMinutes < rolloverMinutes) {
    return shiftDateStr(localDateStr, -1);
  }

  return localDateStr;
}

export function getBusinessDateFromDb(db: Database): string {
  const property = db.get<{ current_business_date: string | null; timezone: string | null; business_date_rollover_time: string | null }>(
    'SELECT current_business_date, timezone, business_date_rollover_time FROM properties WHERE active = 1 LIMIT 1'
  );
  if (property?.current_business_date) {
    return property.current_business_date;
  }
  return calculateBusinessDate(property?.timezone, property?.business_date_rollover_time);
}

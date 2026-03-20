import { Database } from './db/database.js';

const NOISE_ROUTES: RegExp[] = [
  /\/system-status\/workstation\/heartbeat/,
  /\/registered-devices\/heartbeat/,
  /\/sync-notifications/,
  /\/item-availability/,
  /\/caps\/gateway-log/,
  /\/caps\/diagnostic/,
  /\/pos\/system-status$/,
];

const SENSITIVE_PATTERNS = [
  /^pin$/i, /pin_?hash/i, /manager_?pin/i, /pos_?pin/i,
  /password/i, /secret/i,
  /^token$/i, /access_?token/i, /refresh_?token/i, /api_?key/i, /auth/i,
  /card_?number/i, /^cvv$/i, /expiry/i, /card_?last4/i, /card_?brand/i,
  /session_?id/i, /session_?token/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some(rx => rx.test(key));
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function maskUuids(s: string): string {
  return s.replace(UUID_RE, '***');
}

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const out: any = Array.isArray(body) ? [...body] : { ...body };
  for (const key of Object.keys(out)) {
    if (isSensitiveKey(key)) {
      out[key] = '[REDACTED]';
    } else if (typeof out[key] === 'object' && out[key] !== null) {
      out[key] = sanitizeBody(out[key]);
    }
  }
  return out;
}

function fmtDollars(amount: number | string | undefined | null): string {
  if (amount == null) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return '$0.00';
  return '$' + Math.abs(num).toFixed(2);
}

function resolveName(db: Database | undefined, type: string, id: string | undefined | null): string | null {
  if (!db || !id) return null;
  try {
    switch (type) {
      case 'employee': {
        const emp = db.getEmployee(id);
        if (emp) {
          const first = emp.first_name || emp.firstName || '';
          const last = emp.last_name || emp.lastName || '';
          return `${first} ${last.charAt(0)}.`.trim();
        }
        return null;
      }
      case 'tender': {
        const t = db.getTender(id);
        return t?.name || null;
      }
      case 'menuItem': {
        const mi = db.getMenuItem(id);
        return mi?.name || null;
      }
      case 'check': {
        const row = db.get<{ check_number: number; status: string }>('SELECT check_number, status FROM checks WHERE id = ?', [id]);
        return row ? `#${row.check_number}` : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function orderTypeLabel(ot: string | undefined): string {
  if (!ot) return '';
  const map: Record<string, string> = {
    dine_in: 'Dine In',
    take_out: 'Take Out',
    takeout: 'Take Out',
    delivery: 'Delivery',
    drive_through: 'Drive Through',
    bar: 'Bar',
    pickup: 'Pickup',
  };
  return map[ot] || ot.replace(/_/g, ' ');
}

function formatModifiers(mods: any[]): string {
  if (!mods || mods.length === 0) return '';
  const names = mods
    .map((m: any) => {
      const name = m.name || m.modifierName || '';
      const price = m.price || m.unitPrice || 0;
      if (price > 0) return `${name} +${fmtDollars(price)}`;
      if (price === 0) return `${name} (no charge)`;
      return name;
    })
    .filter(Boolean);
  if (names.length === 0) return '';
  return ' + ' + names.join(', ');
}

export interface HumanLogEntry {
  timestamp: string;
  line: string;
  isError: boolean;
}

export function isNoiseRoute(url: string, method: string): boolean {
  if (method === 'OPTIONS') return true;
  const pathOnly = url.split('?')[0];
  for (const rx of NOISE_ROUTES) {
    if (rx.test(pathOnly)) return true;
  }
  return false;
}

export function translateToHuman(
  method: string,
  url: string,
  status: number,
  durationMs: number,
  deviceName: string,
  reqBody: any,
  resBody: any,
  db?: Database,
): HumanLogEntry {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  const device = deviceName || 'unknown';
  const isError = status >= 400;
  const body = reqBody ? sanitizeBody(reqBody) : null;
  const resp = resBody ? sanitizeBody(resBody) : null;

  let desc = translateRoute(method, url, body, resp, db);

  if (isError) {
    const errMsg = resp?.error || resp?.message || `HTTP ${status}`;
    desc += ` | ERROR: ${errMsg}`;
  }

  if (durationMs > 1000) {
    desc += ` (${durationMs}ms)`;
  }

  const line = `${ts} | WS: ${device} | ${desc}`;

  return { timestamp: new Date().toISOString(), line, isError };
}

function translateRoute(method: string, url: string, body: any, resp: any, db?: Database): string {
  const path = url.split('?')[0].replace(/^\/api\//, '');
  const m = method.toUpperCase();

  if (m === 'POST' && path.match(/^caps\/checks$/)) {
    const checkNum = resp?.checkNumber || resp?.check_number || '?';
    const empName = resolveName(db, 'employee', body?.employeeId) || body?.employeeId || '?';
    const ot = orderTypeLabel(body?.orderType);
    return `Check #${checkNum} opened (${ot}) by ${empName}`;
  }

  if (m === 'GET' && path.match(/^caps\/checks$/)) {
    return 'Listed open checks';
  }

  if (m === 'GET' && path.match(/^caps\/checks\/orders$/)) {
    return 'Listed check orders';
  }

  const checkItemsMatch = path.match(/^caps\/checks\/([^/]+)\/items$/);
  if (m === 'POST' && checkItemsMatch) {
    const checkLabel = resolveName(db, 'check', checkItemsMatch[1]) || `?`;
    const items = body?.items || (Array.isArray(body) ? body : [body]);
    const itemDescs = items.map((it: any) => {
      const name = it?.name || resolveName(db, 'menuItem', it?.menuItemId) || it?.menuItemId || '?';
      const price = it?.priceOverride != null ? fmtDollars(it.priceOverride) : (it?.unitPrice != null ? fmtDollars(it.unitPrice) : '');
      const mods = formatModifiers(it?.modifiers);
      return `${name}${price ? ' ' + price : ''}${mods}`;
    });
    return `Check ${checkLabel} | ${itemDescs.join(', ')} added`;
  }

  const sendMatch = path.match(/^caps\/checks\/([^/]+)\/send$/);
  if (m === 'POST' && sendMatch) {
    const checkLabel = resolveName(db, 'check', sendMatch[1]) || '?';
    const sent = resp?.itemsSent || resp?.items_sent || '?';
    return `Check ${checkLabel} | Round sent (${sent} items to kitchen)`;
  }

  const payMatch = path.match(/^caps\/checks\/([^/]+)\/(pay|payments)$/);
  if (m === 'POST' && payMatch) {
    const checkLabel = resolveName(db, 'check', payMatch[1]) || '?';
    const tenderName = resp?.tenderName || resolveName(db, 'tender', body?.tenderId) || body?.tenderType || '?';
    const amt = body?.amount != null ? fmtDollars(body.amount) : '?';
    const changeVal = resp?.changeDue || resp?.changeAmount;
    const changeParsed = changeVal ? (typeof changeVal === 'string' ? parseFloat(changeVal) : changeVal) : 0;
    const change = ` | Change: ${fmtDollars(changeParsed)}`;
    const checkStatus = resp?.status;
    const closed = checkStatus === 'closed' ? ' | CHECK CLOSED' : '';
    const total = resp?.total != null && checkStatus === 'closed' ? ` | Total: ${fmtDollars(resp.total)}` : '';
    return `Check ${checkLabel} | ${tenderName} ${amt} tendered${change}${closed}${total}`;
  }

  const closeMatch = path.match(/^caps\/checks\/([^/]+)\/close$/);
  if (m === 'POST' && closeMatch) {
    const checkLabel = resolveName(db, 'check', closeMatch[1]) || '?';
    const total = resp?.total != null ? fmtDollars(resp.total) : '';
    return `Check ${checkLabel} | CLOSED${total ? ' | Total: ' + total : ''}`;
  }

  const voidCheckMatch = path.match(/^caps\/checks\/([^/]+)\/void$/);
  if (m === 'POST' && voidCheckMatch) {
    const checkLabel = resolveName(db, 'check', voidCheckMatch[1]) || '?';
    return `Check ${checkLabel} | VOIDED`;
  }

  const voidItemMatch = path.match(/^caps\/checks\/([^/]+)\/items\/([^/]+)\/void$/);
  if (m === 'POST' && voidItemMatch) {
    const checkLabel = resolveName(db, 'check', voidItemMatch[1]) || '?';
    const reason = body?.reason ? ` (${body.reason})` : '';
    return `Check ${checkLabel} | Item voided${reason}`;
  }

  const lockMatch = path.match(/^caps\/checks\/([^/]+)\/lock$/);
  if (m === 'POST' && lockMatch) {
    const checkLabel = resolveName(db, 'check', lockMatch[1]) || '?';
    return `Check ${checkLabel} | Lock acquired`;
  }
  if (m === 'GET' && lockMatch) {
    const checkLabel = resolveName(db, 'check', lockMatch[1]) || '?';
    return `Check ${checkLabel} | Lock status queried`;
  }

  const unlockMatch = path.match(/^caps\/checks\/([^/]+)\/unlock$/);
  if (m === 'POST' && unlockMatch) {
    const checkLabel = resolveName(db, 'check', unlockMatch[1]) || '?';
    return `Check ${checkLabel} | Lock released`;
  }

  const checkIdMatch = path.match(/^caps\/checks\/([^/]+)$/);
  if (m === 'GET' && checkIdMatch) {
    const checkLabel = resolveName(db, 'check', checkIdMatch[1]) || '?';
    return `Check ${checkLabel} | Details viewed`;
  }

  const cancelMatch = path.match(/^caps\/checks\/([^/]+)\/cancel-transaction$/);
  if (m === 'POST' && cancelMatch) {
    const checkLabel = resolveName(db, 'check', cancelMatch[1]) || '?';
    return `Check ${checkLabel} | Transaction cancelled`;
  }

  const discountItemMatch = path.match(/^caps\/check-items\/([^/]+)\/discount$/);
  if (m === 'POST' && discountItemMatch) {
    const name = body?.name || '?';
    const amt = body?.amount != null ? fmtDollars(body.amount) : '';
    return `Item discount applied: ${name}${amt ? ' ' + amt : ''}`;
  }

  const modItemMatch = path.match(/^caps\/check-items\/([^/]+)\/modifiers$/);
  if ((m === 'PATCH' || m === 'PUT') && modItemMatch) {
    const modCount = Array.isArray(body?.modifiers) ? body.modifiers.length : (Array.isArray(body) ? body.length : 0);
    const modNames = Array.isArray(body?.modifiers)
      ? body.modifiers.map((mod: any) => mod.name || mod.modifierName).filter(Boolean).slice(0, 3).join(', ')
      : '';
    return `Item modifiers updated${modNames ? ': ' + modNames : ''}${modCount > 3 ? ` (+${modCount - 3} more)` : ''}`;
  }

  const voidItemDirect = path.match(/^caps\/check-items\/([^/]+)\/void$/);
  if (m === 'POST' && voidItemDirect) {
    const itemName = resolveName(db, 'menuItem', body?.menuItemId) || '';
    const reason = body?.reason ? ` (${body.reason})` : '';
    return `Item${itemName ? ' ' + itemName : ''} voided${reason}`;
  }

  if (path.match(/^print\/jobs$/) && m === 'POST') {
    return `Print job queued`;
  }

  if (path.match(/^kds\/tickets\/([^/]+)\/bump$/)) {
    return 'KDS ticket bumped';
  }
  if (path.match(/^kds\/tickets\/([^/]+)\/recall$/)) {
    return 'KDS ticket recalled';
  }
  if (path.match(/^kds\/tickets\/([^/]+)\/priority$/)) {
    return 'KDS ticket priority changed';
  }
  if (m === 'GET' && path.match(/^kds\/tickets/)) {
    return 'KDS tickets listed';
  }

  if (path.match(/^payment\/authorize$/)) {
    return 'Payment authorization requested';
  }
  if (path.match(/^payment\/([^/]+)\/capture$/)) {
    return 'Payment captured';
  }
  if (path.match(/^payment\/([^/]+)\/void$/)) {
    return 'Payment voided';
  }
  if (path.match(/^payment\/([^/]+)\/refund$/)) {
    return 'Payment refund requested';
  }

  if (m === 'GET' && path.startsWith('config/')) {
    const configType = path.replace('config/', '').split('/')[0];
    return `Config loaded: ${configType}`;
  }

  if (path.match(/^caps\/sync\/check-state$/)) {
    return 'Check state synced';
  }
  if (path.match(/^caps\/sync\/queue-operation$/)) {
    return 'Sync operation queued';
  }

  const timePunchClockIn = path.match(/^time-punches\/clock-in$/);
  if (m === 'POST' && timePunchClockIn) {
    const empName = resolveName(db, 'employee', body?.employeeId) || '?';
    return `Clock in: ${empName}`;
  }

  const timePunchClockOut = path.match(/^time-punches\/clock-out$/);
  if (m === 'POST' && timePunchClockOut) {
    const empName = resolveName(db, 'employee', body?.employeeId) || '?';
    return `Clock out: ${empName}`;
  }

  if (m === 'GET' && path.startsWith('reports/')) {
    const reportType = path.replace('reports/', '').split('/')[0];
    return `Report generated: ${reportType.replace(/-/g, ' ')}`;
  }

  if (path.match(/^pos\/gift-cards\//)) {
    const action = path.split('/').pop();
    return `Gift card: ${action}`;
  }

  if (path.match(/^loyalty\//)) {
    const rest = path.replace('loyalty/', '');
    return `Loyalty: ${rest.split('/')[0]}`;
  }

  if (path.match(/^pos\/process-card-payment$/)) {
    return 'Card payment processed';
  }

  if (path.match(/^pos\/capture-with-tip$/)) {
    return 'Payment captured with tip';
  }

  const refundsMatch = path.match(/^(caps\/)?refunds$/);
  if (m === 'POST' && refundsMatch) {
    return 'Refund created';
  }

  if (path.match(/^auth\//) || path.match(/^employees\/.*\/auth$/)) {
    return `Auth: ${m} ${path.split('/').pop()}`;
  }

  return `${m} ${maskUuids(path)}`;
}

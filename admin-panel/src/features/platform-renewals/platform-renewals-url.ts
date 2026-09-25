import type { PlatformRenewalListQuery, RenewalBillingInterval, RenewalStatus } from './platform-renewals.types';

export const PLATFORM_RENEWAL_DEFAULT_PAGE = 1;
export const PLATFORM_RENEWAL_DEFAULT_LIMIT = 20;
export const PLATFORM_RENEWAL_LIMITS = [10, 20, 50, 100] as const;
const OWNED = ['page', 'limit', 'companyId', 'subscriptionId', 'paymentId', 'status', 'billingInterval', 'from', 'to'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const statuses = new Set<RenewalStatus>(['PREPARED', 'APPLIED', 'BLOCKED']);
const intervals = new Set<RenewalBillingInterval>(['MONTHLY', 'YEARLY', 'CUSTOM']);

export function parsePlatformRenewalsUrl(input: URLSearchParams) {
  const page = positive(input.get('page')) ?? 1;
  const requested = positive(input.get('limit'));
  const limit = PLATFORM_RENEWAL_LIMITS.includes(requested as never) ? requested! : 20;
  const query: PlatformRenewalListQuery = { page, limit };
  for (const key of ['companyId', 'subscriptionId', 'paymentId'] as const) { const value = input.get(key); if (value && UUID.test(value)) query[key] = value; }
  const status = input.get('status') as RenewalStatus; if (statuses.has(status)) query.status = status;
  const interval = input.get('billingInterval') as RenewalBillingInterval; if (intervals.has(interval)) query.billingInterval = interval;
  const from = instant(input.get('from')), to = instant(input.get('to')); if (from && to && Date.parse(from) < Date.parse(to)) Object.assign(query, { from, to });
  const normalized = serializePlatformRenewalsUrl(query, input);
  return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}
export function serializePlatformRenewalsUrl(query: PlatformRenewalListQuery, current = new URLSearchParams()) {
  const params = new URLSearchParams(current); for (const key of OWNED) params.delete(key);
  params.set('page', String(query.page)); params.set('limit', String(query.limit));
  for (const key of ['companyId', 'subscriptionId', 'paymentId', 'status', 'billingInterval', 'from', 'to'] as const) if (query[key]) params.set(key, String(query[key]));
  return params;
}
export function localDateTimeToRenewalIso(value: string) { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value); if (!m) return null; const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number), ms = Number((m[7] ?? '0').padEnd(3, '0')), date = new Date(y, mo - 1, d, h, mi, s, ms); return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()].some((v, i) => v !== [y, mo, d, h, mi, s, ms][i]) ? null : date.toISOString(); }
export function renewalIsoToLocal(value: string) { const iso = instant(value); if (!iso) return ''; const d = new Date(iso), p = (v: number, n = 2) => String(v).padStart(n, '0'); return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`; }
export function validRenewalDateRange(from: string, to: string) { if (!from && !to) return true; const a = localDateTimeToRenewalIso(from), b = localDateTimeToRenewalIso(to); return Boolean(a && b && Date.parse(a) < Date.parse(b)); }
function positive(value: string | null) { if (!value || !/^\d+$/.test(value)) return null; const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; }
function instant(value: string | null) { if (!value || !ISO.test(value)) return null; const d = new Date(value); return Number.isFinite(d.getTime()) && d.toISOString() === value ? value : null; }

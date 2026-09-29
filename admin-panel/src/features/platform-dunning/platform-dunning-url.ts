import type { DunningPaymentStatus, PlatformDunningListQuery } from './platform-dunning.types';

export const PLATFORM_DUNNING_DEFAULT_PAGE = 1;
export const PLATFORM_DUNNING_DEFAULT_LIMIT = 20;
export const PLATFORM_DUNNING_LIMITS = [10, 20, 50, 100] as const;
const OWNED = ['page', 'limit', 'companyId', 'subscriptionId', 'renewalId', 'paymentId', 'paymentStatus', 'from', 'to'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const statuses = new Set<DunningPaymentStatus>(['PENDING', 'AUTHORIZED', 'FAILED']);

export function parsePlatformDunningUrl(input: URLSearchParams) {
  const page = positive(input.get('page')) ?? PLATFORM_DUNNING_DEFAULT_PAGE;
  const requestedLimit = positive(input.get('limit'));
  const limit = PLATFORM_DUNNING_LIMITS.includes(requestedLimit as never) ? requestedLimit! : PLATFORM_DUNNING_DEFAULT_LIMIT;
  const query: PlatformDunningListQuery = { page, limit };
  for (const key of ['companyId', 'subscriptionId', 'renewalId', 'paymentId'] as const) {
    const value = input.get(key);
    if (value && UUID.test(value)) query[key] = value;
  }
  const paymentStatus = input.get('paymentStatus') as DunningPaymentStatus;
  if (statuses.has(paymentStatus)) query.paymentStatus = paymentStatus as PlatformDunningListQuery['paymentStatus'];
  const from = instant(input.get('from'));
  const to = instant(input.get('to'));
  if (from && to && Date.parse(from) < Date.parse(to)) Object.assign(query, { from, to });
  const normalized = serializePlatformDunningUrl(query, input);
  return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}

export function serializePlatformDunningUrl(query: PlatformDunningListQuery, current = new URLSearchParams()) {
  const params = new URLSearchParams(current);
  for (const key of OWNED) params.delete(key);
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  for (const key of ['companyId', 'subscriptionId', 'renewalId', 'paymentId', 'paymentStatus', 'from', 'to'] as const) {
    if (query[key]) params.set(key, String(query[key]));
  }
  return params;
}

export function localDateTimeToDunningIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = Number(match[6] ?? '0');
  const millisecond = Number((match[7] ?? '0').padEnd(3, '0'));
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
  const actual = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()];
  return actual.some((part, index) => part !== [year, month, day, hour, minute, second, millisecond][index]) ? null : date.toISOString();
}

export function dunningIsoToLocal(value: string) {
  const iso = instant(value);
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (part: number, size = 2) => String(part).padStart(size, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function validDunningDateRange(from: string, to: string) {
  if (!from && !to) return true;
  const start = localDateTimeToDunningIso(from);
  const end = localDateTimeToDunningIso(to);
  return Boolean(start && end && Date.parse(start) < Date.parse(end));
}

function positive(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function instant(value: string | null) {
  if (!value || !ISO.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : null;
}

import type { PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus, PlatformPaymentListQuery } from './platform-payments.types';

export const PLATFORM_PAYMENT_DEFAULT_PAGE = 1;
export const PLATFORM_PAYMENT_DEFAULT_LIMIT = 20;
export const PLATFORM_PAYMENT_LIMITS = [10, 20, 50, 100] as const;
const statuses = new Set<PaymentStatus>(['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED']);
const providers = new Set<PaymentProviderType>(['RAZORPAY']);
const modes = new Set<PaymentProviderMode>(['TEST', 'LIVE']);
const purposes = new Set<PaymentPurpose>(['SUBSCRIPTION_ACTIVATION']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface ParsedPlatformPaymentUrl {
  query: PlatformPaymentListQuery;
  normalized: URLSearchParams;
  shouldNormalize: boolean;
}

export function parsePlatformPaymentsUrl(input: URLSearchParams): ParsedPlatformPaymentUrl {
  const page = positiveInteger(input.get('page')) ?? PLATFORM_PAYMENT_DEFAULT_PAGE;
  const requestedLimit = positiveInteger(input.get('limit'));
  const limit = PLATFORM_PAYMENT_LIMITS.includes(requestedLimit as typeof PLATFORM_PAYMENT_LIMITS[number])
    ? requestedLimit!
    : PLATFORM_PAYMENT_DEFAULT_LIMIT;
  const query: PlatformPaymentListQuery = { page, limit };
  assignUuid(query, 'companyId', input.get('companyId'));
  assignEnum(query, 'status', input.get('status'), statuses);
  assignEnum(query, 'provider', input.get('provider'), providers);
  assignEnum(query, 'mode', input.get('mode'), modes);
  assignEnum(query, 'purpose', input.get('purpose'), purposes);
  assignUuid(query, 'subscriptionId', input.get('subscriptionId'));
  const from = canonicalInstant(input.get('from'));
  const to = canonicalInstant(input.get('to'));
  if (from && to && Date.parse(from) < Date.parse(to)) Object.assign(query, { from, to });
  const normalized = serializePlatformPaymentsUrl(query);
  return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}

export function serializePlatformPaymentsUrl(query: PlatformPaymentListQuery) {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  for (const key of ['companyId', 'status', 'provider', 'mode', 'purpose', 'subscriptionId', 'from', 'to'] as const) {
    const value = query[key];
    if (value) params.set(key, String(value));
  }
  return params;
}

export function localDateTimeToCanonicalIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', millisecondText = '0'] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const millisecond = Number(millisecondText.padEnd(3, '0'));
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
  if ([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]
    .some((part, index) => part !== [year, month, day, hour, minute, second, millisecond][index])) return null;
  return date.toISOString();
}

export function canonicalIsoToLocalDateTime(value: string): string | null {
  const instant = canonicalInstant(value);
  if (!instant) return null;
  const date = new Date(instant);
  const part = (amount: number, size = 2) => String(amount).padStart(size, '0');
  return `${part(date.getFullYear(), 4)}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}.${part(date.getMilliseconds(), 3)}`;
}

export function isValidPlatformPaymentDateRange(from: string, to: string) {
  if (!from && !to) return true;
  const canonicalFrom = localDateTimeToCanonicalIso(from);
  const canonicalTo = localDateTimeToCanonicalIso(to);
  return canonicalFrom !== null && canonicalTo !== null && Date.parse(canonicalFrom) < Date.parse(canonicalTo);
}

function canonicalInstant(value: string | null) {
  if (!value || !canonicalIso.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : null;
}

function positiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function assignUuid(query: PlatformPaymentListQuery, key: 'companyId' | 'subscriptionId', value: string | null) {
  if (value && uuid.test(value)) query[key] = value;
}

function assignEnum<K extends 'status' | 'provider' | 'mode' | 'purpose'>(query: PlatformPaymentListQuery, key: K, value: string | null, allowed: Set<NonNullable<PlatformPaymentListQuery[K]>>) {
  if (value && allowed.has(value as NonNullable<PlatformPaymentListQuery[K]>)) query[key] = value as PlatformPaymentListQuery[K];
}

import type { PlatformInvoiceListQuery } from './platform-invoices.types';

export const PLATFORM_INVOICE_DEFAULT_PAGE = 1;
export const PLATFORM_INVOICE_DEFAULT_LIMIT = 20;
export const PLATFORM_INVOICE_LIMITS = [10, 20, 50, 100] as const;
const OWNED_KEYS = ['page', 'limit', 'companyId', 'subscriptionId', 'sourcePaymentId', 'invoiceNumber', 'from', 'to'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface ParsedPlatformInvoiceUrl {
  query: PlatformInvoiceListQuery;
  normalized: URLSearchParams;
  shouldNormalize: boolean;
}

export function parsePlatformInvoicesUrl(input: URLSearchParams): ParsedPlatformInvoiceUrl {
  const page = positiveInteger(input.get('page')) ?? PLATFORM_INVOICE_DEFAULT_PAGE;
  const requestedLimit = positiveInteger(input.get('limit'));
  const limit = PLATFORM_INVOICE_LIMITS.includes(requestedLimit as typeof PLATFORM_INVOICE_LIMITS[number]) ? requestedLimit! : PLATFORM_INVOICE_DEFAULT_LIMIT;
  const query: PlatformInvoiceListQuery = { page, limit };
  assignUuid(query, 'companyId', input.get('companyId'));
  assignUuid(query, 'subscriptionId', input.get('subscriptionId'));
  assignUuid(query, 'sourcePaymentId', input.get('sourcePaymentId'));
  const invoiceNumber = input.get('invoiceNumber')?.trim();
  if (invoiceNumber) query.invoiceNumber = invoiceNumber;
  const from = canonicalInstant(input.get('from'));
  const to = canonicalInstant(input.get('to'));
  if (from && to && Date.parse(from) < Date.parse(to)) Object.assign(query, { from, to });
  const normalized = serializePlatformInvoicesUrl(query, input);
  return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}

export function serializePlatformInvoicesUrl(query: PlatformInvoiceListQuery, current = new URLSearchParams()) {
  const params = new URLSearchParams(current);
  for (const key of OWNED_KEYS) params.delete(key);
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  for (const key of ['companyId', 'subscriptionId', 'sourcePaymentId', 'invoiceNumber', 'from', 'to'] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  return params;
}

export function platformInvoiceQueryForAppliedFilters(query: PlatformInvoiceListQuery) {
  return { ...query, page: PLATFORM_INVOICE_DEFAULT_PAGE };
}

export function localDateTimeToPlatformInvoiceIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', millisecondText = '0'] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const millisecond = Number(millisecondText.padEnd(3, '0'));
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
  const actual = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()];
  if (actual.some((part, index) => part !== [year, month, day, hour, minute, second, millisecond][index])) return null;
  return date.toISOString();
}

export function platformInvoiceIsoToLocalDateTime(value: string): string | null {
  const instant = canonicalInstant(value);
  if (!instant) return null;
  const date = new Date(instant);
  const part = (amount: number, size = 2) => String(amount).padStart(size, '0');
  return `${part(date.getFullYear(), 4)}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}.${part(date.getMilliseconds(), 3)}`;
}

export function isValidPlatformInvoiceDateRange(from: string, to: string) {
  if (!from && !to) return true;
  const canonicalFrom = localDateTimeToPlatformInvoiceIso(from);
  const canonicalTo = localDateTimeToPlatformInvoiceIso(to);
  return canonicalFrom !== null && canonicalTo !== null && Date.parse(canonicalFrom) < Date.parse(canonicalTo);
}

function canonicalInstant(value: string | null) {
  if (!value || !CANONICAL_ISO.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : null;
}

function positiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function assignUuid(query: PlatformInvoiceListQuery, key: 'companyId' | 'subscriptionId' | 'sourcePaymentId', value: string | null) {
  if (value && UUID.test(value)) query[key] = value;
}

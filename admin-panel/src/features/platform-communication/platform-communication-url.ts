import {
  EMAIL_DELIVERY_STATUSES,
  EMAIL_EVENT_TYPES,
  type EmailDeliveryQuery,
  type EmailDeliveryStatus,
  type EmailEventType,
} from './platform-communication.types';

export const EMAIL_DELIVERY_LIMITS = [10, 20, 50, 100] as const;
const OWNED = ['page', 'limit', 'status', 'companyId', 'recipient', 'eventType', 'from', 'to'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OFFSET_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/i;
const statuses = new Set<EmailDeliveryStatus>(EMAIL_DELIVERY_STATUSES);
const events = new Set<EmailEventType>(EMAIL_EVENT_TYPES);

export function parseEmailDeliveryUrl(input: URLSearchParams) {
  const page = positive(input.get('page')) ?? 1;
  const candidate = positive(input.get('limit'));
  const limit = EMAIL_DELIVERY_LIMITS.includes(candidate as never) ? candidate! : 20;
  const query: EmailDeliveryQuery = { page, limit };
  const status = input.get('status') as EmailDeliveryStatus;
  if (statuses.has(status)) query.status = status;
  const companyId = input.get('companyId')?.trim();
  if (companyId && UUID.test(companyId)) query.companyId = companyId;
  const recipient = input.get('recipient')?.trim().toLowerCase();
  if (recipient && recipient.length <= 254 && EMAIL.test(recipient)) {
    query.recipient = recipient;
  }
  const eventType = input.get('eventType') as EmailEventType;
  if (events.has(eventType)) query.eventType = eventType;
  const from = instant(input.get('from'));
  const to = instant(input.get('to'));
  if (!(from && to && Date.parse(from) >= Date.parse(to))) {
    if (from) query.from = from;
    if (to) query.to = to;
  }
  const normalized = serializeEmailDeliveryUrl(query, input);
  return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}
export function serializeEmailDeliveryUrl(query: EmailDeliveryQuery, current = new URLSearchParams()) {
  const params = new URLSearchParams(current);
  for (const key of OWNED) params.delete(key);
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  for (const key of ['status', 'companyId', 'recipient', 'eventType', 'from', 'to'] as const) {
    if (query[key]) params.set(key, String(query[key]));
  }
  return params;
}

export function localDateTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1, 6).map(Number);
  const second = Number(match[6] ?? 0);
  const ms = Number((match[7] ?? '').padEnd(3, '0'));
  const date = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], second, ms);
  const actual = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()];
  return actual.some((part, index) => part !== [...parts, second, ms][index]) ? null : date.toISOString();
}

export function isoToLocal(value: string) {
  const valid = instant(value);
  if (!valid) return '';
  const date = new Date(valid);
  const pad = (number: number, size = 2) => String(number).padStart(size, '0');
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${time}.${pad(date.getMilliseconds(), 3)}`;
}

export function validDateRange(from: string, to: string) {
  const parsedFrom = from ? localDateTimeToIso(from) : null;
  const parsedTo = to ? localDateTimeToIso(to) : null;
  if ((from && !parsedFrom) || (to && !parsedTo)) return false;
  return !(parsedFrom && parsedTo) || Date.parse(parsedFrom) < Date.parse(parsedTo);
}

function positive(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function instant(value: string | null) {
  if (!value) return null;
  const match = OFFSET_ISO.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function validCompanyId(value: string) {
  return !value.trim() || UUID.test(value.trim());
}

export function validRecipient(value: string) {
  const normalized = value.trim();
  return !normalized || (normalized.length <= 254 && EMAIL.test(normalized));
}

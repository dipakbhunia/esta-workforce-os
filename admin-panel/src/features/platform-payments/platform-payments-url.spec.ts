import { describe, expect, it } from 'vitest';
import {
  canonicalIsoToLocalDateTime,
  isValidPlatformPaymentDateRange,
  localDateTimeToCanonicalIso,
  parsePlatformPaymentsUrl,
  serializePlatformPaymentsUrl,
} from './platform-payments-url';

const companyId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';
const from = '2026-09-01T00:00:00.000Z';
const to = '2026-09-02T00:00:00.000Z';

describe('Platform Payments URL state', () => {
  it('normalizes an empty URL to locked defaults', () => {
    const parsed = parsePlatformPaymentsUrl(new URLSearchParams());
    expect(parsed.query).toEqual({ page: 1, limit: 20 });
    expect(parsed.normalized.toString()).toBe('page=1&limit=20');
    expect(parsed.shouldNormalize).toBe(true);
  });

  it.each(['1', '7', '999'])('accepts positive page %s', (page) => {
    expect(parsePlatformPaymentsUrl(new URLSearchParams({ page })).query.page).toBe(Number(page));
  });

  it.each(['', '0', '-1', '1.5', 'word'])('normalizes invalid page %j', (page) => {
    expect(parsePlatformPaymentsUrl(new URLSearchParams({ page })).query.page).toBe(1);
  });

  it.each(['10', '20', '50', '100'])('accepts limit %s', (limit) => {
    expect(parsePlatformPaymentsUrl(new URLSearchParams({ limit })).query.limit).toBe(Number(limit));
  });

  it.each(['', '1', '25', '101', 'word'])('normalizes invalid limit %j', (limit) => {
    expect(parsePlatformPaymentsUrl(new URLSearchParams({ limit })).query.limit).toBe(20);
  });

  it('accepts every current enum and exact UUID filter', () => {
    const parsed = parsePlatformPaymentsUrl(new URLSearchParams({ page: '2', limit: '50', companyId, subscriptionId, status: 'CAPTURED', provider: 'RAZORPAY', mode: 'LIVE', purpose: 'SUBSCRIPTION_ACTIVATION', from, to }));
    expect(parsed.query).toEqual({ page: 2, limit: 50, companyId, subscriptionId, status: 'CAPTURED', provider: 'RAZORPAY', mode: 'LIVE', purpose: 'SUBSCRIPTION_ACTIVATION', from, to });
  });

  it.each([
    ['status', 'PAID'], ['provider', 'STRIPE'], ['mode', 'SANDBOX'], ['purpose', 'REFUND'],
    ['companyId', 'not-a-uuid'], ['subscriptionId', 'not-a-uuid'],
  ])('discards invalid %s', (key, value) => {
    expect(parsePlatformPaymentsUrl(new URLSearchParams({ [key]: value })).query).not.toHaveProperty(key);
  });

  it.each([
    { from }, { to }, { from, to: from }, { from: to, to: from },
    { from: '2026-09-01', to }, { from: 'invalid', to },
  ])('removes invalid, partial, equal, or reversed ranges', (range) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(range)) if (value !== undefined) params.set(key, value);
    const parsed = parsePlatformPaymentsUrl(params);
    expect(parsed.query.from).toBeUndefined();
    expect(parsed.query.to).toBeUndefined();
  });

  it('removes unknown and search parameters and serializes in stable order', () => {
    const parsed = parsePlatformPaymentsUrl(new URLSearchParams({ search: 'acme', unknown: 'value', status: 'FAILED', page: '3', limit: '100' }));
    expect(parsed.normalized.toString()).toBe('page=3&limit=100&status=FAILED');
    expect(parsed.normalized.has('search')).toBe(false);
    expect(parsed.normalized.has('unknown')).toBe(false);
  });

  it('is stable across parse and serialize for browser history state', () => {
    const initial = serializePlatformPaymentsUrl({ page: 4, limit: 20, companyId, status: 'AUTHORIZED', from, to });
    const parsed = parsePlatformPaymentsUrl(initial);
    expect(parsed.shouldNormalize).toBe(false);
    expect(serializePlatformPaymentsUrl(parsed.query).toString()).toBe(initial.toString());
  });
});

describe('Platform Payments local datetime conversion', () => {
  it('converts a valid local wall time to a canonical instant', () => {
    expect(localDateTimeToCanonicalIso('2026-09-01T10:15')).toMatch(/^2026-09-01T/);
  });

  it.each(['', 'not-a-date', '2026-02-30T10:00', '2026-09-01T25:00'])('rejects invalid local input %j without throwing', (value) => {
    expect(() => localDateTimeToCanonicalIso(value)).not.toThrow();
    expect(localDateTimeToCanonicalIso(value)).toBeNull();
  });

  it('preserves the same instant through ISO to local and back', () => {
    const local = canonicalIsoToLocalDateTime(from);
    expect(local).not.toBeNull();
    expect(localDateTimeToCanonicalIso(local!)).toBe(from);
  });

  it('validates empty and increasing pairs but rejects partial, equal, and reversed pairs', () => {
    expect(isValidPlatformPaymentDateRange('', '')).toBe(true);
    expect(isValidPlatformPaymentDateRange('2026-09-01T10:00', '2026-09-01T11:00')).toBe(true);
    expect(isValidPlatformPaymentDateRange('2026-09-01T10:00', '')).toBe(false);
    expect(isValidPlatformPaymentDateRange('2026-09-01T10:00', '2026-09-01T10:00')).toBe(false);
    expect(isValidPlatformPaymentDateRange('2026-09-01T11:00', '2026-09-01T10:00')).toBe(false);
  });
});

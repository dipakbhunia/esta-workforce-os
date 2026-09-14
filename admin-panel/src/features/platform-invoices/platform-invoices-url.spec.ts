import { describe, expect, it } from 'vitest';
import { isValidPlatformInvoiceDateRange, localDateTimeToPlatformInvoiceIso, parsePlatformInvoicesUrl, platformInvoiceIsoToLocalDateTime, platformInvoiceQueryForAppliedFilters, serializePlatformInvoicesUrl } from './platform-invoices-url';

const companyId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';
const sourcePaymentId = '33333333-3333-4333-8333-333333333333';
const from = '2026-09-01T00:00:00.000Z';
const to = '2026-10-01T00:00:00.000Z';

describe('Platform Invoices URL state', () => {
  it('normalizes an empty URL to defaults', () => {
    const parsed = parsePlatformInvoicesUrl(new URLSearchParams());
    expect(parsed.query).toEqual({ page: 1, limit: 20 });
    expect(parsed.normalized.toString()).toBe('page=1&limit=20');
  });

  it('accepts the full supported filter set and serializes deterministically', () => {
    const input = new URLSearchParams({ page: '2', limit: '50', companyId, subscriptionId, sourcePaymentId, invoiceNumber: '  INV-1  ', from, to });
    const parsed = parsePlatformInvoicesUrl(input);
    expect(parsed.query).toEqual({ page: 2, limit: 50, companyId, subscriptionId, sourcePaymentId, invoiceNumber: 'INV-1', from, to });
    expect(parsed.normalized.toString()).toBe(`page=2&limit=50&companyId=${companyId}&subscriptionId=${subscriptionId}&sourcePaymentId=${sourcePaymentId}&invoiceNumber=INV-1&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  });

  it.each([['page', '0'], ['page', '1.5'], ['limit', '25'], ['limit', '101']])('normalizes invalid %s=%s', (key, value) => {
    expect(parsePlatformInvoicesUrl(new URLSearchParams({ [key]: value })).query).toMatchObject({ page: 1, limit: 20 });
  });

  it.each(['10', '20', '50', '100'])('accepts allowed page size %s', (limit) => {
    expect(parsePlatformInvoicesUrl(new URLSearchParams({ limit })).query.limit).toBe(Number(limit));
  });

  it.each(['companyId', 'subscriptionId', 'sourcePaymentId'])('removes malformed UUID filter %s', (key) => {
    expect(parsePlatformInvoicesUrl(new URLSearchParams({ [key]: 'invalid' })).query).not.toHaveProperty(key);
  });

  it.each([{ from }, { to }, { from, to: from }, { from: to, to: from }, { from: 'bad', to }])('removes invalid date range %#', (range) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(range)) if (value !== undefined) params.set(key, value);
    const parsed = parsePlatformInvoicesUrl(params);
    expect(parsed.query.from).toBeUndefined();
    expect(parsed.query.to).toBeUndefined();
  });

  it('preserves unrelated parameters while replacing owned state', () => {
    const result = serializePlatformInvoicesUrl({ page: 3, limit: 100, invoiceNumber: 'INV-2' }, new URLSearchParams({ tab: 'audit', page: '9', companyId }));
    expect(result.toString()).toBe('tab=audit&page=3&limit=100&invoiceNumber=INV-2');
  });

  it('resets page when applying filters', () => {
    expect(platformInvoiceQueryForAppliedFilters({ page: 9, limit: 20, companyId })).toEqual({ page: 1, limit: 20, companyId });
  });

  it('round-trips a canonical instant through local datetime display', () => {
    expect(localDateTimeToPlatformInvoiceIso(platformInvoiceIsoToLocalDateTime(from)!)).toBe(from);
  });

  it.each([['', '', true], ['2026-09-01T10:00', '', false], ['2026-09-01T10:00', '2026-09-01T10:00', false], ['2026-09-01T11:00', '2026-09-01T10:00', false], ['2026-02-30T10:00', '2026-03-01T10:00', false]])('validates local range %j to %j', (start, end, valid) => {
    expect(isValidPlatformInvoiceDateRange(start, end)).toBe(valid);
  });
});

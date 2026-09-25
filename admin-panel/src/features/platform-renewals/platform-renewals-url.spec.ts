import { describe, expect, it } from 'vitest';
import { parsePlatformRenewalsUrl, serializePlatformRenewalsUrl, validRenewalDateRange } from './platform-renewals-url';
const id = '11111111-1111-4111-8111-111111111111';
describe('renewal URL state', () => {
  it('hydrates supported state and preserves unrelated params', () => { const parsed = parsePlatformRenewalsUrl(new URLSearchParams(`page=2&limit=50&companyId=${id}&status=APPLIED&billingInterval=YEARLY&keep=yes`)); expect(parsed.query).toMatchObject({ page: 2, limit: 50, companyId: id, status: 'APPLIED', billingInterval: 'YEARLY' }); expect(parsed.normalized.get('keep')).toBe('yes'); });
  it('normalizes malformed, partial, and reversed values', () => { for (const range of ['from=2026-01-01T00:00:00.000Z', 'from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z']) expect(parsePlatformRenewalsUrl(new URLSearchParams(`page=x&limit=7&status=BAD&${range}`)).query).toEqual({ page: 1, limit: 20 }); });
  it('serializes caller-reset pagination and supported filters', () => expect(serializePlatformRenewalsUrl({ page: 1, limit: 20, paymentId: id }).toString()).toContain(`paymentId=${id}`));
  it('requires paired ascending local dates', () => { expect(validRenewalDateRange('', '')).toBe(true); expect(validRenewalDateRange('2026-01-01T00:00', '')).toBe(false); expect(validRenewalDateRange('2026-02-01T00:00', '2026-01-01T00:00')).toBe(false); });
});

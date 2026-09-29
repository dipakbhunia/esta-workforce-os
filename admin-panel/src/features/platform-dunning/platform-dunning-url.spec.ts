import { describe, expect, it } from 'vitest';
import { parsePlatformDunningUrl, serializePlatformDunningUrl, validDunningDateRange } from './platform-dunning-url';
const id = '11111111-1111-4111-8111-111111111111';
describe('Dunning URL state', () => {
  it('hydrates supported state and preserves unrelated parameters', () => { const parsed = parsePlatformDunningUrl(new URLSearchParams(`page=2&limit=50&companyId=${id}&paymentStatus=FAILED&keep=yes`)); expect(parsed.query).toMatchObject({ page: 2, limit: 50, companyId: id, paymentStatus: 'FAILED' }); expect(parsed.normalized.get('keep')).toBe('yes'); });
  it('normalizes malformed, partial, equal, and reversed values', () => { for (const range of ['from=2026-01-01T00:00:00.000Z', 'from=2026-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z', 'from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z']) expect(parsePlatformDunningUrl(new URLSearchParams(`page=x&limit=7&paymentStatus=BAD&${range}`)).query).toEqual({ page: 1, limit: 20 }); });
  it('serializes owned filters without removing unrelated state', () => { const params = serializePlatformDunningUrl({ page: 1, limit: 20, paymentId: id }, new URLSearchParams('keep=yes')); expect(params.get('paymentId')).toBe(id); expect(params.get('keep')).toBe('yes'); });
  it('requires paired ascending valid local instants', () => { expect(validDunningDateRange('', '')).toBe(true); expect(validDunningDateRange('2026-02-29T00:00', '2026-03-01T00:00')).toBe(false); expect(validDunningDateRange('2028-02-29T00:00', '2028-03-01T00:00')).toBe(true); });
});

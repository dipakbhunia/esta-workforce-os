import { beforeEach, describe, expect, it, vi } from 'vitest';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/http', () => ({ http: { get } }));
import { listPlatformRenewals, platformRenewalKeys } from './platform-renewals-api';
describe('platform renewals API', () => {
  beforeEach(() => get.mockReset().mockResolvedValue({ data: {} }));
  it('sends defaults to the exact endpoint', async () => { await listPlatformRenewals({ page: 1, limit: 20 }); expect(get).toHaveBeenCalledWith('/platform/renewals', { params: { page: 1, limit: 20 } }); });
  it('serializes only supported filters including paired instants', async () => { const query = { page: 2, limit: 50, companyId: 'c', subscriptionId: 's', paymentId: 'p', status: 'PREPARED' as const, billingInterval: 'MONTHLY' as const, from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' }; await listPlatformRenewals({ ...query, search: 'no', provider: 'no' } as never); expect(get).toHaveBeenCalledWith('/platform/renewals', { params: query }); });
  it('omits empty values and builds stable keys', async () => { const query = { page: 1, limit: 20, companyId: '' }; await listPlatformRenewals(query); expect(get).toHaveBeenCalledWith('/platform/renewals', { params: { page: 1, limit: 20 } }); expect(platformRenewalKeys.list(query)).toEqual(['platform-renewals', 'list', query]); });
});

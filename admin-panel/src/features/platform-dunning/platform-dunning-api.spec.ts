import { beforeEach, describe, expect, it, vi } from 'vitest';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/http', () => ({ http: { get } }));
import { getPlatformDunning, listPlatformDunning, platformDunningKeys } from './platform-dunning-api';
describe('platform Dunning API', () => {
  beforeEach(() => get.mockReset().mockResolvedValue({ data: {} }));
  it('uses the exact list path and supported parameters only', async () => { const query = { page: 2, limit: 50, paymentStatus: 'FAILED' as const, from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' }; await listPlatformDunning({ ...query, search: 'no' } as never); expect(get).toHaveBeenCalledWith('/platform/dunning', { params: query }); });
  it('omits empty values and builds stable keys', async () => { const query = { page: 1, limit: 20, companyId: '' }; await listPlatformDunning(query); expect(get).toHaveBeenCalledWith('/platform/dunning', { params: { page: 1, limit: 20 } }); expect(platformDunningKeys.list(query)).toEqual(['platform-dunning', 'list', query]); });
  it('gets one encoded Dunning renewal with the details key', async () => { await getPlatformDunning('renewal/id'); expect(get).toHaveBeenCalledWith('/platform/dunning/renewal%2Fid'); expect(platformDunningKeys.details('renewal/id')).toEqual(['platform-dunning', 'details', 'renewal/id']); });
});

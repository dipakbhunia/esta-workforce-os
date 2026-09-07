import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/http', () => ({ http: { get } }));

import * as api from './platform-payments-api';

describe('platform payments API', () => {
  beforeEach(() => get.mockReset().mockResolvedValue({ data: {} }));

  it('uses the exact read-only list endpoint and approved defined parameters', async () => {
    await api.listPlatformPayments({
      page: 2, limit: 50, companyId: 'company-id', status: 'CAPTURED', provider: 'RAZORPAY',
      mode: 'TEST', purpose: 'SUBSCRIPTION_ACTIVATION', subscriptionId: 'subscription-id',
      from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z',
    });
    expect(get).toHaveBeenCalledWith('/platform-payments', { params: {
      page: 2, limit: 50, companyId: 'company-id', status: 'CAPTURED', provider: 'RAZORPAY',
      mode: 'TEST', purpose: 'SUBSCRIPTION_ACTIVATION', subscriptionId: 'subscription-id',
      from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z',
    } });
  });

  it('omits undefined and empty optional values', async () => {
    await api.listPlatformPayments({ page: 1, limit: 20, companyId: undefined, status: '' as never, search: 'unsupported' } as never);
    expect(get).toHaveBeenCalledWith('/platform-payments', { params: { page: 1, limit: 20 } });
  });

  it('uses the exact details endpoint and exports no mutation API', async () => {
    await api.getPlatformPayment('payment-id');
    expect(get).toHaveBeenCalledWith('/platform-payments/payment-id');
    expect(Object.keys(api).sort()).toEqual(['getPlatformPayment', 'listPlatformPayments']);
    expect('search' in ({ page: 1, limit: 20 } satisfies Parameters<typeof api.listPlatformPayments>[0])).toBe(false);
  });
});

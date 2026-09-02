import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformDashboardResponse } from './platform-dashboard.types';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/services/http', () => ({
  http: { get },
}));

import { getPlatformDashboard } from './platform-dashboard-api';

const response: PlatformDashboardResponse = {
  asOf: '2026-08-31T12:34:56.000Z',
  range: { from: '2026-08-01', to: '2026-08-31', timezone: 'UTC', granularity: 'DAILY' },
  kpis: {
    totalCompanies: 8,
    effectiveActiveSubscriptions: 4,
    effectiveActiveTrials: 3,
    newCompanies: 3,
    trialsEndingSoon: 2,
    subscriptionsEndingSoon: 2,
  },
  growth: [{ bucketStart: '2026-08-01', newCompanies: 1, trialStarts: 2 }],
  subscriptionDistribution: [{ status: 'ACTIVE', count: 4 }],
  planDistribution: [{ planId: 'plan-1', planCode: 'STARTER', planName: 'Starter', subscriptionCount: 4 }],
  trialDistribution: [{ status: 'EFFECTIVE_ACTIVE', count: 3 }],
  storage: {
    measurementCoverage: 'PARTIAL',
    measuredStorageBytes: '9007199254740993000',
    configuredAllocationBytes: '9007199254740999000',
    measuredObjectCount: 2,
    unmeasuredObjectCount: 1,
    companiesWithConfiguredLimit: 1,
    companiesWithoutConfiguredLimit: 1,
    companiesAtLimit: 0,
    companiesOverLimit: 1,
    capacityDistribution: [{ state: 'OVER_LIMIT', companyCount: 1 }],
    highUsageCompanies: [{
      companyId: 'company-1',
      companyName: 'Acme',
      measuredStorageBytes: '9007199254740993000',
      configuredLimitBytes: '9007199254740990000',
      utilizationPercent: '100.00',
      capacityState: 'OVER_LIMIT',
    }],
  },
  attention: [{
    id: 'attention-1',
    type: 'STORAGE_OVER_LIMIT',
    severity: 'CRITICAL',
    companyId: 'company-1',
    companyName: 'Acme',
    resourceType: 'STORAGE',
    resourceId: 'storage-1',
    relevantAt: null,
    metricValue: '9007199254740993000',
    metricUnit: 'BYTES',
  }],
  recentCompanies: [{
    id: 'company-1',
    name: 'Acme',
    status: 'ACTIVE',
    createdAt: '2026-08-31T10:00:00.000Z',
    commercialState: 'TRIAL',
    commercialReferenceId: 'trial-1',
  }],
};

describe('platform dashboard API', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('uses the shared authenticated client and exact date-only query contract', async () => {
    get.mockResolvedValue({ data: response });
    const result = await getPlatformDashboard({ from: '2026-08-01', to: '2026-08-31' });

    expect(get).toHaveBeenCalledWith('/platform-dashboard', {
      params: { from: '2026-08-01', to: '2026-08-31' },
    });
    expect(result.data).toBe(response);
  });

  it('preserves exact large storage and attention byte strings without coercion', async () => {
    get.mockResolvedValue({ data: response });
    const result = await getPlatformDashboard();

    expect(get).toHaveBeenCalledWith('/platform-dashboard', { params: {} });
    expect(result.data.storage.measuredStorageBytes).toBe('9007199254740993000');
    expect(result.data.storage.configuredAllocationBytes).toBe('9007199254740999000');
    expect(result.data.storage.highUsageCompanies[0]?.configuredLimitBytes).toBe('9007199254740990000');
    expect(result.data.attention[0]?.metricValue).toBe('9007199254740993000');
    expect(typeof result.data.storage.measuredStorageBytes).toBe('string');
  });

  it('does not request platform data when the tenant dashboard module loads', async () => {
    await import('./pages/TenantDashboardPage');

    expect(get).not.toHaveBeenCalled();
  }, 15_000);
});

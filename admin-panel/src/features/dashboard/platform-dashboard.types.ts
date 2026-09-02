export type PlatformDashboardGranularity = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type EffectiveSubscriptionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'SUPERSEDED'
  | 'CANCELLED'
  | 'EXPIRED';

export type TrialLifecycleStatus =
  | 'EFFECTIVE_ACTIVE'
  | 'SCHEDULED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'CONVERTED';

export type StorageMeasurementCoverage = 'NO_OBJECTS' | 'COMPLETE' | 'PARTIAL' | 'UNMEASURABLE';

export type StorageCapacityState =
  | 'AVAILABLE'
  | 'AT_LIMIT'
  | 'OVER_LIMIT'
  | 'UNCONFIGURED'
  | 'NO_ACCESS'
  | 'UNMEASURABLE';

export type PlatformAttentionType =
  | 'STORAGE_OVER_LIMIT'
  | 'COMPANY_SUSPENDED'
  | 'SUBSCRIPTION_ENDING_SOON'
  | 'TRIAL_ENDING_SOON'
  | 'STORAGE_AT_LIMIT'
  | 'STORAGE_UNMEASURABLE'
  | 'NO_COMMERCIAL_ACCESS';

export type PlatformAttentionSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type PlatformAttentionResourceType = 'COMPANY' | 'SUBSCRIPTION' | 'TRIAL' | 'STORAGE';
export type PlatformCommercialState = 'TRIAL' | 'ACTIVE_SUBSCRIPTION' | 'SUSPENDED_SUBSCRIPTION' | 'NONE';
export type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'TRIAL' | 'SUSPENDED';

export type PlatformDashboardParams =
  | { from: string; to: string }
  | { from?: never; to?: never };

export interface PlatformDashboardResponse {
  asOf: string;
  range: {
    from: string;
    to: string;
    timezone: 'UTC';
    granularity: PlatformDashboardGranularity;
  };
  kpis: {
    totalCompanies: number;
    effectiveActiveSubscriptions: number;
    effectiveActiveTrials: number;
    newCompanies: number;
    trialsEndingSoon: number;
    subscriptionsEndingSoon: number;
  };
  growth: Array<{
    bucketStart: string;
    newCompanies: number;
    trialStarts: number;
  }>;
  subscriptionDistribution: Array<{
    status: EffectiveSubscriptionStatus;
    count: number;
  }>;
  planDistribution: Array<{
    planId: string;
    planCode: string;
    planName: string;
    subscriptionCount: number;
  }>;
  trialDistribution: Array<{
    status: TrialLifecycleStatus;
    count: number;
  }>;
  storage: {
    measurementCoverage: StorageMeasurementCoverage;
    measuredStorageBytes: string;
    configuredAllocationBytes: string;
    measuredObjectCount: number;
    unmeasuredObjectCount: number;
    companiesWithConfiguredLimit: number;
    companiesWithoutConfiguredLimit: number;
    companiesAtLimit: number;
    companiesOverLimit: number;
    capacityDistribution: Array<{
      state: StorageCapacityState;
      companyCount: number;
    }>;
    highUsageCompanies: Array<{
      companyId: string;
      companyName: string;
      measuredStorageBytes: string;
      configuredLimitBytes: string;
      utilizationPercent: string;
      capacityState: 'AVAILABLE' | 'AT_LIMIT' | 'OVER_LIMIT';
    }>;
  };
  attention: Array<{
    id: string;
    type: PlatformAttentionType;
    severity: PlatformAttentionSeverity;
    companyId: string;
    companyName: string;
    resourceType: PlatformAttentionResourceType;
    resourceId: string;
    relevantAt: string | null;
    metricValue: string | null;
    metricUnit: 'BYTES' | null;
  }>;
  recentCompanies: Array<{
    id: string;
    name: string;
    status: CompanyStatus;
    createdAt: string;
    commercialState: PlatformCommercialState;
    commercialReferenceId: string | null;
  }>;
}

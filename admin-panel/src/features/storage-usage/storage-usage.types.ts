export type CommercialStorageSource = 'TRIAL' | 'SUBSCRIPTION' | 'NONE';
export type CommercialStorageStatus = 'ACTIVE' | 'SUSPENDED' | null;
export type StorageMeasurementState = 'MEASURED' | 'UNMEASURABLE';
export type StorageCapacityState = 'AVAILABLE' | 'AT_LIMIT' | 'OVER_LIMIT' | 'UNCONFIGURED' | 'NO_ACCESS' | 'UNMEASURABLE';

export interface CompanyStorageSummary {
  company: {
    id: string;
    name: string;
    slug: string;
    status: 'ACTIVE' | 'INACTIVE' | 'TRIAL' | 'SUSPENDED';
  };
  commercial: {
    source: CommercialStorageSource;
    referenceId: string | null;
    commercialStatus: CommercialStorageStatus;
    plan: { id: string; code: string; name: string } | null;
  };
  storage: {
    measuredStorageBytes: string;
    measuredObjectCount: number;
    unmeasuredObjectCount: number;
    measurementState: StorageMeasurementState;
    configuredLimitBytes: string | null;
    remainingBytes: string | null;
    overByBytes: string | null;
    utilizationPercent: string | null;
    capacityState: StorageCapacityState;
    allocationAllowed: boolean;
    earliestScreenshotAt: string | null;
    latestScreenshotAt: string | null;
    calculatedAt: string;
  };
}

export interface StorageUsageMetrics {
  scope: 'ALL_COMPANIES' | 'FILTERED';
  totalMeasuredStorageBytes: string;
  measuredScreenshotObjects: number;
  unmeasuredScreenshotObjects: number;
  companiesWithMeasuredStorage: number;
  companiesWithUnmeasurableStorage: number;
  companiesWithConfiguredLimit: number;
  companiesWithoutConfiguredLimit: number;
  companiesAtLimit: number;
  companiesOverLimit: number;
  effectiveTrialCount: number;
  activeSubscriptionCount: number;
  suspendedSubscriptionCount: number;
  noAccessCount: number;
}

export interface StorageUsageResponse {
  data: CompanyStorageSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: StorageUsageMetrics;
  calculatedAt: string;
}

export interface StorageUsageListParams {
  page: number;
  limit: number;
  search?: string;
  source?: CommercialStorageSource;
  commercialStatus?: Exclude<CommercialStorageStatus, null>;
  capacityState?: StorageCapacityState;
  planId?: string;
  limitConfigured?: boolean;
  overLimit?: boolean;
}

import {
  CompanyStatus,
  SubscriptionStatus,
  TrialStatus,
} from '@prisma/client';

export enum CommercialStorageSource {
  TRIAL = 'TRIAL',
  SUBSCRIPTION = 'SUBSCRIPTION',
  NONE = 'NONE',
}

export enum StorageMeasurementState {
  MEASURED = 'MEASURED',
  UNMEASURABLE = 'UNMEASURABLE',
}

export enum StorageCapacityState {
  AVAILABLE = 'AVAILABLE',
  AT_LIMIT = 'AT_LIMIT',
  OVER_LIMIT = 'OVER_LIMIT',
  UNCONFIGURED = 'UNCONFIGURED',
  NO_ACCESS = 'NO_ACCESS',
  UNMEASURABLE = 'UNMEASURABLE',
}

export interface StorageCalculation {
  measuredStorageBytes: string;
  measurementState: StorageMeasurementState;
  configuredLimitBytes: string | null;
  remainingBytes: string | null;
  overByBytes: string | null;
  utilizationPercent: string | null;
  capacityState: StorageCapacityState;
}

export interface StorageUsageRecord {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyStatus: CompanyStatus;
  source: CommercialStorageSource;
  referenceId: string | null;
  commercialStatus: TrialStatus | SubscriptionStatus | null;
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  configuredLimitBytes: string | null;
  measuredStorageBytes: string;
  measuredObjectCount: number;
  unmeasuredObjectCount: number;
  earliestScreenshotAt: Date | null;
  latestScreenshotAt: Date | null;
  allocationAllowed: boolean;
}

export interface CompanyStorageSummary {
  company: {
    id: string;
    name: string;
    slug: string;
    status: CompanyStatus;
  };
  commercial: {
    source: CommercialStorageSource;
    referenceId: string | null;
    commercialStatus: TrialStatus | SubscriptionStatus | null;
    plan: { id: string; code: string; name: string } | null;
  };
  storage: StorageCalculation & {
    measuredObjectCount: number;
    unmeasuredObjectCount: number;
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

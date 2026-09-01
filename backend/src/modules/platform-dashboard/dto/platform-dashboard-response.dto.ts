import { CompanyStatus } from '@prisma/client';
import {
  PlatformStorageDashboardSnapshot,
  StorageCapacityState,
} from '../../storage-usage/storage-usage.types';

export type DashboardGranularity = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type EffectiveSubscriptionStatus =
  | 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'SUPERSEDED' | 'CANCELLED' | 'EXPIRED';
export type TrialLifecycleStatus =
  | 'EFFECTIVE_ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'CANCELLED' | 'CONVERTED';
export type AttentionType =
  | 'STORAGE_OVER_LIMIT' | 'COMPANY_SUSPENDED' | 'SUBSCRIPTION_ENDING_SOON'
  | 'TRIAL_ENDING_SOON' | 'STORAGE_AT_LIMIT' | 'STORAGE_UNMEASURABLE'
  | 'NO_COMMERCIAL_ACCESS';
export type AttentionSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AttentionResourceType = 'COMPANY' | 'SUBSCRIPTION' | 'TRIAL' | 'STORAGE';
export type CommercialState = 'TRIAL' | 'ACTIVE_SUBSCRIPTION' | 'SUSPENDED_SUBSCRIPTION' | 'NONE';

export interface PlatformDashboardResponseDto {
  asOf: string;
  range: { from: string; to: string; timezone: 'UTC'; granularity: DashboardGranularity };
  kpis: {
    totalCompanies: number;
    effectiveActiveSubscriptions: number;
    effectiveActiveTrials: number;
    newCompanies: number;
    trialsEndingSoon: number;
    subscriptionsEndingSoon: number;
  };
  growth: Array<{ bucketStart: string; newCompanies: number; trialStarts: number }>;
  subscriptionDistribution: Array<{ status: EffectiveSubscriptionStatus; count: number }>;
  planDistribution: Array<{ planId: string; planCode: string; planName: string; subscriptionCount: number }>;
  trialDistribution: Array<{ status: TrialLifecycleStatus; count: number }>;
  storage: Omit<PlatformStorageDashboardSnapshot, 'attentionCandidates'>;
  attention: Array<{
    id: string; type: AttentionType; severity: AttentionSeverity;
    companyId: string; companyName: string; resourceType: AttentionResourceType;
    resourceId: string; relevantAt: string | null; metricValue: string | null;
    metricUnit: 'BYTES' | null;
  }>;
  recentCompanies: Array<{
    id: string; name: string; status: CompanyStatus; createdAt: string;
    commercialState: CommercialState; commercialReferenceId: string | null;
  }>;
}

export const CAPACITY_ORDER: StorageCapacityState[] = [
  StorageCapacityState.AVAILABLE, StorageCapacityState.AT_LIMIT,
  StorageCapacityState.OVER_LIMIT, StorageCapacityState.UNCONFIGURED,
  StorageCapacityState.UNMEASURABLE, StorageCapacityState.NO_ACCESS,
];

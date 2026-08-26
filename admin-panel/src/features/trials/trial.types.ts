import type { CompanyStatus } from '@/features/organization/types/company.types';
import type { BillingInterval, SubscriptionStatus } from '@/features/subscriptions/subscription.types';

export type TrialStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'CONVERTED';

export interface Trial {
  id: string;
  companyId: string;
  status: TrialStatus;
  startsAt: string;
  endsAt: string;
  seatLimit: number;
  entitlementsSnapshot: string[];
  limitsSnapshot: Record<string, unknown>;
  cancelledAt: string | null;
  expiredAt: string | null;
  convertedAt: string | null;
  convertedSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; name: string; slug: string; status: CompanyStatus };
  convertedSubscription: { id: string; status: SubscriptionStatus; planCodeSnapshot: string; planNameSnapshot: string } | null;
}

export interface TrialListParams {
  page: number;
  limit: number;
  search?: string;
  status?: TrialStatus;
  companyId?: string;
  startsFrom?: string;
  startsTo?: string;
  endsFrom?: string;
  endsTo?: string;
  expiringWithinDays?: number;
}

export interface PaginatedTrials {
  data: Trial[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface StartTrialPayload {
  companyId: string;
  seatLimit?: number;
  durationHours?: number;
  reason?: string;
  allowOverLimit?: boolean;
}

export interface ConvertTrialPayload {
  planId: string;
  billingInterval: BillingInterval;
  seatQuantity: number;
  entitlements?: string[];
  limits?: Record<string, number>;
  allowOverLimit?: boolean;
  reason?: string;
}

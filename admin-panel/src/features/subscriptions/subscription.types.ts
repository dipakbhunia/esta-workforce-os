import type { CompanyStatus } from '@/features/organization/types/company.types';
import type { PlanBillingModel, PlanStatus } from '@/features/plans/plan.types';

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'SUPERSEDED' | 'CANCELLED' | 'EXPIRED';
export type BillingInterval = 'MONTHLY' | 'YEARLY' | 'CUSTOM';
export type SubscriptionActivationSource = 'MANUAL' | 'PAYMENT' | 'TRIAL_CONVERSION' | 'COMPLIMENTARY';
export interface SubscriptionSummary { id: string; planCodeSnapshot: string; planNameSnapshot: string; status: SubscriptionStatus }
export interface Subscription {
  id: string; companyId: string; planId: string; status: SubscriptionStatus; activationSource: SubscriptionActivationSource; billingInterval: BillingInterval;
  planCodeSnapshot: string; planNameSnapshot: string; billingModelSnapshot: PlanBillingModel; currency: string; pricePerSeatMinor: number | null; customRecurringPriceMinor: number | null;
  recurringPriceBasis: 'PER_USER_UNIT' | 'FIXED_TOTAL' | null; recurringUnitPriceMinor: string | null; recurringTotalPriceMinor: string | null; recurringCurrency: string | null; pricingInterval: BillingInterval | null; pricingResolvedAt: string | null;
  seatQuantity: number; entitlementsSnapshot: string[]; limitsSnapshot: Record<string, number>; startsAt: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null;
  suspendedAt: string | null; cancelledAt: string | null; endedAt: string | null; supersedesSubscriptionId: string | null; createdAt: string; updatedAt: string;
  company: { id: string; name: string; slug: string; status: CompanyStatus }; plan: { id: string; code: string; name: string; status: PlanStatus };
  supersedes: SubscriptionSummary | null; successors: SubscriptionSummary[];
}
export interface SubscriptionPayload { companyId: string; planId: string; billingInterval: BillingInterval; activationSource: SubscriptionActivationSource; seatQuantity: number; entitlements?: string[]; limits?: Record<string, number>; startsAt?: string | null; currentPeriodStart?: string | null; currentPeriodEnd?: string | null }
export interface OverLimitOverride { allowOverLimit?: boolean; reason?: string }
export interface AmendmentPayload extends OverLimitOverride { planId?: string; billingInterval?: BillingInterval; seatQuantity?: number; entitlements?: string[]; limits?: Record<string, number> }
export interface PaginatedSubscriptions { data: Subscription[]; meta: { page: number; limit: number; total: number; totalPages: number } }

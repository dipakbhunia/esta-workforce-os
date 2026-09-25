export type RenewalStatus = 'PREPARED' | 'APPLIED' | 'BLOCKED';
export type RenewalBillingInterval = 'MONTHLY' | 'YEARLY' | 'CUSTOM';
export type RenewalPriceBasis = 'PER_USER_UNIT' | 'FIXED_TOTAL';
export type RenewalPaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
export type RenewalSubscriptionStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'SUPERSEDED' | 'CANCELLED' | 'EXPIRED';
export type RenewalProvider = 'RAZORPAY';
export type RenewalProviderMode = 'TEST' | 'LIVE';

export interface PlatformRenewalListQuery { page: number; limit: number; companyId?: string; subscriptionId?: string; paymentId?: string; status?: RenewalStatus; billingInterval?: RenewalBillingInterval; from?: string; to?: string }
export interface PlatformRenewal {
  id: string; status: RenewalStatus; cycleStart: string; cycleEnd: string; billingInterval: RenewalBillingInterval;
  recurringPriceBasis: RenewalPriceBasis; recurringUnitPriceMinor: string | null; recurringTotalPriceMinor: string;
  currency: string; seatQuantity: number; company: { id: string; name: string };
  subscription: { id: string; status: RenewalSubscriptionStatus; plan: { id: string; code: string; name: string } };
  payment: { id: string; purpose: 'SUBSCRIPTION_RENEWAL'; status: RenewalPaymentStatus; amountMinor: string; currency: string; provider: RenewalProvider; mode: RenewalProviderMode; capturedAt: string | null };
  preparedBy: { id: string; email: string; firstName: string; lastName: string } | null;
  applicationAttemptCount: number; lastApplicationAttemptAt: string | null; appliedAt: string | null; blockedAt: string | null;
  blockCode: string | null; safeBlockMessage: string | null; createdAt: string; updatedAt: string;
}
export interface PlatformRenewalListResponse { data: PlatformRenewal[]; meta: { page: number; limit: number; total: number; totalPages: number } }

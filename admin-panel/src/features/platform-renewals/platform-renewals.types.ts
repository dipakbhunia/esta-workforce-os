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
export type RenewalTaxTreatment = 'NON_TAXABLE' | 'TAXABLE';
export type RenewalTaxClassification = 'INTRA_STATE' | 'INTER_STATE';
export type RenewalTaxComponentType = 'CGST' | 'SGST' | 'IGST';
export type RenewalProviderOrderStatus = 'CREATED' | 'PAID' | 'CLOSED';
export interface PlatformRenewalDetails extends PlatformRenewal {
  tax: null | { treatment: RenewalTaxTreatment; decisionAt: string; currency: string; taxableSubtotalMinor: string; totalTaxMinor: string; grossTotalMinor: string; jurisdictionClassification: RenewalTaxClassification | null; serviceClassification: string | null; placeOfSupplyState: string | null; placeOfSupplyStateCode: string | null; components: Array<{ type: RenewalTaxComponentType; rateBasisPoints: number; taxableAmountMinor: string; taxAmountMinor: string; currency: string }> };
  providerOrder: null | { id: string; sequence: number; providerOrderId: string; status: RenewalProviderOrderStatus; providerStatus: string; createdAt: string; updatedAt: string };
  invoice: null | { id: string; invoiceNumber: string; issuedAt: string; servicePeriodStart: string; servicePeriodEnd: string; currency: string; subtotalMinor: string; totalTaxMinor: string | null; totalMinor: string };
}

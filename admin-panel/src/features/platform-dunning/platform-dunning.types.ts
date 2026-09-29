export type DunningClassification = 'NOT_DUE' | 'OPEN' | 'RECOVERY_PENDING' | 'RESOLVED' | 'STOPPED';
export type DunningOpenReason = 'PAYMENT_PENDING' | 'PAYMENT_AUTHORIZED' | 'PAYMENT_FAILED';
export type DunningPaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
export type DunningProviderOrderStatus = 'CREATED' | 'PAID' | 'CLOSED';

export interface PlatformDunningListQuery {
  page: number;
  limit: number;
  companyId?: string;
  subscriptionId?: string;
  renewalId?: string;
  paymentId?: string;
  paymentStatus?: 'PENDING' | 'AUTHORIZED' | 'FAILED';
  from?: string;
  to?: string;
}

export interface PlatformDunningListItem {
  active: boolean;
  classification: DunningClassification;
  reason: DunningOpenReason | null;
  dueAt: string;
  renewal: { id: string; status: 'PREPARED' | 'APPLIED' | 'BLOCKED'; cycleStart: string; cycleEnd: string; billingInterval: 'MONTHLY' | 'YEARLY' | 'CUSTOM'; createdAt: string };
  company: { id: string; name: string };
  subscription: { id: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'SUPERSEDED' | 'CANCELLED' | 'EXPIRED'; plan: { id: string; code: string; name: string } };
  payment: { id: string; purpose: 'SUBSCRIPTION_RENEWAL'; status: DunningPaymentStatus; amountMinor: string; currency: string; provider: 'RAZORPAY'; mode: 'TEST' | 'LIVE'; failedAt: string | null; failureCode: string | null; safeFailureMessage: string | null };
  latestProviderOrder: null | { id: string; status: DunningProviderOrderStatus; providerStatus: string; createdAt: string; updatedAt: string };
}

export interface PlatformDunningListResponse {
  evaluationTime: string;
  data: PlatformDunningListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PlatformDunningDetails extends PlatformDunningListItem {
  evaluationTime: string;
  renewal: PlatformDunningListItem['renewal'] & { recurringPriceBasis: 'FIXED_TOTAL' | 'PER_USER_UNIT'; recurringUnitPriceMinor: string | null; recurringTotalPriceMinor: string; currency: string; seatQuantity: number; applicationAttemptCount: number; lastApplicationAttemptAt: string | null; appliedAt: string | null; blockedAt: string | null; blockCode: string | null; safeBlockMessage: string | null; preparedByUserId: string | null };
  payment: PlatformDunningListItem['payment'] & { providerStatus: string | null; authorizedAt: string | null; capturedAt: string | null; createdAt: string; updatedAt: string };
  tax: null | { treatment: 'NON_TAXABLE' | 'TAXABLE'; decisionAt: string; currency: string; taxableSubtotalMinor: string; totalTaxMinor: string; grossTotalMinor: string; jurisdictionClassification: 'INTRA_STATE' | 'INTER_STATE' | null; serviceClassification: string | null; components: Array<{ type: 'CGST' | 'SGST' | 'IGST'; rateBasisPoints: number; taxableAmountMinor: string; taxAmountMinor: string; currency: string }> };
  attempts: { data: Array<{ id: string; sequence: number; operation: 'ORDER_CREATE' | 'CHECKOUT_CONFIRMATION' | 'PROVIDER_PAYMENT' | 'PROVIDER_FETCH' | 'CAPTURE' | 'WEBHOOK' | 'RECONCILIATION'; status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; providerStatus: string | null; failureCode: string | null; safeFailureMessage: string | null; startedAt: string; completedAt: string | null }>; truncated: boolean };
  invoice: null | { id: string; invoiceNumber: string; issuedAt: string; currency: string; subtotalMinor: string; totalTaxMinor: string | null; totalMinor: string };
}

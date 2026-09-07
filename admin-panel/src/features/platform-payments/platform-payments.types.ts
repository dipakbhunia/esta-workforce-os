export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
export type PaymentProviderType = 'RAZORPAY';
export type PaymentProviderMode = 'TEST' | 'LIVE';
export type PaymentPurpose = 'SUBSCRIPTION_ACTIVATION';
export type PaymentProviderOrderStatus = 'CREATED' | 'PAID' | 'CLOSED';
export type PaymentAttemptOperation = 'ORDER_CREATE' | 'CHECKOUT_CONFIRMATION' | 'PROVIDER_PAYMENT' | 'PROVIDER_FETCH' | 'CAPTURE' | 'WEBHOOK' | 'RECONCILIATION';
export type PaymentAttemptStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
export type PaymentProviderEventStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'IGNORED' | 'FAILED';
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'SUPERSEDED' | 'CANCELLED' | 'EXPIRED';
export type SubscriptionActivationSource = 'MANUAL' | 'PAYMENT' | 'TRIAL_CONVERSION' | 'COMPLIMENTARY';
export type PlatformPaymentActivationStatus = 'COMPLETED' | 'BLOCKED' | 'NOT_READY' | 'PENDING' | 'UNRESOLVED';
export type PlatformPaymentAuditAction = 'SUBSCRIPTION_ACTIVATED_BY_PAYMENT' | 'SUBSCRIPTION_PAYMENT_ACTIVATION_BLOCKED' | 'PAYMENT_RECOVERED_AFTER_PROVIDER_FAILURE';

export interface PlatformPaymentListQuery {
  page: number;
  limit: number;
  companyId?: string;
  status?: PaymentStatus;
  provider?: PaymentProviderType;
  mode?: PaymentProviderMode;
  purpose?: PaymentPurpose;
  subscriptionId?: string;
  from?: string;
  to?: string;
}

export interface PlatformPaymentCompany { id: string; name: string; }
export interface PlatformPaymentPlanSnapshot { id: string; code: string; name: string; }
export interface PlatformPaymentSubscriptionSnapshot { id: string; status: SubscriptionStatus; plan: PlatformPaymentPlanSnapshot; }
export interface PlatformPaymentOrderProjection { id: string; sequence: number; providerOrderId: string; status: PaymentProviderOrderStatus; providerStatus: string; }
export interface PlatformPaymentFailure { code: string | null; message: string | null; failedAt: string; }

export interface PlatformPayment {
  id: string;
  company: PlatformPaymentCompany;
  subscription: PlatformPaymentSubscriptionSnapshot;
  purpose: PaymentPurpose;
  amountMinor: string;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProviderType;
  mode: PaymentProviderMode;
  providerStatus: string | null;
  providerOrder: PlatformPaymentOrderProjection | null;
  activation: { status: PlatformPaymentActivationStatus };
  failure: PlatformPaymentFailure | null;
  authorizedAt: string | null;
  capturedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPaymentListResponse {
  data: PlatformPayment[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface BoundedPaymentHistory<T> { data: T[]; truncated: boolean; }
export interface PlatformPaymentOrderHistory { id: string; sequence: number; providerOrderId: string; status: PaymentProviderOrderStatus; providerStatus: string; createdAt: string; updatedAt: string; }
export interface PlatformPaymentAttemptHistory { id: string; sequence: number; operation: PaymentAttemptOperation; status: PaymentAttemptStatus; providerOrderId: string | null; providerPaymentId: string | null; providerStatus: string | null; amountMinor: string; currency: string; failureCode: string | null; safeFailureMessage: string | null; startedAt: string; completedAt: string | null; createdAt: string; updatedAt: string; }
export interface PlatformPaymentProviderEvent { id: string; eventType: string; providerEventId: string | null; status: PaymentProviderEventStatus; providerOrderId: string | null; providerPaymentId: string | null; providerCreatedAt: string | null; receivedAt: string; processedAt: string | null; }
export interface PlatformPaymentAuditEvidence { id: string; action: PlatformPaymentAuditAction; recordedAt: string; }

export interface PlatformPaymentDetails extends Omit<PlatformPayment, 'subscription' | 'providerOrder' | 'failure'> {
  subscription: PlatformPaymentSubscriptionSnapshot & { activationSource: SubscriptionActivationSource; activatedByPaymentId: string | null };
  capturedProviderPaymentId: string | null;
  historicalFailure: (PlatformPaymentFailure & { recovered: boolean }) | null;
  providerOrders: BoundedPaymentHistory<PlatformPaymentOrderHistory>;
  attempts: BoundedPaymentHistory<PlatformPaymentAttemptHistory>;
  providerEvents: BoundedPaymentHistory<PlatformPaymentProviderEvent>;
  auditEvidence: BoundedPaymentHistory<PlatformPaymentAuditEvidence>;
}

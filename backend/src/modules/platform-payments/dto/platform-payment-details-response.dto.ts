import {
  PaymentAttemptOperation,
  PaymentAttemptStatus,
  PaymentProviderEventStatus,
  PaymentProviderMode,
  PaymentProviderOrderStatus,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
  SubscriptionActivationSource,
  SubscriptionStatus,
} from '@prisma/client';
import { PlatformPaymentActivationStatus } from './platform-payment-response.dto';

export interface BoundedHistoryDto<T> { data: T[]; truncated: boolean; }
export interface PlatformPaymentDetailsOrderDto { id: string; sequence: number; providerOrderId: string; status: PaymentProviderOrderStatus; providerStatus: string; createdAt: string; updatedAt: string; }
export interface PlatformPaymentDetailsAttemptDto { id: string; sequence: number; operation: PaymentAttemptOperation; status: PaymentAttemptStatus; providerOrderId: string | null; providerPaymentId: string | null; providerStatus: string | null; amountMinor: string; currency: string; failureCode: string | null; safeFailureMessage: string | null; startedAt: string; completedAt: string | null; createdAt: string; updatedAt: string; }
export interface PlatformPaymentDetailsEventDto { id: string; eventType: string; providerEventId: string | null; status: PaymentProviderEventStatus; providerOrderId: string | null; providerPaymentId: string | null; providerCreatedAt: string | null; receivedAt: string; processedAt: string | null; }
export interface PlatformPaymentAuditEvidenceDto { id: string; action: PlatformPaymentAuditAction; recordedAt: string; }
export type PlatformPaymentAuditAction = 'SUBSCRIPTION_ACTIVATED_BY_PAYMENT' | 'SUBSCRIPTION_PAYMENT_ACTIVATION_BLOCKED' | 'PAYMENT_RECOVERED_AFTER_PROVIDER_FAILURE';

export interface PlatformPaymentDetailsResponseDto {
  id: string;
  company: { id: string; name: string };
  subscription: { id: string; status: SubscriptionStatus; plan: { id: string; code: string; name: string }; activationSource: SubscriptionActivationSource; activatedByPaymentId: string | null };
  purpose: PaymentPurpose;
  amountMinor: string;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProviderType;
  mode: PaymentProviderMode;
  providerStatus: string | null;
  authorizedAt: string | null;
  capturedAt: string | null;
  failedAt: string | null;
  capturedProviderPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
  historicalFailure: { code: string | null; message: string | null; failedAt: string; recovered: boolean } | null;
  activation: { status: PlatformPaymentActivationStatus };
  providerOrders: BoundedHistoryDto<PlatformPaymentDetailsOrderDto>;
  attempts: BoundedHistoryDto<PlatformPaymentDetailsAttemptDto>;
  providerEvents: BoundedHistoryDto<PlatformPaymentDetailsEventDto>;
  auditEvidence: BoundedHistoryDto<PlatformPaymentAuditEvidenceDto>;
}

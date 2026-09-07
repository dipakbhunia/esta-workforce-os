import { PaymentStatus, SubscriptionActivationSource, SubscriptionStatus } from '@prisma/client';
import { PlatformPaymentActivationStatus } from './dto/platform-payment-response.dto';

export interface PlatformPaymentActivationInput {
  paymentId: string;
  paymentStatus: PaymentStatus;
  capturedAt: Date | null;
  capturedProviderPaymentId: string | null;
  subscription: {
    activationSource: SubscriptionActivationSource;
    status: SubscriptionStatus;
    activatedByPaymentId: string | null;
  };
  hasMatchingBlockedAudit: boolean;
}

export function derivePlatformPaymentActivationStatus(
  input: PlatformPaymentActivationInput,
): PlatformPaymentActivationStatus {
  if (input.subscription.activatedByPaymentId === input.paymentId) {
    return PlatformPaymentActivationStatus.COMPLETED;
  }
  if (input.hasMatchingBlockedAudit) return PlatformPaymentActivationStatus.BLOCKED;
  if (input.paymentStatus !== PaymentStatus.CAPTURED) {
    return PlatformPaymentActivationStatus.NOT_READY;
  }
  if (
    input.capturedAt &&
    input.capturedProviderPaymentId?.trim() &&
    input.subscription.activationSource === SubscriptionActivationSource.PAYMENT &&
    input.subscription.status === SubscriptionStatus.PENDING &&
    input.subscription.activatedByPaymentId === null
  ) {
    return PlatformPaymentActivationStatus.PENDING;
  }
  return PlatformPaymentActivationStatus.UNRESOLVED;
}

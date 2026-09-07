import {
  PaymentProviderMode,
  PaymentProviderOrderStatus,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
  SubscriptionActivationSource,
  SubscriptionStatus,
} from '@prisma/client';
import { PlatformPaymentResponseDto } from './dto/platform-payment-response.dto';
import { derivePlatformPaymentActivationStatus } from './platform-payment-activation.util';

export function mapPlatformPayment(
  payment: PlatformPaymentRow,
  providerOrder: PlatformPaymentOrderRow | null,
  hasMatchingBlockedAudit: boolean,
): PlatformPaymentResponseDto {
  return {
    id: payment.id,
    company: { id: payment.company.id, name: payment.company.name },
    subscription: {
      id: payment.subscription.id,
      status: payment.subscription.status,
      plan: {
        id: payment.subscription.planId,
        code: payment.subscription.planCodeSnapshot,
        name: payment.subscription.planNameSnapshot,
      },
    },
    purpose: payment.purpose,
    amountMinor: payment.amountMinor.toString(10),
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    mode: payment.providerMode,
    providerStatus: payment.providerStatus,
    providerOrder: providerOrder
      ? {
          id: providerOrder.id,
          sequence: providerOrder.sequence,
          providerOrderId: providerOrder.providerOrderId,
          status: providerOrder.status,
          providerStatus: providerOrder.providerStatus,
        }
      : null,
    activation: {
      status: derivePlatformPaymentActivationStatus({
        paymentId: payment.id,
        paymentStatus: payment.status,
        capturedAt: payment.capturedAt,
        capturedProviderPaymentId: payment.capturedProviderPaymentId,
        subscription: payment.subscription,
        hasMatchingBlockedAudit,
      }),
    },
    failure:
      payment.status === PaymentStatus.FAILED
        ? {
            code: payment.failureCode,
            message: payment.safeFailureMessage,
            failedAt: payment.failedAt!.toISOString(),
          }
        : null,
    authorizedAt: payment.authorizedAt?.toISOString() ?? null,
    capturedAt: payment.capturedAt?.toISOString() ?? null,
    failedAt: payment.failedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

export interface PlatformPaymentRow {
  id: string;
  purpose: PaymentPurpose;
  amountMinor: bigint;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProviderType;
  providerMode: PaymentProviderMode;
  providerStatus: string | null;
  failureCode: string | null;
  safeFailureMessage: string | null;
  authorizedAt: Date | null;
  capturedAt: Date | null;
  failedAt: Date | null;
  capturedProviderPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  company: { id: string; name: string };
  subscription: {
    id: string;
    status: SubscriptionStatus;
    activationSource: SubscriptionActivationSource;
    activatedByPaymentId: string | null;
    planId: string;
    planCodeSnapshot: string;
    planNameSnapshot: string;
  };
}

export interface PlatformPaymentOrderRow {
  id: string;
  sequence: number;
  providerOrderId: string;
  status: PaymentProviderOrderStatus;
  providerStatus: string;
}

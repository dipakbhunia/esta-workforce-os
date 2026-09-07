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
import {
  PlatformPaymentAuditAction,
  PlatformPaymentDetailsResponseDto,
} from './dto/platform-payment-details-response.dto';
import { derivePlatformPaymentActivationStatus } from './platform-payment-activation.util';

export const PLATFORM_PAYMENT_HISTORY_LIMITS = { orders: 25, attempts: 100, events: 100, audits: 20 } as const;

export function mapPlatformPaymentDetails(input: PlatformPaymentDetailsInput): PlatformPaymentDetailsResponseDto {
  const payment = input.payment;
  return {
    id: payment.id,
    company: { id: payment.company.id, name: payment.company.name },
    subscription: {
      id: payment.subscription.id,
      status: payment.subscription.status,
      plan: { id: payment.subscription.planId, code: payment.subscription.planCodeSnapshot, name: payment.subscription.planNameSnapshot },
      activationSource: payment.subscription.activationSource,
      activatedByPaymentId: payment.subscription.activatedByPaymentId,
    },
    purpose: payment.purpose,
    amountMinor: payment.amountMinor.toString(10),
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    mode: payment.providerMode,
    providerStatus: payment.providerStatus,
    authorizedAt: iso(payment.authorizedAt),
    capturedAt: iso(payment.capturedAt),
    failedAt: iso(payment.failedAt),
    capturedProviderPaymentId: payment.capturedProviderPaymentId,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    historicalFailure: payment.failedAt ? {
      code: payment.failureCode,
      message: payment.safeFailureMessage,
      failedAt: payment.failedAt.toISOString(),
      recovered: payment.status === PaymentStatus.CAPTURED,
    } : null,
    activation: { status: derivePlatformPaymentActivationStatus({
      paymentId: payment.id,
      paymentStatus: payment.status,
      capturedAt: payment.capturedAt,
      capturedProviderPaymentId: payment.capturedProviderPaymentId,
      subscription: payment.subscription,
      hasMatchingBlockedAudit: input.hasMatchingBlockedAudit,
    }) },
    providerOrders: bounded(input.orders, PLATFORM_PAYMENT_HISTORY_LIMITS.orders, (row) => ({
      id: row.id, sequence: row.sequence, providerOrderId: row.providerOrderId, status: row.status,
      providerStatus: row.providerStatus, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    })),
    attempts: bounded(input.attempts, PLATFORM_PAYMENT_HISTORY_LIMITS.attempts, (row) => ({
      id: row.id, sequence: row.sequence, operation: row.operation, status: row.status,
      providerOrderId: row.providerOrderId, providerPaymentId: row.providerPaymentId, providerStatus: row.providerStatus,
      amountMinor: row.amountMinor.toString(10), currency: row.currency, failureCode: row.failureCode,
      safeFailureMessage: row.safeFailureMessage, startedAt: row.startedAt.toISOString(), completedAt: iso(row.completedAt),
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    })),
    providerEvents: bounded(input.events, PLATFORM_PAYMENT_HISTORY_LIMITS.events, (row) => ({
      id: row.id, eventType: row.eventType, providerEventId: row.providerEventId, status: row.status,
      providerOrderId: row.providerOrderId, providerPaymentId: row.providerPaymentId,
      providerCreatedAt: iso(row.providerCreatedAt), receivedAt: row.receivedAt.toISOString(), processedAt: iso(row.processedAt),
    })),
    auditEvidence: bounded(input.audits, PLATFORM_PAYMENT_HISTORY_LIMITS.audits, (row) => ({
      id: row.id, action: row.action as PlatformPaymentAuditAction, recordedAt: row.createdAt.toISOString(),
    })),
  };
}

function iso(value: Date | null): string | null { return value?.toISOString() ?? null; }
function bounded<T, R>(rows: T[], limit: number, mapper: (row: T) => R) {
  return { data: rows.slice(0, limit).map(mapper), truncated: rows.length > limit };
}

export interface PlatformPaymentDetailsInput {
  payment: DetailsPaymentRow;
  orders: DetailsOrderRow[];
  attempts: DetailsAttemptRow[];
  events: DetailsEventRow[];
  audits: DetailsAuditRow[];
  hasMatchingBlockedAudit: boolean;
}
export interface DetailsPaymentRow {
  id: string; purpose: PaymentPurpose; amountMinor: bigint; currency: string; status: PaymentStatus;
  provider: PaymentProviderType; providerMode: PaymentProviderMode; providerStatus: string | null;
  authorizedAt: Date | null; capturedAt: Date | null; failedAt: Date | null; capturedProviderPaymentId: string | null;
  failureCode: string | null; safeFailureMessage: string | null; createdAt: Date; updatedAt: Date;
  company: { id: string; name: string };
  subscription: { id: string; status: SubscriptionStatus; planId: string; planCodeSnapshot: string; planNameSnapshot: string; activationSource: SubscriptionActivationSource; activatedByPaymentId: string | null };
}
export interface DetailsOrderRow { id: string; sequence: number; providerOrderId: string; status: PaymentProviderOrderStatus; providerStatus: string; createdAt: Date; updatedAt: Date; }
export interface DetailsAttemptRow { id: string; sequence: number; operation: PaymentAttemptOperation; status: PaymentAttemptStatus; providerOrderId: string | null; providerPaymentId: string | null; providerStatus: string | null; amountMinor: bigint; currency: string; failureCode: string | null; safeFailureMessage: string | null; startedAt: Date; completedAt: Date | null; createdAt: Date; updatedAt: Date; }
export interface DetailsEventRow { id: string; eventType: string; providerEventId: string | null; status: PaymentProviderEventStatus; providerOrderId: string | null; providerPaymentId: string | null; providerCreatedAt: Date | null; receivedAt: Date; processedAt: Date | null; }
export interface DetailsAuditRow { id: string; action: string; createdAt: Date; }

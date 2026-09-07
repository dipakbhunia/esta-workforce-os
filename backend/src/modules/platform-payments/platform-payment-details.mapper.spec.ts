import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PaymentAttemptOperation, PaymentAttemptStatus, PaymentProviderEventStatus, PaymentProviderMode,
  PaymentProviderOrderStatus, PaymentProviderType, PaymentPurpose, PaymentStatus,
  SubscriptionActivationSource, SubscriptionStatus,
} from '@prisma/client';
import { mapPlatformPaymentDetails } from './platform-payment-details.mapper';

const time = new Date('2026-09-07T10:00:00Z');
function input(status = PaymentStatus.CAPTURED, failedAt: Date | null = null) {
  const orders = Array.from({ length: 26 }, (_, i) => ({ id: `order-${i}`, sequence: 26 - i, providerOrderId: `provider-order-${i}`, status: i === 0 ? PaymentProviderOrderStatus.CLOSED : PaymentProviderOrderStatus.CREATED, providerStatus: i === 0 ? 'closed' : 'created', createdAt: time, updatedAt: time }));
  const attempts = Array.from({ length: 101 }, (_, i) => ({ id: `attempt-${i}`, sequence: 101 - i, operation: PaymentAttemptOperation.WEBHOOK, status: PaymentAttemptStatus.SUCCEEDED, providerOrderId: `provider-order-${i}`, providerPaymentId: `provider-payment-${i}`, providerStatus: 'captured', amountMinor: 99000n, currency: 'INR', failureCode: null, safeFailureMessage: null, startedAt: time, completedAt: time, createdAt: time, updatedAt: time }));
  const events = Array.from({ length: 101 }, (_, i) => ({ id: `event-${i}`, eventType: 'payment.captured', providerEventId: `provider-event-${i}`, status: PaymentProviderEventStatus.PROCESSED, providerOrderId: `provider-order-${i}`, providerPaymentId: `provider-payment-${i}`, providerCreatedAt: time, receivedAt: time, processedAt: time }));
  const audits = Array.from({ length: 21 }, (_, i) => ({ id: `audit-${i}`, action: 'PAYMENT_RECOVERED_AFTER_PROVIDER_FAILURE', createdAt: time }));
  return {
    payment: {
      id: 'payment-1', purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, amountMinor: 99000n, currency: 'INR', status,
      provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST, providerStatus: 'captured',
      authorizedAt: null, capturedAt: status === PaymentStatus.CAPTURED ? time : null, failedAt,
      capturedProviderPaymentId: status === PaymentStatus.CAPTURED ? 'pay_1' : null,
      failureCode: failedAt ? 'OLD_FAILURE' : null, safeFailureMessage: failedAt ? 'Historical failure' : null,
      createdAt: time, updatedAt: time, company: { id: 'company-1', name: 'Company One' },
      subscription: { id: 'subscription-1', status: SubscriptionStatus.PENDING, planId: 'plan-1', planCodeSnapshot: 'HISTORIC', planNameSnapshot: 'Historic Plan', activationSource: SubscriptionActivationSource.PAYMENT, activatedByPaymentId: null },
    }, orders, attempts, events, audits, hasMatchingBlockedAudit: false,
  };
}

describe('mapPlatformPaymentDetails', () => {
  it('maps core truth, immutable snapshots, nullable timestamps, and bounded histories', () => {
    const result = mapPlatformPaymentDetails(input());
    assert.equal(result.amountMinor, '99000');
    assert.deepEqual(result.company, { id: 'company-1', name: 'Company One' });
    assert.deepEqual(result.subscription.plan, { id: 'plan-1', code: 'HISTORIC', name: 'Historic Plan' });
    assert.equal(result.authorizedAt, null);
    assert.equal(result.capturedProviderPaymentId, 'pay_1');
    assert.deepEqual([result.providerOrders.data.length, result.attempts.data.length, result.providerEvents.data.length, result.auditEvidence.data.length], [25, 100, 100, 20]);
    assert.ok(result.providerOrders.truncated && result.attempts.truncated && result.providerEvents.truncated && result.auditEvidence.truncated);
    assert.equal(result.providerOrders.data[0].status, PaymentProviderOrderStatus.CLOSED);
    assert.equal(result.attempts.data[0].amountMinor, '99000');
    assert.equal(result.auditEvidence.data[0].recordedAt, time.toISOString());
  });

  it('maps absent, current, and recovered historical failure evidence correctly', () => {
    assert.equal(mapPlatformPaymentDetails(input()).historicalFailure, null);
    const failed = mapPlatformPaymentDetails(input(PaymentStatus.FAILED, time));
    assert.deepEqual(failed.historicalFailure, { code: 'OLD_FAILURE', message: 'Historical failure', failedAt: time.toISOString(), recovered: false });
    const recovered = mapPlatformPaymentDetails(input(PaymentStatus.CAPTURED, time));
    assert.equal(recovered.historicalFailure?.recovered, true);
  });

  it('strictly allowlists serialized history and excludes sensitive source fields', () => {
    const serialized = JSON.stringify(mapPlatformPaymentDetails(input(PaymentStatus.CAPTURED, time)));
    for (const field of ['credentialVersionId', 'providerConfigurationId', 'normalizedPayload', 'payloadHash', 'signatureVerifiedAt', 'safeMetadata', 'requestReference', 'idempotencyKey', 'businessReference', 'processingStartedAt', 'nextRetryAt', 'webhookSecret', 'keySecret']) {
      assert.equal(serialized.includes(field), false);
    }
  });
});

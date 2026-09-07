import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentStatus, SubscriptionActivationSource, SubscriptionStatus } from '@prisma/client';
import { PlatformPaymentActivationStatus as Result } from './dto/platform-payment-response.dto';
import { derivePlatformPaymentActivationStatus } from './platform-payment-activation.util';

const base = {
  paymentId: 'payment-1', paymentStatus: PaymentStatus.CAPTURED,
  capturedAt: new Date(), capturedProviderPaymentId: 'pay_external',
  subscription: { activationSource: SubscriptionActivationSource.PAYMENT, status: SubscriptionStatus.PENDING, activatedByPaymentId: null },
  hasMatchingBlockedAudit: false,
};

describe('derivePlatformPaymentActivationStatus', () => {
  it('implements the locked precedence and all five states', () => {
    assert.equal(derivePlatformPaymentActivationStatus({ ...base, subscription: { ...base.subscription, status: SubscriptionStatus.CANCELLED, activatedByPaymentId: 'payment-1' }, hasMatchingBlockedAudit: true }), Result.COMPLETED);
    assert.equal(derivePlatformPaymentActivationStatus({ ...base, hasMatchingBlockedAudit: true }), Result.BLOCKED);
    assert.equal(derivePlatformPaymentActivationStatus({ ...base, paymentStatus: PaymentStatus.FAILED }), Result.NOT_READY);
    assert.equal(derivePlatformPaymentActivationStatus(base), Result.PENDING);
    assert.equal(derivePlatformPaymentActivationStatus({ ...base, capturedProviderPaymentId: null }), Result.UNRESOLVED);
  });
});

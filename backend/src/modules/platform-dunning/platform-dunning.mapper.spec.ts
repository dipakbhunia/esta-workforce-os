import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BillingInterval, PaymentAttemptOperation, PaymentAttemptStatus, PaymentProviderMode, PaymentProviderOrderStatus, PaymentProviderType, PaymentPurpose, PaymentStatus, RecurringPriceBasis, SubscriptionRenewalStatus, SubscriptionStatus } from '@prisma/client';
import { mapDunningDetails, platformDunningDetailSelect } from './platform-dunning.mapper';

const at = new Date('2026-09-28T12:00:00Z');
function detailRow(): any {
  return { id: 'r', companyId: 'c', subscriptionId: 's', paymentId: 'p', status: SubscriptionRenewalStatus.PREPARED,
    cycleStart: at, cycleEnd: new Date('2026-10-28T12:00:00Z'), billingInterval: BillingInterval.MONTHLY,
    recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 900719925474099312345n,
    recurringTotalPriceMinor: 900719925474099312345n, currency: 'INR', seatQuantity: 1, preparedByUserId: null,
    applicationAttemptCount: 0, lastApplicationAttemptAt: null, appliedAt: null, blockedAt: null, blockCode: null,
    safeBlockMessage: null, createdAt: at, company: { id: 'c', name: 'Company' },
    subscription: { id: 's', companyId: 'c', status: SubscriptionStatus.ACTIVE, planId: 'plan', planCodeSnapshot: 'PRO', planNameSnapshot: 'Pro' },
    payment: { id: 'p', companyId: 'c', subscriptionId: 's', purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL,
      status: PaymentStatus.FAILED, amountMinor: 900719925474099312345n, currency: 'INR', provider: PaymentProviderType.RAZORPAY,
      providerMode: PaymentProviderMode.TEST, providerStatus: 'failed', failedAt: at, failureCode: 'DECLINED',
      safeFailureMessage: 'Declined', authorizedAt: null, capturedAt: null, createdAt: at, updatedAt: at,
      orders: [{ id: 'o', status: PaymentProviderOrderStatus.CREATED, providerStatus: 'created', createdAt: at, updatedAt: at }],
      attempts: Array.from({ length: 26 }, (_, i) => ({ id: `a${i}`, sequence: 26 - i, operation: PaymentAttemptOperation.PROVIDER_FETCH,
        status: PaymentAttemptStatus.FAILED, providerStatus: null, failureCode: null, safeFailureMessage: null, startedAt: at, completedAt: null })),
      taxSnapshot: null, invoice: null } };
}

describe('Dunning detail mapper', () => {
  it('serializes exact money, preserves nullable evidence and bounds attempts safely', () => {
    const result = mapDunningDetails(detailRow(), at);
    assert.equal(result.payment.amountMinor, '900719925474099312345'); assert.equal(result.renewal.recurringUnitPriceMinor, '900719925474099312345');
    assert.equal(result.attempts.data.length, 25); assert.equal(result.attempts.truncated, true);
    assert.equal(result.tax, null); assert.equal(result.invoice, null); assert.equal(result.reason, 'PAYMENT_FAILED');
    assert.equal(result.dueAt, at.toISOString()); assert.equal(result.evaluationTime, at.toISOString());
    const serialized = JSON.stringify(result);
    for (const forbidden of ['providerOrderId', 'providerConfigurationId', 'credentialVersionId', 'requestReference', 'safeMetadata', 'rawResponse']) assert.equal(serialized.includes(forbidden), false);
  });
  it('maps absent attempts as an empty untruncated collection', () => {
    const input = detailRow(); input.payment.attempts = [];
    assert.deepEqual(mapDunningDetails(input, at).attempts, { data: [], truncated: false });
  });
  it('maps deterministic latest CLOSED provider evidence using only safe fields', () => {
    assert.deepEqual(platformDunningDetailSelect.payment.select.orders.orderBy, [{ sequence: 'desc' }, { id: 'desc' }]);
    assert.equal(platformDunningDetailSelect.payment.select.orders.take, 1);
    const input = detailRow();
    input.payment.orders = [
      { id: 'higher', status: PaymentProviderOrderStatus.CLOSED, providerStatus: 'closed', createdAt: at, updatedAt: at },
      { id: 'lower', status: PaymentProviderOrderStatus.CREATED, providerStatus: 'created', createdAt: at, updatedAt: at },
    ];
    assert.deepEqual(mapDunningDetails(input, at).latestProviderOrder, {
      id: 'higher', status: PaymentProviderOrderStatus.CLOSED, providerStatus: 'closed', createdAt: at.toISOString(), updatedAt: at.toISOString(),
    });
  });
  it('maps every detail classification and nulls all non-OPEN reasons', () => {
    const cases: Array<[any, string, boolean, string | null]> = [];
    const notDue = detailRow(); notDue.cycleStart = new Date(at.getTime() + 1); notDue.payment.status = PaymentStatus.PENDING;
    cases.push([notDue, 'NOT_DUE', false, null]);
    const open = detailRow(); open.payment.status = PaymentStatus.PENDING; cases.push([open, 'OPEN', true, 'PAYMENT_PENDING']);
    const recovery = detailRow(); recovery.payment.status = PaymentStatus.CAPTURED; cases.push([recovery, 'RECOVERY_PENDING', false, null]);
    const resolved = detailRow(); resolved.status = SubscriptionRenewalStatus.APPLIED; resolved.payment.status = PaymentStatus.CAPTURED; cases.push([resolved, 'RESOLVED', false, null]);
    const stopped = detailRow(); stopped.status = SubscriptionRenewalStatus.BLOCKED; cases.push([stopped, 'STOPPED', false, null]);
    for (const [input, classification, active, reason] of cases) {
      const result = mapDunningDetails(input, at); assert.equal(result.classification, classification);
      assert.equal(result.active, active); assert.equal(result.reason, reason);
    }
  });
});

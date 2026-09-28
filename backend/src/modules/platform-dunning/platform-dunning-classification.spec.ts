import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentPurpose, PaymentStatus, SubscriptionRenewalStatus, SubscriptionStatus } from '@prisma/client';
import { classifyDunning } from './platform-dunning-classification';
import { DunningIntegrityError, DunningLineage } from './platform-dunning.types';

const now = new Date('2026-09-28T12:00:00.000Z');
function lineage(renewalStatus = SubscriptionRenewalStatus.PREPARED, paymentStatus = PaymentStatus.PENDING,
  subscriptionStatus = SubscriptionStatus.ACTIVE, cycleStart = now): DunningLineage {
  return { renewal: { id: 'r', companyId: 'c', subscriptionId: 's', paymentId: 'p', status: renewalStatus, cycleStart },
    payment: { id: 'p', companyId: 'c', subscriptionId: 's', purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: paymentStatus },
    subscription: { id: 's', companyId: 'c', status: subscriptionStatus } };
}

describe('Dunning classification', () => {
  it('handles the due boundary and open reasons', () => {
    assert.equal(classifyDunning(lineage(undefined, undefined, undefined, new Date(now.getTime() + 1)), now).classification, 'NOT_DUE');
    assert.deepEqual(classifyDunning(lineage(), now), { active: true, classification: 'OPEN', reason: 'PAYMENT_PENDING' });
    assert.equal(classifyDunning(lineage(undefined, PaymentStatus.AUTHORIZED), now).reason, 'PAYMENT_AUTHORIZED');
    assert.equal(classifyDunning(lineage(undefined, PaymentStatus.FAILED), now).reason, 'PAYMENT_FAILED');
  });
  it('handles captured, applied, blocked, stopped and expired truth', () => {
    assert.equal(classifyDunning(lineage(undefined, PaymentStatus.CAPTURED), now).classification, 'RECOVERY_PENDING');
    assert.equal(classifyDunning(lineage(SubscriptionRenewalStatus.APPLIED, PaymentStatus.CAPTURED), now).classification, 'RESOLVED');
    assert.equal(classifyDunning(lineage(SubscriptionRenewalStatus.BLOCKED), now).classification, 'STOPPED');
    assert.equal(classifyDunning(lineage(undefined, undefined, SubscriptionStatus.CANCELLED), now).classification, 'STOPPED');
    assert.equal(classifyDunning(lineage(undefined, undefined, SubscriptionStatus.SUPERSEDED), now).classification, 'STOPPED');
    assert.equal(classifyDunning(lineage(undefined, undefined, SubscriptionStatus.EXPIRED), now).classification, 'OPEN');
  });
  it('rejects incoherent lineage and never lets historical failure override captured truth', () => {
    assert.throws(() => classifyDunning(lineage(undefined, undefined, SubscriptionStatus.PENDING), now), DunningIntegrityError);
    assert.throws(() => classifyDunning(lineage(SubscriptionRenewalStatus.APPLIED), now), DunningIntegrityError);
    assert.equal(classifyDunning(lineage(undefined, PaymentStatus.CAPTURED), now).active, false);
    const bad = lineage(); bad.payment.companyId = 'other';
    assert.throws(() => classifyDunning(bad, now), DunningIntegrityError);
  });
  it('rejects ownership, subscription and purpose contradictions with a sanitized error', () => {
    const cases = [
      () => { const value = lineage(); value.payment.companyId = 'secret-company'; return value; },
      () => { const value = lineage(); value.payment.subscriptionId = 'secret-subscription'; return value; },
      () => { const value = lineage(); value.subscription.companyId = 'secret-owner'; return value; },
      () => { const value = lineage(); value.payment.purpose = PaymentPurpose.SUBSCRIPTION_ACTIVATION; return value; },
      () => lineage(undefined, undefined, SubscriptionStatus.PENDING),
    ];
    for (const make of cases) assert.throws(() => classifyDunning(make(), now), (error: unknown) => {
      assert.ok(error instanceof DunningIntegrityError);
      assert.equal(error.message, 'Dunning evidence is inconsistent');
      assert.equal(error.publicMessage, 'Dunning evidence is inconsistent');
      for (const unsafe of ['secret-', 'Prisma', 'SQL', 'raw provider', 'credential', 'configuration']) assert.equal(error.message.includes(unsafe), false);
      return true;
    });
  });
});

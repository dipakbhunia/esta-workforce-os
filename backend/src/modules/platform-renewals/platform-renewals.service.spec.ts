import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, InternalServerErrorException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  BillingInterval, PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus, PlanBillingModel,
  RecurringPriceBasis, SubscriptionActivationSource, SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';
import { RenewalPreparationError } from '../subscriptions/subscription-renewal-preparation.service';
import { PlatformRenewalsService } from './platform-renewals.service';

const row = (status = SubscriptionRenewalStatus.PREPARED) => ({ id: 'renewal', status,
  cycleStart: new Date('2026-10-01Z'), cycleEnd: new Date('2026-11-01Z'), billingInterval: BillingInterval.MONTHLY,
  recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 900719925474099n,
  recurringTotalPriceMinor: 9007199254740990n, currency: 'INR', seatQuantity: 10, applicationAttemptCount: 0,
  lastApplicationAttemptAt: null, appliedAt: null, blockedAt: null, blockCode: null, safeBlockMessage: null,
  createdAt: new Date('2026-09-01Z'), updatedAt: new Date('2026-09-01Z'), company: { id: 'company', name: 'Company' },
  subscription: { id: 'subscription', status: SubscriptionStatus.ACTIVE, planId: 'plan', planCodeSnapshot: 'P', planNameSnapshot: 'Plan',
    billingModelSnapshot: PlanBillingModel.PER_USER, activationSource: SubscriptionActivationSource.PAYMENT },
  payment: { id: 'payment', purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: PaymentStatus.PENDING,
    amountMinor: 9007199254740990n, currency: 'INR', provider: PaymentProviderType.RAZORPAY,
    providerMode: PaymentProviderMode.TEST, capturedAt: null }, preparedBy: null });

function harness(options: { rows?: any[]; found?: any; preparationError?: Error; application?: any; applicationError?: Error } = {}) {
  const calls: any[] = [];
  const prisma: any = { subscriptionRenewal: { findUnique: async (args: any) => { calls.push(args); return options.found; } },
    $transaction: async (callback: (tx: any) => unknown, config: unknown) => { calls.push(config); return callback({ subscriptionRenewal: {
      findMany: async (args: any) => { calls.push(args); return options.rows ?? [row()]; }, count: async (args: any) => { calls.push(args); return (options.rows ?? [row()]).length; } } }); } };
  const preparation = { prepare: async (...args: any[]) => { calls.push(args); if (options.preparationError) throw options.preparationError; return { created: true }; } };
  const application = { apply: async (id: string) => { calls.push(id); if (options.applicationError) throw options.applicationError;
    return options.application ?? { outcome: 'APPLIED', renewalId: 'renewal', subscriptionId: 'subscription', recoveredAfterExpiration: false }; } };
  return { service: new PlatformRenewalsService(prisma, preparation as never, application as never), calls };
}

describe('PlatformRenewalsService', () => {
  it('performs deterministic filtered pagination in repeatable read and serializes BigInt', async () => {
    const h = harness(); const result = await h.service.findAll({ page: 1, limit: 20, companyId: 'company',
      subscriptionId: 'subscription', paymentId: 'payment', status: SubscriptionRenewalStatus.PREPARED,
      billingInterval: BillingInterval.MONTHLY, from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' } as never);
    assert.equal(result.data[0]!.recurringTotalPriceMinor, '9007199254740990');
    const find = h.calls.find(call => call?.orderBy); assert.deepEqual(find.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.deepEqual({ companyId: find.where.companyId, subscriptionId: find.where.subscriptionId, paymentId: find.where.paymentId,
      status: find.where.status, billingInterval: find.where.billingInterval }, { companyId: 'company', subscriptionId: 'subscription',
      paymentId: 'payment', status: SubscriptionRenewalStatus.PREPARED, billingInterval: BillingInterval.MONTHLY });
    assert.deepEqual(find.where.createdAt, { gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2027-01-01T00:00:00Z') });
  });

  it('uses the bounded detail projection and rejects a missing renewal', async () => {
    const h = harness({ found: null });
    await assert.rejects(() => h.service.findOne('missing'), NotFoundException);
    assert.ok(h.calls[0].select.payment.select.orders.take === 1);
  });

  it('delegates preparation with MANUAL source and maps known failures safely', async () => {
    const ok = harness(); await ok.service.prepare('subscription', 'actor');
    assert.deepEqual(ok.calls.at(-1), ['subscription', { source: 'MANUAL', actorUserId: 'actor' }]);
    await assert.rejects(() => harness({ preparationError: new RenewalPreparationError('SUBSCRIPTION_NOT_FOUND', 'missing') }).service.prepare('x', 'a'), NotFoundException);
    await assert.rejects(() => harness({ preparationError: new RenewalPreparationError('UNSUPPORTED_INTERVAL', 'unsupported') }).service.prepare('x', 'a'), UnprocessableEntityException);
  });

  it('delegates the exact Payment for PREPARED recovery and rejects not-ready or blocked outcomes', async () => {
    const renewal = { id: 'renewal', subscriptionId: 'subscription', paymentId: 'payment', status: SubscriptionRenewalStatus.PREPARED };
    const ok = harness({ found: renewal }); assert.equal((await ok.service.recover('renewal')).outcome, 'APPLIED'); assert.equal(ok.calls.at(-1), 'payment');
    await assert.rejects(() => harness({ found: renewal, application: { outcome: 'NOT_READY', renewalId: 'renewal', paymentStatus: PaymentStatus.PENDING } }).service.recover('renewal'), ConflictException);
    await assert.rejects(() => harness({ found: renewal, application: { outcome: 'BLOCKED', renewalId: 'renewal', subscriptionId: 'subscription', code: 'INCOMPATIBLE_SUBSCRIPTION_STATE' } }).service.recover('renewal'), ConflictException);
  });

  it('delegates APPLIED replay reconciliation using its exact Payment and does not hide inconsistent evidence', async () => {
    const found = { id: 'renewal', subscriptionId: 'subscription', paymentId: 'payment', status: SubscriptionRenewalStatus.APPLIED };
    const applied = harness({ found, application: { outcome: 'ALREADY_APPLIED', renewalId: 'renewal', subscriptionId: 'subscription', recoveredAfterExpiration: false } });
    assert.equal((await applied.service.recover('renewal')).outcome, 'ALREADY_APPLIED'); assert.equal(applied.calls.at(-1), 'payment');
    const inconsistent = harness({ found, applicationError: new Error('Applied renewal evidence conflicts with subscription state') });
    await assert.rejects(() => inconsistent.service.recover('renewal'), InternalServerErrorException);
    assert.equal(inconsistent.calls.at(-1), 'payment');
    await assert.rejects(() => harness({ found: null }).service.recover('missing'), NotFoundException);
  });
});

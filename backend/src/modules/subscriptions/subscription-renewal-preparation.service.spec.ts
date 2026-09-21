import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BillingInterval, PaymentPurpose, PaymentStatus, RecurringPriceBasis,
  SubscriptionActivationSource, SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';
import {
  advanceRenewalPeriod, RenewalPreparationError, SubscriptionRenewalPreparationService,
} from './subscription-renewal-preparation.service';

const subscriptionId = '00000000-0000-4000-8000-000000000001';
const companyId = '00000000-0000-4000-8000-000000000002';
const paymentId = '00000000-0000-4000-8000-000000000003';
const renewalId = '00000000-0000-4000-8000-000000000004';

describe('SubscriptionRenewalPreparationService', () => {
  it('advances monthly and yearly periods with UTC clamp and exact time preservation', () => {
    assert.equal(advanceRenewalPeriod(new Date('2030-01-31T12:34:56.789Z'), BillingInterval.MONTHLY).toISOString(), '2030-02-28T12:34:56.789Z');
    assert.equal(advanceRenewalPeriod(new Date('2032-02-29T12:34:56.789Z'), BillingInterval.YEARLY).toISOString(), '2033-02-28T12:34:56.789Z');
  });

  it('prepares an immutable cycle and renewal Payment without consulting Plan pricing', async () => {
    const h = harness();
    const result = await h.service.prepare(subscriptionId, { source: 'MANUAL', actorUserId: 'actor' });
    assert.equal(result.created, true);
    assert.equal(h.paymentInputs.length, 1);
    assert.equal(h.paymentInputs[0].recurringTotalPriceMinor, 1_000n);
    assert.equal(h.createdRenewals[0].paymentId, paymentId);
    assert.equal(h.createdRenewals[0].status, SubscriptionRenewalStatus.PREPARED);
    assert.equal(h.auditActions.filter(action => action === 'SUBSCRIPTION_RENEWAL_PREPARED').length, 1);
    assert.equal(h.providerPaymentIds[0], paymentId);
  });

  it('supports YEARLY and rejects all ineligible or incomplete subscription states', async () => {
    const yearly = harness({ billingInterval: BillingInterval.YEARLY, pricingInterval: BillingInterval.YEARLY,
      currentPeriodEnd: new Date('2032-02-29T01:02:03.004Z') });
    assert.equal((await yearly.service.prepare(subscriptionId, { source: 'MANUAL' })).cycleEnd.toISOString(), '2033-02-28T01:02:03.004Z');
    const invalid = [
      { status: SubscriptionStatus.SUSPENDED }, { status: SubscriptionStatus.EXPIRED },
      { status: SubscriptionStatus.CANCELLED }, { status: SubscriptionStatus.SUPERSEDED },
      { billingInterval: BillingInterval.CUSTOM, pricingInterval: BillingInterval.CUSTOM },
      { recurringTotalPriceMinor: null }, { recurringCurrency: null }, { currentPeriodEnd: null },
      { activationSource: SubscriptionActivationSource.MANUAL },
    ];
    for (const patch of invalid) {
      await assert.rejects(() => harness(patch).service.prepare(subscriptionId, { source: 'MANUAL' }), RenewalPreparationError);
    }
  });

  it('converges an existing compatible cycle without a replacement Payment or duplicate audit', async () => {
    const existing = renewal();
    const h = harness({}, existing);
    const result = await h.service.prepare(subscriptionId, { source: 'SCHEDULER' });
    assert.equal(result.created, false);
    assert.equal(h.paymentInputs.length, 0);
    assert.equal(h.createdRenewals.length, 0);
    assert.equal(h.auditActions.length, 0);
    assert.equal(h.assertedPayments, 1);
    assert.deepEqual(h.providerPaymentIds, [paymentId]);
  });

  it('reuses only PREPARED cycles and does not re-enter provider preparation for completed Payments', async () => {
    await assert.rejects(
      () => harness({}, { ...renewal(), status: SubscriptionRenewalStatus.BLOCKED }).service.prepare(subscriptionId, { source: 'MANUAL' }),
      (error: unknown) => error instanceof RenewalPreparationError && error.code === 'EXISTING_CYCLE_CONFLICT',
    );
    const captured = harness({}, renewal(), false, PaymentStatus.CAPTURED);
    const result = await captured.service.prepare(subscriptionId, { source: 'SCHEDULER' });
    assert.equal(result.created, false);
    assert.deepEqual(captured.providerPaymentIds, []);
    assert.equal(captured.paymentInputs.length, 0);
  });

  it('fails closed on conflicting evidence and retains durable identity after provider failure', async () => {
    await assert.rejects(
      () => harness({}, { ...renewal(), recurringTotalPriceMinor: 999n }).service.prepare(subscriptionId, { source: 'MANUAL' }),
      (error: unknown) => error instanceof RenewalPreparationError && error.code === 'EXISTING_CYCLE_CONFLICT',
    );
    const h = harness({}, null, true);
    await assert.rejects(
      () => h.service.prepare(subscriptionId, { source: 'MANUAL' }),
      (error: unknown) => error instanceof RenewalPreparationError && error.code === 'PROVIDER_PREPARATION_FAILED' && error.durablePaymentId === paymentId,
    );
    assert.equal(h.paymentInputs.length, 1);
    assert.equal(h.createdRenewals.length, 1);
  });
});

function harness(
  patch: Record<string, unknown> = {},
  existing: ReturnType<typeof renewal> | null = null,
  providerFails = false,
  existingPaymentStatus = PaymentStatus.PENDING,
) {
  const current = subscription(patch);
  const paymentInputs: any[] = [];
  const createdRenewals: any[] = [];
  const auditActions: string[] = [];
  const providerPaymentIds: string[] = [];
  let assertedPayments = 0;
  const tx: any = {
    $queryRaw: async () => [{ id: subscriptionId }],
    companySubscription: { findUnique: async () => current },
    subscriptionRenewal: {
      findUnique: async () => existing ? { ...existing, payment: payment(existingPaymentStatus) } : null,
      create: async ({ data }: any) => { const value = { ...renewal(), ...data }; createdRenewals.push(value); return value; },
    },
    auditLog: { create: async ({ data }: any) => { auditActions.push(data.action); return data; } },
  };
  const prisma: any = {
    companySubscription: { findUnique: async () => ({ companyId }) },
    $transaction: async (fn: any) => fn(tx),
    billingSettings: { findUnique: async () => null },
  };
  const payments: any = {
    createForRenewal: async (_tx: any, input: any) => { paymentInputs.push(input); return payment(); },
    assertRenewalPayment: async () => { assertedPayments += 1; },
  };
  const providers: any = { prepareSystem: async (id: string) => { providerPaymentIds.push(id); if (providerFails) throw new Error('provider'); } };
  const service = new SubscriptionRenewalPreparationService(prisma, { lockCompany: async () => undefined } as never, payments, providers);
  return { service, paymentInputs, createdRenewals, auditActions, providerPaymentIds, get assertedPayments() { return assertedPayments; } };
}

function subscription(patch: Record<string, unknown>) {
  return { id: subscriptionId, companyId, status: SubscriptionStatus.ACTIVE,
    activationSource: SubscriptionActivationSource.PAYMENT, billingInterval: BillingInterval.MONTHLY,
    pricingInterval: BillingInterval.MONTHLY, pricingResolvedAt: new Date(), recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
    recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1_000n, recurringCurrency: 'INR', seatQuantity: 10,
    currentPeriodEnd: new Date('2030-01-31T12:34:56.789Z'), ...patch } as any;
}
function payment(status = PaymentStatus.PENDING) { return { id: paymentId, companyId, subscriptionId, purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL,
  status, amountMinor: 1_000n, currency: 'INR' } as any; }
function renewal() { return { id: renewalId, companyId, subscriptionId, paymentId,
  cycleStart: new Date('2030-01-31T12:34:56.789Z'), cycleEnd: new Date('2030-02-28T12:34:56.789Z'),
  billingInterval: BillingInterval.MONTHLY, recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
  recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1_000n, currency: 'INR', seatQuantity: 10,
  status: SubscriptionRenewalStatus.PREPARED } as any; }

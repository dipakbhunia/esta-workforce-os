import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BillingInterval, CompanyStatus, PaymentPurpose, PaymentStatus, PlanBillingModel, RecurringPriceBasis,
  SubscriptionActivationSource, SubscriptionStatus, TrialStatus,
} from '@prisma/client';
import { SubscriptionPaymentActivationService, SUBSCRIPTION_ACTIVATED_BY_PAYMENT, SUBSCRIPTION_ACTIVATION_BLOCKED } from './subscription-payment-activation.service';

const capturedAt = new Date('2026-01-31T10:20:30.456Z');
const ids = { payment: '00000000-0000-4000-8000-000000000001', subscription: '00000000-0000-4000-8000-000000000002', company: '00000000-0000-4000-8000-000000000003', plan: '00000000-0000-4000-8000-000000000004', trial: '00000000-0000-4000-8000-000000000005' };

function harness(options: Record<string, any> = {}) {
  const company = { id: ids.company, status: options.companyStatus ?? CompanyStatus.ACTIVE };
  const payment: Record<string, any> = { id: ids.payment, companyId: ids.company, subscriptionId: ids.subscription,
    purpose: options.purpose ?? PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: options.paymentStatus ?? PaymentStatus.CAPTURED,
    amountMinor: options.amountMinor ?? 1000n, currency: options.paymentCurrency ?? 'INR', capturedProviderPaymentId: options.captureId === null ? null : 'pay_authoritative', capturedAt: options.capturedAt === null ? null : capturedAt };
  const subscription: Record<string, any> = { id: ids.subscription, companyId: ids.company, planId: ids.plan,
    status: options.subscriptionStatus ?? SubscriptionStatus.PENDING, activationSource: options.activationSource ?? SubscriptionActivationSource.PAYMENT,
    billingInterval: BillingInterval.MONTHLY, planCodeSnapshot: 'STARTER', planNameSnapshot: 'Starter', billingModelSnapshot: PlanBillingModel.PER_USER,
    currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n,
    recurringTotalPriceMinor: options.total ?? 1000n, recurringCurrency: options.currency ?? 'INR', pricingInterval: options.interval ?? BillingInterval.MONTHLY,
    pricingResolvedAt: new Date('2026-01-01T00:00:00Z'), seatQuantity: 10,
    entitlementsSnapshot: options.entitlements ?? ['workforce.attendance'], limitsSnapshot: options.limits ?? { screenshotRetentionDays: 30 },
    startsAt: options.startsAt ?? null, currentPeriodStart: null, currentPeriodEnd: null, suspendedAt: options.subscriptionStatus === SubscriptionStatus.SUSPENDED ? new Date() : null,
    activatedByPaymentId: options.activatedByPaymentId ?? null };
  const trial: Record<string, any> | null = options.trial ? { id: ids.trial, companyId: ids.company, status: TrialStatus.ACTIVE, startsAt: new Date('2026-01-01'), endsAt: new Date('2026-02-15'), convertedAt: null, convertedSubscriptionId: null } : null;
  const audits: Record<string, any>[] = []; const events: string[] = [];
  const tx: any = {
    $queryRaw: async () => [{ id: 'locked' }],
    payment: { findUnique: async () => payment },
    companySubscription: {
      findUnique: async () => subscription,
      findFirst: async () => options.live ? { id: 'other-live' } : null,
      update: async ({ data }: any) => { events.push('subscription:update'); Object.assign(subscription, data); return subscription; },
    },
    companyTrial: {
      findFirst: async () => trial,
      update: async ({ data }: any) => { events.push('trial:update'); Object.assign(trial!, data); return trial; },
    },
    employee: { count: async () => options.usedSeats ?? 0 },
    auditLog: {
      findFirst: async ({ where }: any) => audits.find((audit) => audit.action === where.action && audit.entityId === where.entityId) ?? null,
      create: async ({ data }: any) => { audits.push(data); events.push(`audit:${data.action}`); return data; },
    },
  };
  const prisma: any = { payment: { findUnique: async () => payment }, $transaction: async (callback: any) => callback(tx), $queryRaw: async () => options.candidates ?? [] };
  const seats: any = { lockCompany: async () => { events.push('company:lock'); }, countUsedSeats: async () => options.usedSeats ?? 0 };
  const service = new SubscriptionPaymentActivationService(prisma, seats);
  return { service, company, payment, subscription, trial, audits, events, prisma };
}

describe('SubscriptionPaymentActivationService', () => {
  it('activates from generic CAPTURED truth, uses the immutable snapshot, and ends an effective Trial', async () => {
    const h = harness({ trial: true, usedSeats: 12, companyStatus: CompanyStatus.SUSPENDED });
    const result = await h.service.activate(ids.payment);
    assert.equal(result.outcome, 'ACTIVATED'); assert.equal(h.subscription.status, SubscriptionStatus.ACTIVE);
    assert.equal(h.subscription.activatedByPaymentId, ids.payment); assert.equal(h.subscription.startsAt.toISOString(), capturedAt.toISOString());
    assert.equal(h.subscription.currentPeriodStart.toISOString(), capturedAt.toISOString()); assert.equal(h.subscription.currentPeriodEnd.toISOString(), '2026-02-28T10:20:30.456Z');
    assert.equal(h.trial!.status, TrialStatus.CANCELLED); assert.equal(h.trial!.convertedAt, null); assert.equal(h.company.status, CompanyStatus.SUSPENDED);
    assert.deepEqual(h.audits.map((audit) => audit.action), ['TRIAL_ENDED_BY_PAID_SUBSCRIPTION', SUBSCRIPTION_ACTIVATED_BY_PAYMENT]);
    assert.equal(h.audits[1].metadata.overLimit, true); assert.equal(h.audits[1].metadata.overBy, 2);
    assert.deepEqual(h.events.slice(0, 2), ['company:lock', 'trial:update']);
  });

  it('returns durable idempotent success for ACTIVE or SUSPENDED without rewriting periods or audits', async () => {
    for (const status of [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]) {
      const original = new Date('2026-03-01'); const h = harness({ subscriptionStatus: status, activatedByPaymentId: ids.payment });
      h.subscription.startsAt = original; h.subscription.currentPeriodStart = original; h.subscription.currentPeriodEnd = new Date('2026-04-01');
      assert.equal((await h.service.activate(ids.payment)).outcome, 'ALREADY_ACTIVATED');
      assert.equal(h.subscription.status, status); assert.equal(h.subscription.currentPeriodStart, original); assert.deepEqual(h.audits, []);
    }
  });

  it('treats PENDING, AUTHORIZED, and FAILED Payment as not ready', async () => {
    for (const status of [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED]) {
      const h = harness({ paymentStatus: status }); assert.equal((await h.service.activate(ids.payment)).outcome, 'NOT_READY'); assert.equal(h.subscription.status, SubscriptionStatus.PENDING); assert.deepEqual(h.audits, []);
    }
  });

  it('permanently blocks incomplete capture, money, interval, period, entitlement, and live-subscription conflicts', async () => {
    for (const [options, reason] of [
      [{ captureId: null }, 'missing_capture_evidence'], [{ capturedAt: null }, 'missing_capture_evidence'],
      [{ total: 999n }, 'commercial_snapshot_mismatch'], [{ currency: 'USD' }, 'commercial_snapshot_mismatch'],
      [{ interval: BillingInterval.YEARLY }, 'commercial_snapshot_mismatch'], [{ startsAt: new Date() }, 'commercial_snapshot_mismatch'],
      [{ entitlements: ['crm.core'] }, 'invalid_entitlement_snapshot'], [{ limits: { arbitrary: 1 } }, 'commercial_snapshot_mismatch'],
      [{ live: true }, 'existing_live_subscription'],
    ] as const) {
      const h = harness(options); const result = await h.service.activate(ids.payment);
      assert.equal(result.outcome, 'PERMANENTLY_BLOCKED'); if (result.outcome === 'PERMANENTLY_BLOCKED') assert.equal(result.reason, reason);
      assert.equal(h.subscription.status, SubscriptionStatus.PENDING); assert.equal(h.audits[0].action, SUBSCRIPTION_ACTIVATION_BLOCKED);
    }
  });

  it('never resurrects terminal subscriptions and writes one block audit across retries', async () => {
    for (const status of [SubscriptionStatus.CANCELLED, SubscriptionStatus.SUPERSEDED, SubscriptionStatus.EXPIRED]) {
      const h = harness({ subscriptionStatus: status }); await h.service.activate(ids.payment); await h.service.activate(ids.payment);
      assert.equal(h.subscription.status, status); assert.equal(h.payment.status, PaymentStatus.CAPTURED);
      assert.equal(h.audits.filter((audit) => audit.action === SUBSCRIPTION_ACTIVATION_BLOCKED).length, 1);
    }
  });

  it('blocks a different activation Payment and never consults mutable Plan state', async () => {
    const h = harness({ subscriptionStatus: SubscriptionStatus.ACTIVE, activatedByPaymentId: 'another-payment' });
    assert.equal((await h.service.activate(ids.payment)).outcome, 'PERMANENTLY_BLOCKED'); assert.equal(h.subscription.activatedByPaymentId, 'another-payment');
    assert.equal('plan' in h.prisma, false);
  });

  it('discovers bounded candidates in durable order and isolates a poisoned candidate', async () => {
    const h = harness({ candidates: [{ id: 'poison' }, { id: 'healthy' }] }); const processed: string[] = [];
    (h.service as any).activate = async (id: string) => { processed.push(id); if (id === 'poison') throw new Error('temporary'); };
    await h.service.recoverDue(25); assert.deepEqual(processed, ['poison', 'healthy']);
  });
});

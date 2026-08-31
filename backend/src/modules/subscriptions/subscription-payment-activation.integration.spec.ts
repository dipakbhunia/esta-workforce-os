import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus,
  PlanBillingModel, Prisma, PrismaClient, RecurringPriceBasis, SubscriptionActivationSource,
  SubscriptionStatus, TrialStatus,
} from '@prisma/client';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { SubscriptionPaymentActivationService, SUBSCRIPTION_ACTIVATED_BY_PAYMENT, SUBSCRIPTION_ACTIVATION_BLOCKED } from './subscription-payment-activation.service';

const enabled = process.env.RUN_PAYMENT_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('E1.7 PostgreSQL subscription payment activation', () => {
  before(async () => prisma.$connect()); after(async () => prisma.$disconnect());

  it('executes the real recovery SQL, discovers eligible work, and excludes an exact durable block repeatedly', async () => {
    const service = activationService(); const processed: string[] = [];
    (service as unknown as { activate(id: string): Promise<void> }).activate = async (id: string) => { processed.push(id); };
    await service.recoverDue();
    assert.deepEqual(processed, []);

    const fixture = await createFixture();
    try {
      await service.recoverDue();
      assert.ok(processed.includes(fixture.payment.id));
      await prisma.auditLog.create({ data: {
        companyId: fixture.company.id, action: SUBSCRIPTION_ACTIVATION_BLOCKED, entityType: 'Payment', entityId: fixture.payment.id,
        metadata: { subscriptionId: fixture.subscription.id, reason: 'existing_live_subscription' },
      } });
      processed.length = 0;
      await service.recoverDue(); await service.recoverDue();
      assert.equal(processed.includes(fixture.payment.id), false);
    } finally { await cleanup(fixture); }
  });

  it('converges concurrent activation and retry to one immutable period and one audit', async () => {
    const fixture = await createFixture(); const service = activationService();
    try {
      const results = await Promise.all([service.activate(fixture.payment.id), service.activate(fixture.payment.id)]);
      assert.ok(results.some((result) => result.outcome === 'ACTIVATED'));
      const subscription = await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
      assert.equal(subscription.status, SubscriptionStatus.ACTIVE); assert.equal(subscription.activatedByPaymentId, fixture.payment.id);
      assert.equal(subscription.currentPeriodStart?.toISOString(), fixture.payment.capturedAt!.toISOString());
      const originalEnd = subscription.currentPeriodEnd?.toISOString(); await service.activate(fixture.payment.id);
      const retried = await prisma.companySubscription.findUniqueOrThrow({ where: { id: subscription.id } });
      assert.equal(retried.currentPeriodEnd?.toISOString(), originalEnd);
      assert.equal(await prisma.auditLog.count({ where: { action: SUBSCRIPTION_ACTIVATED_BY_PAYMENT, entityId: subscription.id } }), 1);
    } finally { await cleanup(fixture); }
  });

  it('serializes activation against cancellation without resurrecting a cancelled subscription', async () => {
    const fixture = await createFixture(); const service = activationService();
    try {
      const cancel = prisma.$transaction(async (tx) => {
        await new SeatUsageService(prisma as never).lockCompany(tx, fixture.company.id);
        await tx.companySubscription.updateMany({ where: { id: fixture.subscription.id, status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE] } }, data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date(), endedAt: new Date() } });
      });
      await Promise.all([service.activate(fixture.payment.id), cancel]);
      const subscription = await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
      assert.equal(subscription.status, SubscriptionStatus.CANCELLED);
      await service.activate(fixture.payment.id);
      assert.equal((await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } })).status, SubscriptionStatus.CANCELLED);
    } finally { await cleanup(fixture); }
  });

  it('serializes activation against live-subscription supersession without resurrection', async () => {
    const fixture = await createFixture(); const service = activationService();
    try {
      const supersede = prisma.$transaction(async (tx) => {
        await new SeatUsageService(prisma as never).lockCompany(tx, fixture.company.id);
        await tx.companySubscription.updateMany({
          where: { id: fixture.subscription.id, status: SubscriptionStatus.ACTIVE },
          data: { status: SubscriptionStatus.SUPERSEDED, endedAt: new Date() },
        });
      });
      await Promise.all([service.activate(fixture.payment.id), supersede]);
      const subscription = await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
      assert.ok([SubscriptionStatus.ACTIVE, SubscriptionStatus.SUPERSEDED].includes(subscription.status));
      await service.activate(fixture.payment.id);
      assert.equal((await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } })).status, subscription.status);
    } finally { await cleanup(fixture); }
  });

  it('blocks a stale captured target when another live subscription exists', async () => {
    const fixture = await createFixture(); const service = activationService();
    try {
      await prisma.companySubscription.create({ data: subscriptionData(fixture, randomUUID(), SubscriptionActivationSource.MANUAL, SubscriptionStatus.ACTIVE) });
      const result = await service.activate(fixture.payment.id); assert.equal(result.outcome, 'PERMANENTLY_BLOCKED');
      assert.equal((await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } })).status, SubscriptionStatus.PENDING);
      assert.equal(await prisma.auditLog.count({ where: { action: SUBSCRIPTION_ACTIVATION_BLOCKED, entityId: fixture.payment.id } }), 1);
    } finally { await cleanup(fixture); }
  });

  it('atomically ends an effective Trial and rejects ownership and period corruption', async () => {
    const fixture = await createFixture(true); const service = activationService();
    try {
      await service.activate(fixture.payment.id);
      const [subscription, trial] = await Promise.all([
        prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } }),
        prisma.companyTrial.findUniqueOrThrow({ where: { id: fixture.trial!.id } }),
      ]);
      assert.equal(subscription.status, SubscriptionStatus.ACTIVE); assert.equal(trial.status, TrialStatus.CANCELLED); assert.equal(trial.convertedAt, null);
      const other = await prisma.companySubscription.create({ data: subscriptionData(fixture, randomUUID(), SubscriptionActivationSource.PAYMENT, SubscriptionStatus.PENDING) });
      await assert.rejects(() => prisma.companySubscription.update({ where: { id: other.id }, data: { activatedByPaymentId: fixture.payment.id } }));
      await assert.rejects(() => prisma.companySubscription.update({ where: { id: other.id }, data: { currentPeriodStart: new Date('2026-02-01'), currentPeriodEnd: null } }));
      await assert.rejects(() => prisma.companySubscription.update({ where: { id: other.id }, data: { currentPeriodStart: new Date('2026-03-01'), currentPeriodEnd: new Date('2026-02-01') } }));
    } finally { await cleanup(fixture); }
  });
});

function activationService() { return new SubscriptionPaymentActivationService(prisma as never, new SeatUsageService(prisma as never)); }

async function createFixture(withTrial = false) {
  const suffix = randomUUID(); const provider = await ensureProvider();
  const company = await prisma.company.create({ data: { name: `E1.7 probe ${suffix}`, slug: `e17-${suffix}` } });
  const plan = await prisma.plan.create({ data: { code: `E17-${suffix}`, name: 'E1.7 probe', billingModel: PlanBillingModel.PER_USER } });
  const base = { company, plan, provider, subscription: null as any, payment: null as any, trial: null as any };
  const subscription = await prisma.companySubscription.create({ data: subscriptionData(base, randomUUID(), SubscriptionActivationSource.PAYMENT, SubscriptionStatus.PENDING) });
  const capturedAt = new Date('2026-01-31T10:20:30.456Z');
  const payment = await prisma.payment.create({ data: { companyId: company.id, subscriptionId: subscription.id, providerConfigurationId: provider.configuration.id,
    purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.CAPTURED, provider: provider.configuration.provider, providerMode: provider.configuration.mode,
    amountMinor: 1000n, currency: 'INR', idempotencyKey: `e17-activation-${suffix}`, businessReference: `e17-activation-${suffix}`,
    capturedProviderPaymentId: `pay_${suffix.replaceAll('-', '')}`, providerStatus: 'captured', capturedAt } });
  const now = Date.now();
  const trial = withTrial ? await prisma.companyTrial.create({ data: { companyId: company.id, status: TrialStatus.ACTIVE,
    startsAt: new Date(now - 86_400_000), endsAt: new Date(now + 86_400_000), seatLimit: 10 } }) : null;
  return { company, plan, provider, subscription, payment, trial };
}

function subscriptionData(fixture: { company: { id: string }; plan: { id: string; code: string; name: string } }, id: string, activationSource: SubscriptionActivationSource, status: SubscriptionStatus) {
  return { id, companyId: fixture.company.id, planId: fixture.plan.id, status, activationSource, billingInterval: BillingInterval.MONTHLY,
    planCodeSnapshot: fixture.plan.code, planNameSnapshot: fixture.plan.name, billingModelSnapshot: PlanBillingModel.PER_USER,
    currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n,
    recurringTotalPriceMinor: 1000n, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
    pricingResolvedAt: new Date(), seatQuantity: 10, entitlementsSnapshot: ['workforce.attendance'], limitsSnapshot: {} };
}

async function ensureProvider() {
  let configuration = await prisma.billingProviderConfiguration.findUnique({ where: { provider_mode: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } } });
  let created = false; if (!configuration) { configuration = await prisma.billingProviderConfiguration.create({ data: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } }); created = true; }
  return { configuration, created };
}

async function cleanup(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await prisma.auditLog.deleteMany({ where: { companyId: fixture.company.id } });
  await prisma.companySubscription.updateMany({
    where: { companyId: fixture.company.id },
    data: { status: SubscriptionStatus.CANCELLED, activatedByPaymentId: null },
  });
  await prisma.payment.deleteMany({ where: { companyId: fixture.company.id } });
  await prisma.companyTrial.deleteMany({ where: { companyId: fixture.company.id } });
  await prisma.companySubscription.deleteMany({ where: { companyId: fixture.company.id } });
  await prisma.plan.delete({ where: { id: fixture.plan.id } }); await prisma.company.delete({ where: { id: fixture.company.id } });
  if (fixture.provider.created) await prisma.billingProviderConfiguration.delete({ where: { id: fixture.provider.configuration.id } });
}

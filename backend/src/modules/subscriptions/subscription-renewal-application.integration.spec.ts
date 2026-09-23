import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, PaymentPurpose, PaymentStatus, PlanBillingModel, PrismaClient, RecurringPriceBasis,
  SubscriptionActivationSource, SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaymentProviderOrdersService } from '../payments/payment-provider-orders.service';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { SubscriptionExpirationService } from './subscription-expiration.service';
import { SubscriptionRenewalApplicationService } from './subscription-renewal-application.service';

const enabled = process.env.RUN_RENEWAL_APPLICATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('Renewal-E PostgreSQL application concurrency', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('applies one captured renewal exactly once under concurrent application', async () => {
    const fixture = await createFixture();
    try {
      const [first, second] = await Promise.all([application().apply(fixture.paymentId), application().apply(fixture.paymentId)]);
      assert.deepEqual(new Set([first.outcome, second.outcome]), new Set(['APPLIED', 'ALREADY_APPLIED']));
      const [renewal, subscription] = await Promise.all([
        prisma.subscriptionRenewal.findUniqueOrThrow({ where: { id: fixture.renewalId } }),
        prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscriptionId } }),
      ]);
      assert.equal(renewal.status, SubscriptionRenewalStatus.APPLIED);
      assert.equal(renewal.applicationAttemptCount, 1);
      assert.equal(subscription.currentPeriodStart?.toISOString(), fixture.cycleStart.toISOString());
      assert.equal(subscription.currentPeriodEnd?.toISOString(), fixture.cycleEnd.toISOString());
      assert.equal(await prisma.auditLog.count({ where: { entityId: fixture.renewalId, action: 'SUBSCRIPTION_RENEWAL_APPLIED' } }), 1);
    } finally { await cleanup(fixture.companyId, fixture.planId); }
  });

  it('completes provider dispatch and renewal application concurrently without deadlock or duplicate authority', async () => {
    const fixture = await createFixture(PaymentStatus.PENDING);
    try {
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
      const credential = await prisma.billingProviderCredential.findFirstOrThrow({ where: {
        providerConfigurationId: payment.providerConfigurationId, retiredAt: null,
      } });
      const effective = { provider: payment.provider, mode: payment.providerMode,
        providerConfigurationId: payment.providerConfigurationId, credentialVersionId: credential.id,
        credentialVersion: credential.version, material: { keyId: 'test-key', keySecret: 'test-secret', webhookSecret: 'test-webhook' } };
      let providerCalls = 0;
      const providers = { resolve: () => ({
        createOrder: async (_context: unknown, input: { amountMinor: bigint; currency: string; receipt: string }) => {
          providerCalls += 1;
          return { id: `order_${fixture.paymentId}`, amountMinor: input.amountMinor, currency: input.currency,
            receipt: input.receipt, status: 'created', createdAt: new Date() };
        },
        findOrdersByReceipt: async () => [],
      }) };
      const orders = new PaymentProviderOrdersService(prisma as unknown as PrismaService,
        { resolveForOperation: async () => effective, resolveBoundCredentialForRecovery: async () => effective } as never,
        providers as never);
      const settled = await Promise.race([
        Promise.allSettled([orders.prepareSystem(fixture.paymentId), application().apply(fixture.paymentId)]),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('renewal provider/application deadlock timeout')), 5_000)),
      ]);
      assert.equal(settled.length, 2);
      assert.equal(providerCalls, 1);
      assert.equal(await prisma.paymentAttempt.count({ where: { paymentId: fixture.paymentId, operation: 'ORDER_CREATE' } }), 1);
      assert.equal(await prisma.paymentProviderOrder.count({ where: { paymentId: fixture.paymentId } }), 1);
      assert.equal(await prisma.payment.count({ where: { id: fixture.paymentId } }), 1);
      assert.equal((await prisma.subscriptionRenewal.findUniqueOrThrow({ where: { id: fixture.renewalId } })).status, SubscriptionRenewalStatus.PREPARED);
    } finally { await cleanup(fixture.companyId, fixture.planId); }
  });

  it('converges renewal application and expiration, while uncaptured renewal does not preserve access', async () => {
    const captured = await createFixture();
    try {
      const expiration = new SubscriptionExpirationService(prisma as never, new SeatUsageService(prisma as never));
      await Promise.all([
        application().apply(captured.paymentId),
        expiration.expire(captured.subscriptionId, { now: new Date(captured.cycleStart.getTime() + 1), source: 'SCHEDULER' }),
      ]);
      const stored = await prisma.companySubscription.findUniqueOrThrow({ where: { id: captured.subscriptionId } });
      assert.equal(stored.status, SubscriptionStatus.ACTIVE);
      assert.equal(stored.currentPeriodEnd?.toISOString(), captured.cycleEnd.toISOString());
    } finally { await cleanup(captured.companyId, captured.planId); }

    const pending = await createFixture(PaymentStatus.PENDING);
    try {
      const expiration = new SubscriptionExpirationService(prisma as never, new SeatUsageService(prisma as never));
      assert.equal((await expiration.expire(pending.subscriptionId, { now: new Date(pending.cycleStart.getTime() + 1), source: 'SCHEDULER' })).outcome, 'EXPIRED');
      assert.equal((await application().apply(pending.paymentId)).outcome, 'NOT_READY');
      assert.equal((await prisma.companySubscription.findUniqueOrThrow({ where: { id: pending.subscriptionId } })).status, SubscriptionStatus.EXPIRED);
    } finally { await cleanup(pending.companyId, pending.planId); }
  });

  it('recovers exact expiration and blocks an incompatible successor without violating one-live authority', async () => {
    const recovered = await createFixture(PaymentStatus.CAPTURED, SubscriptionStatus.EXPIRED);
    try {
      assert.equal((await application().apply(recovered.paymentId)).outcome, 'APPLIED');
      assert.equal((await prisma.companySubscription.findUniqueOrThrow({ where: { id: recovered.subscriptionId } })).status, SubscriptionStatus.ACTIVE);
    } finally { await cleanup(recovered.companyId, recovered.planId); }

    const fabricated = await createFixture(PaymentStatus.CAPTURED, SubscriptionStatus.EXPIRED, true);
    try {
      const result = await application().apply(fabricated.paymentId);
      assert.equal(result.outcome, 'BLOCKED');
      if (result.outcome === 'BLOCKED') assert.equal(result.code, 'RENEWAL_PROVENANCE_INVALID');
      assert.equal((await prisma.companySubscription.findUniqueOrThrow({ where: { id: fabricated.subscriptionId } })).status, SubscriptionStatus.EXPIRED);
    } finally { await cleanup(fabricated.companyId, fabricated.planId); }

    const blocked = await createFixture(PaymentStatus.CAPTURED, SubscriptionStatus.EXPIRED);
    try {
      const source = await prisma.companySubscription.findUniqueOrThrow({ where: { id: blocked.subscriptionId } });
      await prisma.companySubscription.create({ data: {
        companyId: blocked.companyId, planId: blocked.planId, status: SubscriptionStatus.ACTIVE,
        activationSource: SubscriptionActivationSource.MANUAL, billingInterval: BillingInterval.MONTHLY,
        planCodeSnapshot: source.planCodeSnapshot, planNameSnapshot: source.planNameSnapshot,
        billingModelSnapshot: source.billingModelSnapshot, currency: 'INR', seatQuantity: 1,
      } });
      const result = await application().apply(blocked.paymentId);
      assert.equal(result.outcome, 'BLOCKED');
      assert.equal((await prisma.subscriptionRenewal.findUniqueOrThrow({ where: { id: blocked.renewalId } })).blockCode, 'EXISTING_LIVE_SUBSCRIPTION');
      assert.equal(await prisma.companySubscription.count({ where: { companyId: blocked.companyId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } } }), 1);
    } finally { await cleanup(blocked.companyId, blocked.planId); }
  });

  it('reconciles an older APPLIED renewal after a later captured cycle without mutation or Invoice replay', async () => {
    const first = await createFixture();
    const generated: string[] = [];
    const service = new SubscriptionRenewalApplicationService(prisma as unknown as PrismaService,
      new SeatUsageService(prisma as unknown as PrismaService),
      { generate: async (paymentId: string) => { generated.push(paymentId); return { outcome: 'ISSUED' }; } } as never);
    try {
      assert.equal((await service.apply(first.paymentId)).outcome, 'APPLIED');
      const provider = await prisma.billingProviderConfiguration.findFirstOrThrow({ where: { enabled: true, isDefault: true } });
      const laterEnd = new Date('2031-03-01T00:00:00.000Z');
      let laterPaymentId = '';
      await prisma.$transaction(async tx => {
        const payment = await tx.payment.create({ data: {
          companyId: first.companyId, subscriptionId: first.subscriptionId, providerConfigurationId: provider.id,
          purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: PaymentStatus.CAPTURED,
          provider: provider.provider, providerMode: provider.mode, amountMinor: 1_000n, currency: 'INR',
          idempotencyKey: `renewal-e-later:${first.renewalId}`, businessReference: `renewal-e-later:${first.renewalId}`,
          capturedProviderPaymentId: `renewal_e_later_${first.renewalId}`, capturedAt: first.cycleEnd,
        } });
        await tx.subscriptionRenewal.create({ data: {
          companyId: first.companyId, subscriptionId: first.subscriptionId, paymentId: payment.id,
          cycleStart: first.cycleEnd, cycleEnd: laterEnd, billingInterval: BillingInterval.MONTHLY,
          recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n,
          recurringTotalPriceMinor: 1_000n, currency: 'INR', seatQuantity: 10,
          createdAt: new Date(first.cycleEnd.getTime() - 1),
        } });
        laterPaymentId = payment.id;
      });
      assert.equal((await service.apply(laterPaymentId)).outcome, 'APPLIED');
      assert.deepEqual(generated, [first.paymentId, laterPaymentId]);

      assert.equal((await service.apply(first.paymentId)).outcome, 'ALREADY_APPLIED');
      assert.deepEqual(generated, [first.paymentId, laterPaymentId]);
      const subscription = await prisma.companySubscription.findUniqueOrThrow({ where: { id: first.subscriptionId } });
      assert.equal(subscription.currentPeriodStart?.toISOString(), first.cycleEnd.toISOString());
      assert.equal(subscription.currentPeriodEnd?.toISOString(), laterEnd.toISOString());
    } finally { await cleanup(first.companyId, first.planId); }
  });
});

function application() {
  return new SubscriptionRenewalApplicationService(prisma as unknown as PrismaService,
    new SeatUsageService(prisma as unknown as PrismaService), { generate: async () => ({ outcome: 'ISSUED' }) } as never);
}

async function createFixture(paymentStatus = PaymentStatus.CAPTURED, subscriptionStatus = SubscriptionStatus.ACTIVE, postBoundaryRenewal = false) {
  const suffix = randomUUID();
  const cycleStart = new Date('2031-01-01T00:00:00.000Z');
  const cycleEnd = new Date('2031-02-01T00:00:00.000Z');
  const company = await prisma.company.create({ data: { name: 'Renewal-E', slug: `renewal-e-${suffix}` } });
  const plan = await prisma.plan.create({ data: { code: `RENEWAL-E-${suffix}`, name: 'Renewal E', billingModel: PlanBillingModel.PER_USER } });
  const provider = await prisma.billingProviderConfiguration.findFirstOrThrow({ where: { enabled: true, isDefault: true } });
  const subscription = await prisma.companySubscription.create({ data: {
    companyId: company.id, planId: plan.id, status: SubscriptionStatus.PENDING,
    activationSource: SubscriptionActivationSource.PAYMENT, billingInterval: BillingInterval.MONTHLY,
    planCodeSnapshot: plan.code, planNameSnapshot: plan.name, billingModelSnapshot: PlanBillingModel.PER_USER,
    currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
    recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1_000n, recurringCurrency: 'INR',
    pricingInterval: BillingInterval.MONTHLY, pricingResolvedAt: new Date(), seatQuantity: 10,
  } });
  const activation = await prisma.payment.create({ data: {
    companyId: company.id, subscriptionId: subscription.id, providerConfigurationId: provider.id,
    purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.CAPTURED,
    provider: provider.provider, providerMode: provider.mode, amountMinor: 1_000n, currency: 'INR',
    idempotencyKey: `renewal-e-activation:${suffix}`, businessReference: `renewal-e-activation:${suffix}`,
    capturedProviderPaymentId: `renewal_e_activation_${suffix}`, capturedAt: new Date('2030-12-01T00:00:00Z'),
  } });
  await prisma.companySubscription.update({ where: { id: subscription.id }, data: {
    status: subscriptionStatus, activatedByPaymentId: activation.id, startsAt: new Date('2030-12-01T00:00:00Z'),
    currentPeriodStart: new Date('2030-12-01T00:00:00Z'), currentPeriodEnd: cycleStart,
    endedAt: subscriptionStatus === SubscriptionStatus.EXPIRED ? cycleStart : null,
  } });
  let paymentId = ''; let renewalId = '';
  await prisma.$transaction(async tx => {
    const payment = await tx.payment.create({ data: {
      companyId: company.id, subscriptionId: subscription.id, providerConfigurationId: provider.id,
      purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: paymentStatus,
      provider: provider.provider, providerMode: provider.mode, amountMinor: 1_000n, currency: 'INR',
      idempotencyKey: `renewal-e:${suffix}`, businessReference: `renewal-e:${suffix}`,
      capturedProviderPaymentId: paymentStatus === PaymentStatus.CAPTURED ? `renewal_e_${suffix}` : null,
      capturedAt: paymentStatus === PaymentStatus.CAPTURED ? new Date('2030-12-31T23:00:00Z') : null,
    } });
    const renewal = await tx.subscriptionRenewal.create({ data: {
      companyId: company.id, subscriptionId: subscription.id, paymentId: payment.id, cycleStart, cycleEnd,
      billingInterval: BillingInterval.MONTHLY, recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
      recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1_000n, currency: 'INR', seatQuantity: 10,
      createdAt: postBoundaryRenewal ? new Date(cycleStart.getTime() + 1) : new Date(cycleStart.getTime() - 1),
    } });
    paymentId = payment.id; renewalId = renewal.id;
  });
  return { companyId: company.id, planId: plan.id, subscriptionId: subscription.id, paymentId, renewalId, cycleStart, cycleEnd };
}

async function cleanup(companyId: string, planId: string) {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.paymentAttempt.deleteMany({ where: { payment: { companyId } } });
  await prisma.paymentProviderOrder.deleteMany({ where: { payment: { companyId } } });
  await prisma.$executeRawUnsafe('ALTER TABLE "SubscriptionRenewal" DISABLE TRIGGER "SubscriptionRenewal_immutability"');
  try { await prisma.subscriptionRenewal.deleteMany({ where: { companyId } }); }
  finally { await prisma.$executeRawUnsafe('ALTER TABLE "SubscriptionRenewal" ENABLE TRIGGER "SubscriptionRenewal_immutability"'); }
  await prisma.companySubscription.updateMany({ where: { companyId }, data: { status: SubscriptionStatus.CANCELLED, activatedByPaymentId: null } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.companySubscription.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
}

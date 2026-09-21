import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus,
  PlanBillingModel, PrismaClient, RecurringPriceBasis, SubscriptionActivationSource,
  SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';

const enabled = process.env.RUN_RENEWAL_FOUNDATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('Renewal-C PostgreSQL data foundation', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('enforces renewal integrity and restores clean test state', async () => {
    const suffix = randomUUID();
    const companyIds: string[] = [];
    let planId: string | undefined;
    let providerId: string | undefined;

    try {
      const company = await prisma.company.create({ data: { name: 'Renewal-C A', slug: `renewal-c-a-${suffix}` } });
      const otherCompany = await prisma.company.create({ data: { name: 'Renewal-C B', slug: `renewal-c-b-${suffix}` } });
      companyIds.push(company.id, otherCompany.id);
      const plan = await prisma.plan.create({ data: { code: `RENEWAL-C-${suffix}`, name: 'Renewal-C', billingModel: PlanBillingModel.PER_USER } });
      planId = plan.id;
      const subscription = await prisma.companySubscription.create({ data: subscriptionData(company.id, plan.id) });
      const otherSubscription = await prisma.companySubscription.create({ data: subscriptionData(otherCompany.id, plan.id) });
      const provider = await prisma.billingProviderConfiguration.create({
        data: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST },
      });
      providerId = provider.id;
      const cycleStart = new Date('2030-01-31T12:34:56.789Z');
      const cycleEnd = new Date('2030-02-28T12:34:56.789Z');
      const paymentFirstId = randomUUID();
      const paymentFirstRenewalId = randomUUID();

      await prisma.$transaction(async tx => {
        await tx.payment.create({ data: paymentData(paymentFirstId, company.id, subscription.id, provider.id, PaymentPurpose.SUBSCRIPTION_RENEWAL) });
        await tx.subscriptionRenewal.create({ data: renewalData(paymentFirstRenewalId, company.id, subscription.id, paymentFirstId, cycleStart, cycleEnd) });
      });
      assert.equal((await prisma.subscriptionRenewal.findUniqueOrThrow({ where: { id: paymentFirstRenewalId } })).status, SubscriptionRenewalStatus.PREPARED);

      const renewalFirstPaymentId = randomUUID();
      const renewalFirstId = randomUUID();
      await prisma.$transaction(async tx => {
        await tx.subscriptionRenewal.create({
          data: renewalData(renewalFirstId, company.id, subscription.id, renewalFirstPaymentId, new Date('2030-03-01Z'), new Date('2030-04-01Z')),
        });
        await tx.payment.create({ data: paymentData(renewalFirstPaymentId, company.id, subscription.id, provider.id, PaymentPurpose.SUBSCRIPTION_RENEWAL) });
      });
      assert.equal((await prisma.subscriptionRenewal.findUniqueOrThrow({ where: { id: renewalFirstId } })).paymentId, renewalFirstPaymentId);

      await assert.rejects(() => prisma.payment.create({
        data: paymentData(randomUUID(), company.id, subscription.id, provider.id, PaymentPurpose.SUBSCRIPTION_RENEWAL),
      }));
      await assert.rejects(() => createCycle(company.id, subscription.id, provider.id, cycleStart, cycleEnd));
      await assert.rejects(() => prisma.subscriptionRenewal.create({
        data: renewalData(randomUUID(), company.id, subscription.id, paymentFirstId, new Date('2030-05-01Z'), new Date('2030-06-01Z')),
      }));
      await assert.rejects(() => prisma.subscriptionRenewal.create({
        data: renewalData(randomUUID(), otherCompany.id, subscription.id, paymentFirstId, new Date('2030-05-01Z'), new Date('2030-06-01Z')),
      }));
      await assert.rejects(() => prisma.subscriptionRenewal.create({
        data: renewalData(randomUUID(), company.id, otherSubscription.id, paymentFirstId, new Date('2030-05-01Z'), new Date('2030-06-01Z')),
      }));

      const activationPaymentId = randomUUID();
      await prisma.payment.create({ data: paymentData(activationPaymentId, otherCompany.id, otherSubscription.id, provider.id, PaymentPurpose.SUBSCRIPTION_ACTIVATION) });
      await assert.rejects(() => prisma.subscriptionRenewal.create({
        data: renewalData(randomUUID(), otherCompany.id, otherSubscription.id, activationPaymentId, cycleStart, cycleEnd),
      }));
      await assert.rejects(() => prisma.payment.update({
        where: { id: paymentFirstId }, data: { purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION },
      }));

      const invalidCases = [
        { cycleStart: cycleEnd, cycleEnd }, { billingInterval: BillingInterval.CUSTOM }, { seatQuantity: 0 },
        { recurringUnitPriceMinor: 101n }, { recurringTotalPriceMinor: 0n },
        { status: SubscriptionRenewalStatus.APPLIED },
        { status: SubscriptionRenewalStatus.BLOCKED, blockedAt: new Date(), blockCode: null },
      ];
      for (const [index, change] of invalidCases.entries()) {
        await assert.rejects(() => createCycle(
          company.id, subscription.id, provider.id,
          new Date(Date.UTC(2040, index, 1)), new Date(Date.UTC(2040, index + 1, 1)), change,
        ));
      }

      await assert.rejects(() => prisma.subscriptionRenewal.update({ where: { id: paymentFirstRenewalId }, data: { recurringTotalPriceMinor: 2_000n } }));
      await assert.rejects(() => prisma.subscriptionRenewal.delete({ where: { id: paymentFirstRenewalId } }));
      const applied = await prisma.subscriptionRenewal.update({
        where: { id: paymentFirstRenewalId },
        data: { status: SubscriptionRenewalStatus.APPLIED, appliedAt: new Date(), applicationAttemptCount: 1, lastApplicationAttemptAt: new Date() },
      });
      assert.equal(applied.status, SubscriptionRenewalStatus.APPLIED);

      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
          AND indexname IN ('CompanySubscription_renewal_candidates_idx', 'SubscriptionRenewal_recovery_order_idx',
            'SubscriptionRenewal_company_history_idx', 'SubscriptionRenewal_subscriptionId_cycleStart_key',
            'SubscriptionRenewal_paymentId_key')`;
      assert.equal(indexes.length, 5);
      const triggers = await renewalTriggers();
      assert.deepEqual(triggers.map(trigger => trigger.tgname), [
        'Payment_renewal_link_check', 'SubscriptionRenewal_immutability', 'SubscriptionRenewal_payment_purpose_check',
      ]);
      assert.ok(triggers.every(trigger => trigger.enabled === 'O'));
    } finally {
      await cleanupFixtures(companyIds, planId, providerId);
    }

    assert.equal(await prisma.subscriptionRenewal.count({ where: { companyId: { in: companyIds } } }), 0);
    assert.ok((await renewalTriggers()).every(trigger => trigger.enabled === 'O'));
  });

  async function createCycle(companyId: string, subscriptionId: string, providerConfigurationId: string, cycleStart: Date, cycleEnd: Date, override: Record<string, unknown> = {}) {
    const paymentId = randomUUID();
    return prisma.$transaction(async tx => {
      await tx.payment.create({ data: paymentData(paymentId, companyId, subscriptionId, providerConfigurationId, PaymentPurpose.SUBSCRIPTION_RENEWAL) });
      return tx.subscriptionRenewal.create({ data: renewalData(randomUUID(), companyId, subscriptionId, paymentId, cycleStart, cycleEnd, override) });
    });
  }
});

async function cleanupFixtures(companyIds: string[], planId?: string, providerId?: string) {
  if (companyIds.length > 0) {
    await prisma.$executeRawUnsafe('ALTER TABLE "SubscriptionRenewal" DISABLE TRIGGER "SubscriptionRenewal_immutability"');
    try {
      await prisma.subscriptionRenewal.deleteMany({ where: { companyId: { in: companyIds } } });
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "SubscriptionRenewal" ENABLE TRIGGER "SubscriptionRenewal_immutability"');
    }
    await prisma.payment.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.companySubscription.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  }
  if (providerId) await prisma.billingProviderConfiguration.deleteMany({ where: { id: providerId } });
  if (planId) await prisma.plan.deleteMany({ where: { id: planId } });
}

async function renewalTriggers() {
  return prisma.$queryRaw<Array<{ tgname: string; enabled: string }>>`
    SELECT trigger.tgname, trigger.tgenabled AS enabled FROM pg_trigger trigger
    WHERE trigger.tgrelid IN ('"Payment"'::regclass, '"SubscriptionRenewal"'::regclass)
      AND trigger.tgname IN ('Payment_renewal_link_check', 'SubscriptionRenewal_immutability',
        'SubscriptionRenewal_payment_purpose_check') ORDER BY trigger.tgname`;
}

function subscriptionData(companyId: string, planId: string) {
  return { companyId, planId, status: SubscriptionStatus.ACTIVE, activationSource: SubscriptionActivationSource.MANUAL,
    billingInterval: BillingInterval.MONTHLY, planCodeSnapshot: 'RENEWAL-C', planNameSnapshot: 'Renewal C',
    billingModelSnapshot: PlanBillingModel.PER_USER, currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
    recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1_000n, recurringCurrency: 'INR',
    pricingInterval: BillingInterval.MONTHLY, pricingResolvedAt: new Date(), seatQuantity: 10,
    currentPeriodStart: new Date('2029-12-31T12:34:56.789Z'), currentPeriodEnd: new Date('2030-01-31T12:34:56.789Z') };
}

function paymentData(id: string, companyId: string, subscriptionId: string, providerConfigurationId: string, purpose: PaymentPurpose) {
  return { id, companyId, subscriptionId, providerConfigurationId, purpose, status: PaymentStatus.PENDING,
    provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST, amountMinor: 1_000n, currency: 'INR',
    idempotencyKey: `renewal-c:${id}`, businessReference: `renewal-c:${id}` };
}

function renewalData(id: string, companyId: string, subscriptionId: string, paymentId: string, cycleStart: Date, cycleEnd: Date, override: Record<string, unknown> = {}) {
  return { id, companyId, subscriptionId, paymentId, cycleStart, cycleEnd, billingInterval: BillingInterval.MONTHLY,
    recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n,
    recurringTotalPriceMinor: 1_000n, currency: 'INR', seatQuantity: 10, ...override };
}

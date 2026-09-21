import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus,
  PlanBillingModel, PrismaClient, RecurringPriceBasis, SubscriptionActivationSource, SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionTaxCalculationService } from '../payments/subscription-tax-calculation.service';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { SubscriptionRenewalPreparationService } from './subscription-renewal-preparation.service';

const enabled = process.env.RUN_RENEWAL_PREPARATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('Renewal-D PostgreSQL preparation concurrency', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('converges concurrent scheduler/manual preparation to one renewal, Payment, and audit', async () => {
    const suffix = randomUUID();
    let companyId: string | undefined;
    let planId: string | undefined;
    try {
      const company = await prisma.company.create({ data: { name: 'Renewal-D', slug: `renewal-d-${suffix}` } });
      companyId = company.id;
      const plan = await prisma.plan.create({ data: { code: `RENEWAL-D-${suffix}`, name: 'Renewal D', billingModel: PlanBillingModel.PER_USER } });
      planId = plan.id;
      const provider = await prisma.billingProviderConfiguration.findFirst({ where: { enabled: true, isDefault: true } });
      assert.ok(provider, 'an enabled default provider fixture is required');
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
        idempotencyKey: `renewal-d-activation:${suffix}`, businessReference: `renewal-d-activation:${suffix}`,
        capturedProviderPaymentId: `renewal_d_${suffix}`, capturedAt: new Date('2030-01-01T00:00:00.000Z'),
      } });
      await prisma.companySubscription.update({ where: { id: subscription.id }, data: {
        status: SubscriptionStatus.ACTIVE, activatedByPaymentId: activation.id,
        startsAt: new Date('2030-01-01T00:00:00.000Z'), currentPeriodStart: new Date('2030-01-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2030-01-31T12:34:56.789Z'),
      } });

      const payments = new PaymentsService(prisma as unknown as PrismaService, new SubscriptionTaxCalculationService());
      const providerCalls: string[] = [];
      const service = new SubscriptionRenewalPreparationService(
        prisma as unknown as PrismaService,
        new SeatUsageService(prisma as unknown as PrismaService),
        payments,
        { prepareSystem: async (id: string) => { providerCalls.push(id); return {} as never; } } as never,
      );
      const [manual, scheduler] = await Promise.all([
        service.prepare(subscription.id, { source: 'MANUAL' }),
        service.prepare(subscription.id, { source: 'SCHEDULER' }),
      ]);
      assert.equal(manual.renewalId, scheduler.renewalId);
      assert.equal(manual.paymentId, scheduler.paymentId);
      assert.equal([manual.created, scheduler.created].filter(Boolean).length, 1);
      assert.equal(await prisma.subscriptionRenewal.count({ where: { subscriptionId: subscription.id } }), 1);
      assert.equal(await prisma.payment.count({ where: { subscriptionId: subscription.id, purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL } }), 1);
      assert.equal(await prisma.paymentTaxSnapshot.count({ where: { payment: { subscriptionId: subscription.id, purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL } } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: 'SUBSCRIPTION_RENEWAL_PREPARED', entityId: manual.renewalId } }), 1);
      assert.deepEqual(providerCalls, [manual.paymentId, manual.paymentId]);
    } finally {
      if (companyId) await cleanup(companyId);
      if (planId) await prisma.plan.deleteMany({ where: { id: planId } });
    }
  });
});

async function cleanup(companyId: string) {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.$executeRawUnsafe('ALTER TABLE "SubscriptionRenewal" DISABLE TRIGGER "SubscriptionRenewal_immutability"');
  try {
    await prisma.subscriptionRenewal.deleteMany({ where: { companyId } });
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "SubscriptionRenewal" ENABLE TRIGGER "SubscriptionRenewal_immutability"');
  }
  await prisma.companySubscription.updateMany({ where: { companyId }, data: {
    status: SubscriptionStatus.CANCELLED, activatedByPaymentId: null,
  } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.companySubscription.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}

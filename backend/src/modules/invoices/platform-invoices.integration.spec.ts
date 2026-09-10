import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, InvoiceNumberResetPolicy, PaymentProviderMode, PaymentProviderType,
  PaymentPurpose, PaymentStatus, PlanBillingModel, PrismaClient, RecurringPriceBasis,
  SubscriptionActivationSource, SubscriptionStatus,
} from '@prisma/client';
import { InvoiceIssuanceService } from './invoice-issuance.service';
import { PlatformInvoicesService } from './platform-invoices.service';

const enabled = process.env.RUN_PLATFORM_INVOICE_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('IF-C PostgreSQL platform invoice reads', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('reads ordered, filtered, paginated immutable snapshots without mutable-source reconstruction', async () => {
    const firstFixture = await createFixture('2026-09-08T10:00:00.000Z');
    let secondFixture: Awaited<ReturnType<typeof createFixture>> | undefined;
    try {
      const first = await new InvoiceIssuanceService(prisma as never, {
        now: () => firstFixture.issuedAt,
      }).issue(firstFixture.paymentId);
      secondFixture = await createFixture('2026-09-08T11:00:00.000Z');
      const second = await new InvoiceIssuanceService(prisma as never, {
        now: () => secondFixture.issuedAt,
      }).issue(secondFixture.paymentId);
      const reads = new PlatformInvoicesService(prisma as never);

      const ordered = await reads.findAll({ page: 1, limit: 1,
        from: '2026-09-08T10:00:00Z', to: '2026-09-08T12:00:00Z' });
      assert.equal(ordered.meta.total, 2);
      assert.equal(ordered.data[0].id, second.id);
      const pageTwo = await reads.findAll({ page: 2, limit: 1,
        from: '2026-09-08T10:00:00Z', to: '2026-09-08T12:00:00Z' });
      assert.equal(pageTwo.data[0].id, first.id);
      const lowerBoundary = await reads.findAll({ page: 1, limit: 20,
        from: '2026-09-08T10:00:00Z', to: '2026-09-08T11:00:00Z' });
      assert.deepEqual(lowerBoundary.data.map(({ id }) => id), [first.id]);
      const filtered = await reads.findAll({ page: 1, limit: 20,
        companyId: firstFixture.companyId, subscriptionId: firstFixture.subscriptionId,
        sourcePaymentId: firstFixture.paymentId, invoiceNumber: first.invoiceNumber });
      assert.deepEqual(filtered.data.map(({ id }) => id), [first.id]);

      await prisma.plan.update({ where: { id: firstFixture.planId }, data: { name: 'Changed Plan' } });
      await prisma.companyBillingProfile.update({ where: { companyId: firstFixture.companyId }, data: { billingName: 'Changed Customer' } });
      await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: { sellerLegalName: 'Changed Seller' } });
      const details = await reads.findOne(first.id);
      assert.equal(details.seller.legalName, 'IF-C Seller');
      assert.equal(details.billTo.name, 'IF-C Customer');
      assert.equal(details.lines[0].planNameSnapshot, 'IF-C snapshot plan');
      assert.equal(details.totalMinor, '9007199254740991');
      assert.equal(details.lines[0].unitAmountMinor, '9007199254740991');
    } finally {
      try {
        if (secondFixture) await cleanup(secondFixture);
      } finally {
        await cleanup(firstFixture);
      }
    }
  });
});

async function createFixture(issuedAtText: string) {
  const suffix = randomUUID();
  const prefix = `IFC${suffix.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const company = await prisma.company.create({ data: { name: 'IF-C company', slug: `ifc-${suffix}` } });
  const plan = await prisma.plan.create({ data: {
    code: `IFC-${suffix}`, name: 'IF-C snapshot plan', billingModel: PlanBillingModel.CUSTOM,
  } });
  const periodStart = new Date('2026-09-01T00:00:00.000Z');
  const periodEnd = new Date('2026-10-01T00:00:00.000Z');
  const amount = 9_007_199_254_740_991n;
  const subscription = await prisma.companySubscription.create({ data: {
    companyId: company.id, planId: plan.id, status: SubscriptionStatus.PENDING,
    activationSource: SubscriptionActivationSource.PAYMENT, billingInterval: BillingInterval.MONTHLY,
    planCodeSnapshot: plan.code, planNameSnapshot: plan.name, billingModelSnapshot: PlanBillingModel.CUSTOM,
    currency: 'INR', recurringPriceBasis: RecurringPriceBasis.FIXED_TOTAL,
    recurringUnitPriceMinor: null, recurringTotalPriceMinor: amount, recurringCurrency: 'INR',
    pricingInterval: BillingInterval.MONTHLY, pricingResolvedAt: new Date(), seatQuantity: 10,
  } });
  const provider = await prisma.billingProviderConfiguration.findUnique({ where: {
    provider_mode: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST },
  } }) ?? await prisma.billingProviderConfiguration.create({ data: {
    provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST,
  } });
  const payment = await prisma.payment.create({ data: {
    companyId: company.id, subscriptionId: subscription.id, providerConfigurationId: provider.id,
    purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.CAPTURED,
    provider: provider.provider, providerMode: provider.mode, amountMinor: amount, currency: 'INR',
    idempotencyKey: `ifc-${suffix}`, businessReference: `IFC-${suffix}`,
    capturedProviderPaymentId: `pay_${suffix}`, providerStatus: 'captured', capturedAt: periodStart,
  } });
  await prisma.companySubscription.update({ where: { id: subscription.id }, data: {
    status: SubscriptionStatus.ACTIVE, activatedByPaymentId: payment.id, startsAt: periodStart,
    currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
  } });
  await prisma.companyBillingProfile.create({ data: {
    companyId: company.id, billingName: 'IF-C Customer', addressLine1: '1 Customer Road',
    city: 'Pune', postalCode: '411001', country: 'IN',
  } });
  const settings = await prisma.billingSettings.findUnique({ where: { scope: 'PLATFORM' } });
  const priorSettings = settings && {
    invoicePrefix: settings.invoicePrefix, invoiceNumberResetPolicy: settings.invoiceNumberResetPolicy,
    sellerLegalName: settings.sellerLegalName, sellerBillingEmail: settings.sellerBillingEmail,
    sellerAddressLine1: settings.sellerAddressLine1, sellerAddressLine2: settings.sellerAddressLine2,
    sellerCity: settings.sellerCity, sellerState: settings.sellerState, sellerStateCode: settings.sellerStateCode,
    sellerPostalCode: settings.sellerPostalCode, sellerCountry: settings.sellerCountry,
  };
  await prisma.billingSettings.upsert({ where: { scope: 'PLATFORM' }, update: sellerSettings(prefix),
    create: { scope: 'PLATFORM', ...sellerSettings(prefix) } });
  return { companyId: company.id, planId: plan.id, subscriptionId: subscription.id,
    paymentId: payment.id, prefix, issuedAt: new Date(issuedAtText), priorSettings };
}

function sellerSettings(prefix: string) {
  return { invoicePrefix: prefix, invoiceNumberResetPolicy: InvoiceNumberResetPolicy.NEVER,
    sellerLegalName: 'IF-C Seller', sellerAddressLine1: '1 Seller Road', sellerCity: 'Pune',
    sellerPostalCode: '411001', sellerCountry: 'IN' };
}

async function cleanup(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await prisma.auditLog.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.invoice.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.invoiceNumberSequence.deleteMany({
    where: { prefix: fixture.prefix, invoices: { none: {} } },
  });
  await prisma.companyBillingProfile.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.companySubscription.updateMany({ where: { companyId: fixture.companyId }, data: {
    status: SubscriptionStatus.CANCELLED, activatedByPaymentId: null, cancelledAt: new Date(), endedAt: new Date(),
  } });
  await prisma.payment.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.companySubscription.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.plan.deleteMany({ where: { id: fixture.planId } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
  if (fixture.priorSettings) await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: fixture.priorSettings });
}

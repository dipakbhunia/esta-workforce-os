import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  BillingInterval, PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus,
  PlanBillingModel, PrismaClient, RecurringPriceBasis, SubscriptionActivationSource,
  SubscriptionStatus,
} from '@prisma/client';
import { InvoiceGenerationRecoveryService } from './invoice-generation-recovery.service';
import { InvoiceGenerationService } from './invoice-generation.service';
import { INVOICE_ISSUED, InvoiceIssuanceService } from './invoice-issuance.service';

const enabled = process.env.RUN_INVOICE_GENERATION_RECOVERY_DB_INTEGRATION === '1';
const REQUIRED_TABLES = [
  'Company', 'Plan', 'CompanySubscription', 'BillingSettings', 'CompanyBillingProfile',
  'BillingProviderConfiguration', 'Payment', 'InvoiceNumberSequence', 'Invoice', 'InvoiceLine', 'AuditLog',
  'GstTaxPolicyVersion', 'PaymentTaxSnapshot', 'PaymentTaxComponent', 'InvoiceGstEvidence',
  'InvoiceLineGstEvidence', 'InvoiceLineTaxComponent',
] as const;

describe('IG-C PostgreSQL invoice generation recovery', () => {
  it('recovers only isolated durable candidates and remains idempotent', { skip: !enabled }, async () => {
    const admin = new PrismaClient();
    const schema = `igc_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^igc_[a-f0-9]{32}$/);
    let prisma: PrismaClient | undefined;
    try {
      await admin.$connect();
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      const enumTypes = await admin.$queryRaw<Array<{ name: string }>>`
        SELECT type.typname AS name
        FROM pg_type type
        INNER JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
        WHERE namespace.nspname = 'public' AND type.typtype = 'e'`;
      for (const { name } of enumTypes) {
        assert.match(name, /^[A-Za-z][A-Za-z0-9_]*$/);
        await admin.$executeRawUnsafe(`CREATE DOMAIN "${schema}"."${name}" AS "public"."${name}"`);
      }
      for (const table of REQUIRED_TABLES) {
        await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE "public"."${table}" INCLUDING ALL)`);
      }
      const databaseUrl = process.env.DATABASE_URL;
      assert.ok(databaseUrl);
      const isolatedUrl = new URL(databaseUrl);
      isolatedUrl.searchParams.set('schema', schema);
      prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl.toString() } } });
      await prisma.$connect();

      await prisma.billingSettings.create({ data: {
        scope: 'PLATFORM', invoicePrefix: 'IGC', sellerLegalName: 'IG-C Seller',
        sellerAddressLine1: '1 Seller Road', sellerCity: 'Pune', sellerPostalCode: '411001', sellerCountry: 'IN',
      } });
      const provider = await prisma.billingProviderConfiguration.create({ data: {
        provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST,
      } });

      const nonCaptured = await createFixture(prisma, provider.id, { paymentStatus: PaymentStatus.PENDING, profile: true });
      const wrongStatus = await createFixture(prisma, provider.id, { subscriptionStatus: SubscriptionStatus.PENDING, profile: true });
      const wrongLink = await createFixture(prisma, provider.id, { profile: true });
      await prisma.companySubscription.update({ where: { id: wrongLink.subscriptionId }, data: { activatedByPaymentId: randomUUID() } });
      const alreadyInvoiced = await createFixture(prisma, provider.id, { profile: true });
      const issuance = new InvoiceIssuanceService(prisma as never);
      const existing = await issuance.issue(alreadyInvoiced.paymentId);
      await assert.rejects(() => prisma!.companySubscription.update({
        where: { id: alreadyInvoiced.subscriptionId }, data: { currentPeriodEnd: alreadyInvoiced.periodStart },
      }));
      await assert.rejects(() => prisma!.companySubscription.update({
        where: { id: alreadyInvoiced.subscriptionId }, data: { currentPeriodStart: null },
      }));

      const first = await createFixture(prisma, provider.id, { profile: true });
      const failed = await createFixture(prisma, provider.id);
      const last = await createFixture(prisma, provider.id, { profile: true });
      const generation = new InvoiceGenerationService(issuance);
      const attempted: string[] = [];
      const generate = generation.generate.bind(generation);
      generation.generate = async (paymentId: string) => { attempted.push(paymentId); return generate(paymentId); };
      (generation as unknown as { logger: { error(): void } }).logger = { error: () => undefined };
      const recovery = new InvoiceGenerationRecoveryService(prisma as never, generation);

      assert.deepEqual(await recovery.recoverDue(), { scanned: 3, succeeded: 2, failed: 1 });
      assert.deepEqual(attempted, [first.paymentId, failed.paymentId, last.paymentId]);
      for (const excluded of [nonCaptured.paymentId, wrongStatus.paymentId, wrongLink.paymentId, alreadyInvoiced.paymentId]) {
        assert.equal(attempted.includes(excluded), false);
      }
      for (const fixture of [first, last]) await assertIssuedEvidence(prisma, fixture);
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: failed.paymentId } }), 0);
      assert.equal(await prisma.invoiceLine.count({ where: { companyId: failed.companyId } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: INVOICE_ISSUED, companyId: failed.companyId } }), 0);

      assert.deepEqual(await recovery.recoverDue(), { scanned: 1, succeeded: 0, failed: 1 });
      assert.deepEqual(attempted, [first.paymentId, failed.paymentId, last.paymentId, failed.paymentId]);
      for (const fixture of [first, last]) await assertIssuedEvidence(prisma, fixture);
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: alreadyInvoiced.paymentId } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { action: INVOICE_ISSUED, entityId: existing.id } }), 1);
    } finally {
      try {
        await prisma?.$disconnect();
      } finally {
        try {
          await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await admin.$disconnect();
        }
      }
    }
  });
});

type Fixture = {
  companyId: string; planId: string; subscriptionId: string; paymentId: string;
  periodStart: Date; periodEnd: Date;
};

async function createFixture(prisma: PrismaClient, providerConfigurationId: string, options: {
  paymentStatus?: PaymentStatus; subscriptionStatus?: SubscriptionStatus; profile?: boolean;
} = {}): Promise<Fixture> {
  const suffix = randomUUID();
  const company = await prisma.company.create({ data: { name: `IG-C ${suffix}`, slug: `igc-${suffix}` } });
  const plan = await prisma.plan.create({ data: { code: `IGC-${suffix}`, name: 'IG-C Plan', billingModel: PlanBillingModel.PER_USER } });
  const subscription = await prisma.companySubscription.create({ data: {
    companyId: company.id, planId: plan.id, status: SubscriptionStatus.PENDING,
    activationSource: SubscriptionActivationSource.PAYMENT, billingInterval: BillingInterval.MONTHLY,
    planCodeSnapshot: plan.code, planNameSnapshot: plan.name, billingModelSnapshot: PlanBillingModel.PER_USER,
    currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n,
    recurringTotalPriceMinor: 1000n, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
    pricingResolvedAt: new Date(), seatQuantity: 10, entitlementsSnapshot: ['workforce.attendance'], limitsSnapshot: {},
  } });
  const payment = await createPayment(prisma, {
    companyId: company.id, subscriptionId: subscription.id,
  }, providerConfigurationId, options.paymentStatus ?? PaymentStatus.CAPTURED);
  const periodStart = new Date('2026-09-01T00:00:00.000Z');
  const periodEnd = new Date('2026-10-01T00:00:00.000Z');
  const subscriptionStatus = options.subscriptionStatus ?? SubscriptionStatus.ACTIVE;
  await prisma.companySubscription.update({ where: { id: subscription.id }, data: {
    status: subscriptionStatus, activatedByPaymentId: payment.id,
    startsAt: periodStart, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
  } });
  if (options.profile) await prisma.companyBillingProfile.create({ data: {
    companyId: company.id, billingName: 'IG-C Customer', addressLine1: '1 Customer Road',
    city: 'Pune', postalCode: '411001', country: 'IN',
  } });
  return { companyId: company.id, planId: plan.id, subscriptionId: subscription.id, paymentId: payment.id, periodStart, periodEnd };
}

async function createPayment(prisma: PrismaClient, fixture: { companyId: string; subscriptionId: string }, providerConfigurationId: string, status: PaymentStatus) {
  const suffix = randomUUID();
  const captured = status === PaymentStatus.CAPTURED;
  return prisma.payment.create({ data: {
    companyId: fixture.companyId, subscriptionId: fixture.subscriptionId, providerConfigurationId,
    purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status,
    provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST,
    amountMinor: 1000n, currency: 'INR', idempotencyKey: `igc-${suffix}`, businessReference: `igc-${suffix}`,
    capturedProviderPaymentId: captured ? `pay_${suffix.replaceAll('-', '')}` : null,
    providerStatus: captured ? 'captured' : 'created', capturedAt: captured ? new Date('2026-09-01T00:00:00.000Z') : null,
  } });
}

async function assertIssuedEvidence(prisma: PrismaClient, fixture: Fixture): Promise<void> {
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { sourcePaymentId: fixture.paymentId } });
  assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 1);
  assert.equal(await prisma.invoiceLine.count({ where: { invoiceId: invoice.id } }), 1);
  const audits = await prisma.auditLog.findMany({ where: {
    action: INVOICE_ISSUED, entityType: 'Invoice', entityId: invoice.id,
  }, select: { actorUserId: true, metadata: true } });
  assert.deepEqual(audits, [{ actorUserId: null, metadata: {
    sourcePaymentId: fixture.paymentId, sourceSubscriptionId: fixture.subscriptionId,
    invoiceNumber: invoice.invoiceNumber,
  } }]);
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval,
  InvoiceNumberResetPolicy,
  PaymentProviderMode,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
  PlanBillingModel,
  Prisma,
  PrismaClient,
  RecurringPriceBasis,
  SubscriptionActivationSource,
} from '@prisma/client';

const enabled = process.env.RUN_INVOICE_FOUNDATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
const rollback = new Error('ROLLBACK_INVOICE_FOUNDATION_PROBE');

describeDb('Invoice Foundation PostgreSQL integrity', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('persists exact bigint invoice evidence and rolls all probe data back', async () => {
    const ids: string[] = [];
    await assert.rejects(prisma.$transaction(async (tx) => {
      const fixture = await commercialFixture(tx);
      const invoice = await insertInvoice(tx, fixture, { total: 9_007_199_254_740_993n });
      await insertLine(tx, fixture, invoice, { amount: 9_007_199_254_740_993n });
      const [stored] = await tx.$queryRaw<Array<{
        subtotalMinor: bigint;
        totalMinor: bigint;
        lineSubtotalMinor: bigint;
        planCodeSnapshot: string;
        planNameSnapshot: string;
      }>>`
        SELECT i."subtotalMinor", i."totalMinor", l."lineSubtotalMinor", l."planCodeSnapshot", l."planNameSnapshot"
        FROM "Invoice" i JOIN "InvoiceLine" l ON l."invoiceId" = i."id"
        WHERE i."id" = ${invoice.id}::uuid`;
      assert.deepEqual(stored, {
        subtotalMinor: 9_007_199_254_740_993n,
        totalMinor: 9_007_199_254_740_993n,
        lineSubtotalMinor: 9_007_199_254_740_993n,
        planCodeSnapshot: fixture.planCodeSnapshot,
        planNameSnapshot: fixture.planNameSnapshot,
      });
      ids.push(invoice.id);
      throw rollback;
    }), (error: unknown) => error === rollback);
    const [count] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "Invoice" WHERE "id" = ANY(${ids}::uuid[])`;
    assert.equal(count.count, 0n);
  });

  it('enforces billing-profile, sequence-scope, source, invoice-number, and line-sequence uniqueness', async () => {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const fixture = await commercialFixture(tx);
      await expectConstraint(tx, () => insertBillingProfile(tx, fixture.companyId));
      await expectConstraint(tx, () => insertSequence(tx, fixture.sequenceId, fixture.prefix));

      const first = await insertInvoice(tx, fixture);
      await expectConstraint(tx, () => insertInvoice(tx, fixture, { invoiceNumber: `${fixture.prefix}/000002`, numberSequence: 2n }));

      const secondFixture = await commercialFixture(tx);
      await expectConstraint(tx, () => insertInvoice(tx, secondFixture, { invoiceNumber: first.invoiceNumber }));

      await insertLine(tx, fixture, first);
      await expectConstraint(tx, () => insertLine(tx, fixture, first));
      throw rollback;
    }), (error: unknown) => error === rollback);
  });

  it('rejects cross-company invoice ownership and cross-plan line evidence', async () => {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const fixture = await commercialFixture(tx);
      const otherCompany = await tx.company.create({ data: { name: 'IF-A other company', slug: `ifa-other-${randomUUID()}` } });
      await expectConstraint(tx, () => insertInvoice(tx, { ...fixture, companyId: otherCompany.id }));

      const invoice = await insertInvoice(tx, fixture);
      const otherPlan = await tx.plan.create({ data: { code: `IFA-OTHER-${randomUUID()}`, name: 'IF-A other plan', billingModel: PlanBillingModel.PER_USER } });
      await expectConstraint(tx, () => insertLine(tx, { ...fixture, planId: otherPlan.id }, invoice));
      throw rollback;
    }), (error: unknown) => error === rollback);
  });

  it('enforces positive values, currency, text, service-period, and due-date checks', async () => {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const fixture = await commercialFixture(tx);
      await expectConstraint(tx, () => insertInvoice(tx, fixture, { numberSequence: 0n }));
      await expectConstraint(tx, () => insertInvoice(tx, fixture, { total: 0n }));
      await expectConstraint(tx, () => insertInvoice(tx, fixture, { subtotal: 101n, total: 100n }));
      await expectConstraint(tx, () => insertInvoice(tx, fixture, { currency: 'inr' }));
      await expectConstraint(tx, () => insertInvoice(tx, fixture, { reversePeriod: true }));
      await expectConstraint(tx, () => insertInvoice(tx, fixture, { dueBeforeIssue: true }));
      await expectConstraint(tx, () => insertInvoice(tx, fixture, { sellerName: '   ' }));
      const blankProfileCompany = await tx.company.create({ data: { name: 'IF-A blank profile', slug: `ifa-blank-${randomUUID()}` } });
      await expectConstraint(tx, () => insertBillingProfile(tx, blankProfileCompany.id, '   '));
      await expectConstraint(tx, () => insertSequence(tx, randomUUID(), `${fixture.prefix}X`, -1n));

      const invoice = await insertInvoice(tx, fixture);
      await expectConstraint(tx, () => insertLine(tx, fixture, invoice, { lineSequence: 0 }));
      await expectConstraint(tx, () => insertLine(tx, fixture, invoice, { quantity: 0 }));
      await expectConstraint(tx, () => insertLine(tx, fixture, invoice, { amount: 0n }));
      await expectConstraint(tx, () => insertLine(tx, fixture, invoice, { currency: 'IN' }));
      await expectConstraint(tx, () => insertLine(tx, fixture, invoice, { planCodeSnapshot: '   ' }));
      await expectConstraint(tx, () => insertLine(tx, fixture, invoice, { planNameSnapshot: '   ' }));
      throw rollback;
    }), (error: unknown) => error === rollback);
  });

  it('restricts deletion of every referenced commercial source', async () => {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const fixture = await commercialFixture(tx);
      const invoice = await insertInvoice(tx, fixture);
      await insertLine(tx, fixture, invoice);
      const restrictions = await tx.$queryRaw<Array<{ sourceTable: string; targetTable: string; deleteAction: string }>>`
        SELECT conrelid::regclass::text AS "sourceTable", confrelid::regclass::text AS "targetTable", confdeltype::text AS "deleteAction"
        FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid IN ('"Invoice"'::regclass, '"InvoiceLine"'::regclass)
          AND confrelid IN ('"Company"'::regclass, '"Payment"'::regclass, '"CompanySubscription"'::regclass, '"Plan"'::regclass)`;
      assert.equal(restrictions.length, 5);
      assert.ok(restrictions.every(({ deleteAction }) => deleteAction === 'r'));
      await expectConstraint(tx, () => tx.payment.delete({ where: { id: fixture.paymentId } }));
      await expectConstraint(tx, () => tx.companySubscription.delete({ where: { id: fixture.subscriptionId } }));
      await expectConstraint(tx, () => tx.plan.delete({ where: { id: fixture.planId } }));
      await expectConstraint(tx, () => tx.company.delete({ where: { id: fixture.companyId } }));
      throw rollback;
    }), (error: unknown) => error === rollback);
  });

  it('keeps InvoiceLine plan display evidence immutable when the live Plan changes', async () => {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const fixture = await commercialFixture(tx);
      const invoice = await insertInvoice(tx, fixture);
      await insertLine(tx, fixture, invoice);

      await tx.plan.update({
        where: { id: fixture.planId },
        data: { code: `CHANGED-${randomUUID()}`, name: 'Changed live Plan name' },
      });

      const [stored] = await tx.$queryRaw<Array<{ planCodeSnapshot: string; planNameSnapshot: string }>>`
        SELECT "planCodeSnapshot", "planNameSnapshot" FROM "InvoiceLine" WHERE "invoiceId" = ${invoice.id}::uuid`;
      assert.deepEqual(stored, {
        planCodeSnapshot: fixture.planCodeSnapshot,
        planNameSnapshot: fixture.planNameSnapshot,
      });
      throw rollback;
    }), (error: unknown) => error === rollback);
  });
});

async function commercialFixture(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const company = await tx.company.create({ data: { name: 'IF-A company', slug: `ifa-${suffix}` } });
  const plan = await tx.plan.create({ data: { code: `IFA-${suffix}`, name: 'IF-A plan', billingModel: PlanBillingModel.PER_USER } });
  const subscription = await tx.companySubscription.create({ data: {
    companyId: company.id,
    planId: plan.id,
    activationSource: SubscriptionActivationSource.PAYMENT,
    billingInterval: BillingInterval.MONTHLY,
    planCodeSnapshot: plan.code,
    planNameSnapshot: plan.name,
    billingModelSnapshot: PlanBillingModel.PER_USER,
    currency: 'INR',
    recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
    recurringUnitPriceMinor: 100n,
    recurringTotalPriceMinor: 100n,
    recurringCurrency: 'INR',
    pricingInterval: BillingInterval.MONTHLY,
    pricingResolvedAt: new Date(),
    seatQuantity: 1,
    currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
  } });
  const configuration = await tx.billingProviderConfiguration.findUnique({ where: {
    provider_mode: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST },
  } }) ?? await tx.billingProviderConfiguration.create({ data: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } });
  const payment = await tx.payment.create({ data: {
    companyId: company.id,
    subscriptionId: subscription.id,
    providerConfigurationId: configuration.id,
    purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION,
    status: PaymentStatus.CAPTURED,
    provider: configuration.provider,
    providerMode: configuration.mode,
    amountMinor: 100n,
    currency: 'INR',
    idempotencyKey: `ifa-${suffix}`,
    businessReference: `IFA-${suffix}`,
    capturedProviderPaymentId: `pay-${suffix}`,
    providerStatus: 'captured',
    capturedAt: new Date('2026-09-01T00:00:00.000Z'),
  } });
  await tx.companySubscription.update({
    where: { id: subscription.id },
    data: { status: 'ACTIVE', activatedByPaymentId: payment.id },
  });
  const sequenceId = randomUUID();
  const prefix = `IFA${suffix.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  await insertBillingProfile(tx, company.id);
  await insertSequence(tx, sequenceId, prefix);
  return {
    companyId: company.id,
    planId: plan.id,
    subscriptionId: subscription.id,
    paymentId: payment.id,
    sequenceId,
    prefix,
    configurationId: configuration.id,
    planCodeSnapshot: subscription.planCodeSnapshot,
    planNameSnapshot: subscription.planNameSnapshot,
  };
}

async function insertBillingProfile(tx: Prisma.TransactionClient, companyId: string, billingName = 'IF-A Customer') {
  return tx.$executeRaw`INSERT INTO "CompanyBillingProfile" (
    "id", "companyId", "billingName", "addressLine1", "city", "postalCode", "country", "updatedAt"
  ) VALUES (${randomUUID()}::uuid, ${companyId}::uuid, ${billingName}, '1 Customer Road', 'Pune', '411001', 'IN', CURRENT_TIMESTAMP)`;
}

async function insertSequence(tx: Prisma.TransactionClient, id: string, prefix: string, lastAllocatedSequence = 1n) {
  return tx.$executeRaw`INSERT INTO "InvoiceNumberSequence" (
    "id", "prefix", "resetPolicy", "resetBucket", "lastAllocatedSequence", "updatedAt"
  ) VALUES (${id}::uuid, ${prefix}, ${InvoiceNumberResetPolicy.NEVER}::"InvoiceNumberResetPolicy", 'NEVER', ${lastAllocatedSequence}, CURRENT_TIMESTAMP)`;
}

type InvoiceOverrides = {
  invoiceNumber?: string;
  numberSequence?: bigint;
  subtotal?: bigint;
  total?: bigint;
  currency?: string;
  reversePeriod?: boolean;
  dueBeforeIssue?: boolean;
  sellerName?: string;
};

async function insertInvoice(tx: Prisma.TransactionClient, fixture: Awaited<ReturnType<typeof commercialFixture>>, overrides: InvoiceOverrides = {}) {
  const id = randomUUID();
  const numberSequence = overrides.numberSequence ?? 1n;
  const invoiceNumber = overrides.invoiceNumber ?? `${fixture.prefix}/${numberSequence.toString().padStart(6, '0')}`;
  const issuedAt = new Date('2026-09-01T00:00:00.000Z');
  const periodStart = overrides.reversePeriod ? new Date('2026-10-01T00:00:00.000Z') : new Date('2026-09-01T00:00:00.000Z');
  const periodEnd = overrides.reversePeriod ? new Date('2026-09-01T00:00:00.000Z') : new Date('2026-10-01T00:00:00.000Z');
  const dueAt = overrides.dueBeforeIssue ? new Date('2026-08-31T23:59:59.000Z') : null;
  const subtotal = overrides.subtotal ?? overrides.total ?? 100n;
  const total = overrides.total ?? overrides.subtotal ?? 100n;
  await tx.$executeRaw`INSERT INTO "Invoice" (
    "id", "companyId", "sourcePaymentId", "sourceSubscriptionId", "sourcePaymentPurpose", "sourceCapturedAt",
    "capturedPaymentReference", "numberSequenceId", "numberPrefix", "numberResetPolicy", "numberResetBucket",
    "numberSequence", "invoiceNumber", "issuedAt", "dueAt", "servicePeriodStart", "servicePeriodEnd",
    "sellerLegalName", "sellerAddressLine1", "sellerCity", "sellerPostalCode", "sellerCountry",
    "billToName", "billToAddressLine1", "billToCity", "billToPostalCode", "billToCountry",
    "currency", "subtotalMinor", "totalMinor", "updatedAt"
  ) VALUES (
    ${id}::uuid, ${fixture.companyId}::uuid, ${fixture.paymentId}::uuid, ${fixture.subscriptionId}::uuid,
    ${PaymentPurpose.SUBSCRIPTION_ACTIVATION}::"PaymentPurpose", ${issuedAt}, 'pay-authoritative', ${fixture.sequenceId}::uuid,
    ${fixture.prefix}, ${InvoiceNumberResetPolicy.NEVER}::"InvoiceNumberResetPolicy", 'NEVER', ${numberSequence}, ${invoiceNumber},
    ${issuedAt}, ${dueAt}, ${periodStart}, ${periodEnd}, ${overrides.sellerName ?? 'IF-A Seller'}, '1 Seller Road', 'Pune',
    '411001', 'IN', 'IF-A Customer', '1 Customer Road', 'Pune', '411001', 'IN', ${overrides.currency ?? 'INR'},
    ${subtotal}, ${total}, CURRENT_TIMESTAMP
  )`;
  return { id, invoiceNumber };
}

type LineOverrides = {
  lineSequence?: number;
  quantity?: number;
  amount?: bigint;
  currency?: string;
  planCodeSnapshot?: string;
  planNameSnapshot?: string;
};

async function insertLine(
  tx: Prisma.TransactionClient,
  fixture: Awaited<ReturnType<typeof commercialFixture>>,
  invoice: { id: string },
  overrides: LineOverrides = {},
) {
  const amount = overrides.amount ?? 100n;
  return tx.$executeRaw`INSERT INTO "InvoiceLine" (
    "id", "invoiceId", "companyId", "sourceSubscriptionId", "sourcePlanId", "planCodeSnapshot", "planNameSnapshot",
    "lineSequence", "description", "quantity", "unitAmountMinor", "lineSubtotalMinor", "currency"
  ) VALUES (
    ${randomUUID()}::uuid, ${invoice.id}::uuid, ${fixture.companyId}::uuid, ${fixture.subscriptionId}::uuid,
    ${fixture.planId}::uuid, ${overrides.planCodeSnapshot ?? fixture.planCodeSnapshot},
    ${overrides.planNameSnapshot ?? fixture.planNameSnapshot}, ${overrides.lineSequence ?? 1}, 'Subscription',
    ${overrides.quantity ?? 1}, ${amount}, ${amount}, ${overrides.currency ?? 'INR'}
  )`;
}

async function expectConstraint(tx: Prisma.TransactionClient, operation: () => Promise<unknown>) {
  const savepoint = `check_${randomUUID().replaceAll('-', '')}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  await assert.rejects(operation);
  await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
}

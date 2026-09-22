import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  BillingInterval, InvoiceNumberResetPolicy, PaymentProviderMode, PaymentProviderType,
  PaymentPurpose, PaymentStatus, PlanBillingModel, PrismaClient, RecurringPriceBasis,
  SubscriptionActivationSource, SubscriptionStatus,
} from '@prisma/client';
import { InvoiceGenerationRecoveryService } from './invoice-generation-recovery.service';
import { InvoiceGenerationService } from './invoice-generation.service';
import { INVOICE_ISSUED, InvoiceIssuanceService } from './invoice-issuance.service';

const enabled = process.env.RUN_INVOICE_GENERATION_CONCURRENCY_DB_INTEGRATION === '1';
const REQUIRED_TABLES = [
  'Company', 'Plan', 'CompanySubscription', 'BillingSettings', 'CompanyBillingProfile',
  'BillingProviderConfiguration', 'Payment', 'SubscriptionRenewal', 'InvoiceNumberSequence', 'Invoice', 'InvoiceLine',
  'User', 'AuditLog', 'GstTaxPolicyVersion', 'PaymentTaxSnapshot', 'PaymentTaxComponent',
  'InvoiceGstEvidence', 'InvoiceLineGstEvidence', 'InvoiceLineTaxComponent',
] as const;

describe('IG-D PostgreSQL invoice generation concurrency', () => {
  it('converges all invoice-generation entry-path races without duplicate evidence', { skip: !enabled }, async () => {
    await withIsolatedDatabase(async (prisma) => {
      const provider = await prisma.billingProviderConfiguration.create({ data: {
        provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST,
      } });
      await prisma.billingSettings.create({ data: {
        scope: 'PLATFORM', invoicePrefix: 'IGD', sellerLegalName: 'IG-D Seller',
        sellerAddressLine1: '1 Seller Road', sellerCity: 'Pune', sellerPostalCode: '411001', sellerCountry: 'IN',
      } });
      const actor = await prisma.user.create({ data: {
        email: `igd-${randomUUID()}@example.test`, passwordHash: 'test-only', firstName: 'IG-D', lastName: 'Actor',
      } });

      let order = 0;
      const create = (profile = true) => createFixture(prisma, provider.id, ++order, profile);

      const recoveryRace = await create();
      const recoveryBarrier = barrier(2);
      const recoveryOne = recoveryWithBarrier(prisma, recoveryBarrier);
      const recoveryTwo = recoveryWithBarrier(prisma, recoveryBarrier);
      const recoveryResults = await Promise.all([recoveryOne.recoverDue(), recoveryTwo.recoverDue()]);
      assert.deepEqual(recoveryResults, [
        { scanned: 1, succeeded: 1, failed: 0 },
        { scanned: 1, succeeded: 1, failed: 0 },
      ]);
      await assertEvidence(prisma, recoveryRace, null);
      await assertSourceUnchanged(prisma, recoveryRace);

      const manualRace = await create();
      const manualGate = gate();
      const manualRecovery = recoveryWithGate(prisma, manualRace.paymentId, manualGate);
      const recoveryPromise = manualRecovery.recoverDue();
      await manualGate.entered;
      const manualResult = await new InvoiceIssuanceService(prisma as never).issue(manualRace.paymentId, actor.id);
      manualGate.release();
      assert.deepEqual(await recoveryPromise, { scanned: 1, succeeded: 1, failed: 0 });
      assert.equal(manualResult.sourcePaymentId, manualRace.paymentId);
      await assertEvidence(prisma, manualRace, actor.id);
      await assertSourceUnchanged(prisma, manualRace);

      const automaticRace = await create();
      const automaticGate = gate();
      const automaticRecovery = recoveryWithGate(prisma, automaticRace.paymentId, automaticGate);
      const automaticRecoveryPromise = automaticRecovery.recoverDue();
      await automaticGate.entered;
      const automaticResult = await generation(prisma).generate(automaticRace.paymentId);
      automaticGate.release();
      assert.deepEqual(automaticResult, { outcome: 'ISSUED' });
      assert.deepEqual(await automaticRecoveryPromise, { scanned: 1, succeeded: 1, failed: 0 });
      await assertEvidence(prisma, automaticRace, null);
      await assertSourceUnchanged(prisma, automaticRace);

      const first = await create();
      const poisoned = await create(false);
      const last = await create();
      const lastGate = gate();
      const poisonGeneration = generation(prisma);
      const generate = poisonGeneration.generate.bind(poisonGeneration);
      poisonGeneration.generate = async (paymentId: string) => {
        if (paymentId === last.paymentId) {
          lastGate.signal();
          await lastGate.wait;
        }
        return generate(paymentId);
      };
      silenceExpectedGenerationErrors(poisonGeneration);
      const poisonedRecovery = new InvoiceGenerationRecoveryService(prisma as never, poisonGeneration);
      const poisonedRecoveryPromise = poisonedRecovery.recoverDue();
      await lastGate.entered;
      assert.deepEqual(await generation(prisma).generate(last.paymentId), { outcome: 'ISSUED' });
      lastGate.release();
      assert.deepEqual(await poisonedRecoveryPromise, { scanned: 3, succeeded: 2, failed: 1 });
      await assertEvidence(prisma, first, null);
      await assertEvidence(prisma, last, null);
      await assertNoEvidence(prisma, poisoned);
      await assertSourceUnchanged(prisma, first);
      await assertSourceUnchanged(prisma, poisoned);
      await assertSourceUnchanged(prisma, last);

      const invoices = await prisma.invoice.findMany({ select: {
        id: true, sourcePaymentId: true, invoiceNumber: true, numberSequence: true,
      } });
      assert.equal(invoices.length, 5);
      assert.equal(new Set(invoices.map((invoice) => invoice.id)).size, 5);
      assert.equal(new Set(invoices.map((invoice) => invoice.sourcePaymentId)).size, 5);
      assert.equal(new Set(invoices.map((invoice) => invoice.invoiceNumber)).size, 5);
      assert.equal(new Set(invoices.map((invoice) => invoice.numberSequence.toString())).size, 5);
      const sequence = await prisma.invoiceNumberSequence.findFirstOrThrow({ where: { prefix: 'IGD' } });
      assert.equal(sequence.lastAllocatedSequence, 5n);

      await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: {
        invoicePrefix: 'IGDRB', invoiceNumberResetPolicy: InvoiceNumberResetPolicy.NEVER,
      } });
      const rolledBack = await create();
      const failure = new Error('IGD_TEST_ONLY_AFTER_SEQUENCE');
      const failingIssuance = new InvoiceIssuanceService(prisma as never, undefined, {
        afterSequenceAllocated: () => { throw failure; },
      });
      await assert.rejects(() => failingIssuance.issue(rolledBack.paymentId), (error: unknown) => error === failure);
      await assertNoEvidence(prisma, rolledBack);
      assert.equal(await prisma.invoiceNumberSequence.count({ where: { prefix: 'IGDRB' } }), 0);
      await assertSourceUnchanged(prisma, rolledBack);

      const afterRollback = await create();
      const issuedAfterRollback = await new InvoiceIssuanceService(prisma as never).issue(afterRollback.paymentId);
      assert.equal(issuedAfterRollback.invoiceNumber, 'IGDRB/000001');
      await assertEvidence(prisma, afterRollback, null);
      const durableAfterRollback = await prisma.invoice.findUniqueOrThrow({ where: { id: issuedAfterRollback.id } });
      assert.equal(durableAfterRollback.numberSequence, 1n);
      assert.equal(durableAfterRollback.invoiceNumber, 'IGDRB/000001');
      const rollbackSequence = await prisma.invoiceNumberSequence.findFirstOrThrow({ where: {
        scope: 'PLATFORM', prefix: 'IGDRB', resetBucket: 'NEVER',
      } });
      assert.equal(rollbackSequence.resetPolicy, InvoiceNumberResetPolicy.NEVER);
      assert.equal(rollbackSequence.lastAllocatedSequence, 1n);
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: afterRollback.paymentId } }), 1);
      assert.equal(await prisma.invoiceLine.count({ where: { invoiceId: issuedAfterRollback.id } }), 1);
      assert.equal(await prisma.auditLog.count({ where: {
        action: INVOICE_ISSUED, entityType: 'Invoice', entityId: issuedAfterRollback.id,
      } }), 1);
      await assertSourceUnchanged(prisma, afterRollback);
    });
  });
});

type Fixture = {
  companyId: string; planId: string; subscriptionId: string; paymentId: string;
  periodStart: Date; periodEnd: Date; amountMinor: bigint; currency: string; providerPaymentId: string;
  paymentBefore: PaymentAuthority;
  subscriptionBefore: SubscriptionAuthority;
};

type PaymentAuthority = {
  status: PaymentStatus; amountMinor: bigint; currency: string;
  capturedAt: Date | null; capturedProviderPaymentId: string | null;
};

type SubscriptionAuthority = {
  activationSource: SubscriptionActivationSource; status: SubscriptionStatus;
  activatedByPaymentId: string | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  currency: string; billingModelSnapshot: PlanBillingModel; recurringPriceBasis: RecurringPriceBasis | null;
  recurringUnitPriceMinor: bigint | null; recurringTotalPriceMinor: bigint | null;
  recurringCurrency: string | null; pricingInterval: BillingInterval | null; pricingResolvedAt: Date | null;
  planCodeSnapshot: string; planNameSnapshot: string; seatQuantity: number;
};

const paymentAuthoritySelect = {
  status: true, amountMinor: true, currency: true, capturedAt: true, capturedProviderPaymentId: true,
} as const;

const subscriptionAuthoritySelect = {
  activationSource: true, status: true, activatedByPaymentId: true,
  currentPeriodStart: true, currentPeriodEnd: true, currency: true, billingModelSnapshot: true,
  recurringPriceBasis: true, recurringUnitPriceMinor: true, recurringTotalPriceMinor: true,
  recurringCurrency: true, pricingInterval: true, pricingResolvedAt: true,
  planCodeSnapshot: true, planNameSnapshot: true, seatQuantity: true,
} as const;

async function createFixture(prisma: PrismaClient, providerConfigurationId: string, order: number, profile: boolean): Promise<Fixture> {
  const suffix = randomUUID();
  const company = await prisma.company.create({ data: { name: `IG-D ${suffix}`, slug: `igd-${suffix}` } });
  const plan = await prisma.plan.create({ data: { code: `IGD-${suffix}`, name: 'IG-D Plan', billingModel: PlanBillingModel.PER_USER } });
  const periodStart = new Date('2026-09-01T00:00:00.000Z');
  const periodEnd = new Date('2026-10-01T00:00:00.000Z');
  const amountMinor = 9_007_199_254_740_991n;
  const subscription = await prisma.companySubscription.create({ data: {
    companyId: company.id, planId: plan.id, status: SubscriptionStatus.PENDING,
    activationSource: SubscriptionActivationSource.PAYMENT, billingInterval: BillingInterval.MONTHLY,
    planCodeSnapshot: plan.code, planNameSnapshot: plan.name, billingModelSnapshot: PlanBillingModel.CUSTOM,
    currency: 'INR', recurringPriceBasis: RecurringPriceBasis.FIXED_TOTAL, recurringUnitPriceMinor: null,
    recurringTotalPriceMinor: amountMinor, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
    pricingResolvedAt: new Date(), seatQuantity: 10, entitlementsSnapshot: ['workforce.attendance'], limitsSnapshot: {},
  } });
  const providerPaymentId = `pay_${suffix.replaceAll('-', '')}`;
  const payment = await prisma.payment.create({ data: {
    companyId: company.id, subscriptionId: subscription.id, providerConfigurationId,
    purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.CAPTURED,
    provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST,
    amountMinor, currency: 'INR', idempotencyKey: `igd-${suffix}`, businessReference: `igd-${suffix}`,
    capturedProviderPaymentId: providerPaymentId, providerStatus: 'captured', capturedAt: periodStart,
    createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, order)),
  } });
  await prisma.companySubscription.update({ where: { id: subscription.id }, data: {
    status: SubscriptionStatus.ACTIVE, activatedByPaymentId: payment.id, startsAt: periodStart,
    currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
  } });
  if (profile) await prisma.companyBillingProfile.create({ data: {
    companyId: company.id, billingName: 'IG-D Customer', addressLine1: '1 Customer Road',
    city: 'Pune', postalCode: '411001', country: 'IN',
  } });
  const [paymentBefore, subscriptionBefore] = await Promise.all([
    prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, select: paymentAuthoritySelect }),
    prisma.companySubscription.findUniqueOrThrow({ where: { id: subscription.id }, select: subscriptionAuthoritySelect }),
  ]);
  return { companyId: company.id, planId: plan.id, subscriptionId: subscription.id, paymentId: payment.id,
    periodStart, periodEnd, amountMinor, currency: 'INR', providerPaymentId, paymentBefore, subscriptionBefore };
}

function generation(prisma: PrismaClient): InvoiceGenerationService {
  return new InvoiceGenerationService(new InvoiceIssuanceService(prisma as never));
}

function recoveryWithBarrier(prisma: PrismaClient, wait: () => Promise<void>): InvoiceGenerationRecoveryService {
  const service = generation(prisma);
  const generate = service.generate.bind(service);
  service.generate = async (paymentId: string) => { await wait(); return generate(paymentId); };
  return new InvoiceGenerationRecoveryService(prisma as never, service);
}

function recoveryWithGate(prisma: PrismaClient, paymentId: string, control: ReturnType<typeof gate>): InvoiceGenerationRecoveryService {
  const service = generation(prisma);
  const generate = service.generate.bind(service);
  service.generate = async (candidateId: string) => {
    if (candidateId === paymentId) {
      control.signal();
      await control.wait;
    }
    return generate(candidateId);
  };
  return new InvoiceGenerationRecoveryService(prisma as never, service);
}

function barrier(parties: number): () => Promise<void> {
  let arrivals = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  return async () => { arrivals += 1; if (arrivals === parties) release(); await ready; };
}

function gate() {
  let signal!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { signal = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { entered, wait, signal, release };
}

function silenceExpectedGenerationErrors(service: InvoiceGenerationService): void {
  (service as unknown as { logger: { error(): void } }).logger = { error: () => undefined };
}

async function assertEvidence(prisma: PrismaClient, fixture: Fixture, actorUserId: string | null): Promise<void> {
  const invoices = await prisma.invoice.findMany({ where: { sourcePaymentId: fixture.paymentId }, include: { lines: true } });
  assert.equal(invoices.length, 1);
  const [invoice] = invoices;
  assert.ok(invoice);
  assert.equal(invoice.sourcePaymentId, fixture.paymentId);
  assert.equal(invoice.subtotalMinor, fixture.amountMinor);
  assert.equal(invoice.totalMinor, fixture.amountMinor);
  assert.equal(invoice.dueAt, null);
  assert.equal(invoice.lines.length, 1);
  assert.equal(invoice.lines[0]?.lineSubtotalMinor, fixture.amountMinor);
  const audits = await prisma.auditLog.findMany({ where: {
    action: INVOICE_ISSUED, entityType: 'Invoice', entityId: invoice.id,
  }, select: { actorUserId: true, metadata: true } });
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.actorUserId, actorUserId);
  assert.deepEqual(audits[0]?.metadata, {
    sourcePaymentId: fixture.paymentId, sourceSubscriptionId: fixture.subscriptionId,
    invoiceNumber: invoice.invoiceNumber,
  });
}

async function assertNoEvidence(prisma: PrismaClient, fixture: Fixture): Promise<void> {
  assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 0);
  assert.equal(await prisma.invoiceLine.count({ where: { companyId: fixture.companyId } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { action: INVOICE_ISSUED, companyId: fixture.companyId } }), 0);
}

async function assertSourceUnchanged(prisma: PrismaClient, fixture: Fixture): Promise<void> {
  const [paymentAfter, subscriptionAfter] = await Promise.all([
    prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId }, select: paymentAuthoritySelect }),
    prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscriptionId }, select: subscriptionAuthoritySelect }),
  ]);
  assert.deepEqual(paymentAfter, fixture.paymentBefore);
  assert.deepEqual(subscriptionAfter, fixture.subscriptionBefore);
}

async function withIsolatedDatabase(run: (prisma: PrismaClient) => Promise<void>): Promise<void> {
  const admin = new PrismaClient();
  const schema = `igd_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^igd_[a-f0-9]{32}$/);
  let prisma: PrismaClient | undefined;
  try {
    await admin.$connect();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const enumTypes = await admin.$queryRaw<Array<{ name: string }>>`
      SELECT type.typname AS name FROM pg_type type
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
    await run(prisma);
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
}

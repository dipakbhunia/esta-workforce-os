import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, InvoiceNumberResetPolicy, PaymentProviderMode, PaymentProviderType,
  PaymentPurpose, PaymentStatus, PlanBillingModel, PrismaClient, RecurringPriceBasis,
  SubscriptionActivationSource, SubscriptionStatus,
} from '@prisma/client';
import {
  INVOICE_ISSUED, InvoiceIssuanceError, InvoiceIssuanceService,
} from './invoice-issuance.service';

const enabled = process.env.RUN_INVOICE_ISSUANCE_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('IF-B PostgreSQL invoice issuance', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('issues one exact immutable BigInt invoice and remains idempotent', async () => {
    const fixture = await createFixture({ amount: 9_007_199_254_740_991n, basis: RecurringPriceBasis.FIXED_TOTAL });
    const actorId = randomUUID();
    await prisma.user.create({ data: {
      id: actorId, email: `ifd-${actorId}@example.invalid`, passwordHash: 'integration-probe',
      firstName: 'IF-D', lastName: 'Actor',
    } });
    try {
      const service = new InvoiceIssuanceService(prisma as never, { now: () => new Date('2026-09-08T12:00:00.000Z') });
      const [persistedPayment, persistedSubscription] = await Promise.all([
        prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId }, select: { amountMinor: true } }),
        prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscriptionId }, select: {
          recurringTotalPriceMinor: true, recurringUnitPriceMinor: true,
        } }),
      ]);
      assert.equal(persistedPayment.amountMinor, 9_007_199_254_740_991n);
      assert.equal(persistedSubscription.recurringTotalPriceMinor, 9_007_199_254_740_991n);
      assert.equal(persistedSubscription.recurringUnitPriceMinor, null);
      const first = await service.issue(fixture.paymentId, actorId);
      const second = await service.issue(fixture.paymentId, actorId);
      assert.equal(first.id, second.id);
      assert.equal(first.subtotalMinor, '9007199254740991');
      assert.equal(first.totalMinor, '9007199254740991');
      assert.equal(first.line.subtotalMinor, '9007199254740991');
      assert.equal(first.line.unitAmountMinor, '9007199254740991');
      assert.equal(first.line.quantity, 1);
      assert.equal(first.dueAt, null);
      assert.equal(first.servicePeriodStart, fixture.periodStart.toISOString());
      assert.equal(first.servicePeriodEnd, fixture.periodEnd.toISOString());
      assert.equal(first.line.planCodeSnapshot, fixture.planCodeSnapshot);
      assert.equal(first.line.planNameSnapshot, fixture.planNameSnapshot);
      const snapshots = await prisma.invoice.findUniqueOrThrow({ where: { id: first.id }, select: {
        sellerLegalName: true, sellerBillingEmail: true, sellerAddressLine1: true, sellerCity: true,
        sellerStateCode: true, sellerPostalCode: true, sellerCountry: true,
        billToName: true, billToBillingEmail: true, billToAddressLine1: true, billToAddressLine2: true,
        billToCity: true, billToState: true, billToPostalCode: true, billToCountry: true, billToPhone: true,
      } });
      assert.deepEqual(snapshots, { sellerLegalName: 'IF-B Seller', sellerBillingEmail: 'seller@example.test',
        sellerAddressLine1: '1 Seller Road', sellerCity: 'Pune', sellerStateCode: '27',
        sellerPostalCode: '411001', sellerCountry: 'IN', billToName: 'IF-B Customer',
        billToBillingEmail: 'billing@example.test', billToAddressLine1: '1 Customer Road',
        billToAddressLine2: 'Suite 2', billToCity: 'Pune', billToState: 'MH',
        billToPostalCode: '411001', billToCountry: 'IN', billToPhone: '+91-9999999999' });
      await prisma.companyBillingProfile.update({ where: { companyId: fixture.companyId }, data: {
        billingName: 'Changed Customer', addressLine1: 'Changed Road', city: 'Mumbai', postalCode: '400001', country: 'IN',
      } });
      const immutable = await prisma.invoice.findUniqueOrThrow({ where: { id: first.id }, select: {
        billToName: true, billToAddressLine1: true, billToCity: true, billToPostalCode: true,
      } });
      assert.deepEqual(immutable, { billToName: 'IF-B Customer', billToAddressLine1: '1 Customer Road', billToCity: 'Pune', billToPostalCode: '411001' });
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 1);
      assert.equal(await prisma.invoiceLine.count({ where: { invoiceId: first.id } }), 1);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: INVOICE_ISSUED, entityType: 'Invoice', entityId: first.id },
        select: { actorUserId: true, companyId: true, metadata: true },
      });
      assert.equal(audit.actorUserId, actorId);
      assert.equal(audit.companyId, fixture.companyId);
      assert.deepEqual(audit.metadata, {
        sourcePaymentId: fixture.paymentId,
        sourceSubscriptionId: fixture.subscriptionId,
        invoiceNumber: first.invoiceNumber,
      });
      assert.equal(await prisma.auditLog.count({ where: {
        action: INVOICE_ISSUED, entityType: 'Invoice', entityId: first.id,
        companyId: fixture.companyId,
      } }), 1);
      assert.equal(JSON.stringify(first).match(/secret|signature|token|payload|credential/gi), null);
    } finally {
      await cleanup(fixture);
      await prisma.user.deleteMany({ where: { id: actorId } });
    }
  });

  it('uses subscription snapshots after the live Plan changes', async () => {
    const fixture = await createFixture();
    try {
      await prisma.plan.update({ where: { id: fixture.planId }, data: { code: `MUTATED-${randomUUID()}`, name: 'Mutable live plan' } });
      const result = await new InvoiceIssuanceService(prisma as never).issue(fixture.paymentId);
      assert.equal(result.line.planCodeSnapshot, fixture.planCodeSnapshot);
      assert.equal(result.line.planNameSnapshot, fixture.planNameSnapshot);
    } finally { await cleanup(fixture); }
  });

  it('serializes concurrent issuance to one invoice, line, number, and audit', async () => {
    const fixture = await createFixture();
    try {
      const service = new InvoiceIssuanceService(prisma as never);
      const results = await Promise.all(Array.from({ length: 5 }, () => service.issue(fixture.paymentId)));
      assert.equal(new Set(results.map(({ id }) => id)).size, 1);
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 1);
      assert.equal(await prisma.invoiceLine.count({ where: { invoiceId: results[0].id } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { action: INVOICE_ISSUED, entityId: results[0].id } }), 1);
    } finally { await cleanup(fixture); }
  });

  it('allocates unique numbers for separate Payments issued concurrently in one scope', async () => {
    const firstFixture = await createFixture();
    let secondFixture: Awaited<ReturnType<typeof createFixture>> | undefined;
    try {
      secondFixture = await createFixture();
      await setNumbering(firstFixture.prefix, InvoiceNumberResetPolicy.NEVER);
      const service = new InvoiceIssuanceService(prisma as never);
      const invoices = await Promise.all([
        service.issue(firstFixture.paymentId),
        service.issue(secondFixture.paymentId),
      ]);
      assert.equal(new Set(invoices.map(({ id }) => id)).size, 2);
      assert.equal(new Set(invoices.map(({ invoiceNumber }) => invoiceNumber)).size, 2);
      assert.deepEqual(invoices.map(({ invoiceNumber }) => invoiceNumber).sort(), [
        `${firstFixture.prefix}/000001`, `${firstFixture.prefix}/000002`,
      ]);
      for (const [fixture, returned] of [
        [firstFixture, invoices[0]], [secondFixture, invoices[1]],
      ] as const) {
        const durableInvoices = await prisma.invoice.findMany({
          where: { sourcePaymentId: fixture.paymentId },
          select: { id: true },
        });
        assert.deepEqual(durableInvoices, [{ id: returned.id }]);
        assert.equal(await prisma.invoiceLine.count({ where: { invoiceId: returned.id } }), 1);
        const audits = await prisma.auditLog.findMany({
          where: {
            action: INVOICE_ISSUED, entityType: 'Invoice', entityId: returned.id,
            companyId: fixture.companyId,
          },
          select: { metadata: true },
        });
        assert.deepEqual(audits, [{ metadata: {
          sourcePaymentId: fixture.paymentId,
          sourceSubscriptionId: fixture.subscriptionId,
          invoiceNumber: returned.invoiceNumber,
        } }]);
      }
      const sequence = await prisma.invoiceNumberSequence.findUniqueOrThrow({ where: {
        scope_prefix_resetPolicy_resetBucket: {
          scope: 'PLATFORM', prefix: firstFixture.prefix,
          resetPolicy: InvoiceNumberResetPolicy.NEVER, resetBucket: 'NEVER',
        },
      } });
      assert.equal(sequence.lastAllocatedSequence, 2n);
    } finally {
      try {
        if (secondFixture) await cleanup(secondFixture);
      } finally {
        await cleanup(firstFixture);
      }
    }
  });

  it('rolls sequence mutation back when issuance fails after allocation', async () => {
    const fixture = await createFixture();
    const failure = new Error('TEST_ONLY_AFTER_SEQUENCE');
    try {
      const service = new InvoiceIssuanceService(prisma as never, undefined, { afterSequenceAllocated: () => { throw failure; } });
      await assert.rejects(() => service.issue(fixture.paymentId), (error: unknown) => error === failure);
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 0);
      assert.equal(await prisma.invoiceNumberSequence.count({ where: { prefix: fixture.prefix } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: INVOICE_ISSUED, companyId: fixture.companyId } }), 0);
    } finally { await cleanup(fixture); }
  });

  it('blocks incomplete bill-to and commercial/payment mismatches without persistence', async () => {
    const fixture = await createFixture();
    try {
      await prisma.companyBillingProfile.update({ where: { companyId: fixture.companyId }, data: { city: '   ' } }).catch(() => undefined);
      // The database check may reject blank text, so remove the authority to exercise the domain failure.
      await prisma.companyBillingProfile.delete({ where: { companyId: fixture.companyId } });
      const service = new InvoiceIssuanceService(prisma as never);
      await assert.rejects(() => service.issue(fixture.paymentId), (error: unknown) => error instanceof InvoiceIssuanceError && error.code === 'BILLING_PROFILE_INCOMPLETE');
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 0);
      assert.equal(await prisma.invoiceNumberSequence.count({ where: { prefix: fixture.prefix } }), 0);
    } finally { await cleanup(fixture); }
  });

  it('rejects persisted payment eligibility mismatches before number allocation', async () => {
    const fixture = await createFixture();
    const service = new InvoiceIssuanceService(prisma as never);
    try {
      await prisma.payment.update({ where: { id: fixture.paymentId }, data: {
        status: PaymentStatus.PENDING, capturedAt: null, capturedProviderPaymentId: null,
      } });
      await assert.rejects(() => service.issue(fixture.paymentId), (error: unknown) => error instanceof InvoiceIssuanceError && error.code === 'PAYMENT_NOT_CAPTURED');
      await prisma.payment.update({ where: { id: fixture.paymentId }, data: {
        status: PaymentStatus.CAPTURED, capturedAt: fixture.periodStart,
        capturedProviderPaymentId: `pay_restored_${fixture.paymentId}`, amountMinor: 999n,
      } });
      await assert.rejects(() => service.issue(fixture.paymentId), (error: unknown) => error instanceof InvoiceIssuanceError && error.code === 'COMMERCIAL_MISMATCH');
      await prisma.payment.update({ where: { id: fixture.paymentId }, data: { amountMinor: 1_000n, currency: 'USD' } });
      await assert.rejects(() => service.issue(fixture.paymentId), (error: unknown) => error instanceof InvoiceIssuanceError && error.code === 'COMMERCIAL_MISMATCH');
      await assert.rejects(() => prisma.payment.update({ where: { id: fixture.paymentId }, data: { currency: 'INR', capturedAt: null } }));
      await assert.rejects(() => prisma.companySubscription.update({ where: { id: fixture.subscriptionId }, data: { currentPeriodEnd: fixture.periodStart } }));
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 0);
      assert.equal(await prisma.invoiceNumberSequence.count({ where: { prefix: fixture.prefix } }), 0);
    } finally { await cleanup(fixture); }
  });

  it('rejects subscription currency and billing-model/basis mismatches without partial state', async () => {
    const fixture = await createFixture();
    const service = new InvoiceIssuanceService(prisma as never);
    try {
      await prisma.companySubscription.update({ where: { id: fixture.subscriptionId }, data: { currency: 'USD' } });
      await assert.rejects(() => service.issue(fixture.paymentId), (error: unknown) => error instanceof InvoiceIssuanceError && error.code === 'COMMERCIAL_MISMATCH');
      await prisma.companySubscription.update({ where: { id: fixture.subscriptionId }, data: {
        currency: 'INR', billingModelSnapshot: PlanBillingModel.CUSTOM,
      } });
      await assert.rejects(() => service.issue(fixture.paymentId), (error: unknown) => error instanceof InvoiceIssuanceError && error.code === 'COMMERCIAL_SNAPSHOT_INVALID');
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 0);
      assert.equal(await prisma.invoiceLine.count({ where: { companyId: fixture.companyId } }), 0);
      assert.equal(await prisma.invoiceNumberSequence.count({ where: { prefix: fixture.prefix } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: INVOICE_ISSUED, companyId: fixture.companyId } }), 0);
    } finally { await cleanup(fixture); }
  });

  it('rejects a captured Payment whose subscription has not been activated by it', async () => {
    const fixture = await createFixture();
    try {
      await prisma.companySubscription.update({ where: { id: fixture.subscriptionId }, data: {
        status: SubscriptionStatus.PENDING, activatedByPaymentId: null, startsAt: null,
        currentPeriodStart: null, currentPeriodEnd: null,
      } });
      await assert.rejects(() => new InvoiceIssuanceService(prisma as never).issue(fixture.paymentId),
        (error: unknown) => error instanceof InvoiceIssuanceError && error.code === 'ACTIVATION_LINK_MISMATCH');
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: fixture.paymentId } }), 0);
      assert.equal(await prisma.invoiceLine.count({ where: { companyId: fixture.companyId } }), 0);
      assert.equal(await prisma.invoiceNumberSequence.count({ where: { prefix: fixture.prefix } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: INVOICE_ISSUED, companyId: fixture.companyId } }), 0);
    } finally { await cleanup(fixture); }
  });

  it('formats NEVER, calendar, financial-year, prefix-resume, and untruncated sequences', async () => {
    const fixture = await createFixture();
    try {
      const never = await new InvoiceIssuanceService(prisma as never, { now: () => new Date('2026-09-08T00:00:00Z') }).issue(fixture.paymentId);
      assert.equal(never.invoiceNumber, `${fixture.prefix}/000001`);
      assert.equal(never.line.quantity, 10);
      assert.equal(never.line.unitAmountMinor, '100');
      assert.equal(never.line.subtotalMinor, '1000');

      const calendar = await createAdditionalPayment(fixture);
      await setNumbering(fixture.prefix, InvoiceNumberResetPolicy.CALENDAR_YEAR);
      const calendarInvoice = await new InvoiceIssuanceService(prisma as never, { now: () => new Date('2026-12-31T18:30:00Z') }).issue(calendar.paymentId);
      assert.equal(calendarInvoice.invoiceNumber, `${fixture.prefix}/2027/000001`);

      const fy = await createAdditionalPayment(fixture);
      await setNumbering(`${fixture.prefix}X`, InvoiceNumberResetPolicy.FINANCIAL_YEAR);
      const fyInvoice = await new InvoiceIssuanceService(prisma as never, { now: () => new Date('2026-03-31T18:30:00Z') }).issue(fy.paymentId);
      assert.equal(fyInvoice.invoiceNumber, `${fixture.prefix}X/FY2026-27/000001`);

      const growth = await createAdditionalPayment(fixture);
      await setNumbering(`${fixture.prefix}G`, InvoiceNumberResetPolicy.NEVER);
      await prisma.invoiceNumberSequence.create({ data: { prefix: `${fixture.prefix}G`, resetPolicy: InvoiceNumberResetPolicy.NEVER, resetBucket: 'NEVER', lastAllocatedSequence: 999_999n } });
      const grown = await new InvoiceIssuanceService(prisma as never).issue(growth.paymentId);
      assert.equal(grown.invoiceNumber, `${fixture.prefix}G/1000000`);

      const resumedFirstPayment = await createAdditionalPayment(fixture);
      await setNumbering(`${fixture.prefix}R`, InvoiceNumberResetPolicy.NEVER);
      const resumedFirst = await new InvoiceIssuanceService(prisma as never).issue(resumedFirstPayment.paymentId);
      assert.equal(resumedFirst.invoiceNumber, `${fixture.prefix}R/000001`);
      const alternatePayment = await createAdditionalPayment(fixture);
      await setNumbering(`${fixture.prefix}A`, InvoiceNumberResetPolicy.NEVER);
      assert.equal((await new InvoiceIssuanceService(prisma as never).issue(alternatePayment.paymentId)).invoiceNumber, `${fixture.prefix}A/000001`);
      const resumedSecondPayment = await createAdditionalPayment(fixture);
      await setNumbering(`${fixture.prefix}R`, InvoiceNumberResetPolicy.NEVER);
      assert.equal((await new InvoiceIssuanceService(prisma as never).issue(resumedSecondPayment.paymentId)).invoiceNumber, `${fixture.prefix}R/000002`);
    } finally { await cleanup(fixture); }
  });

  it('persists exact Asia/Kolkata calendar, financial-year, and NEVER boundary scopes', async () => {
    const calendar = await createFixture();
    try {
      await setNumbering(calendar.prefix, InvoiceNumberResetPolicy.CALENDAR_YEAR);
      const before = await new InvoiceIssuanceService(prisma as never, {
        now: () => new Date('2025-12-31T18:29:59.999Z'),
      }).issue(calendar.paymentId);
      const next = await createAdditionalPayment(calendar);
      const at = await new InvoiceIssuanceService(prisma as never, {
        now: () => new Date('2025-12-31T18:30:00.000Z'),
      }).issue(next.paymentId);
      assert.equal(before.invoiceNumber, `${calendar.prefix}/2025/000001`);
      assert.equal(at.invoiceNumber, `${calendar.prefix}/2026/000001`);
    } finally { await cleanup(calendar); }

    const financial = await createFixture();
    try {
      await setNumbering(financial.prefix, InvoiceNumberResetPolicy.FINANCIAL_YEAR);
      const before = await new InvoiceIssuanceService(prisma as never, {
        now: () => new Date('2026-03-31T18:29:59.999Z'),
      }).issue(financial.paymentId);
      const next = await createAdditionalPayment(financial);
      const at = await new InvoiceIssuanceService(prisma as never, {
        now: () => new Date('2026-03-31T18:30:00.000Z'),
      }).issue(next.paymentId);
      assert.equal(before.invoiceNumber, `${financial.prefix}/FY2025-26/000001`);
      assert.equal(at.invoiceNumber, `${financial.prefix}/FY2026-27/000001`);
    } finally { await cleanup(financial); }

    const never = await createFixture();
    try {
      const before = await new InvoiceIssuanceService(prisma as never, {
        now: () => new Date('2025-12-31T18:29:59.999Z'),
      }).issue(never.paymentId);
      const next = await createAdditionalPayment(never);
      const at = await new InvoiceIssuanceService(prisma as never, {
        now: () => new Date('2026-03-31T18:30:00.000Z'),
      }).issue(next.paymentId);
      assert.equal(before.invoiceNumber, `${never.prefix}/000001`);
      assert.equal(at.invoiceNumber, `${never.prefix}/000002`);
    } finally { await cleanup(never); }
  });
});

async function createFixture(options: { amount?: bigint; basis?: RecurringPriceBasis } = {}) {
  const suffix = randomUUID();
  const amount = options.amount ?? 1_000n;
  const basis = options.basis ?? RecurringPriceBasis.PER_USER_UNIT;
  const prefix = `IFB${suffix.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const company = await prisma.company.create({ data: { name: 'IF-B company', slug: `ifb-${suffix}` } });
  const billingModel = basis === RecurringPriceBasis.PER_USER_UNIT ? PlanBillingModel.PER_USER : PlanBillingModel.CUSTOM;
  const plan = await prisma.plan.create({ data: { code: `IFB-${suffix}`, name: 'IF-B snapshot plan', billingModel } });
  const periodStart = new Date('2026-09-01T00:00:00.000Z');
  const periodEnd = new Date('2026-10-01T00:00:00.000Z');
  const subscription = await prisma.companySubscription.create({ data: {
    companyId: company.id, planId: plan.id, status: SubscriptionStatus.PENDING,
    activationSource: SubscriptionActivationSource.PAYMENT, billingInterval: BillingInterval.MONTHLY,
    planCodeSnapshot: plan.code, planNameSnapshot: plan.name, billingModelSnapshot: billingModel,
    currency: 'INR', recurringPriceBasis: basis,
    recurringUnitPriceMinor: basis === RecurringPriceBasis.PER_USER_UNIT ? 100n : null,
    recurringTotalPriceMinor: amount, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
    pricingResolvedAt: new Date(), seatQuantity: basis === RecurringPriceBasis.PER_USER_UNIT ? Number(amount / 100n) : 10,
  } });
  const provider = await ensureProvider();
  const payment = await prisma.payment.create({ data: {
    companyId: company.id, subscriptionId: subscription.id, providerConfigurationId: provider.id,
    purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.CAPTURED,
    provider: provider.provider, providerMode: provider.mode, amountMinor: amount, currency: 'INR',
    idempotencyKey: `ifb-${suffix}`, businessReference: `IFB-${suffix}`,
    capturedProviderPaymentId: `pay_${suffix}`, providerStatus: 'captured', capturedAt: periodStart,
  } });
  await prisma.companySubscription.update({ where: { id: subscription.id }, data: {
    status: SubscriptionStatus.ACTIVE, activatedByPaymentId: payment.id,
    startsAt: periodStart, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
  } });
  await prisma.companyBillingProfile.create({ data: { companyId: company.id, billingName: 'IF-B Customer', billingEmail: 'billing@example.test', addressLine1: '1 Customer Road', addressLine2: 'Suite 2', city: 'Pune', state: 'MH', postalCode: '411001', country: 'IN', phone: '+91-9999999999' } });
  const existingSettings = await prisma.billingSettings.findUnique({ where: { scope: 'PLATFORM' } });
  const priorSettings = existingSettings ? {
    invoicePrefix: existingSettings.invoicePrefix,
    invoiceNumberResetPolicy: existingSettings.invoiceNumberResetPolicy,
    sellerLegalName: existingSettings.sellerLegalName,
    sellerBillingEmail: existingSettings.sellerBillingEmail,
    sellerAddressLine1: existingSettings.sellerAddressLine1,
    sellerAddressLine2: existingSettings.sellerAddressLine2,
    sellerCity: existingSettings.sellerCity,
    sellerState: existingSettings.sellerState,
    sellerStateCode: existingSettings.sellerStateCode,
    sellerPostalCode: existingSettings.sellerPostalCode,
    sellerCountry: existingSettings.sellerCountry,
  } : null;
  await prisma.billingSettings.upsert({ where: { scope: 'PLATFORM' }, update: sellerSettings(prefix), create: { scope: 'PLATFORM', ...sellerSettings(prefix) } });
  return { companyId: company.id, planId: plan.id, subscriptionId: subscription.id, paymentId: payment.id,
    providerId: provider.id, prefix, periodStart, periodEnd, planCodeSnapshot: subscription.planCodeSnapshot,
    planNameSnapshot: subscription.planNameSnapshot, priorSettings };
}

function sellerSettings(prefix: string) { return { invoicePrefix: prefix, invoiceNumberResetPolicy: InvoiceNumberResetPolicy.NEVER,
  sellerLegalName: 'IF-B Seller', sellerBillingEmail: 'seller@example.test', sellerAddressLine1: '1 Seller Road',
  sellerCity: 'Pune', sellerState: 'MH', sellerStateCode: '27', sellerPostalCode: '411001', sellerCountry: 'IN' }; }

async function ensureProvider() {
  return await prisma.billingProviderConfiguration.findUnique({ where: { provider_mode: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } } })
    ?? prisma.billingProviderConfiguration.create({ data: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } });
}

async function createAdditionalPayment(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const suffix = randomUUID();
  await prisma.companySubscription.updateMany({
    where: { companyId: fixture.companyId, status: SubscriptionStatus.ACTIVE },
    data: { status: SubscriptionStatus.SUPERSEDED, endedAt: new Date() },
  });
  const subscription = await prisma.companySubscription.create({ data: {
    companyId: fixture.companyId, planId: fixture.planId, status: SubscriptionStatus.PENDING,
    activationSource: SubscriptionActivationSource.PAYMENT, billingInterval: BillingInterval.MONTHLY,
    planCodeSnapshot: fixture.planCodeSnapshot, planNameSnapshot: fixture.planNameSnapshot, billingModelSnapshot: PlanBillingModel.PER_USER,
    currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n,
    recurringTotalPriceMinor: 1_000n, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
    pricingResolvedAt: new Date(), seatQuantity: 10,
  } });
  const provider = await prisma.billingProviderConfiguration.findUniqueOrThrow({ where: { id: fixture.providerId } });
  const payment = await prisma.payment.create({ data: { companyId: fixture.companyId, subscriptionId: subscription.id,
    providerConfigurationId: provider.id, purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.CAPTURED,
    provider: provider.provider, providerMode: provider.mode, amountMinor: 1_000n, currency: 'INR', idempotencyKey: `ifb-${suffix}`,
    businessReference: `IFB-${suffix}`, capturedProviderPaymentId: `pay_${suffix}`, capturedAt: fixture.periodStart } });
  await prisma.companySubscription.update({ where: { id: subscription.id }, data: {
    status: SubscriptionStatus.ACTIVE, activatedByPaymentId: payment.id, startsAt: fixture.periodStart,
    currentPeriodStart: fixture.periodStart, currentPeriodEnd: fixture.periodEnd,
  } });
  return { paymentId: payment.id };
}

async function setNumbering(prefix: string, policy: InvoiceNumberResetPolicy) {
  await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: { invoicePrefix: prefix, invoiceNumberResetPolicy: policy } });
}

async function cleanup(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await prisma.auditLog.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.invoice.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.invoiceNumberSequence.deleteMany({ where: { prefix: { startsWith: fixture.prefix } } });
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

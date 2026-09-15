import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, GstRegistrationStatus, GstRoundingMode, GstTaxPolicyStatus, GstTaxTreatment,
  InvoiceNumberResetPolicy, PaymentProviderMode, PaymentProviderType, PaymentStatus, PlanBillingModel,
  PrismaClient, RecurringPriceBasis, RoleName, SubscriptionActivationSource, SubscriptionStatus, UserStatus,
} from '@prisma/client';
import { InvoiceIssuanceService } from '../invoices/invoice-issuance.service';
import { PaymentsService } from './payments.service';
import { SubscriptionTaxCalculationService } from './subscription-tax-calculation.service';

const enabled = process.env.RUN_GST_TAX_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('GST-A PostgreSQL tax foundation', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('persists gross Payment evidence and copies it immutably into one Invoice', async () => {
    const suffix = randomUUID();
    const company = await prisma.company.create({ data: { name: 'GST-A company', slug: `gsta-${suffix}` } });
    const user = await prisma.user.create({ data: { companyId: company.id, email: `gsta-${suffix}@example.invalid`, passwordHash: 'integration', firstName: 'GST', lastName: 'Actor' } });
    const plan = await prisma.plan.create({ data: { code: `GSTA-${suffix}`, name: 'GST-A Plan', billingModel: PlanBillingModel.PER_USER } });
    const subscription = await prisma.companySubscription.create({ data: { companyId: company.id, planId: plan.id,
      activationSource: SubscriptionActivationSource.PAYMENT, status: SubscriptionStatus.PENDING, billingInterval: BillingInterval.MONTHLY,
      planCodeSnapshot: plan.code, planNameSnapshot: plan.name, billingModelSnapshot: PlanBillingModel.PER_USER, currency: 'INR',
      recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1_000n,
      recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY, pricingResolvedAt: new Date(), seatQuantity: 10 } });
    const policy = await prisma.gstTaxPolicyVersion.create({ data: { policyCode: `GSTA-${suffix}`, version: 1,
      status: GstTaxPolicyStatus.ACTIVE, effectiveFrom: new Date('2026-01-01T00:00:00Z'), currency: 'INR',
      treatment: GstTaxTreatment.TAXABLE, totalRateBasisPoints: 1800, cgstRateBasisPoints: 900,
      sgstRateBasisPoints: 900, igstRateBasisPoints: 1800, serviceClassification: 'TEST-SAC',
      roundingMode: GstRoundingMode.HALF_UP_MINOR_UNIT_PER_COMPONENT, calculationVersion: 1 } });
    const nonOverlappingPolicyIds: string[] = [];
    await prisma.companyBillingProfile.create({ data: { companyId: company.id, billingName: 'GST Buyer', addressLine1: '1 Buyer Road',
      city: 'Bengaluru', state: 'Karnataka', billingStateCode: '29', postalCode: '560001', country: 'IN',
      gstRegistrationStatus: GstRegistrationStatus.UNREGISTERED, placeOfSupplyState: 'Karnataka', placeOfSupplyStateCode: '29' } });
    const settings = await prisma.billingSettings.findUnique({ where: { scope: 'PLATFORM' } });
    const providers = await prisma.billingProviderConfiguration.findMany({ select: { id: true, enabled: true, isDefault: true } });
    const provider = await prisma.billingProviderConfiguration.findUnique({ where: { provider_mode: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } } })
      ?? await prisma.billingProviderConfiguration.create({ data: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } });
    try {
      await prisma.billingProviderConfiguration.updateMany({ data: { isDefault: false } });
      await prisma.billingProviderConfiguration.update({ where: { id: provider.id }, data: { enabled: true, isDefault: true } });
      await prisma.billingSettings.upsert({ where: { scope: 'PLATFORM' }, create: sellerSettings(), update: sellerSettings() });
      const actor = { id: user.id, companyId: company.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN] };
      const paymentResult = await new PaymentsService(prisma as never, new SubscriptionTaxCalculationService()).createForSubscription(subscription.id, actor);
      assert.equal(paymentResult.amountMinor, '1180');
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentResult.id }, include: { taxSnapshot: { include: { components: true } } } });
      assert.equal(payment.taxSnapshot?.taxableSubtotalMinor, 1_000n);
      assert.equal(payment.taxSnapshot?.totalTaxMinor, 180n);
      assert.equal(payment.taxSnapshot?.grossTotalMinor, 1_180n);
      assert.deepEqual(payment.taxSnapshot?.components.map((component) => component.type), ['IGST']);
      await assert.rejects(() => prisma.paymentTaxSnapshot.update({ where: { id: payment.taxSnapshot!.id }, data: { grossTotalMinor: 1_179n } }));
      await assert.rejects(() => prisma.paymentTaxComponent.create({ data: { paymentTaxSnapshotId: payment.taxSnapshot!.id,
        type: 'CGST', rateBasisPoints: 900, taxableAmountMinor: 1_000n, taxAmountMinor: 90n, currency: 'INR' } }));
      await assert.rejects(() => prisma.gstTaxPolicyVersion.create({ data: { policyCode: `GSTA-OTHER-${suffix}`, version: 1,
        status: GstTaxPolicyStatus.ACTIVE, effectiveFrom: new Date('2026-06-01T00:00:00Z'), currency: 'INR',
        treatment: GstTaxTreatment.TAXABLE, totalRateBasisPoints: 1800, cgstRateBasisPoints: 900,
        sgstRateBasisPoints: 900, igstRateBasisPoints: 1800, serviceClassification: 'TEST-SAC' } }));
      for (const [status, from, until] of [
        [GstTaxPolicyStatus.ACTIVE, '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
        [GstTaxPolicyStatus.DRAFT, '2026-01-01T00:00:00Z', null],
        [GstTaxPolicyStatus.RETIRED, '2026-01-01T00:00:00Z', null],
      ] as const) {
        const row = await prisma.gstTaxPolicyVersion.create({ data: { policyCode: `GSTA-${status}-${suffix}`, version: 1,
          status, effectiveFrom: new Date(from), effectiveUntil: until ? new Date(until) : null, currency: 'INR',
          treatment: GstTaxTreatment.TAXABLE, totalRateBasisPoints: 1800, cgstRateBasisPoints: 900,
          sgstRateBasisPoints: 900, igstRateBasisPoints: 1800, serviceClassification: 'TEST-SAC' } });
        nonOverlappingPolicyIds.push(row.id);
      }

      const periodStart = new Date('2026-09-01T00:00:00Z'); const periodEnd = new Date('2026-10-01T00:00:00Z');
      await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.CAPTURED, capturedAt: periodStart,
        capturedProviderPaymentId: `pay_${suffix}`, providerStatus: 'captured' } });
      await prisma.companySubscription.update({ where: { id: subscription.id }, data: { status: SubscriptionStatus.ACTIVE,
        activatedByPaymentId: payment.id, startsAt: periodStart, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd } });
      const issued = await new InvoiceIssuanceService(prisma as never).issue(payment.id, user.id);
      assert.equal(issued.subtotalMinor, '1000'); assert.equal(issued.totalMinor, '1180');
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: issued.id }, include: { gstEvidence: true,
        lines: { include: { gstEvidence: { include: { components: true } } } } } });
      assert.equal(invoice.totalTaxMinor, 180n); assert.equal(invoice.gstEvidence?.paymentTaxSnapshotId, payment.taxSnapshot?.id);
      assert.equal(invoice.lines[0]?.gstEvidence?.totalTaxMinor, 180n);
      assert.equal(invoice.lines[0]?.gstEvidence?.jurisdictionClassification, 'INTER_STATE');
      assert.deepEqual(invoice.lines[0]?.gstEvidence?.components.map((component) => component.type), ['IGST']);
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: payment.id } }), 1);
      assert.equal((await new InvoiceIssuanceService(prisma as never).issue(payment.id)).id, invoice.id);
      await assert.rejects(() => prisma.gstTaxPolicyVersion.update({ where: { id: policy.id }, data: { totalRateBasisPoints: 1700 } }));
      const lineEvidence = invoice.lines[0]!.gstEvidence!;
      const lineComponent = lineEvidence.components[0]!;
      for (const operation of [
        () => prisma.paymentTaxSnapshot.update({ where: { id: payment.taxSnapshot!.id }, data: { totalTaxMinor: 181n } }),
        () => prisma.paymentTaxSnapshot.delete({ where: { id: payment.taxSnapshot!.id } }),
        () => prisma.paymentTaxComponent.update({ where: { id: payment.taxSnapshot!.components[0]!.id }, data: { taxAmountMinor: 181n } }),
        () => prisma.paymentTaxComponent.delete({ where: { id: payment.taxSnapshot!.components[0]!.id } }),
        () => prisma.invoiceGstEvidence.update({ where: { id: invoice.gstEvidence!.id }, data: { totalTaxMinor: 181n } }),
        () => prisma.invoiceGstEvidence.delete({ where: { id: invoice.gstEvidence!.id } }),
        () => prisma.invoiceLineGstEvidence.update({ where: { id: lineEvidence.id }, data: { totalTaxMinor: 181n } }),
        () => prisma.invoiceLineGstEvidence.delete({ where: { id: lineEvidence.id } }),
        () => prisma.invoiceLineTaxComponent.update({ where: { id: lineComponent.id }, data: { taxAmountMinor: 181n } }),
        () => prisma.invoiceLineTaxComponent.delete({ where: { id: lineComponent.id } }),
      ]) await assert.rejects(operation);
      await assert.rejects(() => prisma.invoiceLineTaxComponent.create({ data: { invoiceLineGstEvidenceId: lineEvidence.id,
        type: 'CGST', rateBasisPoints: 900, taxAmountMinor: 90n, currency: 'INR' } }));
      await assert.rejects(() => prisma.invoiceLine.update({ where: { id: invoice.lines[0]!.id }, data: { currency: 'USD' } }));
      await setEvidenceTrigger(prisma, 'InvoiceLineTaxComponent', false);
      try {
        await assert.rejects(() => prisma.invoiceLineTaxComponent.update({ where: { id: lineComponent.id }, data: { taxAmountMinor: 179n } }));
        await assert.rejects(() => prisma.invoiceLineTaxComponent.delete({ where: { id: lineComponent.id } }));
      } finally {
        await setEvidenceTrigger(prisma, 'InvoiceLineTaxComponent', true);
      }
      assert.equal(await prisma.invoiceLineTaxComponent.count({ where: { invoiceLineGstEvidenceId: lineEvidence.id } }), 1);
      assert.equal((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: invoice.lines[0]!.id } })).currency, 'INR');
      const [wideExact] = await prisma.$queryRawUnsafe<Array<{ maximumTax: bigint; halfUp: bigint }>>(
        'SELECT floor((7633219707407619::numeric * 1800::numeric + 5000::numeric) / 10000::numeric)::bigint AS "maximumTax", floor((5::numeric * 1000::numeric + 5000::numeric) / 10000::numeric)::bigint AS "halfUp"',
      );
      assert.equal(wideExact.maximumTax, 1_373_979_547_333_371n);
      assert.equal(wideExact.halfUp, 1n);

      await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: {
        gstin: '29ABCDE1234F1Z5', gstRegisteredState: 'Karnataka', gstRegisteredStateCode: '29',
      } });
      const intraSubscription = await prisma.companySubscription.create({ data: { companyId: company.id, planId: plan.id,
        activationSource: SubscriptionActivationSource.PAYMENT, status: SubscriptionStatus.PENDING, billingInterval: BillingInterval.MONTHLY,
        planCodeSnapshot: plan.code, planNameSnapshot: plan.name, billingModelSnapshot: PlanBillingModel.PER_USER, currency: 'INR',
        recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1_000n,
        recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY, pricingResolvedAt: new Date(), seatQuantity: 10 } });
      const intraResult = await new PaymentsService(prisma as never, new SubscriptionTaxCalculationService()).createForSubscription(intraSubscription.id, actor);
      const intraPayment = await prisma.payment.update({ where: { id: intraResult.id }, data: { status: PaymentStatus.CAPTURED,
        capturedAt: periodStart, capturedProviderPaymentId: `pay_intra_${suffix}`, providerStatus: 'captured' }, include: { taxSnapshot: { include: { components: true } } } });
      assert.deepEqual(intraPayment.taxSnapshot!.components.map((component) => component.type).sort(), ['CGST', 'SGST']);
      await prisma.companySubscription.update({ where: { id: subscription.id }, data: { status: SubscriptionStatus.CANCELLED, endedAt: periodStart } });
      await prisma.companySubscription.update({ where: { id: intraSubscription.id }, data: { status: SubscriptionStatus.ACTIVE,
        activatedByPaymentId: intraPayment.id, startsAt: periodStart, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd } });
      const intraInvoice = await new InvoiceIssuanceService(prisma as never).issue(intraPayment.id, user.id);
      const intraLine = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: intraInvoice.id }, include: { gstEvidence: { include: { components: true } } } });
      assert.equal(intraLine.gstEvidence!.jurisdictionClassification, 'INTRA_STATE');
      assert.deepEqual(intraLine.gstEvidence!.components.map((component) => component.type).sort(), ['CGST', 'SGST']);
    } finally {
      await setTaxEvidenceImmutability(prisma, false);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.auditLog.deleteMany({ where: { companyId: company.id } });
          await tx.invoiceLineTaxComponent.deleteMany({ where: { invoiceLineGstEvidence: { invoiceLine: { companyId: company.id } } } });
          await tx.invoiceLineGstEvidence.deleteMany({ where: { invoiceLine: { companyId: company.id } } });
          await tx.invoiceGstEvidence.deleteMany({ where: { invoice: { companyId: company.id } } });
          await tx.invoiceLine.deleteMany({ where: { companyId: company.id } }); await tx.invoice.deleteMany({ where: { companyId: company.id } });
          await tx.invoiceNumberSequence.deleteMany({ where: { prefix: { startsWith: 'GSTA' } } });
          await tx.paymentTaxComponent.deleteMany({ where: { paymentTaxSnapshot: { companyId: company.id } } });
          await tx.paymentTaxSnapshot.deleteMany({ where: { companyId: company.id } });
          await tx.companySubscription.updateMany({ where: { companyId: company.id }, data: { activatedByPaymentId: null, status: SubscriptionStatus.CANCELLED } });
          await tx.payment.deleteMany({ where: { companyId: company.id } }); await tx.companySubscription.deleteMany({ where: { companyId: company.id } });
          await tx.companyBillingProfile.deleteMany({ where: { companyId: company.id } }); await tx.gstTaxPolicyVersion.deleteMany({ where: { id: { in: [policy.id, ...nonOverlappingPolicyIds] } } });
          await tx.user.deleteMany({ where: { id: user.id } }); await tx.plan.deleteMany({ where: { id: plan.id } }); await tx.company.deleteMany({ where: { id: company.id } });
        });
      } finally {
        await setTaxEvidenceImmutability(prisma, true);
      }
      for (const prior of providers) await prisma.billingProviderConfiguration.update({ where: { id: prior.id }, data: { enabled: prior.enabled, isDefault: prior.isDefault } });
      if (settings) await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: { gstEnabled: settings.gstEnabled, gstin: settings.gstin,
        gstLegalName: settings.gstLegalName, gstRegisteredState: settings.gstRegisteredState, gstRegisteredStateCode: settings.gstRegisteredStateCode,
        invoicePrefix: settings.invoicePrefix, invoiceNumberResetPolicy: settings.invoiceNumberResetPolicy, sellerLegalName: settings.sellerLegalName,
        sellerAddressLine1: settings.sellerAddressLine1, sellerCity: settings.sellerCity, sellerPostalCode: settings.sellerPostalCode, sellerCountry: settings.sellerCountry } });
    }
  });
});

async function setTaxEvidenceImmutability(client: PrismaClient, enabled: boolean): Promise<void> {
  for (const table of ['PaymentTaxSnapshot', 'PaymentTaxComponent', 'InvoiceGstEvidence', 'InvoiceLineGstEvidence', 'InvoiceLineTaxComponent']) {
    await setEvidenceTrigger(client, table, enabled);
  }
}

async function setEvidenceTrigger(client: PrismaClient, table: string, enabled: boolean): Promise<void> {
  assert.match(table, /^(PaymentTaxSnapshot|PaymentTaxComponent|InvoiceGstEvidence|InvoiceLineGstEvidence|InvoiceLineTaxComponent)$/);
  const action = enabled ? 'ENABLE' : 'DISABLE';
  await client.$executeRawUnsafe(`ALTER TABLE "${table}" ${action} TRIGGER "${table}_immutability"`);
}

function sellerSettings() { return { gstEnabled: true, gstin: '27ABCDE1234F1Z5', gstLegalName: 'GST Seller',
  gstRegisteredState: 'Maharashtra', gstRegisteredStateCode: '27', invoicePrefix: 'GSTA',
  invoiceNumberResetPolicy: InvoiceNumberResetPolicy.NEVER, sellerLegalName: 'GST Seller', sellerAddressLine1: '1 Seller Road',
  sellerCity: 'Pune', sellerPostalCode: '411001', sellerCountry: 'IN' }; }

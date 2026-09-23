import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, GstRegistrationStatus, GstRoundingMode, GstTaxPolicyStatus, GstTaxTreatment,
  InvoiceNumberResetPolicy, PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus, PlanBillingModel,
  PrismaClient, RecurringPriceBasis, RoleName, SubscriptionActivationSource, SubscriptionRenewalStatus,
  SubscriptionStatus, UserStatus,
} from '@prisma/client';
import { InvoiceGenerationService } from '../invoices/invoice-generation.service';
import { InvoiceIssuanceService } from '../invoices/invoice-issuance.service';
import { SubscriptionRenewalApplicationService } from '../subscriptions/subscription-renewal-application.service';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
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

  it('copies persisted renewal GST authority for intra-state, inter-state, and GST-off invoices', async () => {
    await cleanupInterruptedRenewalFixtures(prisma);
    const suffix = randomUUID();
    const settings = await prisma.billingSettings.findUnique({ where: { scope: 'PLATFORM' } });
    const providers = await prisma.billingProviderConfiguration.findMany({ select: { id: true, enabled: true, isDefault: true } });
    const provider = await prisma.billingProviderConfiguration.findUnique({ where: { provider_mode: {
      provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST,
    } } }) ?? await prisma.billingProviderConfiguration.create({ data: {
      provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST,
    } });
    const policy = await prisma.gstTaxPolicyVersion.create({ data: {
      policyCode: `GSTA-RENEWAL-${suffix}`, version: 1, status: GstTaxPolicyStatus.ACTIVE,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), currency: 'INR', treatment: GstTaxTreatment.TAXABLE,
      totalRateBasisPoints: 1800, cgstRateBasisPoints: 900, sgstRateBasisPoints: 900, igstRateBasisPoints: 1800,
      serviceClassification: 'RENEWAL-SAC', roundingMode: GstRoundingMode.HALF_UP_MINOR_UNIT_PER_COMPONENT,
      calculationVersion: 1,
    } });
    const companyIds: string[] = [];
    const planIds: string[] = [];
    try {
      await prisma.billingProviderConfiguration.updateMany({ data: { isDefault: false } });
      await prisma.billingProviderConfiguration.update({ where: { id: provider.id }, data: { enabled: true, isDefault: true } });
      await prisma.billingSettings.upsert({ where: { scope: 'PLATFORM' }, create: sellerSettings(), update: sellerSettings() });

      const intra = await createRenewalFixture(prisma, suffix, 'intra', 'Maharashtra', '27');
      companyIds.push(intra.companyId); planIds.push(intra.planId);
      const intraPayment = await prepareRenewalPayment(prisma, intra);
      assert.equal(intraPayment.amountMinor, 14_567n);
      assert.deepEqual(intraPayment.taxSnapshot!.components.map(component => component.type).sort(), ['CGST', 'SGST']);

      await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: {
        gstin: '29ABCDE1234F1Z5', gstRegisteredState: 'Karnataka', gstRegisteredStateCode: '29',
      } });
      await captureAndApplyRenewal(prisma, intraPayment.id, suffix);
      const intraInvoice = await loadRenewalInvoice(prisma, intraPayment.id);
      assertRenewalInvoice(intraInvoice, intra, intraPayment.id, 12_345n, 2_222n, 14_567n, 'INTRA_STATE', {
        CGST: { rate: 900, amount: 1_111n }, SGST: { rate: 900, amount: 1_111n },
      });
      assert.equal(intraInvoice.gstEvidence!.paymentTaxSnapshotId, intraPayment.taxSnapshot!.id);
      assert.equal(intraInvoice.gstEvidence!.placeOfSupplyStateCode, '27');
      assert.equal(intraInvoice.lines[0]!.gstEvidence!.components.some(component => component.type === 'IGST'), false);
      const repeated = await new InvoiceIssuanceService(prisma as never).issue(intraPayment.id);
      assert.equal(repeated.id, intraInvoice.id);
      assert.equal(await prisma.invoice.count({ where: { sourcePaymentId: intraPayment.id } }), 1);
      assert.equal((await loadRenewalInvoice(prisma, intraPayment.id)).totalMinor, 14_567n);

      const inter = await createRenewalFixture(prisma, suffix, 'inter', 'Maharashtra', '27');
      companyIds.push(inter.companyId); planIds.push(inter.planId);
      const interPayment = await prepareRenewalPayment(prisma, inter);
      assert.equal(interPayment.amountMinor, 14_567n);
      assert.deepEqual(interPayment.taxSnapshot!.components.map(component => component.type), ['IGST']);
      await captureAndApplyRenewal(prisma, interPayment.id, suffix);
      const interInvoice = await loadRenewalInvoice(prisma, interPayment.id);
      assertRenewalInvoice(interInvoice, inter, interPayment.id, 12_345n, 2_222n, 14_567n, 'INTER_STATE', {
        IGST: { rate: 1800, amount: 2_222n },
      });
      assert.equal(interInvoice.gstEvidence!.paymentTaxSnapshotId, interPayment.taxSnapshot!.id);
      assert.equal(interInvoice.gstEvidence!.placeOfSupplyStateCode, '27');
      assert.equal(interInvoice.lines[0]!.gstEvidence!.components.some(component => component.type === 'CGST' || component.type === 'SGST'), false);

      await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: { gstEnabled: false } });
      const off = await createRenewalFixture(prisma, suffix, 'off', 'Maharashtra', '27');
      companyIds.push(off.companyId); planIds.push(off.planId);
      const offPayment = await prepareRenewalPayment(prisma, off);
      assert.equal(offPayment.amountMinor, 12_345n);
      assert.equal(offPayment.taxSnapshot, null);
      await captureAndApplyRenewal(prisma, offPayment.id, suffix);
      const offInvoice = await loadRenewalInvoice(prisma, offPayment.id);
      assert.equal(offInvoice.sourcePaymentId, offPayment.id);
      assert.equal(offInvoice.sourceSubscriptionId, off.subscriptionId);
      assert.equal(offInvoice.subtotalMinor, 12_345n);
      assert.equal(offInvoice.totalTaxMinor, null);
      assert.equal(offInvoice.totalMinor, 12_345n);
      assert.equal(offInvoice.gstEvidence, null);
      assert.equal(offInvoice.lines[0]!.gstEvidence, null);
    } finally {
      await setTaxEvidenceImmutability(prisma, false);
      await setRenewalImmutability(prisma, false);
      try {
        await prisma.$transaction(async tx => {
          await tx.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
          await tx.invoiceLineTaxComponent.deleteMany({ where: { invoiceLineGstEvidence: { invoiceLine: { companyId: { in: companyIds } } } } });
          await tx.invoiceLineGstEvidence.deleteMany({ where: { invoiceLine: { companyId: { in: companyIds } } } });
          await tx.invoiceGstEvidence.deleteMany({ where: { invoice: { companyId: { in: companyIds } } } });
          await tx.invoiceLine.deleteMany({ where: { companyId: { in: companyIds } } });
          await tx.invoice.deleteMany({ where: { companyId: { in: companyIds } } });
          await tx.invoiceNumberSequence.deleteMany({ where: { prefix: { startsWith: 'GSTA' } } });
          await tx.paymentTaxComponent.deleteMany({ where: { paymentTaxSnapshot: { companyId: { in: companyIds } } } });
          await tx.paymentTaxSnapshot.deleteMany({ where: { companyId: { in: companyIds } } });
          await tx.subscriptionRenewal.deleteMany({ where: { companyId: { in: companyIds } } });
          await tx.companySubscription.updateMany({ where: { companyId: { in: companyIds } }, data: { activatedByPaymentId: null, status: SubscriptionStatus.CANCELLED } });
          await tx.payment.deleteMany({ where: { companyId: { in: companyIds } } });
          await tx.companySubscription.deleteMany({ where: { companyId: { in: companyIds } } });
          await tx.companyBillingProfile.deleteMany({ where: { companyId: { in: companyIds } } });
          await tx.plan.deleteMany({ where: { id: { in: planIds } } });
          await tx.company.deleteMany({ where: { id: { in: companyIds } } });
          await tx.gstTaxPolicyVersion.delete({ where: { id: policy.id } });
        });
      } finally {
        await setRenewalImmutability(prisma, true);
        await setTaxEvidenceImmutability(prisma, true);
      }
      for (const prior of providers) await prisma.billingProviderConfiguration.update({ where: { id: prior.id }, data: { enabled: prior.enabled, isDefault: prior.isDefault } });
      if (settings) await prisma.billingSettings.update({ where: { scope: 'PLATFORM' }, data: {
        gstEnabled: settings.gstEnabled, gstin: settings.gstin, gstLegalName: settings.gstLegalName,
        gstRegisteredState: settings.gstRegisteredState, gstRegisteredStateCode: settings.gstRegisteredStateCode,
        invoicePrefix: settings.invoicePrefix, invoiceNumberResetPolicy: settings.invoiceNumberResetPolicy,
        sellerLegalName: settings.sellerLegalName, sellerAddressLine1: settings.sellerAddressLine1,
        sellerCity: settings.sellerCity, sellerPostalCode: settings.sellerPostalCode, sellerCountry: settings.sellerCountry,
      } });
    }
  });
});

type RenewalFixture = { companyId: string; planId: string; subscriptionId: string; cycleStart: Date; cycleEnd: Date };

async function createRenewalFixture(client: PrismaClient, suffix: string, label: string, state: string, stateCode: string): Promise<RenewalFixture> {
  const company = await client.company.create({ data: { name: `GST Renewal ${label}`, slug: `gst-renewal-${label}-${suffix}` } });
  const plan = await client.plan.create({ data: { code: `GSTR-${label}-${suffix}`, name: `GST Renewal ${label}`, billingModel: PlanBillingModel.PER_USER } });
  const cycleStart = new Date('2030-02-01T00:00:00Z');
  const cycleEnd = new Date('2030-03-01T00:00:00Z');
  const subscription = await client.companySubscription.create({ data: {
    companyId: company.id, planId: plan.id, activationSource: SubscriptionActivationSource.PAYMENT,
    status: SubscriptionStatus.PENDING, billingInterval: BillingInterval.MONTHLY, planCodeSnapshot: plan.code,
    planNameSnapshot: plan.name, billingModelSnapshot: PlanBillingModel.PER_USER, currency: 'INR',
    recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 2_469n,
    recurringTotalPriceMinor: 12_345n, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
    pricingResolvedAt: new Date(), seatQuantity: 5,
  } });
  const provider = await client.billingProviderConfiguration.findFirstOrThrow({ where: { enabled: true, isDefault: true } });
  const activation = await client.payment.create({ data: {
    companyId: company.id, subscriptionId: subscription.id, providerConfigurationId: provider.id,
    purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.CAPTURED,
    provider: provider.provider, providerMode: provider.mode, amountMinor: 12_345n, currency: 'INR',
    idempotencyKey: `activation:${label}:${suffix}`, businessReference: `activation:${label}:${suffix}`,
    capturedAt: new Date('2030-01-01T00:00:00Z'), capturedProviderPaymentId: `pay_activation_${label}_${suffix}`,
  } });
  await client.companySubscription.update({ where: { id: subscription.id }, data: {
    status: SubscriptionStatus.ACTIVE, activatedByPaymentId: activation.id, startsAt: new Date('2030-01-01T00:00:00Z'),
    currentPeriodStart: new Date('2030-01-01T00:00:00Z'), currentPeriodEnd: cycleStart,
  } });
  await client.companyBillingProfile.create({ data: {
    companyId: company.id, billingName: `GST Renewal ${label}`, addressLine1: '1 Renewal Road', city: state,
    state, billingStateCode: stateCode, postalCode: '411001', country: 'IN',
    gstRegistrationStatus: GstRegistrationStatus.UNREGISTERED, placeOfSupplyState: state, placeOfSupplyStateCode: stateCode,
  } });
  return { companyId: company.id, planId: plan.id, subscriptionId: subscription.id, cycleStart, cycleEnd };
}

async function prepareRenewalPayment(client: PrismaClient, fixture: RenewalFixture) {
  return client.$transaction(async tx => {
    const payment = await new PaymentsService(client as never, new SubscriptionTaxCalculationService()).createForRenewal(tx, {
      companyId: fixture.companyId, subscriptionId: fixture.subscriptionId, cycleStart: fixture.cycleStart,
      recurringTotalPriceMinor: 12_345n, recurringCurrency: 'INR',
    }, null);
    await tx.subscriptionRenewal.create({ data: {
      companyId: fixture.companyId, subscriptionId: fixture.subscriptionId, paymentId: payment.id,
      cycleStart: fixture.cycleStart, cycleEnd: fixture.cycleEnd, billingInterval: BillingInterval.MONTHLY,
      recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 2_469n,
      recurringTotalPriceMinor: 12_345n, currency: 'INR', seatQuantity: 5, status: SubscriptionRenewalStatus.PREPARED,
    } });
    return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { taxSnapshot: { include: { components: true } } } });
  });
}

async function captureAndApplyRenewal(client: PrismaClient, paymentId: string, suffix: string): Promise<void> {
  await client.payment.update({ where: { id: paymentId }, data: {
    status: PaymentStatus.CAPTURED, capturedAt: new Date('2030-02-01T00:00:00Z'),
    capturedProviderPaymentId: `pay_renewal_${suffix}_${paymentId}`, providerStatus: 'captured',
  } });
  const issuance = new InvoiceIssuanceService(client as never);
  const result = await new SubscriptionRenewalApplicationService(
    client as never, new SeatUsageService(client as never), new InvoiceGenerationService(issuance),
  ).apply(paymentId);
  assert.equal(result.outcome, 'APPLIED');
}

async function loadRenewalInvoice(client: PrismaClient, paymentId: string) {
  return client.invoice.findFirstOrThrow({ where: { sourcePaymentId: paymentId }, include: {
    gstEvidence: true, lines: { include: { gstEvidence: { include: { components: true } } } },
  } });
}

function assertRenewalInvoice(
  invoice: Awaited<ReturnType<typeof loadRenewalInvoice>>, fixture: RenewalFixture, paymentId: string,
  subtotal: bigint, tax: bigint, total: bigint, classification: string,
  components: Record<string, { rate: number; amount: bigint }>,
): void {
  assert.equal(invoice.sourcePaymentId, paymentId);
  assert.equal(invoice.sourceSubscriptionId, fixture.subscriptionId);
  assert.equal(invoice.sourcePaymentPurpose, PaymentPurpose.SUBSCRIPTION_RENEWAL);
  assert.equal(invoice.servicePeriodStart.getTime(), fixture.cycleStart.getTime());
  assert.equal(invoice.servicePeriodEnd.getTime(), fixture.cycleEnd.getTime());
  assert.equal(invoice.currency, 'INR');
  assert.equal(invoice.subtotalMinor, subtotal);
  assert.equal(invoice.totalTaxMinor, tax);
  assert.equal(invoice.totalMinor, total);
  assert.equal(invoice.totalMinor, invoice.subtotalMinor + invoice.totalTaxMinor!);
  assert.equal(invoice.gstEvidence!.taxableSubtotalMinor, subtotal);
  assert.equal(invoice.gstEvidence!.totalTaxMinor, tax);
  assert.equal(invoice.gstEvidence!.grossTotalMinor, total);
  assert.equal(invoice.gstEvidence!.jurisdictionClassification, classification);
  assert.equal(invoice.lines[0]!.lineSubtotalMinor, subtotal);
  assert.equal(invoice.lines[0]!.gstEvidence!.taxableAmountMinor, subtotal);
  assert.equal(invoice.lines[0]!.gstEvidence!.totalTaxMinor, tax);
  assert.equal(invoice.lines[0]!.gstEvidence!.grossAmountMinor, total);
  const actual = Object.fromEntries(invoice.lines[0]!.gstEvidence!.components.map(component => [component.type, {
    rate: component.rateBasisPoints, amount: component.taxAmountMinor,
  }]));
  assert.deepEqual(actual, components);
}

async function setTaxEvidenceImmutability(client: PrismaClient, enabled: boolean): Promise<void> {
  for (const table of ['PaymentTaxSnapshot', 'PaymentTaxComponent', 'InvoiceGstEvidence', 'InvoiceLineGstEvidence', 'InvoiceLineTaxComponent']) {
    await setEvidenceTrigger(client, table, enabled);
  }
}

async function setRenewalImmutability(client: PrismaClient, enabled: boolean): Promise<void> {
  const action = enabled ? 'ENABLE' : 'DISABLE';
  await client.$executeRawUnsafe(`ALTER TABLE "SubscriptionRenewal" ${action} TRIGGER "SubscriptionRenewal_immutability"`);
}

async function cleanupInterruptedRenewalFixtures(client: PrismaClient): Promise<void> {
  const companies = await client.company.findMany({ where: { slug: { startsWith: 'gst-renewal-' } }, select: { id: true } });
  const companyIds = companies.map(company => company.id);
  if (!companyIds.length && !await client.gstTaxPolicyVersion.count({ where: { policyCode: { startsWith: 'GSTA-RENEWAL-' } } })) return;
  await setTaxEvidenceImmutability(client, false);
  await setRenewalImmutability(client, false);
  try {
    await client.$transaction(async tx => {
      await tx.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
      await tx.invoiceLineTaxComponent.deleteMany({ where: { invoiceLineGstEvidence: { invoiceLine: { companyId: { in: companyIds } } } } });
      await tx.invoiceLineGstEvidence.deleteMany({ where: { invoiceLine: { companyId: { in: companyIds } } } });
      await tx.invoiceGstEvidence.deleteMany({ where: { invoice: { companyId: { in: companyIds } } } });
      await tx.invoiceLine.deleteMany({ where: { companyId: { in: companyIds } } });
      await tx.invoice.deleteMany({ where: { companyId: { in: companyIds } } });
      await tx.invoiceNumberSequence.deleteMany({ where: { prefix: { startsWith: 'GSTA' } } });
      await tx.paymentTaxComponent.deleteMany({ where: { paymentTaxSnapshot: { companyId: { in: companyIds } } } });
      await tx.paymentTaxSnapshot.deleteMany({ where: { companyId: { in: companyIds } } });
      await tx.subscriptionRenewal.deleteMany({ where: { companyId: { in: companyIds } } });
      await tx.companySubscription.updateMany({ where: { companyId: { in: companyIds } }, data: { activatedByPaymentId: null, status: SubscriptionStatus.CANCELLED } });
      await tx.payment.deleteMany({ where: { companyId: { in: companyIds } } });
      await tx.companySubscription.deleteMany({ where: { companyId: { in: companyIds } } });
      await tx.companyBillingProfile.deleteMany({ where: { companyId: { in: companyIds } } });
      await tx.plan.deleteMany({ where: { code: { startsWith: 'GSTR-' } } });
      await tx.company.deleteMany({ where: { id: { in: companyIds } } });
      await tx.gstTaxPolicyVersion.deleteMany({ where: { policyCode: { startsWith: 'GSTA-RENEWAL-' } } });
    });
  } finally {
    await setRenewalImmutability(client, true);
    await setTaxEvidenceImmutability(client, true);
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

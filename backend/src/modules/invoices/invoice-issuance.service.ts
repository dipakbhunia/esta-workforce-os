import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  BillingInterval,
  InvoiceNumberResetPolicy,
  PaymentPurpose,
  PaymentStatus,
  PlanBillingModel,
  Prisma,
  RecurringPriceBasis,
  SubscriptionActivationSource,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export const INVOICE_ISSUED = 'INVOICE_ISSUED';
export const INVOICE_ISSUANCE_CLOCK = Symbol('INVOICE_ISSUANCE_CLOCK');
export const INVOICE_ISSUANCE_TEST_HOOK = Symbol('INVOICE_ISSUANCE_TEST_HOOK');
const PLATFORM_SCOPE = 'PLATFORM';
const PREFIX_PATTERN = /^[A-Z0-9][A-Z0-9_/-]{0,19}$/;

export type InvoiceIssuanceClock = { now(): Date };
export type InvoiceIssuanceTestHook = { afterSequenceAllocated(): void | Promise<void> };

export class InvoiceIssuanceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'InvoiceIssuanceError';
  }
}

export type IssuedInvoiceResult = {
  id: string;
  companyId: string;
  sourcePaymentId: string;
  sourceSubscriptionId: string;
  invoiceNumber: string;
  issuedAt: string;
  dueAt: null;
  currency: string;
  subtotalMinor: string;
  totalMinor: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  line: {
    planId: string;
    planCodeSnapshot: string;
    planNameSnapshot: string;
    quantity: number;
    unitAmountMinor: string;
    subtotalMinor: string;
    currency: string;
  };
};

export type InvoiceNumberScope = { bucket: string; label: string };

export function invoiceNumberScope(policy: InvoiceNumberResetPolicy, instant: Date): InvoiceNumberScope {
  if (!Number.isFinite(instant.getTime())) throw new InvoiceIssuanceError('INVALID_ISSUED_AT', 'Invoice issuance time is invalid');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const year = parts.year;
  const month = parts.month;
  if (policy === InvoiceNumberResetPolicy.NEVER) return { bucket: 'NEVER', label: '' };
  if (policy === InvoiceNumberResetPolicy.CALENDAR_YEAR) return { bucket: String(year), label: `${year}/` };
  if (policy === InvoiceNumberResetPolicy.FINANCIAL_YEAR) {
    const start = month >= 4 ? year : year - 1;
    const end = (start + 1) % 100;
    const fy = `FY${start}-${String(end).padStart(2, '0')}`;
    return { bucket: fy, label: `${fy}/` };
  }
  throw new InvoiceIssuanceError('INVALID_RESET_POLICY', 'Invoice number reset policy is invalid');
}

@Injectable()
export class InvoiceIssuanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(INVOICE_ISSUANCE_CLOCK) private readonly clock?: InvoiceIssuanceClock,
    @Optional() @Inject(INVOICE_ISSUANCE_TEST_HOOK) private readonly testHook?: InvoiceIssuanceTestHook,
  ) {}

  async issue(sourcePaymentId: string, actorUserId?: string): Promise<IssuedInvoiceResult> {
    const existing = await this.findExisting(sourcePaymentId);
    if (existing) return this.map(existing);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Payment" WHERE "id" = ${sourcePaymentId}::uuid FOR UPDATE`);
        if (!locked.length) throw new InvoiceIssuanceError('PAYMENT_NOT_FOUND', 'Source Payment was not found');

        const duplicate = await this.findExisting(sourcePaymentId, tx);
        if (duplicate) return this.map(duplicate);

        const payment = await tx.payment.findUnique({
          where: { id: sourcePaymentId },
          include: { subscription: true, taxSnapshot: { include: { components: true, policyVersion: true } } },
        });
        if (!payment) throw new InvoiceIssuanceError('PAYMENT_NOT_FOUND', 'Source Payment was not found');
        this.validatePayment(payment);
        const subscription = payment.subscription;
        const renewal = payment.purpose === PaymentPurpose.SUBSCRIPTION_RENEWAL
          ? await tx.subscriptionRenewal.findUnique({ where: { paymentId: payment.id } }) : null;
        const authority = this.validateSubscription(payment, subscription, renewal);
        const tax = payment.taxSnapshot;
        if (tax) this.validateTaxEvidence(payment, authority, tax);
        else if (payment.amountMinor !== authority.recurringTotalPriceMinor) {
          throw new InvoiceIssuanceError('COMMERCIAL_MISMATCH', 'Legacy Payment does not match the subscription commercial snapshot');
        }

        const [settings, profile] = await Promise.all([
          tx.billingSettings.findUnique({ where: { scope: PLATFORM_SCOPE } }),
          tx.companyBillingProfile.findUnique({ where: { companyId: payment.companyId } }),
        ]);
        if (!settings) throw new InvoiceIssuanceError('BILLING_SETTINGS_MISSING', 'Platform Billing Settings invoice authority is missing');
        this.validateSeller(settings);
        if (!profile) throw new InvoiceIssuanceError('BILLING_PROFILE_INCOMPLETE', 'Company Billing Profile is incomplete');
        this.requireText(profile.billingName, profile.addressLine1, profile.city, profile.postalCode, profile.country);

        const prefix = settings.invoicePrefix.trim();
        if (!PREFIX_PATTERN.test(prefix)) throw new InvoiceIssuanceError('INVALID_INVOICE_PREFIX', 'Invoice prefix is invalid');
        const issuedAt = this.clock?.now() ?? new Date();
        const scope = invoiceNumberScope(settings.invoiceNumberResetPolicy, issuedAt);
        const [sequence] = await tx.$queryRaw<Array<{ id: string; lastAllocatedSequence: bigint }>>(Prisma.sql`
          INSERT INTO "InvoiceNumberSequence" (
            "id", "scope", "prefix", "resetPolicy", "resetBucket", "lastAllocatedSequence", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), ${PLATFORM_SCOPE}, ${prefix}, ${settings.invoiceNumberResetPolicy}::"InvoiceNumberResetPolicy", ${scope.bucket}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT ("scope", "prefix", "resetPolicy", "resetBucket") DO UPDATE
          SET "lastAllocatedSequence" = "InvoiceNumberSequence"."lastAllocatedSequence" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          RETURNING "id", "lastAllocatedSequence"`);
        if (!sequence) throw new InvoiceIssuanceError('SEQUENCE_ALLOCATION_FAILED', 'Invoice number allocation failed');
        await this.testHook?.afterSequenceAllocated();

        const padded = sequence.lastAllocatedSequence.toString().padStart(6, '0');
        const invoiceNumber = `${prefix}/${scope.label}${padded}`;
        const quantity = authority.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT
          ? authority.seatQuantity : 1;
        const unitAmount = authority.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT
          ? authority.recurringUnitPriceMinor! : authority.recurringTotalPriceMinor;

        const createdInvoice = await tx.invoice.create({
          data: {
            companyId: payment.companyId,
            sourcePaymentId: payment.id,
            sourceSubscriptionId: subscription.id,
            sourcePaymentPurpose: payment.purpose,
            sourceCapturedAt: payment.capturedAt!,
            capturedPaymentReference: payment.capturedProviderPaymentId!,
            numberSequenceId: sequence.id,
            numberPrefix: prefix,
            numberResetPolicy: settings.invoiceNumberResetPolicy,
            numberResetBucket: scope.bucket,
            numberSequence: sequence.lastAllocatedSequence,
            invoiceNumber,
            issuedAt,
            dueAt: null,
            servicePeriodStart: authority.servicePeriodStart,
            servicePeriodEnd: authority.servicePeriodEnd,
            sellerLegalName: settings.sellerLegalName!.trim(),
            sellerBillingEmail: this.optionalText(settings.sellerBillingEmail),
            sellerAddressLine1: settings.sellerAddressLine1!.trim(),
            sellerAddressLine2: this.optionalText(settings.sellerAddressLine2),
            sellerCity: settings.sellerCity!.trim(),
            sellerState: this.optionalText(settings.sellerState),
            sellerStateCode: this.optionalText(settings.sellerStateCode),
            sellerPostalCode: settings.sellerPostalCode!.trim(),
            sellerCountry: settings.sellerCountry!.trim(),
            billToName: profile.billingName.trim(),
            billToBillingEmail: this.optionalText(profile.billingEmail),
            billToAddressLine1: profile.addressLine1.trim(),
            billToAddressLine2: this.optionalText(profile.addressLine2),
            billToCity: profile.city.trim(),
            billToState: this.optionalText(profile.state),
            billToPostalCode: profile.postalCode.trim(),
            billToCountry: profile.country.trim(),
            billToPhone: this.optionalText(profile.phone),
            currency: payment.currency,
            subtotalMinor: tax?.taxableSubtotalMinor ?? payment.amountMinor,
            totalTaxMinor: tax?.totalTaxMinor ?? null,
            totalMinor: payment.amountMinor,
          },
        });
        const line = await tx.invoiceLine.create({ data: {
          invoiceId: createdInvoice.id,
          companyId: payment.companyId,
          sourceSubscriptionId: subscription.id,
          sourcePlanId: subscription.planId,
          planCodeSnapshot: subscription.planCodeSnapshot,
          planNameSnapshot: subscription.planNameSnapshot,
          lineSequence: 1,
          description: `${subscription.planNameSnapshot} subscription`,
          quantity,
          unitAmountMinor: unitAmount,
          lineSubtotalMinor: tax?.taxableSubtotalMinor ?? payment.amountMinor,
          currency: payment.currency,
        } });
        if (tax) {
          const invoiceEvidence = await tx.invoiceGstEvidence.create({ data: {
            invoiceId: createdInvoice.id, sourcePaymentId: payment.id, paymentTaxSnapshotId: tax.id,
            treatment: tax.treatment, policyCode: tax.policyVersion.policyCode, policyVersion: tax.policyVersion.version,
            calculationVersion: tax.calculationVersion, decisionAt: tax.decisionAt, currency: tax.currency,
            taxableSubtotalMinor: tax.taxableSubtotalMinor, totalTaxMinor: tax.totalTaxMinor, grossTotalMinor: tax.grossTotalMinor,
            jurisdictionClassification: tax.jurisdictionClassification, serviceClassification: tax.serviceClassification,
            roundingMode: tax.roundingMode, sellerGstin: tax.sellerGstin, sellerLegalName: tax.sellerLegalName,
            sellerRegisteredState: tax.sellerRegisteredState, sellerRegisteredStateCode: tax.sellerRegisteredStateCode,
            buyerRegistrationStatus: tax.buyerRegistrationStatus, buyerGstin: tax.buyerGstin,
            buyerBillingState: tax.buyerBillingState, buyerBillingStateCode: tax.buyerBillingStateCode,
            placeOfSupplyState: tax.placeOfSupplyState, placeOfSupplyStateCode: tax.placeOfSupplyStateCode,
          } });
          await tx.invoiceLineGstEvidence.create({ data: {
            invoiceLineId: line.id, treatment: tax.treatment, jurisdictionClassification: tax.jurisdictionClassification, currency: tax.currency,
            taxableAmountMinor: tax.taxableSubtotalMinor, totalTaxMinor: tax.totalTaxMinor,
            grossAmountMinor: tax.grossTotalMinor, serviceClassification: tax.serviceClassification,
            components: { create: tax.components.map((component) => ({ type: component.type, rateBasisPoints: component.rateBasisPoints,
              taxAmountMinor: component.taxAmountMinor, currency: component.currency })) },
          } });
          if (!invoiceEvidence) throw new InvoiceIssuanceError('INVOICE_TAX_EVIDENCE_INVALID', 'Invoice GST evidence could not be persisted');
        }
        await tx.auditLog.create({ data: {
          companyId: payment.companyId,
          actorUserId,
          action: INVOICE_ISSUED,
          entityType: 'Invoice',
          entityId: createdInvoice.id,
          metadata: { sourcePaymentId: payment.id, sourceSubscriptionId: subscription.id, invoiceNumber },
        } });
        return this.map({ ...createdInvoice, lines: [line] });
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const winner = await this.findExisting(sourcePaymentId);
        if (winner) return this.map(winner);
      }
      throw error;
    }
  }

  private async findExisting(sourcePaymentId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.invoice.findFirst({
      where: { sourcePaymentId },
      include: { lines: { orderBy: { lineSequence: 'asc' } } },
    });
  }

  private validatePayment(payment: {
    purpose: PaymentPurpose; status: PaymentStatus; capturedAt: Date | null; capturedProviderPaymentId: string | null;
    amountMinor: bigint; currency: string;
  }) {
    if (payment.purpose !== PaymentPurpose.SUBSCRIPTION_ACTIVATION && payment.purpose !== PaymentPurpose.SUBSCRIPTION_RENEWAL) {
      throw new InvoiceIssuanceError('WRONG_PAYMENT_PURPOSE', 'Payment purpose is not eligible for subscription invoicing');
    }
    if (payment.status !== PaymentStatus.CAPTURED) throw new InvoiceIssuanceError('PAYMENT_NOT_CAPTURED', 'Payment is not captured');
    if (!payment.capturedAt || !payment.capturedProviderPaymentId?.trim()) throw new InvoiceIssuanceError('CAPTURE_EVIDENCE_MISSING', 'Payment capture evidence is incomplete');
    if (payment.amountMinor <= 0n || !/^[A-Z]{3}$/.test(payment.currency)) throw new InvoiceIssuanceError('INVALID_PAYMENT_AMOUNT', 'Payment commercial evidence is invalid');
  }

  private validateSubscription(payment: { id: string; companyId: string; subscriptionId: string; purpose: PaymentPurpose; amountMinor: bigint; currency: string }, subscription: {
    id: string; companyId: string; planId: string; activationSource: SubscriptionActivationSource; activatedByPaymentId: string | null;
    billingModelSnapshot: PlanBillingModel; billingInterval: BillingInterval; pricingInterval: BillingInterval | null; pricingResolvedAt: Date | null;
    planCodeSnapshot: string; planNameSnapshot: string; recurringPriceBasis: RecurringPriceBasis | null;
    recurringUnitPriceMinor: bigint | null; recurringTotalPriceMinor: bigint | null; recurringCurrency: string | null;
    currency: string; seatQuantity: number; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  }, renewal: {
    id: string; companyId: string; subscriptionId: string; paymentId: string; status: string;
    cycleStart: Date; cycleEnd: Date; billingInterval: BillingInterval; recurringPriceBasis: RecurringPriceBasis;
    recurringUnitPriceMinor: bigint | null; recurringTotalPriceMinor: bigint; currency: string; seatQuantity: number;
  } | null) {
    if (subscription.id !== payment.subscriptionId || subscription.companyId !== payment.companyId) throw new InvoiceIssuanceError('OWNERSHIP_MISMATCH', 'Payment and subscription ownership do not match');
    if (subscription.activationSource !== SubscriptionActivationSource.PAYMENT) throw new InvoiceIssuanceError('ACTIVATION_LINK_MISMATCH', 'Subscription does not use payment billing');
    if (payment.purpose === PaymentPurpose.SUBSCRIPTION_RENEWAL) {
      if (!renewal || renewal.paymentId !== payment.id || renewal.subscriptionId !== subscription.id || renewal.companyId !== subscription.companyId ||
          renewal.status !== 'APPLIED') {
        throw new InvoiceIssuanceError('RENEWAL_LINK_MISMATCH', 'Applied renewal evidence does not match the source Payment and subscription period');
      }
      this.validateCommercialAuthority(payment, subscription, renewal);
      return { recurringPriceBasis: renewal.recurringPriceBasis, recurringUnitPriceMinor: renewal.recurringUnitPriceMinor,
        recurringTotalPriceMinor: renewal.recurringTotalPriceMinor, recurringCurrency: renewal.currency,
        seatQuantity: renewal.seatQuantity, servicePeriodStart: renewal.cycleStart, servicePeriodEnd: renewal.cycleEnd };
    }
    if (subscription.activatedByPaymentId !== payment.id) throw new InvoiceIssuanceError('ACTIVATION_LINK_MISMATCH', 'Subscription is not activated by the source Payment');
    if (!subscription.pricingResolvedAt || !subscription.pricingInterval || subscription.billingInterval !== subscription.pricingInterval ||
      !subscription.recurringPriceBasis || subscription.recurringTotalPriceMinor === null || !subscription.recurringCurrency ||
      subscription.recurringTotalPriceMinor <= 0n || subscription.seatQuantity < 1 ||
      !subscription.planCodeSnapshot.trim() || !subscription.planNameSnapshot.trim()) {
      throw new InvoiceIssuanceError('COMMERCIAL_SNAPSHOT_INVALID', 'Subscription commercial snapshot is incomplete');
    }
    if (payment.currency !== subscription.recurringCurrency || subscription.currency !== subscription.recurringCurrency) {
      throw new InvoiceIssuanceError('COMMERCIAL_MISMATCH', 'Payment does not match the subscription commercial snapshot');
    }
    if (subscription.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT) {
      if (subscription.billingModelSnapshot !== PlanBillingModel.PER_USER || subscription.recurringUnitPriceMinor === null || subscription.recurringUnitPriceMinor <= 0n ||
        subscription.recurringUnitPriceMinor * BigInt(subscription.seatQuantity) !== subscription.recurringTotalPriceMinor) {
        throw new InvoiceIssuanceError('COMMERCIAL_SNAPSHOT_INVALID', 'Per-user subscription snapshot arithmetic is invalid');
      }
    } else if (subscription.recurringPriceBasis === RecurringPriceBasis.FIXED_TOTAL) {
      if (subscription.billingModelSnapshot !== PlanBillingModel.CUSTOM || subscription.recurringUnitPriceMinor !== null) {
        throw new InvoiceIssuanceError('COMMERCIAL_SNAPSHOT_INVALID', 'Fixed-total subscription snapshot is invalid');
      }
    }
    if (!subscription.currentPeriodStart || !subscription.currentPeriodEnd || subscription.currentPeriodStart >= subscription.currentPeriodEnd) {
      throw new InvoiceIssuanceError('SERVICE_PERIOD_INVALID', 'Subscription service period is missing or invalid');
    }
    return { recurringPriceBasis: subscription.recurringPriceBasis, recurringUnitPriceMinor: subscription.recurringUnitPriceMinor,
      recurringTotalPriceMinor: subscription.recurringTotalPriceMinor, recurringCurrency: subscription.recurringCurrency,
      seatQuantity: subscription.seatQuantity, servicePeriodStart: subscription.currentPeriodStart, servicePeriodEnd: subscription.currentPeriodEnd };
  }

  private validateCommercialAuthority(payment: { amountMinor: bigint; currency: string }, subscription: {
    planCodeSnapshot: string; planNameSnapshot: string; billingModelSnapshot: PlanBillingModel;
  }, authority: { billingInterval: BillingInterval; recurringPriceBasis: RecurringPriceBasis; recurringUnitPriceMinor: bigint | null;
    recurringTotalPriceMinor: bigint; currency: string; seatQuantity: number; cycleStart: Date; cycleEnd: Date }) {
    if (!subscription.planCodeSnapshot.trim() || !subscription.planNameSnapshot.trim() || authority.cycleStart >= authority.cycleEnd ||
        authority.recurringTotalPriceMinor <= 0n || authority.seatQuantity < 1 || payment.currency !== authority.currency) {
      throw new InvoiceIssuanceError('COMMERCIAL_SNAPSHOT_INVALID', 'Renewal commercial snapshot is invalid');
    }
    if (authority.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT) {
      if (subscription.billingModelSnapshot !== PlanBillingModel.PER_USER || authority.recurringUnitPriceMinor === null || authority.recurringUnitPriceMinor <= 0n ||
          authority.recurringUnitPriceMinor * BigInt(authority.seatQuantity) !== authority.recurringTotalPriceMinor) {
        throw new InvoiceIssuanceError('COMMERCIAL_SNAPSHOT_INVALID', 'Renewal per-user snapshot arithmetic is invalid');
      }
    } else if (authority.recurringPriceBasis !== RecurringPriceBasis.FIXED_TOTAL || subscription.billingModelSnapshot !== PlanBillingModel.CUSTOM || authority.recurringUnitPriceMinor !== null) {
      throw new InvoiceIssuanceError('COMMERCIAL_SNAPSHOT_INVALID', 'Renewal fixed-total snapshot is invalid');
    }
  }

  private validateSeller(settings: { sellerLegalName: string | null; sellerAddressLine1: string | null; sellerCity: string | null; sellerPostalCode: string | null; sellerCountry: string | null }) {
    try { this.requireText(settings.sellerLegalName, settings.sellerAddressLine1, settings.sellerCity, settings.sellerPostalCode, settings.sellerCountry); }
    catch { throw new InvoiceIssuanceError('SELLER_PROFILE_INCOMPLETE', 'Billing Settings seller identity is incomplete'); }
  }

  private validateTaxEvidence(payment: { id: string; companyId: string; subscriptionId: string; amountMinor: bigint; currency: string }, authority: { recurringTotalPriceMinor: bigint; recurringCurrency: string }, tax: {
    companyId: string; sourceSubscriptionId: string; treatment: string; currency: string; taxableSubtotalMinor: bigint; totalTaxMinor: bigint;
    grossTotalMinor: bigint; jurisdictionClassification: string | null; serviceClassification: string | null; sellerGstin: string | null;
    sellerLegalName: string | null; sellerRegisteredState: string | null; sellerRegisteredStateCode: string | null;
    buyerRegistrationStatus: string | null; buyerGstin: string | null; buyerBillingState: string | null; buyerBillingStateCode: string | null;
    placeOfSupplyState: string | null; placeOfSupplyStateCode: string | null; components: Array<{ type: string; rateBasisPoints: number; taxableAmountMinor: bigint; taxAmountMinor: bigint; currency: string }>;
  }): void {
    const componentTotal = tax.components.reduce((sum, component) => sum + component.taxAmountMinor, 0n);
    const componentTypes = tax.components.map((component) => component.type).sort();
    const invalidComponent = tax.components.some((component) => !Number.isInteger(component.rateBasisPoints) || component.rateBasisPoints < 0 ||
      component.rateBasisPoints > 10_000 || component.taxAmountMinor !== (component.taxableAmountMinor * BigInt(component.rateBasisPoints) + 5_000n) / 10_000n);
    if (tax.companyId !== payment.companyId || tax.sourceSubscriptionId !== payment.subscriptionId || tax.currency !== payment.currency ||
      tax.currency !== authority.recurringCurrency || tax.taxableSubtotalMinor !== authority.recurringTotalPriceMinor ||
      tax.totalTaxMinor !== componentTotal || tax.grossTotalMinor !== tax.taxableSubtotalMinor + tax.totalTaxMinor ||
      tax.grossTotalMinor !== payment.amountMinor || invalidComponent || tax.components.some((component) => component.currency !== tax.currency || component.taxableAmountMinor !== tax.taxableSubtotalMinor)) {
      throw new InvoiceIssuanceError('PAYMENT_TAX_EVIDENCE_CONFLICT', 'Payment GST evidence does not reconcile');
    }
    if ((tax.treatment === 'NON_TAXABLE' && (tax.totalTaxMinor !== 0n || tax.components.length !== 0 || tax.jurisdictionClassification !== null)) ||
      (tax.jurisdictionClassification === 'INTRA_STATE' && componentTypes.join(',') !== 'CGST,SGST') ||
      (tax.jurisdictionClassification === 'INTER_STATE' && componentTypes.join(',') !== 'IGST')) {
      throw new InvoiceIssuanceError('PAYMENT_TAX_EVIDENCE_CONFLICT', 'Payment GST component evidence is contradictory');
    }
    if (tax.treatment === 'TAXABLE' && (!tax.jurisdictionClassification || !tax.serviceClassification?.trim() || !tax.sellerGstin?.trim() ||
      !tax.sellerLegalName?.trim() || !tax.sellerRegisteredState?.trim() || !tax.sellerRegisteredStateCode?.trim() ||
      !tax.buyerRegistrationStatus || !tax.buyerBillingState?.trim() || !tax.buyerBillingStateCode?.trim() ||
      !tax.placeOfSupplyState?.trim() || !tax.placeOfSupplyStateCode?.trim() || !tax.components.length)) {
      throw new InvoiceIssuanceError('PAYMENT_TAX_EVIDENCE_INCOMPLETE', 'Payment GST evidence is incomplete');
    }
  }

  private requireText(...values: Array<string | null>): void {
    if (values.some((value) => !value?.trim())) throw new InvoiceIssuanceError('REQUIRED_TEXT_MISSING', 'Required invoice identity text is missing');
  }

  private optionalText(value: string | null): string | null { return value?.trim() || null; }
  private isUniqueViolation(error: unknown): boolean { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }

  private map(invoice: { id: string; companyId: string; sourcePaymentId: string; sourceSubscriptionId: string; invoiceNumber: string; issuedAt: Date; dueAt: Date | null; currency: string; subtotalMinor: bigint; totalMinor: bigint; servicePeriodStart: Date; servicePeriodEnd: Date; lines: Array<{ sourcePlanId: string; planCodeSnapshot: string; planNameSnapshot: string; quantity: number; unitAmountMinor: bigint; lineSubtotalMinor: bigint; currency: string }> }): IssuedInvoiceResult {
    const line = invoice.lines[0];
    if (!line || invoice.lines.length !== 1 || invoice.dueAt !== null) throw new InvoiceIssuanceError('INVOICE_EVIDENCE_INVALID', 'Persisted Foundation invoice evidence is invalid');
    return {
      id: invoice.id, companyId: invoice.companyId, sourcePaymentId: invoice.sourcePaymentId,
      sourceSubscriptionId: invoice.sourceSubscriptionId, invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt.toISOString(), dueAt: null, currency: invoice.currency,
      subtotalMinor: invoice.subtotalMinor.toString(), totalMinor: invoice.totalMinor.toString(),
      servicePeriodStart: invoice.servicePeriodStart.toISOString(), servicePeriodEnd: invoice.servicePeriodEnd.toISOString(),
      line: { planId: line.sourcePlanId, planCodeSnapshot: line.planCodeSnapshot, planNameSnapshot: line.planNameSnapshot,
        quantity: line.quantity, unitAmountMinor: line.unitAmountMinor.toString(), subtotalMinor: line.lineSubtotalMinor.toString(), currency: line.currency },
    };
  }
}

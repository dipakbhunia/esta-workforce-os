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
          include: { subscription: true },
        });
        if (!payment) throw new InvoiceIssuanceError('PAYMENT_NOT_FOUND', 'Source Payment was not found');
        this.validatePayment(payment);
        const subscription = payment.subscription;
        this.validateSubscription(payment, subscription);

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
        const quantity = subscription.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT
          ? subscription.seatQuantity : 1;
        const unitAmount = subscription.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT
          ? subscription.recurringUnitPriceMinor! : subscription.recurringTotalPriceMinor!;

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
            servicePeriodStart: subscription.currentPeriodStart!,
            servicePeriodEnd: subscription.currentPeriodEnd!,
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
            subtotalMinor: payment.amountMinor,
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
          lineSubtotalMinor: payment.amountMinor,
          currency: payment.currency,
        } });
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
    if (payment.purpose !== PaymentPurpose.SUBSCRIPTION_ACTIVATION) throw new InvoiceIssuanceError('WRONG_PAYMENT_PURPOSE', 'Payment is not a subscription activation payment');
    if (payment.status !== PaymentStatus.CAPTURED) throw new InvoiceIssuanceError('PAYMENT_NOT_CAPTURED', 'Payment is not captured');
    if (!payment.capturedAt || !payment.capturedProviderPaymentId?.trim()) throw new InvoiceIssuanceError('CAPTURE_EVIDENCE_MISSING', 'Payment capture evidence is incomplete');
    if (payment.amountMinor <= 0n || !/^[A-Z]{3}$/.test(payment.currency)) throw new InvoiceIssuanceError('INVALID_PAYMENT_AMOUNT', 'Payment commercial evidence is invalid');
  }

  private validateSubscription(payment: { id: string; companyId: string; subscriptionId: string; amountMinor: bigint; currency: string }, subscription: {
    id: string; companyId: string; planId: string; activationSource: SubscriptionActivationSource; activatedByPaymentId: string | null;
    billingModelSnapshot: PlanBillingModel; billingInterval: BillingInterval; pricingInterval: BillingInterval | null; pricingResolvedAt: Date | null;
    planCodeSnapshot: string; planNameSnapshot: string; recurringPriceBasis: RecurringPriceBasis | null;
    recurringUnitPriceMinor: bigint | null; recurringTotalPriceMinor: bigint | null; recurringCurrency: string | null;
    currency: string; seatQuantity: number; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  }) {
    if (subscription.id !== payment.subscriptionId || subscription.companyId !== payment.companyId) throw new InvoiceIssuanceError('OWNERSHIP_MISMATCH', 'Payment and subscription ownership do not match');
    if (subscription.activationSource !== SubscriptionActivationSource.PAYMENT || subscription.activatedByPaymentId !== payment.id) throw new InvoiceIssuanceError('ACTIVATION_LINK_MISMATCH', 'Subscription is not activated by the source Payment');
    if (!subscription.pricingResolvedAt || !subscription.pricingInterval || subscription.billingInterval !== subscription.pricingInterval ||
      !subscription.recurringPriceBasis || subscription.recurringTotalPriceMinor === null || !subscription.recurringCurrency ||
      subscription.recurringTotalPriceMinor <= 0n || subscription.seatQuantity < 1 ||
      !subscription.planCodeSnapshot.trim() || !subscription.planNameSnapshot.trim()) {
      throw new InvoiceIssuanceError('COMMERCIAL_SNAPSHOT_INVALID', 'Subscription commercial snapshot is incomplete');
    }
    if (payment.amountMinor !== subscription.recurringTotalPriceMinor || payment.currency !== subscription.recurringCurrency ||
      subscription.currency !== subscription.recurringCurrency) {
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
  }

  private validateSeller(settings: { sellerLegalName: string | null; sellerAddressLine1: string | null; sellerCity: string | null; sellerPostalCode: string | null; sellerCountry: string | null }) {
    try { this.requireText(settings.sellerLegalName, settings.sellerAddressLine1, settings.sellerCity, settings.sellerPostalCode, settings.sellerCountry); }
    catch { throw new InvoiceIssuanceError('SELLER_PROFILE_INCOMPLETE', 'Billing Settings seller identity is incomplete'); }
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

import { Injectable } from '@nestjs/common';
import {
  GstJurisdictionClassification,
  GstRegistrationStatus,
  GstRoundingMode,
  GstTaxComponentType,
  GstTaxPolicyStatus,
  GstTaxTreatment,
  Prisma,
} from '@prisma/client';
import { MAX_PAYMENT_AMOUNT_MINOR } from './payment-money.util';

const RATE_DENOMINATOR = 10_000n;
const HALF_RATE_DENOMINATOR = 5_000n;
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const STATE_CODE_PATTERN = /^[0-9]{2}$/;

export class GstTaxDomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'GstTaxDomainError'; }
}

export type TaxComponentDecision = {
  type: GstTaxComponentType;
  rateBasisPoints: number;
  taxableAmountMinor: bigint;
  taxAmountMinor: bigint;
  currency: string;
};

export type SubscriptionTaxDecision = {
  policyVersionId: string;
  policyCode: string;
  policyVersion: number;
  treatment: GstTaxTreatment;
  calculationVersion: number;
  decisionAt: Date;
  currency: string;
  taxableSubtotalMinor: bigint;
  totalTaxMinor: bigint;
  grossTotalMinor: bigint;
  jurisdictionClassification: GstJurisdictionClassification | null;
  serviceClassification: string | null;
  roundingMode: GstRoundingMode;
  sellerGstin: string | null;
  sellerLegalName: string | null;
  sellerRegisteredState: string | null;
  sellerRegisteredStateCode: string | null;
  buyerRegistrationStatus: GstRegistrationStatus | null;
  buyerGstin: string | null;
  buyerBillingState: string | null;
  buyerBillingStateCode: string | null;
  placeOfSupplyState: string | null;
  placeOfSupplyStateCode: string | null;
  components: TaxComponentDecision[];
};

type PolicyInput = {
  id: string; policyCode: string; version: number; treatment: GstTaxTreatment; currency: string;
  totalRateBasisPoints: number; cgstRateBasisPoints: number; sgstRateBasisPoints: number; igstRateBasisPoints: number;
  serviceClassification: string | null; roundingMode: GstRoundingMode; calculationVersion: number;
};
type SellerInput = { gstin: string | null; gstLegalName: string | null; sellerLegalName: string | null; gstRegisteredState: string | null; gstRegisteredStateCode: string | null };
type BuyerInput = { gstRegistrationStatus: GstRegistrationStatus | null; gstin: string | null; state: string | null; billingStateCode: string | null; placeOfSupplyState: string | null; placeOfSupplyStateCode: string | null };

export function calculateSubscriptionTax(input: {
  taxableSubtotalMinor: bigint; currency: string; decisionAt: Date; policy: PolicyInput; seller: SellerInput; buyer: BuyerInput;
}): SubscriptionTaxDecision {
  const { policy } = input;
  if (input.currency !== 'INR' || policy.currency !== input.currency) throw new GstTaxDomainError('UNSUPPORTED_GST_CURRENCY', 'GST calculation currency is unsupported');
  if (input.taxableSubtotalMinor <= 0n || input.taxableSubtotalMinor > MAX_PAYMENT_AMOUNT_MINOR) throw new GstTaxDomainError('GST_AMOUNT_INVALID', 'GST taxable amount is invalid');
  if (!Number.isFinite(input.decisionAt.getTime())) throw new GstTaxDomainError('GST_DECISION_TIME_INVALID', 'GST decision time is invalid');
  const rates = [policy.totalRateBasisPoints, policy.cgstRateBasisPoints, policy.sgstRateBasisPoints, policy.igstRateBasisPoints];
  if (rates.some((rate) => !Number.isInteger(rate) || rate < 0 || rate > 10_000)) throw new GstTaxDomainError('GST_RATE_INVALID', 'GST policy rate is invalid');

  if (policy.treatment === GstTaxTreatment.NON_TAXABLE) {
    if (rates.some((rate) => rate !== 0)) throw new GstTaxDomainError('GST_COMPONENT_RATE_MISMATCH', 'Non-taxable policy rates must be zero');
    return { policyVersionId: policy.id, policyCode: policy.policyCode, policyVersion: policy.version, treatment: policy.treatment,
      calculationVersion: policy.calculationVersion, decisionAt: new Date(input.decisionAt), currency: input.currency,
      taxableSubtotalMinor: input.taxableSubtotalMinor, totalTaxMinor: 0n, grossTotalMinor: input.taxableSubtotalMinor,
      jurisdictionClassification: null, serviceClassification: policy.serviceClassification, roundingMode: policy.roundingMode,
      sellerGstin: null, sellerLegalName: null, sellerRegisteredState: null, sellerRegisteredStateCode: null,
      buyerRegistrationStatus: input.buyer.gstRegistrationStatus, buyerGstin: null, buyerBillingState: input.buyer.state,
      buyerBillingStateCode: input.buyer.billingStateCode, placeOfSupplyState: input.buyer.placeOfSupplyState,
      placeOfSupplyStateCode: input.buyer.placeOfSupplyStateCode, components: [] };
  }

  const sellerCode = requiredStateCode(input.seller.gstRegisteredStateCode, 'GST seller jurisdiction is incomplete');
  const placeCode = requiredStateCode(input.buyer.placeOfSupplyStateCode, 'GST buyer place of supply is incomplete');
  if (!input.seller.gstin || !GSTIN_PATTERN.test(input.seller.gstin) || !text(input.seller.gstLegalName ?? input.seller.sellerLegalName) ||
      !text(input.seller.gstRegisteredState)) throw new GstTaxDomainError('GST_CONFIGURATION_INCOMPLETE', 'GST seller configuration is incomplete');
  if (!input.buyer.gstRegistrationStatus || !text(input.buyer.state) || !requiredStateCode(input.buyer.billingStateCode, 'GST buyer jurisdiction is incomplete') ||
      !text(input.buyer.placeOfSupplyState)) throw new GstTaxDomainError('BUYER_JURISDICTION_INCOMPLETE', 'GST buyer jurisdiction is incomplete');
  if (input.buyer.gstRegistrationStatus === GstRegistrationStatus.REGISTERED && (!input.buyer.gstin || !GSTIN_PATTERN.test(input.buyer.gstin))) {
    throw new GstTaxDomainError('BUYER_GST_REGISTRATION_INVALID', 'Registered buyer GST evidence is incomplete');
  }
  if (input.buyer.gstRegistrationStatus === GstRegistrationStatus.UNREGISTERED && input.buyer.gstin) throw new GstTaxDomainError('BUYER_GST_REGISTRATION_INVALID', 'Unregistered buyer must not have a GSTIN');
  if (!text(policy.serviceClassification)) throw new GstTaxDomainError('GST_POLICY_INCOMPLETE', 'GST service classification is missing');

  const jurisdictionClassification = sellerCode === placeCode ? GstJurisdictionClassification.INTRA_STATE : GstJurisdictionClassification.INTER_STATE;
  const componentRates = jurisdictionClassification === GstJurisdictionClassification.INTRA_STATE
    ? [[GstTaxComponentType.CGST, policy.cgstRateBasisPoints], [GstTaxComponentType.SGST, policy.sgstRateBasisPoints]] as const
    : [[GstTaxComponentType.IGST, policy.igstRateBasisPoints]] as const;
  const expectedRate = componentRates.reduce((sum, [, rate]) => sum + rate, 0);
  if (expectedRate !== policy.totalRateBasisPoints || (jurisdictionClassification === GstJurisdictionClassification.INTRA_STATE && policy.igstRateBasisPoints !== policy.totalRateBasisPoints) ||
      (jurisdictionClassification === GstJurisdictionClassification.INTER_STATE && policy.cgstRateBasisPoints + policy.sgstRateBasisPoints !== policy.totalRateBasisPoints)) {
    throw new GstTaxDomainError('GST_COMPONENT_RATE_MISMATCH', 'GST component rates do not reconcile');
  }
  const components = componentRates.map(([type, rateBasisPoints]) => ({ type, rateBasisPoints, taxableAmountMinor: input.taxableSubtotalMinor,
    taxAmountMinor: roundTax(input.taxableSubtotalMinor, rateBasisPoints), currency: input.currency }));
  const totalTaxMinor = components.reduce((sum, component) => sum + component.taxAmountMinor, 0n);
  if (totalTaxMinor > MAX_PAYMENT_AMOUNT_MINOR - input.taxableSubtotalMinor) throw new GstTaxDomainError('GST_CALCULATION_OVERFLOW', 'GST gross amount exceeds the supported monetary limit');
  return { policyVersionId: policy.id, policyCode: policy.policyCode, policyVersion: policy.version, treatment: policy.treatment,
    calculationVersion: policy.calculationVersion, decisionAt: new Date(input.decisionAt), currency: input.currency,
    taxableSubtotalMinor: input.taxableSubtotalMinor, totalTaxMinor, grossTotalMinor: input.taxableSubtotalMinor + totalTaxMinor,
    jurisdictionClassification, serviceClassification: policy.serviceClassification!.trim(), roundingMode: policy.roundingMode,
    sellerGstin: input.seller.gstin, sellerLegalName: (input.seller.gstLegalName ?? input.seller.sellerLegalName)!.trim(),
    sellerRegisteredState: input.seller.gstRegisteredState!.trim(), sellerRegisteredStateCode: sellerCode,
    buyerRegistrationStatus: input.buyer.gstRegistrationStatus, buyerGstin: input.buyer.gstin,
    buyerBillingState: input.buyer.state!.trim(), buyerBillingStateCode: input.buyer.billingStateCode!,
    placeOfSupplyState: input.buyer.placeOfSupplyState!.trim(), placeOfSupplyStateCode: placeCode, components };
}

function roundTax(amount: bigint, rate: number): bigint { return (amount * BigInt(rate) + HALF_RATE_DENOMINATOR) / RATE_DENOMINATOR; }
function text(value: string | null | undefined): string | null { return value?.trim() || null; }
function requiredStateCode(value: string | null, message: string): string { if (!value || !STATE_CODE_PATTERN.test(value)) throw new GstTaxDomainError('BUYER_JURISDICTION_INCOMPLETE', message); return value; }

@Injectable()
export class SubscriptionTaxCalculationService {
  async resolve(tx: Prisma.TransactionClient, subscription: { companyId: string; recurringTotalPriceMinor: bigint; recurringCurrency: string }, decisionAt: Date): Promise<SubscriptionTaxDecision | null> {
    const settings = await tx.billingSettings.findUnique({ where: { scope: 'PLATFORM' } });
    if (!settings?.gstEnabled) return null;
    const policies = await tx.gstTaxPolicyVersion.findMany({ where: { status: GstTaxPolicyStatus.ACTIVE, currency: subscription.recurringCurrency,
      effectiveFrom: { lte: decisionAt }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: decisionAt } }] }, orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }], take: 2 });
    if (policies.length !== 1) throw new GstTaxDomainError('GST_POLICY_UNAVAILABLE', 'Exactly one effective GST policy is required');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GstTaxPolicyVersion" WHERE "id" = ${policies[0].id}::uuid FOR SHARE`);
    const profile = await tx.companyBillingProfile.findUnique({ where: { companyId: subscription.companyId } });
    if (!profile) throw new GstTaxDomainError('BUYER_JURISDICTION_INCOMPLETE', 'GST buyer billing profile is missing');
    return calculateSubscriptionTax({ taxableSubtotalMinor: subscription.recurringTotalPriceMinor, currency: subscription.recurringCurrency,
      decisionAt, policy: policies[0], seller: settings, buyer: profile });
  }

  async assertPersistedPayment(tx: Prisma.TransactionClient, payment: { id: string; companyId: string; subscriptionId: string; amountMinor: bigint; currency: string }, subscription: { recurringTotalPriceMinor: bigint; recurringCurrency: string }): Promise<void> {
    const snapshot = await tx.paymentTaxSnapshot.findUnique({ where: { paymentId: payment.id }, include: { components: true } });
    if (!snapshot) {
      if (payment.amountMinor !== subscription.recurringTotalPriceMinor || payment.currency !== subscription.recurringCurrency) throw new GstTaxDomainError('PAYMENT_TAX_EVIDENCE_CONFLICT', 'Legacy Payment commercial evidence is incompatible');
      return;
    }
    const componentTotal = snapshot.components.reduce((sum, component) => sum + component.taxAmountMinor, 0n);
    const componentTypes = snapshot.components.map((component) => component.type).sort().join(',');
    const invalidComponents = snapshot.components.some((component) => component.currency !== snapshot.currency ||
      component.taxableAmountMinor !== snapshot.taxableSubtotalMinor || !Number.isInteger(component.rateBasisPoints) ||
      component.rateBasisPoints < 0 || component.rateBasisPoints > 10_000 ||
      component.taxAmountMinor !== (component.taxableAmountMinor * BigInt(component.rateBasisPoints) + HALF_RATE_DENOMINATOR) / RATE_DENOMINATOR);
    if (snapshot.companyId !== payment.companyId || snapshot.sourceSubscriptionId !== payment.subscriptionId ||
        snapshot.currency !== payment.currency || snapshot.currency !== subscription.recurringCurrency ||
        snapshot.taxableSubtotalMinor !== subscription.recurringTotalPriceMinor || snapshot.totalTaxMinor !== componentTotal ||
        snapshot.grossTotalMinor !== snapshot.taxableSubtotalMinor + snapshot.totalTaxMinor || snapshot.grossTotalMinor !== payment.amountMinor || invalidComponents ||
        (snapshot.treatment === GstTaxTreatment.NON_TAXABLE && (snapshot.totalTaxMinor !== 0n || snapshot.components.length !== 0 || snapshot.jurisdictionClassification !== null)) ||
        (snapshot.jurisdictionClassification === GstJurisdictionClassification.INTRA_STATE && componentTypes !== 'CGST,SGST') ||
        (snapshot.jurisdictionClassification === GstJurisdictionClassification.INTER_STATE && componentTypes !== 'IGST')) {
      throw new GstTaxDomainError('PAYMENT_TAX_EVIDENCE_CONFLICT', 'Persisted Payment tax evidence is contradictory');
    }
  }
}

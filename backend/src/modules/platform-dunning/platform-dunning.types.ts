import {
  BillingInterval, GstJurisdictionClassification, GstTaxComponentType, GstTaxTreatment,
  PaymentAttemptOperation, PaymentAttemptStatus, PaymentProviderMode, PaymentProviderOrderStatus,
  PaymentProviderType, PaymentPurpose, PaymentStatus, RecurringPriceBasis,
  SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';

export type DunningClassification = 'NOT_DUE' | 'OPEN' | 'RECOVERY_PENDING' | 'RESOLVED' | 'STOPPED';
export type DunningOpenReason = 'PAYMENT_PENDING' | 'PAYMENT_AUTHORIZED' | 'PAYMENT_FAILED';

export interface PlatformDunningQuery {
  page?: number; limit?: number; companyId?: string; subscriptionId?: string; renewalId?: string;
  paymentId?: string; paymentStatus?: PaymentStatus; from?: Date; to?: Date;
}

export interface DunningLineage {
  renewal: { id: string; companyId: string; subscriptionId: string; paymentId: string; status: SubscriptionRenewalStatus; cycleStart: Date };
  payment: { id: string; companyId: string; subscriptionId: string; purpose: PaymentPurpose; status: PaymentStatus };
  subscription: { id: string; companyId: string; status: SubscriptionStatus };
}

export interface DunningClassificationResult { active: boolean; classification: DunningClassification; reason: DunningOpenReason | null }

export interface PlatformDunningListItem extends DunningClassificationResult {
  dueAt: string;
  renewal: { id: string; status: SubscriptionRenewalStatus; cycleStart: string; cycleEnd: string; billingInterval: BillingInterval; createdAt: string };
  company: { id: string; name: string };
  subscription: { id: string; status: SubscriptionStatus; plan: { id: string; code: string; name: string } };
  payment: { id: string; purpose: PaymentPurpose; status: PaymentStatus; amountMinor: string; currency: string; provider: PaymentProviderType; mode: PaymentProviderMode; failedAt: string | null; failureCode: string | null; safeFailureMessage: string | null };
  latestProviderOrder: null | { id: string; status: PaymentProviderOrderStatus; providerStatus: string; createdAt: string; updatedAt: string };
}

export interface PlatformDunningDetails extends PlatformDunningListItem {
  evaluationTime: string;
  renewal: PlatformDunningListItem['renewal'] & { recurringPriceBasis: RecurringPriceBasis; recurringUnitPriceMinor: string | null; recurringTotalPriceMinor: string; currency: string; seatQuantity: number; applicationAttemptCount: number; lastApplicationAttemptAt: string | null; appliedAt: string | null; blockedAt: string | null; blockCode: string | null; safeBlockMessage: string | null; preparedByUserId: string | null };
  payment: PlatformDunningListItem['payment'] & { providerStatus: string | null; authorizedAt: string | null; capturedAt: string | null; createdAt: string; updatedAt: string };
  tax: null | { treatment: GstTaxTreatment; decisionAt: string; currency: string; taxableSubtotalMinor: string; totalTaxMinor: string; grossTotalMinor: string; jurisdictionClassification: GstJurisdictionClassification | null; serviceClassification: string | null; components: Array<{ type: GstTaxComponentType; rateBasisPoints: number; taxableAmountMinor: string; taxAmountMinor: string; currency: string }> };
  attempts: { data: Array<{ id: string; sequence: number; operation: PaymentAttemptOperation; status: PaymentAttemptStatus; providerStatus: string | null; failureCode: string | null; safeFailureMessage: string | null; startedAt: string; completedAt: string | null }>; truncated: boolean };
  invoice: null | { id: string; invoiceNumber: string; issuedAt: string; currency: string; subtotalMinor: string; totalTaxMinor: string | null; totalMinor: string };
}

export class DunningIntegrityError extends Error {
  readonly code = 'DUNNING_EVIDENCE_INCONSISTENT';
  readonly publicMessage = 'Dunning evidence is inconsistent';
  constructor(readonly category: string) { super('Dunning evidence is inconsistent'); this.name = 'DunningIntegrityError'; }
}

export class DunningNotFoundError extends Error {
  readonly code = 'DUNNING_RENEWAL_NOT_FOUND';
  constructor() { super('Renewal not found'); this.name = 'DunningNotFoundError'; }
}

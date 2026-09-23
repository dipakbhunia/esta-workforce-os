import {
  BillingInterval, GstJurisdictionClassification, GstTaxComponentType, GstTaxTreatment,
  PaymentProviderMode, PaymentProviderOrderStatus, PaymentProviderType, PaymentPurpose, PaymentStatus,
  RecurringPriceBasis, SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';

export class PlatformRenewalResponseDto {
  id!: string;
  status!: SubscriptionRenewalStatus;
  cycleStart!: string;
  cycleEnd!: string;
  billingInterval!: BillingInterval;
  recurringPriceBasis!: RecurringPriceBasis;
  recurringUnitPriceMinor!: string | null;
  recurringTotalPriceMinor!: string;
  currency!: string;
  seatQuantity!: number;
  company!: { id: string; name: string };
  subscription!: { id: string; status: SubscriptionStatus; plan: { id: string; code: string; name: string } };
  payment!: { id: string; purpose: PaymentPurpose; status: PaymentStatus; amountMinor: string; currency: string; provider: PaymentProviderType; mode: PaymentProviderMode; capturedAt: string | null };
  preparedBy!: { id: string; email: string; firstName: string; lastName: string } | null;
  applicationAttemptCount!: number;
  lastApplicationAttemptAt!: string | null;
  appliedAt!: string | null;
  blockedAt!: string | null;
  blockCode!: string | null;
  safeBlockMessage!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class PlatformRenewalDetailsResponseDto extends PlatformRenewalResponseDto {
  tax!: null | {
    treatment: GstTaxTreatment; decisionAt: string; currency: string; taxableSubtotalMinor: string;
    totalTaxMinor: string; grossTotalMinor: string; jurisdictionClassification: GstJurisdictionClassification | null;
    serviceClassification: string | null; placeOfSupplyState: string | null; placeOfSupplyStateCode: string | null;
    components: Array<{ type: GstTaxComponentType; rateBasisPoints: number; taxableAmountMinor: string; taxAmountMinor: string; currency: string }>;
  };
  providerOrder!: null | { id: string; sequence: number; providerOrderId: string; status: PaymentProviderOrderStatus; providerStatus: string; createdAt: string; updatedAt: string };
  invoice!: null | { id: string; invoiceNumber: string; issuedAt: string; servicePeriodStart: string; servicePeriodEnd: string; currency: string; subtotalMinor: string; totalTaxMinor: string | null; totalMinor: string };
}

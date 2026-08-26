import {
  BillingInterval,
  PlanBillingModel,
  RecurringPriceBasis,
} from '@prisma/client';
import {
  MAX_PAYMENT_AMOUNT_MINOR,
  assertPaymentCurrency,
  multiplyPaymentAmount,
} from '../payments/payment-money.util';

export interface RecurringPriceSource {
  billingInterval: BillingInterval;
  basis: RecurringPriceBasis;
  amountMinor: bigint;
  currency: string;
}

export interface ResolvedRecurringPricing {
  recurringPriceBasis: RecurringPriceBasis;
  recurringUnitPriceMinor: bigint | null;
  recurringTotalPriceMinor: bigint;
  recurringCurrency: string;
  pricingInterval: BillingInterval;
  pricingResolvedAt: Date;
}

export class CommercialPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommercialPricingError';
  }
}

export function resolveRecurringPricing(input: {
  billingModel: PlanBillingModel;
  billingInterval: BillingInterval;
  seatQuantity: number;
  planCurrency: string;
  recurringPrices: readonly RecurringPriceSource[];
  complimentary?: boolean;
  resolvedAt?: Date;
}): ResolvedRecurringPricing {
  if (input.billingInterval === BillingInterval.CUSTOM) {
    throw new CommercialPricingError('CUSTOM billing interval is not configured');
  }
  if (!Number.isInteger(input.seatQuantity) || input.seatQuantity <= 0) {
    throw new CommercialPricingError('Seat quantity must be a positive integer');
  }
  const currency = assertPaymentCurrency(input.planCurrency);
  const expectedBasis = input.billingModel === PlanBillingModel.PER_USER
    ? RecurringPriceBasis.PER_USER_UNIT
    : RecurringPriceBasis.FIXED_TOTAL;

  if (input.complimentary) {
    return {
      recurringPriceBasis: expectedBasis,
      recurringUnitPriceMinor:
        expectedBasis === RecurringPriceBasis.PER_USER_UNIT ? 0n : null,
      recurringTotalPriceMinor: 0n,
      recurringCurrency: currency,
      pricingInterval: input.billingInterval,
      pricingResolvedAt: input.resolvedAt ?? new Date(),
    };
  }

  const price = input.recurringPrices.find(
    (candidate) => candidate.billingInterval === input.billingInterval,
  );
  if (!price) {
    throw new CommercialPricingError(`${input.billingInterval} pricing is not configured`);
  }
  if (price.basis !== expectedBasis) {
    throw new CommercialPricingError('Plan recurring price basis does not match its billing model');
  }
  if (price.currency !== currency) {
    throw new CommercialPricingError('Plan recurring price currency does not match the Plan currency');
  }
  if (price.amountMinor < 0n || price.amountMinor > MAX_PAYMENT_AMOUNT_MINOR) {
    throw new CommercialPricingError('Plan recurring price is outside the supported money boundary');
  }

  const total = expectedBasis === RecurringPriceBasis.PER_USER_UNIT
    ? price.amountMinor === 0n
      ? 0n
      : multiplyPaymentAmount(price.amountMinor, BigInt(input.seatQuantity))
    : price.amountMinor;

  return {
    recurringPriceBasis: expectedBasis,
    recurringUnitPriceMinor:
      expectedBasis === RecurringPriceBasis.PER_USER_UNIT ? price.amountMinor : null,
    recurringTotalPriceMinor: total,
    recurringCurrency: currency,
    pricingInterval: input.billingInterval,
    pricingResolvedAt: input.resolvedAt ?? new Date(),
  };
}

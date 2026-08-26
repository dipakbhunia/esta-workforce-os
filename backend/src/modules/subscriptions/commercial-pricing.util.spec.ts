import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BillingInterval,
  PlanBillingModel,
  RecurringPriceBasis,
} from '@prisma/client';
import { MAX_PAYMENT_AMOUNT_MINOR } from '../payments/payment-money.util';
import { resolveRecurringPricing } from './commercial-pricing.util';

const price = (
  billingInterval: BillingInterval,
  basis: RecurringPriceBasis,
  amountMinor: bigint,
) => ({ billingInterval, basis, amountMinor, currency: 'INR' });

describe('commercial recurring pricing authority', () => {
  it('resolves explicit MONTHLY PER_USER unit price times seats', () => {
    const result = resolveRecurringPricing({
      billingModel: PlanBillingModel.PER_USER,
      billingInterval: BillingInterval.MONTHLY,
      seatQuantity: 5,
      planCurrency: 'INR',
      recurringPrices: [price(BillingInterval.MONTHLY, RecurringPriceBasis.PER_USER_UNIT, 9_900n)],
    });
    assert.equal(result.recurringUnitPriceMinor, 9_900n);
    assert.equal(result.recurringTotalPriceMinor, 49_500n);
    assert.equal(result.recurringCurrency, 'INR');
  });

  it('uses explicit YEARLY pricing and never falls back to monthly times twelve', () => {
    const result = resolveRecurringPricing({
      billingModel: PlanBillingModel.PER_USER,
      billingInterval: BillingInterval.YEARLY,
      seatQuantity: 2,
      planCurrency: 'INR',
      recurringPrices: [
        price(BillingInterval.MONTHLY, RecurringPriceBasis.PER_USER_UNIT, 1_000n),
        price(BillingInterval.YEARLY, RecurringPriceBasis.PER_USER_UNIT, 10_000n),
      ],
    });
    assert.equal(result.recurringTotalPriceMinor, 20_000n);
  });

  it('rejects YEARLY when it is not explicitly configured', () => {
    assert.throws(() => resolveRecurringPricing({
      billingModel: PlanBillingModel.PER_USER,
      billingInterval: BillingInterval.YEARLY,
      seatQuantity: 1,
      planCurrency: 'INR',
      recurringPrices: [price(BillingInterval.MONTHLY, RecurringPriceBasis.PER_USER_UNIT, 1_000n)],
    }), /YEARLY pricing is not configured/);
  });

  it('treats CUSTOM plan pricing as a fixed total and never multiplies by seats', () => {
    const result = resolveRecurringPricing({
      billingModel: PlanBillingModel.CUSTOM,
      billingInterval: BillingInterval.MONTHLY,
      seatQuantity: 500,
      planCurrency: 'INR',
      recurringPrices: [price(BillingInterval.MONTHLY, RecurringPriceBasis.FIXED_TOTAL, 75_000n)],
    });
    assert.equal(result.recurringUnitPriceMinor, null);
    assert.equal(result.recurringTotalPriceMinor, 75_000n);
  });

  it('rejects multiplication beyond the provider-safe boundary', () => {
    assert.throws(() => resolveRecurringPricing({
      billingModel: PlanBillingModel.PER_USER,
      billingInterval: BillingInterval.MONTHLY,
      seatQuantity: 2,
      planCurrency: 'INR',
      recurringPrices: [price(BillingInterval.MONTHLY, RecurringPriceBasis.PER_USER_UNIT, MAX_PAYMENT_AMOUNT_MINOR)],
    }), /boundary/i);
  });

  it('keeps CUSTOM billing intervals explicitly unsupported', () => {
    assert.throws(() => resolveRecurringPricing({
      billingModel: PlanBillingModel.CUSTOM,
      billingInterval: BillingInterval.CUSTOM,
      seatQuantity: 1,
      planCurrency: 'INR',
      recurringPrices: [],
    }), /not configured/i);
  });
});

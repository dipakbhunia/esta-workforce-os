import type { MoneySnapshot, SerializedMoneySnapshot } from './payment.types';

export const MAX_PAYMENT_AMOUNT_MINOR = 9_007_199_254_740_991n;
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class PaymentMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentMoneyError';
  }
}

export function assertPaymentAmount(amountMinor: bigint): bigint {
  if (typeof amountMinor !== 'bigint') {
    throw new PaymentMoneyError('Payment amount must be represented as bigint minor units');
  }
  if (amountMinor <= 0n) {
    throw new PaymentMoneyError('Payment amount must be positive');
  }
  if (amountMinor > MAX_PAYMENT_AMOUNT_MINOR) {
    throw new PaymentMoneyError('Payment amount exceeds the provider-safe boundary');
  }
  return amountMinor;
}

export function assertPaymentCurrency(currency: string): string {
  if (typeof currency !== 'string' || !ISO_CURRENCY_PATTERN.test(currency)) {
    throw new PaymentMoneyError('Payment currency must be an uppercase 3-character ISO code');
  }
  return currency;
}

export function multiplyPaymentAmount(
  amountMinor: bigint,
  ...multipliers: bigint[]
): bigint {
  let result = assertPaymentAmount(amountMinor);
  for (const multiplier of multipliers) {
    if (typeof multiplier !== 'bigint' || multiplier <= 0n) {
      throw new PaymentMoneyError('Payment multiplier must be a positive bigint');
    }
    if (result > MAX_PAYMENT_AMOUNT_MINOR / multiplier) {
      throw new PaymentMoneyError('Payment multiplication exceeds the provider-safe boundary');
    }
    result *= multiplier;
  }
  return assertPaymentAmount(result);
}

export function serializeMoney(snapshot: MoneySnapshot): SerializedMoneySnapshot {
  return {
    amountMinor: assertPaymentAmount(snapshot.amountMinor).toString(10),
    currency: assertPaymentCurrency(snapshot.currency),
  };
}

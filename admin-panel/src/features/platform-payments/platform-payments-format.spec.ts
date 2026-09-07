import { describe, expect, it } from 'vitest';
import { formatPlatformPaymentAmount } from './platform-payments-format';

describe('formatPlatformPaymentAmount', () => {
  it.each([
    ['0', 'INR 0.00'],
    ['1', 'INR 0.01'],
    ['5', 'INR 0.05'],
    ['105', 'INR 1.05'],
    ['1000', 'INR 10.00'],
    ['9007199254740991', 'INR 90071992547409.91'],
    ['000105', 'INR 1.05'],
  ])('formats %s exactly', (amount, expected) => {
    expect(formatPlatformPaymentAmount(amount, 'INR')).toBe(expected);
  });

  it.each(['-1', '1.5', 'one', ''])('returns a deterministic fallback for invalid amount %j', (amount) => {
    expect(formatPlatformPaymentAmount(amount, 'INR')).toBe('Amount unavailable');
  });

  it('rejects malformed currency without coercion', () => {
    expect(formatPlatformPaymentAmount('100', 'inr')).toBe('Amount unavailable');
  });
});

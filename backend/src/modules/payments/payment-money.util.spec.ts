import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_PAYMENT_AMOUNT_MINOR,
  assertPaymentAmount,
  assertPaymentCurrency,
  multiplyPaymentAmount,
  serializeMoney,
} from './payment-money.util';

describe('payment money utilities', () => {
  it('multiplies minor units with bigint arithmetic', () => {
    assert.equal(multiplyPaymentAmount(1_500n, 25n, 12n), 450_000n);
  });

  it('rejects zero and negative amounts', () => {
    assert.throws(() => assertPaymentAmount(0n), /positive/i);
    assert.throws(() => assertPaymentAmount(-1n), /positive/i);
  });

  it('accepts the exact provider-safe maximum', () => {
    assert.equal(assertPaymentAmount(MAX_PAYMENT_AMOUNT_MINOR), MAX_PAYMENT_AMOUNT_MINOR);
  });

  it('rejects amounts and multiplication above the boundary', () => {
    assert.throws(() => assertPaymentAmount(MAX_PAYMENT_AMOUNT_MINOR + 1n), /boundary/i);
    assert.throws(() => multiplyPaymentAmount(MAX_PAYMENT_AMOUNT_MINOR, 2n), /boundary/i);
  });

  it('rejects zero and negative multipliers', () => {
    assert.throws(() => multiplyPaymentAmount(1_000n, 0n), /positive bigint/i);
    assert.throws(() => multiplyPaymentAmount(1_000n, -1n), /positive bigint/i);
  });

  it('serializes bigint amounts as decimal strings', () => {
    assert.deepEqual(serializeMoney({ amountMinor: 123_456n, currency: 'INR' }), {
      amountMinor: '123456',
      currency: 'INR',
    });
  });

  it('requires uppercase three-character currencies', () => {
    assert.equal(assertPaymentCurrency('INR'), 'INR');
    assert.throws(() => assertPaymentCurrency('inr'), /uppercase/i);
    assert.throws(() => assertPaymentCurrency('IN'), /3-character/i);
    assert.throws(() => assertPaymentCurrency('INR '), /3-character/i);
  });
});

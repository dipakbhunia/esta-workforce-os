import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BillingInterval } from '@prisma/client';
import { subscriptionPeriodFromCapture } from './subscription-period.util';

describe('subscriptionPeriodFromCapture', () => {
  for (const [name, start, interval, expected] of [
    ['ordinary monthly', '2026-05-15T10:20:30.456Z', BillingInterval.MONTHLY, '2026-06-15T10:20:30.456Z'],
    ['January 31 non-leap', '2025-01-31T04:05:06.007Z', BillingInterval.MONTHLY, '2025-02-28T04:05:06.007Z'],
    ['January 31 leap', '2024-01-31T04:05:06.007Z', BillingInterval.MONTHLY, '2024-02-29T04:05:06.007Z'],
    ['March 31', '2026-03-31T23:59:59.999Z', BillingInterval.MONTHLY, '2026-04-30T23:59:59.999Z'],
    ['leap day yearly', '2024-02-29T12:34:56.789Z', BillingInterval.YEARLY, '2025-02-28T12:34:56.789Z'],
    ['ordinary yearly', '2025-08-30T00:01:02.003Z', BillingInterval.YEARLY, '2026-08-30T00:01:02.003Z'],
  ] as const) {
    it(name, () => {
      const result = subscriptionPeriodFromCapture(new Date(start), interval);
      assert.equal(result.start.toISOString(), start); assert.equal(result.end.toISOString(), expected);
      assert.deepEqual(subscriptionPeriodFromCapture(new Date(start), interval), result);
    });
  }
  it('rejects invalid dates and unsupported intervals', () => {
    assert.throws(() => subscriptionPeriodFromCapture(new Date(Number.NaN), BillingInterval.MONTHLY));
    assert.throws(() => subscriptionPeriodFromCapture(new Date(), BillingInterval.CUSTOM));
  });
});

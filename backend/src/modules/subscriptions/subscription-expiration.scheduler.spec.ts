import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SubscriptionExpirationScheduler } from './subscription-expiration.scheduler';

describe('SubscriptionExpirationScheduler', () => {
  it('runs expiration recovery and releases its overlap guard after success or failure', async () => {
    let calls = 0;
    const scheduler = new SubscriptionExpirationScheduler({ recoverDue: async () => { calls += 1; if (calls === 1) throw new Error('temporary'); return 0; } } as never);
    await scheduler.expireDueSubscriptions();
    await scheduler.expireDueSubscriptions();
    assert.equal(calls, 2);
  });
});

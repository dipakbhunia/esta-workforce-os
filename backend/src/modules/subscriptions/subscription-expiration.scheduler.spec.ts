import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SubscriptionExpirationScheduler } from './subscription-expiration.scheduler';

describe('SubscriptionExpirationScheduler', () => {
  it('runs expiration recovery and releases its overlap guard after success or failure', async () => {
    let calls = 0;
    const scheduler = new SubscriptionExpirationScheduler(
      { recoverDue: async () => 0 } as never,
      { recoverDue: async () => { calls += 1; if (calls === 1) throw new Error('temporary'); return 0; } } as never,
    );
    await scheduler.expireDueSubscriptions();
    await scheduler.expireDueSubscriptions();
    assert.equal(calls, 2);
  });

  it('prepares renewals before processing expiration', async () => {
    const order: string[] = [];
    const scheduler = new SubscriptionExpirationScheduler(
      { recoverDue: async () => { order.push('renewal'); return 1; } } as never,
      { recoverDue: async () => { order.push('expiration'); return 0; } } as never,
    );
    await scheduler.expireDueSubscriptions();
    assert.deepEqual(order, ['renewal', 'expiration']);
  });

  it('continues expiration when renewal preparation fails', async () => {
    let expirations = 0;
    const scheduler = new SubscriptionExpirationScheduler(
      { recoverDue: async () => { throw new Error('renewal unavailable'); } } as never,
      { recoverDue: async () => { expirations += 1; return 0; } } as never,
    );
    await scheduler.expireDueSubscriptions();
    assert.equal(expirations, 1);
  });
});

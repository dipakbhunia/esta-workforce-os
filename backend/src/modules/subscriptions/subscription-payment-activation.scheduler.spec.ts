import assert from 'node:assert/strict';
import { it } from 'node:test';
import { SubscriptionPaymentActivationScheduler } from './subscription-payment-activation.scheduler';

it('runs bounded subscription payment activation recovery', async () => {
  let calls = 0; const scheduler = new SubscriptionPaymentActivationScheduler(
    { recoverDue: async () => { calls += 1; } } as never,
    { recoverDue: async () => { calls += 1; } } as never,
  );
  await scheduler.recover(); assert.equal(calls, 2);
});

it('isolates activation and renewal recovery failures in both directions', async () => {
  let activationCalls = 0; let renewalCalls = 0;
  const activationFails = new SubscriptionPaymentActivationScheduler(
    { recoverDue: async () => { activationCalls += 1; throw new Error('activation unavailable'); } } as never,
    { recoverDue: async () => { renewalCalls += 1; } } as never,
  );
  await assert.doesNotReject(() => activationFails.recover());
  assert.deepEqual([activationCalls, renewalCalls], [1, 1]);

  activationCalls = 0; renewalCalls = 0;
  const renewalFails = new SubscriptionPaymentActivationScheduler(
    { recoverDue: async () => { activationCalls += 1; } } as never,
    { recoverDue: async () => { renewalCalls += 1; throw new Error('renewal unavailable'); } } as never,
  );
  await assert.doesNotReject(() => renewalFails.recover());
  assert.deepEqual([activationCalls, renewalCalls], [1, 1]);
});

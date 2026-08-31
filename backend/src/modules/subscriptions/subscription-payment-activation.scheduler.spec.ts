import assert from 'node:assert/strict';
import { it } from 'node:test';
import { SubscriptionPaymentActivationScheduler } from './subscription-payment-activation.scheduler';

it('runs bounded subscription payment activation recovery', async () => {
  let calls = 0; const scheduler = new SubscriptionPaymentActivationScheduler({ recoverDue: async () => { calls += 1; } } as never);
  await scheduler.recover(); assert.equal(calls, 1);
});

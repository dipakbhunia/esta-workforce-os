import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import {
  PaymentAttemptOperation, PaymentAttemptStatus, PaymentProviderEventStatus, PaymentProviderMode,
  PaymentProviderOrderStatus, PaymentProviderType, PaymentPurpose, PaymentStatus,
  SubscriptionActivationSource, SubscriptionStatus,
} from '@prisma/client';
import { PlatformPaymentsService } from './platform-payments.service';

const now = new Date('2026-09-07T12:00:00Z');
function payment() {
  return {
    id: 'payment-1', purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, amountMinor: 1000n, currency: 'INR', status: PaymentStatus.CAPTURED,
    provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST, providerStatus: 'captured',
    failureCode: null, safeFailureMessage: null, authorizedAt: null, capturedAt: now, failedAt: null,
    capturedProviderPaymentId: 'pay_1', createdAt: now, updatedAt: now,
    company: { id: 'company-1', name: 'Company One' },
    subscription: { id: 'subscription-1', status: SubscriptionStatus.PENDING, activationSource: SubscriptionActivationSource.PAYMENT, activatedByPaymentId: null, planId: 'plan-1', planCodeSnapshot: 'SNAPSHOT', planNameSnapshot: 'Snapshot Plan' },
  };
}

function harness(found = true) {
  const calls: Array<[string, any]> = [];
  const tx = {
    payment: { findUnique: async (args: any) => { calls.push(['payment', args]); return found ? payment() : null; } },
    paymentProviderOrder: { findMany: async (args: any) => { calls.push(['orders', args]); return [{ id: 'order-1', sequence: 1, providerOrderId: 'order_external', status: PaymentProviderOrderStatus.CLOSED, providerStatus: 'closed', createdAt: now, updatedAt: now }]; } },
    paymentAttempt: { findMany: async (args: any) => { calls.push(['attempts', args]); return [{ id: 'attempt-1', sequence: 1, operation: PaymentAttemptOperation.WEBHOOK, status: PaymentAttemptStatus.SUCCEEDED, providerOrderId: 'order_external', providerPaymentId: 'pay_1', providerStatus: 'captured', amountMinor: 1000n, currency: 'INR', failureCode: null, safeFailureMessage: null, startedAt: now, completedAt: now, createdAt: now, updatedAt: now }]; } },
    paymentProviderEvent: { findMany: async (args: any) => { calls.push(['events', args]); return [{ id: 'event-1', eventType: 'payment.captured', providerEventId: 'event_external', status: PaymentProviderEventStatus.PROCESSED, providerOrderId: 'order_external', providerPaymentId: 'pay_1', providerCreatedAt: now, receivedAt: now, processedAt: now }]; } },
    auditLog: {
      findMany: async (args: any) => { calls.push(['audits', args]); return [{ id: 'audit-1', action: 'SUBSCRIPTION_PAYMENT_ACTIVATION_BLOCKED', createdAt: now }]; },
      findFirst: async (args: any) => { calls.push(['blocked', args]); return { id: 'audit-1' }; },
    },
  };
  let isolation: unknown;
  const prisma = { $transaction: async (callback: (client: any) => unknown, options: unknown) => { isolation = options; return callback(tx); } };
  return { service: new PlatformPaymentsService(prisma as never), calls, getIsolation: () => isolation };
}

describe('PlatformPaymentsService details', () => {
  it('returns explicit detail history with a fixed six-query repeatable-read plan', async () => {
    const h = harness();
    const result = await h.service.findOne('payment-1');
    assert.equal(result.id, 'payment-1');
    assert.equal(result.activation.status, 'BLOCKED');
    assert.deepEqual(h.calls.map(([name]) => name).sort(), ['attempts', 'audits', 'blocked', 'events', 'orders', 'payment']);
    assert.deepEqual(h.getIsolation(), { isolationLevel: 'RepeatableRead' });
  });

  it('uses exact deterministic bounds and strict audit correlation', async () => {
    const h = harness();
    await h.service.findOne('payment-1');
    const get = (name: string) => h.calls.find(([called]) => called === name)![1];
    assert.deepEqual(get('orders').orderBy, [{ sequence: 'desc' }, { id: 'desc' }]);
    assert.equal(get('orders').take, 26);
    assert.deepEqual(get('attempts').orderBy, [{ sequence: 'desc' }, { id: 'desc' }]);
    assert.equal(get('attempts').take, 101);
    assert.deepEqual(get('events').orderBy, [{ receivedAt: 'desc' }, { id: 'desc' }]);
    assert.equal(get('events').take, 101);
    assert.equal(get('audits').take, 21);
    assert.equal(get('audits').where.companyId, 'company-1');
    assert.deepEqual(get('audits').where.OR.map((clause: any) => clause.action), [
      'SUBSCRIPTION_ACTIVATED_BY_PAYMENT', 'SUBSCRIPTION_PAYMENT_ACTIVATION_BLOCKED', 'PAYMENT_RECOVERED_AFTER_PROVIDER_FAILURE',
    ]);
    assert.equal(get('blocked').where.entityId, 'payment-1');
    assert.deepEqual(get('blocked').where.metadata, { path: ['subscriptionId'], equals: 'subscription-1' });
  });

  it('returns 404 after one bounded lookup when the UUID does not exist', async () => {
    const h = harness(false);
    await assert.rejects(() => h.service.findOne('missing'), NotFoundException);
    assert.deepEqual(h.calls.map(([name]) => name), ['payment']);
  });
});

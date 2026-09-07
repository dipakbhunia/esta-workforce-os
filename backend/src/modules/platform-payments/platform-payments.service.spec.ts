import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentProviderMode, PaymentProviderOrderStatus, PaymentProviderType, PaymentPurpose, PaymentStatus, SubscriptionActivationSource, SubscriptionStatus } from '@prisma/client';
import { PlatformPaymentsService } from './platform-payments.service';

const now = new Date('2026-09-04T10:00:00Z');
function payment(id: string, status = PaymentStatus.CAPTURED) {
  return {
    id, purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, amountMinor: 99000n, currency: 'INR', status,
    provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST, providerStatus: 'captured',
    failureCode: status === PaymentStatus.FAILED ? 'SAFE_CODE' : 'OLD_CODE', safeFailureMessage: status === PaymentStatus.FAILED ? 'Safe message' : 'Old failure',
    authorizedAt: null, capturedAt: status === PaymentStatus.CAPTURED ? now : null, failedAt: status === PaymentStatus.FAILED ? now : new Date('2026-09-03T10:00:00Z'),
    capturedProviderPaymentId: status === PaymentStatus.CAPTURED ? `provider-${id}` : null, createdAt: now, updatedAt: now,
    company: { id: `company-${id}`, name: `Company ${id}` },
    subscription: { id: `subscription-${id}`, status: SubscriptionStatus.PENDING, activationSource: SubscriptionActivationSource.PAYMENT, activatedByPaymentId: null, planId: `plan-${id}`, planCodeSnapshot: 'HISTORIC_CODE', planNameSnapshot: 'Historic Plan' },
  };
}

function harness(payments: ReturnType<typeof payment>[], total = payments.length, audits: any[] = []) {
  const calls: Array<[string, any]> = [];
  const orders = payments.length ? [
    { id: 'older', paymentId: payments[0].id, sequence: 1, providerOrderId: 'order-1', status: PaymentProviderOrderStatus.PAID, providerStatus: 'paid' },
    { id: 'closed', paymentId: payments[0].id, sequence: 2, providerOrderId: 'order-2', status: PaymentProviderOrderStatus.CLOSED, providerStatus: 'closed' },
  ] : [];
  const tx = {
    payment: {
      findMany: async (args: any) => { calls.push(['payments', args]); return payments; },
      count: async (args: any) => { calls.push(['count', args]); return total; },
    },
    paymentProviderOrder: { findMany: async (args: any) => { calls.push(['orders', args]); return orders; } },
    auditLog: { findMany: async (args: any) => { calls.push(['audits', args]); return audits; } },
  };
  const prisma = { $transaction: async (callback: (client: any) => unknown) => callback(tx) };
  return { service: new PlatformPaymentsService(prisma as never), calls };
}

describe('PlatformPaymentsService', () => {
  it('returns an accurate empty page without unnecessary batch queries', async () => {
    const { service, calls } = harness([], 0);
    assert.deepEqual(await service.findAll({ page: 3, limit: 20 }), { data: [], meta: { page: 3, limit: 20, total: 0, totalPages: 0 } });
    assert.deepEqual(calls.map(([name]) => name).sort(), ['count', 'payments']);
  });

  it('uses every locked filter, half-open dates, pagination, and deterministic ordering', async () => {
    const { service, calls } = harness([payment('one'), payment('two')], 42);
    const query: any = { page: 2, limit: 2, companyId: 'company', status: PaymentStatus.CAPTURED, provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST, purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, subscriptionId: 'subscription', from: '2026-09-01T00:00:00Z', to: '2026-09-05T00:00:00+00:00' };
    const result: any = await service.findAll(query);
    const args = calls.find(([name]) => name === 'payments')![1];
    assert.equal(args.skip, 2); assert.equal(args.take, 2);
    assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.equal(args.where.companyId, 'company'); assert.equal(args.where.subscriptionId, 'subscription');
    assert.equal(args.where.createdAt.gte.toISOString(), '2026-09-01T00:00:00.000Z');
    assert.equal(args.where.createdAt.lt.toISOString(), '2026-09-05T00:00:00.000Z');
    assert.deepEqual(result.meta, { page: 2, limit: 2, total: 42, totalPages: 21 });
  });

  it('batch loads orders and audits once, selects the highest sequence including CLOSED, and maps safe snapshots', async () => {
    const { service, calls } = harness([payment('one'), payment('two')]);
    const result: any = await service.findAll({ page: 1, limit: 20 });
    assert.deepEqual(calls.map(([name]) => name).sort(), ['audits', 'count', 'orders', 'payments']);
    assert.equal(result.data[0].providerOrder.id, 'closed');
    assert.equal(result.data[1].providerOrder, null);
    assert.equal(result.data[0].amountMinor, '99000');
    assert.deepEqual(result.data[0].subscription.plan, { id: 'plan-one', code: 'HISTORIC_CODE', name: 'Historic Plan' });
    assert.equal(result.data[0].failure, null);
    const serialized = JSON.stringify(result);
    for (const forbidden of ['credentialVersionId', 'providerConfigurationId', 'idempotencyKey', 'businessReference', 'normalizedPayload', 'safeMetadata', 'keySecret']) assert.equal(serialized.includes(forbidden), false);
  });

  it('exposes only the safe current failure summary for FAILED payments', async () => {
    const { service } = harness([payment('failed', PaymentStatus.FAILED)]);
    const result: any = await service.findAll({ page: 1, limit: 20 });
    assert.deepEqual(result.data[0].failure, { code: 'SAFE_CODE', message: 'Safe message', failedAt: now.toISOString() });
  });

  it('accepts blocked evidence only when payment, company, and subscription all match', async () => {
    const row = payment('one');
    const matching = { entityId: row.id, companyId: row.company.id, metadata: { subscriptionId: row.subscription.id } };
    let result: any = await harness([row], 1, [matching]).service.findAll({ page: 1, limit: 20 });
    assert.equal(result.data[0].activation.status, 'BLOCKED');
    result = await harness([row], 1, [
      { ...matching, companyId: 'wrong' },
      { ...matching, metadata: { subscriptionId: 'wrong' } },
      { ...matching, entityId: 'wrong' },
    ]).service.findAll({ page: 1, limit: 20 });
    assert.equal(result.data[0].activation.status, 'PENDING');
  });
});

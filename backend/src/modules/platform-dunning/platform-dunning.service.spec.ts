import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BillingInterval, PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus, SubscriptionRenewalStatus, SubscriptionStatus } from '@prisma/client';
import { PlatformDunningService } from './platform-dunning.service';
import { DunningIntegrityError, DunningNotFoundError } from './platform-dunning.types';

const at = new Date('2026-09-28T12:00:00.000Z');
function row() { return { id: 'r', companyId: 'c', subscriptionId: 's', paymentId: 'p', status: SubscriptionRenewalStatus.PREPARED,
  cycleStart: at, cycleEnd: new Date('2026-10-28T12:00:00Z'), billingInterval: BillingInterval.MONTHLY, createdAt: at,
  company: { id: 'c', name: 'Company' }, subscription: { id: 's', companyId: 'c', status: SubscriptionStatus.ACTIVE, planId: 'plan', planCodeSnapshot: 'PRO', planNameSnapshot: 'Pro' },
  payment: { id: 'p', companyId: 'c', subscriptionId: 's', purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: PaymentStatus.PENDING,
    amountMinor: 9007199254740991n, currency: 'INR', provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST,
    providerStatus: null, failedAt: null, failureCode: null, safeFailureMessage: null, authorizedAt: null, capturedAt: null,
    createdAt: at, updatedAt: at, orders: [] } }; }

describe('PlatformDunningService', () => {
  it('uses one repeatable-read snapshot, same predicate, defaults, ordering and exact bigint strings', async () => {
    let findArgs: any; let countArgs: any; let options: any;
    const tx = { subscriptionRenewal: { findMany: async (args: any) => { findArgs = args; return [row()]; }, count: async (args: any) => { countArgs = args; return 1; }, findFirst: async () => null } };
    const prisma = { $transaction: async (fn: any, supplied: any) => { options = supplied; return fn(tx); } };
    const result = await new PlatformDunningService(prisma as any, () => at).findAll();
    assert.equal(options.isolationLevel, 'RepeatableRead'); assert.deepEqual(findArgs.where, countArgs.where);
    assert.deepEqual(findArgs.orderBy, [{ cycleStart: 'asc' }, { id: 'asc' }]); assert.equal(findArgs.skip, 0); assert.equal(findArgs.take, 20);
    assert.equal(result.evaluationTime, at.toISOString()); assert.equal(result.data[0].payment.amountMinor, '9007199254740991');
    assert.equal(result.data[0].latestProviderOrder, null); assert.deepEqual(result.meta, { page: 1, limit: 20, total: 1, totalPages: 1 });
  });
  it('applies ids, payment and half-open date filters with bounded pagination', async () => {
    let args: any; const prisma = { $transaction: async (fn: any) => fn({ subscriptionRenewal: { findMany: async (a: any) => { args = a; return []; }, count: async () => 0, findFirst: async () => null } }) };
    const from = new Date('2026-09-01Z'); const to = new Date('2026-10-01Z');
    await new PlatformDunningService(prisma as any, () => at).findAll({ page: 2, limit: 100, companyId: 'c', subscriptionId: 's', renewalId: 'r', paymentId: 'p', paymentStatus: PaymentStatus.FAILED, from, to });
    assert.equal(args.skip, 100); assert.equal(args.take, 100); assert.equal(args.where.payment.status, PaymentStatus.FAILED);
    assert.equal(args.where.cycleStart.gte, from); assert.equal(args.where.cycleStart.lt, to); assert.equal(args.where.cycleStart.lte, at);
  });
  it('returns a typed missing-detail condition', async () => {
    const prisma = { subscriptionRenewal: { findUnique: async () => null } };
    await assert.rejects(() => new PlatformDunningService(prisma as any, () => at).findOne('missing'), DunningNotFoundError);
  });
  it('fails instead of silently omitting due pending-subscription evidence', async () => {
    const prisma = { $transaction: async (fn: any) => fn({ subscriptionRenewal: {
      findMany: async () => [], count: async () => 0, findFirst: async () => ({ id: 'bad' }),
    } }) };
    await assert.rejects(() => new PlatformDunningService(prisma as any, () => at).findAll(), DunningIntegrityError);
  });
  it('scopes the integrity probe by paymentStatus without disabling in-scope detection', async () => {
    const failed = row(); failed.payment.status = PaymentStatus.FAILED;
    const probes: any[] = [];
    const prisma = { $transaction: async (fn: any) => fn({ subscriptionRenewal: {
      findMany: async () => [failed], count: async () => 1,
      findFirst: async (args: any) => { probes.push(args); return args.where.payment?.status === PaymentStatus.PENDING ? { id: 'bad' } : null; },
    } }) };
    const service = new PlatformDunningService(prisma as any, () => at);
    const result = await service.findAll({ paymentStatus: PaymentStatus.FAILED });
    assert.equal(result.data.length, 1); assert.equal(result.data[0].reason, 'PAYMENT_FAILED');
    assert.equal(probes[0].where.payment.status, PaymentStatus.FAILED);
    await assert.rejects(() => service.findAll({ paymentStatus: PaymentStatus.PENDING }), DunningIntegrityError);
  });
  it('aligns every request-scope filter on the integrity probe', async () => {
    let probe: any; const from = new Date('2026-09-01Z'); const to = new Date('2026-10-01Z');
    const prisma = { $transaction: async (fn: any) => fn({ subscriptionRenewal: {
      findMany: async () => [], count: async () => 0, findFirst: async (args: any) => { probe = args.where; return null; },
    } }) };
    await new PlatformDunningService(prisma as any, () => at).findAll({ companyId: 'c', subscriptionId: 's', renewalId: 'r', paymentId: 'p', paymentStatus: PaymentStatus.AUTHORIZED, from, to });
    assert.equal(probe.companyId, 'c'); assert.equal(probe.subscriptionId, 's'); assert.equal(probe.id, 'r'); assert.equal(probe.paymentId, 'p');
    assert.equal(probe.payment.status, PaymentStatus.AUTHORIZED); assert.equal(probe.cycleStart.gte, from); assert.equal(probe.cycleStart.lt, to); assert.equal(probe.cycleStart.lte, at);
  });
  it('rejects unsafe pagination, date ranges and non-active payment filters', async () => {
    const service = new PlatformDunningService({} as any, () => at);
    for (const input of [{ page: 0 }, { page: 1.5 }, { limit: 0 }, { limit: 101 }, { paymentStatus: PaymentStatus.CAPTURED },
      { from: new Date('2026-09-01Z') }, { to: new Date('2026-10-01Z') },
      { from: new Date('2026-10-01Z'), to: new Date('2026-10-01Z') }, { from: new Date('2026-11-01Z'), to: new Date('2026-10-01Z') }]) {
      await assert.rejects(() => service.findAll(input as any), DunningIntegrityError);
    }
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SubscriptionStatus } from '@prisma/client';
import { SubscriptionExpirationService } from './subscription-expiration.service';
import { isCurrentSubscriptionAuthority, isSubscriptionPeriodDue } from './subscription-period-validity.util';

const now = new Date('2026-08-31T12:00:00.000Z');

function harness(status: SubscriptionStatus, currentPeriodEnd: Date | null) {
  let row = { id: 'subscription-1', companyId: 'company-1', status, currentPeriodEnd, endedAt: null as Date | null };
  const audits: Array<Record<string, unknown>> = [];
  const tx = {
    companySubscription: {
      findUnique: async () => row,
      update: async ({ data }: { data: { status: SubscriptionStatus; endedAt: Date } }) => (row = { ...row, ...data }),
    },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
  };
  const prisma = {
    companySubscription: { findUnique: async () => ({ companyId: row.companyId }), findMany: async () => [] },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const service = new SubscriptionExpirationService(prisma as never, { lockCompany: async () => undefined } as never);
  return { service, row: () => row, audits };
}

describe('SubscriptionExpirationService', () => {
  it('expires due ACTIVE and SUSPENDED subscriptions at their persisted boundary', async () => {
    for (const status of [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]) {
      const boundary = new Date(now);
      const h = harness(status, boundary);
      assert.equal((await h.service.expire('subscription-1', { now, source: 'SCHEDULER' })).outcome, 'EXPIRED');
      assert.equal(h.row().status, SubscriptionStatus.EXPIRED);
      assert.equal(h.row().endedAt?.toISOString(), boundary.toISOString());
      assert.equal(h.audits.length, 1);
    }
  });

  it('leaves future, unbounded, and terminal subscriptions unchanged', async () => {
    const cases: Array<[SubscriptionStatus, Date | null, string]> = [
      [SubscriptionStatus.ACTIVE, new Date(now.getTime() + 1), 'NOT_DUE'],
      [SubscriptionStatus.SUSPENDED, null, 'NOT_DUE'],
      [SubscriptionStatus.CANCELLED, new Date(now), 'NOT_ELIGIBLE'],
      [SubscriptionStatus.SUPERSEDED, new Date(now), 'NOT_ELIGIBLE'],
      [SubscriptionStatus.EXPIRED, new Date(now), 'ALREADY_EXPIRED'],
    ];
    for (const [status, end, outcome] of cases) {
      const h = harness(status, end);
      assert.equal((await h.service.expire('subscription-1', { now, source: 'SCHEDULER' })).outcome, outcome);
      assert.equal(h.audits.length, 0);
    }
  });

  it('records bounded source metadata once and is idempotent', async () => {
    const h = harness(SubscriptionStatus.ACTIVE, new Date(now));
    await h.service.expire('subscription-1', { now, source: 'MANUAL', actorUserId: 'actor-1' });
    await h.service.expire('subscription-1', { now, source: 'MANUAL', actorUserId: 'actor-1' });
    assert.equal(h.audits.length, 1);
    assert.deepEqual(h.audits[0]?.metadata, {
      subscriptionId: 'subscription-1', from: 'ACTIVE', to: 'EXPIRED',
      currentPeriodEnd: now.toISOString(), expirationSource: 'MANUAL',
    });
  });

  it('centralizes equality and unbounded authority semantics', () => {
    assert.equal(isSubscriptionPeriodDue({ currentPeriodEnd: now }, now), true);
    assert.equal(isSubscriptionPeriodDue({ currentPeriodEnd: null }, now), false);
    assert.equal(isCurrentSubscriptionAuthority({ status: SubscriptionStatus.ACTIVE, currentPeriodEnd: now }, now), false);
    assert.equal(isCurrentSubscriptionAuthority({ status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null }, now), true);
  });

  it('clamps, orders, and isolates recovery candidates', async () => {
    const calls: string[] = [];
    let query: Record<string, unknown> | undefined;
    const service = new SubscriptionExpirationService({ companySubscription: { findMany: async (args: Record<string, unknown>) => { query = args; return [{ id: 'a' }, { id: 'bad' }, { id: 'b' }]; } } } as never, {} as never);
    (service as unknown as { expire(id: string): Promise<{ outcome: 'EXPIRED' }> }).expire = async (id: string) => { calls.push(id); if (id === 'bad') throw new Error('failed'); return { outcome: 'EXPIRED' }; };
    assert.equal(await service.recoverDue(1000, now), 2);
    assert.deepEqual(calls, ['a', 'bad', 'b']);
    assert.equal(query?.take, 100);
    assert.deepEqual(query?.orderBy, [{ currentPeriodEnd: 'asc' }, { id: 'asc' }]);
  });
});

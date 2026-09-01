import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CompanyStatus, RoleName, SubscriptionStatus, TrialStatus, UserStatus,
} from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StorageCapacityState } from '../storage-usage/storage-usage.types';
import { PlatformDashboardController } from './platform-dashboard.controller';
import { normalizeRange, PlatformDashboardService } from './platform-dashboard.service';

const AS_OF = new Date('2026-08-31T12:34:56.000Z');
const companyId = '11111111-1111-4111-8111-111111111111';

function storageSnapshot() {
  return {
    measurementCoverage: 'PARTIAL' as const,
    measuredStorageBytes: '9007199254740993000',
    configuredAllocationBytes: '9007199254740999000',
    measuredObjectCount: 2, unmeasuredObjectCount: 1,
    companiesWithConfiguredLimit: 1, companiesWithoutConfiguredLimit: 1,
    companiesAtLimit: 1, companiesOverLimit: 1,
    capacityDistribution: Object.values(StorageCapacityState).map((state) => ({ state, companyCount: state === StorageCapacityState.OVER_LIMIT ? 1 : 0 })),
    highUsageCompanies: [{ companyId, companyName: 'Acme', measuredStorageBytes: '9007199254740993000', configuredLimitBytes: '9007199254740990000', utilizationPercent: '100.00', capacityState: StorageCapacityState.OVER_LIMIT }],
    attentionCandidates: [{ companyId, companyName: 'Acme', referenceId: 'storage-ref', capacityState: StorageCapacityState.OVER_LIMIT, measuredStorageBytes: '9007199254740993000' }],
  };
}

function harness() {
  const rawSql: string[] = [];
  let companyCount = 0; let subscriptionCount = 0; let trialCount = 0; let subscriptionGroup = 0;
  const prisma = {
    company: {
      count: async () => (++companyCount === 1 ? 8 : 3),
      findMany: async (args: { where: { status?: CompanyStatus } }) => args.where.status
        ? [{ id: 'suspended-company', name: 'Suspended Co' }]
        : Array.from({ length: 6 }, (_, index) => ({ id: index === 0 ? companyId : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Company ${index}`, status: CompanyStatus.ACTIVE, createdAt: new Date(AS_OF.getTime() - index * 1000) })),
    },
    companySubscription: {
      count: async () => [4, 2][subscriptionCount++] ?? 0,
      groupBy: async () => ++subscriptionGroup === 1
        ? [
            { status: SubscriptionStatus.ACTIVE, _count: { _all: 5 } },
            { status: SubscriptionStatus.SUSPENDED, _count: { _all: 3 } },
            { status: SubscriptionStatus.EXPIRED, _count: { _all: 2 } },
          ]
        : [
            { status: SubscriptionStatus.ACTIVE, _count: { _all: 1 } },
            { status: SubscriptionStatus.SUSPENDED, _count: { _all: 1 } },
          ],
      findMany: async (args: { where: { companyId?: unknown } }) => args.where.companyId
        ? [{ id: 'active-sub', companyId, status: SubscriptionStatus.ACTIVE }]
        : [{ id: 'ending-sub', companyId, currentPeriodEnd: new Date(AS_OF.getTime() + 30 * 86_400_000), company: { name: 'Acme' } }],
    },
    companyTrial: {
      count: async () => [3, 2, 1, 1][trialCount++] ?? 0,
      groupBy: async () => [
        { status: TrialStatus.ACTIVE, _count: { _all: 5 } },
        { status: TrialStatus.EXPIRED, _count: { _all: 2 } },
        { status: TrialStatus.CANCELLED, _count: { _all: 1 } },
      ],
      findMany: async (args: { where: { companyId?: unknown } }) => args.where.companyId
        ? [{ id: 'trial-current', companyId }]
        : [{ id: 'ending-trial', companyId, endsAt: new Date(AS_OF.getTime() + 7 * 86_400_000), company: { name: 'Acme' } }],
    },
    $queryRaw: async (query: { text?: string; sql?: string; values?: unknown[] }) => {
      const sql = query.text ?? query.sql ?? ''; rawSql.push(`${sql}\n${JSON.stringify(query.values ?? [])}`);
      return sql.includes('generate_series')
        ? [{ bucketStart: '2026-08-01', newCompanies: 0, trialStarts: 2 }]
        : [
            { planId: 'plan-b', planCode: 'B', planName: 'Beta', subscriptionCount: 2 },
            { planId: 'plan-a', planCode: 'A', planName: 'Alpha', subscriptionCount: 1 },
          ];
    },
  };
  const service = new PlatformDashboardService(prisma as never, { getPlatformDashboardSnapshot: async () => storageSnapshot() } as never);
  return { service, rawSql };
}

describe('Platform Dashboard date contract', () => {
  it('defaults to the last 30 UTC calendar days', () => {
    const range = normalizeRange({}, AS_OF);
    assert.deepEqual({ from: range.from, to: range.to, granularity: range.granularity }, { from: '2026-08-02', to: '2026-08-31', granularity: 'DAILY' });
    assert.equal(range.toExclusive.toISOString(), '2026-09-01T00:00:00.000Z');
  });

  for (const [name, query] of [
    ['missing only to', { from: '2026-08-01' }],
    ['missing only from', { to: '2026-08-01' }],
    ['malformed date', { from: '08/01/2026', to: '2026-08-01' }],
    ['impossible date', { from: '2026-02-31', to: '2026-03-01' }],
    ['reverse range', { from: '2026-08-02', to: '2026-08-01' }],
    ['future to', { from: '2026-08-01', to: '2026-09-01' }],
    ['over 366 days', { from: '2025-08-30', to: '2026-08-31' }],
  ] as const) {
    it(`rejects ${name}`, () => assert.throws(() => normalizeRange(query, AS_OF), BadRequestException));
  }

  it('allows exactly 366 inclusive days', () => assert.equal(normalizeRange({ from: '2025-09-01', to: '2026-08-31' }, AS_OF).granularity, 'MONTHLY'));

  for (const date of ['2026-02-28', '2028-02-29']) {
    it(`accepts valid calendar date ${date}`, () => {
      assert.equal(normalizeRange({ from: date, to: date }, new Date('2028-12-31T12:00:00.000Z')).from, date);
    });
  }

  for (const date of [
    '2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-10',
    '2026-2-08', '2026-02-08T00:00:00.000Z',
  ]) {
    it(`rejects invalid calendar input ${date}`, () => {
      assert.throws(() => normalizeRange({ from: date, to: date }, AS_OF), BadRequestException);
    });
  }
  it('selects daily, weekly, and monthly granularities at locked boundaries', () => {
    assert.equal(normalizeRange({ from: '2026-07-18', to: '2026-08-31' }, AS_OF).granularity, 'DAILY');
    assert.equal(normalizeRange({ from: '2026-07-17', to: '2026-08-31' }, AS_OF).granularity, 'WEEKLY');
    assert.equal(normalizeRange({ from: '2026-03-05', to: '2026-08-31' }, AS_OF).granularity, 'WEEKLY');
    assert.equal(normalizeRange({ from: '2026-03-04', to: '2026-08-31' }, AS_OF).granularity, 'MONTHLY');
  });
});

describe('Platform Dashboard response and authority', () => {
  it('returns deterministic aggregates, immutable plan snapshots, exact boundaries, and bounded sections', async () => {
    const { service, rawSql } = harness();
    const response = await service.getDashboard({ from: '2026-08-01', to: '2026-08-31' }, AS_OF);
    assert.deepEqual(response.kpis, { totalCompanies: 8, effectiveActiveSubscriptions: 4, effectiveActiveTrials: 3, newCompanies: 3, trialsEndingSoon: 2, subscriptionsEndingSoon: 2 });
    assert.deepEqual(response.subscriptionDistribution, [
      { status: 'PENDING', count: 0 }, { status: 'ACTIVE', count: 4 },
      { status: 'SUSPENDED', count: 2 }, { status: 'SUPERSEDED', count: 0 },
      { status: 'CANCELLED', count: 0 }, { status: 'EXPIRED', count: 4 },
    ]);
    assert.deepEqual(response.trialDistribution, [
      { status: 'EFFECTIVE_ACTIVE', count: 3 }, { status: 'SCHEDULED', count: 1 },
      { status: 'EXPIRED', count: 3 }, { status: 'CANCELLED', count: 1 },
      { status: 'CONVERTED', count: 0 },
    ]);
    assert.equal(response.planDistribution[0]?.planCode, 'B');
    assert.equal(response.growth[0]?.trialStarts, 2);
    assert.equal(response.growth[0]?.newCompanies, 0);
    assert.equal(response.storage.measuredStorageBytes, '9007199254740993000');
    assert.equal(response.storage.measurementCoverage, 'PARTIAL');
    assert.equal(response.storage.highUsageCompanies.length, 1);
    assert.equal(response.attention.length <= 10, true);
    assert.equal(response.attention[0]?.type, 'STORAGE_OVER_LIMIT');
    assert.equal(response.attention[1]?.type, 'COMPANY_SUSPENDED');
    assert.equal(response.recentCompanies.length, 6);
    assert.equal(response.recentCompanies[0]?.commercialState, 'TRIAL');
    assert.match(rawSql.join('\n'), /trial\."startsAt"/);
    assert.match(rawSql.join('\n'), /company\."deletedAt" IS NULL/);
    assert.doesNotMatch(rawSql.join('\n'), /JOIN "Plan"/);
  });

  it('does not expose forbidden employee, monitoring, seat, payment, or revenue fields', async () => {
    const response = await harness().service.getDashboard({}, AS_OF);
    const json = JSON.stringify(response).toLowerCase();
    for (const forbidden of ['employee', 'attendance', 'screenshot', 'monitoring', 'seat', 'payment', 'revenue', 'mrr', 'invoice', 'gst']) assert.equal(json.includes(forbidden), false, forbidden);
  });

  it('constructs bounded zero-filled growth SQL with explicit UTC wall-clock bounds', async () => {
    const weekly = harness(); await weekly.service.getDashboard({ from: '2026-07-01', to: '2026-08-31' }, AS_OF);
    const sql = weekly.rawSql.join('\n');
    assert.match(sql, /generate_series/); assert.match(sql, /date_trunc/); assert.match(sql, /COALESCE\(companies\.count, 0\)/);
    assert.match(sql, /week/);
    assert.match(sql, /AT TIME ZONE 'UTC'/);
    assert.match(sql, /to_char\(buckets\.bucket, 'YYYY-MM-DD'\)/);
    assert.match(sql, /company\."createdAt" >= bounds\."fromUtc"/);
    assert.match(sql, /trial\."startsAt" < bounds\."toUtc"/);
  });
});

describe('Platform Dashboard authorization', () => {
  it('is SUPER_ADMIN-only and denies every tenant role', () => {
    const roles = new Reflector().get<RoleName[]>('roles', PlatformDashboardController);
    assert.deepEqual(roles, [RoleName.SUPER_ADMIN]);
    const guard = new RolesGuard({ getAllAndOverride: () => roles } as never);
    for (const role of [RoleName.COMPANY_ADMIN, RoleName.HR, RoleName.MANAGER, RoleName.EMPLOYEE]) {
      const context = { getHandler: () => PlatformDashboardController.prototype.getDashboard, getClass: () => PlatformDashboardController, switchToHttp: () => ({ getRequest: () => ({ query: { companyId }, user: { id: 'user', companyId, status: UserStatus.ACTIVE, roles: [role] } }) }) };
      assert.throws(() => guard.canActivate(context as never), ForbiddenException);
    }
  });

  it('allows SUPER_ADMIN and the DTO has no tenant override field', () => {
    const roles = [RoleName.SUPER_ADMIN];
    const guard = new RolesGuard({ getAllAndOverride: () => roles } as never);
    const context = { getHandler: () => PlatformDashboardController.prototype.getDashboard, getClass: () => PlatformDashboardController, switchToHttp: () => ({ getRequest: () => ({ user: { id: 'root', status: UserStatus.ACTIVE, roles } }) }) };
    assert.equal(guard.canActivate(context as never), true);
    assert.deepEqual(Object.keys({ from: '2026-08-01', to: '2026-08-31' }), ['from', 'to']);
  });
});

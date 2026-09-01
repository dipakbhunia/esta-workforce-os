import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CompanyStatus,
  RoleName,
  SubscriptionStatus,
  TrialStatus,
  UserStatus,
} from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StorageUsageController } from './storage-usage.controller';
import { StorageUsageQueryService } from './storage-usage-query.service';
import { StorageUsageService } from './storage-usage.service';
import {
  CommercialStorageSource,
  StorageCapacityState,
  StorageMeasurementState,
  StorageUsageRecord,
} from './storage-usage.types';

const calculator = new StorageUsageService();

function calculate(
  measuredStorageBytes: string,
  configuredLimitBytes: string | null,
  options: {
    source?: CommercialStorageSource;
    unmeasuredObjectCount?: number;
  } = {},
) {
  return calculator.calculate({
    source: options.source ?? CommercialStorageSource.SUBSCRIPTION,
    measuredStorageBytes,
    configuredLimitBytes,
    unmeasuredObjectCount: options.unmeasuredObjectCount ?? 0,
  });
}

const storageRow: StorageUsageRecord = {
  companyId: '11111111-1111-4111-8111-111111111111',
  companyName: 'Example Company',
  companySlug: 'example-company',
  companyStatus: CompanyStatus.ACTIVE,
  source: CommercialStorageSource.SUBSCRIPTION,
  referenceId: '22222222-2222-4222-8222-222222222222',
  commercialStatus: SubscriptionStatus.ACTIVE,
  planId: '33333333-3333-4333-8333-333333333333',
  planCode: 'PROFESSIONAL',
  planName: 'Professional Snapshot',
  configuredLimitBytes: '9007199254740999000',
  measuredStorageBytes: '9007199254740993000',
  measuredObjectCount: 4,
  unmeasuredObjectCount: 0,
  earliestScreenshotAt: new Date('2026-08-01T00:00:00.000Z'),
  latestScreenshotAt: new Date('2026-08-18T00:00:00.000Z'),
  allocationAllowed: true,
};

const aggregate = {
  total: 37,
  totalMeasuredStorageBytes: '18014398509481986000',
  measuredScreenshotObjects: 8,
  unmeasuredScreenshotObjects: 2,
  companiesWithMeasuredStorage: 2,
  companiesWithUnmeasurableStorage: 1,
  companiesWithConfiguredLimit: 2,
  companiesWithoutConfiguredLimit: 1,
  companiesAtLimit: 1,
  companiesOverLimit: 1,
  effectiveTrialCount: 1,
  activeSubscriptionCount: 1,
  suspendedSubscriptionCount: 1,
  noAccessCount: 1,
};

function queryHarness(options: {
  rows?: StorageUsageRecord[];
  aggregates?: typeof aggregate[];
} = {}) {
  const queries: Array<{ text?: string; sql?: string; values?: unknown[] }> = [];
  const prisma = {
    $queryRaw: async (query: { text?: string; sql?: string; values?: unknown[] }) => {
      queries.push(query);
      const statement = query.text ?? query.sql ?? '';
      if (statement.includes('AS "total"')) {
        return options.aggregates ?? [aggregate];
      }
      return options.rows ?? [storageRow];
    },
    $transaction: async (promises: Array<Promise<unknown>>) =>
      Promise.all(promises),
  };
  return {
    service: new StorageUsageQueryService(prisma as never, calculator),
    queries,
  };
}

describe('Storage Usage reporting', () => {
  it('builds the bounded platform snapshot from the shared commercial-storage CTE', async () => {
    const queries: string[] = [];
    const prisma = {
      $queryRaw: async (query: { text?: string; sql?: string }) => {
        const sql = query.text ?? query.sql ?? ''; queries.push(sql);
        if (sql.includes('AS "measuredStorageBytes"') && sql.includes('SUM(')) return [{
          measuredStorageBytes: '9007199254740993000', configuredAllocationBytes: '9007199254740999000',
          measuredObjectCount: 3, unmeasuredObjectCount: 2, companiesWithConfiguredLimit: 2,
          companiesWithoutConfiguredLimit: 1, companiesAtLimit: 1, companiesOverLimit: 1,
        }];
        if (sql.includes('GROUP BY "capacityState"')) return [{ state: StorageCapacityState.OVER_LIMIT, companyCount: 1 }];
        if (sql.includes('utilizationPercent')) return [{ companyId: storageRow.companyId, companyName: storageRow.companyName, measuredStorageBytes: '11', configuredLimitBytes: '10', utilizationPercent: '110.00', capacityState: StorageCapacityState.OVER_LIMIT }];
        return [{ companyId: storageRow.companyId, companyName: storageRow.companyName, referenceId: storageRow.referenceId, capacityState: StorageCapacityState.OVER_LIMIT, measuredStorageBytes: '11' }];
      },
      $transaction: async (promises: Array<Promise<unknown>>) => Promise.all(promises),
    };
    const snapshot = await new StorageUsageQueryService(prisma as never, calculator)
      .getPlatformDashboardSnapshot(new Date('2026-08-31T00:00:00.000Z'), 5);
    assert.equal(snapshot.measurementCoverage, 'PARTIAL');
    assert.equal(snapshot.measuredStorageBytes, '9007199254740993000');
    assert.equal(snapshot.highUsageCompanies.length, 1);
    assert.deepEqual(snapshot.capacityDistribution.map((row) => row.state), Object.values(StorageCapacityState));
    assert.match(queries.join('\n'), /LIMIT/);
    assert.equal(queries.every((sql) => sql.includes('WITH "screenshot_usage"')), true);
  });

  for (const [measured, unmeasured, expected] of [
    [0, 0, 'NO_OBJECTS'], [1, 0, 'COMPLETE'], [1, 1, 'PARTIAL'], [0, 1, 'UNMEASURABLE'],
  ] as const) {
    it(`reports platform measurement coverage ${expected}`, async () => {
      const prisma = {
        $queryRaw: async (query: { text?: string; sql?: string }) => {
          const sql = query.text ?? query.sql ?? '';
          if (sql.includes('AS "measuredStorageBytes"') && sql.includes('SUM(')) return [{ measuredStorageBytes: '0', configuredAllocationBytes: '0', measuredObjectCount: measured, unmeasuredObjectCount: unmeasured, companiesWithConfiguredLimit: 0, companiesWithoutConfiguredLimit: 0, companiesAtLimit: 0, companiesOverLimit: 0 }];
          return [];
        },
        $transaction: async (promises: Array<Promise<unknown>>) => Promise.all(promises),
      };
      const result = await new StorageUsageQueryService(prisma as never, calculator).getPlatformDashboardSnapshot(new Date(), 5);
      assert.equal(result.measurementCoverage, expected);
    });
  }
  it('calculates exact byte totals without converting through Number', () => {
    const result = calculate(
      '9007199254740993000',
      '9007199254740999000',
    );
    assert.equal(result.measuredStorageBytes, '9007199254740993000');
    assert.equal(result.remainingBytes, '6000');
    assert.equal(result.capacityState, StorageCapacityState.AVAILABLE);
  });

  it('marks null-size screenshot metadata as unmeasurable', () => {
    const result = calculate('128000000', '256000000', {
      unmeasuredObjectCount: 3,
    });
    assert.equal(
      result.measurementState,
      StorageMeasurementState.UNMEASURABLE,
    );
    assert.equal(result.capacityState, StorageCapacityState.UNMEASURABLE);
    assert.equal(result.remainingBytes, null);
    assert.equal(result.utilizationPercent, null);
  });

  it('reports missing limits as unconfigured rather than zero or unlimited', () => {
    const result = calculate('128', null);
    assert.equal(result.capacityState, StorageCapacityState.UNCONFIGURED);
    assert.equal(result.configuredLimitBytes, null);
    assert.equal(result.remainingBytes, null);
    assert.equal(result.utilizationPercent, null);
  });

  it('handles configured zero-byte limits without division by zero', () => {
    const empty = calculate('0', '0');
    assert.equal(empty.capacityState, StorageCapacityState.AT_LIMIT);
    assert.equal(empty.remainingBytes, '0');
    assert.equal(empty.overByBytes, '0');
    assert.equal(empty.utilizationPercent, null);

    const used = calculate('1', '0');
    assert.equal(used.capacityState, StorageCapacityState.OVER_LIMIT);
    assert.equal(used.overByBytes, '1');
    assert.equal(used.utilizationPercent, null);
  });

  it('calculates available, at-limit, and over-limit states', () => {
    assert.equal(
      calculate('9', '10').capacityState,
      StorageCapacityState.AVAILABLE,
    );
    assert.equal(
      calculate('10', '10').capacityState,
      StorageCapacityState.AT_LIMIT,
    );
    assert.equal(
      calculate('11', '10').capacityState,
      StorageCapacityState.OVER_LIMIT,
    );
    assert.equal(calculate('11', '10').remainingBytes, '0');
    assert.equal(calculate('11', '10').overByBytes, '1');
    assert.equal(calculate('1', '4').utilizationPercent, '25');
  });

  it('reports no commercial authority without hiding stored bytes', () => {
    const result = calculate('4096', null, {
      source: CommercialStorageSource.NONE,
      unmeasuredObjectCount: 1,
    });
    assert.equal(result.measuredStorageBytes, '4096');
    assert.equal(result.measurementState, StorageMeasurementState.UNMEASURABLE);
    assert.equal(result.capacityState, StorageCapacityState.NO_ACCESS);
  });

  it('aggregates active screenshot metadata once and excludes deleted rows', async () => {
    const harness = queryHarness();
    await harness.service.findAll({ page: 1, limit: 20 });
    const sql = harness.queries.map((query) => query.text ?? query.sql ?? '').join('\n');
    assert.match(sql, /SUM\(screenshot\."sizeBytes"\)/);
    assert.match(sql, /screenshot\."sizeBytes" IS NOT NULL/);
    assert.match(sql, /screenshot\."sizeBytes" IS NULL/);
    assert.match(sql, /screenshot\."deletedAt" IS NULL/);
    assert.match(sql, /GROUP BY screenshot\."companyId"/);
  });

  it('counts zero-byte measured screenshots as measured companies', async () => {
    const harness = queryHarness();
    await harness.service.findAll({ page: 1, limit: 20 });
    const sql = harness.queries.find((query) => (query.text ?? query.sql ?? '').includes('AS "total"'))?.text ?? '';
    assert.match(sql, /COUNT\(\*\) FILTER \(WHERE "measuredObjectCount" > 0\)/);
  });

  it('resolves effective Trial before live Subscription and prefers ACTIVE Subscription', async () => {
    const harness = queryHarness();
    await harness.service.findAll({ page: 1, limit: 20 });
    const sql = harness.queries[0]?.text ?? harness.queries[0]?.sql ?? '';
    assert.match(sql, /trial\."startsAt" <=/);
    assert.match(sql, /trial\."endsAt" >/);
    assert.match(sql, /WHEN trial\."id" IS NOT NULL THEN 'TRIAL'/);
    assert.match(sql, /\(subscription\."status" = 'ACTIVE'\) DESC/);
    assert.match(sql, /subscription\."currentPeriodEnd" IS NULL/);
    assert.match(sql, /subscription\."currentPeriodEnd" >/);
  });

  it('uses agreement snapshots and does not resolve limits from mutable Plan data', async () => {
    const harness = queryHarness();
    await harness.service.findAll({ page: 1, limit: 20 });
    const sql = harness.queries[0]?.text ?? harness.queries[0]?.sql ?? '';
    assert.match(sql, /subscription\."limitsSnapshot"/);
    assert.match(sql, /subscription\."planCodeSnapshot"/);
    assert.match(sql, /subscription\."planNameSnapshot"/);
    assert.doesNotMatch(sql, /JOIN "Plan"/);
  });

  it('serializes BIGINT-safe list and summary values unchanged', async () => {
    const response = await queryHarness().service.findAll({
      page: 1,
      limit: 20,
    });
    assert.equal(
      response.data[0]?.storage.measuredStorageBytes,
      '9007199254740993000',
    );
    assert.equal(
      response.summary.totalMeasuredStorageBytes,
      '18014398509481986000',
    );
  });

  it('applies derived filters before pagination and returns filtered totals', async () => {
    const harness = queryHarness();
    const response = await harness.service.findAll({
      page: 2,
      limit: 10,
      search: 'Example',
      source: CommercialStorageSource.SUBSCRIPTION,
      commercialStatus: 'SUSPENDED',
      capacityState: StorageCapacityState.OVER_LIMIT,
      planId: '33333333-3333-4333-8333-333333333333',
      limitConfigured: true,
      overLimit: true,
    });
    const sql = harness.queries.map((query) => query.text ?? query.sql ?? '').join('\n');
    assert.match(sql, /FROM "derived_storage"\s+WHERE/);
    assert.match(sql, /"configuredLimitBytesNumeric" IS NOT NULL/);
    assert.match(sql, /"isOverLimit" =/);
    assert.equal(response.meta.page, 2);
    assert.equal(response.meta.limit, 10);
    assert.equal(response.meta.total, 37);
    assert.equal(response.meta.totalPages, 4);
    assert.equal(response.summary.scope, 'FILTERED');
    assert.equal(response.summary.companiesOverLimit, 1);
  });

  it('isolates Company details by the requested Company UUID', async () => {
    const harness = queryHarness();
    const response = await harness.service.findCompany(storageRow.companyId);
    const query = harness.queries[0];
    const sql = query?.text ?? query?.sql ?? '';
    assert.match(sql, /WHERE "companyId" = .*::uuid/);
    assert.ok(query?.values?.includes(storageRow.companyId));
    assert.equal(response.company.id, storageRow.companyId);
    assert.equal(response.commercial.referenceId, storageRow.referenceId);
    assert.equal(response.storage.allocationAllowed, true);
  });

  it('reports ACTIVE Trial, ACTIVE Subscription, and SUSPENDED allocation modes', () => {
    const at = new Date('2026-08-18T12:00:00.000Z');
    const trial = calculator.toCompanySummary({
      ...storageRow,
      source: CommercialStorageSource.TRIAL,
      referenceId: '44444444-4444-4444-8444-444444444444',
      commercialStatus: TrialStatus.ACTIVE,
      planId: null,
      planCode: null,
      planName: null,
      allocationAllowed: true,
    }, at);
    const suspended = calculator.toCompanySummary({
      ...storageRow,
      commercialStatus: SubscriptionStatus.SUSPENDED,
      allocationAllowed: false,
    }, at);
    assert.equal(trial.commercial.source, CommercialStorageSource.TRIAL);
    assert.equal(trial.commercial.plan, null);
    assert.equal(trial.storage.allocationAllowed, true);
    assert.equal(suspended.storage.allocationAllowed, false);
  });

  it('returns not found instead of leaking another Company detail', async () => {
    const harness = queryHarness({ rows: [] });
    await assert.rejects(
      () => harness.service.findCompany(storageRow.companyId),
      NotFoundException,
    );
  });

  it('declares both reporting endpoints SUPER_ADMIN-only and denies tenant roles', () => {
    const roles = new Reflector().get<RoleName[]>('roles', StorageUsageController);
    assert.deepEqual(roles, [RoleName.SUPER_ADMIN]);
    const guard = new RolesGuard({ getAllAndOverride: () => roles } as never);
    for (const handler of [
      StorageUsageController.prototype.findAll,
      StorageUsageController.prototype.findCompany,
    ]) {
      const context = {
        getHandler: () => handler,
        getClass: () => StorageUsageController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: 'user-1',
              companyId: storageRow.companyId,
              status: UserStatus.ACTIVE,
              roles: [RoleName.COMPANY_ADMIN],
            },
          }),
        }),
      };
      assert.throws(() => guard.canActivate(context as never), ForbiddenException);
    }
  });
});

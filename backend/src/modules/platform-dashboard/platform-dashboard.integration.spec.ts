import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { StorageCapacityState } from '../storage-usage/storage-usage.types';
import { PlatformDashboardService } from './platform-dashboard.service';

const enabled = process.env.RUN_PLATFORM_DASHBOARD_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
const rollback = new Error('ROLLBACK_PLATFORM_DASHBOARD_UTC_PROBE');
const emptyStorage = {
  measurementCoverage: 'NO_OBJECTS' as const,
  measuredStorageBytes: '0', configuredAllocationBytes: '0',
  measuredObjectCount: 0, unmeasuredObjectCount: 0,
  companiesWithConfiguredLimit: 0, companiesWithoutConfiguredLimit: 0,
  companiesAtLimit: 0, companiesOverLimit: 0,
  capacityDistribution: Object.values(StorageCapacityState).map((state) => ({ state, companyCount: 0 })),
  highUsageCompanies: [], attentionCandidates: [],
};

describeDb('Platform Dashboard PostgreSQL UTC growth', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('keeps DAILY buckets and exact range boundaries invariant in Asia/Kolkata', async () => {
    const response = await runInNonUtcSession(async (tx) => {
      await createGrowthEvent(tx, new Date('2040-07-31T23:59:59.999Z'), 'daily-before');
      await createGrowthEvent(tx, new Date('2040-08-01T00:00:00.000Z'), 'daily-from');
      await createGrowthEvent(tx, new Date('2040-08-03T23:59:59.999Z'), 'daily-last');
      await createGrowthEvent(tx, new Date('2040-08-04T00:00:00.000Z'), 'daily-after');
      return dashboard(tx).getDashboard({ from: '2040-08-01', to: '2040-08-03' }, new Date('2040-12-31T12:00:00.000Z'));
    });
    assert.deepEqual(response.growth, [
      { bucketStart: '2040-08-01', newCompanies: 1, trialStarts: 1 },
      { bucketStart: '2040-08-02', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-08-03', newCompanies: 1, trialStarts: 1 },
    ]);
  });

  it('keeps WEEKLY Monday buckets, range filtering, and zero filling invariant in Asia/Kolkata', async () => {
    const response = await runInNonUtcSession(async (tx) => {
      await createGrowthEvent(tx, new Date('2040-08-04T23:59:59.999Z'), 'weekly-before');
      await createGrowthEvent(tx, new Date('2040-08-05T00:00:00.000Z'), 'weekly-from');
      await createGrowthEvent(tx, new Date('2040-09-19T23:59:59.999Z'), 'weekly-last');
      await createGrowthEvent(tx, new Date('2040-09-20T00:00:00.000Z'), 'weekly-after');
      return dashboard(tx).getDashboard({ from: '2040-08-05', to: '2040-09-19' }, new Date('2040-12-31T12:00:00.000Z'));
    });
    assert.equal(response.range.granularity, 'WEEKLY');
    assert.deepEqual(response.growth, [
      { bucketStart: '2040-07-30', newCompanies: 1, trialStarts: 1 },
      { bucketStart: '2040-08-06', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-08-13', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-08-20', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-08-27', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-09-03', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-09-10', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-09-17', newCompanies: 1, trialStarts: 1 },
    ]);
  });

  it('keeps MONTHLY UTC calendar buckets, range filtering, and zero filling invariant in Asia/Kolkata', async () => {
    const response = await runInNonUtcSession(async (tx) => {
      await createGrowthEvent(tx, new Date('2040-01-19T23:59:59.999Z'), 'monthly-before');
      await createGrowthEvent(tx, new Date('2040-01-20T00:00:00.000Z'), 'monthly-from');
      await createGrowthEvent(tx, new Date('2040-03-01T00:00:00.000Z'), 'monthly-march');
      await createGrowthEvent(tx, new Date('2040-07-18T23:59:59.999Z'), 'monthly-last');
      await createGrowthEvent(tx, new Date('2040-07-19T00:00:00.000Z'), 'monthly-after');
      return dashboard(tx).getDashboard({ from: '2040-01-20', to: '2040-07-18' }, new Date('2040-12-31T12:00:00.000Z'));
    });
    assert.equal(response.range.granularity, 'MONTHLY');
    assert.deepEqual(response.growth, [
      { bucketStart: '2040-01-01', newCompanies: 1, trialStarts: 1 },
      { bucketStart: '2040-02-01', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-03-01', newCompanies: 1, trialStarts: 1 },
      { bucketStart: '2040-04-01', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-05-01', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-06-01', newCompanies: 0, trialStarts: 0 },
      { bucketStart: '2040-07-01', newCompanies: 1, trialStarts: 1 },
    ]);
  });
});

function dashboard(tx: Prisma.TransactionClient) {
  return new PlatformDashboardService(tx as never, { getPlatformDashboardSnapshot: async () => emptyStorage } as never);
}

async function runInNonUtcSession<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Asia/Kolkata'`);
    const timezone = await tx.$queryRawUnsafe<Array<{ TimeZone: string }>>('SHOW TIME ZONE');
    assert.equal(timezone[0]?.TimeZone, 'Asia/Kolkata');
    result = await work(tx);
    throw rollback;
  }, { maxWait: 5_000, timeout: 30_000 }), (error: unknown) => error === rollback);
  assert.ok(result);
  return result;
}

async function createGrowthEvent(tx: Prisma.TransactionClient, timestamp: Date, label: string) {
  const company = await tx.company.create({
    data: { name: `UTC ${label}`, slug: `utc-${label}-${randomUUID()}`, createdAt: timestamp },
    select: { id: true },
  });
  await tx.companyTrial.create({
    data: { companyId: company.id, startsAt: timestamp, endsAt: new Date(timestamp.getTime() + 370 * 86_400_000), seatLimit: 1 },
  });
}

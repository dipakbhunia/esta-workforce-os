import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { NotificationChannel, NotificationStatus, NotificationType, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { PlatformCommunicationService } from '../platform-communication/platform-communication.service';

const enabled = process.env.RUN_NOTIFICATION_DELIVERY_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
const claimBarrierKey = 20_261_001;

function testDatabaseUrl(applicationName: string): string {
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error('DATABASE_URL is required for the opt-in PostgreSQL integration test');
  const url = new URL(configured);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('application_name', applicationName);
  return url.toString();
}

function testClient(applicationName: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: testDatabaseUrl(applicationName) } } });
}

describeDb('PC-B PostgreSQL durable delivery claim', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('fences concurrent and stale workers, recovers expiry, and enforces bounded terminal transitions', async () => {
    const fixture = await createFixture();
    const workerA = testClient('pc-b-claim-worker-a');
    const workerB = testClient('pc-b-claim-worker-b');
    const barrier = testClient('pc-b-claim-barrier');
    const serviceA = new NotificationDeliveryService(workerA as unknown as PrismaService, {} as never);
    const serviceB = new NotificationDeliveryService(workerB as unknown as PrismaService, {} as never);
    let barrierHeld = false;
    try {
      await Promise.all([workerA.$connect(), workerB.$connect(), barrier.$connect()]);
      await installClaimBarrier(fixture.deliveryId);
      await barrier.$executeRawUnsafe('SELECT pg_advisory_lock($1::bigint)', claimBarrierKey);
      barrierHeld = true;

      const firstClaim = serviceA.claimNextDelivery(fixture.deliveryId);
      await waitForAdvisoryWait('pc-b-claim-worker-a');
      const competingClaim = await serviceB.claimNextDelivery(fixture.deliveryId);
      assert.equal(competingClaim, null, 'SKIP LOCKED must reject simultaneous ownership while worker A owns the row');

      await barrier.$executeRawUnsafe('SELECT pg_advisory_unlock($1::bigint)', claimBarrierKey);
      barrierHeld = false;
      const first = await firstClaim;
      assert.ok(first);
      assert.equal(first.attemptCount, 1);
      assert.ok(first.claimToken);
      const durableOwner = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
      assert.equal(durableOwner.claimToken, first.claimToken);
      assert.equal(durableOwner.attemptCount, 1);
      assert.equal(await serviceB.claimNextDelivery(fixture.deliveryId), null, 'valid lease must prevent a second claim');

      await prisma.notificationDelivery.update({ where: { id: fixture.deliveryId }, data: { claimExpiresAt: new Date(Date.now() - 1_000) } });
      const reclaimed = await serviceB.claimNextDelivery(fixture.deliveryId);
      assert.ok(reclaimed);
      assert.notEqual(reclaimed.claimToken, first.claimToken);
      assert.equal(reclaimed.attemptCount, 2);
      assert.equal(await serviceA.finalizeClaimSuccess(first, { skipped: false, providerMessageId: 'stale' }), false);
      assert.equal((await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } })).status, NotificationStatus.PENDING);

      assert.equal(await serviceB.finalizeClaimFailure(reclaimed, { code: 'SMTP_TIMEOUT', message: 'Email provider request timed out.' }), true);
      const retry = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
      assert.equal(retry.status, NotificationStatus.PENDING);
      assert.equal(retry.claimToken, null);
      assert.equal(retry.claimExpiresAt, null);
      assert.ok(retry.nextRetryAt);

      await prisma.notificationDelivery.update({ where: { id: fixture.deliveryId }, data: { attemptCount: 4, nextRetryAt: null } });
      const finalClaim = await serviceA.claimNextDelivery(fixture.deliveryId);
      assert.ok(finalClaim);
      assert.equal(finalClaim.attemptCount, 5);
      await serviceA.finalizeClaimFailure(finalClaim, { code: 'SMTP_REJECTED', message: 'Email provider rejected the delivery.' });
      const exhausted = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
      assert.equal(exhausted.status, NotificationStatus.FAILED);
      assert.equal(exhausted.nextRetryAt, null);
      assert.equal(exhausted.claimToken, null);
      assert.equal(await serviceB.claimNextDelivery(fixture.deliveryId), null);

      await assert.rejects(() => prisma.$executeRawUnsafe(
        'UPDATE "NotificationDelivery" SET "claimToken" = $1::uuid, "claimExpiresAt" = NULL WHERE "id" = $2::uuid',
        randomUUID(), fixture.deliveryId,
      ));
    } finally {
      if (barrierHeld) await barrier.$executeRawUnsafe('SELECT pg_advisory_unlock($1::bigint)', claimBarrierKey).catch(() => undefined);
      await dropClaimBarrier().catch(() => undefined);
      await Promise.all([workerA.$disconnect(), workerB.$disconnect(), barrier.$disconnect()]);
      await cleanupFixture(fixture.companyId);
    }
  });

  it('lists global evidence deterministically while honoring exact company and recipient filters', async () => {
    const companyA = await createFixture();
    const companyB = await createFixture();
    try {
      const first = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: companyA.deliveryId }, include: { notification: true } });
      const sameTime = new Date('2035-01-01T00:00:00.000Z');
      await prisma.notificationDelivery.update({ where: { id: first.id }, data: { createdAt: sameTime } });
      await prisma.notificationDelivery.update({ where: { id: companyB.deliveryId }, data: { createdAt: sameTime } });
      const secondNotification = await prisma.notification.create({ data: { companyId: companyA.companyId,
        userId: first.notification.userId, type: NotificationType.ALERT_RESOLVED, channel: NotificationChannel.EMAIL,
        title: 'Second', message: 'Safe summary', status: NotificationStatus.PENDING, idempotencyKey: `pc-b-second:${randomUUID()}` } });
      const secondId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      await prisma.notificationDelivery.create({ data: { id: secondId, notificationId: secondNotification.id,
        channel: NotificationChannel.EMAIL, recipient: first.recipient, createdAt: sameTime } });
      const service = new PlatformCommunicationService(prisma as unknown as PrismaService, { emailCapability: () => ({}) } as never);
      const resultA = await service.findDeliveries({ page: 1, limit: 20, companyId: companyA.companyId });
      assert.deepEqual(resultA.data.map((row) => row.deliveryId), [secondId, first.id]);
      assert.ok(resultA.data.every((row) => row.companyId === companyA.companyId));
      assert.ok(!resultA.data.some((row) => row.deliveryId === companyB.deliveryId));
      assert.ok(resultA.data.every((row) => !('claimToken' in row)));

      const resultB = await service.findDeliveries({ page: 1, limit: 20, companyId: companyB.companyId });
      assert.deepEqual(resultB.data.map((row) => row.deliveryId), [companyB.deliveryId]);
      assert.ok(!resultB.data.some((row) => row.deliveryId === companyA.deliveryId || row.deliveryId === secondId));

      const exactRecipient = await service.findDeliveries({ page: 1, limit: 20,
        companyId: companyA.companyId, recipient: first.recipient });
      assert.deepEqual(exactRecipient.data.map((row) => row.deliveryId), [secondId, first.id]);
    } finally {
      await cleanupFixture(companyA.companyId);
      await cleanupFixture(companyB.companyId);
    }
  });

  it('clears ownership on successful finalization and never reclaims delivered or cancelled rows', async () => {
    const fixture = await createFixture();
    const service = new NotificationDeliveryService(prisma as unknown as PrismaService, {} as never);
    try {
      const claimed = await service.claimNextDelivery(fixture.deliveryId);
      assert.ok(claimed);
      assert.equal(await service.finalizeClaimSuccess(claimed, { skipped: false, providerMessageId: 'provider-safe-id' }), true);
      const delivered = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
      assert.equal(delivered.status, NotificationStatus.DELIVERED);
      assert.equal(delivered.claimToken, null);
      assert.equal(delivered.claimExpiresAt, null);
      assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: delivered.notificationId } })).status, NotificationStatus.DELIVERED);
      assert.equal(await service.claimNextDelivery(fixture.deliveryId), null);
      await prisma.notificationDelivery.update({ where: { id: fixture.deliveryId }, data: { status: NotificationStatus.CANCELLED } });
      assert.equal(await service.claimNextDelivery(fixture.deliveryId), null);
    } finally {
      await cleanupFixture(fixture.companyId);
    }
  });
});

async function createFixture() {
  const suffix = randomUUID();
  const company = await prisma.company.create({ data: { name: 'PC-B', slug: `pc-b-${suffix}` } });
  const user = await prisma.user.create({ data: { companyId: company.id, email: `pc-b-${suffix}@example.invalid`,
    passwordHash: 'integration-only', firstName: 'PC', lastName: 'B' } });
  const notification = await prisma.notification.create({ data: { companyId: company.id, userId: user.id,
    type: NotificationType.ALERT_OPENED, channel: NotificationChannel.EMAIL, title: 'Test', message: 'Safe summary',
    status: NotificationStatus.PENDING, idempotencyKey: `pc-b:${suffix}` } });
  const delivery = await prisma.notificationDelivery.create({ data: { notificationId: notification.id,
    channel: NotificationChannel.EMAIL, recipient: user.email, status: NotificationStatus.PENDING } });
  return { companyId: company.id, deliveryId: delivery.id };
}

async function cleanupFixture(companyId: string) {
  await prisma.notificationDelivery.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.notificationPreference.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function installClaimBarrier(deliveryId: string) {
  await dropClaimBarrier().catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION pc_b_claim_barrier() RETURNS trigger AS $$
    BEGIN
      IF NEW."id" = '${deliveryId}'::uuid
         AND OLD."claimToken" IS NULL
         AND NEW."claimToken" IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(${claimBarrierKey}::bigint);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER pc_b_claim_barrier_trigger
    BEFORE UPDATE ON "NotificationDelivery"
    FOR EACH ROW EXECUTE FUNCTION pc_b_claim_barrier();
  `);
}

async function dropClaimBarrier() {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS pc_b_claim_barrier_trigger ON "NotificationDelivery"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS pc_b_claim_barrier()');
}

async function waitForAdvisoryWait(applicationName: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRawUnsafe<Array<{ waiting: boolean }>>(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE application_name = $1
          AND wait_event_type = 'Lock'
          AND lower(wait_event) = 'advisory'
      ) AS waiting
    `, applicationName);
    if (rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${applicationName} to reach the PostgreSQL advisory-lock barrier`);
}

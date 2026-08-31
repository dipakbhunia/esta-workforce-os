import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, PlanBillingModel, PlanStatus, PrismaClient, RecurringPriceBasis,
  RoleName, SubscriptionActivationSource, SubscriptionStatus, UserStatus,
} from '@prisma/client';
import { CommercialAccessService } from '../usage-seats/commercial-access.service';
import { CommercialSeatSource } from '../usage-seats/usage-seats.types';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { UsageSeatsQueryService } from '../usage-seats/usage-seats-query.service';
import { StorageUsageQueryService } from '../storage-usage/storage-usage-query.service';
import { StorageUsageService } from '../storage-usage/storage-usage.service';
import { CommercialStorageSource } from '../storage-usage/storage-usage.types';
import { SubscriptionExpirationService } from './subscription-expiration.service';
import { SubscriptionsService } from './subscriptions.service';

const enabled = process.env.RUN_SUBSCRIPTION_EXPIRATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
const now = new Date();
const actor = { id: randomUUID(), companyId: null, email: 'e18@example.invalid', firstName: 'E1.8', lastName: 'Probe', status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
let plan: Awaited<ReturnType<typeof createPlan>>;

describeDb('E1.8 PostgreSQL subscription expiration and access enforcement', () => {
  before(async () => {
    await prisma.$connect();
    await cleanupOrphanProbePlans();
    await prisma.user.create({ data: { id: actor.id, email: actor.email, passwordHash: 'integration-probe', firstName: actor.firstName, lastName: actor.lastName } });
    plan = await createPlan();
  });
  after(async () => {
    await prisma.planRecurringPrice.deleteMany({ where: { planId: plan.id } });
    await prisma.plan.delete({ where: { id: plan.id } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  it('expires due ACTIVE/SUSPENDED exactly once at the period boundary', async () => {
    for (const status of [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]) {
      const fixture = await createSubscription(status, new Date(now.getTime() - 1_000));
      try {
        const service = expirationService();
        const results = await Promise.all([
          service.expire(fixture.subscription.id, { now, source: 'SCHEDULER' }),
          service.expire(fixture.subscription.id, { now, source: 'SCHEDULER' }),
        ]);
        assert.ok(results.some((result) => result.outcome === 'EXPIRED'));
        const stored = await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
        assert.equal(stored.status, SubscriptionStatus.EXPIRED);
        assert.equal(stored.endedAt?.toISOString(), fixture.subscription.currentPeriodEnd?.toISOString());
        assert.equal(await prisma.auditLog.count({ where: { entityId: stored.id, action: 'SUBSCRIPTION_EXPIRED' } }), 1);
      } finally { await cleanup(fixture.company.id); }
    }
  });

  it('leaves future, unbounded, CANCELLED, and SUPERSEDED records unchanged', async () => {
    const cases: Array<[SubscriptionStatus, Date | null]> = [
      [SubscriptionStatus.ACTIVE, new Date(now.getTime() + 86_400_000)],
      [SubscriptionStatus.SUSPENDED, new Date(now.getTime() + 86_400_000)],
      [SubscriptionStatus.ACTIVE, null],
      [SubscriptionStatus.CANCELLED, new Date(now.getTime() - 1_000)],
      [SubscriptionStatus.SUPERSEDED, new Date(now.getTime() - 1_000)],
    ];
    for (const [status, end] of cases) {
      const fixture = await createSubscription(status, end);
      try {
        await expirationService().expire(fixture.subscription.id, { now, source: 'SCHEDULER' });
        assert.equal((await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } })).status, status);
        assert.equal(await prisma.auditLog.count({ where: { entityId: fixture.subscription.id, action: 'SUBSCRIPTION_EXPIRED' } }), 0);
      } finally { await cleanup(fixture.company.id); }
    }
  });

  it('serializes cancellation, suspension, and resume against expiration', async () => {
    for (const operation of ['cancel', 'suspend', 'resume'] as const) {
      const initial = operation === 'resume' ? SubscriptionStatus.SUSPENDED : SubscriptionStatus.ACTIVE;
      const fixture = await createSubscription(initial, new Date(now.getTime() - 1_000));
      const subscriptions = subscriptionsService();
      try {
        const lifecycle = operation === 'cancel'
          ? subscriptions.cancel(fixture.subscription.id, actor)
          : operation === 'suspend'
            ? subscriptions.suspend(fixture.subscription.id, actor)
            : subscriptions.resume(fixture.subscription.id, actor);
        await Promise.allSettled([lifecycle, expirationService().expire(fixture.subscription.id, { now, source: 'SCHEDULER' })]);
        const stored = await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
        const expirationAudits = await prisma.auditLog.count({ where: { entityId: stored.id, action: 'SUBSCRIPTION_EXPIRED' } });
        const lifecycleAction = operation === 'cancel' ? 'SUBSCRIPTION_CANCELLED' : operation === 'suspend' ? 'SUBSCRIPTION_SUSPENDED' : 'SUBSCRIPTION_RESUMED';
        const lifecycleAudits = await prisma.auditLog.count({ where: { entityId: stored.id, action: lifecycleAction } });
        if (operation === 'cancel' && stored.status === SubscriptionStatus.CANCELLED) {
          assert.equal(expirationAudits, 0);
          assert.equal(lifecycleAudits, 1);
        } else {
          assert.equal(stored.status, SubscriptionStatus.EXPIRED);
          assert.equal(stored.endedAt?.toISOString(), fixture.subscription.currentPeriodEnd?.toISOString());
          assert.equal(expirationAudits, 1);
          assert.equal(lifecycleAudits, 0);
        }
      } finally { await cleanup(fixture.company.id); }
    }
  });

  it('lets expiration win against the actual amendment service without creating a stale successor', async () => {
    const fixture = await createSubscription(SubscriptionStatus.ACTIVE, new Date(now.getTime() - 1_000));
    try {
      await Promise.allSettled([
        subscriptionsService().amend(fixture.subscription.id, { seatQuantity: 11 }, actor),
        expirationService().expire(fixture.subscription.id, { now, source: 'SCHEDULER' }),
      ]);
      const rows = await prisma.companySubscription.findMany({ where: { companyId: fixture.company.id } });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, SubscriptionStatus.EXPIRED);
      assert.equal(rows[0]?.endedAt?.toISOString(), fixture.subscription.currentPeriodEnd?.toISOString());
      assert.equal(await prisma.auditLog.count({ where: { entityId: fixture.subscription.id, action: 'SUBSCRIPTION_EXPIRED' } }), 1);
    } finally { await cleanup(fixture.company.id); }
  });

  it('keeps the exact old candidate SUPERSEDED when a valid actual amendment wins', async () => {
    const fixture = await createSubscription(SubscriptionStatus.ACTIVE, new Date(Date.now() + 86_400_000));
    try {
      const successor = await subscriptionsService().amend(fixture.subscription.id, { seatQuantity: 11 }, actor);
      const outcome = await expirationService().expire(fixture.subscription.id, { now: new Date(Date.now() + 172_800_000), source: 'SCHEDULER' });
      const source = await prisma.companySubscription.findUniqueOrThrow({ where: { id: fixture.subscription.id } });
      const storedSuccessor = await prisma.companySubscription.findUniqueOrThrow({ where: { id: successor.id } });
      assert.equal(outcome.outcome, 'NOT_ELIGIBLE');
      assert.equal(source.status, SubscriptionStatus.SUPERSEDED);
      assert.equal(storedSuccessor.companyId, fixture.company.id);
      assert.equal(storedSuccessor.status, SubscriptionStatus.ACTIVE);
      assert.equal(storedSuccessor.endedAt, null);
      assert.equal(await prisma.auditLog.count({ where: { entityId: { in: [source.id, storedSuccessor.id] }, action: 'SUBSCRIPTION_EXPIRED' } }), 0);
    } finally { await cleanup(fixture.company.id); }
  });

  it('uses a deterministic bounded real candidate scan across Companies', async () => {
    const fixtures = await Promise.all([
      createSubscription(SubscriptionStatus.ACTIVE, new Date(now.getTime() - 3_000)),
      createSubscription(SubscriptionStatus.ACTIVE, new Date(now.getTime() - 2_000)),
      createSubscription(SubscriptionStatus.ACTIVE, new Date(now.getTime() - 1_000)),
    ]);
    try {
      assert.equal(await expirationService().recoverDue(2, now), 2);
      assert.equal(await prisma.companySubscription.count({ where: { id: { in: fixtures.map((item) => item.subscription.id) }, status: SubscriptionStatus.EXPIRED } }), 2);
      assert.equal(await expirationService().recoverDue(2, now), 1);
    } finally { for (const fixture of fixtures) await cleanup(fixture.company.id); }
  });

  it('isolates a genuine PostgreSQL candidate failure and expires the later candidate in the same recovery run', async () => {
    const failed = await createSubscription(SubscriptionStatus.ACTIVE, new Date(now.getTime() - 2_000));
    const later = await createSubscription(SubscriptionStatus.ACTIVE, new Date(now.getTime() - 1_000));
    const suffix = randomUUID().replaceAll('-', '');
    const functionName = `e18_fail_expiration_${suffix}`;
    const triggerName = `e18_fail_expiration_${suffix}`;
    try {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" = 'SUBSCRIPTION_EXPIRED' AND NEW."entityId" = '${failed.subscription.id}' THEN RAISE EXCEPTION 'E1.8 injected candidate failure'; END IF; RETURN NEW; END; $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
      assert.equal(await expirationService().recoverDue(2, now), 1);
      const failedStored = await prisma.companySubscription.findUniqueOrThrow({ where: { id: failed.subscription.id } });
      const laterStored = await prisma.companySubscription.findUniqueOrThrow({ where: { id: later.subscription.id } });
      assert.equal(failedStored.status, SubscriptionStatus.ACTIVE);
      assert.equal(await prisma.auditLog.count({ where: { entityId: failedStored.id, action: 'SUBSCRIPTION_EXPIRED' } }), 0);
      assert.equal(laterStored.status, SubscriptionStatus.EXPIRED);
      assert.equal(laterStored.endedAt?.toISOString(), later.subscription.currentPeriodEnd?.toISOString());
      assert.equal(await prisma.auditLog.count({ where: { entityId: laterStored.id, action: 'SUBSCRIPTION_EXPIRED' } }), 1);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
      await cleanup(failed.company.id);
      await cleanup(later.company.id);
    }
  });

  it('fails closed in real access, Usage & Seats, and Storage Usage queries before reconciliation', async () => {
    const fixture = await createSubscription(SubscriptionStatus.ACTIVE, new Date(Date.now() - 1_000));
    try {
      const commercial = await new CommercialAccessService(prisma as never).resolve(fixture.company.id, prisma as never, new Date());
      assert.equal(commercial.source, CommercialSeatSource.NONE);
      const usage = await new UsageSeatsQueryService(prisma as never, new CommercialAccessService(prisma as never), new SeatUsageService(prisma as never)).findCompany(fixture.company.id, { page: 1, limit: 20 });
      assert.equal(usage.commercial.source, CommercialSeatSource.NONE);
      const storage = await new StorageUsageQueryService(prisma as never, new StorageUsageService()).findCompany(fixture.company.id);
      assert.equal(storage.commercial.source, CommercialStorageSource.NONE);
      assert.equal(storage.storage.measuredStorageBytes, '0');
    } finally { await cleanup(fixture.company.id); }
  });
});

function expirationService() { return new SubscriptionExpirationService(prisma as never, new SeatUsageService(prisma as never)); }
function subscriptionsService() { const seats = new SeatUsageService(prisma as never); return new SubscriptionsService(prisma as never, seats, new SubscriptionExpirationService(prisma as never, seats)); }

async function createPlan() {
  const suffix = randomUUID();
  return prisma.plan.create({ data: {
    code: `E18-${suffix}`, name: 'E1.8 probe', status: PlanStatus.ACTIVE, billingModel: PlanBillingModel.PER_USER,
    currency: 'INR', minSeats: 1, entitlements: ['workforce.attendance'], limits: { maxStorageBytes: 1000 },
    recurringPrices: { create: { billingInterval: BillingInterval.MONTHLY, basis: RecurringPriceBasis.PER_USER_UNIT, amountMinor: 100n, currency: 'INR' } },
  } });
}

async function createSubscription(status: SubscriptionStatus, currentPeriodEnd: Date | null) {
  const suffix = randomUUID();
  const company = await prisma.company.create({ data: { name: `E1.8 ${suffix}`, slug: `e18-${suffix}` } });
  const currentPeriodStart = currentPeriodEnd ? new Date(currentPeriodEnd.getTime() - 86_400_000) : null;
  const subscription = await prisma.companySubscription.create({ data: {
    companyId: company.id, planId: plan.id, status, activationSource: SubscriptionActivationSource.MANUAL,
    billingInterval: BillingInterval.MONTHLY, planCodeSnapshot: plan.code, planNameSnapshot: plan.name,
    billingModelSnapshot: PlanBillingModel.PER_USER, currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
    recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1000n, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
    pricingResolvedAt: new Date(), seatQuantity: 10, entitlementsSnapshot: ['workforce.attendance'], limitsSnapshot: { maxStorageBytes: 1000 },
    startsAt: currentPeriodStart, currentPeriodStart, currentPeriodEnd,
    ...(status === SubscriptionStatus.SUSPENDED ? { suspendedAt: new Date() } : {}),
    ...(status === SubscriptionStatus.CANCELLED ? { cancelledAt: new Date(), endedAt: new Date() } : {}),
    ...(status === SubscriptionStatus.SUPERSEDED ? { endedAt: new Date() } : {}),
  } });
  return { company, subscription };
}

async function cleanup(companyId: string) {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  const rows = await prisma.companySubscription.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  for (const row of rows) await prisma.companySubscription.delete({ where: { id: row.id } });
  await prisma.company.delete({ where: { id: companyId } });
}

async function cleanupOrphanProbePlans() {
  const stale = await prisma.plan.findMany({ where: { code: { startsWith: 'E18-' }, subscriptions: { none: {} } }, select: { id: true } });
  if (!stale.length) return;
  const ids = stale.map((item) => item.id);
  await prisma.planRecurringPrice.deleteMany({ where: { planId: { in: ids } } });
  await prisma.plan.deleteMany({ where: { id: { in: ids } } });
}

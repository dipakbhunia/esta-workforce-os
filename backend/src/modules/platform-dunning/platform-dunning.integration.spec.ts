import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, PaymentAttemptOperation, PaymentAttemptStatus, PaymentProviderOrderStatus, PaymentPurpose, PaymentStatus,
  PlanBillingModel, Prisma, PrismaClient, RecurringPriceBasis, SubscriptionActivationSource, SubscriptionRenewalStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PlatformDunningService } from './platform-dunning.service';

const enabled = process.env.RUN_PLATFORM_DUNNING_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
const MAX_PLATFORM_MONEY = 9007199254740991n;
const DAY = 86_400_000;

type Provider = { id: string; provider: 'RAZORPAY'; mode: 'TEST' | 'LIVE' };
type Cycle = { companyId: string; subscriptionId: string; paymentId: string; renewalId: string };

describeDb('DUN-E PostgreSQL snapshot and query hardening', () => {
  before(async () => prisma.$connect());
  after(async () => {
    assert.equal(await prisma.company.count({ where: { name: 'DUN-E' } }), 0);
    assert.equal(await prisma.plan.count({ where: { code: { startsWith: 'DUN-E-' } } }), 0);
    const triggers = await prisma.$queryRaw<Array<{ tgenabled: string }>>(Prisma.sql`
      SELECT tgenabled FROM pg_trigger WHERE tgname = 'SubscriptionRenewal_immutability'
    `);
    assert.deepEqual(triggers, [{ tgenabled: 'O' }]);
    await prisma.$disconnect();
  });

  it('proves exact boundaries, status matrices, deterministic ordering and exact pagination', async () => {
    const fixture = await setup();
    const evaluationTime = new Date('2035-08-01T00:00:00.000Z');
    const service = new PlatformDunningService(prisma as never, () => evaluationTime);
    try {
      const dueBefore = await fixture.cycle({ cycleStart: new Date(evaluationTime.getTime() - DAY), amountMinor: MAX_PLATFORM_MONEY });
      const dueEqual = await fixture.cycle({ cycleStart: evaluationTime });
      const dueAfter = await fixture.cycle({ cycleStart: new Date(evaluationTime.getTime() + DAY) });
      const dueResult = await service.findAll({ from: new Date(evaluationTime.getTime() - 2 * DAY), to: new Date(evaluationTime.getTime() + 2 * DAY), limit: 100 });
      assert.deepEqual(ids(dueResult), [dueBefore.renewalId, dueEqual.renewalId]);
      assert.ok(!ids(dueResult).includes(dueAfter.renewalId));
      assert.equal(dueResult.data[0].payment.amountMinor, MAX_PLATFORM_MONEY.toString(10));

      const rangeFrom = new Date('2035-05-01T00:00:00.000Z');
      const rangeTo = new Date('2035-05-04T00:00:00.000Z');
      const atFrom = await fixture.cycle({ cycleStart: rangeFrom });
      const inside = await fixture.cycle({ cycleStart: new Date('2035-05-02T00:00:00.000Z') });
      const atTo = await fixture.cycle({ cycleStart: rangeTo });
      assert.ok(evaluationTime > rangeTo);
      const rangeResult = await service.findAll({ from: rangeFrom, to: rangeTo, limit: 100 });
      assert.deepEqual(ids(rangeResult), [atFrom.renewalId, inside.renewalId]);
      assert.ok(!ids(rangeResult).includes(atTo.renewalId));

      const paymentFrom = new Date('2035-04-01T00:00:00.000Z');
      const paymentTo = new Date('2035-04-05T00:00:00.000Z');
      const pending = await fixture.cycle({ cycleStart: paymentFrom, paymentStatus: PaymentStatus.PENDING });
      const authorized = await fixture.cycle({ cycleStart: new Date('2035-04-02T00:00:00.000Z'), paymentStatus: PaymentStatus.AUTHORIZED });
      const failed = await fixture.cycle({ cycleStart: new Date('2035-04-03T00:00:00.000Z'), paymentStatus: PaymentStatus.FAILED });
      const captured = await fixture.cycle({ cycleStart: new Date('2035-04-04T00:00:00.000Z'), paymentStatus: PaymentStatus.CAPTURED });
      const paymentResult = await service.findAll({ from: paymentFrom, to: paymentTo, limit: 100 });
      assert.deepEqual(ids(paymentResult), [pending.renewalId, authorized.renewalId, failed.renewalId]);
      assert.ok(!ids(paymentResult).includes(captured.renewalId));
      assert.deepEqual(ids(await service.findAll({ from: paymentFrom, to: paymentTo, paymentStatus: PaymentStatus.FAILED })), [failed.renewalId]);
      assert.deepEqual(ids(await service.findAll({ from: paymentFrom, to: paymentTo, paymentStatus: PaymentStatus.AUTHORIZED })), [authorized.renewalId]);

      const subscriptionFrom = new Date('2035-03-01T00:00:00.000Z');
      const subscriptionTo = new Date('2035-03-06T00:00:00.000Z');
      const active = await fixture.cycle({ cycleStart: subscriptionFrom, subscriptionStatus: SubscriptionStatus.ACTIVE });
      const suspended = await fixture.cycle({ cycleStart: new Date('2035-03-02T00:00:00.000Z'), subscriptionStatus: SubscriptionStatus.SUSPENDED });
      const expired = await fixture.cycle({ cycleStart: new Date('2035-03-03T00:00:00.000Z'), subscriptionStatus: SubscriptionStatus.EXPIRED });
      const cancelled = await fixture.cycle({ cycleStart: new Date('2035-03-04T00:00:00.000Z'), subscriptionStatus: SubscriptionStatus.CANCELLED });
      const superseded = await fixture.cycle({ cycleStart: new Date('2035-03-05T00:00:00.000Z'), subscriptionStatus: SubscriptionStatus.SUPERSEDED });
      const subscriptionResult = await service.findAll({ from: subscriptionFrom, to: subscriptionTo, limit: 100 });
      assert.deepEqual(ids(subscriptionResult), [active.renewalId, suspended.renewalId, expired.renewalId]);
      assert.ok(!ids(subscriptionResult).includes(cancelled.renewalId));
      assert.ok(!ids(subscriptionResult).includes(superseded.renewalId));

      const orderedIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()].sort();
      const orderedAt = new Date('2035-02-01T00:00:00.000Z');
      for (const renewalId of [...orderedIds].reverse()) await fixture.cycle({ renewalId, cycleStart: orderedAt });
      const orderFrom = new Date(orderedAt.getTime() - DAY);
      const orderTo = new Date(orderedAt.getTime() + DAY);
      let observedOrderBy: unknown;
      const orderingService = new PlatformDunningService(observeFindMany(args => { observedOrderBy = args.orderBy; }) as never, () => evaluationTime);
      const ordered = await orderingService.findAll({ from: orderFrom, to: orderTo, limit: 100 });
      assert.deepEqual(observedOrderBy, [{ cycleStart: 'asc' }, { id: 'asc' }]);
      assert.deepEqual(ids(ordered), orderedIds);
      const pages = [];
      for (let page = 1; page <= 3; page += 1) {
        const result = await service.findAll({ from: orderFrom, to: orderTo, page, limit: 2 });
        assert.equal(result.meta.total, orderedIds.length); assert.equal(result.meta.totalPages, 3);
        assert.deepEqual(ids(result), orderedIds.slice((page - 1) * 2, page * 2));
        pages.push(...ids(result));
      }
      assert.deepEqual(pages, orderedIds);
      assert.equal(new Set(pages).size, orderedIds.length);
    } finally { await fixture.cleanup(); }
  });

  it('keeps rows and count coherent across concurrent Payment, Renewal and Subscription changes', async () => {
    const fixture = await setup();
    const evaluationTime = new Date('2035-08-01T00:00:00.000Z');
    try {
      const paymentCycle = await fixture.cycle({ cycleStart: new Date('2035-06-01T00:00:00.000Z'), paymentStatus: PaymentStatus.FAILED });
      await assertSnapshot(paymentCycle.renewalId, evaluationTime, async () => prisma.payment.update({ where: { id: paymentCycle.paymentId }, data: {
        status: PaymentStatus.CAPTURED, capturedAt: new Date(), capturedProviderPaymentId: `dun_e_${randomUUID()}`,
      } }));

      const renewalCycle = await fixture.cycle({ cycleStart: new Date('2035-06-02T00:00:00.000Z') });
      await assertSnapshot(renewalCycle.renewalId, evaluationTime, async () => prisma.subscriptionRenewal.update({ where: { id: renewalCycle.renewalId }, data: {
        status: SubscriptionRenewalStatus.APPLIED, appliedAt: new Date(), applicationAttemptCount: { increment: 1 }, lastApplicationAttemptAt: new Date(),
      } }));

      const subscriptionCycle = await fixture.cycle({ cycleStart: new Date('2035-06-03T00:00:00.000Z') });
      await assertSnapshot(subscriptionCycle.renewalId, evaluationTime, async () => prisma.companySubscription.update({ where: { id: subscriptionCycle.subscriptionId }, data: {
        status: SubscriptionStatus.CANCELLED,
      } }));
    } finally { await fixture.cleanup(); }
  });

  it('proves provider-order selection, attempt bounds, one-read detail and read-only behavior', async () => {
    const fixture = await setup();
    try {
      const cycle = await fixture.cycle({ cycleStart: new Date('2035-06-01T00:00:00.000Z'), amountMinor: MAX_PLATFORM_MONEY });
      const credential = await prisma.billingProviderCredential.findFirstOrThrow({ where: { providerConfigurationId: fixture.provider.id, retiredAt: null } });
      const orders = [];
      for (const sequence of [1, 2]) {
        orders.push(await prisma.paymentProviderOrder.create({ data: {
          paymentId: cycle.paymentId, providerConfigurationId: fixture.provider.id, credentialVersionId: credential.id, sequence,
          status: PaymentProviderOrderStatus.CLOSED, providerOrderId: `dun_e_order_${sequence}_${randomUUID()}`,
          providerStatus: sequence === 1 ? 'older-safe-status' : 'latest-safe-status', providerReceipt: `dun_e_receipt_${sequence}_${randomUUID()}`, amountMinor: MAX_PLATFORM_MONEY,
          currency: 'INR', closedAt: new Date(),
        } }));
      }
      for (let sequence = 1; sequence <= 26; sequence += 1) {
        await prisma.paymentAttempt.create({ data: {
          paymentId: cycle.paymentId, sequence, operation: PaymentAttemptOperation.PROVIDER_FETCH,
          status: PaymentAttemptStatus.SUCCEEDED, amountMinor: MAX_PLATFORM_MONEY, currency: 'INR',
          requestReference: `dun-e-attempt:${cycle.paymentId}:${sequence}`, completedAt: new Date(),
        } });
      }
      const service = new PlatformDunningService(prisma as never, () => new Date('2035-08-01T00:00:00.000Z'));
      const before = await durableCounts(fixture.companyIds);
      const detail = await service.findOne(cycle.renewalId);
      const list = await service.findAll({ renewalId: cycle.renewalId });
      const after = await durableCounts(fixture.companyIds);
      assert.equal(detail.latestProviderOrder?.id, orders[1].id);
      assert.equal(detail.latestProviderOrder?.providerStatus, 'latest-safe-status');
      assert.equal(detail.attempts.data.length, 25); assert.equal(detail.attempts.truncated, true);
      assert.equal(detail.attempts.data[0].sequence, 26); assert.equal(detail.attempts.data[24].sequence, 2);
      assert.equal(detail.payment.amountMinor, MAX_PLATFORM_MONEY.toString(10));
      assert.equal(list.data.length, 1); assert.deepEqual(after, before);

      const emptyCycle = await fixture.cycle({ cycleStart: new Date('2035-06-02T00:00:00.000Z') });
      const empty = await service.findOne(emptyCycle.renewalId);
      assert.deepEqual(empty.attempts, { data: [], truncated: false });

      assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: cycle.paymentId } })).purpose, PaymentPurpose.SUBSCRIPTION_RENEWAL);
    } finally { await fixture.cleanup(); }
  });

  it('uses the existing recovery index for the locked active ordering without requiring a migration', async () => {
    const plan = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return tx.$queryRaw<Array<{ 'QUERY PLAN': unknown }>>(Prisma.sql`
        EXPLAIN (FORMAT JSON)
        SELECT "id" FROM "SubscriptionRenewal"
        WHERE "status" = 'PREPARED'::"SubscriptionRenewalStatus" AND "cycleStart" <= NOW()
        ORDER BY "cycleStart" ASC, "id" ASC LIMIT 100
      `);
    });
    assert.match(JSON.stringify(plan), /SubscriptionRenewal_recovery_order_idx/);
  });
});

async function assertSnapshot(renewalId: string, evaluationTime: Date, mutate: () => Promise<unknown>) {
  let rowsRead!: () => void; let releaseCount!: () => void;
  const rowsReadPromise = new Promise<void>(resolve => { rowsRead = resolve; });
  const releaseCountPromise = new Promise<void>(resolve => { releaseCount = resolve; });
  const coordinated = new Proxy(prisma, { get(target, property, receiver) {
    if (property !== '$transaction') return Reflect.get(target, property, receiver);
    return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => target.$transaction(async tx => {
      const renewal = new Proxy(tx.subscriptionRenewal, { get(delegate, operation, delegateReceiver) {
        if (operation === 'findMany') return async (args: unknown) => { const rows = await (delegate.findMany as Function)(args); rowsRead(); return rows; };
        if (operation === 'count') return async (args: unknown) => { await releaseCountPromise; return (delegate.count as Function)(args); };
        return Reflect.get(delegate, operation, delegateReceiver);
      } });
      return callback(new Proxy(tx, { get(txTarget, key, txReceiver) { return key === 'subscriptionRenewal' ? renewal : Reflect.get(txTarget, key, txReceiver); } }));
    }, options);
  } });
  const service = new PlatformDunningService(coordinated as never, () => evaluationTime);
  const pending = service.findAll({ renewalId });
  await rowsReadPromise;
  await mutate();
  releaseCount();
  const result = await pending;
  assert.equal(result.meta.total, 1); assert.equal(result.meta.totalPages, 1);
  assert.equal(result.data.length, 1); assert.equal(result.data[0].renewal.id, renewalId);
  const current = await new PlatformDunningService(prisma as never, () => evaluationTime).findAll({ renewalId });
  assert.deepEqual(current.data, []); assert.equal(current.meta.total, 0); assert.equal(current.meta.totalPages, 0);
}

function ids(result: { data: Array<{ renewal: { id: string } }> }): string[] {
  return result.data.map(item => item.renewal.id);
}

function observeFindMany(observe: (args: { orderBy?: unknown }) => void) {
  return new Proxy(prisma, { get(target, property, receiver) {
    if (property !== '$transaction') return Reflect.get(target, property, receiver);
    return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => target.$transaction(async tx => {
      const renewal = new Proxy(tx.subscriptionRenewal, { get(delegate, operation, delegateReceiver) {
        if (operation === 'findMany') return async (args: { orderBy?: unknown }) => { observe(args); return (delegate.findMany as Function)(args); };
        return Reflect.get(delegate, operation, delegateReceiver);
      } });
      return callback(new Proxy(tx, { get(txTarget, key, txReceiver) { return key === 'subscriptionRenewal' ? renewal : Reflect.get(txTarget, key, txReceiver); } }));
    }, options);
  } });
}

async function setup() {
  const suffix = randomUUID(); const companyIds: string[] = [];
  const provider = await prisma.billingProviderConfiguration.findFirst({ where: { enabled: true } }) as Provider | null;
  assert.ok(provider, 'an enabled provider fixture is required');
  const plan = await prisma.plan.create({ data: { code: `DUN-E-${suffix}`, name: 'DUN-E', billingModel: PlanBillingModel.PER_USER } });
  return {
    provider, companyIds,
    cycle: async (input: { renewalId?: string; cycleStart: Date; amountMinor?: bigint; paymentStatus?: PaymentStatus; subscriptionStatus?: SubscriptionStatus }): Promise<Cycle> => {
      const company = await prisma.company.create({ data: { name: 'DUN-E', slug: `dun-e-${companyIds.length}-${suffix}` } }); companyIds.push(company.id);
      const amountMinor = input.amountMinor ?? 100n; const paymentStatus = input.paymentStatus ?? PaymentStatus.PENDING;
      const subscription = await prisma.companySubscription.create({ data: { companyId: company.id, planId: plan.id, status: input.subscriptionStatus ?? SubscriptionStatus.ACTIVE,
        activationSource: SubscriptionActivationSource.MANUAL, billingInterval: BillingInterval.MONTHLY, planCodeSnapshot: 'DUN-E',
        planNameSnapshot: 'DUN-E', billingModelSnapshot: PlanBillingModel.PER_USER, currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
        recurringUnitPriceMinor: amountMinor, recurringTotalPriceMinor: amountMinor, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
        pricingResolvedAt: new Date(), seatQuantity: 1, currentPeriodStart: new Date(input.cycleStart.getTime() - 30 * DAY), currentPeriodEnd: input.cycleStart } });
      const paymentId = randomUUID(); const renewalId = input.renewalId ?? randomUUID();
      await prisma.$transaction(async tx => {
        await tx.payment.create({ data: { id: paymentId, companyId: company.id, subscriptionId: subscription.id, providerConfigurationId: provider.id,
          purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: paymentStatus, provider: provider.provider, providerMode: provider.mode, amountMinor,
          currency: 'INR', idempotencyKey: `dun-e:${paymentId}`, businessReference: `dun-e:${paymentId}`,
          ...(paymentStatus === PaymentStatus.AUTHORIZED && { authorizedAt: new Date() }),
          ...(paymentStatus === PaymentStatus.FAILED && { failedAt: new Date(), failureCode: 'DECLINED', safeFailureMessage: 'Payment failed' }),
          ...(paymentStatus === PaymentStatus.CAPTURED && { capturedAt: new Date(), capturedProviderPaymentId: `dun_e_${paymentId}` }),
        } });
        await tx.subscriptionRenewal.create({ data: { id: renewalId, companyId: company.id, subscriptionId: subscription.id, paymentId,
          cycleStart: input.cycleStart, cycleEnd: new Date(input.cycleStart.getTime() + 30 * DAY), billingInterval: BillingInterval.MONTHLY,
          recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: amountMinor, recurringTotalPriceMinor: amountMinor,
          currency: 'INR', seatQuantity: 1 } });
      });
      return { companyId: company.id, subscriptionId: subscription.id, paymentId, renewalId };
    },
    cleanup: async () => { await cleanup(companyIds, plan.id); },
  };
}

async function durableCounts(companyIds: string[]) {
  return Promise.all([
    prisma.subscriptionRenewal.count({ where: { companyId: { in: companyIds } } }),
    prisma.payment.count({ where: { companyId: { in: companyIds } } }),
    prisma.paymentProviderOrder.count({ where: { payment: { companyId: { in: companyIds } } } }),
    prisma.paymentAttempt.count({ where: { payment: { companyId: { in: companyIds } } } }),
    prisma.invoice.count({ where: { companyId: { in: companyIds } } }),
  ]);
}

async function cleanup(companyIds: string[], planId: string) {
  if (companyIds.length) {
    await prisma.$executeRawUnsafe('ALTER TABLE "SubscriptionRenewal" DISABLE TRIGGER "SubscriptionRenewal_immutability"');
    try { await prisma.subscriptionRenewal.deleteMany({ where: { companyId: { in: companyIds } } }); }
    finally { await prisma.$executeRawUnsafe('ALTER TABLE "SubscriptionRenewal" ENABLE TRIGGER "SubscriptionRenewal_immutability"'); }
    await prisma.paymentAttempt.deleteMany({ where: { payment: { companyId: { in: companyIds } } } });
    await prisma.paymentProviderOrder.deleteMany({ where: { payment: { companyId: { in: companyIds } } } });
    await prisma.payment.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.companySubscription.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
}

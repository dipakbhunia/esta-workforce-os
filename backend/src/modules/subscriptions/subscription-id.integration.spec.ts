import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BillingInterval, PlanStatus, PrismaClient, SubscriptionActivationSource } from '@prisma/client';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { SubscriptionsService } from './subscriptions.service';

const enabled = process.env.RUN_SUBSCRIPTION_DB_INTEGRATION === '1';

describe('PostgreSQL CompanySubscription ID generation', () => {
  it('creates MANUAL, PAYMENT, and COMPLIMENTARY subscriptions through the service and rolls back', { skip: !enabled }, async () => {
    const prisma = new PrismaClient(); const createdIds: string[] = []; const rollback = new Error('ROLLBACK_SUBSCRIPTION_ID_PROBE');
    try {
      const [idColumn] = await prisma.$queryRaw<Array<{ is_nullable: string; column_default: string | null }>>`SELECT "is_nullable", "column_default" FROM "information_schema"."columns" WHERE "table_schema" = 'public' AND "table_name" = 'CompanySubscription' AND "column_name" = 'id'`;
      assert.deepEqual(idColumn, { is_nullable: 'NO', column_default: null });
      await assert.rejects(prisma.$transaction(async (tx) => {
        const company = await tx.company.findFirst({ where: { deletedAt: null } });
        const plan = await tx.plan.findFirst({ where: { status: PlanStatus.ACTIVE, archivedAt: null, recurringPrices: { some: { billingInterval: BillingInterval.MONTHLY } } } });
        const actor = await tx.user.findFirst();
        assert.ok(company && plan && actor, 'Seeded company, active monthly Plan, and actor User are required');
        const transactionPrisma = { company: tx.company, plan: tx.plan, $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) };
        const service = new SubscriptionsService(transactionPrisma as never, new SeatUsageService(transactionPrisma as never));
        for (const activationSource of [SubscriptionActivationSource.MANUAL, SubscriptionActivationSource.PAYMENT, SubscriptionActivationSource.COMPLIMENTARY]) {
          const created = await service.create({ companyId: company.id, planId: plan.id, billingInterval: BillingInterval.MONTHLY, activationSource, seatQuantity: Math.max(1, plan.minSeats ?? 1) }, { id: actor.id } as never);
          assert.match(created.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); createdIds.push(created.id);
        }
        throw rollback;
      }), (error: unknown) => error === rollback);
      assert.equal(await prisma.companySubscription.count({ where: { id: { in: createdIds } } }), 0);
    } finally { await prisma.$disconnect(); }
  });
});

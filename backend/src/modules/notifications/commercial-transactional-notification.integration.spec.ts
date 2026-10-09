import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { NotificationType, PrismaClient, UserStatus } from '@prisma/client';
import { CommercialTransactionalNotificationService } from './commercial-transactional-notification.service';
import { CommercialBillingRecipientResolver } from './commercial-billing-recipient-resolver.service';

const describeDb = process.env.RUN_PC_M1_DB_INTEGRATION === '1' ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-M1 PostgreSQL commercial notification atomicity', () => {
  const suffix = randomUUID();
  let companyId = '';
  let userId = '';
  const service = new CommercialTransactionalNotificationService(new CommercialBillingRecipientResolver(prisma as never));

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({ data: { name: `PC-M1 ${suffix}`, slug: `pc-m1-${suffix}` } });
    companyId = company.id;
    const user = await prisma.user.create({ data: { companyId, email: `pc-m1-${suffix}@example.test`, passwordHash: 'not-used', firstName: 'Billing', lastName: 'Contact', status: UserStatus.ACTIVE } });
    userId = user.id;
    await prisma.companyBillingProfile.create({ data: { companyId, billingName: 'PC-M1 Billing', addressLine1: '1 Billing Road', city: 'Pune', postalCode: '411001', country: 'IN', billingContactUserId: userId } });
  });

  after(async () => {
    try {
      if (companyId) {
        await prisma.notification.deleteMany({ where: { companyId } });
        await prisma.companyBillingProfile.deleteMany({ where: { companyId } });
      }
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    } finally { await prisma.$disconnect(); }
  });

  it('commits one durable intent under concurrency and rolls intent back with its caller transaction', async () => {
    const sourceId = randomUUID();
    const input = { type: NotificationType.PAYMENT_CAPTURED, sourceId, companyId, payload: { companyName: 'PC-M1', paymentReference: 'PAY-1', amountMinor: '900719925474099301', currency: 'INR', occurredAt: '2026-10-09T00:00:00.000Z' } } as const;
    const results = await Promise.all(Array.from({ length: 4 }, () => prisma.$transaction((tx) => service.createInTransaction(tx, input))));
    assert.equal(results.filter(Boolean).length, 1);
    const rows = await prisma.notification.findMany({ where: { idempotencyKey: `${sourceId}:PAYMENT_CAPTURED:${userId}:EMAIL` }, include: { deliveries: true } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].deliveries.length, 1);
    assert.equal(rows[0].deliveries[0].recipient, `pc-m1-${suffix}@example.test`);

    const rollbackSourceId = randomUUID();
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      await service.createInTransaction(tx, { ...input, sourceId: rollbackSourceId, type: NotificationType.PAYMENT_FAILED });
      throw new Error('simulated authoritative transaction rollback');
    }));
    assert.equal(await prisma.notification.count({ where: { idempotencyKey: { startsWith: rollbackSourceId } } }), 0);
  });
});

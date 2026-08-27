import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';

const enabled = process.env.RUN_PAYMENT_DB_INTEGRATION === '1';

describe('PostgreSQL provider-order current-record concurrency', () => {
  it('permits only one current order for a Payment under concurrent inserts', { skip: !enabled }, async () => {
    const first = new PrismaClient();
    const second = new PrismaClient();
    const schema = `e1p4_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^e1p4_[a-f0-9]{32}$/);
    const paymentId = randomUUID();
    try {
      const liveIndex = await first.$queryRawUnsafe<Array<{ indexdef: string }>>(`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'PaymentProviderOrder_one_current_per_payment_idx'
      `);
      assert.equal(liveIndex.length, 1);
      assert.match(liveIndex[0].indexdef, /UNIQUE/);
      assert.match(liveIndex[0].indexdef, /status.*CREATED.*PAID/);

      await first.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await first.$executeRawUnsafe(`CREATE TABLE "${schema}"."provider_order" (
        "id" UUID PRIMARY KEY, "payment_id" UUID NOT NULL, "status" TEXT NOT NULL
      )`);
      await first.$executeRawUnsafe(`CREATE UNIQUE INDEX "one_current" ON "${schema}"."provider_order"("payment_id") WHERE "status" IN ('CREATED', 'PAID')`);
      const insert = (client: PrismaClient, status: string) => client.$executeRawUnsafe(
        `INSERT INTO "${schema}"."provider_order" VALUES ($1::uuid, $2::uuid, $3)`, randomUUID(), paymentId, status,
      );
      const results = await Promise.allSettled([insert(first, 'CREATED'), insert(second, 'PAID')]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
      await insert(first, 'CLOSED');
    } finally {
      await first.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await Promise.all([first.$disconnect(), second.$disconnect()]);
    }
  });
});

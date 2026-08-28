import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';

const enabled = process.env.RUN_PAYMENT_DB_INTEGRATION === '1';

describe('PostgreSQL checkout-confirmation integrity', () => {
  it('enforces complete evidence, one success per Payment, and provider-payment replay protection', { skip: !enabled }, async () => {
    const first = new PrismaClient();
    const second = new PrismaClient();
    const schema = `e1p5_${randomUUID().replaceAll('-', '')}`;
    try {
      const existingConfirmations = await first.paymentAttempt.count({ where: { operation: 'CHECKOUT_CONFIRMATION' } });
      assert.equal(existingConfirmations, 0);
      const indexes = await first.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname IN (
          'PaymentAttempt_one_verified_checkout_per_payment_idx',
          'PaymentAttempt_verified_provider_payment_identity_idx'
        ) ORDER BY indexname
      `);
      assert.equal(indexes.length, 2);
      assert.ok(indexes.every((value) => value.indexdef.includes('UNIQUE')));
      assert.ok(indexes.every((value) => value.indexdef.includes('CHECKOUT_CONFIRMATION') && value.indexdef.includes('SUCCEEDED')));
      const constraints = await first.$queryRawUnsafe<Array<{ conname: string; definition: string }>>(`
        SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid = '"PaymentAttempt"'::regclass
          AND conname = 'PaymentAttempt_checkout_confirmation_evidence_check'
      `);
      assert.equal(constraints.length, 1);
      for (const field of ['providerConfigurationId', 'credentialVersionId', 'providerOrderRecordId', 'providerOrderId', 'providerPaymentId']) {
        assert.match(constraints[0].definition, new RegExp(field));
      }

      await first.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await first.$executeRawUnsafe(`CREATE TABLE "${schema}"."attempt" (
        "id" UUID PRIMARY KEY,
        "paymentId" UUID NOT NULL,
        "providerConfigurationId" UUID,
        "credentialVersionId" UUID,
        "providerOrderRecordId" UUID,
        "operation" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "providerOrderId" TEXT,
        "providerPaymentId" TEXT,
        CHECK (
          "operation" <> 'CHECKOUT_CONFIRMATION' OR (
            "providerConfigurationId" IS NOT NULL AND "credentialVersionId" IS NOT NULL
            AND "providerOrderRecordId" IS NOT NULL
            AND COALESCE(LENGTH(BTRIM("providerOrderId")), 0) > 0
            AND COALESCE(LENGTH(BTRIM("providerPaymentId")), 0) > 0
          )
        )
      )`);
      await first.$executeRawUnsafe(`CREATE UNIQUE INDEX "one_success" ON "${schema}"."attempt"("paymentId") WHERE "operation" = 'CHECKOUT_CONFIRMATION' AND "status" = 'SUCCEEDED'`);
      await first.$executeRawUnsafe(`CREATE UNIQUE INDEX "one_provider_payment" ON "${schema}"."attempt"("providerConfigurationId", "providerPaymentId") WHERE "operation" = 'CHECKOUT_CONFIRMATION' AND "status" = 'SUCCEEDED' AND "providerConfigurationId" IS NOT NULL AND "providerPaymentId" IS NOT NULL`);

      const paymentA = randomUUID(); const paymentB = randomUUID(); const configuration = randomUUID();
      await assert.rejects(() => first.$executeRawUnsafe(
        `INSERT INTO "${schema}"."attempt" ("id", "paymentId", "operation", "status") VALUES ($1::uuid, $2::uuid, 'CHECKOUT_CONFIRMATION', 'PENDING')`, randomUUID(), paymentA,
      ));
      const insert = (client: PrismaClient, payment: string, providerPayment: string) => client.$executeRawUnsafe(
        `INSERT INTO "${schema}"."attempt" VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'CHECKOUT_CONFIRMATION', 'SUCCEEDED', $6, $7)`,
        randomUUID(), payment, configuration, randomUUID(), randomUUID(), 'order_TEST123', providerPayment,
      );
      await insert(first, paymentA, 'pay_FIRST');
      await assert.rejects(() => insert(first, paymentA, 'pay_SECOND'));
      const samePayment = randomUUID();
      const duplicateRace = await Promise.allSettled([insert(first, samePayment, 'pay_DUPLICATE'), insert(second, samePayment, 'pay_DUPLICATE')]);
      assert.equal(duplicateRace.filter((value) => value.status === 'fulfilled').length, 1);
      assert.equal(duplicateRace.filter((value) => value.status === 'rejected').length, 1);
      const race = await Promise.allSettled([insert(first, paymentB, 'pay_SHARED'), insert(second, randomUUID(), 'pay_SHARED')]);
      assert.equal(race.filter((value) => value.status === 'fulfilled').length, 1);
      assert.equal(race.filter((value) => value.status === 'rejected').length, 1);
    } finally {
      await first.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await Promise.all([first.$disconnect(), second.$disconnect()]);
    }
  });
});

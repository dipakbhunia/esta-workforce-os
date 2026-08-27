import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';

const enabled = process.env.RUN_PAYMENT_DB_INTEGRATION === '1';

describe('PostgreSQL provider-operation credential binding', () => {
  it('enforces configuration, payment, order, conditional, and history ownership', { skip: !enabled }, async () => {
    const prisma = new PrismaClient();
    const schema = `e1p4p_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^e1p4p_[a-f0-9]{32}$/);
    const ids = Array.from({ length: 12 }, () => randomUUID());
    const [configurationA, configurationB, credentialA, credentialB, paymentA, paymentB, orderA] = ids;

    try {
      const liveConstraints = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(`
        SELECT "conname" FROM "pg_constraint"
        WHERE "conrelid" IN ('"PaymentAttempt"'::regclass, '"PaymentProviderOrder"'::regclass)
          AND "conname" IN (
            'PaymentAttempt_credential_binding_pair_check',
            'PaymentAttempt_order_create_credential_check',
            'PaymentAttempt_paymentId_providerConfigurationId_fkey',
            'PaymentAttempt_credentialVersionId_providerConfigurationId_fkey',
            'PaymentProviderOrder_credentialVersionId_providerConfigurationId_fkey'
          )
      `);
      assert.equal(liveConstraints.length, 5);
      const [orderCredentialColumn] = await prisma.$queryRawUnsafe<Array<{ is_nullable: string }>>(`
        SELECT "is_nullable" FROM "information_schema"."columns"
        WHERE "table_schema" = 'public' AND "table_name" = 'PaymentProviderOrder' AND "column_name" = 'credentialVersionId'
      `);
      assert.equal(orderCredentialColumn.is_nullable, 'NO');

      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."configuration" ("id" UUID PRIMARY KEY)`);
      await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."credential" (
        "id" UUID NOT NULL,
        "configuration_id" UUID NOT NULL REFERENCES "${schema}"."configuration"("id") ON DELETE RESTRICT,
        "retired_at" TIMESTAMPTZ,
        PRIMARY KEY ("id"), UNIQUE ("id", "configuration_id")
      )`);
      await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."payment" (
        "id" UUID NOT NULL, "configuration_id" UUID NOT NULL,
        PRIMARY KEY ("id"), UNIQUE ("id", "configuration_id")
      )`);
      await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."provider_order" (
        "id" UUID NOT NULL, "payment_id" UUID NOT NULL, "configuration_id" UUID NOT NULL, "credential_id" UUID NOT NULL,
        PRIMARY KEY ("id"), UNIQUE ("id", "payment_id"),
        FOREIGN KEY ("payment_id", "configuration_id") REFERENCES "${schema}"."payment"("id", "configuration_id") ON DELETE RESTRICT,
        FOREIGN KEY ("credential_id", "configuration_id") REFERENCES "${schema}"."credential"("id", "configuration_id") ON DELETE RESTRICT
      )`);
      await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."attempt" (
        "id" UUID PRIMARY KEY, "payment_id" UUID NOT NULL REFERENCES "${schema}"."payment"("id") ON DELETE RESTRICT,
        "provider_order_id" UUID, "configuration_id" UUID, "credential_id" UUID, "operation" TEXT NOT NULL,
        CHECK (("configuration_id" IS NULL AND "credential_id" IS NULL) OR ("configuration_id" IS NOT NULL AND "credential_id" IS NOT NULL)),
        CHECK ("operation" <> 'ORDER_CREATE' OR ("configuration_id" IS NOT NULL AND "credential_id" IS NOT NULL)),
        FOREIGN KEY ("payment_id", "configuration_id") REFERENCES "${schema}"."payment"("id", "configuration_id") ON DELETE RESTRICT,
        FOREIGN KEY ("credential_id", "configuration_id") REFERENCES "${schema}"."credential"("id", "configuration_id") ON DELETE RESTRICT,
        FOREIGN KEY ("provider_order_id", "payment_id") REFERENCES "${schema}"."provider_order"("id", "payment_id") ON DELETE RESTRICT
      )`);

      await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."configuration" VALUES ($1::uuid), ($2::uuid)`, configurationA, configurationB);
      await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."credential" ("id", "configuration_id") VALUES ($1::uuid, $2::uuid), ($3::uuid, $4::uuid)`, credentialA, configurationA, credentialB, configurationB);
      await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."payment" VALUES ($1::uuid, $2::uuid), ($3::uuid, $4::uuid)`, paymentA, configurationA, paymentB, configurationB);

      await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."attempt" VALUES ($1::uuid, $2::uuid, NULL, $3::uuid, $4::uuid, 'ORDER_CREATE')`, randomUUID(), paymentA, configurationA, credentialB));
      await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."provider_order" VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`, randomUUID(), paymentA, configurationA, credentialB));
      await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."provider_order" VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`, randomUUID(), paymentA, configurationB, credentialB));
      await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."attempt" ("id", "payment_id", "operation") VALUES ($1::uuid, $2::uuid, 'ORDER_CREATE')`, randomUUID(), paymentA));

      await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."attempt" ("id", "payment_id", "operation") VALUES ($1::uuid, $2::uuid, 'PROVIDER_FETCH')`, randomUUID(), paymentA);
      await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."provider_order" VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`, orderA, paymentA, configurationA, credentialA);
      await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."attempt" VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'ORDER_CREATE')`, randomUUID(), paymentA, orderA, configurationA, credentialA);
      await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."attempt" VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'PROVIDER_FETCH')`, randomUUID(), paymentB, orderA, configurationB, credentialB));

      await prisma.$executeRawUnsafe(`UPDATE "${schema}"."credential" SET "retired_at" = NOW() WHERE "id" = $1::uuid`, credentialA);
      const [binding] = await prisma.$queryRawUnsafe<Array<{ credential_id: string; retired_at: Date }>>(`SELECT o."credential_id", c."retired_at" FROM "${schema}"."provider_order" o JOIN "${schema}"."credential" c ON c."id" = o."credential_id" WHERE o."id" = $1::uuid`, orderA);
      assert.equal(binding.credential_id, credentialA);
      assert.ok(binding.retired_at instanceof Date);
      await assert.rejects(() => prisma.$executeRawUnsafe(`DELETE FROM "${schema}"."credential" WHERE "id" = $1::uuid`, credentialA));
    } finally {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.$disconnect();
    }
  });
});

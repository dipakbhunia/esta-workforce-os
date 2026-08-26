import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';

const enabled = process.env.RUN_PAYMENT_DB_INTEGRATION === '1';

describe('PostgreSQL billing credential concurrency', () => {
  it('serializes rotations and mode mutation with the configuration row lock', { skip: !enabled }, async () => {
    const prisma = new PrismaClient();
    const schema = `e1p3_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^e1p3_[a-f0-9]{32}$/);
    const configurationId = randomUUID();
    const modeRaceConfigurationId = randomUUID();
    const lock = (tx: PrismaClient, id: string) => tx.$queryRawUnsafe(`SELECT "id" FROM "${schema}"."configuration" WHERE "id" = $1::uuid FOR UPDATE`, id);

    try {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."configuration" (
          "id" UUID PRIMARY KEY,
          "mode" TEXT NOT NULL CHECK ("mode" IN ('TEST', 'LIVE'))
        )`);
      await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."credential" (
          "id" UUID PRIMARY KEY,
          "configuration_id" UUID NOT NULL REFERENCES "${schema}"."configuration"("id"),
          "credential_mode" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "retired_at" TIMESTAMPTZ,
          UNIQUE ("configuration_id", "version")
        )`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "credential_one_effective_idx"
          ON "${schema}"."credential"("configuration_id") WHERE "retired_at" IS NULL`);
      await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."configuration" ("id", "mode") VALUES ($1::uuid, 'TEST'), ($2::uuid, 'TEST')`, configurationId, modeRaceConfigurationId);
      await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."credential" ("id", "configuration_id", "credential_mode", "version") VALUES ($1::uuid, $2::uuid, 'TEST', 1)`, randomUUID(), configurationId);

      const rotate = () => prisma.$transaction(async (tx) => {
        await lock(tx as unknown as PrismaClient, configurationId);
        const [{ next_version: nextVersion }] = await tx.$queryRawUnsafe<Array<{ next_version: number }>>(`SELECT COALESCE(MAX("version"), 0) + 1 AS "next_version" FROM "${schema}"."credential" WHERE "configuration_id" = $1::uuid`, configurationId);
        await tx.$executeRawUnsafe(`UPDATE "${schema}"."credential" SET "retired_at" = NOW() WHERE "configuration_id" = $1::uuid AND "retired_at" IS NULL`, configurationId);
        await tx.$executeRawUnsafe(`INSERT INTO "${schema}"."credential" ("id", "configuration_id", "credential_mode", "version") VALUES ($1::uuid, $2::uuid, 'TEST', $3)`, randomUUID(), configurationId, nextVersion);
      });
      await Promise.all([rotate(), rotate()]);

      const versions = await prisma.$queryRawUnsafe<Array<{ version: number; retired_at: Date | null }>>(`SELECT "version", "retired_at" FROM "${schema}"."credential" WHERE "configuration_id" = $1::uuid ORDER BY "version"`, configurationId);
      assert.deepEqual(versions.map((row) => row.version), [1, 2, 3]);
      assert.equal(versions.filter((row) => row.retired_at === null).length, 1);

      let releaseConfigurationLock!: () => void;
      const configurationLocked = new Promise<void>((resolve) => { releaseConfigurationLock = resolve; });
      let continueConfiguration!: () => void;
      const continueAfterModeStarts = new Promise<void>((resolve) => { continueConfiguration = resolve; });
      const configure = prisma.$transaction(async (tx) => {
        await lock(tx as unknown as PrismaClient, modeRaceConfigurationId);
        releaseConfigurationLock();
        await continueAfterModeStarts;
        const [{ mode }] = await tx.$queryRawUnsafe<Array<{ mode: string }>>(`SELECT "mode" FROM "${schema}"."configuration" WHERE "id" = $1::uuid`, modeRaceConfigurationId);
        await tx.$executeRawUnsafe(`INSERT INTO "${schema}"."credential" ("id", "configuration_id", "credential_mode", "version") VALUES ($1::uuid, $2::uuid, $3, 1)`, randomUUID(), modeRaceConfigurationId, mode);
      });
      await configurationLocked;
      const mutateMode = prisma.$transaction(async (tx) => {
        await lock(tx as unknown as PrismaClient, modeRaceConfigurationId);
        const [{ count }] = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS "count" FROM "${schema}"."credential" WHERE "configuration_id" = $1::uuid`, modeRaceConfigurationId);
        if (count === 0n) await tx.$executeRawUnsafe(`UPDATE "${schema}"."configuration" SET "mode" = 'LIVE' WHERE "id" = $1::uuid`, modeRaceConfigurationId);
      });
      continueConfiguration();
      await Promise.all([configure, mutateMode]);
      const [state] = await prisma.$queryRawUnsafe<Array<{ mode: string; credential_mode: string }>>(`SELECT c."mode", k."credential_mode" FROM "${schema}"."configuration" c JOIN "${schema}"."credential" k ON k."configuration_id" = c."id" WHERE c."id" = $1::uuid`, modeRaceConfigurationId);
      assert.deepEqual(state, { mode: 'TEST', credential_mode: 'TEST' });

      await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."credential" ("id", "configuration_id", "credential_mode", "version") VALUES ($1::uuid, $2::uuid, 'TEST', 4)`, randomUUID(), configurationId));
    } finally {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.$disconnect();
    }
  });
});

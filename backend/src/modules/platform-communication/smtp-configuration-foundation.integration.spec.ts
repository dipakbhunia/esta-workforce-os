import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SmtpConfigurationLifecycleService } from './smtp-configuration-lifecycle.service';

const enabled = process.env.RUN_POSTGRES_INTEGRATION_TESTS === '1';
const prisma = enabled ? new PrismaClient() : null;
const encrypted = Buffer.from('{"v":1}');

after(async () => prisma?.$disconnect());

async function createActor(label: string) {
  assert.ok(prisma);
  return prisma.user.create({ data: {
    email: `ec-b1-${label}-${randomUUID()}@example.invalid`, passwordHash: 'integration-only',
    firstName: 'EC-B1', lastName: label,
  }, select: { id: true } });
}

async function insertConfiguration(options: {
  lifecycle?: 'DRAFT' | 'VALIDATED' | 'TESTED' | 'REVOKED';
  port?: number; securityMode?: 'IMPLICIT_TLS' | 'STARTTLS'; actorId?: string | null;
  activated?: boolean; revoked?: boolean;
} = {}) {
  assert.ok(prisma);
  const id = randomUUID();
  const now = new Date();
  const lifecycle = options.lifecycle ?? 'DRAFT';
  const validated = lifecycle !== 'DRAFT' ? now : null;
  const tested = lifecycle === 'TESTED' || lifecycle === 'REVOKED' ? now : null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SmtpConfigurationVersion" (
      "id", "lifecycle", "host", "port", "securityMode", "username", "encryptedPassword",
      "encryptionKeyId", "senderEmail", "senderDisplayName", "structurallyValidatedAt",
      "connectionTestedAt", "connectionTestSucceeded", "connectionTestResultCode",
      "firstActivatedAt", "lastActivatedAt", "activatedByUserId", "revokedAt", "revokedByUserId",
      "createdAt", "updatedAt"
    ) VALUES ($1::uuid, $2::"SmtpConfigurationLifecycle", 'smtp.example.test', $3,
      $4::"SmtpSecurityMode", 'mailer@example.test', $5::bytea, 'test-key', 'sender@example.test',
      'Sender', $6, $7, $8, $9, $10, $11, $12::uuid, $13, $14::uuid, $15, $15)`,
    id, lifecycle, options.port ?? 587, options.securityMode ?? 'STARTTLS', encrypted,
    validated, tested, tested === null ? null : true, tested === null ? null : 'SUCCESS',
    options.activated ? now : null, options.activated ? now : null,
    options.activated ? options.actorId ?? null : null,
    options.revoked ? now : null, options.revoked ? options.actorId ?? null : null, now,
  );
  return id;
}

async function deleteConfigurations(ids: string[]) {
  assert.ok(prisma);
  if (ids.length) await prisma.smtpConfigurationVersion.deleteMany({ where: { id: { in: ids } } });
}

describe('SMTP configuration PostgreSQL foundation', { skip: !enabled }, () => {
  it('enforces the singleton and starts disabled without an active configuration', async () => {
    assert.ok(prisma);
    const first = randomUUID(); const second = randomUUID();
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PlatformEmailSettings" ("id", "scope", "createdAt", "updatedAt") VALUES ($1::uuid, 'PLATFORM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, first,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ enabled: boolean; activeConfigurationVersionId: string | null }>>(
        `SELECT "enabled", "activeConfigurationVersionId" FROM "PlatformEmailSettings" WHERE "id" = $1::uuid`, first,
      );
      assert.deepEqual(rows[0], { enabled: false, activeConfigurationVersionId: null });
      await assert.rejects(() => prisma.$executeRawUnsafe(
        `INSERT INTO "PlatformEmailSettings" ("id", "scope", "createdAt", "updatedAt") VALUES ($1::uuid, 'PLATFORM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, second,
      ));
      await assert.rejects(() => prisma.$executeRawUnsafe(
        `UPDATE "PlatformEmailSettings" SET "enabled" = TRUE WHERE "id" = $1::uuid`, first,
      ));
    } finally {
      await prisma.platformEmailSettings.deleteMany({ where: { id: { in: [first, second] } } });
    }
  });

  it('generates ordered unique versions and enforces port/security combinations', async () => {
    assert.ok(prisma);
    const ids: string[] = [];
    try {
      ids.push(...await Promise.all([
        insertConfiguration(),
        insertConfiguration({ port: 465, securityMode: 'IMPLICIT_TLS' }),
      ]));
      const rows = await prisma.smtpConfigurationVersion.findMany({
        where: { id: { in: ids } }, select: { version: true }, orderBy: { version: 'asc' },
      });
      assert.equal(rows.length, 2); assert.ok(rows[1].version > rows[0].version);
      await assert.rejects(() => prisma.$executeRawUnsafe(
        `INSERT INTO "SmtpConfigurationVersion" ("id", "version", "host", "port", "securityMode", "username", "encryptedPassword", "encryptionKeyId", "senderEmail", "senderDisplayName", "createdAt", "updatedAt")
         VALUES ($1::uuid, $2, 'smtp.example.test', 587, 'STARTTLS', 'mailer', $3::bytea, 'key', 'sender@example.test', 'Sender', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        randomUUID(), rows[0].version, encrypted,
      ));
      await assert.rejects(() => insertConfiguration({ port: 587, securityMode: 'IMPLICIT_TLS' }));
      await assert.rejects(() => insertConfiguration({ port: 465, securityMode: 'STARTTLS' }));
    } finally { await deleteConfigurations(ids); }
  });

  it('requires coherent lifecycle and valid actor evidence before activation or revocation', async () => {
    assert.ok(prisma);
    const actor = await createActor('Actor'); const ids: string[] = [];
    try {
      await assert.rejects(() => prisma.$executeRawUnsafe(
        `INSERT INTO "SmtpConfigurationVersion" ("id", "lifecycle", "host", "port", "securityMode", "username", "encryptedPassword", "encryptionKeyId", "senderEmail", "senderDisplayName", "createdAt", "updatedAt")
         VALUES ($1::uuid, 'VALIDATED', 'smtp.example.test', 587, 'STARTTLS', 'mailer', $2::bytea, 'key', 'sender@example.test', 'Sender', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, randomUUID(), encrypted,
      ));
      await assert.rejects(() => insertConfiguration({ lifecycle: 'TESTED', activated: true }));
      await assert.rejects(() => insertConfiguration({ lifecycle: 'TESTED', activated: true, actorId: randomUUID() }));
      await assert.rejects(() => insertConfiguration({ lifecycle: 'REVOKED', revoked: true }));
      ids.push(await insertConfiguration({ lifecycle: 'TESTED', activated: true, actorId: actor.id }));
      ids.push(await insertConfiguration({ lifecycle: 'REVOKED', revoked: true, actorId: actor.id }));
    } finally { await deleteConfigurations(ids); await prisma.user.delete({ where: { id: actor.id } }); }
  });

  it('rejects invalid active targets and protects active and activated configurations', async () => {
    assert.ok(prisma);
    const actor = await createActor('Protection'); const settingsId = randomUUID();
    const ids = [await insertConfiguration(), await insertConfiguration({ lifecycle: 'TESTED' }),
      await insertConfiguration({ lifecycle: 'TESTED', activated: true, actorId: actor.id }),
      await insertConfiguration({ lifecycle: 'REVOKED', revoked: true, actorId: actor.id })];
    try {
      for (const invalidId of [ids[0], ids[1], ids[3]]) {
        await assert.rejects(() => prisma.$executeRawUnsafe(
          `INSERT INTO "PlatformEmailSettings" ("id", "activeConfigurationVersionId", "createdAt", "updatedAt") VALUES ($1::uuid, $2::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, settingsId, invalidId,
        ));
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PlatformEmailSettings" ("id", "enabled", "activeConfigurationVersionId", "createdAt", "updatedAt") VALUES ($1::uuid, TRUE, $2::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, settingsId, ids[2],
      );
      await assert.rejects(() => prisma.smtpConfigurationVersion.update({ where: { id: ids[2] }, data: { host: 'changed.example.test' } }));
      await assert.rejects(() => prisma.smtpConfigurationVersion.update({ where: { id: ids[2] }, data: { lifecycle: 'VALIDATED' } }));
      await assert.rejects(() => prisma.smtpConfigurationVersion.delete({ where: { id: ids[2] } }));
    } finally {
      await prisma.platformEmailSettings.deleteMany({ where: { id: settingsId } });
      await deleteConfigurations(ids); await prisma.user.delete({ where: { id: actor.id } });
    }
  });

  it('preserves activation and revocation history after historical actors are deleted', async () => {
    assert.ok(prisma);
    const activationActor = await createActor('Activation'); const revocationActor = await createActor('Revocation');
    const activatedId = await insertConfiguration({ lifecycle: 'TESTED', activated: true, actorId: activationActor.id });
    const revokedId = await insertConfiguration({ lifecycle: 'REVOKED', revoked: true, actorId: revocationActor.id });
    try {
      await prisma.user.delete({ where: { id: activationActor.id } });
      await prisma.user.delete({ where: { id: revocationActor.id } });
      const activated = await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: activatedId } });
      const revoked = await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: revokedId } });
      assert.ok(activated.firstActivatedAt); assert.ok(activated.lastActivatedAt);
      assert.equal(activated.activatedByUserId, null);
      assert.ok(revoked.revokedAt); assert.equal(revoked.revokedByUserId, null);
    } finally {
      await deleteConfigurations([activatedId, revokedId]);
      await prisma.user.deleteMany({ where: { id: { in: [activationActor.id, revocationActor.id] } } });
    }
  });

  it('rolls back configuration and audit evidence as one transaction', async () => {
    assert.ok(prisma);
    const id = randomUUID();
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      await tx.smtpConfigurationVersion.create({ data: {
        id, host: 'smtp.example.test', port: 587, securityMode: 'STARTTLS', username: 'mailer',
        encryptedPassword: encrypted, encryptionKeyId: 'test-key', senderEmail: 'sender@example.test', senderDisplayName: 'Sender',
      } });
      await tx.auditLog.create({ data: { action: 'SMTP_CONFIGURATION_DRAFT_CREATED', entityType: 'SmtpConfigurationVersion', entityId: id } });
      throw new Error('ROLLBACK_PROBE');
    }));
    assert.equal(await prisma.smtpConfigurationVersion.count({ where: { id } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { action: 'SMTP_CONFIGURATION_DRAFT_CREATED', entityId: id } }), 0);
  });

  it('atomically enforces the connection-test rate limit across database clients', async () => {
    assert.ok(prisma);
    const actor = await createActor('RateLimit');
    const ids = await Promise.all(Array.from({ length: 6 }, () => insertConfiguration({ lifecycle: 'VALIDATED' })));
    const clients = Array.from({ length: 6 }, () => new PrismaClient());
    try {
      const services = clients.map((client) => new SmtpConfigurationLifecycleService(
        client as never,
        { decrypt: () => 'integration-password' } as never,
        { verify: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { success: true, category: 'SUCCESS' as const };
        } } as never,
      ));
      const results = await Promise.allSettled(services.map((service, index) =>
        service.testConnection(ids[index], { revision: 1 }, { id: actor.id } as never)));
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      assert.equal(fulfilled.length, 5, rejected.map((result) => String(result.reason)).join('; '));
      assert.equal(rejected.length, 1);
      assert.ok(rejected[0].reason instanceof HttpException);
      assert.equal((rejected[0].reason as HttpException).getStatus(), 429);
      assert.equal(await prisma.auditLog.count({
        where: { actorUserId: actor.id, action: 'SMTP_CONNECTION_TEST_STARTED', entityId: { in: ids } },
      }), 5);
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
      await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
      await deleteConfigurations(ids);
      await prisma.user.delete({ where: { id: actor.id } });
    }
  });
});

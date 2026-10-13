import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { PrismaClient, RoleName } from '@prisma/client';
import { SmtpConfigurationAuthorityService } from './smtp-configuration-authority.service';

const enabled = process.env.RUN_POSTGRES_INTEGRATION_TESTS === '1';
const prisma = enabled ? new PrismaClient() : null;
after(async () => prisma?.$disconnect());

async function createConfiguration(actor: { id: string; email: string }) {
  assert.ok(prisma);
  const configuration = await prisma.smtpConfigurationVersion.create({ data: {
    lifecycle: 'TESTED', host: 'smtp.example.test', port: 587, securityMode: 'STARTTLS', username: 'mailer',
    encryptedPassword: Buffer.from('encrypted'), encryptionKeyId: 'integration-key', senderEmail: 'sender@example.test', senderDisplayName: 'Sender',
    structurallyValidatedAt: new Date(), connectionTestedAt: new Date(), connectionTestSucceeded: true,
    connectionTestResultCode: 'SUCCESS', restrictedTestEmailSentAt: new Date(), restrictedTestEmailAddress: actor.email,
  } });
  await prisma.auditLog.create({ data: { actorUserId: actor.id, action: 'SMTP_TEST_EMAIL_ATTEMPT_COMPLETED', entityType: 'SmtpConfigurationVersion', entityId: configuration.id,
    metadata: { version: configuration.version, revision: configuration.revision, acceptedByProvider: true, persistedSuccessEvidence: true } } });
  return configuration;
}

async function fixture() {
  assert.ok(prisma);
  const suffix = randomUUID();
  const role = await prisma.role.create({ data: { key: `EC_B2D2_${suffix}`, name: 'EC-B2D.2', systemName: RoleName.SUPER_ADMIN } });
  const actor = await prisma.user.create({ data: { email: `${suffix}@example.invalid`, passwordHash: 'integration-only', firstName: 'SMTP', lastName: 'Authority', roles: { create: { roleId: role.id } } } });
  const configuration = await createConfiguration(actor);
  return { role, actor, configuration };
}

function service(client: PrismaClient) { return new SmtpConfigurationAuthorityService(client as never,
  { decrypt: () => 'integration-password' } as never, { get: () => true } as never); }

async function cleanup(ids: { actor: string; role: string; configurations: string[] }) {
  assert.ok(prisma);
  await prisma.platformEmailSettings.deleteMany();
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: ids.actor }, { entityId: { in: ids.configurations } }] } });
  await prisma.smtpConfigurationVersion.deleteMany({ where: { id: { in: ids.configurations } } });
  await prisma.user.deleteMany({ where: { id: ids.actor } });
  await prisma.role.deleteMany({ where: { id: ids.role } });
}

describe('SMTP permanent authority PostgreSQL lifecycle', { skip: !enabled }, () => {
  it('establishes permanent authority and retains it through disable and enable', async () => {
    assert.ok(prisma); const f = await fixture(); const rotation = await createConfiguration(f.actor); const unavailable = await createConfiguration(f.actor);
    try {
      const authority = service(prisma);
      const activated = await authority.activate(f.configuration.id, { settingsRevision: 0, targetRevision: 1 }, { id: f.actor.id } as never);
      assert.equal(activated.enabled, true); assert.ok(activated.databaseAuthorityEstablishedAt);
      const established = activated.databaseAuthorityEstablishedAt;
      const disabled = await authority.disable({ settingsRevision: 1 }, { id: f.actor.id } as never);
      assert.equal(disabled.enabled, false); assert.equal(disabled.activeConfigurationVersionId, f.configuration.id);
      const reenabled = await authority.enable({ settingsRevision: 2 }, { id: f.actor.id } as never);
      assert.equal(reenabled.enabled, true); assert.deepEqual(reenabled.databaseAuthorityEstablishedAt, established);
      const rotated = await authority.activate(rotation.id, { settingsRevision: 3, targetRevision: 1 }, { id: f.actor.id } as never);
      assert.equal(rotated.activeConfigurationVersionId, rotation.id);
      const rolledBack = await authority.rollback(f.configuration.id, { settingsRevision: 4, targetRevision: 1 }, { id: f.actor.id } as never);
      assert.equal(rolledBack.activeConfigurationVersionId, f.configuration.id);
      const unavailableService = new SmtpConfigurationAuthorityService(prisma as never,
        { decrypt: () => { throw new Error('missing key'); } } as never, { get: () => true } as never);
      await assert.rejects(() => unavailableService.activate(unavailable.id, { settingsRevision: 5, targetRevision: 1 }, { id: f.actor.id } as never));
      assert.equal((await prisma.platformEmailSettings.findUniqueOrThrow({ where: { scope: 'PLATFORM' } })).revision, 5);
      await assert.rejects(() => prisma.$executeRaw`UPDATE "PlatformEmailSettings" SET "databaseAuthorityEstablishedAt" = NULL`);
      await assert.rejects(() => prisma.$executeRaw`UPDATE "PlatformEmailSettings" SET "activeConfigurationVersionId" = NULL`);
    } finally { await cleanup({ actor: f.actor.id, role: f.role.id, configurations: [f.configuration.id, rotation.id, unavailable.id] }); }
  });

  it('serializes competing first activations so exactly one revision-fenced request wins', async () => {
    assert.ok(prisma); const a = await fixture(); const second = await createConfiguration(a.actor);
    const clients = [new PrismaClient(), new PrismaClient()];
    try {
      const results = await Promise.allSettled([
        service(clients[0]).activate(a.configuration.id, { settingsRevision: 0, targetRevision: 1 }, { id: a.actor.id } as never),
        service(clients[1]).activate(second.id, { settingsRevision: 0, targetRevision: 1 }, { id: a.actor.id } as never),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
      const settings = await prisma.platformEmailSettings.findUniqueOrThrow({ where: { scope: 'PLATFORM' } });
      assert.equal(settings.revision, 1); assert.ok(settings.databaseAuthorityEstablishedAt);
      assert.ok([a.configuration.id, second.id].includes(settings.activeConfigurationVersionId!));
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
      await prisma.platformEmailSettings.deleteMany();
      await cleanup({ actor: a.actor.id, role: a.role.id, configurations: [a.configuration.id, second.id] });
    }
  });
});

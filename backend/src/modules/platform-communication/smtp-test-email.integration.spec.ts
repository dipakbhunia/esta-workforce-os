import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { PrismaClient, RoleName, SmtpConfigurationLifecycle, SmtpSecurityMode, UserStatus } from '@prisma/client';
import { SmtpTestEmailService } from './smtp-test-email.service';

const enabled = process.env.RUN_POSTGRES_INTEGRATION_TESTS === '1';
const prisma = enabled ? new PrismaClient() : null;
const clients: PrismaClient[] = [];
const actorIds: string[] = [];
const roleIds: string[] = [];
const configurationIds: string[] = [];

after(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()));
  if (prisma) {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: actorIds } } });
    await prisma.smtpConfigurationVersion.deleteMany({ where: { id: { in: configurationIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: actorIds } } });
    await prisma.user.deleteMany({ where: { id: { in: actorIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.$disconnect();
  }
});

async function fixture() {
  assert.ok(prisma);
  const role = await prisma.role.create({ data: {
    companyId: null, key: `ec-b2c-${randomUUID()}`, name: 'EC-B2C Super Admin', systemName: RoleName.SUPER_ADMIN,
  } });
  roleIds.push(role.id);
  const email = `ec-b2c-${randomUUID()}@example.invalid`;
  const actor = await prisma.user.create({ data: {
    companyId: null, email, emailRevision: 2, verifiedEmail: email, emailVerifiedAt: new Date(),
    passwordHash: 'integration-only', firstName: 'EC-B2C', lastName: 'Actor', status: UserStatus.ACTIVE,
    roles: { create: { roleId: role.id } },
  } });
  actorIds.push(actor.id);
  const configuration = await prisma.smtpConfigurationVersion.create({ data: {
    lifecycle: SmtpConfigurationLifecycle.TESTED, host: 'smtp.example.test', port: 587,
    securityMode: SmtpSecurityMode.STARTTLS, username: 'mailer', encryptedPassword: Buffer.from('integration-only'),
    encryptionKeyId: 'integration-key', senderEmail: 'sender@example.test', senderDisplayName: 'Sender',
    structurallyValidatedAt: new Date(), connectionTestedAt: new Date(), connectionTestSucceeded: true,
    connectionTestResultCode: 'SUCCESS', createdByUserId: actor.id,
  } });
  configurationIds.push(configuration.id);
  return { actor, configuration, email };
}

describe('restricted SMTP test email PostgreSQL concurrency', { skip: !enabled }, () => {
  it('atomically admits only three concurrent attempts and persists exact current-recipient evidence', async () => {
    assert.ok(prisma);
    const db = prisma;
    const { actor, configuration, email } = await fixture();
    const sent: string[] = [];
    const services = Array.from({ length: 4 }, () => {
      const client = new PrismaClient(); clients.push(client);
      return new SmtpTestEmailService(client as never, { decrypt: () => 'integration-password' } as never, {
        sendTestEmail: async (_snapshot: unknown, _password: string, message: { recipient: string }) => {
          sent.push(message.recipient); await new Promise((resolve) => setTimeout(resolve, 50));
          return { accepted: true, category: 'ACCEPTED' as const };
        },
      } as never);
    });
    const authenticated = { id: actor.id, companyId: null, email, status: UserStatus.ACTIVE,
      firstName: actor.firstName, lastName: actor.lastName, roles: [RoleName.SUPER_ADMIN] };
    const results = await Promise.allSettled(services.map((service) =>
      service.send(configuration.id, { revision: configuration.revision }, authenticated)));
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.equal(fulfilled.length, 3, rejected.map((result) => String(result.reason)).join('; '));
    assert.equal(rejected.length, 1); assert.ok(rejected[0].reason instanceof HttpException);
    assert.equal((rejected[0].reason as HttpException).getStatus(), 429);
    assert.deepEqual(sent, [email, email, email]);
    assert.equal(await db.auditLog.count({ where: { actorUserId: actor.id, action: 'SMTP_TEST_EMAIL_ATTEMPT_STARTED' } }), 3);
    const evidence = await db.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configuration.id } });
    assert.ok(evidence.restrictedTestEmailSentAt); assert.equal(evidence.restrictedTestEmailAddress, email);
  });
});

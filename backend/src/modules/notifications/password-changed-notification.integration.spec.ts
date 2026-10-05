import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { NotificationChannel, NotificationType, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { NotificationRecipientResolver } from './notification-recipient-resolver.service';
import { NotificationsService } from './notifications.service';
import { UsersService } from '../users/users.service';

const enabled = process.env.RUN_PASSWORD_CHANGED_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-E PostgreSQL password-changed notification', () => {
  const suffix = randomUUID();
  const userIds: string[] = [];
  let companyId: string;

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: { name: `PC-E ${suffix}`, slug: `pc-e-${suffix}` },
      select: { id: true },
    });
    companyId = company.id;
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (companyId) await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('persists tenant and platform events atomically, deduplicates replay, and preserves distinct mutations', async () => {
    const tenantUser = await createUser(companyId, 'tenant');
    const platformUser = await createUser(null, 'platform');
    const service = new NotificationsService(
      prisma as never,
      new NotificationRecipientResolver(prisma as never),
      {} as never,
      {} as never,
    );
    const firstEvent = randomUUID();
    const secondEvent = randomUUID();
    const duplicateResults = await Promise.all([
      service.createPasswordChangedEmail({
        passwordMutationEventId: firstEvent,
        targetUserId: tenantUser.id,
        payload: {},
      }),
      service.createPasswordChangedEmail({
        passwordMutationEventId: firstEvent,
        targetUserId: tenantUser.id,
        payload: {},
      }),
    ]);
    assert.deepEqual(duplicateResults.map((result) => result.created).sort(), [false, true]);
    assert.deepEqual(await service.createPasswordChangedEmail({
      passwordMutationEventId: secondEvent,
      targetUserId: tenantUser.id,
      payload: {},
    }), { created: true });
    assert.deepEqual(await service.createPasswordChangedEmail({
      passwordMutationEventId: randomUUID(),
      targetUserId: platformUser.id,
      payload: {},
    }), { created: true });

    const tenantRows = await prisma.notification.findMany({
      where: { userId: tenantUser.id, type: NotificationType.PASSWORD_CHANGED },
      include: { deliveries: true },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(tenantRows.length, 2);
    assert.ok(tenantRows.every((row) => row.companyId === companyId));
    assert.ok(tenantRows.every((row) => row.alertId === null && row.severity === null && row.detailsPath === null));
    assert.ok(tenantRows.every((row) => row.deliveries.length === 1));
    assert.ok(tenantRows.every((row) => row.deliveries[0].channel === NotificationChannel.EMAIL));
    assert.ok(tenantRows.every((row) => row.deliveries[0].recipient === tenantUser.email));
    assert.notEqual(tenantRows[0].idempotencyKey, tenantRows[1].idempotencyKey);
    assert.equal(tenantRows.filter((row) => row.idempotencyKey.startsWith(firstEvent)).length, 1);

    const platformRow = await prisma.notification.findFirstOrThrow({
      where: { userId: platformUser.id, type: NotificationType.PASSWORD_CHANGED },
      include: { deliveries: true },
    });
    assert.equal(platformRow.companyId, null);
    assert.equal(platformRow.deliveries.length, 1);
    assert.equal(platformRow.deliveries[0].recipient, platformUser.email);
  });

  it('rolls back the password update and creates no notification when token revocation fails', async () => {
    const originalHash = await bcrypt.hash('current-password', 4);
    const user = await prisma.user.create({
      data: {
        companyId,
        email: `pc-e-rollback-${suffix}@example.invalid`,
        passwordHash: originalHash,
        firstName: 'PC-E',
        lastName: 'Rollback',
      },
      select: { id: true, email: true },
    });
    userIds.push(user.id);
    await prisma.refreshToken.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const notificationService = new NotificationsService(
      prisma as never,
      new NotificationRecipientResolver(prisma as never),
      {} as never,
      {} as never,
    );
    const users = new UsersService(prisma as never, notificationService);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION pc_e_reject_token_revocation() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'PC-E token revocation rollback probe'; END;
        $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER pc_e_reject_token_revocation_trigger
        BEFORE UPDATE ON "RefreshToken"
        FOR EACH ROW WHEN (OLD."userId" = '${user.id}'::uuid)
        EXECUTE FUNCTION pc_e_reject_token_revocation()
      `);
      await assert.rejects(() => users.changePassword(
        { currentPassword: 'current-password', newPassword: 'replacement-password' },
        {
          id: user.id,
          companyId,
          email: user.email,
          firstName: 'PC-E',
          lastName: 'Rollback',
          status: UserStatus.ACTIVE,
          roles: [RoleName.EMPLOYEE],
        },
      ));
      const durableUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.equal(durableUser.passwordHash, originalHash);
      assert.equal(await prisma.notification.count({
        where: { userId: user.id, type: NotificationType.PASSWORD_CHANGED },
      }), 0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS pc_e_reject_token_revocation_trigger ON "RefreshToken"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS pc_e_reject_token_revocation()');
    }
  });

  async function createUser(company: string | null, label: string) {
    const user = await prisma.user.create({
      data: {
        companyId: company,
        email: `pc-e-${label}-${suffix}@example.invalid`,
        passwordHash: 'integration-only-hash',
        firstName: 'PC-E',
        lastName: label,
      },
      select: { id: true, email: true },
    });
    userIds.push(user.id);
    return user;
  }
});

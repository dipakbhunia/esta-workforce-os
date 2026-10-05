import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { NotificationChannel, NotificationType, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import { NotificationRecipientResolver } from './notification-recipient-resolver.service';
import { NotificationsService } from './notifications.service';
import { UsersService } from '../users/users.service';

const enabled = process.env.RUN_ACCOUNT_STATUS_CHANGED_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-F PostgreSQL account-status notification', () => {
  const suffix = randomUUID();
  const userIds: string[] = [];
  const roleIds: string[] = [];
  let companyId: string;

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: { name: `PC-F ${suffix}`, slug: `pc-f-${suffix}` }, select: { id: true },
    });
    companyId = company.id;
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    if (companyId) await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('persists tenant and platform snapshots atomically with concurrent idempotency', async () => {
    const tenant = await createUser(companyId, 'tenant');
    const platform = await createUser(null, 'platform');
    const service = notificationService();
    const sharedEvent = randomUUID();
    const duplicateResults = await Promise.all([
      service.createAccountStatusChangedEmail({ statusMutationEventId: sharedEvent, targetUserId: tenant.id,
        payload: { previousStatus: UserStatus.ACTIVE, status: UserStatus.INACTIVE } }),
      service.createAccountStatusChangedEmail({ statusMutationEventId: sharedEvent, targetUserId: tenant.id,
        payload: { previousStatus: UserStatus.ACTIVE, status: UserStatus.INACTIVE } }),
    ]);
    assert.deepEqual(duplicateResults.map((value) => value.created).sort(), [false, true]);
    await service.createAccountStatusChangedEmail({ statusMutationEventId: randomUUID(), targetUserId: tenant.id,
      payload: { previousStatus: UserStatus.INACTIVE, status: UserStatus.ACTIVE } });
    await service.createAccountStatusChangedEmail({ statusMutationEventId: randomUUID(), targetUserId: platform.id,
      payload: { previousStatus: UserStatus.ACTIVE, status: UserStatus.SUSPENDED } });

    const tenantRows = await prisma.notification.findMany({
      where: { userId: tenant.id, type: NotificationType.ACCOUNT_STATUS_CHANGED },
      include: { deliveries: true }, orderBy: { createdAt: 'asc' },
    });
    assert.equal(tenantRows.length, 2);
    assert.ok(tenantRows.every((row) => row.companyId === companyId && row.alertId === null &&
      row.severity === null && row.detailsPath === null && row.deliveries.length === 1));
    assert.ok(tenantRows.every((row) => row.deliveries[0].channel === NotificationChannel.EMAIL &&
      row.deliveries[0].recipient === tenant.email));
    assert.equal(tenantRows.filter((row) => row.idempotencyKey.startsWith(sharedEvent)).length, 1);
    assert.notEqual(tenantRows[0].idempotencyKey, tenantRows[1].idempotencyKey);

    const platformRow = await prisma.notification.findFirstOrThrow({
      where: { userId: platform.id, type: NotificationType.ACCOUNT_STATUS_CHANGED }, include: { deliveries: true },
    });
    assert.equal(platformRow.companyId, null);
    assert.equal(platformRow.deliveries[0].recipient, platform.email);
  });

  it('uses transaction-current status and creates nothing when token revocation rolls back', async () => {
    const current = await createUser(companyId, 'transaction-current');
    const observed: Array<Record<string, unknown>> = [];
    const users = new UsersService(prisma as never, {
      createAccountStatusChangedEmail: async (input: Record<string, unknown>) => { observed.push(input); return { created: true }; },
    } as never);
    const originalFindOne = users.findOne.bind(users);
    let staleObservation: UserStatus | undefined;
    users.findOne = async (...args: Parameters<UsersService['findOne']>) => {
      const earlier = await originalFindOne(...args);
      staleObservation = earlier.status;
      await prisma.user.update({
        where: { id: current.id },
        data: { status: UserStatus.SUSPENDED },
      });
      return earlier;
    };
    const actor = {
      id: randomUUID(), companyId, email: 'actor@example.invalid', firstName: 'Company', lastName: 'Admin',
      status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN],
    };
    await users.setStatus(current.id, { status: UserStatus.INACTIVE }, actor);
    users.findOne = originalFindOne;
    assert.equal(staleObservation, UserStatus.ACTIVE);
    assert.deepEqual(observed[0].payload, { previousStatus: UserStatus.SUSPENDED, status: UserStatus.INACTIVE });

    await prisma.user.update({ where: { id: current.id }, data: { status: UserStatus.ACTIVE } });
    await prisma.refreshToken.create({ data: {
      id: randomUUID(), userId: current.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
    } });
    const beforeCount = observed.length;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION pc_f_reject_token_revocation() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'PC-F token revocation rollback probe'; END;
        $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER pc_f_reject_token_revocation_trigger
        BEFORE UPDATE ON "RefreshToken"
        FOR EACH ROW WHEN (OLD."userId" = '${current.id}'::uuid)
        EXECUTE FUNCTION pc_f_reject_token_revocation()
      `);
      await assert.rejects(() => users.setStatus(current.id, { status: UserStatus.SUSPENDED }, actor));
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: current.id } })).status, UserStatus.ACTIVE);
      assert.equal(observed.length, beforeCount);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS pc_f_reject_token_revocation_trigger ON "RefreshToken"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS pc_f_reject_token_revocation()');
    }
  });

  it('creates no notification when the final active platform SUPER_ADMIN is protected', async () => {
    const role = await prisma.role.create({ data: {
      key: `pc-f-super-admin-${suffix}`, name: `PC-F Super Admin ${suffix}`, systemName: RoleName.SUPER_ADMIN,
    }, select: { id: true } });
    roleIds.push(role.id);
    const target = await prisma.user.create({ data: {
      email: `pc-f-final-admin-${suffix}@example.invalid`, passwordHash: 'integration-only-hash',
      firstName: 'PC-F', lastName: 'Final Admin', roles: { create: { roleId: role.id } },
    }, select: { id: true, email: true } });
    userIds.push(target.id);
    let enqueueCount = 0;
    const users = new UsersService(prisma as never, {
      createAccountStatusChangedEmail: async () => { enqueueCount += 1; return { created: true }; },
    } as never);
    await assert.rejects(() => users.setStatus(target.id, { status: UserStatus.SUSPENDED }, {
      id: randomUUID(), companyId: null, email: 'actor@example.invalid', firstName: 'Platform', lastName: 'Actor',
      status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN],
    }));
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status, UserStatus.ACTIVE);
    assert.equal(enqueueCount, 0);
    assert.equal(await prisma.notification.count({
      where: { userId: target.id, type: NotificationType.ACCOUNT_STATUS_CHANGED },
    }), 0);
  });

  function notificationService() {
    return new NotificationsService(prisma as never, new NotificationRecipientResolver(prisma as never), {} as never, {} as never);
  }

  async function createUser(company: string | null, label: string) {
    const user = await prisma.user.create({ data: {
      companyId: company, email: `pc-f-${label}-${suffix}@example.invalid`, passwordHash: 'integration-only-hash',
      firstName: 'PC-F', lastName: label,
    }, select: { id: true, email: true } });
    userIds.push(user.id);
    return user;
  }
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import {
  PLATFORM_ADMIN_LOCK_KEY,
  UsersService,
} from '../users/users.service';
import { PlatformAccessService } from './platform-access.service';

const enabled = process.env.RUN_PLATFORM_ACCESS_DB_INTEGRATION === '1';

class TestScopedUsersService extends UsersService {
  constructor(prisma: PrismaClient, private readonly testUserIds: string[]) {
    super(prisma as never, {
      createPasswordChangedEmail: async () => ({ created: true }),
      createAccountStatusChangedEmail: async () => ({ created: true }),
    } as never);
  }

  protected override platformAdminPopulationWhere(): Prisma.UserWhereInput {
    return {
      ...super.platformAdminPopulationWhere(),
      id: { in: this.testUserIds },
    };
  }
}

function assertNoSensitiveKeys(value: unknown): void {
  const forbidden = new Set([
    'password',
    'passwordhash',
    'refreshtoken',
    'refreshtokens',
    'tokenhash',
    'accesstoken',
    'authorization',
    'bearer',
    'jwt',
  ]);
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    for (const [key, child] of Object.entries(candidate)) {
      assert.equal(forbidden.has(key.toLowerCase()), false, key);
      visit(child);
    }
  };
  visit(value);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

describe('UA-B PostgreSQL platform access integrity', () => {
  it(
    'isolates platform users and roles and returns safe bounded audit evidence',
    { skip: !enabled },
    async () => {
      const prisma = new PrismaClient();
      const suffix = randomUUID();
      let companyId: string | undefined;
      const userIds: string[] = [];
      const roleIds: string[] = [];
      await prisma.$connect();
      try {
        const company = await prisma.company.create({
          data: { name: `UA-B ${suffix}`, slug: `ua-b-${suffix}` },
          select: { id: true },
        });
        companyId = company.id;
        const [globalRole, secondGlobalRole, tenantRole] = await Promise.all([
          prisma.role.create({
            data: {
              key: `ua-b-global-${suffix}`,
              name: `UA-B Global ${suffix}`,
            },
            select: { id: true },
          }),
          prisma.role.create({
            data: {
              key: `ua-b-global-second-${suffix}`,
              name: `UA-B Global Second ${suffix}`,
            },
            select: { id: true },
          }),
          prisma.role.create({
            data: {
              companyId,
              key: `ua-b-tenant-${suffix}`,
              name: `UA-B Tenant ${suffix}`,
            },
            select: { id: true },
          }),
        ]);
        roleIds.push(globalRole.id, secondGlobalRole.id, tenantRole.id);
        const [platformUser, tenantUser] = await Promise.all([
          prisma.user.create({
            data: {
              email: `ua-b-platform-${suffix}@example.invalid`,
              passwordHash: 'integration-only',
              firstName: 'Platform',
              lastName: 'User',
              roles: { create: { roleId: globalRole.id } },
            },
            select: { id: true },
          }),
          prisma.user.create({
            data: {
              companyId,
              email: `ua-b-tenant-${suffix}@example.invalid`,
              passwordHash: 'integration-only',
              firstName: 'Tenant',
              lastName: 'User',
              roles: { create: { roleId: tenantRole.id } },
            },
            select: { id: true },
          }),
        ]);
        userIds.push(platformUser.id, tenantUser.id);
        const users = new UsersService(
          prisma as never,
          {
            createPasswordChangedEmail: async () => ({ created: true }),
            createAccountStatusChangedEmail: async () => ({ created: true }),
          } as never,
        );
        const service = new PlatformAccessService(prisma as never, users);
        const listedUsers = await service.listUsers({ page: 1, limit: 100 });
        assert.ok(listedUsers.data.some((row) => row.id === platformUser.id));
        assert.ok(!listedUsers.data.some((row) => row.id === tenantUser.id));
        await assert.rejects(() => service.getUser(tenantUser.id));
        const listedRoles = await service.listRoles({ page: 1, limit: 100 });
        assert.ok(listedRoles.data.some((row) => row.id === globalRole.id));
        assert.ok(!listedRoles.data.some((row) => row.id === tenantRole.id));
        const platformActor = {
          id: platformUser.id,
          companyId: null,
          email: `ua-b-platform-${suffix}@example.invalid`,
          firstName: 'Platform',
          lastName: 'User',
          status: UserStatus.ACTIVE,
          roles: [RoleName.SUPER_ADMIN],
        };
        const auditBeforeFailure = await prisma.auditLog.count({
          where: { actorUserId: platformUser.id },
        });
        await assert.rejects(() =>
          service.assignRole(
            platformUser.id,
            { roleId: tenantRole.id },
            platformActor,
          ),
        );
        assert.equal(
          await prisma.auditLog.count({
            where: { actorUserId: platformUser.id },
          }),
          auditBeforeFailure,
        );
        const created = await service.createUser(
          {
            email: `ua-b-managed-${suffix}@example.invalid`,
            password: 'integration-only-password',
            firstName: 'Managed',
            lastName: 'Platform User',
            roleIds: [globalRole.id],
          },
          platformActor,
        );
        userIds.push(created.id);
        const detail = await service.getUser(created.id);
        const updated = await service.updateUser(
          created.id,
          { firstName: 'Updated' },
          platformActor,
        );
        const assigned = await service.assignRole(
          created.id,
          { roleId: secondGlobalRole.id },
          platformActor,
        );
        const roleRemoved = await service.removeRole(
          created.id,
          secondGlobalRole.id,
          platformActor,
        );
        await users.resetPassword(
          created.id,
          { newPassword: 'replacement-integration-password' },
          platformActor,
        );
        const statusChanged = await service.setUserStatus(
          created.id,
          { status: UserStatus.SUSPENDED },
          platformActor,
        );
        const deleted = await service.deleteUser(created.id, platformActor);
        const audit = await service.listAuditLogs({
          page: 1,
          limit: 100,
          actorUserId: platformUser.id,
        });
        const expectedActions = [
          'PLATFORM_USER_CREATED',
          'PLATFORM_USER_UPDATED',
          'PLATFORM_USER_ROLE_ASSIGNED',
          'PLATFORM_USER_ROLE_REMOVED',
          'PLATFORM_USER_PASSWORD_RESET',
          'PLATFORM_USER_STATUS_CHANGED',
          'PLATFORM_USER_DELETED',
        ];
        for (const action of expectedActions) {
          const records = audit.data.filter(
            (row) => row.entityId === created.id && row.action === action,
          );
          assert.equal(records.length, 1, action);
        }
        const durableAudits = await prisma.auditLog.findMany({
          where: {
            actorUserId: platformUser.id,
            entityId: created.id,
            action: { in: expectedActions },
          },
          select: {
            actorUserId: true,
            entityType: true,
            entityId: true,
            action: true,
            metadata: true,
          },
        });
        assert.equal(durableAudits.length, expectedActions.length);
        assert.ok(
          durableAudits.every(
            (record) =>
              record.actorUserId === platformUser.id &&
              record.entityType === 'User' &&
              record.entityId === created.id,
          ),
        );
        assertNoSensitiveKeys(durableAudits);
        const passwordAudit = await prisma.auditLog.findFirstOrThrow({
          where: {
            actorUserId: platformUser.id,
            entityId: created.id,
            action: 'PLATFORM_USER_PASSWORD_RESET',
          },
          select: { metadata: true },
        });
        assertNoSensitiveKeys(passwordAudit.metadata);
        assertNoSensitiveKeys({
          listedUsers,
          listedRoles,
          audit,
          detail,
          created,
          updated,
          assigned,
          roleRemoved,
          statusChanged,
          deleted,
        });
      } finally {
        await prisma.auditLog.deleteMany({
          where: { actorUserId: { in: userIds } },
        });
        await prisma.userRole.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
        if (companyId) {
          await prisma.company.delete({ where: { id: companyId } });
        }
        await prisma.$disconnect();
      }
    },
  );

  it(
    'serializes competing final-admin removal and leaves one active SUPER_ADMIN',
    { skip: !enabled },
    async () => {
      const prisma = new PrismaClient();
      const suffix = randomUUID();
      const userIds: string[] = [];
      await prisma.$connect();
      try {
        const role = await prisma.role.findFirstOrThrow({
          where: {
            companyId: null,
            systemName: RoleName.SUPER_ADMIN,
            deletedAt: null,
          },
          select: { id: true },
        });
        const baselineActiveAdmins = await prisma.user.count({
          where: {
            companyId: null,
            status: UserStatus.ACTIVE,
            deletedAt: null,
            roles: {
              some: {
                role: {
                  companyId: null,
                  systemName: RoleName.SUPER_ADMIN,
                  deletedAt: null,
                },
              },
            },
          },
        });
        for (const label of ['a', 'b']) {
          const user = await prisma.user.create({
            data: {
              email: `ua-b-${label}-${suffix}@example.invalid`,
              passwordHash: 'integration-only',
              firstName: 'UA-B',
              lastName: label,
              roles: { create: { roleId: role.id } },
            },
            select: { id: true },
          });
          userIds.push(user.id);
        }
        const service = new TestScopedUsersService(prisma, userIds);
        const actor = (id: string) => ({
          id,
          companyId: null,
          email: `ua-b-actor-${id}@example.invalid`,
          firstName: 'UA-B',
          lastName: 'Actor',
          status: UserStatus.ACTIVE,
          roles: [RoleName.SUPER_ADMIN],
        });
        let releaseLock!: () => void;
        let lockAcquired!: () => void;
        let lockAcquisitionFailed!: (error: unknown) => void;
        const release = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        const acquired = new Promise<void>((resolve, reject) => {
          lockAcquired = resolve;
          lockAcquisitionFailed = reject;
        });
        const blocker = prisma.$transaction(
          async (tx) => {
            try {
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PLATFORM_ADMIN_LOCK_KEY})::text`;
              lockAcquired();
              await release;
            } catch (error) {
              lockAcquisitionFailed(error);
              throw error;
            }
          },
          { maxWait: 5_000, timeout: 10_000 },
        );
        void blocker.catch(() => undefined);
        try {
          await withTimeout(
            acquired,
            5_000,
            'Timed out acquiring the UA-B advisory-lock test barrier',
          );
        } catch (error) {
          releaseLock();
          await Promise.allSettled([
            withTimeout(
              blocker,
              12_000,
              'Timed out cleaning up the UA-B advisory-lock test barrier',
            ),
          ]);
          throw error;
        }
        let firstSettled = false;
        let secondSettled = false;
        const first = service
          .setStatus(
            userIds[1],
            { status: UserStatus.SUSPENDED },
            actor(userIds[0]),
          )
          .finally(() => {
            firstSettled = true;
          });
        const second = service
          .setStatus(
            userIds[0],
            { status: UserStatus.SUSPENDED },
            actor(userIds[1]),
          )
          .finally(() => {
            secondSettled = true;
          });
        const resultsPromise = Promise.allSettled([first, second]);
        let waiting = 0;
        let bothUnsettledWhileBlocked = false;
        let observationError: unknown;
        let releaseError: unknown;
        try {
          const waitDeadline = Date.now() + 5_000;
          while (waiting < 2 && Date.now() < waitDeadline) {
            const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
              SELECT count(*)::int AS count
              FROM pg_locks
              WHERE locktype = 'advisory'
                AND database = (
                  SELECT oid FROM pg_database WHERE datname = current_database()
                )
                AND classid = 0
                AND objid = ${PLATFORM_ADMIN_LOCK_KEY}
                AND granted = false
            `;
            waiting = row?.count ?? 0;
            if (waiting < 2) {
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }
          bothUnsettledWhileBlocked = !firstSettled && !secondSettled;
        } catch (error) {
          observationError = error;
        } finally {
          releaseLock();
          try {
            await withTimeout(
              blocker,
              12_000,
              'Timed out releasing the UA-B advisory-lock test barrier',
            );
          } catch (error) {
            releaseError = error;
          }
        }
        const results = await withTimeout(
          resultsPromise,
          12_000,
          'Timed out waiting for UA-B competing admin mutations',
        );
        if (observationError) throw observationError;
        if (releaseError) throw releaseError;
        assert.equal(waiting, 2);
        assert.equal(bothUnsettledWhileBlocked, true);
        const fulfilled = results.filter(
          (result) => result.status === 'fulfilled',
        ).length;
        assert.equal(
          fulfilled,
          1,
          results
            .map((result) =>
              result.status === 'rejected'
                ? `${result.reason?.constructor?.name}: ${result.reason?.message}`
                : 'fulfilled',
            )
            .join(' | '),
        );
        const rejection = results.find((result) => result.status === 'rejected');
        assert.ok(rejection && rejection.status === 'rejected');
        assert.ok(rejection.reason instanceof ForbiddenException);
        assert.equal(
          await prisma.user.count({
            where: {
              id: { in: userIds },
              companyId: null,
              status: UserStatus.ACTIVE,
              deletedAt: null,
              roles: {
                some: {
                  role: {
                    companyId: null,
                    systemName: RoleName.SUPER_ADMIN,
                    deletedAt: null,
                  },
                },
              },
            },
          }),
          1,
        );
        assert.equal(
          await prisma.user.count({
            where: {
              companyId: null,
              status: UserStatus.ACTIVE,
              deletedAt: null,
              roles: {
                some: {
                  role: {
                    companyId: null,
                    systemName: RoleName.SUPER_ADMIN,
                    deletedAt: null,
                  },
                },
              },
            },
          }),
          baselineActiveAdmins + 1,
        );
        assert.equal(
          await prisma.auditLog.count({
            where: {
              actorUserId: { in: userIds },
              action: 'PLATFORM_USER_STATUS_CHANGED',
            },
          }),
          fulfilled,
        );
      } finally {
        await prisma.auditLog.deleteMany({
          where: { actorUserId: { in: userIds } },
        });
        await prisma.refreshToken.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.userRole.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.$disconnect();
      }
    },
  );
});

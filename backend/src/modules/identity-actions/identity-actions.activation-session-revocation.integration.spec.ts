import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  AccountActionTokenPurpose,
  PrismaClient,
  RoleName,
  UserStatus,
} from '@prisma/client';
import { buildAccountActionToken } from '../../common/utils/account-action-token.util';
import { IdentityActionsService } from './identity-actions.service';

const DATABASE_NAME = 'esta_sa_c0_activation_disposable_20261027';
const PROTECTED_DATABASE_NAMES = new Set([
  'esta_workforce',
  'esta_qa_p13b2a_20261023_131805',
  'esta_pc_l_20261008_a',
  'esta_low_d_integration_20261026',
]);
const enabled = process.env.RUN_SA_C0_ACTIVATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const secret = 'sa-c0-disposable-test-secret-at-least-32-characters';

function requireDisposableDatabase(): void {
  if (process.env.SA_C0_DISPOSABLE_DATABASE_OWNERSHIP_VERIFIED !== '1') {
    throw new Error('SA-C0 integration requires explicit disposable database ownership verification');
  }
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error('DATABASE_URL is required for the SA-C0 activation integration test');
  const url = new URL(configured);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (
    PROTECTED_DATABASE_NAMES.has(database) ||
    database !== DATABASE_NAME ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '55433'
  ) {
    throw new Error('SA-C0 activation integration requires the explicitly authorized disposable database');
  }
}

describeDb('SA-C0 invitation activation session revocation', () => {
  const prisma = new PrismaClient();

  before(async () => {
    requireDisposableDatabase();
    await prisma.$connect();
    const identity = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    assert.equal(identity[0]?.database, DATABASE_NAME);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('revokes every pre-existing target session and token while preserving unrelated authority and replay fencing', async () => {
    const fixture = await createFixture(prisma, 'activation');
    try {
      const beforeTarget = await prisma.user.findUniqueOrThrow({
        where: { id: fixture.targetId },
        include: { roles: { include: { role: true } } },
      });
      assert.equal(beforeTarget.status, UserStatus.INACTIVE);
      assert.equal(beforeTarget.companyId, null);
      assert.deepEqual(beforeTarget.roles.map(({ role }) => role.systemName), [RoleName.SUPER_ADMIN]);
      assert.equal(await liveSessionCount(prisma, fixture.targetId), 2);
      assert.equal(await liveTokenCount(prisma, fixture.targetId), 2);
      assert.equal(await liveSessionCount(prisma, fixture.actorId), 1);
      assert.equal(await liveTokenCount(prisma, fixture.actorId), 1);
      assert.equal(await liveSessionCount(prisma, fixture.unrelatedId), 1);
      assert.equal(await liveTokenCount(prisma, fixture.unrelatedId), 1);

      const service = createService(prisma);
      assert.deepEqual(await service.activate(fixture.activationInput, {}), { success: true });

      const target = await prisma.user.findUniqueOrThrow({
        where: { id: fixture.targetId },
        include: { roles: { include: { role: true } } },
      });
      assert.equal(target.status, UserStatus.ACTIVE);
      assert.equal(target.deletedAt, null);
      assert.equal(target.companyId, null);
      assert.deepEqual(target.roles.map(({ role }) => role.systemName), [RoleName.SUPER_ADMIN]);
      assert.equal(await liveSessionCount(prisma, fixture.targetId), 0);
      assert.equal(await liveTokenCount(prisma, fixture.targetId), 0);
      assert.equal(await prisma.refreshSession.count({
        where: { userId: fixture.targetId, revokedAt: { not: null } },
      }), 2);
      assert.equal(await prisma.refreshToken.count({
        where: { userId: fixture.targetId, revokedAt: { not: null } },
      }), 2);
      assert.equal(await liveSessionCount(prisma, fixture.actorId), 1);
      assert.equal(await liveTokenCount(prisma, fixture.actorId), 1);
      assert.equal(await liveSessionCount(prisma, fixture.unrelatedId), 1);
      assert.equal(await liveTokenCount(prisma, fixture.unrelatedId), 1);

      const token = await prisma.accountActionToken.findUniqueOrThrow({
        where: { id: fixture.invitationId },
      });
      assert.ok(token.consumedAt);
      assert.equal(token.invalidatedAt, null);
      assert.equal(await activationAuditCount(prisma, fixture.targetId), 1);
      assert.equal(await prisma.accountActionToken.count({
        where: {
          userId: fixture.targetId,
          purpose: AccountActionTokenPurpose.INVITATION,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: new Date() },
        },
      }), 0);

      await assert.rejects(
        () => service.activate(fixture.activationInput, {}),
        /invalid or expired/i,
      );
      assert.equal(await activationAuditCount(prisma, fixture.targetId), 1);
      assert.equal(await liveSessionCount(prisma, fixture.actorId), 1);
      assert.equal(await liveTokenCount(prisma, fixture.actorId), 1);
      assert.equal(await liveSessionCount(prisma, fixture.unrelatedId), 1);
      assert.equal(await liveTokenCount(prisma, fixture.unrelatedId), 1);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it('rolls back activation, token consumption, session revocation, and audit when persistence fails before commit', async () => {
    const fixture = await createFixture(prisma, 'rollback');
    const trigger = `low_d_activation_audit_${fixture.suffix.replaceAll('-', '_')}`;
    await installAuditFailureTrigger(prisma, trigger, fixture.targetId);
    try {
      const service = createService(prisma);
      await assert.rejects(() => service.activate(fixture.activationInput, {}), /invalid or expired/i);

      const target = await prisma.user.findUniqueOrThrow({ where: { id: fixture.targetId } });
      assert.equal(target.status, UserStatus.INACTIVE);
      assert.equal(target.companyId, null);
      const token = await prisma.accountActionToken.findUniqueOrThrow({
        where: { id: fixture.invitationId },
      });
      assert.equal(token.consumedAt, null);
      assert.equal(token.invalidatedAt, null);
      assert.equal(await liveSessionCount(prisma, fixture.targetId), 2);
      assert.equal(await liveTokenCount(prisma, fixture.targetId), 2);
      assert.equal(await activationAuditCount(prisma, fixture.targetId), 0);
      assert.equal(await liveSessionCount(prisma, fixture.actorId), 1);
      assert.equal(await liveTokenCount(prisma, fixture.actorId), 1);
      assert.equal(await liveSessionCount(prisma, fixture.unrelatedId), 1);
      assert.equal(await liveTokenCount(prisma, fixture.unrelatedId), 1);
    } finally {
      await dropAuditFailureTrigger(prisma, trigger);
      await cleanupFixture(prisma, fixture);
    }
  });
});

function createService(prisma: PrismaClient): IdentityActionsService {
  const config = {
    get: (_key: string, fallback?: unknown) => fallback,
    getOrThrow: () => secret,
  };
  return new IdentityActionsService(prisma as never, config as never, {} as never);
}

async function createFixture(prisma: PrismaClient, label: string) {
  const suffix = randomUUID();
  const roleId = randomUUID();
  const actorId = randomUUID();
  const targetId = randomUUID();
  const unrelatedId = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.role.create({
    data: {
      id: roleId,
      key: `LOW_D_SUPER_ADMIN_${suffix}`,
      name: `LOW-D Super Admin ${label}`,
      systemName: RoleName.SUPER_ADMIN,
    },
  });
  await prisma.user.createMany({
    data: [
      user(actorId, `low-d-actor-${suffix}@example.invalid`, UserStatus.ACTIVE),
      user(targetId, `low-d-target-${suffix}@example.invalid`, UserStatus.INACTIVE),
      user(unrelatedId, `low-d-unrelated-${suffix}@example.invalid`, UserStatus.ACTIVE),
    ],
  });
  await prisma.userRole.createMany({
    data: [actorId, targetId, unrelatedId].map((userId) => ({ userId, roleId })),
  });
  await createLiveAuthority(prisma, actorId, 1, expiresAt);
  await createLiveAuthority(prisma, targetId, 2, expiresAt);
  await createLiveAuthority(prisma, unrelatedId, 1, expiresAt);

  const service = createService(prisma);
  const invitation = await prisma.$transaction((tx) => service.issueTokenInTransaction(tx, {
    purpose: AccountActionTokenPurpose.INVITATION,
    userId: targetId,
    companyId: null,
    createdByUserId: actorId,
  }));
  const bearer = buildAccountActionToken(invitation, secret);

  return {
    suffix,
    roleId,
    actorId,
    targetId,
    unrelatedId,
    invitationId: invitation.id,
    activationInput: {
      token: bearer,
      password: 'LOW-D-activation-password-2026',
      passwordConfirmation: 'LOW-D-activation-password-2026',
    },
  };
}

function user(id: string, email: string, status: UserStatus) {
  return {
    id,
    email,
    passwordHash: 'not-a-real-credential',
    firstName: 'LOW-D',
    lastName: 'Fixture',
    status,
  };
}

async function createLiveAuthority(
  prisma: PrismaClient,
  userId: string,
  count: number,
  expiresAt: Date,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const sessionId = randomUUID();
    await prisma.refreshSession.create({ data: { id: sessionId, userId, expiresAt } });
    await prisma.refreshToken.create({
      data: {
        id: randomUUID(),
        userId,
        sessionId,
        tokenHash: randomUUID(),
        expiresAt,
      },
    });
  }
}

function liveSessionCount(prisma: PrismaClient, userId: string) {
  return prisma.refreshSession.count({ where: { userId, revokedAt: null } });
}

function liveTokenCount(prisma: PrismaClient, userId: string) {
  return prisma.refreshToken.count({ where: { userId, revokedAt: null } });
}

function activationAuditCount(prisma: PrismaClient, userId: string) {
  return prisma.auditLog.count({
    where: { actorUserId: userId, entityId: userId, action: 'ACCOUNT_ACTIVATED' },
  });
}

async function installAuditFailureTrigger(
  prisma: PrismaClient,
  name: string,
  targetId: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${name}_fn"() RETURNS trigger AS $$
    BEGIN
      IF NEW."action" = 'ACCOUNT_ACTIVATED'
        AND NEW."entityId" = '${targetId}'::uuid THEN
        RAISE EXCEPTION 'LOW-D activation rollback probe';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditLog"
    FOR EACH ROW EXECUTE FUNCTION "${name}_fn"()
  `);
}

async function dropAuditFailureTrigger(prisma: PrismaClient, name: string): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${name}" ON "AuditLog"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${name}_fn"()`);
}

async function cleanupFixture(
  prisma: PrismaClient,
  fixture: { roleId: string; actorId: string; targetId: string; unrelatedId: string },
): Promise<void> {
  const userIds = [fixture.actorId, fixture.targetId, fixture.unrelatedId];
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { entityId: { in: userIds } }] } });
  await prisma.accountActionToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.role.delete({ where: { id: fixture.roleId } });
}

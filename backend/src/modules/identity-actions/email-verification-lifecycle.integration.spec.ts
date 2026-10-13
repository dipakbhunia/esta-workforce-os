import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { AccountActionTokenPurpose, NotificationType, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import { buildEmailVerificationToken } from '../../common/utils/account-action-token.util';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { IdentityActionsService } from './identity-actions.service';
import { UsersService } from '../users/users.service';

const enabled = process.env.RUN_EMAIL_VERIFICATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const secret = 'ev-d3-disposable-test-secret-at-least-32-characters';

describeDb('EV-D3 PostgreSQL email-verification lifecycle', () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const createdUserIds: string[] = [];
  let roleId: string;
  let createdRole = false;

  const config = {
    get: (key: string, fallback?: unknown) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : fallback,
    getOrThrow: () => secret,
  };
  const notifications = new NotificationsService(prisma as never, {} as never, {} as never, {} as never);
  const identity = new IdentityActionsService(prisma as never, config as never, notifications);

  before(async () => {
    await prisma.$connect();
    const existing = await prisma.role.findFirst({
      where: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null },
      select: { id: true },
    });
    if (existing) roleId = existing.id;
    else {
      roleId = randomUUID();
      await prisma.role.create({ data: { id: roleId, key: `EV_D3_SUPER_ADMIN_${suffix}`, name: 'EV-D3 Super Admin', systemName: RoleName.SUPER_ADMIN } });
      createdRole = true;
    }
  });

  after(async () => {
    await prisma.accountActionRequestEvidence.deleteMany({ where: { purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.accountActionToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (createdRole) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  async function createActor(label: string): Promise<AuthenticatedUser> {
    const id = randomUUID();
    const email = `ev-d3-${label}-${suffix}@example.test`;
    await prisma.user.create({
      data: { id, email, passwordHash: 'integration-only', firstName: 'Email', lastName: 'Verifier', roles: { create: { roleId } } },
    });
    createdUserIds.push(id);
    return { id, companyId: null, email, firstName: 'Email', lastName: 'Verifier', status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
  }

  async function activeToken(userId: string) {
    return prisma.accountActionToken.findFirstOrThrow({
      where: { userId, purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION, consumedAt: null, invalidatedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  function bearer(token: Awaited<ReturnType<typeof activeToken>>) {
    return buildEmailVerificationToken({
      id: token.id,
      purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
      userId: token.userId,
      companyId: token.companyId,
      targetEmail: token.targetEmail!,
      emailRevision: token.emailRevision!,
      expiresAt: token.expiresAt,
    }, secret);
  }

  it('issues atomically, queues durable security email, consumes once, and records secret-free audit', async () => {
    const actor = await createActor('valid');
    const response = await identity.requestEmailVerification(actor, { ipAddress: '192.0.2.31', userAgent: 'EV-D3' });
    assert.deepEqual(response, { accepted: true });
    assert.doesNotMatch(JSON.stringify(response), /token|example\.test/i);
    const token = await activeToken(actor.id);
    assert.equal(token.companyId, null);
    assert.equal(token.targetEmail, actor.email);
    assert.equal(token.emailRevision, 0);
    assert.match(token.tokenHash, /^[a-f0-9]{64}$/);
    const notification = await prisma.notification.findUniqueOrThrow({
      where: { accountActionTokenId: token.id }, include: { deliveries: true },
    });
    assert.equal(notification.type, NotificationType.EMAIL_VERIFICATION);
    assert.equal(notification.deliveries[0]?.recipient, actor.email);

    const value = bearer(token);
    const outcomes = await Promise.allSettled([
      identity.verifyEmail({ token: value }, { ipAddress: '192.0.2.31' }),
      identity.verifyEmail({ token: value }, { ipAddress: '192.0.2.31' }),
    ]);
    assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
    const verified = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    assert.equal(verified.verifiedEmail, actor.email);
    assert.ok(verified.emailVerifiedAt);
    await assert.rejects(() => identity.verifyEmail({ token: `${value}x` }, {}), /invalid or expired/i);
    const audits = await prisma.auditLog.findMany({ where: { actorUserId: actor.id }, select: { action: true, metadata: true } });
    assert.deepEqual(audits.map(({ action }) => action).sort(), ['USER_EMAIL_VERIFICATION_REQUESTED', 'USER_EMAIL_VERIFIED']);
    assert.doesNotMatch(JSON.stringify(audits), /tokenHash|Secure link|ev-d3-disposable/i);
  });

  it('rejects a stale revision after an email change and change-away/change-back', async () => {
    const actor = await createActor('stale');
    await identity.requestEmailVerification(actor, { ipAddress: '192.0.2.32' });
    const token = await activeToken(actor.id);
    const value = bearer(token);
    await prisma.user.update({ where: { id: actor.id }, data: { email: `changed-${actor.email}` } });
    await prisma.user.update({ where: { id: actor.id }, data: { email: actor.email } });
    await assert.rejects(() => identity.verifyEmail({ token: value }, {}), /invalid or expired/i);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    assert.equal(user.emailRevision, 2);
    assert.equal(user.verifiedEmail, null);
  });

  it('fences concurrent managed email change, increments once, and revokes sessions and outstanding verification', async () => {
    const actor = await createActor('email-change-race');
    await identity.requestEmailVerification(actor, { ipAddress: '192.0.2.35' });
    const token = await activeToken(actor.id);
    const value = bearer(token);
    await prisma.refreshToken.create({
      data: { id: randomUUID(), userId: actor.id, tokenHash: `ev-d4-${suffix}`, expiresAt: new Date(Date.now() + 60_000) },
    });
    const users = new UsersService(prisma as never, {} as never);
    const changedEmail = `changed-${actor.email}`;
    const outcomes = await Promise.allSettled([
      users.update(actor.id, { email: changedEmail }, actor),
      identity.verifyEmail({ token: value }, { ipAddress: '192.0.2.35' }),
    ]);
    assert.equal(outcomes[0]?.status, 'fulfilled');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    assert.equal(user.email, changedEmail);
    assert.equal(user.emailRevision, 1);
    assert.equal(user.verifiedEmail, null);
    assert.equal(user.emailVerifiedAt, null);
    assert.equal(await prisma.refreshToken.count({ where: { userId: actor.id, revokedAt: null } }), 0);
    assert.equal(await prisma.accountActionToken.count({ where: {
      id: token.id, consumedAt: null, invalidatedAt: null,
    } }), 0);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { actorUserId: actor.id, action: 'USER_EMAIL_CHANGED' } });
    assert.doesNotMatch(JSON.stringify(audit), /changed-.*example\.test/i);
  });

  it('serializes multi-instance resend limits and leaves one usable token', async () => {
    const actor = await createActor('throttle');
    const responses = await Promise.all(Array.from({ length: 4 }, () =>
      identity.requestEmailVerification(actor, { ipAddress: '192.0.2.33' })));
    assert.ok(responses.every(({ accepted }) => accepted));
    assert.equal(await prisma.accountActionRequestEvidence.count({
      where: { purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION, subjectHash: { not: '' } },
    }) >= 4, true);
    assert.equal(await prisma.accountActionToken.count({ where: { userId: actor.id, purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION } }), 3);
    assert.equal(await prisma.accountActionToken.count({ where: {
      userId: actor.id, purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION, consumedAt: null, invalidatedAt: null,
    } }), 1);
    assert.equal(await prisma.notification.count({ where: { userId: actor.id, type: NotificationType.EMAIL_VERIFICATION } }), 3);
  });

  it('rolls back token, audit, and notification state when durable enqueue fails', async () => {
    const actor = await createActor('rollback');
    const failing = new IdentityActionsService(prisma as never, config as never, {
      createEmailVerificationEmailInTransaction: async () => { throw new Error('injected enqueue failure'); },
    } as never);
    assert.deepEqual(await failing.requestEmailVerification(actor, { ipAddress: '192.0.2.34' }), { accepted: true });
    assert.equal(await prisma.accountActionToken.count({
      where: { userId: actor.id, purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION },
    }), 0);
    assert.equal(await prisma.auditLog.count({
      where: { actorUserId: actor.id, action: 'USER_EMAIL_VERIFICATION_REQUESTED' },
    }), 0);
    assert.equal(await prisma.notification.count({
      where: { userId: actor.id, type: NotificationType.EMAIL_VERIFICATION },
    }), 0);
    assert.equal(await prisma.accountActionRequestEvidence.count({
      where: { purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION },
    }) >= 1, true, 'failed requests are counted by durable throttling evidence');
  });
});

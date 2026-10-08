import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { AccountActionTokenPurpose, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { buildAccountActionToken } from '../../common/utils/account-action-token.util';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import { IdentityActionsService } from './identity-actions.service';

const enabled = process.env.RUN_IDENTITY_ACTION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const secret = 'pc-l-disposable-test-secret-at-least-32-characters';

describeDb('PC-L PostgreSQL identity lifecycle', () => {
  it('proves atomic provisioning, token hashing, replay fencing, reset revocation, and durable throttling', async () => {
    const prisma = new PrismaClient(); const suffix = randomUUID(); const now = new Date();
    const enqueued: Array<Record<string, unknown>> = [];
    const config = { get: (key: string, fallback?: unknown) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : fallback, getOrThrow: () => secret };
    const notificationAuthority = {
      createAccountInvitationEmail: async (input: Record<string, unknown>) => { enqueued.push({ type: 'INVITATION', ...input }); return { created: true }; },
      createPasswordResetRequestedEmail: async (input: Record<string, unknown>) => { enqueued.push({ type: 'RESET', ...input }); return { created: true }; },
    };
    const identity = new IdentityActionsService(prisma as never, config as never, notificationAuthority as never);
    const users = new UsersService(prisma as never, {} as never, identity);
    const companies = new CompaniesService(prisma as never, identity);
    const actorId = randomUUID(); let platformRoleId = randomUUID(); let createdPlatformRole = false;
    await prisma.$connect();
    try {
      const existingPlatformRole = await prisma.role.findFirst({ where: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null }, select: { id: true } });
      if (existingPlatformRole) platformRoleId = existingPlatformRole.id;
      else {
        await prisma.role.create({ data: { id: platformRoleId, key: `SUPER_ADMIN_${suffix}`, name: 'PC-L Super Admin', systemName: RoleName.SUPER_ADMIN } });
        createdPlatformRole = true;
      }
      await prisma.user.create({ data: { id: actorId, email: `pc-l-actor-${suffix}@example.test`, passwordHash: 'not-used', firstName: 'PC', lastName: 'Actor', roles: { create: { roleId: platformRoleId } } } });
      const actor = { id: actorId, companyId: null, email: `pc-l-actor-${suffix}@example.test`, firstName: 'PC', lastName: 'Actor', status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };

      const platformInvite = await users.create({ email: `platform-${suffix}@example.test`, firstName: 'Platform', lastName: 'Invite', roleIds: [platformRoleId] }, actor);
      assert.equal(platformInvite.status, UserStatus.INACTIVE);
      assert.equal(platformInvite.invitationQueued, true);
      const storedPlatformToken = await prisma.accountActionToken.findFirstOrThrow({ where: { userId: platformInvite.id, purpose: AccountActionTokenPurpose.INVITATION } });
      assert.match(storedPlatformToken.tokenHash, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(storedPlatformToken).includes(buildAccountActionToken(storedPlatformToken, secret)), false, 'database evidence must not contain the signed bearer');
      await Promise.all([
        prisma.$transaction((tx) => identity.issueTokenInTransaction(tx, { purpose: AccountActionTokenPurpose.INVITATION, userId: platformInvite.id, companyId: null, createdById: actorId })),
        prisma.$transaction((tx) => identity.issueTokenInTransaction(tx, { purpose: AccountActionTokenPurpose.INVITATION, userId: platformInvite.id, companyId: null, createdById: actorId })),
      ]);
      assert.equal(await prisma.accountActionToken.count({ where: { userId: platformInvite.id, purpose: AccountActionTokenPurpose.INVITATION, consumedAt: null, invalidatedAt: null } }), 1, 'concurrent issuance must leave exactly one usable invitation');

      const companyResult = await companies.create({
        name: `PC-L Company ${suffix}`, slug: `pc-l-${suffix}`, status: 'ACTIVE',
        initialAdmin: { email: `tenant-admin-${suffix}@example.test`, firstName: 'Tenant', lastName: 'Admin' },
      }, actor) as unknown as { id: string; initialAdminInvitation: { userId: string; queued: boolean } };
      assert.equal(companyResult.initialAdminInvitation.queued, true);
      const initialAdmin = await prisma.user.findUniqueOrThrow({ where: { id: companyResult.initialAdminInvitation.userId }, include: { roles: { include: { role: true } } } });
      assert.equal(initialAdmin.companyId, companyResult.id);
      assert.equal(initialAdmin.status, UserStatus.INACTIVE);
      assert.deepEqual(initialAdmin.roles.map(({ role }) => role.systemName), [RoleName.COMPANY_ADMIN]);

      const invitation = await prisma.accountActionToken.findFirstOrThrow({ where: { userId: initialAdmin.id, purpose: AccountActionTokenPurpose.INVITATION } });
      const invitationBearer = buildAccountActionToken(invitation, secret);
      const activationInput = { token: invitationBearer, password: 'activated-password', passwordConfirmation: 'activated-password' };
      const outcomes = await Promise.allSettled([identity.activate(activationInput, {}), identity.activate(activationInput, {})]);
      assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
      const activated = await prisma.user.findUniqueOrThrow({ where: { id: initialAdmin.id } });
      assert.equal(activated.status, UserStatus.ACTIVE);
      assert.equal(await bcrypt.compare('activated-password', activated.passwordHash), true);

      await prisma.refreshToken.create({ data: { id: randomUUID(), userId: initialAdmin.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
      const resetToken = await prisma.$transaction((tx) => identity.issueTokenInTransaction(tx, { purpose: AccountActionTokenPurpose.PASSWORD_RESET, userId: initialAdmin.id, companyId: companyResult.id }));
      const resetBearer = buildAccountActionToken(resetToken, secret);
      await identity.resetPassword({ token: resetBearer, password: 'reset-password', passwordConfirmation: 'reset-password' }, {});
      assert.equal(await prisma.refreshToken.count({ where: { userId: initialAdmin.id, revokedAt: null } }), 0);
      await assert.rejects(() => identity.resetPassword({ token: resetBearer, password: 'again-password', passwordConfirmation: 'again-password' }, {}), /invalid or expired/i);

      const eligibleEmail = initialAdmin.email;
      const eligible = await Promise.all(Array.from({ length: 6 }, () => identity.requestPasswordReset(eligibleEmail, { ipAddress: '192.0.2.10' })));
      const unknown = await identity.requestPasswordReset(`unknown-${suffix}@example.test`, { ipAddress: '192.0.2.11' });
      assert.ok(eligible.every((response) => JSON.stringify(response) === JSON.stringify(unknown)), 'recovery response must be enumeration-safe');
      assert.equal(await prisma.accountActionRequestEvidence.count({ where: { createdAt: { gte: now } } }), 7);
      assert.equal(enqueued.filter(({ type }) => type === 'RESET').length, 5, 'sixth request must be durably throttled');

      const auditJson = JSON.stringify(await prisma.auditLog.findMany({ where: { createdAt: { gte: now } }, select: { action: true, metadata: true } }));
      assert.doesNotMatch(auditJson, /activated-password|reset-password|tokenHash|Secure link/i);
    } finally {
      await prisma.accountActionRequestEvidence.deleteMany({ where: { createdAt: { gte: now } } });
      await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: actorId }, { createdAt: { gte: now } }] } });
      await prisma.notification.deleteMany({ where: { createdAt: { gte: now } } });
      await prisma.accountActionToken.deleteMany({ where: { createdAt: { gte: now } } });
      await prisma.user.deleteMany({ where: { OR: [{ email: { contains: suffix } }, { company: { is: { slug: { startsWith: 'pc-l-' } } } }] } });
      await prisma.company.deleteMany({ where: { slug: { startsWith: 'pc-l-' } } });
      if (createdPlatformRole) await prisma.role.deleteMany({ where: { id: platformRoleId } });
      await prisma.$disconnect();
    }
  });
});

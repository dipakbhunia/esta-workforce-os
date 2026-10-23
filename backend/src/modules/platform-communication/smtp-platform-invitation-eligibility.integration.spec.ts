import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { AccountActionTokenPurpose, NotificationChannel, NotificationStatus, NotificationType, PrismaClient, RoleName,
  SmtpConfigurationLifecycle, SmtpSecurityMode, UserStatus } from '@prisma/client';
import { IdentityActionsService } from '../identity-actions/identity-actions.service';
import { NotificationRecipientResolver } from '../notifications/notification-recipient-resolver.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SMTP_INVITATION_BOOTSTRAP_COMPLETED, SMTP_INVITATION_BOOTSTRAP_STARTED } from './smtp-bootstrap-dispatch-fence';
import { SmtpPlatformInvitationEligibilityService } from './smtp-platform-invitation-eligibility.service';

const enabled = process.env.RUN_SMTP_PLATFORM_INVITATION_ELIGIBILITY_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;

describeDb('EMAIL-QA.3C.4P.2 PostgreSQL invitation eligibility', () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const secret = 'eligibility-disposable-secret-at-least-32-characters';
  let roleId = '';
  let createdRole = false;
  let actorId = '';
  let targetId = '';
  let targetEmail = '';
  let configurationId = '';
  let currentDeliveryId = '';

  before(async () => {
    await prisma.$connect();
    const [{ name }] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    assert.match(name, /^esta_email_qa_3c4(?:p2|p8)_[a-z0-9_]+$/);
    const role = await prisma.role.findFirst({ where: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null } });
    if (role) roleId = role.id;
    else { roleId = randomUUID(); createdRole = true; await prisma.role.create({ data: { id: roleId,
      key: `EMAIL_QA_3C4P2_SUPER_ADMIN_${suffix}`, name: 'EMAIL-QA.3C.4P.2 Super Admin', systemName: RoleName.SUPER_ADMIN } }); }
    actorId = randomUUID(); targetId = randomUUID(); targetEmail = `target-${suffix}@example.test`;
    await prisma.user.create({ data: { id: actorId, email: `actor-${suffix}@example.test`, passwordHash: 'integration-only',
      firstName: 'Actor', lastName: 'Eligibility', roles: { create: { roleId } } } });
    await prisma.user.create({ data: { id: targetId, email: targetEmail, passwordHash: 'integration-only',
      firstName: 'Target', lastName: 'Eligibility', status: UserStatus.INACTIVE, roles: { create: { roleId } } } });
    const smtp = await prisma.smtpConfigurationVersion.create({ data: { lifecycle: SmtpConfigurationLifecycle.TESTED,
      host: 'smtp.example.test', port: 587, securityMode: SmtpSecurityMode.STARTTLS, username: 'mailer',
      encryptedPassword: Uint8Array.from([1, 2, 3]), encryptionKeyId: 'test-key', senderEmail: 'sender@example.test',
      senderDisplayName: 'Sender', structurallyValidatedAt: new Date(), connectionTestedAt: new Date(),
      connectionTestSucceeded: true, connectionTestResultCode: 'SUCCESS' } });
    configurationId = smtp.id;
    const current = await issueInvitation();
    currentDeliveryId = current.deliveryId;
    await createHistoricalInvitation('expired');
    await createHistoricalInvitation('consumed');
    await createHistoricalInvitation('invalidated');
  });

  after(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: actorId } });
    await prisma.notificationDelivery.deleteMany({ where: { notification: { userId: targetId } } });
    await prisma.notification.deleteMany({ where: { userId: targetId } });
    await prisma.accountActionToken.deleteMany({ where: { userId: targetId } });
    await prisma.user.deleteMany({ where: { id: { in: [actorId, targetId] } } });
    await prisma.smtpConfigurationVersion.delete({ where: { id: configurationId } });
    if (createdRole) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  async function issueInvitation() {
    const notifications = new NotificationsService(prisma as never,
      new NotificationRecipientResolver(prisma as never), {} as never, {} as never);
    const identity = new IdentityActionsService(prisma as never, { get: (key: string, fallback?: unknown) =>
      key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : fallback, getOrThrow: () => secret } as never, notifications);
    const token = await prisma.$transaction((tx) => identity.issueTokenInTransaction(tx, {
      purpose: AccountActionTokenPurpose.INVITATION, userId: targetId, companyId: null, createdByUserId: actorId,
    }));
    assert.equal(await identity.enqueueInvitation(token.id, targetId, 'Esta Workforce OS'), true);
    const notification = await prisma.notification.findFirstOrThrow({ where: { accountActionTokenId: token.id }, include: { deliveries: true } });
    return { tokenId: token.id, deliveryId: notification.deliveries[0].id };
  }

  async function createHistoricalInvitation(state: 'expired' | 'consumed' | 'invalidated') {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 2 * 24 * 60 * 60_000);
    const expiresAt = state === 'expired'
      ? new Date(now.getTime() - 24 * 60 * 60_000)
      : new Date(now.getTime() + 24 * 60 * 60_000);
    const token = await prisma.accountActionToken.create({ data: {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: targetId,
      companyId: null,
      tokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
      expiresAt,
      consumedAt: state === 'consumed' ? now : null,
      invalidatedAt: state === 'invalidated' ? now : null,
      createdByUserId: actorId,
      createdAt,
    } });
    const notification = await prisma.notification.create({ data: {
      userId: targetId,
      type: NotificationType.ACCOUNT_INVITATION,
      channel: NotificationChannel.EMAIL,
      title: 'Historical invitation',
      message: 'Historical invitation evidence',
      idempotencyKey: `email-qa-3c4p2-${state}-${suffix}`,
      accountActionTokenId: token.id,
    } });
    const delivery = await prisma.notificationDelivery.create({ data: {
      notificationId: notification.id,
      channel: NotificationChannel.EMAIL,
      recipient: targetEmail,
    } });
    return { tokenId: token.id, deliveryId: delivery.id };
  }

  async function createAdditionalEligibleInvitation() {
    const now = new Date();
    const token = await prisma.accountActionToken.create({ data: {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: targetId,
      companyId: null,
      tokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
      expiresAt: new Date(now.getTime() + 60_000),
      createdByUserId: actorId,
    } });
    const notification = await prisma.notification.create({ data: {
      userId: targetId,
      type: NotificationType.ACCOUNT_INVITATION,
      channel: NotificationChannel.EMAIL,
      title: 'Concurrent invitation',
      message: 'Concurrent invitation evidence',
      idempotencyKey: `email-qa-3c4p2-eligible-${suffix}`,
      accountActionTokenId: token.id,
    } });
    const delivery = await prisma.notificationDelivery.create({ data: {
      notificationId: notification.id,
      channel: NotificationChannel.EMAIL,
      recipient: targetEmail,
    } });
    return { notificationId: notification.id, tokenId: token.id, deliveryId: delivery.id };
  }

  const service = () => new SmtpPlatformInvitationEligibilityService(prisma as never, { get: (key: string) =>
    key === 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED' } as never);
  const actor = () => ({ id: actorId } as never);

  it('selects the one current invitation without deleting expired history', async () => {
    const result = await service().get(targetId, actor());
    assert.equal(result.available, true);
    assert.equal(result.delivery?.deliveryId, currentDeliveryId);
    assert.equal(await prisma.accountActionToken.count({ where: { userId: targetId } }), 4);
  });

  it('fails closed only when multiple invitations are genuinely eligible', async () => {
    const additional = await createAdditionalEligibleInvitation();
    try {
      const results = await Promise.all([service().get(targetId, actor()), service().get(targetId, actor())]);
      assert.deepEqual(results.map(({ reasonCode }) => reasonCode), ['INVITATION_AMBIGUOUS', 'INVITATION_AMBIGUOUS']);
    } finally {
      await prisma.notificationDelivery.delete({ where: { id: additional.deliveryId } });
      await prisma.notification.delete({ where: { id: additional.notificationId } });
      await prisma.accountActionToken.delete({ where: { id: additional.tokenId } });
    }
    assert.equal((await service().get(targetId, actor())).available, true);
  });

  it('matches POST retry and claim timing predicates', async () => {
    await prisma.notificationDelivery.update({ where: { id: currentDeliveryId }, data: {
      attemptCount: 2, errorCode: 'SMTP_CONNECTION_FAILED', nextRetryAt: new Date(Date.now() + 60_000) } });
    assert.equal((await service().get(targetId, actor())).available, false);
    await prisma.notificationDelivery.update({ where: { id: currentDeliveryId }, data: { nextRetryAt: new Date(Date.now() - 1_000) } });
    assert.equal((await service().get(targetId, actor())).available, true);
    const claimToken = randomUUID();
    await prisma.notificationDelivery.update({ where: { id: currentDeliveryId }, data: { claimToken, claimExpiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await service().get(targetId, actor())).available, false);
    await prisma.notificationDelivery.update({ where: { id: currentDeliveryId }, data: { claimExpiresAt: new Date(Date.now() - 1_000) } });
    assert.equal((await service().get(targetId, actor())).available, true);
    await prisma.notificationDelivery.update({ where: { id: currentDeliveryId }, data: { attemptCount: 5,
      claimToken: null, claimExpiresAt: null } });
    assert.equal((await service().get(targetId, actor())).reasonCode, 'DELIVERY_INELIGIBLE');
    await prisma.notificationDelivery.update({ where: { id: currentDeliveryId }, data: { claimToken: null, claimExpiresAt: null, nextRetryAt: null, errorCode: null } });
    await prisma.notificationDelivery.update({ where: { id: currentDeliveryId }, data: { attemptCount: 0 } });
    assert.equal((await service().get(targetId, actor())).available, true);
  });

  it('fails closed while a matching dispatch fence is unresolved', async () => {
    const dispatchId = randomUUID();
    await prisma.auditLog.create({ data: { actorUserId: actorId, action: SMTP_INVITATION_BOOTSTRAP_STARTED,
      entityType: 'SmtpConfigurationVersion', entityId: configurationId, metadata: { dispatchId } } });
    assert.equal((await service().get(targetId, actor())).reasonCode, 'DISPATCH_UNRESOLVED');
    await prisma.auditLog.create({ data: { actorUserId: actorId, action: SMTP_INVITATION_BOOTSTRAP_COMPLETED,
      entityType: 'SmtpConfigurationVersion', entityId: configurationId, metadata: { dispatchId } } });
    assert.equal((await service().get(targetId, actor())).available, true);
  });
});

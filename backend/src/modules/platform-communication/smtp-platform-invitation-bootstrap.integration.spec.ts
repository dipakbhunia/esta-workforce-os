import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  AccountActionTokenPurpose,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  PrismaClient,
  RoleName,
  SmtpConfigurationLifecycle,
  SmtpSecurityMode,
  UserStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { IdentityActionsService } from '../identity-actions/identity-actions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationRecipientResolver } from '../notifications/notification-recipient-resolver.service';
import { SmtpPlatformInvitationBootstrapService } from './smtp-platform-invitation-bootstrap.service';

const enabled = process.env.RUN_SMTP_PLATFORM_INVITATION_BOOTSTRAP_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const secret = 'platform-invitation-disposable-secret-at-least-32-characters';

describeDb('EMAIL-QA.3C.4H PostgreSQL restricted platform invitation bootstrap', () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userIds: string[] = [];
  let roleId: string;
  let createdRole = false;
  let configurationId: string;
  const configurationIds: string[] = [];

  before(async () => {
    await prisma.$connect();
    const database = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    assert.match(database[0]?.name ?? '', /^esta_email_qa_3c4(?:h|p8)_[a-z0-9_]+$/);
    const existingRole = await prisma.role.findFirst({ where: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null } });
    if (existingRole) roleId = existingRole.id;
    else {
      roleId = randomUUID();
      await prisma.role.create({ data: { id: roleId, key: `EMAIL_QA_3C4H_SUPER_ADMIN_${suffix}`,
        name: 'EMAIL-QA.3C.4H Super Admin', systemName: RoleName.SUPER_ADMIN } });
      createdRole = true;
    }
    const configuration = await prisma.smtpConfigurationVersion.create({ data: {
      lifecycle: SmtpConfigurationLifecycle.TESTED,
      host: 'smtp.example.test',
      port: 587,
      securityMode: SmtpSecurityMode.STARTTLS,
      username: 'mailer',
      encryptedPassword: Uint8Array.from([1, 2, 3]),
      encryptionKeyId: 'test-key',
      senderEmail: 'sender@example.test',
      senderDisplayName: 'Sender',
      structurallyValidatedAt: new Date(),
      connectionTestedAt: new Date(),
      connectionTestSucceeded: true,
      connectionTestResultCode: 'SUCCESS',
    } });
    configurationId = configuration.id;
    configurationIds.push(configuration.id);
  });

  after(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.notificationDelivery.deleteMany({ where: { notification: { userId: { in: userIds } } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.accountActionToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.smtpConfigurationVersion.deleteMany({ where: { id: { in: configurationIds } } });
    if (createdRole) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  function identityService() {
    const notifications = new NotificationsService(prisma as never,
      new NotificationRecipientResolver(prisma as never), {} as never, {} as never);
    return new IdentityActionsService(prisma as never, {
      get: (key: string, fallback?: unknown) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : fallback,
      getOrThrow: () => secret,
    } as never, notifications);
  }

  async function createActorAndInvitation(label: string) {
    const actorId = randomUUID();
    const targetUserId = randomUUID();
    const actorEmail = `actor-${label}-${suffix}@example.test`;
    const targetEmail = `target-${label}-${suffix}@example.test`;
    await prisma.user.create({ data: { id: actorId, email: actorEmail, passwordHash: 'integration-only',
      firstName: 'Actor', lastName: label, roles: { create: { roleId } } } });
    await prisma.user.create({ data: { id: targetUserId, email: targetEmail, passwordHash: 'integration-only',
      firstName: 'Target', lastName: label, status: UserStatus.INACTIVE, roles: { create: { roleId } } } });
    userIds.push(actorId, targetUserId);
    const identity = identityService();
    const token = await prisma.$transaction((tx) => identity.issueTokenInTransaction(tx, {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: targetUserId,
      companyId: null,
      createdByUserId: actorId,
    }));
    assert.equal(await identity.enqueueInvitation(token.id, targetUserId, 'Esta Workforce OS'), true);
    const invitation = await prisma.notification.findFirstOrThrow({ where: {
      userId: targetUserId,
      type: NotificationType.ACCOUNT_INVITATION,
      accountActionTokenId: token.id,
    }, include: { deliveries: true } });
    const actor: AuthenticatedUser = { id: actorId, companyId: null, email: actorEmail, firstName: 'Actor',
      lastName: label, status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
    return { actor, targetUserId, targetEmail, deliveryId: invitation.deliveries[0].id };
  }

  async function createSecondEligibleInvitation(targetUserId: string, targetEmail: string, actorId: string) {
    const token = await prisma.accountActionToken.create({ data: {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: targetUserId,
      companyId: null,
      tokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
      expiresAt: new Date(Date.now() + 60 * 60_000),
      createdByUserId: actorId,
    } });
    const notification = await prisma.notification.create({ data: {
      userId: targetUserId,
      companyId: null,
      type: NotificationType.ACCOUNT_INVITATION,
      channel: NotificationChannel.EMAIL,
      title: 'Second current invitation',
      message: 'Synthetic ambiguity fixture.',
      status: NotificationStatus.PENDING,
      idempotencyKey: `email-qa-3c4p6-invitation:${token.id}`,
      accountActionTokenId: token.id,
      deliveries: { create: { channel: NotificationChannel.EMAIL, recipient: targetEmail } },
    }, include: { deliveries: true } });
    return notification.deliveries[0].id;
  }

  function service(send: (notification: { type: NotificationType }, recipient: string) => Promise<{ skipped: boolean; providerMessageId?: string }>) {
    return new SmtpPlatformInvitationBootstrapService(
      prisma as never,
      { get: (key: string) => key === 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED' ? true : false } as never,
      { decrypt: () => 'synthetic-password' } as never,
      { send, sanitizeError: () => ({ code: 'SMTP_UNKNOWN', message: 'Email delivery failed.' }),
        isDefinitiveNonAcceptance: () => false } as never,
    );
  }

  async function createEligibleConfiguration() {
    const configuration = await prisma.smtpConfigurationVersion.create({ data: {
      lifecycle: SmtpConfigurationLifecycle.TESTED,
      host: 'smtp-secondary.example.test',
      port: 587,
      securityMode: SmtpSecurityMode.STARTTLS,
      username: 'secondary-mailer',
      encryptedPassword: Uint8Array.from([4, 5, 6]),
      encryptionKeyId: 'test-key',
      senderEmail: 'secondary@example.test',
      senderDisplayName: 'Secondary Sender',
      structurallyValidatedAt: new Date(),
      connectionTestedAt: new Date(),
      connectionTestSucceeded: true,
      connectionTestResultCode: 'SUCCESS',
    } });
    configurationIds.push(configuration.id);
    return configuration;
  }

  it('atomically sends one exact platform invitation and preserves an unrelated pending monitoring delivery', async () => {
    const fixture = await createActorAndInvitation('concurrent');
    const unrelated = await prisma.notification.create({ data: {
      userId: fixture.actor.id,
      companyId: null,
      type: NotificationType.ALERT_OPENED,
      channel: NotificationChannel.EMAIL,
      title: 'Unrelated monitoring alert',
      message: 'Must remain pending.',
      status: NotificationStatus.PENDING,
      idempotencyKey: `email-qa-3c4h-alert:${suffix}`,
      deliveries: { create: { channel: NotificationChannel.EMAIL, recipient: fixture.actor.email } },
    }, include: { deliveries: true } });
    let sends = 0;
    const value = service(async (notification, recipient) => {
      assert.equal(notification.type, NotificationType.ACCOUNT_INVITATION);
      assert.equal(recipient, fixture.targetEmail);
      sends += 1;
      return { skipped: false, providerMessageId: 'synthetic-provider-id' };
    });
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    const dto = { revision, targetUserId: fixture.targetUserId, deliveryId: fixture.deliveryId };
    const outcomes = await Promise.allSettled([
      value.send(configurationId, dto, fixture.actor),
      value.send(configurationId, dto, fixture.actor),
    ]);
    const outcomeEvidence = outcomes.map((outcome) => outcome.status === 'fulfilled'
      ? 'fulfilled'
      : String(outcome.reason?.message ?? outcome.reason)).join(' | ');
    assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1, outcomeEvidence);
    assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
    assert.equal(sends, 1);
    const sent = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
    assert.equal(sent.status, NotificationStatus.DELIVERED);
    assert.equal(sent.attemptCount, 1);
    const preserved = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: unrelated.deliveries[0].id } });
    assert.equal(preserved.status, NotificationStatus.PENDING);
    assert.equal(preserved.attemptCount, 0);
    assert.equal(preserved.claimToken, null);
  });

  it('rejects cross-user delivery selection without mutation or transport', async () => {
    const first = await createActorAndInvitation('first');
    const second = await createActorAndInvitation('second');
    let sends = 0;
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    await assert.rejects(() => service(async () => {
      sends += 1;
      return { skipped: false };
    }).send(configurationId, { revision, targetUserId: first.targetUserId, deliveryId: second.deliveryId }, first.actor));
    assert.equal(sends, 0);
    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: second.deliveryId } });
    assert.equal(delivery.status, NotificationStatus.PENDING);
    assert.equal(delivery.attemptCount, 0);
  });

  it('rejects two genuinely eligible invitations for one target before reservation or transport', async () => {
    const fixture = await createActorAndInvitation('invitation-ambiguous-reservation');
    const secondDeliveryId = await createSecondEligibleInvitation(
      fixture.targetUserId,
      fixture.targetEmail,
      fixture.actor.id,
    );
    let sends = 0;
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    await assert.rejects(() => service(async () => { sends += 1; return { skipped: false }; })
      .send(configurationId, { revision, targetUserId: fixture.targetUserId, deliveryId: fixture.deliveryId }, fixture.actor), /ambiguous/i);
    assert.equal(sends, 0);
    for (const id of [fixture.deliveryId, secondDeliveryId]) {
      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id } });
      assert.equal(delivery.status, NotificationStatus.PENDING);
      assert.equal(delivery.attemptCount, 0);
      assert.equal(delivery.claimToken, null);
    }
  });

  it('blocks transport when a second eligible invitation appears before pre-send revalidation', async () => {
    const fixture = await createActorAndInvitation('invitation-ambiguous-presend');
    let sends = 0;
    const value = service(async () => { sends += 1; return { skipped: false }; });
    const internals = value as unknown as { revalidateBeforeSend: (...args: unknown[]) => Promise<void> };
    const original = internals.revalidateBeforeSend.bind(value);
    internals.revalidateBeforeSend = async (...args: unknown[]) => {
      await createSecondEligibleInvitation(fixture.targetUserId, fixture.targetEmail, fixture.actor.id);
      await original(...args);
    };
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    await assert.rejects(() => value.send(configurationId,
      { revision, targetUserId: fixture.targetUserId, deliveryId: fixture.deliveryId }, fixture.actor), /authority changed before delivery/i);
    assert.equal(sends, 0);
    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
    assert.equal(delivery.status, NotificationStatus.PENDING);
    assert.equal(delivery.attemptCount, 1);
    assert.equal(delivery.errorCode, 'SMTP_BOOTSTRAP_AUTHORITY_CHANGED');
  });

  it('rejects ambiguous SMTP authority before reserving the selected delivery', async () => {
    const fixture = await createActorAndInvitation('smtp-ambiguous-reservation');
    const extra = await createEligibleConfiguration();
    let sends = 0;
    try {
      const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
      await assert.rejects(() => service(async () => { sends += 1; return { skipped: false }; })
        .send(configurationId, { revision, targetUserId: fixture.targetUserId, deliveryId: fixture.deliveryId }, fixture.actor));
      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
      assert.equal(sends, 0);
      assert.equal(delivery.status, NotificationStatus.PENDING);
      assert.equal(delivery.attemptCount, 0);
    } finally {
      await prisma.smtpConfigurationVersion.delete({ where: { id: extra.id } });
      configurationIds.splice(configurationIds.indexOf(extra.id), 1);
    }
  });

  it('rejects authority that becomes ambiguous before transport', async () => {
    const fixture = await createActorAndInvitation('smtp-ambiguous-presend');
    let sends = 0;
    const value = service(async () => { sends += 1; return { skipped: false }; });
    const internals = value as unknown as { revalidateBeforeSend: (...args: unknown[]) => Promise<void> };
    const original = internals.revalidateBeforeSend.bind(value);
    let extra: Awaited<ReturnType<typeof createEligibleConfiguration>> | undefined;
    internals.revalidateBeforeSend = async (...args: unknown[]) => {
      extra = await createEligibleConfiguration();
      await original(...args);
    };
    try {
      const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
      await assert.rejects(() => value.send(configurationId,
        { revision, targetUserId: fixture.targetUserId, deliveryId: fixture.deliveryId }, fixture.actor), /authority changed before delivery/i);
      assert.equal(sends, 0);
      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
      assert.equal(delivery.status, NotificationStatus.PENDING);
      assert.equal(delivery.attemptCount, 1);
      assert.equal(delivery.errorCode, 'SMTP_BOOTSTRAP_AUTHORITY_CHANGED');
    } finally {
      if (extra) {
        await prisma.smtpConfigurationVersion.delete({ where: { id: extra.id } });
        configurationIds.splice(configurationIds.indexOf(extra.id), 1);
      }
    }
  });

  it('prevents replacement issuance after reservation commits and permits it only after definitive completion', async () => {
    const fixture = await createActorAndInvitation('issuance-fenced');
    let validationReached!: () => void;
    let releaseValidation!: () => void;
    const atValidation = new Promise<void>((resolve) => { validationReached = resolve; });
    const release = new Promise<void>((resolve) => { releaseValidation = resolve; });
    let sends = 0;
    const value = service(async () => { sends += 1; return { skipped: false, providerMessageId: 'fenced-provider-id' }; });
    const internals = value as unknown as { revalidateBeforeSend: (...args: unknown[]) => Promise<void> };
    const original = internals.revalidateBeforeSend.bind(value);
    internals.revalidateBeforeSend = async (...args: unknown[]) => {
      await original(...args);
      validationReached();
      await release;
    };
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    const dispatch = value.send(configurationId,
      { revision, targetUserId: fixture.targetUserId, deliveryId: fixture.deliveryId }, fixture.actor);
    await atValidation;

    const currentBefore = await prisma.accountActionToken.findFirstOrThrow({ where: {
      userId: fixture.targetUserId,
      purpose: AccountActionTokenPurpose.INVITATION,
      invalidatedAt: null,
    } });
    await assert.rejects(() => prisma.$transaction((tx) => identityService().issueTokenInTransaction(tx, {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: fixture.targetUserId,
      companyId: null,
      createdByUserId: fixture.actor.id,
    })), /temporarily unavailable/i);
    const stillCurrent = await prisma.accountActionToken.findUniqueOrThrow({ where: { id: currentBefore.id } });
    assert.equal(stillCurrent.invalidatedAt, null);
    assert.equal(sends, 0);

    releaseValidation();
    await dispatch;
    assert.equal(sends, 1);
    const replacement = await prisma.$transaction((tx) => identityService().issueTokenInTransaction(tx, {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: fixture.targetUserId,
      companyId: null,
      createdByUserId: fixture.actor.id,
    }));
    assert.notEqual(replacement.id, currentBefore.id);
    assert.ok((await prisma.accountActionToken.findUniqueOrThrow({ where: { id: currentBefore.id } })).invalidatedAt);
  });

  it('keeps uncertain provider acceptance fenced against reinvitation', async () => {
    const fixture = await createActorAndInvitation('issuance-uncertain');
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    await assert.rejects(() => service(async () => { throw new Error('synthetic acceptance uncertainty'); })
      .send(configurationId, { revision, targetUserId: fixture.targetUserId, deliveryId: fixture.deliveryId }, fixture.actor),
    /automatic retry is unsafe/i);
    await assert.rejects(() => prisma.$transaction((tx) => identityService().issueTokenInTransaction(tx, {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: fixture.targetUserId,
      companyId: null,
      createdByUserId: fixture.actor.id,
    })), /temporarily unavailable/i);
    const liveTokens = await prisma.accountActionToken.count({ where: {
      userId: fixture.targetUserId,
      purpose: AccountActionTokenPurpose.INVITATION,
      invalidatedAt: null,
      consumedAt: null,
    } });
    assert.equal(liveTokens, 1);
  });

  it('serializes competing invitation issuance and leaves exactly one current authority', async () => {
    const fixture = await createActorAndInvitation('issuance-concurrent');
    const issue = () => prisma.$transaction((tx) => identityService().issueTokenInTransaction(tx, {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: fixture.targetUserId,
      companyId: null,
      createdByUserId: fixture.actor.id,
    }));
    const replacements = await Promise.all([issue(), issue()]);
    assert.notEqual(replacements[0].id, replacements[1].id);
    const live = await prisma.accountActionToken.findMany({ where: {
      userId: fixture.targetUserId,
      purpose: AccountActionTokenPurpose.INVITATION,
      invalidatedAt: null,
      consumedAt: null,
    } });
    assert.equal(live.length, 1);
    assert.ok(replacements.some(({ id }) => id === live[0].id));
  });

  it('fails closed on malformed target dispatch evidence without mutating invitation tokens', async () => {
    const fixture = await createActorAndInvitation('issuance-malformed-fence');
    const current = await prisma.accountActionToken.findFirstOrThrow({ where: {
      userId: fixture.targetUserId,
      purpose: AccountActionTokenPurpose.INVITATION,
      invalidatedAt: null,
    } });
    await prisma.auditLog.create({ data: {
      actorUserId: fixture.actor.id,
      action: 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_STARTED',
      entityType: 'SmtpConfigurationVersion',
      entityId: configurationId,
      metadata: { targetUserId: fixture.targetUserId },
    } });
    await assert.rejects(() => prisma.$transaction((tx) => identityService().issueTokenInTransaction(tx, {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: fixture.targetUserId,
      companyId: null,
      createdByUserId: fixture.actor.id,
    })), /temporarily unavailable/i);
    assert.equal((await prisma.accountActionToken.findUniqueOrThrow({ where: { id: current.id } })).invalidatedAt, null);
  });
});

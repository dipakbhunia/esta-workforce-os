import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  PrismaClient,
  RoleName,
  SmtpConfigurationLifecycle,
  SmtpSecurityMode,
  UserStatus,
} from '@prisma/client';
import { IdentityActionsService } from '../identity-actions/identity-actions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { EmailNotificationChannel } from '../notifications/email-notification-channel.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SmtpEmailVerificationBootstrapService } from './smtp-email-verification-bootstrap.service';
import { SmtpConfigurationLifecycleService } from './smtp-configuration-lifecycle.service';
import { SmtpConfigurationAuthorityService } from './smtp-configuration-authority.service';
import { acquireExclusiveSmtpAuthorityLock, acquireSharedSmtpAuthorityLock } from './smtp-authority-lock';

const enabled = process.env.RUN_SMTP_EMAIL_VERIFICATION_BOOTSTRAP_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const secret = 'email-qa-2c-disposable-secret-at-least-32-characters';

describeDb('EMAIL-QA.2C PostgreSQL targeted verification bootstrap', () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userIds: string[] = [];
  const companyIds: string[] = [];
  const tenantRoleIds: string[] = [];
  let roleId: string;
  let createdRole = false;
  let configurationId: string;
  let requestSequence = 10;

  const identityConfig = { get: (key: string, fallback?: unknown) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : fallback,
    getOrThrow: () => secret };
  const notifications = new NotificationsService(prisma as never, {} as never, {} as never, {} as never);
  const identity = new IdentityActionsService(prisma as never, identityConfig as never, notifications);

  before(async () => {
    await prisma.$connect();
    const existingRole = await prisma.role.findFirst({ where: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null } });
    if (existingRole) roleId = existingRole.id;
    else {
      roleId = randomUUID();
      await prisma.role.create({ data: { id: roleId, key: `EMAIL_QA_2C_SUPER_ADMIN_${suffix}`, name: 'EMAIL-QA.2C Super Admin', systemName: RoleName.SUPER_ADMIN } });
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
  });

  after(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.notificationDelivery.deleteMany({ where: { notification: { userId: { in: userIds } } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.accountActionToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: tenantRoleIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.smtpConfigurationVersion.delete({ where: { id: configurationId } });
    if (createdRole) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  async function createActor(label: string): Promise<AuthenticatedUser> {
    const id = randomUUID();
    const email = `email-qa-2c-${label}-${suffix}@example.test`;
    await prisma.user.create({ data: { id, email, passwordHash: 'integration-only', firstName: 'Email', lastName: 'Bootstrap',
      roles: { create: { roleId } } } });
    userIds.push(id);
    const actor: AuthenticatedUser = { id, companyId: null, email, firstName: 'Email', lastName: 'Bootstrap',
      status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
    await identity.requestEmailVerification(actor, { ipAddress: `192.0.2.${requestSequence++}`, userAgent: 'EMAIL-QA.2C' });
    return actor;
  }

  async function createTenantActor(label: string): Promise<AuthenticatedUser> {
    const company = await prisma.company.create({ data: {
      name: `EMAIL-QA.2C.5 ${label}`,
      slug: `email-qa-2c5-${label}-${suffix}`,
    } });
    companyIds.push(company.id);
    const role = await prisma.role.create({ data: {
      companyId: company.id,
      key: `EMAIL_QA_2C5_${label}_${suffix}`,
      name: `${label} Administrator`,
      systemName: RoleName.COMPANY_ADMIN,
    } });
    tenantRoleIds.push(role.id);
    const id = randomUUID();
    const email = `email-qa-2c5-${label}-${suffix}@example.test`;
    await prisma.user.create({ data: {
      id, companyId: company.id, email, passwordHash: 'integration-only',
      firstName: label, lastName: 'Administrator', roles: { create: { roleId: role.id } },
    } });
    userIds.push(id);
    const actor: AuthenticatedUser = {
      id, companyId: company.id, email, firstName: label, lastName: 'Administrator',
      status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN],
    };
    await identity.requestEmailVerification(actor, { ipAddress: `198.51.100.${requestSequence++}`, userAgent: 'EMAIL-QA.2C.5' });
    return actor;
  }

  function service(send: (notification: { type: NotificationType }, recipient: string) => Promise<{ skipped: boolean; providerMessageId?: string }>,
    definitiveFailure = false) {
    return new SmtpEmailVerificationBootstrapService(
      prisma as never,
      { get: (key: string) => key === 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED' ? true : false } as never,
      { decrypt: () => 'synthetic-password' } as never,
      { send, sanitizeError: () => ({ code: 'SMTP_UNKNOWN', message: 'Email delivery failed.' }),
        isDefinitiveNonAcceptance: () => definitiveFailure } as never,
    );
  }

  it('atomically selects only the current actor verification delivery and never touches an unrelated alert', async () => {
    const actor = await createActor('concurrent');
    const alert = await prisma.notification.create({ data: {
      userId: actor.id,
      companyId: null,
      type: NotificationType.ALERT_OPENED,
      channel: NotificationChannel.EMAIL,
      title: 'Unrelated',
      message: 'Must remain pending.',
      status: NotificationStatus.PENDING,
      idempotencyKey: `email-qa-2c-alert:${suffix}`,
      deliveries: { create: { channel: NotificationChannel.EMAIL, recipient: actor.email } },
    }, include: { deliveries: true } });
    let sends = 0;
    const value = service(async (notification, recipient) => {
      assert.equal(notification.type, NotificationType.EMAIL_VERIFICATION);
      assert.equal(recipient, actor.email);
      sends += 1;
      return { skipped: false, providerMessageId: 'synthetic-provider-id' };
    });
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    const outcomes = await Promise.allSettled([
      value.send(configurationId, { revision }, actor),
      value.send(configurationId, { revision }, actor),
    ]);
    assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
    assert.equal(sends, 1);
    const verification = await prisma.notification.findFirstOrThrow({ where: { userId: actor.id, type: NotificationType.EMAIL_VERIFICATION }, include: { deliveries: true } });
    assert.equal(verification.status, NotificationStatus.DELIVERED);
    assert.equal(verification.deliveries[0]?.status, NotificationStatus.DELIVERED);
    assert.equal(verification.deliveries[0]?.attemptCount, 1);
    const unchangedAlert = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: alert.deliveries[0].id } });
    assert.equal(unchangedAlert.status, NotificationStatus.PENDING);
    assert.equal(unchangedAlert.attemptCount, 0);
    assert.equal(unchangedAlert.claimToken, null);
  });

  it('persists a bounded retry after synthetic SMTP failure without leaking the provider error', async () => {
    const actor = await createActor('failure');
    const value = service(async () => { throw new Error('synthetic provider secret'); }, true);
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    await assert.rejects(() => value.send(configurationId, { revision }, actor), /could not be sent/i);
    const verification = await prisma.notification.findFirstOrThrow({ where: { userId: actor.id, type: NotificationType.EMAIL_VERIFICATION }, include: { deliveries: true } });
    const delivery = verification.deliveries[0];
    assert.equal(delivery.status, NotificationStatus.PENDING);
    assert.equal(delivery.attemptCount, 1);
    assert.equal(delivery.claimToken, null);
    assert.ok(delivery.nextRetryAt);
    assert.equal(delivery.safeErrorMessage?.includes('synthetic provider secret'), false);
    const audits = await prisma.auditLog.findMany({ where: { actorUserId: actor.id } });
    assert.equal(JSON.stringify(audits).includes('synthetic provider secret'), false);
    assert.ok(audits.some(({ action }) => action === 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_COMPLETED'));
  });

  it('quarantines ambiguous transport failures without bootstrap or general-worker retry', async () => {
    for (const [label, error] of [
      ['accepted-response-lost', new Error('provider accepted but response was lost')],
      ['reset-after-data', Object.assign(new Error('connection reset'), { code: 'ECONNRESET', command: 'DATA' })],
      ['generic-timeout', Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })],
    ] as const) {
      const actor = await createActor(label);
      let sends = 0;
      const value = service(async () => { sends += 1; throw error; });
      const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
      await assert.rejects(() => value.send(configurationId, { revision }, actor), /automatic retry is unsafe/i);
      const verification = await prisma.notification.findFirstOrThrow({
        where: { userId: actor.id, type: NotificationType.EMAIL_VERIFICATION }, include: { deliveries: true },
      });
      const delivery = verification.deliveries[0];
      assert.equal(sends, 1);
      assert.equal(delivery.status, NotificationStatus.FAILED);
      assert.equal(delivery.errorCode, 'SMTP_ACCEPTANCE_UNCERTAIN');
      assert.equal(delivery.nextRetryAt, null);
      assert.ok(delivery.claimToken);
      await assert.rejects(() => value.send(configurationId, { revision }, actor), /unresolved verification delivery/i);
      const ordinary = new NotificationDeliveryService(
        prisma as never, {} as never, { resolveForClaim: async () => ({ state: 'USABLE', snapshot: {} }) } as never,
      );
      assert.equal(await ordinary.claimNextDelivery(delivery.id, new Date(Date.now() + 24 * 60 * 60_000)), null);
      const started = await prisma.auditLog.findFirstOrThrow({ where: {
        actorUserId: actor.id, action: 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_STARTED', entityId: configurationId,
      }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      assert.equal(await prisma.auditLog.count({ where: {
        action: 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_COMPLETED', entityId: configurationId,
        metadata: { path: ['dispatchId'], equals: String((started.metadata as Record<string, unknown>)?.dispatchId) },
      } }), 0);
      await prisma.auditLog.create({ data: {
        actorUserId: actor.id, action: 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_COMPLETED',
        entityType: 'SmtpConfigurationVersion', entityId: configurationId,
        metadata: { dispatchId: String((started.metadata as Record<string, unknown>)?.dispatchId), category: 'TEST_FIXTURE_RESOLVED' },
      } });
    }
  });

  it('keeps provider-accepted mail durably quarantined when completion persistence fails', async () => {
    const actor = await createActor('uncertain');
    const value = service(async () => ({ skipped: false, providerMessageId: 'synthetic-accepted-id' }));
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION email_qa_2c1_reject_completion() RETURNS trigger AS $$
      BEGIN
        IF NEW."action" = 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_COMPLETED' THEN
          RAISE EXCEPTION 'synthetic completion persistence failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER email_qa_2c1_reject_completion
      BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION email_qa_2c1_reject_completion()`);
    try {
      await assert.rejects(() => value.send(configurationId, { revision }, actor), /automatic retry is unsafe/i);
      const verification = await prisma.notification.findFirstOrThrow({
        where: { userId: actor.id, type: NotificationType.EMAIL_VERIFICATION }, include: { deliveries: true },
      });
      const delivery = verification.deliveries[0];
      assert.equal(delivery.status, NotificationStatus.FAILED);
      assert.equal(delivery.errorCode, 'SMTP_ACCEPTANCE_UNCERTAIN');
      assert.equal(delivery.nextRetryAt, null);
      assert.ok(delivery.claimToken);

      await assert.rejects(() => value.send(configurationId, { revision }, actor), /unresolved verification delivery/i);
      const ordinary = new NotificationDeliveryService(
        prisma as never,
        {} as never,
        { resolveForClaim: async () => ({ state: 'USABLE', snapshot: {} }) } as never,
      );
      assert.equal(await ordinary.claimNextDelivery(delivery.id, new Date(Date.now() + 24 * 60 * 60_000)), null);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS email_qa_2c1_reject_completion ON "AuditLog"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS email_qa_2c1_reject_completion()');
      const started = await prisma.auditLog.findFirstOrThrow({ where: {
        actorUserId: actor.id, action: 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_STARTED', entityId: configurationId,
      }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      const dispatchId = (started.metadata as Record<string, unknown>)?.dispatchId;
      await prisma.auditLog.create({ data: {
        actorUserId: actor.id,
        action: 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_COMPLETED',
        entityType: 'SmtpConfigurationVersion',
        entityId: configurationId,
        metadata: { dispatchId: String(dispatchId), category: 'TEST_FIXTURE_RESOLVED' },
      } });
    }
  });

  it('deterministically fences edit, activation, rollback, enable, and disable during dispatch', async () => {
    const actor = await createActor('configuration-fence');
    const row = await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const insideTransport = new Promise<void>((resolve) => { entered = resolve; });
    const dispatch = service(async () => {
      entered();
      await held;
      return { skipped: false, providerMessageId: 'synthetic-fenced-id' };
    }).send(configurationId, { revision: row.revision }, actor);
    await insideTransport;

    const lifecycle = new SmtpConfigurationLifecycleService(
      prisma as never,
      { encrypt: () => { throw new Error('encryption must not run while fenced'); } } as never,
      {} as never,
    );
    const authority = new SmtpConfigurationAuthorityService(
      prisma as never,
      { decrypt: () => 'synthetic-password' } as never,
      { get: () => true } as never,
    );
    const expectedFence = /unresolved verification delivery/i;
    await assert.rejects(
      () => lifecycle.updateDraft(configurationId, { revision: row.revision, senderDisplayName: 'Blocked' }, actor),
      expectedFence,
    );
    await assert.rejects(() => authority.activate(configurationId,
      { settingsRevision: 0, targetRevision: row.revision }, actor), expectedFence);
    await assert.rejects(() => authority.rollback(configurationId,
      { settingsRevision: 0, targetRevision: row.revision }, actor), expectedFence);
    await assert.rejects(() => authority.enable({ settingsRevision: 0 }, actor), expectedFence);
    await assert.rejects(() => authority.disable({ settingsRevision: 0 }, actor), expectedFence);

    release();
    const result = await dispatch;
    assert.equal(result.acceptedByProvider, true);
    const unchanged = await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } });
    assert.equal(unchanged.revision, row.revision);
    assert.equal(unchanged.senderDisplayName, row.senderDisplayName);
  });

  it('rejects changed identity authority before transport', async () => {
    const cases: Array<[string, (actor: AuthenticatedUser) => Promise<void>]> = [
      ['email-revision', async (actor) => {
        await prisma.user.update({ where: { id: actor.id }, data: {
          email: `changed-${suffix}@example.test`, emailRevision: { increment: 1 },
        } });
      }],
      ['inactive-user', async (actor) => {
        await prisma.user.update({ where: { id: actor.id }, data: { status: UserStatus.INACTIVE } });
      }],
      ['deleted-user', async (actor) => {
        await prisma.user.update({ where: { id: actor.id }, data: { deletedAt: new Date() } });
      }],
      ['role-removed', async (actor) => {
        await prisma.userRole.deleteMany({ where: { userId: actor.id } });
      }],
    ];
    for (const [label, mutate] of cases) {
      const actor = await createActor(label);
      await mutate(actor);
      let sends = 0;
      const value = service(async () => { sends += 1; return { skipped: false }; });
      const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
      await assert.rejects(() => value.send(configurationId, { revision }, actor));
      assert.equal(sends, 0, label);
    }
  });

  it('revalidates role removal in the channel after service-level authority validation', async () => {
    const actor = await createActor('role-removed-after-revalidation');
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    let transportCalls = 0;
    const channel = new EmailNotificationChannel(
      { get: (key: string) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : undefined,
        getOrThrow: (key: string) => key === 'PUBLIC_APP_ORIGIN' ? 'https://app.example.test' : secret } as never,
      prisma as never,
      undefined as never,
      { sendEmail: async () => { transportCalls += 1; return { messageId: 'must-not-send' }; } } as never,
    );
    const guardedChannel = {
      send: async (notification: Parameters<EmailNotificationChannel['send']>[0], recipient: string,
        smtp: Parameters<EmailNotificationChannel['send']>[2]) => {
        await prisma.userRole.deleteMany({ where: { userId: actor.id } });
        return channel.send(notification, recipient, smtp);
      },
      sanitizeError: (error: unknown) => channel.sanitizeError(error),
      isDefinitiveNonAcceptance: (error: unknown) => channel.isDefinitiveNonAcceptance(error),
    };
    const value = new SmtpEmailVerificationBootstrapService(
      prisma as never,
      { get: (key: string) => key === 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED' ? true : false } as never,
      { decrypt: () => 'synthetic-password' } as never,
      guardedChannel as never,
    );
    await assert.rejects(() => value.send(configurationId, { revision }, actor), /authority changed/i);
    assert.equal(transportCalls, 0);
    const delivery = await prisma.notificationDelivery.findFirstOrThrow({ where: { notification: { userId: actor.id } } });
    assert.equal(delivery.status, NotificationStatus.CANCELLED);
    assert.equal(delivery.errorCode, 'EMAIL_VERIFICATION_STALE');
  });

  it('rejects stale claim finalization and preserves terminal uncertainty', async () => {
    const actor = await createActor('claim-mismatch');
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const insideTransport = new Promise<void>((resolve) => { entered = resolve; });
    const dispatch = service(async () => {
      entered(); await held;
      return { skipped: false, providerMessageId: 'synthetic-stale-claim' };
    }).send(configurationId, { revision }, actor);
    await insideTransport;
    const delivery = await prisma.notificationDelivery.findFirstOrThrow({ where: { notification: { userId: actor.id } } });
    await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { claimToken: randomUUID() } });
    release();
    await assert.rejects(() => dispatch, /authority changed/i);
    const quarantined = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.equal(quarantined.status, NotificationStatus.FAILED);
    assert.equal(quarantined.errorCode, 'SMTP_ACCEPTANCE_UNCERTAIN');
    assert.equal(quarantined.nextRetryAt, null);
    const started = await prisma.auditLog.findFirstOrThrow({ where: {
      actorUserId: actor.id, action: 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_STARTED', entityId: configurationId,
    }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    await prisma.auditLog.create({ data: {
      actorUserId: actor.id, action: 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_COMPLETED',
      entityType: 'SmtpConfigurationVersion', entityId: configurationId,
      metadata: { dispatchId: String((started.metadata as Record<string, unknown>)?.dispatchId), category: 'TEST_FIXTURE_RESOLVED' },
    } });
  });

  it('terminates a definite provider rejection at the fifth attempt with no sixth dispatch', async () => {
    const actor = await createActor('retry-exhaustion');
    const delivery = await prisma.notificationDelivery.findFirstOrThrow({ where: { notification: { userId: actor.id } } });
    await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { attemptCount: 4 } });
    let sends = 0;
    const value = service(async () => { sends += 1; throw new Error('synthetic provider rejection'); }, true);
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    await assert.rejects(() => value.send(configurationId, { revision }, actor), /could not be sent/i);
    const exhausted = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.equal(exhausted.attemptCount, 5);
    assert.equal(exhausted.status, NotificationStatus.FAILED);
    assert.equal(exhausted.nextRetryAt, null);
    await assert.rejects(() => value.send(configurationId, { revision }, actor), /eligible email verification delivery/i);
    assert.equal(sends, 1);
  });

  it('bounds shared and exclusive SMTP authority lock contention without session contamination', async () => {
    async function contend(holderShared: boolean, waiterShared: boolean, releaseBeforeDeadline: boolean) {
      const holder = new PrismaClient();
      const waiter = new PrismaClient();
      await Promise.all([holder.$connect(), waiter.$connect()]);
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      let acquired!: () => void;
      const ready = new Promise<void>((resolve) => { acquired = resolve; });
      const holding = holder.$transaction(async (tx) => {
        if (holderShared) await acquireSharedSmtpAuthorityLock(tx as never);
        else await acquireExclusiveSmtpAuthorityLock(tx as never);
        acquired();
        await held;
      }, { timeout: 10_000 });
      await ready;
      const started = Date.now();
      const waiting = waiter.$transaction(async (tx) => {
        if (waiterShared) await acquireSharedSmtpAuthorityLock(tx as never);
        else await acquireExclusiveSmtpAuthorityLock(tx as never);
      }, { timeout: 10_000 });
      if (releaseBeforeDeadline) {
        setTimeout(release, 100);
        await waiting;
        assert.ok(Date.now() - started < 2_000);
      } else {
        await assert.rejects(waiting, /temporarily busy/i);
        const elapsed = Date.now() - started;
        assert.ok(elapsed >= 1_500 && elapsed < 5_000, `bounded lock elapsed ${elapsed}ms`);
        release();
      }
      await holding;
      const session = await waiter.$queryRawUnsafe<Array<{ lock_timeout: string }>>('SHOW lock_timeout');
      assert.equal(session[0]?.lock_timeout, '0');
      await Promise.all([holder.$disconnect(), waiter.$disconnect()]);
    }

    await contend(false, false, false);
    await contend(true, false, false);
    await contend(false, true, false);
    await contend(false, false, true);
    await contend(false, false, false);
  });

  it('isolates concurrent platform, Tenant A, and Tenant B verification deliveries', async () => {
    const platform = await createActor('platform-isolation');
    const tenantA = await createTenantActor('tenant-a');
    const tenantB = await createTenantActor('tenant-b');
    const alert = await prisma.notification.create({ data: {
      userId: tenantA.id,
      companyId: tenantA.companyId,
      type: NotificationType.ALERT_OPENED,
      channel: NotificationChannel.EMAIL,
      title: 'Tenant alert', message: 'Must remain untouched.',
      status: NotificationStatus.PENDING,
      idempotencyKey: `email-qa-2c5-alert:${suffix}`,
      deliveries: { create: { channel: NotificationChannel.EMAIL, recipient: tenantB.email } },
    }, include: { deliveries: true } });
    let sends = 0;
    let recipient = '';
    const value = service(async (_notification, target) => {
      sends += 1; recipient = target;
      return { skipped: false, providerMessageId: 'synthetic-platform-only' };
    });
    const revision = (await prisma.smtpConfigurationVersion.findUniqueOrThrow({ where: { id: configurationId } })).revision;
    const outcomes = await Promise.allSettled([
      value.send(configurationId, { revision }, tenantA),
      value.send(configurationId, { revision }, tenantB),
      value.send(configurationId, { revision }, platform),
    ]);
    assert.equal(outcomes[0].status, 'rejected');
    assert.equal(outcomes[1].status, 'rejected');
    assert.equal(outcomes[2].status, 'fulfilled', outcomes.map((outcome) => outcome.status === 'rejected'
      ? String(outcome.reason?.message ?? outcome.reason)
      : 'fulfilled').join(' | '));
    assert.equal(sends, 1);
    assert.equal(recipient, platform.email);
    const tenantDeliveries = await prisma.notificationDelivery.findMany({ where: {
      notification: { userId: { in: [tenantA.id, tenantB.id] }, type: NotificationType.EMAIL_VERIFICATION },
    } });
    assert.ok(tenantDeliveries.every((delivery) => delivery.status === NotificationStatus.PENDING &&
      delivery.attemptCount === 0 && delivery.claimToken === null));
    const unchangedAlert = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: alert.deliveries[0].id } });
    assert.equal(unchangedAlert.status, NotificationStatus.PENDING);
    assert.equal(unchangedAlert.attemptCount, 0);
    assert.equal(unchangedAlert.recipient, tenantB.email);
  });
});

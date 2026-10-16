import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  RoleName,
  SmtpConfigurationLifecycle,
  SmtpSecurityMode,
  UserStatus,
} from '@prisma/client';
import { SmtpEmailVerificationBootstrapService } from './smtp-email-verification-bootstrap.service';

const actorId = '00000000-0000-4000-8000-000000000001';
const configurationId = '00000000-0000-4000-8000-000000000002';
const deliveryId = '00000000-0000-4000-8000-000000000003';
const notificationId = '00000000-0000-4000-8000-000000000004';
const authenticated = { id: actorId, companyId: null, email: 'admin@example.test', firstName: 'A', lastName: 'B',
  status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };

const actor = (overrides: Record<string, unknown> = {}) => ({
  id: actorId,
  email: 'admin@example.test',
  emailRevision: 3,
  verifiedEmail: null,
  emailVerifiedAt: null,
  companyId: null,
  status: UserStatus.ACTIVE,
  deletedAt: null,
  roles: [{ role: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null } }],
  ...overrides,
});

const configuration = (overrides: Record<string, unknown> = {}) => ({
  id: configurationId,
  version: 7,
  revision: 4,
  lifecycle: SmtpConfigurationLifecycle.TESTED,
  host: 'smtp.example.test',
  port: 587,
  securityMode: SmtpSecurityMode.STARTTLS,
  username: 'mailer',
  encryptedPassword: Uint8Array.from([1, 2, 3]),
  encryptionKeyId: 'smtp-key-v1',
  senderEmail: 'sender@example.test',
  senderDisplayName: 'Sender',
  structurallyValidatedAt: new Date(),
  connectionTestedAt: new Date(),
  connectionTestSucceeded: true,
  connectionTestResultCode: 'SUCCESS',
  firstActivatedAt: null,
  revokedAt: null,
  ...overrides,
});

const notification = {
  id: notificationId,
  companyId: null,
  userId: actorId,
  alertId: null,
  type: NotificationType.EMAIL_VERIFICATION,
  channel: NotificationChannel.EMAIL,
  title: 'Verify email',
  message: 'Verify your current email.',
  severity: null,
  status: NotificationStatus.PENDING,
  readAt: null,
  detailsPath: null,
  idempotencyKey: 'verification:test',
  accountActionTokenId: '00000000-0000-4000-8000-000000000005',
  emailTemplateVersionId: null,
  emailCompositionVersion: 'email-verification-v1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function harness(options: {
  gate?: boolean;
  notificationsEnabled?: boolean;
  actor?: ReturnType<typeof actor>;
  config?: ReturnType<typeof configuration>;
  settings?: Record<string, unknown> | null;
  candidates?: Array<{ id: string }>;
  sendError?: unknown;
  definitiveFailure?: boolean;
  failCompletionAudit?: boolean;
} = {}) {
  const audits: Array<Record<string, unknown>> = [];
  const changedDeliveryIds: string[] = [];
  const deliveryUpdates: Array<Record<string, unknown>> = [];
  const delivery = {
    id: deliveryId,
    notificationId,
    channel: NotificationChannel.EMAIL,
    recipient: 'admin@example.test',
    status: NotificationStatus.PENDING,
    attemptCount: 1,
    lastAttemptAt: new Date(),
    nextRetryAt: null,
    sentAt: null,
    failedAt: null,
    errorCode: null,
    safeErrorMessage: null,
    providerMessageId: null,
    claimToken: '00000000-0000-4000-8000-000000000006',
    claimExpiresAt: new Date(Date.now() + 300_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    notification,
  };
  const tx = {
    $executeRawUnsafe: async () => 0,
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join('') ?? '';
      return sql.includes('FROM "NotificationDelivery"')
        ? (options.candidates ?? [{ id: deliveryId }])
        : [];
    },
    auditLog: {
      deleteMany: async () => ({ count: 0 }),
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failCompletionAudit && data.action === 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_COMPLETED') {
          throw new Error('synthetic audit persistence failure');
        }
        audits.push(data); return data;
      },
    },
    user: { findUnique: async () => options.actor ?? actor() },
    platformEmailSettings: { findUnique: async () => options.settings ?? null },
    smtpConfigurationVersion: { findUnique: async () => options.config ?? configuration() },
    notificationDelivery: {
      updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        changedDeliveryIds.push(where.id); deliveryUpdates.push(data); return { count: 1 };
      },
      findFirst: async () => ({ ...delivery, status: NotificationStatus.FAILED, errorCode: 'SMTP_ACCEPTANCE_UNCERTAIN' }),
    },
    notification: { update: async () => notification },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
  const configValues: Record<string, unknown> = {
    SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: options.gate ?? true,
    EMAIL_NOTIFICATIONS_ENABLED: options.notificationsEnabled ?? false,
  };
  let sent: { recipient: string; smtp: Record<string, unknown> } | undefined;
  const channel = {
    send: async (_notification: unknown, recipient: string, smtp: Record<string, unknown>) => {
      sent = { recipient, smtp };
      if (options.sendError) throw options.sendError;
      return { skipped: false, providerMessageId: 'safe-provider-id' };
    },
    sanitizeError: () => ({ code: 'SMTP_UNKNOWN', message: 'Email delivery failed.' }),
    isDefinitiveNonAcceptance: () => options.definitiveFailure === true,
  };
  const service = new SmtpEmailVerificationBootstrapService(
    prisma as never,
    { get: (key: string) => configValues[key] } as never,
    { decrypt: (payload: Uint8Array, id: string, keyId: string) => {
      assert.deepEqual(payload, Uint8Array.from([1, 2, 3]));
      assert.equal(id, configurationId);
      assert.equal(keyId, 'smtp-key-v1');
      return 'decrypted-secret';
    } } as never,
    channel as never,
  );
  return { service, audits, changedDeliveryIds, deliveryUpdates, sent: () => sent };
}

describe('SmtpEmailVerificationBootstrapService', () => {
  it('sends only the server-derived current actor verification delivery through the tested inactive configuration', async () => {
    const value = harness();
    const result = await value.service.send(configurationId, { revision: 4 }, authenticated);
    assert.equal(result.acceptedByProvider, true);
    assert.equal(result.configurationVersion, 7);
    assert.equal(value.sent()?.recipient, 'admin@example.test');
    assert.equal(value.sent()?.smtp.authority, 'DATABASE');
    assert.equal(value.sent()?.smtp.password, 'decrypted-secret');
    assert.ok(value.changedDeliveryIds.every((id) => id === deliveryId));
    assert.equal(JSON.stringify(value.audits).includes('decrypted-secret'), false);
    assert.equal(JSON.stringify(value.audits).includes('admin@example.test'), false);
  });

  it('fails closed while the bootstrap gate is disabled or general delivery is enabled', async () => {
    await assert.rejects(() => harness({ gate: false }).service.send(configurationId, { revision: 4 }, authenticated), ServiceUnavailableException);
    await assert.rejects(() => harness({ notificationsEnabled: true }).service.send(configurationId, { revision: 4 }, authenticated), ConflictException);
  });

  it('rejects tenant, inactive, deleted, non-admin, and already verified actors', async () => {
    for (const changed of [
      { companyId: configurationId },
      { status: UserStatus.INACTIVE },
      { deletedAt: new Date() },
      { roles: [] },
      { verifiedEmail: 'admin@example.test', emailVerifiedAt: new Date() },
    ]) {
      await assert.rejects(() => harness({ actor: actor(changed) }).service.send(configurationId, { revision: 4 }, authenticated), ForbiddenException);
    }
  });

  it('rejects established database authority and every ineligible configuration state', async () => {
    await assert.rejects(() => harness({ settings: { databaseAuthorityEstablishedAt: new Date(), activeConfigurationVersionId: null, enabled: false } })
      .service.send(configurationId, { revision: 4 }, authenticated), ConflictException);
    for (const changed of [
      { revision: 5 },
      { lifecycle: SmtpConfigurationLifecycle.DRAFT },
      { lifecycle: SmtpConfigurationLifecycle.VALIDATED },
      { lifecycle: SmtpConfigurationLifecycle.REVOKED, revokedAt: new Date() },
      { connectionTestSucceeded: false },
      { connectionTestResultCode: 'AUTH_FAILED' },
      { firstActivatedAt: new Date() },
    ]) {
      await assert.rejects(() => harness({ config: configuration(changed) }).service.send(configurationId, { revision: 4 }, authenticated), ConflictException);
    }
  });

  it('rejects missing or ambiguous exact delivery selection without sending', async () => {
    for (const candidates of [[], [{ id: deliveryId }, { id: '00000000-0000-4000-8000-000000000099' }]]) {
      const value = harness({ candidates });
      await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated), ConflictException);
      assert.equal(value.sent(), undefined);
      assert.equal(value.changedDeliveryIds.length, 0);
    }
  });

  it('uses bounded safe failure evidence and never mutates another delivery', async () => {
    const value = harness({ sendError: Object.assign(new Error('provider secret'), { code: 'EAUTH' }), definitiveFailure: true });
    await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated), ServiceUnavailableException);
    assert.ok(value.changedDeliveryIds.every((id) => id === deliveryId));
    assert.equal(JSON.stringify(value.audits).includes('provider secret'), false);
  });

  it('durably quarantines before transport and never converts uncertainty into confirmed delivery', async () => {
    const value = harness({ failCompletionAudit: true });
    await assert.rejects(
      () => value.service.send(configurationId, { revision: 4 }, authenticated),
      /automatic retry is unsafe/i,
    );
    assert.equal(value.sent()?.recipient, 'admin@example.test');
    assert.equal(value.deliveryUpdates[0]?.status, NotificationStatus.FAILED);
    assert.equal(value.deliveryUpdates[0]?.errorCode, 'SMTP_ACCEPTANCE_UNCERTAIN');
    assert.equal(value.deliveryUpdates[0]?.nextRetryAt, null);
  });

  it('keeps generic, timeout, and connection-reset transport failures durably quarantined', async () => {
    for (const sendError of [
      new Error('provider accepted but response was lost'),
      Object.assign(new Error('reset after DATA'), { code: 'ECONNRESET' }),
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    ]) {
      const value = harness({ sendError });
      await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated),
        /automatic retry is unsafe/i);
      assert.equal(value.deliveryUpdates.length, 1);
      assert.equal(value.deliveryUpdates[0]?.status, NotificationStatus.FAILED);
      assert.equal(value.deliveryUpdates[0]?.errorCode, 'SMTP_ACCEPTANCE_UNCERTAIN');
      assert.equal(value.deliveryUpdates[0]?.nextRetryAt, null);
    }
  });
});

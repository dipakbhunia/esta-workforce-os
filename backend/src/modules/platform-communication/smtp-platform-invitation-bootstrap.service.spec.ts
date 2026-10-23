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
import { StaleAccountInvitationDeliveryError } from '../notifications/email-notification-channel.service';
import { SmtpPlatformInvitationBootstrapService } from './smtp-platform-invitation-bootstrap.service';

const actorId = '00000000-0000-4000-8000-000000000001';
const targetUserId = '00000000-0000-4000-8000-000000000002';
const configurationId = '00000000-0000-4000-8000-000000000003';
const deliveryId = '00000000-0000-4000-8000-000000000004';
const notificationId = '00000000-0000-4000-8000-000000000005';
const tokenId = '00000000-0000-4000-8000-000000000006';
const authenticated = { id: actorId, companyId: null, email: 'actor@example.test', firstName: 'A', lastName: 'B',
  status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
const dto = { revision: 4, targetUserId, deliveryId };

const user = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  email: id === actorId ? 'actor@example.test' : 'invitee@example.test',
  companyId: null,
  status: id === actorId ? UserStatus.ACTIVE : UserStatus.INACTIVE,
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
  userId: targetUserId,
  alertId: null,
  type: NotificationType.ACCOUNT_INVITATION,
  channel: NotificationChannel.EMAIL,
  title: 'Invitation',
  message: 'Activate account.',
  severity: null,
  status: NotificationStatus.PENDING,
  readAt: null,
  detailsPath: null,
  idempotencyKey: 'invitation:test',
  accountActionTokenId: tokenId,
  emailTemplateVersionId: null,
  emailCompositionVersion: 'account-invitation-v1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function harness(options: {
  gate?: boolean;
  notificationsEnabled?: boolean;
  actor?: ReturnType<typeof user> | null;
  target?: ReturnType<typeof user> | null;
  config?: ReturnType<typeof configuration>;
  configurations?: Array<ReturnType<typeof configuration>>;
  configurationSelections?: Array<Array<ReturnType<typeof configuration>>>;
  settings?: Record<string, unknown> | null;
  candidates?: Array<{ id: string }>;
  candidateSelections?: Array<Array<{ id: string }>>;
  sendError?: unknown;
  definitiveFailure?: boolean;
  rateCount?: number;
  failCompletionAudit?: boolean;
  unresolvedInvitationFence?: boolean;
} = {}) {
  const audits: Array<Record<string, unknown>> = [];
  const changedDeliveryIds: string[] = [];
  const deliveryUpdates: Array<Record<string, unknown>> = [];
  const delivery = {
    id: deliveryId,
    notificationId,
    channel: NotificationChannel.EMAIL,
    recipient: 'invitee@example.test',
    status: NotificationStatus.PENDING,
    attemptCount: 1,
    lastAttemptAt: new Date(),
    nextRetryAt: null,
    sentAt: null,
    failedAt: null,
    errorCode: null,
    safeErrorMessage: null,
    providerMessageId: null,
    claimToken: '00000000-0000-4000-8000-000000000007',
    claimExpiresAt: new Date(Date.now() + 300_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    notification,
  };
  let configurationSelection = 0;
  let candidateSelection = 0;
  const eligibleConfigurations = () => {
    if (options.configurationSelections) {
      const selected = options.configurationSelections[Math.min(configurationSelection, options.configurationSelections.length - 1)] ?? [];
      configurationSelection += 1;
      return selected;
    }
    return (options.configurations ?? [options.config ?? configuration()]).filter((candidate) =>
      candidate.lifecycle === SmtpConfigurationLifecycle.TESTED && !candidate.revokedAt && !candidate.firstActivatedAt &&
      candidate.structurallyValidatedAt && candidate.connectionTestedAt && candidate.connectionTestSucceeded === true &&
      candidate.connectionTestResultCode === 'SUCCESS');
  };
  const tx = {
    $executeRawUnsafe: async () => 0,
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('FROM "AuditLog" AS started')) {
        return options.unresolvedInvitationFence ? [{ id: 'unresolved-dispatch' }] : [];
      }
      if (sql.includes('FROM "NotificationDelivery"')) {
        if (options.candidateSelections) {
          const selected = options.candidateSelections[Math.min(candidateSelection, options.candidateSelections.length - 1)] ?? [];
          candidateSelection += 1;
          return selected;
        }
        return options.candidates ?? [{ id: deliveryId }];
      }
      return [];
    },
    auditLog: {
      count: async () => options.rateCount ?? 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failCompletionAudit && data.action === 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_COMPLETED') {
          throw new Error('synthetic audit persistence failure');
        }
        audits.push(data);
        return data;
      },
    },
    user: { findUnique: async ({ where }: { where: { id: string } }) => where.id === actorId
      ? (options.actor === undefined ? user(actorId) : options.actor)
      : (options.target === undefined ? user(targetUserId) : options.target) },
    platformEmailSettings: { findUnique: async () => options.settings ?? null },
    smtpConfigurationVersion: { findMany: async () => eligibleConfigurations(),
      findUnique: async () => ({ encryptedPassword: configuration().encryptedPassword, encryptionKeyId: configuration().encryptionKeyId }) },
    notificationDelivery: {
      updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        changedDeliveryIds.push(where.id);
        deliveryUpdates.push(data);
        return { count: 1 };
      },
      findFirst: async () => ({ ...delivery, status: NotificationStatus.FAILED, errorCode: 'SMTP_ACCEPTANCE_UNCERTAIN' }),
    },
    notification: { update: async () => notification },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
  const configValues: Record<string, unknown> = {
    SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED: options.gate ?? true,
    EMAIL_NOTIFICATIONS_ENABLED: options.notificationsEnabled ?? false,
  };
  let sent: { notification: typeof notification; recipient: string; smtp: Record<string, unknown> } | undefined;
  const channel = {
    send: async (outbound: typeof notification, recipient: string, smtp: Record<string, unknown>) => {
      sent = { notification: outbound, recipient, smtp };
      if (options.sendError) throw options.sendError;
      return { skipped: false, providerMessageId: 'safe-provider-id' };
    },
    sanitizeError: () => ({ code: 'SMTP_UNKNOWN', message: 'Email delivery failed.' }),
    isDefinitiveNonAcceptance: () => options.definitiveFailure === true,
  };
  const service = new SmtpPlatformInvitationBootstrapService(
    prisma as never,
    { get: (key: string) => configValues[key] } as never,
    { decrypt: () => 'decrypted-secret' } as never,
    channel as never,
  );
  return { service, audits, changedDeliveryIds, deliveryUpdates, sent: () => sent };
}

describe('SmtpPlatformInvitationBootstrapService', () => {
  it('dispatches only the explicitly selected platform invitation through tested inactive SMTP', async () => {
    const value = harness();
    const result = await value.service.send(configurationId, dto, authenticated);
    assert.equal(result.acceptedByProvider, true);
    assert.equal(value.sent()?.notification.type, NotificationType.ACCOUNT_INVITATION);
    assert.equal(value.sent()?.recipient, 'invitee@example.test');
    assert.equal(value.sent()?.smtp.authority, 'DATABASE');
    assert.ok(value.changedDeliveryIds.every((id) => id === deliveryId));
    assert.equal(JSON.stringify(value.audits).includes('decrypted-secret'), false);
    assert.equal(JSON.stringify(value.audits).includes('invitee@example.test'), false);
  });

  it('fails closed while its dedicated gate is disabled or ordinary delivery is enabled', async () => {
    await assert.rejects(() => harness({ gate: false }).service.send(configurationId, dto, authenticated), ServiceUnavailableException);
    await assert.rejects(() => harness({ notificationsEnabled: true }).service.send(configurationId, dto, authenticated), ConflictException);
  });

  it('rejects invalid actor and target platform authority', async () => {
    for (const changed of [{ companyId: configurationId }, { status: UserStatus.INACTIVE }, { deletedAt: new Date() }, { roles: [] }]) {
      await assert.rejects(() => harness({ actor: user(actorId, changed) }).service.send(configurationId, dto, authenticated), ForbiddenException);
    }
    for (const changed of [{ companyId: configurationId }, { status: UserStatus.ACTIVE }, { deletedAt: new Date() }, { roles: [] }]) {
      await assert.rejects(() => harness({ target: user(targetUserId, changed) }).service.send(configurationId, dto, authenticated), ConflictException);
    }
  });

  it('rejects active database authority and every ineligible SMTP configuration state', async () => {
    await assert.rejects(() => harness({ settings: { databaseAuthorityEstablishedAt: new Date() } })
      .service.send(configurationId, dto, authenticated), ConflictException);
    for (const changed of [
      { revision: 5 },
      { lifecycle: SmtpConfigurationLifecycle.DRAFT },
      { revokedAt: new Date() },
      { firstActivatedAt: new Date() },
      { connectionTestSucceeded: false },
      { connectionTestResultCode: 'AUTH_FAILED' },
    ]) {
      await assert.rejects(() => harness({ config: configuration(changed) }).service.send(configurationId, dto, authenticated), ConflictException);
    }
  });

  it('requires one unique server-selected SMTP configuration before reserving delivery', async () => {
    const second = configuration({ id: '00000000-0000-4000-8000-000000000099', version: 8 });
    for (const value of [
      harness({ configurations: [] }),
      harness({ configurations: [configuration(), second] }),
      harness({ configurations: [configuration({ id: second.id })] }),
      harness({ configurations: [configuration({ revision: dto.revision + 1 })] }),
    ]) {
      await assert.rejects(() => value.service.send(configurationId, dto, authenticated), ConflictException);
      assert.equal(value.sent(), undefined);
      assert.equal(value.changedDeliveryIds.length, 0);
    }
  });

  it('revalidates uniqueness immediately before transport', async () => {
    const second = configuration({ id: '00000000-0000-4000-8000-000000000099', version: 8 });
    const value = harness({ configurationSelections: [[configuration()], [configuration(), second]] });
    await assert.rejects(() => value.service.send(configurationId, dto, authenticated), /authority changed before delivery/i);
    assert.equal(value.sent(), undefined);
    assert.equal(value.changedDeliveryIds.every((id) => id === deliveryId), true);
    assert.equal(value.deliveryUpdates[0]?.errorCode, 'SMTP_ACCEPTANCE_UNCERTAIN');
    assert.equal(value.deliveryUpdates.at(-1)?.errorCode, 'SMTP_BOOTSTRAP_AUTHORITY_CHANGED');
  });

  it('rejects missing or ambiguous exact delivery selection and durable rate exhaustion', async () => {
    for (const candidates of [[], [{ id: deliveryId }, { id: '00000000-0000-4000-8000-000000000099' }]]) {
      const value = harness({ candidates });
      await assert.rejects(() => value.service.send(configurationId, dto, authenticated), ConflictException);
      assert.equal(value.sent(), undefined);
      assert.equal(value.changedDeliveryIds.length, 0);
    }
    await assert.rejects(() => harness({ rateCount: 3 }).service.send(configurationId, dto, authenticated), ServiceUnavailableException);
  });

  it('rejects an unresolved target dispatch fence before reservation or transport', async () => {
    const value = harness({ unresolvedInvitationFence: true });
    await assert.rejects(
      () => value.service.send(configurationId, dto, authenticated),
      /unresolved|unavailable/i,
    );
    assert.equal(value.sent(), undefined);
    assert.deepEqual(value.changedDeliveryIds, []);
  });

  it('rejects a wrong requested delivery and two target-eligible invitations before reservation or transport', async () => {
    const wrong = harness({ candidates: [{ id: '00000000-0000-4000-8000-000000000099' }] });
    await assert.rejects(() => wrong.service.send(configurationId, dto, authenticated), ConflictException);
    assert.deepEqual(wrong.changedDeliveryIds, []);
    assert.equal(wrong.sent(), undefined);

    const ambiguous = harness({ candidates: [
      { id: deliveryId },
      { id: '00000000-0000-4000-8000-000000000098' },
    ] });
    await assert.rejects(() => ambiguous.service.send(configurationId, dto, authenticated), /ambiguous/i);
    assert.deepEqual(ambiguous.changedDeliveryIds, []);
    assert.equal(ambiguous.sent(), undefined);
  });

  it('rejects a second target-eligible invitation appearing before transport', async () => {
    const value = harness({ candidateSelections: [
      [{ id: deliveryId }],
      [{ id: deliveryId }, { id: '00000000-0000-4000-8000-000000000098' }],
    ] });
    await assert.rejects(() => value.service.send(configurationId, dto, authenticated), /authority changed before delivery/i);
    assert.equal(value.sent(), undefined);
    assert.equal(value.deliveryUpdates.length, 2);
  });

  it('cancels a typed stale invitation without transport retry', async () => {
    const value = harness({ sendError: new StaleAccountInvitationDeliveryError() });
    await assert.rejects(() => value.service.send(configurationId, dto, authenticated), /authority changed/i);
    assert.equal(value.deliveryUpdates.at(-1)?.status, NotificationStatus.CANCELLED);
    assert.equal(value.deliveryUpdates.at(-1)?.errorCode, 'PLATFORM_INVITATION_STALE');
  });

  it('uses bounded failure evidence for definite provider non-acceptance', async () => {
    const value = harness({ sendError: new Error('provider secret'), definitiveFailure: true });
    await assert.rejects(() => value.service.send(configurationId, dto, authenticated), ServiceUnavailableException);
    assert.equal(JSON.stringify(value.audits).includes('provider secret'), false);
    assert.ok(value.changedDeliveryIds.every((id) => id === deliveryId));
  });

  it('quarantines uncertain acceptance before transport and never retries automatically', async () => {
    const value = harness({ sendError: new Error('response lost after acceptance') });
    await assert.rejects(() => value.service.send(configurationId, dto, authenticated), /automatic retry is unsafe/i);
    assert.equal(value.deliveryUpdates.length, 1);
    assert.equal(value.deliveryUpdates[0]?.status, NotificationStatus.FAILED);
    assert.equal(value.deliveryUpdates[0]?.errorCode, 'SMTP_ACCEPTANCE_UNCERTAIN');
    assert.equal(value.deliveryUpdates[0]?.nextRetryAt, null);

    const auditFailure = harness({ failCompletionAudit: true });
    await assert.rejects(() => auditFailure.service.send(configurationId, dto, authenticated), /automatic retry is unsafe/i);
    assert.equal(auditFailure.deliveryUpdates[0]?.errorCode, 'SMTP_ACCEPTANCE_UNCERTAIN');
  });
});

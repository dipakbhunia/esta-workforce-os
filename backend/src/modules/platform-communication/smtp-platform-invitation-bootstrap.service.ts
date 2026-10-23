import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Notification,
  NotificationDelivery,
  NotificationStatus,
  Prisma,
  RoleName,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  acquireInvitationAuthorityLock,
  requireNoUnresolvedPlatformInvitationDispatch,
} from '../../common/utils/platform-invitation-authority.util';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  EmailNotificationChannel,
  StaleAccountInvitationDeliveryError,
} from '../notifications/email-notification-channel.service';
import { ResolvedSmtpSnapshot } from '../smtp-runtime/smtp-runtime.types';
import { BootstrapPlatformInvitationDto } from './dto/smtp-configuration.dto';
import { SmtpCredentialEncryptionService } from './smtp-credential-encryption.service';
import {
  requireNoInFlightSmtpBootstrap,
  SMTP_INVITATION_BOOTSTRAP_COMPLETED,
  SMTP_INVITATION_BOOTSTRAP_STARTED,
} from './smtp-bootstrap-dispatch-fence';
import { acquireExclusiveSmtpAuthorityLock } from './smtp-authority-lock';
import { selectEligibleSmtpPlatformInvitationConfiguration } from './smtp-platform-invitation-configuration';

const MAX_ATTEMPTS = 5;
const LEASE_MILLISECONDS = 5 * 60_000;
const RATE_WINDOW_MILLISECONDS = 15 * 60_000;
const RATE_LIMIT = 3;
const ACCEPTANCE_UNCERTAIN = 'SMTP_ACCEPTANCE_UNCERTAIN';

type PlatformUserAuthority = {
  id: string;
  email: string;
  companyId: string | null;
  status: UserStatus;
  deletedAt: Date | null;
  roles: Array<{ role: { companyId: string | null; systemName: RoleName | null; deletedAt: Date | null } }>;
};

type ClaimedDelivery = NotificationDelivery & {
  notification: Notification;
  actorUserId: string;
  targetUserId: string;
  smtpSnapshot: Readonly<ResolvedSmtpSnapshot>;
};

type ReservedDelivery = ClaimedDelivery & {
  encryptedPassword: Uint8Array;
  encryptionKeyId: string;
  configurationVersion: number;
};

@Injectable()
export class SmtpPlatformInvitationBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: SmtpCredentialEncryptionService,
    private readonly emailChannel: EmailNotificationChannel,
  ) {}

  async send(configurationId: string, dto: BootstrapPlatformInvitationDto, authenticated: AuthenticatedUser) {
    this.requireOperationalGate();
    const claimed = await this.reserve(configurationId, dto, authenticated.id);
    let password = '';
    try {
      password = this.encryption.decrypt(claimed.encryptedPassword, configurationId, claimed.encryptionKeyId);
    } catch {
      await this.finalizeFailure(claimed, 'SMTP_CREDENTIAL_UNAVAILABLE', 'Email provider credential is unavailable.');
      throw new ServiceUnavailableException('Invitation email could not be sent');
    }

    const smtpSnapshot: Readonly<ResolvedSmtpSnapshot> = Object.freeze({ ...claimed.smtpSnapshot, password });
    try {
      try {
        await this.revalidateBeforeSend(configurationId, dto, authenticated.id, claimed);
      } catch {
        await this.finalizeFailure(claimed, 'SMTP_BOOTSTRAP_AUTHORITY_CHANGED',
          'Platform invitation bootstrap authority changed before delivery.');
        throw new ConflictException('Platform invitation bootstrap authority changed before delivery');
      }
      let result;
      try {
        result = await this.emailChannel.send(claimed.notification, claimed.recipient, smtpSnapshot);
      } catch (error) {
        if (error instanceof StaleAccountInvitationDeliveryError) {
          await this.finalizeCancellation(claimed);
          throw new ConflictException('Platform invitation authority changed before delivery');
        }
        if (!this.emailChannel.isDefinitiveNonAcceptance(error)) {
          throw new ServiceUnavailableException('Provider acceptance is unresolved; automatic retry is unsafe');
        }
        const safe = this.emailChannel.sanitizeError(error);
        await this.finalizeFailure(claimed, safe.code, safe.message);
        throw new ServiceUnavailableException('Invitation email could not be sent');
      }
      if (result.skipped) {
        await this.finalizeFailure(claimed, 'SMTP_DISABLED', 'Email delivery is disabled or not configured.');
        throw new ServiceUnavailableException('Invitation email could not be sent');
      }
      let finalized = false;
      try {
        finalized = await this.finalizeSuccess(claimed, result.providerMessageId ?? null);
      } catch {
        throw new ServiceUnavailableException('Provider acceptance could not be persisted; automatic retry is unsafe');
      }
      if (!finalized) throw new ConflictException('Invitation delivery authority changed during provider delivery');
      return {
        acceptedByProvider: true,
        inboxDeliveryConfirmed: false,
        deliveryStatus: NotificationStatus.DELIVERED,
        configurationVersion: claimed.configurationVersion,
        configurationRevision: dto.revision,
      };
    } finally {
      password = '';
    }
  }

  private requireOperationalGate() {
    if (this.config.get<boolean>('SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED') !== true) {
      throw new ServiceUnavailableException('Platform invitation bootstrap is disabled');
    }
    if (this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED') === true) {
      throw new ConflictException('Platform invitation bootstrap requires the general notification worker to remain disabled');
    }
  }

  private async reserve(
    configurationId: string,
    dto: BootstrapPlatformInvitationDto,
    actorId: string,
  ): Promise<ReservedDelivery> {
    return this.prisma.$transaction(async (tx) => {
      await requireNoInFlightSmtpBootstrap(tx, configurationId);
      await acquireInvitationAuthorityLock(tx, dto.targetUserId);
      await requireNoUnresolvedPlatformInvitationDispatch(tx, dto.targetUserId);
      const now = new Date();
      this.requireActor(await this.findUser(tx, actorId));
      const target = this.requireTarget(await this.findUser(tx, dto.targetUserId));
      const settings = await tx.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' } });
      if (settings?.databaseAuthorityEstablishedAt || settings?.activeConfigurationVersionId || settings?.enabled) {
        throw new ConflictException('Platform invitation bootstrap is unavailable after database SMTP authority is established');
      }
      const configuration = await this.requireSelectedConfiguration(tx, configurationId, dto.revision);
      const credential = await tx.smtpConfigurationVersion.findUnique({
        where: { id: configuration.id },
        select: { encryptedPassword: true, encryptionKeyId: true },
      });
      if (!credential) throw new ConflictException('SMTP configuration is not eligible for platform invitation bootstrap');
      const attempts = await tx.auditLog.count({ where: {
        actorUserId: actorId,
        action: SMTP_INVITATION_BOOTSTRAP_STARTED,
        createdAt: { gte: new Date(now.getTime() - RATE_WINDOW_MILLISECONDS) },
      } });
      if (attempts >= RATE_LIMIT) throw new ServiceUnavailableException('Platform invitation bootstrap is temporarily unavailable');

      const recipient = target.email.trim().toLowerCase();
      const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT delivery."id"
        FROM "NotificationDelivery" AS delivery
        JOIN "Notification" AS notification ON notification."id" = delivery."notificationId"
        JOIN "AccountActionToken" AS token ON token."id" = notification."accountActionTokenId"
        WHERE delivery."channel" = 'EMAIL'::"NotificationChannel"
          AND delivery."status" = 'PENDING'::"NotificationStatus"
          AND delivery."attemptCount" < ${MAX_ATTEMPTS}
          AND (delivery."nextRetryAt" IS NULL OR delivery."nextRetryAt" <= ${now})
          AND (delivery."claimToken" IS NULL OR delivery."claimExpiresAt" <= ${now})
          AND delivery."recipient" = ${recipient}
          AND notification."type" = 'ACCOUNT_INVITATION'::"NotificationType"
          AND notification."userId" = ${target.id}::uuid
          AND notification."companyId" IS NULL
          AND token."purpose" = 'INVITATION'::"AccountActionTokenPurpose"
          AND token."userId" = ${target.id}::uuid
          AND token."companyId" IS NULL
          AND token."consumedAt" IS NULL
          AND token."invalidatedAt" IS NULL
          AND token."expiresAt" > ${now}
        FOR UPDATE OF delivery NOWAIT
        LIMIT 2
      `);
      if (candidates.length !== 1) {
        throw new ConflictException(candidates.length
          ? 'Platform invitation delivery selection is ambiguous'
          : 'No eligible platform invitation delivery exists');
      }
      if (candidates[0].id !== dto.deliveryId) {
        throw new ConflictException('Selected platform invitation delivery is not the current eligible delivery');
      }

      const claimToken = randomUUID();
      const claimExpiresAt = new Date(now.getTime() + LEASE_MILLISECONDS);
      const updated = await tx.notificationDelivery.updateMany({
        where: { id: dto.deliveryId, status: NotificationStatus.PENDING, attemptCount: { lt: MAX_ATTEMPTS } },
        data: {
          status: NotificationStatus.FAILED,
          claimToken,
          claimExpiresAt,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          failedAt: now,
          nextRetryAt: null,
          errorCode: ACCEPTANCE_UNCERTAIN,
          safeErrorMessage: 'Provider acceptance is unresolved; automatic retry is prohibited.',
        },
      });
      if (updated.count !== 1) throw new ConflictException('Platform invitation delivery was claimed concurrently');
      const delivery = await tx.notificationDelivery.findFirst({
        where: { id: dto.deliveryId, claimToken },
        include: { notification: true },
      });
      if (!delivery) throw new ConflictException('Platform invitation delivery claim could not be established');
      await this.audit(tx, actorId, configurationId, SMTP_INVITATION_BOOTSTRAP_STARTED, {
        dispatchId: claimToken,
        configurationVersion: configuration.version,
        configurationRevision: configuration.revision,
        deliveryId: delivery.id,
        notificationId: delivery.notificationId,
        targetUserId: target.id,
      });
      return {
        ...delivery,
        actorUserId: actorId,
        targetUserId: target.id,
        smtpSnapshot: Object.freeze({
          authority: 'DATABASE' as const,
          configurationVersionId: configuration.id,
          host: configuration.host,
          port: configuration.port,
          securityMode: configuration.securityMode,
          username: configuration.username,
          password: '',
          senderEmail: configuration.senderEmail,
          senderDisplayName: configuration.senderDisplayName,
        }),
        encryptedPassword: credential.encryptedPassword,
        encryptionKeyId: credential.encryptionKeyId,
        configurationVersion: configuration.version,
      };
    });
  }

  private async revalidateBeforeSend(
    configurationId: string,
    dto: BootstrapPlatformInvitationDto,
    actorId: string,
    claimed: ClaimedDelivery,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await acquireExclusiveSmtpAuthorityLock(tx);
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "User" WHERE "id" IN (${actorId}::uuid, ${dto.targetUserId}::uuid) ORDER BY "id" FOR UPDATE
      `);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SmtpConfigurationVersion" WHERE "id" = ${configurationId}::uuid FOR UPDATE`);
      this.requireActor(await this.findUser(tx, actorId));
      const target = this.requireTarget(await this.findUser(tx, dto.targetUserId));
      await this.requireSelectedConfiguration(tx, configurationId, dto.revision);
      const settings = await tx.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' } });
      if (settings?.databaseAuthorityEstablishedAt || settings?.activeConfigurationVersionId || settings?.enabled) {
        throw new ConflictException('Database SMTP authority changed before invitation delivery');
      }
      const recipient = target.email.trim().toLowerCase();
      const current = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT delivery."id"
        FROM "NotificationDelivery" AS delivery
        JOIN "Notification" AS notification ON notification."id" = delivery."notificationId"
        JOIN "AccountActionToken" AS token ON token."id" = notification."accountActionTokenId"
        WHERE delivery."recipient" = ${recipient}
          AND notification."type" = 'ACCOUNT_INVITATION'::"NotificationType"
          AND notification."userId" = ${target.id}::uuid
          AND notification."companyId" IS NULL
          AND token."purpose" = 'INVITATION'::"AccountActionTokenPurpose"
          AND token."userId" = ${target.id}::uuid
          AND token."companyId" IS NULL
          AND token."consumedAt" IS NULL
          AND token."invalidatedAt" IS NULL
          AND token."expiresAt" > NOW()
          AND (
            (delivery."id" = ${claimed.id}::uuid
              AND delivery."status" = 'FAILED'::"NotificationStatus"
              AND delivery."errorCode" = ${ACCEPTANCE_UNCERTAIN}
              AND delivery."claimToken" = ${claimed.claimToken}::uuid
              AND delivery."claimExpiresAt" > NOW())
            OR
            (delivery."status" = 'PENDING'::"NotificationStatus"
              AND delivery."attemptCount" < ${MAX_ATTEMPTS}
              AND (delivery."nextRetryAt" IS NULL OR delivery."nextRetryAt" <= NOW())
              AND (delivery."claimToken" IS NULL OR delivery."claimExpiresAt" <= NOW()))
          )
        FOR UPDATE OF delivery
        LIMIT 2
      `);
      if (current.length !== 1 || current[0].id !== claimed.id) {
        throw new ConflictException('Platform invitation delivery claim expired or authority changed');
      }
    });
  }

  private findUser(tx: Prisma.TransactionClient, id: string): Promise<PlatformUserAuthority | null> {
    return tx.user.findUnique({ where: { id }, select: {
      id: true,
      email: true,
      companyId: true,
      status: true,
      deletedAt: true,
      roles: { select: { role: { select: { companyId: true, systemName: true, deletedAt: true } } } },
    } });
  }

  private hasLivePlatformSuperAdminRole(user: PlatformUserAuthority) {
    return user.roles.some(({ role }) =>
      role.systemName === RoleName.SUPER_ADMIN && role.companyId === null && !role.deletedAt);
  }

  private requireActor(actor: PlatformUserAuthority | null): PlatformUserAuthority {
    if (!actor || actor.status !== UserStatus.ACTIVE || actor.deletedAt || actor.companyId !== null ||
      !this.hasLivePlatformSuperAdminRole(actor)) {
      throw new ForbiddenException('Current platform administrator authority is required');
    }
    return actor;
  }

  private requireTarget(target: PlatformUserAuthority | null): PlatformUserAuthority {
    if (!target || target.status !== UserStatus.INACTIVE || target.deletedAt || target.companyId !== null ||
      !this.hasLivePlatformSuperAdminRole(target)) {
      throw new ConflictException('Selected platform invitation target is not eligible');
    }
    return target;
  }

  private async requireSelectedConfiguration(tx: Prisma.TransactionClient, configurationId: string, revision: number) {
    const selection = await selectEligibleSmtpPlatformInvitationConfiguration(tx);
    if (selection.kind !== 'UNIQUE' || selection.configuration.id !== configurationId ||
      selection.configuration.revision !== revision) {
      throw new ConflictException('SMTP configuration is not eligible for platform invitation bootstrap');
    }
    return selection.configuration;
  }

  private finalizeSuccess(claimed: ClaimedDelivery, providerMessageId: string | null) {
    return this.finalize(claimed, {
      status: NotificationStatus.DELIVERED,
      sentAt: new Date(),
      failedAt: null,
      nextRetryAt: null,
      errorCode: null,
      safeErrorMessage: null,
      providerMessageId,
      claimToken: null,
      claimExpiresAt: null,
    }, NotificationStatus.DELIVERED, 'ACCEPTED');
  }

  private finalizeFailure(claimed: ClaimedDelivery, code: string, message: string) {
    const exhausted = claimed.attemptCount >= MAX_ATTEMPTS;
    return this.finalize(claimed, {
      status: exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING,
      failedAt: new Date(),
      nextRetryAt: exhausted ? null : new Date(Date.now() + Math.pow(2, claimed.attemptCount - 1) * 60_000),
      errorCode: code.slice(0, 64),
      safeErrorMessage: message.slice(0, 160),
      claimToken: null,
      claimExpiresAt: null,
    }, exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING, code);
  }

  private finalizeCancellation(claimed: ClaimedDelivery) {
    return this.finalize(claimed, {
      status: NotificationStatus.CANCELLED,
      failedAt: new Date(),
      nextRetryAt: null,
      errorCode: 'PLATFORM_INVITATION_STALE',
      safeErrorMessage: 'Platform invitation authority is no longer eligible for delivery.',
      claimToken: null,
      claimExpiresAt: null,
    }, NotificationStatus.CANCELLED, 'STALE_AUTHORITY');
  }

  private async finalize(
    claimed: ClaimedDelivery,
    data: Prisma.NotificationDeliveryUpdateManyMutationInput,
    notificationStatus: NotificationStatus,
    category: string,
  ): Promise<boolean> {
    if (!claimed.claimToken) return false;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationDelivery.updateMany({
        where: { id: claimed.id, status: NotificationStatus.FAILED, errorCode: ACCEPTANCE_UNCERTAIN, claimToken: claimed.claimToken },
        data,
      });
      if (updated.count !== 1) return false;
      await tx.notification.update({ where: { id: claimed.notificationId }, data: { status: notificationStatus } });
      await this.audit(tx, claimed.actorUserId, claimed.smtpSnapshot.configurationVersionId!, SMTP_INVITATION_BOOTSTRAP_COMPLETED, {
        dispatchId: claimed.claimToken,
        deliveryId: claimed.id,
        notificationId: claimed.notificationId,
        targetUserId: claimed.targetUserId,
        status: notificationStatus,
        category,
        acceptedByProvider: notificationStatus === NotificationStatus.DELIVERED,
      });
      return true;
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    entityId: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({ data: {
      actorUserId,
      action,
      entityType: 'SmtpConfigurationVersion',
      entityId,
      metadata,
    } });
  }
}

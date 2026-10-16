import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Notification,
  NotificationDelivery,
  NotificationStatus,
  Prisma,
  RoleName,
  SmtpConfigurationLifecycle,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  EmailNotificationChannel,
  StaleEmailVerificationDeliveryError,
} from '../notifications/email-notification-channel.service';
import { ResolvedSmtpSnapshot } from '../smtp-runtime/smtp-runtime.types';
import { BootstrapEmailVerificationDto } from './dto/smtp-configuration.dto';
import { SmtpCredentialEncryptionService } from './smtp-credential-encryption.service';
import {
  requireNoInFlightSmtpBootstrap,
  SMTP_BOOTSTRAP_COMPLETED,
  SMTP_BOOTSTRAP_STARTED,
} from './smtp-bootstrap-dispatch-fence';

const MAX_ATTEMPTS = 5;
const LEASE_MILLISECONDS = 5 * 60_000;
const RATE_WINDOW_MILLISECONDS = 15 * 60_000;
const RATE_LIMIT = 3;
const ACCEPTANCE_UNCERTAIN = 'SMTP_ACCEPTANCE_UNCERTAIN';

type ActorAuthority = {
  id: string;
  email: string;
  emailRevision: number;
  verifiedEmail: string | null;
  emailVerifiedAt: Date | null;
  companyId: string | null;
  status: UserStatus;
  deletedAt: Date | null;
  roles: Array<{ role: { companyId: string | null; systemName: RoleName | null; deletedAt: Date | null } }>;
};

type ClaimedDelivery = NotificationDelivery & {
  notification: Notification;
  smtpSnapshot: Readonly<ResolvedSmtpSnapshot>;
};

type ReservedDelivery = ClaimedDelivery & {
  encryptedPassword: Uint8Array;
  encryptionKeyId: string;
  configurationVersion: number;
};

@Injectable()
export class SmtpEmailVerificationBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: SmtpCredentialEncryptionService,
    private readonly emailChannel: EmailNotificationChannel,
  ) {}

  async send(configurationId: string, dto: BootstrapEmailVerificationDto, authenticated: AuthenticatedUser) {
    this.requireOperationalGate();
    const claimed = await this.reserve(configurationId, dto.revision, authenticated.id);
    let password = '';
    try {
      password = this.encryption.decrypt(
        claimed.encryptedPassword,
        configurationId,
        claimed.encryptionKeyId,
      );
    } catch {
      await this.finalizeFailure(claimed, 'SMTP_CREDENTIAL_UNAVAILABLE', 'Email provider credential is unavailable.');
      throw new ServiceUnavailableException('Verification email could not be sent');
    }

    const smtpSnapshot: Readonly<ResolvedSmtpSnapshot> = Object.freeze({
      ...claimed.smtpSnapshot,
      password,
    });
    try {
      try {
        await this.revalidateBeforeSend(configurationId, dto.revision, authenticated.id, claimed);
      } catch {
        await this.finalizeFailure(claimed, 'SMTP_BOOTSTRAP_AUTHORITY_CHANGED',
          'Email verification bootstrap authority changed before delivery.');
        throw new ConflictException('Email verification bootstrap authority changed before delivery');
      }
      let result;
      try {
        result = await this.emailChannel.send(claimed.notification, claimed.recipient, smtpSnapshot);
      } catch (error) {
        if (error instanceof StaleEmailVerificationDeliveryError) {
          await this.finalizeCancellation(claimed);
          throw new ConflictException('Email verification authority changed before delivery');
        }
        if (!this.emailChannel.isDefinitiveNonAcceptance(error)) {
          throw new ServiceUnavailableException('Provider acceptance is unresolved; automatic retry is unsafe');
        }
        const safe = this.emailChannel.sanitizeError(error);
        await this.finalizeFailure(claimed, safe.code, safe.message);
        throw new ServiceUnavailableException('Verification email could not be sent');
      }
      if (result.skipped) {
        await this.finalizeFailure(claimed, 'SMTP_DISABLED', 'Email delivery is disabled or not configured.');
        throw new ServiceUnavailableException('Verification email could not be sent');
      }
      let finalized = false;
      try {
        finalized = await this.finalizeSuccess(claimed, result.providerMessageId ?? null);
      } catch {
        throw new ServiceUnavailableException('Provider acceptance could not be persisted; automatic retry is unsafe');
      }
      if (!finalized) throw new ConflictException('Verification delivery authority changed during provider delivery');
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
    if (this.config.get<boolean>('SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED') !== true) {
      throw new ServiceUnavailableException('Email verification bootstrap is disabled');
    }
    if (this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED') === true) {
      throw new ConflictException('Email verification bootstrap requires the general notification worker to remain disabled');
    }
  }

  private async reserve(configurationId: string, revision: number, actorId: string): Promise<ReservedDelivery> {
    return this.prisma.$transaction(async (tx) => {
      await requireNoInFlightSmtpBootstrap(tx, configurationId);
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${'smtp-email-verification-bootstrap:' + actorId}, 0)) IS NULL AS "acquired"
      `);
      const now = new Date();
      const actor = this.requireActor(await this.findActor(tx, actorId));
      const settings = await tx.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' } });
      if (settings?.databaseAuthorityEstablishedAt || settings?.activeConfigurationVersionId || settings?.enabled) {
        throw new ConflictException('Email verification bootstrap is unavailable after database SMTP authority is established');
      }
      const configuration = await tx.smtpConfigurationVersion.findUnique({ where: { id: configurationId } });
      this.requireConfiguration(configuration, revision);
      const attempts = await tx.auditLog.count({ where: {
        actorUserId: actorId,
        action: SMTP_BOOTSTRAP_STARTED,
        createdAt: { gte: new Date(now.getTime() - RATE_WINDOW_MILLISECONDS) },
      } });
      if (attempts >= RATE_LIMIT) throw new ServiceUnavailableException('Email verification bootstrap is temporarily unavailable');

      const recipient = actor.email.trim().toLowerCase();
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
          AND notification."type" = 'EMAIL_VERIFICATION'::"NotificationType"
          AND notification."userId" = ${actor.id}::uuid
          AND notification."companyId" IS NULL
          AND token."purpose" = 'EMAIL_VERIFICATION'::"AccountActionTokenPurpose"
          AND token."userId" = ${actor.id}::uuid
          AND token."companyId" IS NULL
          AND token."targetEmail" = ${recipient}
          AND token."emailRevision" = ${actor.emailRevision}
          AND token."consumedAt" IS NULL
          AND token."invalidatedAt" IS NULL
          AND token."expiresAt" > ${now}
        ORDER BY delivery."createdAt" DESC, delivery."id" DESC
        FOR UPDATE OF delivery NOWAIT
        LIMIT 2
      `);
      if (candidates.length !== 1) {
        throw new ConflictException(candidates.length ? 'Email verification delivery selection is ambiguous' : 'No eligible email verification delivery exists');
      }

      const claimToken = randomUUID();
      const claimExpiresAt = new Date(now.getTime() + LEASE_MILLISECONDS);
      const updated = await tx.notificationDelivery.updateMany({
        where: { id: candidates[0].id, status: NotificationStatus.PENDING, attemptCount: { lt: MAX_ATTEMPTS } },
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
      if (updated.count !== 1) throw new ConflictException('Email verification delivery was claimed concurrently');
      const delivery = await tx.notificationDelivery.findFirst({
        where: { id: candidates[0].id, claimToken },
        include: { notification: true },
      });
      if (!delivery) throw new ConflictException('Email verification delivery claim could not be established');
      await this.audit(tx, actorId, configurationId, SMTP_BOOTSTRAP_STARTED, {
        dispatchId: claimToken,
        configurationVersion: configuration.version,
        configurationRevision: configuration.revision,
        deliveryId: delivery.id,
        notificationId: delivery.notificationId,
        actorEmailRevision: actor.emailRevision,
      });
      return {
        ...delivery,
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
        encryptedPassword: configuration.encryptedPassword,
        encryptionKeyId: configuration.encryptionKeyId,
        configurationVersion: configuration.version,
      };
    });
  }

  private async revalidateBeforeSend(configurationId: string, revision: number, actorId: string, claimed: ClaimedDelivery) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${actorId}::uuid FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SmtpConfigurationVersion" WHERE "id" = ${configurationId}::uuid FOR UPDATE`);
      this.requireActor(await this.findActor(tx, actorId));
      this.requireConfiguration(await tx.smtpConfigurationVersion.findUnique({ where: { id: configurationId } }), revision);
      const settings = await tx.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' } });
      if (settings?.databaseAuthorityEstablishedAt || settings?.activeConfigurationVersionId || settings?.enabled) {
        throw new ConflictException('Database SMTP authority changed before verification delivery');
      }
      const current = await tx.notificationDelivery.findFirst({ where: {
        id: claimed.id,
        status: NotificationStatus.FAILED,
        errorCode: ACCEPTANCE_UNCERTAIN,
        claimToken: claimed.claimToken,
        claimExpiresAt: { gt: new Date() },
      } });
      if (!current) throw new ConflictException('Email verification delivery claim expired');
    });
  }

  private findActor(tx: Prisma.TransactionClient, id: string): Promise<ActorAuthority | null> {
    return tx.user.findUnique({ where: { id }, select: {
      id: true,
      email: true,
      emailRevision: true,
      verifiedEmail: true,
      emailVerifiedAt: true,
      companyId: true,
      status: true,
      deletedAt: true,
      roles: { select: { role: { select: { companyId: true, systemName: true, deletedAt: true } } } },
    } });
  }

  private requireActor(actor: ActorAuthority | null): ActorAuthority {
    if (!actor) throw new ForbiddenException('Current platform administrator authority is required');
    const email = actor.email.trim().toLowerCase();
    const platformAdmin = actor.roles.some(({ role }) =>
      role.systemName === RoleName.SUPER_ADMIN && role.companyId === null && !role.deletedAt);
    const currentEmailVerified = actor.emailVerifiedAt !== null && actor.verifiedEmail === email;
    if (actor.status !== UserStatus.ACTIVE || actor.deletedAt || actor.companyId !== null || !platformAdmin || currentEmailVerified) {
      throw new ForbiddenException('Current unverified platform administrator authority is required');
    }
    return actor;
  }

  private requireConfiguration(
    configuration: Awaited<ReturnType<Prisma.TransactionClient['smtpConfigurationVersion']['findUnique']>>,
    revision: number,
  ): asserts configuration {
    if (!configuration || configuration.revision !== revision || configuration.lifecycle !== SmtpConfigurationLifecycle.TESTED ||
      configuration.revokedAt || configuration.firstActivatedAt || !configuration.structurallyValidatedAt ||
      !configuration.connectionTestedAt || configuration.connectionTestSucceeded !== true ||
      configuration.connectionTestResultCode !== 'SUCCESS') {
      throw new ConflictException('SMTP configuration is not eligible for email verification bootstrap');
    }
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
      errorCode: 'EMAIL_VERIFICATION_STALE',
      safeErrorMessage: 'Email verification authority is no longer eligible for delivery.',
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
      await this.audit(tx, claimed.notification.userId, claimed.smtpSnapshot.configurationVersionId!, SMTP_BOOTSTRAP_COMPLETED, {
        dispatchId: claimed.claimToken,
        deliveryId: claimed.id,
        notificationId: claimed.notificationId,
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

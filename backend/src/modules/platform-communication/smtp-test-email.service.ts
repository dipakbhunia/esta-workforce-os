import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, RoleName, SmtpConfigurationLifecycle, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SendSmtpTestEmailDto } from './dto/smtp-configuration.dto';
import { SmtpConnectionTestAdapter, SmtpTestEmailResult } from './smtp-connection-test.adapter';
import { SmtpCredentialEncryptionService } from './smtp-credential-encryption.service';

const RATE_WINDOW_MS = 15 * 60_000;
const RATE_RETENTION_MS = 90 * 24 * 60 * 60_000;
const RATE_LIMIT = 3;
const STARTED = 'SMTP_TEST_EMAIL_ATTEMPT_STARTED';
const COMPLETED = 'SMTP_TEST_EMAIL_ATTEMPT_COMPLETED';
const DISCARDED = 'SMTP_TEST_EMAIL_RESULT_DISCARDED';

const FIXED_SUBJECT = 'Esta Workforce OS SMTP configuration test';
const FIXED_TEXT = [
  'This is a restricted SMTP configuration test from Esta Workforce OS.',
  '',
  'The SMTP provider accepted a test message for the currently verified email address of the acting platform administrator.',
  'Acceptance by the SMTP provider does not confirm inbox delivery.',
].join('\n');

type ActorAuthority = {
  id: string; email: string; emailRevision: number; verifiedEmail: string | null; emailVerifiedAt: Date | null;
  companyId: string | null; status: UserStatus; deletedAt: Date | null;
  roles: Array<{ role: { companyId: string | null; systemName: RoleName | null; deletedAt: Date | null } }>;
};

@Injectable()
export class SmtpTestEmailService {
  constructor(private readonly prisma: PrismaService, private readonly encryption: SmtpCredentialEncryptionService,
    private readonly adapter: SmtpConnectionTestAdapter) {}

  async send(id: string, dto: SendSmtpTestEmailDto, authenticated: AuthenticatedUser) {
    const reserved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${'smtp-test-email:' + authenticated.id}, 0)) IS NULL AS "acquired"
      `);
      const now = new Date();
      await tx.auditLog.deleteMany({ where: { action: STARTED, createdAt: { lt: new Date(now.getTime() - RATE_RETENTION_MS) } } });
      const actor = await this.findActor(tx, authenticated.id);
      const authority = this.requireActor(actor);
      const configuration = await tx.smtpConfigurationVersion.findUnique({ where: { id } });
      this.requireConfiguration(configuration, dto.revision);
      const attempts = await tx.auditLog.count({ where: {
        actorUserId: authenticated.id, action: STARTED, createdAt: { gte: new Date(now.getTime() - RATE_WINDOW_MS) },
      } });
      if (attempts >= RATE_LIMIT) throw new HttpException('SMTP test email rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      await this.audit(tx, authenticated.id, id, STARTED, {
        version: configuration.version, revision: configuration.revision, actorEmailRevision: authority.emailRevision,
      });
      return Object.freeze({
        id: configuration.id, version: configuration.version, revision: configuration.revision,
        host: configuration.host, port: configuration.port, securityMode: configuration.securityMode,
        username: configuration.username, encryptedPassword: configuration.encryptedPassword,
        encryptionKeyId: configuration.encryptionKeyId, senderEmail: configuration.senderEmail,
        senderDisplayName: configuration.senderDisplayName, recipient: authority.recipient, actorEmailRevision: authority.emailRevision,
      });
    });

    let password: string;
    try { password = this.encryption.decrypt(reserved.encryptedPassword, reserved.id, reserved.encryptionKeyId); }
    catch {
      await this.recordCompletion(authenticated.id, reserved, { accepted: false, category: 'CREDENTIAL_UNAVAILABLE' });
      throw new ServiceUnavailableException('SMTP test email could not be sent');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${authenticated.id}::uuid FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SmtpConfigurationVersion" WHERE "id" = ${id}::uuid FOR UPDATE`);
      const actor = await this.findActor(tx, authenticated.id);
      const authority = this.requireActor(actor);
      if (authority.emailRevision !== reserved.actorEmailRevision || authority.recipient !== reserved.recipient) {
        throw new ConflictException('Recipient authority changed before SMTP delivery');
      }
      const configuration = await tx.smtpConfigurationVersion.findUnique({ where: { id } });
      this.requireConfiguration(configuration, reserved.revision);
    });

    const result = await this.adapter.sendTestEmail(reserved, password, {
      recipient: reserved.recipient, senderEmail: reserved.senderEmail, senderDisplayName: reserved.senderDisplayName,
      subject: FIXED_SUBJECT, text: FIXED_TEXT,
    });
    password = '';

    const persisted = await this.recordCompletion(authenticated.id, reserved, result);
    if (!result.accepted) throw new ServiceUnavailableException('SMTP provider did not accept the test email');
    if (!persisted) throw new ConflictException('Authority changed while SMTP delivery was in progress');
    return {
      acceptedByProvider: true,
      inboxDeliveryConfirmed: false,
      sentToCurrentVerifiedEmail: true,
      configurationVersion: reserved.version,
      configurationRevision: reserved.revision,
      acceptedAt: persisted,
    };
  }

  private async recordCompletion(actorId: string, snapshot: { id: string; version: number; revision: number; recipient: string; actorEmailRevision: number },
    result: SmtpTestEmailResult) {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.findActor(tx, actorId);
      const actorCurrent = this.isActorCurrent(actor, snapshot.recipient, snapshot.actorEmailRevision);
      const configuration = await tx.smtpConfigurationVersion.findUnique({ where: { id: snapshot.id } });
      const configurationCurrent = this.isConfigurationCurrent(configuration, snapshot.revision);
      const acceptedAt = result.accepted && actorCurrent && configurationCurrent ? new Date() : null;
      if (acceptedAt) {
        const updated = await tx.smtpConfigurationVersion.updateMany({
          where: { id: snapshot.id, revision: snapshot.revision, lifecycle: SmtpConfigurationLifecycle.TESTED, revokedAt: null },
          data: { restrictedTestEmailSentAt: acceptedAt, restrictedTestEmailAddress: snapshot.recipient },
        });
        if (updated.count !== 1) return null;
      }
      await this.audit(tx, actorId, snapshot.id, acceptedAt || !result.accepted ? COMPLETED : DISCARDED, {
        version: snapshot.version, revision: snapshot.revision, acceptedByProvider: result.accepted,
        category: result.category, persistedSuccessEvidence: Boolean(acceptedAt),
        ...(result.accepted && !acceptedAt ? { reason: 'STALE_AUTHORITY' } : {}),
      });
      return acceptedAt;
    });
  }

  private findActor(tx: Prisma.TransactionClient, id: string): Promise<ActorAuthority | null> {
    return tx.user.findUnique({ where: { id }, select: {
      id: true, email: true, emailRevision: true, verifiedEmail: true, emailVerifiedAt: true,
      companyId: true, status: true, deletedAt: true,
      roles: { select: { role: { select: { companyId: true, systemName: true, deletedAt: true } } } },
    } });
  }

  private requireActor(actor: ActorAuthority | null) {
    if (!actor || !this.isActorCurrent(actor)) throw new ForbiddenException('Current verified platform administrator authority is required');
    return { recipient: actor.email.trim().toLowerCase(), emailRevision: actor.emailRevision };
  }

  private isActorCurrent(actor: ActorAuthority | null, expectedEmail?: string, expectedRevision?: number) {
    if (!actor) return false;
    const email = actor.email.trim().toLowerCase();
    return actor.status === UserStatus.ACTIVE && !actor.deletedAt && actor.companyId === null &&
      actor.emailVerifiedAt !== null && actor.verifiedEmail === email &&
      actor.roles.some(({ role }) => role.systemName === RoleName.SUPER_ADMIN && role.companyId === null && !role.deletedAt) &&
      (expectedEmail === undefined || email === expectedEmail) &&
      (expectedRevision === undefined || actor.emailRevision === expectedRevision);
  }

  private requireConfiguration(configuration: Awaited<ReturnType<Prisma.TransactionClient['smtpConfigurationVersion']['findUnique']>>, revision: number): asserts configuration {
    if (!this.isConfigurationCurrent(configuration, revision)) {
      throw new ConflictException('SMTP configuration is not eligible for restricted test email delivery');
    }
  }

  private isConfigurationCurrent(configuration: Awaited<ReturnType<Prisma.TransactionClient['smtpConfigurationVersion']['findUnique']>>, revision: number) {
    return Boolean(configuration && configuration.revision === revision && configuration.lifecycle === SmtpConfigurationLifecycle.TESTED &&
      configuration.structurallyValidatedAt && configuration.connectionTestedAt && configuration.connectionTestSucceeded === true &&
      configuration.connectionTestResultCode === 'SUCCESS' && !configuration.revokedAt);
  }

  private audit(tx: Prisma.TransactionClient, actorUserId: string, entityId: string, action: string, metadata: Prisma.InputJsonObject) {
    return tx.auditLog.create({ data: { actorUserId, action, entityType: 'SmtpConfigurationVersion', entityId, metadata } });
  }
}

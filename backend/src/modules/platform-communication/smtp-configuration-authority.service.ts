import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, RoleName, SmtpConfigurationLifecycle, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ActivateSmtpConfigurationDto, RollbackSmtpConfigurationDto, ToggleDatabaseSmtpDto } from './dto/smtp-configuration.dto';
import { acquireExclusiveSmtpAuthorityLock } from './smtp-authority-lock';
import { SmtpCredentialEncryptionService } from './smtp-credential-encryption.service';

type Target = NonNullable<Awaited<ReturnType<Prisma.TransactionClient['smtpConfigurationVersion']['findUnique']>>>;

@Injectable()
export class SmtpConfigurationAuthorityService {
  constructor(private readonly prisma: PrismaService, private readonly encryption: SmtpCredentialEncryptionService,
    private readonly config: ConfigService) {}

  activate(id: string, dto: ActivateSmtpConfigurationDto, actor: AuthenticatedUser) {
    return this.select(id, dto, actor, false);
  }

  rollback(id: string, dto: RollbackSmtpConfigurationDto, actor: AuthenticatedUser) {
    return this.select(id, dto, actor, true);
  }

  disable(dto: ToggleDatabaseSmtpDto, actor: AuthenticatedUser) {
    return this.toggle(dto, actor, false);
  }

  enable(dto: ToggleDatabaseSmtpDto, actor: AuthenticatedUser) {
    return this.toggle(dto, actor, true);
  }

  private async select(id: string, dto: ActivateSmtpConfigurationDto, actor: AuthenticatedUser, rollback: boolean) {
    this.requireGate();
    return this.prisma.$transaction(async (tx) => {
      await acquireExclusiveSmtpAuthorityLock(tx);
      const authority = await this.requireActor(tx, actor.id);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PlatformEmailSettings" WHERE "scope" = 'PLATFORM' FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SmtpConfigurationVersion" WHERE "id" = ${id}::uuid FOR UPDATE`);
      const settings = await tx.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' } });
      const currentRevision = settings?.revision ?? 0;
      if (currentRevision !== dto.settingsRevision) throw new ConflictException('SMTP settings revision conflict');
      const target = await this.requireEligibleTarget(tx,
        await tx.smtpConfigurationVersion.findUnique({ where: { id } }), dto.targetRevision);
      if (rollback && !target.firstActivatedAt) throw new ConflictException('SMTP rollback target was not previously activated');
      if (!rollback && target.firstActivatedAt) throw new ConflictException('Previously activated SMTP versions require the rollback operation');
      this.assertDecryptable(target);
      const now = new Date();
      await tx.smtpConfigurationVersion.update({ where: { id }, data: {
        firstActivatedAt: target.firstActivatedAt ?? now, lastActivatedAt: now, activatedByUserId: authority.id,
      } });
      const updated = settings
        ? await tx.platformEmailSettings.update({ where: { scope: 'PLATFORM' }, data: {
          activeConfigurationVersionId: id, enabled: true, revision: { increment: 1 }, updatedByUserId: authority.id,
          ...(settings.databaseAuthorityEstablishedAt ? {} : { databaseAuthorityEstablishedAt: now }),
        } })
        : await tx.platformEmailSettings.create({ data: {
          scope: 'PLATFORM', activeConfigurationVersionId: id, enabled: true,
          databaseAuthorityEstablishedAt: now, updatedByUserId: authority.id,
        } });
      await this.audit(tx, authority.id, id, rollback ? 'SMTP_CONFIGURATION_ROLLED_BACK' : 'SMTP_CONFIGURATION_ACTIVATED', {
        version: target.version, targetRevision: target.revision, previousConfigurationVersionId: settings?.activeConfigurationVersionId ?? null,
        settingsRevision: updated.revision,
      });
      return this.safe(updated, target);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async toggle(dto: ToggleDatabaseSmtpDto, actor: AuthenticatedUser, enabled: boolean) {
    this.requireGate();
    return this.prisma.$transaction(async (tx) => {
      await acquireExclusiveSmtpAuthorityLock(tx);
      const authority = await this.requireActor(tx, actor.id);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PlatformEmailSettings" WHERE "scope" = 'PLATFORM' FOR UPDATE`);
      const settings = await tx.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' } });
      if (!settings?.databaseAuthorityEstablishedAt || !settings.activeConfigurationVersionId) {
        throw new ConflictException('Database SMTP authority has not been established');
      }
      if (settings.revision !== dto.settingsRevision) throw new ConflictException('SMTP settings revision conflict');
      let target = await tx.smtpConfigurationVersion.findUnique({ where: { id: settings.activeConfigurationVersionId } });
      if (enabled) {
        target = await this.requireEligibleTarget(tx, target, target?.revision ?? -1);
        this.assertDecryptable(target);
      } else if (!target || target.lifecycle === SmtpConfigurationLifecycle.REVOKED || target.revokedAt) {
        throw new ConflictException('Active SMTP configuration is invalid');
      }
      const updated = await tx.platformEmailSettings.update({ where: { scope: 'PLATFORM' }, data: {
        enabled, revision: { increment: 1 }, updatedByUserId: authority.id,
      } });
      await this.audit(tx, authority.id, target.id, enabled ? 'DATABASE_SMTP_ENABLED' : 'DATABASE_SMTP_DISABLED', {
        version: target.version, targetRevision: target.revision, settingsRevision: updated.revision,
      });
      return this.safe(updated, target);
    });
  }

  private async requireEligibleTarget(tx: Prisma.TransactionClient, target: Target | null, revision: number): Promise<Target> {
    if (!target || target.revision !== revision || target.lifecycle !== SmtpConfigurationLifecycle.TESTED || target.revokedAt ||
      !target.structurallyValidatedAt || !target.connectionTestedAt || target.connectionTestSucceeded !== true ||
      target.connectionTestResultCode !== 'SUCCESS' || !target.restrictedTestEmailSentAt || !target.restrictedTestEmailAddress) {
      throw new ConflictException('SMTP configuration is not eligible for activation');
    }
    const evidence = await tx.auditLog.findFirst({ where: {
      action: 'SMTP_TEST_EMAIL_ATTEMPT_COMPLETED', entityType: 'SmtpConfigurationVersion', entityId: target.id,
    }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const metadata = evidence?.metadata as Record<string, unknown> | null;
    if (!metadata || metadata.version !== target.version || metadata.revision !== target.revision ||
      metadata.acceptedByProvider !== true || metadata.persistedSuccessEvidence !== true) {
      throw new ConflictException('Successful restricted SMTP test-email evidence is required');
    }
    return target;
  }

  private assertDecryptable(target: Target) {
    const password = this.encryption.decrypt(target.encryptedPassword, target.id, target.encryptionKeyId);
    if (!password) throw new ServiceUnavailableException('SMTP credential decryption failed');
  }

  private async requireActor(tx: Prisma.TransactionClient, id: string) {
    const actor = await tx.user.findUnique({ where: { id }, select: {
      id: true, companyId: true, status: true, deletedAt: true,
      roles: { select: { role: { select: { companyId: true, systemName: true, deletedAt: true } } } },
    } });
    if (!actor || actor.companyId !== null || actor.status !== UserStatus.ACTIVE || actor.deletedAt ||
      !actor.roles.some(({ role }) => role.companyId === null && role.systemName === RoleName.SUPER_ADMIN && !role.deletedAt)) {
      throw new ForbiddenException('Current platform administrator authority is required');
    }
    return actor;
  }

  private requireGate() {
    if (this.config.get<boolean>('SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED') !== true) {
      throw new ServiceUnavailableException('Database SMTP authority management is not deployment-ready');
    }
  }

  private safe(settings: { enabled: boolean; revision: number; activeConfigurationVersionId: string | null; databaseAuthorityEstablishedAt: Date | null }, target: Target) {
    return { enabled: settings.enabled, revision: settings.revision,
      activeConfigurationVersionId: settings.activeConfigurationVersionId,
      databaseAuthorityEstablishedAt: settings.databaseAuthorityEstablishedAt,
      activeConfiguration: { id: target.id, version: target.version, revision: target.revision },
    };
  }

  private audit(tx: Prisma.TransactionClient, actorUserId: string, entityId: string, action: string, metadata: Prisma.InputJsonObject) {
    return tx.auditLog.create({ data: { actorUserId, action, entityType: 'SmtpConfigurationVersion', entityId, metadata } });
  }
}

import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SmtpConfigurationLifecycle } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateSmtpConfigurationDraftDto, SmtpConfigurationHistoryQueryDto, TestSmtpConnectionDto, UpdateSmtpConfigurationDraftDto, ValidateSmtpConfigurationDraftDto } from './dto/smtp-configuration.dto';
import { SmtpConnectionTestAdapter, SmtpConnectionTestResult } from './smtp-connection-test.adapter';
import { SmtpConfigurationValidationError, validateAndNormalizeSmtpConfiguration } from './smtp-configuration.validation';
import { SmtpCredentialEncryptionService } from './smtp-credential-encryption.service';

const safeSelect = {
  id: true, version: true, lifecycle: true, host: true, port: true, securityMode: true,
  username: true, senderEmail: true, senderDisplayName: true, revision: true,
  structurallyValidatedAt: true, connectionTestedAt: true, connectionTestSucceeded: true,
  restrictedTestEmailSentAt: true, firstActivatedAt: true, lastActivatedAt: true,
  revokedAt: true, createdByUserId: true, activatedByUserId: true, revokedByUserId: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.SmtpConfigurationVersionSelect;

type SafeRow = Prisma.SmtpConfigurationVersionGetPayload<{ select: typeof safeSelect }>;
const SMTP_TEST_RATE_WINDOW_MS = 10 * 60_000;
const SMTP_TEST_RATE_EVIDENCE_RETENTION_MS = 90 * 24 * 60 * 60_000;

@Injectable()
export class SmtpConfigurationLifecycleService {
  constructor(private readonly prisma: PrismaService, private readonly encryption: SmtpCredentialEncryptionService,
    private readonly connectionTest: SmtpConnectionTestAdapter) {}

  async getConfiguration() {
    const [settings, latest] = await Promise.all([
      this.prisma.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' }, select: {
        enabled: true, revision: true, activeConfigurationVersionId: true, databaseAuthorityEstablishedAt: true, updatedAt: true,
      } }),
      this.prisma.smtpConfigurationVersion.findFirst({ select: safeSelect, orderBy: [{ version: 'desc' }] }),
    ]);
    return { settings: settings ?? { enabled: false, revision: 0, activeConfigurationVersionId: null, databaseAuthorityEstablishedAt: null, updatedAt: null }, latestVersion: latest ? this.safe(latest) : null };
  }

  async listVersions(query: SmtpConfigurationHistoryQueryDto) {
    const [data, total] = await this.prisma.$transaction(async (tx) => Promise.all([
      tx.smtpConfigurationVersion.findMany({ select: safeSelect, orderBy: [{ version: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      tx.smtpConfigurationVersion.count(),
    ]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { data: data.map((row) => this.safe(row)), meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async createDraft(dto: CreateSmtpConfigurationDraftDto, actor: AuthenticatedUser) {
    const normalized = this.validate(dto);
    const id = randomUUID();
    const credential = this.encryption.encrypt(normalized.password, id);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.smtpConfigurationVersion.create({ data: {
        id, lifecycle: SmtpConfigurationLifecycle.DRAFT, host: normalized.host, port: normalized.port,
        securityMode: normalized.securityMode, username: normalized.username,
        encryptedPassword: credential.encryptedPassword, encryptionKeyId: credential.encryptionKeyId,
        senderEmail: normalized.senderEmail, senderDisplayName: normalized.senderDisplayName,
        createdByUserId: actor.id,
      }, select: safeSelect });
      await this.audit(tx, actor.id, id, 'SMTP_CONFIGURATION_DRAFT_CREATED', { version: created.version, revision: created.revision, passwordChanged: true });
      return this.safe(created);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateDraft(id: string, dto: UpdateSmtpConfigurationDraftDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.smtpConfigurationVersion.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('SMTP configuration version not found');
      if (existing.lifecycle === SmtpConfigurationLifecycle.REVOKED || existing.firstActivatedAt || existing.revokedAt) {
        throw new ConflictException('SMTP configuration version is not editable');
      }
      const normalized = this.validate({
        host: dto.host ?? existing.host, port: dto.port ?? existing.port,
        securityMode: dto.securityMode ?? existing.securityMode, username: dto.username ?? existing.username,
        password: dto.password ?? 'retained-password', senderEmail: dto.senderEmail ?? existing.senderEmail,
        senderDisplayName: dto.senderDisplayName ?? existing.senderDisplayName,
      });
      const credential = dto.password === undefined ? null : this.encryption.encrypt(normalized.password, id);
      const changed = await tx.smtpConfigurationVersion.updateMany({
        where: { id, revision: dto.revision, lifecycle: { not: SmtpConfigurationLifecycle.REVOKED }, firstActivatedAt: null, revokedAt: null },
        data: {
          lifecycle: SmtpConfigurationLifecycle.DRAFT,
          host: normalized.host, port: normalized.port, securityMode: normalized.securityMode,
          username: normalized.username, senderEmail: normalized.senderEmail, senderDisplayName: normalized.senderDisplayName,
          ...(credential ? { encryptedPassword: credential.encryptedPassword, encryptionKeyId: credential.encryptionKeyId } : {}),
          revision: { increment: 1 }, structurallyValidatedAt: null, connectionTestedAt: null,
          connectionTestSucceeded: null, connectionTestResultCode: null,
          restrictedTestEmailSentAt: null, restrictedTestEmailAddress: null,
        },
      });
      if (changed.count !== 1) throw new ConflictException('SMTP configuration revision conflict');
      const updated = await tx.smtpConfigurationVersion.findUniqueOrThrow({ where: { id }, select: safeSelect });
      await this.audit(tx, actor.id, id, 'SMTP_CONFIGURATION_DRAFT_UPDATED', { version: updated.version, revision: updated.revision, passwordChanged: Boolean(credential) });
      return this.safe(updated);
    });
  }

  async validateDraft(id: string, dto: ValidateSmtpConfigurationDraftDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.smtpConfigurationVersion.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('SMTP configuration version not found');
      if (existing.lifecycle !== SmtpConfigurationLifecycle.DRAFT || existing.firstActivatedAt || existing.revokedAt) {
        throw new ConflictException('SMTP configuration version cannot be validated');
      }
      this.validate({ host: existing.host, port: existing.port, securityMode: existing.securityMode,
        username: existing.username, password: 'retained-password', senderEmail: existing.senderEmail,
        senderDisplayName: existing.senderDisplayName });
      const changed = await tx.smtpConfigurationVersion.updateMany({
        where: { id, revision: dto.revision, lifecycle: SmtpConfigurationLifecycle.DRAFT, firstActivatedAt: null, revokedAt: null },
        data: { lifecycle: SmtpConfigurationLifecycle.VALIDATED, structurallyValidatedAt: new Date(), revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('SMTP configuration revision conflict');
      const updated = await tx.smtpConfigurationVersion.findUniqueOrThrow({ where: { id }, select: safeSelect });
      await this.audit(tx, actor.id, id, 'SMTP_CONFIGURATION_STRUCTURALLY_VALIDATED', { version: updated.version, revision: updated.revision });
      return this.safe(updated);
    });
  }

  async testConnection(id: string, dto: TestSmtpConnectionDto, actor: AuthenticatedUser) {
    const snapshot = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${'smtp-test:' + actor.id}, 0)) IS NULL AS "acquired"
      `);
      const now = Date.now();
      await tx.auditLog.deleteMany({ where: { action: 'SMTP_CONNECTION_TEST_STARTED',
        createdAt: { lt: new Date(now - SMTP_TEST_RATE_EVIDENCE_RETENTION_MS) } } });
      const attempts = await tx.auditLog.count({ where: { actorUserId: actor.id, action: 'SMTP_CONNECTION_TEST_STARTED',
        createdAt: { gte: new Date(now - SMTP_TEST_RATE_WINDOW_MS) } } });
      if (attempts >= 5) throw new HttpException('SMTP connection test rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      const row = await tx.smtpConfigurationVersion.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('SMTP configuration version not found');
      if (row.lifecycle !== SmtpConfigurationLifecycle.VALIDATED || row.firstActivatedAt || row.revokedAt) {
        throw new ConflictException('SMTP configuration version is not eligible for connection testing');
      }
      if (row.revision !== dto.revision) throw new ConflictException('SMTP configuration revision conflict');
      await this.audit(tx, actor.id, id, 'SMTP_CONNECTION_TEST_STARTED', { version: row.version, revision: row.revision });
      return Object.freeze({ id: row.id, version: row.version, revision: row.revision, host: row.host, port: row.port,
        securityMode: row.securityMode, username: row.username, encryptedPassword: row.encryptedPassword,
        encryptionKeyId: row.encryptionKeyId });
    });

    let result: SmtpConnectionTestResult;
    try {
      const password = this.encryption.decrypt(snapshot.encryptedPassword, snapshot.id, snapshot.encryptionKeyId);
      result = await this.connectionTest.verify(snapshot, password);
    } catch { result = { success: false, category: 'CREDENTIAL_UNAVAILABLE' }; }

    const testedAt = new Date();
    const persisted = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.smtpConfigurationVersion.updateMany({
        where: { id, revision: snapshot.revision, lifecycle: SmtpConfigurationLifecycle.VALIDATED,
          firstActivatedAt: null, revokedAt: null },
        data: { lifecycle: result.success ? SmtpConfigurationLifecycle.TESTED : SmtpConfigurationLifecycle.VALIDATED,
          connectionTestedAt: testedAt, connectionTestSucceeded: result.success,
          connectionTestResultCode: result.category, revision: { increment: 1 } },
      });
      if (changed.count !== 1) {
        await this.audit(tx, actor.id, id, 'SMTP_CONNECTION_TEST_DISCARDED', {
          version: snapshot.version, testedRevision: snapshot.revision, category: result.category, reason: 'STALE_REVISION',
        });
        return null;
      }
      await this.audit(tx, actor.id, id, 'SMTP_CONNECTION_TEST_COMPLETED', {
        version: snapshot.version, testedRevision: snapshot.revision, success: result.success, category: result.category,
      });
      return { success: result.success, category: result.category, testedAt, revision: snapshot.revision + 1,
        lifecycle: result.success ? SmtpConfigurationLifecycle.TESTED : SmtpConfigurationLifecycle.VALIDATED };
    });
    if (!persisted) throw new ConflictException('SMTP configuration changed during connection testing');
    return persisted;
  }

  private validate(input: unknown) {
    try { return validateAndNormalizeSmtpConfiguration(input); }
    catch (error) {
      if (error instanceof SmtpConfigurationValidationError) throw new BadRequestException({ message: 'SMTP configuration is invalid', code: error.code });
      throw error;
    }
  }

  private safe(row: SafeRow) { return { ...row, passwordConfigured: true }; }

  private audit(tx: Prisma.TransactionClient, actorUserId: string, entityId: string, action: string, metadata: Prisma.InputJsonObject) {
    return tx.auditLog.create({ data: { actorUserId, action, entityType: 'SmtpConfigurationVersion', entityId, metadata } });
  }
}

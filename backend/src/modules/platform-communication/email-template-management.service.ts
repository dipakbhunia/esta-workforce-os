import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmailTemplateVersionLifecycle, NotificationType, Prisma, RoleName, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateEmailTemplateDraftDto, EmailTemplateHistoryQueryDto, PublishEmailTemplateVersionDto,
  RollbackEmailTemplateVersionDto, UpdateEmailTemplateDraftDto, ValidateEmailTemplateDraftDto } from './dto/email-template.dto';
import { EMAIL_TEMPLATE_CATALOG, findEmailTemplateCatalogEntry } from './email-template-catalog';
import { EmailTemplateValidationError, validateEmailTemplateStructure } from './email-template.validation';

const versionSelect = {
  id: true, templateId: true, version: true, lifecycle: true, subjectTemplate: true, textBodyTemplate: true,
  placeholderContractVersion: true, revision: true, validationResultCode: true, createdByUserId: true,
  validatedByUserId: true, publishedByUserId: true, retiredByUserId: true, validatedAt: true,
  publishedAt: true, retiredAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.EmailTemplateVersionSelect;

type VersionRow = Prisma.EmailTemplateVersionGetPayload<{ select: typeof versionSelect }>;

@Injectable()
export class EmailTemplateManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async listCatalog() {
    const rows = await this.prisma.emailTemplate.findMany({ select: {
      id: true, templateKey: true, notificationType: true, revision: true, activeVersionId: true,
      createdAt: true, updatedAt: true,
      activeVersion: { select: versionSelect },
      versions: { select: { id: true, version: true, lifecycle: true, revision: true, updatedAt: true },
        orderBy: [{ version: 'desc' }], take: 1 },
    } });
    const byType = new Map(rows.map((row) => [row.notificationType, row]));
    return EMAIL_TEMPLATE_CATALOG.map((catalog) => {
      const row = byType.get(catalog.notificationType);
      return {
        ...catalog,
        configured: Boolean(row),
        template: row ? { id: row.id, templateKey: row.templateKey, revision: row.revision,
          activeVersionId: row.activeVersionId, createdAt: row.createdAt, updatedAt: row.updatedAt,
          activeVersion: row.activeVersion, latestVersion: row.versions[0] ?? null } : null,
      };
    });
  }

  async getTemplate(type: NotificationType) {
    const catalog = this.requireCatalog(type);
    const row = await this.prisma.emailTemplate.findUnique({ where: { notificationType: type }, select: {
      id: true, templateKey: true, notificationType: true, activeVersionId: true, revision: true,
      createdAt: true, updatedAt: true, activeVersion: { select: versionSelect },
    } });
    return { ...catalog, configured: Boolean(row), template: row };
  }

  async listVersions(type: NotificationType, query: EmailTemplateHistoryQueryDto) {
    this.requireCatalog(type);
    const template = await this.prisma.emailTemplate.findUnique({ where: { notificationType: type }, select: { id: true } });
    if (!template) return { data: [], meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 } };
    const [data, total] = await this.prisma.$transaction(async (tx) => Promise.all([
      tx.emailTemplateVersion.findMany({ where: { templateId: template.id }, select: versionSelect,
        orderBy: [{ version: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      tx.emailTemplateVersion.count({ where: { templateId: template.id } }),
    ]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { data, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async createDraft(type: NotificationType, dto: CreateEmailTemplateDraftDto, actor: AuthenticatedUser) {
    const catalog = this.requireCatalog(type);
    this.validateStructure(type, dto);
    return this.prisma.$transaction(async (tx) => {
      const authority = await this.requireActor(tx, actor.id);
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`email-template-event:${type}`}, 0)) IS NULL AS "acquired"
      `);
      let template = await tx.emailTemplate.findUnique({ where: { notificationType: type } });
      if (!template) {
        if (dto.templateRevision !== 0) throw new ConflictException('Email template revision conflict');
        template = await tx.emailTemplate.create({ data: {
          id: randomUUID(), templateKey: catalog.templateKey, notificationType: type,
        } });
      } else {
        if (template.revision !== dto.templateRevision) throw new ConflictException('Email template revision conflict');
        const changed = await tx.emailTemplate.updateMany({
          where: { id: template.id, revision: dto.templateRevision }, data: { revision: { increment: 1 } },
        });
        if (changed.count !== 1) throw new ConflictException('Email template revision conflict');
        template = await tx.emailTemplate.findUniqueOrThrow({ where: { id: template.id } });
      }
      const version = await tx.emailTemplateVersion.create({ data: {
        id: randomUUID(), templateId: template.id, subjectTemplate: dto.subjectTemplate,
        textBodyTemplate: dto.textBodyTemplate, placeholderContractVersion: dto.placeholderContractVersion,
        createdByUserId: authority.id,
      }, select: versionSelect });
      await this.audit(tx, authority.id, version.id, 'EMAIL_TEMPLATE_DRAFT_CREATED', {
        notificationType: type, templateId: template.id, templateRevision: template.revision,
        version: version.version, versionRevision: version.revision,
      });
      return { templateRevision: template.revision, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async updateDraft(type: NotificationType, id: string, dto: UpdateEmailTemplateDraftDto, actor: AuthenticatedUser) {
    this.requireCatalog(type);
    this.validateStructure(type, dto);
    return this.withLockedVersion(type, id, actor, async (tx, authority, template, version) => {
      if (version.lifecycle !== EmailTemplateVersionLifecycle.DRAFT) throw new ConflictException('Email template version is not editable');
      const changed = await tx.emailTemplateVersion.updateMany({
        where: { id, templateId: template.id, revision: dto.revision, lifecycle: EmailTemplateVersionLifecycle.DRAFT },
        data: { subjectTemplate: dto.subjectTemplate, textBodyTemplate: dto.textBodyTemplate,
          placeholderContractVersion: dto.placeholderContractVersion, validationResultCode: null,
          validatedAt: null, validatedByUserId: null, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Email template version revision conflict');
      const updated = await tx.emailTemplateVersion.findUniqueOrThrow({ where: { id }, select: versionSelect });
      await this.audit(tx, authority.id, id, 'EMAIL_TEMPLATE_DRAFT_UPDATED', {
        notificationType: type, templateId: template.id, version: updated.version, versionRevision: updated.revision,
      });
      return updated;
    });
  }

  async validateDraft(type: NotificationType, id: string, dto: ValidateEmailTemplateDraftDto, actor: AuthenticatedUser) {
    this.requireCatalog(type);
    return this.withLockedVersion(type, id, actor, async (tx, authority, template, version) => {
      if (version.lifecycle !== EmailTemplateVersionLifecycle.DRAFT) throw new ConflictException('Email template version cannot be validated');
      this.validateStructure(type, version);
      const changed = await tx.emailTemplateVersion.updateMany({
        where: { id, templateId: template.id, revision: dto.revision, lifecycle: EmailTemplateVersionLifecycle.DRAFT },
        data: { validationResultCode: 'VALID', validatedAt: new Date(), validatedByUserId: authority.id,
          revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Email template version revision conflict');
      const updated = await tx.emailTemplateVersion.findUniqueOrThrow({ where: { id }, select: versionSelect });
      await this.audit(tx, authority.id, id, 'EMAIL_TEMPLATE_DRAFT_VALIDATED', {
        notificationType: type, templateId: template.id, version: updated.version, versionRevision: updated.revision,
        placeholderContractVersion: updated.placeholderContractVersion,
      });
      return updated;
    });
  }

  publish(type: NotificationType, id: string, dto: PublishEmailTemplateVersionDto, actor: AuthenticatedUser) {
    return this.selectActive(type, id, dto, actor, false);
  }

  rollback(type: NotificationType, id: string, dto: RollbackEmailTemplateVersionDto, actor: AuthenticatedUser) {
    return this.selectActive(type, id, dto, actor, true);
  }

  private async selectActive(type: NotificationType, id: string, dto: PublishEmailTemplateVersionDto,
    actor: AuthenticatedUser, rollback: boolean) {
    this.requireCatalog(type);
    return this.withLockedVersion(type, id, actor, async (tx, authority, template, version) => {
      if (template.revision !== dto.templateRevision) throw new ConflictException('Email template revision conflict');
      if (version.revision !== dto.targetRevision) throw new ConflictException('Email template version revision conflict');
      this.validateStructure(type, version);
      if (rollback) {
        if (version.lifecycle !== EmailTemplateVersionLifecycle.PUBLISHED || !version.publishedAt ||
          template.activeVersionId === version.id) throw new ConflictException('Email template version is not eligible for rollback');
      } else if (version.lifecycle !== EmailTemplateVersionLifecycle.DRAFT || version.validationResultCode !== 'VALID' ||
        !version.validatedAt) throw new ConflictException('Email template version is not eligible for publication');

      let selected = version;
      if (!rollback) {
        const published = await tx.emailTemplateVersion.updateMany({
          where: { id, templateId: template.id, revision: dto.targetRevision,
            lifecycle: EmailTemplateVersionLifecycle.DRAFT, validationResultCode: 'VALID', validatedAt: { not: null } },
          data: { lifecycle: EmailTemplateVersionLifecycle.PUBLISHED, publishedAt: new Date(),
            publishedByUserId: authority.id, revision: { increment: 1 } },
        });
        if (published.count !== 1) throw new ConflictException('Email template version revision conflict');
        selected = await tx.emailTemplateVersion.findUniqueOrThrow({ where: { id } });
      }
      const changed = await tx.emailTemplate.updateMany({
        where: { id: template.id, revision: dto.templateRevision },
        data: { activeVersionId: id, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Email template revision conflict');
      const updatedTemplate = await tx.emailTemplate.findUniqueOrThrow({ where: { id: template.id } });
      await this.audit(tx, authority.id, id, rollback ? 'EMAIL_TEMPLATE_ROLLED_BACK' : 'EMAIL_TEMPLATE_PUBLISHED', {
        notificationType: type, templateId: template.id, previousActiveVersionId: template.activeVersionId,
        version: selected.version, versionRevision: selected.revision, templateRevision: updatedTemplate.revision,
      });
      return { templateRevision: updatedTemplate.revision, activeVersionId: id,
        version: await tx.emailTemplateVersion.findUniqueOrThrow({ where: { id }, select: versionSelect }) };
    });
  }

  private async withLockedVersion<T>(type: NotificationType, id: string, actor: AuthenticatedUser,
    operation: (tx: Prisma.TransactionClient, authority: { id: string }, template: Prisma.EmailTemplateGetPayload<object>,
      version: VersionRow) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      const authority = await this.requireActor(tx, actor.id);
      const template = await tx.emailTemplate.findUnique({ where: { notificationType: type } });
      if (!template) throw new NotFoundException('Email template not found');
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`email-template:${template.id}`}, 0)) IS NULL AS "acquired"
      `);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "EmailTemplate" WHERE "id" = ${template.id}::uuid FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "EmailTemplateVersion" WHERE "id" = ${id}::uuid FOR UPDATE`);
      const lockedTemplate = await tx.emailTemplate.findUniqueOrThrow({ where: { id: template.id } });
      const version = await tx.emailTemplateVersion.findFirst({ where: { id, templateId: template.id }, select: versionSelect });
      if (!version) throw new NotFoundException('Email template version not found');
      return operation(tx, authority, lockedTemplate, version);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private requireCatalog(type: NotificationType) {
    const catalog = findEmailTemplateCatalogEntry(type);
    if (!catalog) throw new NotFoundException('Email template type not found');
    return catalog;
  }

  private validateStructure(type: NotificationType, input: {
    subjectTemplate: string; textBodyTemplate: string; placeholderContractVersion: number;
  }) {
    try { return validateEmailTemplateStructure({ notificationType: type, ...input }); }
    catch (error) {
      if (error instanceof EmailTemplateValidationError) {
        throw new BadRequestException({ message: 'Email template is structurally invalid', code: error.code });
      }
      throw error;
    }
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

  private audit(tx: Prisma.TransactionClient, actorUserId: string, entityId: string, action: string,
    metadata: Prisma.InputJsonObject) {
    return tx.auditLog.create({ data: { actorUserId, action, entityType: 'EmailTemplateVersion', entityId, metadata } });
  }
}

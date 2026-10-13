import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmailTemplateVersionLifecycle, NotificationType, RoleName, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { renderEmailHtml, renderEmailText } from '../notifications/email-notification-channel.service';
import { compileEmailTemplate, renderCompiledEmailTemplate } from './email-template.compiler';
import { findEmailTemplateCatalogEntry } from './email-template-catalog';
import { emailTemplateSyntheticValues } from './email-template-synthetic-preview';

@Injectable()
export class EmailTemplatePreviewService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(type: NotificationType, id: string, revision: number, actor: AuthenticatedUser) {
    const catalog = findEmailTemplateCatalogEntry(type);
    if (!catalog) throw new NotFoundException('Email template type not found');
    const authority = await this.prisma.user.findUnique({ where: { id: actor.id }, select: {
      companyId: true, status: true, deletedAt: true,
      roles: { select: { role: { select: { companyId: true, systemName: true, deletedAt: true } } } },
    } });
    if (!authority || authority.companyId !== null || authority.status !== UserStatus.ACTIVE || authority.deletedAt ||
      !authority.roles.some(({ role }) => role.companyId === null && role.systemName === RoleName.SUPER_ADMIN && !role.deletedAt)) {
      throw new ForbiddenException('Current platform administrator authority is required');
    }
    const version = await this.prisma.emailTemplateVersion.findFirst({ where: {
      id,
      template: { notificationType: type },
      lifecycle: { in: [EmailTemplateVersionLifecycle.DRAFT, EmailTemplateVersionLifecycle.PUBLISHED] },
    }, select: {
      id: true, templateId: true, version: true, lifecycle: true, revision: true,
      subjectTemplate: true, textBodyTemplate: true, placeholderContractVersion: true,
    } });
    if (!version) throw new NotFoundException('Email template version not found');
    if (version.revision !== revision) throw new ConflictException('Email template version revision conflict');
    const compiled = compileEmailTemplate({ notificationType: type, subjectTemplate: version.subjectTemplate,
      textBodyTemplate: version.textBodyTemplate, placeholderContractVersion: version.placeholderContractVersion });
    const rendered = renderCompiledEmailTemplate(compiled, emailTemplateSyntheticValues(type));
    const content = { type, title: rendered.subject, message: rendered.textBody, severity: null, detailsPath: null };
    return Object.freeze({
      synthetic: true,
      notificationType: type,
      templateId: version.templateId,
      versionId: version.id,
      version: version.version,
      lifecycle: version.lifecycle,
      revision: version.revision,
      subject: rendered.subject,
      textBody: renderEmailText(content),
      html: renderEmailHtml(content),
      systemManagedActionLink: catalog.systemManagedActionLink,
      actionLinkIncluded: false,
    });
  }
}

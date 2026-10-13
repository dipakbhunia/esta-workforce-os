import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplateVersionLifecycle, NotificationType, Prisma } from '@prisma/client';
import { compileEmailTemplate, EmailTemplateContractError, renderCompiledEmailTemplate } from '../platform-communication/email-template.compiler';
import { findEmailTemplateCatalogEntry } from '../platform-communication/email-template-catalog';
import { EmailCompositionResult, EmailEventKey, EmailEventPayloadMap } from './email-composition.types';
import { emailRendererRegistry } from './email-renderer.registry';

type TemplateReader = Pick<Prisma.TransactionClient, 'emailTemplate'>;

export interface ResolvedEmailComposition {
  composition: EmailCompositionResult;
  emailTemplateVersionId: string | null;
}

@Injectable()
export class EmailTemplateRuntimeResolver {
  private readonly logger = new Logger(EmailTemplateRuntimeResolver.name);

  async resolve<K extends EmailEventKey>(reader: TemplateReader, type: K,
    payload: EmailEventPayloadMap[K]): Promise<ResolvedEmailComposition> {
    const fallback = emailRendererRegistry.render(type, payload);
    const catalog = findEmailTemplateCatalogEntry(type);
    if (!catalog || catalog.systemManagedActionLink) {
      return { composition: fallback, emailTemplateVersionId: null };
    }
    const template = await reader.emailTemplate.findUnique({
      where: { notificationType: type },
      select: {
        notificationType: true,
        activeVersion: { select: { id: true, lifecycle: true, subjectTemplate: true,
          textBodyTemplate: true, placeholderContractVersion: true } },
      },
    });
    const version = template?.activeVersion;
    if (!template || template.notificationType !== type || !version ||
      version.lifecycle !== EmailTemplateVersionLifecycle.PUBLISHED) {
      return { composition: fallback, emailTemplateVersionId: null };
    }
    try {
      const compiled = compileEmailTemplate({ notificationType: type, subjectTemplate: version.subjectTemplate,
        textBodyTemplate: version.textBodyTemplate, placeholderContractVersion: version.placeholderContractVersion });
      const source = payload as Readonly<Record<string, unknown>>;
      const values = Object.fromEntries(catalog.allowedVariables.map((name) => {
        const value = source[name];
        if (value !== null && value !== undefined && typeof value !== 'string') {
          throw new EmailTemplateContractError('INVALID_TEMPLATE_VALUE');
        }
        return [name, value as string | null | undefined];
      }));
      const rendered = renderCompiledEmailTemplate(compiled, values);
      return {
        composition: { ...fallback, subject: rendered.subject, message: rendered.textBody },
        emailTemplateVersionId: version.id,
      };
    } catch (error) {
      if (!(error instanceof EmailTemplateContractError)) throw error;
      this.logger.warn(`Managed email template fallback type=${type} code=${error.code}`);
      return { composition: fallback, emailTemplateVersionId: null };
    }
  }
}

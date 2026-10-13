import { NotificationType } from '@prisma/client';
import { compileEmailTemplate } from './email-template.compiler';

export { EmailTemplateContractError as EmailTemplateValidationError } from './email-template.compiler';

export function validateEmailTemplateStructure(input: {
  notificationType: NotificationType;
  subjectTemplate: string;
  textBodyTemplate: string;
  placeholderContractVersion: number;
}) {
  const compiled = compileEmailTemplate(input);
  return { code: 'VALID' as const, placeholders: [...compiled.placeholders] };
}

import { NotificationType } from '@prisma/client';
import { findEmailTemplateCatalogEntry } from './email-template-catalog';

export const EMAIL_TEMPLATE_LIMITS = Object.freeze({
  subjectTemplate: 998,
  textBodyTemplate: 100_000,
  placeholderCount: 100,
  value: 10_000,
} as const);

type Segment = Readonly<{ kind: 'text'; value: string } | { kind: 'variable'; name: string }>;

export type CompiledEmailTemplate = Readonly<{
  notificationType: NotificationType;
  placeholderContractVersion: 1;
  subject: readonly Segment[];
  textBody: readonly Segment[];
  placeholders: readonly string[];
  allowedVariables: readonly string[];
  optionalVariables: readonly string[];
}>;

export class EmailTemplateContractError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'EmailTemplateContractError'; }
}

const forbiddenControl = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const invalidSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
const placeholderName = /^[A-Za-z][A-Za-z0-9]*$/;

function parse(value: string): { segments: readonly Segment[]; placeholders: readonly string[] } {
  const segments: Segment[] = [];
  const placeholders: string[] = [];
  let cursor = 0;
  let textStart = 0;
  while (cursor < value.length) {
    if (value[cursor] !== '{' && value[cursor] !== '}') { cursor += 1; continue; }
    if (value.slice(cursor, cursor + 2) !== '{{') throw new EmailTemplateContractError('MALFORMED_PLACEHOLDER');
    const close = value.indexOf('}}', cursor + 2);
    if (close < 0) throw new EmailTemplateContractError('MALFORMED_PLACEHOLDER');
    const name = value.slice(cursor + 2, close);
    if (!placeholderName.test(name) || name.includes('{') || name.includes('}')) {
      throw new EmailTemplateContractError('MALFORMED_PLACEHOLDER');
    }
    if (textStart < cursor) segments.push(Object.freeze({ kind: 'text', value: value.slice(textStart, cursor) }));
    segments.push(Object.freeze({ kind: 'variable', name }));
    placeholders.push(name);
    cursor = close + 2;
    textStart = cursor;
  }
  if (textStart < value.length) segments.push(Object.freeze({ kind: 'text', value: value.slice(textStart) }));
  return { segments: Object.freeze(segments), placeholders: Object.freeze(placeholders) };
}

export function compileEmailTemplate(input: {
  notificationType: NotificationType;
  subjectTemplate: string;
  textBodyTemplate: string;
  placeholderContractVersion: number;
}): CompiledEmailTemplate {
  const catalog = findEmailTemplateCatalogEntry(input.notificationType);
  if (!catalog) throw new EmailTemplateContractError('UNSUPPORTED_NOTIFICATION_TYPE');
  if (input.placeholderContractVersion !== 1 || input.placeholderContractVersion !== catalog.placeholderContractVersion) {
    throw new EmailTemplateContractError('UNSUPPORTED_PLACEHOLDER_CONTRACT');
  }
  if (!input.subjectTemplate.trim() || input.subjectTemplate.length > EMAIL_TEMPLATE_LIMITS.subjectTemplate || /[\r\n]/.test(input.subjectTemplate)) {
    throw new EmailTemplateContractError('INVALID_SUBJECT');
  }
  if (!input.textBodyTemplate.trim() || input.textBodyTemplate.length > EMAIL_TEMPLATE_LIMITS.textBodyTemplate) {
    throw new EmailTemplateContractError('INVALID_TEXT_BODY');
  }
  const combined = `${input.subjectTemplate}\n${input.textBodyTemplate}`;
  if (forbiddenControl.test(combined) || invalidSurrogate.test(combined)) {
    throw new EmailTemplateContractError('FORBIDDEN_CONTROL_CHARACTER');
  }
  if (combined.includes('<') || combined.includes('>')) throw new EmailTemplateContractError('HTML_NOT_ALLOWED');
  const subject = parse(input.subjectTemplate);
  const textBody = parse(input.textBodyTemplate);
  const occurrences = [...subject.placeholders, ...textBody.placeholders];
  if (occurrences.length > EMAIL_TEMPLATE_LIMITS.placeholderCount) {
    throw new EmailTemplateContractError('TOO_MANY_PLACEHOLDERS');
  }
  const allowed = new Set<string>(catalog.allowedVariables);
  if (occurrences.some((name) => !allowed.has(name))) throw new EmailTemplateContractError('UNAPPROVED_PLACEHOLDER');
  return Object.freeze({
    notificationType: input.notificationType,
    placeholderContractVersion: 1,
    subject: subject.segments,
    textBody: textBody.segments,
    placeholders: Object.freeze([...new Set(occurrences)].sort()),
    allowedVariables: catalog.allowedVariables,
    optionalVariables: catalog.optionalVariables,
  });
}

function renderSegments(segments: readonly Segment[], values: Readonly<Record<string, string | null | undefined>>,
  optional: ReadonlySet<string>, subject: boolean): string {
  return segments.map((segment) => {
    if (segment.kind === 'text') return segment.value;
    const value = values[segment.name];
    if (value === null || value === undefined) {
      if (optional.has(segment.name)) return '';
      throw new EmailTemplateContractError('MISSING_REQUIRED_VALUE');
    }
    if (typeof value !== 'string' || value.length > EMAIL_TEMPLATE_LIMITS.value || forbiddenControl.test(value) || invalidSurrogate.test(value)) {
      throw new EmailTemplateContractError('INVALID_TEMPLATE_VALUE');
    }
    const normalized = value.replace(/\r\n?/g, '\n');
    if (subject && normalized.includes('\n')) throw new EmailTemplateContractError('INVALID_SUBJECT_VALUE');
    return normalized;
  }).join('');
}

export function renderCompiledEmailTemplate(compiled: CompiledEmailTemplate,
  values: Readonly<Record<string, string | null | undefined>>) {
  const allowed = new Set(compiled.allowedVariables);
  if (Object.keys(values).some((name) => !allowed.has(name))) throw new EmailTemplateContractError('UNAPPROVED_VALUE');
  const optional = new Set(compiled.optionalVariables);
  const subject = renderSegments(compiled.subject, values, optional, true);
  const textBody = renderSegments(compiled.textBody, values, optional, false);
  if (!subject.trim() || subject.length > EMAIL_TEMPLATE_LIMITS.subjectTemplate) {
    throw new EmailTemplateContractError('RENDERED_SUBJECT_OUT_OF_BOUNDS');
  }
  if (!textBody.trim() || textBody.length > EMAIL_TEMPLATE_LIMITS.textBodyTemplate) {
    throw new EmailTemplateContractError('RENDERED_TEXT_BODY_OUT_OF_BOUNDS');
  }
  return Object.freeze({ subject, textBody });
}

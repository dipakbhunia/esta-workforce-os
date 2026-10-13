import { isEmail } from 'class-validator';
import { isIP } from 'node:net';

export enum SmtpSecurityModeInput {
  IMPLICIT_TLS = 'IMPLICIT_TLS',
  STARTTLS = 'STARTTLS',
}

export interface SmtpConfigurationInput {
  host: string;
  port: number;
  securityMode: SmtpSecurityModeInput;
  username: string;
  password: string;
  senderEmail: string;
  senderDisplayName: string;
}

const INPUT_FIELDS = ['host', 'password', 'port', 'securityMode', 'senderDisplayName', 'senderEmail', 'username'] as const;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class SmtpConfigurationValidationError extends Error {
  constructor(readonly code: string) {
    super('SMTP configuration is invalid');
  }
}

export function validateAndNormalizeSmtpConfiguration(input: unknown): SmtpConfigurationInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('INVALID_OBJECT');
  const record = input as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== [...INPUT_FIELDS].sort().join(',')) throw invalid('UNKNOWN_OR_MISSING_FIELD');

  const host = normalizedHost(record.host);
  const port = record.port;
  const securityMode = record.securityMode;
  const username = boundedString(record.username, 1, 320, 'INVALID_USERNAME');
  const password = boundedString(record.password, 8, 4096, 'INVALID_PASSWORD', false);
  const senderEmail = boundedString(record.senderEmail, 3, 320, 'INVALID_SENDER_EMAIL').toLowerCase();
  const senderDisplayName = boundedString(record.senderDisplayName, 1, 160, 'INVALID_SENDER_NAME');

  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) throw invalid('INVALID_PORT');
  if (!Object.values(SmtpSecurityModeInput).includes(securityMode as SmtpSecurityModeInput)) throw invalid('INVALID_SECURITY_MODE');
  if ((securityMode === SmtpSecurityModeInput.IMPLICIT_TLS && port !== 465)
    || (securityMode === SmtpSecurityModeInput.STARTTLS && port !== 587)) throw invalid('INVALID_SECURITY_PORT_COMBINATION');
  if (!isEmail(senderEmail, { allow_display_name: false, require_tld: true })) throw invalid('INVALID_SENDER_EMAIL');

  return { host, port: port as number, securityMode: securityMode as SmtpSecurityModeInput, username, password, senderEmail, senderDisplayName };
}

function normalizedHost(value: unknown): string {
  const host = boundedString(value, 1, 253, 'INVALID_HOST').toLowerCase();
  if (host.includes('://') || host.includes('@') || /[/:?#\[\]\\]/.test(host)) throw invalid('INVALID_HOST');
  const normalized = host.endsWith('.') ? host.slice(0, -1) : host;
  const labels = normalized.split('.');
  if (!normalized || isIP(normalized) !== 0 || labels.some((label) => !HOST_LABEL.test(label))) throw invalid('INVALID_HOST');
  return normalized;
}

function boundedString(value: unknown, minimum: number, maximum: number, code: string, trim = true): string {
  if (typeof value !== 'string') throw invalid(code);
  const normalized = trim ? value.trim() : value;
  if (normalized.length < minimum || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) throw invalid(code);
  return normalized;
}

function invalid(code: string): SmtpConfigurationValidationError {
  return new SmtpConfigurationValidationError(code);
}

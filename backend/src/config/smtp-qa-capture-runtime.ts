import { X509Certificate } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export const QA_SMTP_CAPTURE_HOSTNAME = 'smtp-capture.qa.invalid';
export const QA_SMTP_CAPTURE_ADDRESS = '127.0.0.1';
export const QA_SMTP_CAPTURE_PORT = 587;
export const QA_SMTP_DATABASE_HOST = '127.0.0.1';
export const QA_SMTP_DATABASE_PORT = '55432';
export const QA_SMTP_DATABASE_NAME = 'esta_qa_p13b2a_20261023_131805';

export type QaCaptureConfigurationError =
  | 'QA_CAPTURE_FORBIDDEN_IN_PRODUCTION'
  | 'QA_CAPTURE_DATABASE_MISMATCH'
  | 'QA_CAPTURE_GATE_CONFLICT'
  | 'QA_CAPTURE_DESTINATION_MISMATCH'
  | 'QA_CAPTURE_LEGACY_SMTP_CONFLICT'
  | 'QA_CAPTURE_CA_MISSING'
  | 'QA_CAPTURE_CA_INVALID'
  | 'QA_CAPTURE_SETTINGS_WITHOUT_ENABLEMENT';

export type QaSmtpCaptureRuntime =
  | { error: QaCaptureConfigurationError; trustedCa: null }
  | { error: null; trustedCa: Buffer | null };

interface QaCaptureCertificate {
  readonly ca: boolean;
  readonly validFrom: string;
  readonly validTo: string;
}

interface QaCaptureFileAccess {
  read(path: string): Buffer;
  stat(path: string): { isFile(): boolean };
  parse(bytes: Buffer): QaCaptureCertificate;
  now(): number;
}

const defaultFileAccess: QaCaptureFileAccess = {
  read: (path) => readFileSync(path),
  stat: (path) => statSync(path),
  parse: (bytes) => new X509Certificate(bytes),
  now: () => Date.now(),
};

const enabled = (value: unknown) => value === true || value === 'true';
const configured = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function qaSmtpCaptureConfigurationError(
  environment: Readonly<Record<string, unknown>>,
): QaCaptureConfigurationError | null {
  return loadQaSmtpCaptureRuntime(environment).error;
}

export function loadQaSmtpCaptureRuntime(
  environment: Readonly<Record<string, unknown>>,
  fileAccess: QaCaptureFileAccess = defaultFileAccess,
): QaSmtpCaptureRuntime {
  const qaEnabled = enabled(environment.SMTP_QA_CAPTURE_ENABLED);
  const qaSettingsConfigured = [
    environment.SMTP_QA_CAPTURE_TRUSTED_CA_PATH,
    environment.SMTP_QA_CAPTURE_HOSTNAME,
    environment.SMTP_QA_CAPTURE_ADDRESS,
    environment.SMTP_QA_CAPTURE_PORT,
  ].some((value) => value !== undefined && value !== null && String(value).trim().length > 0);
  if (!qaEnabled) {
    if (qaSettingsConfigured) return failure('QA_CAPTURE_SETTINGS_WITHOUT_ENABLEMENT');
    return { error: null, trustedCa: null };
  }
  if (environment.NODE_ENV === 'production') return failure('QA_CAPTURE_FORBIDDEN_IN_PRODUCTION');
  if (!databaseMatches(environment.DATABASE_URL)) return failure('QA_CAPTURE_DATABASE_MISMATCH');
  if (enabled(environment.EMAIL_NOTIFICATIONS_ENABLED)
    || enabled(environment.SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED)
    || enabled(environment.SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED)) {
    return failure('QA_CAPTURE_GATE_CONFLICT');
  }
  const allowlist = String(environment.SMTP_TEST_ALLOWED_HOSTS ?? '').trim().toLowerCase().replace(/\.$/, '');
  const captureHostname = String(environment.SMTP_QA_CAPTURE_HOSTNAME ?? '').trim().toLowerCase().replace(/\.$/, '');
  const captureAddress = String(environment.SMTP_QA_CAPTURE_ADDRESS ?? '').trim();
  const capturePort = Number(environment.SMTP_QA_CAPTURE_PORT);
  if (allowlist !== QA_SMTP_CAPTURE_HOSTNAME || captureHostname !== QA_SMTP_CAPTURE_HOSTNAME
    || captureAddress !== QA_SMTP_CAPTURE_ADDRESS || capturePort !== QA_SMTP_CAPTURE_PORT) {
    return failure('QA_CAPTURE_DESTINATION_MISMATCH');
  }
  if (configured(environment.SMTP_HOST) || configured(environment.SMTP_USER)
    || configured(environment.SMTP_PASSWORD) || configured(environment.SMTP_FROM_EMAIL)) {
    return failure('QA_CAPTURE_LEGACY_SMTP_CONFLICT');
  }
  const caPath = String(environment.SMTP_QA_CAPTURE_TRUSTED_CA_PATH ?? '').trim();
  const nodeCaPath = String(environment.NODE_EXTRA_CA_CERTS ?? '').trim();
  if (!caPath || !nodeCaPath || !isAbsolute(caPath) || resolve(caPath) !== resolve(nodeCaPath)) {
    return failure('QA_CAPTURE_CA_MISSING');
  }
  try {
    if (!fileAccess.stat(caPath).isFile()) return failure('QA_CAPTURE_CA_INVALID');
    const trustedCa = fileAccess.read(caPath);
    if (!trustedCa.length) return failure('QA_CAPTURE_CA_INVALID');
    const certificate = fileAccess.parse(trustedCa);
    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);
    const now = fileAccess.now();
    if (!certificate.ca || !Number.isFinite(validFrom) || !Number.isFinite(validTo)
      || now < validFrom || now > validTo) return failure('QA_CAPTURE_CA_INVALID');
    return { error: null, trustedCa: Buffer.from(trustedCa) };
  } catch {
    return failure('QA_CAPTURE_CA_INVALID');
  }
}

function failure(error: QaCaptureConfigurationError): QaSmtpCaptureRuntime {
  return { error, trustedCa: null };
}

function databaseMatches(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && url.hostname === QA_SMTP_DATABASE_HOST
      && (url.port || '5432') === QA_SMTP_DATABASE_PORT
      && databaseName === QA_SMTP_DATABASE_NAME;
  } catch {
    return false;
  }
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface AccountActionTokenMaterial {
  id: string;
  purpose: string;
  userId: string;
  expiresAt: Date;
}

export interface EmailVerificationTokenMaterial extends AccountActionTokenMaterial {
  purpose: 'EMAIL_VERIFICATION';
  companyId: string | null;
  targetEmail: string;
  emailRevision: number;
}

function signaturePayload(value: AccountActionTokenMaterial): string {
  return `${value.id}:${value.purpose}:${value.userId}:${value.expiresAt.toISOString()}`;
}

export function buildAccountActionToken(value: AccountActionTokenMaterial, secret: string): string {
  const signature = createHmac('sha256', secret).update(signaturePayload(value)).digest('base64url');
  return `${value.id}.${signature}`;
}

export function hashAccountActionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAccountActionTokenSignature(
  token: string,
  value: AccountActionTokenMaterial,
  secret: string,
): boolean {
  const expected = buildAccountActionToken(value, secret);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function emailVerificationSignaturePayload(value: EmailVerificationTokenMaterial): string {
  return [
    'v1', value.id, value.purpose, value.userId, value.companyId ?? 'PLATFORM',
    value.targetEmail, String(value.emailRevision), value.expiresAt.toISOString(),
  ].join(':');
}

function assertEmailVerificationMaterial(value: EmailVerificationTokenMaterial): void {
  if (
    value.purpose !== 'EMAIL_VERIFICATION' ||
    !Number.isInteger(value.emailRevision) ||
    value.emailRevision < 0 ||
    value.targetEmail !== value.targetEmail.trim().toLowerCase() ||
    value.targetEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.targetEmail) ||
    Number.isNaN(value.expiresAt.getTime())
  ) throw new Error('Email verification token material is invalid');
}

export function buildEmailVerificationToken(value: EmailVerificationTokenMaterial, secret: string): string {
  assertEmailVerificationMaterial(value);
  const signature = createHmac('sha256', secret).update(emailVerificationSignaturePayload(value)).digest('base64url');
  return `${value.id}.${signature}`;
}

export function verifyEmailVerificationTokenSignature(
  token: string,
  value: EmailVerificationTokenMaterial,
  secret: string,
): boolean {
  try {
    const expected = buildEmailVerificationToken(value, secret);
    const actualBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  } catch { return false; }
}

export function accountActionTokenId(token: string): string | null {
  if (token.length > 256) return null;
  const separator = token.indexOf('.');
  const id = separator > 0 ? token.slice(0, separator) : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

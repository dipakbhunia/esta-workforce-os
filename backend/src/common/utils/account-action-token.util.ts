import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface AccountActionTokenMaterial {
  id: string;
  purpose: string;
  userId: string;
  expiresAt: Date;
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

export function accountActionTokenId(token: string): string | null {
  if (token.length > 256) return null;
  const separator = token.indexOf('.');
  const id = separator > 0 ? token.slice(0, separator) : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

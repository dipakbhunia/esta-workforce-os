import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_VERSION = 1;

interface CredentialEnvelope {
  v: 1;
  alg: 'A256GCM';
  iv: string;
  tag: string;
  ciphertext: string;
}

const ENVELOPE_FIELDS = ['alg', 'ciphertext', 'iv', 'tag', 'v'] as const;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function decodeCanonicalBase64Url(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== 'string' || !value || !BASE64URL_PATTERN.test(value)) {
    throw new Error('Malformed credential envelope encoding');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value || (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new Error('Malformed credential envelope encoding');
  }
  return decoded;
}

function parseEnvelope(payload: Uint8Array): { envelope: CredentialEnvelope; iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const parsed: unknown = JSON.parse(Buffer.from(payload).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Malformed credential envelope');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== [...ENVELOPE_FIELDS].sort().join(',')) {
    throw new Error('Malformed credential envelope');
  }
  if (record.v !== ENVELOPE_VERSION || record.alg !== 'A256GCM') throw new Error('Unsupported credential envelope');
  const iv = decodeCanonicalBase64Url(record.iv, 12);
  const tag = decodeCanonicalBase64Url(record.tag, 16);
  const ciphertext = decodeCanonicalBase64Url(record.ciphertext);
  if (!ciphertext.length) throw new Error('Malformed credential envelope');
  return { envelope: record as unknown as CredentialEnvelope, iv, tag, ciphertext };
}

@Injectable()
export class CredentialEncryptionService {
  constructor(private readonly config: ConfigService) {}

  encryptionKeyVersion(): string {
    const version = this.config.get<string>('PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION')?.trim();
    if (!version) throw new ServiceUnavailableException('Payment credential encryption is not configured');
    return version;
  }

  encrypt(value: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> {
    const key = this.key();
    const keyVersion = this.encryptionKeyVersion();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(`esta:payment-credential:${keyVersion}:v${ENVELOPE_VERSION}`, 'utf8'));
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope: CredentialEnvelope = {
      v: ENVELOPE_VERSION,
      alg: 'A256GCM',
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    };
    plaintext.fill(0);
    return Uint8Array.from(Buffer.from(JSON.stringify(envelope), 'utf8'));
  }

  decrypt(payload: Uint8Array, storedKeyVersion: string): Record<string, string> {
    try {
      if (storedKeyVersion !== this.encryptionKeyVersion()) throw new Error('Unsupported encryption key version');
      const { envelope, iv, tag, ciphertext } = parseEnvelope(payload);
      const decipher = createDecipheriv(ALGORITHM, this.key(), iv);
      decipher.setAAD(Buffer.from(`esta:payment-credential:${storedKeyVersion}:v${envelope.v}`, 'utf8'));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      const value = JSON.parse(plaintext.toString('utf8')) as Record<string, string>;
      plaintext.fill(0);
      return value;
    } catch {
      throw new ServiceUnavailableException('Payment credential decryption failed');
    }
  }

  fingerprint(provider: string, mode: string, value: Readonly<Record<string, string>>): string {
    const canonical = JSON.stringify({ provider, mode, entries: Object.entries(value).sort(([a], [b]) => a.localeCompare(b)) });
    return createHmac('sha256', this.key()).update(canonical).digest('hex');
  }

  private key(): Buffer {
    const encoded = this.config.get<string>('PAYMENT_CREDENTIAL_ENCRYPTION_KEY')?.trim();
    if (!encoded) throw new ServiceUnavailableException('Payment credential encryption is not configured');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new ServiceUnavailableException('Payment credential encryption key is invalid');
    return key;
  }
}

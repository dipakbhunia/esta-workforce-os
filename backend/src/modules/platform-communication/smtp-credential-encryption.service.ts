import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_VERSION = 1;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const ENVELOPE_FIELDS = ['alg', 'ciphertext', 'iv', 'tag', 'v'] as const;

interface SmtpCredentialEnvelope {
  v: 1;
  alg: 'A256GCM';
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface EncryptedSmtpCredential {
  encryptedPassword: Uint8Array<ArrayBuffer>;
  encryptionKeyId: string;
}

function decodeCanonicalBase64(value: unknown): Buffer {
  if (typeof value !== 'string' || !BASE64_PATTERN.test(value)) throw new Error('Invalid key encoding');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== value) throw new Error('Invalid key encoding');
  return decoded;
}

function decodeCanonicalBase64Url(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== 'string' || !value || !BASE64URL_PATTERN.test(value)) throw new Error('Invalid envelope encoding');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value || (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new Error('Invalid envelope encoding');
  }
  return decoded;
}

function parseEnvelope(payload: Uint8Array) {
  const parsed: unknown = JSON.parse(Buffer.from(payload).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid envelope');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== [...ENVELOPE_FIELDS].sort().join(',')) throw new Error('Invalid envelope');
  if (record.v !== ENVELOPE_VERSION || record.alg !== 'A256GCM') throw new Error('Unsupported envelope');
  return {
    envelope: record as unknown as SmtpCredentialEnvelope,
    iv: decodeCanonicalBase64Url(record.iv, 12),
    tag: decodeCanonicalBase64Url(record.tag, 16),
    ciphertext: decodeCanonicalBase64Url(record.ciphertext),
  };
}

@Injectable()
export class SmtpCredentialEncryptionService {
  constructor(private readonly config: ConfigService) {}

  encrypt(password: string, configurationVersionId: string): EncryptedSmtpCredential {
    const { currentKeyId, keys } = this.keyRing();
    const key = keys.get(currentKeyId);
    if (!key) throw this.unavailable();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(this.aad(configurationVersionId, currentKeyId));
    const plaintext = Buffer.from(password, 'utf8');
    try {
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const envelope: SmtpCredentialEnvelope = {
        v: ENVELOPE_VERSION,
        alg: 'A256GCM',
        iv: iv.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
      };
      return {
        encryptedPassword: Uint8Array.from(Buffer.from(JSON.stringify(envelope), 'utf8')),
        encryptionKeyId: currentKeyId,
      };
    } finally {
      plaintext.fill(0);
    }
  }

  decrypt(payload: Uint8Array, configurationVersionId: string, encryptionKeyId: string): string {
    try {
      const { keys } = this.keyRing();
      const key = keys.get(encryptionKeyId);
      if (!key) throw new Error('Unknown key');
      const { envelope, iv, tag, ciphertext } = parseEnvelope(payload);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAAD(this.aad(configurationVersionId, encryptionKeyId, envelope.v));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      try {
        return plaintext.toString('utf8');
      } finally {
        plaintext.fill(0);
      }
    } catch {
      throw new ServiceUnavailableException('SMTP credential decryption failed');
    }
  }

  currentKeyId(): string {
    return this.keyRing().currentKeyId;
  }

  private keyRing(): { currentKeyId: string; keys: Map<string, Buffer> } {
    try {
      const currentKeyId = this.config.get<string>('SMTP_CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID')?.trim() ?? '';
      const serialized = this.config.get<string>('SMTP_CREDENTIAL_ENCRYPTION_KEYS')?.trim() ?? '';
      if (!currentKeyId || !serialized) throw new Error('Missing key ring');
      const parsed: unknown = JSON.parse(serialized);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid key ring');
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (!entries.length || entries.some(([id]) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id))) throw new Error('Invalid key IDs');
      const keys = new Map(entries.map(([id, value]) => [id, decodeCanonicalBase64(value)]));
      if (!keys.has(currentKeyId)) throw new Error('Current key unavailable');
      return { currentKeyId, keys };
    } catch {
      throw this.unavailable();
    }
  }

  private aad(configurationVersionId: string, keyId: string, envelopeVersion = ENVELOPE_VERSION): Buffer {
    return Buffer.from(`esta:smtp-credential:${configurationVersionId}:${keyId}:v${envelopeVersion}`, 'utf8');
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('SMTP credential encryption is unavailable');
  }
}

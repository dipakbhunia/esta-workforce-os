import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SmtpCredentialEncryptionService } from './smtp-credential-encryption.service';

const key = (byte: number) => Buffer.alloc(32, byte).toString('base64');
const configurationId = '00000000-0000-4000-8000-000000000001';

function service(currentKeyId = 'key-v2', keys: Record<string, string> = { 'key-v1': key(1), 'key-v2': key(2) }) {
  const values: Record<string, string> = {
    SMTP_CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID: currentKeyId,
    SMTP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify(keys),
  };
  return new SmtpCredentialEncryptionService({ get: (name: string) => values[name] } as never);
}

describe('SmtpCredentialEncryptionService', () => {
  it('round-trips with the current key without exposing plaintext', () => {
    const encrypted = service().encrypt('smtp-secret-value', configurationId);
    assert.equal(encrypted.encryptionKeyId, 'key-v2');
    assert.equal(Buffer.from(encrypted.encryptedPassword).includes(Buffer.from('smtp-secret-value')), false);
    assert.equal(service().decrypt(encrypted.encryptedPassword, configurationId, encrypted.encryptionKeyId), 'smtp-secret-value');
  });

  it('uses randomized ciphertext', () => {
    const first = service().encrypt('smtp-secret-value', configurationId);
    const second = service().encrypt('smtp-secret-value', configurationId);
    assert.notDeepEqual(first.encryptedPassword, second.encryptedPassword);
  });

  it('rejects authentication-tag tampering and corrupted envelopes safely', () => {
    const encrypted = service().encrypt('smtp-secret-value', configurationId);
    const envelope = JSON.parse(Buffer.from(encrypted.encryptedPassword).toString('utf8')) as { tag: string };
    envelope.tag = Buffer.alloc(16, 9).toString('base64url');
    for (const payload of [Buffer.from(JSON.stringify(envelope)), Buffer.from('{'), Buffer.from('{}')]) {
      assert.throws(() => service().decrypt(payload, configurationId, encrypted.encryptionKeyId), /SMTP credential decryption failed/);
    }
  });

  it('binds ciphertext to configuration version and key ID through AAD', () => {
    const encrypted = service().encrypt('smtp-secret-value', configurationId);
    assert.throws(() => service().decrypt(encrypted.encryptedPassword, '00000000-0000-4000-8000-000000000002', encrypted.encryptionKeyId));
    assert.throws(() => service().decrypt(encrypted.encryptedPassword, configurationId, 'key-v1'));
    assert.throws(() => service().decrypt(encrypted.encryptedPassword, configurationId, 'unknown-key'));
  });

  it('decrypts historical-key credentials after the current encrypting key changes', () => {
    const historical = service('key-v1').encrypt('old-secret-value', configurationId);
    assert.equal(service('key-v2').decrypt(historical.encryptedPassword, configurationId, historical.encryptionKeyId), 'old-secret-value');
  });

  it('fails closed for missing current keys, invalid key lengths, and malformed key rings', () => {
    const cases = [
      service('', {}),
      service('missing', { 'key-v1': key(1) }),
      service('key-v1', { 'key-v1': Buffer.alloc(31).toString('base64') }),
      new SmtpCredentialEncryptionService({ get: () => '{not-json' } as never),
    ];
    for (const instance of cases) assert.throws(() => instance.encrypt('smtp-secret-value', configurationId), /SMTP credential encryption is unavailable/);
  });

  it('never includes secret material in failures', () => {
    const secret = 'do-not-disclose-this-secret';
    const encrypted = service().encrypt(secret, configurationId);
    try {
      service('key-v2', { 'key-v2': key(7) }).decrypt(encrypted.encryptedPassword, configurationId, encrypted.encryptionKeyId);
      assert.fail('Expected decryption to fail');
    } catch (error) {
      assert.doesNotMatch(String(error), new RegExp(secret));
      assert.doesNotMatch(String(error), /[A-Za-z0-9+/]{40,}/);
    }
  });
});

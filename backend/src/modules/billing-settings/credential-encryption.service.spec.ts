import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { CredentialEncryptionService } from './credential-encryption.service';

const key = Buffer.alloc(32, 7).toString('base64');
const material = { keyId: 'rzp_test_public', keySecret: 'secret-value', webhookSecret: 'webhook-value' };
const service = (encoded = key, version = 'key-v1') => new CredentialEncryptionService({ get: (name: string) => name.endsWith('_KEY') ? encoded : version } as never);
const envelope = (payload: Uint8Array) => JSON.parse(Buffer.from(payload).toString('utf8')) as Record<string, unknown>;
const encoded = (value: Record<string, unknown>) => Uint8Array.from(Buffer.from(JSON.stringify(value)));

describe('CredentialEncryptionService', () => {
  it('round trips through an authenticated versioned envelope', () => {
    const encrypted = service().encrypt(material);
    assert.deepEqual(service().decrypt(encrypted, 'key-v1'), material);
    assert.equal(Buffer.from(encrypted).includes(Buffer.from('secret-value')), false);
  });

  it('uses a fresh nonce for identical plaintext', () => {
    assert.notDeepEqual(service().encrypt(material), service().encrypt(material));
  });

  it('fails closed for tampering, the wrong key, and wrong key version', () => {
    const encrypted = service().encrypt(material);
    const envelope = JSON.parse(Buffer.from(encrypted).toString('utf8')) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -1)}${envelope.ciphertext.endsWith('A') ? 'B' : 'A'}`;
    const tampered = Uint8Array.from(Buffer.from(JSON.stringify(envelope)));
    assert.throws(() => service().decrypt(tampered, 'key-v1'), ServiceUnavailableException);
    assert.throws(() => service(Buffer.alloc(32, 8).toString('base64')).decrypt(encrypted, 'key-v1'), ServiceUnavailableException);
    assert.throws(() => service().decrypt(encrypted, 'key-v2'), ServiceUnavailableException);
  });

  it('rejects invalid decoded key length', () => {
    assert.throws(() => service(Buffer.alloc(31).toString('base64')).encrypt(material), ServiceUnavailableException);
  });

  it('strictly rejects malformed JSON and envelope shapes before crypto', () => {
    const encrypted = service().encrypt(material);
    const valid = envelope(encrypted);
    assert.throws(() => service().decrypt(Buffer.from('{'), 'key-v1'), ServiceUnavailableException);
    assert.throws(() => service().decrypt(encoded({ ...valid, extra: 'value' }), 'key-v1'), ServiceUnavailableException);
    const { tag: _tag, ...missing } = valid;
    assert.throws(() => service().decrypt(encoded(missing), 'key-v1'), ServiceUnavailableException);
    assert.throws(() => service().decrypt(encoded({ ...valid, iv: 12 }), 'key-v1'), ServiceUnavailableException);
    assert.throws(() => service().decrypt(encoded({ ...valid, v: 2 }), 'key-v1'), ServiceUnavailableException);
    assert.throws(() => service().decrypt(encoded({ ...valid, alg: 'AES' }), 'key-v1'), ServiceUnavailableException);
  });

  it('rejects malformed, padded, and noncanonical base64url fields', () => {
    const valid = envelope(service().encrypt(material));
    for (const field of ['iv', 'tag', 'ciphertext'] as const) {
      assert.throws(() => service().decrypt(encoded({ ...valid, [field]: `${String(valid[field])}!` }), 'key-v1'), ServiceUnavailableException);
      assert.throws(() => service().decrypt(encoded({ ...valid, [field]: `${String(valid[field])}=` }), 'key-v1'), ServiceUnavailableException);
    }
  });

  it('rejects invalid IV and authentication-tag lengths', () => {
    const valid = envelope(service().encrypt(material));
    assert.throws(() => service().decrypt(encoded({ ...valid, iv: Buffer.alloc(11).toString('base64url') }), 'key-v1'), ServiceUnavailableException);
    assert.throws(() => service().decrypt(encoded({ ...valid, tag: Buffer.alloc(15).toString('base64url') }), 'key-v1'), ServiceUnavailableException);
  });

  it('creates a deterministic non-secret HMAC fingerprint', () => {
    const first = service().fingerprint('RAZORPAY', 'TEST', material);
    assert.equal(first, service().fingerprint('RAZORPAY', 'TEST', material));
    assert.equal(first.includes(material.keySecret), false);
  });
});

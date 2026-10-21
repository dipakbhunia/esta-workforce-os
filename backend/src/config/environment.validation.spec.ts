import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { environmentValidationSchema } from './environment.validation';

const base = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const validate = (payment: Record<string, unknown>) => environmentValidationSchema.validate({ ...base, ...payment }).error;

describe('payment credential environment validation', () => {
  it('accepts the optional pair absent and a valid configured pair', () => {
    assert.equal(validate({}), undefined);
    assert.equal(validate({ PAYMENT_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION: 'key-v1' }), undefined);
  });

  it('rejects wrong decoded key lengths and malformed encoding without exposing values', () => {
    for (const key of [Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'), '!!!!']) {
      const error = validate({ PAYMENT_CREDENTIAL_ENCRYPTION_KEY: key, PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION: 'key-v1' });
      assert.ok(error);
      assert.equal(error.message.includes(key), false);
    }
  });

  it('requires a nonblank complete key/version pair', () => {
    const key = Buffer.alloc(32).toString('base64');
    assert.ok(validate({ PAYMENT_CREDENTIAL_ENCRYPTION_KEY: key, PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION: '' }));
    assert.ok(validate({ PAYMENT_CREDENTIAL_ENCRYPTION_KEY: key }));
    assert.ok(validate({ PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION: 'key-v1' }));
  });
});

describe('SMTP credential environment validation', () => {
  it('accepts an optional versioned key ring and rejects unsafe or incomplete rings', () => {
    const first = Buffer.alloc(32, 1).toString('base64');
    const second = Buffer.alloc(32, 2).toString('base64');
    assert.equal(validate({
      SMTP_CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID: 'smtp-key-v2',
      SMTP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 'smtp-key-v1': first, 'smtp-key-v2': second }),
    }), undefined);
    for (const candidate of [
      { SMTP_CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID: 'smtp-key-v1' },
      { SMTP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 'smtp-key-v1': first }) },
      { SMTP_CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID: 'missing', SMTP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 'smtp-key-v1': first }) },
      { SMTP_CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID: 'smtp-key-v1', SMTP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 'smtp-key-v1': Buffer.alloc(31).toString('base64') }) },
      { SMTP_CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID: 'smtp-key-v1', SMTP_CREDENTIAL_ENCRYPTION_KEYS: '{not-json' },
    ]) assert.ok(validate(candidate));
  });
});

describe('SMTP test destination allowlist validation', () => {
  it('accepts exact hostnames and rejects wildcards, URLs, credentials, ports, and IP literals', () => {
    for (const value of ['', 'smtp.example.com', 'smtp.example.com,mail.example.net.']) {
      assert.equal(validate({ SMTP_TEST_ALLOWED_HOSTS: value }), undefined);
    }
    for (const value of ['*.example.com', 'smtp://example.com', 'user@example.com', 'example.com:587', '127.0.0.1', '[::1]']) {
      assert.ok(validate({ SMTP_TEST_ALLOWED_HOSTS: value }));
    }
  });
});

describe('SMTP email verification bootstrap gate validation', () => {
  it('defaults off and accepts only boolean-compatible values', () => {
    const absent = environmentValidationSchema.validate(base);
    assert.equal(absent.error, undefined);
    assert.equal(absent.value.SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED, false);
    assert.equal(environmentValidationSchema.validate({ ...base, SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: 'true' }).value
      .SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED, true);
    assert.ok(environmentValidationSchema.validate({ ...base, SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: 'sometimes' }).error);
  });
});

describe('SMTP platform invitation bootstrap gate validation', () => {
  it('defaults off and accepts only boolean-compatible values', () => {
    const absent = environmentValidationSchema.validate(base);
    assert.equal(absent.error, undefined);
    assert.equal(absent.value.SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED, false);
    assert.equal(environmentValidationSchema.validate({ ...base, SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED: 'true' }).value
      .SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED, true);
    assert.ok(environmentValidationSchema.validate({ ...base, SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED: 'sometimes' }).error);
  });
});

describe('public application origin validation', () => {
  it('requires an exact HTTPS origin in production', () => {
    assert.ok(validate({ NODE_ENV: 'production', PUBLIC_APP_ORIGIN: undefined }));
    assert.ok(validate({ NODE_ENV: 'production', PUBLIC_APP_ORIGIN: 'http://app.example.test' }));
    assert.equal(validate({ NODE_ENV: 'production', PUBLIC_APP_ORIGIN: 'https://app.example.test' }), undefined);
  });

  it('rejects credentials, paths, queries, fragments, and non-local development HTTP', () => {
    for (const origin of ['https://user:pass@app.example.test', 'https://app.example.test/path', 'https://app.example.test?x=1', 'https://app.example.test/#fragment', 'http://app.example.test']) {
      assert.ok(validate({ PUBLIC_APP_ORIGIN: origin }), origin);
    }
    assert.equal(validate({ PUBLIC_APP_ORIGIN: 'http://localhost:5173' }), undefined);
    assert.equal(validate({ NODE_ENV: 'test', PUBLIC_APP_ORIGIN: undefined }), undefined);
  });
});

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { describe, it } from 'node:test';
import { environmentValidationSchema } from './environment.validation';
import { QA_BROWSER_ACCEPTANCE_RUNTIME } from './qa-browser-acceptance-scheduler.runtime';

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

describe('QA SMTP capture environment fencing', () => {
  const withCa = (run: (path: string) => void) => {
    const directory = mkdtempSync(join(tmpdir(), 'esta-qa-smtp-ca-'));
    const path = join(directory, 'qa-ca.pem');
    writeFileSync(path, rootCertificates[0], { encoding: 'utf8', mode: 0o600 });
    try { run(path); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
  const qa = (path: string) => ({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://qa:secret@127.0.0.1:55432/esta_qa_p13b2a_20261023_131805',
    SMTP_QA_CAPTURE_ENABLED: true,
    SMTP_QA_CAPTURE_TRUSTED_CA_PATH: path,
    NODE_EXTRA_CA_CERTS: path,
    SMTP_QA_CAPTURE_HOSTNAME: 'smtp-capture.qa.invalid',
    SMTP_QA_CAPTURE_ADDRESS: '127.0.0.1',
    SMTP_QA_CAPTURE_PORT: 587,
    SMTP_TEST_ALLOWED_HOSTS: 'smtp-capture.qa.invalid',
    EMAIL_NOTIFICATIONS_ENABLED: false,
    SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED: false,
    SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: false,
  });

  it('is disabled by default and accepts only the exact fenced QA runtime', () => {
    assert.equal(environmentValidationSchema.validate(base).value.SMTP_QA_CAPTURE_ENABLED, false);
    withCa((path) => assert.equal(validate(qa(path)), undefined));
  });

  it('rejects production, protected or mismatched databases, gate conflicts, and inherited SMTP', () => withCa((path) => {
    const valid = qa(path);
    for (const change of [
      { NODE_ENV: 'production', PUBLIC_APP_ORIGIN: 'https://app.example.test' },
      { DATABASE_URL: 'postgresql://qa:secret@127.0.0.1:5432/esta_workforce' },
      { DATABASE_URL: 'postgresql://qa:secret@localhost:55432/esta_qa_p13b2a_20261023_131805' },
      { DATABASE_URL: 'postgresql://qa:secret@127.0.0.1:55433/esta_qa_p13b2a_20261023_131805' },
      { DATABASE_URL: 'postgresql://qa:secret@127.0.0.1:55432/other_qa' },
      { EMAIL_NOTIFICATIONS_ENABLED: true },
      { SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED: true },
      { SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: true },
      { SMTP_TEST_ALLOWED_HOSTS: 'mail.estaproject.com' },
      { SMTP_QA_CAPTURE_HOSTNAME: 'mail.estaproject.com' },
      { SMTP_QA_CAPTURE_ADDRESS: '10.0.0.10' },
      { SMTP_QA_CAPTURE_PORT: 465 },
      { SMTP_HOST: 'mail.estaproject.com' },
      { SMTP_USER: 'inherited-user' },
      { SMTP_PASSWORD: 'inherited-secret' },
      { SMTP_FROM_EMAIL: 'sender@example.test' },
    ]) assert.ok(validate({ ...valid, ...change }));
  }));

  it('rejects inherited QA-only settings while the explicit QA mode is disabled', () => {
    for (const setting of [
      { SMTP_QA_CAPTURE_HOSTNAME: 'smtp-capture.qa.invalid' },
      { SMTP_QA_CAPTURE_ADDRESS: '127.0.0.1' },
      { SMTP_QA_CAPTURE_PORT: 587 },
    ]) assert.ok(validate(setting));
  });

  it('requires the same absolute valid CA for both the boundary and Node trust store', () => withCa((path) => {
    const valid = qa(path);
    for (const change of [
      { SMTP_QA_CAPTURE_TRUSTED_CA_PATH: '' },
      { NODE_EXTRA_CA_CERTS: '' },
      { NODE_EXTRA_CA_CERTS: join(tmpdir(), 'different.pem') },
      { SMTP_QA_CAPTURE_TRUSTED_CA_PATH: 'relative.pem', NODE_EXTRA_CA_CERTS: 'relative.pem' },
    ]) assert.ok(validate({ ...valid, ...change }));
    assert.ok(validate({ SMTP_QA_CAPTURE_TRUSTED_CA_PATH: path }));
  }));
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

describe('QA browser acceptance scheduler suppression fencing', () => {
  const approved = {
    NODE_ENV: 'test',
    DATABASE_URL: `postgresql://${QA_BROWSER_ACCEPTANCE_RUNTIME.databaseUser}:qa-password@${QA_BROWSER_ACCEPTANCE_RUNTIME.databaseHost}:${QA_BROWSER_ACCEPTANCE_RUNTIME.databasePort}/${QA_BROWSER_ACCEPTANCE_RUNTIME.databaseName}`,
    PUBLIC_APP_ORIGIN: QA_BROWSER_ACCEPTANCE_RUNTIME.publicAppOrigin,
    QA_BROWSER_ACCEPTANCE_SCHEDULERS_DISABLED: true,
    QA_BROWSER_ACCEPTANCE_AUTHORIZATION: QA_BROWSER_ACCEPTANCE_RUNTIME.authorization,
    QA_BROWSER_ACCEPTANCE_DATABASE_ENDPOINT: QA_BROWSER_ACCEPTANCE_RUNTIME.databaseEndpoint,
    QA_BROWSER_ACCEPTANCE_DATABASE_CONTAINER_ID: QA_BROWSER_ACCEPTANCE_RUNTIME.databaseContainerId,
    QA_BROWSER_ACCEPTANCE_DATABASE_NETWORK_ID: QA_BROWSER_ACCEPTANCE_RUNTIME.databaseNetworkId,
    QA_BROWSER_ACCEPTANCE_DATABASE_SYSTEM_IDENTIFIER: QA_BROWSER_ACCEPTANCE_RUNTIME.databaseSystemIdentifier,
    EMAIL_NOTIFICATIONS_ENABLED: false,
    SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED: false,
    SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: false,
    SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED: false,
    SMTP_QA_CAPTURE_ENABLED: false,
  };

  it('defaults to normal scheduler execution and accepts only the exact approved QA attestation', () => {
    const absent = environmentValidationSchema.validate(base);
    assert.equal(absent.error, undefined);
    assert.equal(absent.value.QA_BROWSER_ACCEPTANCE_SCHEDULERS_DISABLED, false);
    assert.equal(validate(approved), undefined);
  });

  it('rejects production, protected or mismatched database identities, and malformed authorization', () => {
    for (const change of [
      { NODE_ENV: 'production', PUBLIC_APP_ORIGIN: 'https://app.example.test' },
      { DATABASE_URL: 'postgresql://esta_sac24_qa2b_app:qa-password@esta-sac24-qa2b-pg-20261029:5432/esta_workforce' },
      { DATABASE_URL: `postgresql://wrong-user:qa-password@${QA_BROWSER_ACCEPTANCE_RUNTIME.databaseHost}:5432/${QA_BROWSER_ACCEPTANCE_RUNTIME.databaseName}` },
      { DATABASE_URL: `postgresql://${QA_BROWSER_ACCEPTANCE_RUNTIME.databaseUser}:qa-password@127.0.0.1:55449/${QA_BROWSER_ACCEPTANCE_RUNTIME.databaseName}` },
      { DATABASE_URL: 'not-a-database-url' },
      { QA_BROWSER_ACCEPTANCE_AUTHORIZATION: '' },
      { QA_BROWSER_ACCEPTANCE_AUTHORIZATION: 'wrong-checkpoint' },
      { QA_BROWSER_ACCEPTANCE_DATABASE_ENDPOINT: 'other:5432' },
      { QA_BROWSER_ACCEPTANCE_DATABASE_CONTAINER_ID: '0'.repeat(64) },
      { QA_BROWSER_ACCEPTANCE_DATABASE_NETWORK_ID: '0'.repeat(64) },
      { QA_BROWSER_ACCEPTANCE_DATABASE_SYSTEM_IDENTIFIER: '0'.repeat(19) },
      { PUBLIC_APP_ORIGIN: 'http://127.0.0.1:5175' },
    ]) assert.ok(validate({ ...approved, ...change }));
    for (const key of [
      'QA_BROWSER_ACCEPTANCE_AUTHORIZATION',
      'QA_BROWSER_ACCEPTANCE_DATABASE_ENDPOINT',
      'QA_BROWSER_ACCEPTANCE_DATABASE_CONTAINER_ID',
      'QA_BROWSER_ACCEPTANCE_DATABASE_NETWORK_ID',
      'QA_BROWSER_ACCEPTANCE_DATABASE_SYSTEM_IDENTIFIER',
    ]) assert.ok(validate({ ...approved, [key]: undefined }));
  });

  it('rejects enabled email authority and inherited SMTP or payment configuration', () => {
    for (const change of [
      { EMAIL_NOTIFICATIONS_ENABLED: true },
      { SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED: true },
      { SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: true },
      { SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED: true },
      { SMTP_QA_CAPTURE_ENABLED: true },
      { SMTP_HOST: 'mail.example.test' },
      { SMTP_USER: 'inherited-user' },
      { SMTP_PASSWORD: 'inherited-password' },
      { SMTP_FROM_EMAIL: 'sender@example.test' },
      { PAYMENT_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION: 'production-key' },
    ]) assert.ok(validate({ ...approved, ...change }));
  });

  it('rejects authorization attestation settings when suppression is not enabled', () => {
    for (const key of [
      'QA_BROWSER_ACCEPTANCE_AUTHORIZATION',
      'QA_BROWSER_ACCEPTANCE_DATABASE_ENDPOINT',
      'QA_BROWSER_ACCEPTANCE_DATABASE_CONTAINER_ID',
      'QA_BROWSER_ACCEPTANCE_DATABASE_NETWORK_ID',
      'QA_BROWSER_ACCEPTANCE_DATABASE_SYSTEM_IDENTIFIER',
    ]) assert.ok(validate({ [key]: approved[key as keyof typeof approved] }));
  });
});

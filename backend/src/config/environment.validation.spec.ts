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

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { accountActionTokenId, buildAccountActionToken, buildEmailVerificationToken, hashAccountActionToken, verifyAccountActionTokenSignature, verifyEmailVerificationTokenSignature } from './account-action-token.util';

describe('account action token cryptography', () => {
  it('builds deterministic signed bearer material while persisting only its lookup hash', () => {
    const material = { id: randomUUID(), purpose: 'INVITATION', userId: randomUUID(), expiresAt: new Date('2030-01-01T00:00:00.000Z') };
    const secret = 'test-only-secret-with-at-least-32-characters';
    const token = buildAccountActionToken(material, secret);
    assert.equal(accountActionTokenId(token), material.id);
    assert.equal(verifyAccountActionTokenSignature(token, material, secret), true);
    assert.equal(verifyAccountActionTokenSignature(`${token}x`, material, secret), false);
    assert.match(hashAccountActionToken(token), /^[a-f0-9]{64}$/);
    assert.equal(hashAccountActionToken(token).includes(token), false);
  });

  it('rejects malformed and oversized bearer values before database lookup', () => {
    assert.equal(accountActionTokenId('not-a-token'), null);
    assert.equal(accountActionTokenId('x'.repeat(257)), null);
  });

  it('binds email-verification signatures to user, tenant, exact address, revision, and expiry', () => {
    const material = { id: randomUUID(), purpose: 'EMAIL_VERIFICATION' as const, userId: randomUUID(),
      companyId: null, targetEmail: 'admin@example.test', emailRevision: 4,
      expiresAt: new Date('2030-01-01T00:00:00.000Z') };
    const secret = 'test-only-secret-with-at-least-32-characters';
    const token = buildEmailVerificationToken(material, secret);
    assert.equal(accountActionTokenId(token), material.id);
    assert.equal(verifyEmailVerificationTokenSignature(token, material, secret), true);
    for (const changed of [
      { ...material, userId: randomUUID() },
      { ...material, companyId: randomUUID() },
      { ...material, targetEmail: 'other@example.test' },
      { ...material, emailRevision: 5 },
      { ...material, expiresAt: new Date('2030-01-02T00:00:00.000Z') },
    ]) assert.equal(verifyEmailVerificationTokenSignature(token, changed, secret), false);
    assert.equal(verifyEmailVerificationTokenSignature(`${token}x`, material, secret), false);
    assert.throws(() => buildEmailVerificationToken({ ...material, targetEmail: 'ADMIN@example.test' }, secret));
    assert.throws(() => buildEmailVerificationToken({ ...material, targetEmail: 'invalid' }, secret));
    assert.throws(() => buildEmailVerificationToken({ ...material, emailRevision: -1 }, secret));
    assert.equal(verifyEmailVerificationTokenSignature(token, { ...material, emailRevision: -1 }, secret), false);
    assert.match(hashAccountActionToken(token), /^[a-f0-9]{64}$/);
    assert.equal(hashAccountActionToken(token).includes(token), false);
  });
});

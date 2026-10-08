import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { accountActionTokenId, buildAccountActionToken, hashAccountActionToken, verifyAccountActionTokenSignature } from './account-action-token.util';

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
});

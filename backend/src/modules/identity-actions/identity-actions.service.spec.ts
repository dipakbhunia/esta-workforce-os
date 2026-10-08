import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { AccountActionTokenPurpose } from '@prisma/client';
import { buildAccountActionToken, hashAccountActionToken } from '../../common/utils/account-action-token.util';
import { IdentityActionsService } from './identity-actions.service';

const secret = 'test-only-secret-with-at-least-32-characters';

function fixture() {
  const userId = randomUUID(); const tokenId = randomUUID(); const expiresAt = new Date(Date.now() + 60_000);
  const material = { id: tokenId, purpose: AccountActionTokenPurpose.PASSWORD_RESET, userId, expiresAt };
  const bearer = buildAccountActionToken(material, secret);
  let consumedAt: Date | null = null; let passwordWrites = 0; let revocations = 0; let audits = 0;
  const candidate = { ...material, companyId: null, tokenHash: hashAccountActionToken(bearer), consumedAt: null, invalidatedAt: null, createdByUserId: null, createdAt: new Date() };
  const tx = {
    accountActionToken: { updateMany: async ({ where, data }: { where: { id?: string }; data: { consumedAt?: Date } }) => {
      if (where.id) { if (consumedAt) return { count: 0 }; consumedAt = data.consumedAt ?? null; return { count: 1 }; }
      return { count: 0 };
    } },
    user: { findFirst: async () => ({ id: userId, companyId: null }), update: async () => { passwordWrites += 1; } },
    refreshToken: { updateMany: async () => { revocations += 1; } },
    auditLog: { create: async () => { audits += 1; } },
  };
  const prisma = {
    accountActionToken: { findUnique: async () => candidate },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const config = { get: (key: string, fallback?: unknown) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : fallback, getOrThrow: () => secret };
  return { service: new IdentityActionsService(prisma as never, config as never, {} as never), bearer, counts: () => ({ passwordWrites, revocations, audits }) };
}

describe('IdentityActionsService token consumption', () => {
  it('atomically consumes once, changes the password, revokes sessions, and audits without bearer evidence', async () => {
    const state = fixture();
    const input = { token: state.bearer, password: 'new-secure-password', passwordConfirmation: 'new-secure-password' };
    assert.deepEqual(await state.service.resetPassword(input, {}), { success: true });
    await assert.rejects(() => state.service.resetPassword(input, {}), /invalid or expired/i);
    assert.deepEqual(state.counts(), { passwordWrites: 1, revocations: 1, audits: 1 });
  });

  it('rejects tampering and password-confirmation mismatch before mutation', async () => {
    const state = fixture();
    await assert.rejects(() => state.service.resetPassword({ token: `${state.bearer}x`, password: 'abcdefgh', passwordConfirmation: 'abcdefgh' }, {}), /invalid or expired/i);
    await assert.rejects(() => state.service.resetPassword({ token: state.bearer, password: 'abcdefgh', passwordConfirmation: 'different' }, {}), /do not match/i);
    assert.deepEqual(state.counts(), { passwordWrites: 0, revocations: 0, audits: 0 });
  });
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { AccountActionTokenPurpose } from '@prisma/client';
import { buildAccountActionToken, hashAccountActionToken } from '../../common/utils/account-action-token.util';
import { IdentityActionsService } from './identity-actions.service';

const secret = 'test-only-secret-with-at-least-32-characters';

function fixture(
  purpose: AccountActionTokenPurpose = AccountActionTokenPurpose.PASSWORD_RESET,
  companyId: string | null = null,
) {
  const userId = randomUUID(); const tokenId = randomUUID(); const expiresAt = new Date(Date.now() + 60_000);
  const material = { id: tokenId, purpose, userId, expiresAt };
  const bearer = buildAccountActionToken(material, secret);
  let consumedAt: Date | null = null; let passwordWrites = 0; let tokenRevocations = 0; let sessionRevocations = 0; let audits = 0;
  const order: string[] = [];
  const candidate = { ...material, companyId, tokenHash: hashAccountActionToken(bearer), consumedAt: null, invalidatedAt: null, createdByUserId: null, createdAt: new Date() };
  const tx = {
    $queryRaw: async () => [{ id: userId }],
    accountActionToken: { updateMany: async ({ where, data }: { where: { id?: string }; data: { consumedAt?: Date } }) => {
      if (where.id) { if (consumedAt) return { count: 0 }; consumedAt = data.consumedAt ?? null; return { count: 1 }; }
      return { count: 0 };
    } },
    user: { findFirst: async () => ({ id: userId, companyId }), update: async () => { order.push('activate'); passwordWrites += 1; } },
    refreshSession: { updateMany: async () => { sessionRevocations += 1; } },
    refreshToken: { updateMany: async () => { tokenRevocations += 1; } },
    auditLog: { create: async () => { audits += 1; } },
  };
  const prisma = {
    accountActionToken: { findUnique: async () => candidate },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const config = { get: (key: string, fallback?: unknown) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : fallback, getOrThrow: () => secret };
  const commercial = { resolve: async () => { order.push('commercial'); return { source: 'SUBSCRIPTION', capacity: 1, commercialStatus: 'ACTIVE', allocationAllowed: true }; } };
  const seats = { lockCompany: async () => { order.push('lock'); }, countUsedSeats: async () => { order.push('count'); return 0; }, assertPositiveAllocation: () => { order.push('assert'); } };
  return { service: new IdentityActionsService(prisma as never, config as never, {} as never, commercial as never, seats as never), bearer, order, counts: () => ({ passwordWrites, tokenRevocations, sessionRevocations, audits }) };
}

describe('IdentityActionsService token consumption', () => {
  it('atomically consumes once, changes the password, revokes sessions, and audits without bearer evidence', async () => {
    const state = fixture();
    const input = { token: state.bearer, password: 'new-secure-password', passwordConfirmation: 'new-secure-password' };
    assert.deepEqual(await state.service.resetPassword(input, {}), { success: true });
    await assert.rejects(() => state.service.resetPassword(input, {}), /invalid or expired/i);
    assert.deepEqual(state.counts(), { passwordWrites: 1, tokenRevocations: 1, sessionRevocations: 1, audits: 1 });
  });

  it('rejects tampering and password-confirmation mismatch before mutation', async () => {
    const state = fixture();
    await assert.rejects(() => state.service.resetPassword({ token: `${state.bearer}x`, password: 'abcdefgh', passwordConfirmation: 'abcdefgh' }, {}), /invalid or expired/i);
    await assert.rejects(() => state.service.resetPassword({ token: state.bearer, password: 'abcdefgh', passwordConfirmation: 'different' }, {}), /do not match/i);
    assert.deepEqual(state.counts(), { passwordWrites: 0, tokenRevocations: 0, sessionRevocations: 0, audits: 0 });
  });

  it('serializes tenant invitation activation and reserves commercial capacity before activation', async () => {
    const state = fixture(AccountActionTokenPurpose.INVITATION, randomUUID());
    const input = { token: state.bearer, password: 'new-secure-password', passwordConfirmation: 'new-secure-password' };
    assert.deepEqual(await state.service.activate(input, {}), { success: true });
    assert.deepEqual(state.order.slice(0, 5), ['lock', 'commercial', 'count', 'assert', 'activate']);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountActionTokenPurpose, RoleName, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';

const actor = { id: '11111111-1111-4111-8111-111111111111', companyId: null, email: 'actor@example.invalid', firstName: 'Platform', lastName: 'Admin', status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
const target = { id: '22222222-2222-4222-8222-222222222222', companyId: null, email: 'old@example.invalid', firstName: 'Target', lastName: 'Admin', status: UserStatus.ACTIVE, deletedAt: null, branch: null, department: null, designation: null, shift: null, roles: [] };

function fixture(currentEmail = target.email) {
  const calls = { tokens: [] as unknown[], refreshTokens: [] as unknown[], sessions: [] as unknown[], audits: [] as unknown[], queries: 0 };
  const tx = {
    $queryRaw: () => { calls.queries += 1; return Promise.resolve([{ id: target.id }]); },
    user: {
      findUniqueOrThrow: ({ select }: { select?: { email?: boolean } }) => Promise.resolve(select?.email ? { email: currentEmail } : target),
      update: ({ data }: { data: { email?: string } }) => Promise.resolve({ ...target, ...data }),
    },
    accountActionToken: { updateMany: (input: unknown) => { calls.tokens.push(input); return Promise.resolve({ count: 1 }); } },
    refreshSession: { updateMany: (input: unknown) => { calls.sessions.push(input); return Promise.resolve({ count: 1 }); } },
    refreshToken: { updateMany: (input: unknown) => { calls.refreshTokens.push(input); return Promise.resolve({ count: 1 }); } },
    auditLog: { create: (input: unknown) => { calls.audits.push(input); return Promise.resolve({}); } },
  };
  const prisma = {
    user: { findFirst: () => Promise.resolve(target) },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  return { service: new UsersService(prisma as never, {} as never), calls };
}

describe('UsersService email-change security', () => {
  it('serializes a real normalized change and atomically invalidates tokens, sessions, and verification evidence', async () => {
    const { service, calls } = fixture();
    const updated = await service.update(target.id, { email: ' NEW@Example.Invalid ' }, actor);
    assert.equal(updated.email, 'new@example.invalid');
    assert.equal(calls.queries, 4);
    assert.equal(calls.tokens.length, 1);
    assert.equal((calls.tokens[0] as any).where.purpose, AccountActionTokenPurpose.EMAIL_VERIFICATION);
    assert.equal(calls.sessions.length, 1);
    assert.equal(calls.refreshTokens.length, 1);
    assert.equal(calls.audits.length, 2);
    assert.deepEqual((calls.audits[0] as any).data.metadata, { verificationInvalidated: true, sessionsRevoked: true });
    assert.equal(JSON.stringify(calls.audits).includes('new@example.invalid'), false);
  });

  it('does not invalidate verification or sessions for a normalized-equivalent address', async () => {
    const { service, calls } = fixture('admin@example.invalid');
    await service.update(target.id, { email: ' ADMIN@EXAMPLE.INVALID ' }, actor);
    assert.equal(calls.tokens.length, 0);
    assert.equal(calls.sessions.length, 0);
    assert.equal(calls.audits.length, 1);
  });
});

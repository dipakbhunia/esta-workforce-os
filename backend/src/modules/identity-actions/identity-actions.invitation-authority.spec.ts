import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { AccountActionTokenPurpose } from '@prisma/client';
import { InvitationDispatchAuthorityConflictError } from '../../common/utils/platform-invitation-authority.util';
import { IdentityActionsService } from './identity-actions.service';

const secret = 'invitation-authority-test-secret-at-least-32-characters';

function harness(unresolved: boolean) {
  const targetUserId = randomUUID();
  const calls: string[] = [];
  let invalidations = 0;
  let creations = 0;
  const tx = {
    $queryRaw: async (query: { strings?: readonly string[] } | readonly string[]) => {
      const sql = Array.isArray(query)
        ? query.join('')
        : ('strings' in query ? query.strings?.join('') ?? '' : '');
      if (sql.includes('pg_advisory_xact_lock') && sql.includes('hashtextextended')) {
        calls.push(sql.includes('AS "lock"') ? 'target-lock' : 'account-action-lock');
        return [];
      }
      if (sql.includes('FROM "AuditLog" AS started')) {
        calls.push('fence-check');
        return unresolved ? [{ id: randomUUID() }] : [];
      }
      return [];
    },
    accountActionToken: {
      updateMany: async () => { calls.push('invalidate'); invalidations += 1; return { count: 0 }; },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push('create'); creations += 1; return data;
      },
    },
  };
  const service = new IdentityActionsService({} as never, {
    get: (key: string, fallback?: unknown) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? secret : fallback,
    getOrThrow: () => secret,
  } as never, {} as never);
  return { service, tx, targetUserId, calls, counts: () => ({ invalidations, creations }) };
}

describe('IdentityActionsService invitation dispatch authority', () => {
  it('locks and checks the durable fence before invalidating the current invitation', async () => {
    const value = harness(false);
    await value.service.issueTokenInTransaction(value.tx as never, {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: value.targetUserId,
      companyId: null,
    });
    assert.deepEqual(value.calls, ['target-lock', 'fence-check', 'account-action-lock', 'invalidate', 'create']);
    assert.deepEqual(value.counts(), { invalidations: 1, creations: 1 });
  });

  it('rejects unresolved dispatch before token invalidation or replacement', async () => {
    const value = harness(true);
    await assert.rejects(() => value.service.issueTokenInTransaction(value.tx as never, {
      purpose: AccountActionTokenPurpose.INVITATION,
      userId: value.targetUserId,
      companyId: null,
    }), InvitationDispatchAuthorityConflictError);
    assert.deepEqual(value.calls, ['target-lock', 'fence-check']);
    assert.deepEqual(value.counts(), { invalidations: 0, creations: 0 });
  });

  it('does not add the invitation fence to password-reset issuance', async () => {
    const value = harness(true);
    await value.service.issueTokenInTransaction(value.tx as never, {
      purpose: AccountActionTokenPurpose.PASSWORD_RESET,
      userId: value.targetUserId,
      companyId: null,
    });
    assert.deepEqual(value.calls, ['account-action-lock', 'invalidate', 'create']);
  });
});

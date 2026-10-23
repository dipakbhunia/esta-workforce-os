import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acquireInvitationAuthorityLock,
  InvitationDispatchAuthorityConflictError,
  requireNoUnresolvedPlatformInvitationDispatch,
} from './platform-invitation-authority.util';

const targetUserId = '00000000-0000-4000-8000-000000000011';

describe('platform invitation authority coordination', () => {
  it('uses one target-only advisory-lock namespace', async () => {
    const queries: Array<{ strings?: readonly string[]; values?: readonly unknown[] }> = [];
    const tx = { $queryRaw: async (query: { strings?: readonly string[]; values?: readonly unknown[] }) => {
      queries.push(query);
      return [];
    } };

    await acquireInvitationAuthorityLock(tx as never, targetUserId);

    assert.equal(queries.length, 1);
    assert.match(queries[0].strings?.join('') ?? '', /pg_advisory_xact_lock/);
    assert.deepEqual(queries[0].values, [`identity-action-invitation-authority:${targetUserId}`]);
  });

  it('raises a typed safe conflict for unresolved or malformed lifecycle evidence', async () => {
    const tx = { $queryRaw: async () => [{ id: 'unresolved-audit-id' }] };
    await assert.rejects(
      () => requireNoUnresolvedPlatformInvitationDispatch(tx as never, targetUserId),
      InvitationDispatchAuthorityConflictError,
    );
  });

  it('allows authority changes only when no unresolved evidence exists', async () => {
    const tx = { $queryRaw: async () => [] };
    await requireNoUnresolvedPlatformInvitationDispatch(tx as never, targetUserId);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';

const selfActor = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: '22222222-2222-4222-8222-222222222222',
  email: 'user@example.test', firstName: 'Test', lastName: 'User',
  status: UserStatus.ACTIVE, roles: [RoleName.EMPLOYEE],
};

function selfState(options: { transactionFailure?: boolean; enqueueFailure?: boolean } = {}) {
  const enqueues: Array<Record<string, unknown>> = [];
  let passwordWrites = 0;
  let tokenRevocations = 0;
  const state = {
    user: {
      findUnique: async () => ({
        passwordHash: bcrypt.hashSync('current-password', 4),
        deletedAt: null,
        companyId: selfActor.companyId,
      }),
      update: async () => { passwordWrites += 1; return {}; },
    },
    refreshToken: { updateMany: async () => {
      tokenRevocations += 1;
      if (options.transactionFailure) throw new Error('transaction failed');
      return { count: 1 };
    } },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  const notifications = { createPasswordChangedEmail: async (input: Record<string, unknown>) => {
    enqueues.push(input);
    if (options.enqueueFailure) throw new Error('unsafe-provider-context');
    return { created: true };
  } };
  return { state, notifications, enqueues, passwordWrites: () => passwordWrites, tokenRevocations: () => tokenRevocations };
}

describe('UsersService password-changed notification integration', () => {
  it('enqueues one empty-payload event after a successful self-service transaction', async () => {
    const fixture = selfState();
    const service = new UsersService(fixture.state as never, fixture.notifications as never);
    assert.deepEqual(await service.changePassword({ currentPassword: 'current-password', newPassword: 'new-password' }, selfActor), { success: true });
    assert.equal(fixture.passwordWrites(), 1);
    assert.equal(fixture.tokenRevocations(), 1);
    assert.equal(fixture.enqueues.length, 1);
    assert.equal(fixture.enqueues[0].targetUserId, selfActor.id);
    assert.deepEqual(fixture.enqueues[0].payload, {});
    assert.match(String(fixture.enqueues[0].passwordMutationEventId), /^[0-9a-f-]{36}$/i);
  });

  it('creates no event when current-password or same-password verification fails', async () => {
    for (const dto of [
      { currentPassword: 'wrong-password', newPassword: 'new-password' },
      { currentPassword: 'current-password', newPassword: 'current-password' },
    ]) {
      const fixture = selfState();
      const service = new UsersService(fixture.state as never, fixture.notifications as never);
      await assert.rejects(() => service.changePassword(dto, selfActor),
        dto.currentPassword === 'wrong-password' ? UnauthorizedException : BadRequestException);
      assert.equal(fixture.enqueues.length, 0);
    }
  });

  it('creates no event when the password transaction fails', async () => {
    const fixture = selfState({ transactionFailure: true });
    const service = new UsersService(fixture.state as never, fixture.notifications as never);
    await assert.rejects(() => service.changePassword({ currentPassword: 'current-password', newPassword: 'new-password' }, selfActor));
    assert.equal(fixture.enqueues.length, 0);
  });

  it('preserves password success and logs only approved evidence when enqueue fails', async () => {
    const fixture = selfState({ enqueueFailure: true });
    const service = new UsersService(fixture.state as never, fixture.notifications as never);
    const warnings: unknown[] = [];
    (service as unknown as { logger: { warn(value: unknown): void } }).logger = { warn: (value) => warnings.push(value) };
    assert.deepEqual(await service.changePassword({ currentPassword: 'current-password', newPassword: 'new-password' }, selfActor), { success: true });
    assert.equal(warnings.length, 1);
    assert.deepEqual(Object.keys(warnings[0] as object).sort(), [
      'failureCategory', 'passwordMutationEventId', 'targetCompanyId', 'targetUserId',
    ]);
    assert.doesNotMatch(JSON.stringify(warnings), /unsafe-provider-context|current-password|new-password|@/i);
  });

  it('admin reset enqueues for the target rather than the actor after audit transaction', async () => {
    const target = {
      id: '33333333-3333-4333-8333-333333333333', companyId: null,
      email: 'target@example.test', firstName: 'Target', lastName: 'Admin',
      status: UserStatus.ACTIVE, deletedAt: null, branch: null, department: null,
      designation: null, shift: null, roles: [],
    };
    const actor = { ...selfActor, id: '44444444-4444-4444-8444-444444444444', companyId: null, roles: [RoleName.SUPER_ADMIN] };
    const order: string[] = [];
    const tx = {
      user: { update: async () => { order.push('password'); return {}; } },
      refreshToken: { updateMany: async () => { order.push('tokens'); return { count: 1 }; } },
      auditLog: { create: async () => { order.push('audit'); return {}; } },
    };
    const prisma = {
      user: { findFirst: async () => target },
      $transaction: async (callback: (value: typeof tx) => Promise<void>) => { await callback(tx); order.push('commit'); },
    };
    const enqueues: Array<Record<string, unknown>> = [];
    const service = new UsersService(prisma as never, { createPasswordChangedEmail: async (input: Record<string, unknown>) => {
      order.push('enqueue'); enqueues.push(input); return { created: true };
    } } as never);
    assert.deepEqual(await service.resetPassword(target.id, { newPassword: 'replacement-password' }, actor), { success: true });
    assert.deepEqual(order, ['password', 'tokens', 'audit', 'commit', 'enqueue']);
    assert.equal(enqueues[0].targetUserId, target.id);
    assert.notEqual(enqueues[0].targetUserId, actor.id);
  });

  it('admin reset creates no event for missing, cross-tenant, or self targets', async () => {
    const actor = { ...selfActor, roles: [RoleName.COMPANY_ADMIN] };
    const cases = [
      { target: null, id: '33333333-3333-4333-8333-333333333333', error: NotFoundException },
      { target: { id: '44444444-4444-4444-8444-444444444444', companyId: 'other', roles: [] }, id: '44444444-4444-4444-8444-444444444444', error: ForbiddenException },
      { target: { id: actor.id, companyId: actor.companyId, roles: [] }, id: actor.id, error: ForbiddenException },
    ];
    for (const current of cases) {
      let enqueueCount = 0;
      const prisma = { user: { findFirst: async () => current.target } };
      const service = new UsersService(prisma as never, { createPasswordChangedEmail: async () => {
        enqueueCount += 1; return { created: true };
      } } as never);
      await assert.rejects(
        () => service.resetPassword(current.id, { newPassword: 'replacement-password' }, actor),
        current.error,
      );
      assert.equal(enqueueCount, 0);
    }
  });
});

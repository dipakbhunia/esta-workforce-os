import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { RoleName, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';

const companyId = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';
const actor = {
  id: '11111111-1111-4111-8111-111111111111', companyId,
  email: 'actor@example.test', firstName: 'Company', lastName: 'Admin',
  status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN],
};

const managedUser = (status: UserStatus) => ({
  id: targetId, companyId, email: 'target@example.test', firstName: 'Target', lastName: 'User', status,
  lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  branchId: null, departmentId: null, designationId: null, shiftId: null,
  company: null, branch: null, department: null, designation: null, shift: null, roles: [],
});

function fixture(previousStatus: UserStatus, options: {
  transactionFailure?: 'update' | 'tokens';
  enqueueFailure?: boolean;
} = {}) {
  const order: string[] = [];
  const enqueues: Array<Record<string, unknown>> = [];
  let tokenRevocations = 0;
  const tx = {
    $queryRaw: async () => { order.push('lock'); return [{ pg_advisory_xact_lock: '' }]; },
    user: {
      findUniqueOrThrow: async () => { order.push('status-read'); return { status: previousStatus }; },
      findUnique: async () => ({ companyId, status: previousStatus, deletedAt: null, roles: [] }),
      update: async ({ data }: { data: { status: UserStatus } }) => {
        order.push('status-update');
        if (options.transactionFailure === 'update') throw new Error('update failed');
        return { ...managedUser(data.status), updatedAt: new Date() };
      },
    },
    refreshToken: { updateMany: async () => {
      order.push('tokens'); tokenRevocations += 1;
      if (options.transactionFailure === 'tokens') throw new Error('token failure');
      return { count: 1 };
    } },
    auditLog: { create: async () => { order.push('audit'); return {}; } },
  };
  const prisma = {
    user: { findFirst: async () => managedUser(previousStatus) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const value = await callback(tx); order.push('commit'); return value;
    },
  };
  const notifications = { createAccountStatusChangedEmail: async (input: Record<string, unknown>) => {
    order.push('enqueue'); enqueues.push(input);
    if (options.enqueueFailure) throw new Error('unsafe persistence details');
    return { created: true };
  } };
  return { prisma, notifications, order, enqueues, tokenRevocations: () => tokenRevocations };
}

describe('UsersService account-status notification integration', () => {
  for (const [previousStatus, status, revokesTokens] of [
    [UserStatus.ACTIVE, UserStatus.INACTIVE, true],
    [UserStatus.INACTIVE, UserStatus.ACTIVE, false],
    [UserStatus.ACTIVE, UserStatus.SUSPENDED, true],
  ] as const) {
    it(`${previousStatus} -> ${status} commits before one target event`, async () => {
      const state = fixture(previousStatus);
      const service = new UsersService(state.prisma as never, state.notifications as never);
      const response = await service.setStatus(targetId, { status }, actor);
      assert.equal(response.status, status);
      assert.equal(state.enqueues.length, 1);
      assert.equal(state.enqueues[0].targetUserId, targetId);
      assert.deepEqual(state.enqueues[0].payload, { previousStatus, status });
      assert.match(String(state.enqueues[0].statusMutationEventId), /^[0-9a-f-]{36}$/i);
      assert.ok(state.order.indexOf('commit') < state.order.indexOf('enqueue'));
      assert.equal(state.tokenRevocations(), revokesTokens ? 1 : 0);
    });
  }

  it('preserves non-active no-op writes and token revocation without creating an event', async () => {
    const state = fixture(UserStatus.INACTIVE);
    const service = new UsersService(state.prisma as never, state.notifications as never);
    const response = await service.setStatus(targetId, { status: UserStatus.INACTIVE }, actor);
    assert.equal(response.status, UserStatus.INACTIVE);
    assert.ok(state.order.includes('status-update'));
    assert.equal(state.tokenRevocations(), 1);
    assert.equal(state.enqueues.length, 0);
  });

  it('creates no event when authorization or the transaction fails', async () => {
    const unauthorized = fixture(UserStatus.ACTIVE);
    const unauthorizedService = new UsersService(unauthorized.prisma as never, unauthorized.notifications as never);
    await assert.rejects(() => unauthorizedService.setStatus(targetId, { status: UserStatus.INACTIVE }, {
      ...actor, companyId: '44444444-4444-4444-8444-444444444444',
    }), ForbiddenException);
    assert.equal(unauthorized.enqueues.length, 0);
    for (const transactionFailure of ['update', 'tokens'] as const) {
      const state = fixture(UserStatus.ACTIVE, { transactionFailure });
      const service = new UsersService(state.prisma as never, state.notifications as never);
      await assert.rejects(() => service.setStatus(targetId, { status: UserStatus.INACTIVE }, actor));
      assert.equal(state.enqueues.length, 0);
      assert.ok(!state.order.includes('commit'));
    }
  });

  it('preserves the committed public response and logs bounded evidence when enqueue fails', async () => {
    const state = fixture(UserStatus.ACTIVE, { enqueueFailure: true });
    const service = new UsersService(state.prisma as never, state.notifications as never);
    const warnings: unknown[] = [];
    (service as unknown as { logger: { warn(value: unknown): void } }).logger = { warn: (value) => warnings.push(value) };
    const response = await service.setStatus(targetId, { status: UserStatus.INACTIVE }, actor);
    assert.equal(response.status, UserStatus.INACTIVE);
    assert.deepEqual(Object.keys(warnings[0] as object).sort(), [
      'failureCategory', 'statusMutationEventId', 'targetCompanyId', 'targetUserId',
    ]);
    assert.doesNotMatch(JSON.stringify(warnings), /unsafe persistence details|target@example|password|token/i);
  });
});

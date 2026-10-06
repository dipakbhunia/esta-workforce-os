import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LeaveRequestStatus, RoleName } from '@prisma/client';
import { LeaveService } from './leave.service';

const companyId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const employeeId = '33333333-3333-4333-8333-333333333333';
const leaveTypeId = '44444444-4444-4444-8444-444444444444';
const managerEmployeeId = '55555555-5555-4555-8555-555555555555';

const actor = {
  id: '66666666-6666-4666-8666-666666666666',
  companyId,
  email: 'hr@example.test',
  firstName: 'HR',
  lastName: 'Reviewer',
  status: 'ACTIVE' as const,
  roles: [RoleName.HR],
};

function record(status = LeaveRequestStatus.PENDING) {
  return {
    id: requestId,
    companyId,
    employeeId,
    leaveTypeId,
    startDate: new Date('2026-10-10T00:00:00.000Z'),
    endDate: new Date('2026-10-11T00:00:00.000Z'),
    totalDays: 2,
    reason: 'Rest',
    status,
    approverId: null,
    reviewedAt: null,
    reviewComment: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    deletedAt: null,
    employee: {
      id: employeeId,
      employeeCode: 'EMP-1',
      reportingManagerId: managerEmployeeId,
      user: { id: '77777777-7777-4777-8777-777777777777', firstName: 'Leave', lastName: 'Applicant', email: 'applicant@example.test' },
    },
    leaveType: {
      id: leaveTypeId,
      companyId,
      name: 'Annual Leave',
      code: 'ANNUAL',
      description: null,
      defaultDays: 12,
      requiresApproval: true,
      managerCanApprove: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    },
    approver: null,
  };
}

function harness(options: { count?: number; status?: LeaveRequestStatus; auditFailure?: boolean; notificationFailure?: boolean } = {}) {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const notificationCalls: unknown[] = [];
  const initial = record(options.status);
  let resultingStatus = initial.status;
  const tx = {
    leaveRequest: {
      updateMany: async (input: { where: unknown; data: { status: LeaveRequestStatus } }) => {
        calls.push({ name: 'claim', input });
        resultingStatus = input.data.status;
        return { count: options.count ?? 1 };
      },
      findUniqueOrThrow: async (input: unknown) => {
        calls.push({ name: 'reload', input });
        return { ...initial, status: resultingStatus, reviewedAt: new Date() };
      },
    },
    leaveBalance: { upsert: async (input: unknown) => { calls.push({ name: 'balance', input }); return {}; } },
    leaveApprovalHistory: { create: async (input: unknown) => { calls.push({ name: 'history', input }); return { id: '99999999-9999-4999-8999-999999999999' }; } },
    auditLog: { create: async (input: unknown) => {
      calls.push({ name: 'audit', input });
      if (options.auditFailure) throw new Error('audit failed');
      return {};
    } },
  };
  const prisma = {
    leaveRequest: { findFirst: async () => initial },
    employee: { findFirst: async () => ({ id: managerEmployeeId }) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const notifications = { createLeaveDecisionEmail: async (input: unknown) => {
    notificationCalls.push(input);
    if (options.notificationFailure) throw new Error('enqueue failed');
    return { created: true };
  } };
  return { service: new LeaveService(prisma as never, notifications as never), calls, notificationCalls };
}

describe('LeaveService review concurrency authority', () => {
  it('claims APPROVED conditionally, reloads transaction truth, and preserves the response', async () => {
    const state = harness();
    const response = await state.service.review(requestId, { status: LeaveRequestStatus.APPROVED }, actor);
    const claim = state.calls.find((call) => call.name === 'claim')!.input as {
      where: Record<string, unknown>;
    };
    assert.deepEqual(claim.where, {
      id: requestId,
      companyId,
      deletedAt: null,
      status: LeaveRequestStatus.PENDING,
    });
    assert.deepEqual(state.calls.map((call) => call.name), ['claim', 'reload', 'balance', 'history', 'audit']);
    assert.equal(response.status, LeaveRequestStatus.APPROVED);
    assert.equal(response.startDate, '2026-10-10');
    assert.equal(response.endDate, '2026-10-11');
    assert.deepEqual(state.notificationCalls, [{
      decisionHistoryId: '99999999-9999-4999-8999-999999999999',
      type: 'LEAVE_APPROVED',
      applicantUserId: '77777777-7777-4777-8777-777777777777',
      expectedCompanyId: companyId,
      payload: { leaveRequestId: requestId, leaveTypeName: 'Annual Leave', startDate: '2026-10-10', endDate: '2026-10-11' },
    }]);
  });

  it('allows a REJECTED winner without mutating leave balance', async () => {
    const state = harness();
    const response = await state.service.review(requestId, { status: LeaveRequestStatus.REJECTED }, actor);
    assert.equal(response.status, LeaveRequestStatus.REJECTED);
    assert.deepEqual(state.calls.map((call) => call.name), ['claim', 'reload', 'history', 'audit']);
  });

  it('maps a lost conditional claim to the existing error before downstream writes', async () => {
    const state = harness({ count: 0 });
    await assert.rejects(
      () => state.service.review(requestId, { status: LeaveRequestStatus.APPROVED }, actor),
      (error: unknown) => error instanceof BadRequestException && error.message === 'Only pending requests can be reviewed',
    );
    assert.deepEqual(state.calls.map((call) => call.name), ['claim']);
    assert.deepEqual(state.notificationCalls, []);
  });

  it('keeps all winner mutations inside the same failing transaction boundary', async () => {
    const state = harness({ auditFailure: true });
    await assert.rejects(
      () => state.service.review(requestId, { status: LeaveRequestStatus.APPROVED }, actor),
      /audit failed/,
    );
    assert.deepEqual(state.calls.map((call) => call.name), ['claim', 'reload', 'balance', 'history', 'audit']);
    assert.deepEqual(state.notificationCalls, []);
  });

  it('preserves the committed public result when post-commit enqueue fails', async () => {
    const state = harness({ notificationFailure: true });
    const response = await state.service.review(requestId, { status: LeaveRequestStatus.REJECTED }, actor);
    assert.equal(response.status, LeaveRequestStatus.REJECTED);
    assert.equal(state.notificationCalls.length, 1);
  });

  it('preserves tenant isolation and manager approval authority', async () => {
    const denied = harness();
    await assert.rejects(
      () => denied.service.review(requestId, { status: LeaveRequestStatus.APPROVED }, { ...actor, companyId: '88888888-8888-4888-8888-888888888888' }),
      ForbiddenException,
    );
    assert.deepEqual(denied.calls, []);

    const allowed = harness();
    const response = await allowed.service.review(requestId, { status: LeaveRequestStatus.REJECTED }, {
      ...actor,
      roles: [RoleName.MANAGER],
    });
    assert.equal(response.status, LeaveRequestStatus.REJECTED);
  });
});

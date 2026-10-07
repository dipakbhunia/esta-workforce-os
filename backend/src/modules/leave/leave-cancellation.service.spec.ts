import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { LeaveApprovalAction, LeaveRequestStatus, RoleName, UserStatus } from '@prisma/client';
import { LeaveService } from './leave.service';

const companyId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const applicantId = '33333333-3333-4333-8333-333333333333';
const approverId = '44444444-4444-4444-8444-444444444444';
const historyId = '55555555-5555-4555-8555-555555555555';
const actor = {
  id: '66666666-6666-4666-8666-666666666666',
  companyId,
  email: 'admin@example.test',
  firstName: 'Company',
  lastName: 'Admin',
  status: UserStatus.ACTIVE,
  roles: [RoleName.COMPANY_ADMIN],
};

const pending = {
  id: requestId,
  companyId,
  employeeId: '77777777-7777-4777-8777-777777777777',
  leaveTypeId: '88888888-8888-4888-8888-888888888888',
  startDate: new Date('2027-01-10T00:00:00.000Z'),
  endDate: new Date('2027-01-11T00:00:00.000Z'),
  totalDays: 2,
  reason: null,
  status: LeaveRequestStatus.PENDING,
  approverId: null,
  assignedApproverUserId: approverId,
  approvalAuthorityVersion: 1,
  reviewedAt: null,
  reviewComment: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  employee: {
    id: '77777777-7777-4777-8777-777777777777',
    employeeCode: 'EMP-1',
    reportingManagerId: null,
    user: { id: applicantId, firstName: 'Leave', lastName: 'Applicant', email: 'applicant@example.test' },
  },
  leaveType: { id: '88888888-8888-4888-8888-888888888888', name: 'Annual Leave', managerCanApprove: true },
  approver: null,
};

function harness(options: { claim?: number; notificationFailure?: boolean } = {}) {
  const writes: Array<{ name: string; input: any }> = [];
  const notificationCalls: any[] = [];
  const updated = {
    ...pending,
    status: LeaveRequestStatus.CANCELLED,
    approverId: '99999999-9999-4999-8999-999999999999',
    reviewedAt: new Date(),
    reviewComment: 'Cancelled',
  };
  const tx = {
    leaveRequest: {
      updateMany: async (input: any) => { writes.push({ name: 'claim', input }); return { count: options.claim ?? 1 }; },
      findUniqueOrThrow: async () => updated,
    },
    leaveApprovalHistory: {
      create: async (input: any) => { writes.push({ name: 'history', input }); return { id: historyId }; },
    },
    auditLog: {
      create: async (input: any) => { writes.push({ name: 'audit', input }); return {}; },
    },
  };
  const prisma = {
    leaveRequest: { findFirst: async () => pending },
    employee: { findFirst: async () => ({ id: updated.approverId }) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const notifications = {
    createLeaveCancelledEmails: async (input: any) => {
      notificationCalls.push(input);
      if (options.notificationFailure) throw new Error('enqueue failed');
      return { created: 2 };
    },
  };
  return { service: new LeaveService(prisma as never, notifications as never), writes, notificationCalls };
}

describe('LeaveService cancellation claim and post-commit notification', () => {
  it('claims PENDING atomically, writes winner evidence, and enqueues durable participants after commit', async () => {
    const state = harness();
    const response = await state.service.cancel(requestId, actor);
    assert.equal(response.status, LeaveRequestStatus.CANCELLED);
    assert.deepEqual(state.writes[0], {
      name: 'claim',
      input: {
        where: { id: requestId, companyId, status: LeaveRequestStatus.PENDING, deletedAt: null },
        data: {
          status: LeaveRequestStatus.CANCELLED,
          approverId: '99999999-9999-4999-8999-999999999999',
          reviewedAt: state.writes[0].input.data.reviewedAt,
          reviewComment: 'Cancelled',
        },
      },
    });
    assert.equal(state.writes.find((entry) => entry.name === 'history')!.input.data.action, LeaveApprovalAction.CANCELLED);
    assert.equal(state.writes.find((entry) => entry.name === 'audit')!.input.data.action, 'LEAVE_CANCELLED');
    assert.deepEqual(state.notificationCalls, [{
      cancellationHistoryId: historyId,
      participantUserIds: [applicantId, approverId],
      expectedCompanyId: companyId,
      payload: {
        leaveRequestId: requestId,
        applicantDisplayName: 'Leave Applicant',
        leaveTypeName: 'Annual Leave',
        startDate: '2027-01-10',
        endDate: '2027-01-11',
        cancelledByDisplayName: 'Company Admin',
      },
    }]);
  });

  it('creates no winner evidence or notification when the terminal claim loses', async () => {
    const state = harness({ claim: 0 });
    await assert.rejects(() => state.service.cancel(requestId, actor), BadRequestException);
    assert.deepEqual(state.writes.map((entry) => entry.name), ['claim']);
    assert.deepEqual(state.notificationCalls, []);
  });

  it('preserves a committed cancellation when post-commit notification fails', async () => {
    const state = harness({ notificationFailure: true });
    assert.equal((await state.service.cancel(requestId, actor)).status, LeaveRequestStatus.CANCELLED);
    assert.equal(state.notificationCalls.length, 1);
  });
});

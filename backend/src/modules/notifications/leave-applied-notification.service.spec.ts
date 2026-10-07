import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

const input = {
  submittedHistoryId: '22222222-2222-4222-8222-222222222222',
  assignedApproverUserId: '33333333-3333-4333-8333-333333333333',
  expectedCompanyId: '44444444-4444-4444-8444-444444444444',
  payload: {
    leaveRequestId: '11111111-1111-4111-8111-111111111111',
    applicantDisplayName: 'Leave Applicant',
    leaveTypeName: 'Annual Leave',
    startDate: '2026-10-10',
    endDate: '2026-10-11',
  },
};

function service(options: { enabled?: boolean; recipient?: object | null; failure?: unknown } = {}) {
  const creates: unknown[] = [];
  const resolverCalls: unknown[] = [];
  const prisma = { notification: { create: async (value: unknown) => {
    creates.push(value);
    if (options.failure) throw options.failure;
    return {};
  } } };
  const recipients = { resolveWorkflowAssignedApprover: async (...args: unknown[]) => {
    resolverCalls.push(args);
    return options.recipient === undefined
      ? { userId: input.assignedApproverUserId, email: 'approver@example.test', companyId: input.expectedCompanyId }
      : options.recipient;
  } };
  const preferences = { getEffective: async () => ({
    emailEnabled: options.enabled ?? true,
    quietHoursStart: null,
    quietHoursEnd: null,
  }) };
  return {
    instance: new NotificationsService(prisma as never, recipients as never, preferences as never, {} as never),
    creates,
    resolverCalls,
  };
}

describe('NotificationsService Leave applied workflow', () => {
  it('creates one exact tenant-bound assigned-approver email snapshot and identity', async () => {
    const state = service();
    assert.deepEqual(await state.instance.createLeaveAppliedEmail(input), { created: true });
    assert.deepEqual(state.resolverCalls, [[input.assignedApproverUserId, input.expectedCompanyId]]);
    const data = (state.creates[0] as { data: Record<string, any> }).data;
    assert.equal(data.companyId, input.expectedCompanyId);
    assert.equal(data.userId, input.assignedApproverUserId);
    assert.equal(data.type, NotificationType.LEAVE_APPLIED);
    assert.equal(data.idempotencyKey, `${input.submittedHistoryId}:LEAVE_APPLIED:${input.assignedApproverUserId}:EMAIL`);
    assert.equal(data.deliveries.create.recipient, 'approver@example.test');
  });

  it('respects disabled email preference', async () => {
    const state = service({ enabled: false });
    assert.deepEqual(await state.instance.createLeaveAppliedEmail(input), { created: false });
    assert.equal(state.creates.length, 0);
  });

  it('fails closed without substituting a missing or cross-tenant recipient', async () => {
    await assert.rejects(() => service({ recipient: null }).instance.createLeaveAppliedEmail(input), /recipient was not found/);
    await assert.rejects(() => service({ recipient: {
      userId: input.assignedApproverUserId,
      email: 'approver@example.test',
      companyId: 'other',
    } }).instance.createLeaveAppliedEmail(input), /recipient was not found/);
  });

  it('swallows only the exact idempotency-key collision', async () => {
    const exact = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['idempotencyKey'] },
    });
    assert.deepEqual(await service({ failure: exact }).instance.createLeaveAppliedEmail(input), { created: false });
    const other = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['userId'] },
    });
    await assert.rejects(
      () => service({ failure: other }).instance.createLeaveAppliedEmail(input),
      (error) => error === other,
    );
  });
});

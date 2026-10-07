import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

const companyId = '44444444-4444-4444-8444-444444444444';
const applicantId = '22222222-2222-4222-8222-222222222222';
const approverId = '33333333-3333-4333-8333-333333333333';
const input = {
  cancellationHistoryId: '55555555-5555-4555-8555-555555555555',
  participantUserIds: [applicantId, approverId],
  expectedCompanyId: companyId,
  payload: {
    leaveRequestId: '11111111-1111-4111-8111-111111111111',
    applicantDisplayName: 'Leave Applicant',
    leaveTypeName: 'Annual Leave',
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    cancelledByDisplayName: 'Company Admin',
  },
};

function harness(options: { disabled?: string; failure?: unknown; missing?: string } = {}) {
  const creates: any[] = [];
  const resolves: string[] = [];
  const prisma = { notification: { create: async (value: unknown) => {
    creates.push(value);
    if (options.failure) throw options.failure;
    return {};
  } } };
  const recipients = { resolveWorkflowExactParticipant: async (id: string, expectedCompanyId: string) => {
    resolves.push(id);
    return id === options.missing ? null : { userId: id, email: `${id}@example.test`, companyId: expectedCompanyId };
  } };
  const preferences = { getEffective: async (id: string) => ({
    emailEnabled: id !== options.disabled,
    quietHoursStart: null,
    quietHoursEnd: null,
  }) };
  return { service: new NotificationsService(prisma as never, recipients as never, preferences as never, {} as never), creates, resolves };
}

describe('NotificationsService Leave cancelled workflow', () => {
  it('deduplicates exact participants and creates recipient-specific durable identities', async () => {
    const state = harness();
    assert.deepEqual(await state.service.createLeaveCancelledEmails({
      ...input,
      participantUserIds: [applicantId, approverId, applicantId],
    }), { created: 2 });
    assert.deepEqual(state.resolves, [applicantId, approverId]);
    assert.deepEqual(state.creates.map((row) => row.data.idempotencyKey), [
      `${input.cancellationHistoryId}:LEAVE_CANCELLED:${applicantId}:EMAIL`,
      `${input.cancellationHistoryId}:LEAVE_CANCELLED:${approverId}:EMAIL`,
    ]);
    assert.ok(state.creates.every((row) => row.data.type === NotificationType.LEAVE_CANCELLED));
  });

  it('suppresses disabled and unavailable participants without substitution', async () => {
    const state = harness({ disabled: applicantId, missing: approverId });
    assert.deepEqual(await state.service.createLeaveCancelledEmails(input), { created: 0 });
    assert.equal(state.creates.length, 0);
  });

  it('converges exact replay and propagates unrelated P2002', async () => {
    const exact = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['idempotencyKey'] },
    });
    assert.deepEqual(await harness({ failure: exact }).service.createLeaveCancelledEmails({
      ...input, participantUserIds: [applicantId],
    }), { created: 0 });
    const other = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['userId'] },
    });
    await assert.rejects(
      () => harness({ failure: other }).service.createLeaveCancelledEmails({ ...input, participantUserIds: [applicantId] }),
      (error) => error === other,
    );
  });
});

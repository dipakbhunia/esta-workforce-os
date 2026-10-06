import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

const input = {
  decisionHistoryId: '22222222-2222-4222-8222-222222222222',
  type: NotificationType.LEAVE_APPROVED,
  applicantUserId: '33333333-3333-4333-8333-333333333333',
  expectedCompanyId: '44444444-4444-4444-8444-444444444444',
  payload: {
    leaveRequestId: '11111111-1111-4111-8111-111111111111',
    leaveTypeName: 'Annual Leave', startDate: '2026-10-10', endDate: '2026-10-11',
  },
};

function service(options: { enabled?: boolean; recipient?: object | null; failure?: unknown } = {}) {
  const creates: unknown[] = [];
  const prisma = { notification: { create: async (value: unknown) => {
    creates.push(value);
    if (options.failure) throw options.failure;
    return {};
  } } };
  const recipients = { resolveWorkflowApplicant: async () => options.recipient === undefined
    ? { userId: input.applicantUserId, email: 'applicant@example.test', companyId: input.expectedCompanyId }
    : options.recipient };
  const preferences = { getEffective: async () => ({ emailEnabled: options.enabled ?? true, quietHoursStart: null, quietHoursEnd: null }) };
  return { instance: new NotificationsService(prisma as never, recipients as never, preferences as never, {} as never), creates };
}

describe('NotificationsService Leave decision workflow', () => {
  it('creates one exact tenant-bound applicant email snapshot and identity', async () => {
    const state = service();
    assert.deepEqual(await state.instance.createLeaveDecisionEmail(input), { created: true });
    const data = (state.creates[0] as { data: Record<string, any> }).data;
    assert.equal(data.companyId, input.expectedCompanyId);
    assert.equal(data.userId, input.applicantUserId);
    assert.equal(data.type, NotificationType.LEAVE_APPROVED);
    assert.equal(data.idempotencyKey, `${input.decisionHistoryId}:LEAVE_APPROVED:${input.applicantUserId}:EMAIL`);
    assert.equal(data.alertId, null);
    assert.equal(data.severity, null);
    assert.equal(data.deliveries.create.recipient, 'applicant@example.test');
  });

  it('suppresses workflow email when global email is disabled', async () => {
    const state = service({ enabled: false });
    assert.deepEqual(await state.instance.createLeaveDecisionEmail(input), { created: false });
    assert.equal(state.creates.length, 0);
  });

  it('fails closed for missing, deleted, or cross-tenant recipient authority', async () => {
    await assert.rejects(() => service({ recipient: null }).instance.createLeaveDecisionEmail(input), /recipient was not found/);
    await assert.rejects(() => service({ recipient: {
      userId: input.applicantUserId, email: 'applicant@example.test', companyId: 'other',
    } }).instance.createLeaveDecisionEmail(input), /recipient was not found/);
  });

  it('treats only the exact idempotency collision as an idempotent replay', async () => {
    const exact = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['idempotencyKey'] },
    });
    assert.deepEqual(await service({ failure: exact }).instance.createLeaveDecisionEmail(input), { created: false });
    const other = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['userId'] },
    });
    await assert.rejects(() => service({ failure: other }).instance.createLeaveDecisionEmail(input), (error) => error === other);
  });
});

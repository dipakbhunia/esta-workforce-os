import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

const input = {
  attendanceCorrectionRequestId: '11111111-1111-4111-8111-111111111111',
  assignedApproverUserId: '22222222-2222-4222-8222-222222222222',
  expectedCompanyId: '33333333-3333-4333-8333-333333333333',
  payload: {
    attendanceCorrectionRequestId: '11111111-1111-4111-8111-111111111111',
    employeeDisplayName: 'Attendance Employee',
    attendanceDate: '2026-10-10',
    correctionType: 'TIME_CORRECTION',
  },
};

function harness(options: { enabled?: boolean; recipient?: object | null; failure?: unknown } = {}) {
  const creates: any[] = [];
  const recipients = { resolveWorkflowAssignedApprover: async () => options.recipient === undefined
    ? { userId: input.assignedApproverUserId, email: 'approver@example.test', companyId: input.expectedCompanyId }
    : options.recipient };
  const preferences = { getEffective: async () => ({ emailEnabled: options.enabled ?? true, quietHoursStart: null, quietHoursEnd: null }) };
  const prisma = { notification: { create: async (value: unknown) => { creates.push(value); if (options.failure) throw options.failure; } } };
  return { service: new NotificationsService(prisma as never, recipients as never, preferences as never, {} as never), creates };
}

describe('NotificationsService Attendance correction applied workflow', () => {
  it('uses the exact assigned approver and request identity', async () => {
    const state = harness();
    assert.deepEqual(await state.service.createAttendanceCorrectionAppliedEmail(input), { created: true });
    const data = state.creates[0].data;
    assert.equal(data.type, NotificationType.ATTENDANCE_CORRECTION_APPLIED);
    assert.equal(data.userId, input.assignedApproverUserId);
    assert.equal(data.idempotencyKey, `${input.attendanceCorrectionRequestId}:ATTENDANCE_CORRECTION_APPLIED:${input.assignedApproverUserId}:EMAIL`);
  });
  it('suppresses disabled or unavailable recipients without fallback', async () => {
    assert.deepEqual(await harness({ enabled: false }).service.createAttendanceCorrectionAppliedEmail(input), { created: false });
    assert.deepEqual(await harness({ recipient: null }).service.createAttendanceCorrectionAppliedEmail(input), { created: false });
  });
  it('converges only the exact idempotency collision', async () => {
    const exact = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test', meta: { target: ['idempotencyKey'] } });
    assert.deepEqual(await harness({ failure: exact }).service.createAttendanceCorrectionAppliedEmail(input), { created: false });
    const other = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test', meta: { target: ['userId'] } });
    await assert.rejects(() => harness({ failure: other }).service.createAttendanceCorrectionAppliedEmail(input), (error) => error === other);
  });
});

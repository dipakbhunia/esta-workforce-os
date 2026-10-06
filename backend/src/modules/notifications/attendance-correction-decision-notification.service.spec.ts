import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

const input = {
  decisionAuditId: '22222222-2222-4222-8222-222222222222',
  type: NotificationType.ATTENDANCE_CORRECTION_APPROVED,
  employeeUserId: '33333333-3333-4333-8333-333333333333',
  expectedCompanyId: '44444444-4444-4444-8444-444444444444',
  payload: { attendanceCorrectionRequestId: '11111111-1111-4111-8111-111111111111', attendanceDate: '2026-10-07' },
};

function service(options: { enabled?: boolean; recipient?: object | null; failure?: unknown } = {}) {
  const creates: unknown[] = [];
  const prisma = { notification: { create: async (value: unknown) => { creates.push(value); if (options.failure) throw options.failure; return {}; } } };
  const recipients = { resolveWorkflowApplicant: async () => options.recipient === undefined
    ? { userId: input.employeeUserId, email: 'employee@example.test', companyId: input.expectedCompanyId }
    : options.recipient };
  const preferences = { getEffective: async () => ({ emailEnabled: options.enabled ?? true, quietHoursStart: null, quietHoursEnd: null }) };
  return { instance: new NotificationsService(prisma as never, recipients as never, preferences as never, {} as never), creates };
}

describe('NotificationsService Attendance correction decision workflow', () => {
  it('creates the exact tenant-bound employee email and audit-based idempotency identity', async () => {
    const state = service();
    assert.deepEqual(await state.instance.createAttendanceCorrectionDecisionEmail(input), { created: true });
    const data = (state.creates[0] as { data: Record<string, any> }).data;
    assert.equal(data.companyId, input.expectedCompanyId);
    assert.equal(data.userId, input.employeeUserId);
    assert.equal(data.type, input.type);
    assert.equal(data.idempotencyKey, `${input.decisionAuditId}:ATTENDANCE_CORRECTION_APPROVED:${input.employeeUserId}:EMAIL`);
    assert.equal(data.deliveries.create.recipient, 'employee@example.test');
  });

  it('suppresses disabled preferences while missing preference defaults are supplied as enabled', async () => {
    const disabled = service({ enabled: false });
    assert.deepEqual(await disabled.instance.createAttendanceCorrectionDecisionEmail(input), { created: false });
    assert.equal(disabled.creates.length, 0);
    assert.deepEqual(await service().instance.createAttendanceCorrectionDecisionEmail(input), { created: true });
  });

  it('fails closed for missing and cross-tenant current recipients', async () => {
    await assert.rejects(() => service({ recipient: null }).instance.createAttendanceCorrectionDecisionEmail(input), /recipient was not found/);
    await assert.rejects(() => service({ recipient: { userId: input.employeeUserId, email: 'x', companyId: null } })
      .instance.createAttendanceCorrectionDecisionEmail(input), /recipient was not found/);
  });

  it('normalizes only the exact idempotency-key collision', async () => {
    const exact = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test', meta: { target: ['idempotencyKey'] } });
    assert.deepEqual(await service({ failure: exact }).instance.createAttendanceCorrectionDecisionEmail(input), { created: false });
    const other = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test', meta: { target: ['userId'] } });
    await assert.rejects(() => service({ failure: other }).instance.createAttendanceCorrectionDecisionEmail(input), (error) => error === other);
  });
});

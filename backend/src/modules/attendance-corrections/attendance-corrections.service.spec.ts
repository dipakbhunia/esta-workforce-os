import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { AttendanceCorrectionStatus, AttendanceCorrectionType, RoleName, UserStatus } from '@prisma/client';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

const companyId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const actor = {
  id: '33333333-3333-4333-8333-333333333333', companyId,
  email: 'reviewer@example.test', firstName: 'Review', lastName: 'User',
  status: UserStatus.ACTIVE, roles: [RoleName.HR],
};

function record(status = AttendanceCorrectionStatus.PENDING) {
  return {
    id: requestId, companyId, attendanceId: '44444444-4444-4444-8444-444444444444',
    employeeId: '55555555-5555-4555-8555-555555555555', requestedByUserId: '66666666-6666-4666-8666-666666666666',
    reviewedByUserId: null, type: AttendanceCorrectionType.TIME_CORRECTION, status,
    originalPunchInAt: new Date('2026-10-01T09:00:00.000Z'), originalPunchOutAt: new Date('2026-10-01T17:00:00.000Z'),
    requestedPunchInAt: null, requestedPunchOutAt: new Date('2026-10-01T18:00:00.000Z'),
    reason: 'Forgot punch out', reviewerComment: null, reviewedAt: null,
    createdAt: new Date('2026-10-01T18:05:00.000Z'), updatedAt: new Date('2026-10-01T18:05:00.000Z'), deletedAt: null,
    employee: { id: '55555555-5555-4555-8555-555555555555', employeeCode: 'EMP-1', reportingManagerId: null,
      user: { id: '66666666-6666-4666-8666-666666666666', firstName: 'Attend', lastName: 'User', email: 'employee@example.test' } },
    attendance: { id: '44444444-4444-4444-8444-444444444444', attendanceDate: new Date('2026-10-01T00:00:00.000Z'),
      punchInAt: new Date('2026-10-01T09:00:00.000Z'), punchOutAt: new Date('2026-10-01T17:00:00.000Z'),
      expectedMinutes: 480, shiftStartTime: '09:00', shiftTimezone: 'UTC', breaks: [] },
    requestedBy: { id: '66666666-6666-4666-8666-666666666666', firstName: 'Attend', lastName: 'User', email: 'employee@example.test' },
    reviewedBy: null,
  };
}

function harness(claimCount = 1, notificationFailure?: Error) {
  const calls: string[] = [];
  const notificationCalls: unknown[] = [];
  let current = record();
  const tx = {
    attendanceCorrectionRequest: {
      updateMany: async (input: { data: { status: AttendanceCorrectionStatus } }) => {
        calls.push('claim');
        if (claimCount === 1) current = { ...current, status: input.data.status, reviewedByUserId: actor.id };
        return { count: claimCount };
      },
      findUniqueOrThrow: async () => { calls.push('reload'); return current; },
    },
    auditLog: { create: async () => { calls.push('audit'); return { id: '77777777-7777-4777-8777-777777777777' }; } },
  };
  const prisma = {
    attendanceCorrectionRequest: { findFirst: async () => record() },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const notifications = { createAttendanceCorrectionDecisionEmail: async (input: unknown) => {
    notificationCalls.push(input);
    if (notificationFailure) throw notificationFailure;
    return { created: true };
  } };
  return { service: new AttendanceCorrectionsService(prisma as never, notifications as never), calls, notificationCalls };
}

describe('AttendanceCorrectionsService decision claims', () => {
  it('claims a rejection before reload and decision audit', async () => {
    const state = harness();
    const result = await state.service.review(requestId, { status: AttendanceCorrectionStatus.REJECTED }, actor);
    assert.equal(result.status, AttendanceCorrectionStatus.REJECTED);
    assert.deepEqual(state.calls, ['claim', 'reload', 'reload', 'audit']);
  });

  it('maps a lost review claim to the established error before side effects', async () => {
    const state = harness(0);
    await assert.rejects(
      () => state.service.review(requestId, { status: AttendanceCorrectionStatus.APPROVED }, actor),
      (error: unknown) => error instanceof BadRequestException && error.message === 'Only pending requests can be reviewed',
    );
    assert.deepEqual(state.calls, ['claim']);
  });

  it('maps a lost cancellation claim to the established error before its audit', async () => {
    const state = harness(0);
    await assert.rejects(
      () => state.service.cancel(requestId, actor),
      (error: unknown) => error instanceof BadRequestException && error.message === 'Only pending requests can be cancelled',
    );
    assert.deepEqual(state.calls, ['claim']);
    assert.equal(state.notificationCalls.length, 0);
  });

  it('enqueues after the committed winning decision using audit and employee authority', async () => {
    const state = harness();
    await state.service.review(requestId, { status: AttendanceCorrectionStatus.REJECTED }, actor);
    assert.deepEqual(state.notificationCalls, [{
      decisionAuditId: '77777777-7777-4777-8777-777777777777',
      type: 'ATTENDANCE_CORRECTION_REJECTED',
      employeeUserId: '66666666-6666-4666-8666-666666666666',
      expectedCompanyId: companyId,
      payload: { attendanceCorrectionRequestId: requestId, attendanceDate: '2026-10-01' },
    }]);
  });

  it('preserves a committed decision when best-effort enqueue fails', async () => {
    const state = harness(1, new Error('SMTP details must not escape'));
    const result = await state.service.review(requestId, { status: AttendanceCorrectionStatus.REJECTED }, actor);
    assert.equal(result.status, AttendanceCorrectionStatus.REJECTED);
    assert.deepEqual(state.calls, ['claim', 'reload', 'reload', 'audit']);
  });
});

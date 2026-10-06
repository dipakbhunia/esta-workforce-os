import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { emailRendererRegistry } from './email-renderer.registry';
import { validateAttendanceCorrectionDecisionEmailPayload } from './attendance-correction-decision-email.renderer';

const id = '11111111-1111-4111-8111-111111111111';
const payload = { attendanceCorrectionRequestId: id, attendanceDate: '2026-10-07' };

describe('Attendance correction decision email renderers', () => {
  it('renders the exact approved and rejected workflow content', () => {
    assert.deepEqual(emailRendererRegistry.render(NotificationType.ATTENDANCE_CORRECTION_APPROVED, payload), {
      subject: 'Your attendance correction was approved',
      message: 'Your attendance correction request for 2026-10-07 was approved.',
      safeDetailsPath: `/attendance/corrections/${id}`,
      rendererVersion: 'attendance-correction-approved-v1',
    });
    assert.deepEqual(emailRendererRegistry.render(NotificationType.ATTENDANCE_CORRECTION_REJECTED, payload), {
      subject: 'Your attendance correction was rejected',
      message: 'Your attendance correction request for 2026-10-07 was rejected.',
      safeDetailsPath: `/attendance/corrections/${id}`,
      rendererVersion: 'attendance-correction-rejected-v1',
    });
  });

  it('strictly rejects non-plain, missing, extra, malformed UUID, and impossible date payloads', () => {
    for (const value of [null, [], Object.assign(Object.create({}), payload), {},
      { ...payload, extra: true }, { ...payload, attendanceCorrectionRequestId: 'bad' },
      { ...payload, attendanceDate: '2025-02-29' }, { ...payload, attendanceDate: '07-10-2026' }]) {
      assert.throws(() => validateAttendanceCorrectionDecisionEmailPayload(value));
    }
    assert.deepEqual(validateAttendanceCorrectionDecisionEmailPayload({
      attendanceCorrectionRequestId: id.toUpperCase(), attendanceDate: '2024-02-29',
    }), { attendanceCorrectionRequestId: id, attendanceDate: '2024-02-29' });
  });
});

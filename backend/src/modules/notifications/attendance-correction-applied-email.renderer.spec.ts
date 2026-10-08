import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { renderEmailHtml } from './email-notification-channel.service';
import { attendanceCorrectionAppliedEmailRendererRegistration as renderer } from './attendance-correction-applied-email.renderer';

describe('Attendance correction applied email renderer', () => {
  const payload = {
    attendanceCorrectionRequestId: '11111111-1111-4111-8111-111111111111',
    employeeDisplayName: 'Employee <script>alert(1)</script>',
    attendanceDate: '2026-10-10',
    correctionType: 'TIME_CORRECTION',
  };
  it('renders exact safe workflow content', () => {
    const result = renderer.render(NotificationType.ATTENDANCE_CORRECTION_APPLIED, renderer.validatePayload(payload));
    assert.equal(result.subject, 'Attendance correction requires your review');
    assert.equal(result.safeDetailsPath, '/attendance/corrections/11111111-1111-4111-8111-111111111111');
    const html = renderEmailHtml({ type: NotificationType.ATTENDANCE_CORRECTION_APPLIED, title: result.subject, message: result.message, severity: null, detailsPath: result.safeDetailsPath });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });
  it('rejects missing, extra, invalid date, and invalid correction type', () => {
    assert.throws(() => renderer.validatePayload({ ...payload, secret: true }));
    assert.throws(() => renderer.validatePayload({ ...payload, attendanceDate: '2026-02-30' }));
    assert.throws(() => renderer.validatePayload({ ...payload, correctionType: 'OTHER' }));
  });
});

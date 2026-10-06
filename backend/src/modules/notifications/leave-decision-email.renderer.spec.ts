import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { EmailCompositionError } from './email-composition.types';
import { emailRendererRegistry } from './email-renderer.registry';
import { validateLeaveDecisionEmailPayload } from './leave-decision-email.renderer';

const payload = {
  leaveRequestId: '11111111-1111-4111-8111-111111111111',
  leaveTypeName: 'Annual <Leave>',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
};

describe('Leave decision email renderers', () => {
  it('renders exact approved and rejected snapshots with a safe details path', () => {
    assert.deepEqual(emailRendererRegistry.render(NotificationType.LEAVE_APPROVED, payload), {
      subject: 'Your leave request was approved',
      message: 'Your Annual <Leave> leave request from 2026-10-10 to 2026-10-11 was approved.',
      safeDetailsPath: `/leave/requests/${payload.leaveRequestId}`,
      rendererVersion: 'leave-approved-v1',
    });
    assert.deepEqual(emailRendererRegistry.render(NotificationType.LEAVE_REJECTED, payload), {
      subject: 'Your leave request was rejected',
      message: 'Your Annual <Leave> leave request from 2026-10-10 to 2026-10-11 was rejected.',
      safeDetailsPath: `/leave/requests/${payload.leaveRequestId}`,
      rendererVersion: 'leave-rejected-v1',
    });
  });

  it('rejects non-plain, inherited, extra, malformed, and reversed payloads', () => {
    const invalid: unknown[] = [null, [], Object.create(payload), { ...payload, token: 'x' },
      { ...payload, leaveRequestId: 'bad' }, { ...payload, startDate: '2026-02-30' },
      { ...payload, startDate: '2026-10-12', endDate: '2026-10-11' }, { ...payload, leaveTypeName: '' }];
    for (const value of invalid) assert.throws(
      () => validateLeaveDecisionEmailPayload(value),
      (error: unknown) => error instanceof EmailCompositionError && error.code === 'INVALID_PAYLOAD',
    );
  });
});

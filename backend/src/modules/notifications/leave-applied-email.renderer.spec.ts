import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { EmailCompositionError } from './email-composition.types';
import { renderEmailHtml } from './email-notification-channel.service';
import { emailRendererRegistry } from './email-renderer.registry';
import {
  LEAVE_APPLIED_EMAIL_RENDERER_VERSION,
  leaveAppliedEmailRendererRegistration,
  validateLeaveAppliedEmailPayload,
} from './leave-applied-email.renderer';

const payload = {
  leaveRequestId: '11111111-1111-4111-8111-111111111111',
  applicantDisplayName: 'Jane <script>alert(1)</script> Doe',
  leaveTypeName: 'Annual <Leave>',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
};

describe('Leave applied email renderer', () => {
  it('registers and renders the exact assigned-approver workflow contract', () => {
    assert.equal(leaveAppliedEmailRendererRegistration.rendererId, 'LEAVE_APPLIED_WORKFLOW');
    assert.equal(leaveAppliedEmailRendererRegistration.rendererVersion, LEAVE_APPLIED_EMAIL_RENDERER_VERSION);
    assert.deepEqual(emailRendererRegistry.render(NotificationType.LEAVE_APPLIED, payload), {
      subject: 'Leave request requires your review',
      message: 'Jane <script>alert(1)</script> Doe submitted a Annual <Leave> leave request from 2026-10-10 to 2026-10-11. Your review is required.',
      safeDetailsPath: `/leave/requests/${payload.leaveRequestId}`,
      rendererVersion: 'leave-applied-v1',
    });
  });

  it('rejects missing, extra, wrong-type, inherited, malformed, and reversed payloads', () => {
    const { endDate: _endDate, ...missing } = payload;
    const invalid: unknown[] = [
      null,
      [],
      Object.create(payload),
      missing,
      { ...payload, reason: 'private' },
      { ...payload, applicantDisplayName: 1 },
      { ...payload, leaveRequestId: 'bad' },
      { ...payload, startDate: '2026-02-30' },
      { ...payload, startDate: '2026-10-12', endDate: '2026-10-11' },
    ];
    for (const value of invalid) assert.throws(
      () => validateLeaveAppliedEmailPayload(value),
      (error: unknown) => error instanceof EmailCompositionError && error.code === 'INVALID_PAYLOAD',
    );
  });

  it('escapes dynamic content in the final HTML envelope', () => {
    const composition = emailRendererRegistry.render(NotificationType.LEAVE_APPLIED, payload);
    const html = renderEmailHtml({
      type: NotificationType.LEAVE_APPLIED,
      title: composition.subject,
      message: composition.message,
      severity: null,
      detailsPath: composition.safeDetailsPath,
    });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Annual &lt;Leave&gt;/);
    assert.equal(html.includes('private application reason'), false);
    assert.equal(html.includes('assignedApproverUserId'), false);
    assert.equal(html.includes('approvalAuthorityVersion'), false);
  });
});

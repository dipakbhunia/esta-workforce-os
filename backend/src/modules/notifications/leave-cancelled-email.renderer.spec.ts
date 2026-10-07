import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { EmailCompositionError } from './email-composition.types';
import { renderEmailHtml } from './email-notification-channel.service';
import { emailRendererRegistry } from './email-renderer.registry';
import { validateLeaveCancelledEmailPayload } from './leave-cancelled-email.renderer';

const payload = {
  leaveRequestId: '11111111-1111-4111-8111-111111111111',
  applicantDisplayName: 'Jane <script>alert(1)</script> Doe',
  leaveTypeName: 'Annual <Leave>',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
  cancelledByDisplayName: 'Admin <img src=x>',
};

describe('Leave cancelled email renderer', () => {
  it('renders the exact neutral cancellation workflow contract', () => {
    const result = emailRendererRegistry.render(NotificationType.LEAVE_CANCELLED, payload);
    assert.equal(result.subject, 'Leave request cancelled');
    assert.equal(result.rendererVersion, 'leave-cancelled-v1');
    assert.equal(result.safeDetailsPath, `/leave/requests/${payload.leaveRequestId}`);
    assert.match(result.message, /was cancelled by/);
  });

  it('rejects missing, extra, inherited, malformed, oversized, and reversed payloads', () => {
    const { cancelledByDisplayName: _removed, ...missing } = payload;
    const invalid: unknown[] = [
      null,
      [],
      Object.create(payload),
      missing,
      { ...payload, reason: 'private' },
      { ...payload, cancelledByDisplayName: 1 },
      { ...payload, applicantDisplayName: 'x'.repeat(201) },
      { ...payload, leaveRequestId: '../bad' },
      { ...payload, startDate: '2026-02-30' },
      { ...payload, startDate: '2026-10-12', endDate: '2026-10-11' },
    ];
    for (const value of invalid) assert.throws(
      () => validateLeaveCancelledEmailPayload(value),
      (error: unknown) => error instanceof EmailCompositionError && error.code === 'INVALID_PAYLOAD',
    );
  });

  it('escapes every dynamic value at the final HTML boundary', () => {
    const composition = emailRendererRegistry.render(NotificationType.LEAVE_CANCELLED, payload);
    const html = renderEmailHtml({
      type: NotificationType.LEAVE_CANCELLED,
      title: composition.subject,
      message: composition.message,
      severity: null,
      detailsPath: composition.safeDetailsPath,
    });
    assert.doesNotMatch(html, /<script>|<img src=x>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Annual &lt;Leave&gt;/);
    assert.match(html, /Admin &lt;img src=x&gt;/);
  });
});

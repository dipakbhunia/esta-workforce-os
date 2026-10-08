import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { emailRendererRegistry } from './email-renderer.registry';

describe('identity action email composition', () => {
  it('renders typed invitation and reset messages without bearer or password material', () => {
    const invitation = emailRendererRegistry.render(NotificationType.ACCOUNT_INVITATION, { organizationName: 'Acme', expiresAt: '2030-01-01T00:00:00.000Z' });
    const reset = emailRendererRegistry.render(NotificationType.PASSWORD_RESET_REQUESTED, { expiresAt: '2030-01-01T00:00:00.000Z' });
    assert.match(invitation.subject, /Acme/);
    assert.match(reset.subject, /reset/i);
    assert.equal(invitation.safeDetailsPath, null);
    assert.doesNotMatch(JSON.stringify([invitation, reset]), /tokenHash|passwordHash|Bearer /i);
  });

  it('fails closed for malformed payloads', () => {
    assert.throws(() => emailRendererRegistry.render(NotificationType.ACCOUNT_INVITATION, { organizationName: '', expiresAt: 'bad' }));
    assert.throws(() => emailRendererRegistry.render(NotificationType.PASSWORD_RESET_REQUESTED, { expiresAt: 'bad' }));
  });
});

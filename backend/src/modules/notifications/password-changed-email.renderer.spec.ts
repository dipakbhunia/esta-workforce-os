import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { emailRendererRegistry } from './email-renderer.registry';
import { PASSWORD_CHANGED_EMAIL_RENDERER_VERSION, validatePasswordChangedEmailPayload } from './password-changed-email.renderer';

describe('password-changed email renderer', () => {
  it('renders the exact static security content without a details path', () => {
    assert.deepEqual(emailRendererRegistry.render(NotificationType.PASSWORD_CHANGED, {}), {
      subject: 'Your password was changed',
      message: 'The password for your Esta Workforce OS account was changed. If you did not expect this change, contact your administrator or support immediately.',
      safeDetailsPath: null,
      rendererVersion: PASSWORD_CHANGED_EMAIL_RENDERER_VERSION,
    });
  });

  it('accepts only an empty ordinary plain object', () => {
    assert.deepEqual(validatePasswordChangedEmailPayload({}), {});
    for (const payload of [null, [], Object.create(null), Object.create({ password: 'x' }),
      { password: 'x' }, { passwordHash: 'x' }, { email: 'x@example.test' }, { userId: 'x' },
      { accessToken: 'x' }, { refreshToken: 'x' }, { metadata: {} }]) {
      assert.throws(() => validatePasswordChangedEmailPayload(payload));
    }
  });
});

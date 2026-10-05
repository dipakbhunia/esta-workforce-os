import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType, UserStatus } from '@prisma/client';
import { EmailCompositionError, EmailRendererId } from './email-composition.types';
import { emailRendererRegistry } from './email-renderer.registry';
import {
  ACCOUNT_STATUS_CHANGED_EMAIL_RENDERER_VERSION,
  accountStatusChangedEmailRendererRegistration,
  validateAccountStatusChangedEmailPayload,
} from './account-status-changed-email.renderer';

describe('account status changed email renderer', () => {
  const expected = new Map<UserStatus, string>([
    [UserStatus.ACTIVE, 'Your Esta Workforce OS account is now active. Access remains subject to your assigned roles and permissions.'],
    [UserStatus.INACTIVE, 'Your Esta Workforce OS account is now inactive. Access to your account may no longer be available.'],
    [UserStatus.SUSPENDED, 'Your Esta Workforce OS account is now suspended. Access to your account may be restricted.'],
  ]);

  it('owns its exact identity and renders every resulting status deterministically', () => {
    assert.equal(accountStatusChangedEmailRendererRegistration.rendererId, EmailRendererId.ACCOUNT_STATUS_CHANGED_SECURITY);
    assert.equal(accountStatusChangedEmailRendererRegistration.rendererVersion, ACCOUNT_STATUS_CHANGED_EMAIL_RENDERER_VERSION);
    for (const [status, message] of expected) {
      const previousStatus = status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
      assert.deepEqual(emailRendererRegistry.render(NotificationType.ACCOUNT_STATUS_CHANGED, { previousStatus, status }), {
        subject: 'Your account status changed', message, safeDetailsPath: null,
        rendererVersion: ACCOUNT_STATUS_CHANGED_EMAIL_RENDERER_VERSION,
      });
    }
  });

  it('accepts only an exact plain-object actual transition payload', () => {
    for (const status of Object.values(UserStatus)) {
      const previousStatus = status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
      assert.deepEqual(validateAccountStatusChangedEmailPayload({ previousStatus, status }), { previousStatus, status });
    }
    class CustomPayload { previousStatus = UserStatus.ACTIVE; status = UserStatus.INACTIVE; }
    const inherited = Object.create({ previousStatus: UserStatus.ACTIVE });
    inherited.status = UserStatus.INACTIVE;
    const customPrototype = Object.create({});
    customPrototype.previousStatus = UserStatus.ACTIVE;
    customPrototype.status = UserStatus.INACTIVE;
    const nonEnumerableExtra = { previousStatus: UserStatus.ACTIVE, status: UserStatus.INACTIVE };
    Object.defineProperty(nonEnumerableExtra, 'password', { value: 'unsafe', enumerable: false });
    const rejected: unknown[] = [
      null, [], new CustomPayload(), inherited, customPrototype, nonEnumerableExtra,
      {}, { previousStatus: UserStatus.ACTIVE }, { status: UserStatus.INACTIVE },
      { previousStatus: UserStatus.ACTIVE, status: UserStatus.ACTIVE },
      { previousStatus: 'UNKNOWN', status: UserStatus.ACTIVE },
      { previousStatus: UserStatus.ACTIVE, status: 'UNKNOWN' },
      { previousStatus: UserStatus.ACTIVE, status: UserStatus.INACTIVE, actor: 'unsafe' },
      { previousStatus: UserStatus.ACTIVE, status: UserStatus.INACTIVE, userId: 'unsafe' },
      { previousStatus: UserStatus.ACTIVE, status: UserStatus.INACTIVE, password: 'unsafe' },
      { previousStatus: UserStatus.ACTIVE, status: UserStatus.INACTIVE, [Symbol('token')]: 'unsafe' },
    ];
    for (const payload of rejected) {
      assert.throws(() => validateAccountStatusChangedEmailPayload(payload),
        (error: unknown) => error instanceof EmailCompositionError && error.code === 'INVALID_PAYLOAD');
    }
  });
});

import { NotificationType } from '@prisma/client';
import {
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailRendererId,
  EmailRendererRegistration,
  PasswordChangedEmailPayload,
} from './email-composition.types';

export const PASSWORD_CHANGED_EMAIL_RENDERER_VERSION = 'password-changed-v1';

const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'Open account security',
  textSafetyNotice: 'This security notification does not contain passwords, credentials, or authentication tokens.',
  htmlSafetyNotice: 'No passwords, credentials, or authentication tokens are included.',
};

export function validatePasswordChangedEmailPayload(payload: unknown): PasswordChangedEmailPayload {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 0
  ) {
    throw new EmailCompositionError(
      'INVALID_PAYLOAD',
      'Password-changed email payload must be an empty plain object',
    );
  }
  return {};
}

export const passwordChangedEmailRendererRegistration: EmailRendererRegistration<typeof NotificationType.PASSWORD_CHANGED> = {
  event: NotificationType.PASSWORD_CHANGED,
  rendererId: EmailRendererId.PASSWORD_CHANGED_SECURITY,
  rendererVersion: PASSWORD_CHANGED_EMAIL_RENDERER_VERSION,
  envelope,
  validatePayload: validatePasswordChangedEmailPayload,
  render: () => ({
    subject: 'Your password was changed',
    message: 'The password for your Esta Workforce OS account was changed. If you did not expect this change, contact your administrator or support immediately.',
    safeDetailsPath: null,
    rendererVersion: PASSWORD_CHANGED_EMAIL_RENDERER_VERSION,
  }),
};

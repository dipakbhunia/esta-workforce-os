import { NotificationType, UserStatus } from '@prisma/client';
import {
  AccountStatusChangedEmailPayload,
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailRendererId,
  EmailRendererRegistration,
} from './email-composition.types';

export const ACCOUNT_STATUS_CHANGED_EMAIL_RENDERER_VERSION = 'account-status-changed-v1';

const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'Review account security',
  textSafetyNotice: 'This security notification does not contain passwords, credentials, or authentication tokens.',
  htmlSafetyNotice: 'No passwords, credentials, or authentication tokens are included.',
};

const supportedStatuses = new Set<UserStatus>([
  UserStatus.ACTIVE,
  UserStatus.INACTIVE,
  UserStatus.SUSPENDED,
]);

const messages: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: 'Your Esta Workforce OS account is now active. Access remains subject to your assigned roles and permissions.',
  [UserStatus.INACTIVE]: 'Your Esta Workforce OS account is now inactive. Access to your account may no longer be available.',
  [UserStatus.SUSPENDED]: 'Your Esta Workforce OS account is now suspended. Access to your account may be restricted.',
};

export function validateAccountStatusChangedEmailPayload(
  payload: unknown,
): AccountStatusChangedEmailPayload {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype
  ) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Account-status email payload must be a plain object');
  }
  const keys = Reflect.ownKeys(payload);
  if (
    keys.length !== 2 ||
    !keys.every((key): key is string => typeof key === 'string') ||
    !keys.includes('previousStatus') ||
    !keys.includes('status')
  ) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Account-status email payload has invalid keys');
  }
  const candidate = payload as Record<string, unknown>;
  if (
    !supportedStatuses.has(candidate.previousStatus as UserStatus) ||
    !supportedStatuses.has(candidate.status as UserStatus) ||
    candidate.previousStatus === candidate.status
  ) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Account-status email payload has invalid statuses');
  }
  return {
    previousStatus: candidate.previousStatus as UserStatus,
    status: candidate.status as UserStatus,
  };
}

export const accountStatusChangedEmailRendererRegistration: EmailRendererRegistration<typeof NotificationType.ACCOUNT_STATUS_CHANGED> = {
  event: NotificationType.ACCOUNT_STATUS_CHANGED,
  rendererId: EmailRendererId.ACCOUNT_STATUS_CHANGED_SECURITY,
  rendererVersion: ACCOUNT_STATUS_CHANGED_EMAIL_RENDERER_VERSION,
  envelope,
  validatePayload: validateAccountStatusChangedEmailPayload,
  render: (_event, payload) => ({
    subject: 'Your account status changed',
    message: messages[payload.status],
    safeDetailsPath: null,
    rendererVersion: ACCOUNT_STATUS_CHANGED_EMAIL_RENDERER_VERSION,
  }),
};

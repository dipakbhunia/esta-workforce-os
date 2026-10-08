import { NotificationType } from '@prisma/client';
import {
  AccountInvitationEmailPayload,
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailRendererId,
  EmailRendererRegistration,
  PasswordResetRequestedEmailPayload,
} from './email-composition.types';

const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'Open secure account action',
  textSafetyNotice: 'Use this one-time link only if you requested or expected this account action. Esta will never ask for your password by email.',
  htmlSafetyNotice: 'This is a one-time security link. Esta will never ask for your password by email.',
};

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new EmailCompositionError('INVALID_PAYLOAD', `${field} is invalid`);
  }
  return value.trim();
}

function expiry(value: unknown): string {
  const text = requiredText(value, 'expiresAt');
  if (Number.isNaN(Date.parse(text))) throw new EmailCompositionError('INVALID_PAYLOAD', 'expiresAt is invalid');
  return text;
}

export const accountInvitationEmailRendererRegistration: EmailRendererRegistration<typeof NotificationType.ACCOUNT_INVITATION> = {
  event: NotificationType.ACCOUNT_INVITATION,
  rendererId: EmailRendererId.ACCOUNT_INVITATION_SECURITY,
  rendererVersion: 'account-invitation-v1',
  envelope,
  validatePayload(payload: unknown): AccountInvitationEmailPayload {
    const value = payload as Partial<AccountInvitationEmailPayload>;
    return { organizationName: requiredText(value?.organizationName, 'organizationName'), expiresAt: expiry(value?.expiresAt) };
  },
  render: (_event, payload) => ({
    subject: `Activate your ${payload.organizationName} account`,
    message: `You have been invited to ${payload.organizationName} in Esta Workforce OS. Set your password using the secure one-time link below. The invitation expires at ${payload.expiresAt}.`,
    safeDetailsPath: null,
    rendererVersion: 'account-invitation-v1',
  }),
};

export const passwordResetRequestedEmailRendererRegistration: EmailRendererRegistration<typeof NotificationType.PASSWORD_RESET_REQUESTED> = {
  event: NotificationType.PASSWORD_RESET_REQUESTED,
  rendererId: EmailRendererId.PASSWORD_RESET_REQUESTED_SECURITY,
  rendererVersion: 'password-reset-requested-v1',
  envelope,
  validatePayload(payload: unknown): PasswordResetRequestedEmailPayload {
    const value = payload as Partial<PasswordResetRequestedEmailPayload>;
    return { expiresAt: expiry(value?.expiresAt) };
  },
  render: (_event, payload) => ({
    subject: 'Reset your Esta Workforce OS password',
    message: `A password reset was requested for your account. Use the secure one-time link below before ${payload.expiresAt}. If you did not request this, you can safely ignore this email.`,
    safeDetailsPath: null,
    rendererVersion: 'password-reset-requested-v1',
  }),
};

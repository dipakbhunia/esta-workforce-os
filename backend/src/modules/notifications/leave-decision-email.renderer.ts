import { NotificationType } from '@prisma/client';
import {
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailRendererId,
  EmailRendererRegistration,
  LeaveDecisionEmailPayload,
} from './email-composition.types';
import { buildLeaveRequestDetailsPath } from './email-content-safety';

export const LEAVE_APPROVED_EMAIL_RENDERER_VERSION = 'leave-approved-v1';
export const LEAVE_REJECTED_EMAIL_RENDERER_VERSION = 'leave-rejected-v1';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const keys = ['leaveRequestId', 'leaveTypeName', 'startDate', 'endDate'] as const;

const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'View leave request',
  textSafetyNotice: 'This workflow notification contains no application reason or review comment.',
  htmlSafetyNotice: 'Application reasons and review comments are not included.',
};

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = dateOnly.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateLeaveDecisionEmailPayload(payload: unknown): LeaveDecisionEmailPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave decision email payload must be a plain object');
  }
  const ownKeys = Reflect.ownKeys(payload);
  if (ownKeys.length !== keys.length || !ownKeys.every((key) => typeof key === 'string' && keys.includes(key as typeof keys[number]))) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave decision email payload has invalid keys');
  }
  const value = payload as Record<string, unknown>;
  if (!canonicalUuid.test(value.leaveRequestId as string) || typeof value.leaveTypeName !== 'string' || !value.leaveTypeName.trim() ||
      !validDate(value.startDate) || !validDate(value.endDate) || value.startDate > value.endDate) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave decision email payload is invalid');
  }
  return {
    leaveRequestId: (value.leaveRequestId as string).toLowerCase(),
    leaveTypeName: value.leaveTypeName,
    startDate: value.startDate,
    endDate: value.endDate,
  };
}

function registration(
  event: typeof NotificationType.LEAVE_APPROVED | typeof NotificationType.LEAVE_REJECTED,
): EmailRendererRegistration<typeof event> {
  const approved = event === NotificationType.LEAVE_APPROVED;
  const rendererVersion = approved ? LEAVE_APPROVED_EMAIL_RENDERER_VERSION : LEAVE_REJECTED_EMAIL_RENDERER_VERSION;
  return {
    event,
    rendererId: approved ? EmailRendererId.LEAVE_APPROVED_WORKFLOW : EmailRendererId.LEAVE_REJECTED_WORKFLOW,
    rendererVersion,
    envelope,
    validatePayload: validateLeaveDecisionEmailPayload,
    render: (_event, payload) => ({
      subject: approved ? 'Your leave request was approved' : 'Your leave request was rejected',
      message: `Your ${payload.leaveTypeName} leave request from ${payload.startDate} to ${payload.endDate} was ${approved ? 'approved' : 'rejected'}.`,
      safeDetailsPath: buildLeaveRequestDetailsPath(payload.leaveRequestId),
      rendererVersion,
    }),
  };
}

export const leaveDecisionEmailRendererRegistrations = [
  registration(NotificationType.LEAVE_APPROVED),
  registration(NotificationType.LEAVE_REJECTED),
] as const;

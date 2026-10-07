import { NotificationType } from '@prisma/client';
import {
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailRendererId,
  EmailRendererRegistration,
  LeaveAppliedEmailPayload,
} from './email-composition.types';
import { buildLeaveRequestDetailsPath } from './email-content-safety';

export const LEAVE_APPLIED_EMAIL_RENDERER_VERSION = 'leave-applied-v1';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const keys = ['leaveRequestId', 'applicantDisplayName', 'leaveTypeName', 'startDate', 'endDate'] as const;
const MAX_DISPLAY_NAME = 200;
const MAX_LEAVE_TYPE_NAME = 200;

const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'Review leave request',
  textSafetyNotice: 'This workflow notification contains no application reason or internal approval authority.',
  htmlSafetyNotice: 'Application reasons and internal approval authority are not included.',
};

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = dateOnly.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function validateLeaveAppliedEmailPayload(payload: unknown): LeaveAppliedEmailPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave applied email payload must be a plain object');
  }
  const ownKeys = Reflect.ownKeys(payload);
  if (ownKeys.length !== keys.length || !ownKeys.every((key) => typeof key === 'string' && keys.includes(key as typeof keys[number]))) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave applied email payload has invalid keys');
  }
  const value = payload as Record<string, unknown>;
  if (
    !canonicalUuid.test(value.leaveRequestId as string) ||
    !boundedText(value.applicantDisplayName, MAX_DISPLAY_NAME) ||
    !boundedText(value.leaveTypeName, MAX_LEAVE_TYPE_NAME) ||
    !validDate(value.startDate) ||
    !validDate(value.endDate) ||
    value.startDate > value.endDate
  ) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave applied email payload is invalid');
  }
  return {
    leaveRequestId: (value.leaveRequestId as string).toLowerCase(),
    applicantDisplayName: value.applicantDisplayName,
    leaveTypeName: value.leaveTypeName,
    startDate: value.startDate,
    endDate: value.endDate,
  };
}

export const leaveAppliedEmailRendererRegistration: EmailRendererRegistration<typeof NotificationType.LEAVE_APPLIED> = {
  event: NotificationType.LEAVE_APPLIED,
  rendererId: EmailRendererId.LEAVE_APPLIED_WORKFLOW,
  rendererVersion: LEAVE_APPLIED_EMAIL_RENDERER_VERSION,
  envelope,
  validatePayload: validateLeaveAppliedEmailPayload,
  render: (_event, payload) => ({
    subject: 'Leave request requires your review',
    message: `${payload.applicantDisplayName} submitted a ${payload.leaveTypeName} leave request from ${payload.startDate} to ${payload.endDate}. Your review is required.`,
    safeDetailsPath: buildLeaveRequestDetailsPath(payload.leaveRequestId),
    rendererVersion: LEAVE_APPLIED_EMAIL_RENDERER_VERSION,
  }),
};

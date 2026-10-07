import { NotificationType } from '@prisma/client';
import {
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailRendererId,
  EmailRendererRegistration,
  LeaveCancelledEmailPayload,
} from './email-composition.types';
import { buildLeaveRequestDetailsPath } from './email-content-safety';

export const LEAVE_CANCELLED_EMAIL_RENDERER_VERSION = 'leave-cancelled-v1';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const keys = [
  'leaveRequestId',
  'applicantDisplayName',
  'leaveTypeName',
  'startDate',
  'endDate',
  'cancelledByDisplayName',
] as const;

const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'View leave request',
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

function boundedText(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function validateLeaveCancelledEmailPayload(payload: unknown): LeaveCancelledEmailPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave cancelled email payload must be a plain object');
  }
  const ownKeys = Reflect.ownKeys(payload);
  if (ownKeys.length !== keys.length || !ownKeys.every((key) => typeof key === 'string' && keys.includes(key as typeof keys[number]))) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave cancelled email payload has invalid keys');
  }
  const value = payload as Record<string, unknown>;
  if (
    !canonicalUuid.test(value.leaveRequestId as string) ||
    !boundedText(value.applicantDisplayName) ||
    !boundedText(value.leaveTypeName) ||
    !validDate(value.startDate) ||
    !validDate(value.endDate) ||
    value.startDate > value.endDate ||
    !boundedText(value.cancelledByDisplayName)
  ) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave cancelled email payload is invalid');
  }
  return {
    leaveRequestId: (value.leaveRequestId as string).toLowerCase(),
    applicantDisplayName: value.applicantDisplayName,
    leaveTypeName: value.leaveTypeName,
    startDate: value.startDate,
    endDate: value.endDate,
    cancelledByDisplayName: value.cancelledByDisplayName,
  };
}

export const leaveCancelledEmailRendererRegistration: EmailRendererRegistration<typeof NotificationType.LEAVE_CANCELLED> = {
  event: NotificationType.LEAVE_CANCELLED,
  rendererId: EmailRendererId.LEAVE_CANCELLED_WORKFLOW,
  rendererVersion: LEAVE_CANCELLED_EMAIL_RENDERER_VERSION,
  envelope,
  validatePayload: validateLeaveCancelledEmailPayload,
  render: (_event, payload) => ({
    subject: 'Leave request cancelled',
    message: `${payload.applicantDisplayName}'s ${payload.leaveTypeName} leave request from ${payload.startDate} to ${payload.endDate} was cancelled by ${payload.cancelledByDisplayName}.`,
    safeDetailsPath: buildLeaveRequestDetailsPath(payload.leaveRequestId),
    rendererVersion: LEAVE_CANCELLED_EMAIL_RENDERER_VERSION,
  }),
};

import { NotificationType } from '@prisma/client';
import {
  AttendanceCorrectionDecisionEmailPayload,
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailRendererId,
  EmailRendererRegistration,
} from './email-composition.types';
import { buildAttendanceCorrectionDetailsPath } from './email-content-safety';

export const ATTENDANCE_CORRECTION_APPROVED_EMAIL_RENDERER_VERSION = 'attendance-correction-approved-v1';
export const ATTENDANCE_CORRECTION_REJECTED_EMAIL_RENDERER_VERSION = 'attendance-correction-rejected-v1';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const keys = ['attendanceCorrectionRequestId', 'attendanceDate'] as const;
const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'View attendance correction',
  textSafetyNotice: 'This workflow notification contains no correction reason or review comment.',
  htmlSafetyNotice: 'Correction reasons and review comments are not included.',
};

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !dateOnly.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateAttendanceCorrectionDecisionEmailPayload(payload: unknown): AttendanceCorrectionDecisionEmailPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Attendance correction decision email payload must be a plain object');
  }
  const ownKeys = Reflect.ownKeys(payload);
  if (ownKeys.length !== keys.length || !ownKeys.every((key) => typeof key === 'string' && keys.includes(key as typeof keys[number]))) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Attendance correction decision email payload has invalid keys');
  }
  const value = payload as Record<string, unknown>;
  if (typeof value.attendanceCorrectionRequestId !== 'string' ||
      !canonicalUuid.test(value.attendanceCorrectionRequestId) || !validDate(value.attendanceDate)) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Attendance correction decision email payload is invalid');
  }
  return {
    attendanceCorrectionRequestId: value.attendanceCorrectionRequestId.toLowerCase(),
    attendanceDate: value.attendanceDate,
  };
}

function registration(event: typeof NotificationType.ATTENDANCE_CORRECTION_APPROVED | typeof NotificationType.ATTENDANCE_CORRECTION_REJECTED): EmailRendererRegistration<typeof event> {
  const approved = event === NotificationType.ATTENDANCE_CORRECTION_APPROVED;
  const rendererVersion = approved
    ? ATTENDANCE_CORRECTION_APPROVED_EMAIL_RENDERER_VERSION
    : ATTENDANCE_CORRECTION_REJECTED_EMAIL_RENDERER_VERSION;
  return {
    event,
    rendererId: approved ? EmailRendererId.ATTENDANCE_CORRECTION_APPROVED_WORKFLOW : EmailRendererId.ATTENDANCE_CORRECTION_REJECTED_WORKFLOW,
    rendererVersion,
    envelope,
    validatePayload: validateAttendanceCorrectionDecisionEmailPayload,
    render: (_event, payload) => ({
      subject: approved ? 'Your attendance correction was approved' : 'Your attendance correction was rejected',
      message: `Your attendance correction request for ${payload.attendanceDate} was ${approved ? 'approved' : 'rejected'}.`,
      safeDetailsPath: buildAttendanceCorrectionDetailsPath(payload.attendanceCorrectionRequestId),
      rendererVersion,
    }),
  };
}

export const attendanceCorrectionDecisionEmailRendererRegistrations = [
  registration(NotificationType.ATTENDANCE_CORRECTION_APPROVED),
  registration(NotificationType.ATTENDANCE_CORRECTION_REJECTED),
] as const;

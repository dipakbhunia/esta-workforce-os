import { AttendanceCorrectionType, NotificationType } from '@prisma/client';
import {
  AttendanceCorrectionAppliedEmailPayload,
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailRendererId,
  EmailRendererRegistration,
} from './email-composition.types';
import { buildAttendanceCorrectionDetailsPath } from './email-content-safety';

export const ATTENDANCE_CORRECTION_APPLIED_EMAIL_RENDERER_VERSION = 'attendance-correction-applied-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys = ['attendanceCorrectionRequestId', 'employeeDisplayName', 'attendanceDate', 'correctionType'] as const;
const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'Review attendance correction',
  textSafetyNotice: 'This workflow notification contains no correction reason or internal approval authority.',
  htmlSafetyNotice: 'Correction reasons and internal approval authority are not included.',
};

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateAttendanceCorrectionAppliedEmailPayload(payload: unknown): AttendanceCorrectionAppliedEmailPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Attendance correction applied payload must be a plain object');
  }
  const ownKeys = Reflect.ownKeys(payload);
  if (ownKeys.length !== keys.length || !ownKeys.every((key) => typeof key === 'string' && keys.includes(key as typeof keys[number]))) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Attendance correction applied payload has invalid keys');
  }
  const value = payload as Record<string, unknown>;
  if (!uuid.test(value.attendanceCorrectionRequestId as string) ||
      typeof value.employeeDisplayName !== 'string' || !value.employeeDisplayName.trim() || value.employeeDisplayName.length > 200 ||
      !validDate(value.attendanceDate) ||
      typeof value.correctionType !== 'string' || !Object.values(AttendanceCorrectionType).includes(value.correctionType as AttendanceCorrectionType)) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Attendance correction applied payload is invalid');
  }
  return {
    attendanceCorrectionRequestId: (value.attendanceCorrectionRequestId as string).toLowerCase(),
    employeeDisplayName: value.employeeDisplayName,
    attendanceDate: value.attendanceDate,
    correctionType: value.correctionType,
  };
}

export const attendanceCorrectionAppliedEmailRendererRegistration: EmailRendererRegistration<typeof NotificationType.ATTENDANCE_CORRECTION_APPLIED> = {
  event: NotificationType.ATTENDANCE_CORRECTION_APPLIED,
  rendererId: EmailRendererId.ATTENDANCE_CORRECTION_APPLIED_WORKFLOW,
  rendererVersion: ATTENDANCE_CORRECTION_APPLIED_EMAIL_RENDERER_VERSION,
  envelope,
  validatePayload: validateAttendanceCorrectionAppliedEmailPayload,
  render: (_event, payload) => ({
    subject: 'Attendance correction requires your review',
    message: `${payload.employeeDisplayName} submitted a ${payload.correctionType.replaceAll('_', ' ').toLowerCase()} attendance correction for ${payload.attendanceDate}. Your review is required.`,
    safeDetailsPath: buildAttendanceCorrectionDetailsPath(payload.attendanceCorrectionRequestId),
    rendererVersion: ATTENDANCE_CORRECTION_APPLIED_EMAIL_RENDERER_VERSION,
  }),
};

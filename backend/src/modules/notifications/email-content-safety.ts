import { EmailCompositionError } from './email-composition.types';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const monitoringAlertPath = /^\/monitoring\/alerts\/([0-9a-f-]+)$/i;
const leaveRequestPath = /^\/leave\/requests\/([0-9a-f-]+)$/i;
const attendanceCorrectionPath = /^\/attendance\/corrections\/([0-9a-f-]+)$/i;

export function escapeEmailHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] ?? character,
  );
}

export function buildMonitoringAlertDetailsPath(alertId: string): string {
  if (!canonicalUuid.test(alertId)) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Monitoring alert identifier is invalid');
  }
  return `/monitoring/alerts/${alertId.toLowerCase()}`;
}

export function buildLeaveRequestDetailsPath(leaveRequestId: string): string {
  if (!canonicalUuid.test(leaveRequestId)) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Leave request identifier is invalid');
  }
  return `/leave/requests/${leaveRequestId.toLowerCase()}`;
}

export function buildAttendanceCorrectionDetailsPath(requestId: string): string {
  if (!canonicalUuid.test(requestId)) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Attendance correction request identifier is invalid');
  }
  return `/attendance/corrections/${requestId.toLowerCase()}`;
}

export function assertSafeEmailDetailsPath(value: string): string {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    /%(?:2f|5c|2e)/i.test(value) ||
    value.includes('..')
  ) {
    throw new EmailCompositionError('INVALID_RENDER_RESULT', 'Email details path is not approved');
  }
  const monitoringMatch = monitoringAlertPath.exec(value);
  if (monitoringMatch && canonicalUuid.test(monitoringMatch[1])) {
    return `/monitoring/alerts/${monitoringMatch[1].toLowerCase()}`;
  }
  const leaveMatch = leaveRequestPath.exec(value);
  if (leaveMatch && canonicalUuid.test(leaveMatch[1])) {
    return `/leave/requests/${leaveMatch[1].toLowerCase()}`;
  }
  const attendanceMatch = attendanceCorrectionPath.exec(value);
  if (attendanceMatch && canonicalUuid.test(attendanceMatch[1])) {
    return `/attendance/corrections/${attendanceMatch[1].toLowerCase()}`;
  }
  throw new EmailCompositionError('INVALID_RENDER_RESULT', 'Email details path is not approved');
}

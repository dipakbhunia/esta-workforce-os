import type { AttendanceRecord, AttendanceStatus } from '../types/attendance.types';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export function employeeName(record?: Pick<AttendanceRecord, 'employee'> | null) {
  const user = record?.employee?.user;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return name || 'Unknown employee';
}

export function employeeEmail(record?: Pick<AttendanceRecord, 'employee'> | null) {
  return record?.employee?.user?.email ?? undefined;
}

export function formatEnum(value?: string | null) {
  if (!value) return 'Not available';
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10) || 'Not available';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatMinutes(minutes?: number | null) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return 'Not available';
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function attendanceStatusTone(status?: AttendanceStatus | string | null): StatusTone {
  switch (status) {
    case 'PRESENT':
      return 'success';
    case 'LATE':
    case 'HALF_DAY':
      return 'warning';
    case 'ABSENT':
    case 'AUTO_PUNCHED_OUT':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function workedMinutes(record: AttendanceRecord) {
  if (typeof record.workedMinutes === 'number') return record.workedMinutes;
  if (!record.punchInAt) return 0;
  const start = new Date(record.punchInAt).getTime();
  const end = record.punchOutAt ? new Date(record.punchOutAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / 60000) - (record.breakMinutes ?? 0);
}

export function shiftLabel(record: AttendanceRecord) {
  if (record.shiftStartTime && record.shiftEndTime) {
    return `${record.shiftStartTime} - ${record.shiftEndTime}`;
  }
  return 'Not available';
}

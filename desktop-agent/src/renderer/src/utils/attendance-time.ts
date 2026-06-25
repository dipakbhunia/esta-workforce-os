import type { AttendanceRecord, AttendanceSummary } from '../types/api';

export function activeBreak(attendance: AttendanceRecord | null) {
  return attendance?.breaks.find((entry) => !entry.endedAt) ?? null;
}

export function latestBreak(attendance: AttendanceRecord | null) {
  return attendance?.breaks.at(-1) ?? null;
}

export function totalBreakSeconds(attendance: AttendanceRecord | null, now = new Date()): number {
  if (!attendance) return 0;
  return attendance.breaks.reduce((total, entry) => {
    const start = new Date(entry.startedAt).getTime();
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now.getTime();
    return total + Math.max(0, Math.floor((end - start) / 1000));
  }, 0);
}

export function workingSeconds(attendance: AttendanceRecord | null, now = new Date()): number {
  if (!attendance?.punchInAt) return 0;
  const end = attendance.punchOutAt ? new Date(attendance.punchOutAt) : now;
  const elapsed = Math.max(
    0,
    Math.floor((end.getTime() - new Date(attendance.punchInAt).getTime()) / 1000),
  );
  return Math.max(0, elapsed - totalBreakSeconds(attendance, now));
}

export function breakSeconds(attendance: AttendanceRecord | null, now = new Date()): number {
  const current = activeBreak(attendance);
  if (!current) return 0;
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(current.startedAt).getTime()) / 1000),
  );
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function remainingBreakSeconds(
  attendance: AttendanceRecord | null,
  now = new Date(),
): number | null {
  const current = activeBreak(attendance);
  if (!current?.allowedMinutes) return null;
  return Math.max(0, current.allowedMinutes * 60 - breakSeconds(attendance, now));
}

export function summaryWorkingSeconds(
  summary: AttendanceSummary | null,
  now = new Date(),
): number {
  if (!summary) return 0;
  const baseSeconds = summary.totalWorkedSeconds ?? summary.totalWorkedMinutes * 60;
  if (
    summary.currentState !== 'PUNCHED_IN' ||
    !summary.latestSession?.isOpen ||
    !summary.serverNow
  ) {
    return Math.max(0, baseSeconds);
  }
  const clientElapsedSinceSummary = Math.max(
    0,
    Math.floor((now.getTime() - new Date(summary.serverNow).getTime()) / 1000),
  );
  return Math.max(0, baseSeconds + clientElapsedSinceSummary);
}

export function summaryBreakSeconds(
  summary: AttendanceSummary | null,
  now = new Date(),
): number {
  if (!summary) return 0;
  const baseSeconds = summary.totalBreakSeconds ?? summary.totalBreakMinutes * 60;
  if (
    summary.currentState !== 'ON_BREAK' ||
    !summary.latestSession?.isOpen ||
    !summary.serverNow
  ) {
    return Math.max(0, baseSeconds);
  }
  const clientElapsedSinceSummary = Math.max(
    0,
    Math.floor((now.getTime() - new Date(summary.serverNow).getTime()) / 1000),
  );
  return Math.max(0, baseSeconds + clientElapsedSinceSummary);
}
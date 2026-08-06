import type { StatusTone } from '@/components/status-chip';
import type { Employee } from '@/features/people/types/employee.types';
import type { RosterDayType, ShiftRosterDay, ShiftRosterPeriod, ShiftRosterStatus } from '../types/shift-roster.types';

export const rosterStatusOptions: Array<{ value: ShiftRosterStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const rosterDayTypeOptions: Array<{ value: RosterDayType; label: string }> = [
  { value: 'WORKING', label: 'Working Shift' },
  { value: 'WEEKLY_OFF', label: 'Weekly Off' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'NO_SHIFT', label: 'No Shift' },
];

export function rosterStatusLabel(status: ShiftRosterStatus) {
  return rosterStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function rosterStatusTone(status: ShiftRosterStatus): StatusTone {
  switch (status) {
    case 'DRAFT': return 'warning';
    case 'PUBLISHED': return 'success';
    case 'LOCKED': return 'info';
    case 'CANCELLED': return 'danger';
    default: return 'neutral';
  }
}

export function dayTypeLabel(dayType: RosterDayType) {
  return rosterDayTypeOptions.find((option) => option.value === dayType)?.label ?? dayType;
}

export function dayTypeTone(dayType: RosterDayType): StatusTone {
  switch (dayType) {
    case 'WORKING': return 'success';
    case 'WEEKLY_OFF': return 'info';
    case 'HOLIDAY': return 'warning';
    case 'LEAVE': return 'neutral';
    case 'NO_SHIFT': return 'danger';
    default: return 'neutral';
  }
}

export function employeeName(employee?: (Pick<Employee, 'user' | 'employeeCode'> & { displayName?: string | null; firstName?: string | null; lastName?: string | null }) | null) {
  if (employee?.displayName) return employee.displayName;
  const first = employee?.firstName ?? employee?.user?.firstName ?? '';
  const last = employee?.lastName ?? employee?.user?.lastName ?? '';
  const name = `${first} ${last}`.trim();
  return name || employee?.employeeCode || 'Employee unavailable';
}

export function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatDateRange(roster: Pick<ShiftRosterPeriod, 'dateFrom' | 'dateTo'>) {
  return `${formatDateOnly(roster.dateFrom)} - ${formatDateOnly(roster.dateTo)}`;
}

export function scopeLabel(roster: Pick<ShiftRosterPeriod, 'branch' | 'department'>) {
  if (roster.department?.name && roster.branch?.name) return `${roster.branch.name} / ${roster.department.name}`;
  if (roster.department?.name) return roster.department.name;
  if (roster.branch?.name) return roster.branch.name;
  return 'Company-wide';
}

export function rosterDayShiftLabel(day?: ShiftRosterDay | null) {
  if (!day) return 'Unassigned';
  if (day.dayType !== 'WORKING') return dayTypeLabel(day.dayType);
  const name = day.shift?.name ?? day.shiftName ?? day.shift?.code ?? day.shiftCode ?? 'Working shift';
  const start = day.shift?.startTime ?? day.shiftStartTime;
  const end = day.shift?.endTime ?? day.shiftEndTime;
  return start && end ? `${name} (${start}-${end})` : name;
}

export function toLocalDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

export function dateInputFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateInputFromDate(date);
}

export function weekStart(dateInput: string) {
  const date = new Date(`${dateInput}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return dateInputFromDate(date);
}

export function eachDate(from: string, to: string) {
  const result: string[] = [];
  if (!from || !to) return result;
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    result.push(cursor);
    if (result.length > 370) break;
  }
  return result;
}

export function inclusiveDateDuration(from?: string | null, to?: string | null) {
  if (!from || !to || to < from) return null;
  return eachDate(from.slice(0, 10), to.slice(0, 10)).length;
}

export function formatDurationDays(days: number | null) {
  if (!days || days < 1) return '-';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function suggestedRosterCode(name: string, dateFrom: string, existingCode?: string) {
  const date = dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date();
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date).toUpperCase();
  const year = String(date.getFullYear());
  const suffix = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .split('_')
    .filter(Boolean)
    .slice(0, 2)
    .join('_');
  const base = ['RST', month, year, suffix].filter(Boolean).join('-');
  return (existingCode || `${base}-001`).replace(/[^A-Z0-9_-]+/g, '').slice(0, 40);
}
export function localDateForFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function responseBlob(response: unknown) {
  if (response instanceof Blob) return response;
  const maybe = response as { data?: Blob };
  return maybe.data instanceof Blob ? maybe.data : new Blob([String(maybe.data ?? '')], { type: 'text/plain' });
}

import { z } from 'zod';
import type { Holiday, HolidayCalendar, HolidayCalendarFormValues, HolidayCalendarPayload, HolidayCalendarScope, HolidayCalendarSummary, HolidayFormValues, HolidayPayload, HolidayType } from '../types/holiday-calendar.types';

export const holidayTypes: Array<{ value: HolidayType; label: string }> = [
  { value: 'NATIONAL', label: 'National Holiday' },
  { value: 'REGIONAL', label: 'Regional Holiday' },
  { value: 'COMPANY', label: 'Company Holiday' },
  { value: 'OPTIONAL', label: 'Optional Holiday' },
  { value: 'CUSTOM', label: 'Custom Holiday' },
];

export const holidayCalendarScopeOptions: Array<{ value: HolidayCalendarScope; label: string; description: string }> = [
  { value: 'COMPANY', label: 'Entire Company', description: 'Applies company-wide.' },
  { value: 'BRANCH', label: 'Branch', description: 'Applies to one branch.' },
];

export const holidayCalendarSchema = z.object({
  name: z.string().trim().min(2, 'Calendar name is required').max(120, 'Calendar name is too long'),
  year: z.number().int().min(1900, 'Enter a valid year').max(2200, 'Enter a valid year'),
  description: z.string().max(500, 'Description is too long'),
  notes: z.string().max(1000, 'Notes are too long'),
  timezone: z.string().trim().min(1, 'Timezone is required').max(80, 'Timezone is too long'),
  enabled: z.boolean(),
  scope: z.enum(['COMPANY', 'BRANCH']),
  branchId: z.string(),
}).superRefine((values, ctx) => {
  if (values.scope === 'BRANCH' && !values.branchId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['branchId'], message: 'Select a branch.' });
});

export const holidaySchema = z.object({
  name: z.string().trim().min(2, 'Holiday name is required').max(120, 'Holiday name is too long'),
  date: z.string().min(1, 'Holiday date is required'),
  type: z.enum(['NATIONAL', 'REGIONAL', 'COMPANY', 'OPTIONAL', 'CUSTOM']),
  optional: z.boolean(),
  recurring: z.boolean(),
  notes: z.string().max(1000, 'Notes are too long'),
});

export function emptyHolidayCalendarSummary(): HolidayCalendarSummary {
  return { total: 0, active: 0, inactive: 0, companyScope: 0, branchScope: 0, totalHolidays: 0, mandatoryHolidays: 0, optionalHolidays: 0 };
}

export function holidayCalendarDefaults(calendar?: HolidayCalendar): HolidayCalendarFormValues {
  return {
    name: calendar?.name ?? '',
    year: calendar?.year ?? new Date().getFullYear(),
    description: calendar?.description ?? '',
    notes: calendar?.notes ?? '',
    timezone: calendar?.timezone ?? 'Asia/Kolkata',
    enabled: calendar?.enabled ?? true,
    scope: calendar?.branchId ? 'BRANCH' : 'COMPANY',
    branchId: calendar?.branchId ?? '',
  };
}

export function holidayDefaults(holiday?: Holiday): HolidayFormValues {
  return {
    name: holiday?.name ?? '',
    date: dateInput(holiday?.date),
    type: holiday?.type ?? 'COMPANY',
    optional: holiday?.optional ?? false,
    recurring: holiday?.recurring ?? false,
    notes: holiday?.notes ?? '',
  };
}

export function toHolidayCalendarPayload(values: HolidayCalendarFormValues): HolidayCalendarPayload {
  return {
    name: values.name.trim(),
    year: values.year,
    description: values.description.trim() || null,
    notes: values.notes.trim() || null,
    timezone: values.timezone.trim() || 'UTC',
    branchId: values.scope === 'BRANCH' ? values.branchId || null : null,
    enabled: values.enabled,
  };
}

export function toHolidayPayload(values: HolidayFormValues): HolidayPayload {
  return {
    name: values.name.trim(),
    date: values.date,
    type: values.type,
    optional: values.optional,
    recurring: values.recurring,
    notes: values.notes.trim() || null,
  };
}

export function calendarScope(calendar: Pick<HolidayCalendar, 'branchId'>): HolidayCalendarScope {
  return calendar.branchId ? 'BRANCH' : 'COMPANY';
}

export function calendarScopeLabel(calendar: HolidayCalendar) {
  return calendar.branchId ? `Branch - ${calendar.branch?.name ?? 'Selected branch'}` : 'Company-wide';
}

export function holidayTypeLabel(type?: HolidayType | null) {
  return holidayTypes.find((item) => item.value === type)?.label ?? 'Custom Holiday';
}

export function statusLabel(enabled: boolean) {
  return enabled ? 'Active' : 'Inactive';
}

export function mandatoryLabel(optional: boolean) {
  return optional ? 'Optional' : 'Mandatory';
}

export function recurringLabel(recurring: boolean) {
  return recurring ? 'Recurring' : 'One-time';
}

export function dayOfWeek(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'UTC' }).format(date);
}

export function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

export function userLabel(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return 'Not available';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'Not available';
}

export function friendlyHolidayError(error: unknown) {
  const response = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(response)) return response.join(' ');
  if (typeof response === 'string') return response;
  return 'Holiday calendar could not be saved. Check the values and try again.';
}

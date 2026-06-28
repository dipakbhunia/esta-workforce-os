import { z } from 'zod';
import type { Shift, ShiftFormValues, ShiftPayload } from '../types/shift.types';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timezoneOptions = [
  'UTC',
  'Asia/Kolkata',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
];

export const shiftFormSchema = z.object({
  name: z.string().min(2, 'Shift name must be at least 2 characters.').max(120, 'Shift name is too long.'),
  code: z.string().min(1, 'Shift code is required.').max(30, 'Shift code is too long.').regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, underscores, or hyphens only.'),
  startTime: z.string().regex(timePattern, 'Use HH:mm time format.'),
  endTime: z.string().regex(timePattern, 'Use HH:mm time format.'),
  timezone: z.string().min(1, 'Timezone is required.').max(100, 'Timezone is too long.'),
  graceTime: z.string(),
  halfDayRule: z.string(),
  overtimeRule: z.string(),
  lateMarkRule: z.string(),
}).refine((values) => values.startTime !== values.endTime, {
  message: 'Shift start and end times must differ.',
  path: ['endTime'],
});

export function shiftCodeFromName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 30);
}

export function shiftDefaults(shift?: Shift): ShiftFormValues {
  return {
    name: shift?.name ?? '',
    code: shift?.code ?? '',
    startTime: shift?.startTime ?? '09:00',
    endTime: shift?.endTime ?? '18:00',
    timezone: shift?.timezone ?? 'UTC',
    graceTime: '',
    halfDayRule: '',
    overtimeRule: '',
    lateMarkRule: '',
  };
}

export function toShiftPayload(values: ShiftFormValues): ShiftPayload {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
    startTime: values.startTime,
    endTime: values.endTime,
    timezone: values.timezone.trim() || 'UTC',
  };
}

export function calculateWorkingMinutes(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime || !timePattern.test(startTime) || !timePattern.test(endTime)) return null;
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  return end - start;
}

export function formatWorkingHours(startTime?: string | null, endTime?: string | null) {
  const minutes = calculateWorkingMinutes(startTime, endTime);
  if (minutes === null) return '-';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours} ${hours === 1 ? 'Hour' : 'Hours'}`;
  if (hours === 0) return `${remainingMinutes} Minutes`;
  return `${hours} ${hours === 1 ? 'Hour' : 'Hours'} ${remainingMinutes} Minutes`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

import { z } from 'zod';
import type {
  EmployeeLookup,
  ShiftAssignment,
  ShiftAssignmentFormValues,
  ShiftAssignmentPayload,
  ShiftAssignmentStatus,
  ShiftAssignmentType,
} from '../types/shift-assignment.types';

export const assignmentTypeOptions: Array<{ label: string; value: ShiftAssignmentType }> = [
  { label: 'Permanent', value: 'PERMANENT' },
  { label: 'Temporary', value: 'TEMPORARY' },
  { label: 'Rotational', value: 'ROTATIONAL' },
  { label: 'Manual Override', value: 'MANUAL_OVERRIDE' },
];

export const assignmentStatusOptions: Array<{ label: string; value: ShiftAssignmentStatus }> = [
  { label: 'Current', value: 'ACTIVE' },
  { label: 'Future', value: 'SCHEDULED' },
  { label: 'Ended', value: 'ENDED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export const shiftAssignmentSchema = z.object({
  employeeId: z.string().uuid('Select an employee.'),
  shiftId: z.string().uuid('Select a shift.'),
  assignmentType: z.enum(['PERMANENT', 'TEMPORARY', 'ROTATIONAL', 'MANUAL_OVERRIDE']),
  effectiveFrom: z.string().min(1, 'Effective from is required.'),
  effectiveTo: z.string(),
  reason: z.string().max(500, 'Reason must be 500 characters or fewer.'),
  notes: z.string().max(1000, 'Notes must be 1000 characters or fewer.'),
}).superRefine((values, context) => {
  const from = values.effectiveFrom ? new Date(values.effectiveFrom) : null;
  const to = values.effectiveTo ? new Date(values.effectiveTo) : null;
  if (from && Number.isNaN(from.getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveFrom'], message: 'Enter a valid effective from date.' });
  }
  if (to && Number.isNaN(to.getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'Enter a valid effective to date.' });
  }
  if (from && to && to <= from) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'Effective to must be after effective from.' });
  }
});

export function assignmentDefaults(assignment?: ShiftAssignment): ShiftAssignmentFormValues {
  return {
    employeeId: assignment?.employeeId ?? '',
    shiftId: assignment?.shiftId ?? '',
    assignmentType: assignment?.assignmentType ?? 'PERMANENT',
    effectiveFrom: toDateTimeLocal(assignment?.effectiveFrom) ?? '',
    effectiveTo: toDateTimeLocal(assignment?.effectiveTo) ?? '',
    reason: assignment?.reason ?? '',
    notes: assignment?.notes ?? '',
  };
}

export function toAssignmentPayload(values: ShiftAssignmentFormValues): ShiftAssignmentPayload {
  return {
    employeeId: values.employeeId,
    shiftId: values.shiftId,
    assignmentType: values.assignmentType,
    effectiveFrom: new Date(values.effectiveFrom).toISOString(),
    ...(values.effectiveTo ? { effectiveTo: new Date(values.effectiveTo).toISOString() } : {}),
    ...(values.reason.trim() ? { reason: values.reason.trim() } : {}),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
  };
}

export function assignmentStatusLabel(status: ShiftAssignmentStatus) {
  if (status === 'ACTIVE') return 'Current';
  if (status === 'SCHEDULED') return 'Future';
  if (status === 'ENDED') return 'Ended';
  return 'Cancelled';
}

export function assignmentStatusTone(status: ShiftAssignmentStatus) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SCHEDULED') return 'info';
  if (status === 'ENDED') return 'neutral';
  return 'danger';
}

export function friendlyAssignmentError(error: unknown) {
  const response = error && typeof error === 'object' && 'response' in error
    ? (error as { response?: { status?: number; data?: { message?: unknown } } }).response
    : undefined;
  const message = response?.data?.message;
  const firstMessage = Array.isArray(message) ? String(message[0]) : typeof message === 'string' ? message : '';
  if (response?.status === 409 || /overlap|conflict/i.test(firstMessage)) {
    return 'This employee already has an active assignment covering this period.';
  }
  return firstMessage || 'Shift assignment could not be saved. Check the fields and try again.';
}

export function formatAssignmentType(value?: string | null) {
  return (value ?? '-').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Open-ended';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function employeeName(employee?: EmployeeLookup | ShiftAssignment['employee'] | null) {
  if (employee && 'displayName' in employee && employee.displayName) return employee.displayName;
  const user = employee?.user;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  return name || user?.email || 'Employee not available';
}

export function employeeEmail(employee?: EmployeeLookup | ShiftAssignment['employee'] | null) {
  return employee?.user?.email ?? 'Email not available';
}

export function shiftLabel(assignment: ShiftAssignment) {
  const shift = assignment.shift;
  if (!shift) return 'Shift not available';
  return `${shift.name} (${shift.code})`;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

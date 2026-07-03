import { z } from 'zod';
import type { LeaveType, LeaveTypeFormValues, LeaveTypePayload } from '../types/leave.types';

export const leaveTypeFormSchema = z.object({
  name: z.string().trim().min(2, 'Leave type name must be at least 2 characters.').max(100, 'Leave type name is too long.'),
  code: z.string().trim().min(2, 'Code must be at least 2 characters.').max(30, 'Code is too long.').regex(/^[A-Z][A-Z0-9_]*$/, 'Use uppercase letters, numbers, and underscores. Code must start with a letter.'),
  description: z.string().max(500, 'Description must be 500 characters or fewer.'),
  defaultDays: z.number({ message: 'Default days is required.' }).min(0, 'Default days must be 0 or greater.').max(366, 'Default days cannot exceed 366.'),
  requiresApproval: z.boolean(),
  managerCanApprove: z.boolean(),
});

export function leaveTypeCodeFromName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^[^A-Z]+/, '')
    .slice(0, 30);
}

export function leaveTypeDefaults(leaveType?: LeaveType): LeaveTypeFormValues {
  return {
    name: leaveType?.name ?? '',
    code: leaveType?.code ?? '',
    description: leaveType?.description ?? '',
    defaultDays: leaveType?.defaultDays ?? 0,
    requiresApproval: leaveType?.requiresApproval ?? true,
    managerCanApprove: leaveType?.managerCanApprove ?? true,
  };
}

export function toLeaveTypePayload(values: LeaveTypeFormValues): LeaveTypePayload {
  return {
    name: values.name.trim(),
    code: values.code.trim().toUpperCase(),
    ...(values.description.trim() ? { description: values.description.trim() } : {}),
    defaultDays: values.defaultDays,
    requiresApproval: values.requiresApproval,
    managerCanApprove: values.managerCanApprove,
  };
}

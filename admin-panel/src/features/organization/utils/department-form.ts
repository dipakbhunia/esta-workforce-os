import { z } from 'zod';
import type { Department, DepartmentFormValues, DepartmentPayload } from '../types/department.types';

export const departmentFormSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters.').max(120, 'Department name is too long.'),
  code: z.string().min(1, 'Department code is required.').max(30, 'Department code is too long.').regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, underscores, or hyphens only.'),
  branchId: z.string(),
});

export function departmentCodeFromName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 30);
}

export function departmentDefaults(department?: Department): DepartmentFormValues {
  return {
    name: department?.name ?? '',
    code: department?.code ?? '',
    branchId: department?.branchId ?? '',
  };
}

export function toDepartmentPayload(values: DepartmentFormValues): DepartmentPayload {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
    branchId: values.branchId || undefined,
  };
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

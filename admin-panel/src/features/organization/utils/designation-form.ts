import { z } from 'zod';
import type { Designation, DesignationFormValues, DesignationPayload } from '../types/designation.types';

export const designationFormSchema = z.object({
  name: z.string().min(2, 'Designation name must be at least 2 characters.').max(120, 'Designation name is too long.'),
  code: z.string().min(1, 'Designation code is required.').max(30, 'Designation code is too long.').regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, underscores, or hyphens only.'),
  departmentId: z.string(),
});

export function designationCodeFromName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 30);
}

export function designationDefaults(designation?: Designation): DesignationFormValues {
  return {
    name: designation?.name ?? '',
    code: designation?.code ?? '',
    departmentId: designation?.departmentId ?? '',
  };
}

export function toDesignationPayload(values: DesignationFormValues): DesignationPayload {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
    departmentId: values.departmentId || undefined,
  };
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

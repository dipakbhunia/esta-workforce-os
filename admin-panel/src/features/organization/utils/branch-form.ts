import { z } from 'zod';
import type { Branch, BranchFormValues, BranchPayload } from '../types/branch.types';

export const branchFormSchema = z.object({
  name: z.string().min(2, 'Branch name must be at least 2 characters.').max(120, 'Branch name is too long.'),
  code: z.string().min(1, 'Branch code is required.').max(30, 'Branch code is too long.').regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, underscores, or hyphens only.'),
  address: z.string().max(500, 'Address is too long.'),
  city: z.string().max(80),
  state: z.string().max(80),
  country: z.string().max(80),
  postalCode: z.string().max(20),
});

export function branchCodeFromName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 30);
}

export function branchDefaults(branch?: Branch): BranchFormValues {
  return {
    name: branch?.name ?? '',
    code: branch?.code ?? '',
    address: branch?.address ?? '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
  };
}

export function toBranchPayload(values: BranchFormValues): BranchPayload {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
    address: values.address.trim() || undefined,
  };
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

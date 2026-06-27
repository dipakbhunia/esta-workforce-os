import { z } from 'zod';
import type { Company, CompanyFormValues, CompanyPayload } from '../types/company.types';

export const companyFormSchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters.').max(120, 'Company name is too long.'),
  slug: z.string().min(2, 'Company code must be at least 2 characters.').max(80, 'Company code is too long.').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.'),
  email: z.string().email('Enter a valid email.').or(z.literal('')),
  phone: z.string().max(30, 'Phone is too long.'),
  website: z.string().url('Enter a valid URL.').or(z.literal('')),
  country: z.string().max(80),
  timezone: z.string().max(80),
  currency: z.string().max(12),
  address: z.string().max(500),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TRIAL', 'SUSPENDED']),
});

export function slugifyCompanyName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

export function companyDefaults(company?: Company): CompanyFormValues {
  return {
    name: company?.name ?? '',
    slug: company?.slug ?? '',
    email: '',
    phone: '',
    website: '',
    country: '',
    timezone: '',
    currency: '',
    address: '',
    status: company?.status ?? 'ACTIVE',
  };
}

export function toCompanyPayload(values: CompanyFormValues): CompanyPayload {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    status: values.status,
  };
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

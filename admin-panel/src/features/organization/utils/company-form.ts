import axios from 'axios';
import { z } from 'zod';
import type { Company, CompanyFormValues, CompanyPayload } from '../types/company.types';

export const companyFormSchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters.').max(120, 'Company name is too long.'),
  slug: z.string().min(2, 'Company code must be at least 2 characters.').max(80, 'Company code is too long.').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.'),
  primaryEmail: z.string().email('Enter a valid primary email.').or(z.literal('')),
  phone: z.string().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, 'Enter a valid phone number.').or(z.literal('')),
  website: z.string().url('Enter a complete URL, including https://.').or(z.literal('')),
  country: z.string().min(2, 'Country must be at least 2 characters.').max(80).or(z.literal('')),
  timezone: z.string().min(1, 'Timezone is required.').max(100).refine(isValidTimeZone, 'Enter a valid IANA timezone.'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO currency code.').or(z.literal('')),
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
    primaryEmail: company?.primaryEmail ?? '',
    phone: company?.phone ?? '',
    website: company?.website ?? '',
    country: company?.country ?? '',
    timezone: company?.timezone ?? 'UTC',
    currency: company?.currency ?? '',
    address: company?.address ?? '',
    status: company?.status ?? 'ACTIVE',
  };
}

export function toCompanyPayload(values: CompanyFormValues): CompanyPayload {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    primaryEmail: optionalValue(values.primaryEmail),
    phone: optionalValue(values.phone),
    website: optionalValue(values.website),
    country: optionalValue(values.country),
    timezone: values.timezone.trim(),
    currency: optionalValue(values.currency.toUpperCase()),
    address: optionalValue(values.address),
    status: values.status,
  };
}

export function companyErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'The server is unavailable. Check your connection and try again.';
    const message = (error.response.data as { message?: string | string[] })?.message;
    if (Array.isArray(message)) return message.join(' ');
    if (message) return message;
  }
  return fallback;
}

function optionalValue(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

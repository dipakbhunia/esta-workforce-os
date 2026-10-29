import { http } from '@/services/http';
import { z } from 'zod';
import {
  COMPANY_ONBOARDING_READINESS_CATEGORIES,
  COMPANY_ONBOARDING_READINESS_ITEM_IDS,
  COMPANY_ONBOARDING_READINESS_STATUSES,
} from '../types/company.types';
import type { BillingContactConfiguration, BillingContactUser, Company, CompanyCreationResponse, CompanyListParams, CompanyOnboardingReadiness, CompanyPayload, PaginatedResponse } from '../types/company.types';

export function getCompanies(params: CompanyListParams) {
  return http.get<PaginatedResponse<Company>>('/companies', { params });
}

export function getCompany(id: string) {
  return http.get<Company>(`/companies/${id}`);
}

const companyOnboardingReadinessSchema = z.object({
  companyId: z.string().min(1),
  contractVersion: z.literal('1'),
  evaluatedAt: z.iso.datetime(),
  overallStatus: z.enum(COMPANY_ONBOARDING_READINESS_STATUSES),
  blockingCount: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.enum(COMPANY_ONBOARDING_READINESS_ITEM_IDS),
    category: z.enum(COMPANY_ONBOARDING_READINESS_CATEGORIES),
    label: z.string().min(1),
    status: z.enum(COMPANY_ONBOARDING_READINESS_STATUSES),
    blocking: z.boolean(),
    reasonCode: z.string().min(1),
    explanation: z.string().min(1),
    remediation: z.object({
      kind: z.literal('NAVIGATE'),
      label: z.string().min(1),
      route: z.string().min(1),
    }).nullable(),
  })).length(COMPANY_ONBOARDING_READINESS_ITEM_IDS.length).superRefine((items, context) => {
    const ids = new Set(items.map((item) => item.id));
    for (const id of COMPANY_ONBOARDING_READINESS_ITEM_IDS) {
      if (!ids.has(id)) context.addIssue({ code: 'custom', message: `Missing readiness item ${id}` });
    }
  }),
}).strict();

export class UnsupportedCompanyOnboardingReadinessContractError extends Error {
  constructor() {
    super('The Company onboarding readiness contract is not supported.');
    this.name = 'UnsupportedCompanyOnboardingReadinessContractError';
  }
}

export class InvalidCompanyOnboardingReadinessResponseError extends Error {
  constructor() {
    super('The Company onboarding readiness response is invalid.');
    this.name = 'InvalidCompanyOnboardingReadinessResponseError';
  }
}

export async function getCompanyOnboardingReadiness(id: string) {
  const response = await http.get<unknown>(`/companies/${encodeURIComponent(id)}/onboarding-readiness`);
  if (typeof response.data === 'object' && response.data !== null && 'contractVersion' in response.data && response.data.contractVersion !== '1') {
    throw new UnsupportedCompanyOnboardingReadinessContractError();
  }
  const parsed = companyOnboardingReadinessSchema.safeParse(response.data);
  if (!parsed.success) throw new InvalidCompanyOnboardingReadinessResponseError();
  if (parsed.data.companyId !== id) throw new InvalidCompanyOnboardingReadinessResponseError();
  return { ...response, data: parsed.data as CompanyOnboardingReadiness };
}

export function createCompany(payload: CompanyPayload) {
  return http.post<CompanyCreationResponse>('/companies', payload);
}

export function resendInitialAdminInvitation(userId: string) {
  return http.post<{ invitationQueued: boolean }>(`/users/${encodeURIComponent(userId)}/resend-invitation`);
}

export function updateCompany(id: string, payload: CompanyPayload) {
  return http.patch<Company>(`/companies/${id}`, payload);
}

export function deleteCompany(id: string) {
  return http.delete<Company>(`/companies/${id}`);
}

export const getBillingContact = (companyId: string) =>
  http.get<BillingContactConfiguration>(`/companies/${companyId}/billing-contact`);

export const getEligibleBillingContacts = (companyId: string, search?: string) =>
  http.get<BillingContactUser[]>(`/companies/${companyId}/billing-contact/eligible-users`, { params: { search } });

export const updateBillingContact = (companyId: string, billingContactUserId: string | null) =>
  http.patch<BillingContactConfiguration>(`/companies/${companyId}/billing-contact`, { billingContactUserId });

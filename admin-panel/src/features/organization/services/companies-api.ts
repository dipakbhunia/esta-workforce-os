import { http } from '@/services/http';
import type { BillingContactConfiguration, BillingContactUser, Company, CompanyListParams, CompanyPayload, PaginatedResponse } from '../types/company.types';

export function getCompanies(params: CompanyListParams) {
  return http.get<PaginatedResponse<Company>>('/companies', { params });
}

export function getCompany(id: string) {
  return http.get<Company>(`/companies/${id}`);
}

export function createCompany(payload: CompanyPayload) {
  return http.post<Company>('/companies', payload);
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

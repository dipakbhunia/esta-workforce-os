import { http } from '@/services/http';
import type { Company, CompanyListParams, CompanyPayload, PaginatedResponse } from '../types/company.types';

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

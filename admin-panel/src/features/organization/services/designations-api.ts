import { http } from '@/services/http';
import type { Designation, DesignationListParams, DesignationPayload, PaginatedResponse } from '../types/designation.types';

export function getDesignations(params: DesignationListParams) {
  return http.get<PaginatedResponse<Designation>>('/designations', { params });
}

export function getDesignation(id: string) {
  return http.get<Designation>(`/designations/${id}`);
}

export function createDesignation(payload: DesignationPayload) {
  return http.post<Designation>('/designations', payload);
}

export function updateDesignation(id: string, payload: DesignationPayload) {
  return http.patch<Designation>(`/designations/${id}`, payload);
}

export function deleteDesignation(id: string) {
  return http.delete<Designation>(`/designations/${id}`);
}

import { http } from '@/services/http';
import type { Branch, BranchListParams, BranchPayload, PaginatedResponse } from '../types/branch.types';

export function getBranches(params: BranchListParams) {
  return http.get<PaginatedResponse<Branch>>('/branches', { params });
}

export function getBranch(id: string) {
  return http.get<Branch>(`/branches/${id}`);
}

export function createBranch(payload: BranchPayload) {
  return http.post<Branch>('/branches', payload);
}

export function updateBranch(id: string, payload: BranchPayload) {
  return http.patch<Branch>(`/branches/${id}`, payload);
}

export function deleteBranch(id: string) {
  return http.delete<Branch>(`/branches/${id}`);
}

import { http } from '@/services/http';
import type { Department, DepartmentListParams, DepartmentPayload, PaginatedResponse } from '../types/department.types';

export function getDepartments(params: DepartmentListParams) {
  return http.get<PaginatedResponse<Department>>('/departments', { params });
}

export function getDepartment(id: string) {
  return http.get<Department>(`/departments/${id}`);
}

export function createDepartment(payload: DepartmentPayload) {
  return http.post<Department>('/departments', payload);
}

export function updateDepartment(id: string, payload: DepartmentPayload) {
  return http.patch<Department>(`/departments/${id}`, payload);
}

export function deleteDepartment(id: string) {
  return http.delete<Department>(`/departments/${id}`);
}

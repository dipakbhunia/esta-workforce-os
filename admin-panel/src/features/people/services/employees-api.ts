import { http } from '@/services/http';
import type { Employee, EmployeeCreatePayload, EmployeeListParams, EmployeeUpdatePayload, PaginatedResponse } from '../types/employee.types';

export function getEmployees(params: EmployeeListParams) {
  return http.get<PaginatedResponse<Employee>>('/employees', { params });
}

export function getEmployee(id: string) {
  return http.get<Employee>(`/employees/${id}`);
}

export function createEmployee(payload: EmployeeCreatePayload) {
  return http.post<Employee>('/employees', payload);
}

export function updateEmployee(id: string, payload: EmployeeUpdatePayload) {
  return http.patch<Employee>(`/employees/${id}`, payload);
}

export function deleteEmployee(id: string) {
  return http.delete<Employee>(`/employees/${id}`);
}

import { http } from '@/services/http';
import type {
  PaginatedResponse,
  ShiftAssignment,
  ShiftAssignmentListParams,
  ShiftAssignmentPayload,
} from '../types/shift-assignment.types';

export function getShiftAssignments(params: ShiftAssignmentListParams) {
  return http.get<PaginatedResponse<ShiftAssignment>>('/shift-assignments', { params });
}

export function getShiftAssignment(id: string) {
  return http.get<ShiftAssignment>(`/shift-assignments/${id}`);
}

export function createShiftAssignment(payload: ShiftAssignmentPayload) {
  return http.post<ShiftAssignment>('/shift-assignments', payload);
}

export function updateShiftAssignment(id: string, payload: ShiftAssignmentPayload) {
  return http.patch<ShiftAssignment>(`/shift-assignments/${id}`, payload);
}

export function cancelShiftAssignment(id: string) {
  return http.delete<ShiftAssignment>(`/shift-assignments/${id}`);
}

export function getCurrentShiftAssignment(employeeId: string) {
  return http.get<ShiftAssignment | null>(`/shift-assignments/employee/${employeeId}/current`);
}

export function getFutureShiftAssignments(employeeId: string, params: { page: number; limit: number }) {
  return http.get<PaginatedResponse<ShiftAssignment>>(`/shift-assignments/employee/${employeeId}/future`, { params });
}

export function getShiftAssignmentHistory(employeeId: string, params: { page: number; limit: number }) {
  return http.get<PaginatedResponse<ShiftAssignment>>(`/shift-assignments/employee/${employeeId}/history`, { params });
}

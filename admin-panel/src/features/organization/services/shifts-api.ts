import { http } from '@/services/http';
import type { PaginatedResponse, Shift, ShiftListParams, ShiftPayload } from '../types/shift.types';

export function getShifts(params: ShiftListParams) {
  return http.get<PaginatedResponse<Shift>>('/shifts', { params });
}

export function getShift(id: string) {
  return http.get<Shift>(`/shifts/${id}`);
}

export function createShift(payload: ShiftPayload) {
  return http.post<Shift>('/shifts', payload);
}

export function updateShift(id: string, payload: ShiftPayload) {
  return http.patch<Shift>(`/shifts/${id}`, payload);
}

export function deleteShift(id: string) {
  return http.delete<Shift>(`/shifts/${id}`);
}

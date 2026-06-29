import { http } from '@/services/http';
import type { AttendanceListParams, AttendanceRecord, AttendanceSummary, PaginatedResponse } from '../types/attendance.types';

export function getAttendance(params: AttendanceListParams) {
  return http.get<PaginatedResponse<AttendanceRecord>>('/attendance', { params });
}

export function getAttendanceSummary(date?: string) {
  return http.get<AttendanceSummary>('/attendance/summary', { params: date ? { date } : undefined });
}

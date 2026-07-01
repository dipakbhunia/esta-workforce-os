import { http } from '@/services/http';
import type {
  AttendanceDetail,
  AttendanceListParams,
  AttendanceRecord,
  AttendanceSummary,
  AttendanceTimeline,
  PaginatedResponse,
} from '../types/attendance.types';

export function getAttendance(params: AttendanceListParams) {
  return http.get<PaginatedResponse<AttendanceRecord>>('/attendance', { params });
}

export function getAttendanceSummary(date?: string) {
  return http.get<AttendanceSummary>('/attendance/summary', { params: date ? { date } : undefined });
}

export function getAttendanceDetail(id: string) {
  return http.get<AttendanceDetail>(`/attendance/${id}`);
}

export function getAttendanceTimeline(id: string) {
  return http.get<AttendanceTimeline>(`/attendance/${id}/timeline`);
}

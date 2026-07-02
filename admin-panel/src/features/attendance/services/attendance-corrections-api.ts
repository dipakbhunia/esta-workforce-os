import { http } from '@/services/http';
import type {
  AttendanceCorrectionListParams,
  AttendanceCorrectionListResponse,
  AttendanceCorrectionRequest,
  CreateAttendanceCorrectionPayload,
  ReviewAttendanceCorrectionPayload,
} from '../types/attendance-correction.types';

export function getAttendanceCorrections(params: AttendanceCorrectionListParams) {
  return http.get<AttendanceCorrectionListResponse>('/attendance-corrections', { params });
}

export function getAttendanceCorrection(id: string) {
  return http.get<AttendanceCorrectionRequest>(`/attendance-corrections/${id}`);
}

export function createAttendanceCorrection(payload: CreateAttendanceCorrectionPayload) {
  return http.post<AttendanceCorrectionRequest>('/attendance-corrections', payload);
}

export function reviewAttendanceCorrection(id: string, payload: ReviewAttendanceCorrectionPayload) {
  return http.patch<AttendanceCorrectionRequest>(`/attendance-corrections/${id}/review`, payload);
}

export function cancelAttendanceCorrection(id: string) {
  return http.patch<AttendanceCorrectionRequest>(`/attendance-corrections/${id}/cancel`);
}

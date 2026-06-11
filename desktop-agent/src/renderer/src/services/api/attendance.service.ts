import type {
  AttendanceRecord,
  PaginatedResponse,
} from '../../types/api';
import { apiClient } from './api-client';

function today(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export const attendanceService = {
  async getToday(): Promise<AttendanceRecord | null> {
    const date = today();
    const response = await apiClient.request<
      PaginatedResponse<AttendanceRecord>
    >(`/attendance?dateFrom=${date}&dateTo=${date}&limit=1`);
    return response.data[0] ?? null;
  },

  punchIn: () =>
    apiClient.request<AttendanceRecord>('/attendance/punch-in', {
      method: 'POST',
      body: JSON.stringify({ note: 'Desktop agent' }),
    }),

  punchOut: () =>
    apiClient.request<AttendanceRecord>('/attendance/punch-out', {
      method: 'POST',
      body: JSON.stringify({ note: 'Desktop agent' }),
    }),

  breakStart: () =>
    apiClient.request<AttendanceRecord>('/attendance/break-start', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  breakEnd: () =>
    apiClient.request<AttendanceRecord>('/attendance/break-end', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

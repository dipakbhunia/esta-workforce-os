import { http } from '@/services/http';
import type {
  BulkShiftRosterDaysPayload,
  PaginatedResponse,
  ResolveDayResponse,
  RosterPreviewResponse,
  ShiftRosterDay,
  ShiftRosterDayListParams,
  ShiftRosterDayPayload,
  ShiftRosterListResponse,
  ShiftRosterPeriod,
  ShiftRosterPeriodListParams,
  ShiftRosterPeriodPayload,
} from '../types/shift-roster.types';

export function getShiftRosters(params: ShiftRosterPeriodListParams) {
  return http.get<ShiftRosterListResponse>('/shift-rosters', { params });
}

export function exportShiftRosters(params: Omit<ShiftRosterPeriodListParams, 'page' | 'limit'>) {
  return http.get<Blob>('/shift-rosters/export', { params: { ...params, format: 'CSV' }, responseType: 'blob' });
}

export function getShiftRoster(id: string) {
  return http.get<ShiftRosterPeriod>(`/shift-rosters/${id}`);
}

export function createShiftRoster(payload: ShiftRosterPeriodPayload) {
  return http.post<ShiftRosterPeriod>('/shift-rosters', payload);
}

export function updateShiftRoster(id: string, payload: Partial<ShiftRosterPeriodPayload>) {
  return http.patch<ShiftRosterPeriod>(`/shift-rosters/${id}`, payload);
}

export function getShiftRosterDays(id: string, params: ShiftRosterDayListParams) {
  return http.get<PaginatedResponse<ShiftRosterDay>>(`/shift-rosters/${id}/days`, { params });
}

export async function getShiftRosterDaysForCalendar(
  id: string,
  params: Omit<ShiftRosterDayListParams, 'page' | 'limit'>,
) {
  const pageSize = 100;
  const firstPage = await getShiftRosterDays(id, { ...params, page: 1, limit: pageSize });
  const totalPages = firstPage.data.meta.totalPages;
  if (totalPages <= 1) return firstPage.data.data;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getShiftRosterDays(id, { ...params, page: index + 2, limit: pageSize }),
    ),
  );
  const days = [firstPage, ...remainingPages].flatMap((response) => response.data.data);
  return Array.from(new Map(days.map((day) => [day.id, day])).values());
}

export function exportShiftRosterDays(id: string, params: Omit<ShiftRosterDayListParams, 'page' | 'limit'>) {
  return http.get<Blob>(`/shift-rosters/${id}/days/export`, { params: { ...params, format: 'CSV' }, responseType: 'blob' });
}

export function upsertShiftRosterDay(id: string, payload: ShiftRosterDayPayload) {
  return http.post<ShiftRosterDay>(`/shift-rosters/${id}/days`, payload);
}

export function bulkUpsertShiftRosterDays(id: string, payload: BulkShiftRosterDaysPayload) {
  return http.post<{ data: ShiftRosterDay[]; count: number }>(`/shift-rosters/${id}/days/bulk`, payload);
}

export function deleteShiftRosterDay(id: string, dayId: string) {
  return http.delete<ShiftRosterDay>(`/shift-rosters/${id}/days/${dayId}`);
}

export function previewShiftRoster(id: string) {
  return http.post<RosterPreviewResponse>(`/shift-rosters/${id}/preview`);
}

export function publishShiftRoster(id: string) {
  return http.post<ShiftRosterPeriod>(`/shift-rosters/${id}/publish`);
}

export function lockShiftRoster(id: string) {
  return http.post<ShiftRosterPeriod>(`/shift-rosters/${id}/lock`);
}

export function resolveSchedulingDay(params: { employeeId: string; workDate?: string; timestamp?: string }) {
  return http.get<ResolveDayResponse>('/scheduling/resolve-day', { params });
}

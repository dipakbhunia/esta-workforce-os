import { http } from '@/services/http';
import type { Holiday, HolidayCalendar, HolidayCalendarListParams, HolidayCalendarListResponse, HolidayCalendarPayload, HolidayListParams, HolidayListResponse, HolidayPayload } from '../types/holiday-calendar.types';

export function getHolidayCalendars(params: HolidayCalendarListParams) {
  return http.get<HolidayCalendarListResponse>('/holiday-calendars', { params });
}

export function exportHolidayCalendars(params: Omit<HolidayCalendarListParams, 'page' | 'limit'>) {
  return http.get<Blob>('/holiday-calendars/export', { params: { ...params, format: 'CSV' }, responseType: 'blob' });
}

export function getHolidayCalendar(id: string) {
  return http.get<HolidayCalendar>(`/holiday-calendars/${id}`);
}

export function createHolidayCalendar(payload: HolidayCalendarPayload) {
  return http.post<HolidayCalendar>('/holiday-calendars', payload);
}

export function updateHolidayCalendar(id: string, payload: Partial<HolidayCalendarPayload>) {
  return http.patch<HolidayCalendar>(`/holiday-calendars/${id}`, payload);
}

export function deleteHolidayCalendar(id: string) {
  return http.delete<HolidayCalendar>(`/holiday-calendars/${id}`);
}

export function getHolidays(calendarId: string, params: HolidayListParams) {
  return http.get<HolidayListResponse>(`/holiday-calendars/${calendarId}/holidays`, { params });
}

export function exportHolidays(calendarId: string, params: Omit<HolidayListParams, 'page' | 'limit'>) {
  return http.get<Blob>(`/holiday-calendars/${calendarId}/holidays/export`, { params: { ...params, format: 'CSV' }, responseType: 'blob' });
}

export function getHoliday(calendarId: string, holidayId: string) {
  return http.get<Holiday>(`/holiday-calendars/${calendarId}/holidays/${holidayId}`);
}

export function createHoliday(calendarId: string, payload: HolidayPayload) {
  return http.post<Holiday>(`/holiday-calendars/${calendarId}/holidays`, payload);
}

export function updateHoliday(calendarId: string, holidayId: string, payload: Partial<HolidayPayload>) {
  return http.patch<Holiday>(`/holiday-calendars/${calendarId}/holidays/${holidayId}`, payload);
}

export function deleteHoliday(calendarId: string, holidayId: string) {
  return http.delete<Holiday>(`/holiday-calendars/${calendarId}/holidays/${holidayId}`);
}

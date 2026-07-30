import { http } from '@/services/http';
import type { NotificationListResponse, NotificationPreference, NotificationPreferencePayload, NotificationQueryParams, NotificationRecord, NotificationUnreadCountResponse } from '../types/notification.types';

export function getNotifications(params: NotificationQueryParams) {
  return http.get<NotificationListResponse>('/notifications', { params });
}

export function getNotificationUnreadCount() {
  return http.get<NotificationUnreadCountResponse>('/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return http.patch<NotificationRecord>(`/notifications/${id}/read`);
}

export function markNotificationUnread(id: string) {
  return http.patch<NotificationRecord>(`/notifications/${id}/unread`);
}

export function markAllNotificationsRead() {
  return http.post<{ updated: number }>('/notifications/read-all');
}

export function getMyNotificationPreferences() {
  return http.get<NotificationPreference>('/notification-preferences/me');
}

export function updateMyNotificationPreferences(payload: NotificationPreferencePayload) {
  return http.patch<NotificationPreference>('/notification-preferences/me', payload);
}

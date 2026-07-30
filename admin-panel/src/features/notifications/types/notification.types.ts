export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type NotificationType = 'ALERT_OPENED' | 'ALERT_REOPENED' | 'ALERT_ACKNOWLEDGED' | 'ALERT_RESOLVED' | 'ALERT_AUTO_RESOLVED';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity | null;
  readAt?: string | null;
  createdAt: string;
  alertId?: string | null;
  alertStatus?: string | null;
  employee?: { id: string; employeeCode: string; name: string; email: string } | null;
  device?: { id: string; name: string; platform: string } | null;
  detailsPath?: string | null;
}

export interface NotificationQueryParams {
  page?: number;
  limit?: number;
  pageSize?: number;
  read?: boolean;
  severity?: NotificationSeverity;
  type?: NotificationType;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface NotificationListResponse {
  data: NotificationRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary: { unread: number; criticalUnread: number; totalFiltered: number };
}

export interface NotificationUnreadCountResponse {
  unread: number;
  criticalUnread: number;
}

export interface NotificationPreference {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  criticalAlerts: boolean;
  warningAlerts: boolean;
  infoAlerts: boolean;
  alertOpened: boolean;
  alertResolved: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string | null;
}

export type NotificationPreferencePayload = NotificationPreference;

export const EMAIL_DELIVERY_STATUSES = ['PENDING', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;
export const EMAIL_EVENT_TYPES = ['ALERT_OPENED', 'ALERT_REOPENED', 'ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'ALERT_AUTO_RESOLVED'] as const;
export type EmailDeliveryStatus = typeof EMAIL_DELIVERY_STATUSES[number];
export type EmailEventType = typeof EMAIL_EVENT_TYPES[number];

export interface EmailCapability {
  enabled: boolean;
  configured: boolean;
  fromEmailConfigured: boolean;
}

export interface PlatformEmailDelivery {
  deliveryId: string;
  notificationId: string;
  companyId: string | null;
  recipientUserId: string;
  eventType: EmailEventType;
  channel: 'EMAIL';
  status: EmailDeliveryStatus;
  recipient: string;
  attemptCount: number;
  isClaimed: boolean;
  claimExpiresAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  safeErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailDeliveryQuery {
  page: number;
  limit: number;
  status?: EmailDeliveryStatus;
  companyId?: string;
  recipient?: string;
  eventType?: EmailEventType;
  from?: string;
  to?: string;
}

export interface EmailDeliveryListResponse {
  data: PlatformEmailDelivery[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

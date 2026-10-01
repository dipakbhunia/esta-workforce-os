import { Prisma } from '@prisma/client';
import { safeEmailErrorEvidence } from '../notifications/email-notification-channel.service';

export const platformEmailDeliverySelect = {
  id: true,
  notificationId: true,
  channel: true,
  recipient: true,
  status: true,
  attemptCount: true,
  lastAttemptAt: true,
  nextRetryAt: true,
  sentAt: true,
  failedAt: true,
  errorCode: true,
  safeErrorMessage: true,
  providerMessageId: true,
  claimToken: true,
  claimExpiresAt: true,
  createdAt: true,
  updatedAt: true,
  notification: { select: { companyId: true, userId: true, type: true } },
} satisfies Prisma.NotificationDeliverySelect;

export type PlatformEmailDeliveryRow = Prisma.NotificationDeliveryGetPayload<{ select: typeof platformEmailDeliverySelect }>;

export function mapPlatformEmailDelivery(row: PlatformEmailDeliveryRow) {
  const safeError = row.errorCode || row.safeErrorMessage ? safeEmailErrorEvidence(row.errorCode) : null;
  return {
    deliveryId: row.id,
    notificationId: row.notificationId,
    companyId: row.notification.companyId,
    recipientUserId: row.notification.userId,
    eventType: row.notification.type,
    channel: row.channel,
    status: row.status,
    recipient: row.recipient,
    attemptCount: row.attemptCount,
    isClaimed: row.claimToken !== null,
    claimExpiresAt: row.claimExpiresAt,
    lastAttemptAt: row.lastAttemptAt,
    nextRetryAt: row.nextRetryAt,
    sentAt: row.sentAt,
    failedAt: row.failedAt,
    providerMessageId: row.providerMessageId,
    errorCode: safeError?.code ?? null,
    safeErrorMessage: safeError?.message ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

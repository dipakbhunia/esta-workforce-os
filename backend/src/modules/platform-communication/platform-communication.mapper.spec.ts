import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';
import { mapPlatformEmailDelivery } from './platform-communication.mapper';

describe('platform communication delivery mapper', () => {
  it('returns the bounded projection without claim token or notification content', () => {
    const now = new Date();
    const mapped = mapPlatformEmailDelivery({ id: 'delivery', notificationId: 'notification', channel: NotificationChannel.EMAIL,
      recipient: 'recipient@example.test', status: NotificationStatus.PENDING, attemptCount: 1, lastAttemptAt: now,
      nextRetryAt: null, sentAt: null, failedAt: null, errorCode: null, safeErrorMessage: null, providerMessageId: null,
      claimToken: '00000000-0000-4000-8000-000000000001', claimExpiresAt: now, createdAt: now, updatedAt: now,
      notification: { companyId: 'company', userId: 'user', type: NotificationType.ALERT_OPENED } });
    assert.equal(mapped.isClaimed, true);
    assert.equal(mapped.recipientUserId, 'user');
    assert.equal('claimToken' in mapped, false);
    assert.equal('notification' in mapped, false);
    assert.equal('title' in mapped, false);
    assert.equal('message' in mapped, false);
  });
});

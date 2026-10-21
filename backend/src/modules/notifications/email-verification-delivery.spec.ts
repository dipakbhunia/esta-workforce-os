import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationStatus, NotificationType } from '@prisma/client';
import { EmailNotificationChannel, StaleAccountInvitationDeliveryError, StaleEmailVerificationDeliveryError } from './email-notification-channel.service';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('email verification stale-delivery handling', () => {
  it('cancels stale verification authority without SMTP retries', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const delivery = {
      id: 'delivery-1', notificationId: 'notification-1', status: NotificationStatus.PENDING,
      claimToken: '11111111-1111-4111-8111-111111111111', attemptCount: 1,
      notification: { id: 'notification-1', type: NotificationType.EMAIL_VERIFICATION },
    } as never;
    const prisma = {
      $transaction: async (callback: (tx: unknown) => unknown) => callback({
        notificationDelivery: { updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data); return { count: 1 };
        } },
        notification: { update: async () => ({}) },
      }),
    };
    const channel = {
      isEnabled: () => true,
      send: async () => { throw new StaleEmailVerificationDeliveryError(); },
      sanitizeError: () => { throw new Error('stale authority must not become a provider retry'); },
    };
    const service = new NotificationDeliveryService(prisma as never, channel as never, {} as never);
    await (service as unknown as { deliverClaimedEmail(value: unknown): Promise<void> }).deliverClaimedEmail(delivery);
    assert.equal(updates[0]?.status, NotificationStatus.CANCELLED);
    assert.equal(updates[0]?.nextRetryAt, null);
  });

  it('uses a distinct non-secret error type for stale verification authority', () => {
    const error = new StaleEmailVerificationDeliveryError();
    assert.doesNotMatch(error.message, /token|recipient|@|revision/i);
    assert.ok(error instanceof Error);
    assert.equal(EmailNotificationChannel.name, 'EmailNotificationChannel');
  });

  it('cancels stale invitation authority without converting it into a provider retry', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const delivery = {
      id: 'delivery-2', notificationId: 'notification-2', status: NotificationStatus.PENDING,
      claimToken: '22222222-2222-4222-8222-222222222222', attemptCount: 1,
      notification: { id: 'notification-2', type: NotificationType.ACCOUNT_INVITATION },
    } as never;
    const prisma = {
      $transaction: async (callback: (tx: unknown) => unknown) => callback({
        notificationDelivery: { updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data); return { count: 1 };
        } },
        notification: { update: async () => ({}) },
      }),
    };
    const channel = {
      isEnabled: () => true,
      send: async () => { throw new StaleAccountInvitationDeliveryError(); },
      sanitizeError: () => { throw new Error('stale invitation must not become a provider retry'); },
    };
    const service = new NotificationDeliveryService(prisma as never, channel as never, {} as never);
    await (service as unknown as { deliverClaimedEmail(value: unknown): Promise<void> }).deliverClaimedEmail(delivery);
    assert.equal(updates[0]?.status, NotificationStatus.CANCELLED);
    assert.equal(updates[0]?.nextRetryAt, null);
    const error = new StaleAccountInvitationDeliveryError();
    assert.doesNotMatch(error.message, /token|recipient|@|revision/i);
  });
});

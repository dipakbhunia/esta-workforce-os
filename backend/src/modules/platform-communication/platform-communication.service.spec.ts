import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';
import { PlatformCommunicationService } from './platform-communication.service';

const row = (overrides: Record<string, unknown> = {}) => ({ id: 'delivery', notificationId: 'notification',
  channel: NotificationChannel.EMAIL, recipient: 'person@example.test', status: NotificationStatus.PENDING,
  attemptCount: 0, lastAttemptAt: null, nextRetryAt: null, sentAt: null, failedAt: null, errorCode: null,
  safeErrorMessage: null, providerMessageId: null, claimToken: null, claimExpiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  notification: { companyId: '00000000-0000-4000-8000-000000000001', userId: 'user', type: NotificationType.ALERT_OPENED }, ...overrides });

describe('PlatformCommunicationService', () => {
  it('uses repeatable-read bounded queries, fixed EMAIL scope, exact filters, and deterministic ordering', async () => {
    let findArgs: Record<string, unknown> | undefined;
    let isolation: unknown;
    const tx = { notificationDelivery: { findMany: async (args: Record<string, unknown>) => { findArgs = args; return [row()]; }, count: async () => 1 } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown, options: { isolationLevel: unknown }) => {
      isolation = options.isolationLevel; return callback(tx);
    } };
    const service = new PlatformCommunicationService(prisma as never, { emailCapability: () => ({ enabled: false, configured: false, fromEmailConfigured: false }) } as never);
    const result = await service.findDeliveries({ page: 2, limit: 10, status: NotificationStatus.PENDING,
      companyId: '00000000-0000-4000-8000-000000000001', recipient: 'person@example.test',
      eventType: NotificationType.ALERT_OPENED, from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
    assert.equal(isolation, 'RepeatableRead');
    assert.deepEqual(findArgs?.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.equal(findArgs?.skip, 10);
    assert.equal((findArgs?.where as { channel: NotificationChannel }).channel, NotificationChannel.EMAIL);
    assert.equal(result.data[0].deliveryId, 'delivery');
    assert.deepEqual(result.meta, { page: 2, limit: 10, total: 1, totalPages: 1 });
  });

  it('returns a bounded detail and established not-found behavior', async () => {
    const prisma = { notificationDelivery: { findFirst: async ({ where }: { where: { id: string } }) => where.id === 'found' ? row() : null } };
    const service = new PlatformCommunicationService(prisma as never, {} as never);
    const found = await service.findDelivery('found');
    assert.equal(found.deliveryId, 'delivery');
    assert.equal('claimToken' in found, false);
    await assert.rejects(() => service.findDelivery('missing'), NotFoundException);
  });
});

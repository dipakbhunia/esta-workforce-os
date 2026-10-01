import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Notification, NotificationChannel, NotificationDelivery, NotificationStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { EmailDeliveryResult, EmailNotificationChannel, SafeEmailError } from './email-notification-channel.service';

const maxAttempts = 5;
const leaseMilliseconds = 5 * 60_000;
const batchLimit = 25;

export type ClaimedNotificationDelivery = NotificationDelivery & { notification: Notification };

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);
  private processing = false;

  constructor(private readonly prisma: PrismaService, private readonly emailChannel: EmailNotificationChannel) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingDeliveries() {
    if (this.processing) return;
    this.processing = true;
    try {
      for (let processed = 0; processed < batchLimit; processed += 1) {
        const delivery = await this.claimNextDelivery();
        if (!delivery) break;
        await this.deliverClaimedEmail(delivery).catch(() => {
          this.logger.warn(`Notification delivery ${delivery.id} failed safely`);
        });
      }
    } finally {
      this.processing = false;
    }
  }

  async deliverEmail(deliveryId: string): Promise<void> {
    const delivery = await this.claimNextDelivery(deliveryId);
    if (delivery) await this.deliverClaimedEmail(delivery);
  }

  async claimNextDelivery(deliveryId?: string, now = new Date()): Promise<ClaimedNotificationDelivery | null> {
    const claimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + leaseMilliseconds);
    const rows = await this.prisma.$transaction((tx) => tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH candidate AS (
        SELECT "id"
        FROM "NotificationDelivery"
        WHERE "channel" = 'EMAIL'::"NotificationChannel"
          AND "status" = 'PENDING'::"NotificationStatus"
          AND "attemptCount" < ${maxAttempts}
          AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= ${now})
          AND ("claimToken" IS NULL OR "claimExpiresAt" <= ${now})
          ${deliveryId ? Prisma.sql`AND "id" = ${deliveryId}::uuid` : Prisma.empty}
        ORDER BY "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "NotificationDelivery" AS delivery
      SET "claimToken" = ${claimToken}::uuid,
          "claimExpiresAt" = ${claimExpiresAt},
          "lastAttemptAt" = ${now},
          "attemptCount" = delivery."attemptCount" + 1,
          "updatedAt" = ${now}
      FROM candidate
      WHERE delivery."id" = candidate."id"
      RETURNING delivery."id"
    `));
    if (!rows[0]) return null;
    return this.prisma.notificationDelivery.findFirst({ where: { id: rows[0].id, claimToken }, include: { notification: true } });
  }

  async finalizeClaimSuccess(delivery: ClaimedNotificationDelivery, result: EmailDeliveryResult, now = new Date()): Promise<boolean> {
    return this.finalizeOwned(delivery, {
      status: NotificationStatus.DELIVERED, sentAt: now, failedAt: null, nextRetryAt: null,
      errorCode: null, safeErrorMessage: null, providerMessageId: result.providerMessageId ?? null,
      claimToken: null, claimExpiresAt: null,
    }, NotificationStatus.DELIVERED);
  }

  async finalizeClaimFailure(delivery: ClaimedNotificationDelivery, error: SafeEmailError, now = new Date()): Promise<boolean> {
    const exhausted = delivery.attemptCount >= maxAttempts;
    return this.finalizeOwned(delivery, {
      status: exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING,
      failedAt: now,
      nextRetryAt: exhausted ? null : new Date(now.getTime() + Math.pow(2, delivery.attemptCount - 1) * 60_000),
      errorCode: error.code, safeErrorMessage: error.message, claimToken: null, claimExpiresAt: null,
    }, exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING);
  }

  async finalizeClaimCancellation(delivery: ClaimedNotificationDelivery, now = new Date()): Promise<boolean> {
    return this.finalizeOwned(delivery, {
      status: NotificationStatus.CANCELLED, failedAt: now, nextRetryAt: null,
      errorCode: 'SMTP_DISABLED', safeErrorMessage: 'Email delivery is disabled or not configured.',
      claimToken: null, claimExpiresAt: null,
    }, NotificationStatus.CANCELLED);
  }

  private async deliverClaimedEmail(delivery: ClaimedNotificationDelivery): Promise<void> {
    if (!this.emailChannel.isEnabled()) {
      await this.finalizeClaimCancellation(delivery);
      return;
    }
    try {
      const result = await this.emailChannel.send(delivery.notification, delivery.recipient);
      if (result.skipped) await this.finalizeClaimCancellation(delivery);
      else await this.finalizeClaimSuccess(delivery, result);
    } catch (error) {
      await this.finalizeClaimFailure(delivery, this.emailChannel.sanitizeError(error));
    }
  }

  private async finalizeOwned(
    delivery: ClaimedNotificationDelivery,
    data: Prisma.NotificationDeliveryUpdateManyMutationInput,
    notificationStatus: NotificationStatus,
  ): Promise<boolean> {
    if (!delivery.claimToken) return false;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationDelivery.updateMany({
        where: { id: delivery.id, status: NotificationStatus.PENDING, claimToken: delivery.claimToken },
        data,
      });
      if (updated.count !== 1) return false;
      await tx.notification.update({ where: { id: delivery.notificationId }, data: { status: notificationStatus } });
      return true;
    });
  }
}

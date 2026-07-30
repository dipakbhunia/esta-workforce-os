import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailNotificationChannel } from './email-notification-channel.service';

const maxAttempts = 5;

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailChannel: EmailNotificationChannel,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingDeliveries() {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      const deliveries = await this.prisma.notificationDelivery.findMany({
        where: {
          channel: NotificationChannel.EMAIL,
          status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
          attemptCount: { lt: maxAttempts },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        include: { notification: true },
        orderBy: { createdAt: 'asc' },
        take: 25,
      });
      for (const delivery of deliveries) {
        await this.deliverEmail(delivery.id).catch((error) => {
          this.logger.warn(`Notification delivery ${delivery.id} failed safely: ${String(error?.message ?? error)}`);
        });
      }
    } finally {
      this.processing = false;
    }
  }

  async deliverEmail(deliveryId: string) {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { notification: true },
    });
    if (!delivery || delivery.channel !== NotificationChannel.EMAIL) return;
    if (delivery.status === NotificationStatus.DELIVERED || delivery.status === NotificationStatus.CANCELLED) return;

    const now = new Date();
    if (!this.emailChannel.isEnabled()) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: NotificationStatus.CANCELLED,
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
          failedAt: now,
          safeErrorMessage: 'Email notifications are disabled or SMTP is incomplete',
        },
      });
      await this.prisma.notification.update({ where: { id: delivery.notificationId }, data: { status: NotificationStatus.CANCELLED } });
      return;
    }

    try {
      const result = await this.emailChannel.send(delivery.notification, delivery.recipient);
      if (result.skipped) {
        await this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: NotificationStatus.CANCELLED, safeErrorMessage: result.safeReason, lastAttemptAt: now, failedAt: now } });
        await this.prisma.notification.update({ where: { id: delivery.notificationId }, data: { status: NotificationStatus.CANCELLED } });
        return;
      }
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: NotificationStatus.DELIVERED, attemptCount: { increment: 1 }, lastAttemptAt: now, sentAt: now, failedAt: null, errorCode: null, safeErrorMessage: null, providerMessageId: result.providerMessageId ?? null },
      });
      await this.prisma.notification.update({ where: { id: delivery.notificationId }, data: { status: NotificationStatus.DELIVERED } });
    } catch (error) {
      const safe = this.emailChannel.sanitizeError(error);
      const nextAttempt = delivery.attemptCount + 1;
      const exhausted = nextAttempt >= maxAttempts;
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING,
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
          failedAt: now,
          nextRetryAt: exhausted ? null : new Date(now.getTime() + Math.pow(2, nextAttempt - 1) * 60_000),
          errorCode: safe.code,
          safeErrorMessage: safe.message,
        },
      });
      await this.prisma.notification.update({ where: { id: delivery.notificationId }, data: { status: exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING } });
    }
  }
}

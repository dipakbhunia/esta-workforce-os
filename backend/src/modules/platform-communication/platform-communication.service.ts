import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformEmailDeliveryQueryDto } from './dto/platform-email-delivery-query.dto';
import { mapPlatformEmailDelivery, platformEmailDeliverySelect } from './platform-communication.mapper';

@Injectable()
export class PlatformCommunicationService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  capability() { return this.notifications.emailCapability(); }

  async findDeliveries(query: PlatformEmailDeliveryQueryDto) {
    const where: Prisma.NotificationDeliveryWhereInput = {
      channel: NotificationChannel.EMAIL,
      ...(query.status ? { status: query.status } : {}),
      ...(query.recipient ? { recipient: query.recipient } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lt: new Date(query.to) } : {}) } } : {}),
      ...(query.companyId || query.eventType ? { notification: { ...(query.companyId ? { companyId: query.companyId } : {}), ...(query.eventType ? { type: query.eventType } : {}) } } : {}),
    };
    const page = query.page;
    const limit = query.limit;
    const [data, total] = await this.prisma.$transaction(async (tx) => Promise.all([
      tx.notificationDelivery.findMany({
        where, select: platformEmailDeliverySelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit, take: limit,
      }),
      tx.notificationDelivery.count({ where }),
    ]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { data: data.map(mapPlatformEmailDelivery), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findDelivery(id: string) {
    const row = await this.prisma.notificationDelivery.findFirst({
      where: { id, channel: NotificationChannel.EMAIL }, select: platformEmailDeliverySelect,
    });
    if (!row) throw new NotFoundException('Email delivery not found');
    return mapPlatformEmailDelivery(row);
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MonitoringAlertEventType, MonitoringAlertSeverity, NotificationChannel, NotificationStatus, NotificationType, Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { NotificationDeliveryQueryDto, NotificationPreferenceUpdateDto, NotificationQueryDto } from './dto/notification.dto';
import { EmailNotificationChannel } from './email-notification-channel.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationRecipientResolver } from './notification-recipient-resolver.service';

type AlertForNotification = Prisma.MonitoringAlertGetPayload<{ include: ReturnType<NotificationsService['alertInclude']> }>;
type NotificationWithAlert = Prisma.NotificationGetPayload<{ include: ReturnType<NotificationsService['notificationInclude']> }>;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: NotificationRecipientResolver,
    private readonly preferences: NotificationPreferenceService,
    private readonly emailChannel: EmailNotificationChannel,
  ) {}

  async handleAlertEvent(alertId: string, eventType: MonitoringAlertEventType): Promise<void> {
    const notificationType = this.notificationType(eventType);
    if (!notificationType) return;
    const alert = await this.prisma.monitoringAlert.findUnique({ where: { id: alertId }, include: this.alertInclude() });
    if (!alert) return;
    const recipients = await this.recipients.resolveForAlert({ companyId: alert.companyId, employeeId: alert.employeeId, severity: alert.severity });
    for (const recipient of recipients) {
      const preference = await this.preferences.getEffective(recipient.userId);
      if (!this.preferences.allowsSeverity(preference, alert.severity) || !this.preferences.allowsLifecycle(preference, notificationType)) continue;
      if (preference.inAppEnabled) await this.createNotification(alert, recipient.userId, NotificationChannel.IN_APP, notificationType, NotificationStatus.DELIVERED);
      if (this.shouldCreateEmail(alert.severity, notificationType, preference.emailEnabled)) {
        const delayUntil = this.emailRetryStart(alert.severity, preference.quietHoursStart, preference.quietHoursEnd);
        await this.createNotification(alert, recipient.userId, NotificationChannel.EMAIL, notificationType, NotificationStatus.PENDING, recipient.email, delayUntil);
      }
    }
  }

  async list(query: NotificationQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = Math.min(100, Math.max(1, query.pageSize ?? query.limit ?? 20));
    const where = this.notificationWhere(query, actor.id);
    const [data, total, unread, criticalUnread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, include: this.notificationInclude(), orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: actor.id, channel: NotificationChannel.IN_APP, readAt: null } }),
      this.prisma.notification.count({ where: { userId: actor.id, channel: NotificationChannel.IN_APP, readAt: null, severity: MonitoringAlertSeverity.CRITICAL } }),
    ]);
    return {
      data: data.map((notification) => this.toResponse(notification)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: { unread, criticalUnread, totalFiltered: total },
    };
  }

  async unreadCount(actor: AuthenticatedUser) {
    const [unread, criticalUnread] = await Promise.all([
      this.prisma.notification.count({ where: { userId: actor.id, channel: NotificationChannel.IN_APP, readAt: null } }),
      this.prisma.notification.count({ where: { userId: actor.id, channel: NotificationChannel.IN_APP, readAt: null, severity: MonitoringAlertSeverity.CRITICAL } }),
    ]);
    return { unread, criticalUnread };
  }

  async markRead(notificationId: string, actor: AuthenticatedUser) {
    await this.assertOwnNotification(notificationId, actor.id);
    const updated = await this.prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() }, include: this.notificationInclude() });
    return this.toResponse(updated);
  }

  async markUnread(notificationId: string, actor: AuthenticatedUser) {
    await this.assertOwnNotification(notificationId, actor.id);
    const updated = await this.prisma.notification.update({ where: { id: notificationId }, data: { readAt: null }, include: this.notificationInclude() });
    return this.toResponse(updated);
  }

  async markAllRead(actor: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({ where: { userId: actor.id, channel: NotificationChannel.IN_APP, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }

  async getPreference(actor: AuthenticatedUser) {
    const preference = await this.preferences.getOrCreate(actor.id, actor.companyId);
    return this.toPreference(preference);
  }

  async updatePreference(actor: AuthenticatedUser, dto: NotificationPreferenceUpdateDto) {
    const preference = await this.preferences.update(actor.id, actor.companyId, dto);
    return this.toPreference(preference);
  }

  async listDeliveries(query: NotificationDeliveryQueryDto, actor: AuthenticatedUser) {
    if (!actor.roles.includes(RoleName.SUPER_ADMIN) && !actor.roles.includes(RoleName.COMPANY_ADMIN)) {
      throw new ForbiddenException('Notification delivery diagnostics are not allowed for this role');
    }
    const page = query.page ?? 1;
    const limit = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const filters: Prisma.NotificationDeliveryWhereInput[] = [];
    if (query.status) filters.push({ status: query.status });
    if (query.channel) filters.push({ channel: query.channel });
    if (query.recipient?.trim()) filters.push({ recipient: { contains: query.recipient.trim(), mode: 'insensitive' } });
    if (query.dateFrom || query.dateTo) filters.push({ createdAt: this.dateRange(query.dateFrom, query.dateTo) });
    if (!actor.roles.includes(RoleName.SUPER_ADMIN)) filters.push({ notification: { companyId: actor.companyId ?? '__missing_tenant__' } });
    const where = filters.length ? { AND: filters } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notificationDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  emailCapability() {
    return this.emailChannel.capability();
  }

  private async createNotification(alert: AlertForNotification, userId: string, channel: NotificationChannel, type: NotificationType, status: NotificationStatus, recipient?: string, nextRetryAt?: Date | null) {
    const idempotencyKey = `${alert.id}:${type}:${userId}:${channel}`;
    try {
      const notification = await this.prisma.notification.create({
        data: {
          companyId: alert.companyId,
          userId,
          alertId: alert.id,
          type,
          channel,
          title: this.titleFor(alert, type),
          message: this.messageFor(alert, type),
          severity: alert.severity,
          status,
          detailsPath: `/monitoring/alerts/${alert.id}`,
          idempotencyKey,
        },
      });
      if (channel === NotificationChannel.EMAIL && recipient) {
        await this.prisma.notificationDelivery.create({
          data: { notificationId: notification.id, channel, recipient, status: NotificationStatus.PENDING, nextRetryAt },
        });
      }
      return notification;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      throw error;
    }
  }

  private shouldCreateEmail(severity: MonitoringAlertSeverity, type: NotificationType, emailEnabled: boolean): boolean {
    if (!emailEnabled) return false;
    if (type === NotificationType.ALERT_ACKNOWLEDGED) return false;
    if (severity === MonitoringAlertSeverity.CRITICAL && (type === NotificationType.ALERT_OPENED || type === NotificationType.ALERT_REOPENED)) return true;
    return type === NotificationType.ALERT_RESOLVED || type === NotificationType.ALERT_AUTO_RESOLVED;
  }

  private emailRetryStart(severity: MonitoringAlertSeverity, quietStart?: string | null, quietEnd?: string | null): Date | null {
    if (severity === MonitoringAlertSeverity.CRITICAL || !quietStart || !quietEnd) return null;
    const now = new Date();
    const start = this.minutes(quietStart);
    const end = this.minutes(quietEnd);
    if (start === null || end === null || start === end) return null;
    const current = now.getUTCHours() * 60 + now.getUTCMinutes();
    const inQuiet = start < end ? current >= start && current < end : current >= start || current < end;
    if (!inQuiet) return null;
    const delayMinutes = current < end ? end - current : 24 * 60 - current + end;
    return new Date(now.getTime() + delayMinutes * 60_000);
  }

  private minutes(value: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  private notificationType(eventType: MonitoringAlertEventType): NotificationType | null {
    if (eventType === MonitoringAlertEventType.DETECTED) return NotificationType.ALERT_OPENED;
    if (eventType === MonitoringAlertEventType.REOPENED) return NotificationType.ALERT_REOPENED;
    if (eventType === MonitoringAlertEventType.ACKNOWLEDGED) return NotificationType.ALERT_ACKNOWLEDGED;
    if (eventType === MonitoringAlertEventType.RESOLVED) return NotificationType.ALERT_RESOLVED;
    if (eventType === MonitoringAlertEventType.AUTO_RESOLVED) return NotificationType.ALERT_AUTO_RESOLVED;
    return null;
  }

  private notificationWhere(query: NotificationQueryDto, userId: string): Prisma.NotificationWhereInput {
    const filters: Prisma.NotificationWhereInput[] = [{ userId, channel: NotificationChannel.IN_APP }];
    if (typeof query.read === 'boolean') filters.push(query.read ? { readAt: { not: null } } : { readAt: null });
    if (query.severity) filters.push({ severity: query.severity });
    if (query.type) filters.push({ type: query.type });
    if (query.dateFrom || query.dateTo) filters.push({ createdAt: this.dateRange(query.dateFrom, query.dateTo) });
    if (query.search?.trim()) {
      const search = query.search.trim();
      filters.push({ OR: [{ title: { contains: search, mode: 'insensitive' } }, { message: { contains: search, mode: 'insensitive' } }] });
    }
    return { AND: filters };
  }

  private dateRange(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter {
    return {
      ...(dateFrom ? { gte: this.normalizeBoundary(dateFrom, 'start') } : {}),
      ...(dateTo ? { lte: this.normalizeBoundary(dateTo, 'end') } : {}),
    };
  }

  private normalizeBoundary(value: string, boundary: 'start' | 'end'): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
    return new Date(value);
  }

  private async assertOwnNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id: notificationId, userId, channel: NotificationChannel.IN_APP }, select: { id: true } });
    if (!notification) throw new NotFoundException('Notification not found');
  }

  private titleFor(alert: AlertForNotification, type: NotificationType): string {
    if (type === NotificationType.ALERT_RESOLVED || type === NotificationType.ALERT_AUTO_RESOLVED) return `Resolved: ${alert.title}`;
    if (type === NotificationType.ALERT_ACKNOWLEDGED) return `Acknowledged: ${alert.title}`;
    return alert.title;
  }

  private messageFor(alert: AlertForNotification, type: NotificationType): string {
    const employeeName = alert.employee?.user ? `${alert.employee.user.firstName} ${alert.employee.user.lastName}`.trim() : null;
    const deviceName = alert.device?.deviceName;
    const context = [employeeName, deviceName].filter(Boolean).join(' • ');
    const prefix = type === NotificationType.ALERT_RESOLVED || type === NotificationType.ALERT_AUTO_RESOLVED ? 'Alert resolved.' : type === NotificationType.ALERT_ACKNOWLEDGED ? 'Alert acknowledged.' : 'Alert opened.';
    return [prefix, alert.message, context ? `Context: ${context}` : null].filter(Boolean).join(' ');
  }

  private notificationInclude() {
    return {
      alert: {
        include: {
          employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
          device: { select: { id: true, deviceName: true, platform: true } },
        },
      },
    } satisfies Prisma.NotificationInclude;
  }

  private alertInclude() {
    return {
      employee: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          branch: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      },
      device: { select: { id: true, deviceName: true, platform: true, status: true } },
    } satisfies Prisma.MonitoringAlertInclude;
  }

  private toResponse(notification: NotificationWithAlert) {
    const employee = notification.alert?.employee;
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      severity: notification.severity,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      alertId: notification.alertId,
      alertStatus: notification.alert?.status ?? null,
      employee: employee ? { id: employee.id, employeeCode: employee.employeeCode, name: `${employee.user.firstName} ${employee.user.lastName}`.trim(), email: employee.user.email } : null,
      device: notification.alert?.device ? { id: notification.alert.device.id, name: notification.alert.device.deviceName, platform: notification.alert.device.platform } : null,
      detailsPath: notification.detailsPath,
    };
  }

  private toPreference(preference: Awaited<ReturnType<NotificationPreferenceService['getOrCreate']>>) {
    return {
      inAppEnabled: preference.inAppEnabled,
      emailEnabled: preference.emailEnabled,
      criticalAlerts: preference.criticalAlerts,
      warningAlerts: preference.warningAlerts,
      infoAlerts: preference.infoAlerts,
      alertOpened: preference.alertOpened,
      alertResolved: preference.alertResolved,
      quietHoursStart: preference.quietHoursStart,
      quietHoursEnd: preference.quietHoursEnd,
      timezone: preference.timezone,
    };
  }
}

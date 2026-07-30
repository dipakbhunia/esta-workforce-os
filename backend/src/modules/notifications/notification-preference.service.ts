import { Injectable } from '@nestjs/common';
import { MonitoringAlertSeverity, NotificationPreference, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationPreferenceUpdateDto } from './dto/notification.dto';

export type EffectiveNotificationPreference = Pick<NotificationPreference,
  'inAppEnabled' | 'emailEnabled' | 'criticalAlerts' | 'warningAlerts' | 'infoAlerts' | 'alertOpened' | 'alertResolved' | 'quietHoursStart' | 'quietHoursEnd' | 'timezone'
>;

const defaultPreference: EffectiveNotificationPreference = {
  inAppEnabled: true,
  emailEnabled: true,
  criticalAlerts: true,
  warningAlerts: true,
  infoAlerts: true,
  alertOpened: true,
  alertResolved: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: null,
};

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffective(userId: string): Promise<EffectiveNotificationPreference> {
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return preference ? { ...defaultPreference, ...preference } : defaultPreference;
  }

  async getOrCreate(userId: string, companyId: string | null) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId, companyId },
    });
  }

  async update(userId: string, companyId: string | null, dto: NotificationPreferenceUpdateDto) {
    const data: Prisma.NotificationPreferenceUncheckedUpdateInput = {};
    for (const key of ['inAppEnabled', 'emailEnabled', 'criticalAlerts', 'warningAlerts', 'infoAlerts', 'alertOpened', 'alertResolved'] as const) {
      if (typeof dto[key] === 'boolean') data[key] = dto[key];
    }
    if ('quietHoursStart' in dto) data.quietHoursStart = dto.quietHoursStart?.trim() || null;
    if ('quietHoursEnd' in dto) data.quietHoursEnd = dto.quietHoursEnd?.trim() || null;
    if ('timezone' in dto) data.timezone = dto.timezone?.trim() || null;
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        companyId,
        inAppEnabled: dto.inAppEnabled ?? defaultPreference.inAppEnabled,
        emailEnabled: dto.emailEnabled ?? defaultPreference.emailEnabled,
        criticalAlerts: dto.criticalAlerts ?? defaultPreference.criticalAlerts,
        warningAlerts: dto.warningAlerts ?? defaultPreference.warningAlerts,
        infoAlerts: dto.infoAlerts ?? defaultPreference.infoAlerts,
        alertOpened: dto.alertOpened ?? defaultPreference.alertOpened,
        alertResolved: dto.alertResolved ?? defaultPreference.alertResolved,
        quietHoursStart: dto.quietHoursStart?.trim() || null,
        quietHoursEnd: dto.quietHoursEnd?.trim() || null,
        timezone: dto.timezone?.trim() || null,
      },
    });
  }

  allowsSeverity(preference: EffectiveNotificationPreference, severity: MonitoringAlertSeverity | null): boolean {
    if (severity === MonitoringAlertSeverity.CRITICAL) return preference.criticalAlerts;
    if (severity === MonitoringAlertSeverity.WARNING) return preference.warningAlerts;
    return preference.infoAlerts;
  }

  allowsLifecycle(preference: EffectiveNotificationPreference, type: NotificationType): boolean {
    if (type === NotificationType.ALERT_OPENED || type === NotificationType.ALERT_REOPENED) return preference.alertOpened;
    if (type === NotificationType.ALERT_RESOLVED || type === NotificationType.ALERT_AUTO_RESOLVED) return preference.alertResolved;
    return true;
  }

  isQuietHours(preference: EffectiveNotificationPreference, now = new Date()): boolean {
    if (!preference.quietHoursStart || !preference.quietHoursEnd) return false;
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const start = this.parseMinutes(preference.quietHoursStart);
    const end = this.parseMinutes(preference.quietHoursEnd);
    if (start === null || end === null || start === end) return false;
    return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  }

  private parseMinutes(value: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }
}

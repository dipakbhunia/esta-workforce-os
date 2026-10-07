import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MonitoringAlertEventType, MonitoringAlertSeverity, NotificationChannel, NotificationStatus, NotificationType, Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { NotificationDeliveryQueryDto, NotificationPreferenceUpdateDto, NotificationQueryDto } from './dto/notification.dto';
import { EmailNotificationChannel, safeEmailErrorEvidence } from './email-notification-channel.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationRecipientResolver } from './notification-recipient-resolver.service';
import { EmailDeliveryPolicy, EmailEventCategory, getEmailEventPolicy, preferencesApply } from './email-event-policy.registry';
import { AccountStatusChangedEmailPayload, AttendanceCorrectionDecisionEmailPayload, EmailCompositionResult, EmailEventKey, EmailEventPayloadMap, EmailPreferencePolicyId, EmailQuietHoursPolicyId, EmailRecipientResolverId, EmailRendererId, LeaveAppliedEmailPayload, LeaveDecisionEmailPayload, PasswordChangedEmailPayload } from './email-composition.types';
import { emailRendererRegistry } from './email-renderer.registry';

type AlertForNotification = Prisma.MonitoringAlertGetPayload<{ include: ReturnType<NotificationsService['alertInclude']> }>;
type NotificationWithAlert = Prisma.NotificationGetPayload<{ include: ReturnType<NotificationsService['notificationInclude']> }>;

function isNotificationIdempotencyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return Array.isArray(target) && target.length === 1 && target[0] === 'idempotencyKey';
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: NotificationRecipientResolver,
    private readonly preferences: NotificationPreferenceService,
    private readonly emailChannel: EmailNotificationChannel,
  ) {}

  async createPasswordChangedEmail(input: {
    passwordMutationEventId: string;
    targetUserId: string;
    payload: PasswordChangedEmailPayload;
  }): Promise<{ created: boolean }> {
    return this.createMandatoryAffectedUserEmail({
      type: NotificationType.PASSWORD_CHANGED,
      sourceId: input.passwordMutationEventId,
      targetUserId: input.targetUserId,
      payload: input.payload,
    });
  }

  async createAccountStatusChangedEmail(input: {
    statusMutationEventId: string;
    targetUserId: string;
    payload: AccountStatusChangedEmailPayload;
  }): Promise<{ created: boolean }> {
    return this.createMandatoryAffectedUserEmail({
      type: NotificationType.ACCOUNT_STATUS_CHANGED,
      sourceId: input.statusMutationEventId,
      targetUserId: input.targetUserId,
      payload: input.payload,
    });
  }

  async createLeaveDecisionEmail(input: {
    decisionHistoryId: string;
    type: typeof NotificationType.LEAVE_APPROVED | typeof NotificationType.LEAVE_REJECTED;
    applicantUserId: string;
    expectedCompanyId: string;
    payload: LeaveDecisionEmailPayload;
  }): Promise<{ created: boolean }> {
    return this.createWorkflowDecisionEmail({
      sourceId: input.decisionHistoryId,
      type: input.type,
      applicantUserId: input.applicantUserId,
      expectedCompanyId: input.expectedCompanyId,
      payload: input.payload,
    });
  }

  async createLeaveAppliedEmail(input: {
    submittedHistoryId: string;
    assignedApproverUserId: string;
    expectedCompanyId: string;
    payload: LeaveAppliedEmailPayload;
  }): Promise<{ created: boolean }> {
    const type = NotificationType.LEAVE_APPLIED;
    const channel = NotificationChannel.EMAIL;
    const policy = getEmailEventPolicy(type);
    if (
      policy.category !== EmailEventCategory.WORKFLOW ||
      policy.deliveryPolicy !== EmailDeliveryPolicy.PREFERENCE_CONTROLLED ||
      policy.recipientResolver !== EmailRecipientResolverId.WORKFLOW_ASSIGNED_APPROVER ||
      policy.preferenceEvaluator !== EmailPreferencePolicyId.USER_EMAIL_ENABLED ||
      policy.renderer !== EmailRendererId.LEAVE_APPLIED_WORKFLOW ||
      policy.quietHours !== EmailQuietHoursPolicyId.NON_CRITICAL_EMAIL ||
      !policy.eligibleChannels.includes(channel)
    ) throw new Error(`${type} email policy is invalid`);

    const composition = emailRendererRegistry.render(type, input.payload);
    const recipient = await this.recipients.resolveWorkflowAssignedApprover(
      input.assignedApproverUserId,
      input.expectedCompanyId,
    );
    if (!recipient || recipient.companyId !== input.expectedCompanyId) {
      throw new Error(`${type} recipient was not found`);
    }
    const preference = await this.preferences.getEffective(recipient.userId);
    if (!preference.emailEnabled) return { created: false };
    const idempotencyKey = policy.buildIdempotencyKey({
      sourceId: input.submittedHistoryId,
      userId: recipient.userId,
      channel,
    });
    const nextRetryAt = this.emailRetryStart(
      MonitoringAlertSeverity.INFO,
      preference.quietHoursStart,
      preference.quietHoursEnd,
    );
    try {
      await this.prisma.notification.create({
        data: {
          companyId: input.expectedCompanyId,
          userId: recipient.userId,
          alertId: null,
          type,
          channel,
          title: composition.subject,
          message: composition.message,
          severity: null,
          status: NotificationStatus.PENDING,
          detailsPath: composition.safeDetailsPath,
          idempotencyKey,
          deliveries: {
            create: {
              channel,
              recipient: recipient.email,
              status: NotificationStatus.PENDING,
              nextRetryAt,
            },
          },
        },
      });
      return { created: true };
    } catch (error) {
      if (isNotificationIdempotencyConflict(error)) return { created: false };
      throw error;
    }
  }

  async createAttendanceCorrectionDecisionEmail(input: {
    decisionAuditId: string;
    type: typeof NotificationType.ATTENDANCE_CORRECTION_APPROVED | typeof NotificationType.ATTENDANCE_CORRECTION_REJECTED;
    employeeUserId: string;
    expectedCompanyId: string;
    payload: AttendanceCorrectionDecisionEmailPayload;
  }): Promise<{ created: boolean }> {
    return this.createWorkflowDecisionEmail({
      sourceId: input.decisionAuditId,
      type: input.type,
      applicantUserId: input.employeeUserId,
      expectedCompanyId: input.expectedCompanyId,
      payload: input.payload,
    });
  }

  private async createWorkflowDecisionEmail<K extends
    | typeof NotificationType.LEAVE_APPROVED
    | typeof NotificationType.LEAVE_REJECTED
    | typeof NotificationType.ATTENDANCE_CORRECTION_APPROVED
    | typeof NotificationType.ATTENDANCE_CORRECTION_REJECTED>(input: {
    sourceId: string;
    type: K;
    applicantUserId: string;
    expectedCompanyId: string;
    payload: EmailEventPayloadMap[K];
  }): Promise<{ created: boolean }> {
    const channel = NotificationChannel.EMAIL;
    const policy = getEmailEventPolicy(input.type);
    if (
      policy.category !== EmailEventCategory.WORKFLOW ||
      policy.deliveryPolicy !== EmailDeliveryPolicy.PREFERENCE_CONTROLLED ||
      policy.recipientResolver !== EmailRecipientResolverId.WORKFLOW_APPLICANT ||
      policy.preferenceEvaluator !== EmailPreferencePolicyId.USER_EMAIL_ENABLED ||
      policy.quietHours !== EmailQuietHoursPolicyId.NON_CRITICAL_EMAIL ||
      !policy.eligibleChannels.includes(channel)
    ) throw new Error(`${input.type} email policy is invalid`);

    const composition = emailRendererRegistry.render(input.type, input.payload);
    const recipient = await this.recipients.resolveWorkflowApplicant(input.applicantUserId, input.expectedCompanyId);
    if (!recipient || recipient.companyId !== input.expectedCompanyId) {
      throw new Error(`${input.type} recipient was not found`);
    }
    const preference = await this.preferences.getEffective(recipient.userId);
    if (!preference.emailEnabled) return { created: false };
    const idempotencyKey = policy.buildIdempotencyKey({ sourceId: input.sourceId, userId: recipient.userId, channel });
    const nextRetryAt = this.emailRetryStart(
      MonitoringAlertSeverity.INFO,
      preference.quietHoursStart,
      preference.quietHoursEnd,
    );
    try {
      await this.prisma.notification.create({
        data: {
          companyId: input.expectedCompanyId,
          userId: recipient.userId,
          alertId: null,
          type: input.type,
          channel,
          title: composition.subject,
          message: composition.message,
          severity: null,
          status: NotificationStatus.PENDING,
          detailsPath: composition.safeDetailsPath,
          idempotencyKey,
          deliveries: { create: { channel, recipient: recipient.email, status: NotificationStatus.PENDING, nextRetryAt } },
        },
      });
      return { created: true };
    } catch (error) {
      if (isNotificationIdempotencyConflict(error)) return { created: false };
      throw error;
    }
  }

  private async createMandatoryAffectedUserEmail<K extends EmailEventKey>(input: {
    type: K;
    sourceId: string;
    targetUserId: string;
    payload: EmailEventPayloadMap[K];
  }): Promise<{ created: boolean }> {
    const { type } = input;
    const channel = NotificationChannel.EMAIL;
    const policy = getEmailEventPolicy(type);
    if (
      policy.deliveryPolicy !== EmailDeliveryPolicy.MANDATORY ||
      policy.category !== EmailEventCategory.SECURITY ||
      !policy.eligibleChannels.includes(channel) ||
      policy.recipientResolver !== EmailRecipientResolverId.AFFECTED_USER ||
      policy.preferenceEvaluator !== EmailPreferencePolicyId.NONE ||
      policy.quietHours !== EmailQuietHoursPolicyId.NONE
    ) {
      throw new Error(`${type} email policy is invalid`);
    }
    const composition = emailRendererRegistry.render(type, input.payload);
    const recipient = await this.recipients.resolveAffectedUser(input.targetUserId);
    if (!recipient) throw new Error(`${type} recipient was not found`);
    const idempotencyKey = policy.buildIdempotencyKey({
      sourceId: input.sourceId,
      userId: recipient.userId,
      channel,
    });
    try {
      await this.prisma.notification.create({
        data: {
          companyId: recipient.companyId,
          userId: recipient.userId,
          alertId: null,
          type,
          channel,
          title: composition.subject,
          message: composition.message,
          severity: null,
          status: NotificationStatus.PENDING,
          detailsPath: composition.safeDetailsPath,
          idempotencyKey,
          deliveries: {
            create: {
              channel,
              recipient: recipient.email,
              status: NotificationStatus.PENDING,
              nextRetryAt: null,
            },
          },
        },
      });
      return { created: true };
    } catch (error) {
      if (isNotificationIdempotencyConflict(error)) {
        return { created: false };
      }
      throw error;
    }
  }

  async handleAlertEvent(alertId: string, eventType: MonitoringAlertEventType): Promise<void> {
    const notificationType = this.notificationType(eventType);
    if (!notificationType) return;
    const policy = getEmailEventPolicy(notificationType);
    const alert = await this.prisma.monitoringAlert.findUnique({ where: { id: alertId }, include: this.alertInclude() });
    if (!alert) return;
    if (policy.renderer !== EmailRendererId.MONITORING_ALERT) throw new Error('Unsupported Monitoring email renderer');
    const composition = emailRendererRegistry.render(notificationType, {
      alertId: alert.id,
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      employeeDisplayName: alert.employee?.user
        ? `${alert.employee.user.firstName} ${alert.employee.user.lastName}`.trim()
        : null,
      deviceDisplayName: alert.device?.deviceName ?? null,
    });
    const recipients = policy.recipientResolver === 'MONITORING_ALERT'
      ? await this.recipients.resolveForAlert({ companyId: alert.companyId, employeeId: alert.employeeId, severity: alert.severity })
      : [];
    for (const recipient of recipients) {
      const preference = await this.preferences.getEffective(recipient.userId);
      if (preferencesApply(policy) &&
        (!this.preferences.allowsSeverity(preference, alert.severity) || !this.preferences.allowsLifecycle(preference, notificationType))) continue;
      if (policy.eligibleChannels.includes(NotificationChannel.IN_APP) && preference.inAppEnabled) await this.createNotification(alert, composition, recipient.userId, NotificationChannel.IN_APP, notificationType, NotificationStatus.DELIVERED);
      if (policy.eligibleChannels.includes(NotificationChannel.EMAIL) && this.shouldCreateEmail(alert.severity, notificationType, preference.emailEnabled)) {
        const delayUntil = policy.quietHours === EmailQuietHoursPolicyId.NON_CRITICAL_EMAIL
          ? this.emailRetryStart(alert.severity, preference.quietHoursStart, preference.quietHoursEnd)
          : null;
        await this.createNotification(alert, composition, recipient.userId, NotificationChannel.EMAIL, notificationType, NotificationStatus.PENDING, recipient.email, delayUntil);
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
      this.prisma.notificationDelivery.findMany({
        where,
        select: {
          id: true, notificationId: true, channel: true, recipient: true, status: true, attemptCount: true,
          lastAttemptAt: true, nextRetryAt: true, sentAt: true, failedAt: true, errorCode: true,
          safeErrorMessage: true, providerMessageId: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    return {
      data: data.map((delivery) => {
        if (!delivery.errorCode && !delivery.safeErrorMessage) return delivery;
        const safe = safeEmailErrorEvidence(delivery.errorCode);
        return { ...delivery, errorCode: safe.code, safeErrorMessage: safe.message };
      }),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  emailCapability() {
    return this.emailChannel.capability();
  }

  private async createNotification(alert: AlertForNotification, composition: EmailCompositionResult, userId: string, channel: NotificationChannel, type: NotificationType, status: NotificationStatus, recipient?: string, nextRetryAt?: Date | null) {
    const idempotencyKey = getEmailEventPolicy(type).buildIdempotencyKey({ sourceId: alert.id, userId, channel });
    try {
      const notification = await this.prisma.notification.create({
        data: {
          companyId: alert.companyId,
          userId,
          alertId: alert.id,
          type,
          channel,
          title: composition.subject,
          message: composition.message,
          severity: alert.severity,
          status,
          detailsPath: composition.safeDetailsPath,
          idempotencyKey,
          ...(channel === NotificationChannel.EMAIL && recipient ? {
            deliveries: { create: { channel, recipient, status: NotificationStatus.PENDING, nextRetryAt } },
          } : {}),
        },
      });
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

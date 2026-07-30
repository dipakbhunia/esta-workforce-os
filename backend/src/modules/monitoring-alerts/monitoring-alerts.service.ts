import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeStatus,
  MonitoringAlertEventType,
  MonitoringAlertSeverity,
  MonitoringAlertStatus,
  MonitoringAlertType,
  MonitoringDeviceStatus,
  Prisma,
  RoleName,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { MonitoringAlertPolicyResolver } from './monitoring-alert-policy.resolver';
import {
  MonitoringAlertActionDto,
  MonitoringAlertDetailResponseDto,
  MonitoringAlertEvaluationResponseDto,
  MonitoringAlertListResponseDto,
  MonitoringAlertQueryDto,
  MonitoringAlertResponseDto,
} from './dto/monitoring-alert.dto';

const monitoringRoles: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];
const alertManagerRoles: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
];
const alertEvaluatorRoles: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN];

const uploadEnabledStatuses: MonitoringDeviceStatus[] = [
  MonitoringDeviceStatus.ACTIVE,
  MonitoringDeviceStatus.TRUSTED,
];
const activeAlertStatuses: MonitoringAlertStatus[] = [
  MonitoringAlertStatus.OPEN,
  MonitoringAlertStatus.ACKNOWLEDGED,
];

type DetectionResult = { detected: number; resolved: number };
type AlertInclude = Prisma.MonitoringAlertInclude;
type AlertRecord = Prisma.MonitoringAlertGetPayload<{ include: ReturnType<MonitoringAlertsService['alertInclude']> }>;

@Injectable()
export class MonitoringAlertsService {
  private readonly logger = new Logger(MonitoringAlertsService.name);
  private evaluating = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: MonitoringAlertPolicyResolver,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: MonitoringAlertQueryDto, actor: AuthenticatedUser): Promise<MonitoringAlertListResponseDto> {
    this.assertCanView(actor);
    const page = query.page ?? 1;
    const limit = Math.min(100, Math.max(1, query.pageSize ?? query.limit ?? 20));
    const where = await this.alertWhere(query, actor);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.monitoringAlert.findMany({
        where,
        include: this.alertInclude(),
        orderBy: [{ severity: 'asc' }, { lastDetectedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.monitoringAlert.count({ where }),
    ]);
    const summary = await this.summary(where);
    return {
      data: data.map((alert) => this.toResponse(alert)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: { ...summary, totalFiltered: total },
    };
  }

  async detail(alertId: string, actor: AuthenticatedUser): Promise<MonitoringAlertDetailResponseDto> {
    this.assertCanView(actor);
    const where = await this.alertWhere({}, actor);
    const alert = await this.prisma.monitoringAlert.findFirst({
      where: { AND: [{ id: alertId }, where] },
      include: {
        ...this.alertInclude(),
        events: {
          include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { occurredAt: 'asc' },
        },
      },
    });
    if (!alert) throw new NotFoundException('Monitoring alert not found');
    return {
      ...this.toResponse(alert),
      events: alert.events.map((event) => ({
        id: event.id,
        type: event.type,
        actor: event.actor,
        occurredAt: event.occurredAt,
        note: event.note,
        metadata: this.safeJson(event.metadata),
      })),
    };
  }

  async acknowledge(alertId: string, dto: MonitoringAlertActionDto, actor: AuthenticatedUser) {
    await this.assertCanManage(actor);
    const alert = await this.visibleAlertForAction(alertId, actor);
    if (alert.status === MonitoringAlertStatus.RESOLVED) {
      throw new BadRequestException('Resolved alerts cannot be acknowledged');
    }
    const note = this.trimNote(dto.note);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAlert = await tx.monitoringAlert.update({
        where: { id: alert.id },
        data: {
          status: MonitoringAlertStatus.ACKNOWLEDGED,
          acknowledgedAt: new Date(),
          acknowledgedByUserId: actor.id,
        },
        include: this.alertInclude(),
      });
      await tx.monitoringAlertEvent.create({
        data: {
          alertId: alert.id,
          companyId: alert.companyId,
          type: MonitoringAlertEventType.ACKNOWLEDGED,
          actorUserId: actor.id,
          note,
        },
      });
      await this.audit(tx, alert.companyId, actor.id, 'MONITORING_ALERT_ACKNOWLEDGED', alert.id, { note });
      return updatedAlert;
    });
    await this.notifyAlertEvent(updated.id, MonitoringAlertEventType.ACKNOWLEDGED);
    return this.toResponse(updated);
  }

  async resolve(alertId: string, dto: MonitoringAlertActionDto, actor: AuthenticatedUser) {
    await this.assertCanManage(actor);
    const alert = await this.visibleAlertForAction(alertId, actor);
    if (alert.status === MonitoringAlertStatus.RESOLVED) {
      throw new BadRequestException('Alert is already resolved');
    }
    const note = this.trimNote(dto.resolutionNote ?? dto.note);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAlert = await tx.monitoringAlert.update({
        where: { id: alert.id },
        data: {
          status: MonitoringAlertStatus.RESOLVED,
          resolvedAt: new Date(),
          resolvedByUserId: actor.id,
          resolutionNote: note,
        },
        include: this.alertInclude(),
      });
      await tx.monitoringAlertEvent.create({
        data: {
          alertId: alert.id,
          companyId: alert.companyId,
          type: MonitoringAlertEventType.RESOLVED,
          actorUserId: actor.id,
          note,
        },
      });
      await this.audit(tx, alert.companyId, actor.id, 'MONITORING_ALERT_RESOLVED', alert.id, { note });
      return updatedAlert;
    });
    await this.notifyAlertEvent(updated.id, MonitoringAlertEventType.RESOLVED);
    return this.toResponse(updated);
  }

  async evaluate(actor: AuthenticatedUser): Promise<MonitoringAlertEvaluationResponseDto> {
    if (!actor.roles.some((role) => alertEvaluatorRoles.includes(role))) {
      throw new ForbiddenException('Alert evaluation is not allowed for this role');
    }
    const scopeCompanyId = actor.roles.includes(RoleName.SUPER_ADMIN) ? undefined : actor.companyId ?? undefined;
    const result = await this.evaluateSystem(scopeCompanyId);
    return { evaluatedAt: new Date(), ...result };
  }

  async evaluateSystem(companyId?: string): Promise<DetectionResult> {
    if (this.evaluating) return { detected: 0, resolved: 0 };
    this.evaluating = true;
    try {
      const security = await this.evaluateSecurityAlerts(companyId);
      const heartbeat = await this.evaluateHeartbeatAlerts(companyId);
      const idle = await this.evaluateIdleAlerts(companyId);
      const screenshots = await this.evaluateScreenshotAlerts(companyId);
      return {
        detected: security.detected + heartbeat.detected + idle.detected + screenshots.detected,
        resolved: security.resolved + heartbeat.resolved + idle.resolved + screenshots.resolved,
      };
    } finally {
      this.evaluating = false;
    }
  }

  async evaluateSecurityAlerts(companyId?: string): Promise<DetectionResult> {
    return this.evaluateDeviceAlerts(companyId, 'SECURITY');
  }

  async evaluateHeartbeatAlerts(companyId?: string): Promise<DetectionResult> {
    return this.evaluateDeviceAlerts(companyId, 'HEARTBEAT');
  }

  async evaluateIdleAlerts(companyId?: string): Promise<DetectionResult> {
    return this.evaluateIdleAlertsInternal(companyId);
  }

  async evaluateScreenshotAlerts(companyId?: string): Promise<DetectionResult> {
    return this.evaluateScreenshotAlertsInternal(companyId);
  }

  private async evaluateDeviceAlerts(companyId: string | undefined, mode: 'SECURITY' | 'HEARTBEAT'): Promise<DetectionResult> {
    const now = new Date();
    const devices = await this.prisma.monitoringDevice.findMany({
      where: { deletedAt: null, ...(companyId ? { companyId } : {}) },
      include: { employee: { select: { id: true, employeeCode: true } } },
    });
    let detected = 0;
    let resolved = 0;
    for (const device of devices) {
      const policy = await this.policyResolver.resolveForEmployee(device.employeeId, device.companyId);
      const revokedSetting = policy.settings.DEVICE_REVOKED;
      const offlineSetting = policy.settings.DEVICE_OFFLINE;
      const missingSetting = policy.settings.MISSING_HEARTBEAT;
      const monitoringDisabledSetting = policy.settings.MONITORING_DISABLED;
      const reregistrationSetting = policy.settings.REREGISTRATION_REQUIRED;
      const suppressNonSecurity = device.status === MonitoringDeviceStatus.REVOKED;
      if (mode === 'SECURITY' && monitoringDisabledSetting.enabled && device.status === MonitoringDeviceStatus.INACTIVE) {
        detected += await this.detectAlert({
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          type: MonitoringAlertType.MONITORING_DISABLED,
          severity: monitoringDisabledSetting.severity,
          title: 'Monitoring disabled',
          message: `${device.deviceName} has monitoring disabled.`,
          deduplicationKey: this.deviceKey(device.companyId, MonitoringAlertType.MONITORING_DISABLED, device.id),
          metadata: { deviceStatus: device.status },
        });
      } else {
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.MONITORING_DISABLED, device.id), 'Monitoring is enabled again');
      }

      if (mode === 'SECURITY' && revokedSetting.enabled && device.status === MonitoringDeviceStatus.REVOKED) {
        detected += await this.detectAlert({
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          type: MonitoringAlertType.DEVICE_REVOKED,
          severity: MonitoringAlertSeverity.CRITICAL,
          title: 'Device revoked',
          message: `${device.deviceName} has been revoked and cannot upload monitoring data.`,
          deduplicationKey: this.deviceKey(device.companyId, MonitoringAlertType.DEVICE_REVOKED, device.id),
          metadata: { revokedAt: device.revokedAt?.toISOString() ?? null },
        });
      } else {
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.DEVICE_REVOKED, device.id), 'Device is no longer revoked');
      }

      if (mode === 'SECURITY' && reregistrationSetting.enabled && device.status === MonitoringDeviceStatus.REREGISTRATION_REQUIRED) {
        detected += await this.detectAlert({
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          type: MonitoringAlertType.REREGISTRATION_REQUIRED,
          severity: MonitoringAlertSeverity.CRITICAL,
          title: 'Device re-registration required',
          message: `${device.deviceName} must be registered again before monitoring can continue.`,
          deduplicationKey: this.deviceKey(device.companyId, MonitoringAlertType.REREGISTRATION_REQUIRED, device.id),
          metadata: { reregistrationRequiredAt: device.reregistrationRequiredAt?.toISOString() ?? null },
        });
      } else {
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.REREGISTRATION_REQUIRED, device.id), 'Device registration state is normal');
      }

      if (mode !== 'HEARTBEAT' || !offlineSetting.enabled || !missingSetting.enabled || suppressNonSecurity || !uploadEnabledStatuses.includes(device.status) || policy.maintenance.active) {
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.DEVICE_OFFLINE, device.id), 'Device is not expected to upload monitoring data');
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.MISSING_HEARTBEAT, device.id), 'Device is not expected to upload monitoring data');
        continue;
      }

      const offlineMinutes = offlineSetting.thresholdMinutes + offlineSetting.gracePeriodMinutes;
      const missingMinutes = Math.max(missingSetting.thresholdMinutes + missingSetting.gracePeriodMinutes, offlineMinutes + 1);
      const offlineAt = new Date(now.getTime() - offlineMinutes * 60_000);
      const missingAt = new Date(now.getTime() - missingMinutes * 60_000);
      const lastSeen = device.lastSeenAt ?? device.registeredAt;
      const neverSeen = !device.lastSeenAt;
      if (lastSeen <= missingAt) {
        detected += await this.detectAlert({
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          type: MonitoringAlertType.MISSING_HEARTBEAT,
          severity: MonitoringAlertSeverity.CRITICAL,
          title: 'Missing heartbeat',
          message: `${device.deviceName} has not reported a heartbeat for at least ${missingMinutes} minutes.`,
          deduplicationKey: this.deviceKey(device.companyId, MonitoringAlertType.MISSING_HEARTBEAT, device.id),
          metadata: { lastSeenAt: device.lastSeenAt?.toISOString() ?? null, neverSeen, thresholdMinutes: missingMinutes },
        });
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.DEVICE_OFFLINE, device.id), 'Heartbeat loss crossed missing threshold');
      } else if (lastSeen <= offlineAt) {
        detected += await this.detectAlert({
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          type: MonitoringAlertType.DEVICE_OFFLINE,
          severity: offlineSetting.severity,
          title: 'Device offline',
          message: `${device.deviceName} has not reported recently.`,
          deduplicationKey: this.deviceKey(device.companyId, MonitoringAlertType.DEVICE_OFFLINE, device.id),
          metadata: { lastSeenAt: device.lastSeenAt?.toISOString() ?? null, thresholdMinutes: offlineMinutes },
        });
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.MISSING_HEARTBEAT, device.id), 'Heartbeat returned above missing threshold');
      } else {
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.DEVICE_OFFLINE, device.id), 'Device heartbeat is current');
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.MISSING_HEARTBEAT, device.id), 'Device heartbeat is current');
      }
    }
    return { detected, resolved };
  }

  private async evaluateIdleAlertsInternal(companyId?: string): Promise<DetectionResult> {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const sessions = await this.prisma.activitySession.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        endedAt: { gte: since },
        idleSeconds: { gt: 0 },
      },
      include: { employee: { select: { employeeCode: true } } },
      orderBy: { endedAt: 'desc' },
      take: 500,
    });
    let detected = 0;
    let resolved = 0;
    for (const session of sessions) {
      const policy = await this.policyResolver.resolveForEmployee(session.employeeId, session.companyId);
      const setting = policy.settings.EXCESSIVE_IDLE;
      if (!setting.enabled || policy.maintenance.active) continue;
      const thresholdSeconds = (setting.thresholdMinutes + setting.gracePeriodMinutes) * 60;
      if (session.idleSeconds < thresholdSeconds) continue;
      detected += await this.detectAlert({
        companyId: session.companyId,
        employeeId: session.employeeId,
        deviceId: session.deviceId,
        type: MonitoringAlertType.EXCESSIVE_IDLE,
        severity: setting.severity,
        title: 'Excessive idle time',
        message: `Idle time exceeded ${Math.round(thresholdSeconds / 60)} minutes in one activity session.`,
        deduplicationKey: `${session.companyId}:EXCESSIVE_IDLE:${session.id}`,
        metadata: {
          activitySessionId: session.id,
          idleSeconds: session.idleSeconds,
          activeSeconds: session.activeSeconds,
          endedAt: session.endedAt.toISOString(),
        },
      });
      const resumed = await this.prisma.activitySession.findFirst({
        where: {
          employeeId: session.employeeId,
          deviceId: session.deviceId,
          startedAt: { gt: session.endedAt },
          activeSeconds: { gt: 0 },
        },
        select: { id: true },
      });
      if (resumed) {
        resolved += await this.autoResolve(`${session.companyId}:EXCESSIVE_IDLE:${session.id}`, 'Employee activity resumed after excessive idle');
      }
    }
    return { detected, resolved };
  }

  private async evaluateScreenshotAlertsInternal(companyId?: string): Promise<DetectionResult> {
    const devices = await this.prisma.monitoringDevice.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        deletedAt: null,
        status: { in: uploadEnabledStatuses },
      },
      select: { id: true, companyId: true, employeeId: true, deviceName: true, registeredAt: true },
    });
    let detected = 0;
    let resolved = 0;
    for (const device of devices) {
      const policy = await this.policyResolver.resolveForEmployee(device.employeeId, device.companyId);
      const setting = policy.settings.SCREENSHOT_MISSING;
      if (!setting.enabled || policy.maintenance.active) continue;
      const thresholdMinutes = setting.thresholdMinutes + setting.gracePeriodMinutes;
      const thresholdAt = new Date(Date.now() - thresholdMinutes * 60_000);
      const latest = await this.prisma.screenshot.findFirst({
        where: { deviceId: device.id, deletedAt: null },
        orderBy: { capturedAt: 'desc' },
        select: { id: true, capturedAt: true },
      });
      const observedAt = latest?.capturedAt ?? device.registeredAt;
      if (observedAt <= thresholdAt) {
        detected += await this.detectAlert({
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          type: MonitoringAlertType.SCREENSHOT_MISSING,
          severity: setting.severity,
          title: 'Screenshot missing',
          message: `${device.deviceName} has not uploaded screenshots for at least ${thresholdMinutes} minutes.`,
          deduplicationKey: this.deviceKey(device.companyId, MonitoringAlertType.SCREENSHOT_MISSING, device.id),
          metadata: { lastScreenshotAt: latest?.capturedAt.toISOString() ?? null, thresholdMinutes },
        });
      } else {
        resolved += await this.autoResolve(this.deviceKey(device.companyId, MonitoringAlertType.SCREENSHOT_MISSING, device.id), 'Screenshot upload resumed');
      }
    }
    return { detected, resolved };
  }

  private async detectAlert(input: {
    companyId: string;
    employeeId?: string | null;
    deviceId?: string | null;
    type: MonitoringAlertType;
    severity: MonitoringAlertSeverity;
    title: string;
    message: string;
    deduplicationKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<number> {
    const now = new Date();
    const existing = await this.prisma.monitoringAlert.findFirst({
      where: { deduplicationKey: input.deduplicationKey, status: { in: activeAlertStatuses } },
      select: { id: true, companyId: true },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.monitoringAlert.update({
          where: { id: existing.id },
          data: {
            type: input.type,
            severity: input.severity,
            title: input.title,
            message: input.message,
            lastDetectedAt: now,
            metadata: input.metadata as Prisma.InputJsonValue,
          },
        }),
        this.prisma.monitoringAlertEvent.create({
          data: {
            alertId: existing.id,
            companyId: existing.companyId,
            type: MonitoringAlertEventType.REDETECTED,
            metadata: input.metadata as Prisma.InputJsonValue,
          },
        }),
      ]);
      return 0;
    }
    const created = await this.prisma.monitoringAlert.create({
      data: {
        ...input,
        detectedAt: now,
        lastDetectedAt: now,
        metadata: input.metadata as Prisma.InputJsonValue,
        events: {
          create: {
            companyId: input.companyId,
            type: MonitoringAlertEventType.DETECTED,
            metadata: input.metadata as Prisma.InputJsonValue,
          },
        },
      },
      select: { id: true },
    });
    await this.prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        action: 'MONITORING_ALERT_DETECTED',
        entityType: 'MonitoringAlert',
        entityId: created.id,
        metadata: { type: input.type, severity: input.severity } as Prisma.InputJsonValue,
      },
    });
    await this.notifyAlertEvent(created.id, MonitoringAlertEventType.DETECTED);
    return 1;
  }

  private async autoResolve(deduplicationKey: string, note: string): Promise<number> {
    const alert = await this.prisma.monitoringAlert.findFirst({
      where: { deduplicationKey, status: { in: activeAlertStatuses } },
      select: { id: true, companyId: true },
    });
    if (!alert) return 0;
    await this.prisma.$transaction([
      this.prisma.monitoringAlert.update({
        where: { id: alert.id },
        data: {
          status: MonitoringAlertStatus.RESOLVED,
          resolvedAt: new Date(),
          resolutionNote: note,
        },
      }),
      this.prisma.monitoringAlertEvent.create({
        data: {
          alertId: alert.id,
          companyId: alert.companyId,
          type: MonitoringAlertEventType.AUTO_RESOLVED,
          note,
        },
      }),
    ]);
    await this.notifyAlertEvent(alert.id, MonitoringAlertEventType.AUTO_RESOLVED);
    return 1;
  }

  private async alertWhere(query: Partial<MonitoringAlertQueryDto>, actor: AuthenticatedUser): Promise<Prisma.MonitoringAlertWhereInput> {
    const filters: Prisma.MonitoringAlertWhereInput[] = [await this.alertVisibilityWhere(actor)];
    if (query.status) filters.push({ status: query.status });
    if (query.severity) filters.push({ severity: query.severity });
    if (query.type) filters.push({ type: query.type });
    if (query.companyId) filters.push({ companyId: query.companyId });
    if (query.employeeId) filters.push({ employeeId: query.employeeId });
    if (query.deviceId) filters.push({ deviceId: query.deviceId });
    if (query.departmentId) filters.push({ employee: { is: { departmentId: query.departmentId } } });
    if (query.branchId) filters.push({ employee: { is: { branchId: query.branchId } } });
    if (query.dateFrom || query.dateTo) filters.push({ detectedAt: this.dateRange(query.dateFrom, query.dateTo) });
    if (query.search?.trim()) {
      const search = query.search.trim();
      filters.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { message: { contains: search, mode: 'insensitive' } },
          { employee: { is: { employeeCode: { contains: search, mode: 'insensitive' } } } },
          { employee: { is: { user: { is: { firstName: { contains: search, mode: 'insensitive' } } } } } },
          { employee: { is: { user: { is: { lastName: { contains: search, mode: 'insensitive' } } } } } },
          { employee: { is: { user: { is: { email: { contains: search, mode: 'insensitive' } } } } } },
          { device: { is: { deviceName: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }
    return { AND: filters };
  }

  private async alertVisibilityWhere(actor: AuthenticatedUser): Promise<Prisma.MonitoringAlertWhereInput> {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return {};
    if (actor.roles.includes(RoleName.COMPANY_ADMIN) || actor.roles.includes(RoleName.HR)) {
      if (!actor.companyId) throw new ForbiddenException('Tenant is required');
      return { companyId: actor.companyId };
    }
    const employeeWhere = await this.employeeVisibilityWhere(actor);
    const employees = await this.prisma.employee.findMany({ where: employeeWhere, select: { id: true } });
    return { employeeId: { in: employees.map((employee) => employee.id) } };
  }

  private async employeeVisibilityWhere(actor: AuthenticatedUser): Promise<Prisma.EmployeeWhereInput> {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return { deletedAt: null };
    if (actor.roles.includes(RoleName.COMPANY_ADMIN) || actor.roles.includes(RoleName.HR)) {
      if (!actor.companyId) throw new ForbiddenException('Tenant is required');
      return { companyId: actor.companyId, deletedAt: null };
    }
    const own = await this.prisma.employee.findFirst({
      where: { userId: actor.id, deletedAt: null, status: EmployeeStatus.ACTIVE },
      select: { id: true },
    });
    if (!own) return { id: '__missing_employee__' };
    if (actor.roles.includes(RoleName.MANAGER)) {
      return { deletedAt: null, OR: [{ id: own.id }, { reportingManagerId: own.id }] };
    }
    return { id: own.id, deletedAt: null };
  }

  private async visibleAlertForAction(alertId: string, actor: AuthenticatedUser) {
    const where = await this.alertWhere({}, actor);
    const alert = await this.prisma.monitoringAlert.findFirst({
      where: { AND: [{ id: alertId }, where] },
      select: { id: true, companyId: true, status: true },
    });
    if (!alert) throw new NotFoundException('Monitoring alert not found');
    return alert;
  }

  private async summary(where: Prisma.MonitoringAlertWhereInput) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [open, acknowledged, criticalOpen, warningOpen, resolvedToday] = await Promise.all([
      this.prisma.monitoringAlert.count({ where: { AND: [where, { status: MonitoringAlertStatus.OPEN }] } }),
      this.prisma.monitoringAlert.count({ where: { AND: [where, { status: MonitoringAlertStatus.ACKNOWLEDGED }] } }),
      this.prisma.monitoringAlert.count({ where: { AND: [where, { status: MonitoringAlertStatus.OPEN, severity: MonitoringAlertSeverity.CRITICAL }] } }),
      this.prisma.monitoringAlert.count({ where: { AND: [where, { status: MonitoringAlertStatus.OPEN, severity: MonitoringAlertSeverity.WARNING }] } }),
      this.prisma.monitoringAlert.count({ where: { AND: [where, { status: MonitoringAlertStatus.RESOLVED, resolvedAt: { gte: today } }] } }),
    ]);
    return { open, acknowledged, criticalOpen, warningOpen, resolvedToday, totalFiltered: 0 };
  }

  private alertInclude() {
    return {
      employee: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          department: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      },
      device: { select: { id: true, deviceName: true, platform: true, status: true, lastSeenAt: true } },
      acknowledgedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    } satisfies AlertInclude;
  }

  private toResponse(alert: AlertRecord): MonitoringAlertResponseDto {
    return {
      id: alert.id,
      companyId: alert.companyId,
      employeeId: alert.employeeId,
      deviceId: alert.deviceId,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      title: alert.title,
      message: alert.message,
      detectedAt: alert.detectedAt,
      lastDetectedAt: alert.lastDetectedAt,
      acknowledgedAt: alert.acknowledgedAt,
      resolvedAt: alert.resolvedAt,
      resolutionNote: alert.resolutionNote,
      employee: alert.employee
        ? {
            id: alert.employee.id,
            employeeCode: alert.employee.employeeCode,
            user: alert.employee.user,
            department: alert.employee.department,
            branch: alert.employee.branch,
          }
        : null,
      device: alert.device,
      acknowledgedBy: alert.acknowledgedBy,
      resolvedBy: alert.resolvedBy,
      metadata: this.safeJson(alert.metadata),
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
    };
  }

  private dateRange(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter {
    const gte = dateFrom ? this.normalizeBoundary(dateFrom, 'start') : new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const lte = dateTo ? this.normalizeBoundary(dateTo, 'end') : new Date();
    return { gte, lte };
  }

  private normalizeBoundary(value: string, boundary: 'start' | 'end'): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
    }
    return new Date(value);
  }

  private deviceKey(companyId: string, type: MonitoringAlertType, deviceId: string): string {
    return `${companyId}:${type}:${deviceId}`;
  }

  private safeJson(value: Prisma.JsonValue | null): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    return value as Record<string, unknown>;
  }

  private assertCanView(actor: AuthenticatedUser) {
    if (actor.roles.some((role) => monitoringRoles.includes(role))) return;
    throw new ForbiddenException('Monitoring alert access is not allowed for this role');
  }

  private async assertCanManage(actor: AuthenticatedUser) {
    if (actor.roles.some((role) => alertManagerRoles.includes(role))) return;
    throw new ForbiddenException('Monitoring alert management is not allowed for this role');
  }

  private trimNote(value?: string | null): string | null {
    const note = value?.trim();
    return note?.length ? note : null;
  }


  private async notifyAlertEvent(alertId: string, eventType: MonitoringAlertEventType) {
    try {
      await this.notifications.handleAlertEvent(alertId, eventType);
    } catch (error) {
      this.logger.warn(`Notification scheduling failed for alert ${alertId}: ${String((error as Error)?.message ?? error)}`);
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    companyId: string,
    actorUserId: string,
    action: string,
    alertId: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        companyId,
        actorUserId,
        action,
        entityType: 'MonitoringAlert',
        entityId: alertId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}

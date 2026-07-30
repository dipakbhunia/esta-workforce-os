import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MonitoringAlertSeverity, MonitoringAlertStatus, MonitoringAlertType, MonitoringDeviceStatus, NotificationChannel, NotificationStatus, Prisma, ProductivityCategory, RoleName } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { MonitoringOperationsQueryDto, MonitoringOperationsReportQueryDto } from './dto/monitoring-operations.dto';

type AlertRecord = Prisma.MonitoringAlertGetPayload<{ include: { employee: { include: { user: true; branch: true; department: true } }; device: true } }>;
type DeviceRecord = Prisma.MonitoringDeviceGetPayload<{ include: { employee: { include: { user: true; branch: true; department: true } } } }>;

@Injectable()
export class MonitoringOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(query: MonitoringOperationsQueryDto, actor: AuthenticatedUser) {
    const range = this.dateRange(query);
    const employeeWhere = await this.employeeVisibilityWhere(actor, query);
    const alertWhere = this.alertWhere(query, range, employeeWhere, actor);
    const deviceWhere = this.deviceWhere(query, employeeWhere, actor);
    const appWhere = this.usageWhere(range, employeeWhere, actor, query);
    const websiteWhere = this.websiteUsageWhere(range, employeeWhere, actor, query);

    const [alerts, devices, notifications, deliveries, policies, employeesTotal, appUsage, websiteUsage, appRules, websiteRules, unreadNotifications, resolvedToday] = await this.prisma.$transaction([
      this.prisma.monitoringAlert.findMany({ where: alertWhere, include: { employee: { include: { user: true, branch: true, department: true } }, device: true }, orderBy: { detectedAt: 'asc' }, take: 5000 }),
      this.prisma.monitoringDevice.findMany({ where: deviceWhere, include: { employee: { include: { user: true, branch: true, department: true } } }, take: 5000 }),
      this.prisma.notification.count({ where: { ...this.notificationWhere(range, actor), channel: NotificationChannel.IN_APP } }),
      this.prisma.notificationDelivery.findMany({ where: this.deliveryWhere(range, actor), include: { notification: true }, take: 5000 }),
      this.prisma.monitoringAlertPolicy.findMany({ where: this.policyWhere(actor, query), select: { companyId: true, branchId: true, departmentId: true, employeeId: true, scope: true }, take: 5000 }),
      this.prisma.employee.count({ where: employeeWhere }),
      this.prisma.applicationUsage.findMany({ where: appWhere, select: { applicationName: true, durationSeconds: true, companyId: true }, take: 5000 }),
      this.prisma.websiteUsage.findMany({ where: websiteWhere, select: { domain: true, durationSeconds: true, companyId: true }, take: 5000 }),
      this.prisma.applicationProductivityRule.findMany({ where: this.productivityRuleWhere(actor), select: { companyId: true, normalizedName: true, category: true, enabled: true } }),
      this.prisma.websiteProductivityRule.findMany({ where: this.websiteProductivityRuleWhere(actor), select: { companyId: true, normalizedHostname: true, category: true, enabled: true } }),
      this.prisma.notification.count({ where: { ...this.notificationWhere(range, actor), readAt: null, channel: NotificationChannel.IN_APP } }),
      this.prisma.monitoringAlert.count({ where: { ...alertWhere, status: MonitoringAlertStatus.RESOLVED, resolvedAt: { gte: this.startOfTodayUtc() } } }),
    ]);

    const kpis = this.kpis(alerts, devices, deliveries, unreadNotifications, resolvedToday, employeesTotal, appUsage, websiteUsage, appRules, websiteRules);
    const monitoringHealth = this.monitoringHealth(devices, policies, employeesTotal);
    const notificationAnalytics = this.notificationAnalytics(deliveries, notifications);
    const executiveSummary = this.executiveSummary(kpis, monitoringHealth, notificationAnalytics);
    return {
      kpis,
      trend: this.trend(alerts, query.groupBy ?? 'DAY', range),
      heatmaps: this.heatmaps(alerts),
      rankings: this.rankings(alerts),
      sla: { mtta: this.slaMetric(alerts.map((alert) => this.diffMinutes(alert.detectedAt, alert.acknowledgedAt))), mttr: this.slaMetric(alerts.map((alert) => this.diffMinutes(alert.detectedAt, alert.resolvedAt))) },
      monitoringHealth,
      notificationAnalytics,
      executiveSummary,
      generatedAt: new Date(),
    };
  }

  async report(query: MonitoringOperationsReportQueryDto, actor: AuthenticatedUser) {
    const data = await this.dashboard(query, actor);
    const rows: Array<Array<string | number | null>> = [
      ['Open Alerts', data.kpis.openAlerts],
      ['Critical Alerts', data.kpis.criticalAlerts],
      ['Acknowledged Alerts', data.kpis.acknowledgedAlerts],
      ['Resolved Today', data.kpis.resolvedToday],
      ['Unread Notifications', data.kpis.unreadNotifications],
      ['Notification Success %', data.kpis.notificationSuccessPercentage],
      ['Email Delivery Success %', data.kpis.emailDeliverySuccessPercentage],
      ['Average MTTA Minutes', data.kpis.averageMttaMinutes],
      ['Average MTTR Minutes', data.kpis.averageMttrMinutes],
      ['Monitoring Coverage %', data.kpis.monitoringCoveragePercentage],
      ['Productivity Coverage %', data.kpis.productivityCoveragePercentage],
      ['Executive Health Score', data.executiveSummary.score],
      ['Executive Rating', data.executiveSummary.rating],
    ];
    if ((query.format ?? 'CSV') === 'PDF') {
      const text = ['Esta Workforce OS - Monitoring Operations Report', `Generated: ${data.generatedAt.toISOString()}`, '', ...rows.map((row) => `${row[0]}: ${row[1] ?? 'N/A'}`)].join('\n');
      return { filename: 'monitoring-operations-report.pdf', contentType: 'application/pdf', buffer: this.simplePdf(text) };
    }
    const csv = [['Metric', 'Value'], ...rows].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    return { filename: 'monitoring-operations-report.csv', contentType: 'text/csv; charset=utf-8', buffer: Buffer.from(`\uFEFF${csv}\r\n`, 'utf8') };
  }

  private kpis(alerts: AlertRecord[], devices: DeviceRecord[], deliveries: Array<{ status: NotificationStatus; channel: NotificationChannel; sentAt: Date | null; createdAt: Date }>, unreadNotifications: number, resolvedToday: number, employeesTotal: number, appUsage: Array<{ applicationName: string; durationSeconds: number; companyId: string }>, websiteUsage: Array<{ domain: string; durationSeconds: number; companyId: string }>, appRules: Array<{ companyId: string | null; normalizedName: string; category: ProductivityCategory; enabled: boolean }>, websiteRules: Array<{ companyId: string | null; normalizedHostname: string; category: ProductivityCategory; enabled: boolean }>) {
    const notificationSuccessPercentage = this.percent(deliveries.filter((delivery) => delivery.status === NotificationStatus.DELIVERED).length, deliveries.length);
    const emailDeliveries = deliveries.filter((delivery) => delivery.channel === NotificationChannel.EMAIL);
    const mtta = this.slaMetric(alerts.map((alert) => this.diffMinutes(alert.detectedAt, alert.acknowledgedAt))).averageMinutes;
    const mttr = this.slaMetric(alerts.map((alert) => this.diffMinutes(alert.detectedAt, alert.resolvedAt))).averageMinutes;
    return {
      openAlerts: alerts.filter((alert) => alert.status === MonitoringAlertStatus.OPEN).length,
      criticalAlerts: alerts.filter((alert) => alert.severity === MonitoringAlertSeverity.CRITICAL).length,
      acknowledgedAlerts: alerts.filter((alert) => alert.status === MonitoringAlertStatus.ACKNOWLEDGED).length,
      resolvedToday,
      unreadNotifications,
      notificationSuccessPercentage,
      emailDeliverySuccessPercentage: this.percent(emailDeliveries.filter((delivery) => delivery.status === NotificationStatus.DELIVERED).length, emailDeliveries.length),
      averageMttaMinutes: mtta,
      averageMttrMinutes: mttr,
      monitoringCoveragePercentage: this.percent(new Set(devices.filter((device) => device.deletedAt === null).map((device) => device.employeeId)).size, employeesTotal),
      productivityCoveragePercentage: this.productivityCoverage(appUsage, websiteUsage, appRules, websiteRules),
    };
  }

  private trend(alerts: AlertRecord[], groupBy: 'DAY' | 'WEEK' | 'MONTH', range: { gte: Date; lte: Date }) {
    const buckets = new Map<string, { openAlerts: number; resolvedAlerts: number; criticalAlerts: number; warningAlerts: number; infoAlerts: number }>();
    for (const alert of alerts) {
      const key = this.bucket(alert.detectedAt, groupBy);
      const bucket = buckets.get(key) ?? { openAlerts: 0, resolvedAlerts: 0, criticalAlerts: 0, warningAlerts: 0, infoAlerts: 0 };
      if (alert.status === MonitoringAlertStatus.OPEN) bucket.openAlerts += 1;
      if (alert.status === MonitoringAlertStatus.RESOLVED) bucket.resolvedAlerts += 1;
      if (alert.severity === MonitoringAlertSeverity.CRITICAL) bucket.criticalAlerts += 1;
      if (alert.severity === MonitoringAlertSeverity.WARNING) bucket.warningAlerts += 1;
      if (alert.severity === MonitoringAlertSeverity.INFO) bucket.infoAlerts += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, value]) => ({ bucket, ...value }));
  }

  private heatmaps(alerts: AlertRecord[]) {
    return {
      hourOfDay: this.countBy(alerts, (alert) => `${alert.detectedAt.getUTCHours().toString().padStart(2, '0')}:00`),
      dayOfWeek: this.countBy(alerts, (alert) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][alert.detectedAt.getUTCDay()]),
      department: this.countBy(alerts, (alert) => alert.employee?.department?.name ?? 'Unassigned'),
      branch: this.countBy(alerts, (alert) => alert.employee?.branch?.name ?? 'Unassigned'),
      alertType: this.countBy(alerts, (alert) => alert.type),
      device: this.countBy(alerts, (alert) => alert.device?.deviceName ?? 'No device'),
      employee: this.countBy(alerts, (alert) => this.employeeName(alert)),
    };
  }

  private rankings(alerts: AlertRecord[]) {
    const byType = this.ranking(alerts, (alert) => alert.type);
    return {
      topAlertTypes: byType,
      topDevices: this.ranking(alerts.filter((alert) => alert.device), (alert) => alert.device?.deviceName ?? 'Unknown', (alert) => alert.deviceId ?? alert.id),
      topEmployees: this.ranking(alerts.filter((alert) => alert.employee), (alert) => this.employeeName(alert), (alert) => alert.employeeId ?? alert.id),
      topDepartments: this.ranking(alerts, (alert) => alert.employee?.department?.name ?? 'Unassigned', (alert) => alert.employee?.department?.id ?? 'unassigned'),
      mostFrequentlyOfflineDevices: this.ranking(alerts.filter((alert) => alert.type === MonitoringAlertType.DEVICE_OFFLINE || alert.type === MonitoringAlertType.MISSING_HEARTBEAT), (alert) => alert.device?.deviceName ?? 'Unknown', (alert) => alert.deviceId ?? alert.id),
      mostScreenshotMissingDevices: this.ranking(alerts.filter((alert) => alert.type === MonitoringAlertType.SCREENSHOT_MISSING), (alert) => alert.device?.deviceName ?? 'Unknown', (alert) => alert.deviceId ?? alert.id),
      mostIdleEmployees: this.ranking(alerts.filter((alert) => alert.type === MonitoringAlertType.EXCESSIVE_IDLE), (alert) => this.employeeName(alert), (alert) => alert.employeeId ?? alert.id),
      mostRepeatedAlerts: this.ranking(alerts, (alert) => alert.title, (alert) => alert.deduplicationKey),
    };
  }

  private monitoringHealth(devices: DeviceRecord[], policies: Array<{ companyId: string | null; branchId: string | null; departmentId: string | null; employeeId: string | null }>, employeesTotal: number) {
    const now = Date.now();
    const online = devices.filter((device) => device.lastSeenAt && now - device.lastSeenAt.getTime() <= 10 * 60_000).length;
    const screenshotHealthy = devices.filter((device) => device.status === MonitoringDeviceStatus.ACTIVE || device.status === MonitoringDeviceStatus.TRUSTED).length;
    return {
      devicesOnline: online,
      devicesOffline: Math.max(0, devices.length - online),
      devicesRevoked: devices.filter((device) => device.status === MonitoringDeviceStatus.REVOKED).length,
      heartbeatHealthy: online,
      screenshotHealthy,
      monitoringEnabledPercentage: this.percent(devices.filter((device) => device.status !== MonitoringDeviceStatus.INACTIVE && device.status !== MonitoringDeviceStatus.REVOKED).length, devices.length),
      policyCoveragePercentage: this.percent(policies.length, Math.max(1, employeesTotal)),
    };
  }

  private notificationAnalytics(deliveries: Array<{ status: NotificationStatus; channel: NotificationChannel; attemptCount: number; sentAt: Date | null; createdAt: Date }>, notificationCount: number) {
    const email = deliveries.filter((delivery) => delivery.channel === NotificationChannel.EMAIL);
    const delivered = deliveries.filter((delivery) => delivery.status === NotificationStatus.DELIVERED);
    return {
      inAppSent: notificationCount,
      emailSent: email.filter((delivery) => delivery.status === NotificationStatus.DELIVERED).length,
      emailFailed: email.filter((delivery) => delivery.status === NotificationStatus.FAILED).length,
      pendingRetry: email.filter((delivery) => delivery.status === NotificationStatus.PENDING).length,
      retrySuccessPercentage: this.percent(email.filter((delivery) => delivery.attemptCount > 1 && delivery.status === NotificationStatus.DELIVERED).length, email.filter((delivery) => delivery.attemptCount > 1).length),
      averageDeliverySeconds: this.average(delivered.map((delivery) => delivery.sentAt ? (delivery.sentAt.getTime() - delivery.createdAt.getTime()) / 1000 : null)),
      deliveryFailurePercentage: this.percent(deliveries.filter((delivery) => delivery.status === NotificationStatus.FAILED).length, deliveries.length),
    };
  }

  private executiveSummary(kpis: ReturnType<MonitoringOperationsService['kpis']>, health: ReturnType<MonitoringOperationsService['monitoringHealth']>, notifications: ReturnType<MonitoringOperationsService['notificationAnalytics']>) {
    const alertResolution = this.percent(kpis.resolvedToday, kpis.openAlerts + kpis.acknowledgedAlerts + kpis.resolvedToday);
    const onlineDevices = this.percent(health.devicesOnline, health.devicesOnline + health.devicesOffline);
    const score = Number(((kpis.monitoringCoveragePercentage * 0.25) + (alertResolution * 0.2) + (kpis.notificationSuccessPercentage * 0.2) + (kpis.productivityCoveragePercentage * 0.2) + (onlineDevices * 0.15)).toFixed(2));
    const rating = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs Attention' : 'Critical';
    return { score, rating, formula: '0.25 monitoring coverage + 0.20 alert resolution + 0.20 notification success + 0.20 productivity coverage + 0.15 online devices' };
  }

  private slaMetric(values: Array<number | null>) {
    const samples = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
    return { averageMinutes: this.average(samples), medianMinutes: samples.length ? Number(samples[Math.floor(samples.length / 2)].toFixed(2)) : null, minMinutes: samples.length ? Number(samples[0].toFixed(2)) : null, maxMinutes: samples.length ? Number(samples[samples.length - 1].toFixed(2)) : null, samples: samples.length, distribution: this.distribution(samples) };
  }

  private distribution(values: number[]) {
    const buckets = [{ label: '<15m', max: 15 }, { label: '15-60m', max: 60 }, { label: '1-4h', max: 240 }, { label: '>4h', max: Infinity }];
    return buckets.map((bucket, index) => ({ label: bucket.label, count: values.filter((value) => value <= bucket.max && (index === 0 || value > buckets[index - 1].max)).length }));
  }

  private productivityCoverage(appUsage: Array<{ applicationName: string; durationSeconds: number; companyId: string }>, websiteUsage: Array<{ domain: string; durationSeconds: number; companyId: string }>, appRules: Array<{ companyId: string | null; normalizedName: string; category: ProductivityCategory; enabled: boolean }>, websiteRules: Array<{ companyId: string | null; normalizedHostname: string; category: ProductivityCategory; enabled: boolean }>) {
    const appRuleSet = new Set(appRules.filter((rule) => rule.enabled && rule.category !== ProductivityCategory.UNCLASSIFIED).map((rule) => `${rule.companyId ?? 'GLOBAL'}:${rule.normalizedName.toLowerCase()}`));
    const webRuleSet = new Set(websiteRules.filter((rule) => rule.enabled && rule.category !== ProductivityCategory.UNCLASSIFIED).map((rule) => `${rule.companyId ?? 'GLOBAL'}:${rule.normalizedHostname.toLowerCase()}`));
    let total = 0; let classified = 0;
    for (const usage of appUsage) { total += usage.durationSeconds; const key = usage.applicationName.trim().toLowerCase(); if (appRuleSet.has(`${usage.companyId}:${key}`) || appRuleSet.has(`GLOBAL:${key}`)) classified += usage.durationSeconds; }
    for (const usage of websiteUsage) { total += usage.durationSeconds; const key = usage.domain.trim().toLowerCase(); if (webRuleSet.has(`${usage.companyId}:${key}`) || webRuleSet.has(`GLOBAL:${key}`)) classified += usage.durationSeconds; }
    return this.percent(classified, total);
  }

  private alertWhere(query: MonitoringOperationsQueryDto, range: { gte: Date; lte: Date }, employeeWhere: Prisma.EmployeeWhereInput, actor: AuthenticatedUser): Prisma.MonitoringAlertWhereInput {
    const filters: Prisma.MonitoringAlertWhereInput[] = [{ detectedAt: range }, { employee: { is: employeeWhere } }];
    if (actor.roles.includes(RoleName.SUPER_ADMIN) && query.companyId) filters.push({ companyId: query.companyId });
    else if (!actor.roles.includes(RoleName.SUPER_ADMIN)) filters.push({ companyId: actor.companyId ?? '__missing_tenant__' });
    if (query.alertType) filters.push({ type: query.alertType });
    if (query.severity) filters.push({ severity: query.severity });
    if (query.status) filters.push({ status: query.status });
    return { AND: filters };
  }

  private deviceWhere(query: MonitoringOperationsQueryDto, employeeWhere: Prisma.EmployeeWhereInput, actor: AuthenticatedUser): Prisma.MonitoringDeviceWhereInput {
    const filters: Prisma.MonitoringDeviceWhereInput[] = [{ deletedAt: null }, { employee: { is: employeeWhere } }];
    if (actor.roles.includes(RoleName.SUPER_ADMIN) && query.companyId) filters.push({ companyId: query.companyId });
    else if (!actor.roles.includes(RoleName.SUPER_ADMIN)) filters.push({ companyId: actor.companyId ?? '__missing_tenant__' });
    return { AND: filters };
  }

  private usageWhere(range: { gte: Date; lte: Date }, employeeWhere: Prisma.EmployeeWhereInput, actor: AuthenticatedUser, query: MonitoringOperationsQueryDto) {
    const filters: Prisma.ApplicationUsageWhereInput[] = [{ startedAt: { lte: range.lte }, endedAt: { gte: range.gte } }, { employee: { is: employeeWhere } }];
    if (actor.roles.includes(RoleName.SUPER_ADMIN) && query.companyId) filters.push({ companyId: query.companyId });
    else if (!actor.roles.includes(RoleName.SUPER_ADMIN)) filters.push({ companyId: actor.companyId ?? '__missing_tenant__' });
    return { AND: filters };
  }

  private websiteUsageWhere(range: { gte: Date; lte: Date }, employeeWhere: Prisma.EmployeeWhereInput, actor: AuthenticatedUser, query: MonitoringOperationsQueryDto): Prisma.WebsiteUsageWhereInput {
    const filters: Prisma.WebsiteUsageWhereInput[] = [{ startedAt: { lte: range.lte }, endedAt: { gte: range.gte } }, { employee: { is: employeeWhere } }];
    if (actor.roles.includes(RoleName.SUPER_ADMIN) && query.companyId) filters.push({ companyId: query.companyId });
    else if (!actor.roles.includes(RoleName.SUPER_ADMIN)) filters.push({ companyId: actor.companyId ?? '__missing_tenant__' });
    return { AND: filters };
  }

  private notificationWhere(range: { gte: Date; lte: Date }, actor: AuthenticatedUser): Prisma.NotificationWhereInput {
    return { createdAt: range, ...(actor.roles.includes(RoleName.SUPER_ADMIN) ? {} : { companyId: actor.companyId ?? '__missing_tenant__' }) };
  }

  private deliveryWhere(range: { gte: Date; lte: Date }, actor: AuthenticatedUser): Prisma.NotificationDeliveryWhereInput {
    return { createdAt: range, ...(actor.roles.includes(RoleName.SUPER_ADMIN) ? {} : { notification: { companyId: actor.companyId ?? '__missing_tenant__' } }) };
  }

  private policyWhere(actor: AuthenticatedUser, query: MonitoringOperationsQueryDto): Prisma.MonitoringAlertPolicyWhereInput {
    return { deletedAt: null, ...(actor.roles.includes(RoleName.SUPER_ADMIN) ? (query.companyId ? { companyId: query.companyId } : {}) : { companyId: actor.companyId ?? '__missing_tenant__' }) };
  }

  private productivityRuleWhere(actor: AuthenticatedUser): Prisma.ApplicationProductivityRuleWhereInput {
    return { deletedAt: null, ...(actor.roles.includes(RoleName.SUPER_ADMIN) ? {} : { OR: [{ companyId: null }, { companyId: actor.companyId ?? '__missing_tenant__' }] }) };
  }

  private websiteProductivityRuleWhere(actor: AuthenticatedUser): Prisma.WebsiteProductivityRuleWhereInput {
    return { deletedAt: null, ...(actor.roles.includes(RoleName.SUPER_ADMIN) ? {} : { OR: [{ companyId: null }, { companyId: actor.companyId ?? '__missing_tenant__' }] }) };
  }

  private async employeeVisibilityWhere(actor: AuthenticatedUser, query: MonitoringOperationsQueryDto): Promise<Prisma.EmployeeWhereInput> {
    const filters: Prisma.EmployeeWhereInput[] = [{ deletedAt: null }];
    if (query.branchId) filters.push({ branchId: query.branchId });
    if (query.departmentId) filters.push({ departmentId: query.departmentId });
    if (query.employeeId) filters.push({ id: query.employeeId });
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) { if (query.companyId) filters.push({ companyId: query.companyId }); return { AND: filters }; }
    if (actor.roles.includes(RoleName.COMPANY_ADMIN) || actor.roles.includes(RoleName.HR)) { if (!actor.companyId) throw new ForbiddenException('Tenant is required'); filters.push({ companyId: actor.companyId }); return { AND: filters }; }
    const own = await this.prisma.employee.findFirst({ where: { userId: actor.id, deletedAt: null }, select: { id: true } });
    if (!own) return { id: '__missing_employee__' };
    if (actor.roles.includes(RoleName.MANAGER)) filters.push({ OR: [{ id: own.id }, { reportingManagerId: own.id }] }); else filters.push({ id: own.id });
    return { AND: filters };
  }

  private dateRange(query: { dateFrom?: string; dateTo?: string }) {
    const now = new Date();
    const from = query.dateFrom ? this.boundary(query.dateFrom, 'start') : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
    const to = query.dateTo ? this.boundary(query.dateTo, 'end') : now;
    if (from > to) throw new BadRequestException('dateFrom must not be after dateTo');
    return { gte: from, lte: to };
  }

  private boundary(value: string, side: 'start' | 'end') { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T${side === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`) : new Date(value); }
  private startOfTodayUtc() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
  private diffMinutes(start: Date, end?: Date | null) { return end ? Math.max(0, (end.getTime() - start.getTime()) / 60_000) : null; }
  private average(values: Array<number | null>) { const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)); return clean.length ? Number((clean.reduce((sum, value) => sum + value, 0) / clean.length).toFixed(2)) : null; }
  private percent(part: number, total: number) { return total > 0 ? Number(Math.min(100, Math.max(0, (part / total) * 100)).toFixed(2)) : 0; }
  private employeeName(alert: AlertRecord) { return alert.employee?.user ? `${alert.employee.user.firstName} ${alert.employee.user.lastName}`.trim() || alert.employee.user.email : 'Company scope'; }
  private countBy(alerts: AlertRecord[], key: (alert: AlertRecord) => string) { return [...alerts.reduce((map, alert) => map.set(key(alert), (map.get(key(alert)) ?? 0) + 1), new Map<string, number>()).entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 12); }
  private ranking(alerts: AlertRecord[], label: (alert: AlertRecord) => string, id: (alert: AlertRecord) => string = label) { return [...alerts.reduce((map, alert) => { const key = id(alert); const current = map.get(key) ?? { id: key, label: label(alert), count: 0, secondary: null as string | null }; current.count += 1; map.set(key, current); return map; }, new Map<string, { id: string; label: string; count: number; secondary: string | null }>()).values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 10); }
  private bucket(date: Date, groupBy: 'DAY' | 'WEEK' | 'MONTH') { const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); if (groupBy === 'MONTH') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; if (groupBy === 'WEEK') { const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1); return d.toISOString().slice(0, 10); } return d.toISOString().slice(0, 10); }
  private simplePdf(text: string) { const escaped = text.replace(/[()\\]/g, '\\$&').split('\n').map((line, index) => `1 0 0 1 50 ${760 - index * 16} Tm (${line.slice(0, 90)}) Tj`).join('\n'); const stream = `BT /F1 10 Tf ${escaped} ET`; const objects = [`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`, `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`, `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj`, `4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`, `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`]; let pdf = `%PDF-1.4\n`; const offsets = [0]; for (const obj of objects) { offsets.push(Buffer.byteLength(pdf)); pdf += `${obj}\n`; } const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(pdf); }
}

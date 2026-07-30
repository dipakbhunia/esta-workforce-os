import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MonitoringAlertPolicy,
  MonitoringAlertPolicyScope,
  MonitoringAlertSeverity,
  MonitoringAlertType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface ResolvedAlertTypeSetting {
  enabled: boolean;
  severity: MonitoringAlertSeverity;
  thresholdMinutes: number;
  gracePeriodMinutes: number;
  workingHoursOnly: boolean;
  weekendEnabled: boolean;
  maintenanceIgnore: boolean;
  autoResolve: boolean;
}

export type ResolvedAlertSettings = Record<MonitoringAlertType, ResolvedAlertTypeSetting>;

export interface ResolvedAlertPolicy {
  policyId: string | null;
  policyName: string;
  scope: MonitoringAlertPolicyScope;
  settings: ResolvedAlertSettings;
  maintenance: {
    active: boolean;
    reason: string | null;
    start: Date | null;
    end: Date | null;
  };
}

type AlertPolicySettingsInput = Partial<Record<MonitoringAlertType, Partial<ResolvedAlertTypeSetting>>>;

type PolicyCandidate = Pick<MonitoringAlertPolicy, 'id' | 'name' | 'scope' | 'priority' | 'settings' | 'maintenanceStart' | 'maintenanceEnd' | 'maintenanceReason'>;

const scopeRank: Record<MonitoringAlertPolicyScope, number> = {
  SYSTEM: 0,
  COMPANY: 1,
  BRANCH: 2,
  DEPARTMENT: 3,
  EMPLOYEE: 4,
};

@Injectable()
export class MonitoringAlertPolicyResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async resolveForEmployee(employeeId: string | null | undefined, companyId?: string | null): Promise<ResolvedAlertPolicy> {
    const employee = employeeId
      ? await this.prisma.employee.findFirst({
          where: { id: employeeId, deletedAt: null },
          select: { id: true, companyId: true, branchId: true, departmentId: true },
        })
      : null;
    const resolvedCompanyId = employee?.companyId ?? companyId ?? null;
    const filters: Prisma.MonitoringAlertPolicyWhereInput[] = [
      { scope: MonitoringAlertPolicyScope.SYSTEM },
    ];
    if (resolvedCompanyId) filters.push({ scope: MonitoringAlertPolicyScope.COMPANY, companyId: resolvedCompanyId });
    if (employee?.branchId) filters.push({ scope: MonitoringAlertPolicyScope.BRANCH, branchId: employee.branchId });
    if (employee?.departmentId) filters.push({ scope: MonitoringAlertPolicyScope.DEPARTMENT, departmentId: employee.departmentId });
    if (employee?.id) filters.push({ scope: MonitoringAlertPolicyScope.EMPLOYEE, employeeId: employee.id });

    const candidates = await this.prisma.monitoringAlertPolicy.findMany({
      where: { deletedAt: null, enabled: true, OR: filters },
      orderBy: [{ scope: 'asc' }, { priority: 'asc' }],
    });
    return this.resolveFromCandidates(candidates);
  }

  defaultSettings(): ResolvedAlertSettings {
    return {
      DEVICE_OFFLINE: this.setting('WARNING', 'ALERT_DEVICE_OFFLINE_MINUTES', 10),
      MISSING_HEARTBEAT: this.setting('CRITICAL', 'ALERT_MISSING_HEARTBEAT_MINUTES', 20),
      MONITORING_DISABLED: this.setting('WARNING', undefined, 0),
      DEVICE_REVOKED: this.setting('CRITICAL', undefined, 0),
      REREGISTRATION_REQUIRED: this.setting('CRITICAL', undefined, 0),
      EXCESSIVE_IDLE: this.setting('WARNING', 'ALERT_EXCESSIVE_IDLE_MINUTES', 30),
      SCREENSHOT_MISSING: this.setting('WARNING', 'ALERT_SCREENSHOT_MISSING_MINUTES', 30),
    };
  }

  private resolveFromCandidates(candidates: PolicyCandidate[]): ResolvedAlertPolicy {
    const settings = this.defaultSettings();
    const sorted = [...candidates].sort((a, b) => scopeRank[a.scope] - scopeRank[b.scope] || a.priority - b.priority);
    let winner: PolicyCandidate | null = null;
    for (const candidate of sorted) {
      winner = candidate;
      const candidateSettings = this.parseSettings(candidate.settings);
      for (const type of Object.values(MonitoringAlertType)) {
        if (!candidateSettings[type]) continue;
        settings[type] = { ...settings[type], ...candidateSettings[type] };
      }
    }
    const now = new Date();
    const maintenance = winner?.maintenanceStart && winner.maintenanceEnd && winner.maintenanceStart <= now && winner.maintenanceEnd >= now
      ? { active: true, reason: winner.maintenanceReason ?? null, start: winner.maintenanceStart, end: winner.maintenanceEnd }
      : { active: false, reason: null, start: winner?.maintenanceStart ?? null, end: winner?.maintenanceEnd ?? null };
    return {
      policyId: winner?.id ?? null,
      policyName: winner?.name ?? 'System default policy',
      scope: winner?.scope ?? MonitoringAlertPolicyScope.SYSTEM,
      settings,
      maintenance,
    };
  }

  private setting(severity: MonitoringAlertSeverity, thresholdEnv: string | undefined, fallbackThreshold: number): ResolvedAlertTypeSetting {
    return {
      enabled: true,
      severity,
      thresholdMinutes: thresholdEnv ? this.threshold(thresholdEnv, fallbackThreshold) : fallbackThreshold,
      gracePeriodMinutes: 0,
      workingHoursOnly: false,
      weekendEnabled: true,
      maintenanceIgnore: true,
      autoResolve: true,
    };
  }

  private parseSettings(value: Prisma.JsonValue): AlertPolicySettingsInput {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return value as AlertPolicySettingsInput;
  }

  private threshold(name: string, fallback: number): number {
    const value = Number(this.config.get<number | string>(name) ?? fallback);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
}

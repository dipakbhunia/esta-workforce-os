import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MonitoringAlertPolicyScope, Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateMonitoringAlertPolicyDto,
  MonitoringAlertPolicyListResponseDto,
  MonitoringAlertPolicyQueryDto,
  MonitoringAlertPolicyResponseDto,
  UpdateMonitoringAlertPolicyDto,
} from './dto/monitoring-alert-policy.dto';

const policyManagerRoles: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR];

@Injectable()
export class MonitoringAlertPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MonitoringAlertPolicyQueryDto, actor: AuthenticatedUser): Promise<MonitoringAlertPolicyListResponseDto> {
    this.assertCanManage(actor);
    const page = query.page ?? 1;
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const filters: Prisma.MonitoringAlertPolicyWhereInput[] = [await this.visibilityWhere(actor), { deletedAt: null }];
    if (query.scope) filters.push({ scope: query.scope });
    if (typeof query.enabled === 'boolean') filters.push({ enabled: query.enabled });
    if (query.search?.trim()) {
      const search = query.search.trim();
      filters.push({ OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] });
    }
    const where = { AND: filters };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.monitoringAlertPolicy.findMany({ where, orderBy: [{ scope: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.monitoringAlertPolicy.count({ where }),
    ]);
    return { data: data.map((policy) => this.toResponse(policy)), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async detail(id: string, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const policy = await this.prisma.monitoringAlertPolicy.findFirst({ where: { id, deletedAt: null, AND: [await this.visibilityWhere(actor)] } });
    if (!policy) throw new NotFoundException('Monitoring alert policy not found');
    return this.toResponse(policy);
  }

  async create(dto: CreateMonitoringAlertPolicyDto, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const data = await this.prepareData(dto, actor);
    const policy = await this.prisma.monitoringAlertPolicy.create({ data });
    await this.audit(actor, policy.companyId, 'MONITORING_ALERT_POLICY_CREATED', policy.id, { scope: policy.scope });
    return this.toResponse(policy);
  }

  async update(id: string, dto: UpdateMonitoringAlertPolicyDto, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const existing = await this.prisma.monitoringAlertPolicy.findFirst({ where: { id, deletedAt: null, AND: [await this.visibilityWhere(actor)] } });
    if (!existing) throw new NotFoundException('Monitoring alert policy not found');
    const data = await this.prepareData(dto, actor);
    const policy = await this.prisma.monitoringAlertPolicy.update({ where: { id }, data });
    await this.audit(actor, policy.companyId, 'MONITORING_ALERT_POLICY_UPDATED', policy.id, { scope: policy.scope });
    return this.toResponse(policy);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const existing = await this.prisma.monitoringAlertPolicy.findFirst({ where: { id, deletedAt: null, AND: [await this.visibilityWhere(actor)] } });
    if (!existing) throw new NotFoundException('Monitoring alert policy not found');
    const policy = await this.prisma.monitoringAlertPolicy.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(actor, policy.companyId, 'MONITORING_ALERT_POLICY_DELETED', policy.id, { scope: policy.scope });
    return this.toResponse(policy);
  }

  private async prepareData(dto: CreateMonitoringAlertPolicyDto | UpdateMonitoringAlertPolicyDto, actor: AuthenticatedUser): Promise<Prisma.MonitoringAlertPolicyUncheckedCreateInput> {
    const scope = dto.scope;
    const companyId = actor.roles.includes(RoleName.SUPER_ADMIN) ? dto.companyId ?? null : actor.companyId ?? null;
    if (!actor.roles.includes(RoleName.SUPER_ADMIN) && !companyId) throw new ForbiddenException('Tenant is required');
    if (scope === MonitoringAlertPolicyScope.SYSTEM && !actor.roles.includes(RoleName.SUPER_ADMIN)) {
      throw new ForbiddenException('Only super administrators can manage system alert policies');
    }
    if (scope !== MonitoringAlertPolicyScope.SYSTEM && !companyId) {
      throw new BadRequestException('Company is required for non-system policies');
    }
    await this.validateScopeOwnership(scope, { companyId, branchId: dto.branchId, departmentId: dto.departmentId, employeeId: dto.employeeId }, actor);
    return {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      enabled: dto.enabled ?? true,
      priority: dto.priority ?? 100,
      scope,
      companyId: scope === MonitoringAlertPolicyScope.SYSTEM ? null : companyId,
      branchId: scope === MonitoringAlertPolicyScope.BRANCH ? dto.branchId ?? null : null,
      departmentId: scope === MonitoringAlertPolicyScope.DEPARTMENT ? dto.departmentId ?? null : null,
      employeeId: scope === MonitoringAlertPolicyScope.EMPLOYEE ? dto.employeeId ?? null : null,
      settings: this.cleanSettings(dto.settings),
      maintenanceStart: dto.maintenanceStart ? new Date(dto.maintenanceStart) : null,
      maintenanceEnd: dto.maintenanceEnd ? new Date(dto.maintenanceEnd) : null,
      maintenanceReason: dto.maintenanceReason?.trim() || null,
    };
  }

  private async validateScopeOwnership(scope: MonitoringAlertPolicyScope, ids: { companyId: string | null; branchId?: string; departmentId?: string; employeeId?: string }, actor: AuthenticatedUser) {
    if (scope === MonitoringAlertPolicyScope.COMPANY || scope === MonitoringAlertPolicyScope.SYSTEM) return;
    if (scope === MonitoringAlertPolicyScope.BRANCH) {
      if (!ids.branchId) throw new BadRequestException('Branch is required for branch policies');
      const branch = await this.prisma.branch.findFirst({ where: { id: ids.branchId, deletedAt: null, ...(ids.companyId ? { companyId: ids.companyId } : {}) }, select: { id: true } });
      if (!branch) throw new NotFoundException('Branch not found');
    }
    if (scope === MonitoringAlertPolicyScope.DEPARTMENT) {
      if (!ids.departmentId) throw new BadRequestException('Department is required for department policies');
      const department = await this.prisma.department.findFirst({ where: { id: ids.departmentId, deletedAt: null, ...(ids.companyId ? { companyId: ids.companyId } : {}) }, select: { id: true } });
      if (!department) throw new NotFoundException('Department not found');
    }
    if (scope === MonitoringAlertPolicyScope.EMPLOYEE) {
      if (!ids.employeeId) throw new BadRequestException('Employee is required for employee policies');
      const employee = await this.prisma.employee.findFirst({ where: { id: ids.employeeId, deletedAt: null, ...(ids.companyId ? { companyId: ids.companyId } : {}) }, select: { id: true } });
      if (!employee) throw new NotFoundException('Employee not found');
    }
  }

  private cleanSettings(settings: Record<string, unknown>): Prisma.InputJsonValue {
    if (!settings || Array.isArray(settings) || typeof settings !== 'object') throw new BadRequestException('Policy settings are required');
    return settings as Prisma.InputJsonObject;
  }

  private async visibilityWhere(actor: AuthenticatedUser): Promise<Prisma.MonitoringAlertPolicyWhereInput> {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return {};
    if (!actor.companyId) throw new ForbiddenException('Tenant is required');
    return { OR: [{ companyId: actor.companyId }, { scope: MonitoringAlertPolicyScope.SYSTEM }] };
  }

  private assertCanManage(actor: AuthenticatedUser) {
    if (actor.roles.some((role) => policyManagerRoles.includes(role))) return;
    throw new ForbiddenException('Alert policy management is not allowed for this role');
  }

  private toResponse(policy: Prisma.MonitoringAlertPolicyGetPayload<{}>): MonitoringAlertPolicyResponseDto {
    return {
      id: policy.id,
      companyId: policy.companyId,
      branchId: policy.branchId,
      departmentId: policy.departmentId,
      employeeId: policy.employeeId,
      name: policy.name,
      description: policy.description,
      enabled: policy.enabled,
      priority: policy.priority,
      scope: policy.scope,
      settings: policy.settings as Record<string, unknown>,
      maintenanceStart: policy.maintenanceStart,
      maintenanceEnd: policy.maintenanceEnd,
      maintenanceReason: policy.maintenanceReason,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  private async audit(actor: AuthenticatedUser, companyId: string | null, action: string, policyId: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({ data: { companyId, actorUserId: actor.id, action, entityType: 'MonitoringAlertPolicy', entityId: policyId, metadata: metadata as Prisma.InputJsonValue } });
  }
}

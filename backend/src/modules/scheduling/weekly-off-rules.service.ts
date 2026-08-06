import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WeeklyOffRuleType } from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { requireTenantId } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../attendance/attendance-time.util';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateWeeklyOffRuleDto, UpdateWeeklyOffRuleDto, WeeklyOffRuleQueryDto } from './dto/scheduling.dto';

@Injectable()
export class WeeklyOffRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWeeklyOffRuleDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const data = (await this.toData(companyId, dto)) as Prisma.WeeklyOffRuleUncheckedCreateInput;
    const rule = await this.prisma.weeklyOffRule.create({
      data: { ...data, companyId, createdById: actor.id, updatedById: actor.id },
    });
    await this.audit(companyId, actor.id, 'WEEKLY_OFF_RULE_CREATED', rule.id, {});
    return rule;
  }

  async findAll(query: WeeklyOffRuleQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where: Prisma.WeeklyOffRuleWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.enabled !== undefined ? { enabled: this.booleanValue(query.enabled) } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.weeklyOffRule.findMany({ where, include: { branch: true, department: true, employee: true }, ...paginationArgs(query), orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] }),
      this.prisma.weeklyOffRule.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    return this.requireRule(id, requireTenantId(actor));
  }

  async update(id: string, dto: UpdateWeeklyOffRuleDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireRule(id, companyId);
    const data = (await this.toData(companyId, dto, true)) as Prisma.WeeklyOffRuleUncheckedUpdateInput;
    const rule = await this.prisma.weeklyOffRule.update({ where: { id }, data: { ...data, updatedById: actor.id } });
    await this.audit(companyId, actor.id, 'WEEKLY_OFF_RULE_UPDATED', id, {});
    return rule;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireRule(id, companyId);
    const rule = await this.prisma.weeklyOffRule.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.id } });
    await this.audit(companyId, actor.id, 'WEEKLY_OFF_RULE_DELETED', id, {});
    return rule;
  }

  private async requireRule(id: string, companyId: string) {
    const rule = await this.prisma.weeklyOffRule.findFirst({ where: { id, companyId, deletedAt: null }, include: { branch: true, department: true, employee: true } });
    if (!rule) throw new NotFoundException('Weekly off rule not found');
    return rule;
  }

  private async toData(companyId: string, dto: Partial<CreateWeeklyOffRuleDto>, partial = false): Promise<Record<string, unknown>> {
    if (!partial || dto.weekdays !== undefined) {
      const weekdays = dto.weekdays ?? [];
      if (!weekdays.length || weekdays.some((day) => !Number.isInteger(Number(day)) || Number(day) < 0 || Number(day) > 6)) {
        throw new BadRequestException('weekdays must contain values from 0 to 6');
      }
    }
    if (dto.effectiveFrom && dto.effectiveTo && dateOnly(dto.effectiveFrom) > dateOnly(dto.effectiveTo)) {
      throw new BadRequestException('effectiveFrom must not be after effectiveTo');
    }
    await this.assertScope(companyId, dto.branchId, dto.departmentId, dto.employeeId);
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone.trim() || 'UTC' } : {}),
      ...(dto.ruleType !== undefined ? { ruleType: dto.ruleType } : !partial ? { ruleType: WeeklyOffRuleType.FIXED_WEEKDAYS } : {}),
      ...(dto.weekdays !== undefined ? { weekdays: dto.weekdays.map((day) => Number(day)) } : {}),
      ...(dto.effectiveFrom !== undefined ? { effectiveFrom: dateOnly(dto.effectiveFrom) } : {}),
      ...(dto.effectiveTo !== undefined ? { effectiveTo: dto.effectiveTo ? dateOnly(dto.effectiveTo) : null } : {}),
      ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
      ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
      ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
      ...(dto.priority !== undefined ? { priority: Number(dto.priority) } : {}),
      ...(dto.enabled !== undefined ? { enabled: this.booleanValue(dto.enabled) } : {}),
    };
  }

  private async assertScope(companyId: string, branchId?: string, departmentId?: string, employeeId?: string) {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null }, select: { id: true } });
      if (!branch) throw new BadRequestException('Branch not found in this company');
    }
    if (departmentId) {
      const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId, deletedAt: null }, select: { id: true, branchId: true } });
      if (!department) throw new BadRequestException('Department not found in this company');
      if (branchId && department.branchId && department.branchId !== branchId) throw new BadRequestException('Department does not belong to the selected branch');
    }
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId, deletedAt: null }, select: { id: true, branchId: true, departmentId: true } });
      if (!employee) throw new BadRequestException('Employee not found in this company');
      if (branchId && employee.branchId !== branchId) throw new BadRequestException('Employee does not belong to the selected branch');
      if (departmentId && employee.departmentId !== departmentId) throw new BadRequestException('Employee does not belong to the selected department');
    }
  }

  private booleanValue(value: unknown): boolean {
    return value === true || value === 'true';
  }

  private async audit(companyId: string, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { companyId, actorUserId, action, entityType: 'WeeklyOffRule', entityId, metadata } });
  }
}



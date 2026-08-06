import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WeeklyOffRule, WeeklyOffRuleType } from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { requireTenantId } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../attendance/attendance-time.util';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateWeeklyOffRuleDto, UpdateWeeklyOffRuleDto, WeeklyOffRuleQueryDto } from './dto/scheduling.dto';

const EXPORT_LIMIT = 10000;

const weeklyOffRuleInclude = {
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true, branchId: true } },
  employee: {
    select: {
      id: true,
      employeeCode: true,
      branchId: true,
      departmentId: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      branch: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.WeeklyOffRuleInclude;

type WeeklyOffRuleWithRelations = Prisma.WeeklyOffRuleGetPayload<{ include: typeof weeklyOffRuleInclude }>;
type WeeklyOffScope = 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'EMPLOYEE';

@Injectable()
export class WeeklyOffRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWeeklyOffRuleDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const data = (await this.toData(companyId, dto)) as Prisma.WeeklyOffRuleUncheckedCreateInput;
    await this.assertNoConflictingRule(companyId, data);
    const rule = await this.prisma.weeklyOffRule.create({
      data: { ...data, companyId, createdById: actor.id, updatedById: actor.id },
      include: weeklyOffRuleInclude,
    });
    await this.audit(companyId, actor.id, 'WEEKLY_OFF_RULE_CREATED', rule.id, this.auditMetadata(rule));
    return rule;
  }

  async findAll(query: WeeklyOffRuleQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.ruleWhere(companyId, query);
    const [data, total, summaryRows] = await this.prisma.$transaction([
      this.prisma.weeklyOffRule.findMany({ where, include: weeklyOffRuleInclude, ...paginationArgs(query), orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] }),
      this.prisma.weeklyOffRule.count({ where }),
      this.prisma.weeklyOffRule.findMany({ where, select: { enabled: true, branchId: true, departmentId: true, employeeId: true } }),
    ]);
    return { ...paginatedResult(data, total, query), summary: this.summary(summaryRows) };
  }

  async exportRules(query: WeeklyOffRuleQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.ruleWhere(companyId, query);
    const total = await this.prisma.weeklyOffRule.count({ where });
    this.assertExportLimit(total);
    const rows = await this.prisma.weeklyOffRule.findMany({
      where,
      include: weeklyOffRuleInclude,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: EXPORT_LIMIT,
    });
    return this.csvDownload(`weekly-off-rules-${this.todayForFilename()}.csv`, [
      ['Rule Name', 'Scope', 'Branch', 'Department', 'Employee', 'Weekly Pattern', 'Rule Mode', 'Priority', 'Enabled', 'Effective From', 'Effective To', 'Updated At'],
      ...rows.map((rule) => this.exportRow(rule)),
    ]);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    return this.requireRule(id, requireTenantId(actor));
  }

  async update(id: string, dto: UpdateWeeklyOffRuleDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.requireRule(id, companyId);
    const data = (await this.toData(companyId, dto, true)) as Prisma.WeeklyOffRuleUncheckedUpdateInput;
    const prospective = { ...current, ...data } as Prisma.WeeklyOffRuleUncheckedCreateInput;
    await this.assertNoConflictingRule(companyId, prospective, id);
    const rule = await this.prisma.weeklyOffRule.update({ where: { id }, data: { ...data, updatedById: actor.id }, include: weeklyOffRuleInclude });
    const action = current.enabled !== rule.enabled ? (rule.enabled ? 'WEEKLY_OFF_RULE_ENABLED' : 'WEEKLY_OFF_RULE_DISABLED') : 'WEEKLY_OFF_RULE_UPDATED';
    await this.audit(companyId, actor.id, action, id, { before: this.auditMetadata(current), after: this.auditMetadata(rule) });
    return rule;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.requireRule(id, companyId);
    const rule = await this.prisma.weeklyOffRule.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.id }, include: weeklyOffRuleInclude });
    await this.audit(companyId, actor.id, 'WEEKLY_OFF_RULE_ARCHIVED', id, { before: this.auditMetadata(current) });
    return rule;
  }

  private async requireRule(id: string, companyId: string) {
    const rule = await this.prisma.weeklyOffRule.findFirst({ where: { id, companyId, deletedAt: null }, include: weeklyOffRuleInclude });
    if (!rule) throw new NotFoundException('Weekly off rule not found');
    return rule;
  }

  private async toData(companyId: string, dto: Partial<CreateWeeklyOffRuleDto>, partial = false): Promise<Record<string, unknown>> {
    if (dto.name !== undefined && !dto.name.trim()) throw new BadRequestException('Rule name is required');
    if (!partial || dto.weekdays !== undefined) {
      const weekdays = dto.weekdays ?? [];
      if (!weekdays.length || weekdays.some((day) => !Number.isInteger(Number(day)) || Number(day) < 0 || Number(day) > 6)) {
        throw new BadRequestException('Select at least one weekly-off day or pattern.');
      }
    }
    if (dto.effectiveFrom && dto.effectiveTo && dateOnly(dto.effectiveFrom) > dateOnly(dto.effectiveTo)) {
      throw new BadRequestException('End date must be on or after the start date.');
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

  private ruleWhere(companyId: string, query: WeeklyOffRuleQueryDto): Prisma.WeeklyOffRuleWhereInput {
    return {
      companyId,
      deletedAt: null,
      ...(query.enabled !== undefined ? { enabled: this.booleanValue(query.enabled) } : {}),
      ...(query.ruleType ? { ruleType: query.ruleType } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.scope ? this.scopeWhere(query.scope) : {}),
      ...(query.day !== undefined ? { weekdays: { array_contains: [Number(query.day)] } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            AND: [
              query.dateFrom ? { OR: [{ effectiveTo: null }, { effectiveTo: { gte: dateOnly(query.dateFrom) } }] } : {},
              query.dateTo ? { effectiveFrom: { lte: dateOnly(query.dateTo) } } : {},
            ],
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { branch: { name: { contains: query.search, mode: 'insensitive' } } },
              { department: { name: { contains: query.search, mode: 'insensitive' } } },
              { employee: { employeeCode: { contains: query.search, mode: 'insensitive' } } },
              { employee: { user: { firstName: { contains: query.search, mode: 'insensitive' } } } },
              { employee: { user: { lastName: { contains: query.search, mode: 'insensitive' } } } },
              { employee: { user: { email: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
  }

  private scopeWhere(scope: WeeklyOffScope): Prisma.WeeklyOffRuleWhereInput {
    if (scope === 'EMPLOYEE') return { employeeId: { not: null } };
    if (scope === 'DEPARTMENT') return { employeeId: null, departmentId: { not: null } };
    if (scope === 'BRANCH') return { employeeId: null, departmentId: null, branchId: { not: null } };
    return { employeeId: null, departmentId: null, branchId: null };
  }

  private async assertScope(companyId: string, branchId?: string | null, departmentId?: string | null, employeeId?: string | null) {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null }, select: { id: true } });
      if (!branch) throw new BadRequestException('Branch not found in this company');
    }
    if (departmentId) {
      const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId, deletedAt: null }, select: { id: true, branchId: true } });
      if (!department) throw new BadRequestException('Department not found in this company');
      if (branchId && department.branchId && department.branchId !== branchId) throw new BadRequestException('The selected department does not belong to this branch.');
    }
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId, deletedAt: null }, select: { id: true, branchId: true, departmentId: true } });
      if (!employee) throw new BadRequestException('Employee not found in this company');
      if (branchId && employee.branchId !== branchId) throw new BadRequestException('Employee does not belong to the selected branch');
      if (departmentId && employee.departmentId !== departmentId) throw new BadRequestException('Employee does not belong to the selected department');
    }
  }

  private async assertNoConflictingRule(companyId: string, data: Prisma.WeeklyOffRuleUncheckedCreateInput, currentId?: string) {
    if (data.enabled === false) return;
    const weekdays = this.weekdays(data.weekdays as Prisma.JsonValue);
    if (!weekdays.length) return;
    const effectiveFrom = data.effectiveFrom instanceof Date ? data.effectiveFrom : dateOnly(String(data.effectiveFrom));
    const effectiveTo = data.effectiveTo instanceof Date || data.effectiveTo === null ? data.effectiveTo : data.effectiveTo ? dateOnly(String(data.effectiveTo)) : null;
    const candidates = await this.prisma.weeklyOffRule.findMany({
      where: {
        companyId,
        deletedAt: null,
        enabled: true,
        ...(currentId ? { id: { not: currentId } } : {}),
        branchId: data.branchId ?? null,
        departmentId: data.departmentId ?? null,
        employeeId: data.employeeId ?? null,
        ruleType: (data.ruleType as WeeklyOffRuleType | undefined) ?? WeeklyOffRuleType.FIXED_WEEKDAYS,
        effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31T00:00:00.000Z') },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
      select: { id: true, weekdays: true },
    });
    if (candidates.some((rule) => this.weekdays(rule.weekdays).some((day) => weekdays.includes(day)))) {
      throw new BadRequestException('A weekly-off rule already covers this scope and effective period.');
    }
  }

  private summary(rows: Array<Pick<WeeklyOffRule, 'enabled' | 'branchId' | 'departmentId' | 'employeeId'>>) {
    const summary = { total: rows.length, active: 0, inactive: 0, companyScope: 0, branchScope: 0, departmentScope: 0, employeeScope: 0 };
    for (const row of rows) {
      if (row.enabled) summary.active += 1;
      else summary.inactive += 1;
      const scope = this.scopeOf(row);
      if (scope === 'EMPLOYEE') summary.employeeScope += 1;
      if (scope === 'DEPARTMENT') summary.departmentScope += 1;
      if (scope === 'BRANCH') summary.branchScope += 1;
      if (scope === 'COMPANY') summary.companyScope += 1;
    }
    return summary;
  }

  private weekdays(value: Prisma.JsonValue | Prisma.InputJsonValue): number[] {
    if (Array.isArray(value)) return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
    if (value && typeof value === 'object' && 'weekdays' in value) {
      const nested = (value as { weekdays?: unknown }).weekdays;
      return Array.isArray(nested) ? nested.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6) : [];
    }
    return [];
  }

  private booleanValue(value: unknown): boolean {
    return value === true || value === 'true';
  }

  private exportRow(rule: WeeklyOffRuleWithRelations) {
    return [
      rule.name,
      this.scopeLabel(rule),
      rule.branch?.name ?? '',
      rule.department?.name ?? '',
      this.employeeLabel(rule.employee),
      this.weekdayLabel(rule.weekdays),
      this.ruleModeLabel(rule.ruleType),
      rule.priority,
      rule.enabled ? 'Active' : 'Inactive',
      this.formatDate(rule.effectiveFrom),
      this.formatDate(rule.effectiveTo),
      this.formatDateTime(rule.updatedAt),
    ];
  }

  private csvDownload(filename: string, rows: Array<Array<string | number | null | undefined>>) {
    const csv = rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\r\n');
    return { filename, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from(`\uFEFF${csv}\r\n`, 'utf8') };
  }

  private csvCell(value: string | number | null | undefined) {
    const raw = String(value ?? '');
    const protectedValue = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
    return `"${protectedValue.replace(/"/g, '""')}"`;
  }

  private assertExportLimit(total: number) {
    if (total > EXPORT_LIMIT) throw new BadRequestException(`Export is limited to ${EXPORT_LIMIT.toLocaleString()} weekly off rules. Narrow filters and try again.`);
  }

  private scopeOf(rule: Pick<WeeklyOffRule, 'branchId' | 'departmentId' | 'employeeId'>): WeeklyOffScope {
    if (rule.employeeId) return 'EMPLOYEE';
    if (rule.departmentId) return 'DEPARTMENT';
    if (rule.branchId) return 'BRANCH';
    return 'COMPANY';
  }

  private scopeLabel(rule: Pick<WeeklyOffRuleWithRelations, 'branchId' | 'departmentId' | 'employeeId' | 'branch' | 'department' | 'employee'>) {
    if (rule.employeeId) return `Employee - ${this.employeeLabel(rule.employee)}`;
    if (rule.departmentId) return `Department - ${rule.department?.name ?? 'Selected department'}`;
    if (rule.branchId) return `Branch - ${rule.branch?.name ?? 'Selected branch'}`;
    return 'Company-wide';
  }

  private employeeLabel(employee?: WeeklyOffRuleWithRelations['employee'] | null) {
    if (!employee) return '';
    const name = [employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ').trim();
    return name ? `${name} (${employee.employeeCode})` : employee.employeeCode;
  }

  private weekdayLabel(value: Prisma.JsonValue) {
    const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const days = this.weekdays(value).sort((left, right) => left - right);
    if (!days.length) return 'Not configured';
    return days.map((day) => labels[day]).join(', ');
  }

  private ruleModeLabel(ruleType: WeeklyOffRuleType) {
    return ruleType === WeeklyOffRuleType.FIXED_WEEKDAYS ? 'Full Day Off' : ruleType;
  }

  private formatDate(value?: Date | string | null) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  private formatDateTime(value?: Date | string | null) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString();
  }

  private todayForFilename() {
    return new Date().toISOString().slice(0, 10);
  }

  private auditMetadata(rule: Pick<WeeklyOffRule, 'branchId' | 'departmentId' | 'employeeId' | 'weekdays' | 'effectiveFrom' | 'effectiveTo' | 'priority' | 'enabled'>): Prisma.InputJsonValue {
    return {
      scope: this.scopeOf(rule),
      branchId: rule.branchId,
      departmentId: rule.departmentId,
      employeeId: rule.employeeId,
      weekdays: this.weekdays(rule.weekdays),
      effectiveFrom: this.formatDate(rule.effectiveFrom),
      effectiveTo: this.formatDate(rule.effectiveTo),
      priority: rule.priority,
      enabled: rule.enabled,
    };
  }

  private async audit(companyId: string, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { companyId, actorUserId, action, entityType: 'WeeklyOffRule', entityId, metadata } });
  }
}
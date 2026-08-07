import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RosterDayType } from '@prisma/client';
import { requireTenantId } from '../../common/utils/tenant.util';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../attendance/attendance-time.util';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateRosterTemplateDto,
  PreviewRosterTemplateDto,
  RosterTemplateDayInputDto,
  RosterTemplateQueryDto,
  UpdateRosterTemplateDto,
} from './dto/scheduling.dto';

const EXPORT_LIMIT = 10000;
const TEMPLATE_DAY_TYPES = new Set<RosterDayType>([RosterDayType.WORKING, RosterDayType.WEEKLY_OFF, RosterDayType.NO_SHIFT]);

const templateInclude = {
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true, branchId: true } },
  days: {
    where: { deletedAt: null },
    include: { shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true, timezone: true } } },
    orderBy: [{ sequence: 'asc' as const }],
  },
};

type TemplateWithRelations = Prisma.RosterTemplateGetPayload<{ include: typeof templateInclude }>;
type ScopeRow = Pick<TemplateWithRelations, 'branchId' | 'departmentId' | 'enabled'>;

@Injectable()
export class RosterTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRosterTemplateDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const data = await this.templateData(companyId, dto, actor.id);
    await this.assertUniqueCode(companyId, data.code as string);
    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rosterTemplate.create({ data: { ...data, days: undefined } as Prisma.RosterTemplateUncheckedCreateInput });
      await tx.rosterTemplateDay.createMany({ data: await this.templateDayData(tx, companyId, created.id, dto.days, actor.id) });
      return tx.rosterTemplate.findFirstOrThrow({ where: { id: created.id }, include: templateInclude });
    });
    await this.audit(companyId, actor.id, 'ROSTER_TEMPLATE_CREATED', template.id, this.auditMetadata(template));
    return template;
  }

  async findAll(query: RosterTemplateQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.templateWhere(companyId, query);
    const [data, total, summaryRows] = await this.prisma.$transaction([
      this.prisma.rosterTemplate.findMany({ where, include: templateInclude, ...paginationArgs(query), orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.rosterTemplate.count({ where }),
      this.prisma.rosterTemplate.findMany({ where, select: { enabled: true, branchId: true, departmentId: true } }),
    ]);
    return { ...paginatedResult(data, total, query), summary: this.summary(summaryRows) };
  }

  async exportTemplates(query: RosterTemplateQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.templateWhere(companyId, query);
    const total = await this.prisma.rosterTemplate.count({ where });
    this.assertExportLimit(total, 'roster templates');
    const rows = await this.prisma.rosterTemplate.findMany({ where, include: templateInclude, orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }], take: EXPORT_LIMIT });
    return this.csvDownload(`roster-templates-${this.todayForFilename()}.csv`, [
      ['Template Name', 'Template Code', 'Scope', 'Branch', 'Department', 'Timezone', 'Status', 'Version', 'Working Days', 'Weekly Off Days', 'No Shift Days', 'Updated At', 'Notes'],
      ...rows.map((template) => this.exportRow(template)),
    ]);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    return this.requireTemplate(id, requireTenantId(actor));
  }

  async update(id: string, dto: UpdateRosterTemplateDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.requireTemplate(id, companyId);
    const mergedDays = dto.days ?? current.days.map((day) => ({ sequence: day.sequence, dayOfWeek: day.dayOfWeek, dayType: day.dayType as 'WORKING' | 'WEEKLY_OFF' | 'NO_SHIFT', shiftId: day.shiftId, notes: day.notes }));
    const data = await this.templateData(companyId, { ...current, ...dto, days: mergedDays } as CreateRosterTemplateDto, actor.id, true);
    if (data.code && data.code !== current.code) await this.assertUniqueCode(companyId, data.code as string, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rosterTemplate.update({ where: { id }, data: { ...data, version: { increment: 1 }, days: undefined } as Prisma.RosterTemplateUncheckedUpdateInput });
      if (dto.days) {
        await tx.rosterTemplateDay.updateMany({ where: { templateId: id, deletedAt: null }, data: { deletedAt: new Date(), updatedById: actor.id } });
        await tx.rosterTemplateDay.createMany({ data: await this.templateDayData(tx, companyId, id, dto.days, actor.id) });
      }
      return tx.rosterTemplate.findFirstOrThrow({ where: { id }, include: templateInclude });
    });
    await this.audit(companyId, actor.id, updated.enabled === current.enabled ? 'ROSTER_TEMPLATE_UPDATED' : updated.enabled ? 'ROSTER_TEMPLATE_ENABLED' : 'ROSTER_TEMPLATE_DISABLED', id, { before: this.auditMetadata(current), after: this.auditMetadata(updated) });
    return updated;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.requireTemplate(id, companyId);
    const archived = await this.prisma.rosterTemplate.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.id }, include: templateInclude });
    await this.audit(companyId, actor.id, 'ROSTER_TEMPLATE_ARCHIVED', id, { before: this.auditMetadata(current) });
    return archived;
  }

  async preview(id: string, dto: PreviewRosterTemplateDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const template = await this.requireTemplate(id, companyId);
    const dateFrom = dateOnly(dto.dateFrom);
    const dateTo = dateOnly(dto.dateTo);
    if (dateFrom > dateTo) throw new BadRequestException('dateFrom must not be after dateTo');
    const errors: Array<{ path: string; message: string }> = [];
    const warnings: Array<{ path: string; message: string }> = [];
    const info: Array<{ path: string; message: string }> = [];
    if (!template.enabled) warnings.push({ path: 'enabled', message: 'Template is inactive. It can be previewed but should be enabled before operational use.' });
    const dayMap = new Map(template.days.map((day) => [day.dayOfWeek, day]));
    const counts = { working: 0, weeklyOff: 0, noShift: 0 };
    for (let cursor = new Date(dateFrom); cursor <= dateTo; cursor = this.addUtcDays(cursor, 1)) {
      const day = dayMap.get(cursor.getUTCDay());
      if (!day) {
        errors.push({ path: cursor.toISOString().slice(0, 10), message: 'Template has no rule for this weekday.' });
        continue;
      }
      if (day.dayType === RosterDayType.WORKING) counts.working += 1;
      if (day.dayType === RosterDayType.WEEKLY_OFF) counts.weeklyOff += 1;
      if (day.dayType === RosterDayType.NO_SHIFT) counts.noShift += 1;
    }
    info.push({ path: 'range', message: `${counts.working} working, ${counts.weeklyOff} weekly off, ${counts.noShift} no-shift day(s) in the selected range.` });
    return { valid: errors.length === 0, errors, warnings, info };
  }

  private async templateData(companyId: string, dto: CreateRosterTemplateDto, actorUserId: string, partial = false) {
    this.assertDays(dto.days, partial);
    await this.assertScope(companyId, dto.branchId, dto.departmentId);
    return {
      companyId,
      name: dto.name?.trim(),
      code: dto.code?.trim().toUpperCase(),
      description: dto.description?.trim() || null,
      timezone: dto.timezone?.trim() || 'UTC',
      enabled: dto.enabled ?? true,
      branchId: dto.branchId || null,
      departmentId: dto.departmentId || null,
      notes: dto.notes?.trim() || null,
      createdById: actorUserId,
      updatedById: actorUserId,
    } satisfies Prisma.RosterTemplateUncheckedCreateInput;
  }

  private assertDays(days: RosterTemplateDayInputDto[], partial = false) {
    if (!days?.length) throw new BadRequestException('Seven template days are required');
    if (!partial && days.length !== 7) throw new BadRequestException('Roster templates require exactly seven weekdays');
    const weekdaySet = new Set<number>();
    const sequenceSet = new Set<number>();
    for (const day of days) {
      if (weekdaySet.has(day.dayOfWeek)) throw new BadRequestException('Each weekday can appear only once');
      if (sequenceSet.has(day.sequence)) throw new BadRequestException('Each template sequence can appear only once');
      weekdaySet.add(day.dayOfWeek);
      sequenceSet.add(day.sequence);
      if (!TEMPLATE_DAY_TYPES.has(day.dayType as RosterDayType)) throw new BadRequestException('Template days support WORKING, WEEKLY_OFF, or NO_SHIFT only');
      if (day.dayType === 'WORKING' && !day.shiftId) throw new BadRequestException('Working template days require a shift');
      if (day.dayType !== 'WORKING' && day.shiftId) throw new BadRequestException('Non-working template days cannot contain a shift');
    }
  }

  private async templateDayData(tx: Pick<PrismaService, 'shift'>, companyId: string, templateId: string, days: RosterTemplateDayInputDto[], actorUserId: string) {
    const shiftIds = [...new Set(days.map((day) => day.shiftId).filter(Boolean) as string[])];
    const shifts = shiftIds.length ? await tx.shift.findMany({ where: { id: { in: shiftIds }, companyId, deletedAt: null }, select: { id: true, name: true, code: true, startTime: true, endTime: true, timezone: true } }) : [];
    if (shifts.length !== shiftIds.length) throw new BadRequestException('One or more shifts were not found in this company');
    const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
    return days.map((day) => {
      const shift = day.shiftId ? shiftMap.get(day.shiftId) : null;
      return {
        templateId,
        companyId,
        sequence: day.sequence,
        dayOfWeek: day.dayOfWeek,
        dayType: day.dayType as RosterDayType,
        shiftId: shift?.id ?? null,
        shiftName: shift?.name ?? null,
        shiftCode: shift?.code ?? null,
        shiftStartTime: shift?.startTime ?? null,
        shiftEndTime: shift?.endTime ?? null,
        shiftTimezone: shift?.timezone ?? null,
        notes: day.notes?.trim() || null,
        createdById: actorUserId,
        updatedById: actorUserId,
      };
    });
  }

  private templateWhere(companyId: string, query: RosterTemplateQueryDto): Prisma.RosterTemplateWhereInput {
    return {
      companyId,
      deletedAt: null,
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.timezone ? { timezone: query.timezone } : {}),
      ...(query.scope === 'COMPANY' ? { branchId: null, departmentId: null } : {}),
      ...(query.scope === 'BRANCH' ? { branchId: { not: null }, departmentId: null } : {}),
      ...(query.scope === 'DEPARTMENT' ? { departmentId: { not: null } } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { code: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }, { notes: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
  }

  private summary(rows: ScopeRow[]) {
    return rows.reduce((summary, template) => {
      summary.total += 1;
      if (template.enabled) summary.active += 1; else summary.inactive += 1;
      if (template.departmentId) summary.departmentScope += 1;
      else if (template.branchId) summary.branchScope += 1;
      else summary.companyScope += 1;
      return summary;
    }, { total: 0, active: 0, inactive: 0, companyScope: 0, branchScope: 0, departmentScope: 0 });
  }

  private async requireTemplate(id: string, companyId: string) {
    const template = await this.prisma.rosterTemplate.findFirst({ where: { id, companyId, deletedAt: null }, include: templateInclude });
    if (!template) throw new NotFoundException('Roster template not found');
    return template;
  }

  private async assertUniqueCode(companyId: string, code: string, excludeId?: string) {
    const existing = await this.prisma.rosterTemplate.findFirst({ where: { companyId, code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (existing) throw new BadRequestException('A roster template with this code already exists');
  }

  private async assertScope(companyId: string, branchId?: string | null, departmentId?: string | null) {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null }, select: { id: true } });
      if (!branch) throw new BadRequestException('Branch not found in this company');
    }
    if (departmentId) {
      const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId, deletedAt: null }, select: { id: true, branchId: true } });
      if (!department) throw new BadRequestException('Department not found in this company');
      if (branchId && department.branchId && department.branchId !== branchId) throw new BadRequestException('Department does not belong to the selected branch');
    }
  }

  private exportRow(template: TemplateWithRelations) {
    const working = template.days.filter((day) => day.dayType === RosterDayType.WORKING).length;
    const weeklyOff = template.days.filter((day) => day.dayType === RosterDayType.WEEKLY_OFF).length;
    const noShift = template.days.filter((day) => day.dayType === RosterDayType.NO_SHIFT).length;
    return [template.name, template.code, this.scopeLabel(template), template.branch?.name ?? '', template.department?.name ?? '', template.timezone, template.enabled ? 'Active' : 'Inactive', `v${template.version}`, working, weeklyOff, noShift, this.formatDateTime(template.updatedAt), template.notes ?? ''];
  }

  private scopeLabel(template: Pick<TemplateWithRelations, 'branch' | 'department'>) {
    if (template.department?.name && template.branch?.name) return `${template.branch.name} / ${template.department.name}`;
    if (template.department?.name) return template.department.name;
    if (template.branch?.name) return template.branch.name;
    return 'Company-wide';
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

  private assertExportLimit(total: number, label: string) {
    if (total > EXPORT_LIMIT) throw new BadRequestException(`Export is limited to ${EXPORT_LIMIT.toLocaleString()} ${label}. Narrow filters and try again.`);
  }

  private addUtcDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
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

  private auditMetadata(template: Pick<TemplateWithRelations, 'branchId' | 'departmentId' | 'enabled' | 'version' | 'timezone'>): Prisma.InputJsonValue {
    return { branchId: template.branchId, departmentId: template.departmentId, enabled: template.enabled, version: template.version, timezone: template.timezone };
  }

  private async audit(companyId: string, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { companyId, actorUserId, action, entityType: 'RosterTemplate', entityId, metadata } });
  }
}

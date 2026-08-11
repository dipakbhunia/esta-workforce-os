import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RosterDayType, ShiftRosterStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { requireTenantId } from '../../common/utils/tenant.util';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../attendance/attendance-time.util';
import {
  ApplyRosterTemplateDto,
  ApplyRotationPatternDto,
  BulkUpsertShiftRosterDaysDto,
  CreateShiftRosterPeriodDto,
  ShiftRosterDayQueryDto,
  ShiftRosterPeriodQueryDto,
  UpdateShiftRosterPeriodDto,
  UpsertShiftRosterDayDto,
} from './dto/scheduling.dto';

const EXPORT_LIMIT = 10000;

const rosterDayInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
    },
  },
  shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true, timezone: true } },
} satisfies Prisma.ShiftRosterDayInclude;

const rosterInclude = {
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
  days: {
    where: { deletedAt: null },
    include: rosterDayInclude,
    orderBy: [{ workDate: 'asc' as const }],
  },
};

const rosterExportInclude = {
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
} satisfies Prisma.ShiftRosterPeriodInclude;

type RosterDayWithRelations = Prisma.ShiftRosterDayGetPayload<{ include: typeof rosterDayInclude }>;
type RosterPeriodForExport = Prisma.ShiftRosterPeriodGetPayload<{ include: typeof rosterExportInclude }>;

@Injectable()
export class ShiftRostersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateShiftRosterPeriodDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const dateFrom = dateOnly(dto.dateFrom);
    const dateTo = dateOnly(dto.dateTo);
    if (dateFrom > dateTo) throw new BadRequestException('dateFrom must not be after dateTo');
    await this.assertScope(companyId, dto.branchId, dto.departmentId);
    const roster = await this.prisma.shiftRosterPeriod.create({
      data: {
        companyId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        dateFrom,
        dateTo,
        timezone: dto.timezone?.trim() || 'UTC',
        branchId: dto.branchId,
        departmentId: dto.departmentId,
        notes: dto.notes?.trim(),
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: rosterInclude,
    });
    await this.audit(companyId, actor.id, 'SHIFT_ROSTER_PERIOD_CREATED', roster.id, { code: roster.code });
    return roster;
  }

  async findAll(query: ShiftRosterPeriodQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const summaryWhere = this.rosterPeriodWhere(companyId, query, false);
    const where = this.rosterPeriodWhere(companyId, query, true);
    const [data, total, groupedSummary] = await this.prisma.$transaction([
      this.prisma.shiftRosterPeriod.findMany({ where, include: rosterInclude, ...paginationArgs(query), orderBy: [{ dateFrom: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.shiftRosterPeriod.count({ where }),
      this.prisma.shiftRosterPeriod.groupBy({ by: ['status'], where: summaryWhere, _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    return { ...paginatedResult(data, total, query), summary: this.statusSummary(groupedSummary) };
  }

  async exportRosters(query: ShiftRosterPeriodQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.rosterPeriodWhere(companyId, query, true);
    const total = await this.prisma.shiftRosterPeriod.count({ where });
    this.assertExportLimit(total, 'roster periods');
    const rows = await this.prisma.shiftRosterPeriod.findMany({
      where,
      include: rosterExportInclude,
      orderBy: [{ dateFrom: 'desc' }, { createdAt: 'desc' }],
      take: EXPORT_LIMIT,
    });
    return this.csvDownload(`shift-rosters-${this.todayForFilename()}.csv`, [
      [
        'Roster Name',
        'Roster Code',
        'Scope',
        'Branch',
        'Department',
        'Date From',
        'Date To',
        'Duration Days',
        'Timezone',
        'Version',
        'Status',
        'Coverage',
        'Published At',
        'Locked At',
        'Created At',
      ],
      ...rows.map((roster) => this.rosterExportRow(roster)),
    ]);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    return this.requireRoster(id, requireTenantId(actor));
  }

  async update(id: string, dto: UpdateShiftRosterPeriodDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(id, companyId, false);
    this.assertEditable(roster.status);
    if (dto.dateFrom && dto.dateTo && dateOnly(dto.dateFrom) > dateOnly(dto.dateTo)) {
      throw new BadRequestException('dateFrom must not be after dateTo');
    }
    await this.assertScope(companyId, dto.branchId ?? undefined, dto.departmentId ?? undefined);
    const updated = await this.prisma.shiftRosterPeriod.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.dateFrom !== undefined ? { dateFrom: dateOnly(dto.dateFrom) } : {}),
        ...(dto.dateTo !== undefined ? { dateTo: dateOnly(dto.dateTo) } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone.trim() || 'UTC' } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
        updatedById: actor.id,
      },
      include: rosterInclude,
    });
    await this.audit(companyId, actor.id, 'SHIFT_ROSTER_PERIOD_UPDATED', id, {});
    return updated;
  }

  async days(periodId: string, query: ShiftRosterDayQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireRoster(periodId, companyId, false);
    const where = this.rosterDayWhere(companyId, periodId, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.shiftRosterDay.findMany({ where, include: rosterDayInclude, ...paginationArgs(query), orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.shiftRosterDay.count({ where }),
    ]);
    return paginatedResult(data.map((day) => this.toRosterDayResponse(day)), total, query);
  }

  async exportRosterDays(periodId: string, query: ShiftRosterDayQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(periodId, companyId, false);
    const where = this.rosterDayWhere(companyId, periodId, query);
    const total = await this.prisma.shiftRosterDay.count({ where });
    this.assertExportLimit(total, 'roster days');
    const rows = await this.prisma.shiftRosterDay.findMany({
      where,
      include: rosterDayInclude,
      orderBy: [{ workDate: 'asc' }, { employee: { employeeCode: 'asc' } }, { createdAt: 'asc' }],
      take: EXPORT_LIMIT,
    });
    const safeCode = roster.code.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'roster';
    return this.csvDownload(`shift-roster-days-${safeCode}-${this.todayForFilename()}.csv`, [
      [
        'Employee Name',
        'Employee Code',
        'Department',
        'Designation',
        'Work Date',
        'Day Type',
        'Shift Name',
        'Shift Code',
        'Scheduled Start',
        'Scheduled End',
        'Timezone',
        'Source',
        'Notes',
      ],
      ...rows.map((day) => this.rosterDayExportRow(this.toRosterDayResponse(day))),
    ]);
  }

  async upsertDay(periodId: string, dto: UpsertShiftRosterDayDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(periodId, companyId, false);
    this.assertEditable(roster.status);
    await this.validateDay(companyId, roster, dto);
    const workDate = dateOnly(dto.workDate);
    const existing = await this.prisma.shiftRosterDay.findFirst({ where: { companyId, rosterPeriodId: periodId, employeeId: dto.employeeId, workDate } });
    const data = {
      companyId,
      rosterPeriodId: periodId,
      employeeId: dto.employeeId,
      workDate,
      dayType: dto.dayType,
      shiftId: dto.shiftId ?? null,
      source: dto.source ?? 'MANUAL',
      shiftName: null,
      shiftCode: null,
      shiftStartTime: null,
      shiftEndTime: null,
      shiftTimezone: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
      notes: dto.notes?.trim() ?? null,
      deletedAt: null,
      updatedById: actor.id,
    } satisfies Prisma.ShiftRosterDayUncheckedCreateInput | Prisma.ShiftRosterDayUncheckedUpdateInput;
    const day = existing
      ? await this.prisma.shiftRosterDay.update({ where: { id: existing.id }, data, include: rosterDayInclude })
      : await this.prisma.shiftRosterDay.create({ data: { ...data, createdById: actor.id } as Prisma.ShiftRosterDayUncheckedCreateInput, include: rosterDayInclude });
    await this.audit(companyId, actor.id, existing ? 'SHIFT_ROSTER_DAY_UPDATED' : 'SHIFT_ROSTER_DAY_CREATED', day.id, { periodId });
    return this.toRosterDayResponse(day);
  }

  async bulkUpsertDays(periodId: string, dto: BulkUpsertShiftRosterDaysDto, actor: AuthenticatedUser) {
    if (!dto.days.length) throw new BadRequestException('At least one roster day is required');
    if (dto.days.length > 500) throw new BadRequestException('Bulk update is limited to 500 days');
    const results = [];
    for (const day of dto.days) {
      results.push(await this.upsertDay(periodId, day, actor));
    }
    return { data: results, count: results.length };
  }

  async removeDay(periodId: string, dayId: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(periodId, companyId, false);
    this.assertEditable(roster.status);
    const day = await this.prisma.shiftRosterDay.findFirst({ where: { id: dayId, rosterPeriodId: periodId, companyId, deletedAt: null } });
    if (!day) throw new NotFoundException('Roster day not found');
    const removed = await this.prisma.shiftRosterDay.update({ where: { id: dayId }, data: { deletedAt: new Date(), updatedById: actor.id } });
    await this.audit(companyId, actor.id, 'SHIFT_ROSTER_DAY_DELETED', dayId, { periodId });
    return removed;
  }

  async preview(periodId: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(periodId, companyId, false);
    const errors: Array<{ path: string; message: string }> = [];
    const warnings: Array<{ path: string; message: string }> = [];
    const days = await this.prisma.shiftRosterDay.findMany({ where: { rosterPeriodId: periodId, companyId, deletedAt: null } });
    if (!days.length) warnings.push({ path: 'days', message: 'Roster has no days configured yet.' });
    for (const day of days) {
      if (day.dayType === RosterDayType.WORKING && !day.shiftId) {
        errors.push({ path: `days.${day.id}.shiftId`, message: 'Working roster days require a shift.' });
      }
    }
    const conflicts = await this.prisma.shiftRosterDay.findMany({
      where: {
        companyId,
        deletedAt: null,
        rosterPeriodId: { not: periodId },
        employeeId: { in: days.map((day) => day.employeeId) },
        workDate: { in: days.map((day) => day.workDate) },
        rosterPeriod: { status: { in: [ShiftRosterStatus.PUBLISHED, ShiftRosterStatus.LOCKED] }, deletedAt: null },
      },
      select: { id: true, employeeId: true, workDate: true },
    });
    if (conflicts.length) {
      errors.push({ path: 'days', message: 'Published roster conflicts exist for one or more employee dates.' });
    }
    await this.audit(companyId, actor.id, 'SHIFT_ROSTER_PREVIEWED', roster.id, { errors: errors.length, warnings: warnings.length });
    return { valid: errors.length === 0, errors, warnings, info: [] };
  }

  async publish(periodId: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(periodId, companyId, false);
    this.assertEditable(roster.status);
    const preview = await this.preview(periodId, actor);
    if (!preview.valid) throw new BadRequestException({ message: 'Roster has validation errors', errors: preview.errors });
    const published = await this.prisma.shiftRosterPeriod.update({
      where: { id: periodId },
      data: { status: ShiftRosterStatus.PUBLISHED, publishedAt: new Date(), publishedById: actor.id, version: { increment: 1 }, updatedById: actor.id },
      include: rosterInclude,
    });
    await this.audit(companyId, actor.id, 'SHIFT_ROSTER_PUBLISHED', periodId, { version: published.version });
    return published;
  }

  async lock(periodId: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(periodId, companyId, false);
    if (roster.status !== ShiftRosterStatus.PUBLISHED && roster.status !== ShiftRosterStatus.LOCKED) {
      throw new BadRequestException('Only published rosters can be locked');
    }
    const locked = await this.prisma.shiftRosterPeriod.update({
      where: { id: periodId },
      data: { status: ShiftRosterStatus.LOCKED, lockedAt: new Date(), lockedById: actor.id, updatedById: actor.id },
      include: rosterInclude,
    });
    await this.audit(companyId, actor.id, 'SHIFT_ROSTER_LOCKED', periodId, {});
    return locked;
  }


  async applyTemplate(periodId: string, dto: ApplyRosterTemplateDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(periodId, companyId, false);
    this.assertEditable(roster.status);
    if (roster.status !== ShiftRosterStatus.DRAFT) throw new BadRequestException('Templates can only be applied to draft rosters');
    if (!dto.employeeIds.length) throw new BadRequestException('At least one employee is required');
    if (dto.employeeIds.length > 250) throw new BadRequestException('Template application is limited to 250 employees at once');
    const dateFrom = dateOnly(dto.dateFrom);
    const dateTo = dateOnly(dto.dateTo);
    if (dateFrom > dateTo) throw new BadRequestException('dateFrom must not be after dateTo');
    if (dateFrom < roster.dateFrom || dateTo > roster.dateTo) throw new BadRequestException('Template date range must stay within the roster period');
    const mode = dto.overwriteMode ?? 'EMPTY_ONLY';
    const template = await this.prisma.rosterTemplate.findFirst({
      where: { id: dto.templateId, companyId, deletedAt: null },
      include: { days: { where: { deletedAt: null }, orderBy: [{ sequence: 'asc' }] } },
    });
    if (!template) throw new BadRequestException('Roster template not found in this company');
    if (!template.enabled) throw new BadRequestException('Inactive templates cannot be applied');
    this.assertTemplateScopeCompatible(roster, template);
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: [...new Set(dto.employeeIds)] }, companyId, deletedAt: null },
      select: { id: true, branchId: true, departmentId: true },
    });
    if (employees.length !== new Set(dto.employeeIds).size) throw new BadRequestException('One or more employees were not found in this company');
    for (const employee of employees) {
      if (roster.branchId && employee.branchId !== roster.branchId) throw new BadRequestException('One or more employees do not belong to the roster branch');
      if (roster.departmentId && employee.departmentId !== roster.departmentId) throw new BadRequestException('One or more employees do not belong to the roster department');
    }
    const templateDays = new Map(template.days.map((day) => [day.dayOfWeek, day]));
    let appliedCount = 0;
    let skippedCount = 0;
    const dates = this.eachDate(dateFrom, dateTo);
    await this.prisma.$transaction(async (tx) => {
      for (const employee of employees) {
        for (const workDate of dates) {
          const templateDay = templateDays.get(workDate.getUTCDay());
          if (!templateDay) {
            skippedCount += 1;
            continue;
          }
          const existing = await tx.shiftRosterDay.findUnique({ where: { companyId_employeeId_workDate_rosterPeriodId: { companyId, employeeId: employee.id, workDate, rosterPeriodId: periodId } } });
          if (existing && mode === 'EMPTY_ONLY' && !existing.deletedAt) {
            skippedCount += 1;
            continue;
          }
          const data = {
            companyId,
            rosterPeriodId: periodId,
            employeeId: employee.id,
            workDate,
            dayType: templateDay.dayType,
            shiftId: templateDay.shiftId,
            source: 'TEMPLATE' as const,
            shiftName: templateDay.shiftName,
            shiftCode: templateDay.shiftCode,
            shiftStartTime: templateDay.shiftStartTime,
            shiftEndTime: templateDay.shiftEndTime,
            shiftTimezone: templateDay.shiftTimezone,
            notes: templateDay.notes ?? `Applied from template ${template.code}`,
            deletedAt: null,
            updatedById: actor.id,
          };
          if (existing) {
            await tx.shiftRosterDay.update({ where: { id: existing.id }, data });
          } else {
            await tx.shiftRosterDay.create({ data: { ...data, createdById: actor.id } });
          }
          appliedCount += 1;
        }
      }
      await tx.auditLog.create({ data: { companyId, actorUserId: actor.id, action: 'ROSTER_TEMPLATE_APPLIED', entityType: 'ShiftRoster', entityId: periodId, metadata: { templateId: template.id, templateCode: template.code, employeeCount: employees.length, dateCount: dates.length, overwriteMode: mode, appliedCount, skippedCount } } });
    });
    return { appliedCount, skippedCount, employeeCount: employees.length, dateCount: dates.length };
  }

  async applyRotation(periodId: string, dto: ApplyRotationPatternDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const roster = await this.requireRoster(periodId, companyId, false);
    this.assertEditable(roster.status);
    if (roster.status !== ShiftRosterStatus.DRAFT) throw new BadRequestException('Rotation patterns can only be applied to draft rosters');
    const employeeIds = [...new Set(dto.employeeIds)];
    if (!employeeIds.length) throw new BadRequestException('At least one employee is required');
    if (employeeIds.length > 250) throw new BadRequestException('Rotation application is limited to 250 employees at once');
    const dateFrom = dateOnly(dto.dateFrom);
    const dateTo = dateOnly(dto.dateTo);
    if (dateFrom > dateTo) throw new BadRequestException('dateFrom must not be after dateTo');
    if (dateFrom < roster.dateFrom || dateTo > roster.dateTo) throw new BadRequestException('Rotation date range must stay within the roster period');
    const mode = dto.overwriteMode ?? 'EMPTY_ONLY';
    const pattern = await this.prisma.rotationPattern.findFirst({
      where: { id: dto.patternId, companyId, deletedAt: null },
      include: { days: { where: { deletedAt: null }, orderBy: [{ sequence: 'asc' }] } },
    });
    if (!pattern) throw new BadRequestException('Rotation pattern not found in this company');
    if (!pattern.enabled) throw new BadRequestException('Inactive rotation patterns cannot be applied');
    this.assertTemplateScopeCompatible(roster, pattern);
    if (pattern.days.length !== pattern.cycleLengthDays) throw new BadRequestException('Rotation pattern is incomplete');
    const alignmentMode = dto.alignmentMode ?? 'PATTERN_ANCHOR';
    const anchorDate = alignmentMode === 'START_FROM_SEQUENCE_ONE'
      ? dateOnly(dto.anchorDate ?? dto.dateFrom)
      : pattern.anchorDate;
    if (!anchorDate) throw new BadRequestException('Pattern anchor date is required for pattern-anchor alignment');
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, companyId, deletedAt: null },
      select: { id: true, branchId: true, departmentId: true },
    });
    if (employees.length !== employeeIds.length) throw new BadRequestException('One or more employees were not found in this company');
    for (const employee of employees) {
      if (roster.branchId && employee.branchId !== roster.branchId) throw new BadRequestException('One or more employees do not belong to the roster branch');
      if (roster.departmentId && employee.departmentId !== roster.departmentId) throw new BadRequestException('One or more employees do not belong to the roster department');
    }
    const patternDays = new Map(pattern.days.map((day) => [day.sequence, day]));
    let appliedCount = 0;
    let skippedCount = 0;
    const dates = this.eachDate(dateFrom, dateTo);
    await this.prisma.$transaction(async (tx) => {
      for (const employee of employees) {
        for (const workDate of dates) {
          const sequence = this.rotationSequence(anchorDate, workDate, pattern.cycleLengthDays);
          const patternDay = patternDays.get(sequence);
          if (!patternDay) {
            skippedCount += 1;
            continue;
          }
          const existing = await tx.shiftRosterDay.findUnique({ where: { companyId_employeeId_workDate_rosterPeriodId: { companyId, employeeId: employee.id, workDate, rosterPeriodId: periodId } } });
          if (existing && mode === 'EMPTY_ONLY' && !existing.deletedAt) {
            skippedCount += 1;
            continue;
          }
          const data = {
            companyId,
            rosterPeriodId: periodId,
            employeeId: employee.id,
            workDate,
            dayType: patternDay.dayType,
            shiftId: patternDay.shiftId,
            source: 'TEMPLATE' as const,
            shiftName: patternDay.shiftName,
            shiftCode: patternDay.shiftCode,
            shiftStartTime: patternDay.shiftStartTime,
            shiftEndTime: patternDay.shiftEndTime,
            shiftTimezone: patternDay.shiftTimezone,
            notes: patternDay.notes ?? patternDay.label ?? `Applied from rotation ${pattern.code}`,
            deletedAt: null,
            updatedById: actor.id,
          };
          if (existing) await tx.shiftRosterDay.update({ where: { id: existing.id }, data });
          else await tx.shiftRosterDay.create({ data: { ...data, createdById: actor.id } });
          appliedCount += 1;
        }
      }
      await tx.auditLog.create({ data: { companyId, actorUserId: actor.id, action: 'ROTATION_PATTERN_APPLIED', entityType: 'ShiftRoster', entityId: periodId, metadata: { patternId: pattern.id, patternCode: pattern.code, employeeCount: employees.length, dateCount: dates.length, overwriteMode: mode, alignmentMode, anchorDate: this.formatDate(anchorDate), appliedCount, skippedCount } } });
    });
    return { appliedCount, skippedCount, employeeCount: employees.length, dateCount: dates.length };
  }
  private rosterPeriodWhere(companyId: string, query: ShiftRosterPeriodQueryDto, includeStatus: boolean): Prisma.ShiftRosterPeriodWhereInput {
    return {
      companyId,
      deletedAt: null,
      ...(includeStatus && query.status ? { status: query.status } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            AND: [
              query.dateFrom ? { dateTo: { gte: dateOnly(query.dateFrom) } } : {},
              query.dateTo ? { dateFrom: { lte: dateOnly(query.dateTo) } } : {},
            ],
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private rosterDayWhere(companyId: string, periodId: string, query: ShiftRosterDayQueryDto): Prisma.ShiftRosterDayWhereInput {
    return {
      companyId,
      rosterPeriodId: periodId,
      deletedAt: null,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.dayType ? { dayType: query.dayType } : {}),
      ...(query.dateFrom || query.dateTo
        ? { workDate: { ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}), ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { employee: { employeeCode: { contains: query.search, mode: 'insensitive' } } },
              { employee: { user: { firstName: { contains: query.search, mode: 'insensitive' } } } },
              { employee: { user: { lastName: { contains: query.search, mode: 'insensitive' } } } },
              { employee: { user: { email: { contains: query.search, mode: 'insensitive' } } } },
              { shift: { name: { contains: query.search, mode: 'insensitive' } } },
              { shift: { code: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  private statusSummary(rows: Array<{ status: ShiftRosterStatus; _count?: { _all?: number } | true }>) {
    const summary = { total: 0, draft: 0, published: 0, locked: 0, cancelled: 0 };
    for (const row of rows) {
      const count = typeof row._count === 'object' ? row._count._all ?? 0 : 0;
      summary.total += count;
      if (row.status === ShiftRosterStatus.DRAFT) summary.draft = count;
      if (row.status === ShiftRosterStatus.PUBLISHED) summary.published = count;
      if (row.status === ShiftRosterStatus.LOCKED) summary.locked = count;
      if (row.status === ShiftRosterStatus.CANCELLED) summary.cancelled = count;
    }
    return summary;
  }

  private toRosterDayResponse(day: RosterDayWithRelations) {
    const firstName = day.employee.user?.firstName ?? null;
    const lastName = day.employee.user?.lastName ?? null;
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || day.employee.employeeCode || 'Employee unavailable';
    return {
      ...day,
      employee: {
        id: day.employee.id,
        employeeCode: day.employee.employeeCode,
        displayName,
        firstName,
        lastName,
        user: day.employee.user,
        department: day.employee.department,
        designation: day.employee.designation,
      },
      shift: day.shift,
    };
  }

  private rosterExportRow(roster: RosterPeriodForExport) {
    const durationDays = this.durationDays(roster.dateFrom, roster.dateTo);
    return [
      roster.name,
      roster.code,
      this.scopeLabel(roster),
      roster.branch?.name ?? '',
      roster.department?.name ?? '',
      this.formatDate(roster.dateFrom),
      this.formatDate(roster.dateTo),
      durationDays ? String(durationDays) : '',
      roster.timezone,
      `v${roster.version}`,
      roster.status,
      'Not available',
      this.formatDateTime(roster.publishedAt),
      this.formatDateTime(roster.lockedAt),
      this.formatDateTime(roster.createdAt),
    ];
  }

  private rosterDayExportRow(day: ReturnType<ShiftRostersService['toRosterDayResponse']>) {
    const shift = day.shift;
    return [
      day.employee.displayName,
      day.employee.employeeCode,
      day.employee.department?.name ?? '',
      day.employee.designation?.name ?? '',
      this.formatDate(day.workDate),
      day.dayType,
      shift?.name ?? day.shiftName ?? '',
      shift?.code ?? day.shiftCode ?? '',
      this.formatDateTime(day.scheduledStartAt),
      this.formatDateTime(day.scheduledEndAt),
      shift?.timezone ?? day.shiftTimezone ?? '',
      day.source,
      day.notes ?? '',
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

  private assertExportLimit(total: number, label: string) {
    if (total > EXPORT_LIMIT) {
      throw new BadRequestException(`Export is limited to ${EXPORT_LIMIT.toLocaleString()} ${label}. Narrow filters and try again.`);
    }
  }

  private scopeLabel(roster: Pick<RosterPeriodForExport, 'branch' | 'department'>) {
    if (roster.branch?.name && roster.department?.name) return `${roster.branch.name} / ${roster.department.name}`;
    if (roster.department?.name) return roster.department.name;
    if (roster.branch?.name) return roster.branch.name;
    return 'Company-wide';
  }

  private durationDays(from: Date, to: Date) {
    const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.max(0, Math.round((end - start) / 86400000) + 1);
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


  private assertTemplateScopeCompatible(roster: { branchId?: string | null; departmentId?: string | null }, template: { branchId?: string | null; departmentId?: string | null }) {
    if (template.branchId && roster.branchId && template.branchId !== roster.branchId) throw new BadRequestException('Template branch does not match this roster');
    if (template.departmentId && roster.departmentId && template.departmentId !== roster.departmentId) throw new BadRequestException('Template department does not match this roster');
    if (template.departmentId && !roster.departmentId) throw new BadRequestException('Department-scoped templates require a department-scoped roster');
    if (template.branchId && !roster.branchId && !roster.departmentId) throw new BadRequestException('Branch-scoped templates require a branch or department roster');
  }

  private eachDate(from: Date, to: Date) {
    const dates: Date[] = [];
    for (let cursor = new Date(from); cursor <= to; cursor = this.addUtcDays(cursor, 1)) {
      dates.push(new Date(cursor));
      if (dates.length > 370) throw new BadRequestException('Template application is limited to 370 days');
    }
    return dates;
  }



  private toDateOnly(value: Date | string) {
    return value instanceof Date ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())) : dateOnly(value);
  }
  private rotationSequence(anchorDate: Date, targetDate: Date, cycleLengthDays: number) {
    const offset = Math.floor((this.toDateOnly(targetDate).getTime() - this.toDateOnly(anchorDate).getTime()) / 86400000);
    return ((offset % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;
  }
  private addUtcDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }
  private async requireRoster(id: string, companyId: string, include = true) {
    const roster = await this.prisma.shiftRosterPeriod.findFirst({ where: { id, companyId, deletedAt: null }, ...(include ? { include: rosterInclude } : {}) });
    if (!roster) throw new NotFoundException('Shift roster not found');
    return roster;
  }

  private assertEditable(status: ShiftRosterStatus) {
    if (status === ShiftRosterStatus.LOCKED) throw new BadRequestException('Locked rosters cannot be modified');
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

  private async validateDay(companyId: string, roster: { dateFrom: Date; dateTo: Date; branchId?: string | null; departmentId?: string | null }, dto: UpsertShiftRosterDayDto) {
    const workDate = dateOnly(dto.workDate);
    if (workDate < roster.dateFrom || workDate > roster.dateTo) throw new BadRequestException('Roster day is outside the roster period');
    if (dto.dayType === RosterDayType.WORKING && !dto.shiftId) throw new BadRequestException('Working roster days require a shift');
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId, deletedAt: null }, select: { id: true, branchId: true, departmentId: true } });
    if (!employee) throw new BadRequestException('Employee not found in this company');
    if (roster.branchId && employee.branchId !== roster.branchId) throw new BadRequestException('Employee does not belong to the roster branch');
    if (roster.departmentId && employee.departmentId !== roster.departmentId) throw new BadRequestException('Employee does not belong to the roster department');
    if (dto.shiftId) {
      const shift = await this.prisma.shift.findFirst({ where: { id: dto.shiftId, companyId, deletedAt: null }, select: { id: true } });
      if (!shift) throw new BadRequestException('Shift not found in this company');
    }
  }

  private async audit(companyId: string, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { companyId, actorUserId, action, entityType: 'ShiftRoster', entityId, metadata } });
  }
}

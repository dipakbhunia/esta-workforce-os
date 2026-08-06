import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RosterDayType, ShiftRosterStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { requireTenantId } from '../../common/utils/tenant.util';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../attendance/attendance-time.util';
import {
  BulkUpsertShiftRosterDaysDto,
  CreateShiftRosterPeriodDto,
  ShiftRosterDayQueryDto,
  ShiftRosterPeriodQueryDto,
  UpdateShiftRosterPeriodDto,
  UpsertShiftRosterDayDto,
} from './dto/scheduling.dto';

const rosterInclude = {
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
  days: {
    where: { deletedAt: null },
    include: {
      employee: { select: { id: true, employeeCode: true, user: { select: { firstName: true, lastName: true, email: true } } } },
      shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true, timezone: true } },
    },
    orderBy: [{ workDate: 'asc' as const }],
  },
};

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
    const where: Prisma.ShiftRosterPeriodWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
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
    const [data, total] = await this.prisma.$transaction([
      this.prisma.shiftRosterPeriod.findMany({ where, include: rosterInclude, ...paginationArgs(query), orderBy: [{ dateFrom: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.shiftRosterPeriod.count({ where }),
    ]);
    return paginatedResult(data, total, query);
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
    const where: Prisma.ShiftRosterDayWhereInput = {
      companyId,
      rosterPeriodId: periodId,
      deletedAt: null,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.dayType ? { dayType: query.dayType } : {}),
      ...(query.dateFrom || query.dateTo
        ? { workDate: { ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}), ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}) } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.shiftRosterDay.findMany({ where, include: { employee: true, shift: true }, ...paginationArgs(query), orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.shiftRosterDay.count({ where }),
    ]);
    return paginatedResult(data, total, query);
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
      notes: dto.notes?.trim() ?? null,
      updatedById: actor.id,
    } satisfies Prisma.ShiftRosterDayUncheckedCreateInput | Prisma.ShiftRosterDayUncheckedUpdateInput;
    const day = existing
      ? await this.prisma.shiftRosterDay.update({ where: { id: existing.id }, data, include: { employee: true, shift: true } })
      : await this.prisma.shiftRosterDay.create({ data: { ...data, createdById: actor.id } as Prisma.ShiftRosterDayUncheckedCreateInput, include: { employee: true, shift: true } });
    await this.audit(companyId, actor.id, existing ? 'SHIFT_ROSTER_DAY_UPDATED' : 'SHIFT_ROSTER_DAY_CREATED', day.id, { periodId });
    return day;
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
    return { valid: errors.length === 0, errors, warnings };
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


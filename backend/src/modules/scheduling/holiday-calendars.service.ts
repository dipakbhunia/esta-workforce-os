import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HolidayType, Prisma } from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { requireTenantId } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../attendance/attendance-time.util';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateHolidayCalendarDto,
  CreateHolidayDto,
  HolidayCalendarQueryDto,
  UpdateHolidayCalendarDto,
  UpdateHolidayDto,
} from './dto/scheduling.dto';

@Injectable()
export class HolidayCalendarsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCalendar(dto: CreateHolidayCalendarDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.assertBranch(companyId, dto.branchId);
    const calendar = await this.prisma.holidayCalendar.create({
      data: {
        companyId,
        name: dto.name.trim(),
        timezone: dto.timezone?.trim() || 'UTC',
        branchId: dto.branchId,
        enabled: dto.enabled ?? true,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: { branch: true, holidays: { where: { deletedAt: null }, orderBy: { date: 'asc' } } },
    });
    await this.audit(companyId, actor.id, 'HOLIDAY_CALENDAR_CREATED', calendar.id, {});
    return calendar;
  }

  async findCalendars(query: HolidayCalendarQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where: Prisma.HolidayCalendarWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.enabled !== undefined ? { enabled: this.booleanValue(query.enabled) } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.holidayCalendar.findMany({ where, include: { branch: true }, ...paginationArgs(query), orderBy: [{ createdAt: 'desc' }] }),
      this.prisma.holidayCalendar.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findCalendar(id: string, actor: AuthenticatedUser) {
    return this.requireCalendar(id, requireTenantId(actor));
  }

  async updateCalendar(id: string, dto: UpdateHolidayCalendarDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(id, companyId);
    await this.assertBranch(companyId, dto.branchId);
    const calendar = await this.prisma.holidayCalendar.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone.trim() || 'UTC' } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        ...(dto.enabled !== undefined ? { enabled: this.booleanValue(dto.enabled) } : {}),
        updatedById: actor.id,
      },
      include: { branch: true, holidays: { where: { deletedAt: null }, orderBy: { date: 'asc' } } },
    });
    await this.audit(companyId, actor.id, 'HOLIDAY_CALENDAR_UPDATED', id, {});
    return calendar;
  }

  async removeCalendar(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(id, companyId);
    const calendar = await this.prisma.holidayCalendar.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.id } });
    await this.audit(companyId, actor.id, 'HOLIDAY_CALENDAR_DELETED', id, {});
    return calendar;
  }

  async createHoliday(calendarId: string, dto: CreateHolidayDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(calendarId, companyId, false);
    const holiday = await this.prisma.holiday.create({
      data: {
        companyId,
        calendarId,
        date: dateOnly(dto.date),
        name: dto.name.trim(),
        type: dto.type ?? HolidayType.CUSTOM,
        optional: dto.optional ?? false,
        recurring: dto.recurring ?? false,
        notes: dto.notes?.trim(),
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await this.audit(companyId, actor.id, 'HOLIDAY_CREATED', holiday.id, { calendarId });
    return holiday;
  }

  async listHolidays(calendarId: string, query: HolidayCalendarQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(calendarId, companyId, false);
    const where: Prisma.HolidayWhereInput = {
      companyId,
      calendarId,
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.holiday.findMany({ where, ...paginationArgs(query), orderBy: [{ date: 'asc' }, { createdAt: 'desc' }] }),
      this.prisma.holiday.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async updateHoliday(calendarId: string, holidayId: string, dto: UpdateHolidayDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(calendarId, companyId, false);
    await this.requireHoliday(calendarId, holidayId, companyId);
    const holiday = await this.prisma.holiday.update({
      where: { id: holidayId },
      data: {
        ...(dto.date !== undefined ? { date: dateOnly(dto.date) } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.optional !== undefined ? { optional: this.booleanValue(dto.optional) } : {}),
        ...(dto.recurring !== undefined ? { recurring: this.booleanValue(dto.recurring) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
        updatedById: actor.id,
      },
    });
    await this.audit(companyId, actor.id, 'HOLIDAY_UPDATED', holidayId, { calendarId });
    return holiday;
  }

  async removeHoliday(calendarId: string, holidayId: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(calendarId, companyId, false);
    await this.requireHoliday(calendarId, holidayId, companyId);
    const holiday = await this.prisma.holiday.update({ where: { id: holidayId }, data: { deletedAt: new Date(), updatedById: actor.id } });
    await this.audit(companyId, actor.id, 'HOLIDAY_DELETED', holidayId, { calendarId });
    return holiday;
  }

  private async requireCalendar(id: string, companyId: string, include = true) {
    const calendar = await this.prisma.holidayCalendar.findFirst({
      where: { id, companyId, deletedAt: null },
      ...(include ? { include: { branch: true, holidays: { where: { deletedAt: null }, orderBy: { date: 'asc' as const } } } } : {}),
    });
    if (!calendar) throw new NotFoundException('Holiday calendar not found');
    return calendar;
  }

  private async requireHoliday(calendarId: string, holidayId: string, companyId: string) {
    const holiday = await this.prisma.holiday.findFirst({ where: { id: holidayId, calendarId, companyId, deletedAt: null } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    return holiday;
  }

  private async assertBranch(companyId: string, branchId?: string | null) {
    if (!branchId) return;
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null }, select: { id: true } });
    if (!branch) throw new BadRequestException('Branch not found in this company');
  }

  private booleanValue(value: unknown): boolean {
    return value === true || value === 'true';
  }

  private async audit(companyId: string, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { companyId, actorUserId, action, entityType: 'HolidayCalendar', entityId, metadata } });
  }
}

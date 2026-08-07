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
  HolidayQueryDto,
  UpdateHolidayCalendarDto,
  UpdateHolidayDto,
} from './dto/scheduling.dto';

const EXPORT_LIMIT = 10000;

const calendarInclude = {
  branch: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  holidays: { where: { deletedAt: null }, orderBy: { date: 'asc' as const } },
} satisfies Prisma.HolidayCalendarInclude;

type HolidayCalendarWithRelations = Prisma.HolidayCalendarGetPayload<{ include: typeof calendarInclude }>;
type HolidayWithCalendar = Prisma.HolidayGetPayload<{ include: { calendar: { include: { branch: true } } } }>;

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
        year: dto.year,
        description: dto.description?.trim() || null,
        notes: dto.notes?.trim() || null,
        timezone: dto.timezone?.trim() || 'UTC',
        branchId: dto.branchId || null,
        enabled: dto.enabled ?? true,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: calendarInclude,
    });
    await this.audit(companyId, actor.id, 'HOLIDAY_CALENDAR_CREATED', 'HolidayCalendar', calendar.id, this.calendarAuditMetadata(calendar));
    return this.withCalendarCounts(calendar);
  }

  async findCalendars(query: HolidayCalendarQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.calendarWhere(companyId, query);
    const [data, total, summaryRows] = await this.prisma.$transaction([
      this.prisma.holidayCalendar.findMany({ where, include: calendarInclude, ...paginationArgs(query), orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.holidayCalendar.count({ where }),
      this.prisma.holidayCalendar.findMany({ where, include: { holidays: { where: { deletedAt: null }, select: { optional: true } } } }),
    ]);
    return { ...paginatedResult(data.map((calendar) => this.withCalendarCounts(calendar)), total, query), summary: this.calendarSummary(summaryRows) };
  }

  async exportCalendars(query: HolidayCalendarQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.calendarWhere(companyId, query);
    const total = await this.prisma.holidayCalendar.count({ where });
    this.assertExportLimit(total);
    const rows = await this.prisma.holidayCalendar.findMany({ where, include: calendarInclude, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }], take: EXPORT_LIMIT });
    return this.csvDownload(`holiday-calendars-${this.todayForFilename()}.csv`, [
      ['Calendar Name', 'Scope', 'Branch', 'Year', 'Timezone', 'Holiday Count', 'Mandatory Count', 'Optional Count', 'Status', 'Updated At'],
      ...rows.map((calendar) => this.exportCalendarRow(this.withCalendarCounts(calendar))),
    ]);
  }

  async findCalendar(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const calendar = await this.prisma.holidayCalendar.findFirst({
      where: { id, companyId, deletedAt: null },
      include: calendarInclude,
    });
    if (!calendar) {
      throw new NotFoundException('Holiday calendar not found');
    }
    return this.withCalendarCounts(calendar);
  }

  async updateCalendar(id: string, dto: UpdateHolidayCalendarDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.requireCalendar(id, companyId);
    await this.assertBranch(companyId, dto.branchId);
    const calendar = await this.prisma.holidayCalendar.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone.trim() || 'UTC' } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId || null } : {}),
        ...(dto.enabled !== undefined ? { enabled: this.booleanValue(dto.enabled) } : {}),
        updatedById: actor.id,
      },
      include: calendarInclude,
    });
    const action = dto.enabled !== undefined && current.enabled !== this.booleanValue(dto.enabled)
      ? this.booleanValue(dto.enabled) ? 'HOLIDAY_CALENDAR_ENABLED' : 'HOLIDAY_CALENDAR_DISABLED'
      : 'HOLIDAY_CALENDAR_UPDATED';
    await this.audit(companyId, actor.id, action, 'HolidayCalendar', id, this.calendarAuditMetadata(calendar));
    return this.withCalendarCounts(calendar);
  }

  async removeCalendar(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(id, companyId);
    const calendar = await this.prisma.holidayCalendar.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.id }, include: calendarInclude });
    await this.audit(companyId, actor.id, 'HOLIDAY_CALENDAR_ARCHIVED', 'HolidayCalendar', id, this.calendarAuditMetadata(calendar));
    return this.withCalendarCounts(calendar);
  }

  async createHoliday(calendarId: string, dto: CreateHolidayDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const calendar = await this.requireCalendar(calendarId, companyId, false);
    const holidayDate = dateOnly(dto.date);
    this.assertHolidayYear(calendar.year, holidayDate);
    await this.assertNoDuplicateHoliday(calendarId, companyId, holidayDate);
    const holiday = await this.prisma.holiday.create({
      data: {
        companyId,
        calendarId,
        date: holidayDate,
        name: dto.name.trim(),
        type: dto.type ?? HolidayType.CUSTOM,
        optional: dto.optional ?? false,
        recurring: dto.recurring ?? false,
        notes: dto.notes?.trim() || null,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: { calendar: { include: { branch: true } } },
    });
    await this.audit(companyId, actor.id, 'HOLIDAY_CREATED', 'Holiday', holiday.id, this.holidayAuditMetadata(holiday));
    return this.serializeHoliday(holiday);
  }

  async listHolidays(calendarId: string, query: HolidayQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(calendarId, companyId, false);
    const where = this.holidayWhere(calendarId, companyId, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.holiday.findMany({ where, include: { calendar: { include: { branch: true } } }, ...paginationArgs(query), orderBy: [{ date: 'asc' }, { createdAt: 'desc' }] }),
      this.prisma.holiday.count({ where }),
    ]);
    return paginatedResult(data.map((holiday) => this.serializeHoliday(holiday)), total, query);
  }

  async exportHolidays(calendarId: string, query: HolidayQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(calendarId, companyId, false);
    const where = this.holidayWhere(calendarId, companyId, query);
    const total = await this.prisma.holiday.count({ where });
    this.assertExportLimit(total);
    const rows = await this.prisma.holiday.findMany({ where, include: { calendar: { include: { branch: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'desc' }], take: EXPORT_LIMIT });
    return this.csvDownload(`holidays-${calendarId}-${this.todayForFilename()}.csv`, [
      ['Holiday Name', 'Holiday Date', 'Day of Week', 'Holiday Type', 'Mandatory/Optional', 'Recurring', 'Status', 'Description', 'Notes'],
      ...rows.map((holiday) => this.exportHolidayRow(this.serializeHoliday(holiday))),
    ]);
  }

  async findHoliday(calendarId: string, holidayId: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(calendarId, companyId, false);
    return this.serializeHoliday(await this.requireHoliday(calendarId, holidayId, companyId));
  }

  async updateHoliday(calendarId: string, holidayId: string, dto: UpdateHolidayDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const calendar = await this.requireCalendar(calendarId, companyId, false);
    await this.requireHoliday(calendarId, holidayId, companyId);
    const nextDate = dto.date !== undefined ? dateOnly(dto.date) : undefined;
    if (nextDate) {
      this.assertHolidayYear(calendar.year, nextDate);
      await this.assertNoDuplicateHoliday(calendarId, companyId, nextDate, holidayId);
    }
    const holiday = await this.prisma.holiday.update({
      where: { id: holidayId },
      data: {
        ...(nextDate ? { date: nextDate } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.optional !== undefined ? { optional: this.booleanValue(dto.optional) } : {}),
        ...(dto.recurring !== undefined ? { recurring: this.booleanValue(dto.recurring) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        updatedById: actor.id,
      },
      include: { calendar: { include: { branch: true } } },
    });
    await this.audit(companyId, actor.id, 'HOLIDAY_UPDATED', 'Holiday', holidayId, this.holidayAuditMetadata(holiday));
    return this.serializeHoliday(holiday);
  }

  async removeHoliday(calendarId: string, holidayId: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.requireCalendar(calendarId, companyId, false);
    await this.requireHoliday(calendarId, holidayId, companyId);
    const holiday = await this.prisma.holiday.update({ where: { id: holidayId }, data: { deletedAt: new Date(), updatedById: actor.id }, include: { calendar: { include: { branch: true } } } });
    await this.audit(companyId, actor.id, 'HOLIDAY_ARCHIVED', 'Holiday', holidayId, this.holidayAuditMetadata(holiday));
    return this.serializeHoliday(holiday);
  }

  private calendarWhere(companyId: string, query: HolidayCalendarQueryDto): Prisma.HolidayCalendarWhereInput {
    return {
      companyId,
      deletedAt: null,
      ...(query.enabled !== undefined ? { enabled: this.booleanValue(query.enabled) } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.year ? { year: query.year } : {}),
      ...(query.timezone ? { timezone: { contains: query.timezone, mode: 'insensitive' } } : {}),
      ...(query.scope === 'COMPANY' ? { branchId: null } : {}),
      ...(query.scope === 'BRANCH' ? { branchId: { not: null } } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        { branch: { name: { contains: query.search, mode: 'insensitive' } } },
        { branch: { code: { contains: query.search, mode: 'insensitive' } } },
      ] } : {}),
    };
  }

  private holidayWhere(calendarId: string, companyId: string, query: HolidayQueryDto): Prisma.HolidayWhereInput {
    return {
      companyId,
      calendarId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.optional !== undefined ? { optional: this.booleanValue(query.optional) } : {}),
      ...(query.recurring !== undefined ? { recurring: this.booleanValue(query.recurring) } : {}),
      ...(query.dateFrom || query.dateTo ? { date: { ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}), ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}) } } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ] } : {}),
    };
  }

  private async requireCalendar(id: string, companyId: string, include = true) {
    const calendar = await this.prisma.holidayCalendar.findFirst({
      where: { id, companyId, deletedAt: null },
      ...(include ? { include: calendarInclude } : {}),
    });
    if (!calendar) throw new NotFoundException('Holiday calendar not found');
    return calendar;
  }

  private async requireHoliday(calendarId: string, holidayId: string, companyId: string) {
    const holiday = await this.prisma.holiday.findFirst({ where: { id: holidayId, calendarId, companyId, deletedAt: null }, include: { calendar: { include: { branch: true } } } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    return holiday;
  }

  private async assertBranch(companyId: string, branchId?: string | null) {
    if (!branchId) return;
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null }, select: { id: true } });
    if (!branch) throw new BadRequestException('The selected branch does not belong to this company.');
  }

  private assertHolidayYear(year: number | null | undefined, date: Date) {
    if (year && date.getUTCFullYear() !== year) throw new BadRequestException('The holiday date must belong to the calendar year.');
  }

  private async assertNoDuplicateHoliday(calendarId: string, companyId: string, date: Date, currentId?: string) {
    const existing = await this.prisma.holiday.findFirst({ where: { calendarId, companyId, date, deletedAt: null, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } });
    if (existing) throw new BadRequestException('A holiday already exists on this date in the selected calendar.');
  }

  private withCalendarCounts<T extends HolidayCalendarWithRelations>(calendar: T) {
    const holidays = calendar.holidays ?? [];
    return {
      ...calendar,
      holidayCount: holidays.length,
      mandatoryCount: holidays.filter((holiday) => !holiday.optional).length,
      optionalCount: holidays.filter((holiday) => holiday.optional).length,
    };
  }

  private calendarSummary(rows: Array<{ enabled: boolean; branchId: string | null; holidays: Array<{ optional: boolean }> }>) {
    return rows.reduce((summary, calendar) => {
      summary.total += 1;
      if (calendar.enabled) summary.active += 1; else summary.inactive += 1;
      if (calendar.branchId) summary.branchScope += 1; else summary.companyScope += 1;
      summary.totalHolidays += calendar.holidays.length;
      summary.mandatoryHolidays += calendar.holidays.filter((holiday) => !holiday.optional).length;
      summary.optionalHolidays += calendar.holidays.filter((holiday) => holiday.optional).length;
      return summary;
    }, { total: 0, active: 0, inactive: 0, companyScope: 0, branchScope: 0, totalHolidays: 0, mandatoryHolidays: 0, optionalHolidays: 0 });
  }

  private serializeHoliday(holiday: HolidayWithCalendar) {
    return { ...holiday, date: holiday.date.toISOString().slice(0, 10) };
  }

  private booleanValue(value: unknown): boolean {
    return value === true || value === 'true';
  }

  private exportCalendarRow(calendar: ReturnType<HolidayCalendarsService['withCalendarCounts']>) {
    return [calendar.name, calendar.branchId ? 'Branch' : 'Company', calendar.branch?.name ?? '', calendar.year ?? '', calendar.timezone, calendar.holidayCount, calendar.mandatoryCount, calendar.optionalCount, calendar.enabled ? 'Active' : 'Inactive', calendar.updatedAt.toISOString()];
  }

  private exportHolidayRow(holiday: ReturnType<HolidayCalendarsService['serializeHoliday']>) {
    return [holiday.name, holiday.date, this.dayOfWeek(holiday.date), holiday.type, holiday.optional ? 'Optional' : 'Mandatory', holiday.recurring ? 'Yes' : 'No', 'Active', '', holiday.notes ?? ''];
  }

  private assertExportLimit(total: number) {
    if (total > EXPORT_LIMIT) throw new BadRequestException(`Export is limited to ${EXPORT_LIMIT} records. Narrow the filters and try again.`);
  }

  private csvDownload(filename: string, rows: unknown[][]) {
    const csv = rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\r\n');
    return { filename, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from(`\uFEFF${csv}`, 'utf8') };
  }

  private csvCell(value: unknown) {
    const text = value === null || value === undefined ? '' : String(value);
    const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${protectedText.replace(/"/g, '""')}"`;
  }

  private dayOfWeek(date: string) {
    return new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  }

  private todayForFilename() {
    const date = new Date();
    return date.toISOString().slice(0, 10);
  }

  private calendarAuditMetadata(calendar: Pick<HolidayCalendarWithRelations, 'id' | 'name' | 'branchId' | 'year' | 'enabled'>): Prisma.InputJsonValue {
    return { calendarId: calendar.id, name: calendar.name, scope: calendar.branchId ? 'BRANCH' : 'COMPANY', branchId: calendar.branchId, year: calendar.year, enabled: calendar.enabled };
  }

  private holidayAuditMetadata(holiday: HolidayWithCalendar): Prisma.InputJsonValue {
    return { holidayId: holiday.id, calendarId: holiday.calendarId, date: holiday.date.toISOString().slice(0, 10), name: holiday.name, type: holiday.type, optional: holiday.optional, recurring: holiday.recurring };
  }

  private async audit(companyId: string, actorUserId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { companyId, actorUserId, action, entityType, entityId, metadata } });
  }
}
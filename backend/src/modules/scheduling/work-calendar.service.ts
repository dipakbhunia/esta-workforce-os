import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentSource,
  Holiday,
  Prisma,
  RosterDaySource,
  RosterDayType,
  ShiftAssignmentStatus,
  ShiftAssignmentType,
  ShiftRosterStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly, zonedDateTimeToUtc } from '../attendance/attendance-time.util';
import { TimeBoundaryService } from '../attendance/time-boundary.service';

const shiftSelect = {
  id: true,
  name: true,
  code: true,
  startTime: true,
  endTime: true,
  timezone: true,
} satisfies Prisma.ShiftSelect;

const employeeSelect = {
  id: true,
  companyId: true,
  branchId: true,
  departmentId: true,
  shift: { select: shiftSelect },
} satisfies Prisma.EmployeeSelect;

const assignmentSelect = {
  id: true,
  assignmentType: true,
  source: true,
  effectiveFrom: true,
  effectiveTo: true,
  shift: { select: shiftSelect },
} satisfies Prisma.EmployeeShiftAssignmentSelect;

const rosterDaySelect = {
  id: true,
  rosterPeriodId: true,
  workDate: true,
  dayType: true,
  source: true,
  shift: { select: shiftSelect },
  rosterPeriod: {
    select: { id: true, status: true, timezone: true, version: true },
  },
} satisfies Prisma.ShiftRosterDaySelect;

const weeklyOffSelect = {
  id: true,
  name: true,
  weekdays: true,
  priority: true,
  branchId: true,
  departmentId: true,
  employeeId: true,
} satisfies Prisma.WeeklyOffRuleSelect;

export type CalendarResolutionSource =
  | 'MANUAL_OVERRIDE'
  | 'ROSTER'
  | 'WEEKLY_OFF'
  | 'HOLIDAY'
  | 'ASSIGNMENT'
  | 'EMPLOYEE_FALLBACK'
  | 'NO_SHIFT';

export type CalendarShift = Prisma.ShiftGetPayload<{ select: typeof shiftSelect }>;

export interface WorkCalendarResolution {
  companyId: string;
  employeeId: string;
  workDate: string;
  timestamp: Date;
  timezone: string;
  resolutionSource: CalendarResolutionSource;
  dayType: RosterDayType;
  rosterPeriodId: string | null;
  rosterDayId: string | null;
  rosterSource: RosterDaySource | null;
  shiftAssignmentId: string | null;
  assignmentType: ShiftAssignmentType | null;
  assignmentSource: AssignmentSource | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  isWeeklyOff: boolean;
  weeklyOffRuleId: string | null;
  weeklyOffRuleName: string | null;
  isHoliday: boolean;
  holidayId: string | null;
  holidayName: string | null;
  shift: CalendarShift | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  crossesMidnight: boolean;
}

@Injectable()
export class WorkCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeBoundary: TimeBoundaryService,
  ) {}

  async resolveDay(input: {
    companyId: string;
    employeeId: string;
    workDate?: string;
    timestamp?: Date;
  }): Promise<WorkCalendarResolution> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: input.employeeId,
        companyId: input.companyId,
        deletedAt: null,
      },
      select: employeeSelect,
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const timestamp = input.timestamp ?? new Date();
    const workDate = input.workDate ?? timestamp.toISOString().slice(0, 10);
    const workDateValue = dateOnly(workDate);
    const weekday = workDateValue.getUTCDay();

    const [rosterDay, weeklyOffRule, holiday, assignment] = await Promise.all([
      this.resolveRosterDay(input.companyId, input.employeeId, workDateValue),
      this.resolveWeeklyOff(input.companyId, employee, workDateValue, weekday),
      this.resolveHoliday(input.companyId, employee.branchId, workDateValue),
      this.resolveAssignment(input.companyId, input.employeeId, timestamp),
    ]);

    const isWeeklyOff = Boolean(weeklyOffRule);
    const isHoliday = Boolean(holiday);
    const fallbackShift = assignment?.shift ?? employee.shift ?? null;
    const shift = rosterDay?.shift ?? fallbackShift;
    const timezone =
      rosterDay?.shift?.timezone ??
      assignment?.shift.timezone ??
      employee.shift?.timezone ??
      rosterDay?.rosterPeriod.timezone ??
      'UTC';

    let dayType = rosterDay?.dayType ?? RosterDayType.WORKING;
    let resolutionSource: CalendarResolutionSource = 'NO_SHIFT';
    if (rosterDay) {
      resolutionSource =
        rosterDay.source === RosterDaySource.MANUAL_OVERRIDE
          ? 'MANUAL_OVERRIDE'
          : 'ROSTER';
    } else if (isHoliday) {
      dayType = RosterDayType.HOLIDAY;
      resolutionSource = 'HOLIDAY';
    } else if (isWeeklyOff) {
      dayType = RosterDayType.WEEKLY_OFF;
      resolutionSource = 'WEEKLY_OFF';
    } else if (assignment) {
      dayType = RosterDayType.WORKING;
      resolutionSource = 'ASSIGNMENT';
    } else if (employee.shift) {
      dayType = RosterDayType.WORKING;
      resolutionSource = 'EMPLOYEE_FALLBACK';
    } else {
      dayType = RosterDayType.NO_SHIFT;
    }

    const shiftWindow = shift
      ? this.timeBoundary.resolveShiftWindow({
          workDate,
          startTime: shift.startTime,
          endTime: shift.endTime,
          timezone: shift.timezone,
        })
      : null;

    return {
      companyId: input.companyId,
      employeeId: input.employeeId,
      workDate,
      timestamp,
      timezone,
      resolutionSource,
      dayType,
      rosterPeriodId: rosterDay?.rosterPeriodId ?? null,
      rosterDayId: rosterDay?.id ?? null,
      rosterSource: rosterDay?.source ?? null,
      shiftAssignmentId: rosterDay ? null : assignment?.id ?? null,
      assignmentType: rosterDay ? null : assignment?.assignmentType ?? null,
      assignmentSource: rosterDay ? null : assignment?.source ?? (employee.shift ? AssignmentSource.EMPLOYEE_PROFILE : null),
      effectiveFrom: rosterDay ? null : assignment?.effectiveFrom ?? null,
      effectiveTo: rosterDay ? null : assignment?.effectiveTo ?? null,
      isWeeklyOff,
      weeklyOffRuleId: weeklyOffRule?.id ?? null,
      weeklyOffRuleName: weeklyOffRule?.name ?? null,
      isHoliday,
      holidayId: holiday?.id ?? null,
      holidayName: holiday?.name ?? null,
      shift,
      scheduledStartAt: shiftWindow?.scheduledStartAt ?? null,
      scheduledEndAt: shiftWindow?.scheduledEndAt ?? null,
      crossesMidnight: shiftWindow?.crossesMidnight ?? false,
    };
  }

  async resolveDateRange(input: {
    companyId: string;
    employeeId: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<WorkCalendarResolution[]> {
    const from = dateOnly(input.dateFrom);
    const to = dateOnly(input.dateTo);
    if (from > to) return [];
    const days: WorkCalendarResolution[] = [];
    for (const cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      days.push(
        await this.resolveDay({
          companyId: input.companyId,
          employeeId: input.employeeId,
          workDate: cursor.toISOString().slice(0, 10),
        }),
      );
    }
    return days;
  }

  private async resolveRosterDay(companyId: string, employeeId: string, workDate: Date) {
    const days = await this.prisma.shiftRosterDay.findMany({
      where: {
        companyId,
        employeeId,
        workDate,
        deletedAt: null,
        rosterPeriod: {
          status: { in: [ShiftRosterStatus.PUBLISHED, ShiftRosterStatus.LOCKED] },
          dateFrom: { lte: workDate },
          dateTo: { gte: workDate },
          deletedAt: null,
        },
      },
      select: rosterDaySelect,
      orderBy: [{ source: 'asc' }, { rosterPeriod: { version: 'desc' } }, { updatedAt: 'desc' }],
    });
    return days.sort((left, right) => {
      const leftManual = left.source === RosterDaySource.MANUAL_OVERRIDE ? 0 : 1;
      const rightManual = right.source === RosterDaySource.MANUAL_OVERRIDE ? 0 : 1;
      if (leftManual !== rightManual) return leftManual - rightManual;
      return right.rosterPeriod.version - left.rosterPeriod.version;
    })[0] ?? null;
  }

  private async resolveWeeklyOff(
    companyId: string,
    employee: Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>,
    workDate: Date,
    weekday: number,
  ) {
    const rules = await this.prisma.weeklyOffRule.findMany({
      where: {
        companyId,
        enabled: true,
        deletedAt: null,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
        AND: [
          {
            OR: [
              { employeeId: employee.id },
              { employeeId: null, departmentId: employee.departmentId ?? undefined },
              { employeeId: null, departmentId: null, branchId: employee.branchId ?? undefined },
              { employeeId: null, departmentId: null, branchId: null },
            ],
          },
        ],
      },
      select: weeklyOffSelect,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });

    return rules
      .filter((rule) => this.weekdays(rule.weekdays).includes(weekday))
      .sort((left, right) => this.weeklyOffScopeRank(left, employee) - this.weeklyOffScopeRank(right, employee) || left.priority - right.priority)[0] ?? null;
  }

  private async resolveHoliday(companyId: string, branchId: string | null, workDate: Date): Promise<Holiday | null> {
    const holidays = await this.prisma.holiday.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { date: workDate },
          {
            recurring: true,
            date: {
              gte: dateOnly(`2000-${String(workDate.getUTCMonth() + 1).padStart(2, '0')}-${String(workDate.getUTCDate()).padStart(2, '0')}`),
              lte: dateOnly(`2099-${String(workDate.getUTCMonth() + 1).padStart(2, '0')}-${String(workDate.getUTCDate()).padStart(2, '0')}`),
            },
          },
        ],
        calendar: {
          enabled: true,
          deletedAt: null,
          OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
        },
      },
      include: { calendar: true },
      orderBy: [{ optional: 'asc' }, { createdAt: 'desc' }],
    });

    return holidays
      .filter((holiday) => {
        if (!holiday.recurring) return holiday.date.getTime() === workDate.getTime();
        return holiday.date.getUTCMonth() === workDate.getUTCMonth() && holiday.date.getUTCDate() === workDate.getUTCDate();
      })
      .sort((left, right) => {
        const leftBranch = left.calendar.branchId ? 0 : 1;
        const rightBranch = right.calendar.branchId ? 0 : 1;
        return leftBranch - rightBranch;
      })[0] ?? null;
  }

  private async resolveAssignment(companyId: string, employeeId: string, timestamp: Date) {
    const assignments = await this.prisma.employeeShiftAssignment.findMany({
      where: {
        companyId,
        employeeId,
        deletedAt: null,
        status: { not: ShiftAssignmentStatus.CANCELLED },
        effectiveFrom: { lte: timestamp },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: timestamp } }],
      },
      select: assignmentSelect,
      orderBy: [{ effectiveFrom: 'desc' }],
    });
    if (assignments.length > 1) {
      throw new ConflictException('Conflicting shift assignments exist for this employee and timestamp');
    }
    return assignments[0] ?? null;
  }

  private weekdays(value: Prisma.JsonValue): number[] {
    if (Array.isArray(value)) {
      return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
    }
    if (value && typeof value === 'object' && 'weekdays' in value) {
      const nested = (value as { weekdays?: unknown }).weekdays;
      return Array.isArray(nested)
        ? nested.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
        : [];
    }
    return [];
  }

  private weeklyOffScopeRank(
    rule: Prisma.WeeklyOffRuleGetPayload<{ select: typeof weeklyOffSelect }>,
    employee: Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>,
  ): number {
    if (rule.employeeId === employee.id) return 0;
    if (rule.departmentId && rule.departmentId === employee.departmentId) return 1;
    if (rule.branchId && rule.branchId === employee.branchId) return 2;
    return 3;
  }
}


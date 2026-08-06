import { ConflictException, Injectable } from '@nestjs/common';
import {
  AssignmentSource,
  Prisma,
  RosterDaySource,
  RosterDayType,
  ShiftAssignmentStatus,
  ShiftAssignmentType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { zonedDateTimeToUtc } from '../attendance/attendance-time.util';
import { WorkCalendarResolution, WorkCalendarService } from '../scheduling/work-calendar.service';

const shiftSelect = {
  id: true,
  name: true,
  code: true,
  startTime: true,
  endTime: true,
  timezone: true,
} satisfies Prisma.ShiftSelect;

const assignmentSelect = {
  id: true,
  assignmentType: true,
  source: true,
  effectiveFrom: true,
  effectiveTo: true,
  shift: { select: shiftSelect },
} satisfies Prisma.EmployeeShiftAssignmentSelect;

export type ShiftResolutionSource =
  | 'MANUAL_OVERRIDE'
  | 'ROSTER'
  | 'WEEKLY_OFF'
  | 'HOLIDAY'
  | 'ASSIGNMENT'
  | 'EMPLOYEE_FALLBACK'
  | 'NO_SHIFT';

export interface EffectiveShiftResolution {
  resolutionSource: ShiftResolutionSource;
  assignmentId: string | null;
  assignmentType: ShiftAssignmentType | null;
  source: AssignmentSource | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  shift: Prisma.ShiftGetPayload<{ select: typeof shiftSelect }>;
}

export interface PlannedShiftResolution extends Omit<EffectiveShiftResolution, 'shift'> {
  shift: Prisma.ShiftGetPayload<{ select: typeof shiftSelect }> | null;
  workDate: string;
  rosterPeriodId: string | null;
  rosterDayId: string | null;
  rosterSource: RosterDaySource | null;
  dayType: RosterDayType;
  isWeeklyOff: boolean;
  weeklyOffRuleId: string | null;
  isHoliday: boolean;
  holidayId: string | null;
  holidayName: string | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
}

@Injectable()
export class ShiftResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workCalendar?: WorkCalendarService,
  ) {}

  async resolvePlannedDayForTimestamp(input: {
    companyId: string;
    employeeId: string;
    timestamp: Date;
  }): Promise<PlannedShiftResolution> {
    if (this.workCalendar) {
      return this.fromCalendarResolution(
        await this.workCalendar.resolveDay(input),
      );
    }

    const legacy = await this.resolveLegacyForTimestamp(input);
    return {
      resolutionSource: legacy?.resolutionSource ?? 'NO_SHIFT',
      assignmentId: legacy?.assignmentId ?? null,
      assignmentType: legacy?.assignmentType ?? null,
      source: legacy?.source ?? null,
      effectiveFrom: legacy?.effectiveFrom ?? null,
      effectiveTo: legacy?.effectiveTo ?? null,
      shift: legacy?.shift ?? null,
      workDate: input.timestamp.toISOString().slice(0, 10),
      rosterPeriodId: null,
      rosterDayId: null,
      rosterSource: null,
      dayType: legacy ? RosterDayType.WORKING : RosterDayType.NO_SHIFT,
      isWeeklyOff: false,
      weeklyOffRuleId: null,
      isHoliday: false,
      holidayId: null,
      holidayName: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
    };
  }

  async resolveForTimestamp(input: {
    companyId: string;
    employeeId: string;
    timestamp: Date;
  }): Promise<EffectiveShiftResolution | null> {
    const planned = await this.resolvePlannedDayForTimestamp(input);
    if (!planned.shift) return null;
    return {
      resolutionSource: planned.resolutionSource,
      assignmentId: planned.assignmentId,
      assignmentType: planned.assignmentType,
      source: planned.source,
      effectiveFrom: planned.effectiveFrom,
      effectiveTo: planned.effectiveTo,
      shift: planned.shift,
    };
  }

  async resolveForWorkDate(input: {
    companyId: string;
    employeeId: string;
    workDate: string;
    timezone: string;
  }): Promise<EffectiveShiftResolution | null> {
    if (this.workCalendar) {
      const planned = await this.workCalendar.resolveDay({
        companyId: input.companyId,
        employeeId: input.employeeId,
        workDate: input.workDate,
        timestamp: zonedDateTimeToUtc(input.workDate, '00:00', input.timezone),
      });
      return planned.shift
        ? {
            resolutionSource: planned.resolutionSource,
            assignmentId: planned.shiftAssignmentId,
            assignmentType: planned.assignmentType,
            source: planned.assignmentSource,
            effectiveFrom: planned.effectiveFrom,
            effectiveTo: planned.effectiveTo,
            shift: planned.shift,
          }
        : null;
    }

    const timestamp = zonedDateTimeToUtc(input.workDate, '00:00', input.timezone);
    return this.resolveLegacyForTimestamp({
      companyId: input.companyId,
      employeeId: input.employeeId,
      timestamp,
    });
  }

  async getCurrentAssignment(input: {
    companyId: string;
    employeeId: string;
  }): Promise<EffectiveShiftResolution | null> {
    return this.resolveForTimestamp({
      ...input,
      timestamp: new Date(),
    });
  }

  async getFutureAssignments(input: { companyId: string; employeeId: string }) {
    return this.prisma.employeeShiftAssignment.findMany({
      where: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        deletedAt: null,
        status: { not: ShiftAssignmentStatus.CANCELLED },
        effectiveFrom: { gt: new Date() },
      },
      select: assignmentSelect,
      orderBy: [{ effectiveFrom: 'asc' }],
    });
  }

  private fromCalendarResolution(resolution: WorkCalendarResolution): PlannedShiftResolution {
    return {
      resolutionSource: resolution.resolutionSource,
      assignmentId: resolution.shiftAssignmentId,
      assignmentType: resolution.assignmentType,
      source: resolution.assignmentSource,
      effectiveFrom: resolution.effectiveFrom,
      effectiveTo: resolution.effectiveTo,
      shift: resolution.shift,
      workDate: resolution.workDate,
      rosterPeriodId: resolution.rosterPeriodId,
      rosterDayId: resolution.rosterDayId,
      rosterSource: resolution.rosterSource,
      dayType: resolution.dayType,
      isWeeklyOff: resolution.isWeeklyOff,
      weeklyOffRuleId: resolution.weeklyOffRuleId,
      isHoliday: resolution.isHoliday,
      holidayId: resolution.holidayId,
      holidayName: resolution.holidayName,
      scheduledStartAt: resolution.scheduledStartAt,
      scheduledEndAt: resolution.scheduledEndAt,
    };
  }

  private async resolveLegacyForTimestamp(input: {
    companyId: string;
    employeeId: string;
    timestamp: Date;
  }): Promise<EffectiveShiftResolution | null> {
    const assignments = await this.prisma.employeeShiftAssignment.findMany({
      where: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        deletedAt: null,
        status: { not: ShiftAssignmentStatus.CANCELLED },
        // Effective range semantics are [effectiveFrom, effectiveTo):
        // effectiveFrom is inclusive, effectiveTo is exclusive.
        effectiveFrom: { lte: input.timestamp },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.timestamp } }],
      },
      select: assignmentSelect,
      orderBy: [{ effectiveFrom: 'desc' }],
    });

    if (assignments.length > 1) {
      throw new ConflictException(
        'Conflicting shift assignments exist for this employee and timestamp',
      );
    }

    const assignment = assignments[0];
    if (assignment) {
      return {
        resolutionSource: 'ASSIGNMENT',
        assignmentId: assignment.id,
        assignmentType: assignment.assignmentType,
        source: assignment.source,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo,
        shift: assignment.shift,
      };
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: input.employeeId,
        companyId: input.companyId,
        deletedAt: null,
      },
      select: { shift: { select: shiftSelect } },
    });

    if (!employee?.shift) return null;
    return {
      resolutionSource: 'EMPLOYEE_FALLBACK',
      assignmentId: null,
      assignmentType: null,
      source: AssignmentSource.EMPLOYEE_PROFILE,
      effectiveFrom: null,
      effectiveTo: null,
      shift: employee.shift,
    };
  }
}

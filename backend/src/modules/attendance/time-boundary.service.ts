import { Injectable } from '@nestjs/common';
import {
  dateKey,
  dateOnly,
  expectedShiftMinutes,
  timeToMinutes,
  zonedDateTimeToUtc,
} from './attendance-time.util';

export interface TimezoneResolutionInput {
  employeeTimezone?: string | null;
  shiftTimezone?: string | null;
  branchTimezone?: string | null;
  companyTimezone?: string | null;
}

export interface ShiftWindowInput {
  workDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface ShiftWindow {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  timezone: string;
  crossesMidnight: boolean;
  scheduledMinutes: number;
}

export interface WorkDateResolutionInput {
  timestamp: Date;
  timezone: string;
  attendanceDayStartTime?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  openAttendanceDate?: Date | string | null;
}

export interface WorkDateResolution {
  workDate: string;
  timezone: string;
  localTimestamp: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  };
  boundaryStart: Date;
  boundaryEnd: Date;
}

export interface DateOnlyRange {
  workDate: string;
  timezone: string;
  rangeStart: Date;
  rangeEnd: Date;
}

@Injectable()
export class TimeBoundaryService {
  resolveTimezone(input: TimezoneResolutionInput): string {
    // Current schema does not expose employee, branch, or company timezone fields.
    // The practical fallback today is shift timezone -> UTC.
    return (
      this.cleanTimezone(input.employeeTimezone) ??
      this.cleanTimezone(input.shiftTimezone) ??
      this.cleanTimezone(input.branchTimezone) ??
      this.cleanTimezone(input.companyTimezone) ??
      'UTC'
    );
  }

  resolveWorkDate(input: WorkDateResolutionInput): WorkDateResolution {
    const timezone = this.resolveTimezone({ shiftTimezone: input.timezone });
    const attendanceDayStartTime = input.attendanceDayStartTime || '00:00';
    const workDate = input.openAttendanceDate
      ? this.toDateKey(input.openAttendanceDate)
      : dateKey(input.timestamp, timezone, attendanceDayStartTime);
    const boundaryStart = zonedDateTimeToUtc(
      workDate,
      attendanceDayStartTime,
      timezone,
    );
    const boundaryEnd = new Date(boundaryStart);
    boundaryEnd.setUTCDate(boundaryEnd.getUTCDate() + 1);

    return {
      workDate,
      timezone,
      localTimestamp: this.localTimestamp(input.timestamp, timezone),
      boundaryStart,
      boundaryEnd,
    };
  }

  resolveShiftWindow(input: ShiftWindowInput): ShiftWindow {
    const timezone = this.resolveTimezone({ shiftTimezone: input.timezone });
    const scheduledStartAt = zonedDateTimeToUtc(
      input.workDate,
      input.startTime,
      timezone,
    );
    const scheduledMinutes = expectedShiftMinutes(
      input.startTime,
      input.endTime,
    );
    const scheduledEndAt = new Date(
      scheduledStartAt.getTime() + scheduledMinutes * 60000,
    );

    return {
      scheduledStartAt,
      scheduledEndAt,
      timezone,
      crossesMidnight:
        timeToMinutes(input.endTime) <= timeToMinutes(input.startTime),
      scheduledMinutes,
    };
  }

  resolveDateOnlyRange(
    value: string,
    timezone: string,
    attendanceDayStartTime = '00:00',
  ): DateOnlyRange {
    const workDate = value.slice(0, 10);
    const rangeStart = zonedDateTimeToUtc(
      workDate,
      attendanceDayStartTime,
      this.resolveTimezone({ shiftTimezone: timezone }),
    );
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    rangeEnd.setMilliseconds(rangeEnd.getMilliseconds() - 1);
    return {
      workDate,
      timezone,
      rangeStart,
      rangeEnd,
    };
  }

  dateOnly(value: string): Date {
    return dateOnly(value);
  }

  toDateKey(value: Date | string): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private cleanTimezone(value?: string | null): string | null {
    if (!value || !value.trim()) return null;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return value;
    } catch {
      return null;
    }
  }

  private localTimestamp(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
    };
  }
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AssignmentSource, RosterDaySource, RosterDayType, ShiftAssignmentType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TimeBoundaryService } from '../attendance/time-boundary.service';
import { WorkCalendarService } from './work-calendar.service';

const shift = {
  id: 'shift-1',
  name: 'General Shift',
  code: 'GENERAL',
  startTime: '09:00',
  endTime: '18:00',
  timezone: 'Asia/Kolkata',
};

const rosterShift = {
  ...shift,
  id: 'shift-roster',
  name: 'Roster Shift',
  code: 'ROSTER',
};

const employee = {
  id: 'employee-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  departmentId: 'department-1',
  shift,
};

type MockOptions = {
  rosterDays?: unknown[];
  weeklyOffRules?: unknown[];
  holidays?: unknown[];
  assignments?: unknown[];
  employeeShift?: typeof shift | null;
};

function service(options: MockOptions = {}) {
  const prisma = {
    employee: {
      findFirst: async () => ({ ...employee, shift: options.employeeShift === undefined ? shift : options.employeeShift }),
    },
    shiftRosterDay: { findMany: async () => options.rosterDays ?? [] },
    weeklyOffRule: { findMany: async () => options.weeklyOffRules ?? [] },
    holiday: { findMany: async () => options.holidays ?? [] },
    employeeShiftAssignment: { findMany: async () => options.assignments ?? [] },
  } as unknown as PrismaService;
  return new WorkCalendarService(prisma, new TimeBoundaryService());
}

function assignment() {
  return {
    id: 'assignment-1',
    assignmentType: ShiftAssignmentType.PRIMARY,
    source: AssignmentSource.MANUAL,
    effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
    effectiveTo: null,
    shift,
  };
}

describe('WorkCalendarService', () => {
  it('uses a manual roster override before an active assignment', async () => {
    const result = await service({
      rosterDays: [
        {
          id: 'day-1',
          rosterPeriodId: 'period-1',
          workDate: new Date('2026-08-06T00:00:00.000Z'),
          dayType: RosterDayType.WORKING,
          source: RosterDaySource.MANUAL_OVERRIDE,
          shift: rosterShift,
          rosterPeriod: { id: 'period-1', status: 'PUBLISHED', timezone: 'Asia/Kolkata', version: 1 },
        },
      ],
      assignments: [assignment()],
    }).resolveDay({ companyId: 'company-1', employeeId: 'employee-1', workDate: '2026-08-06' });

    assert.equal(result.resolutionSource, 'MANUAL_OVERRIDE');
    assert.equal(result.rosterDayId, 'day-1');
    assert.equal(result.shift?.id, 'shift-roster');
    assert.equal(result.shiftAssignmentId, null);
  });

  it('falls back to an effective assignment when no roster day exists', async () => {
    const result = await service({ assignments: [assignment()] }).resolveDay({
      companyId: 'company-1',
      employeeId: 'employee-1',
      workDate: '2026-08-06',
    });

    assert.equal(result.resolutionSource, 'ASSIGNMENT');
    assert.equal(result.shiftAssignmentId, 'assignment-1');
    assert.equal(result.dayType, RosterDayType.WORKING);
  });

  it('preserves both holiday and weekly-off flags with holiday as the final day type', async () => {
    const result = await service({
      weeklyOffRules: [
        {
          id: 'weekly-1',
          name: 'Weekend',
          weekdays: [4],
          priority: 1,
          branchId: null,
          departmentId: null,
          employeeId: null,
        },
      ],
      holidays: [
        {
          id: 'holiday-1',
          companyId: 'company-1',
          calendarId: 'calendar-1',
          date: new Date('2026-08-06T00:00:00.000Z'),
          name: 'Foundation Day',
          type: 'COMPANY',
          optional: false,
          recurring: false,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdById: null,
          updatedById: null,
          calendar: { branchId: null },
        },
      ],
      assignments: [assignment()],
    }).resolveDay({ companyId: 'company-1', employeeId: 'employee-1', workDate: '2026-08-06' });

    assert.equal(result.dayType, RosterDayType.HOLIDAY);
    assert.equal(result.isHoliday, true);
    assert.equal(result.holidayName, 'Foundation Day');
    assert.equal(result.isWeeklyOff, true);
    assert.equal(result.weeklyOffRuleId, 'weekly-1');
    assert.equal(result.shift?.id, 'shift-1');
  });

  it('uses employee default shift when no roster or assignment exists', async () => {
    const result = await service({ assignments: [] }).resolveDay({
      companyId: 'company-1',
      employeeId: 'employee-1',
      workDate: '2026-08-06',
    });

    assert.equal(result.resolutionSource, 'EMPLOYEE_FALLBACK');
    assert.equal(result.shift?.id, 'shift-1');
  });

  it('returns NO_SHIFT when no roster, assignment, or employee default exists', async () => {
    const result = await service({ assignments: [], employeeShift: null }).resolveDay({
      companyId: 'company-1',
      employeeId: 'employee-1',
      workDate: '2026-08-06',
    });

    assert.equal(result.resolutionSource, 'NO_SHIFT');
    assert.equal(result.dayType, RosterDayType.NO_SHIFT);
    assert.equal(result.shift, null);
  });

  it('resolves every date in a date range inclusively', async () => {
    const result = await service({ assignments: [assignment()] }).resolveDateRange({
      companyId: 'company-1',
      employeeId: 'employee-1',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-03',
    });

    assert.equal(result.length, 3);
    assert.deepEqual(result.map((item) => item.workDate), ['2026-08-01', '2026-08-02', '2026-08-03']);
  });
});

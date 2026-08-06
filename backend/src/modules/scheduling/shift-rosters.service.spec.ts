import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RoleName, RosterDayType, ShiftRosterStatus } from '@prisma/client';
import { ShiftRostersService } from './shift-rosters.service';

const actor = {
  id: 'user-1',
  companyId: 'company-1',
  email: 'hr@example.com',
  firstName: 'HR',
  lastName: 'User',
  status: 'ACTIVE',
  roles: [RoleName.HR],
} as const;

const roster = {
  id: 'roster-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  departmentId: 'department-1',
  name: 'August Roster',
  code: 'AUG-2026',
  dateFrom: new Date('2026-08-01T00:00:00.000Z'),
  dateTo: new Date('2026-08-31T00:00:00.000Z'),
  timezone: 'Asia/Kolkata',
  status: ShiftRosterStatus.DRAFT,
  version: 1,
  publishedAt: null,
  lockedAt: null,
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
  updatedAt: new Date('2026-07-20T00:00:00.000Z'),
  deletedAt: null,
  branch: { id: 'branch-1', name: 'Mumbai', code: 'MUM' },
  department: { id: 'department-1', name: 'Engineering', code: 'ENG' },
};

const rosterDay = {
  id: 'day-1',
  companyId: 'company-1',
  rosterPeriodId: 'roster-1',
  employeeId: 'employee-1',
  workDate: new Date('2026-08-06T00:00:00.000Z'),
  dayType: RosterDayType.WORKING,
  shiftId: 'shift-1',
  source: 'MANUAL',
  shiftName: null,
  shiftCode: null,
  shiftStartTime: null,
  shiftEndTime: null,
  shiftTimezone: null,
  scheduledStartAt: new Date('2026-08-06T03:30:00.000Z'),
  scheduledEndAt: new Date('2026-08-06T12:30:00.000Z'),
  notes: '=needs review, safely',
  createdById: 'user-1',
  updatedById: 'user-1',
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
  updatedAt: new Date('2026-07-20T00:00:00.000Z'),
  deletedAt: null,
  employee: {
    id: 'employee-1',
    employeeCode: 'EMP-001',
    user: { firstName: 'Demo', lastName: 'Employee', email: 'demo@example.com' },
    department: { id: 'department-1', name: 'Engineering' },
    designation: { id: 'designation-1', name: 'Developer' },
  },
  shift: {
    id: 'shift-1',
    name: 'General Shift',
    code: 'GENERAL',
    startTime: '09:00',
    endTime: '18:00',
    timezone: 'Asia/Kolkata',
  },
};

function serviceWith(prisma: Record<string, unknown>) {
  return new ShiftRostersService(prisma as never);
}

describe('ShiftRostersService operational roster exports', () => {
  it('returns enriched employee, department, designation, and shift data in roster day list responses', async () => {
    const service = serviceWith({
      shiftRosterPeriod: { findFirst: async () => roster },
      shiftRosterDay: {
        findMany: async () => [rosterDay],
        count: async () => 1,
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    const result = await service.days('roster-1', { page: 1, limit: 20 }, actor as never);

    assert.equal(result.data[0].employee.displayName, 'Demo Employee');
    assert.equal(result.data[0].employee.firstName, 'Demo');
    assert.equal(result.data[0].employee.department?.name, 'Engineering');
    assert.equal(result.data[0].employee.designation?.name, 'Developer');
    assert.equal(result.data[0].shift?.code, 'GENERAL');
  });

  it('exports roster periods with status and overlapping date filters', async () => {
    let countWhere: unknown;
    let findWhere: unknown;
    const service = serviceWith({
      shiftRosterPeriod: {
        count: async (args: { where: unknown }) => {
          countWhere = args.where;
          return 1;
        },
        findMany: async (args: { where: unknown }) => {
          findWhere = args.where;
          return [roster];
        },
      },
    });

    const result = await service.exportRosters({ page: 1, limit: 20, status: ShiftRosterStatus.DRAFT, dateFrom: '2026-08-10', dateTo: '2026-08-20' }, actor as never);
    const csv = result.buffer.toString('utf8');

    assert.deepEqual(findWhere, countWhere);
    assert.equal((findWhere as { status: ShiftRosterStatus }).status, ShiftRosterStatus.DRAFT);
    assert.match(csv, /Roster Name/);
    assert.match(csv, /August Roster/);
  });

  it('exports roster days with employee, day type, and search filters', async () => {
    let where: unknown;
    const service = serviceWith({
      shiftRosterPeriod: { findFirst: async () => roster },
      shiftRosterDay: {
        count: async () => 1,
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [rosterDay];
        },
      },
    });

    const result = await service.exportRosterDays('roster-1', { page: 1, limit: 20, employeeId: 'employee-1', dayType: RosterDayType.WORKING, search: 'demo' }, actor as never);
    const csv = result.buffer.toString('utf8');

    assert.equal((where as { employeeId: string }).employeeId, 'employee-1');
    assert.equal((where as { dayType: RosterDayType }).dayType, RosterDayType.WORKING);
    assert.match(csv, /Demo Employee/);
    assert.match(csv, /Developer/);
  });

  it('quotes CSV fields and protects formula-like values', async () => {
    const service = serviceWith({
      shiftRosterPeriod: { findFirst: async () => roster },
      shiftRosterDay: {
        count: async () => 1,
        findMany: async () => [rosterDay],
      },
    });

    const result = await service.exportRosterDays('roster-1', { page: 1, limit: 20 }, actor as never);
    const csv = result.buffer.toString('utf8');

    assert.match(csv, /"'=needs review, safely"/);
  });

  it('rejects exports over the safe server cap', async () => {
    const service = serviceWith({
      shiftRosterPeriod: {
        count: async () => 10001,
      },
    });

    await assert.rejects(
      () => service.exportRosters({ page: 1, limit: 20 }, actor as never),
      BadRequestException,
    );
  });

  it('requires tenant context for exports', async () => {
    const service = serviceWith({});

    await assert.rejects(
      () => service.exportRosters({ page: 1, limit: 20 }, { ...actor, companyId: null } as never),
      ForbiddenException,
    );
  });
});

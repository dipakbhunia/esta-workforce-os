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
function shiftRosterDayStore(initialRows: Array<Record<string, any>>) {
  const rows = initialRows.map((row) => ({ ...row }));
  const shift = rosterDay.shift;
  const withRelations = (row: Record<string, any>) => ({
    ...row,
    employee: rosterDay.employee,
    shift: row.shiftId ? shift : null,
  });
  const matchesKey = (row: Record<string, any>, where: Record<string, any>) => {
    const key = where.companyId_employeeId_workDate_rosterPeriodId;
    return key
      ? row.companyId === key.companyId && row.employeeId === key.employeeId && row.rosterPeriodId === key.rosterPeriodId && row.workDate.getTime() === key.workDate.getTime()
      : row.companyId === where.companyId && row.employeeId === where.employeeId && row.rosterPeriodId === where.rosterPeriodId && row.workDate.getTime() === where.workDate.getTime();
  };
  const prisma = {
    shiftRosterPeriod: { findFirst: async () => roster },
    employee: { findFirst: async () => ({ id: 'employee-1', branchId: 'branch-1', departmentId: 'department-1' }) },
    shift: { findFirst: async () => ({ id: 'shift-1' }) },
    auditLog: { create: async () => ({ id: 'audit-1' }) },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    shiftRosterDay: {
      findFirst: async (args: any) => {
        const where = args.where ?? {};
        return rows.find((row) => {
          if (where.id && row.id !== where.id) return false;
          if (where.deletedAt === null && row.deletedAt !== null) return false;
          if (where.companyId && row.companyId !== where.companyId) return false;
          if (where.rosterPeriodId && row.rosterPeriodId !== where.rosterPeriodId) return false;
          if (where.employeeId && row.employeeId !== where.employeeId) return false;
          if (where.workDate && row.workDate.getTime() !== where.workDate.getTime()) return false;
          return true;
        }) ?? null;
      },
      findUnique: async (args: any) => rows.find((row) => matchesKey(row, args.where)) ?? null,
      findMany: async (args: any) => rows.filter((row) => {
        const where = args.where ?? {};
        if (where.deletedAt === null && row.deletedAt !== null) return false;
        if (where.companyId && row.companyId !== where.companyId) return false;
        if (where.rosterPeriodId && row.rosterPeriodId !== where.rosterPeriodId) return false;
        if (where.employeeId && row.employeeId !== where.employeeId) return false;
        if (where.workDate?.gte && row.workDate < where.workDate.gte) return false;
        if (where.workDate?.lte && row.workDate > where.workDate.lte) return false;
        return true;
      }).map(withRelations),
      count: async (args: any) => rows.filter((row) => {
        const where = args.where ?? {};
        return row.companyId === where.companyId && row.rosterPeriodId === where.rosterPeriodId && (where.deletedAt !== null || row.deletedAt === null);
      }).length,
      update: async (args: any) => {
        const index = rows.findIndex((row) => row.id === args.where.id);
        assert.notEqual(index, -1);
        rows[index] = { ...rows[index], ...args.data, updatedAt: new Date('2026-08-02T00:00:00.000Z') };
        return withRelations(rows[index]);
      },
      create: async (args: any) => {
        const row = { id: `day-${rows.length + 1}`, createdAt: new Date('2026-08-01T00:00:00.000Z'), updatedAt: new Date('2026-08-01T00:00:00.000Z'), deletedAt: null, ...args.data };
        rows.push(row);
        return withRelations(row);
      },
    },
  };
  return { rows, service: serviceWith(prisma) };
}

describe('ShiftRostersService roster day soft-delete restore', () => {
  it('restores a soft-deleted single roster day and makes it visible in list queries', async () => {
    const deletedAt = new Date('2026-08-10T00:00:00.000Z');
    const { rows, service } = shiftRosterDayStore([{ ...rosterDay, deletedAt, source: 'TEMPLATE', shiftName: 'Old Template Shift' }]);

    const restored = await service.upsertDay('roster-1', { employeeId: 'employee-1', workDate: '2026-08-06', dayType: RosterDayType.WORKING, shiftId: 'shift-1', notes: 'Restored manually' }, actor as never);
    const list = await service.days('roster-1', { page: 1, limit: 20, dateFrom: '2026-08-06', dateTo: '2026-08-06' }, actor as never);

    assert.equal(restored.deletedAt, null);
    assert.equal(restored.shiftId, 'shift-1');
    assert.equal(restored.shift?.code, 'GENERAL');
    assert.equal(rows[0].deletedAt, null);
    assert.equal(rows[0].source, 'MANUAL');
    assert.equal(rows[0].shiftName, null);
    assert.equal(rows.length, 1);
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].id, 'day-1');
  });

  it('restores a cleared working day as weekly off without stale shift fields', async () => {
    const { rows, service } = shiftRosterDayStore([{ ...rosterDay, deletedAt: new Date('2026-08-10T00:00:00.000Z'), shiftName: 'General Shift', shiftCode: 'GENERAL', shiftStartTime: '09:00', shiftEndTime: '18:00', shiftTimezone: 'Asia/Kolkata' }]);

    const restored = await service.upsertDay('roster-1', { employeeId: 'employee-1', workDate: '2026-08-06', dayType: RosterDayType.WEEKLY_OFF, notes: 'Weekly off' }, actor as never);

    assert.equal(restored.deletedAt, null);
    assert.equal(restored.dayType, RosterDayType.WEEKLY_OFF);
    assert.equal(restored.shiftId, null);
    assert.equal(restored.shift, null);
    assert.equal(rows[0].shiftName, null);
    assert.equal(rows[0].shiftCode, null);
    assert.equal(rows[0].scheduledStartAt, null);
    assert.equal(rows[0].scheduledEndAt, null);
  });

  it('restores soft-deleted rows through bulk upsert without creating duplicates', async () => {
    const { rows, service } = shiftRosterDayStore([{ ...rosterDay, deletedAt: new Date('2026-08-10T00:00:00.000Z') }]);

    const result = await service.bulkUpsertDays('roster-1', { days: [{ employeeId: 'employee-1', workDate: '2026-08-06', dayType: RosterDayType.WORKING, shiftId: 'shift-1' }] }, actor as never);

    assert.equal(result.count, 1);
    assert.equal(result.data[0].deletedAt, null);
    assert.equal(rows.length, 1);
    assert.equal(rows.filter((row) => row.deletedAt === null && row.employeeId === 'employee-1' && row.workDate.toISOString().slice(0, 10) === '2026-08-06').length, 1);
  });

  it('keeps normal active upsert behavior as one active employee-date row', async () => {
    const { rows, service } = shiftRosterDayStore([{ ...rosterDay, deletedAt: null, notes: 'Original' }]);

    const result = await service.upsertDay('roster-1', { employeeId: 'employee-1', workDate: '2026-08-06', dayType: RosterDayType.WORKING, shiftId: 'shift-1', notes: 'Updated' }, actor as never);

    assert.equal(result.deletedAt, null);
    assert.equal(result.notes, 'Updated');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].deletedAt, null);
  });
});

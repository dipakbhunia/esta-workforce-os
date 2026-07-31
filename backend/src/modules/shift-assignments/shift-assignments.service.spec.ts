import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AssignmentSource, RoleName, ShiftAssignmentType } from '@prisma/client';
import { ShiftAssignmentQueryDto } from './dto/shift-assignment-query.dto';
import { ShiftAssignmentsService } from './shift-assignments.service';

const actor = {
  id: 'user-1',
  companyId: 'company-1',
  email: 'hr@example.com',
  firstName: 'HR',
  lastName: 'User',
  status: 'ACTIVE',
  roles: [RoleName.HR],
} as const;

const assignment = {
  id: 'assignment-1',
  companyId: 'company-1',
  employeeId: 'employee-1',
  shiftId: 'shift-1',
  effectiveFrom: new Date('2026-07-30T00:00:00.000Z'),
  effectiveTo: null,
  status: 'ACTIVE',
  assignmentType: ShiftAssignmentType.PERMANENT,
  source: AssignmentSource.SHIFT_ASSIGNMENT,
  reason: 'Default shift',
  notes: null,
  createdById: 'user-1',
  updatedById: 'user-1',
  createdAt: new Date('2026-07-30T00:00:00.000Z'),
  updatedAt: new Date('2026-07-30T00:00:00.000Z'),
  deletedAt: null,
  employee: {
    id: 'employee-1',
    employeeCode: 'EMP-001',
    branchId: null,
    departmentId: null,
    designationId: null,
    department: { id: 'department-1', name: 'Engineering' },
    designation: { id: 'designation-1', name: 'Software Engineer' },
    user: {
      id: 'user-2',
      firstName: 'Demo',
      lastName: 'Employee',
      email: 'employee@example.com',
    },
  },
  shift: {
    id: 'shift-1',
    name: 'General Shift',
    code: 'GENERAL',
    startTime: '09:00',
    endTime: '18:00',
    timezone: 'Asia/Kolkata',
  },
  createdBy: {
    id: 'user-1',
    firstName: 'HR',
    lastName: 'User',
    email: 'hr@example.com',
  },
  updatedBy: {
    id: 'user-1',
    firstName: 'HR',
    lastName: 'User',
    email: 'hr@example.com',
  },
};

function serviceWith(prisma: Record<string, unknown>) {
  return new ShiftAssignmentsService(prisma as never);
}

describe('ShiftAssignmentsService', () => {
  it('applies assignmentType server-side and uses filtered pagination total', async () => {
    let findWhere: unknown;
    let countWhere: unknown;
    const service = serviceWith({
      employeeShiftAssignment: {
        findMany: async (args: { where: unknown }) => {
          findWhere = args.where;
          return [assignment];
        },
        count: async (args: { where: unknown }) => {
          countWhere = args.where;
          return 1;
        },
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    const result = await service.findAll(
      { page: 1, limit: 20, assignmentType: ShiftAssignmentType.PERMANENT },
      actor as never,
    );

    assert.equal(result.meta.total, 1);
    assert.deepEqual(findWhere, countWhere);
    assert.equal((findWhere as { assignmentType: ShiftAssignmentType }).assignmentType, ShiftAssignmentType.PERMANENT);
  });

  it('applies department and designation filters through employee relation', async () => {
    let where: unknown;
    const service = serviceWith({
      employeeShiftAssignment: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [];
        },
        count: async () => 0,
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    await service.findAll(
      { page: 1, limit: 20, departmentId: 'department-1', designationId: 'designation-1' },
      actor as never,
    );

    assert.equal((where as { employee: { departmentId?: string; designationId?: string } }).employee.departmentId, 'department-1');
    assert.equal((where as { employee: { departmentId?: string; designationId?: string } }).employee.designationId, 'designation-1');
  });

  it('uses effective-date filtering as assignment covering the selected timestamp', async () => {
    let where: unknown;
    const effectiveAt = '2026-07-30T10:00:00.000Z';
    const service = serviceWith({
      employeeShiftAssignment: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [];
        },
        count: async () => 0,
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    await service.findAll({ page: 1, limit: 20, effectiveAt }, actor as never);

    assert.deepEqual(where, {
      companyId: 'company-1',
      deletedAt: null,
      effectiveFrom: { lte: new Date(effectiveAt) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date(effectiveAt) } }],
    });
  });

  it('returns enriched employee department and designation fields in list responses', async () => {
    const service = serviceWith({
      employeeShiftAssignment: {
        findMany: async () => [assignment],
        count: async () => 1,
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    const result = await service.findAll({ page: 1, limit: 20 }, actor as never);

    assert.equal(result.data[0].employee.displayName, 'Demo Employee');
    assert.equal(result.data[0].employee.department?.name, 'Engineering');
    assert.equal(result.data[0].employee.designation?.name, 'Software Engineer');
  });

  it('keeps tenant isolation by requiring a tenant company for list access', async () => {
    const service = serviceWith({});

    await assert.rejects(
      () =>
        service.findAll(
          { page: 1, limit: 20 },
          { ...actor, companyId: null } as never,
        ),
      ForbiddenException,
    );
  });

  it('rejects invalid assignmentType query values through DTO validation', async () => {
    const dto = Object.assign(new ShiftAssignmentQueryDto(), {
      assignmentType: 'NIGHT_ONLY',
    });

    const errors = await validate(dto);

    assert.equal(errors.some((error) => error.property === 'assignmentType'), true);
  });

  it('rejects overlapping assignments before creating records', async () => {
    const service = serviceWith({
      employee: { findFirst: async () => ({ id: 'employee-1' }) },
      shift: { findFirst: async () => ({ id: 'shift-1' }) },
      employeeShiftAssignment: {
        findFirst: async () => ({ id: 'existing-assignment' }),
      },
    });

    await assert.rejects(
      () =>
        service.create(
          {
            employeeId: 'employee-1',
            shiftId: 'shift-1',
            effectiveFrom: '2026-07-30T00:00:00.000Z',
            assignmentType: ShiftAssignmentType.PERMANENT,
          },
          actor as never,
        ),
      ConflictException,
    );
  });

  it('allows adjacent ranges by using exclusive effectiveTo semantics', async () => {
    let overlapWhere: unknown;
    const tx = {
      employeeShiftAssignment: { create: async () => assignment },
      employee: { update: async () => ({ userId: 'user-2' }) },
      user: { updateMany: async () => ({ count: 1 }) },
      auditLog: { create: async () => ({ id: 'audit-1' }) },
    };
    const service = serviceWith({
      employee: { findFirst: async () => ({ id: 'employee-1' }) },
      shift: { findFirst: async () => ({ id: 'shift-1' }) },
      employeeShiftAssignment: {
        findFirst: async (args: { where: unknown }) => {
          overlapWhere = args.where;
          return null;
        },
      },
      $transaction: async (callback: (tx: typeof tx) => unknown) => callback(tx),
    });

    await service.create(
      {
        employeeId: 'employee-1',
        shiftId: 'shift-1',
        effectiveFrom: '2026-07-30T00:00:00.000Z',
        effectiveTo: '2026-07-31T00:00:00.000Z',
      },
      actor as never,
    );

    assert.deepEqual(overlapWhere, {
      companyId: 'company-1',
      employeeId: 'employee-1',
      deletedAt: null,
      status: { not: 'CANCELLED' },
      effectiveFrom: { lt: new Date('2026-07-31T00:00:00.000Z') },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date('2026-07-30T00:00:00.000Z') } }],
    });
  });

  it('does not synchronize legacy shift fields for future assignments', async () => {
    let syncCalled = false;
    const futureAssignment = {
      ...assignment,
      effectiveFrom: new Date('2999-07-30T00:00:00.000Z'),
    };
    const tx = {
      employeeShiftAssignment: { create: async () => futureAssignment },
      employee: {
        update: async () => {
          syncCalled = true;
          return { userId: 'user-2' };
        },
      },
      user: { updateMany: async () => ({ count: 1 }) },
      auditLog: { create: async () => ({ id: 'audit-1' }) },
    };
    const service = serviceWith({
      employee: { findFirst: async () => ({ id: 'employee-1' }) },
      shift: { findFirst: async () => ({ id: 'shift-1' }) },
      employeeShiftAssignment: { findFirst: async () => null },
      $transaction: async (callback: (tx: typeof tx) => unknown) => callback(tx),
    });

    await service.create(
      {
        employeeId: 'employee-1',
        shiftId: 'shift-1',
        effectiveFrom: '2999-07-30T00:00:00.000Z',
      },
      actor as never,
    );

    assert.equal(syncCalled, false);
  });

  it('synchronizes Employee.shiftId and User.shiftId for current assignments', async () => {
    let employeeShiftId: string | null = null;
    let userShiftId: string | null = null;
    const tx = {
      employeeShiftAssignment: { create: async () => assignment },
      employee: {
        update: async (args: { data: { shiftId: string } }) => {
          employeeShiftId = args.data.shiftId;
          return { userId: 'user-2' };
        },
      },
      user: {
        updateMany: async (args: { data: { shiftId: string } }) => {
          userShiftId = args.data.shiftId;
          return { count: 1 };
        },
      },
      auditLog: { create: async () => ({ id: 'audit-1' }) },
    };
    const service = serviceWith({
      employee: { findFirst: async () => ({ id: 'employee-1' }) },
      shift: { findFirst: async () => ({ id: 'shift-1' }) },
      employeeShiftAssignment: { findFirst: async () => null },
      $transaction: async (callback: (tx: typeof tx) => unknown) => callback(tx),
    });

    await service.create(
      {
        employeeId: 'employee-1',
        shiftId: 'shift-1',
        effectiveFrom: '2026-07-30T00:00:00.000Z',
      },
      actor as never,
    );

    assert.equal(employeeShiftId, 'shift-1');
    assert.equal(userShiftId, 'shift-1');
  });
});

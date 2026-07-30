import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import { AssignmentSource, RoleName, ShiftAssignmentType } from '@prisma/client';
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

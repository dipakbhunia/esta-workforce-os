import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import {
  AssignmentSource,
  ShiftAssignmentStatus,
  ShiftAssignmentType,
} from '@prisma/client';
import { ShiftResolutionService } from './shift-resolution.service';

const shift = {
  id: 'shift-1',
  name: 'General Shift',
  code: 'GENERAL',
  startTime: '09:00',
  endTime: '18:00',
  timezone: 'Asia/Kolkata',
};

function serviceWith(prisma: Record<string, unknown>) {
  return new ShiftResolutionService(prisma as never);
}

describe('ShiftResolutionService', () => {
  it('resolves an active effective assignment before employee fallback', async () => {
    const service = serviceWith({
      employeeShiftAssignment: {
        findMany: async () => [
          {
            id: 'assignment-1',
            assignmentType: ShiftAssignmentType.PERMANENT,
            source: AssignmentSource.SHIFT_ASSIGNMENT,
            effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
            effectiveTo: null,
            shift,
          },
        ],
      },
      employee: { findFirst: async () => ({ shift: null }) },
    });

    const result = await service.resolveForTimestamp({
      companyId: 'company-1',
      employeeId: 'employee-1',
      timestamp: new Date('2026-07-30T10:00:00.000Z'),
    });

    assert.equal(result?.resolutionSource, 'ASSIGNMENT');
    assert.equal(result?.assignmentId, 'assignment-1');
    assert.equal(result?.shift.id, 'shift-1');
  });

  it('uses inclusive effectiveFrom and exclusive effectiveTo predicates', async () => {
    let where: unknown;
    const service = serviceWith({
      employeeShiftAssignment: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [];
        },
      },
      employee: { findFirst: async () => ({ shift: null }) },
    });
    const timestamp = new Date('2026-07-30T10:00:00.000Z');

    await service.resolveForTimestamp({
      companyId: 'company-1',
      employeeId: 'employee-1',
      timestamp,
    });

    assert.deepEqual(where, {
      companyId: 'company-1',
      employeeId: 'employee-1',
      deletedAt: null,
      status: { not: ShiftAssignmentStatus.CANCELLED },
      effectiveFrom: { lte: timestamp },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: timestamp } }],
    });
  });

  it('falls back to Employee.shiftId when no assignment covers the timestamp', async () => {
    const service = serviceWith({
      employeeShiftAssignment: { findMany: async () => [] },
      employee: { findFirst: async () => ({ shift }) },
    });

    const result = await service.resolveForTimestamp({
      companyId: 'company-1',
      employeeId: 'employee-1',
      timestamp: new Date('2026-07-30T10:00:00.000Z'),
    });

    assert.equal(result?.resolutionSource, 'EMPLOYEE_FALLBACK');
    assert.equal(result?.assignmentId, null);
    assert.equal(result?.source, AssignmentSource.EMPLOYEE_PROFILE);
  });

  it('returns null when neither assignment nor fallback shift exists', async () => {
    const service = serviceWith({
      employeeShiftAssignment: { findMany: async () => [] },
      employee: { findFirst: async () => ({ shift: null }) },
    });

    const result = await service.resolveForTimestamp({
      companyId: 'company-1',
      employeeId: 'employee-1',
      timestamp: new Date('2026-07-30T10:00:00.000Z'),
    });

    assert.equal(result, null);
  });

  it('fails clearly when multiple assignments cover the same timestamp', async () => {
    const service = serviceWith({
      employeeShiftAssignment: {
        findMany: async () => [
          {
            id: 'assignment-1',
            assignmentType: ShiftAssignmentType.PERMANENT,
            source: AssignmentSource.SHIFT_ASSIGNMENT,
            effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
            effectiveTo: null,
            shift,
          },
          {
            id: 'assignment-2',
            assignmentType: ShiftAssignmentType.TEMPORARY,
            source: AssignmentSource.SHIFT_ASSIGNMENT,
            effectiveFrom: new Date('2026-07-15T00:00:00.000Z'),
            effectiveTo: null,
            shift,
          },
        ],
      },
      employee: { findFirst: async () => ({ shift: null }) },
    });

    await assert.rejects(
      () =>
        service.resolveForTimestamp({
          companyId: 'company-1',
          employeeId: 'employee-1',
          timestamp: new Date('2026-07-30T10:00:00.000Z'),
        }),
      ConflictException,
    );
  });

  it('resolves work-date through the supplied timezone without fixed offsets', async () => {
    let timestamp: Date | null = null;
    const service = serviceWith({
      employeeShiftAssignment: {
        findMany: async (args: { where: { effectiveFrom: { lte: Date } } }) => {
          timestamp = args.where.effectiveFrom.lte;
          return [];
        },
      },
      employee: { findFirst: async () => ({ shift }) },
    });

    await service.resolveForWorkDate({
      companyId: 'company-1',
      employeeId: 'employee-1',
      workDate: '2026-07-30',
      timezone: 'Asia/Kolkata',
    });

    assert.equal(timestamp?.toISOString(), '2026-07-29T18:30:00.000Z');
  });
});

import { ConflictException, Injectable } from '@nestjs/common';
import {
  AssignmentSource,
  Prisma,
  ShiftAssignmentStatus,
  ShiftAssignmentType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { zonedDateTimeToUtc } from '../attendance/attendance-time.util';

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

export type ShiftResolutionSource = 'ASSIGNMENT' | 'EMPLOYEE_FALLBACK';

export interface EffectiveShiftResolution {
  resolutionSource: ShiftResolutionSource;
  assignmentId: string | null;
  assignmentType: ShiftAssignmentType | null;
  source: AssignmentSource | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  shift: Prisma.ShiftGetPayload<{ select: typeof shiftSelect }>;
}

@Injectable()
export class ShiftResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForTimestamp(input: {
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

  async resolveForWorkDate(input: {
    companyId: string;
    employeeId: string;
    workDate: string;
    timezone: string;
  }): Promise<EffectiveShiftResolution | null> {
    const timestamp = zonedDateTimeToUtc(input.workDate, '00:00', input.timezone);
    return this.resolveForTimestamp({
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
}

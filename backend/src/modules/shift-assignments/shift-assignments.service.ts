import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentSource,
  Prisma,
  ShiftAssignmentStatus,
  ShiftAssignmentType,
} from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { requireTenantId } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateShiftAssignmentDto } from './dto/create-shift-assignment.dto';
import { ShiftAssignmentQueryDto } from './dto/shift-assignment-query.dto';
import { ShiftAssignmentResponseDto } from './dto/shift-assignment-response.dto';
import { UpdateShiftAssignmentDto } from './dto/update-shift-assignment.dto';

const assignmentInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      branchId: true,
      departmentId: true,
      designationId: true,
      department: {
        select: { id: true, name: true },
      },
      designation: {
        select: { id: true, name: true },
      },
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
  shift: {
    select: {
      id: true,
      name: true,
      code: true,
      startTime: true,
      endTime: true,
      timezone: true,
    },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  updatedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.EmployeeShiftAssignmentInclude;

type AssignmentWithDetails = Prisma.EmployeeShiftAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

@Injectable()
export class ShiftAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ShiftAssignmentQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.assignmentWhere(query, companyId);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeShiftAssignment.findMany({
        where,
        include: assignmentInclude,
        ...paginationArgs(query),
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.employeeShiftAssignment.count({ where }),
    ]);

    return paginatedResult(data.map((item) => this.toResponse(item)), total, query);
  }

  async create(dto: CreateShiftAssignmentDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const range = this.parseRange(dto.effectiveFrom, dto.effectiveTo);
    await this.assertEmployeeAndShift(companyId, dto.employeeId, dto.shiftId);
    await this.assertNoOverlap({
      companyId,
      employeeId: dto.employeeId,
      effectiveFrom: range.effectiveFrom,
      effectiveTo: range.effectiveTo,
    });

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeShiftAssignment.create({
        data: {
          companyId,
          employeeId: dto.employeeId,
          shiftId: dto.shiftId,
          effectiveFrom: range.effectiveFrom,
          effectiveTo: range.effectiveTo,
          status: this.statusForRange(range.effectiveFrom, range.effectiveTo),
          assignmentType: dto.assignmentType ?? ShiftAssignmentType.PERMANENT,
          source: dto.source ?? AssignmentSource.SHIFT_ASSIGNMENT,
          reason: this.trimOptional(dto.reason),
          notes: this.trimOptional(dto.notes),
          createdById: actor.id,
          updatedById: actor.id,
        },
        include: assignmentInclude,
      });

      if (this.coversTimestamp(created, new Date())) {
        await this.syncLegacyShift(tx, companyId, dto.employeeId, dto.shiftId);
      }

      await this.audit(tx, {
        companyId,
        actorUserId: actor.id,
        action: 'SHIFT_ASSIGNMENT_CREATED',
        assignment: created,
        metadata: {
          employeeId: created.employeeId,
          shiftId: created.shiftId,
          effectiveFrom: created.effectiveFrom.toISOString(),
          effectiveTo: created.effectiveTo?.toISOString() ?? null,
          reason: created.reason,
        },
      });

      return created;
    });

    return this.toResponse(assignment);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const assignment = await this.findTenantAssignment(id, companyId);
    return this.toResponse(assignment);
  }

  async update(id: string, dto: UpdateShiftAssignmentDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.findTenantAssignment(id, companyId);
    const employeeId = dto.employeeId ?? current.employeeId;
    const shiftId = dto.shiftId ?? current.shiftId;
    const range = this.parseRange(
      dto.effectiveFrom ?? current.effectiveFrom.toISOString(),
      dto.effectiveTo ?? current.effectiveTo?.toISOString(),
    );

    await this.assertEmployeeAndShift(companyId, employeeId, shiftId);
    await this.assertNoOverlap({
      companyId,
      employeeId,
      effectiveFrom: range.effectiveFrom,
      effectiveTo: range.effectiveTo,
      excludeId: id,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.employeeShiftAssignment.update({
        where: { id },
        data: {
          employeeId,
          shiftId,
          effectiveFrom: range.effectiveFrom,
          effectiveTo: range.effectiveTo,
          status: this.statusForRange(range.effectiveFrom, range.effectiveTo),
          ...(dto.assignmentType !== undefined ? { assignmentType: dto.assignmentType } : {}),
          ...(dto.source !== undefined ? { source: dto.source } : {}),
          ...(dto.reason !== undefined ? { reason: this.trimOptional(dto.reason) } : {}),
          ...(dto.notes !== undefined ? { notes: this.trimOptional(dto.notes) } : {}),
          updatedById: actor.id,
        },
        include: assignmentInclude,
      });

      if (this.coversTimestamp(result, new Date())) {
        await this.syncLegacyShift(tx, companyId, result.employeeId, result.shiftId);
      }

      await this.audit(tx, {
        companyId,
        actorUserId: actor.id,
        action: 'SHIFT_ASSIGNMENT_UPDATED',
        assignment: result,
        metadata: {
          oldShiftId: current.shiftId,
          newShiftId: result.shiftId,
          oldEffectiveFrom: current.effectiveFrom.toISOString(),
          newEffectiveFrom: result.effectiveFrom.toISOString(),
          oldEffectiveTo: current.effectiveTo?.toISOString() ?? null,
          newEffectiveTo: result.effectiveTo?.toISOString() ?? null,
          reason: result.reason,
        },
      });

      return result;
    });

    return this.toResponse(updated);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.findTenantAssignment(id, companyId);
    const removed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.employeeShiftAssignment.update({
        where: { id },
        data: {
          status: ShiftAssignmentStatus.CANCELLED,
          deletedAt: new Date(),
          updatedById: actor.id,
        },
        include: assignmentInclude,
      });

      await this.audit(tx, {
        companyId,
        actorUserId: actor.id,
        action: 'SHIFT_ASSIGNMENT_CANCELLED',
        assignment: result,
        metadata: {
          employeeId: current.employeeId,
          shiftId: current.shiftId,
          effectiveFrom: current.effectiveFrom.toISOString(),
          effectiveTo: current.effectiveTo?.toISOString() ?? null,
        },
      });

      return result;
    });
    return this.toResponse(removed);
  }

  async currentForEmployee(employeeId: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    await this.assertEmployee(companyId, employeeId);
    const now = new Date();
    const assignment = await this.findCoveringAssignments(companyId, employeeId, now);
    if (assignment.length > 1) {
      throw new ConflictException('Conflicting shift assignments exist for this employee');
    }
    return assignment[0] ? this.toResponse(assignment[0]) : null;
  }

  async futureForEmployee(
    employeeId: string,
    query: PaginationQueryDto,
    actor: AuthenticatedUser,
  ) {
    const companyId = requireTenantId(actor);
    await this.assertEmployee(companyId, employeeId);
    const where: Prisma.EmployeeShiftAssignmentWhereInput = {
      companyId,
      employeeId,
      deletedAt: null,
      status: { not: ShiftAssignmentStatus.CANCELLED },
      effectiveFrom: { gt: new Date() },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeShiftAssignment.findMany({
        where,
        include: assignmentInclude,
        ...paginationArgs(query),
        orderBy: [{ effectiveFrom: 'asc' }],
      }),
      this.prisma.employeeShiftAssignment.count({ where }),
    ]);
    return paginatedResult(data.map((item) => this.toResponse(item)), total, query);
  }

  async historyForEmployee(
    employeeId: string,
    query: PaginationQueryDto,
    actor: AuthenticatedUser,
  ) {
    const companyId = requireTenantId(actor);
    await this.assertEmployee(companyId, employeeId);
    const where: Prisma.EmployeeShiftAssignmentWhereInput = {
      companyId,
      employeeId,
      deletedAt: null,
      effectiveFrom: { lte: new Date() },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeShiftAssignment.findMany({
        where,
        include: assignmentInclude,
        ...paginationArgs(query),
        orderBy: [{ effectiveFrom: 'desc' }],
      }),
      this.prisma.employeeShiftAssignment.count({ where }),
    ]);
    return paginatedResult(data.map((item) => this.toResponse(item)), total, query);
  }

  private assignmentWhere(
    query: ShiftAssignmentQueryDto,
    companyId: string,
  ): Prisma.EmployeeShiftAssignmentWhereInput {
    const now = new Date();
    const effectiveAt = query.effectiveAt ? this.parseDate(query.effectiveAt) : null;
    const employeeFilter: Prisma.EmployeeWhereInput = {
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.designationId ? { designationId: query.designationId } : {}),
    };
    return {
      companyId,
      ...(query.includeDeleted || query.status === ShiftAssignmentStatus.CANCELLED ? {} : { deletedAt: null }),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
      ...(Object.keys(employeeFilter).length ? { employee: employeeFilter } : {}),
      ...(query.status ? this.statusWhere(query.status, now) : {}),
      ...(query.assignmentType ? { assignmentType: query.assignmentType } : {}),
      ...(effectiveAt ? this.coveringWhere(effectiveAt) : {}),
      ...(query.search
        ? {
            OR: [
              { employee: { employeeCode: { contains: query.search, mode: 'insensitive' } } },
              { employee: { user: { firstName: { contains: query.search, mode: 'insensitive' } } } },
              { employee: { user: { lastName: { contains: query.search, mode: 'insensitive' } } } },
              { employee: { user: { email: { contains: query.search, mode: 'insensitive' } } } },
              { shift: { name: { contains: query.search, mode: 'insensitive' } } },
              { shift: { code: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  private statusWhere(
    status: ShiftAssignmentStatus,
    now: Date,
  ): Prisma.EmployeeShiftAssignmentWhereInput {
    if (status === ShiftAssignmentStatus.CANCELLED) {
      return { status: ShiftAssignmentStatus.CANCELLED };
    }
    if (status === ShiftAssignmentStatus.SCHEDULED) {
      return {
        status: { not: ShiftAssignmentStatus.CANCELLED },
        effectiveFrom: { gt: now },
      };
    }
    if (status === ShiftAssignmentStatus.ENDED) {
      return {
        status: { not: ShiftAssignmentStatus.CANCELLED },
        effectiveTo: { not: null, lte: now },
      };
    }
    return {
      status: { not: ShiftAssignmentStatus.CANCELLED },
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    };
  }

  private coveringWhere(timestamp: Date): Prisma.EmployeeShiftAssignmentWhereInput {
    return {
      effectiveFrom: { lte: timestamp },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: timestamp } }],
    };
  }

  private async findTenantAssignment(id: string, companyId: string) {
    const assignment = await this.prisma.employeeShiftAssignment.findFirst({
      where: { id, companyId },
      include: assignmentInclude,
    });
    if (!assignment) throw new NotFoundException('Shift assignment not found');
    return assignment;
  }

  private async assertEmployeeAndShift(
    companyId: string,
    employeeId: string,
    shiftId: string,
  ) {
    const [employee, shift] = await Promise.all([
      this.assertEmployee(companyId, employeeId),
      this.prisma.shift.findFirst({
        where: { id: shiftId, companyId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!employee || !shift) {
      throw new NotFoundException('Employee or shift was not found in this tenant');
    }
  }

  private async assertEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found in this tenant');
    return employee;
  }

  private async assertNoOverlap(input: {
    companyId: string;
    employeeId: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    excludeId?: string;
  }) {
    const overlap = await this.prisma.employeeShiftAssignment.findFirst({
      where: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        deletedAt: null,
        status: { not: ShiftAssignmentStatus.CANCELLED },
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        ...(input.effectiveTo ? { effectiveFrom: { lt: input.effectiveTo } } : {}),
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }],
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException('Shift assignment overlaps an existing assignment');
    }
  }

  private async findCoveringAssignments(
    companyId: string,
    employeeId: string,
    timestamp: Date,
  ) {
    return this.prisma.employeeShiftAssignment.findMany({
      where: {
        companyId,
        employeeId,
        deletedAt: null,
        status: { not: ShiftAssignmentStatus.CANCELLED },
        ...this.coveringWhere(timestamp),
      },
      include: assignmentInclude,
      orderBy: [{ effectiveFrom: 'desc' }],
    });
  }

  private parseRange(effectiveFromRaw: string, effectiveToRaw?: string | null) {
    const effectiveFrom = this.parseDate(effectiveFromRaw);
    const effectiveTo = effectiveToRaw ? this.parseDate(effectiveToRaw) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }
    return { effectiveFrom, effectiveTo };
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid effective date');
    }
    return date;
  }

  private statusForRange(
    effectiveFrom: Date,
    effectiveTo: Date | null,
  ): ShiftAssignmentStatus {
    const now = new Date();
    if (effectiveTo && effectiveTo <= now) return ShiftAssignmentStatus.ENDED;
    if (effectiveFrom > now) return ShiftAssignmentStatus.SCHEDULED;
    return ShiftAssignmentStatus.ACTIVE;
  }

  private coversTimestamp(
    assignment: Pick<AssignmentWithDetails, 'effectiveFrom' | 'effectiveTo' | 'status' | 'deletedAt'>,
    timestamp: Date,
  ) {
    return (
      !assignment.deletedAt &&
      assignment.status !== ShiftAssignmentStatus.CANCELLED &&
      assignment.effectiveFrom <= timestamp &&
      (!assignment.effectiveTo || assignment.effectiveTo > timestamp)
    );
  }

  private async syncLegacyShift(
    tx: Prisma.TransactionClient,
    companyId: string,
    employeeId: string,
    shiftId: string,
  ) {
    const employee = await tx.employee.update({
      where: { id: employeeId },
      data: { shiftId },
      select: { userId: true },
    });
    await tx.user.updateMany({
      where: { id: employee.userId, companyId },
      data: { shiftId },
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      actorUserId: string;
      action: string;
      assignment: Pick<AssignmentWithDetails, 'id'>;
      metadata: Record<string, unknown>;
    },
  ) {
    await tx.auditLog.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: 'EmployeeShiftAssignment',
        entityId: input.assignment.id,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  private toResponse(assignment: AssignmentWithDetails): ShiftAssignmentResponseDto {
    return {
      ...assignment,
      employee: {
        id: assignment.employee.id,
        employeeCode: assignment.employee.employeeCode,
        displayName: this.displayName(assignment.employee.user),
        user: assignment.employee.user,
        department: assignment.employee.department,
        designation: assignment.employee.designation,
      },
      status: assignment.deletedAt
        ? ShiftAssignmentStatus.CANCELLED
        : this.statusForRange(assignment.effectiveFrom, assignment.effectiveTo),
    };
  }

  private trimOptional(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private displayName(user: { firstName: string; lastName: string; email: string }): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  }
}

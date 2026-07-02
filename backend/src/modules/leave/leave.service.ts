import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeStatus,
  LeaveApprovalAction,
  LeaveRequestStatus,
  Prisma,
  RoleName,
} from '@prisma/client';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { LeaveRequestResponseDto } from './dto/leave-response.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

const requestInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      reportingManagerId: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
  leaveType: true,
  approver: {
    select: {
      id: true,
      employeeCode: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
} satisfies Prisma.LeaveRequestInclude;

const balanceInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      reportingManagerId: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
  leaveType: true,
} satisfies Prisma.LeaveBalanceInclude;

const historyInclude = {
  actor: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.LeaveApprovalHistoryInclude;

type LeaveRecord = Prisma.LeaveRequestGetPayload<{
  include: typeof requestInclude;
}>;

type LeaveBalanceRecord = Prisma.LeaveBalanceGetPayload<{
  include: typeof balanceInclude;
}>;

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async createType(dto: CreateLeaveTypeDto, actor: AuthenticatedUser) {
    const companyId = this.manageTenant(actor);
    try {
      return await this.prisma.leaveType.create({
        data: {
          companyId,
          name: dto.name.trim(),
          code: dto.code,
          description: dto.description?.trim(),
          defaultDays: dto.defaultDays,
          requiresApproval: dto.requiresApproval,
          managerCanApprove: dto.managerCanApprove,
        },
      });
    } catch (error) {
      this.throwTypeConflict(error);
    }
  }

  async listTypes(query: PaginationQueryDto, actor: AuthenticatedUser) {
    const companyId = this.tenantForAnyRole(actor);
    const where: Prisma.LeaveTypeWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveType.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { name: 'asc' },
      }),
      this.prisma.leaveType.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async updateType(
    id: string,
    dto: UpdateLeaveTypeDto,
    actor: AuthenticatedUser,
  ) {
    const companyId = this.manageTenant(actor);
    await this.typeInTenant(id, companyId);
    try {
      return await this.prisma.leaveType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined ? { code: dto.code } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          ...(dto.defaultDays !== undefined
            ? { defaultDays: dto.defaultDays }
            : {}),
          ...(dto.requiresApproval !== undefined
            ? { requiresApproval: dto.requiresApproval }
            : {}),
          ...(dto.managerCanApprove !== undefined
            ? { managerCanApprove: dto.managerCanApprove }
            : {}),
        },
      });
    } catch (error) {
      this.throwTypeConflict(error);
    }
  }

  async removeType(id: string, actor: AuthenticatedUser) {
    const companyId = this.manageTenant(actor);
    await this.typeInTenant(id, companyId);
    const pending = await this.prisma.leaveRequest.count({
      where: { leaveTypeId: id, status: LeaveRequestStatus.PENDING },
    });
    if (pending) {
      throw new BadRequestException(
        'Leave type has pending requests and cannot be deleted',
      );
    }
    return this.prisma.leaveType.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async apply(dto: CreateLeaveRequestDto, actor: AuthenticatedUser) {
    const employee = await this.ownEmployee(actor);
    const leaveType = await this.typeInTenant(dto.leaveTypeId, employee.companyId);
    const startDate = this.dateOnly(dto.startDate);
    const endDate = this.dateOnly(dto.endDate);
    if (startDate > endDate) {
      throw new BadRequestException('startDate must not be after endDate');
    }
    const overlap = await this.prisma.leaveRequest.count({
      where: {
        employeeId: employee.id,
        deletedAt: null,
        status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) {
      throw new ConflictException('Leave dates overlap an existing request');
    }
    const totalDays =
      Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const status = leaveType.requiresApproval
      ? LeaveRequestStatus.PENDING
      : LeaveRequestStatus.APPROVED;

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.create({
        data: {
          companyId: employee.companyId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,
          totalDays,
          reason: dto.reason?.trim(),
          status,
        },
        include: requestInclude,
      });
      await tx.leaveApprovalHistory.create({
        data: {
          companyId: request.companyId,
          leaveRequestId: request.id,
          action: LeaveApprovalAction.SUBMITTED,
          actorUserId: actor.id,
          comment: dto.reason?.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: request.companyId,
          actorUserId: actor.id,
          action: 'LEAVE_SUBMITTED',
          entityType: 'LeaveRequest',
          entityId: request.id,
          metadata: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            startDate: request.startDate,
            endDate: request.endDate,
            totalDays: request.totalDays,
            status: request.status,
          },
        },
      });
      return this.toLeaveRequestResponse(request);
    });
  }

  async listRequests(query: LeaveRequestQueryDto, actor: AuthenticatedUser) {
    this.validateDateRange(query.dateFrom, query.dateTo);
    const visibility = await this.requestVisibility(actor);
    const where: Prisma.LeaveRequestWhereInput = {
      deletedAt: null,
      ...visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
      ...(query.dateFrom ? { endDate: { gte: this.dateOnly(query.dateFrom) } } : {}),
      ...(query.dateTo ? { startDate: { lte: this.dateOnly(query.dateTo) } } : {}),
      ...(query.search
        ? {
            OR: [
              { reason: { contains: query.search, mode: 'insensitive' } },
              {
                employee: {
                  employeeCode: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                employee: {
                  user: {
                    firstName: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
              {
                leaveType: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        include: requestInclude,
        ...paginationArgs(query),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return paginatedResult(
      data.map((request) => this.toLeaveRequestResponse(request)),
      total,
      query,
    );
  }

  async findRequest(id: string, actor: AuthenticatedUser) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException('Leave request not found');
    await this.assertRequestVisible(request, actor);
    return this.toLeaveRequestResponse(request);
  }

  async review(
    id: string,
    dto: UpdateLeaveStatusDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be reviewed');
    }
    const admin =
      actor.roles.includes(RoleName.COMPANY_ADMIN) ||
      actor.roles.includes(RoleName.HR);
    const approver = await this.prisma.employee.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true },
    });
    const managerAllowed =
      actor.roles.includes(RoleName.MANAGER) &&
      !!approver &&
      request.leaveType.managerCanApprove &&
      request.employee.reportingManagerId === approver.id;
    if (
      request.companyId !== actor.companyId ||
      (!admin && !managerAllowed)
    ) {
      throw new ForbiddenException('Leave approval is not permitted');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: dto.status,
          approverId: approver?.id,
          reviewedAt: new Date(),
          reviewComment: dto.comment?.trim(),
        },
        include: requestInclude,
      });
      if (dto.status === LeaveRequestStatus.APPROVED) {
        const year = request.startDate.getUTCFullYear();
        await tx.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year,
            },
          },
          create: {
            companyId: request.companyId,
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
            allocated: request.leaveType.defaultDays,
            used: request.totalDays,
          },
          update: { used: { increment: request.totalDays } },
        });
      }
      await tx.leaveApprovalHistory.create({
        data: {
          companyId: request.companyId,
          leaveRequestId: request.id,
          action:
            dto.status === LeaveRequestStatus.APPROVED
              ? LeaveApprovalAction.APPROVED
              : LeaveApprovalAction.REJECTED,
          actorUserId: actor.id,
          comment: dto.comment?.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: request.companyId,
          actorUserId: actor.id,
          action:
            dto.status === LeaveRequestStatus.APPROVED
              ? 'LEAVE_APPROVED'
              : 'LEAVE_REJECTED',
          entityType: 'LeaveRequest',
          entityId: request.id,
          metadata: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            comment: dto.comment?.trim(),
          },
        },
      });
      return this.toLeaveRequestResponse(updated);
    });
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException('Leave request not found');
    await this.assertRequestVisible(request, actor);
    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException(
        'Only pending leave requests can be cancelled',
      );
    }
    await this.assertCanCancel(request, actor);

    const actorEmployee = await this.prisma.employee.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveRequestStatus.CANCELLED,
          approverId: actorEmployee?.id,
          reviewedAt: new Date(),
          reviewComment: 'Cancelled',
        },
        include: requestInclude,
      });
      await tx.leaveApprovalHistory.create({
        data: {
          companyId: request.companyId,
          leaveRequestId: request.id,
          action: LeaveApprovalAction.CANCELLED,
          actorUserId: actor.id,
          comment: 'Cancelled',
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: request.companyId,
          actorUserId: actor.id,
          action: 'LEAVE_CANCELLED',
          entityType: 'LeaveRequest',
          entityId: request.id,
          metadata: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            previousStatus: request.status,
          },
        },
      });
      return this.toLeaveRequestResponse(updated);
    });
  }

  async listHistory(id: string, actor: AuthenticatedUser) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException('Leave request not found');
    await this.assertRequestVisible(request, actor);
    return this.prisma.leaveApprovalHistory.findMany({
      where: { leaveRequestId: id, companyId: request.companyId },
      include: historyInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async listBalances(query: LeaveBalanceQueryDto, actor: AuthenticatedUser) {
    const visibility = await this.employeeVisibility(actor);
    const where: Prisma.LeaveBalanceWhereInput = {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
      ...(query.year ? { year: query.year } : {}),
      employee: visibility,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveBalance.findMany({
        where,
        include: balanceInclude,
        ...paginationArgs(query),
        orderBy: [{ year: 'desc' }, { leaveType: { name: 'asc' } }],
      }),
      this.prisma.leaveBalance.count({ where }),
    ]);
    return paginatedResult(await this.withPendingBalances(data), total, query);
  }

  async listEmployeeBalances(
    employeeId: string,
    query: LeaveBalanceQueryDto,
    actor: AuthenticatedUser,
  ) {
    await this.findVisibleEmployee(employeeId, actor);
    return this.listBalances({ ...query, employeeId }, actor);
  }

  private manageTenant(actor: AuthenticatedUser): string {
    if (
      !actor.roles.includes(RoleName.COMPANY_ADMIN) &&
      !actor.roles.includes(RoleName.HR)
    ) {
      throw new ForbiddenException('Leave management is not permitted');
    }
    return this.tenantForAnyRole(actor);
  }

  private tenantForAnyRole(actor: AuthenticatedUser): string {
    if (!actor.companyId) throw new ForbiddenException('Tenant is required');
    return actor.companyId;
  }

  private async ownEmployee(actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actor.id,
        deletedAt: null,
        status: EmployeeStatus.ACTIVE,
      },
    });
    if (!employee) throw new NotFoundException('Active employee profile not found');
    return employee;
  }

  private async typeInTenant(id: string, companyId: string) {
    const type = await this.prisma.leaveType.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!type) throw new NotFoundException('Leave type not found');
    return type;
  }

  private async requestVisibility(
    actor: AuthenticatedUser,
  ): Promise<Prisma.LeaveRequestWhereInput> {
    if (
      actor.roles.includes(RoleName.COMPANY_ADMIN) ||
      actor.roles.includes(RoleName.HR)
    ) {
      return { companyId: this.tenantForAnyRole(actor) };
    }
    const own = await this.ownEmployee(actor);
    if (actor.roles.includes(RoleName.MANAGER)) {
      return {
        OR: [
          { employeeId: own.id },
          { employee: { reportingManagerId: own.id } },
        ],
      };
    }
    return { employeeId: own.id };
  }

  private async employeeVisibility(
    actor: AuthenticatedUser,
  ): Promise<Prisma.EmployeeWhereInput> {
    if (
      actor.roles.includes(RoleName.COMPANY_ADMIN) ||
      actor.roles.includes(RoleName.HR)
    ) {
      return {
        companyId: this.tenantForAnyRole(actor),
        deletedAt: null,
      };
    }
    const own = await this.ownEmployee(actor);
    if (actor.roles.includes(RoleName.MANAGER)) {
      return {
        deletedAt: null,
        OR: [{ id: own.id }, { reportingManagerId: own.id }],
      };
    }
    return { id: own.id, deletedAt: null };
  }

  private async findVisibleEmployee(
    employeeId: string,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        ...(await this.employeeVisibility(actor)),
      },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private async assertRequestVisible(
    request: LeaveRecord,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (
      (actor.roles.includes(RoleName.COMPANY_ADMIN) ||
        actor.roles.includes(RoleName.HR)) &&
      request.companyId === actor.companyId
    ) {
      return;
    }
    const own = await this.ownEmployee(actor);
    if (
      request.employeeId === own.id ||
      (actor.roles.includes(RoleName.MANAGER) &&
        request.employee.reportingManagerId === own.id)
    ) {
      return;
    }
    throw new ForbiddenException('Leave request is not accessible');
  }

  private async assertCanCancel(
    request: LeaveRecord,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (request.employee.user?.id === actor.id) return;
    if (
      (actor.roles.includes(RoleName.COMPANY_ADMIN) ||
        actor.roles.includes(RoleName.HR)) &&
      request.companyId === actor.companyId
    ) {
      return;
    }
    const own = await this.ownEmployee(actor);
    if (
      actor.roles.includes(RoleName.MANAGER) &&
      request.leaveType.managerCanApprove &&
      request.employee.reportingManagerId === own.id
    ) {
      return;
    }
    throw new ForbiddenException('Leave cancellation is not permitted');
  }

  private async withPendingBalances(data: LeaveBalanceRecord[]) {
    return Promise.all(
      data.map(async (balance) => {
        const yearStart = new Date(Date.UTC(balance.year, 0, 1));
        const yearEnd = new Date(Date.UTC(balance.year, 11, 31));
        const pending = await this.prisma.leaveRequest.aggregate({
          where: {
            companyId: balance.companyId,
            employeeId: balance.employeeId,
            leaveTypeId: balance.leaveTypeId,
            status: LeaveRequestStatus.PENDING,
            deletedAt: null,
            // TODO: prorate cross-year leave ranges when holiday/year policy engine is added.
            startDate: { lte: yearEnd },
            endDate: { gte: yearStart },
          },
          _sum: { totalDays: true },
        });
        return {
          ...balance,
          remaining: balance.allocated - balance.used,
          pending: pending._sum.totalDays ?? 0,
        };
      }),
    );
  }

  private toLeaveRequestResponse(
    request: LeaveRecord,
  ): LeaveRequestResponseDto {
    return {
      ...request,
      startDate: this.dateOnlyString(request.startDate),
      endDate: this.dateOnlyString(request.endDate),
    };
  }

  private dateOnlyString(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private dateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private validateDateRange(from?: string, to?: string): void {
    if (from && to && this.dateOnly(from) > this.dateOnly(to)) {
      throw new BadRequestException('dateFrom must not be after dateTo');
    }
  }

  private throwTypeConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('An active leave type code already exists');
    }
    throw error;
  }
}

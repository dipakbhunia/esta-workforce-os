import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeStatus,
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
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
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
      user: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.LeaveRequestInclude;

type LeaveRecord = Prisma.LeaveRequestGetPayload<{
  include: typeof requestInclude;
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
    return this.prisma.leaveRequest.create({
      data: {
        companyId: employee.companyId,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        totalDays,
        reason: dto.reason?.trim(),
        status: leaveType.requiresApproval
          ? LeaveRequestStatus.PENDING
          : LeaveRequestStatus.APPROVED,
      },
      include: requestInclude,
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
    return paginatedResult(data, total, query);
  }

  async findRequest(id: string, actor: AuthenticatedUser) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException('Leave request not found');
    await this.assertRequestVisible(request, actor);
    return request;
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
      return updated;
    });
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

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeStatus,
  LeaveApprovalAction,
  LeaveRequestStatus,
  NotificationType,
  Prisma,
  RoleName,
  UserStatus,
} from '@prisma/client';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { NotificationsService } from '../notifications/notifications.service';
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
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
    const companyId = this.tenantForAnyRole(actor);
    const startDate = this.dateOnly(dto.startDate);
    const endDate = this.dateOnly(dto.endDate);
    if (startDate > endDate) {
      throw new BadRequestException('startDate must not be after endDate');
    }
    const totalDays =
      Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

    const submission = await this.prisma.$transaction(async (tx) => {
      const [company] = await tx.$queryRaw<Array<{
        id: string;
        designatedLeaveApproverUserId: string | null;
      }>>(Prisma.sql`
        SELECT "id", "designatedLeaveApproverUserId"
        FROM "Company"
        WHERE "id" = ${companyId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (!company) throw new NotFoundException('Company not found');

      const employee = await this.lockApplicantEmployee(tx, companyId, actor.id);
      const leaveType = await tx.leaveType.findFirst({
        where: { id: dto.leaveTypeId, companyId, deletedAt: null },
      });
      if (!leaveType) throw new NotFoundException('Leave type not found');

      const overlap = await tx.leaveRequest.count({
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

      const assignedApproverUserId = leaveType.requiresApproval
        ? await this.resolveLeaveApprover(
            tx,
            companyId,
            employee,
            leaveType.managerCanApprove,
            company.designatedLeaveApproverUserId,
          )
        : null;
      if (leaveType.requiresApproval && !assignedApproverUserId) {
        throw new ConflictException(
          'No valid leave approver is configured for this employee',
        );
      }
      const status = leaveType.requiresApproval
        ? LeaveRequestStatus.PENDING
        : LeaveRequestStatus.APPROVED;

      const request = await tx.leaveRequest.create({
        data: {
          companyId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,
          totalDays,
          reason: dto.reason?.trim(),
          status,
          assignedApproverUserId,
          approvalAuthorityVersion: leaveType.requiresApproval ? 1 : null,
        },
        include: requestInclude,
      });
      const submittedHistory = await tx.leaveApprovalHistory.create({
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
      return { request, submittedHistoryId: submittedHistory.id };
    });
    const { request, submittedHistoryId } = submission;
    if (
      request.status === LeaveRequestStatus.PENDING &&
      request.approvalAuthorityVersion === 1 &&
      request.assignedApproverUserId
    ) {
      try {
        await this.notifications.createLeaveAppliedEmail({
          submittedHistoryId,
          assignedApproverUserId: request.assignedApproverUserId,
          expectedCompanyId: request.companyId,
          payload: {
            leaveRequestId: request.id,
            applicantDisplayName: `${request.employee.user.firstName} ${request.employee.user.lastName}`.trim(),
            leaveTypeName: request.leaveType.name,
            startDate: this.dateOnlyString(request.startDate),
            endDate: this.dateOnlyString(request.endDate),
          },
        });
      } catch {
        this.logger.warn({
          failureCategory: 'LEAVE_APPLIED_NOTIFICATION_ENQUEUE_FAILED',
          leaveRequestId: request.id,
          submittedHistoryId,
          companyId: request.companyId,
        });
      }
    }
    return this.toLeaveRequestResponse(request);
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
    const approver = await this.prisma.employee.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true },
    });
    const authorityVersion = request.approvalAuthorityVersion;
    if (authorityVersion !== null && authorityVersion !== 1) {
      throw new ForbiddenException('Leave approval authority is invalid');
    }
    const versionOne = authorityVersion === 1;
    if (versionOne) {
      if (
        request.companyId !== actor.companyId ||
        request.assignedApproverUserId !== actor.id
      ) {
        throw new ForbiddenException('Leave approval is not permitted');
      }
    } else {
      const legacy = request.assignedApproverUserId === null;
      const admin =
        actor.roles.includes(RoleName.COMPANY_ADMIN) ||
        actor.roles.includes(RoleName.HR);
      const managerAllowed =
        actor.roles.includes(RoleName.MANAGER) &&
        !!approver &&
        request.leaveType.managerCanApprove &&
        request.employee.reportingManagerId === approver.id;
      if (
        !legacy ||
        request.companyId !== actor.companyId ||
        (!admin && !managerAllowed)
      ) {
        throw new ForbiddenException('Leave approval is not permitted');
      }
    }
    const decision = await this.prisma.$transaction(async (tx) => {
      if (versionOne) {
        await this.lockUserAuthority(tx, request.companyId, actor.id);
        const reviewer = await tx.user.findFirst({
          where: this.reviewAuthorityWhere(request.companyId, actor.id),
          select: { id: true },
        });
        if (!reviewer) {
          throw new ForbiddenException('Leave approval is not permitted');
        }
      }
      const decision = await tx.leaveRequest.updateMany({
        where: {
          id,
          companyId: request.companyId,
          deletedAt: null,
          status: LeaveRequestStatus.PENDING,
          ...(versionOne
            ? {
                approvalAuthorityVersion: 1,
                assignedApproverUserId: actor.id,
              }
            : {
                approvalAuthorityVersion: null,
                assignedApproverUserId: null,
              }),
        },
        data: {
          status: dto.status,
          approverId: approver?.id,
          reviewedAt: new Date(),
          reviewComment: dto.comment?.trim(),
        },
      });
      if (decision.count !== 1) {
        throw new BadRequestException('Only pending requests can be reviewed');
      }
      const updated = await tx.leaveRequest.findUniqueOrThrow({
        where: { id },
        include: requestInclude,
      });
      if (dto.status === LeaveRequestStatus.APPROVED) {
        const year = updated.startDate.getUTCFullYear();
        await tx.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: updated.employeeId,
              leaveTypeId: updated.leaveTypeId,
              year,
            },
          },
          create: {
            companyId: updated.companyId,
            employeeId: updated.employeeId,
            leaveTypeId: updated.leaveTypeId,
            year,
            allocated: updated.leaveType.defaultDays,
            used: updated.totalDays,
          },
          update: { used: { increment: updated.totalDays } },
        });
      }
      const history = await tx.leaveApprovalHistory.create({
        data: {
          companyId: updated.companyId,
          leaveRequestId: updated.id,
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
          companyId: updated.companyId,
          actorUserId: actor.id,
          action:
            dto.status === LeaveRequestStatus.APPROVED
              ? 'LEAVE_APPROVED'
              : 'LEAVE_REJECTED',
          entityType: 'LeaveRequest',
          entityId: updated.id,
          metadata: {
            employeeId: updated.employeeId,
            leaveTypeId: updated.leaveTypeId,
            comment: dto.comment?.trim(),
          },
        },
      });
      return { updated, historyId: history.id };
    });
    try {
      await this.notifications.createLeaveDecisionEmail({
        decisionHistoryId: decision.historyId,
        type: decision.updated.status === LeaveRequestStatus.APPROVED
          ? NotificationType.LEAVE_APPROVED
          : NotificationType.LEAVE_REJECTED,
        applicantUserId: decision.updated.employee.user.id,
        expectedCompanyId: decision.updated.companyId,
        payload: {
          leaveRequestId: decision.updated.id,
          leaveTypeName: decision.updated.leaveType.name,
          startDate: this.dateOnlyString(decision.updated.startDate),
          endDate: this.dateOnlyString(decision.updated.endDate),
        },
      });
    } catch {
      this.logger.warn({
        failureCategory: 'LEAVE_DECISION_NOTIFICATION_ENQUEUE_FAILED',
        leaveRequestId: decision.updated.id,
        decisionHistoryId: decision.historyId,
        companyId: decision.updated.companyId,
      });
    }
    return this.toLeaveRequestResponse(decision.updated);
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

  private async lockApplicantEmployee(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
  ) {
    const [locked] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "Employee"
      WHERE "companyId" = ${companyId}::uuid
        AND "userId" = ${userId}::uuid
        AND "deletedAt" IS NULL
        AND "status" = ${EmployeeStatus.ACTIVE}::"EmployeeStatus"
      FOR UPDATE
    `);
    if (!locked) throw new NotFoundException('Active employee profile not found');
    return tx.employee.findUniqueOrThrow({ where: { id: locked.id } });
  }

  private async resolveLeaveApprover(
    tx: Prisma.TransactionClient,
    companyId: string,
    applicant: { id: string; userId: string; reportingManagerId: string | null },
    managerCanApprove: boolean,
    designatedLeaveApproverUserId: string | null,
  ): Promise<string | null> {
    if (managerCanApprove && applicant.reportingManagerId) {
      const manager = await this.lockEligibleManager(
        tx,
        companyId,
        applicant,
      );
      if (manager) return manager.userId;
    }
    if (
      designatedLeaveApproverUserId &&
      designatedLeaveApproverUserId !== applicant.userId
    ) {
      await this.lockUserAuthority(
        tx,
        companyId,
        designatedLeaveApproverUserId,
      );
      const fallback = await tx.user.findFirst({
        where: {
          id: designatedLeaveApproverUserId,
          companyId,
          deletedAt: null,
          status: UserStatus.ACTIVE,
          roles: {
            some: {
              role: {
                companyId,
                deletedAt: null,
                systemName: { in: [RoleName.HR, RoleName.COMPANY_ADMIN] },
              },
            },
          },
        },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }
    return null;
  }

  private async lockEligibleManager(
    tx: Prisma.TransactionClient,
    companyId: string,
    applicant: { id: string; userId: string; reportingManagerId: string | null },
  ): Promise<{ userId: string } | null> {
    if (!applicant.reportingManagerId || applicant.reportingManagerId === applicant.id) {
      return null;
    }
    const [locked] = await tx.$queryRaw<Array<{ id: string; userId: string }>>(Prisma.sql`
      SELECT "id", "userId"
      FROM "Employee"
      WHERE "id" = ${applicant.reportingManagerId}::uuid
        AND "companyId" = ${companyId}::uuid
        AND "deletedAt" IS NULL
        AND "status" = ${EmployeeStatus.ACTIVE}::"EmployeeStatus"
      FOR UPDATE
    `);
    if (!locked || locked.userId === applicant.userId) return null;
    await this.lockUserAuthority(tx, companyId, locked.userId);
    return tx.employee.findFirst({
      where: {
        id: locked.id,
        companyId,
        deletedAt: null,
        status: EmployeeStatus.ACTIVE,
        user: {
          id: locked.userId,
          companyId,
          deletedAt: null,
          status: UserStatus.ACTIVE,
          roles: {
            some: {
              role: {
                companyId,
                deletedAt: null,
                systemName: RoleName.MANAGER,
              },
            },
          },
        },
      },
      select: { userId: true },
    });
  }

  private async lockUserAuthority(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
  ): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${userId}::uuid
        AND "companyId" = ${companyId}::uuid
      FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT ur."userId"
      FROM "UserRole" ur
      INNER JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = ${userId}::uuid
        AND r."companyId" = ${companyId}::uuid
      ORDER BY ur."roleId"
      FOR UPDATE OF ur, r
    `);
  }

  private reviewAuthorityWhere(
    companyId: string,
    userId: string,
  ): Prisma.UserWhereInput {
    return {
      id: userId,
      companyId,
      deletedAt: null,
      status: UserStatus.ACTIVE,
      roles: {
        some: {
          role: {
            companyId,
            deletedAt: null,
            systemName: {
              in: [RoleName.MANAGER, RoleName.HR, RoleName.COMPANY_ADMIN],
            },
          },
        },
      },
    };
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
    const {
      assignedApproverUserId: _assignedApproverUserId,
      approvalAuthorityVersion: _approvalAuthorityVersion,
      ...publicRequest
    } = request;
    return {
      ...publicRequest,
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

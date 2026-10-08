import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceCorrectionStatus,
  AttendanceCorrectionType,
  AttendanceLogType,
  AttendanceStatus,
  EmployeeStatus,
  NotificationType,
  Prisma,
  RoleName,
  UserStatus,
} from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { dateOnly, zonedDateTimeToUtc } from '../attendance/attendance-time.util';
import { NotificationsService } from '../notifications/notifications.service';
import { AttendanceCorrectionQueryDto } from './dto/attendance-correction-query.dto';
import { AttendanceCorrectionResponseDto } from './dto/attendance-correction-response.dto';
import { CreateAttendanceCorrectionRequestDto } from './dto/create-attendance-correction-request.dto';
import { ReviewAttendanceCorrectionDto } from './dto/review-attendance-correction.dto';

const correctionInclude = {
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
  attendance: {
    select: {
      id: true,
      attendanceDate: true,
      punchInAt: true,
      punchOutAt: true,
      expectedMinutes: true,
      shiftStartTime: true,
      shiftTimezone: true,
      breaks: true,
    },
  },
  requestedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  reviewedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.AttendanceCorrectionRequestInclude;

type CorrectionWithDetails = Prisma.AttendanceCorrectionRequestGetPayload<{
  include: typeof correctionInclude;
}>;

@Injectable()
export class AttendanceCorrectionsService {
  private readonly logger = new Logger(AttendanceCorrectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    dto: CreateAttendanceCorrectionRequestDto,
    actor: AuthenticatedUser,
  ): Promise<AttendanceCorrectionResponseDto> {
    const ownEmployee = await this.ownActiveEmployee(actor);
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        id: dto.attendanceId,
        employeeId: ownEmployee.id,
        companyId: ownEmployee.companyId,
      },
      include: { employee: { select: { id: true, companyId: true, reportingManagerId: true } }, breaks: true },
    });
    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('reason must not be empty');
    }

    const requestedPunchInAt = dto.requestedPunchInAt
      ? new Date(dto.requestedPunchInAt)
      : null;
    const requestedPunchOutAt = dto.requestedPunchOutAt
      ? new Date(dto.requestedPunchOutAt)
      : null;
    this.validateRequestedTimes(dto.type, requestedPunchInAt, requestedPunchOutAt);
    this.validateChronology(
      requestedPunchInAt ?? attendance.punchInAt,
      requestedPunchOutAt ?? attendance.punchOutAt,
    );
    const request = await this.prisma.$transaction(async (tx) => {
      const [company] = await tx.$queryRaw<Array<{
        id: string;
        designatedAttendanceApproverUserId: string | null;
      }>>(Prisma.sql`
        SELECT "id", "designatedAttendanceApproverUserId"
        FROM "Company"
        WHERE "id" = ${attendance.companyId}::uuid AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (!company) throw new NotFoundException('Company not found');
      const [applicant] = await tx.$queryRaw<Array<{
        id: string;
        userId: string;
        reportingManagerId: string | null;
      }>>(Prisma.sql`
        SELECT "id", "userId", "reportingManagerId"
        FROM "Employee"
        WHERE "id" = ${ownEmployee.id}::uuid
          AND "companyId" = ${company.id}::uuid
          AND "deletedAt" IS NULL
          AND "status" = 'ACTIVE'::"EmployeeStatus"
        FOR UPDATE
      `);
      if (!applicant) throw new NotFoundException('Active employee profile not found');
      const pendingExists = await tx.attendanceCorrectionRequest.count({
        where: {
          attendanceId: attendance.id,
          employeeId: attendance.employeeId,
          status: AttendanceCorrectionStatus.PENDING,
          deletedAt: null,
        },
      });
      if (pendingExists) {
        throw new BadRequestException('A pending correction request already exists for this attendance');
      }
      const assignedApproverUserId = await this.resolveAttendanceApprover(
        tx,
        company.id,
        applicant,
        company.designatedAttendanceApproverUserId,
      );
      if (!assignedApproverUserId) {
        throw new ConflictException('No valid attendance correction approver is configured for this employee');
      }
      const created = await tx.attendanceCorrectionRequest.create({
        data: {
          companyId: attendance.companyId,
          attendanceId: attendance.id,
          employeeId: attendance.employeeId,
          requestedByUserId: actor.id,
          assignedApproverUserId,
          approvalAuthorityVersion: 1,
          type: dto.type,
          originalPunchInAt: attendance.punchInAt,
          originalPunchOutAt: attendance.punchOutAt,
          requestedPunchInAt,
          requestedPunchOutAt,
          reason,
        },
        include: correctionInclude,
      });
      await tx.auditLog.create({
        data: {
          companyId: created.companyId,
          actorUserId: actor.id,
          action: 'ATTENDANCE_CORRECTION_REQUESTED',
          entityType: 'AttendanceCorrectionRequest',
          entityId: created.id,
          metadata: { attendanceId: created.attendanceId, employeeId: created.employeeId, type: created.type },
        },
      });
      return created;
    });
    try {
      await this.notifications.createAttendanceCorrectionAppliedEmail({
        attendanceCorrectionRequestId: request.id,
        assignedApproverUserId: request.assignedApproverUserId!,
        expectedCompanyId: request.companyId,
        payload: {
          attendanceCorrectionRequestId: request.id,
          employeeDisplayName: `${request.employee.user.firstName} ${request.employee.user.lastName}`.trim(),
          attendanceDate: request.attendance.attendanceDate.toISOString().slice(0, 10),
          correctionType: request.type,
        },
      });
    } catch {
      this.logger.warn({
        failureCategory: 'ATTENDANCE_CORRECTION_APPLIED_NOTIFICATION_ENQUEUE_FAILED',
        attendanceCorrectionRequestId: request.id,
        companyId: request.companyId,
      });
    }
    return this.toResponse(request);
  }

  async findAll(query: AttendanceCorrectionQueryDto, actor: AuthenticatedUser) {
    this.validateDateRange(query.dateFrom, query.dateTo);
    const visibility = await this.visibilityWhere(actor);
    const where: Prisma.AttendanceCorrectionRequestWhereInput = {
      deletedAt: null,
      ...visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.attendanceId ? { attendanceId: query.attendanceId } : {}),
      ...((query.dateFrom || query.dateTo) && {
        attendance: {
          attendanceDate: {
            ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}),
          },
        },
      }),
      ...(query.search
        ? {
            OR: [
              { reason: { contains: query.search, mode: 'insensitive' } },
              { reviewerComment: { contains: query.search, mode: 'insensitive' } },
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
                employee: {
                  user: {
                    lastName: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendanceCorrectionRequest.findMany({
        where,
        include: correctionInclude,
        ...paginationArgs(query),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.attendanceCorrectionRequest.count({ where }),
    ]);
    return paginatedResult(data.map((item) => this.toResponse(item)), total, query);
  }

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<AttendanceCorrectionResponseDto> {
    const request = await this.findVisibleRequest(id, actor);
    return this.toResponse(request);
  }

  async review(
    id: string,
    dto: ReviewAttendanceCorrectionDto,
    actor: AuthenticatedUser,
  ): Promise<AttendanceCorrectionResponseDto> {
    if (
      dto.status !== AttendanceCorrectionStatus.APPROVED &&
      dto.status !== AttendanceCorrectionStatus.REJECTED
    ) {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }
    const candidate = await this.prisma.attendanceCorrectionRequest.findFirst({
      where: { id, deletedAt: null },
      include: correctionInclude,
    });
    if (!candidate) throw new NotFoundException('Attendance correction request not found');
    const legacyAuthority =
      candidate.approvalAuthorityVersion === null &&
      candidate.assignedApproverUserId === null;
    const versionOne =
      candidate.approvalAuthorityVersion === 1 &&
      candidate.assignedApproverUserId !== null;
    if (!legacyAuthority && !versionOne) {
      throw new ForbiddenException('Attendance correction review is not permitted');
    }
    const request = versionOne ? candidate : await this.findVisibleRequest(id, actor);
    if (request.status !== AttendanceCorrectionStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be reviewed');
    }
    if (versionOne) {
      if (
        request.companyId !== actor.companyId ||
        request.assignedApproverUserId !== actor.id ||
        request.employee.user.id === actor.id
      ) throw new ForbiddenException('Attendance correction review is not permitted');
    } else {
      await this.assertCanReview(request, actor);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (versionOne) {
        await this.lockCompanyAuthority(tx, request.companyId);
        const hasCurrentAuthority = await this.lockAndValidateReviewerAuthority(
          tx,
          actor.id,
          request.companyId,
        );
        if (!hasCurrentAuthority) {
          throw new ForbiddenException('Attendance correction review is not permitted');
        }
      }
      const decision = await tx.attendanceCorrectionRequest.updateMany({
        where: {
          id,
          companyId: request.companyId,
          deletedAt: null,
          status: AttendanceCorrectionStatus.PENDING,
          ...(versionOne
            ? { approvalAuthorityVersion: 1, assignedApproverUserId: actor.id }
            : { approvalAuthorityVersion: null, assignedApproverUserId: null }),
        },
        data: {
          status: dto.status,
          reviewedByUserId: actor.id,
          reviewerComment: dto.reviewerComment?.trim(),
          reviewedAt: new Date(),
        },
      });
      if (decision.count !== 1) {
        throw new BadRequestException('Only pending requests can be reviewed');
      }
      const claimed = await tx.attendanceCorrectionRequest.findUniqueOrThrow({
        where: { id },
        include: correctionInclude,
      });
      if (dto.status === AttendanceCorrectionStatus.APPROVED) {
        await this.applyApprovedCorrection(tx, claimed, actor.id);
      }
      const reviewed = await tx.attendanceCorrectionRequest.findUniqueOrThrow({
        where: { id },
        include: correctionInclude,
      });
      const decisionAudit = await tx.auditLog.create({
        data: {
          companyId: claimed.companyId,
          actorUserId: actor.id,
          action:
            dto.status === AttendanceCorrectionStatus.APPROVED
              ? 'ATTENDANCE_CORRECTION_APPROVED'
              : 'ATTENDANCE_CORRECTION_REJECTED',
          entityType: 'AttendanceCorrectionRequest',
          entityId: claimed.id,
          metadata: {
            attendanceId: claimed.attendanceId,
            employeeId: claimed.employeeId,
            reviewerComment: dto.reviewerComment?.trim(),
          },
        },
      });
      return { reviewed, decisionAuditId: decisionAudit.id };
    });
    try {
      await this.notifications.createAttendanceCorrectionDecisionEmail({
        decisionAuditId: updated.decisionAuditId,
        type: updated.reviewed.status === AttendanceCorrectionStatus.APPROVED
          ? NotificationType.ATTENDANCE_CORRECTION_APPROVED
          : NotificationType.ATTENDANCE_CORRECTION_REJECTED,
        employeeUserId: updated.reviewed.employee.user.id,
        expectedCompanyId: updated.reviewed.companyId,
        payload: {
          attendanceCorrectionRequestId: updated.reviewed.id,
          attendanceDate: updated.reviewed.attendance.attendanceDate.toISOString().slice(0, 10),
        },
      });
    } catch {
      this.logger.warn({
        failureCategory: 'ATTENDANCE_CORRECTION_DECISION_NOTIFICATION_ENQUEUE_FAILED',
        attendanceCorrectionRequestId: updated.reviewed.id,
        decisionAuditId: updated.decisionAuditId,
        companyId: updated.reviewed.companyId,
      });
    }

    return this.toResponse(updated.reviewed);
  }

  async cancel(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<AttendanceCorrectionResponseDto> {
    const request = await this.findVisibleRequest(id, actor);
    if (request.status !== AttendanceCorrectionStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    const isRequester = request.requestedByUserId === actor.id;
    const isTenantAdmin =
      (actor.roles.includes(RoleName.COMPANY_ADMIN) ||
        actor.roles.includes(RoleName.HR)) &&
      actor.companyId === request.companyId;
    if (!isRequester && !isTenantAdmin) {
      throw new ForbiddenException('Attendance correction cancellation is not permitted');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const cancellation = await tx.attendanceCorrectionRequest.updateMany({
        where: {
          id,
          companyId: request.companyId,
          deletedAt: null,
          status: AttendanceCorrectionStatus.PENDING,
        },
        data: {
          status: AttendanceCorrectionStatus.CANCELLED,
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
        },
      });
      if (cancellation.count !== 1) {
        throw new BadRequestException('Only pending requests can be cancelled');
      }
      const cancelled = await tx.attendanceCorrectionRequest.findUniqueOrThrow({
        where: { id },
        include: correctionInclude,
      });
      await tx.auditLog.create({
        data: {
          companyId: cancelled.companyId,
          actorUserId: actor.id,
          action: 'ATTENDANCE_CORRECTION_CANCELLED',
          entityType: 'AttendanceCorrectionRequest',
          entityId: cancelled.id,
          metadata: {
            attendanceId: cancelled.attendanceId,
            employeeId: cancelled.employeeId,
          },
        },
      });
      return cancelled;
    });
    return this.toResponse(updated);
  }

  private async applyApprovedCorrection(
    tx: Prisma.TransactionClient,
    request: CorrectionWithDetails,
    reviewerUserId: string,
  ): Promise<void> {
    const attendance = await tx.attendance.findUnique({
      where: { id: request.attendanceId },
      include: { breaks: true },
    });
    if (!attendance) throw new NotFoundException('Attendance not found');

    const punchInAt = request.requestedPunchInAt ?? attendance.punchInAt;
    const punchOutAt = request.requestedPunchOutAt ?? attendance.punchOutAt;
    this.validateChronology(punchInAt, punchOutAt);

    const breakMinutes = attendance.breaks.reduce(
      (total, breakLog) =>
        total +
        (breakLog.endedAt
          ? Math.max(
              0,
              Math.floor(
                (breakLog.endedAt.getTime() - breakLog.startedAt.getTime()) /
                  60000,
              ),
            )
          : 0),
      0,
    );
    const workedMinutes =
      punchInAt && punchOutAt
        ? Math.max(
            0,
            Math.floor((punchOutAt.getTime() - punchInAt.getTime()) / 60000) -
              breakMinutes,
          )
        : 0;
    const lateMinutes = punchInAt
      ? this.lateMinutes(attendance.attendanceDate, attendance.shiftStartTime, attendance.shiftTimezone, punchInAt)
      : attendance.lateMinutes;
    const status = this.recalculateStatus(
      workedMinutes,
      attendance.expectedMinutes,
      lateMinutes,
      punchOutAt,
    );
    const logs: Prisma.AttendanceLogCreateWithoutAttendanceInput[] = [];
    if (
      request.requestedPunchInAt &&
      request.requestedPunchInAt.getTime() !== attendance.punchInAt?.getTime()
    ) {
      logs.push({
        type: AttendanceLogType.PUNCH_IN,
        occurredAt: request.requestedPunchInAt!,
        note: `Approved correction request ${request.id}: punch in adjusted`,
      });
    }
    if (
      request.requestedPunchOutAt &&
      request.requestedPunchOutAt.getTime() !== attendance.punchOutAt?.getTime()
    ) {
      logs.push({
        type: AttendanceLogType.PUNCH_OUT,
        occurredAt: request.requestedPunchOutAt!,
        note: `Approved correction request ${request.id}: punch out adjusted`,
      });
    }

    await tx.attendance.update({
      where: { id: attendance.id },
      data: {
        punchInAt,
        punchOutAt,
        breakMinutes,
        workedMinutes,
        lateMinutes,
        status,
        notes: request.reason,
        logs: logs.length ? { create: logs } : undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: request.companyId,
        actorUserId: reviewerUserId,
        action: 'ATTENDANCE_CORRECTION_APPLIED',
        entityType: 'Attendance',
        entityId: attendance.id,
        metadata: {
          correctionRequestId: request.id,
          originalPunchInAt: request.originalPunchInAt,
          originalPunchOutAt: request.originalPunchOutAt,
          requestedPunchInAt: request.requestedPunchInAt,
          requestedPunchOutAt: request.requestedPunchOutAt,
          workedMinutes,
          breakMinutes,
          status,
        },
      },
    });
  }

  private async findVisibleRequest(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<CorrectionWithDetails> {
    const visibility = await this.visibilityWhere(actor);
    const request = await this.prisma.attendanceCorrectionRequest.findFirst({
      where: { id, deletedAt: null, ...visibility },
      include: correctionInclude,
    });
    if (!request) throw new NotFoundException('Attendance correction request not found');
    return request;
  }

  private async resolveAttendanceApprover(
    tx: Prisma.TransactionClient,
    companyId: string,
    applicant: { id: string; userId: string; reportingManagerId: string | null },
    designatedAttendanceApproverUserId: string | null,
  ): Promise<string | null> {
    if (applicant.reportingManagerId && applicant.reportingManagerId !== applicant.id) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "Employee"
        WHERE "id" = ${applicant.reportingManagerId}::uuid
        FOR UPDATE
      `);
      const manager = await tx.employee.findFirst({
        where: {
          id: applicant.reportingManagerId,
          companyId,
          deletedAt: null,
          status: EmployeeStatus.ACTIVE,
          user: {
            id: { not: applicant.userId },
            companyId,
            deletedAt: null,
            status: UserStatus.ACTIVE,
            roles: { some: { role: { companyId, deletedAt: null, systemName: RoleName.MANAGER } } },
          },
        },
        select: { userId: true },
      });
      if (manager) return manager.userId;
    }
    if (designatedAttendanceApproverUserId && designatedAttendanceApproverUserId !== applicant.userId) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${designatedAttendanceApproverUserId}::uuid
        FOR UPDATE
      `);
      const fallback = await tx.user.findFirst({
        where: {
          id: designatedAttendanceApproverUserId,
          companyId,
          deletedAt: null,
          status: UserStatus.ACTIVE,
          employee: { is: { companyId, deletedAt: null, status: EmployeeStatus.ACTIVE } },
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

  private async lockCompanyAuthority(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "Company"
      WHERE "id" = ${companyId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (rows.length !== 1) throw new NotFoundException('Company not found');
  }

  private async lockAndValidateReviewerAuthority(
    tx: Prisma.TransactionClient,
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${userId}::uuid
      FOR UPDATE
    `);
    const reviewer = await tx.user.findFirst({
      where: {
        id: userId,
        companyId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        employee: {
          is: { companyId, deletedAt: null, status: EmployeeStatus.ACTIVE },
        },
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
      },
      select: { id: true },
    });
    return Boolean(reviewer);
  }

  private async visibilityWhere(
    actor: AuthenticatedUser,
  ): Promise<Prisma.AttendanceCorrectionRequestWhereInput> {
    if (
      actor.roles.includes(RoleName.COMPANY_ADMIN) ||
      actor.roles.includes(RoleName.HR)
    ) {
      if (!actor.companyId) throw new ForbiddenException('Tenant is required');
      return { companyId: actor.companyId };
    }
    const own = await this.ownActiveEmployee(actor);
    if (actor.roles.includes(RoleName.MANAGER)) {
      return {
        OR: [
          { employeeId: own.id },
          { employee: { reportingManagerId: own.id } },
          { assignedApproverUserId: actor.id },
        ],
      };
    }
    return { employeeId: own.id };
  }

  private async assertCanReview(
    request: CorrectionWithDetails,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const isTenantReviewer =
      (actor.roles.includes(RoleName.COMPANY_ADMIN) ||
        actor.roles.includes(RoleName.HR)) &&
      actor.companyId === request.companyId;
    if (isTenantReviewer) return;

    if (actor.roles.includes(RoleName.MANAGER)) {
      const own = await this.ownActiveEmployee(actor);
      if (request.employee.reportingManagerId === own.id) return;
    }
    throw new ForbiddenException('Attendance correction review is not permitted');
  }

  private async ownActiveEmployee(actor: AuthenticatedUser) {
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

  private validateRequestedTimes(
    type: AttendanceCorrectionType,
    requestedPunchInAt: Date | null,
    requestedPunchOutAt: Date | null,
  ): void {
    if (
      (requestedPunchInAt && Number.isNaN(requestedPunchInAt.getTime())) ||
      (requestedPunchOutAt && Number.isNaN(requestedPunchOutAt.getTime()))
    ) {
      throw new BadRequestException('Requested punch times must be valid ISO datetimes');
    }
    if (type === AttendanceCorrectionType.MISSED_PUNCH_IN && !requestedPunchInAt) {
      throw new BadRequestException('requestedPunchInAt is required for missed punch-in');
    }
    if (type === AttendanceCorrectionType.MISSED_PUNCH_OUT && !requestedPunchOutAt) {
      throw new BadRequestException('requestedPunchOutAt is required for missed punch-out');
    }
    if (
      type === AttendanceCorrectionType.TIME_CORRECTION &&
      !requestedPunchInAt &&
      !requestedPunchOutAt
    ) {
      throw new BadRequestException('At least one requested punch time is required');
    }
    if (
      type === AttendanceCorrectionType.FULL_DAY_REGULARIZATION &&
      (!requestedPunchInAt || !requestedPunchOutAt)
    ) {
      throw new BadRequestException('Both requested punch times are required for full-day regularization');
    }
  }

  private validateChronology(
    punchInAt: Date | null,
    punchOutAt: Date | null,
  ): void {
    if (punchInAt && punchOutAt && punchOutAt.getTime() <= punchInAt.getTime()) {
      throw new BadRequestException('requestedPunchOutAt must be after requestedPunchInAt');
    }
  }

  private recalculateStatus(
    workedMinutes: number,
    expectedMinutes: number,
    lateMinutes: number,
    punchOutAt: Date | null,
  ): AttendanceStatus {
    if (!punchOutAt) {
      return lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
    }
    if (workedMinutes < expectedMinutes / 2) return AttendanceStatus.HALF_DAY;
    return lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
  }

  private lateMinutes(
    attendanceDate: Date,
    shiftStartTime: string,
    shiftTimezone: string,
    punchInAt: Date,
  ): number {
    const shiftStart = zonedDateTimeToUtc(
      attendanceDate.toISOString().slice(0, 10),
      shiftStartTime,
      shiftTimezone,
    );
    return Math.max(
      0,
      Math.floor((punchInAt.getTime() - shiftStart.getTime()) / 60000) - 15,
    );
  }

  private validateDateRange(from?: string, to?: string): void {
    if (from && to && dateOnly(from) > dateOnly(to)) {
      throw new BadRequestException('dateFrom must not be after dateTo');
    }
  }

  private toResponse(request: CorrectionWithDetails): AttendanceCorrectionResponseDto {
    return {
      id: request.id,
      companyId: request.companyId,
      attendanceId: request.attendanceId,
      employeeId: request.employeeId,
      requestedByUserId: request.requestedByUserId,
      reviewedByUserId: request.reviewedByUserId,
      type: request.type,
      status: request.status,
      originalPunchInAt: request.originalPunchInAt,
      originalPunchOutAt: request.originalPunchOutAt,
      requestedPunchInAt: request.requestedPunchInAt,
      requestedPunchOutAt: request.requestedPunchOutAt,
      reason: request.reason,
      reviewerComment: request.reviewerComment,
      reviewedAt: request.reviewedAt,
      employee: {
        id: request.employee.id,
        employeeCode: request.employee.employeeCode,
        user: request.employee.user,
      },
      attendance: {
        id: request.attendance.id,
        attendanceDate: request.attendance.attendanceDate.toISOString().slice(0, 10),
        punchInAt: request.attendance.punchInAt,
        punchOutAt: request.attendance.punchOutAt,
      },
      requestedBy: request.requestedBy,
      reviewedBy: request.reviewedBy,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private async writeAuditLog(
    actor: AuthenticatedUser,
    companyId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId,
        actorUserId: actor.id,
        action,
        entityType: 'AttendanceCorrectionRequest',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}

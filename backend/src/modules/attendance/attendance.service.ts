import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceLogType,
  AttendanceStatus,
  EmployeeStatus,
  Prisma,
  RoleName,
} from '@prisma/client';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AttendanceActionDto } from './dto/attendance-action.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';
import {
  dateKey,
  dateOnly,
  expectedShiftMinutes,
  timeToMinutes,
  zonedDateTimeToUtc,
} from './attendance-time.util';

const attendanceInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
  logs: { orderBy: { occurredAt: 'asc' as const } },
  breaks: {
    orderBy: { startedAt: 'asc' as const },
    include: { breakPolicy: true },
  },
} satisfies Prisma.AttendanceInclude;

const AUTO_PUNCH_OUT_REASON = 'Break duration exceeded';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async punchIn(dto: AttendanceActionDto, actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    if (!employee.shift) {
      throw new BadRequestException('An active shift is required to punch in');
    }
    const now = new Date();
    const key = dateKey(
      now,
      employee.shift.timezone,
      employee.shift.startTime,
      employee.shift.endTime,
    );
    const attendanceDate = dateOnly(key);
    const shiftStart = zonedDateTimeToUtc(
      key,
      employee.shift.startTime,
      employee.shift.timezone,
    );
    const lateMinutes = Math.max(
      0,
      Math.floor((now.getTime() - shiftStart.getTime()) / 60000) - 15,
    );
    try {
      return await this.prisma.attendance.create({
        data: {
          companyId: employee.companyId,
          employeeId: employee.id,
          attendanceDate,
          punchInAt: now,
          status:
            lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
          lateMinutes,
          expectedMinutes: expectedShiftMinutes(
            employee.shift.startTime,
            employee.shift.endTime,
          ),
          shiftStartTime: employee.shift.startTime,
          shiftEndTime: employee.shift.endTime,
          shiftTimezone: employee.shift.timezone,
          notes: dto.note?.trim(),
          logs: {
            create: {
              type: AttendanceLogType.PUNCH_IN,
              occurredAt: now,
              note: dto.note?.trim(),
            },
          },
        },
        include: attendanceInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Already punched in for this shift date');
      }
      throw error;
    }
  }

  async punchOut(dto: AttendanceActionDto, actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    const attendance = await this.openAttendance(employee.id);
    const now = new Date();
    if (attendance.breaks.some((item) => !item.endedAt)) {
      throw new BadRequestException('End the active break before punching out');
    }
    const breakMinutes = attendance.breaks.reduce(
      (total, item) =>
        total +
        (item.endedAt
          ? Math.max(
              0,
              Math.floor(
                (item.endedAt.getTime() - item.startedAt.getTime()) / 60000,
              ),
            )
          : 0),
      0,
    );
    const workedMinutes = Math.max(
      0,
      Math.floor((now.getTime() - attendance.punchInAt!.getTime()) / 60000) -
        breakMinutes,
    );
    const status =
      workedMinutes < attendance.expectedMinutes / 2
        ? AttendanceStatus.HALF_DAY
        : attendance.lateMinutes > 0
          ? AttendanceStatus.LATE
          : AttendanceStatus.PRESENT;
    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        punchOutAt: now,
        breakMinutes,
        workedMinutes,
        status,
        ...(dto.note ? { notes: dto.note.trim() } : {}),
        logs: {
          create: {
            type: AttendanceLogType.PUNCH_OUT,
            occurredAt: now,
            note: dto.note?.trim(),
          },
        },
      },
      include: attendanceInclude,
    });
  }

  async breakStart(dto: AttendanceActionDto, actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    if (!dto.breakPolicyId) {
      throw new BadRequestException('breakPolicyId is required');
    }
    const breakPolicy = await this.prisma.breakPolicy.findFirst({
      where: {
        id: dto.breakPolicyId,
        companyId: employee.companyId,
        isActive: true,
        deletedAt: null,
      },
    });
    if (!breakPolicy) {
      throw new BadRequestException('Active break policy not found');
    }
    const attendance = await this.openAttendance(employee.id);
    if (attendance.breaks.some((item) => !item.endedAt)) {
      throw new BadRequestException('A break is already active');
    }
    await this.prisma.breakLog.create({
      data: {
        attendanceId: attendance.id,
        breakPolicyId: breakPolicy.id,
        breakTypeName: breakPolicy.name,
        breakTypeCode: breakPolicy.code,
        allowedMinutes: breakPolicy.allowedMinutes,
        isPaid: breakPolicy.isPaid,
        note: dto.comment?.trim() || dto.note?.trim(),
      },
    });
    return this.findAttendance(attendance.id);
  }

  async breakEnd(actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    const attendance = await this.openAttendance(employee.id, false);
    const activeBreak = attendance.breaks.find((item) => !item.endedAt);
    if (!activeBreak) throw new BadRequestException('No active break found');
    const autoPunched = await this.autoPunchOutIfBreakExpired(attendance, activeBreak);
    if (autoPunched) return autoPunched;
    const now = new Date();
    const durationMinutes = this.breakDurationMinutes(activeBreak.startedAt, now);
    await this.prisma.breakLog.update({
      where: { id: activeBreak.id },
      data: {
        endedAt: now,
        durationMinutes,
        policyViolated:
          activeBreak.allowedMinutes !== null &&
          activeBreak.allowedMinutes !== undefined &&
          durationMinutes > activeBreak.allowedMinutes,
      },
    });
    return this.findAttendance(attendance.id);
  }

  async findAll(query: AttendanceQueryDto, actor: AuthenticatedUser) {
    this.validateDateRange(query.dateFrom, query.dateTo);
    const visibility = await this.visibilityWhere(actor);
    const where: Prisma.AttendanceWhereInput = {
      ...visibility,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...((query.dateFrom || query.dateTo) && {
        attendanceDate: {
          ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}),
          ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}),
        },
      }),
      ...(query.search
        ? {
            employee: {
              OR: [
                {
                  employeeCode: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  user: {
                    firstName: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  user: {
                    lastName: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: attendanceInclude,
        ...paginationArgs(query),
        orderBy: [{ attendanceDate: 'desc' }, { punchInAt: 'desc' }],
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async summary(query: AttendanceSummaryQueryDto, actor: AuthenticatedUser) {
    const date = dateOnly(query.date ?? new Date().toISOString().slice(0, 10));
    const employeeWhere = await this.employeeVisibilityWhere(actor);
    const employees = await this.prisma.employee.findMany({
      where: { ...employeeWhere, deletedAt: null, status: EmployeeStatus.ACTIVE },
      select: { id: true },
    });
    const records = await this.prisma.attendance.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        attendanceDate: date,
      },
      include: { breaks: true },
    });
    const counts = Object.values(AttendanceStatus).reduce(
      (result, status) => ({ ...result, [status]: 0 }),
      {} as Record<AttendanceStatus, number>,
    );
    records.forEach((record) => counts[record.status]++);
    counts.ABSENT = Math.max(0, employees.length - records.length);
    return {
      date: date.toISOString().slice(0, 10),
      totalEmployees: employees.length,
      recorded: records.length,
      counts,
      totalWorkedMinutes: records.reduce(
        (total, record) => total + record.workedMinutes,
        0,
      ),
      totalBreakMinutes: records.reduce(
        (total, record) => total + this.totalBreakMinutes(record.breaks),
        0,
      ),
      breakPolicies: records.flatMap((record) =>
        record.breaks
          .filter((breakLog) => breakLog.breakTypeName)
          .map((breakLog) => ({
            name: breakLog.breakTypeName,
            code: breakLog.breakTypeCode,
            allowedMinutes: breakLog.allowedMinutes,
            durationMinutes: breakLog.durationMinutes,
            policyViolated: breakLog.policyViolated,
            autoPunchOutAt: breakLog.autoPunchOutAt,
          })),
      ),
      autoPunchedOut: records.some(
        (record) => record.status === AttendanceStatus.AUTO_PUNCHED_OUT,
      ),
    };
  }

  async autoPunchOutExpiredBreaks(): Promise<number> {
    // TODO: Call this from a scheduler/queue worker once background jobs are introduced.
    // For now, request-driven attendance operations also enforce this rule.
    const openAttendances = await this.prisma.attendance.findMany({
      where: {
        punchInAt: { not: null },
        punchOutAt: null,
        breaks: {
          some: {
            endedAt: null,
            allowedMinutes: { not: null },
            breakPolicy: { autoPunchOutOnTimeout: true },
          },
        },
      },
      include: { breaks: { include: { breakPolicy: true } } },
    });
    let count = 0;
    for (const attendance of openAttendances) {
      const activeBreak = attendance.breaks.find((item) => !item.endedAt);
      if (activeBreak && (await this.autoPunchOutIfBreakExpired(attendance, activeBreak))) {
        count++;
      }
    }
    return count;
  }

  private async ownActiveEmployee(actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actor.id,
        deletedAt: null,
        status: EmployeeStatus.ACTIVE,
      },
      include: { shift: true },
    });
    if (!employee) throw new NotFoundException('Active employee profile not found');
    return employee;
  }

  private async openAttendance(employeeId: string, enforceBreakTimeout = true) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, punchInAt: { not: null }, punchOutAt: null },
      include: { breaks: { include: { breakPolicy: true } } },
      orderBy: { punchInAt: 'desc' },
    });
    if (!attendance) throw new BadRequestException('No open attendance found');
    const activeBreak = attendance.breaks.find((item) => !item.endedAt);
    if (enforceBreakTimeout && activeBreak) {
      const autoPunched = await this.autoPunchOutIfBreakExpired(attendance, activeBreak);
      if (autoPunched) {
        throw new BadRequestException(AUTO_PUNCH_OUT_REASON);
      }
    }
    return attendance;
  }

  private findAttendance(id: string) {
    return this.prisma.attendance.findUniqueOrThrow({
      where: { id },
      include: attendanceInclude,
    });
  }

  private async visibilityWhere(
    actor: AuthenticatedUser,
  ): Promise<Prisma.AttendanceWhereInput> {
    const employeeWhere = await this.employeeVisibilityWhere(actor);
    return { employee: employeeWhere };
  }

  private async employeeVisibilityWhere(
    actor: AuthenticatedUser,
  ): Promise<Prisma.EmployeeWhereInput> {
    if (
      actor.roles.includes(RoleName.COMPANY_ADMIN) ||
      actor.roles.includes(RoleName.HR)
    ) {
      if (!actor.companyId) throw new ForbiddenException('Tenant is required');
      return { companyId: actor.companyId };
    }
    const own = await this.prisma.employee.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true },
    });
    if (!own) return { id: '__missing_employee__' };
    if (actor.roles.includes(RoleName.MANAGER)) {
      return { OR: [{ id: own.id }, { reportingManagerId: own.id }] };
    }
    return { id: own.id };
  }

  private validateDateRange(from?: string, to?: string): void {
    if (from && to && dateOnly(from) > dateOnly(to)) {
      throw new BadRequestException('dateFrom must not be after dateTo');
    }
  }

  private async autoPunchOutIfBreakExpired(
    attendance: Prisma.AttendanceGetPayload<{
      include: { breaks: { include: { breakPolicy: true } } };
    }>,
    activeBreak: Prisma.BreakLogGetPayload<{ include: { breakPolicy: true } }>,
  ) {
    if (
      !activeBreak.allowedMinutes ||
      !activeBreak.breakPolicy?.autoPunchOutOnTimeout
    ) {
      return null;
    }
    const timeoutAt = new Date(
      activeBreak.startedAt.getTime() + activeBreak.allowedMinutes * 60000,
    );
    if (Date.now() <= timeoutAt.getTime()) return null;

    const durationMinutes = this.breakDurationMinutes(
      activeBreak.startedAt,
      timeoutAt,
    );
    const breakMinutes = this.totalBreakMinutes([
      ...attendance.breaks.filter((item) => item.id !== activeBreak.id),
      {
        ...activeBreak,
        endedAt: timeoutAt,
        durationMinutes,
      },
    ]);
    const workedMinutes = Math.max(
      0,
      Math.floor((timeoutAt.getTime() - attendance.punchInAt!.getTime()) / 60000) -
        breakMinutes,
    );

    await this.prisma.breakLog.update({
      where: { id: activeBreak.id },
      data: {
        endedAt: timeoutAt,
        durationMinutes,
        policyViolated: true,
        autoPunchOutAt: timeoutAt,
      },
    });
    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        punchOutAt: timeoutAt,
        breakMinutes,
        workedMinutes,
        status: AttendanceStatus.AUTO_PUNCHED_OUT,
        autoPunchOutReason: AUTO_PUNCH_OUT_REASON,
        notes: attendance.notes
          ? `${attendance.notes}; ${AUTO_PUNCH_OUT_REASON}`
          : AUTO_PUNCH_OUT_REASON,
        logs: {
          create: {
            type: AttendanceLogType.PUNCH_OUT,
            occurredAt: timeoutAt,
            note: AUTO_PUNCH_OUT_REASON,
          },
        },
      },
      include: attendanceInclude,
    });
  }

  private breakDurationMinutes(startedAt: Date, endedAt: Date): number {
    return Math.max(0, Math.ceil((endedAt.getTime() - startedAt.getTime()) / 60000));
  }

  private totalBreakMinutes(
    breaks: Array<{ startedAt: Date; endedAt: Date | null; durationMinutes?: number | null }>,
  ): number {
    return breaks.reduce((total, item) => {
      if (typeof item.durationMinutes === 'number') return total + item.durationMinutes;
      if (!item.endedAt) return total;
      return total + this.breakDurationMinutes(item.startedAt, item.endedAt);
    }, 0);
  }
}

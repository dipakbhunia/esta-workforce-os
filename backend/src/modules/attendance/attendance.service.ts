import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceCloseReason,
  AttendanceCloseSource,
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
import {
  AttendanceDetailResponseDto,
  AttendanceResponseDto,
  AttendanceTimelineEventDto,
  AttendanceTimelineResponseDto,
} from './dto/attendance-response.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';
import {
  dateKey,
  dateOnly,
  expectedShiftMinutes,
  zonedDateTimeToUtc,
} from './attendance-time.util';
import { TimeBoundaryService } from './time-boundary.service';

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

type AttendanceWithDetails = Prisma.AttendanceGetPayload<{
  include: typeof attendanceInclude;
}>;

const AUTO_PUNCH_OUT_REASON = 'Break duration exceeded';
const HEARTBEAT_LOSS_REASON = 'Device offline / heartbeat lost';
const PREVIOUS_DAY_CLOSE_REASON = 'Previous attendance day auto closed';

type AttendanceCurrentState =
  | 'READY_TO_PUNCH_IN'
  | 'PUNCHED_IN'
  | 'ON_BREAK'
  | 'PUNCHED_OUT'
  | 'AUTO_PUNCHED_OUT';

type AttendancePolicyConfig = {
  attendanceDayStartTime: string;
  allowMultiplePunchSessions: boolean;
  autoClosePreviousDayOpenSession: boolean;
  autoCloseEnabled: boolean;
  disconnectGraceMinutes: number;
  postShiftGraceMinutes: number;
  maximumOpenSessionMinutes: number;
  noHeartbeatFallbackMinutes: number;
};

type AutoClosePolicyConfig = Pick<
  AttendancePolicyConfig,
  | 'autoCloseEnabled'
  | 'disconnectGraceMinutes'
  | 'postShiftGraceMinutes'
  | 'maximumOpenSessionMinutes'
  | 'noHeartbeatFallbackMinutes'
>;

type StaleAttendance = Prisma.AttendanceGetPayload<{
  include: {
    breaks: { include: { breakPolicy: true } };
    company: { include: { attendancePolicies: true } };
  };
}>;

type StaleAttendanceEvaluation = {
  closeReason: AttendanceCloseReason;
  reliableWorkEndAt: Date;
  systemClosedAt: Date;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  lastHeartbeatAt: Date | null;
  lastActivityAt: Date | null;
  policy: AutoClosePolicyConfig;
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeBoundary: TimeBoundaryService,
  ) {}

  async punchIn(dto: AttendanceActionDto, actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    if (!employee.shift) {
      throw new BadRequestException('An active shift is required to punch in');
    }
    const policy = await this.activeAttendancePolicy(employee.companyId);
    const now = new Date();
    const key = dateKey(
      now,
      employee.shift.timezone,
      policy.attendanceDayStartTime,
    );
    const attendanceDate = dateOnly(key);

    if (policy.autoClosePreviousDayOpenSession) {
      await this.autoClosePreviousDayOpenSessions(employee.id, attendanceDate);
    }

    const openSession = await this.prisma.attendance.findFirst({
      where: { employeeId: employee.id, punchInAt: { not: null }, punchOutAt: null },
      orderBy: { punchInAt: 'desc' },
    });
    if (openSession) {
      throw new BadRequestException('Already punched in');
    }

    if (!policy.allowMultiplePunchSessions) {
      const closedSession = await this.prisma.attendance.findFirst({
        where: {
          employeeId: employee.id,
          attendanceDate,
          punchInAt: { not: null },
          punchOutAt: { not: null },
        },
        orderBy: { punchOutAt: 'desc' },
      });
      if (closedSession) {
        throw new BadRequestException('Already punched out for this attendance day');
      }
    }

    const shiftStart = zonedDateTimeToUtc(
      key,
      employee.shift.startTime,
      employee.shift.timezone,
    );
    const shiftWindow = this.timeBoundary.resolveShiftWindow({
      workDate: key,
      startTime: employee.shift.startTime,
      endTime: employee.shift.endTime,
      timezone: employee.shift.timezone,
    });
    const lateMinutes = Math.max(
      0,
      Math.floor((now.getTime() - shiftStart.getTime()) / 60000) - 15,
    );

    return this.prisma.attendance.create({
      data: {
        companyId: employee.companyId,
        employeeId: employee.id,
        attendanceDate,
        workDate: attendanceDate,
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
        scheduledStartAt: shiftWindow.scheduledStartAt,
        scheduledEndAt: shiftWindow.scheduledEndAt,
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
        closeSource: AttendanceCloseSource.EMPLOYEE,
        closeReason: AttendanceCloseReason.NORMAL_PUNCH_OUT,
        requiresReview: false,
        lastReliableActivityAt: now,
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

  async enforceStaleAttendanceSessions(scope?: {
    companyId?: string;
    employeeId?: string;
  }): Promise<number> {
    const now = new Date();
    const openAttendances = await this.prisma.attendance.findMany({
      where: {
        punchInAt: { not: null },
        punchOutAt: null,
        ...(scope?.companyId ? { companyId: scope.companyId } : {}),
        ...(scope?.employeeId ? { employeeId: scope.employeeId } : {}),
        company: {
          attendancePolicies: {
            some: {
              isActive: true,
              autoCloseEnabled: true,
            },
          },
        },
      },
      include: {
        breaks: { include: { breakPolicy: true } },
        company: {
          include: {
            attendancePolicies: {
              where: {
                isActive: true,
              },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    const punchIns = openAttendances
      .map((attendance) => attendance.punchInAt)
      .filter((value): value is Date => Boolean(value));
    if (!punchIns.length) return 0;

    const minPunchInAt = new Date(
      Math.min(...punchIns.map((value) => value.getTime())),
    );
    const employeeIds = [...new Set(openAttendances.map((item) => item.employeeId))];
    const [heartbeats, activitySessions, screenshots] = await Promise.all([
      this.prisma.heartbeat.findMany({
        where: {
          employeeId: { in: employeeIds },
          recordedAt: { gte: minPunchInAt, lte: now },
          ...(scope?.companyId ? { companyId: scope.companyId } : {}),
        },
        orderBy: { recordedAt: 'desc' },
        select: { employeeId: true, recordedAt: true },
      }),
      this.prisma.activitySession.findMany({
        where: {
          employeeId: { in: employeeIds },
          endedAt: { gte: minPunchInAt, lte: now },
          ...(scope?.companyId ? { companyId: scope.companyId } : {}),
        },
        orderBy: { endedAt: 'desc' },
        select: { employeeId: true, endedAt: true },
      }),
      this.prisma.screenshot.findMany({
        where: {
          employeeId: { in: employeeIds },
          capturedAt: { gte: minPunchInAt, lte: now },
          deletedAt: null,
          ...(scope?.companyId ? { companyId: scope.companyId } : {}),
        },
        orderBy: { capturedAt: 'desc' },
        select: { employeeId: true, capturedAt: true },
      }),
    ]);

    let enforced = 0;
    for (const attendance of openAttendances) {
      if (!attendance.punchInAt) continue;
      const policy = this.resolveAutoClosePolicy(
        attendance.company.attendancePolicies[0],
      );
      if (!policy.autoCloseEnabled) continue;

      const latestHeartbeatAt = heartbeats.find(
        (item) =>
          item.employeeId === attendance.employeeId &&
          item.recordedAt >= attendance.punchInAt!,
      )?.recordedAt ?? null;
      const latestActivityAt = activitySessions.find(
        (item) =>
          item.employeeId === attendance.employeeId &&
          item.endedAt >= attendance.punchInAt!,
      )?.endedAt ?? null;
      const latestScreenshotAt = screenshots.find(
        (item) =>
          item.employeeId === attendance.employeeId &&
          item.capturedAt >= attendance.punchInAt!,
      )?.capturedAt ?? null;

      const evaluation = this.evaluateStaleAttendance({
        attendance,
        policy,
        now,
        latestHeartbeatAt,
        latestActivityAt,
        latestScreenshotAt,
      });
      if (!evaluation) continue;

      const closed = await this.systemAutoCloseAttendance(
        attendance,
        evaluation,
      );
      if (closed) enforced++;
    }
    return enforced;
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
    await this.enforceStaleAttendanceSessions(await this.enforcementScope(actor));
    const ownEmployee = await this.prisma.employee.findFirst({
      where: { userId: actor.id, deletedAt: null },
      include: { shift: true },
    });
    const ownPolicy = ownEmployee
      ? await this.activeAttendancePolicy(ownEmployee.companyId)
      : null;
    const date = query.date
      ? dateOnly(query.date)
      : ownEmployee?.shift && ownPolicy
        ? dateOnly(
            dateKey(
              new Date(),
              ownEmployee.shift.timezone,
              ownPolicy.attendanceDayStartTime,
            ),
          )
        : dateOnly(new Date().toISOString().slice(0, 10));
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
      include: { ...attendanceInclude, breaks: { orderBy: { startedAt: 'asc' }, include: { breakPolicy: true } } },
      orderBy: [{ punchInAt: 'asc' }],
    });
    const openOwnAttendance = ownEmployee
      ? await this.prisma.attendance.findFirst({
          where: {
            employeeId: ownEmployee.id,
            punchInAt: { not: null },
            punchOutAt: null,
          },
          include: attendanceInclude,
          orderBy: { punchInAt: 'desc' },
        })
      : null;
    const summaryRecords =
      openOwnAttendance && !records.some((record) => record.id === openOwnAttendance.id)
        ? [...records, openOwnAttendance]
        : records;
    const counts = Object.values(AttendanceStatus).reduce(
      (result, status) => ({ ...result, [status]: 0 }),
      {} as Record<AttendanceStatus, number>,
    );
    records.forEach((record) => counts[record.status]++);
    counts.ABSENT = Math.max(0, employees.length - records.length);

    const serverNow = new Date();
    const stateRecords = ownEmployee
      ? summaryRecords.filter((record) => record.employeeId === ownEmployee.id)
      : summaryRecords;
    const latestSessionRaw = [...stateRecords].sort(
      (left, right) =>
        (right.punchInAt?.getTime() ?? 0) - (left.punchInAt?.getTime() ?? 0),
    )[0] ?? null;
    const ownState = ownEmployee
      ? await this.punchInState(ownEmployee.id, date, ownPolicy ?? undefined)
      : { canPunchIn: false, currentState: 'READY_TO_PUNCH_IN' as AttendanceCurrentState };
    const totalWorkedSeconds = stateRecords.reduce(
      (total, record) => total + this.liveWorkedSeconds(record, serverNow),
      0,
    );
    const totalBreakSeconds = stateRecords.reduce(
      (total, record) => total + this.liveBreakSeconds(record.breaks, serverNow),
      0,
    );
    const sessions = summaryRecords.map((record) => this.withSessionState(record));
    const latestSession = latestSessionRaw
      ? this.withSessionState(latestSessionRaw)
      : null;
    const activeSummaryAttendance = openOwnAttendance ?? latestSessionRaw;
    const activeWorkDate = activeSummaryAttendance
      ? this.timeBoundary.toDateKey(activeSummaryAttendance.workDate ?? activeSummaryAttendance.attendanceDate)
      : date.toISOString().slice(0, 10);
    const activeShiftWindow = activeSummaryAttendance
      ? this.timeBoundary.resolveShiftWindow({
          workDate: activeWorkDate,
          startTime: activeSummaryAttendance.shiftStartTime,
          endTime: activeSummaryAttendance.shiftEndTime,
          timezone: activeSummaryAttendance.shiftTimezone,
        })
      : null;
    const latestMonitoring = activeSummaryAttendance
      ? await this.latestReliableMonitoringState(activeSummaryAttendance)
      : { lastHeartbeatAt: null, lastActivityAt: null };

    return {
      date: date.toISOString().slice(0, 10),
      serverNow: serverNow.toISOString(),
      timezone: activeSummaryAttendance?.shiftTimezone ?? ownEmployee?.shift?.timezone ?? 'UTC',
      workDate: activeWorkDate,
      attendanceDate: activeSummaryAttendance
        ? activeSummaryAttendance.attendanceDate.toISOString().slice(0, 10)
        : date.toISOString().slice(0, 10),
      scheduledStartAt:
        activeSummaryAttendance?.scheduledStartAt?.toISOString() ??
        activeShiftWindow?.scheduledStartAt.toISOString() ??
        null,
      scheduledEndAt:
        activeSummaryAttendance?.scheduledEndAt?.toISOString() ??
        activeShiftWindow?.scheduledEndAt.toISOString() ??
        null,
      nextBoundaryAt: activeShiftWindow?.scheduledEndAt.toISOString() ?? null,
      crossesMidnight: activeShiftWindow?.crossesMidnight ?? false,
      openAttendanceId: openOwnAttendance?.id ?? null,
      lastHeartbeatAt: latestMonitoring.lastHeartbeatAt?.toISOString() ?? null,
      lastActivityAt: latestMonitoring.lastActivityAt?.toISOString() ?? null,
      closeSource: activeSummaryAttendance?.closeSource ?? null,
      closeReason: activeSummaryAttendance?.closeReason ?? null,
      requiresReview: activeSummaryAttendance?.requiresReview ?? false,
      autoClosedAt: activeSummaryAttendance?.autoClosedAt?.toISOString() ?? null,
      totalEmployees: employees.length,
      recorded: records.length,
      counts,
      sessions,
      latestSession,
      canPunchIn: ownState.canPunchIn,
      currentState: ownState.currentState,
      totalWorkedSeconds,
      totalBreakSeconds,
      totalWorkedMinutes: Math.floor(totalWorkedSeconds / 60),
      totalBreakMinutes: Math.floor(totalBreakSeconds / 60),
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

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<AttendanceDetailResponseDto> {
    const attendance = await this.findVisibleAttendance(id, actor);
    return this.toDetailResponse(attendance);
  }

  async timeline(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<AttendanceTimelineResponseDto> {
    const attendance = await this.findVisibleAttendance(id, actor);
    const events: AttendanceTimelineEventDto[] = [];

    for (const log of attendance.logs) {
      events.push({
        eventId: `attendance-log:${log.id}`,
        type: log.type,
        time: log.occurredAt,
        title: log.type === AttendanceLogType.PUNCH_IN ? 'Punched in' : 'Punched out',
        description:
          log.note ??
          (log.type === AttendanceLogType.PUNCH_IN
            ? 'Employee punched in for the attendance session.'
            : 'Employee punched out from the attendance session.'),
        source: 'ATTENDANCE',
        metadata: {
          logId: log.id,
          attendanceId: attendance.id,
          note: log.note,
        },
      });
    }

    for (const breakLog of attendance.breaks) {
      events.push({
        eventId: `break-start:${breakLog.id}`,
        type: 'BREAK_START',
        time: breakLog.startedAt,
        title: `${breakLog.breakTypeName ?? 'Break'} started`,
        description:
          breakLog.note ??
          `${breakLog.breakTypeName ?? 'Break'} started for this attendance session.`,
        source: 'BREAK',
        metadata: {
          breakLogId: breakLog.id,
          breakPolicyId: breakLog.breakPolicyId,
          breakTypeCode: breakLog.breakTypeCode,
          allowedMinutes: breakLog.allowedMinutes,
          isPaid: breakLog.isPaid,
        },
      });

      if (breakLog.endedAt) {
        events.push({
          eventId: `break-end:${breakLog.id}`,
          type: 'BREAK_END',
          time: breakLog.endedAt,
          title: `${breakLog.breakTypeName ?? 'Break'} ended`,
          description: breakLog.policyViolated
            ? 'Break ended after the configured allowed duration.'
            : `${breakLog.breakTypeName ?? 'Break'} ended for this attendance session.`,
          source: 'BREAK',
          metadata: {
            breakLogId: breakLog.id,
            breakPolicyId: breakLog.breakPolicyId,
            durationMinutes: breakLog.durationMinutes,
            allowedMinutes: breakLog.allowedMinutes,
            policyViolated: breakLog.policyViolated,
            autoPunchOutAt: breakLog.autoPunchOutAt,
          },
        });
      }
    }

    if (attendance.status === AttendanceStatus.AUTO_PUNCHED_OUT && attendance.punchOutAt) {
      events.push({
        eventId: `auto-punch-out:${attendance.id}`,
        type: 'AUTO_PUNCH_OUT',
        time: attendance.punchOutAt,
        title: 'Auto punched out',
        description:
          attendance.autoPunchOutReason ??
          'Attendance session was automatically punched out by the system.',
        source: 'SYSTEM',
        metadata: {
          attendanceId: attendance.id,
          reason: attendance.autoPunchOutReason,
          closeSource: attendance.closeSource,
          closeReason: attendance.closeReason,
          requiresReview: attendance.requiresReview,
          autoClosedAt: attendance.autoClosedAt,
          systemClosedAt: attendance.systemClosedAt,
          lastReliableActivityAt: attendance.lastReliableActivityAt,
          workedMinutes: attendance.workedMinutes,
          breakMinutes: attendance.breakMinutes,
        },
      });
    }

    if (
      attendance.autoPunchOutReason?.includes(HEARTBEAT_LOSS_REASON) &&
      attendance.punchInAt
    ) {
      const latestHeartbeat = await this.prisma.heartbeat.findFirst({
        where: {
          companyId: attendance.companyId,
          employeeId: attendance.employeeId,
          recordedAt: {
            gte: attendance.punchInAt,
            ...(attendance.punchOutAt ? { lte: attendance.punchOutAt } : {}),
          },
        },
        orderBy: { recordedAt: 'desc' },
        select: {
          id: true,
          deviceId: true,
          recordedAt: true,
          idleSeconds: true,
          isOnline: true,
        },
      });

      events.push({
        eventId: `heartbeat-lost:${attendance.id}`,
        type: 'HEARTBEAT_LOST',
        time: attendance.punchOutAt ?? latestHeartbeat?.recordedAt ?? attendance.punchInAt,
        title: 'Heartbeat lost',
        description: HEARTBEAT_LOSS_REASON,
        source: 'MONITORING',
        metadata: {
          heartbeatId: latestHeartbeat?.id,
          deviceId: latestHeartbeat?.deviceId,
          lastHeartbeatAt: latestHeartbeat?.recordedAt,
          idleSeconds: latestHeartbeat?.idleSeconds,
          isOnline: latestHeartbeat?.isOnline,
        },
      });
    }

    return {
      attendanceId: attendance.id,
      events: events.sort(
        (left, right) => left.time.getTime() - right.time.getTime(),
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

  private async findVisibleAttendance(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<AttendanceWithDetails> {
    const visibility = await this.visibilityWhere(actor);
    const attendance = await this.prisma.attendance.findFirst({
      where: { id, ...visibility },
      include: attendanceInclude,
    });
    if (!attendance) throw new NotFoundException('Attendance not found');
    return attendance;
  }

  private toBaseResponse(attendance: AttendanceWithDetails): AttendanceResponseDto {
    return {
      id: attendance.id,
      employeeId: attendance.employeeId,
      employee: attendance.employee,
      employeeCode: attendance.employee.employeeCode,
      user: attendance.employee.user,
      attendanceDate: attendance.attendanceDate.toISOString().slice(0, 10),
      workDate: attendance.workDate?.toISOString().slice(0, 10) ?? null,
      punchInAt: attendance.punchInAt,
      punchOutAt: attendance.punchOutAt,
      workedMinutes: attendance.workedMinutes,
      expectedMinutes: attendance.expectedMinutes,
      breakMinutes: attendance.breakMinutes,
      status: attendance.status,
      autoPunchOutReason: attendance.autoPunchOutReason,
      closeSource: attendance.closeSource,
      closeReason: attendance.closeReason,
      autoClosedAt: attendance.autoClosedAt,
      systemClosedAt: attendance.systemClosedAt,
      requiresReview: attendance.requiresReview,
      lastReliableActivityAt: attendance.lastReliableActivityAt,
      scheduledStartAt: attendance.scheduledStartAt,
      scheduledEndAt: attendance.scheduledEndAt,
      shift: {
        startTime: attendance.shiftStartTime,
        endTime: attendance.shiftEndTime,
        timezone: attendance.shiftTimezone,
      },
      createdAt: attendance.createdAt,
      updatedAt: attendance.updatedAt,
    };
  }

  private toDetailResponse(
    attendance: AttendanceWithDetails,
  ): AttendanceDetailResponseDto {
    return {
      ...this.toBaseResponse(attendance),
      logs: attendance.logs,
      breaks: attendance.breaks.map((breakLog) => ({
        id: breakLog.id,
        breakPolicyId: breakLog.breakPolicyId,
        breakTypeName: breakLog.breakTypeName,
        breakTypeCode: breakLog.breakTypeCode,
        allowedMinutes: breakLog.allowedMinutes,
        isPaid: breakLog.isPaid,
        startedAt: breakLog.startedAt,
        endedAt: breakLog.endedAt,
        durationMinutes: breakLog.durationMinutes,
        policyViolated: breakLog.policyViolated,
        autoPunchOutAt: breakLog.autoPunchOutAt,
        note: breakLog.note,
        breakPolicy: breakLog.breakPolicy
          ? {
              id: breakLog.breakPolicy.id,
              name: breakLog.breakPolicy.name,
              code: breakLog.breakPolicy.code,
              allowedMinutes: breakLog.breakPolicy.allowedMinutes,
              isPaid: breakLog.breakPolicy.isPaid,
              autoPunchOutOnTimeout:
                breakLog.breakPolicy.autoPunchOutOnTimeout,
            }
          : null,
      })),
    };
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

  private async activeAttendancePolicy(
    companyId: string,
  ): Promise<AttendancePolicyConfig> {
    const policy = await this.prisma.attendancePolicy.findFirst({
      where: { companyId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        attendanceDayStartTime: true,
        allowMultiplePunchSessions: true,
        autoClosePreviousDayOpenSession: true,
        autoCloseEnabled: true,
        disconnectGraceMinutes: true,
        postShiftGraceMinutes: true,
        maximumOpenSessionMinutes: true,
        noHeartbeatFallbackMinutes: true,
      },
    });
    return {
      attendanceDayStartTime: policy?.attendanceDayStartTime ?? '00:00',
      allowMultiplePunchSessions: policy?.allowMultiplePunchSessions ?? true,
      autoClosePreviousDayOpenSession:
        policy?.autoClosePreviousDayOpenSession ?? true,
      autoCloseEnabled: policy?.autoCloseEnabled ?? true,
      disconnectGraceMinutes: policy?.disconnectGraceMinutes ?? 30,
      postShiftGraceMinutes: policy?.postShiftGraceMinutes ?? 60,
      maximumOpenSessionMinutes: policy?.maximumOpenSessionMinutes ?? 960,
      noHeartbeatFallbackMinutes: policy?.noHeartbeatFallbackMinutes ?? 720,
    };
  }

  private async punchInState(
    employeeId: string,
    attendanceDate: Date,
    policy?: AttendancePolicyConfig,
  ): Promise<{ canPunchIn: boolean; currentState: AttendanceCurrentState }> {
    let activePolicy = policy;
    if (!activePolicy) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { companyId: true },
      });
      activePolicy = employee
        ? await this.activeAttendancePolicy(employee.companyId)
        : {
            attendanceDayStartTime: '00:00',
            allowMultiplePunchSessions: true,
            autoClosePreviousDayOpenSession: true,
            autoCloseEnabled: true,
            disconnectGraceMinutes: 30,
            postShiftGraceMinutes: 60,
            maximumOpenSessionMinutes: 960,
            noHeartbeatFallbackMinutes: 720,
          };
    }
    const openSession = await this.prisma.attendance.findFirst({
      where: { employeeId, punchInAt: { not: null }, punchOutAt: null },
      include: { breaks: true },
      orderBy: { punchInAt: 'desc' },
    });
    if (openSession) {
      return {
        canPunchIn: false,
        currentState: openSession.breaks.some((breakLog) => !breakLog.endedAt)
          ? 'ON_BREAK'
          : 'PUNCHED_IN',
      };
    }

    const latestSameDay = await this.prisma.attendance.findFirst({
      where: { employeeId, attendanceDate, punchInAt: { not: null } },
      orderBy: { punchInAt: 'desc' },
    });
    if (!latestSameDay) {
      return { canPunchIn: true, currentState: 'READY_TO_PUNCH_IN' };
    }
    return {
      canPunchIn: activePolicy.allowMultiplePunchSessions,
      currentState:
        latestSameDay.status === AttendanceStatus.AUTO_PUNCHED_OUT
          ? 'AUTO_PUNCHED_OUT'
          : 'PUNCHED_OUT',
    };
  }

  private async autoClosePreviousDayOpenSessions(
    employeeId: string,
    currentAttendanceDate: Date,
  ): Promise<number> {
    const openSessions = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        attendanceDate: { lt: currentAttendanceDate },
        punchInAt: { not: null },
        punchOutAt: null,
      },
      include: { breaks: { include: { breakPolicy: true } } },
    });

    let closed = 0;
    for (const session of openSessions) {
      const policy = await this.activeAttendancePolicy(session.companyId);
      const nextDate = new Date(session.attendanceDate);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const nextKey = nextDate.toISOString().slice(0, 10);
      const boundary = zonedDateTimeToUtc(
        nextKey,
        policy.attendanceDayStartTime,
        session.shiftTimezone,
      );
      const punchOutAt =
        boundary.getTime() > session.punchInAt!.getTime()
          ? boundary
          : session.punchInAt!;
      const adjustedBreaks = await Promise.all(
        session.breaks.map(async (breakLog) => {
          if (breakLog.endedAt) return breakLog;
          const durationMinutes = this.breakDurationMinutes(
            breakLog.startedAt,
            punchOutAt,
          );
          await this.prisma.breakLog.update({
            where: { id: breakLog.id },
            data: {
              endedAt: punchOutAt,
              durationMinutes,
              policyViolated:
                breakLog.allowedMinutes !== null &&
                breakLog.allowedMinutes !== undefined &&
                durationMinutes > breakLog.allowedMinutes,
            },
          });
          return { ...breakLog, endedAt: punchOutAt, durationMinutes };
        }),
      );
      const breakMinutes = this.totalBreakMinutes(adjustedBreaks);
      const workedMinutes = Math.max(
        0,
        Math.floor((punchOutAt.getTime() - session.punchInAt!.getTime()) / 60000) -
          breakMinutes,
      );
      await this.prisma.attendance.update({
        where: { id: session.id },
        data: {
          punchOutAt,
          breakMinutes,
          workedMinutes,
          status: AttendanceStatus.AUTO_PUNCHED_OUT,
          autoPunchOutReason: PREVIOUS_DAY_CLOSE_REASON,
          closeSource: AttendanceCloseSource.SYSTEM,
          closeReason: AttendanceCloseReason.PREVIOUS_DAY_AUTO_CLOSE,
          autoClosedAt: new Date(),
          systemClosedAt: new Date(),
          requiresReview: true,
          lastReliableActivityAt: punchOutAt,
          notes: session.notes
            ? `${session.notes}; ${PREVIOUS_DAY_CLOSE_REASON}`
            : PREVIOUS_DAY_CLOSE_REASON,
          logs: {
            create: {
              type: AttendanceLogType.PUNCH_OUT,
              occurredAt: punchOutAt,
              note: PREVIOUS_DAY_CLOSE_REASON,
            },
          },
        },
      });
      closed++;
    }
    return closed;
  }
  private validateDateRange(from?: string, to?: string): void {
    if (from && to && dateOnly(from) > dateOnly(to)) {
      throw new BadRequestException('dateFrom must not be after dateTo');
    }
  }

  private async enforcementScope(actor: AuthenticatedUser): Promise<{
    companyId?: string;
    employeeId?: string;
  }> {
    if (
      actor.roles.includes(RoleName.COMPANY_ADMIN) ||
      actor.roles.includes(RoleName.HR)
    ) {
      return actor.companyId ? { companyId: actor.companyId } : {};
    }
    const own = await this.prisma.employee.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true, companyId: true },
    });
    return own ? { companyId: own.companyId, employeeId: own.id } : {};
  }

  private resolveAutoClosePolicy(
    policy?: Partial<AttendancePolicyConfig> | null,
  ): AutoClosePolicyConfig {
    return {
      autoCloseEnabled: policy?.autoCloseEnabled ?? true,
      disconnectGraceMinutes: this.positiveMinutes(
        policy?.disconnectGraceMinutes,
        30,
      ),
      postShiftGraceMinutes: this.positiveMinutes(
        policy?.postShiftGraceMinutes,
        60,
      ),
      maximumOpenSessionMinutes: this.positiveMinutes(
        policy?.maximumOpenSessionMinutes,
        960,
      ),
      noHeartbeatFallbackMinutes: this.positiveMinutes(
        policy?.noHeartbeatFallbackMinutes,
        720,
      ),
    };
  }

  private evaluateStaleAttendance(input: {
    attendance: StaleAttendance;
    policy: AutoClosePolicyConfig;
    now: Date;
    latestHeartbeatAt: Date | null;
    latestActivityAt: Date | null;
    latestScreenshotAt: Date | null;
  }): StaleAttendanceEvaluation | null {
    const { attendance, policy, now } = input;
    if (!attendance.punchInAt || !policy.autoCloseEnabled) return null;

    const workDate = this.timeBoundary.toDateKey(
      attendance.workDate ?? attendance.attendanceDate,
    );
    const shiftWindow = this.timeBoundary.resolveShiftWindow({
      workDate,
      startTime: attendance.shiftStartTime,
      endTime: attendance.shiftEndTime,
      timezone: attendance.shiftTimezone,
    });
    const scheduledStartAt = attendance.scheduledStartAt ?? shiftWindow.scheduledStartAt;
    const scheduledEndAt = attendance.scheduledEndAt ?? shiftWindow.scheduledEndAt;
    const maximumBoundary = new Date(
      attendance.punchInAt.getTime() + policy.maximumOpenSessionMinutes * 60000,
    );
    const postShiftBoundary = new Date(
      scheduledEndAt.getTime() + policy.postShiftGraceMinutes * 60000,
    );
    const noHeartbeatBoundary = new Date(
      attendance.punchInAt.getTime() + policy.noHeartbeatFallbackMinutes * 60000,
    );

    const reliableWorkEndAt = this.latestReliableTimestamp({
      punchInAt: attendance.punchInAt,
      now,
      maximumBoundary,
      values: [
        input.latestActivityAt,
        input.latestHeartbeatAt,
        input.latestScreenshotAt,
      ],
    });
    const disconnectBoundary = reliableWorkEndAt
      ? new Date(reliableWorkEndAt.getTime() + policy.disconnectGraceMinutes * 60000)
      : noHeartbeatBoundary;

    let closeReason: AttendanceCloseReason | null = null;
    if (now >= maximumBoundary) {
      closeReason = AttendanceCloseReason.MAX_SESSION_EXCEEDED;
    } else if (!reliableWorkEndAt && now >= noHeartbeatBoundary) {
      closeReason = AttendanceCloseReason.SYSTEM_SHUTDOWN_UNCONFIRMED;
    } else if (now >= postShiftBoundary && now >= disconnectBoundary) {
      closeReason = reliableWorkEndAt
        ? AttendanceCloseReason.MISSED_PUNCH_OUT
        : AttendanceCloseReason.SYSTEM_SHUTDOWN_UNCONFIRMED;
    }

    if (!closeReason) return null;

    const fallbackEndAt =
      closeReason === AttendanceCloseReason.MAX_SESSION_EXCEEDED
        ? maximumBoundary
        : attendance.punchInAt;
    return {
      closeReason,
      reliableWorkEndAt: reliableWorkEndAt ?? fallbackEndAt,
      systemClosedAt: now,
      scheduledStartAt,
      scheduledEndAt,
      lastHeartbeatAt: input.latestHeartbeatAt,
      lastActivityAt: input.latestActivityAt ?? input.latestScreenshotAt,
      policy,
    };
  }

  private latestReliableTimestamp(input: {
    punchInAt: Date;
    now: Date;
    maximumBoundary: Date;
    values: Array<Date | null>;
  }): Date | null {
    const latest = input.values
      .filter((value): value is Date => Boolean(value))
      .filter(
        (value) =>
          value >= input.punchInAt &&
          value <= input.now &&
          value <= input.maximumBoundary,
      )
      .sort((left, right) => right.getTime() - left.getTime())[0];
    return latest ?? null;
  }

  private async latestReliableMonitoringState(attendance: {
    companyId: string;
    employeeId: string;
    punchInAt: Date | null;
    punchOutAt?: Date | null;
  }): Promise<{ lastHeartbeatAt: Date | null; lastActivityAt: Date | null }> {
    if (!attendance.punchInAt) {
      return { lastHeartbeatAt: null, lastActivityAt: null };
    }
    const end = attendance.punchOutAt ?? new Date();
    const [heartbeat, activity, screenshot] = await Promise.all([
      this.prisma.heartbeat.findFirst({
        where: {
          companyId: attendance.companyId,
          employeeId: attendance.employeeId,
          recordedAt: { gte: attendance.punchInAt, lte: end },
        },
        orderBy: { recordedAt: 'desc' },
        select: { recordedAt: true },
      }),
      this.prisma.activitySession.findFirst({
        where: {
          companyId: attendance.companyId,
          employeeId: attendance.employeeId,
          endedAt: { gte: attendance.punchInAt, lte: end },
        },
        orderBy: { endedAt: 'desc' },
        select: { endedAt: true },
      }),
      this.prisma.screenshot.findFirst({
        where: {
          companyId: attendance.companyId,
          employeeId: attendance.employeeId,
          capturedAt: { gte: attendance.punchInAt, lte: end },
          deletedAt: null,
        },
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true },
      }),
    ]);
    const lastActivityAt = [activity?.endedAt, screenshot?.capturedAt]
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    return {
      lastHeartbeatAt: heartbeat?.recordedAt ?? null,
      lastActivityAt,
    };
  }

  private async systemAutoCloseAttendance(
    attendance: StaleAttendance,
    evaluation: StaleAttendanceEvaluation,
  ): Promise<boolean> {
    const punchOutAt =
      evaluation.reliableWorkEndAt < attendance.punchInAt!
        ? attendance.punchInAt!
        : evaluation.reliableWorkEndAt;
    const adjustedBreaks = await Promise.all(
      attendance.breaks.map(async (breakLog) => {
        if (breakLog.endedAt) return breakLog;
        const breakEndAt =
          punchOutAt > breakLog.startedAt ? punchOutAt : breakLog.startedAt;
        const durationMinutes = this.breakDurationMinutes(
          breakLog.startedAt,
          breakEndAt,
        );
        await this.prisma.breakLog.update({
          where: { id: breakLog.id },
          data: {
            endedAt: breakEndAt,
            durationMinutes,
            policyViolated:
              breakLog.allowedMinutes !== null &&
              breakLog.allowedMinutes !== undefined &&
              durationMinutes > breakLog.allowedMinutes,
          },
        });
        return { ...breakLog, endedAt: breakEndAt, durationMinutes };
      }),
    );
    const breakMinutes = this.totalBreakMinutes(adjustedBreaks);
    const workedMinutes = Math.max(
      0,
      Math.floor((punchOutAt.getTime() - attendance.punchInAt!.getTime()) / 60000) -
        breakMinutes,
    );
    const note = this.closeReasonMessage(evaluation.closeReason);
    const result = await this.prisma.attendance.updateMany({
      where: {
        id: attendance.id,
        punchOutAt: null,
      },
      data: {
        punchOutAt,
        breakMinutes,
        workedMinutes,
        status: AttendanceStatus.AUTO_PUNCHED_OUT,
        autoPunchOutReason: note,
        closeSource: AttendanceCloseSource.SYSTEM,
        closeReason: evaluation.closeReason,
        autoClosedAt: evaluation.systemClosedAt,
        systemClosedAt: evaluation.systemClosedAt,
        requiresReview: true,
        lastReliableActivityAt: punchOutAt,
        scheduledStartAt: evaluation.scheduledStartAt,
        scheduledEndAt: evaluation.scheduledEndAt,
        notes: attendance.notes ? `${attendance.notes}; ${note}` : note,
      },
    });
    if (result.count === 0) return false;

    await this.prisma.attendanceLog.create({
      data: {
        attendanceId: attendance.id,
        type: AttendanceLogType.PUNCH_OUT,
        occurredAt: punchOutAt,
        note,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        companyId: attendance.companyId,
        action: 'ATTENDANCE_SYSTEM_AUTO_CLOSED',
        entityType: 'Attendance',
        entityId: attendance.id,
        metadata: {
          attendanceId: attendance.id,
          employeeId: attendance.employeeId,
          evaluatedAt: evaluation.systemClosedAt.toISOString(),
          lastHeartbeatAt: evaluation.lastHeartbeatAt?.toISOString() ?? null,
          lastActivityAt: evaluation.lastActivityAt?.toISOString() ?? null,
          scheduledStartAt: evaluation.scheduledStartAt.toISOString(),
          scheduledEndAt: evaluation.scheduledEndAt.toISOString(),
          reliableWorkEndAt: punchOutAt.toISOString(),
          closeSource: AttendanceCloseSource.SYSTEM,
          closeReason: evaluation.closeReason,
          policy: evaluation.policy,
        },
      },
    });
    return true;
  }

  private positiveMinutes(value: number | null | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  private closeReasonMessage(reason: AttendanceCloseReason): string {
    switch (reason) {
      case AttendanceCloseReason.HEARTBEAT_TIMEOUT:
        return HEARTBEAT_LOSS_REASON;
      case AttendanceCloseReason.MAX_SESSION_EXCEEDED:
        return 'Maximum open attendance session exceeded';
      case AttendanceCloseReason.SYSTEM_SHUTDOWN_UNCONFIRMED:
        return 'System shutdown or heartbeat missing before punch-out';
      case AttendanceCloseReason.BREAK_DURATION_EXCEEDED:
        return AUTO_PUNCH_OUT_REASON;
      case AttendanceCloseReason.PREVIOUS_DAY_AUTO_CLOSE:
        return PREVIOUS_DAY_CLOSE_REASON;
      case AttendanceCloseReason.DEVICE_OFFLINE:
      case AttendanceCloseReason.MISSED_PUNCH_OUT:
      default:
        return 'Missed punch-out auto closed by system';
    }
  }

  private async autoPunchOutForHeartbeatLoss(
    attendance: Prisma.AttendanceGetPayload<{
      include: {
        breaks: { include: { breakPolicy: true } };
        company: { include: { attendancePolicies: true } };
      };
    }>,
    punchOutAt: Date,
  ) {
    const adjustedBreaks = await Promise.all(
      attendance.breaks.map(async (breakLog) => {
        if (breakLog.endedAt) return breakLog;
        const durationMinutes = this.breakDurationMinutes(
          breakLog.startedAt,
          punchOutAt,
        );
        await this.prisma.breakLog.update({
          where: { id: breakLog.id },
          data: {
            endedAt: punchOutAt,
            durationMinutes,
            policyViolated:
              breakLog.allowedMinutes !== null &&
              breakLog.allowedMinutes !== undefined &&
              durationMinutes > breakLog.allowedMinutes,
          },
        });
        return { ...breakLog, endedAt: punchOutAt, durationMinutes };
      }),
    );
    const breakMinutes = this.totalBreakMinutes(adjustedBreaks);
    const workedMinutes = Math.max(
      0,
      Math.floor((punchOutAt.getTime() - attendance.punchInAt!.getTime()) / 60000) -
        breakMinutes,
    );

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        punchOutAt,
        breakMinutes,
        workedMinutes,
        status: AttendanceStatus.AUTO_PUNCHED_OUT,
        autoPunchOutReason: HEARTBEAT_LOSS_REASON,
        closeSource: AttendanceCloseSource.SYSTEM,
        closeReason: AttendanceCloseReason.HEARTBEAT_TIMEOUT,
        autoClosedAt: new Date(),
        systemClosedAt: new Date(),
        requiresReview: true,
        lastReliableActivityAt: punchOutAt,
        notes: attendance.notes
          ? `${attendance.notes}; ${HEARTBEAT_LOSS_REASON}`
          : HEARTBEAT_LOSS_REASON,
        logs: {
          create: {
            type: AttendanceLogType.PUNCH_OUT,
            occurredAt: punchOutAt,
            note: HEARTBEAT_LOSS_REASON,
          },
        },
      },
      include: attendanceInclude,
    });
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
        closeSource: AttendanceCloseSource.SYSTEM,
        closeReason: AttendanceCloseReason.BREAK_DURATION_EXCEEDED,
        autoClosedAt: timeoutAt,
        systemClosedAt: new Date(),
        requiresReview: true,
        lastReliableActivityAt: timeoutAt,
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

  private withSessionState<T extends { punchInAt: Date | null; punchOutAt: Date | null }>(
    record: T,
  ): T & { isOpen: boolean } {
    return {
      ...record,
      isOpen: Boolean(record.punchInAt && !record.punchOutAt),
    };
  }

  private liveWorkedSeconds(
    record: {
      punchInAt: Date | null;
      punchOutAt: Date | null;
      breaks: Array<{ startedAt: Date; endedAt: Date | null }>;
    },
    now: Date,
  ): number {
    if (!record.punchInAt) return 0;
    const end = record.punchOutAt ?? now;
    const elapsedSeconds = Math.max(
      0,
      Math.floor((end.getTime() - record.punchInAt.getTime()) / 1000),
    );
    return Math.max(0, elapsedSeconds - this.liveBreakSeconds(record.breaks, end));
  }

  private liveBreakSeconds(
    breaks: Array<{ startedAt: Date; endedAt: Date | null }>,
    now: Date,
  ): number {
    return breaks.reduce((total, breakLog) => {
      const end = breakLog.endedAt ?? now;
      return (
        total +
        Math.max(
          0,
          Math.floor((end.getTime() - breakLog.startedAt.getTime()) / 1000),
        )
      );
    }, 0);
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

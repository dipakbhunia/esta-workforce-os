import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeStatus,
  MonitoringDeviceStatus,
  Prisma,
  RoleName,
} from '@prisma/client';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { LiveStatusQueryDto, LiveStatusValue } from './dto/live-status-query.dto';
import { LiveAttendanceState, LiveHeartbeatState, LiveStatusResponseDto } from './dto/live-status-response.dto';
import { MonitoringSummaryQueryDto } from './dto/monitoring-summary-query.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UploadActivityDto } from './dto/upload-activity.dto';
import { UploadScreenshotDto } from './dto/upload-screenshot.dto';

const DEFAULT_HEARTBEAT_TIMEOUT_MINUTES = 30;

const deviceSelect = {
  id: true,
  deviceIdentifier: true,
  deviceName: true,
  platform: true,
  osVersion: true,
  appVersion: true,
  status: true,
  lastSeenAt: true,
  registeredAt: true,
} satisfies Prisma.MonitoringDeviceSelect;

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
  ) {}

  async registerDevice(dto: RegisterDeviceDto, actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    return this.prisma.monitoringDevice.upsert({
      where: {
        employeeId_deviceIdentifier: {
          employeeId: employee.id,
          deviceIdentifier: dto.deviceIdentifier.trim(),
        },
      },
      create: {
        companyId: employee.companyId,
        employeeId: employee.id,
        deviceIdentifier: dto.deviceIdentifier.trim(),
        deviceName: dto.deviceName.trim(),
        platform: dto.platform.trim().toLowerCase(),
        osVersion: dto.osVersion?.trim(),
        appVersion: dto.appVersion?.trim(),
        lastSeenAt: new Date(),
      },
      update: {
        deviceName: dto.deviceName.trim(),
        platform: dto.platform.trim().toLowerCase(),
        osVersion: dto.osVersion?.trim(),
        appVersion: dto.appVersion?.trim(),
        status: MonitoringDeviceStatus.ACTIVE,
        lastSeenAt: new Date(),
        deletedAt: null,
      },
      select: deviceSelect,
    });
  }

  async receiveHeartbeat(dto: HeartbeatDto, actor: AuthenticatedUser) {
    const device = await this.ownedActiveDevice(dto.deviceId, actor);
    const enforcedStaleSessions =
      await this.attendanceService.enforceStaleAttendanceSessions({
        companyId: device.companyId,
        employeeId: device.employeeId,
      });
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    const [heartbeat] = await this.prisma.$transaction([
      this.prisma.heartbeat.create({
        data: {
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          recordedAt,
          idleSeconds: dto.idleSeconds,
          isOnline: dto.isOnline,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      }),
      this.prisma.monitoringDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: recordedAt },
      }),
    ]);
    return { ...heartbeat, enforcedStaleSessions };
  }

  async uploadActivity(dto: UploadActivityDto, actor: AuthenticatedUser) {
    const device = await this.ownedActiveDevice(dto.deviceId, actor);
    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);
    this.assertPeriod(startedAt, endedAt, 'Activity session');
    dto.applications?.forEach((usage) =>
      this.assertPeriod(
        new Date(usage.startedAt),
        new Date(usage.endedAt),
        'Application usage',
      ),
    );
    dto.websites?.forEach((usage) =>
      this.assertPeriod(
        new Date(usage.startedAt),
        new Date(usage.endedAt),
        'Website usage',
      ),
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const session = await tx.activitySession.create({
          data: {
            companyId: device.companyId,
            employeeId: device.employeeId,
            deviceId: device.id,
            clientSessionId: dto.clientSessionId.trim(),
            startedAt,
            endedAt,
            activeSeconds: dto.activeSeconds,
            idleSeconds: dto.idleSeconds,
            keystrokeCount: dto.keystrokeCount,
            mouseClickCount: dto.mouseClickCount,
            metadata: dto.metadata as Prisma.InputJsonValue | undefined,
            applicationUsages: dto.applications?.length
              ? {
                  create: dto.applications.map((usage) => ({
                    companyId: device.companyId,
                    employeeId: device.employeeId,
                    deviceId: device.id,
                    applicationName: usage.applicationName.trim(),
                    windowTitle: usage.windowTitle?.trim(),
                    startedAt: new Date(usage.startedAt),
                    endedAt: new Date(usage.endedAt),
                    durationSeconds: usage.durationSeconds,
                  })),
                }
              : undefined,
            websiteUsages: dto.websites?.length
              ? {
                  create: dto.websites.map((usage) => ({
                    companyId: device.companyId,
                    employeeId: device.employeeId,
                    deviceId: device.id,
                    browserName: usage.browserName?.trim(),
                    domain: usage.domain.trim().toLowerCase(),
                    url: usage.url?.trim(),
                    pageTitle: usage.pageTitle?.trim(),
                    startedAt: new Date(usage.startedAt),
                    endedAt: new Date(usage.endedAt),
                    durationSeconds: usage.durationSeconds,
                  })),
                }
              : undefined,
          },
          include: {
            applicationUsages: true,
            websiteUsages: true,
          },
        });
        await tx.monitoringDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: endedAt },
        });
        return session;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Activity session was already uploaded');
      }
      throw error;
    }
  }

  async uploadScreenshot(dto: UploadScreenshotDto, actor: AuthenticatedUser) {
    const device = await this.ownedActiveDevice(dto.deviceId, actor);
    try {
      return await this.prisma.screenshot.create({
        data: {
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          clientScreenshotId: dto.clientScreenshotId.trim(),
          capturedAt: new Date(dto.capturedAt),
          storageKey: dto.storageKey.trim(),
          mimeType: dto.mimeType.trim().toLowerCase(),
          sizeBytes: dto.sizeBytes,
          width: dto.width,
          height: dto.height,
          checksum: dto.checksum?.trim(),
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Screenshot metadata was already uploaded');
      }
      throw error;
    }
  }

  async liveStatus(query: LiveStatusQueryDto, actor: AuthenticatedUser) {
    const visibility = await this.employeeVisibilityWhere(actor);
    const filters: Prisma.EmployeeWhereInput[] = [
      visibility,
      { deletedAt: null, status: EmployeeStatus.ACTIVE },
    ];
    if (query.branchId) filters.push({ branchId: query.branchId });
    if (query.departmentId) filters.push({ departmentId: query.departmentId });
    if (query.search) {
      filters.push({
        OR: [
          { employeeCode: { contains: query.search, mode: 'insensitive' } },
          { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
          { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.EmployeeWhereInput = { AND: filters };
    const employees = await this.prisma.employee.findMany({
      where,
      orderBy: { employeeCode: 'asc' },
      select: this.liveStatusEmployeeSelect(),
    });
    const statuses = await Promise.all(
      employees.map((employee) => this.buildLiveStatus(employee)),
    );
    const filtered = query.status
      ? statuses.filter((item) => item.status === query.status)
      : statuses;
    const total = filtered.length;
    const start = (query.page - 1) * query.limit;
    return paginatedResult(filtered.slice(start, start + query.limit), total, query);
  }

  async liveStatusByEmployee(
    employeeId: string,
    actor: AuthenticatedUser,
  ): Promise<LiveStatusResponseDto> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
        status: EmployeeStatus.ACTIVE,
        AND: [await this.employeeVisibilityWhere(actor)],
      },
      select: this.liveStatusEmployeeSelect(),
    });
    if (!employee) throw new NotFoundException('Employee live status not found');
    return this.buildLiveStatus(employee);
  }

  async summary(query: MonitoringSummaryQueryDto, actor: AuthenticatedUser) {
    const range = this.dateRange(query);
    const visibility = await this.employeeVisibilityWhere(actor);
    const filters: Prisma.EmployeeWhereInput[] = [
      visibility,
      { deletedAt: null },
    ];
    if (query.employeeId) filters.push({ id: query.employeeId });
    if (query.deviceId) {
      filters.push({
        monitoringDevices: {
          some: { id: query.deviceId, deletedAt: null },
        },
      });
    }
    if (query.search) {
      filters.push({
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
          {
            user: {
              email: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          },
        ],
      });
    }
    const where: Prisma.EmployeeWhereInput = { AND: filters };
    const [employees, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { employeeCode: 'asc' },
        select: {
          id: true,
          employeeCode: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.employee.count({ where }),
    ]);
    const data = await Promise.all(
      employees.map(async (employee) => {
        const deviceFilter = query.deviceId
          ? { deviceId: query.deviceId }
          : {};
        const [
          devices,
          latestHeartbeat,
          activity,
          screenshots,
          applicationUsage,
          websiteUsage,
        ] = await this.prisma.$transaction([
          this.prisma.monitoringDevice.findMany({
            where: {
              employeeId: employee.id,
              deletedAt: null,
              ...(query.deviceId ? { id: query.deviceId } : {}),
            },
            select: deviceSelect,
            orderBy: { registeredAt: 'desc' },
          }),
          this.prisma.heartbeat.findFirst({
            where: {
              employeeId: employee.id,
              ...deviceFilter,
              recordedAt: range,
            },
            orderBy: { recordedAt: 'desc' },
          }),
          this.prisma.activitySession.aggregate({
            where: {
              employeeId: employee.id,
              ...deviceFilter,
              startedAt: range,
            },
            _count: { _all: true },
            _sum: { activeSeconds: true, idleSeconds: true },
          }),
          this.prisma.screenshot.count({
            where: {
              employeeId: employee.id,
              ...deviceFilter,
              capturedAt: range,
              deletedAt: null,
            },
          }),
          this.prisma.applicationUsage.aggregate({
            where: {
              employeeId: employee.id,
              ...deviceFilter,
              startedAt: range,
            },
            _sum: { durationSeconds: true },
            _count: { _all: true },
          }),
          this.prisma.websiteUsage.aggregate({
            where: {
              employeeId: employee.id,
              ...deviceFilter,
              startedAt: range,
            },
            _sum: { durationSeconds: true },
            _count: { _all: true },
          }),
        ]);
        return {
          employee,
          devices,
          latestHeartbeat,
          activity: {
            sessions: activity._count._all,
            activeSeconds: activity._sum.activeSeconds ?? 0,
            idleSeconds: activity._sum.idleSeconds ?? 0,
          },
          screenshots,
          applications: {
            entries: applicationUsage._count._all,
            durationSeconds: applicationUsage._sum.durationSeconds ?? 0,
          },
          websites: {
            entries: websiteUsage._count._all,
            durationSeconds: websiteUsage._sum.durationSeconds ?? 0,
          },
        };
      }),
    );
    return {
      ...paginatedResult(data, total, query),
      range: {
        from: range.gte?.toISOString(),
        to: range.lte?.toISOString(),
      },
    };
  }

  private liveStatusEmployeeSelect() {
    return {
      id: true,
      employeeCode: true,
      companyId: true,
      user: {
        select: { firstName: true, lastName: true, email: true },
      },
      company: {
        select: {
          attendancePolicies: {
            where: { isActive: true },
            orderBy: { updatedAt: 'desc' as const },
            take: 1,
            select: { heartbeatTimeoutMinutes: true },
          },
        },
      },
      attendances: {
        where: { punchInAt: { not: null } },
        orderBy: { punchInAt: 'desc' as const },
        take: 1,
        select: {
          id: true,
          punchInAt: true,
          punchOutAt: true,
          status: true,
          breaks: {
            orderBy: { startedAt: 'desc' as const },
            take: 1,
            select: { endedAt: true },
          },
        },
      },
      heartbeats: {
        orderBy: { recordedAt: 'desc' as const },
        take: 1,
        select: {
          recordedAt: true,
          isOnline: true,
          device: { select: deviceSelect },
        },
      },
      monitoringDevices: {
        where: { deletedAt: null },
        orderBy: { lastSeenAt: 'desc' as const },
        take: 1,
        select: deviceSelect,
      },
    } satisfies Prisma.EmployeeSelect;
  }

  private buildLiveStatus(
    employee: Prisma.EmployeeGetPayload<{
      select: ReturnType<MonitoringService['liveStatusEmployeeSelect']>;
    }>,
  ): LiveStatusResponseDto {
    const latestAttendance = employee.attendances[0] ?? null;
    const latestHeartbeat = employee.heartbeats[0] ?? null;
    const fallbackDevice = employee.monitoringDevices[0] ?? null;
    const device = latestHeartbeat?.device ?? fallbackDevice;
    const isOpen = Boolean(latestAttendance?.punchInAt && !latestAttendance.punchOutAt);
    const isOnBreak = Boolean(
      isOpen && latestAttendance?.breaks.some((breakLog) => !breakLog.endedAt),
    );
    const attendanceState = this.liveAttendanceState(
      latestAttendance,
      isOpen,
      isOnBreak,
    );
    const heartbeatTimeoutMinutes =
      employee.company.attendancePolicies[0]?.heartbeatTimeoutMinutes ??
      DEFAULT_HEARTBEAT_TIMEOUT_MINUTES;
    const heartbeatState = this.liveHeartbeatState(
      latestHeartbeat?.recordedAt ?? null,
      latestHeartbeat?.isOnline ?? false,
      heartbeatTimeoutMinutes,
      isOpen,
    );
    const status = this.normalizedLiveStatus(
      attendanceState,
      heartbeatState,
      isOpen,
    );

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      user: {
        name: `${employee.user.firstName} ${employee.user.lastName}`.trim(),
        email: employee.user.email,
      },
      status,
      attendanceState,
      heartbeatState,
      lastHeartbeatAt: latestHeartbeat?.recordedAt.toISOString() ?? null,
      isOnBreak,
      punchedInAt: latestAttendance?.punchInAt?.toISOString() ?? null,
      punchedOutAt: latestAttendance?.punchOutAt?.toISOString() ?? null,
      device: device
        ? {
            id: device.id,
            name: device.deviceName,
            platform: device.platform,
            status: device.status,
          }
        : null,
    };
  }

  private liveAttendanceState(
    attendance:
      | {
          punchInAt: Date | null;
          punchOutAt: Date | null;
          status: string;
        }
      | null,
    isOpen: boolean,
    isOnBreak: boolean,
  ): LiveAttendanceState {
    if (!attendance) return LiveAttendanceState.READY_TO_PUNCH_IN;
    if (isOpen && isOnBreak) return LiveAttendanceState.ON_BREAK;
    if (isOpen) return LiveAttendanceState.PUNCHED_IN;
    if (attendance.status === 'AUTO_PUNCHED_OUT') {
      return LiveAttendanceState.AUTO_PUNCHED_OUT;
    }
    return LiveAttendanceState.PUNCHED_OUT;
  }

  private liveHeartbeatState(
    lastHeartbeatAt: Date | null,
    isOnline: boolean,
    timeoutMinutes: number,
    hasOpenAttendance: boolean,
  ): LiveHeartbeatState {
    if (!lastHeartbeatAt || !hasOpenAttendance || !isOnline) {
      return LiveHeartbeatState.OFFLINE;
    }
    const timeoutMs = Math.max(timeoutMinutes, 1) * 60000;
    const isFresh = Date.now() - lastHeartbeatAt.getTime() <= timeoutMs;
    return isFresh ? LiveHeartbeatState.ONLINE : LiveHeartbeatState.AWAY;
  }

  private normalizedLiveStatus(
    attendanceState: LiveAttendanceState,
    heartbeatState: LiveHeartbeatState,
    hasOpenAttendance: boolean,
  ): LiveStatusValue {
    if (attendanceState === LiveAttendanceState.AUTO_PUNCHED_OUT) {
      return LiveStatusValue.AUTO_PUNCHED_OUT;
    }
    if (attendanceState === LiveAttendanceState.PUNCHED_OUT) {
      return LiveStatusValue.PUNCHED_OUT;
    }
    if (!hasOpenAttendance) return LiveStatusValue.OFFLINE;
    if (heartbeatState === LiveHeartbeatState.AWAY) return LiveStatusValue.AWAY;
    if (heartbeatState === LiveHeartbeatState.OFFLINE) return LiveStatusValue.OFFLINE;
    if (attendanceState === LiveAttendanceState.ON_BREAK) return LiveStatusValue.ON_BREAK;
    if (attendanceState === LiveAttendanceState.PUNCHED_IN) return LiveStatusValue.WORKING;
    return LiveStatusValue.ONLINE;
  }

  private async ownActiveEmployee(actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actor.id,
        deletedAt: null,
        status: EmployeeStatus.ACTIVE,
      },
      select: { id: true, companyId: true },
    });
    if (!employee) {
      throw new NotFoundException('Active employee profile not found');
    }
    return employee;
  }

  private async ownedActiveDevice(id: string, actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    const device = await this.prisma.monitoringDevice.findFirst({
      where: {
        id,
        employeeId: employee.id,
        companyId: employee.companyId,
        status: MonitoringDeviceStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, companyId: true, employeeId: true },
    });
    if (!device) {
      throw new NotFoundException('Active monitoring device not found');
    }
    return device;
  }

  private async employeeVisibilityWhere(
    actor: AuthenticatedUser,
  ): Promise<Prisma.EmployeeWhereInput> {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return {};
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

  private dateRange(
    query: MonitoringSummaryQueryDto,
  ): { gte: Date; lte: Date } {
    const now = new Date();
    const defaultFrom = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const from = query.dateFrom ? new Date(query.dateFrom) : defaultFrom;
    const to = query.dateTo ? new Date(query.dateTo) : now;
    if (from > to) {
      throw new BadRequestException('dateFrom must not be after dateTo');
    }
    return { gte: from, lte: to };
  }

  private assertPeriod(startedAt: Date, endedAt: Date, label: string): void {
    if (startedAt >= endedAt) {
      throw new BadRequestException(`${label} start must be before end`);
    }
  }
}


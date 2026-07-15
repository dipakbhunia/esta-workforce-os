import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AttendanceLogType,
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
import { MonitoringReadQueryDto } from './dto/monitoring-read-query.dto';
import {
  MonitoringActivityResponseDto,
  MonitoringApplicationUsageResponseDto,
  MonitoringDeviceResponseDto,
  MonitoringEmployeeDto,
  MonitoringScreenshotResponseDto,
  MonitoringWebsiteUsageResponseDto,
} from './dto/monitoring-read-response.dto';
import { MonitoringSummaryQueryDto } from './dto/monitoring-summary-query.dto';
import {
  MonitoringTimelineEmployeeDto,
  MonitoringTimelineMarkerDto,
  MonitoringTimelineMarkerType,
  MonitoringTimelineQueryDto,
  MonitoringTimelineResponseDto,
  MonitoringTimelineSegmentDto,
  MonitoringTimelineSegmentSource,
  MonitoringTimelineSegmentType,
} from './dto/monitoring-timeline.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UploadActivityDto } from './dto/upload-activity.dto';
import { UploadScreenshotDto } from './dto/upload-screenshot.dto';
import { MinioObjectStorageService } from './minio-object-storage.service';

const DEFAULT_HEARTBEAT_TIMEOUT_MINUTES = 30;
const forbiddenActivityMetadataKeys = new Set([
  'key',
  'keycode',
  'keyname',
  'keys',
  'keyevents',
  'keypresses',
  'keystrokes',
  'pressedkeys',
  'typedtext',
  'textinput',
  'clipboard',
  'password',
  'otp',
  'keyboardcount',
  'mousecoordinates',
  'mouseclickcount',
  'coordinates',
  'mousehistory',
  'mousemovecount',
  'mousepath',
  'mousepositions',
  'rawevents',
  'keyboardevents',
  'keyboardhistory',
  'mouseevents',
  'scrollcount',
  'eventhistory',
]);
const safeActivityMetadataKeys = new Set([
  'applicationname',
  'browserdetected',
  'browsername',
  'browserprovidereavailable',
  'browserprovideravailable',
  'browserwindowtitle',
  'executable',
  'executablename',
  'idlestate',
  'inputcountsource',
  'platform',
  'privacy',
  'processid',
  'processname',
  'systemidleseconds',
  'urlavailable',
  'windowtitle',
]);
const forbiddenActivityMetadataPatterns = [
  'keystrokes',
  'typedtext',
  'textinput',
  'clipboard',
  'password',
  'otp',
  'mousecoordinates',
  'coordinates',
  'rawevents',
  'keyboardevents',
  'mouseevents',
  'keyevents',
  'eventhistory',
];
const activityMetadataInputDeviceTerms = [
  'key',
  'keyboard',
  'keystroke',
  'mouse',
  'pointer',
  'scroll',
  'input',
];
const activityMetadataSensitiveTerms = [
  'array',
  'click',
  'clicks',
  'coordinate',
  'coordinates',
  'count',
  'event',
  'history',
  'list',
  'movement',
  'moves',
  'path',
  'position',
  'positions',
  'press',
  'pressed',
  'presses',
  'raw',
  'sequence',
  'value',
  'values',
];

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

const monitoringEmployeeSelect = {
  id: true,
  employeeCode: true,
  user: {
    select: { firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.EmployeeSelect;

type TimelineSegmentDraft = Omit<MonitoringTimelineSegmentDto, 'start' | 'end'> & {
  start: Date;
  end: Date;
};

type TimelineSegmentInput = Omit<TimelineSegmentDraft, 'durationSeconds'> & {
  durationSeconds?: number;
};

type TimelineMarkerDraft = Omit<MonitoringTimelineMarkerDto, 'time'> & {
  time: Date;
};

interface TimelineUser {
  firstName: string;
  lastName: string;
  email: string;
}

interface TimelineDevice {
  id: string;
  deviceIdentifier: string;
  deviceName: string;
  platform: string;
  osVersion: string | null;
  appVersion: string | null;
  status: MonitoringDeviceStatus;
  lastSeenAt: Date | null;
  registeredAt: Date;
}

interface TimelineAttendanceLog {
  id: string;
  type: AttendanceLogType;
  occurredAt: Date;
  note: string | null;
}

interface TimelineBreakLog {
  id: string;
  breakPolicyId: string | null;
  breakTypeName: string | null;
  breakTypeCode: string | null;
  allowedMinutes: number | null;
  policyViolated: boolean;
  startedAt: Date;
  endedAt: Date | null;
  autoPunchOutAt: Date | null;
}

interface TimelineAttendance {
  id: string;
  status: string;
  punchInAt: Date | null;
  punchOutAt: Date | null;
  logs: TimelineAttendanceLog[];
  breaks: TimelineBreakLog[];
}

interface TimelineHeartbeat {
  id: string;
  recordedAt: Date;
  idleSeconds: number;
  isOnline: boolean;
  deviceId: string;
}

interface TimelineApplicationUsage {
  applicationName: string;
  windowTitle: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
}

interface TimelineWebsiteUsage {
  domain: string;
  url: string | null;
  pageTitle: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
}

interface TimelineActivitySession {
  id: string;
  deviceId: string;
  clientSessionId: string;
  startedAt: Date;
  endedAt: Date;
  activeSeconds: number;
  idleSeconds: number;
  applicationUsages: TimelineApplicationUsage[];
  websiteUsages: TimelineWebsiteUsage[];
}

interface TimelineScreenshot {
  id: string;
  capturedAt: Date;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  deviceId: string;
}

interface TimelineEmployee {
  id: string;
  employeeCode: string;
  companyId: string;
  user: TimelineUser;
  company: {
    attendancePolicies: Array<{ heartbeatTimeoutMinutes: number }>;
  };
  monitoringDevices: TimelineDevice[];
  attendances: TimelineAttendance[];
  heartbeats: TimelineHeartbeat[];
  activitySessions: TimelineActivitySession[];
  screenshots: TimelineScreenshot[];
}

interface UploadedScreenshotFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly objectStorage: MinioObjectStorageService,
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
        const keyboardCount = dto.keyboardCount ?? dto.keystrokeCount ?? 0;
        const mouseClickCount = dto.mouseClickCount ?? 0;
        const mouseMoveCount = dto.mouseMoveCount ?? 0;
        const scrollCount = dto.scrollCount ?? 0;
        const safeMetadata = this.sanitizeActivityMetadata(dto.metadata);
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
            keyboardCount,
            keystrokeCount: keyboardCount,
            mouseClickCount,
            mouseMoveCount,
            scrollCount,
            metadata: safeMetadata as Prisma.InputJsonValue | undefined,
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

  async uploadScreenshot(
    dto: UploadScreenshotDto,
    actor: AuthenticatedUser,
    file?: UploadedScreenshotFile,
  ) {
    const device = await this.ownedActiveDevice(dto.deviceId, actor);
    const clientScreenshotId = (dto.clientCaptureId ?? dto.clientScreenshotId)?.trim();
    if (!clientScreenshotId) {
      throw new BadRequestException('clientCaptureId is required');
    }
    const existing = await this.prisma.screenshot.findUnique({
      where: {
        deviceId_clientScreenshotId: {
          deviceId: device.id,
          clientScreenshotId,
        },
      },
      include: { employee: { select: monitoringEmployeeSelect } },
    });
    if (existing) return this.mapScreenshot(existing);

    const capturedAt = new Date(dto.capturedAt);
    if (!file) throw new BadRequestException('Screenshot file is required');
    const mimeType = (file?.mimetype ?? dto.mimeType).trim().toLowerCase();
    if (!['image/jpeg', 'image/webp', 'image/png'].includes(mimeType)) {
      throw new BadRequestException('Unsupported screenshot image type');
    }
    if (file && file.buffer.byteLength === 0) {
      throw new BadRequestException('Screenshot file is empty');
    }
    if (file && file.buffer.byteLength > 5 * 1024 * 1024) {
      throw new BadRequestException('Screenshot file is too large');
    }
    const imageSize = this.decodeImageSize(file.buffer, mimeType);
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const storageKey = this.screenshotObjectKey(
      device.companyId,
      device.employeeId,
      capturedAt,
      clientScreenshotId,
      extension,
    );
    const checksum = file
      ? createHash('sha256').update(file.buffer).digest('hex')
      : dto.checksum?.trim();
    const metadata = {
      ...((dto.metadata ?? {}) as Record<string, unknown>),
      attendanceId: dto.attendanceId ?? (dto.metadata as Record<string, unknown> | undefined)?.attendanceId ?? null,
      applicationName: dto.applicationName ?? (dto.metadata as Record<string, unknown> | undefined)?.applicationName ?? null,
      windowTitle: dto.windowTitle ?? (dto.metadata as Record<string, unknown> | undefined)?.windowTitle ?? null,
    };

    await this.objectStorage.putObject(storageKey, file.buffer, mimeType);

    let uploadedObject = true;
    try {
      const screenshot = await this.prisma.screenshot.create({
        data: {
          companyId: device.companyId,
          employeeId: device.employeeId,
          deviceId: device.id,
          clientScreenshotId,
          capturedAt,
          storageKey,
          mimeType,
          sizeBytes: file.buffer.byteLength,
          width: imageSize.width,
          height: imageSize.height,
          checksum,
          metadata: metadata as Prisma.InputJsonValue,
        },
        include: { employee: { select: monitoringEmployeeSelect } },
      });
      uploadedObject = false;
      return this.mapScreenshot(screenshot);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.screenshot.findUnique({
          where: {
            deviceId_clientScreenshotId: {
              deviceId: device.id,
              clientScreenshotId,
            },
          },
          include: { employee: { select: monitoringEmployeeSelect } },
        });
        if (duplicate) return this.mapScreenshot(duplicate);
        throw new ConflictException('Screenshot metadata was already uploaded');
      }
      if (uploadedObject) {
        try {
          await this.objectStorage.deleteObject(storageKey);
        } catch {
          // Preserve the original database failure while making a best-effort cleanup attempt.
        }
      }
      throw error;
    }
  }

  async viewScreenshot(id: string, actor: AuthenticatedUser) {
    const screenshot = await this.prisma.screenshot.findFirst({
      where: {
        id,
        deletedAt: null,
        employee: { is: await this.employeeReadWhere(actor, {}) },
      },
      select: { storageKey: true },
    });
    if (!screenshot) throw new NotFoundException('Screenshot not found');
    const exists = await this.objectStorage.objectExists(screenshot.storageKey);
    if (!exists) throw new NotFoundException('Screenshot object not found');
    const expiresSeconds = 300;
    return {
      url: await this.objectStorage.signedGetUrl(screenshot.storageKey, expiresSeconds),
      expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    };
  }

  async activity(query: MonitoringReadQueryDto, actor: AuthenticatedUser) {
    const where = await this.activityWhere(query, actor);
    const [records, total] = await this.prisma.$transaction([
      this.prisma.activitySession.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { startedAt: 'desc' },
        include: {
          employee: { select: monitoringEmployeeSelect },
          applicationUsages: { orderBy: { startedAt: 'asc' } },
          websiteUsages: { orderBy: { startedAt: 'asc' } },
        },
      }),
      this.prisma.activitySession.count({ where }),
    ]);
    return paginatedResult(records.map((record) => this.mapActivity(record)), total, query);
  }

  async activityByEmployee(
    employeeId: string,
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ) {
    return this.activity({ ...query, employeeId }, actor);
  }

  async screenshots(query: MonitoringReadQueryDto, actor: AuthenticatedUser) {
    const where = await this.screenshotWhere(query, actor);
    const [records, total] = await this.prisma.$transaction([
      this.prisma.screenshot.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { capturedAt: 'desc' },
        include: { employee: { select: monitoringEmployeeSelect } },
      }),
      this.prisma.screenshot.count({ where }),
    ]);
    return paginatedResult(records.map((record) => this.mapScreenshot(record)), total, query);
  }

  async screenshotsByEmployee(
    employeeId: string,
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ) {
    return this.screenshots({ ...query, employeeId }, actor);
  }

  async applications(query: MonitoringReadQueryDto, actor: AuthenticatedUser) {
    const where = await this.applicationWhere(query, actor);
    const [records, total] = await this.prisma.$transaction([
      this.prisma.applicationUsage.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { startedAt: 'desc' },
        include: { employee: { select: monitoringEmployeeSelect } },
      }),
      this.prisma.applicationUsage.count({ where }),
    ]);
    return paginatedResult(records.map((record) => this.mapApplication(record)), total, query);
  }

  async applicationsByEmployee(
    employeeId: string,
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ) {
    return this.applications({ ...query, employeeId }, actor);
  }

  async websites(query: MonitoringReadQueryDto, actor: AuthenticatedUser) {
    const where = await this.websiteWhere(query, actor);
    const [records, total] = await this.prisma.$transaction([
      this.prisma.websiteUsage.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { startedAt: 'desc' },
        include: { employee: { select: monitoringEmployeeSelect } },
      }),
      this.prisma.websiteUsage.count({ where }),
    ]);
    return paginatedResult(records.map((record) => this.mapWebsite(record)), total, query);
  }

  async websitesByEmployee(
    employeeId: string,
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ) {
    return this.websites({ ...query, employeeId }, actor);
  }

  async devices(query: MonitoringReadQueryDto, actor: AuthenticatedUser) {
    const where = await this.deviceWhere(query, actor);
    const [records, total] = await this.prisma.$transaction([
      this.prisma.monitoringDevice.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { registeredAt: 'desc' },
        include: {
          employee: { select: monitoringEmployeeSelect },
          heartbeats: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
            select: { recordedAt: true },
          },
        },
      }),
      this.prisma.monitoringDevice.count({ where }),
    ]);
    return paginatedResult(records.map((record) => this.mapDevice(record)), total, query);
  }

  async devicesByEmployee(
    employeeId: string,
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ) {
    return this.devices({ ...query, employeeId }, actor);
  }

  async timeline(
    query: MonitoringTimelineQueryDto,
    actor: AuthenticatedUser,
  ): Promise<MonitoringTimelineResponseDto> {
    const range = this.timelineRange(query);
    const effectiveRangeEnd = this.effectiveTimelineRangeEnd(
      range.start,
      range.end,
    );
    const filters: Prisma.EmployeeWhereInput[] = [
      await this.employeeVisibilityWhere(actor),
      { deletedAt: null, status: EmployeeStatus.ACTIVE },
    ];
    if (query.employeeId) filters.push({ id: query.employeeId });
    if (query.branchId) filters.push({ branchId: query.branchId });
    if (query.departmentId) filters.push({ departmentId: query.departmentId });
    if (query.teamOnly) {
      const ownEmployeeId = await this.ownEmployeeId(actor);
      if (ownEmployeeId && actor.roles.includes(RoleName.MANAGER)) {
        filters.push({ reportingManagerId: ownEmployeeId });
      } else if (ownEmployeeId && actor.roles.includes(RoleName.EMPLOYEE)) {
        filters.push({ id: ownEmployeeId });
      }
    }
    if (query.search) filters.push(this.employeeSearchWhere(query.search));

    const where: Prisma.EmployeeWhereInput = { AND: filters };
    const [employees, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { employeeCode: 'asc' },
        select: {
          id: true,
          employeeCode: true,
          companyId: true,
          user: { select: { firstName: true, lastName: true, email: true } },
          company: {
            select: {
              attendancePolicies: {
                where: { isActive: true },
                orderBy: { updatedAt: 'desc' },
                take: 1,
                select: { heartbeatTimeoutMinutes: true },
              },
            },
          },
          monitoringDevices: {
            where: { deletedAt: null },
            orderBy: [{ lastSeenAt: 'desc' }, { registeredAt: 'desc' }],
            take: 1,
            select: deviceSelect,
          },
          attendances: {
            where: {
              punchInAt: { lt: range.end },
              OR: [{ punchOutAt: null }, { punchOutAt: { gt: range.start } }],
            },
            orderBy: { punchInAt: 'asc' },
            include: {
              logs: { orderBy: { occurredAt: 'asc' } },
              breaks: { orderBy: { startedAt: 'asc' }, include: { breakPolicy: true } },
            },
          },
          heartbeats: {
            where: { recordedAt: { gte: range.start, lt: range.end } },
            orderBy: { recordedAt: 'asc' },
            select: { id: true, recordedAt: true, idleSeconds: true, isOnline: true, deviceId: true },
          },
          activitySessions: {
            where: { startedAt: { lt: range.end }, endedAt: { gt: range.start } },
            orderBy: { startedAt: 'asc' },
            include: {
              applicationUsages: { orderBy: { startedAt: 'asc' } },
              websiteUsages: { orderBy: { startedAt: 'asc' } },
            },
          },
          screenshots: {
            where: { capturedAt: { gte: range.start, lt: range.end }, deletedAt: null },
            orderBy: { capturedAt: 'asc' },
            select: {
              id: true,
              capturedAt: true,
              mimeType: true,
              width: true,
              height: true,
              sizeBytes: true,
              deviceId: true,
            },
          },
        },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      date: range.date,
      rangeStart: range.start.toISOString(),
      rangeEnd: range.end.toISOString(),
      employees: employees.map((employee) =>
        this.buildTimelineEmployee(
          employee,
          range.start,
          range.end,
          effectiveRangeEnd,
        ),
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
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

  private async employeeReadWhere(
    actor: AuthenticatedUser,
    query: Pick<MonitoringReadQueryDto, 'employeeId'>,
  ): Promise<Prisma.EmployeeWhereInput> {
    const filters: Prisma.EmployeeWhereInput[] = [
      await this.employeeVisibilityWhere(actor),
      { deletedAt: null },
    ];
    if (query.employeeId) filters.push({ id: query.employeeId });
    return { AND: filters };
  }

  private employeeSearchWhere(search: string): Prisma.EmployeeWhereInput {
    return {
      OR: [
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ],
    };
  }

  private async activityWhere(
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ): Promise<Prisma.ActivitySessionWhereInput> {
    const range = this.dateRange(query);
    const filters: Prisma.ActivitySessionWhereInput[] = [
      { employee: { is: await this.employeeReadWhere(actor, query) } },
      { startedAt: range },
    ];
    if (query.deviceId) filters.push({ deviceId: query.deviceId });
    if (query.search) {
      filters.push({
        OR: [
          { employee: { is: this.employeeSearchWhere(query.search) } },
          { clientSessionId: { contains: query.search, mode: 'insensitive' } },
          { applicationUsages: { some: { applicationName: { contains: query.search, mode: 'insensitive' } } } },
          { applicationUsages: { some: { windowTitle: { contains: query.search, mode: 'insensitive' } } } },
          { websiteUsages: { some: { domain: { contains: query.search, mode: 'insensitive' } } } },
          { websiteUsages: { some: { url: { contains: query.search, mode: 'insensitive' } } } },
          { websiteUsages: { some: { pageTitle: { contains: query.search, mode: 'insensitive' } } } },
          { websiteUsages: { some: { browserName: { contains: query.search, mode: 'insensitive' } } } },
        ],
      });
    }
    return { AND: filters };
  }

  private async screenshotWhere(
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ): Promise<Prisma.ScreenshotWhereInput> {
    const range = this.dateRange(query);
    const filters: Prisma.ScreenshotWhereInput[] = [
      { employee: { is: await this.employeeReadWhere(actor, query) } },
      { capturedAt: range, deletedAt: null },
    ];
    if (query.deviceId) filters.push({ deviceId: query.deviceId });
    if (query.search) {
      filters.push({
        OR: [
          { employee: { is: this.employeeSearchWhere(query.search) } },
          { checksum: { contains: query.search, mode: 'insensitive' } },
          { mimeType: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    return { AND: filters };
  }

  private async applicationWhere(
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ): Promise<Prisma.ApplicationUsageWhereInput> {
    const range = this.dateRange(query);
    const filters: Prisma.ApplicationUsageWhereInput[] = [
      { employee: { is: await this.employeeReadWhere(actor, query) } },
      { startedAt: range },
    ];
    if (query.deviceId) filters.push({ deviceId: query.deviceId });
    if (query.search) {
      filters.push({
        OR: [
          { employee: { is: this.employeeSearchWhere(query.search) } },
          { applicationName: { contains: query.search, mode: 'insensitive' } },
          { windowTitle: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    return { AND: filters };
  }

  private async websiteWhere(
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ): Promise<Prisma.WebsiteUsageWhereInput> {
    const range = this.dateRange(query);
    const filters: Prisma.WebsiteUsageWhereInput[] = [
      { employee: { is: await this.employeeReadWhere(actor, query) } },
      { startedAt: range },
    ];
    if (query.deviceId) filters.push({ deviceId: query.deviceId });
    if (query.search) {
      filters.push({
        OR: [
          { employee: { is: this.employeeSearchWhere(query.search) } },
          { domain: { contains: query.search, mode: 'insensitive' } },
          { url: { contains: query.search, mode: 'insensitive' } },
          { pageTitle: { contains: query.search, mode: 'insensitive' } },
          { browserName: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    return { AND: filters };
  }

  private async deviceWhere(
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ): Promise<Prisma.MonitoringDeviceWhereInput> {
    const filters: Prisma.MonitoringDeviceWhereInput[] = [
      { employee: { is: await this.employeeReadWhere(actor, query) } },
      { deletedAt: null },
    ];
    if (query.deviceId) filters.push({ id: query.deviceId });
    if (query.search) {
      filters.push({
        OR: [
          { employee: { is: this.employeeSearchWhere(query.search) } },
          { deviceIdentifier: { contains: query.search, mode: 'insensitive' } },
          { deviceName: { contains: query.search, mode: 'insensitive' } },
          { platform: { contains: query.search, mode: 'insensitive' } },
          { osVersion: { contains: query.search, mode: 'insensitive' } },
          { appVersion: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    return { AND: filters };
  }

  private mapEmployee(
    employee: Prisma.EmployeeGetPayload<{ select: typeof monitoringEmployeeSelect }>,
  ): MonitoringEmployeeDto {
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: `${employee.user.firstName} ${employee.user.lastName}`.trim(),
      email: employee.user.email,
    };
  }

  private mapDevice(
    device: Prisma.MonitoringDeviceGetPayload<{
      include: {
        employee: { select: typeof monitoringEmployeeSelect };
        heartbeats: { select: { recordedAt: true } };
      };
    }>,
  ): MonitoringDeviceResponseDto {
    return {
      id: device.id,
      employee: this.mapEmployee(device.employee),
      deviceIdentifier: device.deviceIdentifier,
      hostname: device.deviceName,
      platform: device.platform,
      osVersion: device.osVersion,
      agentVersion: device.appVersion,
      status: device.status,
      lastHeartbeatAt: device.heartbeats[0]?.recordedAt.toISOString() ?? device.lastSeenAt?.toISOString() ?? null,
      registeredAt: device.registeredAt.toISOString(),
    };
  }

  private mapApplication(
    usage: Prisma.ApplicationUsageGetPayload<{
      include: { employee: { select: typeof monitoringEmployeeSelect } };
    }>,
  ): MonitoringApplicationUsageResponseDto {
    return {
      id: usage.id,
      employee: this.mapEmployee(usage.employee),
      application: usage.applicationName,
      windowTitle: usage.windowTitle,
      startedAt: usage.startedAt.toISOString(),
      endedAt: usage.endedAt.toISOString(),
      durationSeconds: usage.durationSeconds,
    };
  }

  private mapWebsite(
    usage: Prisma.WebsiteUsageGetPayload<{
      include: { employee: { select: typeof monitoringEmployeeSelect } };
    }>,
  ): MonitoringWebsiteUsageResponseDto {
    return {
      id: usage.id,
      employee: this.mapEmployee(usage.employee),
      browserName: usage.browserName,
      domain: usage.domain,
      url: usage.url,
      pageTitle: usage.pageTitle,
      startedAt: usage.startedAt.toISOString(),
      endedAt: usage.endedAt.toISOString(),
      durationSeconds: usage.durationSeconds,
    };
  }

  private mapActivity(
    activity: Prisma.ActivitySessionGetPayload<{
      include: {
        employee: { select: typeof monitoringEmployeeSelect };
        applicationUsages: true;
        websiteUsages: true;
      };
    }>,
  ): MonitoringActivityResponseDto {
    return {
      id: activity.id,
      employee: this.mapEmployee(activity.employee),
      deviceId: activity.deviceId,
      clientSessionId: activity.clientSessionId,
      startedAt: activity.startedAt.toISOString(),
      endedAt: activity.endedAt.toISOString(),
      durationSeconds: Math.max(0, Math.round((activity.endedAt.getTime() - activity.startedAt.getTime()) / 1000)),
      activeSeconds: activity.activeSeconds,
      idleSeconds: activity.idleSeconds,
      keystrokeCount: activity.keystrokeCount ?? activity.keyboardCount,
      keyboardCount: activity.keyboardCount,
      mouseClickCount: activity.mouseClickCount,
      mouseMoveCount: activity.mouseMoveCount,
      scrollCount: activity.scrollCount,
      applications: activity.applicationUsages.map((usage) => ({
        id: usage.id,
        employee: this.mapEmployee(activity.employee),
        application: usage.applicationName,
        windowTitle: usage.windowTitle,
        startedAt: usage.startedAt.toISOString(),
        endedAt: usage.endedAt.toISOString(),
        durationSeconds: usage.durationSeconds,
      })),
      websites: activity.websiteUsages.map((usage) => ({
        id: usage.id,
        employee: this.mapEmployee(activity.employee),
        browserName: usage.browserName,
        domain: usage.domain,
        url: usage.url,
        pageTitle: usage.pageTitle,
        startedAt: usage.startedAt.toISOString(),
        endedAt: usage.endedAt.toISOString(),
        durationSeconds: usage.durationSeconds,
      })),
    };
  }

  private mapScreenshot(
    screenshot: Prisma.ScreenshotGetPayload<{
      include: { employee: { select: typeof monitoringEmployeeSelect } };
    }>,
  ): MonitoringScreenshotResponseDto {
    return {
      id: screenshot.id,
      employee: this.mapEmployee(screenshot.employee),
      deviceId: screenshot.deviceId,
      capturedAt: screenshot.capturedAt.toISOString(),
      thumbnailUrl: `/api/monitoring/screenshots/${screenshot.id}/view`,
      previewAvailable: true,
      mimeType: screenshot.mimeType,
      sizeBytes: screenshot.sizeBytes,
      width: screenshot.width,
      height: screenshot.height,
      checksum: screenshot.checksum,
      metadata: screenshot.metadata as Record<string, unknown> | null,
    };
  }

  private screenshotObjectKey(
    companyId: string,
    employeeId: string,
    capturedAt: Date,
    captureId: string,
    extension: string,
  ): string {
    const year = String(capturedAt.getUTCFullYear());
    const month = String(capturedAt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(capturedAt.getUTCDate()).padStart(2, '0');
    return `${companyId}/${employeeId}/${year}/${month}/${day}/${captureId}.${extension}`;
  }

  private decodeImageSize(buffer: Buffer, mimeType: string): { width: number; height: number } {
    if (mimeType === 'image/png') return this.decodePngSize(buffer);
    if (mimeType === 'image/jpeg') return this.decodeJpegSize(buffer);
    if (mimeType === 'image/webp') return this.decodeWebpSize(buffer);
    throw new BadRequestException('Unsupported screenshot image type');
  }

  private decodePngSize(buffer: Buffer): { width: number; height: number } {
    if (
      buffer.length < 24 ||
      buffer.readUInt32BE(0) !== 0x89504e47 ||
      buffer.readUInt32BE(4) !== 0x0d0a1a0a
    ) {
      throw new BadRequestException('Screenshot image could not be decoded');
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  private decodeJpegSize(buffer: Buffer): { width: number; height: number } {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new BadRequestException('Screenshot image could not be decoded');
    }
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      if (offset + 4 > buffer.length) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > buffer.length) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += length + 2;
    }
    throw new BadRequestException('Screenshot image could not be decoded');
  }

  private decodeWebpSize(buffer: Buffer): { width: number; height: number } {
    if (
      buffer.length < 30 ||
      buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      throw new BadRequestException('Screenshot image could not be decoded');
    }
    const format = buffer.toString('ascii', 12, 16);
    if (format === 'VP8X') {
      return {
        width: buffer.readUIntLE(24, 3) + 1,
        height: buffer.readUIntLE(27, 3) + 1,
      };
    }
    if (format === 'VP8L') {
      if (buffer.length < 25) throw new BadRequestException('Screenshot image could not be decoded');
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (format === 'VP8 ' && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    throw new BadRequestException('Screenshot image could not be decoded');
  }

  private buildTimelineEmployee(
    employee: TimelineEmployee,
    rangeStart: Date,
    rangeEnd: Date,
    effectiveRangeEnd: Date,
  ): MonitoringTimelineEmployeeDto {
    const segments: TimelineSegmentDraft[] = [];
    const markers: TimelineMarkerDraft[] = [];
    const heartbeatTimeoutMinutes =
      employee.company.attendancePolicies[0]?.heartbeatTimeoutMinutes ??
      DEFAULT_HEARTBEAT_TIMEOUT_MINUTES;
    const heartbeatTimeoutMs = Math.max(heartbeatTimeoutMinutes, 1) * 60000;

    for (const attendance of employee.attendances) {
      if (attendance.punchInAt) {
        this.pushSegment(segments, {
          type: MonitoringTimelineSegmentType.ACTIVE,
          start: attendance.punchInAt,
          end: attendance.punchOutAt ?? effectiveRangeEnd,
          source: MonitoringTimelineSegmentSource.ATTENDANCE,
          intensity: null,
          metadata: {
            attendanceId: attendance.id,
            status: attendance.status,
          },
        }, rangeStart, effectiveRangeEnd);
      }

      for (const log of attendance.logs) {
        if (!this.isWithinRange(log.occurredAt, rangeStart, rangeEnd)) continue;
        markers.push({
          type:
            log.type === AttendanceLogType.PUNCH_IN
              ? MonitoringTimelineMarkerType.PUNCH_IN
              : MonitoringTimelineMarkerType.PUNCH_OUT,
          time: log.occurredAt,
          title: log.type === AttendanceLogType.PUNCH_IN ? 'Punch In' : 'Punch Out',
          metadata: {
            attendanceId: attendance.id,
            logId: log.id,
            note: log.note,
          },
        });
      }

      for (const breakLog of attendance.breaks) {
        this.pushSegment(segments, {
          type: MonitoringTimelineSegmentType.BREAK,
          start: breakLog.startedAt,
          end: breakLog.endedAt ?? breakLog.autoPunchOutAt ?? effectiveRangeEnd,
          source: MonitoringTimelineSegmentSource.BREAK,
          intensity: null,
          deviceId: null,
          metadata: {
            attendanceId: attendance.id,
            breakId: breakLog.id,
            breakPolicyId: breakLog.breakPolicyId,
            name: breakLog.breakTypeName,
            code: breakLog.breakTypeCode,
            allowedMinutes: breakLog.allowedMinutes,
            policyViolated: breakLog.policyViolated,
          },
        }, rangeStart, effectiveRangeEnd);

        if (this.isWithinRange(breakLog.startedAt, rangeStart, rangeEnd)) {
          markers.push({
            type: MonitoringTimelineMarkerType.BREAK_START,
            time: breakLog.startedAt,
            title: `${breakLog.breakTypeName ?? 'Break'} Start`,
            metadata: { attendanceId: attendance.id, breakId: breakLog.id },
          });
        }
        const breakEnd = breakLog.endedAt ?? breakLog.autoPunchOutAt;
        if (breakEnd && this.isWithinRange(breakEnd, rangeStart, rangeEnd)) {
          markers.push({
            type: MonitoringTimelineMarkerType.BREAK_END,
            time: breakEnd,
            title: `${breakLog.breakTypeName ?? 'Break'} End`,
            metadata: { attendanceId: attendance.id, breakId: breakLog.id },
          });
        }
      }
    }

    for (const activity of employee.activitySessions) {
      const durationSeconds = Math.max(1, this.durationSeconds(activity.startedAt, activity.endedAt));
      const activeSeconds = Math.min(Math.max(activity.activeSeconds ?? 0, 0), durationSeconds);
      const idleSeconds = Math.min(Math.max(activity.idleSeconds ?? 0, 0), Math.max(durationSeconds - activeSeconds, 0));
      const activeEnd = new Date(activity.startedAt.getTime() + activeSeconds * 1000);
      const idleEnd = new Date(activeEnd.getTime() + idleSeconds * 1000);
      const activityMetadata = {
        activitySessionId: activity.id,
        clientSessionId: activity.clientSessionId,
        applications: activity.applicationUsages.map((usage) => ({
          applicationName: usage.applicationName,
          windowTitle: usage.windowTitle,
          startedAt: usage.startedAt.toISOString(),
          endedAt: usage.endedAt.toISOString(),
          durationSeconds: usage.durationSeconds,
        })),
        websites: activity.websiteUsages.map((usage) => ({
          domain: usage.domain,
          url: usage.url,
          pageTitle: usage.pageTitle,
          startedAt: usage.startedAt.toISOString(),
          endedAt: usage.endedAt.toISOString(),
          durationSeconds: usage.durationSeconds,
        })),
      };

      if (activeSeconds > 0) {
        this.pushSegment(segments, {
          type: MonitoringTimelineSegmentType.ACTIVE,
          start: activity.startedAt,
          end: activeEnd,
          source: MonitoringTimelineSegmentSource.ACTIVITY,
          intensity: Math.round((activeSeconds / durationSeconds) * 100),
          activitySessionId: activity.id,
          deviceId: activity.deviceId,
          metadata: activityMetadata,
        }, rangeStart, effectiveRangeEnd);
      }
      if (idleSeconds > 0) {
        this.pushSegment(segments, {
          type: MonitoringTimelineSegmentType.IDLE,
          start: activeEnd,
          end: idleEnd,
          source: MonitoringTimelineSegmentSource.ACTIVITY,
          intensity: 0,
          activitySessionId: activity.id,
          deviceId: activity.deviceId,
          metadata: {
            activitySessionId: activity.id,
            approximation: 'Idle placement is derived from aggregate ActivitySession idleSeconds.',
          },
        }, rangeStart, effectiveRangeEnd);
      }
    }

    for (let index = 1; index < employee.heartbeats.length; index += 1) {
      const previous = employee.heartbeats[index - 1];
      const current = employee.heartbeats[index];
      const offlineStart = new Date(previous.recordedAt.getTime() + heartbeatTimeoutMs);
      if (offlineStart < current.recordedAt) {
        this.pushSegment(segments, {
          type: MonitoringTimelineSegmentType.OFFLINE,
          start: offlineStart,
          end: current.recordedAt,
          source: MonitoringTimelineSegmentSource.HEARTBEAT,
          intensity: null,
          deviceId: previous.deviceId,
          metadata: {
            previousHeartbeatId: previous.id,
            nextHeartbeatId: current.id,
            heartbeatTimeoutMinutes,
          },
        }, rangeStart, effectiveRangeEnd);
      }
    }
    const latestHeartbeat = employee.heartbeats.at(-1);
    if (latestHeartbeat) {
      const offlineStart = new Date(latestHeartbeat.recordedAt.getTime() + heartbeatTimeoutMs);
      if (offlineStart < effectiveRangeEnd) {
        this.pushSegment(segments, {
          type: MonitoringTimelineSegmentType.OFFLINE,
          start: offlineStart,
          end: effectiveRangeEnd,
          source: MonitoringTimelineSegmentSource.HEARTBEAT,
          intensity: null,
          deviceId: latestHeartbeat.deviceId,
          metadata: {
            heartbeatId: latestHeartbeat.id,
            heartbeatTimeoutMinutes,
          },
        }, rangeStart, effectiveRangeEnd);
      }
    }
    // TODO: Decide whether employees/devices with no heartbeat in range should render OFFLINE instead of NO_ACTIVITY.

    for (const screenshot of employee.screenshots) {
      markers.push({
        type: MonitoringTimelineMarkerType.SCREENSHOT,
        time: screenshot.capturedAt,
        title: 'Screenshot',
        metadata: {
          screenshotId: screenshot.id,
          capturedAt: screenshot.capturedAt.toISOString(),
          deviceId: screenshot.deviceId,
          mimeType: screenshot.mimeType,
          width: screenshot.width,
          height: screenshot.height,
          sizeBytes: screenshot.sizeBytes,
        },
      });
    }

    const noActivitySegments = this.noActivitySegments(
      segments,
      rangeStart,
      effectiveRangeEnd,
    );
    const allSegments = [...segments, ...noActivitySegments]
      .sort((left, right) => left.start.getTime() - right.start.getTime())
      .map((segment) => this.timelineSegmentDto(segment));
    const allMarkers = markers
      .filter((marker) => this.isWithinRange(marker.time, rangeStart, rangeEnd))
      .sort((left, right) => left.time.getTime() - right.time.getTime())
      .map((marker) => this.timelineMarkerDto(marker));

    const summary = this.timelineSummary(segments);
    const device = employee.monitoringDevices[0] ?? null;

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      user: {
        name: `${employee.user.firstName} ${employee.user.lastName}`.trim(),
        email: employee.user.email,
      },
      device: device
        ? {
            id: device.id,
            employee: this.mapEmployee(employee),
            deviceIdentifier: device.deviceIdentifier,
            hostname: device.deviceName,
            platform: device.platform,
            osVersion: device.osVersion,
            agentVersion: device.appVersion,
            status: device.status,
            lastHeartbeatAt: device.lastSeenAt?.toISOString() ?? null,
            registeredAt: device.registeredAt.toISOString(),
          }
        : null,
      summary,
      segments: allSegments,
      markers: allMarkers,
    };
  }

  private pushSegment(
    segments: TimelineSegmentDraft[],
    segment: TimelineSegmentInput,
    rangeStart: Date,
    rangeEnd: Date,
  ): void {
    const start = segment.start < rangeStart ? rangeStart : segment.start;
    const end = segment.end > rangeEnd ? rangeEnd : segment.end;
    if (start >= end) return;
    segments.push({ ...segment, start, end, durationSeconds: this.durationSeconds(start, end) });
  }

  private noActivitySegments(
    segments: TimelineSegmentDraft[],
    rangeStart: Date,
    rangeEnd: Date,
  ): TimelineSegmentDraft[] {
    const intervals = segments
      .filter((segment) => segment.type !== MonitoringTimelineSegmentType.NO_ACTIVITY)
      .map((segment) => ({ start: segment.start, end: segment.end }))
      .sort((left, right) => left.start.getTime() - right.start.getTime());
    const merged: Array<{ start: Date; end: Date }> = [];
    for (const interval of intervals) {
      const current = merged.at(-1);
      if (!current || interval.start > current.end) {
        merged.push({ ...interval });
      } else if (interval.end > current.end) {
        current.end = interval.end;
      }
    }

    const gaps: TimelineSegmentDraft[] = [];
    let cursor = rangeStart;
    for (const interval of merged) {
      if (cursor < interval.start) {
        gaps.push({
          type: MonitoringTimelineSegmentType.NO_ACTIVITY,
          start: cursor,
          end: interval.start,
          durationSeconds: this.durationSeconds(cursor, interval.start),
          intensity: null,
          source: MonitoringTimelineSegmentSource.ACTIVITY,
          metadata: null,
        });
      }
      if (interval.end > cursor) cursor = interval.end;
    }
    if (cursor < rangeEnd) {
      gaps.push({
        type: MonitoringTimelineSegmentType.NO_ACTIVITY,
        start: cursor,
        end: rangeEnd,
        durationSeconds: this.durationSeconds(cursor, rangeEnd),
        intensity: null,
        source: MonitoringTimelineSegmentSource.ACTIVITY,
        metadata: null,
      });
    }
    return gaps;
  }

  private timelineSummary(segments: TimelineSegmentDraft[]): {
    activeSeconds: number;
    idleSeconds: number;
    breakSeconds: number;
    offlineSeconds: number;
    workedSeconds: number;
  } {
    const total = (type: MonitoringTimelineSegmentType) =>
      segments
        .filter((segment) => segment.type === type)
        .reduce((sum, segment) => sum + segment.durationSeconds, 0);
    const activeSeconds = total(MonitoringTimelineSegmentType.ACTIVE);
    const idleSeconds = total(MonitoringTimelineSegmentType.IDLE);
    const breakSeconds = total(MonitoringTimelineSegmentType.BREAK);
    const offlineSeconds = total(MonitoringTimelineSegmentType.OFFLINE);
    return {
      activeSeconds,
      idleSeconds,
      breakSeconds,
      offlineSeconds,
      workedSeconds: activeSeconds + idleSeconds,
    };
  }

  private timelineSegmentDto(segment: TimelineSegmentDraft): MonitoringTimelineSegmentDto {
    return {
      ...segment,
      start: segment.start.toISOString(),
      end: segment.end.toISOString(),
    };
  }

  private timelineMarkerDto(marker: TimelineMarkerDraft): MonitoringTimelineMarkerDto {
    return {
      ...marker,
      time: marker.time.toISOString(),
    };
  }

  private timelineRange(query: MonitoringTimelineQueryDto): {
    date: string;
    start: Date;
    end: Date;
  } {
    if (query.date) {
      const start = new Date(`${query.date.slice(0, 10)}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      return { date: query.date.slice(0, 10), start, end };
    }

    const range = this.dateRange({
      ...query,
      dateFrom: query.dateFrom ? this.normalizeDateRangeBoundary(query.dateFrom, 'start') : undefined,
      dateTo: query.dateTo ? this.normalizeDateRangeBoundary(query.dateTo, 'end') : undefined,
    });
    return {
      date: range.gte.toISOString().slice(0, 10),
      start: range.gte,
      end: range.lte,
    };
  }

  private effectiveTimelineRangeEnd(
    rangeStart: Date,
    rangeEnd: Date,
    now = new Date(),
  ): Date {
    if (now <= rangeStart) return rangeStart;
    if (now >= rangeEnd) return rangeEnd;
    return now;
  }

  private normalizeDateRangeBoundary(value: string, boundary: 'start' | 'end'): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return boundary === 'start'
      ? `${value}T00:00:00.000Z`
      : `${value}T23:59:59.999Z`;
  }

  private async ownEmployeeId(actor: AuthenticatedUser): Promise<string | null> {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true },
    });
    return employee?.id ?? null;
  }

  private isWithinRange(value: Date, rangeStart: Date, rangeEnd: Date): boolean {
    return value >= rangeStart && value < rangeEnd;
  }

  private durationSeconds(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  }

  private sanitizeActivityMetadata(
    metadata: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    return this.sanitizeMetadataObject(metadata, 'metadata');
  }

  private sanitizeMetadataObject(
    value: Record<string, unknown>,
    path: string,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      this.assertSafeActivityMetadataKey(key, path);
      const nextPath = `${path}.${key}`;
      if (Array.isArray(entry)) {
        sanitized[key] = entry.map((item, index) =>
          this.sanitizeMetadataValue(item, `${nextPath}[${index}]`),
        );
      } else {
        sanitized[key] = this.sanitizeMetadataValue(entry, nextPath);
      }
    }
    return sanitized;
  }

  private sanitizeMetadataValue(value: unknown, path: string): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        this.sanitizeMetadataValue(item, `${path}[${index}]`),
      );
    }
    if (typeof value === 'object') {
      return this.sanitizeMetadataObject(value as Record<string, unknown>, path);
    }
    return value;
  }

  private assertSafeActivityMetadataKey(key: string, path: string): void {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (safeActivityMetadataKeys.has(normalized)) return;
    if (
      forbiddenActivityMetadataKeys.has(normalized) ||
      forbiddenActivityMetadataPatterns.some((pattern) =>
        normalized.includes(pattern),
      ) ||
      (
        activityMetadataInputDeviceTerms.some((term) =>
          normalized.includes(term),
        ) &&
        activityMetadataSensitiveTerms.some((term) =>
          normalized.includes(term),
        )
      )
    ) {
      throw new BadRequestException(
        `Activity metadata contains forbidden privacy-sensitive key: ${path}.${key}`,
      );
    }
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
    const from = query.dateFrom
      ? new Date(this.normalizeDateRangeBoundary(query.dateFrom, 'start'))
      : defaultFrom;
    const to = query.dateTo
      ? new Date(this.normalizeDateRangeBoundary(query.dateTo, 'end'))
      : now;
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


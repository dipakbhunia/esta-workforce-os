import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { ReassignMonitoringDeviceDto, RenameMonitoringDeviceDto, UpdateMonitoringDeviceMonitoringDto } from './dto/device-actions.dto';
import {
  DeviceHistoryCategory,
  DeviceHistoryItemDto,
  DeviceHistoryQueryDto,
  DeviceHistoryResponseDto,
} from './dto/device-history.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { LiveStatusQueryDto, LiveStatusValue } from './dto/live-status-query.dto';
import { LiveAttendanceState, LiveHeartbeatState, LiveStatusResponseDto } from './dto/live-status-response.dto';
import { MonitoringReadQueryDto } from './dto/monitoring-read-query.dto';
import {
  MonitoringActivityResponseDto,
  MonitoringApplicationUsageResponseDto,
  MonitoringDeviceActionResponseDto,
  MonitoringDeviceDetailResponseDto,
  MonitoringDeviceOverviewResponseDto,
  MonitoringDeviceResponseDto,
  MonitoringEmployeeDto,
  PaginatedMonitoringSummaryResponseDto,
  MonitoringScreenshotResponseDto,
  MonitoringWebsiteUsageResponseDto,
} from './dto/monitoring-read-response.dto';
import { MonitoringIdleQueryDto, MonitoringIdleResponseDto } from './dto/monitoring-idle.dto';
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
import { UploadActivityDto, WebsiteUsageDto } from './dto/upload-activity.dto';
import { UploadScreenshotDto } from './dto/upload-screenshot.dto';
import { MinioObjectStorageService } from './minio-object-storage.service';

const DEFAULT_HEARTBEAT_TIMEOUT_MINUTES = 30;
const HIGH_IDLE_PERCENTAGE_THRESHOLD = 30;
const monitoringUploadEnabledStatuses: MonitoringDeviceStatus[] = [
  MonitoringDeviceStatus.ACTIVE,
  MonitoringDeviceStatus.TRUSTED,
];
const heartbeatAllowedDeviceStatuses: MonitoringDeviceStatus[] = [
  MonitoringDeviceStatus.ACTIVE,
  MonitoringDeviceStatus.INACTIVE,
  MonitoringDeviceStatus.TRUSTED,
  MonitoringDeviceStatus.REVOKED,
];
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
const fakeWebsiteDomains = new Set([
  'unknown',
  'unknownwebsite',
  'browser',
  'chrome',
  'firefox',
  'edge',
  'msedge',
  'brave',
  'opera',
  'electron',
]);

const deviceHistoryActionCategories = {
  DEVICE_REGISTERED: 'REGISTRATION',
  DEVICE_REGISTRATION_RESET: 'REGISTRATION',
  DEVICE_FORCE_REREGISTRATION: 'REGISTRATION',
  DEVICE_TRUSTED: 'SECURITY',
  DEVICE_REVOKED: 'SECURITY',
  MONITORING_DEVICE_REASSIGNED: 'ASSIGNMENT',
  DEVICE_REASSIGNED: 'ASSIGNMENT',
  MONITORING_DEVICE_ENABLED: 'MONITORING',
  MONITORING_DEVICE_DISABLED: 'MONITORING',
  DEVICE_MONITORING_ENABLED: 'MONITORING',
  DEVICE_MONITORING_DISABLED: 'MONITORING',
  MONITORING_DEVICE_RENAMED: 'DEVICE',
  DEVICE_RENAMED: 'DEVICE',
} as const satisfies Record<string, DeviceHistoryCategory>;

type DeviceHistoryAction = keyof typeof deviceHistoryActionCategories;

const sensitiveDeviceHistoryMetadataKeys = [
  'token',
  'jwt',
  'secret',
  'password',
  'refresh',
  'authorization',
  'cookie',
  'pairing',
  'registrationsecret',
  'browsersecret',
];

const deviceSelect = {
  id: true,
  companyId: true,
  employeeId: true,
  deviceIdentifier: true,
  deviceName: true,
  platform: true,
  osVersion: true,
  appVersion: true,
  status: true,
  lastSeenAt: true,
  registeredAt: true,
  registrationVersion: true,
} satisfies Prisma.MonitoringDeviceSelect;

const monitoringOrgUnitSelect = {
  id: true,
  name: true,
  code: true,
};

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

interface TeamActivityEmployeeAggregate {
  employeeId: string;
  _sum?: {
    activeSeconds?: number | null;
    idleSeconds?: number | null;
  } | null;
}

interface TeamActivityEmployeeDepartment {
  id: string;
  departmentId: string | null;
  department: {
    id: string;
    name: string;
  } | null;
}

interface TeamActivityAccumulator {
  departmentId: string | null;
  departmentName: string;
  employeeIds: Set<string>;
  activeSeconds: number;
  idleSeconds: number;
}

interface TeamActivityBreakdownItem {
  departmentId: string | null;
  departmentName: string;
  employeeCount: number;
  onlineSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  activityPercentage: number;
}

interface ScreenshotInputMetrics {
  keyboardCount: number;
  mouseClickCount: number;
  mouseMoveCount: number;
  scrollCount: number;
}

interface ScreenshotInputMetricsSession extends ScreenshotInputMetrics {
  employeeId: string;
  deviceId: string;
  startedAt: Date;
  endedAt: Date;
}

type DeviceRecentActivityType =
  | 'HEARTBEAT'
  | 'ACTIVITY'
  | 'SCREENSHOT'
  | 'APPLICATION'
  | 'WEBSITE';

interface DeviceRecentActivityItem {
  id: string;
  type: DeviceRecentActivityType;
  occurredAt: Date;
  title: string;
  description: string | null;
}

type ScreenshotWithEmployee = Prisma.ScreenshotGetPayload<{
  include: { employee: { select: typeof monitoringEmployeeSelect } };
}>;

type ScreenshotWithInputMetrics = ScreenshotWithEmployee & {
  inputMetrics?: ScreenshotInputMetrics | null;
};

interface UploadedScreenshotFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

type MonitoringDeviceActionRecord = Prisma.MonitoringDeviceGetPayload<{
  include: { employee: { select: typeof monitoringEmployeeSelect } };
}>;

type DeviceHistoryAuditLogRecord = Prisma.AuditLogGetPayload<{
  include: {
    actor: {
      select: { id: true; firstName: true; lastName: true; email: true };
    };
  };
}>;

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly objectStorage: MinioObjectStorageService,
  ) {}

  async registerDevice(dto: RegisterDeviceDto, actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    const deviceIdentifier = dto.deviceIdentifier.trim();
    const commonData = {
      deviceName: dto.deviceName.trim(),
      platform: dto.platform.trim().toLowerCase(),
      osVersion: dto.osVersion?.trim(),
      appVersion: dto.appVersion?.trim(),
      lastSeenAt: new Date(),
      deletedAt: null,
    };
    const existing = await this.prisma.monitoringDevice.findUnique({
      where: {
        employeeId_deviceIdentifier: {
          employeeId: employee.id,
          deviceIdentifier,
        },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      const updated = await this.prisma.monitoringDevice.update({
        where: { id: existing.id },
        data: {
          ...commonData,
          ...(existing.status === MonitoringDeviceStatus.REREGISTRATION_REQUIRED
            ? { status: MonitoringDeviceStatus.ACTIVE, reregistrationRequiredAt: null }
            : {}),
        },
        select: deviceSelect,
      });
      if (existing.status === MonitoringDeviceStatus.REREGISTRATION_REQUIRED) {
        await this.writeDeviceAuditLog(actor, updated.companyId, 'DEVICE_REGISTERED', updated.id, {
          previousStatus: existing.status,
          status: updated.status,
          registrationVersion: updated.registrationVersion,
        });
      }
      return updated;
    }

    const created = await this.prisma.monitoringDevice.create({
      data: {
        companyId: employee.companyId,
        employeeId: employee.id,
        deviceIdentifier,
        ...commonData,
      },
      select: deviceSelect,
    });
    await this.writeDeviceAuditLog(actor, created.companyId, 'DEVICE_REGISTERED', created.id, {
      status: created.status,
      registrationVersion: created.registrationVersion,
    });
    return created;
  }
  async receiveHeartbeat(dto: HeartbeatDto, actor: AuthenticatedUser) {
    const device = await this.ownedHeartbeatDevice(dto.deviceId, actor);
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
    this.logger.debug({
      message: 'Monitoring activity upload received',
      deviceId: device.id,
      employeeId: device.employeeId,
      clientSessionId: dto.clientSessionId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    });
    dto.applications?.forEach((usage) =>
      this.assertPeriod(
        new Date(usage.startedAt),
        new Date(usage.endedAt),
        'Application usage',
      ),
    );
    const websiteUsages = dto.websites?.map((usage) =>
      this.sanitizeWebsiteUsage(usage, startedAt, endedAt),
    ) ?? [];

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
            websiteUsages: websiteUsages.length
              ? {
                  create: websiteUsages.map((usage) => ({
                    companyId: device.companyId,
                    employeeId: device.employeeId,
                    deviceId: device.id,
                    browserName: usage.browserName,
                    domain: usage.domain,
                    url: usage.url,
                    pageTitle: usage.pageTitle,
                    startedAt: usage.startedAt,
                    endedAt: usage.endedAt,
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
        this.logger.debug({
          message: 'Monitoring activity upload saved',
          activitySessionId: session.id,
          deviceId: device.id,
          employeeId: device.employeeId,
          clientSessionId: session.clientSessionId,
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt.toISOString(),
        });
        return session;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn({
          message: 'Duplicate monitoring activity upload ignored by idempotency',
          deviceId: device.id,
          employeeId: device.employeeId,
          clientSessionId: dto.clientSessionId,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        });
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
    if (existing) return this.mapScreenshot(await this.attachScreenshotInputMetric(existing));

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
      return this.mapScreenshot(await this.attachScreenshotInputMetric(screenshot));
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
        if (duplicate) return this.mapScreenshot(await this.attachScreenshotInputMetric(duplicate));
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
    const recordsWithInputMetrics = await this.attachScreenshotInputMetrics(records);
    return paginatedResult(recordsWithInputMetrics.map((record) => this.mapScreenshot(record)), total, query);
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
    const onlineThreshold = await this.deviceOnlineThreshold(actor);
    const onlineWhere: Prisma.MonitoringDeviceWhereInput = {
      AND: [
        where,
        { status: { in: monitoringUploadEnabledStatuses } },
        { lastSeenAt: { gte: onlineThreshold } },
      ],
    };
    const monitoringDisabledWhere: Prisma.MonitoringDeviceWhereInput = {
      AND: [
        where,
        { status: { not: MonitoringDeviceStatus.ACTIVE } },
      ],
    };
    const [records, total, online, monitoringDisabled] = await this.prisma.$transaction([
      this.prisma.monitoringDevice.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { registeredAt: 'desc' },
        include: {
          employee: {
            select: {
              ...monitoringEmployeeSelect,
              branch: { select: monitoringOrgUnitSelect },
              department: { select: monitoringOrgUnitSelect },
            },
          },
          company: {
            select: {
              attendancePolicies: {
                where: { isActive: true },
                take: 1,
                select: { heartbeatTimeoutMinutes: true },
              },
            },
          },
          heartbeats: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
            select: { recordedAt: true },
          },
          activitySessions: {
            orderBy: { endedAt: 'desc' },
            take: 1,
            select: { endedAt: true },
          },
          screenshots: {
            where: { deletedAt: null },
            orderBy: { capturedAt: 'desc' },
            take: 1,
            select: { capturedAt: true },
          },
          websiteUsages: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { startedAt: true },
          },
        },
      }),
      this.prisma.monitoringDevice.count({ where }),
      this.prisma.monitoringDevice.count({ where: onlineWhere }),
      this.prisma.monitoringDevice.count({ where: monitoringDisabledWhere }),
    ]);
    return {
      ...paginatedResult(records.map((record) => this.mapDevice(record)), total, query),
      summary: {
        totalDevices: total,
        online,
        offline: Math.max(0, total - online),
        monitoringDisabled,
      },
    };
  }

  async devicesByEmployee(
    employeeId: string,
    query: MonitoringReadQueryDto,
    actor: AuthenticatedUser,
  ) {
    return this.devices({ ...query, employeeId }, actor);
  }

  async devicesOverview(
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceOverviewResponseDto> {
    const where = await this.deviceWhere({ page: 1, limit: 1 }, actor);
    const onlineThreshold = await this.deviceOnlineThreshold(actor);
    const onlineWhere: Prisma.MonitoringDeviceWhereInput = {
      AND: [
        where,
        { status: { in: monitoringUploadEnabledStatuses } },
        { lastSeenAt: { gte: onlineThreshold } },
      ],
    };
    const monitoringDisabledWhere: Prisma.MonitoringDeviceWhereInput = {
      AND: [where, { status: { not: MonitoringDeviceStatus.ACTIVE } }],
    };
    const neverReportedWhere: Prisma.MonitoringDeviceWhereInput = {
      AND: [where, { lastSeenAt: null }],
    };
    const browserConnectedWhere: Prisma.MonitoringDeviceWhereInput = {
      AND: [where, { websiteUsages: { some: {} } }],
    };
    const [
      total,
      online,
      monitoringDisabled,
      neverReported,
      browserConnected,
      operatingSystemGroups,
      agentVersionGroups,
      recentlyRegistered,
    ] = await this.prisma.$transaction([
      this.prisma.monitoringDevice.count({ where }),
      this.prisma.monitoringDevice.count({ where: onlineWhere }),
      this.prisma.monitoringDevice.count({ where: monitoringDisabledWhere }),
      this.prisma.monitoringDevice.count({ where: neverReportedWhere }),
      this.prisma.monitoringDevice.count({ where: browserConnectedWhere }),
      this.prisma.monitoringDevice.groupBy({
        by: ['platform'],
        where,
        orderBy: { platform: 'asc' },
        _count: { id: true },
      }),
      this.prisma.monitoringDevice.groupBy({
        by: ['appVersion'],
        where,
        orderBy: { appVersion: 'asc' },
        _count: { id: true },
      }),
      this.prisma.monitoringDevice.findMany({
        where,
        orderBy: { registeredAt: 'desc' },
        take: 10,
        include: {
          employee: { select: monitoringEmployeeSelect },
          company: {
            select: {
              attendancePolicies: {
                where: { isActive: true },
                take: 1,
                select: { heartbeatTimeoutMinutes: true },
              },
            },
          },
          heartbeats: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
            select: { recordedAt: true },
          },
        },
      }),
    ]);

    const offline = Math.max(0, total - online);
    return {
      totals: {
        devices: total,
        online,
        offline,
        monitoringDisabled,
        unassigned: 0,
      },
      operatingSystems: operatingSystemGroups
        .map((group) => ({
          name: this.displayOperatingSystem(group.platform),
          count: this.groupCount(group),
        }))
        .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
      agentVersions: agentVersionGroups
        .map((group) => ({
          name: group.appVersion || 'Unknown',
          count: this.groupCount(group),
        }))
        .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
      browserStatus: {
        connected: browserConnected,
        unknown: Math.max(0, total - browserConnected),
      },
      recentlyRegistered: recentlyRegistered.map((device) => {
        const lastHeartbeatAt = device.heartbeats[0]?.recordedAt ?? device.lastSeenAt ?? null;
        const heartbeatTimeoutMinutes =
          device.company.attendancePolicies[0]?.heartbeatTimeoutMinutes ??
          DEFAULT_HEARTBEAT_TIMEOUT_MINUTES;
        const deviceOnline = Boolean(
          this.isMonitoringUploadEnabledStatus(device.status) &&
          lastHeartbeatAt &&
          Date.now() - lastHeartbeatAt.getTime() <= Math.max(heartbeatTimeoutMinutes, 1) * 60000,
        );
        return {
          id: device.id,
          deviceName: device.deviceName,
          employee: this.mapEmployee(device.employee),
          registeredAt: device.registeredAt.toISOString(),
          online: deviceOnline,
          status: device.status,
        };
      }),
      attention: {
        offlineLongTime: offline,
        neverReported,
        monitoringDisabled,
        noEmployeeAssigned: 0,
      },
    };
  }

  async deviceDetail(
    deviceId: string,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceDetailResponseDto> {
    const where = await this.deviceWhere({ page: 1, limit: 1, deviceId }, actor);
    const device = await this.prisma.monitoringDevice.findFirst({
      where,
      include: {
        employee: {
          select: {
            ...monitoringEmployeeSelect,
            branch: { select: monitoringOrgUnitSelect },
            department: { select: monitoringOrgUnitSelect },
            company: { select: { id: true, name: true } },
          },
        },
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
      },
    });
    if (!device) throw new NotFoundException('Monitoring device not found');

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayRange = { gte: todayStart, lte: now };
    const activityOverlapWhere: Prisma.ActivitySessionWhereInput = {
      deviceId: device.id,
      startedAt: { lte: todayRange.lte },
      endedAt: { gte: todayRange.gte },
    };
    const usageRangeWhere = {
      deviceId: device.id,
      startedAt: todayRange,
    };

    const [
      latestHeartbeat,
      latestActivity,
      latestScreenshot,
      latestWebsite,
      todayActivity,
      appsUsed,
      websitesUsed,
      todayScreenshotCount,
      recentHeartbeats,
      recentActivitySessions,
      recentScreenshots,
      recentApplications,
      recentWebsites,
    ] = await this.prisma.$transaction([
      this.prisma.heartbeat.findFirst({
        where: { deviceId: device.id },
        orderBy: { recordedAt: 'desc' },
        select: { id: true, recordedAt: true },
      }),
      this.prisma.activitySession.findFirst({
        where: { deviceId: device.id },
        orderBy: { endedAt: 'desc' },
        select: { id: true, endedAt: true },
      }),
      this.prisma.screenshot.findFirst({
        where: { deviceId: device.id, deletedAt: null },
        orderBy: { capturedAt: 'desc' },
        select: { id: true, capturedAt: true },
      }),
      this.prisma.websiteUsage.findFirst({
        where: { deviceId: device.id },
        orderBy: { startedAt: 'desc' },
        select: { id: true, startedAt: true },
      }),
      this.prisma.activitySession.aggregate({
        where: activityOverlapWhere,
        _count: { _all: true },
        _sum: {
          activeSeconds: true,
          idleSeconds: true,
          keyboardCount: true,
          mouseClickCount: true,
          mouseMoveCount: true,
          scrollCount: true,
        },
      }),
      this.prisma.applicationUsage.groupBy({
        by: ['applicationName'],
        where: usageRangeWhere,
        orderBy: { applicationName: 'asc' },
      }),
      this.prisma.websiteUsage.groupBy({
        by: ['domain'],
        where: usageRangeWhere,
        orderBy: { domain: 'asc' },
      }),
      this.prisma.screenshot.count({
        where: { deviceId: device.id, capturedAt: todayRange, deletedAt: null },
      }),
      this.prisma.heartbeat.findMany({
        where: { deviceId: device.id },
        orderBy: { recordedAt: 'desc' },
        take: 5,
        select: { id: true, recordedAt: true },
      }),
      this.prisma.activitySession.findMany({
        where: { deviceId: device.id },
        orderBy: { endedAt: 'desc' },
        take: 5,
        select: { id: true, startedAt: true, endedAt: true, activeSeconds: true, idleSeconds: true },
      }),
      this.prisma.screenshot.findMany({
        where: { deviceId: device.id, deletedAt: null },
        orderBy: { capturedAt: 'desc' },
        take: 5,
        select: { id: true, capturedAt: true, mimeType: true },
      }),
      this.prisma.applicationUsage.findMany({
        where: { deviceId: device.id },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { id: true, applicationName: true, startedAt: true, durationSeconds: true },
      }),
      this.prisma.websiteUsage.findMany({
        where: { deviceId: device.id },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { id: true, domain: true, startedAt: true, durationSeconds: true },
      }),
    ]);

    const heartbeatTimeoutMinutes =
      device.company.attendancePolicies[0]?.heartbeatTimeoutMinutes ??
      DEFAULT_HEARTBEAT_TIMEOUT_MINUTES;
    const lastHeartbeatAt = latestHeartbeat?.recordedAt ?? device.lastSeenAt ?? null;
    const online = Boolean(
      this.isMonitoringUploadEnabledStatus(device.status) &&
      lastHeartbeatAt &&
      Date.now() - lastHeartbeatAt.getTime() <= Math.max(heartbeatTimeoutMinutes, 1) * 60000,
    );
    const lastSeenAt = this.latestDate([
      device.lastSeenAt,
      latestHeartbeat?.recordedAt ?? null,
      latestActivity?.endedAt ?? null,
      latestScreenshot?.capturedAt ?? null,
    ]);
    const hasTodayActivity = todayActivity._count._all > 0;
    const browserStatus = latestWebsite ? 'CONNECTED' : 'UNKNOWN';

    return {
      id: device.id,
      identity: {
        deviceName: device.deviceName,
        hostname: device.deviceName,
        deviceIdentifier: this.maskDeviceIdentifier(device.deviceIdentifier),
        deviceType: 'Desktop',
        platform: device.platform,
        operatingSystem: this.displayOperatingSystem(device.platform),
        osVersion: device.osVersion,
        architecture: null,
        agentVersion: device.appVersion,
        registeredAt: device.registeredAt.toISOString(),
      },
      assignment: {
        employee: {
          id: device.employee.id,
          name: `${device.employee.user.firstName} ${device.employee.user.lastName}`.trim() || device.employee.user.email,
          employeeCode: device.employee.employeeCode,
          avatarUrl: null,
        },
        department: this.mapOrgUnit(device.employee.department),
        branch: this.mapOrgUnit(device.employee.branch),
        company: {
          id: device.employee.company.id,
          name: device.employee.company.name,
        },
      },
      monitoring: {
        online,
        monitoringEnabled: this.isMonitoringUploadEnabledStatus(device.status),
        securityStatus: device.status,
        trusted: device.status === MonitoringDeviceStatus.TRUSTED,
        revoked: device.status === MonitoringDeviceStatus.REVOKED,
        registrationRequired: device.status === MonitoringDeviceStatus.REREGISTRATION_REQUIRED,
        trustedAt: device.trustedAt?.toISOString() ?? null,
        revokedAt: device.revokedAt?.toISOString() ?? null,
        registrationResetAt: device.registrationResetAt?.toISOString() ?? null,
        reregistrationRequiredAt: device.reregistrationRequiredAt?.toISOString() ?? null,
        registrationVersion: device.registrationVersion,
        lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
        lastActivityAt: latestActivity?.endedAt.toISOString() ?? null,
        lastScreenshotAt: latestScreenshot?.capturedAt.toISOString() ?? null,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
      },
      browserIntegration: {
        status: browserStatus,
        lastConnectedAt: latestWebsite?.startedAt.toISOString() ?? null,
      },
      todayActivity: {
        activeSeconds: todayActivity._sum.activeSeconds ?? 0,
        idleSeconds: todayActivity._sum.idleSeconds ?? 0,
        appsUsed: appsUsed.length,
        websitesUsed: websitesUsed.length,
        keyboardCount: hasTodayActivity ? todayActivity._sum.keyboardCount ?? 0 : null,
        mouseClickCount: hasTodayActivity ? todayActivity._sum.mouseClickCount ?? 0 : null,
        mouseMoveCount: hasTodayActivity ? todayActivity._sum.mouseMoveCount ?? 0 : null,
        scrollCount: hasTodayActivity ? todayActivity._sum.scrollCount ?? 0 : null,
      },
      screenshots: {
        todayCount: todayScreenshotCount,
        lastScreenshotAt: latestScreenshot?.capturedAt.toISOString() ?? null,
        latestScreenshot: latestScreenshot
          ? {
              id: latestScreenshot.id,
              capturedAt: latestScreenshot.capturedAt.toISOString(),
              previewUrl: null,
            }
          : null,
      },
      recentActivity: this.deviceRecentActivityFeed({
        heartbeats: recentHeartbeats,
        activitySessions: recentActivitySessions,
        screenshots: recentScreenshots,
        applications: recentApplications,
        websites: recentWebsites,
      }),
    };
  }

  async deviceHistory(
    deviceId: string,
    query: DeviceHistoryQueryDto,
    actor: AuthenticatedUser,
  ): Promise<DeviceHistoryResponseDto> {
    const where = await this.deviceWhere({ page: 1, limit: 1, deviceId }, actor);
    const device = await this.prisma.monitoringDevice.findFirst({
      where,
      select: { id: true, companyId: true },
    });
    if (!device) throw new NotFoundException('Monitoring device not found');

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.limit ?? 20), 100);
    const actions = this.deviceHistoryActionsForCategory(query.category);
    const filters: Prisma.AuditLogWhereInput[] = [
      {
        companyId: device.companyId,
        entityType: 'MonitoringDevice',
        entityId: device.id,
        action: { in: actions },
      },
    ];

    if (query.actor) filters.push({ actorUserId: query.actor });
    if (query.dateFrom || query.dateTo) {
      const range = this.dateRange({
        page: 1,
        limit: 1,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
      filters.push({ createdAt: range });
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      filters.push({
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { actor: { is: { firstName: { contains: search, mode: 'insensitive' } } } },
          { actor: { is: { lastName: { contains: search, mode: 'insensitive' } } } },
          { actor: { is: { email: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    const auditWhere: Prisma.AuditLogWhereInput = { AND: filters };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: auditWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where: auditWhere }),
    ]);

    return {
      items: records.map((record) => this.mapDeviceHistoryItem(record)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
  async renameDevice(
    deviceId: string,
    dto: RenameMonitoringDeviceDto,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceActionResponseDto> {
    this.assertCanManageDevice(actor);
    const deviceName = dto.deviceName.trim();
    if (deviceName.length < 2) {
      throw new BadRequestException('Device name must contain at least 2 characters');
    }
    const device = await this.visibleDeviceForAction(deviceId, actor);
    const updated = await this.prisma.monitoringDevice.update({
      where: { id: device.id },
      data: { deviceName },
      include: { employee: { select: monitoringEmployeeSelect } },
    });
    await this.writeDeviceAuditLog(actor, updated.companyId, 'MONITORING_DEVICE_RENAMED', updated.id, {
      previousDeviceName: device.deviceName,
      deviceName,
    });
    return this.mapDeviceAction(updated);
  }

  async reassignDevice(
    deviceId: string,
    dto: ReassignMonitoringDeviceDto,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceActionResponseDto> {
    this.assertCanManageDevice(actor);
    const device = await this.visibleDeviceForAction(deviceId, actor);
    const targetEmployee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        companyId: device.companyId,
        deletedAt: null,
        status: EmployeeStatus.ACTIVE,
        AND: [await this.employeeVisibilityWhere(actor)],
      },
      select: monitoringEmployeeSelect,
    });
    if (!targetEmployee) throw new NotFoundException('Target employee not found');

    if (targetEmployee.id === device.employeeId) {
      return this.mapDeviceAction(device);
    }

    try {
      const updated = await this.prisma.monitoringDevice.update({
        where: { id: device.id },
        data: { employeeId: targetEmployee.id },
        include: { employee: { select: monitoringEmployeeSelect } },
      });
      await this.writeDeviceAuditLog(actor, updated.companyId, 'MONITORING_DEVICE_REASSIGNED', updated.id, {
        fromEmployeeId: device.employeeId,
        toEmployeeId: targetEmployee.id,
      });
      return this.mapDeviceAction(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Target employee already has a device with this identifier');
      }
      throw error;
    }
  }

  async updateDeviceMonitoring(
    deviceId: string,
    dto: UpdateMonitoringDeviceMonitoringDto,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceActionResponseDto> {
    this.assertCanManageDevice(actor);
    const device = await this.visibleDeviceForAction(deviceId, actor);
    const monitoringChangeBlockedStatuses: MonitoringDeviceStatus[] = [MonitoringDeviceStatus.REVOKED, MonitoringDeviceStatus.REREGISTRATION_REQUIRED];
    if (monitoringChangeBlockedStatuses.includes(device.status)) {
      throw new BadRequestException('Revoked or registration-required devices cannot be changed by monitoring enablement');
    }
    const nextStatus = dto.enabled ? MonitoringDeviceStatus.ACTIVE : MonitoringDeviceStatus.INACTIVE;
    const updated = await this.prisma.monitoringDevice.update({
      where: { id: device.id },
      data: { status: nextStatus },
      include: { employee: { select: monitoringEmployeeSelect } },
    });
    if (device.status !== nextStatus) {
      await this.writeDeviceAuditLog(
        actor,
        updated.companyId,
        dto.enabled ? 'MONITORING_DEVICE_ENABLED' : 'MONITORING_DEVICE_DISABLED',
        updated.id,
        { previousStatus: device.status, status: nextStatus },
      );
    }
    return this.mapDeviceAction(updated);
  }
  async trustDevice(
    deviceId: string,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceActionResponseDto> {
    this.assertCanManageDevice(actor);
    const device = await this.visibleDeviceForAction(deviceId, actor);
    const alreadyTrusted = device.status === MonitoringDeviceStatus.TRUSTED;
    const now = new Date();
    const updated = await this.prisma.monitoringDevice.update({
      where: { id: device.id },
      data: {
        status: MonitoringDeviceStatus.TRUSTED,
        trustedAt: device.trustedAt ?? now,
        revokedAt: null,
        reregistrationRequiredAt: null,
      },
      include: { employee: { select: monitoringEmployeeSelect } },
    });
    if (!alreadyTrusted) {
      await this.writeDeviceAuditLog(actor, updated.companyId, 'DEVICE_TRUSTED', updated.id, {
        previousStatus: device.status,
        status: updated.status,
      });
    }
    return this.mapDeviceAction(updated);
  }

  async revokeDevice(
    deviceId: string,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceActionResponseDto> {
    this.assertCanManageDevice(actor);
    const device = await this.visibleDeviceForAction(deviceId, actor);
    const alreadyRevoked = device.status === MonitoringDeviceStatus.REVOKED;
    const now = new Date();
    const updated = await this.prisma.monitoringDevice.update({
      where: { id: device.id },
      data: {
        status: MonitoringDeviceStatus.REVOKED,
        revokedAt: device.revokedAt ?? now,
        reregistrationRequiredAt: null,
      },
      include: { employee: { select: monitoringEmployeeSelect } },
    });
    if (!alreadyRevoked) {
      await this.writeDeviceAuditLog(actor, updated.companyId, 'DEVICE_REVOKED', updated.id, {
        previousStatus: device.status,
        status: updated.status,
      });
    }
    return this.mapDeviceAction(updated);
  }

  async resetDeviceRegistration(
    deviceId: string,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceActionResponseDto> {
    this.assertCanManageDevice(actor);
    const device = await this.visibleDeviceForAction(deviceId, actor);
    const now = new Date();
    const updated = await this.prisma.monitoringDevice.update({
      where: { id: device.id },
      data: {
        status: MonitoringDeviceStatus.REREGISTRATION_REQUIRED,
        registrationVersion: { increment: 1 },
        registrationResetAt: now,
        reregistrationRequiredAt: now,
      },
      include: { employee: { select: monitoringEmployeeSelect } },
    });
    await this.writeDeviceAuditLog(actor, updated.companyId, 'DEVICE_REGISTRATION_RESET', updated.id, {
      previousStatus: device.status,
      status: updated.status,
      registrationVersion: updated.registrationVersion,
    });
    return this.mapDeviceAction(updated);
  }

  async forceDeviceReregistration(
    deviceId: string,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceActionResponseDto> {
    this.assertCanManageDevice(actor);
    const device = await this.visibleDeviceForAction(deviceId, actor);
    const now = new Date();
    const updated = await this.prisma.monitoringDevice.update({
      where: { id: device.id },
      data: {
        status: MonitoringDeviceStatus.REREGISTRATION_REQUIRED,
        registrationVersion: { increment: 1 },
        reregistrationRequiredAt: now,
      },
      include: { employee: { select: monitoringEmployeeSelect } },
    });
    await this.writeDeviceAuditLog(actor, updated.companyId, 'DEVICE_FORCE_REREGISTRATION', updated.id, {
      previousStatus: device.status,
      status: updated.status,
      registrationVersion: updated.registrationVersion,
    });
    return this.mapDeviceAction(updated);
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

  async idle(
    query: MonitoringIdleQueryDto,
    actor: AuthenticatedUser,
  ): Promise<MonitoringIdleResponseDto> {
    const range = this.dateRange(query);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? query.limit ?? 20));
    const employeeFilters: Prisma.EmployeeWhereInput[] = [
      await this.employeeVisibilityWhere(actor),
      { deletedAt: null },
    ];

    if (query.companyId) employeeFilters.push({ companyId: query.companyId });
    if (query.employeeId) employeeFilters.push({ id: query.employeeId });
    if (query.branchId) employeeFilters.push({ branchId: query.branchId });
    if (query.departmentId) employeeFilters.push({ departmentId: query.departmentId });
    if (query.search) employeeFilters.push(this.employeeSearchWhere(query.search));

    const employeeWhere: Prisma.EmployeeWhereInput = { AND: employeeFilters };
    const sessionWhere: Prisma.ActivitySessionWhereInput = {
      employee: { is: employeeWhere },
      startedAt: { lte: range.lte },
      endedAt: { gte: range.gte },
    };

    const groupedSessions = await this.prisma.activitySession.groupBy({
      by: ['employeeId'],
      where: sessionWhere,
      _count: { _all: true },
      _sum: { activeSeconds: true, idleSeconds: true },
      _max: { idleSeconds: true },
    });

    const allEmployeeMetrics = groupedSessions
      .map((group) => {
        const activeSeconds = this.nonNegativeSeconds(group._sum.activeSeconds);
        const idleSeconds = this.nonNegativeSeconds(group._sum.idleSeconds);
        const onlineSeconds = activeSeconds + idleSeconds;
        return {
          employeeId: group.employeeId,
          activeSeconds,
          idleSeconds,
          onlineSeconds,
          idlePercentage: this.idlePercentage(idleSeconds, onlineSeconds),
          longestIdleSeconds: this.nonNegativeSeconds(group._max.idleSeconds),
          sessions: group._count._all,
        };
      })
      .filter((metric) => metric.onlineSeconds > 0)
      .filter((metric) => query.idlePercentageMin === undefined || metric.idlePercentage >= query.idlePercentageMin)
      .sort((a, b) => b.idleSeconds - a.idleSeconds || a.employeeId.localeCompare(b.employeeId));

    const total = allEmployeeMetrics.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pagedMetrics = allEmployeeMetrics.slice((page - 1) * pageSize, page * pageSize);
    const pagedEmployeeIds = pagedMetrics.map((metric) => metric.employeeId);
    const analyticsEmployeeIds = allEmployeeMetrics.map((metric) => metric.employeeId);

    const [employees, timelineSessions, longestIdleSessions] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where: { id: { in: pagedEmployeeIds } },
        select: {
          ...monitoringEmployeeSelect,
          department: { select: monitoringOrgUnitSelect },
          branch: { select: monitoringOrgUnitSelect },
        },
      }),
      this.prisma.activitySession.findMany({
        where: {
          employeeId: { in: pagedEmployeeIds.length > 0 ? pagedEmployeeIds : ['__empty__'] },
          startedAt: { lte: range.lte },
          endedAt: { gte: range.gte },
        },
        orderBy: [{ employeeId: 'asc' }, { startedAt: 'asc' }],
        take: pageSize * 80,
        select: {
          id: true,
          employeeId: true,
          startedAt: true,
          endedAt: true,
          activeSeconds: true,
          idleSeconds: true,
        },
      }),
      this.prisma.activitySession.findMany({
        where: {
          ...sessionWhere,
          ...(analyticsEmployeeIds.length > 0 ? { employeeId: { in: analyticsEmployeeIds } } : { employeeId: '__empty__' }),
          idleSeconds: { gt: 0 },
        },
        orderBy: [{ idleSeconds: 'desc' }, { startedAt: 'desc' }],
        take: 10,
        include: {
          employee: {
            select: {
              ...monitoringEmployeeSelect,
              department: { select: monitoringOrgUnitSelect },
              branch: { select: monitoringOrgUnitSelect },
            },
          },
        },
      }),
    ]);

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const employeeRows = pagedMetrics
      .map((metric) => {
        const employee = employeeById.get(metric.employeeId);
        if (!employee) return null;
        return {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employee: this.mapEmployee(employee),
          department: this.mapOrgUnit(employee.department),
          branch: this.mapOrgUnit(employee.branch),
          activeSeconds: metric.activeSeconds,
          idleSeconds: metric.idleSeconds,
          onlineSeconds: metric.onlineSeconds,
          idlePercentage: metric.idlePercentage,
          longestIdleSeconds: metric.longestIdleSeconds,
          sessions: metric.sessions,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const totalActiveSeconds = allEmployeeMetrics.reduce((totalValue, item) => totalValue + item.activeSeconds, 0);
    const totalIdleSeconds = allEmployeeMetrics.reduce((totalValue, item) => totalValue + item.idleSeconds, 0);
    const totalOnlineSeconds = totalActiveSeconds + totalIdleSeconds;
    const totalSessions = allEmployeeMetrics.reduce((totalValue, item) => totalValue + item.sessions, 0);

    return {
      summary: {
        totalActiveSeconds,
        totalIdleSeconds,
        idlePercentage: this.idlePercentage(totalIdleSeconds, totalOnlineSeconds),
        employeesWithHighIdle: allEmployeeMetrics.filter((item) => item.idlePercentage >= HIGH_IDLE_PERCENTAGE_THRESHOLD).length,
        averageIdleSeconds: allEmployeeMetrics.length > 0 ? Math.round(totalIdleSeconds / allEmployeeMetrics.length) : 0,
        totalSessions,
      },
      employees: employeeRows,
      timeline: timelineSessions
        .map((session) => this.mapIdleTimelineSegment(session, range))
        .filter((segment): segment is NonNullable<typeof segment> => segment !== null),
      longestIdlePeriods: longestIdleSessions.map((session) => ({
        id: session.id,
        employeeId: session.employeeId,
        employeeCode: session.employee.employeeCode,
        employee: this.mapEmployee(session.employee),
        department: this.mapOrgUnit(session.employee.department),
        branch: this.mapOrgUnit(session.employee.branch),
        start: this.clampDate(session.startedAt, range.gte, range.lte).toISOString(),
        end: this.clampDate(session.endedAt, range.gte, range.lte).toISOString(),
        durationSeconds: Math.min(
          this.nonNegativeSeconds(session.idleSeconds),
          this.durationSeconds(this.clampDate(session.startedAt, range.gte, range.lte), this.clampDate(session.endedAt, range.gte, range.lte)),
        ),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
      range: {
        from: range.gte.toISOString(),
        to: range.lte.toISOString(),
      },
    };
  }
  async summary(
    query: MonitoringSummaryQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedMonitoringSummaryResponseDto> {
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
    const activityRangeWhere: Prisma.ActivitySessionWhereInput = {
      startedAt: { lte: range.lte },
      endedAt: { gte: range.gte },
    };
    const inputTotalsWhere: Prisma.ActivitySessionWhereInput = {
      employee: { is: where },
      ...activityRangeWhere,
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
    };
    const websiteTotalsWhere: Prisma.WebsiteUsageWhereInput = {
      employee: { is: where },
      startedAt: range,
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
    };
    const [employees, total, inputTotals, topWebsiteGroups, teamActivityGroups] = await this.prisma.$transaction([
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
      this.prisma.activitySession.aggregate({
        where: inputTotalsWhere,
        _count: { _all: true },
        _sum: {
          keyboardCount: true,
          mouseClickCount: true,
          mouseMoveCount: true,
          scrollCount: true,
        },
      }),
      this.prisma.websiteUsage.groupBy({
        by: ['domain'],
        where: websiteTotalsWhere,
        _sum: { durationSeconds: true },
        _count: { _all: true },
        orderBy: { _sum: { durationSeconds: 'desc' } },
        take: 5,
      }),
      this.prisma.activitySession.groupBy({
        by: ['employeeId'],
        where: inputTotalsWhere,
        orderBy: { employeeId: 'asc' },
        _sum: { activeSeconds: true, idleSeconds: true },
      }),
    ]);
    const teamActivityBreakdown = await this.buildTeamActivityBreakdown(teamActivityGroups);
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
              ...activityRangeWhere,
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
      inputTotals: {
        totalKeyboardCount: inputTotals._count._all > 0 ? inputTotals._sum.keyboardCount ?? 0 : null,
        totalMouseClickCount: inputTotals._count._all > 0 ? inputTotals._sum.mouseClickCount ?? 0 : null,
        totalMouseMoveCount: inputTotals._count._all > 0 ? inputTotals._sum.mouseMoveCount ?? 0 : null,
        totalScrollCount: inputTotals._count._all > 0 ? inputTotals._sum.scrollCount ?? 0 : null,
      },
      topWebsites: topWebsiteGroups.map((group) => {
        const entries = typeof group._count === 'object'
          ? group._count._all ?? 0
          : 0;
        return {
          domain: group.domain,
          durationSeconds: group._sum?.durationSeconds ?? 0,
          entries,
        };
      }),
      teamActivityBreakdown,
      range: {
        from: range.gte?.toISOString(),
        to: range.lte?.toISOString(),
      },
    };
  }

  private async buildTeamActivityBreakdown(
    groups: TeamActivityEmployeeAggregate[],
  ): Promise<TeamActivityBreakdownItem[]> {
    if (!groups.length) return [];

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: groups.map((group) => group.employeeId) } },
      select: {
        id: true,
        departmentId: true,
        department: {
          select: { id: true, name: true },
        },
      },
    });
    const employeesById = new Map<string, TeamActivityEmployeeDepartment>(
      employees.map((employee) => [employee.id, employee]),
    );
    const byDepartment = new Map<string, TeamActivityAccumulator>();

    for (const group of groups) {
      const employee = employeesById.get(group.employeeId);
      if (!employee) continue;

      const departmentId = employee.department?.id ?? employee.departmentId ?? null;
      const departmentName = employee.department?.name?.trim() || 'Unassigned';
      const key = departmentId ?? 'unassigned';
      const activeSeconds = this.nonNegativeSeconds(group._sum?.activeSeconds);
      const idleSeconds = this.nonNegativeSeconds(group._sum?.idleSeconds);
      const current = byDepartment.get(key) ?? {
        departmentId,
        departmentName,
        employeeIds: new Set<string>(),
        activeSeconds: 0,
        idleSeconds: 0,
      };

      current.employeeIds.add(group.employeeId);
      current.activeSeconds += activeSeconds;
      current.idleSeconds += idleSeconds;
      byDepartment.set(key, current);
    }

    return Array.from(byDepartment.values())
      .map((item) => {
        const onlineSeconds = item.activeSeconds + item.idleSeconds;
        return {
          departmentId: item.departmentId,
          departmentName: item.departmentName,
          employeeCount: item.employeeIds.size,
          onlineSeconds,
          activeSeconds: item.activeSeconds,
          idleSeconds: item.idleSeconds,
          activityPercentage: this.activityPercentage(item.activeSeconds, onlineSeconds),
        };
      })
      .filter((item) => item.employeeCount > 0 && item.onlineSeconds > 0)
      .sort((a, b) => b.onlineSeconds - a.onlineSeconds || a.departmentName.localeCompare(b.departmentName));
  }

  private idlePercentage(idleSeconds: number, onlineSeconds: number): number {
    if (onlineSeconds <= 0) return 0;
    return Math.min(100, Math.max(0, Number(((idleSeconds / onlineSeconds) * 100).toFixed(2))));
  }

  private clampDate(value: Date, min: Date, max: Date): Date {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  private mapIdleTimelineSegment(
    session: Pick<Prisma.ActivitySessionGetPayload<Record<string, never>>, 'id' | 'employeeId' | 'startedAt' | 'endedAt' | 'activeSeconds' | 'idleSeconds'>,
    range: { gte: Date; lte: Date },
  ) {
    const start = this.clampDate(session.startedAt, range.gte, range.lte);
    const end = this.clampDate(session.endedAt, range.gte, range.lte);
    const durationSeconds = this.durationSeconds(start, end);
    if (durationSeconds <= 0) return null;
    const idleSeconds = this.nonNegativeSeconds(session.idleSeconds);
    const activeSeconds = this.nonNegativeSeconds(session.activeSeconds);
    const type: 'ACTIVE' | 'IDLE' = idleSeconds > 0 && activeSeconds === 0 ? 'IDLE' : 'ACTIVE';
    return {
      employeeId: session.employeeId,
      type,
      start: start.toISOString(),
      end: end.toISOString(),
      durationSeconds: Math.min(durationSeconds, type === 'IDLE' ? idleSeconds : activeSeconds || durationSeconds),
      source: 'ACTIVITY_SESSION' as const,
      activitySessionId: session.id,
    };
  }
  private nonNegativeSeconds(value: number | null | undefined): number {
    return Math.max(0, Math.round(value ?? 0));
  }

  private activityPercentage(activeSeconds: number, onlineSeconds: number): number {
    if (onlineSeconds <= 0) return 0;
    return Math.min(100, Math.max(0, (activeSeconds / onlineSeconds) * 100));
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
      { startedAt: { lte: range.lte }, endedAt: { gte: range.gte } },
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
    const onlineThreshold = await this.deviceOnlineThreshold(actor);
    const filters: Prisma.MonitoringDeviceWhereInput[] = [
      { employee: { is: await this.employeeReadWhere(actor, query) } },
      { deletedAt: null },
    ];
    if (query.deviceId) filters.push({ id: query.deviceId });
    if (query.branchId) filters.push({ employee: { is: { branchId: query.branchId } } });
    if (query.departmentId) filters.push({ employee: { is: { departmentId: query.departmentId } } });
    if (query.status) filters.push({ status: query.status });
    if (typeof query.monitoringEnabled === 'boolean') {
      filters.push(query.monitoringEnabled
        ? { status: { in: monitoringUploadEnabledStatuses } }
        : { status: { not: MonitoringDeviceStatus.ACTIVE } });
    }
    if (typeof query.browserConnected === 'boolean') {
      filters.push(query.browserConnected
        ? { websiteUsages: { some: {} } }
        : { websiteUsages: { none: {} } });
    }
    if (typeof query.online === 'boolean') {
      filters.push(query.online
        ? {
            status: MonitoringDeviceStatus.ACTIVE,
            lastSeenAt: { gte: onlineThreshold },
          }
        : {
            OR: [
              { status: { not: MonitoringDeviceStatus.ACTIVE } },
              { lastSeenAt: null },
              { lastSeenAt: { lt: onlineThreshold } },
            ],
          });
    }
    if (query.search) {
      filters.push({
        OR: [
          { employee: { is: this.employeeSearchWhere(query.search) } },
          { employee: { is: { branch: { is: { name: { contains: query.search, mode: 'insensitive' } } } } } },
          { employee: { is: { department: { is: { name: { contains: query.search, mode: 'insensitive' } } } } } },
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

  private async deviceOnlineThreshold(actor: AuthenticatedUser): Promise<Date> {
    let timeoutMinutes = DEFAULT_HEARTBEAT_TIMEOUT_MINUTES;
    if (actor.companyId) {
      const policy = await this.prisma.attendancePolicy.findFirst({
        where: { companyId: actor.companyId, isActive: true },
        select: { heartbeatTimeoutMinutes: true },
      });
      timeoutMinutes = policy?.heartbeatTimeoutMinutes ?? timeoutMinutes;
    }
    return new Date(Date.now() - Math.max(timeoutMinutes, 1) * 60000);
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

  private mapOrgUnit(
    unit: { id: string; name: string; code: string } | null,
  ) {
    return unit
      ? {
          id: unit.id,
          name: unit.name,
          code: unit.code,
        }
      : null;
  }

  private mapDevice(
    device: Prisma.MonitoringDeviceGetPayload<{
      include: {
        employee: {
          select: typeof monitoringEmployeeSelect & {
            branch: { select: typeof monitoringOrgUnitSelect };
            department: { select: typeof monitoringOrgUnitSelect };
          };
        };
        company: {
          select: {
            attendancePolicies: {
              where: { isActive: true };
              take: 1;
              select: { heartbeatTimeoutMinutes: true };
            };
          };
        };
        heartbeats: { select: { recordedAt: true } };
        activitySessions: { select: { endedAt: true } };
        screenshots: { select: { capturedAt: true } };
        websiteUsages: { select: { startedAt: true } };
      };
    }>,
  ): MonitoringDeviceResponseDto {
    const lastHeartbeatAt = device.heartbeats[0]?.recordedAt ?? device.lastSeenAt ?? null;
    const heartbeatTimeoutMinutes =
      device.company.attendancePolicies[0]?.heartbeatTimeoutMinutes ??
      DEFAULT_HEARTBEAT_TIMEOUT_MINUTES;
    const online = Boolean(
      this.isMonitoringUploadEnabledStatus(device.status) &&
      lastHeartbeatAt &&
      Date.now() - lastHeartbeatAt.getTime() <= Math.max(heartbeatTimeoutMinutes, 1) * 60000,
    );
    return {
      id: device.id,
      employee: this.mapEmployee(device.employee),
      deviceIdentifier: device.deviceIdentifier,
      deviceName: device.deviceName,
      hostname: device.deviceName,
      platform: device.platform,
      operatingSystem: this.displayOperatingSystem(device.platform),
      osVersion: device.osVersion,
      deviceType: 'Desktop',
      agentVersion: device.appVersion,
      department: this.mapOrgUnit(device.employee.department),
      branch: this.mapOrgUnit(device.employee.branch),
      browserExtensionInstalled: null,
      browserExtensionConnected: device.websiteUsages.length > 0,
      monitoringEnabled: this.isMonitoringUploadEnabledStatus(device.status),
      online,
      status: device.status,
      securityStatus: device.status,
      trusted: device.status === MonitoringDeviceStatus.TRUSTED,
      revoked: device.status === MonitoringDeviceStatus.REVOKED,
      registrationRequired: device.status === MonitoringDeviceStatus.REREGISTRATION_REQUIRED,
      lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
      lastActivityAt: device.activitySessions[0]?.endedAt.toISOString() ?? null,
      lastScreenshotAt: device.screenshots[0]?.capturedAt.toISOString() ?? null,
      registeredAt: device.registeredAt.toISOString(),
    };
  }

  private displayOperatingSystem(platform: string): string {
    const normalized = platform.trim().toLowerCase();
    if (['win32', 'windows', 'win'].includes(normalized)) return 'Windows';
    if (['darwin', 'macos', 'mac'].includes(normalized)) return 'macOS';
    if (['linux'].includes(normalized)) return 'Linux';
    return platform || 'Unknown';
  }

  private groupCount(group: { _count?: true | { id?: number; _all?: number } }): number {
    if (!group._count || group._count === true) return 0;
    return group._count.id ?? group._count._all ?? 0;
  }

  private maskDeviceIdentifier(value: string | null): string | null {
    if (!value) return null;
    if (value.length <= 8) return value;
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private latestDate(values: Array<Date | null>): Date | null {
    return values.reduce<Date | null>((latest, value) => {
      if (!value) return latest;
      if (!latest || value > latest) return value;
      return latest;
    }, null);
  }

  private deviceRecentActivityFeed(records: {
    heartbeats: Array<{ id: string; recordedAt: Date }>;
    activitySessions: Array<{
      id: string;
      startedAt: Date;
      endedAt: Date;
      activeSeconds: number;
      idleSeconds: number;
    }>;
    screenshots: Array<{ id: string; capturedAt: Date; mimeType: string }>;
    applications: Array<{
      id: string;
      applicationName: string;
      startedAt: Date;
      durationSeconds: number;
    }>;
    websites: Array<{
      id: string;
      domain: string;
      startedAt: Date;
      durationSeconds: number;
    }>;
  }): MonitoringDeviceDetailResponseDto['recentActivity'] {
    const items: DeviceRecentActivityItem[] = [
      ...records.heartbeats.map((heartbeat) => ({
        id: heartbeat.id,
        type: 'HEARTBEAT' as const,
        occurredAt: heartbeat.recordedAt,
        title: 'Heartbeat received',
        description: 'The desktop agent reported device availability.',
      })),
      ...records.activitySessions.map((session) => ({
        id: session.id,
        type: 'ACTIVITY' as const,
        occurredAt: session.endedAt,
        title: 'Activity session recorded',
        description: `${this.durationSeconds(session.startedAt, session.endedAt)} seconds captured with ${session.activeSeconds} active seconds and ${session.idleSeconds} idle seconds.`,
      })),
      ...records.screenshots.map((screenshot) => ({
        id: screenshot.id,
        type: 'SCREENSHOT' as const,
        occurredAt: screenshot.capturedAt,
        title: 'Screenshot captured',
        description: screenshot.mimeType,
      })),
      ...records.applications.map((application) => ({
        id: application.id,
        type: 'APPLICATION' as const,
        occurredAt: application.startedAt,
        title: `Application used: ${application.applicationName}`,
        description: `${application.durationSeconds} seconds`,
      })),
      ...records.websites.map((website) => ({
        id: website.id,
        type: 'WEBSITE' as const,
        occurredAt: website.startedAt,
        title: `Website used: ${website.domain}`,
        description: `${website.durationSeconds} seconds`,
      })),
    ];
    return items
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 15)
      .map((item) => ({
        id: item.id,
        type: item.type,
        occurredAt: item.occurredAt.toISOString(),
        title: item.title,
        description: item.description,
      }));
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

  private async attachScreenshotInputMetric(
    screenshot: ScreenshotWithEmployee,
  ): Promise<ScreenshotWithInputMetrics> {
    const [screenshotWithMetrics] = await this.attachScreenshotInputMetrics([screenshot]);
    return screenshotWithMetrics ?? { ...screenshot, inputMetrics: null };
  }

  private async attachScreenshotInputMetrics(
    screenshots: ScreenshotWithEmployee[],
  ): Promise<ScreenshotWithInputMetrics[]> {
    if (!screenshots.length) return [];

    const capturedTimes = screenshots.map((screenshot) => screenshot.capturedAt.getTime());
    const rangeStart = new Date(Math.min(...capturedTimes));
    const rangeEnd = new Date(Math.max(...capturedTimes));
    const employeeIds = Array.from(new Set(screenshots.map((screenshot) => screenshot.employeeId)));
    const deviceIds = Array.from(new Set(screenshots.map((screenshot) => screenshot.deviceId)));

    const sessions = await this.prisma.activitySession.findMany({
      where: {
        employeeId: { in: employeeIds },
        deviceId: { in: deviceIds },
        startedAt: { lte: rangeEnd },
        endedAt: { gte: rangeStart },
      },
      select: {
        employeeId: true,
        deviceId: true,
        startedAt: true,
        endedAt: true,
        keyboardCount: true,
        mouseClickCount: true,
        mouseMoveCount: true,
        scrollCount: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    return screenshots.map((screenshot) => {
      const session = sessions.find((candidate) =>
        candidate.employeeId === screenshot.employeeId &&
        candidate.deviceId === screenshot.deviceId &&
        candidate.startedAt <= screenshot.capturedAt &&
        candidate.endedAt >= screenshot.capturedAt,
      );
      return {
        ...screenshot,
        inputMetrics: session ? this.mapScreenshotInputMetrics(session) : null,
      };
    });
  }

  private mapScreenshotInputMetrics(
    session: ScreenshotInputMetricsSession,
  ): ScreenshotInputMetrics {
    return {
      keyboardCount: session.keyboardCount,
      mouseClickCount: session.mouseClickCount,
      mouseMoveCount: session.mouseMoveCount,
      scrollCount: session.scrollCount,
    };
  }

  private mapScreenshot(
    screenshot: ScreenshotWithInputMetrics,
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
      inputMetrics: screenshot.inputMetrics ?? null,
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
            deviceName: device.deviceName,
            hostname: device.deviceName,
            platform: device.platform,
            operatingSystem: this.displayOperatingSystem(device.platform),
            osVersion: device.osVersion,
            deviceType: 'Desktop',
            agentVersion: device.appVersion,
            department: null,
            branch: null,
            browserExtensionInstalled: null,
            browserExtensionConnected: null,
            monitoringEnabled: this.isMonitoringUploadEnabledStatus(device.status),
            online: this.isMonitoringUploadEnabledStatus(device.status)
              && device.lastSeenAt !== null
              && device.lastSeenAt >= new Date(Date.now() - heartbeatTimeoutMinutes * 60 * 1000),
            status: device.status,
            securityStatus: device.status,
            trusted: device.status === MonitoringDeviceStatus.TRUSTED,
            revoked: device.status === MonitoringDeviceStatus.REVOKED,
            registrationRequired: device.status === MonitoringDeviceStatus.REREGISTRATION_REQUIRED,
            lastHeartbeatAt: device.lastSeenAt?.toISOString() ?? null,
            lastActivityAt: null,
            lastScreenshotAt: null,
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

  private isMonitoringUploadEnabledStatus(status: MonitoringDeviceStatus): boolean {
    return monitoringUploadEnabledStatuses.includes(status);
  }
  private assertCanManageDevice(actor: AuthenticatedUser): void {
    const allowed: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR];
    if (actor.roles.some((role) => allowed.includes(role))) return;
    throw new ForbiddenException('Device management is not allowed for this role');
  }

  private async visibleDeviceForAction(
    deviceId: string,
    actor: AuthenticatedUser,
  ): Promise<MonitoringDeviceActionRecord> {
    const where = await this.deviceWhere({ page: 1, limit: 1, deviceId }, actor);
    const device = await this.prisma.monitoringDevice.findFirst({
      where,
      include: { employee: { select: monitoringEmployeeSelect } },
    });
    if (!device) throw new NotFoundException('Monitoring device not found');
    return device;
  }

  private mapDeviceAction(device: MonitoringDeviceActionRecord): MonitoringDeviceActionResponseDto {
    return {
      success: true,
      device: {
        id: device.id,
        deviceName: device.deviceName,
        employee: this.mapEmployee(device.employee),
        monitoringEnabled: this.isMonitoringUploadEnabledStatus(device.status),
        status: device.status,
        securityStatus: device.status,
        registrationRequired: device.status === MonitoringDeviceStatus.REREGISTRATION_REQUIRED,
        registrationVersion: device.registrationVersion,
        trustedAt: device.trustedAt?.toISOString() ?? null,
        revokedAt: device.revokedAt?.toISOString() ?? null,
        registrationResetAt: device.registrationResetAt?.toISOString() ?? null,
        reregistrationRequiredAt: device.reregistrationRequiredAt?.toISOString() ?? null,
        updatedAt: device.updatedAt.toISOString(),
      },
    };
  }

  private deviceHistoryActionsForCategory(category?: DeviceHistoryCategory): DeviceHistoryAction[] {
    const actions = Object.keys(deviceHistoryActionCategories) as DeviceHistoryAction[];
    if (!category) return actions;
    return actions.filter((action) => deviceHistoryActionCategories[action] === category);
  }

  private mapDeviceHistoryItem(record: DeviceHistoryAuditLogRecord): DeviceHistoryItemDto {
    const action = this.normalizeDeviceHistoryAction(record.action);
    const category = deviceHistoryActionCategories[action] ?? 'SYSTEM';
    const actorName = record.actor
      ? `${record.actor.firstName} ${record.actor.lastName}`.trim() || record.actor.email
      : 'System';
    const metadata = this.sanitizeDeviceHistoryMetadata(record.metadata);
    const descriptor = this.deviceHistoryDescriptor(action, metadata, actorName);

    return {
      id: record.id,
      occurredAt: record.createdAt.toISOString(),
      actor: {
        id: record.actor?.id ?? null,
        name: actorName,
        email: record.actor?.email ?? null,
      },
      action: record.action,
      category,
      title: descriptor.title,
      description: descriptor.description,
      metadata,
    };
  }

  private normalizeDeviceHistoryAction(action: string): DeviceHistoryAction {
    return (action in deviceHistoryActionCategories
      ? action
      : 'DEVICE_REGISTERED') as DeviceHistoryAction;
  }

  private deviceHistoryDescriptor(
    action: DeviceHistoryAction,
    metadata: Record<string, unknown> | null,
    actorName: string,
  ): { title: string; description: string } {
    switch (action) {
      case 'DEVICE_REGISTERED':
        return { title: 'Device registered', description: `Device registration was completed by ${actorName}.` };
      case 'MONITORING_DEVICE_RENAMED':
      case 'DEVICE_RENAMED':
        return { title: 'Device renamed', description: this.renameHistoryDescription(metadata, actorName) };
      case 'MONITORING_DEVICE_REASSIGNED':
      case 'DEVICE_REASSIGNED':
        return { title: 'Device reassigned', description: `Device assignment was changed by ${actorName}.` };
      case 'MONITORING_DEVICE_ENABLED':
      case 'DEVICE_MONITORING_ENABLED':
        return { title: 'Monitoring enabled', description: `Monitoring ingestion was enabled by ${actorName}.` };
      case 'MONITORING_DEVICE_DISABLED':
      case 'DEVICE_MONITORING_DISABLED':
        return { title: 'Monitoring disabled', description: `Monitoring ingestion was disabled by ${actorName}.` };
      case 'DEVICE_TRUSTED':
        return { title: 'Device trusted', description: `Device was marked as trusted by ${actorName}.` };
      case 'DEVICE_REVOKED':
        return { title: 'Device revoked', description: `Device access was revoked by ${actorName}.` };
      case 'DEVICE_REGISTRATION_RESET':
        return { title: 'Registration reset', description: `Device registration was reset by ${actorName}.` };
      case 'DEVICE_FORCE_REREGISTRATION':
        return { title: 'Re-registration required', description: `Fresh device registration was required by ${actorName}.` };
      default:
        return { title: 'Device event', description: `Device history event was recorded by ${actorName}.` };
    }
  }

  private renameHistoryDescription(metadata: Record<string, unknown> | null, actorName: string): string {
    const previous = typeof metadata?.previousDeviceName === 'string' ? metadata.previousDeviceName : null;
    const next = typeof metadata?.deviceName === 'string' ? metadata.deviceName : null;
    if (previous && next) return `Device name changed from "${previous}" to "${next}" by ${actorName}.`;
    return `Device name was changed by ${actorName}.`;
  }

  private sanitizeDeviceHistoryMetadata(value: Prisma.JsonValue): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return this.sanitizeDeviceHistoryMetadataObject(value as Record<string, unknown>);
  }

  private sanitizeDeviceHistoryMetadataObject(value: Record<string, unknown>): Record<string, unknown> | null {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (this.isSensitiveDeviceHistoryMetadataKey(key)) continue;
      if (entry === null || ['string', 'number', 'boolean'].includes(typeof entry)) {
        sanitized[key] = entry;
      } else if (Array.isArray(entry)) {
        const safeArray = entry.filter((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 20);
        if (safeArray.length) sanitized[key] = safeArray;
      } else if (typeof entry === 'object') {
        const nested = this.sanitizeDeviceHistoryMetadataObject(entry as Record<string, unknown>);
        if (nested && Object.keys(nested).length) sanitized[key] = nested;
      }
    }
    return Object.keys(sanitized).length ? sanitized : null;
  }

  private isSensitiveDeviceHistoryMetadataKey(key: string): boolean {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return sensitiveDeviceHistoryMetadataKeys.some((sensitiveKey) => normalized.includes(sensitiveKey));
  }
  private async writeDeviceAuditLog(
    actor: AuthenticatedUser,
    companyId: string,
    action: string,
    deviceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId,
        actorUserId: actor.id,
        action,
        entityType: 'MonitoringDevice',
        entityId: deviceId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private async ownedHeartbeatDevice(id: string, actor: AuthenticatedUser) {
    const employee = await this.ownActiveEmployee(actor);
    const device = await this.prisma.monitoringDevice.findFirst({
      where: {
        id,
        employeeId: employee.id,
        companyId: employee.companyId,
        status: { in: heartbeatAllowedDeviceStatuses },
        deletedAt: null,
      },
      select: { id: true, companyId: true, employeeId: true },
    });
    if (!device) {
      throw new NotFoundException('Monitoring device not found');
    }
    return device;
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

  private sanitizeWebsiteUsage(
    usage: WebsiteUsageDto,
    sessionStartedAt: Date,
    sessionEndedAt: Date,
  ): {
    browserName?: string;
    domain: string;
    url?: string;
    pageTitle?: string;
    startedAt: Date;
    endedAt: Date;
    durationSeconds: number;
  } {
    const startedAt = new Date(usage.startedAt);
    const endedAt = new Date(usage.endedAt);
    this.assertPeriod(startedAt, endedAt, 'Website usage');
    if (startedAt < sessionStartedAt || endedAt > sessionEndedAt) {
      throw new BadRequestException(
        'Website usage must be within the parent activity session',
      );
    }

    const domain = this.normalizeWebsiteDomain(usage.domain);
    if (usage.url) {
      const urlDomain = this.normalizeWebsiteUrlDomain(usage.url);
      if (urlDomain !== domain) {
        throw new BadRequestException(
          'Website usage URL host must match the submitted domain',
        );
      }
    }

    const actualDurationSeconds = this.durationSeconds(startedAt, endedAt);
    if (usage.durationSeconds > actualDurationSeconds + 1) {
      throw new BadRequestException(
        'Website usage duration must not exceed its time interval',
      );
    }

    return {
      browserName: usage.browserName?.trim() || undefined,
      domain,
      // Do not persist raw URL paths, query strings, or fragments. The normalized
      // domain is sufficient for website analytics and keeps privacy boundaries clear.
      url: undefined,
      pageTitle: usage.pageTitle?.trim() || undefined,
      startedAt,
      endedAt,
      durationSeconds: usage.durationSeconds,
    };
  }

  private normalizeWebsiteUrlDomain(value: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value.trim());
    } catch {
      throw new BadRequestException('Website usage URL must be a valid URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Website usage URL must use http or https');
    }
    return this.normalizeWebsiteDomain(parsed.hostname);
  }

  private normalizeWebsiteDomain(value: string): string {
    const raw = value.trim().toLowerCase().replace(/\.$/, '');
    if (!raw) throw new BadRequestException('Website usage domain is required');
    if (raw.length > 253) {
      throw new BadRequestException('Website usage domain is too long');
    }
    if (
      raw.includes('://') ||
      /[/?#@:\s]/.test(raw) ||
      raw === 'localhost' ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(raw) ||
      /^\[?[a-f0-9:]+\]?$/.test(raw)
    ) {
      throw new BadRequestException('Website usage domain must be a public hostname');
    }

    const domain = raw.startsWith('www.') ? raw.slice(4) : raw;
    if (
      fakeWebsiteDomains.has(domain.replace(/[^a-z0-9]/g, '')) ||
      !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
    ) {
      throw new BadRequestException('Website usage domain is not valid');
    }
    return domain;
  }
}

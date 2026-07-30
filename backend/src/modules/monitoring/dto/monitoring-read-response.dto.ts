import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MonitoringDeviceStatus } from '@prisma/client';

export class MonitoringEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ example: 'Demo Admin' })
  name!: string;

  @ApiProperty({ example: 'admin@demo.esta.local' })
  email!: string;
}

export class MonitoringPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class MonitoringOrgUnitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Engineering' })
  name!: string;

  @ApiProperty({ example: 'ENG' })
  code!: string;
}

export class MonitoringDeviceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiProperty({ example: 'windows-machine-guid-or-installation-uuid' })
  deviceIdentifier!: string;

  @ApiProperty({ example: 'Dipak Workstation' })
  deviceName!: string;

  @ApiProperty({ example: 'Dipak Workstation' })
  hostname!: string;

  @ApiProperty({ example: 'windows' })
  platform!: string;

  @ApiProperty({ example: 'Windows' })
  operatingSystem!: string;

  @ApiPropertyOptional({ example: '11.0.26100', nullable: true })
  osVersion!: string | null;

  @ApiProperty({ example: 'Desktop' })
  deviceType!: string;

  @ApiPropertyOptional({ example: '0.1.0', nullable: true })
  agentVersion!: string | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  branch!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ nullable: true })
  browserExtensionInstalled!: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  browserExtensionConnected!: boolean | null;

  @ApiProperty({ example: true })
  monitoringEnabled!: boolean;

  @ApiProperty({ example: true })
  online!: boolean;

  @ApiProperty({ enum: MonitoringDeviceStatus })
  status!: MonitoringDeviceStatus;

  @ApiProperty({ enum: MonitoringDeviceStatus })
  securityStatus!: MonitoringDeviceStatus;

  @ApiProperty({ example: false })
  trusted!: boolean;

  @ApiProperty({ example: false })
  revoked!: boolean;

  @ApiProperty({ example: false })
  registrationRequired!: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastHeartbeatAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastActivityAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastScreenshotAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  registeredAt!: string;
}

export class MonitoringDeviceIdentityDto {
  @ApiPropertyOptional({ nullable: true })
  deviceName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  hostname!: string | null;

  @ApiPropertyOptional({ nullable: true })
  deviceIdentifier!: string | null;

  @ApiPropertyOptional({ nullable: true })
  deviceType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  platform!: string | null;

  @ApiPropertyOptional({ nullable: true })
  operatingSystem!: string | null;

  @ApiPropertyOptional({ nullable: true })
  osVersion!: string | null;

  @ApiPropertyOptional({ nullable: true })
  architecture!: string | null;

  @ApiPropertyOptional({ nullable: true })
  agentVersion!: string | null;

  @ApiProperty({ format: 'date-time' })
  registeredAt!: string;
}

export class MonitoringDeviceAssignmentEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Demo Admin' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  employeeCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;
}

export class MonitoringDeviceAssignmentCompanyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Demo Company' })
  name!: string;
}

export class MonitoringDeviceAssignmentDto {
  @ApiPropertyOptional({ type: MonitoringDeviceAssignmentEmployeeDto, nullable: true })
  employee!: MonitoringDeviceAssignmentEmployeeDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  branch!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringDeviceAssignmentCompanyDto, nullable: true })
  company!: MonitoringDeviceAssignmentCompanyDto | null;
}

export class MonitoringDeviceStatusOverviewDto {
  @ApiProperty({ example: true })
  online!: boolean;

  @ApiProperty({ example: true })
  monitoringEnabled!: boolean;

  @ApiProperty({ enum: MonitoringDeviceStatus })
  securityStatus!: MonitoringDeviceStatus;

  @ApiProperty({ example: false })
  trusted!: boolean;

  @ApiProperty({ example: false })
  revoked!: boolean;

  @ApiProperty({ example: false })
  registrationRequired!: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  trustedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  revokedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  registrationResetAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  reregistrationRequiredAt!: string | null;

  @ApiProperty({ example: 1 })
  registrationVersion!: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastHeartbeatAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastActivityAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastScreenshotAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastSeenAt!: string | null;
}

export class MonitoringDeviceBrowserIntegrationDto {
  @ApiProperty({ enum: ['CONNECTED', 'MISSING', 'UNKNOWN'] })
  status!: 'CONNECTED' | 'MISSING' | 'UNKNOWN';

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastConnectedAt!: string | null;
}

export class MonitoringDeviceTodayActivityDto {
  @ApiProperty({ example: 7200 })
  activeSeconds!: number;

  @ApiProperty({ example: 600 })
  idleSeconds!: number;

  @ApiProperty({ example: 4 })
  appsUsed!: number;

  @ApiProperty({ example: 3 })
  websitesUsed!: number;

  @ApiPropertyOptional({ example: 120, nullable: true })
  keyboardCount!: number | null;

  @ApiPropertyOptional({ example: 25, nullable: true })
  mouseClickCount!: number | null;

  @ApiPropertyOptional({ example: 600, nullable: true })
  mouseMoveCount!: number | null;

  @ApiPropertyOptional({ example: 12, nullable: true })
  scrollCount!: number | null;
}

export class MonitoringDeviceLatestScreenshotDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  capturedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  previewUrl!: string | null;
}

export class MonitoringDeviceScreenshotSummaryDto {
  @ApiProperty({ example: 8 })
  todayCount!: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastScreenshotAt!: string | null;

  @ApiPropertyOptional({ type: MonitoringDeviceLatestScreenshotDto, nullable: true })
  latestScreenshot!: MonitoringDeviceLatestScreenshotDto | null;
}

export class MonitoringDeviceRecentActivityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['HEARTBEAT', 'ACTIVITY', 'SCREENSHOT', 'APPLICATION', 'WEBSITE'] })
  type!: 'HEARTBEAT' | 'ACTIVITY' | 'SCREENSHOT' | 'APPLICATION' | 'WEBSITE';

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ example: 'Heartbeat received' })
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;
}

export class MonitoringDeviceDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MonitoringDeviceIdentityDto })
  identity!: MonitoringDeviceIdentityDto;

  @ApiProperty({ type: MonitoringDeviceAssignmentDto })
  assignment!: MonitoringDeviceAssignmentDto;

  @ApiProperty({ type: MonitoringDeviceStatusOverviewDto })
  monitoring!: MonitoringDeviceStatusOverviewDto;

  @ApiProperty({ type: MonitoringDeviceBrowserIntegrationDto })
  browserIntegration!: MonitoringDeviceBrowserIntegrationDto;

  @ApiProperty({ type: MonitoringDeviceTodayActivityDto })
  todayActivity!: MonitoringDeviceTodayActivityDto;

  @ApiProperty({ type: MonitoringDeviceScreenshotSummaryDto })
  screenshots!: MonitoringDeviceScreenshotSummaryDto;

  @ApiProperty({ type: [MonitoringDeviceRecentActivityDto] })
  recentActivity!: MonitoringDeviceRecentActivityDto[];
}

export class MonitoringDeviceOverviewTotalsDto {
  @ApiProperty({ example: 42 })
  devices!: number;

  @ApiProperty({ example: 18 })
  online!: number;

  @ApiProperty({ example: 24 })
  offline!: number;

  @ApiProperty({ example: 3 })
  monitoringDisabled!: number;

  @ApiProperty({ example: 0 })
  unassigned!: number;
}

export class MonitoringDeviceDistributionDto {
  @ApiProperty({ example: 'Windows' })
  name!: string;

  @ApiProperty({ example: 18 })
  count!: number;
}

export class MonitoringDeviceOverviewBrowserStatusDto {
  @ApiProperty({ example: 8 })
  connected!: number;

  @ApiProperty({ example: 34 })
  unknown!: number;
}

export class MonitoringDeviceOverviewRecentDeviceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Dipak Workstation' })
  deviceName!: string;

  @ApiPropertyOptional({ type: MonitoringEmployeeDto, nullable: true })
  employee!: MonitoringEmployeeDto | null;

  @ApiProperty({ format: 'date-time' })
  registeredAt!: string;

  @ApiProperty({ example: true })
  online!: boolean;

  @ApiProperty({ enum: MonitoringDeviceStatus })
  status!: MonitoringDeviceStatus;
}

export class MonitoringDeviceOverviewAttentionDto {
  @ApiProperty({ example: 24 })
  offlineLongTime!: number;

  @ApiProperty({ example: 2 })
  neverReported!: number;

  @ApiProperty({ example: 3 })
  monitoringDisabled!: number;

  @ApiProperty({ example: 0 })
  noEmployeeAssigned!: number;
}

export class MonitoringDeviceOverviewResponseDto {
  @ApiProperty({ type: MonitoringDeviceOverviewTotalsDto })
  totals!: MonitoringDeviceOverviewTotalsDto;

  @ApiProperty({ type: [MonitoringDeviceDistributionDto] })
  operatingSystems!: MonitoringDeviceDistributionDto[];

  @ApiProperty({ type: [MonitoringDeviceDistributionDto] })
  agentVersions!: MonitoringDeviceDistributionDto[];

  @ApiProperty({ type: MonitoringDeviceOverviewBrowserStatusDto })
  browserStatus!: MonitoringDeviceOverviewBrowserStatusDto;

  @ApiProperty({ type: [MonitoringDeviceOverviewRecentDeviceDto] })
  recentlyRegistered!: MonitoringDeviceOverviewRecentDeviceDto[];

  @ApiProperty({ type: MonitoringDeviceOverviewAttentionDto })
  attention!: MonitoringDeviceOverviewAttentionDto;
}

export class MonitoringDeviceActionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Dipak Workstation' })
  deviceName!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiProperty({ example: true })
  monitoringEnabled!: boolean;

  @ApiProperty({ enum: MonitoringDeviceStatus })
  status!: MonitoringDeviceStatus;

  @ApiProperty({ enum: MonitoringDeviceStatus })
  securityStatus!: MonitoringDeviceStatus;

  @ApiProperty({ example: false })
  registrationRequired!: boolean;

  @ApiProperty({ example: 1 })
  registrationVersion!: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  trustedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  revokedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  registrationResetAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  reregistrationRequiredAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class MonitoringDeviceActionResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: MonitoringDeviceActionSummaryDto })
  device!: MonitoringDeviceActionSummaryDto;
}

export class MonitoringApplicationUsageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiProperty({ example: 'Visual Studio Code' })
  application!: string;

  @ApiPropertyOptional({ example: 'monitoring.service.ts', nullable: true })
  windowTitle!: string | null;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  endedAt!: string;

  @ApiProperty({ example: 900 })
  durationSeconds!: number;
}

export class MonitoringWebsiteUsageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiPropertyOptional({ example: 'Chrome', nullable: true })
  browserName!: string | null;

  @ApiProperty({ example: 'docs.nestjs.com' })
  domain!: string;

  @ApiPropertyOptional({ example: 'https://docs.nestjs.com/controllers', nullable: true })
  url!: string | null;

  @ApiPropertyOptional({ example: 'Controllers | NestJS', nullable: true })
  pageTitle!: string | null;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  endedAt!: string;

  @ApiProperty({ example: 900 })
  durationSeconds!: number;
}

export class MonitoringActivityResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ example: 'electron-session-uuid' })
  clientSessionId!: string;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  endedAt!: string;

  @ApiProperty({ example: 3600 })
  durationSeconds!: number;

  @ApiProperty({ example: 3000 })
  activeSeconds!: number;

  @ApiProperty({ example: 600 })
  idleSeconds!: number;

  @ApiPropertyOptional({ example: 200, nullable: true })
  keystrokeCount!: number | null;

  @ApiProperty({ example: 200 })
  keyboardCount!: number;

  @ApiProperty({ example: 50 })
  mouseClickCount!: number;

  @ApiProperty({ example: 120 })
  mouseMoveCount!: number;

  @ApiProperty({ example: 8 })
  scrollCount!: number;


  @ApiProperty({ type: [MonitoringApplicationUsageResponseDto] })
  applications!: MonitoringApplicationUsageResponseDto[];

  @ApiProperty({ type: [MonitoringWebsiteUsageResponseDto] })
  websites!: MonitoringWebsiteUsageResponseDto[];
}

export class MonitoringScreenshotInputMetricsDto {
  @ApiProperty({ example: 14 })
  keyboardCount!: number;

  @ApiProperty({ example: 7 })
  mouseClickCount!: number;

  @ApiProperty({ example: 20 })
  mouseMoveCount!: number;

  @ApiProperty({ example: 5 })
  scrollCount!: number;
}

export class MonitoringScreenshotResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ format: 'date-time' })
  capturedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl!: string | null;

  @ApiProperty({ example: true })
  previewAvailable!: boolean;

  @ApiProperty({ example: 'image/webp' })
  mimeType!: string;

  @ApiPropertyOptional({ nullable: true })
  sizeBytes!: number | null;

  @ApiPropertyOptional({ nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ nullable: true })
  height!: number | null;

  @ApiPropertyOptional({ nullable: true })
  checksum!: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: MonitoringScreenshotInputMetricsDto, nullable: true })
  inputMetrics!: MonitoringScreenshotInputMetricsDto | null;
}

export class ScreenshotUploadResponseDto extends MonitoringScreenshotResponseDto {}

export class ScreenshotViewResponseDto {
  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class PaginatedMonitoringDeviceResponseDto {
  @ApiProperty({ type: MonitoringDeviceResponseDto, isArray: true })
  data!: MonitoringDeviceResponseDto[];

  @ApiProperty({ type: MonitoringPaginationMetaDto })
  meta!: MonitoringPaginationMetaDto;

  @ApiProperty({
    type: 'object',
    properties: {
      totalDevices: { type: 'number', example: 42 },
      online: { type: 'number', example: 18 },
      offline: { type: 'number', example: 24 },
      monitoringDisabled: { type: 'number', example: 3 },
    },
  })
  summary!: {
    totalDevices: number;
    online: number;
    offline: number;
    monitoringDisabled: number;
  };
}

export class PaginatedMonitoringActivityResponseDto {
  @ApiProperty({ type: MonitoringActivityResponseDto, isArray: true })
  data!: MonitoringActivityResponseDto[];

  @ApiProperty({ type: MonitoringPaginationMetaDto })
  meta!: MonitoringPaginationMetaDto;
}

export class PaginatedMonitoringScreenshotResponseDto {
  @ApiProperty({ type: MonitoringScreenshotResponseDto, isArray: true })
  data!: MonitoringScreenshotResponseDto[];

  @ApiProperty({ type: MonitoringPaginationMetaDto })
  meta!: MonitoringPaginationMetaDto;
}

export class PaginatedMonitoringApplicationUsageResponseDto {
  @ApiProperty({ type: MonitoringApplicationUsageResponseDto, isArray: true })
  data!: MonitoringApplicationUsageResponseDto[];

  @ApiProperty({ type: MonitoringPaginationMetaDto })
  meta!: MonitoringPaginationMetaDto;
}

export class PaginatedMonitoringWebsiteUsageResponseDto {
  @ApiProperty({ type: MonitoringWebsiteUsageResponseDto, isArray: true })
  data!: MonitoringWebsiteUsageResponseDto[];

  @ApiProperty({ type: MonitoringPaginationMetaDto })
  meta!: MonitoringPaginationMetaDto;
}

export class MonitoringSummaryInputTotalsDto {
  @ApiPropertyOptional({ example: 1250, nullable: true })
  totalKeyboardCount!: number | null;

  @ApiPropertyOptional({ example: 420, nullable: true })
  totalMouseClickCount!: number | null;

  @ApiPropertyOptional({ example: 24830, nullable: true })
  totalMouseMoveCount!: number | null;

  @ApiPropertyOptional({ example: 96, nullable: true })
  totalScrollCount!: number | null;
}

export class MonitoringSummaryTopWebsiteDto {
  @ApiProperty({ example: 'github.com' })
  domain!: string;

  @ApiProperty({ example: 3600 })
  durationSeconds!: number;

  @ApiProperty({ example: 4 })
  entries!: number;
}

export class MonitoringSummaryTeamActivityBreakdownDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  departmentId!: string | null;

  @ApiProperty({ example: 'Engineering' })
  departmentName!: string;

  @ApiProperty({ example: 8 })
  employeeCount!: number;

  @ApiProperty({ example: 51600 })
  onlineSeconds!: number;

  @ApiProperty({ example: 45600 })
  activeSeconds!: number;

  @ApiProperty({ example: 6000 })
  idleSeconds!: number;

  @ApiProperty({ example: 88.37 })
  activityPercentage!: number;
}

export class PaginatedMonitoringSummaryResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  data!: unknown[];

  @ApiProperty({ type: MonitoringPaginationMetaDto })
  meta!: MonitoringPaginationMetaDto;

  @ApiProperty({ type: MonitoringSummaryInputTotalsDto })
  inputTotals!: MonitoringSummaryInputTotalsDto;

  @ApiPropertyOptional({ type: [MonitoringSummaryTopWebsiteDto] })
  topWebsites?: MonitoringSummaryTopWebsiteDto[];

  @ApiPropertyOptional({ type: [MonitoringSummaryTeamActivityBreakdownDto] })
  teamActivityBreakdown?: MonitoringSummaryTeamActivityBreakdownDto[];

  @ApiProperty({
    type: 'object',
    properties: {
      from: { type: 'string', format: 'date-time' },
      to: { type: 'string', format: 'date-time' },
    },
  })
  range!: { from?: string; to?: string };
}

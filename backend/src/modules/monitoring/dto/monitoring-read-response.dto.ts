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

export class MonitoringDeviceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiProperty({ example: 'windows-machine-guid-or-installation-uuid' })
  deviceIdentifier!: string;

  @ApiProperty({ example: 'Dipak Workstation' })
  hostname!: string;

  @ApiProperty({ example: 'windows' })
  platform!: string;

  @ApiPropertyOptional({ example: '11.0.26100', nullable: true })
  osVersion!: string | null;

  @ApiPropertyOptional({ example: '0.1.0', nullable: true })
  agentVersion!: string | null;

  @ApiProperty({ enum: MonitoringDeviceStatus })
  status!: MonitoringDeviceStatus;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastHeartbeatAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  registeredAt!: string;
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

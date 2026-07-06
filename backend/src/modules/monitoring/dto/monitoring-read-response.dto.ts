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

  @ApiPropertyOptional({ example: 50, nullable: true })
  mouseClickCount!: number | null;

  @ApiProperty({ type: [MonitoringApplicationUsageResponseDto] })
  applications!: MonitoringApplicationUsageResponseDto[];

  @ApiProperty({ type: [MonitoringWebsiteUsageResponseDto] })
  websites!: MonitoringWebsiteUsageResponseDto[];
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

  @ApiProperty({ example: 'companies/company-id/employees/employee-id/2026/06/image.webp' })
  storageKey!: string;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl!: string | null;

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

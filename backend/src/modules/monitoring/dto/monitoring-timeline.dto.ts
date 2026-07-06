import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MonitoringDeviceResponseDto, MonitoringEmployeeDto, MonitoringPaginationMetaDto } from './monitoring-read-response.dto';

export enum MonitoringTimelineSegmentType {
  ACTIVE = 'ACTIVE',
  IDLE = 'IDLE',
  BREAK = 'BREAK',
  OFFLINE = 'OFFLINE',
  NO_ACTIVITY = 'NO_ACTIVITY',
}

export enum MonitoringTimelineSegmentSource {
  HEARTBEAT = 'HEARTBEAT',
  ACTIVITY = 'ACTIVITY',
  ATTENDANCE = 'ATTENDANCE',
  BREAK = 'BREAK',
}

export enum MonitoringTimelineMarkerType {
  PUNCH_IN = 'PUNCH_IN',
  PUNCH_OUT = 'PUNCH_OUT',
  BREAK_START = 'BREAK_START',
  BREAK_END = 'BREAK_END',
  SCREENSHOT = 'SCREENSHOT',
}

export class MonitoringTimelineQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Single local/UTC date to render as a full-day timeline.' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ default: false })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  teamOnly?: boolean;
}

export class MonitoringTimelineSummaryDto {
  @ApiProperty({ example: 14400 })
  activeSeconds!: number;

  @ApiProperty({ example: 1800 })
  idleSeconds!: number;

  @ApiProperty({ example: 3600 })
  breakSeconds!: number;

  @ApiProperty({ example: 900 })
  offlineSeconds!: number;

  @ApiProperty({ example: 16200 })
  workedSeconds!: number;
}

export class MonitoringTimelineSegmentDto {
  @ApiProperty({ enum: MonitoringTimelineSegmentType })
  type!: MonitoringTimelineSegmentType;

  @ApiProperty({ format: 'date-time' })
  start!: string;

  @ApiProperty({ format: 'date-time' })
  end!: string;

  @ApiProperty({ example: 300 })
  durationSeconds!: number;

  @ApiPropertyOptional({ example: 75, nullable: true })
  intensity!: number | null;

  @ApiProperty({ enum: MonitoringTimelineSegmentSource })
  source!: MonitoringTimelineSegmentSource;

  @ApiPropertyOptional({ example: 'Visual Studio Code', nullable: true })
  applicationName?: string | null;

  @ApiPropertyOptional({ example: 'docs.nestjs.com', nullable: true })
  domain?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  activitySessionId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  deviceId?: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata?: Record<string, unknown> | null;
}

export class MonitoringTimelineMarkerDto {
  @ApiProperty({ enum: MonitoringTimelineMarkerType })
  type!: MonitoringTimelineMarkerType;

  @ApiProperty({ format: 'date-time' })
  time!: string;

  @ApiProperty({ example: 'Punch In' })
  title!: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata?: Record<string, unknown> | null;
}

export class MonitoringTimelineUserDto {
  @ApiProperty({ example: 'Demo Admin' })
  name!: string;

  @ApiProperty({ example: 'admin@demo.esta.local' })
  email!: string;
}

export class MonitoringTimelineEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ type: MonitoringTimelineUserDto })
  user!: MonitoringTimelineUserDto;

  @ApiPropertyOptional({ type: MonitoringDeviceResponseDto, nullable: true })
  device!: MonitoringDeviceResponseDto | null;

  @ApiProperty({ type: MonitoringTimelineSummaryDto })
  summary!: MonitoringTimelineSummaryDto;

  @ApiProperty({ type: [MonitoringTimelineSegmentDto] })
  segments!: MonitoringTimelineSegmentDto[];

  @ApiProperty({ type: [MonitoringTimelineMarkerDto] })
  markers!: MonitoringTimelineMarkerDto[];
}

export class MonitoringTimelineResponseDto {
  @ApiProperty({ example: '2026-07-06' })
  date!: string;

  @ApiProperty({ format: 'date-time' })
  rangeStart!: string;

  @ApiProperty({ format: 'date-time' })
  rangeEnd!: string;

  @ApiProperty({ type: [MonitoringTimelineEmployeeDto] })
  employees!: MonitoringTimelineEmployeeDto[];

  @ApiProperty({ type: MonitoringPaginationMetaDto })
  meta!: MonitoringPaginationMetaDto;
}

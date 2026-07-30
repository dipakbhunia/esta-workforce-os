import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MonitoringEmployeeDto, MonitoringOrgUnitDto } from './monitoring-read-response.dto';

export class MonitoringIdleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Alias for limit used by analytics tables.' })
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Return employees whose idle percentage is at least this value.' })
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  idlePercentageMin?: number;
}

export class MonitoringIdleSummaryDto {
  @ApiProperty({ example: 28800 })
  totalActiveSeconds!: number;

  @ApiProperty({ example: 3600 })
  totalIdleSeconds!: number;

  @ApiProperty({ example: 11.11 })
  idlePercentage!: number;

  @ApiProperty({ example: 3 })
  employeesWithHighIdle!: number;

  @ApiProperty({ example: 1200 })
  averageIdleSeconds!: number;

  @ApiProperty({ example: 42 })
  totalSessions!: number;
}

export class MonitoringIdleEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  branch!: MonitoringOrgUnitDto | null;

  @ApiProperty({ example: 25200 })
  activeSeconds!: number;

  @ApiProperty({ example: 1800 })
  idleSeconds!: number;

  @ApiProperty({ example: 27000 })
  onlineSeconds!: number;

  @ApiProperty({ example: 6.67 })
  idlePercentage!: number;

  @ApiProperty({ example: 900 })
  longestIdleSeconds!: number;

  @ApiProperty({ example: 18 })
  sessions!: number;
}

export class MonitoringIdleTimelineSegmentDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ enum: ['ACTIVE', 'IDLE'] })
  type!: 'ACTIVE' | 'IDLE';

  @ApiProperty({ format: 'date-time' })
  start!: string;

  @ApiProperty({ format: 'date-time' })
  end!: string;

  @ApiProperty({ example: 600 })
  durationSeconds!: number;

  @ApiProperty({ example: 'ACTIVITY_SESSION' })
  source!: 'ACTIVITY_SESSION';

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  activitySessionId!: string | null;
}

export class MonitoringIdleLongestPeriodDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  branch!: MonitoringOrgUnitDto | null;

  @ApiProperty({ format: 'date-time' })
  start!: string;

  @ApiProperty({ format: 'date-time' })
  end!: string;

  @ApiProperty({ example: 1800 })
  durationSeconds!: number;
}

export class MonitoringIdlePaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class MonitoringIdleRangeDto {
  @ApiProperty({ format: 'date-time' })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  to!: string;
}

export class MonitoringIdleResponseDto {
  @ApiProperty({ type: MonitoringIdleSummaryDto })
  summary!: MonitoringIdleSummaryDto;

  @ApiProperty({ type: [MonitoringIdleEmployeeDto] })
  employees!: MonitoringIdleEmployeeDto[];

  @ApiProperty({ type: [MonitoringIdleTimelineSegmentDto] })
  timeline!: MonitoringIdleTimelineSegmentDto[];

  @ApiProperty({ type: [MonitoringIdleLongestPeriodDto] })
  longestIdlePeriods!: MonitoringIdleLongestPeriodDto[];

  @ApiProperty({ type: MonitoringIdlePaginationDto })
  pagination!: MonitoringIdlePaginationDto;

  @ApiProperty({ type: MonitoringIdleRangeDto })
  range!: MonitoringIdleRangeDto;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MonitoringAlertEventType,
  MonitoringAlertSeverity,
  MonitoringAlertStatus,
  MonitoringAlertType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MonitoringAlertQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Alias for limit' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;

  @ApiPropertyOptional({ enum: MonitoringAlertStatus })
  @IsEnum(MonitoringAlertStatus)
  @IsOptional()
  status?: MonitoringAlertStatus;

  @ApiPropertyOptional({ enum: MonitoringAlertSeverity })
  @IsEnum(MonitoringAlertSeverity)
  @IsOptional()
  severity?: MonitoringAlertSeverity;

  @ApiPropertyOptional({ enum: MonitoringAlertType })
  @IsEnum(MonitoringAlertType)
  @IsOptional()
  type?: MonitoringAlertType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  deviceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;
}

export class MonitoringAlertActionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Alias used by some clients for resolve notes' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  resolutionNote?: string;
}

export class MonitoringAlertUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  email!: string;
}

export class MonitoringAlertEmployeeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  employeeCode!: string;

  @ApiProperty({ type: MonitoringAlertUserDto })
  user!: MonitoringAlertUserDto;

  @ApiPropertyOptional({ nullable: true })
  department?: { id: string; name: string; code: string } | null;

  @ApiPropertyOptional({ nullable: true })
  branch?: { id: string; name: string; code: string } | null;
}

export class MonitoringAlertDeviceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  deviceName!: string;

  @ApiProperty()
  platform!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  lastSeenAt?: Date | null;
}

export class MonitoringAlertEventDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: MonitoringAlertEventType })
  type!: MonitoringAlertEventType;

  @ApiPropertyOptional({ type: MonitoringAlertUserDto, nullable: true })
  actor?: MonitoringAlertUserDto | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata?: Record<string, unknown> | null;
}

export class MonitoringAlertResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  companyId!: string;

  @ApiPropertyOptional({ nullable: true })
  employeeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  deviceId?: string | null;

  @ApiProperty({ enum: MonitoringAlertType })
  type!: MonitoringAlertType;

  @ApiProperty({ enum: MonitoringAlertSeverity })
  severity!: MonitoringAlertSeverity;

  @ApiProperty({ enum: MonitoringAlertStatus })
  status!: MonitoringAlertStatus;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ format: 'date-time' })
  detectedAt!: Date;

  @ApiProperty({ format: 'date-time' })
  lastDetectedAt!: Date;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  acknowledgedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  resolvedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  resolutionNote?: string | null;

  @ApiPropertyOptional({ type: MonitoringAlertEmployeeDto, nullable: true })
  employee?: MonitoringAlertEmployeeDto | null;

  @ApiPropertyOptional({ type: MonitoringAlertDeviceDto, nullable: true })
  device?: MonitoringAlertDeviceDto | null;

  @ApiPropertyOptional({ type: MonitoringAlertUserDto, nullable: true })
  acknowledgedBy?: MonitoringAlertUserDto | null;

  @ApiPropertyOptional({ type: MonitoringAlertUserDto, nullable: true })
  resolvedBy?: MonitoringAlertUserDto | null;

  @ApiPropertyOptional({ nullable: true })
  metadata?: Record<string, unknown> | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class MonitoringAlertDetailResponseDto extends MonitoringAlertResponseDto {
  @ApiProperty({ type: [MonitoringAlertEventDto] })
  events!: MonitoringAlertEventDto[];
}

export class MonitoringAlertSummaryDto {
  @ApiProperty()
  open!: number;

  @ApiProperty()
  acknowledged!: number;

  @ApiProperty()
  criticalOpen!: number;

  @ApiProperty()
  warningOpen!: number;

  @ApiProperty()
  resolvedToday!: number;

  @ApiProperty()
  totalFiltered!: number;
}

export class MonitoringAlertListResponseDto {
  @ApiProperty({ type: [MonitoringAlertResponseDto] })
  data!: MonitoringAlertResponseDto[];

  @ApiProperty()
  meta!: { page: number; limit: number; total: number; totalPages: number };

  @ApiProperty({ type: MonitoringAlertSummaryDto })
  summary!: MonitoringAlertSummaryDto;
}

export class MonitoringAlertEvaluationResponseDto {
  @ApiProperty()
  evaluatedAt!: Date;

  @ApiProperty()
  detected!: number;

  @ApiProperty()
  resolved!: number;
}
